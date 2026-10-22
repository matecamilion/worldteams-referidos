/**
 * Modelo de lo que muestra /panel (solo lectura). Todo acá es puro: la lectura de la base está en `panel-datos.ts`
 * y los textos salen de `i18n/es.json`.
 */
export const POR_PAGINA = 20;
/** Tope de casos que se traen de la cola de una vez; el total real se informa aparte. */
export const LIMITE_COLA = 50;

export const estadosReferido = ["registrado", "en_revision", "validado", "rechazado", "descartado"] as const;
export type EstadoReferido = (typeof estadosReferido)[number];

export const motivosConocidos = ["posible_duplicado", "alerta_volumen", "perfil_incompleto"] as const;
export function esMotivoConocido(codigo: string): boolean {
  return (motivosConocidos as readonly string[]).includes(codigo);
}

/** "otro_motivo" -> "otro motivo": un motivo que la pantalla no conoce se muestra legible, nunca en blanco. */
export function motivoDesconocido(codigo: string): string {
  return codigo.replace(/_+/g, " ").trim();
}

// ---------------------------------------------------------------------------------------------------------------
// Parámetros de la tabla del talent pool (vienen de la URL, así que se validan siempre).
// ---------------------------------------------------------------------------------------------------------------
export type ParamsPool = { q: string; estado: EstadoReferido | null; pagina: number };

const PAGINA_MAXIMA = 100_000;
const LARGO_BUSQUEDA = 80;
const MAXIMO_TERMINOS = 4;

function primero(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor) ?? "";
}

/**
 * Deja solo letras, números y los signos de un nombre o email. Los separadores del filtro `or=(...)` de PostgREST
 * (coma, paréntesis, comillas, dos puntos, barra invertida) y los comodines (`*`, `%`) no llegan a la consulta.
 */
export function limpiarBusqueda(texto: string): string {
  return texto
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s@.+_'-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LARGO_BUSQUEDA)
    .trim();
}

/** "ana paz" -> ["ana", "paz"]: cada palabra tiene que aparecer en el nombre, el apellido o el email. */
export function terminosBusqueda(q: string): string[] {
  return limpiarBusqueda(q).split(" ").filter(Boolean).slice(0, MAXIMO_TERMINOS);
}

export function leerParamsPool(sp: Record<string, string | string[] | undefined>): ParamsPool {
  const estado = primero(sp.estado);
  const pagina = Number.parseInt(primero(sp.pagina), 10);
  return {
    q: limpiarBusqueda(primero(sp.q)),
    estado: (estadosReferido as readonly string[]).includes(estado) ? (estado as EstadoReferido) : null,
    pagina: Number.isFinite(pagina) && pagina >= 1 ? Math.min(pagina, PAGINA_MAXIMA) : 1,
  };
}

/** Arma la URL del talent pool (/panel/pool) con sus filtros; lo que está en su valor por defecto no se escribe. */
export function urlPool(p: ParamsPool, base = "/panel/pool"): string {
  const qs = new URLSearchParams();
  if (p.q) qs.set("q", p.q);
  if (p.estado) qs.set("estado", p.estado);
  if (p.pagina > 1) qs.set("pagina", String(p.pagina));
  const s = qs.toString();
  return `${base}${s ? `?${s}` : ""}`;
}

export function totalPaginas(total: number): number {
  return Math.max(1, Math.ceil(total / POR_PAGINA));
}

// ---------------------------------------------------------------------------------------------------------------
// Configuración que usa el panel (tabla `configuracion`).
// ---------------------------------------------------------------------------------------------------------------
export type ConfigPanel = { plazoRevisionDias: number; zona: string };

function zonaValida(zona: unknown): zona is string {
  if (typeof zona !== "string" || !zona) return false;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: zona });
    return true;
  } catch {
    return false;
  }
}

/** Valida lo que devuelve la base; ante un valor roto devuelve null (mejor no marcar vencidos que marcar mal). */
export function leerConfigPanel(filas: { clave: string; valor: unknown }[]): ConfigPanel | null {
  const valor = (clave: string) => filas.find((f) => f.clave === clave)?.valor;
  const plazo = valor("plazo_revision_dias_habiles");
  const zona = valor("zona_horaria");
  if (typeof plazo !== "number" || !Number.isInteger(plazo) || plazo <= 0 || !zonaValida(zona)) return null;
  return { plazoRevisionDias: plazo, zona };
}

// ---------------------------------------------------------------------------------------------------------------
// Días hábiles (lunes a viernes). NO considera feriados (decisión 60).
// ---------------------------------------------------------------------------------------------------------------
/** Fecha "AAAA-MM-DD" que tiene un instante en la zona dada. */
export function fechaLocal(instante: Date, zona: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit" }).format(instante);
}

function diaUtc(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number);
  return Date.UTC(a, m - 1, d);
}

/**
 * Días hábiles que pasaron desde que se creó el caso hasta hoy, contando los días calendario de la zona
 * después del de creación (el mismo día vale 0). Sábado y domingo no cuentan; los feriados sí cuentan como hábiles.
 */
