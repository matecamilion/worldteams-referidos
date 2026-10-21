import { proyectar } from "@/lib/poliedro";

const LADO = 400;
const { caras, hex } = proyectar(LADO);

/** Hexágono regular de punta plana, centrado en (x, y), de ancho `ancho`. */
const hexagono = (x: number, y: number, ancho: number) => {
  const r = ancho / 2;
  const alto = (r * Math.sqrt(3)) / 2;
  return [[-r / 2, -alto], [r / 2, -alto], [r, 0], [r / 2, alto], [-r / 2, alto], [-r, 0]]
    .map(([dx, dy]) => `${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}`)
    .join(" ");
};

/** Versión sin animación del poliedro, con un hexágono fijo. Sirve de respaldo en móvil, con movimiento reducido o sin WebGL. */
export function PoliedroEstatico({ monto }: { monto: number }) {
  return (
    <svg viewBox={`0 0 ${LADO} ${LADO}`} aria-hidden focusable="false" className="size-full">
      <g stroke="#58958c" strokeWidth="1" strokeLinejoin="round">
        {caras.map((c) => (
          <polygon key={c.puntos} points={c.puntos} fill={c.relleno} />
        ))}
      </g>
      <polygon points={hexagono(hex.x, hex.y, 104)} fill="#142d2b" />
      <text
        x={hex.x}
        y={hex.y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#d0ef76"
        className="font-display"
        fontSize="21"
        fontWeight="600"
      >
        {`+USD ${monto}`}
      </text>
    </svg>
  );
}
