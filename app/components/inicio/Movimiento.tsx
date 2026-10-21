"use client";

import { useEffect, type ReactNode } from "react";
import { cargarGsap, prefiereMovimientoReducido } from "@/lib/gsap";

type Tema = { fondo: string; tinta: string; acento: string; grano: number };

const temas: Record<string, Tema> = {
  verde: { fondo: "#142d2b", tinta: "#fff7f3", acento: "#d0ef76", grano: 0.07 },
  crema: { fondo: "#fff7f3", tinta: "#142d2b", acento: "#142d2b", grano: 0 },
  lima: { fondo: "#d0ef76", tinta: "#142d2b", acento: "#142d2b", grano: 0 },
};

const variables = (t: Tema) => ({ "--fondo": t.fondo, "--tinta": t.tinta, "--acento": t.acento, "--grano": t.grano });

/**
 * Smooth scroll (Lenis) y fondo que se interpola entre secciones [data-fondo].
 * Solo vive en "/": el formulario de /r/[codigo] queda con scroll nativo.
 * Con movimiento reducido no se carga nada: las secciones traen su color fijo desde el CSS.
 */
export function Movimiento({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (prefiereMovimientoReducido()) return;

    let cancelado = false;
    let limpiar = () => {};

    (async () => {
      const [{ gsap, ScrollTrigger }, { default: Lenis }] = await Promise.all([cargarGsap(), import("lenis")]);
      if (cancelado) return;

      const lenis = new Lenis({ lerp: 0.1, wheelMultiplier: 0.9 });
      lenis.on("scroll", ScrollTrigger.update);
      const tick = (t: number) => lenis.raf(t * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);

      // Los enlaces internos (#calculadora) pasan por Lenis para que el salto sea suave.
      const alClick = (e: MouseEvent) => {
        const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
        const destino = a && document.querySelector<HTMLElement>(a.getAttribute("href")!);
        if (!destino) return;
        e.preventDefault();
        lenis.scrollTo(destino, { offset: -16 });
        destino.focus({ preventScroll: true });
      };
      document.addEventListener("click", alClick);

      const ctx = gsap.context(() => {
        const secciones = [...document.querySelectorAll<HTMLElement>("[data-fondo]")];
        secciones.forEach((sec, i) => {
          const previa = secciones[i - 1]?.dataset.fondo;
          const actual = sec.dataset.fondo!;
          if (!previa || previa === actual) return;
          gsap.fromTo(
            document.documentElement,
            variables(temas[previa]),
            {
              ...variables(temas[actual]),
              ease: "none",
              immediateRender: false,
              scrollTrigger: { trigger: sec, start: "top 90%", end: "top 35%", scrub: true },
            },
          );
        });
      });

      // Cuando cargan las fuentes cambian las alturas: se recalculan los puntos de disparo.
      ScrollTrigger.sort();
      const refrescar = () => ScrollTrigger.refresh();
      document.fonts?.ready.then(refrescar);
      requestAnimationFrame(refrescar);

      limpiar = () => {
        document.removeEventListener("click", alClick);
        gsap.ticker.remove(tick);
        ctx.revert();
        document.documentElement.removeAttribute("style");
        lenis.destroy();
      };
    })();

    return () => {
      cancelado = true;
      limpiar();
    };
  }, []);

  return (
    <>
      <div className="grano" aria-hidden />
      {children}
    </>
  );
}
