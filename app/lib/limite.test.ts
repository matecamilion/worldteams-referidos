import { describe, expect, it } from "vitest";
import { crearLimitador, ipDelCliente } from "./limite";

function limitadorConReloj(fallosMaximos = 3, ventanaMs = 1000) {
  let ahora = 0;
  const l = crearLimitador({ fallosMaximos, ventanaMs, ahora: () => ahora });
  return { l, avanzar: (ms: number) => (ahora += ms) };
}

describe("crearLimitador", () => {
  it("bloquea al llegar al máximo de fallos", () => {
    const { l } = limitadorConReloj();
    l.registrarFallo("1.1.1.1", "a-000001");
    l.registrarFallo("1.1.1.1", "a-000002");
    expect(l.bloqueada("1.1.1.1")).toBe(false);
    l.registrarFallo("1.1.1.1", "a-000003");
    expect(l.bloqueada("1.1.1.1")).toBe(true);
  });

  it("repetir el mismo código roto cuenta una sola vez", () => {
    const { l } = limitadorConReloj(2);
    for (let i = 0; i < 10; i++) l.registrarFallo("1.1.1.1", "a-000001");
    expect(l.bloqueada("1.1.1.1")).toBe(false);
  });

  it("cuenta por IP: otra IP sigue libre", () => {
    const { l } = limitadorConReloj(1);
    l.registrarFallo("1.1.1.1", "a-000001");
    expect(l.bloqueada("1.1.1.1")).toBe(true);
    expect(l.bloqueada("2.2.2.2")).toBe(false);
  });

  it("libera cuando los fallos salen de la ventana", () => {
    const { l, avanzar } = limitadorConReloj(2, 1000);
    l.registrarFallo("1.1.1.1", "a-000001");
    l.registrarFallo("1.1.1.1", "a-000002");
    expect(l.bloqueada("1.1.1.1")).toBe(true);
    avanzar(1001);
    expect(l.bloqueada("1.1.1.1")).toBe(false);
  });
});

describe("ipDelCliente", () => {
  it("toma la primera IP de x-forwarded-for", () => {
    expect(ipDelCliente(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("usa x-real-ip y, sin nada, un valor fijo", () => {
    expect(ipDelCliente(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(ipDelCliente(new Headers())).toBe("desconocida");
  });

  it("prefiere los encabezados de la plataforma sobre x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "198.51.100.4", "x-vercel-forwarded-for": "203.0.113.9" });
    expect(ipDelCliente(h)).toBe("203.0.113.9");
    expect(ipDelCliente(new Headers({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });
});
