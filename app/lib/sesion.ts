import { redirect } from "next/navigation";
import { decidirRol, resolverAcceso, type Rol, type RolRequerido } from "./roles";
import { crearClienteSesion, supabaseConfigurado, type ClienteSesion } from "./supabase-sesion";

export type ReferenteSesion = { id: string; nombre: string; apellido: string; codigo_referido: string };

export type Sesion =
  | { tipo: "no_disponible" }
  | { tipo: "error" }
  | { tipo: "anonima" }
  | { tipo: "activa"; supabase: ClienteSesion; email: string; rol: Rol; referente: ReferenteSesion | null };

/**
 * Quién es y qué rol tiene, comprobado en el servidor: `getUser()` valida el token con Auth (no confía en la cookie)
 * y el rol sale de funciones y filas que la propia RLS le deja ver a esa persona.
 */
export async function leerSesion(): Promise<Sesion> {
  if (!supabaseConfigurado()) return { tipo: "no_disponible" };
  // Fuera del try: `cookies()` marca la página como dinámica lanzando una señal que no hay que atrapar.
  const supabase = await crearClienteSesion();
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      // Sin sesión (o sesión vencida) no es un error: simplemente no entró.
      return !error || error.name === "AuthSessionMissingError" || error.status === 401 || error.status === 403 ? { tipo: "anonima" } : { tipo: "error" };
    }
    const email = data.user.email ?? "";

    const [recl, ref] = await Promise.all([supabase.rpc("es_reclutamiento"), supabase.rpc("referente_actual_id")]);
    if (recl.error || ref.error) {
      console.error("[sesion] No se pudo resolver el rol:", recl.error?.message ?? ref.error?.message);
      return { tipo: "error" };
    }

    let referente: (ReferenteSesion & { colocado: boolean; sancionado_en: string | null }) | null = null;
    if (!recl.data && ref.data) {
      // Se pide por id (el que devolvió la base para esta sesión) además de lo que filtra la RLS.
      const fila = await supabase
        .from("referentes")
        .select("id, nombre, apellido, codigo_referido, colocado, sancionado_en")
        .eq("id", ref.data as string)
        .maybeSingle();
      if (fila.error) {
        console.error("[sesion] No se pudo leer el referente:", fila.error.message);
        return { tipo: "error" };
      }
      referente = fila.data;
    }

    const rol = decidirRol({ esReclutamiento: recl.data === true, referente });
    return {
      tipo: "activa",
      supabase,
      email,
      rol,
      referente: rol === "referente" && referente ? { id: referente.id, nombre: referente.nombre, apellido: referente.apellido, codigo_referido: referente.codigo_referido } : null,
    };
  } catch (err) {
    console.error("[sesion] Error al leer la sesión:", err instanceof Error ? err.message : err);
    return { tipo: "error" };
  }
}

export type AccesoRuta =
  | { estado: "mostrar"; sesion: Extract<Sesion, { tipo: "activa" }> }
  | { estado: "no_habilitado"; email: string }
  | { estado: "no_disponible" }
  | { estado: "error" };

/**
 * Guardia de las rutas protegidas, del lado del servidor: sin sesión va a /ingresar y con otro rol va a su página.
 * Cada página la llama antes de leer cualquier dato, así que no depende del proxy ni de código del navegador.
 */
export async function exigirRol(requerido: RolRequerido): Promise<AccesoRuta> {
  const sesion = await leerSesion();
  if (sesion.tipo === "no_disponible") return { estado: "no_disponible" };
  if (sesion.tipo === "error") return { estado: "error" };
  const acceso = resolverAcceso(requerido, sesion.tipo === "activa" ? sesion.rol : null);
  if (acceso.accion === "redirigir") redirect(acceso.a);
  if (acceso.accion === "no_habilitado") return { estado: "no_habilitado", email: sesion.tipo === "activa" ? sesion.email : "" };
  return { estado: "mostrar", sesion: sesion as Extract<Sesion, { tipo: "activa" }> };
}
