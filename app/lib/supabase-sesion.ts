import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** ¿Están las variables públicas de Supabase? Sin ellas el login y el portal muestran "no disponible" y la landing sigue andando. */
export function supabaseConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/**
 * Cliente de Supabase con la sesión de quien navega (cookies, @supabase/ssr). Usa solo la clave anónima: lo que
 * la persona puede leer lo decide la base con RLS según su JWT. Nunca la service role (CLAUDE.md, regla 7).
 * Siempre es Supabase real, aunque NEXT_PUBLIC_DEMO sea true: el login no pasa por n8n.
 */
export async function crearClienteSesion() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const almacen = await cookies();
  return createServerClient(url, clave, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll(lista) {
        try {
          for (const { name, value, options } of lista) almacen.set(name, value, options);
        } catch {
          // Desde un Server Component no se pueden escribir cookies: el proxy ya refresca la sesión en cada pedido.
        }
      },
    },
    // Si Supabase no responde, la página muestra un error en vez de quedarse colgada.
    global: { fetch: (entrada, opciones) => fetch(entrada, { ...opciones, signal: AbortSignal.timeout(8000) }) },
  });
}

export type ClienteSesion = Awaited<ReturnType<typeof crearClienteSesion>>;
