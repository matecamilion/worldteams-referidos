import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Prueba la consulta en modo real con un cliente de Supabase simulado: la función de la base se prueba en supabase/tests.sql. */
const rpc = vi.fn();

async function cargar(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DEMO", "false");
  vi.stubEnv("SUPABASE_CONSULTA_SECRETO", "secreto-de-prueba-0123456789abcdef0123");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  vi.doMock("./supabase-servidor", () => ({ crearClienteServidor: () => ({ rpc }) }));
  return import("./referentes");
}

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("consultarReferente (modo real)", () => {
  it("manda el código normalizado, la IP del usuario y el secreto a la función de la base", async () => {
    rpc.mockResolvedValue({ data: [{ estado: "ok", nombre: "Lucía", apellido: "Gómez", codigo_referido: "lucia-k7q2m9xd" }], error: null });
    const { consultarReferente } = await cargar();
    const r = await consultarReferente("  Lucia-K7Q2M9XD ", "203.0.113.9");
    expect(rpc).toHaveBeenCalledWith("consultar_referente_por_codigo", {
      p_codigo: "lucia-k7q2m9xd",
      p_ip: "203.0.113.9",
      p_secreto: "secreto-de-prueba-0123456789abcdef0123",
    });
    expect(r).toEqual({ tipo: "ok", referente: { codigo: "lucia-k7q2m9xd", nombre: "Lucía", apellido: "Gómez" } });
  });

  it("traduce no_existe y bloqueada", async () => {
    const { consultarReferente } = await cargar();
    rpc.mockResolvedValueOnce({ data: [{ estado: "no_existe", nombre: null, apellido: null, codigo_referido: null }], error: null });
    expect(await consultarReferente("zzz-00000000", "1.1.1.1")).toEqual({ tipo: "no_existe" });
    rpc.mockResolvedValueOnce({ data: [{ estado: "bloqueada", nombre: null, apellido: null, codigo_referido: null }], error: null });
    expect(await consultarReferente("zzz-00000001", "1.1.1.1")).toEqual({ tipo: "bloqueada" });
  });

  it("si la base no reconoce el secreto (no_autorizado) es un error de configuración, no un link inexistente", async () => {
    rpc.mockResolvedValue({ data: [{ estado: "no_autorizado", nombre: null, apellido: null, codigo_referido: null }], error: null });
    const { consultarReferente } = await cargar();
    expect(await consultarReferente("lucia-k7q2m9xd", "1.1.1.1")).toEqual({ tipo: "no_disponible" });
  });

  it("si la base falla, da error o responde vacío, devuelve no_disponible", async () => {
    const { consultarReferente } = await cargar();
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await consultarReferente("lucia-k7q2m9xd", "1.1.1.1")).toEqual({ tipo: "no_disponible" });
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await consultarReferente("lucia-k7q2m9xd", "1.1.1.1")).toEqual({ tipo: "no_disponible" });
    rpc.mockRejectedValueOnce(new Error("timeout"));
    expect(await consultarReferente("lucia-k7q2m9xd", "1.1.1.1")).toEqual({ tipo: "no_disponible" });
  });

  it("una fila ok incompleta no se acepta", async () => {
    rpc.mockResolvedValue({ data: [{ estado: "ok", nombre: "Lucía", apellido: null, codigo_referido: "lucia-k7q2m9xd" }], error: null });
    const { consultarReferente } = await cargar();
    expect(await consultarReferente("lucia-k7q2m9xd", "1.1.1.1")).toEqual({ tipo: "no_disponible" });
  });

  it("sin SUPABASE_CONSULTA_SECRETO no llama a la base y devuelve no_disponible", async () => {
    const { consultarReferente } = await cargar({ SUPABASE_CONSULTA_SECRETO: "" });
    expect(await consultarReferente("lucia-k7q2m9xd", "1.1.1.1")).toEqual({ tipo: "no_disponible" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("no escribe el secreto en los mensajes de error", async () => {
    rpc.mockResolvedValue({ data: [{ estado: "no_autorizado", nombre: null, apellido: null, codigo_referido: null }], error: null });
    const { consultarReferente } = await cargar();
    await consultarReferente("lucia-k7q2m9xd", "1.1.1.1");
    const escrito = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(escrito).not.toContain("secreto-de-prueba-0123456789abcdef0123");
  });
});
