"use server";

import { notFound, redirect } from "next/navigation";
import { leerEntrada, urlConAviso, type CodigoAviso, type CodigoError, type EstadoResolver } from "@/lib/resolver";

/**
 * Acción de mentira para /dev/panel (solo desarrollo): valida igual que la real pero no llama a la base, así se
 * pueden probar los botones, los diálogos y todos los avisos sin gastar casos. Para ver cada mensaje, escribí
 * en el motivo (de Rechazar o Reabrir) una de estas palabras: sin_permiso, ya_resuelto, estado_invalido, generico.
 * Aprobar al caso de Mariana Sousa (el último de la cola) simula un referente sancionado: sin pago.
 */
export async function resolverCasoDemo(_previo: EstadoResolver, formData: FormData): Promise<EstadoResolver> {
  if (process.env.NODE_ENV === "production") notFound();
  const leida = leerEntrada(formData);
  const motivoEscrito = typeof formData.get("motivo") === "string" ? (formData.get("motivo") as string) : "";
  if (!leida.ok) return { error: leida.error, motivo: motivoEscrito };
  const { entrada } = leida;
  await new Promise((r) => setTimeout(r, 600)); // se nota el estado "Guardando…"

  const pedido = (entrada.motivo ?? "").toLowerCase();
  if (pedido === "sin_permiso" || pedido === "generico") return { error: pedido as CodigoError, motivo: motivoEscrito };
  const base = { cola: "/dev/panel", pool: "/dev/panel/pool" };
  if (pedido === "ya_resuelto" || pedido === "estado_invalido") redirect(urlConAviso(entrada, { codigo: pedido as CodigoAviso, montoUsd: null }, base));

  if (entrada.decision === "rechazar") redirect(urlConAviso(entrada, { codigo: "rechazado", montoUsd: null }, base));
  if (entrada.decision === "reabrir") redirect(urlConAviso(entrada, { codigo: "reabierto", montoUsd: null }, base));
  const sinPago = entrada.referido.endsWith("13");
  redirect(urlConAviso(entrada, sinPago ? { codigo: "aprobado_sin_pago", montoUsd: null } : { codigo: "aprobado", montoUsd: 50 }, base));
}
