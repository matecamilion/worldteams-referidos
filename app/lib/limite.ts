import { config } from "./config";

/**
 * Límite de intentos fallidos por IP, en una ventana de tiempo deslizante.
 * Cuenta códigos DISTINTOS que no existen: es la señal de alguien probando códigos al azar. Repetir
 * el mismo código roto (recargar la página, o que Next la renderice dos veces) cuenta una sola vez.
 * Vive en memoria de cada instancia del servidor: frena el barrido casual, pero en un despliegue con
 * varias instancias el tope efectivo se multiplica. La garantía fuerte es el sufijo no adivinable; el
 * límite compartido (base de datos o borde) queda para la etapa de producción.
 */
export function crearLimitador({
  fallosMaximos,
  ventanaMs,
  ahora = Date.now,
}: {
  fallosMaximos: number;
  ventanaMs: number;
  ahora?: () => number;
}) {
  // IP -> (código fallido -> cuándo). Una IP bloqueada no suma entradas, así que cada una guarda a lo sumo `fallosMaximos`.
  const fallos = new Map<string, Map<string, number>>();

  const vigentes = (clave: string) => {
    const desde = ahora() - ventanaMs;
    const codigos = fallos.get(clave);
    if (!codigos) return 0;
    for (const [codigo, cuando] of codigos) if (cuando <= desde) codigos.delete(codigo);
    if (!codigos.size) fallos.delete(clave);
    return codigos.size;
  };

  return {
    bloqueada: (clave: string) => vigentes(clave) >= fallosMaximos,
    registrarFallo(clave: string, codigo: string) {
      vigentes(clave);
      const codigos = fallos.get(clave) ?? new Map<string, number>();
      codigos.set(codigo, ahora());
      fallos.set(clave, codigos);
      // Evita que el mapa crezca sin límite ante un barrido desde muchas IP.
      if (fallos.size > 10_000) for (const k of [...fallos.keys()]) vigentes(k);
    },
  };
}

/**
 * Una sola instancia por proceso: Next empaqueta la página y la ruta de la API por separado, y cada
 * paquete tendría su propio contador. Colgarlo de globalThis hace que compartan el mismo.
 */
const global = globalThis as typeof globalThis & { __limitadorConsultas?: ReturnType<typeof crearLimitador> };
export const limitadorConsultas = (global.__limitadorConsultas ??= crearLimitador({
  fallosMaximos: config.limiteConsultaCodigo.fallosMaximos,
  ventanaMs: config.limiteConsultaCodigo.ventanaSegundos * 1000,
}));

/** IP del cliente según el proxy (Vercel agrega `x-forwarded-for`); la primera es la del cliente. */
export function ipDelCliente(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "desconocida";
}
