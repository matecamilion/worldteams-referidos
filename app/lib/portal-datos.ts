import type { ClienteSesion } from "./supabase-sesion";
import {
  armarPremios,
  armarProgreso,
  armarReferidos,
  type FilaMovimiento,
  type FilaProgreso,
  type FilaReferido,
  type Premios,
  type Progreso,
  type Referido,
} from "./portal";
import { sitio } from "./sitio";

export type VistaPortal = {
  nombre: string;
  codigo: string;
  /** Como se muestra: sin protocolo. */
  link: string;
  /** Lo que se copia: con https, para que se pueda pegar en cualquier chat. */
  urlCompleta: string;
  referidos: Referido[];
  premios: Premios;
  progreso: Progreso;
};

export type ResultadoPortal = { ok: true; vista: VistaPortal } | { ok: false };

/**
 * Lee lo que muestra el portal con la sesión del referente: sus referidos (vista `v_mis_referidos`), su progreso
 * (`v_progreso_referente`) y sus movimientos de pago. Es solo lectura y todo filtrado por RLS: aunque se pidiera
 * otro id, la base no devolvería filas ajenas. Si cualquiera de las tres lecturas falla, no se muestra nada a medias.
 */
export async function cargarPortal(
  supabase: ClienteSesion,
  referente: { id: string; nombre: string; apellido: string; codigo_referido: string },
): Promise<ResultadoPortal> {
  const [referidos, progreso, movimientos] = await Promise.all([
    supabase.from("v_mis_referidos").select("referido_id, nombre, apellido, estado_visible, creado_en"),
    supabase
      .from("v_progreso_referente")
      .select("validados_anio, proximo_hito, proximo_bono_usd, faltan")
      .eq("referente_id", referente.id)
      .maybeSingle(),
    supabase
      .from("movimientos_pago")
      .select("id, concepto, hito_umbral, monto_usd, estado, ciclo_pago, pagado_en, creado_en")
      .eq("referente_id", referente.id),
  ]);
  const fallo = referidos.error ?? progreso.error ?? movimientos.error;
  if (fallo) {
    console.error("[portal] No se pudo leer la información:", fallo.message);
    return { ok: false };
  }
  return {
    ok: true,
    vista: {
      nombre: referente.nombre,
      codigo: referente.codigo_referido,
      link: `${sitio.host}/r/${referente.codigo_referido}`,
      urlCompleta: `${sitio.url}/r/${referente.codigo_referido}`,
      referidos: armarReferidos((referidos.data ?? []) as FilaReferido[]),
      premios: armarPremios((movimientos.data ?? []) as FilaMovimiento[]),
      progreso: armarProgreso(progreso.data as FilaProgreso | null),
    },
  };
}
