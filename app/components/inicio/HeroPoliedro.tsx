"use client";

import { useEffect, useRef, useState } from "react";
import es from "@/i18n/es.json";
import { config, montoPrioritarioUsd } from "@/lib/config";
import { prefiereMovimientoReducido } from "@/lib/gsap";
import { PoliedroEstatico } from "./PoliedroEstatico";

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

const hayWebgl = () => {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
};

/**
 * Poliedro del hero. Siempre se pinta primero el SVG estático (móvil, movimiento reducido, sin WebGL);
 * en ≥1024px, sin movimiento reducido y con WebGL, three.js se importa después del primer render y lo reemplaza.
 */
export function HeroPoliedro() {
  const caja = useRef<HTMLDivElement>(null);
  const hex = useRef<HTMLDivElement>(null);
  const [vivo, setVivo] = useState(false);

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
    const evaluar = () => {
      apagar();
      if (!ancho.matches || prefiereMovimientoReducido() || !hayWebgl()) return;
      const mia = gen;
      // Después del primer render y del primer reposo del hilo principal.
      temporizador = setTimeout(async () => {
        const { montarPoliedro } = await import("./poliedro3d");
        if (mia !== gen || !caja.current || !hex.current) return;
        try {
          destruir = montarPoliedro({ contenedor: caja.current, hex: hex.current, eventos, alPerder: apagar });
          setVivo(true);
        } catch {
          apagar();
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

  return (
    <div ref={caja} aria-hidden className="relative mx-auto aspect-square w-full max-w-[19rem] lg:max-w-none">
      <div className={`absolute inset-0 transition-opacity duration-500 ${vivo ? "opacity-0" : ""}`}>
        <PoliedroEstatico monto={config.montoBaseUsd} />
      </div>
      <div ref={hex} className="pointer-events-none absolute left-0 top-0 opacity-0 will-change-transform" hidden={!vivo}>
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
    </div>
  );
}
