"use client";

import { useEffect, useRef } from "react";
import es from "@/i18n/es.json";
import { cargarGsap, prefiereMovimientoReducido } from "@/lib/gsap";

const fragmentos = es.inicio.hero.fragmentos;

/**
 * Titular con el último fragmento rotando. Todos los fragmentos ocupan la misma celda de una grilla,
 * así el alto es el del más largo y nada salta. Cada cambio usa una máscara de entrada por línea.
 * Sin JS o con movimiento reducido queda visible el primero; el texto completo va en el h1 accesible.
 */
export function HeroFragmentos() {
  const raiz = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = raiz.current;
    if (!el || prefiereMovimientoReducido()) return;

    let cancelado = false;
    let limpiar = () => {};
    cargarGsap().then(({ gsap }) => {
      if (cancelado) return;
      let llamada: ReturnType<typeof gsap.delayedCall> | undefined;
      const items = gsap.utils.toArray<HTMLElement>("[data-fragmento]", el);
      const ctx = gsap.context(() => {
        gsap.set(items.slice(1), { yPercent: 110 });
        let actual = 0;
        const rotar = () => {
          const siguiente = (actual + 1) % items.length;
          gsap
            .timeline()
            .to(items[actual], { yPercent: -110, duration: 0.7, ease: "power3.in" })
            .fromTo(items[siguiente], { yPercent: 110 }, { yPercent: 0, duration: 0.8, ease: "power3.out" }, "-=0.1");
          actual = siguiente;
        };
        const programar = (segundos: number) => {
          llamada = gsap.delayedCall(segundos, () => {
            rotar();
            programar(3.2);
          });
        };
        programar(2.6);
      }, el);
      limpiar = () => {
        llamada?.kill();
        ctx.revert();
      };
    });
    return () => {
      cancelado = true;
      limpiar();
    };
  }, []);

  return (
    <span ref={raiz} aria-hidden className="grid overflow-hidden pb-[0.12em] text-acento">
      {fragmentos.map((f) => (
        <span key={f} data-fragmento className="[grid-area:1/1] will-change-transform">
          {f}
        </span>
      ))}
    </span>
  );
}
