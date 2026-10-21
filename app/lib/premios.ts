import { config, montoPrioritarioUsd } from "./config";

export const extraPrioritarioUsd = montoPrioritarioUsd - config.montoBaseUsd;

/**
 * Premio de un año con `total` referidos validados, `prioritarias` de ellos con perfil prioritario.
 * Cada hito alcanzado suma su bono, así que los bonos son acumulativos (3, 6 y 10 referidos).
 * Todo sale de `config`, que es el espejo de la tabla `configuracion`.
 */
export function calcularPremio(total: number, prioritarias = 0) {
  const base = total * config.montoBaseUsd;
  const extra = prioritarias * extraPrioritarioUsd;
  const hitos = config.hitos.filter((h) => total >= h.referidos).reduce((suma, h) => suma + h.bonoUsd, 0);
  const proximo = config.hitos.find((h) => total < h.referidos);
  return { base, extra, hitos, total: base + extra + hitos, proximo };
}
