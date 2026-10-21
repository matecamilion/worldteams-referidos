import { describe, expect, it, vi } from "vitest";
import { leerPuntajeMinimo, verificarRecaptcha } from "./recaptcha-servidor";

const base = { secreto: "s", accion: "referir", hostnames: ["worldteams-referidos.vercel.app"], puntajeMinimo: 0.5 };
const google = (cuerpo: object, ok = true) => vi.fn(async () => ({ ok, status: ok ? 200 : 500, json: async () => cuerpo }) as Response);
const bueno = { success: true, score: 0.9, action: "referir", hostname: "worldteams-referidos.vercel.app" };

describe("verificarRecaptcha", () => {
  it("acepta puntaje alto, acción y dominio esperados", async () => {
    expect(await verificarRecaptcha("t", { ...base, fetchFn: google(bueno) })).toEqual({ tipo: "ok" });
  });
  it("sin token rechaza sin consultar a Google", async () => {
    const f = google(bueno);
    expect(await verificarRecaptcha(null, { ...base, fetchFn: f })).toEqual({ tipo: "rechazado", motivo: "sin_token" });
    expect(f).not.toHaveBeenCalled();
  });
  it("rechaza puntaje bajo, otra acción y otro dominio", async () => {
    expect(await verificarRecaptcha("t", { ...base, fetchFn: google({ ...bueno, score: 0.2 }) })).toEqual({ tipo: "rechazado", motivo: "puntaje" });
    expect(await verificarRecaptcha("t", { ...base, fetchFn: google({ ...bueno, action: "otra" }) })).toEqual({ tipo: "rechazado", motivo: "accion" });
    expect(await verificarRecaptcha("t", { ...base, fetchFn: google({ ...bueno, hostname: "malo.com" }) })).toEqual({ tipo: "rechazado", motivo: "dominio" });
  });
  it("el puntaje justo en el mínimo pasa", async () => {
    expect(await verificarRecaptcha("t", { ...base, fetchFn: google({ ...bueno, score: 0.5 }) })).toEqual({ tipo: "ok" });
  });
  it("token vencido o repetido se distingue del rechazo", async () => {
    const f = google({ success: false, "error-codes": ["timeout-or-duplicate"] });
    expect(await verificarRecaptcha("t", { ...base, fetchFn: f })).toEqual({ tipo: "vencido" });
    const g = google({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await verificarRecaptcha("t", { ...base, fetchFn: g })).toEqual({ tipo: "rechazado", motivo: "token" });
  });
  it("Google caído, con error HTTP o sin clave secreta: no disponible", async () => {
    const caido = vi.fn(async () => {
      throw new Error("red");
    });
    expect(await verificarRecaptcha("t", { ...base, fetchFn: caido })).toEqual({ tipo: "no_disponible" });
    expect(await verificarRecaptcha("t", { ...base, fetchFn: google({}, false) })).toEqual({ tipo: "no_disponible" });
    expect(await verificarRecaptcha("t", { ...base, secreto: undefined, fetchFn: google(bueno) })).toEqual({ tipo: "no_disponible" });
    const mala = google({ success: false, "error-codes": ["invalid-input-secret"] });
    expect(await verificarRecaptcha("t", { ...base, fetchFn: mala })).toEqual({ tipo: "no_disponible" });
  });
});

describe("leerPuntajeMinimo", () => {
  it("usa el valor válido y cae a 0.5 si está mal escrito", () => {
    expect(leerPuntajeMinimo("0.7")).toBe(0.7);
    expect(leerPuntajeMinimo(undefined)).toBe(0.5);
    expect(leerPuntajeMinimo("abc")).toBe(0.5);
    expect(leerPuntajeMinimo("7")).toBe(0.5);
  });
});
