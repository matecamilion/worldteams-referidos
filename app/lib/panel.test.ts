import { describe, expect, it } from "vitest";
import {
  armarCola,
  armarPool,
  diasHabilesTranscurridos,
  esMotivoConocido,
  esUuid,
  leerConfigPanel,
  leerParamsPool,
  limpiarBusqueda,
  linkedinSeguro,
  motivoDesconocido,
  rutaCvValida,
  superaPlazo,
  terminosBusqueda,
  totalPaginas,
  urlPool,
  type FilaCola,
  type FilaPool,
} from "./panel";

const BA = "America/Argentina/Buenos_Aires";

describe("leerParamsPool", () => {
  it("valores por defecto", () => {
    expect(leerParamsPool({})).toEqual({ q: "", estado: null, pagina: 1 });
  });
  it("acepta un estado válido y descarta uno inventado", () => {
    expect(leerParamsPool({ estado: "en_revision" }).estado).toBe("en_revision");
    expect(leerParamsPool({ estado: "no_avanzo" }).estado).toBeNull();
    expect(leerParamsPool({ estado: "x'; drop table" }).estado).toBeNull();
  });
  it("la página es un entero positivo", () => {
    expect(leerParamsPool({ pagina: "3" }).pagina).toBe(3);
    for (const malo of ["0", "-2", "abc", "", "1.5e9x"]) {
      const p = leerParamsPool({ pagina: malo }).pagina;
      expect(p).toBeGreaterThanOrEqual(1);
    }
    expect(leerParamsPool({ pagina: "0" }).pagina).toBe(1);
    expect(leerParamsPool({ pagina: "abc" }).pagina).toBe(1);
    expect(leerParamsPool({ pagina: "99999999999" }).pagina).toBe(100000);
  });
  it("si un parámetro viene repetido toma el primero", () => {
    expect(leerParamsPool({ q: ["ana", "luis"], pagina: ["2", "9"] })).toMatchObject({ q: "ana", pagina: 2 });
  });
});

describe("búsqueda", () => {
  it("quita lo que rompería el filtro or=(...) de PostgREST y los comodines", () => {
    expect(limpiarBusqueda('a,b)(c"d\\e*f%g:h')).toBe("a b c d e f g h");
    // Sin paréntesis ni comas, "email.eq.x" queda dentro del valor del ilike y no puede abrir otra condición.
    expect(limpiarBusqueda("ana),email.eq.x")).toBe("ana email.eq.x");
  });
  it("conserva tildes, arroba, punto, más, guion bajo y apóstrofo", () => {
    expect(limpiarBusqueda("  María   O'Neil  ")).toBe("María O'Neil");
    expect(limpiarBusqueda("matecamilion05+lucia@gmail.com")).toBe("matecamilion05+lucia@gmail.com");
  });
  it("limita el largo y la cantidad de palabras", () => {
    expect(limpiarBusqueda("a".repeat(500)).length).toBe(80);
    expect(terminosBusqueda("uno dos tres cuatro cinco seis")).toEqual(["uno", "dos", "tres", "cuatro"]);
    expect(terminosBusqueda("   ")).toEqual([]);
    expect(terminosBusqueda("Ana Paz")).toEqual(["Ana", "Paz"]);
  });
});

describe("urlPool y paginación", () => {
  it("no escribe lo que está por defecto", () => {
    expect(urlPool({ q: "", estado: null, pagina: 1 })).toBe("/panel/pool");
    expect(urlPool({ q: "ana paz", estado: "validado", pagina: 3 })).toBe("/panel/pool?q=ana+paz&estado=validado&pagina=3");
    expect(urlPool({ q: "", estado: null, pagina: 2 }, "/dev/panel/pool")).toBe("/dev/panel/pool?pagina=2");
  });
  it("total de páginas", () => {
    expect(totalPaginas(0)).toBe(1);
    expect(totalPaginas(20)).toBe(1);
    expect(totalPaginas(21)).toBe(2);
    expect(totalPaginas(10_000)).toBe(500);
  });
});

describe("leerConfigPanel", () => {
  const ok = [
    { clave: "plazo_revision_dias_habiles", valor: 3 },
    { clave: "zona_horaria", valor: BA },
  ];
  it("lee plazo y zona", () => {
    expect(leerConfigPanel(ok)).toEqual({ plazoRevisionDias: 3, zona: BA });
  });
  it("devuelve null ante valores rotos o ausentes", () => {
    expect(leerConfigPanel([])).toBeNull();
    expect(leerConfigPanel([ok[0]])).toBeNull();
    expect(leerConfigPanel([{ clave: "plazo_revision_dias_habiles", valor: "3" }, ok[1]])).toBeNull();
    expect(leerConfigPanel([{ clave: "plazo_revision_dias_habiles", valor: 0 }, ok[1]])).toBeNull();
    expect(leerConfigPanel([{ clave: "plazo_revision_dias_habiles", valor: 2.5 }, ok[1]])).toBeNull();
    expect(leerConfigPanel([ok[0], { clave: "zona_horaria", valor: "Marte/Olimpo" }])).toBeNull();
  });
});

