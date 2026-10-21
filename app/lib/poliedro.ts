/** Icosaedro unitario (mismos vértices y caras que IcosahedronGeometry de three.js) y su proyección plana para el SVG estático. */
type Vec = [number, number, number];

const T = (1 + Math.sqrt(5)) / 2;

export const VERTICES: Vec[] = [
  [-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0],
  [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T],
  [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1],
];

export const CARAS: [number, number, number][] = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/** Tonos de la marca (verde, salvia, crema) que se reparten entre las caras. */
export const TONOS_CARA = ["#58958c", "#fff7f3", "#142d2b", "#2f6259", "#58958c", "#fff7f3", "#1f4641"] as const;
export const tonoDeCara = (i: number) => TONOS_CARA[(i * 5 + 2) % TONOS_CARA.length];

const norma = (v: Vec): Vec => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const resta = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cruz = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punto = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function girar([x, y, z]: Vec, ay: number, ax: number): Vec {
  const x1 = x * Math.cos(ay) + z * Math.sin(ay);
  const z1 = -x * Math.sin(ay) + z * Math.cos(ay);
  const y2 = y * Math.cos(ax) - z1 * Math.sin(ax);
  const z2 = y * Math.sin(ax) + z1 * Math.cos(ax);
  return [x1, y2, z2];
}

function mezclar(a: string, b: string, k: number) {
  const c = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [pa, pb] = [c(a), c(b)];
  return `#${pa.map((v, i) => Math.round(v + (pb[i] - v) * k).toString(16).padStart(2, "0")).join("")}`;
}

export type CaraSvg = { puntos: string; relleno: string; lima: boolean };

/** Caras visibles del poliedro en una vista fija, dentro de un viewBox de `lado` x `lado`. */
export function proyectar(lado: number) {
  const radio = lado * 0.4;
  const v = VERTICES.map((p) => girar(norma(p), 0.62, -0.42));
  const luz = norma([-0.5, 0.65, 0.75]);

  const visibles = CARAS.map((cara, i) => {
    const [a, b, c] = cara.map((k) => v[k]);
    let n = norma(cruz(resta(b, a), resta(c, a)));
    const centro: Vec = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (punto(n, centro) < 0) n = [-n[0], -n[1], -n[2]];
    return { i, cara, n, centro };
  }).filter((f) => f.n[2] > 0.02);

  const frente = visibles.reduce((m, f) => (f.n[2] > m.n[2] ? f : m));
  const pantalla = (p: Vec) => [lado / 2 + p[0] * radio, lado / 2 - p[1] * radio] as const;

  const caras: CaraSvg[] = visibles.map((f) => {
    const luminosidad = Math.max(0, punto(f.n, luz));
    const lima = f === frente;
    return {
      puntos: f.cara.map((k) => pantalla(v[k]).map((n) => n.toFixed(1)).join(",")).join(" "),
      relleno: lima ? "#d0ef76" : mezclar("#0d211f", tonoDeCara(f.i), 0.45 + 0.55 * luminosidad),
      lima,
    };
  });

  const [hx, hy] = pantalla(frente.centro);
  return { caras, hex: { x: hx, y: hy } };
}
