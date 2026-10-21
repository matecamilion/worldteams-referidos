import { describe, expect, it } from "vitest";
import { esquemaCandidato, normalizarLinkedin } from "./esquema";

const pdf = new File(["%PDF-1.4"], "cv.pdf", { type: "application/pdf" });
const valido = {
  nombre: "Ana",
  apellido: "Pérez",
  email: "  Ana@Correo.com ",
  linkedin_url: "linkedin.com/in/ana-perez",
  especialidad: "arquitectura",
  usa_revit: "si",
  seniority: "senior",
  nivel_ingles: "avanzado",
  cv: pdf,
  acepto_visibilidad: true,
};

describe("esquemaCandidato", () => {
  it("acepta datos válidos y normaliza el email", () => {
    const r = esquemaCandidato.safeParse(valido);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("ana@correo.com");
  });
  it("rechaza LinkedIn que no es un perfil", () => {
    expect(esquemaCandidato.safeParse({ ...valido, linkedin_url: "https://example.com/in/ana" }).success).toBe(false);
    expect(esquemaCandidato.safeParse({ ...valido, linkedin_url: "linkedin.com" }).success).toBe(false);
  });
  it("rechaza CV que no es PDF o pesa más de 5 MB", () => {
    const doc = new File(["x"], "cv.docx", { type: "application/msword" });
    expect(esquemaCandidato.safeParse({ ...valido, cv: doc }).success).toBe(false);
    const grande = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "cv.pdf", { type: "application/pdf" });
    expect(esquemaCandidato.safeParse({ ...valido, cv: grande }).success).toBe(false);
  });
  it("exige aceptar el aviso de visibilidad", () => {
    expect(esquemaCandidato.safeParse({ ...valido, acepto_visibilidad: false }).success).toBe(false);
  });
});

describe("normalizarLinkedin", () => {
  it("unifica formas equivalentes", () => {
    expect(normalizarLinkedin("https://ar.linkedin.com/in/Ana-Perez/?x=1")).toBe("https://www.linkedin.com/in/ana-perez");
  });
});
