import { referentesDemo, type Referente } from "./demo-data";
import { esDemo } from "./demo";
import { tieneFormatoDeCodigo } from "./codigo";
import { limitadorConsultas } from "./limite";
import { crearClienteServidor } from "./supabase-servidor";

export type Consulta =
  | { tipo: "ok"; referente: Referente }
  | { tipo: "no_existe" }
  | { tipo: "bloqueada" }
  | { tipo: "no_disponible" };

type FilaConsulta = { estado: string; nombre: string | null; apellido: string | null; codigo_referido: string | null };

/**
 * Consulta de un código desde la web (decisión 41).
 *  - Demo: busca en los datos de ejemplo y aplica el límite por IP en memoria.
 *  - Real: llama a la función `consultar_referente_por_codigo` de la base con la IP del usuario final y el secreto
 *    de aplicación (variable de servidor, nunca llega al navegador). La base descarta formatos inválidos, cuenta los
 *    códigos inexistentes por IP y bloquea al pasar el tope; con la IP bloqueada ni un código válido responde.
 * Si la base no responde o el secreto no coincide devuelve `no_disponible` (no es "link inexistente").
 */
export async function consultarReferente(codigo: string, ip: string): Promise<Consulta> {
  const normalizado = codigo.trim().toLowerCase();
  return esDemo ? consultarDemo(normalizado, ip) : consultarEnSupabase(normalizado, ip);
}

async function consultarDemo(codigo: string, ip: string): Promise<Consulta> {
  if (limitadorConsultas.bloqueada(ip)) return { tipo: "bloqueada" };
  const referente = tieneFormatoDeCodigo(codigo) ? (referentesDemo.find((r) => r.codigo === codigo) ?? null) : null;
  if (!referente) {
    limitadorConsultas.registrarFallo(ip, codigo);
    return { tipo: "no_existe" };
  }
  return { tipo: "ok", referente };
}

async function consultarEnSupabase(codigo: string, ip: string): Promise<Consulta> {
  const secreto = process.env.SUPABASE_CONSULTA_SECRETO;
  if (!secreto) {
    console.error("[consulta] Falta SUPABASE_CONSULTA_SECRETO");
    return { tipo: "no_disponible" };
  }
  try {
    const { data, error } = await crearClienteServidor().rpc("consultar_referente_por_codigo", {
      p_codigo: codigo,
      p_ip: ip,
      p_secreto: secreto,
    });
    const fila = (data as FilaConsulta[] | null)?.[0];
    if (error || !fila) {
      console.error("[consulta] La base no respondió como se esperaba:", error?.message ?? "sin filas");
      return { tipo: "no_disponible" };
    }
    switch (fila.estado) {
      case "ok":
        if (!fila.nombre || !fila.apellido || !fila.codigo_referido) return { tipo: "no_disponible" };
        return { tipo: "ok", referente: { codigo: fila.codigo_referido, nombre: fila.nombre, apellido: fila.apellido } };
      case "no_existe":
        return { tipo: "no_existe" };
      case "bloqueada":
        return { tipo: "bloqueada" };
      default:
        // `no_autorizado`: el secreto de la app no coincide con el de la base. Es un error de configuración, no del usuario.
        console.error("[consulta] La base no reconoce el secreto de la aplicación (estado:", fila.estado + ")");
        return { tipo: "no_disponible" };
    }
  } catch (err) {
    console.error("[consulta] Error al consultar la base:", err instanceof Error ? err.message : err);
    return { tipo: "no_disponible" };
  }
}
