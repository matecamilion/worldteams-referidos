import es from "@/i18n/es.json";

type Vars = Record<string, string | number>;

/** Lee un texto por ruta ("formulario.campos.nombre.label") y reemplaza {variables}. */
export function t(ruta: string, vars: Vars = {}): string {
  const valor = ruta.split(".").reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], es);
  if (typeof valor !== "string") throw new Error(`Falta el texto i18n: ${ruta}`);
  return valor.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}
