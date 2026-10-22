"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { avisoDeResultado, codigoDeError, leerEntrada, leerRespuesta, urlConAviso, type EstadoResolver } from "./resolver";
import { leerSesion } from "./sesion";

/**
 * Aprobar, rechazar o reabrir un caso. Llama a `resolver_referido` con la sesión de la persona (clave anónima + JWT,
 * nunca la service role): quién puede hacerlo lo decide la base con `es_reclutamiento()`, no esta función ni el botón.
 * Si salió bien, o si el caso ya cambió (otra persona lo resolvió), vuelve a la página con un aviso y la lista nueva.
 * Si falta el motivo, no hay permiso o falló algo, deja el formulario abierto con el error.
 */
export async function resolverCaso(_previo: EstadoResolver, formData: FormData): Promise<EstadoResolver> {
  const leida = leerEntrada(formData);
  const motivoEscrito = typeof formData.get("motivo") === "string" ? (formData.get("motivo") as string) : "";
  if (!leida.ok) return { error: leida.error, motivo: motivoEscrito };
  const { entrada } = leida;

  const sesion = await leerSesion();
  if (sesion.tipo === "anonima") redirect("/ingresar");
  if (sesion.tipo !== "activa") return { error: "generico", motivo: motivoEscrito };

  const { data, error } = await sesion.supabase.rpc("resolver_referido", {
    p_referido: entrada.referido,
    p_decision: entrada.decision,
    p_motivo: entrada.motivo ?? undefined,
  });

  if (error) {
    const codigo = codigoDeError(error);
    if (codigo === "generico") console.error("[panel] resolver_referido falló:", error.code, error.message);
    // El caso ya no está como lo vio la persona: se recarga la lista y se le explica.
    if (codigo === "ya_resuelto" || codigo === "estado_invalido" || codigo === "referido_inexistente") {
      revalidatePath("/panel");
      revalidatePath("/panel/pool");
      redirect(urlConAviso(entrada, { codigo, montoUsd: null }));
    }
    return { error: codigo, motivo: motivoEscrito };
  }

  const respuesta = leerRespuesta(data);
  if (!respuesta) {
    console.error("[panel] resolver_referido devolvió algo inesperado");
    return { error: "generico", motivo: motivoEscrito };
  }
  revalidatePath("/panel");
  revalidatePath("/panel/pool");
  redirect(urlConAviso(entrada, avisoDeResultado(entrada.decision, respuesta)));
}
