import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Primera barrera de /portal y /panel: refresca la sesión (las cookies de Supabase caducan) y manda a /ingresar a
 * quien no tiene ninguna. Es una comprobación optimista; la autorización de verdad (rol y datos) la hace cada
 * página en el servidor con `exigirRol` y la RLS de la base. Si faltan las variables de Supabase no hace nada
 * y las páginas muestran "no disponible".
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) return NextResponse.next();

  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(url, clave, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(lista) {
        for (const { name, value } of lista) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of lista) respuesta.cookies.set(name, value, options);
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user) return NextResponse.redirect(new URL("/ingresar", request.url));
  return respuesta;
}

export const config = { matcher: ["/portal/:path*", "/panel/:path*"] };
