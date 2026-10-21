import { describe, expect, it } from "vitest";
import { calcularPremio } from "./premios";

describe("calcularPremio", () => {
  it("un referido normal paga solo la base", () => {
    expect(calcularPremio(1).total).toBe(50);
  });

  it("un referido prioritario paga el doble", () => {
    expect(calcularPremio(1, 1).total).toBe(100);
  });

  it("al llegar a 3 se suma el primer bono", () => {
    const r = calcularPremio(3);
    expect(r.hitos).toBe(75);
    expect(r.total).toBe(225);
  });

  it("al llegar a 10 se suman los tres bonos", () => {
    const r = calcularPremio(10);
    expect(r.hitos).toBe(75 + 150 + 300);
    expect(r.total).toBe(1025);
    expect(r.proximo).toBeUndefined();
  });

  it("indica el próximo hito mientras falte alguno", () => {
    expect(calcularPremio(4).proximo?.referidos).toBe(6);
  });
});
