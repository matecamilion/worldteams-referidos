import { describe, expect, it } from "vitest";
import { avisoDeResultado, codigoDeError, leerAviso, leerEntrada, leerRespuesta, urlConAviso } from "./resolver";

const ID = "0b9f3b1e-6d6a-4c4e-8a57-1d1f1f1f1f1f";
const form = (campos: Record<string, string>) => ({ get: (n: string) => (n in campos ? campos[n] : null) });

describe("codigoDeError (mensajes de resolver_referido)", () => {
  it("reconoce cada código por el principio del mensaje", () => {
    for (const c of ["sin_permiso", "ya_resuelto", "estado_invalido", "motivo_requerido", "motivo_demasiado_largo", "referido_inexistente"]) {
      expect(codigoDeError({ message: `${c}: texto de la base`, code: "23514" })).toBe(c);
    }
  });
  it("permission denied (42501) es sin_permiso aunque venga sin el código", () => {
    expect(codigoDeError({ message: "permission denied for function resolver_referido", code: "42501" })).toBe("sin_permiso");
    expect(codigoDeError({ message: "permission denied for table x" })).toBe("sin_permiso");
  });
  it("lo desconocido es genérico y no se filtra", () => {
    expect(codigoDeError({ message: "transicion_invalida: validado -> en_revision", code: "23514" })).toBe("generico");
    expect(codigoDeError({ message: "FetchError: timeout" })).toBe("generico");
    expect(codigoDeError(null)).toBe("generico");
    // un código en medio del mensaje no cuenta: solo al principio
    expect(codigoDeError({ message: "otra cosa ya_resuelto: x" })).toBe("generico");
  });
});

describe("leerRespuesta", () => {
  it("lee estado, monto y sin_pago", () => {
    expect(leerRespuesta({ referido_id: ID, estado: "validado", monto_usd: 100, sin_pago: false })).toEqual({ estado: "validado", montoUsd: 100, sinPago: false });
    expect(leerRespuesta({ estado: "rechazado", monto_usd: null, sin_pago: false })).toEqual({ estado: "rechazado", montoUsd: null, sinPago: false });
    expect(leerRespuesta({ estado: "validado", monto_usd: "50.00", sin_pago: true })).toEqual({ estado: "validado", montoUsd: 50, sinPago: true });
  });
  it("lo que no tiene la forma esperada es null", () => {
    for (const mala of [null, undefined, "x", 3, {}, { estado: 4 }]) expect(leerRespuesta(mala)).toBeNull();
  });
});

describe("leerEntrada (formulario de resolución)", () => {
  it("acepta aprobar, rechazar con y sin motivo, y reabrir con motivo", () => {
    expect(leerEntrada(form({ referido: ID, decision: "aprobar" }))).toMatchObject({ ok: true, entrada: { decision: "aprobar", motivo: null, origen: "cola" } });
    expect(leerEntrada(form({ referido: ID, decision: "rechazar", motivo: "  no cumple  " }))).toMatchObject({ ok: true, entrada: { motivo: "no cumple" } });
    expect(leerEntrada(form({ referido: ID, decision: "reabrir", motivo: "llegó el CV" }))).toMatchObject({ ok: true, entrada: { decision: "reabrir" } });
  });
  it("reabrir sin motivo (o con solo espacios) pide el motivo", () => {
    expect(leerEntrada(form({ referido: ID, decision: "reabrir" }))).toEqual({ ok: false, error: "motivo_requerido" });
    expect(leerEntrada(form({ referido: ID, decision: "reabrir", motivo: "   " }))).toEqual({ ok: false, error: "motivo_requerido" });
  });
  it("motivo de más de 500 caracteres", () => {
    expect(leerEntrada(form({ referido: ID, decision: "rechazar", motivo: "x".repeat(501) }))).toEqual({ ok: false, error: "motivo_demasiado_largo" });
    expect(leerEntrada(form({ referido: ID, decision: "rechazar", motivo: "x".repeat(500) })).ok).toBe(true);
  });
  it("un id que no es uuid o una decisión inventada se rechazan antes de llegar a la base", () => {
    expect(leerEntrada(form({ referido: "1; drop table", decision: "aprobar" }))).toEqual({ ok: false, error: "generico" });
    expect(leerEntrada(form({ referido: ID, decision: "borrar" }))).toEqual({ ok: false, error: "generico" });
    expect(leerEntrada(form({}))).toEqual({ ok: false, error: "generico" });
  });
  it("del pool conserva búsqueda, filtro y página; un filtro inventado se descarta", () => {
    const r = leerEntrada(form({ referido: ID, decision: "reabrir", motivo: "m", origen: "pool", q: "ana paz", estado: "rechazado", pagina: "3" }));
    expect(r).toMatchObject({ ok: true, entrada: { origen: "pool", paramsPool: { q: "ana paz", estado: "rechazado", pagina: 3 } } });
    const mala = leerEntrada(form({ referido: ID, decision: "reabrir", motivo: "m", origen: "pool", estado: "inventado", pagina: "-4" }));
    expect(mala).toMatchObject({ ok: true, entrada: { paramsPool: { estado: null, pagina: 1 } } });
  });
});

