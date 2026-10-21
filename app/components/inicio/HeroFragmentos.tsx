"use client";

import { useEffect, useRef } from "react";
import es from "@/i18n/es.json";
import { cargarGsap, prefiereMovimientoReducido } from "@/lib/gsap";

const fragmentos = es.inicio.hero.fragmentos;

/**
 * Titular con el último fragmento rotando, en secuencia: el actual sale (fundido y leve subida, 250 ms) y recién
 * entonces entra el siguiente mientras el alto de la caja se anima hasta el suyo. Nunca hay dos visibles a la vez.
 * Solo el primer fragmento ocupa lugar; los demás esperan ocultos y fuera de flujo, así que el alto es siempre el
 * del fragmento visible (sin hueco aunque otro sea más largo y se parta en dos líneas en móvil).
 * Sin JS o con movimiento reducido queda visible solo el primero; el texto completo va en el h1 accesible.
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
      // Alto del contenedor = alto del fragmento + el aire inferior que evita recortar descendentes.
      const aire = el.offsetHeight - items[0].offsetHeight;
      const altoDe = (i: number) => items[i].offsetHeight + aire;
      let actual = 0;
      let animando = false;

      // Si cambia el ancho y un fragmento se parte distinto, el alto sigue al visible.
      const observador = new ResizeObserver(() => {
        if (!animando && el.style.height) el.style.height = `${altoDe(actual)}px`;
      });
      items.forEach((i) => observador.observe(i));

      const ctx = gsap.context(() => {
        const rotar = () => {
          const saliente = items[actual];
          const siguiente = (actual + 1) % items.length;
          const entrante = items[siguiente];
          el.style.height = `${altoDe(actual)}px`;
          animando = true;
          gsap
            .timeline({ onComplete: () => (animando = false) })
            .to(saliente, { opacity: 0, y: -10, duration: 0.25, ease: "power1.in" })
            .set(saliente, { visibility: "hidden" })
            .set(entrante, { visibility: "visible", opacity: 0, y: 10 })
            .to(el, { height: altoDe(siguiente), duration: 0.45, ease: "power2.inOut" })
            .to(entrante, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" }, "<0.1");
          actual = siguiente;
        };
        const programar = (segundos: number) => {
          llamada = gsap.delayedCall(segundos, () => {
            rotar();
            programar(3.4);
          });
        };
        programar(2.6);
      }, el);
      limpiar = () => {
        llamada?.kill();
        observador.disconnect();
        ctx.revert();
        el.style.height = "";
      };
    });
    return () => {
      cancelado = true;
      limpiar();
    };
  }, []);

  return (
    <span ref={raiz} aria-hidden className="relative block overflow-hidden pb-[0.12em] text-acento">
      {fragmentos.map((f, i) => (
        <span
          key={f}
          data-fragmento
          className={`block will-change-[transform,opacity] ${i > 0 ? "invisible absolute inset-x-0 top-0 motion-reduce:hidden" : ""}`}
        >
          {f}
        </span>
      ))}
    </span>
  );
}
