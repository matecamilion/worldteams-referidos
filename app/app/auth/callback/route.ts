import { NextResponse, type NextRequest } from "next/server";
import { rutaPorRol } from "@/lib/roles";
import { leerSesion } from "@/lib/sesion";
import { crearClienteSesion, supabaseConfigurado } from "@/lib/supabase-sesion";

/**
 * Destino del magic link: cambia el código por la sesión (queda en cookies) y redirige según el rol que
 * confirma la base: referente a /portal, reclutamiento a /panel, y quien no está habilitado a /portal,
 * que le muestra el aviso sin datos. Si el link no sirve (vencido, usado o abierto en otro navegador),
 * vuelve a /ingresar con un aviso.
 */
export async function GET(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const fallido = () => NextResponse.redirect(new URL("/ingresar?error=enlace", origin));

  const codigo = searchParams.get("code");
  if (!codigo || !supabaseConfigurado()) return fallido();

  try {
    const { error } = await (await crearClienteSesion()).auth.exchangeCodeForSession(codigo);
    if (error) {
      console.error("[callback] No se pudo canjear el código:", error.message);
      return fallido();
    }
    const sesion = await leerSesion();
    if (sesion.tipo !== "activa") return fallido();
    return NextResponse.redirect(new URL(rutaPorRol(sesion.rol), origin));
  } catch (err) {
    console.error("[callback] Error al entrar:", err instanceof Error ? err.message : err);
    return fallido();
  }
}
