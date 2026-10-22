import { limpiarBusqueda, urlPool, type EstadoReferido, type ParamsPool } from "./panel";

/** Retardo antes de aplicar lo que se escribe en el buscador del pool. */
export const ESPERA_BUSQUEDA_MS = 300;
/** Menos caracteres que esto no filtran (la consulta devolvería casi todo el pool). */
export const MIN_BUSQUEDA = 2;

/**
 * Qué búsqueda aplicar con lo que hay en el campo: el texto recortado, "" si quedó vacío (vuelve al listado completo)
 * o null si es demasiado corto y no hay que hacer nada (se queda lo que se estaba viendo).
 */
export function busquedaAplicable(texto: string): string | null {
  const t = texto.trim();
  if (t === "") return "";
  return t.length < MIN_BUSQUEDA ? null : t;
}

/** URL del pool con la búsqueda y el filtro nuevos: siempre la página 1, porque el total cambia. */
export function urlDeFiltros(q: string, estado: EstadoReferido | null, base: string): string {
  return urlPool({ q, estado, pagina: 1 }, base);
}

/** ¿Aplicar esa búsqueda y ese estado cambiaría algo respecto de lo que ya se ve? */
export function cambiaFiltros(params: ParamsPool, q: string, estado: EstadoReferido | null): boolean {
  return q !== params.q || estado !== params.estado;
}

/** Identifica un par búsqueda + estado tal como lo lee el servidor (la búsqueda sale limpiada de comas, comodines, etc.). */
export const claveFiltros = (q: string, estado: EstadoReferido | null) => `${estado ?? ""}|${limpiarBusqueda(q)}`;

/**
 * La URL cambió y hay que saber si fue por esta barra o por fuera (la pestaña del menú, atrás/adelante). Si es una de las
 * que la barra mandó, se descarta esa y las anteriores (llegan en orden) y el campo no se toca: la persona pudo seguir
 * escribiendo mientras tanto. Si no, el campo tiene que copiar la URL; si no, quedaría mostrando una búsqueda que ya no
 * está aplicada.
 */
export function reconciliarUrl(empujados: string[], actual: string): { propio: boolean; empujados: string[] } {
  const i = empujados.indexOf(actual);
  return i >= 0 ? { propio: true, empujados: empujados.slice(i + 1) } : { propio: false, empujados: [] };
}

type Temporizador = { set: (fn: () => void, ms: number) => unknown; clear: (id: unknown) => void };
const temporizadorReal: Temporizador = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id as ReturnType<typeof setTimeout>) };

/**
 * Retardo (debounce): `programar(valor)` espera `espera` ms desde la última llamada y entonces ejecuta `fn` con el último
 * valor. `volcar()` lo ejecuta ya (Enter, cambio del filtro) y `cancelar()` lo descarta (desmontar la página).
 */
export function crearDiferido<T>(fn: (valor: T) => void, espera = ESPERA_BUSQUEDA_MS, temporizador: Temporizador = temporizadorReal) {
  let id: unknown = null;
  let pendiente: { valor: T } | null = null;
  const limpiar = () => {
    if (id !== null) temporizador.clear(id);
    id = null;
  };
  return {
    programar(valor: T) {
      limpiar();
      pendiente = { valor };
      id = temporizador.set(() => {
        id = null;
        const p = pendiente;
        pendiente = null;
        if (p) fn(p.valor);
      }, espera);
    },
    volcar() {
      limpiar();
      const p = pendiente;
      pendiente = null;
      if (p) fn(p.valor);
    },
    cancelar() {
      limpiar();
      pendiente = null;
    },
    hayPendiente: () => pendiente !== null,
  };
}
