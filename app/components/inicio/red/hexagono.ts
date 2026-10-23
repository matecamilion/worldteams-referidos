import { Vector3 } from "three";
import type { Escena } from "./escena";
import { tramo } from "./util";

export type EventoHero = { quien: string; que: string; monto: string };

const SEGUNDOS_POR_EVENTO = 3.2;

/** Curva de resorte amortiguado como easing `linear()`; si el navegador no la soporta, un rebote simple. */
function resorteCss() {
  if (typeof CSS === "undefined" || !CSS.supports("animation-timing-function", "linear(0, 1)")) {
    return "cubic-bezier(0.34, 1.56, 0.64, 1)";
  }
  const z = 0.42;
  const w = 16;
  const wd = w * Math.sqrt(1 - z * z);
  const puntos = Array.from({ length: 41 }, (_, i) => {
    const t = (i / 40) * 0.9;
    return (1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t))).toFixed(3);
  });
  return `linear(${puntos.join(",")})`;
}

const suave = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/**
 * Hexágono "+USD" que sigue a una cara lima del poliedro, con los eventos del hero (los montos vienen de la configuración).
 * Empieza cuando termina la entrada y se apaga en cuanto el scroll abre la figura.
 * [data-pop] recibe el resorte; [data-quien], [data-que] y [data-monto], el texto.
 */
export function crearHexagono(e: Escena, hex: HTMLElement, eventos: EventoHero[]) {
  const pop = hex.querySelector<HTMLElement>("[data-pop]")!;
  const texto = (sel: string) => hex.querySelector<HTMLElement>(sel)!;
  const curva = resorteCss();
  let animacion: Animation | undefined;

  let evento = -1;
  let cara = 0;
  let reloj = SEGUNDOS_POR_EVENTO; // fuerza el primer evento apenas arranca
  let salio = true;
  let activo = false;
  const normal = new Vector3();
  const centro = new Vector3();
  const haciaCamara = new Vector3();

  function elegirCara() {
    let mejor = 0;
    let frente = -2;
    for (const c of e.caras) {
      if (c.i === cara) continue;
      normal.copy(c.normal).transformDirection(e.cuerpo.matrixWorld);
      if (normal.z > frente) {
        frente = normal.z;
        mejor = c.i;
      }
    }
    return mejor;
  }

  function entrar() {
    evento = (evento + 1) % eventos.length;
    cara = elegirCara();
    const ev = eventos[evento];
    texto("[data-quien]").textContent = ev.quien;
    texto("[data-quien]").hidden = !ev.quien;
    texto("[data-que]").textContent = ev.que;
    texto("[data-monto]").textContent = ev.monto;
    animacion?.cancel();
    animacion = pop.animate([{ transform: "scale(0.5)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }], { duration: 900, easing: curva, fill: "both" });
    salio = false;
  }

  function salir() {
    animacion?.cancel();
    animacion = pop.animate([{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.8)", opacity: 0 }], { duration: 220, easing: "ease-in", fill: "both" });
    salio = true;
  }

  return {
    /** `p`: apertura; `ancho`/`alto`: tamaño del lienzo en px. Se llama después de colocar las caras. */
    cuadro(dt: number, p: number, ancho: number, alto: number, entradaLista: boolean) {
      const debe = entradaLista && p < 0.02;
      if (debe && !activo) {
        activo = true;
        reloj = SEGUNDOS_POR_EVENTO;
      } else if (!debe && activo) {
        activo = false;
        if (!salio) salir();
      }

      if (activo) {
        reloj += dt;
        if (reloj >= SEGUNDOS_POR_EVENTO) {
          reloj = 0;
          entrar();
        } else if (!salio && reloj >= SEGUNDOS_POR_EVENTO - 0.3) {
          salir();
        }
      }

      const brillo = e.brilloExterno;
      for (const c of e.caras) {
        const objetivo = activo && c.i === cara && !salio ? 1 : 0;
        brillo[c.i] += (objetivo - brillo[c.i]) * Math.min(1, dt * 7);
      }

      // El hexágono sigue a su cara y se apaga si ésta se aleja de la cámara o si empieza la apertura.
      const c = e.caras[cara];
      centro.copy(c.malla.position).applyMatrix4(e.cuerpo.matrixWorld);
      normal.copy(c.normal).transformDirection(e.cuerpo.matrixWorld);
      haciaCamara.copy(e.camara.position).sub(centro).normalize();
      const visibilidad = suave(0.3, 0.6, normal.dot(haciaCamara)) * (1 - tramo(p, 0, 0.03)) * (evento >= 0 ? 1 : 0);
      centro.project(e.camara);
      hex.style.transform = `translate3d(${((centro.x + 1) / 2) * ancho}px, ${((1 - centro.y) / 2) * alto}px, 0)`;
      hex.style.opacity = String(visibilidad);
    },
    pausar() {
      animacion?.pause();
    },
    reanudar() {
      animacion?.play();
    },
    destruir() {
      animacion?.cancel();
    },
  };
}
