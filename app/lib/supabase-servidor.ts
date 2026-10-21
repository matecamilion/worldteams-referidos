import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase para código que corre en el servidor de Next (nunca en el navegador).
 * Usa solo la clave anónima, que es pública: la service role es exclusiva de n8n (CLAUDE.md, regla 7).
 * Lo que el rol anónimo puede hacer lo decide la base con RLS y funciones; acá no hay ningún permiso extra.
 */
export function crearClienteServidor() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Si Supabase no responde, la página muestra "no disponible" en vez de quedarse colgada.
    global: { fetch: (entrada, opciones) => fetch(entrada, { ...opciones, signal: AbortSignal.timeout(8000) }) },
  });
}
