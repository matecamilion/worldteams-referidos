import type { gsap as Gsap } from "gsap";
import type { ScrollTrigger as ScrollTriggerTipo } from "gsap/ScrollTrigger";

type Motor = { gsap: typeof Gsap; ScrollTrigger: typeof ScrollTriggerTipo };

let promesa: Promise<Motor> | null = null;

/**
 * GSAP se carga una sola vez y bajo demanda, para que no pese en el JS inicial.
 * Todos los componentes esperan la misma promesa, así que sus ScrollTrigger se crean en orden de montaje.
 */
export function cargarGsap(): Promise<Motor> {
  promesa ??= Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([g, s]) => {
    g.gsap.registerPlugin(s.ScrollTrigger);
    return { gsap: g.gsap, ScrollTrigger: s.ScrollTrigger };
  });
  return promesa;
}

export const prefiereMovimientoReducido = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
