import { describe, expect, it } from "vitest";
import { crearLimitadorIntentos } from "./limite-ingreso";

describe("crearLimitadorIntentos", () => {
  it("deja pasar hasta el tope y bloquea el siguiente", () => {
    const l = crearLimitadorIntentos({ maximo: 3, ventanaMs: 1000 });
    expect([l.permitir("a"), l.permitir("a"), l.permitir("a"), l.permitir("a")]).toEqual([true, true, true, false]);
  });
  it("cada clave tiene su propio contador", () => {
    const l = crearLimitadorIntentos({ maximo: 1, ventanaMs: 1000 });
    expect(l.permitir("a")).toBe(true);
    expect(l.permitir("b")).toBe(true);
    expect(l.permitir("a")).toBe(false);
  });
  it("vuelve a permitir cuando vence la ventana", () => {
    let t = 0;
    const l = crearLimitadorIntentos({ maximo: 1, ventanaMs: 1000, ahora: () => t });
    expect(l.permitir("a")).toBe(true);
    t = 999;
    expect(l.permitir("a")).toBe(false);
    t = 1001;
    expect(l.permitir("a")).toBe(true);
  });
  it("un intento rechazado no extiende el bloqueo", () => {
    let t = 0;
    const l = crearLimitadorIntentos({ maximo: 1, ventanaMs: 1000, ahora: () => t });
    l.permitir("a");
    t = 900;
    l.permitir("a");
    t = 1001;
    expect(l.permitir("a")).toBe(true);
  });
});
