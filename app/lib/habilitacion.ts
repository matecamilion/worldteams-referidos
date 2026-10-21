import type { Rol } from "./roles";
import { crearClienteServidor } from "./supabase-servidor";

export type Habilitacion = Rol | "no_disponible";

/**
 * ¿Puede este email entrar? Pregunta a la función `email_habilitado` de la base con el secreto de aplicación
 * (variable de servidor, el mismo de la consulta de códigos). Devuelve solo el rol: la app no lee las listas.
 * Si la base no responde, falta el secreto o no coincide, devuelve `no_disponible` (nunca "habilitado").
 * Va siempre contra Supabase real, aunque NEXT_PUBLIC_DEMO sea true.
 */
export async function emailHabilitado(email: string): Promise<Habilitacion> {
  const secreto = process.env.SUPABASE_CONSULTA_SECRETO;
  if (!secreto) {
    console.error("[ingreso] Falta SUPABASE_CONSULTA_SECRETO");
    return "no_disponible";
  }
  try {
    const { data, error } = await crearClienteServidor().rpc("email_habilitado", { p_email: email, p_secreto: secreto });
    if (error) {
      console.error("[ingreso] La base no respondió como se esperaba:", error.message);
      return "no_disponible";
    }
    if (data === "referente" || data === "reclutamiento" || data === "ninguno") return data;
    // `no_autorizado`: el secreto de la app no coincide con el de la base. Es un error de configuración.
    console.error("[ingreso] La base no reconoce el secreto de la aplicación (respuesta:", String(data) + ")");
    return "no_disponible";
  } catch (err) {
    console.error("[ingreso] Error al consultar la base:", err instanceof Error ? err.message : err);
    return "no_disponible";
  }
}
