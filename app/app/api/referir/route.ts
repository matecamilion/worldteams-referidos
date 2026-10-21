import { NextResponse } from "next/server";
import es from "@/i18n/es.json";
import { emailFallaDemo, emailYaRegistradoDemo } from "@/lib/demo-data";
import { esDemo } from "@/lib/demo";
import { esquemaCandidato, normalizarLinkedin } from "@/lib/esquema";
import { ipDelCliente } from "@/lib/limite";
import { consultarReferente } from "@/lib/referentes";

/**
 * Decisión 29: el navegador solo habla con esta ruta. Acá se verifica reCAPTCHA y se
 * reenvía a n8n; la URL del webhook y los secretos nunca llegan al cliente.
 *
 * Respuesta (contrato con el flujo de n8n):
 *   200 { resultado: "registrado" | "ya_registrado" }
 *   404 { resultado: "codigo_invalido" }
 *   422 { resultado: "datos_invalidos", errores: { campo: mensaje } }
 *   429 { resultado: "error", mensaje }  (demasiados códigos inválidos desde la misma IP)
 *   4xx/5xx { resultado: "error", mensaje }
 */
export type RespuestaReferir =
  | { resultado: "registrado" | "ya_registrado" }
  | { resultado: "codigo_invalido" }
  | { resultado: "datos_invalidos"; errores: Record<string, string> }
  | { resultado: "error"; mensaje: string };

const errores = es.formulario.errores;
const PDF_MAGIC = "%PDF";

function responder(cuerpo: RespuestaReferir, status = 200) {
  return NextResponse.json(cuerpo, { status });
}

async function verificarRecaptcha(token: string | null): Promise<"ok" | "falla"> {
  const secreto = process.env.RECAPTCHA_SECRET_KEY;
  if (!secreto || !token) return "falla";
  const minimo = Number(process.env.RECAPTCHA_MIN_SCORE ?? "0.5");
  try {
    const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      body: new URLSearchParams({ secret: secreto, response: token }),
    });
    const j = (await r.json()) as { success?: boolean; score?: number; action?: string };
    return j.success && (j.score ?? 0) >= minimo && j.action === "referir" ? "ok" : "falla";
  } catch {
    return "falla";
  }
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return responder({ resultado: "error", mensaje: errores.servidor }, 400);
  }

  const consulta = await consultarReferente(String(form.get("codigo_referente") ?? ""), ipDelCliente(request.headers));
  if (consulta.tipo === "bloqueada") return responder({ resultado: "error", mensaje: errores.demasiados }, 429);
  if (consulta.tipo === "no_existe") return responder({ resultado: "codigo_invalido" }, 404);
  const { referente } = consulta;

  const crudo = {
    nombre: form.get("nombre") ?? "",
    apellido: form.get("apellido") ?? "",
    email: form.get("email") ?? "",
    linkedin_url: form.get("linkedin_url") ?? "",
    especialidad: form.get("especialidad"),
    usa_revit: form.get("usa_revit"),
    seniority: form.get("seniority"),
    nivel_ingles: form.get("nivel_ingles"),
    cv: form.get("cv") ?? undefined,
    acepto_visibilidad: form.get("acepto_visibilidad") === "true",
  };
  const parseo = esquemaCandidato.safeParse(crudo);
  if (!parseo.success) {
    const porCampo: Record<string, string> = {};
    for (const issue of parseo.error.issues) {
      const campo = String(issue.path[0] ?? "formulario");
      porCampo[campo] ??= issue.message;
    }
    return responder({ resultado: "datos_invalidos", errores: porCampo }, 422);
  }
  const datos = parseo.data;

  // El tipo declarado lo controla el cliente: se confirma con la firma del archivo.
  const cabecera = new TextDecoder().decode(await datos.cv.slice(0, 4).arrayBuffer());
  if (cabecera !== PDF_MAGIC) {
    return responder({ resultado: "datos_invalidos", errores: { cv: errores.cvTipo } }, 422);
  }

  if (esDemo) {
    // Responde como si n8n hubiera procesado el registro.
    await new Promise((r) => setTimeout(r, 900));
    if (datos.email === emailFallaDemo) {
      return responder({ resultado: "error", mensaje: errores.servidor }, 502);
    }
    return responder({ resultado: datos.email === emailYaRegistradoDemo ? "ya_registrado" : "registrado" });
  }

  const captcha = await verificarRecaptcha(String(form.get("recaptcha_token") ?? "") || null);
  if (captcha === "falla") return responder({ resultado: "error", mensaje: errores.captcha }, 403);

  const webhook = process.env.N8N_WEBHOOK_URL;
  if (!webhook) {
    console.error("[referir] Falta N8N_WEBHOOK_URL");
    return responder({ resultado: "error", mensaje: errores.servidor }, 500);
  }

  const salida = new FormData();
  salida.set("codigo_referente", referente.codigo);
  for (const campo of ["nombre", "apellido", "email", "especialidad", "usa_revit", "seniority", "nivel_ingles"] as const) {
    salida.set(campo, datos[campo]);
  }
  salida.set("linkedin_url", normalizarLinkedin(datos.linkedin_url) ?? datos.linkedin_url);
  salida.set("acepto_visibilidad", "true");
  salida.set("cv", datos.cv, datos.cv.name);

  try {
    const r = await fetch(webhook, {
      method: "POST",
      body: salida,
      headers: process.env.N8N_WEBHOOK_SECRET ? { "x-webhook-secret": process.env.N8N_WEBHOOK_SECRET } : {},
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) throw new Error(`n8n respondió ${r.status}`);
    const j = (await r.json()) as Partial<RespuestaReferir>;
    if (j.resultado === "registrado" || j.resultado === "ya_registrado") return responder({ resultado: j.resultado });
    if (j.resultado === "codigo_invalido") return responder({ resultado: "codigo_invalido" }, 404);
    throw new Error("Respuesta inesperada de n8n");
  } catch (err) {
    console.error("[referir]", err);
    return responder({ resultado: "error", mensaje: errores.servidor }, 502);
  }
}
