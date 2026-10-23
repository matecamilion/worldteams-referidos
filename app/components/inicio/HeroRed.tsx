"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import es from "@/i18n/es.json";
import { config, montoPrioritarioUsd } from "@/lib/config";
import { prefiereMovimientoReducido } from "@/lib/gsap";
import { PoliedroEstatico } from "./PoliedroEstatico";
import { RedEstatica } from "./RedEstatica";

const contenedor = "mx-auto w-full max-w-[1280px] px-5 sm:px-8 lg:px-14";

const montos: Record<string, number> = {
  base: config.montoBaseUsd,
  prioritario: montoPrioritarioUsd,
  hito: config.hitos[0].bonoUsd,
};

const eventos = es.inicio.hero.poliedro.eventos.map((e) => ({
  quien: e.quien,
  que: e.que,
  monto: `+USD ${montos[e.clave]}`,
}));

/** Rótulos del relato: palabras que el sitio ya usa en "Cómo funciona" (Referente, Candidato). */
const rotulosTexto = es.inicio.como.hilo.slice(0, 2);

const hayWebgl = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
};

/**
 * Portada. El texto (titular, bajada, botones) está siempre en el flujo normal de la página: se lee y se usa desde el primer
 * instante, se recorre con Tab y se va con el scroll como cualquier contenido. Detrás hay una escena fija (sticky) de 3D
 * que reacciona al cursor, se abre en puntos con el scroll y cuenta el recorrido de una recomendación sobre una red.
 *
 * Solo en ≥1024 px, sin movimiento reducido y con WebGL: three.js se importa después del primer render. En cualquier otro
 * caso queda el SVG fijo del poliedro y el mapa estático, sin JavaScript de animación.
 */
export function HeroRed({ children }: { children: ReactNode }) {
  const pista = useRef<HTMLElement>(null);
  const lienzo = useRef<HTMLDivElement>(null);
  const hex = useRef<HTMLDivElement>(null);
  const r0 = useRef<HTMLSpanElement>(null);
  const r1 = useRef<HTMLSpanElement>(null);
  const [vivo, setVivo] = useState(false);
  // En escritorio sin WebGL (o si se pierde el contexto) la pista alta sobra: se vuelve al diseño fijo.
  const [sinRed, setSinRed] = useState(false);

  useEffect(() => {
    const ancho = window.matchMedia("(min-width: 1024px)");
    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)");
    let destruir: (() => void) | undefined;
    let gen = 0;
    let temporizador: ReturnType<typeof setTimeout> | undefined;

    const apagar = () => {
      gen++;
      clearTimeout(temporizador);
      destruir?.();
      destruir = undefined;
      setVivo(false);
    };
    const fallar = () => {
      apagar();
      setSinRed(true);
    };
    const evaluar = () => {
      apagar();
      setSinRed(false);
      if (!ancho.matches || prefiereMovimientoReducido()) return;
      if (!hayWebgl()) {
        setSinRed(true);
        return;
      }
      const mia = gen;
      // Después del primer render y del primer reposo del hilo principal.
      temporizador = setTimeout(async () => {
        const { montar } = await import("./red/motor");
        if (mia !== gen || !pista.current || !lienzo.current || !hex.current || !r0.current || !r1.current) return;
        try {
          destruir = montar({
            contenedor: lienzo.current,
            pista: pista.current,
            hex: hex.current,
            rotulos: [r0.current, r1.current],
            eventos,
            alPerder: fallar,
          });
          setVivo(true);
        } catch {
          fallar();
        }
      }, 400);
    };

    evaluar();
    ancho.addEventListener("change", evaluar);
    reducido.addEventListener("change", evaluar);
    return () => {
      ancho.removeEventListener("change", evaluar);
      reducido.removeEventListener("change", evaluar);
      apagar();
    };
  }, []);

  // `lg:` y `motion-reduce:lg:` espejan la condición del efecto para que la altura de la pista esté reservada desde el primer pintado.
  const pistaAlta = sinRed ? "" : "lg:h-[380vh] motion-reduce:lg:h-auto";
  const escenaFija = sinRed ? "hidden" : "hidden lg:sticky lg:top-0 lg:block lg:h-screen motion-reduce:lg:hidden";
  const textoSobre = sinRed ? "" : "lg:-mt-[100vh] motion-reduce:lg:mt-0";
  const mapaEstatico = sinRed ? "" : "lg:hidden motion-reduce:lg:block";

  return (
    <section ref={pista} data-fondo="verde" className={`relative ${pistaAlta}`}>
      <div aria-hidden className={`pointer-events-none top-0 ${escenaFija}`}>
        <div ref={lienzo} className="absolute inset-0" />
        <div ref={hex} className="absolute left-0 top-0 opacity-0 will-change-transform" hidden={!vivo}>
          <div className="absolute left-0 top-0 -translate-x-1/2 -translate-y-1/2">
            <div
              data-pop
              className="flex h-[6.6rem] w-[7.6rem] flex-col items-center justify-center bg-verde px-3 text-center text-lima [clip-path:polygon(25%_0,75%_0,100%_50%,75%_100%,25%_100%,0_50%)]"
            >
              <span data-quien className="text-xs font-semibold leading-tight" />
              <span data-que className="text-xs leading-tight text-lima/80" />
              <span data-monto className="num mt-0.5 font-display text-lg font-semibold leading-none" />
            </div>
          </div>
        </div>
        <span ref={r0} className="absolute left-0 top-0 opacity-0 transition-opacity duration-300 ease-out">
          <span className="absolute left-6 top-0 -translate-y-1/2 whitespace-nowrap rounded bg-verde px-1.5 py-0.5 font-display text-base font-medium text-lima">{rotulosTexto[0]}</span>
        </span>
        <span ref={r1} className="absolute left-0 top-0 opacity-0 transition-opacity duration-300 ease-out">
          <span className="absolute left-6 top-0 -translate-y-1/2 whitespace-nowrap rounded bg-verde px-1.5 py-0.5 font-display text-base font-medium text-lima">{rotulosTexto[1]}</span>
        </span>
      </div>

      <div className={`relative lg:flex lg:min-h-screen lg:items-center ${textoSobre}`}>
        <div
          className={`${contenedor} grid gap-12 pb-20 pt-8 sm:pt-14 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center lg:gap-10 lg:pb-0 lg:pt-0`}
        >
          <div className="relative isolate min-w-0">
            {/* Fondo liso detrás del texto: las caras del poliedro nunca quedan debajo de las letras (contraste siempre sobre el verde). */}
            <div
              aria-hidden
              className={`pointer-events-none absolute -inset-y-14 -left-8 -right-12 -z-10 [mask-image:linear-gradient(to_right,#000_calc(100%-3rem),transparent)] ${sinRed ? "hidden" : "bg-fondo max-lg:hidden motion-reduce:hidden"}`}
            />
            {children}
          </div>
          <div aria-hidden className={`mx-auto aspect-square w-full max-w-[19rem] transition-opacity duration-500 lg:max-w-none ${vivo ? "opacity-0" : ""}`}>
            <PoliedroEstatico monto={config.montoBaseUsd} />
          </div>
        </div>
      </div>

      <div aria-hidden className={`${contenedor} pb-16 ${mapaEstatico}`}>
        <RedEstatica />
      </div>
    </section>
  );
}
