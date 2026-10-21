import { referentesDemo, type Referente } from "./demo-data";
import { esDemo } from "./demo";

/** Busca al referente dueño de un código. Devuelve null si no existe. */
export async function buscarReferente(codigo: string): Promise<Referente | null> {
  if (esDemo) {
    return referentesDemo.find((r) => r.codigo === codigo.toLowerCase()) ?? null;
  }
  // Tarea 2 (base de datos): leer `referentes` por codigo_referido, solo colocados.
  throw new Error("Lectura de referentes desde Supabase pendiente (PLAN.md, tarea 2)");
}
