"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cargarGsap, prefiereMovimientoReducido } from "@/lib/gsap";

/** Imán sutil: el botón se acerca unos píxeles al puntero. Solo con mouse y sin movimiento reducido. */
export function Magnetico({ children, fuerza = 0.25 }: { children: ReactNode; fuerza?: number }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefiereMovimientoReducido() || !window.matchMedia("(hover: hover)").matches) return;

    let cancelado = false;
    let limpiar = () => {};
    cargarGsap().then(({ gsap }) => {
      if (cancelado) return;
      const x = gsap.quickTo(el, "x", { duration: 0.4, ease: "power3.out" });
      const y = gsap.quickTo(el, "y", { duration: 0.4, ease: "power3.out" });
      const mover = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        x((e.clientX - (r.left + r.width / 2)) * fuerza);
        y((e.clientY - (r.top + r.height / 2)) * fuerza);
      };
      const soltar = () => {
        x(0);
        y(0);
      };
      el.addEventListener("pointermove", mover);
      el.addEventListener("pointerleave", soltar);
      limpiar = () => {
        el.removeEventListener("pointermove", mover);
        el.removeEventListener("pointerleave", soltar);
        gsap.set(el, { clearProps: "transform" });
      };
    });
    return () => {
      cancelado = true;
      limpiar();
    };
  }, [fuerza]);

  return (
    <span ref={ref} className="inline-block">
      {children}
    </span>
  );
}
