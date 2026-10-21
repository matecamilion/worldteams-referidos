import { sitio } from "./sitio";

/**
 * Verificación de reCAPTCHA v3 en el servidor (decisión 50). Distingue tres cosas para que la pantalla pueda decir
 * qué pasó: la persona no pasó (`rechazado`), el token ya no sirve (`vencido`) o no se pudo preguntar a Google
 * (`no_disponible`). Solo `rechazado` es un posible bot; las otras dos se reintentan.
 */
export type ResultadoRecaptcha =
  | { tipo: "ok" }
  | { tipo: "rechazado"; motivo: "sin_token" | "puntaje" | "accion" | "dominio" | "token" }
  | { tipo: "vencido" }
  | { tipo: "no_disponible" };

type RespuestaGoogle = {
  success?: boolean;
  score?: number;
  action?: string;
  hostname?: string;
  "error-codes"?: string[];
};

export type OpcionesRecaptcha = {
  secreto?: string;
  puntajeMinimo?: number;
  accion: string;
  /** Dominios aceptados en la respuesta de Google. */
  hostnames: string[];
  fetchFn?: typeof fetch;
  timeoutMs?: number;
};

const PUNTAJE_POR_DEFECTO = 0.5;

/** `RECAPTCHA_MIN_SCORE` mal escrito no debe dejar pasar a todos: se usa el valor por defecto. */
export function leerPuntajeMinimo(valor: string | undefined): number {
  const n = Number(valor);
  return valor && Number.isFinite(n) && n >= 0 && n <= 1 ? n : PUNTAJE_POR_DEFECTO;
}

/** Nuestro dominio (el del sitio) y, solo fuera de producción, localhost. */
export function hostnamesPermitidos(): string[] {
  const propio = sitio.host.split(":")[0];
  return process.env.NODE_ENV === "production" ? [propio] : [propio, "localhost"];
}

export async function verificarRecaptcha(token: string | null, o: OpcionesRecaptcha): Promise<ResultadoRecaptcha> {
  if (!o.secreto) {
    console.error("[recaptcha] Falta RECAPTCHA_SECRET_KEY");
    return { tipo: "no_disponible" };
  }
  if (!token) return { tipo: "rechazado", motivo: "sin_token" };

  let j: RespuestaGoogle;
  try {
    const r = await (o.fetchFn ?? fetch)("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: o.secreto, response: token }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 5000),
    });
    if (!r.ok) throw new Error(`Google respondió ${r.status}`);
    j = (await r.json()) as RespuestaGoogle;
  } catch (err) {
    console.error("[recaptcha] No se pudo consultar a Google:", err instanceof Error ? err.message : err);
    return { tipo: "no_disponible" };
  }

  if (!j.success) {
    const codigos = j["error-codes"] ?? [];
    if (codigos.includes("timeout-or-duplicate")) return { tipo: "vencido" };
    // Una clave secreta mal cargada es un problema nuestro, no de la persona.
    if (codigos.includes("missing-input-secret") || codigos.includes("invalid-input-secret")) {
      console.error("[recaptcha] Google rechazó la clave secreta:", codigos.join(","));
      return { tipo: "no_disponible" };
    }
    return { tipo: "rechazado", motivo: "token" };
  }
  if (j.action !== o.accion) return { tipo: "rechazado", motivo: "accion" };
  if (!j.hostname || !o.hostnames.includes(j.hostname)) return { tipo: "rechazado", motivo: "dominio" };
  if ((j.score ?? 0) < (o.puntajeMinimo ?? PUNTAJE_POR_DEFECTO)) return { tipo: "rechazado", motivo: "puntaje" };
  return { tipo: "ok" };
}
