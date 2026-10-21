import { describe, expect, it } from "vitest";
import { decidirRol, resolverAcceso, rutaPorRol } from "./roles";

describe("rutaPorRol", () => {
  it("referente al portal, reclutamiento al panel", () => {
    expect(rutaPorRol("referente")).toBe("/portal");
    expect(rutaPorRol("reclutamiento")).toBe("/panel");
  });
  it("sin habilitación va a /portal, que muestra el aviso sin datos", () => {
    expect(rutaPorRol("ninguno")).toBe("/portal");
  });
});

describe("decidirRol", () => {
  const ok = { colocado: true, sancionado_en: null };
  it("reclutamiento gana aunque también figure como referente", () => {
    expect(decidirRol({ esReclutamiento: true, referente: ok })).toBe("reclutamiento");
  });
  it("referente colocado y sin sanción", () => {
    expect(decidirRol({ esReclutamiento: false, referente: ok })).toBe("referente");
  });
  it("referente no colocado o sancionado no entra", () => {
    expect(decidirRol({ esReclutamiento: false, referente: { colocado: false, sancionado_en: null } })).toBe("ninguno");
    expect(decidirRol({ esReclutamiento: false, referente: { colocado: true, sancionado_en: "2026-10-01T00:00:00Z" } })).toBe("ninguno");
  });
  it("sin fila de referente ni de reclutamiento: ninguno", () => {
    expect(decidirRol({ esReclutamiento: false, referente: null })).toBe("ninguno");
  });
});

describe("resolverAcceso", () => {
  it("sin sesión va a /ingresar, en las dos rutas", () => {
    expect(resolverAcceso("referente", null)).toEqual({ accion: "redirigir", a: "/ingresar" });
    expect(resolverAcceso("reclutamiento", null)).toEqual({ accion: "redirigir", a: "/ingresar" });
  });
  it("el rol correcto ve la página", () => {
    expect(resolverAcceso("referente", "referente")).toEqual({ accion: "mostrar" });
    expect(resolverAcceso("reclutamiento", "reclutamiento")).toEqual({ accion: "mostrar" });
  });
  it("un referente en /panel va a /portal y reclutamiento en /portal va a /panel", () => {
    expect(resolverAcceso("reclutamiento", "referente")).toEqual({ accion: "redirigir", a: "/portal" });
    expect(resolverAcceso("referente", "reclutamiento")).toEqual({ accion: "redirigir", a: "/panel" });
  });
  it("con sesión pero sin habilitación: aviso, nunca datos", () => {
    expect(resolverAcceso("referente", "ninguno")).toEqual({ accion: "no_habilitado" });
    expect(resolverAcceso("reclutamiento", "ninguno")).toEqual({ accion: "no_habilitado" });
  });
});
