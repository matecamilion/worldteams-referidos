/**
 * Modelo de lo que muestra /portal. Todo acá es puro: la lectura de la base está en `portal-datos.ts`
 * y los textos salen de `i18n/es.json`.
 */
export type EstadoVisible = "registrado" | "en_revision" | "validado" | "no_avanzo";

const estadosVisibles: readonly EstadoVisible[] = ["registrado", "en_revision", "validado", "no_avanzo"];

/**
 * La vista `v_mis_referidos` ya devuelve rechazado y descartado como `no_avanzo` (decisión 38). Acá se defiende
 * la pantalla igual: cualquier valor que no conozca se muestra como "no avanzó", nunca como un estado interno.
 */
export function estadoVisible(valor: string | null | undefined): EstadoVisible {
  return estadosVisibles.find((e) => e === valor) ?? "no_avanzo";
}

export type FilaReferido = { referido_id: string; nombre: string; apellido: string; estado_visible: string; creado_en: string };
export type Referido = { id: string; nombreCompleto: string; estado: EstadoVisible };

export function armarReferidos(filas: FilaReferido[]): Referido[] {
  return [...filas]
    .sort((a, b) => b.creado_en.localeCompare(a.creado_en))
    .map((f) => ({ id: f.referido_id, nombreCompleto: `${f.nombre} ${f.apellido}`.trim(), estado: estadoVisible(f.estado_visible) }));
}

export type FilaProgreso = {
  validados_anio: number;
  proximo_hito: number | null;
  proximo_bono_usd: number | null;
  faltan: number;
};
export type Progreso =
  | { tipo: "en_camino"; validados: number; hito: number; bonoUsd: number; faltan: number; porcentaje: number }
  | { tipo: "completo"; validados: number };

/** Barra de hitos: avance hacia el próximo bono. Sin próximo hito (ya cobró todos) la barra está completa. */
export function armarProgreso(fila: FilaProgreso | null | undefined): Progreso {
  const validados = Math.max(0, Number(fila?.validados_anio ?? 0));
  const hito = fila?.proximo_hito ?? null;
  if (hito === null || hito <= 0) return { tipo: "completo", validados };
  const porcentaje = Math.min(100, Math.max(0, Math.round((validados / hito) * 100)));
  return {
    tipo: "en_camino",
    validados,
    hito,
    bonoUsd: Number(fila?.proximo_bono_usd ?? 0),
    faltan: Math.max(0, Number(fila?.faltan ?? hito - validados)),
    porcentaje,
  };
}

export type Concepto = "base" | "extra_prioritario" | "bono_hito";
export type FilaMovimiento = {
  id: string;
  concepto: Concepto;
  hito_umbral: number | null;
  monto_usd: number | string;
  estado: string;
  ciclo_pago: string;
  pagado_en: string | null;
  creado_en: string;
};
export type Movimiento = {
  id: string;
  concepto: Concepto;
  hitoUmbral: number | null;
  montoUsd: number;
  estado: "pendiente" | "pagado";
  ciclo: string;
};
export type Premios = { pendienteUsd: number; pagadoUsd: number; movimientos: Movimiento[] };

/**
 * Premios del referente. Solo cuentan los pendientes y los pagados: los cancelados por sanción no se muestran
 * ni suman. Los montos vienen como numeric (a veces string) y se redondean a centavos para no arrastrar decimales.
 */
export function armarPremios(filas: FilaMovimiento[]): Premios {
  const movimientos: Movimiento[] = filas
    .filter((f) => f.estado === "pendiente" || f.estado === "pagado")
    .sort((a, b) => b.creado_en.localeCompare(a.creado_en))
    .map((f) => ({
      id: f.id,
      concepto: f.concepto,
      hitoUmbral: f.hito_umbral,
      montoUsd: Number(f.monto_usd),
      estado: f.estado as "pendiente" | "pagado",
      ciclo: f.ciclo_pago,
    }));
  const suma = (estado: Movimiento["estado"]) =>
    Math.round(movimientos.filter((m) => m.estado === estado).reduce((s, m) => s + m.montoUsd, 0) * 100) / 100;
  return { pendienteUsd: suma("pendiente"), pagadoUsd: suma("pagado"), movimientos };
}

/** "USD 50", "USD 62,5" o "USD 1.250": sin decimales cuando el monto es entero. */
export function formatearUsd(monto: number): string {
  const enteros = Number.isInteger(monto);
  return `USD ${monto.toLocaleString("es-AR", { minimumFractionDigits: enteros ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "2026-11" -> "noviembre de 2026". */
export function formatearCiclo(ciclo: string): string {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(ciclo);
  if (!m) return ciclo;
  const mes = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString("es-AR", { month: "long", timeZone: "UTC" });
  return `${mes} de ${m[1]}`;
}