export function diasHabilesTranscurridos(desde: Date | string, hasta: Date, zona: string): number {
  const inicio = typeof desde === "string" ? new Date(desde) : desde;
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(hasta.getTime())) return 0;
  const fin = diaUtc(fechaLocal(hasta, zona));
  let dia = diaUtc(fechaLocal(inicio, zona));
  let n = 0;
  while (dia < fin) {
    dia += 86_400_000;
    const semana = new Date(dia).getUTCDay();
    if (semana !== 0 && semana !== 6) n += 1;
  }
  return n;
}

/** Supera el plazo cuando ya pasaron más días hábiles que el plazo (con plazo 3, vence al cuarto día hábil). */
export function superaPlazo(diasHabiles: number, plazo: number): boolean {
  return diasHabiles > plazo;
}

// ---------------------------------------------------------------------------------------------------------------
// Cola de revisión
// ---------------------------------------------------------------------------------------------------------------
export type FilaCola = {
  id: string;
  creado_en: string;
  motivos_revision: string[] | null;
  candidatos: {
    nombre: string;
    apellido: string;
    email: string;
    linkedin_url: string;
    especialidad: string;
    usa_revit: boolean;
    seniority: string;
    nivel_ingles: string;
    es_prioritario: boolean;
    cv_url: string | null;
  } | null;
  referentes: { nombre: string; apellido: string; email: string } | null;
};

export type CasoRevision = {
  id: string;
  creadoEn: string;
  diasHabiles: number;
  vencido: boolean;
  motivos: string[];
  candidato: {
    nombreCompleto: string;
    email: string;
    linkedin: string | null;
    especialidad: string;
    usaRevit: boolean;
    seniority: string;
    nivelIngles: string;
    esPrioritario: boolean;
  };
  referente: { nombreCompleto: string; email: string };
  /** El link al CV se pide al hacer clic (`/panel/cv/<id>`); acá solo se sabe si hay uno. La ruta del archivo no sale del servidor. */
  tieneCv: boolean;
};

/** Solo se enlazan perfiles de LinkedIn https: el dato viene de la base, pero la pantalla no confía en él. */
export function linkedinSeguro(url: string | null | undefined): string | null {
  return typeof url === "string" && /^https:\/\/([a-z0-9-]+\.)?linkedin\.com\/(in|pub)\/[^\s]+$/i.test(url) ? url : null;
}

/** Más viejos primero; una fila sin candidato o sin referente (no debería pasar) se descarta en vez de mostrarse a medias. */
export function armarCola(filas: FilaCola[], ahora: Date, cfg: ConfigPanel): CasoRevision[] {
  return filas
    .filter((f) => f.candidatos && f.referentes)
    .map((f) => {
      const c = f.candidatos!;
      const r = f.referentes!;
      const diasHabiles = diasHabilesTranscurridos(f.creado_en, ahora, cfg.zona);
      return {
        id: f.id,
        creadoEn: f.creado_en,
        diasHabiles,
        vencido: superaPlazo(diasHabiles, cfg.plazoRevisionDias),
        motivos: f.motivos_revision ?? [],
        candidato: {
          nombreCompleto: `${c.nombre} ${c.apellido}`.trim(),
          email: c.email,
          linkedin: linkedinSeguro(c.linkedin_url),
          especialidad: c.especialidad,
          usaRevit: c.usa_revit,
          seniority: c.seniority,
          nivelIngles: c.nivel_ingles,
          esPrioritario: c.es_prioritario,
        },
        referente: { nombreCompleto: `${r.nombre} ${r.apellido}`.trim(), email: r.email },
        tieneCv: Boolean(c.cv_url),
      } satisfies CasoRevision;
    })
    .sort((a, b) => a.creadoEn.localeCompare(b.creadoEn));
}

// ---------------------------------------------------------------------------------------------------------------
// Talent pool
// ---------------------------------------------------------------------------------------------------------------
export type FilaPool = {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  especialidad: string;
  origen: string;
  creado_en: string;
  referidos: { id?: string; estado: string; creado_en: string; referentes: { nombre: string; apellido: string } | null }[] | null;
};

export type CandidatoPool = {
  id: string;
  nombreCompleto: string;
  email: string;
  especialidad: string;
  creadoEn: string;
  /** null = candidato directo, sin referido. */
  estado: EstadoReferido | null;
  /** Id del referido que se muestra (el más reciente): es lo que recibe `resolver_referido` al reabrir. */
  referidoId: string | null;
  referente: string | null;
};

/** Una fila por candidato: si trae varios referidos, el más reciente. */
export function armarPool(filas: FilaPool[]): CandidatoPool[] {
  return filas.map((f) => {
    const ultimo = [...(f.referidos ?? [])].sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0];
    const estado = (estadosReferido as readonly string[]).includes(ultimo?.estado ?? "") ? (ultimo!.estado as EstadoReferido) : null;
    return {
      id: f.id,
      nombreCompleto: `${f.nombre} ${f.apellido}`.trim(),
      email: f.email,
      especialidad: f.especialidad,
      creadoEn: f.creado_en,
      estado,
      referidoId: ultimo?.id ?? null,
      referente: ultimo?.referentes ? `${ultimo.referentes.nombre} ${ultimo.referentes.apellido}`.trim() : null,
    };
  });
}

/** Ruta de un CV en el bucket: `<uuid>.pdf`, nada más. Cualquier otra forma no se firma. */
export function rutaCvValida(ruta: string | null | undefined): ruta is string {
  return typeof ruta === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.pdf$/i.test(ruta);
}

export const esUuid = (valor: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
