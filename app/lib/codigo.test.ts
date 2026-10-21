import { describe, expect, it } from "vitest";
import { generarCodigo, generarSufijo, normalizarNombre, tieneFormatoDeCodigo } from "./codigo";
import { referentesDemo } from "./demo-data";

describe("normalizarNombre", () => {
  it("saca tildes, pasa a minúsculas y une con guiones", () => {
    expect(normalizarNombre("Lucía")).toBe("lucia");
    expect(normalizarNombre("María José")).toBe("maria-jose");
    expect(normalizarNombre("  Ñandú! ")).toBe("nandu");
  });
});

describe("generarSufijo", () => {
  it("tiene 6 caracteres base36", () => {
    for (let i = 0; i < 200; i++) expect(generarSufijo()).toMatch(/^[0-9a-z]{6}$/);
  });

  it("no repite en una muestra grande", () => {
    const vistos = new Set(Array.from({ length: 5000 }, () => generarSufijo()));
    expect(vistos.size).toBe(5000);
  });

  it("usa los 36 caracteres del alfabeto", () => {
    const usados = new Set(Array.from({ length: 2000 }, () => generarSufijo()).join(""));
    expect(usados.size).toBe(36);
  });
});

describe("generarCodigo", () => {
  it("une el nombre normalizado con el sufijo y pasa la validación de formato", () => {
    const c = generarCodigo("Lucía");
    expect(c).toMatch(/^lucia-[0-9a-z]{6}$/);
    expect(tieneFormatoDeCodigo(c)).toBe(true);
  });

  it("usa un nombre de respaldo si no queda ningún carácter válido", () => {
    expect(generarCodigo("***")).toMatch(/^ref-[0-9a-z]{6}$/);
  });
});

describe("tieneFormatoDeCodigo", () => {
  it("acepta los códigos de la demo", () => {
    for (const r of referentesDemo) expect(tieneFormatoDeCodigo(r.codigo)).toBe(true);
  });

  it("rechaza el formato viejo, que era solo el nombre", () => {
    expect(tieneFormatoDeCodigo("lucia-gomez")).toBe(false);
    expect(tieneFormatoDeCodigo("martin-ferreyra")).toBe(false);
  });

  it("rechaza mayúsculas, caracteres raros y largos excesivos", () => {
    expect(tieneFormatoDeCodigo("Lucia-K7Q2M9")).toBe(false);
    expect(tieneFormatoDeCodigo("lucia-k7q2m")).toBe(false);
    expect(tieneFormatoDeCodigo("../etc/passwd")).toBe(false);
    expect(tieneFormatoDeCodigo(`${"a".repeat(80)}-k7q2m9`)).toBe(false);
  });
});
