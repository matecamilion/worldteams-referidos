export const acotar = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
/** Progreso 0..1 de `x` dentro del tramo [a, b]. */
export const tramo = (x: number, a: number, b: number) => acotar((x - a) / (b - a));
export const mezclar = (a: number, b: number, k: number) => a + (b - a) * k;
/** Pseudoazar determinista en 0..1: las mismas caras se comportan igual en cada reproducción. */
export const azar = (i: number, sal = 0) => {
  const x = Math.sin((i + 1) * 12.9898 + sal * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

/** cubic-bezier(x1, y1, x2, y2) como función; bisección, sin asignaciones. */
export function bezier(x1: number, y1: number, x2: number, y2: number) {
  const eje = (t: number, a: number, b: number) => 3 * a * t * (1 - t) * (1 - t) + 3 * b * t * t * (1 - t) + t * t * t;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (eje(mid, x1, x2) < x) lo = mid;
      else hi = mid;
    }
    return eje((lo + hi) / 2, y1, y2);
  };
}

/** Mismas curvas que el skill de Emil Kowalski. */
export const SALIDA = bezier(0.23, 1, 0.32, 1);
export const ENTRADA_SALIDA = bezier(0.77, 0, 0.175, 1);
export const CAJON = bezier(0.32, 0.72, 0, 1);
/** Rebote contenido (lo usa solo la variante expresiva). */
export const REBOTE = bezier(0.34, 1.4, 0.64, 1);

/** Resorte de un grado de libertad, integrado a paso semiimplícito. */
export type Resorte = { x: number; v: number };
export function resorte(r: Resorte, objetivo: number, dt: number, rigidez: number, amortiguacion: number) {
  const pasos = Math.max(1, Math.ceil(dt / 0.008));
  const h = dt / pasos;
  for (let i = 0; i < pasos; i++) {
    r.v += (-rigidez * (r.x - objetivo) - amortiguacion * r.v) * h;
    r.x += r.v * h;
  }
}
