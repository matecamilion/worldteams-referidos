import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { busquedaAplicable, cambiaFiltros, claveFiltros, crearDiferido, ESPERA_BUSQUEDA_MS, reconciliarUrl, urlDeFiltros } from "./busqueda-pool";

describe("busquedaAplicable (mínimo de 2 caracteres)", () => {
  it("vacío o solo espacios vuelve al listado completo", () => {
    expect(busquedaAplicable("")).toBe("");
    expect(busquedaAplicable("   ")).toBe("");
  });
  it("un solo carácter no filtra (null = no hacer nada)", () => {
    expect(busquedaAplicable("a")).toBeNull();
    expect(busquedaAplicable("  a ")).toBeNull();
  });
  it("2 o más caracteres filtran, recortados", () => {
    expect(busquedaAplicable("an")).toBe("an");
    expect(busquedaAplicable("  ana paz ")).toBe("ana paz");
  });
});

describe("urlDeFiltros (reinicio de página)", () => {
  it("siempre vuelve a la página 1 y no escribe lo que está en su valor por defecto", () => {
    expect(urlDeFiltros("ana", "rechazado", "/panel/pool")).toBe("/panel/pool?q=ana&estado=rechazado");
    expect(urlDeFiltros("", null, "/panel/pool")).toBe("/panel/pool");
    expect(urlDeFiltros("ana", null, "/dev/panel/pool")).toBe("/dev/panel/pool?q=ana");
    expect(urlDeFiltros("ana", null, "/panel/pool")).not.toContain("pagina");
  });
  it("cambiaFiltros evita navegar a lo que ya se está viendo", () => {
    const params = { q: "ana", estado: null, pagina: 3 };
    expect(cambiaFiltros(params, "ana", null)).toBe(false);
    expect(cambiaFiltros(params, "ana p", null)).toBe(true);
    expect(cambiaFiltros(params, "ana", "validado")).toBe(true);
  });
});

describe("reconciliarUrl (URL cambiada por fuera de la barra)", () => {
  it("claveFiltros usa la búsqueda como la lee el servidor", () => {
    expect(claveFiltros("ana, paz", null)).toBe(claveFiltros("ana paz", null));
    expect(claveFiltros("ana", "validado")).not.toBe(claveFiltros("ana", null));
  });
  it("una URL que la barra mandó es propia: se descarta junto con las anteriores y el campo no se toca", () => {
    const a = claveFiltros("ab", null);
    const b = claveFiltros("abc", null);
    const c = claveFiltros("abcd", null);
    expect(reconciliarUrl([a, b, c], a)).toEqual({ propio: true, empujados: [b, c] });
    expect(reconciliarUrl([a, b, c], c)).toEqual({ propio: true, empujados: [] });
  });
  it("una URL que no mandó la barra (pestaña del menú, atrás) es externa: el campo copia la URL y se olvida lo pendiente", () => {
    expect(reconciliarUrl([claveFiltros("ab", null)], claveFiltros("", null))).toEqual({ propio: false, empujados: [] });
    expect(reconciliarUrl([], claveFiltros("luis", null))).toEqual({ propio: false, empujados: [] });
  });
});

describe("crearDiferido (debounce de 300 ms)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  const temporizador = { set: (fn: () => void, ms: number) => setTimeout(fn, ms), clear: (id: unknown) => clearTimeout(id as ReturnType<typeof setTimeout>) };

  it("la espera por defecto es de 300 ms", () => {
    expect(ESPERA_BUSQUEDA_MS).toBe(300);
  });
  it("no ejecuta antes de tiempo y ejecuta una vez con el último valor", () => {
    const fn = vi.fn();
    const d = crearDiferido<string>(fn, 300, temporizador);
    d.programar("a");
    d.programar("an");
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    d.programar("ana"); // reinicia la cuenta
    vi.advanceTimersByTime(299);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("ana");
  });
  it("tras ejecutar no queda nada pendiente ni se repite", () => {
    const fn = vi.fn();
    const d = crearDiferido<string>(fn, 300, temporizador);
    d.programar("ana");
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(d.hayPendiente()).toBe(false);
  });
  it("volcar ejecuta ya (Enter o cambio del filtro) y no vuelve a ejecutar cuando vence el tiempo", () => {
    const fn = vi.fn();
    const d = crearDiferido<string>(fn, 300, temporizador);
    d.programar("ana");
    d.volcar();
    expect(fn).toHaveBeenCalledWith("ana");
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });
  it("cancelar descarta lo pendiente (borrar hasta menos de 2 caracteres, o salir de la página)", () => {
    const fn = vi.fn();
    const d = crearDiferido<string>(fn, 300, temporizador);
    d.programar("ana");
    d.cancelar();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
    d.volcar();
    expect(fn).not.toHaveBeenCalled();
  });
  it("volcar sin nada pendiente no hace nada", () => {
    const fn = vi.fn();
    crearDiferido<string>(fn, 300, temporizador).volcar();
    expect(fn).not.toHaveBeenCalled();
  });
});