describe("días hábiles (lunes a viernes, sin feriados)", () => {
  // 2026-10-19 es lunes.
  const lunes = new Date("2026-10-19T15:00:00Z");
  it("el mismo día vale 0", () => {
    expect(diasHabilesTranscurridos(lunes, new Date("2026-10-19T20:00:00Z"), BA)).toBe(0);
  });
  it("lunes a jueves: 3; al viernes: 4", () => {
    expect(diasHabilesTranscurridos(lunes, new Date("2026-10-22T15:00:00Z"), BA)).toBe(3);
    expect(diasHabilesTranscurridos(lunes, new Date("2026-10-23T15:00:00Z"), BA)).toBe(4);
  });
  it("el fin de semana no cuenta", () => {
    const viernes = new Date("2026-10-23T15:00:00Z");
    expect(diasHabilesTranscurridos(viernes, new Date("2026-10-24T15:00:00Z"), BA)).toBe(0); // sábado
    expect(diasHabilesTranscurridos(viernes, new Date("2026-10-25T15:00:00Z"), BA)).toBe(0); // domingo
    expect(diasHabilesTranscurridos(viernes, new Date("2026-10-26T15:00:00Z"), BA)).toBe(1); // lunes
    expect(diasHabilesTranscurridos(viernes, new Date("2026-10-28T15:00:00Z"), BA)).toBe(3);
  });
  it("un caso del sábado cuenta desde el lunes", () => {
    const sabado = new Date("2026-10-24T15:00:00Z");
    expect(diasHabilesTranscurridos(sabado, new Date("2026-10-26T15:00:00Z"), BA)).toBe(1);
  });
  it("usa el día de la zona de la configuración, no el de UTC", () => {
    // 2026-10-20 02:00 UTC es lunes 19 a las 23:00 en Buenos Aires.
    const desde = new Date("2026-10-20T02:00:00Z");
    const hasta = new Date("2026-10-20T15:00:00Z"); // martes 20 en Buenos Aires
    expect(diasHabilesTranscurridos(desde, hasta, BA)).toBe(1);
    expect(diasHabilesTranscurridos(desde, hasta, "UTC")).toBe(0);
  });
  it("acepta ISO como texto y no se rompe con fechas inválidas ni futuras", () => {
    expect(diasHabilesTranscurridos("2026-10-19T15:00:00Z", new Date("2026-10-21T15:00:00Z"), BA)).toBe(2);
    expect(diasHabilesTranscurridos("no es fecha", lunes, BA)).toBe(0);
    expect(diasHabilesTranscurridos(new Date("2026-10-23T15:00:00Z"), lunes, BA)).toBe(0);
  });
  it("supera el plazo solo cuando pasa de él", () => {
    expect(superaPlazo(3, 3)).toBe(false);
    expect(superaPlazo(4, 3)).toBe(true);
    expect(superaPlazo(0, 3)).toBe(false);
  });
});

const filaCola = (extra: Partial<FilaCola> = {}): FilaCola => ({
  id: "r1",
  creado_en: "2026-10-19T15:00:00Z",
  motivos_revision: ["perfil_incompleto"],
  candidatos: {
    nombre: "Ana",
    apellido: "Paz",
    email: "ana@x.com",
    linkedin_url: "https://www.linkedin.com/in/ana-paz",
    especialidad: "arquitectura",
    usa_revit: true,
    seniority: "senior",
    nivel_ingles: "avanzado",
    es_prioritario: true,
    cv_url: "0b9f3b1e-6d6a-4c4e-8a57-1d1f1f1f1f1f.pdf",
  },
  referentes: { nombre: "Lucía", apellido: "Gómez", email: "lucia@x.com" },
  ...extra,
});

