import { config } from "./config";

/**
 * Límite de pedidos de magic link por clave (IP o email), en una ventana deslizante.
 * Cuenta TODOS los intentos, esté o no habilitado el email: así el límite no revela quién está en la lista.
 * Mismo criterio que `limitadorConsultas`: vive en memoria de cada instancia y frena el uso casual de /ingresar
 * para mandar mails en masa; el tope de envíos por hora de Supabase Auth es la segunda barrera.
 */
export function crearLimitadorIntentos({
  maximo,
  ventanaMs,
  ahora = Date.now,
}: {
  maximo: number;
  ventanaMs: number;
  ahora?: () => number;
}) {
  const intentos = new Map<string, number[]>();

  const vigentes = (clave: string) => {
    const desde = ahora() - ventanaMs;
    const marcas = (intentos.get(clave) ?? []).filter((m) => m > desde);
    if (marcas.length) intentos.set(clave, marcas);
    else intentos.delete(clave);
    return marcas;
  };

  return {
    /** Registra el intento y dice si entra dentro del tope. Un intento rechazado no suma. */
    permitir(clave: string): boolean {
      const marcas = vigentes(clave);
      if (marcas.length >= maximo) return false;
      marcas.push(ahora());
      intentos.set(clave, marcas);
      // Evita que el mapa crezca sin límite ante un barrido desde muchas IP o emails.
      if (intentos.size > 10_000) for (const k of [...intentos.keys()]) vigentes(k);
      return true;
    },
  };
}

/** Una instancia por proceso, compartida por todas las rutas (mismo motivo que `limitadorConsultas`). */
const global = globalThis as typeof globalThis & {
  __limitesIngreso?: { porIp: ReturnType<typeof crearLimitadorIntentos>; porEmail: ReturnType<typeof crearLimitadorIntentos> };
};
export const limitesIngreso = (global.__limitesIngreso ??= {
  porIp: crearLimitadorIntentos({
    maximo: config.limiteIngreso.intentosPorIp,
    ventanaMs: config.limiteIngreso.ventanaSegundos * 1000,
  }),
  porEmail: crearLimitadorIntentos({
    maximo: config.limiteIngreso.intentosPorEmail,
    ventanaMs: config.limiteIngreso.ventanaSegundos * 1000,
  }),
});
