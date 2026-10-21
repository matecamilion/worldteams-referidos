import { z } from "zod";
import type { Habilitacion } from "./habilitacion";

/**
 * Resultado de pedir el magic link. `enviado` es idéntico para un email habilitado y para uno que no:
 * la pantalla nunca revela quién está en las listas.
 */
export type ResultadoIngreso = "enviado" | "email_invalido" | "limitado" | "no_disponible";

export type DependenciasIngreso = {
  emailHabilitado: (email: string) => Promise<Habilitacion>;
  enviarLink: (email: string) => Promise<void>;
  permitirIp: (ip: string) => boolean;
  permitirEmail: (email: string) => boolean;
};

const esquemaEmail = z.string().trim().toLowerCase().pipe(z.email().max(254));

/**
 * Pedido de ingreso: valida, aplica los límites, consulta si el email está habilitado y, solo si lo está,
 * manda el link. Los límites se aplican ANTES de consultar la base y cuentan todos los intentos.
 * Un error al mandar el link (por ejemplo el tope por hora de Supabase) no cambia la respuesta: distinguirlo
 * revelaría que el email estaba habilitado. Queda en el log del servidor.
 */
export async function solicitarIngreso(emailCrudo: string, ip: string, deps: DependenciasIngreso): Promise<ResultadoIngreso> {
  const email = esquemaEmail.safeParse(emailCrudo);
  // Los intentos con formato inválido también cuentan para la IP, así no sirven para sondear sin costo.
  const ipOk = deps.permitirIp(ip);
  if (!email.success) return ipOk ? "email_invalido" : "limitado";
  const emailOk = deps.permitirEmail(email.data);
  if (!ipOk || !emailOk) return "limitado";

  const habilitacion = await deps.emailHabilitado(email.data);
  if (habilitacion === "no_disponible") return "no_disponible";
  if (habilitacion === "ninguno") return "enviado";

  try {
    await deps.enviarLink(email.data);
  } catch (err) {
    console.error("[ingreso] No se pudo enviar el magic link:", err instanceof Error ? err.message : err);
  }
  return "enviado";
}
