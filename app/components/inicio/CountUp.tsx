"use client";

import { useEffect, useRef } from "react";
import { cargarGsap, prefiereMovimientoReducido } from "@/lib/gsap";

const formato = (n: number) => Math.round(n).toLocaleString("es-AR");

/**
 * Número que rueda de 0 al valor final la primera vez que entra en pantalla.
 * El HTML ya trae el valor final: sin JS o con movimiento reducido no cambia nada.
 */
export function CountUp({ valor, className }: { valor: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefiereMovimientoReducido()) return;
    let cancelado = false;
    let limpiar = () => {};

    cargarGsap().then(({ gsap, ScrollTrigger }) => {
      if (cancelado) return;
      const estado = { n: 0 };
      el.textContent = formato(0);
      const tween = gsap.to(estado, {
        n: valor,
        duration: 1.6,
        ease: "power3.out",
        paused: true,
        onUpdate: () => {
          el.textContent = formato(estado.n);
        },
      });
      const st = ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: () => tween.play() });
      limpiar = () => {
        st.kill();
        tween.kill();
        el.textContent = formato(valor);
      };
    });
    return () => {
      cancelado = true;
      limpiar();
    };
  }, [valor]);

  return (
    <span ref={ref} className={`num ${className ?? ""}`}>
      {formato(valor)}
    </span>
  );
}
