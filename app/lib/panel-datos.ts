import {
  armarCola,
  armarPool,
  LIMITE_COLA,
  leerConfigPanel,
  POR_PAGINA,
  terminosBusqueda,
  type CandidatoPool,
  type CasoRevision,
  type ConfigPanel,
  type FilaCola,
  type FilaPool,
  type ParamsPool,
} from "./panel";
import type { ClienteSesion } from "./supabase-sesion";

/**
 * Lecturas del panel con la sesión de reclutamiento: todo pasa por la RLS (`es_reclutamiento()`), sin service role
 * y sin escribir nada. Se piden solo las columnas que se muestran.
 */

export type ResultadoConfig = { ok: true; config: ConfigPanel } | { ok: false };

export async function cargarConfigPanel(supabase: ClienteSesion): Promise<ResultadoConfig> {
  const { data, error } = await supabase
    .from("configuracion")
    .select("clave, valor")
    .in("clave", ["plazo_revision_dias_habiles", "zona_horaria"]);
  if (error) {
    console.error("[panel] No se pudo leer la configuración:", error.message);
    return { ok: false };
  }
  const config = leerConfigPanel(data ?? []);
  if (!config) {
    console.error("[panel] La configuración del panel es inválida o falta");
    return { ok: false };
  }
  return { ok: true, config };
}

export type ResultadoCola = { ok: true; casos: CasoRevision[]; total: number } | { ok: false };

/** Referidos en revisión, los más viejos primero. Trae como máximo `LIMITE_COLA` y el total real aparte. */
export async function cargarCola(supabase: ClienteSesion, config: ConfigPanel, ahora = new Date()): Promise<ResultadoCola> {
  const { data, error, count } = await supabase
    .from("referidos")
    .select(
      "id, creado_en, motivos_revision, " +
        "candidatos(nombre, apellido, email, linkedin_url, especialidad, usa_revit, seniority, nivel_ingles, es_prioritario, cv_url), " +
        "referentes(nombre, apellido, email)",
      { count: "exact" },
    )
    .eq("estado", "en_revision")
    .order("creado_en", { ascending: true })
    .order("id", { ascending: true })
    .limit(LIMITE_COLA);
  if (error) {
    console.error("[panel] No se pudo leer la cola de revisión:", error.message);
    return { ok: false };
  }
  const casos = armarCola((data ?? []) as unknown as FilaCola[], ahora, config);
  return { ok: true, casos, total: count ?? casos.length };
}

export type ResultadoPool =
  | { ok: true; filas: CandidatoPool[]; total: number }
  | { ok: true; fueraDeRango: true }
  | { ok: false };

/**
 * Talent pool: una fila por candidato con su referido más reciente. La búsqueda (cada palabra en nombre, apellido o
 * email), el filtro por estado, el orden y la paginación se resuelven en la consulta, no en el navegador.
 */
export async function cargarPool(supabase: ClienteSesion, params: ParamsPool): Promise<ResultadoPool> {
  // Con filtro por estado el referido se pide con `!inner`: solo quedan los candidatos que tienen uno en ese estado.
  const embebido = params.estado ? "referidos!inner" : "referidos";
  let consulta = supabase
    .from("candidatos")
    .select(
      "id, nombre, apellido, email, especialidad, origen, creado_en, " +
        `${embebido}(id, estado, creado_en, referentes(nombre, apellido))`,
      { count: "exact" },
    );
  if (params.estado) consulta = consulta.eq("referidos.estado", params.estado);
  for (const palabra of terminosBusqueda(params.q)) {
    consulta = consulta.or(`nombre.ilike.*${palabra}*,apellido.ilike.*${palabra}*,email.ilike.*${palabra}*`);
  }
  const desde = (params.pagina - 1) * POR_PAGINA;
  const { data, error, count } = await consulta
    .order("creado_en", { ascending: false })
    .order("id", { ascending: true })
    // El referido más reciente de cada candidato.
    .order("creado_en", { referencedTable: "referidos", ascending: false })
    .limit(1, { referencedTable: "referidos" })
    .range(desde, desde + POR_PAGINA - 1);
  if (error) {
    // PGRST103: la página pedida está más allá del último resultado (por ejemplo, desde un link viejo).
    if (error.code === "PGRST103") return { ok: true, fueraDeRango: true };
    console.error("[panel] No se pudo leer el talent pool:", error.message);
    return { ok: false };
  }
  return { ok: true, filas: armarPool((data ?? []) as unknown as FilaPool[]), total: count ?? 0 };
}
