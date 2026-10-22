import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  rpc: vi.fn(),
  sesion: vi.fn(),
  revalidar: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: m.revalidar }));
// redirect() de Next corta la ejecución lanzando una señal; acá se imita para poder leer a dónde iba.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("./sesion", () => ({ leerSesion: m.sesion }));

import { resolverCaso } from "./acciones-panel";

const ID = "0b9f3b1e-6d6a-4c4e-8a57-1d1f1f1f1f1f";
const datos = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};
const ejecutar = async (campos: Record<string, string>) => {
  try {
    return await resolverCaso({ error: null }, datos(campos));
  } catch (e) {
    return e instanceof Error && e.message.startsWith("REDIRECT:") ? { redirigio: e.message.slice(9) } : Promise.reject(e);
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  m.sesion.mockResolvedValue({ tipo: "activa", rol: "reclutamiento", supabase: { rpc: m.rpc } });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("resolverCaso (server action)", () => {
  it("aprobar: llama al RPC con la sesión del usuario, revalida y vuelve a la cola con el monto", async () => {
    m.rpc.mockResolvedValue({ data: { referido_id: ID, estado: "validado", monto_usd: 100, sin_pago: false }, error: null });
    expect(await ejecutar({ referido: ID, decision: "aprobar" })).toEqual({ redirigio: "/panel?resultado=aprobado&monto=100" });
    expect(m.rpc).toHaveBeenCalledWith("resolver_referido", { p_referido: ID, p_decision: "aprobar", p_motivo: undefined });
    expect(m.revalidar).toHaveBeenCalledWith("/panel");
    expect(m.revalidar).toHaveBeenCalledWith("/panel/pool");
  });
  it("aprobar a un referente sancionado avisa que no hubo pago", async () => {
    m.rpc.mockResolvedValue({ data: { estado: "validado", monto_usd: 0, sin_pago: true }, error: null });
    expect(await ejecutar({ referido: ID, decision: "aprobar" })).toEqual({ redirigio: "/panel?resultado=aprobado_sin_pago" });
  });
  it("rechazar con motivo lo manda recortado", async () => {
    m.rpc.mockResolvedValue({ data: { estado: "rechazado", monto_usd: null, sin_pago: false }, error: null });
    expect(await ejecutar({ referido: ID, decision: "rechazar", motivo: "  no cumple  " })).toEqual({ redirigio: "/panel?resultado=rechazado" });
    expect(m.rpc).toHaveBeenCalledWith("resolver_referido", { p_referido: ID, p_decision: "rechazar", p_motivo: "no cumple" });
  });
  it("reabrir desde el pool vuelve al pool con la misma búsqueda, filtro y página", async () => {
    m.rpc.mockResolvedValue({ data: { estado: "en_revision", monto_usd: null, sin_pago: false }, error: null });
    const r = await ejecutar({ referido: ID, decision: "reabrir", motivo: "llegó el CV", origen: "pool", q: "ana", estado: "rechazado", pagina: "2" });
    expect(r).toEqual({ redirigio: "/panel/pool?q=ana&estado=rechazado&pagina=2&resultado=reabierto" });
  });

  it("reabrir sin motivo: error en pantalla y no llega a la base", async () => {
    expect(await ejecutar({ referido: ID, decision: "reabrir", motivo: "  " })).toEqual({ error: "motivo_requerido", motivo: "  " });
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("un id inválido no llega a la base", async () => {
    expect(await ejecutar({ referido: "x", decision: "aprobar" })).toMatchObject({ error: "generico" });
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it("sin sesión va a /ingresar y no llama a la base", async () => {
    m.sesion.mockResolvedValue({ tipo: "anonima" });
    expect(await ejecutar({ referido: ID, decision: "aprobar" })).toEqual({ redirigio: "/ingresar" });
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("sin_permiso de la base (un referente que arma el pedido a mano): error en pantalla, sin redirigir", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "sin_permiso: solo el equipo de reclutamiento puede resolver casos" } });
    expect(await ejecutar({ referido: ID, decision: "aprobar" })).toEqual({ error: "sin_permiso", motivo: "" });
    expect(m.revalidar).not.toHaveBeenCalled();
  });
  it("ya_resuelto y estado_invalido recargan la lista y vuelven con el aviso", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "ya_resuelto: el caso ya está validado" } });
    expect(await ejecutar({ referido: ID, decision: "aprobar" })).toEqual({ redirigio: "/panel?resultado=ya_resuelto" });
    expect(m.revalidar).toHaveBeenCalledWith("/panel");
    m.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "estado_invalido: el caso está registrado y solo se resuelve uno en revisión" } });
    expect(await ejecutar({ referido: ID, decision: "rechazar", origen: "pool" })).toEqual({ redirigio: "/panel/pool?resultado=estado_invalido" });
  });
  it("motivo_requerido que viene de la base conserva lo escrito", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "23514", message: "motivo_requerido: reabrir un caso exige un motivo" } });
    expect(await ejecutar({ referido: ID, decision: "rechazar", motivo: "texto" })).toEqual({ error: "motivo_requerido", motivo: "texto" });
  });
  it("un error desconocido es genérico, se registra sin mostrarlo y no revalida", async () => {
    m.rpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "algo interno con detalles" } });
    expect(await ejecutar({ referido: ID, decision: "aprobar" })).toEqual({ error: "generico", motivo: "" });
    expect(console.error).toHaveBeenCalled();
    expect(m.revalidar).not.toHaveBeenCalled();
  });
  it("una respuesta con forma inesperada es genérica", async () => {
    m.rpc.mockResolvedValue({ data: "ok", error: null });
    expect(await ejecutar({ referido: ID, decision: "aprobar" })).toMatchObject({ error: "generico" });
  });
  it("una sesión con error al resolverse es genérica y no llama a la base", async () => {
    m.sesion.mockResolvedValue({ tipo: "error" });
    expect(await ejecutar({ referido: ID, decision: "aprobar" })).toMatchObject({ error: "generico" });
    expect(m.rpc).not.toHaveBeenCalled();
  });
});
