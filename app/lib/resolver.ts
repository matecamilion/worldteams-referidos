import { esUuid, leerParamsPool, urlPool, type ParamsPool } from "./panel";

/** Lo que el panel le pide a `resolver_referido` (supabase/panel_resolver.sql, decisión 64). */
export const decisiones = ["aprobar", "rechazar", "reabrir"] as const;
export type Decision = (typeof decisiones)[number];

/** Mismo tope que la función de la base: la base es la que manda, esto solo evita ir y volver. */
export const MOTIVO_MAX = 500;

/** Errores que el panel sabe explicar. El resto es `generico`. */
export type CodigoError =
  | "sin_permiso"
  | "ya_resuelto"
  | "estado_invalido"
  | "motivo_requerido"
  | "motivo_demasiado_largo"
  | "referido_inexistente"
  | "generico";

const codigosConocidos: readonly CodigoError[] = ["sin_permiso", "ya_resuelto", "estado_invalido", "motivo_requerido", "motivo_demasiado_largo", "referido_inexistente"];

/**
 * Traduce el error de la base. Las funciones empiezan el mensaje con el código ("ya_resuelto: el caso ya está
 * validado"); un `permission denied` (42501) es sin_permiso aunque venga sin él. Lo desconocido no se muestra.
 */
export function codigoDeError(error: { message?: string | null; code?: string | null } | null | undefined): CodigoError {
  const mensaje = (error?.message ?? "").trim();
  const previo = codigosConocidos.find((c) => mensaje.startsWith(`${c}:`) || mensaje === c);
  if (previo) return previo;
  if (error?.code === "42501" || /permission denied/i.test(mensaje)) return "sin_permiso";
  return "generico";
}

/** Estado del formulario de resolución: lo que se queda en pantalla cuando no se recarga la lista. */
export type EstadoResolver = { error: CodigoError | null; motivo?: string };

export type RespuestaResolver = { estado: string; montoUsd: number | null; sinPago: boolean };

/** Lee el jsonb que devuelve la función; null si no tiene la forma esperada. */
export function leerRespuesta(data: unknown): RespuestaResolver | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.estado !== "string") return null;
  const monto = d.monto_usd === null || d.monto_usd === undefined ? null : Number(d.monto_usd);
  return { estado: d.estado, montoUsd: monto !== null && Number.isFinite(monto) ? monto : null, sinPago: d.sin_pago === true };
}

export type EntradaResolver = { referido: string; decision: Decision; motivo: string | null; origen: "cola" | "pool"; paramsPool: ParamsPool };

type Campos = { get(nombre: string): unknown };

/** Valida el formulario en el servidor. Reabrir sin motivo se rechaza acá y también en la base. */
export function leerEntrada(form: Campos): { ok: true; entrada: EntradaResolver } | { ok: false; error: CodigoError } {
  const texto = (n: string) => (typeof form.get(n) === "string" ? (form.get(n) as string) : "");
  const referido = texto("referido").trim();
  const decision = texto("decision");
  if (!esUuid(referido) || !(decisiones as readonly string[]).includes(decision)) return { ok: false, error: "generico" };
  const motivo = texto("motivo").trim() || null;
  if (decision === "reabrir" && !motivo) return { ok: false, error: "motivo_requerido" };
  if (motivo && motivo.length > MOTIVO_MAX) return { ok: false, error: "motivo_demasiado_largo" };
  const origen = texto("origen") === "pool" ? "pool" : "cola";
  const paramsPool = leerParamsPool({ q: texto("q"), estado: texto("estado"), pagina: texto("pagina") });
  return { ok: true, entrada: { referido, decision: decision as Decision, motivo, origen, paramsPool } };
}

// ---------------------------------------------------------------------------------------------------------------
// Aviso después de resolver: viaja en la URL (`?resultado=…&monto=…`) porque la tarjeta desaparece de la lista al
// resolverse y un estado del lado del cliente se perdería. Solo elige un texto del archivo de textos: nada de lo
// que viene en la URL se muestra tal cual. Es solo presentación; la verdad está en la base.
// ---------------------------------------------------------------------------------------------------------------
export const avisos = ["aprobado", "aprobado_sin_pago", "rechazado", "reabierto", "ya_resuelto", "estado_invalido", "referido_inexistente"] as const;
export type CodigoAviso = (typeof avisos)[number];
export type Aviso = { codigo: CodigoAviso; montoUsd: number | null };

export const esError = (c: CodigoAviso) => c === "ya_resuelto" || c === "estado_invalido" || c === "referido_inexistente";

export function leerAviso(sp: Record<string, string | string[] | undefined>): Aviso | null {
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const codigo = uno(sp.resultado);
  if (!codigo || !(avisos as readonly string[]).includes(codigo)) return null;
  const monto = Number(uno(sp.monto));
  const montoUsd = codigo === "aprobado" && uno(sp.monto) !== undefined && Number.isFinite(monto) && monto > 0 && monto < 1_000_000 ? monto : null;
  return { codigo: codigo as CodigoAviso, montoUsd };
}

/** Adónde vuelve la persona después de resolver, con el aviso. El pool conserva q, estado y página. */
export function urlConAviso(
  entrada: Pick<EntradaResolver, "origen" | "paramsPool">,
  aviso: Aviso,
  base: { cola: string; pool: string } = { cola: "/panel", pool: "/panel/pool" },
): string {
  const destino = entrada.origen === "pool" ? urlPool(entrada.paramsPool, base.pool) : base.cola;
  const qs = new URLSearchParams({ resultado: aviso.codigo });
  if (aviso.montoUsd !== null) qs.set("monto", String(aviso.montoUsd));
  return `${destino}${destino.includes("?") ? "&" : "?"}${qs.toString()}`;
}

/** Aviso para el resultado de una resolución exitosa. */
export function avisoDeResultado(decision: Decision, r: RespuestaResolver): Aviso {
  if (decision === "rechazar") return { codigo: "rechazado", montoUsd: null };
  if (decision === "reabrir") return { codigo: "reabierto", montoUsd: null };
  return r.sinPago ? { codigo: "aprobado_sin_pago", montoUsd: null } : { codigo: "aprobado", montoUsd: r.montoUsd && r.montoUsd > 0 ? r.montoUsd : null };
}
