import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

async function cargar(env: Record<string, string | undefined> = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_DEMO", "true"); // el login no depende del modo demo
  vi.stubEnv("SUPABASE_CONSULTA_SECRETO", "secreto-de-prueba-0123456789abcdef0123");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  vi.doMock("./supabase-servidor", () => ({ crearClienteServidor: () => ({ rpc }) }));
  return import("./habilitacion");
}

beforeEach(() => {
  rpc.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("emailHabilitado", () => {
  it("manda el email y el secreto de aplicación a la función de la base, también en modo demo", async () => {
    rpc.mockResolvedValue({ data: "referente", error: null });
    const { emailHabilitado } = await cargar();
    expect(await emailHabilitado("lucia@ejemplo.com")).toBe("referente");
    expect(rpc).toHaveBeenCalledWith("email_habilitado", { p_email: "lucia@ejemplo.com", p_secreto: "secreto-de-prueba-0123456789abcdef0123" });
  });

  it.each(["referente", "reclutamiento", "ninguno"] as const)("devuelve el rol %s tal cual", async (rol) => {
    rpc.mockResolvedValue({ data: rol, error: null });
    const { emailHabilitado } = await cargar();
    expect(await emailHabilitado("a@b.com")).toBe(rol);
  });

  it("sin secreto en el servidor: no_disponible y no llama a la base", async () => {
    const { emailHabilitado } = await cargar({ SUPABASE_CONSULTA_SECRETO: "" });
    expect(await emailHabilitado("a@b.com")).toBe("no_disponible");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("'no_autorizado', un valor inesperado o un error de la base: no_disponible (nunca habilitado)", async () => {
    const { emailHabilitado } = await cargar();
    rpc.mockResolvedValue({ data: "no_autorizado", error: null });
    expect(await emailHabilitado("a@b.com")).toBe("no_disponible");
    rpc.mockResolvedValue({ data: "admin", error: null });
    expect(await emailHabilitado("a@b.com")).toBe("no_disponible");
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await emailHabilitado("a@b.com")).toBe("no_disponible");
    rpc.mockRejectedValue(new Error("timeout"));
    expect(await emailHabilitado("a@b.com")).toBe("no_disponible");
  });
});