describe("armarCola", () => {
  const cfg = { plazoRevisionDias: 3, zona: BA };
  const ahora = new Date("2026-10-23T15:00:00Z"); // viernes
  it("arma el caso y marca el vencido (4 días hábiles > 3)", () => {
    const [caso] = armarCola([filaCola()], ahora, cfg);
    expect(caso).toMatchObject({
      id: "r1",
      diasHabiles: 4,
      vencido: true,
      motivos: ["perfil_incompleto"],
      tieneCv: true,
      candidato: { nombreCompleto: "Ana Paz", linkedin: "https://www.linkedin.com/in/ana-paz", esPrioritario: true },
      referente: { nombreCompleto: "Lucía Gómez", email: "lucia@x.com" },
    });
  });
  it("no expone la ruta del CV, solo si existe", () => {
    const [caso] = armarCola([filaCola()], ahora, cfg);
    expect(JSON.stringify(caso)).not.toContain(".pdf");
    expect(armarCola([filaCola({ candidatos: { ...filaCola().candidatos!, cv_url: null } })], ahora, cfg)[0].tieneCv).toBe(false);
  });
  it("un caso dentro del plazo no se marca", () => {
    const [caso] = armarCola([filaCola({ creado_en: "2026-10-21T15:00:00Z" })], ahora, cfg);
    expect(caso.diasHabiles).toBe(2);
    expect(caso.vencido).toBe(false);
  });
  it("ordena del más viejo al más nuevo y descarta filas incompletas", () => {
    const casos = armarCola(
      [
        filaCola({ id: "nuevo", creado_en: "2026-10-22T10:00:00Z" }),
        filaCola({ id: "viejo", creado_en: "2026-10-15T10:00:00Z" }),
        filaCola({ id: "sin-referente", referentes: null }),
        filaCola({ id: "sin-candidato", candidatos: null }),
      ],
      ahora,
      cfg,
    );
    expect(casos.map((c) => c.id)).toEqual(["viejo", "nuevo"]);
  });
  it("motivos nulos quedan como lista vacía", () => {
    expect(armarCola([filaCola({ motivos_revision: null })], ahora, cfg)[0].motivos).toEqual([]);
  });
  it("un LinkedIn que no es de https://linkedin.com no se enlaza", () => {
    expect(linkedinSeguro("https://www.linkedin.com/in/ana-paz")).toBe("https://www.linkedin.com/in/ana-paz");
    for (const malo of ["javascript:alert(1)", "http://www.linkedin.com/in/x", "https://evil.com/in/x", "https://linkedin.com.evil.com/in/x", "", null, undefined]) {
      expect(linkedinSeguro(malo)).toBeNull();
    }
  });
});

describe("motivos", () => {
  it("conoce los tres de la base y muestra legible uno nuevo", () => {
    for (const m of ["posible_duplicado", "alerta_volumen", "perfil_incompleto"]) expect(esMotivoConocido(m)).toBe(true);
    expect(esMotivoConocido("otro")).toBe(false);
    expect(motivoDesconocido("senal_rara_nueva")).toBe("senal rara nueva");
  });
});

describe("armarPool (una fila por candidato)", () => {
  const base = { id: "c1", nombre: "Ana", apellido: "Paz", email: "ana@x.com", especialidad: "arquitectura", origen: "referido", creado_en: "2026-10-01T10:00:00Z" };
  it("con varios referidos muestra el más reciente", () => {
    const fila: FilaPool = {
      ...base,
      referidos: [
        { estado: "validado", creado_en: "2026-10-02T10:00:00Z", referentes: { nombre: "Lucía", apellido: "Gómez" } },
        { estado: "descartado", creado_en: "2026-10-09T10:00:00Z", referentes: { nombre: "Martín", apellido: "Ferreyra" } },
      ],
    };
    expect(armarPool([fila])[0]).toMatchObject({ estado: "descartado", referente: "Martín Ferreyra", nombreCompleto: "Ana Paz" });
  });
  it("sin referidos es un candidato directo", () => {
    expect(armarPool([{ ...base, origen: "directo", referidos: [] }])[0]).toMatchObject({ estado: null, referente: null });
    expect(armarPool([{ ...base, referidos: null }])[0].estado).toBeNull();
  });
  it("un estado desconocido no se muestra como si lo fuera", () => {
    const fila: FilaPool = { ...base, referidos: [{ estado: "inventado", creado_en: "2026-10-02T10:00:00Z", referentes: null }] };
    expect(armarPool([fila])[0]).toMatchObject({ estado: null, referente: null });
  });
});

describe("ruta del CV", () => {
  it("solo se firma <uuid>.pdf", () => {
    expect(rutaCvValida("0b9f3b1e-6d6a-4c4e-8a57-1d1f1f1f1f1f.pdf")).toBe(true);
    for (const mala of ["../secreto.pdf", "carpeta/0b9f3b1e-6d6a-4c4e-8a57-1d1f1f1f1f1f.pdf", "cv.pdf", "0b9f3b1e-6d6a-4c4e-8a57-1d1f1f1f1f1f", "", null, undefined]) {
      expect(rutaCvValida(mala)).toBe(false);
    }
  });
  it("el id del caso tiene que ser un uuid", () => {
    expect(esUuid("0b9f3b1e-6d6a-4c4e-8a57-1d1f1f1f1f1f")).toBe(true);
    expect(esUuid("1; drop")).toBe(false);
  });
});