describe("avisos en la URL", () => {
  it("urlConAviso vuelve a la cola o al pool con sus parámetros", () => {
    expect(urlConAviso({ origen: "cola", paramsPool: { q: "", estado: null, pagina: 1 } }, { codigo: "aprobado", montoUsd: 50 })).toBe("/panel?resultado=aprobado&monto=50");
    expect(urlConAviso({ origen: "pool", paramsPool: { q: "ana", estado: "rechazado", pagina: 2 } }, { codigo: "reabierto", montoUsd: null })).toBe(
      "/panel/pool?q=ana&estado=rechazado&pagina=2&resultado=reabierto",
    );
    expect(urlConAviso({ origen: "pool", paramsPool: { q: "", estado: null, pagina: 1 } }, { codigo: "reabierto", montoUsd: null })).toBe("/panel/pool?resultado=reabierto");
    expect(urlConAviso({ origen: "pool", paramsPool: { q: "", estado: null, pagina: 1 } }, { codigo: "ya_resuelto", montoUsd: null }, { cola: "/dev/panel", pool: "/dev/panel/pool" })).toBe(
      "/dev/panel/pool?resultado=ya_resuelto",
    );
  });
  it("leerAviso solo acepta códigos conocidos y un monto razonable", () => {
    expect(leerAviso({ resultado: "aprobado", monto: "100" })).toEqual({ codigo: "aprobado", montoUsd: 100 });
    expect(leerAviso({ resultado: "<script>" })).toBeNull();
    expect(leerAviso({})).toBeNull();
    expect(leerAviso({ resultado: "aprobado", monto: "-5" })?.montoUsd).toBeNull();
    expect(leerAviso({ resultado: "aprobado", monto: "abc" })?.montoUsd).toBeNull();
    expect(leerAviso({ resultado: "rechazado", monto: "100" })?.montoUsd).toBeNull(); // el monto solo se muestra al aprobar
  });
  it("avisoDeResultado: sin_pago manda sobre el monto", () => {
    expect(avisoDeResultado("aprobar", { estado: "validado", montoUsd: 100, sinPago: false })).toEqual({ codigo: "aprobado", montoUsd: 100 });
    expect(avisoDeResultado("aprobar", { estado: "validado", montoUsd: 0, sinPago: true })).toEqual({ codigo: "aprobado_sin_pago", montoUsd: null });
    expect(avisoDeResultado("rechazar", { estado: "rechazado", montoUsd: null, sinPago: false }).codigo).toBe("rechazado");
    expect(avisoDeResultado("reabrir", { estado: "en_revision", montoUsd: null, sinPago: false }).codigo).toBe("reabierto");
  });
});
