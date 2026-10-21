import { beforeEach, describe, expect, it, vi } from "vitest";
import { solicitarIngreso, type DependenciasIngreso } from "./ingreso";
import { crearLimitadorIntentos } from "./limite-ingreso";

function armar(rol: "referente" | "reclutamiento" | "ninguno" | "no_disponible" = "referente", tope = { ip: 5, email: 3 }) {
  const porIp = crearLimitadorIntentos({ maximo: tope.ip, ventanaMs: 60_000 });
  const porEmail = crearLimitadorIntentos({ maximo: tope.email, ventanaMs: 60_000 });
  const enviarLink = vi.fn<DependenciasIngreso["enviarLink"]>().mockResolvedValue();
  const emailHabilitado = vi.fn<DependenciasIngreso["emailHabilitado"]>().mockResolvedValue(rol);
  const deps: DependenciasIngreso = {
    emailHabilitado,
    enviarLink,
    permitirIp: (ip) => porIp.permitir(ip),
    permitirEmail: (e) => porEmail.permitir(e),
  };
  return { deps, enviarLink, emailHabilitado };
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("solicitarIngreso", () => {
  it("email habilitado: manda el link y responde 'enviado'", async () => {
    const { deps, enviarLink } = armar("referente");
    expect(await solicitarIngreso("  Lucia@Ejemplo.com ", "1.1.1.1", deps)).toBe("enviado");
    expect(enviarLink).toHaveBeenCalledExactlyOnceWith("lucia@ejemplo.com");
  });

  it("reclutamiento también recibe el link", async () => {
    const { deps, enviarLink } = armar("reclutamiento");
    expect(await solicitarIngreso("rec@ejemplo.com", "1.1.1.1", deps)).toBe("enviado");
    expect(enviarLink).toHaveBeenCalledOnce();
  });

  it("email no habilitado: no manda nada y la respuesta es idéntica", async () => {
    const habilitado = armar("referente");
    const noHabilitado = armar("ninguno");
    const a = await solicitarIngreso("si@ejemplo.com", "1.1.1.1", habilitado.deps);
    const b = await solicitarIngreso("no@ejemplo.com", "1.1.1.1", noHabilitado.deps);
    expect(b).toBe(a);
    expect(noHabilitado.enviarLink).not.toHaveBeenCalled();
  });

  it("si el envío falla, la respuesta no cambia (no delata que estaba habilitado)", async () => {
    const { deps, enviarLink } = armar("referente");
    enviarLink.mockRejectedValue(new Error("over_email_send_rate_limit"));
    expect(await solicitarIngreso("si@ejemplo.com", "1.1.1.1", deps)).toBe("enviado");
  });

  it("formato inválido: no consulta la base ni envía, pero cuenta para la IP", async () => {
    const { deps, emailHabilitado, enviarLink } = armar("referente", { ip: 2, email: 3 });
    expect(await solicitarIngreso("no-es-un-email", "1.1.1.1", deps)).toBe("email_invalido");
    expect(await solicitarIngreso("", "1.1.1.1", deps)).toBe("email_invalido");
    expect(await solicitarIngreso("tampoco", "1.1.1.1", deps)).toBe("limitado");
    expect(emailHabilitado).not.toHaveBeenCalled();
    expect(enviarLink).not.toHaveBeenCalled();
  });

  it("límite por email: el mismo email no recibe más links que el tope, aunque cambie la IP", async () => {
    const { deps, enviarLink } = armar("referente", { ip: 100, email: 3 });
    const respuestas = [];
    for (let i = 0; i < 6; i++) respuestas.push(await solicitarIngreso("lucia@ejemplo.com", `9.9.9.${i}`, deps));
    expect(enviarLink).toHaveBeenCalledTimes(3);
    expect(respuestas.slice(3)).toEqual(["limitado", "limitado", "limitado"]);
  });

  it("límite por IP: una IP no puede mandar mails a muchos emails distintos", async () => {
    const { deps, enviarLink } = armar("referente", { ip: 5, email: 3 });
    for (let i = 0; i < 20; i++) await solicitarIngreso(`persona${i}@ejemplo.com`, "6.6.6.6", deps);
    expect(enviarLink).toHaveBeenCalledTimes(5);
  });

  it("el límite cuenta también a los emails no habilitados: no revela quién está en la lista", async () => {
    const { deps } = armar("ninguno", { ip: 100, email: 2 });
    const r = [];
    for (let i = 0; i < 3; i++) r.push(await solicitarIngreso("nadie@ejemplo.com", "1.1.1.1", deps));
    expect(r).toEqual(["enviado", "enviado", "limitado"]);
  });

  it("con el límite agotado no consulta la base", async () => {
    const { deps, emailHabilitado } = armar("referente", { ip: 1, email: 3 });
    await solicitarIngreso("a@ejemplo.com", "1.1.1.1", deps);
    await solicitarIngreso("b@ejemplo.com", "1.1.1.1", deps);
    expect(emailHabilitado).toHaveBeenCalledTimes(1);
  });

  it("base no disponible: lo dice, sin mandar nada", async () => {
    const { deps, enviarLink } = armar("no_disponible");
    expect(await solicitarIngreso("a@ejemplo.com", "1.1.1.1", deps)).toBe("no_disponible");
    expect(enviarLink).not.toHaveBeenCalled();
  });
});
