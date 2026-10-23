import { CARAS, VERTICES } from "@/lib/poliedro";

const ANCHO = 340;
const ALTO = 340;

type Punto = { x: number; y: number; z: number };

/** Centros de las 20 caras (los puntos de la red), girados para una vista fija, y las 30 uniones entre caras vecinas. */
function armar() {
  const ay = 0.2;
  const ax = 0.5;
  const norma = (v: number[]) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return v.map((c) => c / l);
  };
  const v = VERTICES.map((p) => norma(p));
  const centros: Punto[] = CARAS.map(([a, b, c]) => {
    const m = norma([0, 1, 2].map((k) => v[a][k] + v[b][k] + v[c][k]));
    const x1 = m[0] * Math.cos(ay) + m[2] * Math.sin(ay);
    const z1 = -m[0] * Math.sin(ay) + m[2] * Math.cos(ay);
    const y2 = m[1] * Math.cos(ax) - z1 * Math.sin(ax);
    const z2 = m[1] * Math.sin(ax) + z1 * Math.cos(ax);
    return { x: ANCHO / 2 + x1 * ALTO * 0.42, y: ALTO / 2 - y2 * ALTO * 0.42, z: z2 };
  });
  const uniones: [number, number][] = [];
  CARAS.forEach((a, i) => {
    CARAS.forEach((b, j) => {
      if (j > i && a.filter((k) => b.includes(k)).length === 2) uniones.push([i, j]);
    });
  });
  return { centros, uniones };
}

const { centros, uniones } = armar();

/** Versión fija del mapa de puntos y líneas: se ve con movimiento reducido, por debajo de 1024 px y sin WebGL. Sin texto. */
export function RedEstatica() {
  return (
    <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} aria-hidden focusable="false" className="mx-auto h-auto w-full max-w-[26rem]">
      <g stroke="#d0ef76" strokeWidth="1" strokeOpacity="0.4">
        {uniones.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={centros[a].x} y1={centros[a].y} x2={centros[b].x} y2={centros[b].y} />
        ))}
      </g>
      <g fill="#d0ef76">
        {centros.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={c.z > 0 ? 6 : 4} fillOpacity={c.z > 0 ? 1 : 0.6} />
        ))}
      </g>
    </svg>
  );
}
