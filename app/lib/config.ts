/**
 * Espejo de la tabla `configuracion` (DECISIONS.md, decisión 17).
 * Nada de montos, umbrales o plazos se escribe en los componentes: todo sale de acá.
 * Cuando se conecte Supabase, esta constante se reemplaza por una lectura de la tabla.
 */
export type Hito = { referidos: number; bonoUsd: number };

export const config = {
  montoBaseUsd: 50,
  multiplicadorPrioritario: 2,
  hitos: [
    { referidos: 3, bonoUsd: 75 },
    { referidos: 6, bonoUsd: 150 },
    { referidos: 10, bonoUsd: 300 },
  ] satisfies Hito[],
  periodoHitos: "año calendario",
  diaCortePago: 25,
  plazoRespuestaCandidatoDiasHabiles: 5,
  plazoRevisionDiasHabiles: 3,
  alertaVolumen: { cantidad: 5, dias: 7 },
  limiteConsultaCodigo: { fallosMaximos: 10, ventanaSegundos: 600 },
  // Pedidos de magic link que acepta /ingresar por ventana. Cuentan todos los intentos, esté o no habilitado el email.
  limiteIngreso: { intentosPorIp: 5, intentosPorEmail: 3, ventanaSegundos: 600 },
  cvMaxMb: 5,
} as const;

export const montoPrioritarioUsd = config.montoBaseUsd * config.multiplicadorPrioritario;
