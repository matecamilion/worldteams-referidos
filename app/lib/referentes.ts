import { referentesDemo, type Referente } from "./demo-data";
import { esDemo } from "./demo";
import { tieneFormatoDeCodigo } from "./codigo";
import { limitadorConsultas } from "./limite";

/** Busca al referente dueño de un código. Devuelve null si no existe. */
export async function buscarReferente(codigo: string): Promise<Referente | null> {
  if (esDemo) {
    return referentesDemo.find((r) => r.codigo === codigo.toLowerCase()) ?? null;
  }
  // Tarea 2 (base de datos): leer `referentes` por codigo_referido, solo colocados.
  throw new Error("Lectura de referentes desde Supabase pendiente (PLAN.md, tarea 2)");
}

export type Consulta = { tipo: "ok"; referente: Referente } | { tipo: "no_existe" } | { tipo: "bloqueada" };

/**
 * Consulta de un código desde la web: descarta lo que no tiene formato, aplica el límite de intentos
 * fallidos por IP y cuenta como fallo cada código distinto que no existe. Con la IP bloqueada ni siquiera
 * un código válido responde, para que el barrido no pueda confirmar aciertos.
 */
export async function consultarReferente(codigo: string, ip: string): Promise<Consulta> {
  if (limitadorConsultas.bloqueada(ip)) return { tipo: "bloqueada" };
  const normalizado = codigo.trim().toLowerCase();
  const referente = tieneFormatoDeCodigo(normalizado) ? await buscarReferente(normalizado) : null;
  if (!referente) {
    limitadorConsultas.registrarFallo(ip, normalizado);
    return { tipo: "no_existe" };
  }
  return { tipo: "ok", referente };
}
