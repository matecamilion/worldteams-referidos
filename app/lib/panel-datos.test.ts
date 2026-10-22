import { describe, expect, it, vi } from "vitest";
import { cargarConfigPanel, cargarCola, cargarPool } from "./panel-datos";
import type { ClienteSesion } from "./supabase-sesion";

type Llamada = [string, ...unknown[]];

/** Cliente falso con la forma encadenable de supabase-js: registra cada llamada y responde con lo configurado. */
function clienteFalso(respuesta: { data?: unknown; error?: { message: string; code?: string } | null; count?: number | null }) {
  const llamadas: Llamada[] = [];
  const cadena: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "in", "or", "order", "limit", "range"]) {
    cadena[metodo] = (...args: unknown[]) => {
      llamadas.push([metodo, ...args]);
      return cadena;
    };
  }
  cadena.then = (resolver: (v: unknown) => unknown) => resolver({ data: respuesta.data ?? [], error: respuesta.error ?? null, count: respuesta.count ?? null });
  const tablas: string[] = [];
  const cliente = { from: (t: string) => (tablas.push(t), cadena) } as unknown as ClienteSesion;
  return { cliente, llamadas, tablas };
}

const sinParams = { q: "", estado: null, pagina: 1 } as const;
const cfg = { plazoRevisionDias: 3, zona: "America/Argentina/Buenos_Aires" };

describe("cargarConfigPanel", () => {
  it("lee las dos claves de configuracion", async () => {
    const f = clienteFalso({ data: [{ clave: "plazo_revision_dias_habiles", valor: 3 }, { clave: "zona_horaria", valor: cfg.zona }] });
    expect(await cargarConfigPanel(f.cliente)).toEqual({ ok: true, config: cfg });
    expect(f.tablas).toEqual(["configuracion"]);
    expect(f.llamadas).toContainEqual(["in", "clave", ["plazo_revision_dias_habiles", "zona_horaria"]]);
  });
  it("falla si la base falla o si el valor está roto", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await cargarConfigPanel(clienteFalso({ error: { message: "boom" } }).cliente)).toEqual({ ok: false });
    expect(await cargarConfigPanel(clienteFalso({ data: [] }).cliente)).toEqual({ ok: false });
  });
});

describe("cargarCola", () => {
  it("pide solo en_revision, los más viejos primero, con tope, y sin service role (cliente de sesión)", async () => {
    const f = clienteFalso({ data: [], count: 0 });
    expect(await cargarCola(f.cliente, cfg)).toEqual({ ok: true, casos: [], total: 0 });
    expect(f.tablas).toEqual(["referidos"]);
    expect(f.llamadas).toContainEqual(["eq", "estado", "en_revision"]);
    expect(f.llamadas).toContainEqual(["order", "creado_en", { ascending: true }]);
    expect(f.llamadas).toContainEqual(["limit", 50]);
    const seleccion = String(f.llamadas.find((l) => l[0] === "select")?.[1]);
    expect(seleccion).toContain("candidatos(");
    expect(seleccion).toContain("referentes(");
    expect(seleccion).not.toContain("*");
  });
  it("informa el total real aunque se muestre un tope", async () => {
    const f = clienteFalso({ data: [], count: 120 });
    expect(await cargarCola(f.cliente, cfg)).toMatchObject({ ok: true, total: 120 });
  });
  it("devuelve ok:false ante un error de la base", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await cargarCola(clienteFalso({ error: { message: "boom" } }).cliente, cfg)).toEqual({ ok: false });
  });
});

describe("cargarPool", () => {
  it("sin filtros: página 1, orden estable, referido más reciente por candidato", async () => {
    const f = clienteFalso({ data: [], count: 0 });
    expect(await cargarPool(f.cliente, sinParams)).toEqual({ ok: true, filas: [], total: 0 });
    expect(f.tablas).toEqual(["candidatos"]);
    expect(f.llamadas).toContainEqual(["range", 0, 19]);
    expect(f.llamadas).toContainEqual(["order", "creado_en", { ascending: false }]);
    expect(f.llamadas).toContainEqual(["order", "id", { ascending: true }]);
    expect(f.llamadas).toContainEqual(["order", "creado_en", { referencedTable: "referidos", ascending: false }]);
    expect(f.llamadas).toContainEqual(["limit", 1, { referencedTable: "referidos" }]);
    expect(String(f.llamadas.find((l) => l[0] === "select")?.[1])).toContain("referidos(");
    expect(f.llamadas.some((l) => l[0] === "eq" || l[0] === "or")).toBe(false);
  });
  it("la búsqueda se resuelve en la consulta: una condición or por palabra (AND entre palabras)", async () => {
    const f = clienteFalso({ data: [], count: 0 });
    await cargarPool(f.cliente, { q: "ana paz", estado: null, pagina: 1 });
    const ors = f.llamadas.filter((l) => l[0] === "or").map((l) => l[1]);
    expect(ors).toEqual([
      "nombre.ilike.*ana*,apellido.ilike.*ana*,email.ilike.*ana*",
      "nombre.ilike.*paz*,apellido.ilike.*paz*,email.ilike.*paz*",
    ]);
  });
  it("el filtro por estado usa un join interno sobre referidos", async () => {
    const f = clienteFalso({ data: [], count: 0 });
    await cargarPool(f.cliente, { q: "", estado: "validado", pagina: 1 });
    expect(String(f.llamadas.find((l) => l[0] === "select")?.[1])).toContain("referidos!inner(");
    expect(f.llamadas).toContainEqual(["eq", "referidos.estado", "validado"]);
  });
  it("pagina de a 20", async () => {
    const f = clienteFalso({ data: [], count: 500 });
    await cargarPool(f.cliente, { q: "", estado: null, pagina: 3 });
    expect(f.llamadas).toContainEqual(["range", 40, 59]);
  });
  it("una búsqueda maliciosa no puede agregar condiciones", async () => {
    const f = clienteFalso({ data: [], count: 0 });
    await cargarPool(f.cliente, { q: 'x),id.not.is.null,(nombre.eq."y', estado: null, pagina: 1 });
    for (const l of f.llamadas.filter((c) => c[0] === "or")) {
      const filtro = String(l[1]);
      // Siempre exactamente tres condiciones separadas por coma y sin paréntesis ni comillas extra.
      expect(filtro.split(",")).toHaveLength(3);
      expect(filtro).not.toMatch(/[()"]/);
    }
  });
  it("página fuera de rango (PGRST103) se informa para volver a la primera", async () => {
    const f = clienteFalso({ error: { message: "Requested range not satisfiable", code: "PGRST103" } });
    expect(await cargarPool(f.cliente, { q: "", estado: null, pagina: 99 })).toEqual({ ok: true, fueraDeRango: true });
  });
  it("otro error de la base es ok:false", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await cargarPool(clienteFalso({ error: { message: "boom", code: "XX000" } }).cliente, sinParams)).toEqual({ ok: false });
  });
});
