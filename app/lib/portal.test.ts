import { describe, expect, it } from "vitest";
import {
  armarPremios,
  armarProgreso,
  armarReferidos,
  estadoVisible,
  formatearCiclo,
  formatearUsd,
  type FilaMovimiento,
} from "./portal";

describe("estadoVisible", () => {
  it("conserva los estados que el referente puede ver", () => {
    expect(estadoVisible("registrado")).toBe("registrado");
    expect(estadoVisible("en_revision")).toBe("en_revision");
    expect(estadoVisible("validado")).toBe("validado");
    expect(estadoVisible("no_avanzo")).toBe("no_avanzo");
  });
  it("rechazado, descartado y cualquier valor desconocido se ven como 'no avanzó'", () => {
    for (const v of ["rechazado", "descartado", "", null, undefined, "algo_nuevo"]) expect(estadoVisible(v)).toBe("no_avanzo");
  });
});

describe("armarReferidos", () => {
  it("une nombre y apellido, ordena del más nuevo al más viejo y no expone otros datos", () => {
    const r = armarReferidos([
      { referido_id: "1", nombre: "Ana", apellido: "Paz", estado_visible: "validado", creado_en: "2026-10-01T10:00:00Z" },
      { referido_id: "2", nombre: "Luis", apellido: "Roa", estado_visible: "rechazado", creado_en: "2026-10-05T10:00:00Z" },
    ]);
    expect(r).toEqual([
      { id: "2", nombreCompleto: "Luis Roa", estado: "no_avanzo" },
      { id: "1", nombreCompleto: "Ana Paz", estado: "validado" },
    ]);
  });
  it("lista vacía", () => {
    expect(armarReferidos([])).toEqual([]);
  });
});

describe("armarProgreso (barra de hitos)", () => {
  it("avance hacia el próximo hito", () => {
    expect(armarProgreso({ validados_anio: 2, proximo_hito: 3, proximo_bono_usd: 75, faltan: 1 })).toEqual({
      tipo: "en_camino",
      validados: 2,
      hito: 3,
      bonoUsd: 75,
      faltan: 1,
      porcentaje: 67,
    });
  });
  it("sin validados la barra está vacía", () => {
    const p = armarProgreso({ validados_anio: 0, proximo_hito: 3, proximo_bono_usd: 75, faltan: 3 });
    expect(p).toMatchObject({ tipo: "en_camino", porcentaje: 0, faltan: 3 });
  });
  it("nunca pasa de 100 %", () => {
    const p = armarProgreso({ validados_anio: 9, proximo_hito: 6, proximo_bono_usd: 150, faltan: 0 });
    expect(p).toMatchObject({ tipo: "en_camino", porcentaje: 100 });
  });
  it("sin próximo hito (cobró todos) queda completo", () => {
    expect(armarProgreso({ validados_anio: 11, proximo_hito: null, proximo_bono_usd: null, faltan: 0 })).toEqual({ tipo: "completo", validados: 11 });
  });
  it("sin fila de progreso (referente nuevo) no rompe", () => {
    expect(armarProgreso(null)).toEqual({ tipo: "completo", validados: 0 });
  });
});

const mov = (p: Partial<FilaMovimiento>): FilaMovimiento => ({
  id: "m",
  concepto: "base",
  hito_umbral: null,
  monto_usd: 50,
  estado: "pendiente",
  ciclo_pago: "2026-10",
  pagado_en: null,
  creado_en: "2026-10-01T00:00:00Z",
  ...p,
});

describe("armarPremios", () => {
  it("separa pendientes de pagados y acepta numeric como string", () => {
    const p = armarPremios([
      mov({ id: "a", monto_usd: "50.00" }),
      mov({ id: "b", monto_usd: 50, concepto: "extra_prioritario" }),
      mov({ id: "c", monto_usd: "75.00", concepto: "bono_hito", hito_umbral: 3, estado: "pagado", pagado_en: "2026-09-25T00:00:00Z" }),
    ]);
    expect(p.pendienteUsd).toBe(100);
    expect(p.pagadoUsd).toBe(75);
    expect(p.movimientos).toHaveLength(3);
  });
  it("los cancelados por sanción no se muestran ni suman", () => {
    const p = armarPremios([mov({ id: "a" }), mov({ id: "x", estado: "cancelado_sancion", monto_usd: 999 })]);
    expect(p.pendienteUsd).toBe(50);
    expect(p.movimientos.map((m) => m.id)).toEqual(["a"]);
  });
  it("sin movimientos: todo en cero", () => {
    expect(armarPremios([])).toEqual({ pendienteUsd: 0, pagadoUsd: 0, movimientos: [] });
  });
  it("no arrastra decimales de coma flotante", () => {
    expect(armarPremios([mov({ monto_usd: 0.1 }), mov({ id: "z", monto_usd: 0.2 })]).pendienteUsd).toBe(0.3);
  });
});

describe("formato", () => {
  it("montos", () => {
    expect(formatearUsd(50)).toBe("USD 50");
    expect(formatearUsd(62.5)).toBe("USD 62,50");
    expect(formatearUsd(1250)).toBe("USD 1.250");
    expect(formatearUsd(0)).toBe("USD 0");
  });
  it("ciclo de pago", () => {
    expect(formatearCiclo("2026-11")).toBe("noviembre de 2026");
    expect(formatearCiclo("2027-01")).toBe("enero de 2027");
    expect(formatearCiclo("raro")).toBe("raro");
  });
});
