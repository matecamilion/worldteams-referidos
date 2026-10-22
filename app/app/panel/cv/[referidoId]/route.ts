import { NextResponse } from "next/server";
import { esUuid, rutaCvValida } from "@/lib/panel";
import { leerSesion } from "@/lib/sesion";

/** Vida del link firmado al CV: lo justo para abrirlo. */
const VIDA_LINK_SEGUNDOS = 60;

const sinCache = { "Cache-Control": "no-store" };
const respuesta = (status: number) => new NextResponse(null, { status, headers: sinCache });

/**
 * Link al CV de un caso, generado al hacer clic y no al armar la lista. Comprueba en el servidor que quien pide es
 * reclutamiento, lee la ruta con la RLS (un referente no ve `candidatos`), firma con el cliente de sesión (la policy
 * `cvs_lectura_reclutamiento` de storage) y redirige al archivo. La ruta del bucket nunca llega al navegador.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ referidoId: string }> }) {
  const { referidoId } = await params;
  if (!esUuid(referidoId)) return respuesta(404);

  const sesion = await leerSesion();
  if (sesion.tipo === "anonima") return respuesta(401);
  if (sesion.tipo !== "activa" || sesion.rol !== "reclutamiento") return sesion.tipo === "activa" ? respuesta(403) : respuesta(503);

  const { data, error } = await sesion.supabase.from("referidos").select("candidatos(cv_url)").eq("id", referidoId).maybeSingle();
  if (error) {
    console.error("[panel] No se pudo leer el CV del caso:", error.message);
    return respuesta(502);
  }
  const candidato = (data as unknown as { candidatos: { cv_url: string | null } | null } | null)?.candidatos;
  if (!candidato || !rutaCvValida(candidato.cv_url)) return respuesta(404);

  const firmado = await sesion.supabase.storage.from("cvs").createSignedUrl(candidato.cv_url, VIDA_LINK_SEGUNDOS);
  if (firmado.error || !firmado.data?.signedUrl) {
    console.error("[panel] No se pudo firmar el link al CV:", firmado.error?.message);
    return respuesta(502);
  }
  return NextResponse.redirect(firmado.data.signedUrl, { status: 302, headers: sinCache });
}
