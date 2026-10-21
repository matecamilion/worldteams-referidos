"use server";

import { headers } from "next/headers";
import { emailHabilitado } from "@/lib/habilitacion";
import { solicitarIngreso, type ResultadoIngreso } from "@/lib/ingreso";
import { limitesIngreso } from "@/lib/limite-ingreso";
import { ipDelCliente } from "@/lib/limite";
import { sitio } from "@/lib/sitio";
import { crearClienteSesion, supabaseConfigurado } from "@/lib/supabase-sesion";

export type EstadoIngreso = { resultado: ResultadoIngreso | null; email: string };

/** Tiempo mínimo de respuesta: iguala (a grandes rasgos) el caso habilitado, que además manda el mail, con el que no. */
const RESPUESTA_MINIMA_MS = 900;

/** Dirección desde la que se pidió el link: el magic link vuelve a ese mismo sitio (Supabase solo acepta las de su lista). */
function origenDelPedido(h: Headers): string {
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return sitio.url;
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Server action de /ingresar. Siempre contra Supabase real (no depende de n8n ni de NEXT_PUBLIC_DEMO).
 * Si el email está habilitado manda el magic link por Supabase Auth; si no, no manda nada. La respuesta es la misma.
 */
export async function pedirLink(_anterior: EstadoIngreso, formData: FormData): Promise<EstadoIngreso> {
  const inicio = Date.now();
  const emailCrudo = String(formData.get("email") ?? "");
  const h = await headers();

  let resultado: ResultadoIngreso;
  if (!supabaseConfigurado()) {
    resultado = "no_disponible";
  } else {
    resultado = await solicitarIngreso(emailCrudo, ipDelCliente(h), {
      emailHabilitado,
      permitirIp: (ip) => limitesIngreso.porIp.permitir(ip),
      permitirEmail: (email) => limitesIngreso.porEmail.permitir(email),
      enviarLink: async (email) => {
        const supabase = await crearClienteSesion();
        const { error } = await supabase.auth.signInWithOtp({
          email,
          // La base ya confirmó que está habilitado: el usuario de Auth se crea la primera vez que entra.
          options: { emailRedirectTo: `${origenDelPedido(h)}/auth/callback`, shouldCreateUser: true },
        });
        if (error) throw error;
      },
    });
  }

  const restante = RESPUESTA_MINIMA_MS - (Date.now() - inicio);
  if (restante > 0) await new Promise((r) => setTimeout(r, restante));
  return { resultado, email: emailCrudo.trim() };
}
