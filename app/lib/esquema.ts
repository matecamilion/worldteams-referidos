import { z } from "zod";
import es from "@/i18n/es.json";
import { config } from "./config";

const e = es.formulario.errores;
const mensajeCvPeso = e.cvPeso.replace("{mb}", String(config.cvMaxMb));
const cvPesoMax = config.cvMaxMb * 1024 * 1024;

export const especialidades = ["arquitectura", "ingenieria"] as const;
export const siNo = ["si", "no"] as const;
export const seniorities = ["junior", "semi_senior", "senior"] as const;
export const nivelesIngles = ["basico", "intermedio", "avanzado", "nativo"] as const;

/** Acepta "linkedin.com/in/x", "www.linkedin.com/in/x" o la URL completa. */
export function normalizarLinkedin(valor: string): string | null {
  const limpio = valor.trim();
  if (!limpio) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(limpio) ? limpio : `https://${limpio}`);
    const host = url.hostname.toLowerCase();
    const esLinkedin = host === "linkedin.com" || host.endsWith(".linkedin.com");
    const segmentos = url.pathname.split("/").filter(Boolean);
    if (!esLinkedin || !["in", "pub"].includes(segmentos[0]) || !segmentos[1]) return null;
    return `https://www.linkedin.com/in/${segmentos[1].toLowerCase()}`;
  } catch {
    return null;
  }
}

export const esquemaCandidato = z.object({
  nombre: z.string().trim().min(2, e.nombre).max(80, e.nombre),
  apellido: z.string().trim().min(2, e.apellido).max(80, e.apellido),
  email: z.string().trim().toLowerCase().max(254, e.email).pipe(z.email(e.email)),
  linkedin_url: z
    .string()
    .trim()
    .min(1, e.requerido)
    .refine((v) => normalizarLinkedin(v) !== null, e.linkedin),
  especialidad: z.enum(especialidades, { error: e.opcion }),
  usa_revit: z.enum(siNo, { error: e.opcion }),
  seniority: z.enum(seniorities, { error: e.opcion }),
  nivel_ingles: z.enum(nivelesIngles, { error: e.opcion }),
  cv: z
    .custom<File>((v) => typeof File !== "undefined" && v instanceof File, e.cvFaltante)
    .refine((f) => /\.pdf$/i.test(f.name) && (f.type === "application/pdf" || f.type === ""), e.cvTipo)
    .refine((f) => f.size <= cvPesoMax, mensajeCvPeso),
  acepto_visibilidad: z.literal(true, { error: e.visibilidad }),
});

export type DatosCandidato = z.infer<typeof esquemaCandidato>;
