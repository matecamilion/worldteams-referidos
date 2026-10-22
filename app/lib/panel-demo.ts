import { armarCola, armarPool, leerParamsPool, type FilaCola, type FilaPool } from "./panel";
import type { ResultadoCola, ResultadoPool } from "./panel-datos";

/**
 * Datos ficticios para /dev/panel (solo desarrollo): no leen la base ni la sesión. `modo` = datos | vacio | error.
 * El filtro del pool se aplica acá (la base real lo resuelve en la consulta) para que el buscador se vea funcionar.
 */
export function datosDemo(sp: Record<string, string | string[] | undefined>, ahora = new Date()) {
  const params = leerParamsPool(sp);
  const modo = Array.isArray(sp.modo) ? sp.modo[0] : sp.modo;
  const cfg = { plazoRevisionDias: 3, zona: "America/Argentina/Buenos_Aires" };
  const hace = (dias: number) => new Date(ahora.getTime() - dias * 86_400_000).toISOString();

  const candidato = (nombre: string, apellido: string, extra: Partial<NonNullable<FilaCola["candidatos"]>> = {}) => ({
    nombre,
    apellido,
    email: `${nombre.toLowerCase()}.${apellido.toLowerCase()}@ejemplo.com`,
    linkedin_url: `https://www.linkedin.com/in/${nombre.toLowerCase()}-${apellido.toLowerCase()}`,
    especialidad: "arquitectura",
    usa_revit: true,
    seniority: "senior",
    nivel_ingles: "avanzado",
    es_prioritario: true,
    cv_url: "0b9f3b1e-6d6a-4c4e-8a57-1d1f1f1f1f1f.pdf",
    ...extra,
  });
  const referente = { nombre: "Lucía", apellido: "Gómez", email: "lucia.gomez@ejemplo.com" };
  const filasCola: FilaCola[] = [
    { id: "00000000-0000-4000-8000-000000000011", creado_en: hace(9), motivos_revision: ["posible_duplicado", "alerta_volumen"], candidatos: candidato("Camila", "Restrepo"), referentes: referente },
    { id: "00000000-0000-4000-8000-000000000012", creado_en: hace(3), motivos_revision: ["perfil_incompleto"], candidatos: candidato("Joaquín", "Ferreyra", { especialidad: "ingenieria", usa_revit: false, seniority: "semi_senior", nivel_ingles: "intermedio", es_prioritario: false, cv_url: null }), referentes: referente },
    { id: "00000000-0000-4000-8000-000000000013", creado_en: hace(0), motivos_revision: ["algo_nuevo"], candidatos: candidato("Mariana", "Sousa"), referentes: { nombre: "Martín", apellido: "Ferreyra", email: "martin.ferreyra@ejemplo.com" } },
  ];
  const estados = ["validado", "en_revision", "registrado", "rechazado", "descartado"];
  const todas: FilaPool[] = Array.from({ length: 137 }, (_, i) => ({
    id: `00000000-0000-4000-9000-${String(i).padStart(12, "0")}`,
    nombre: ["Ana", "Luis", "Camila", "Joaquín"][i % 4],
    apellido: ["Paz", "Roa", "Restrepo", "Ferreyra"][i % 4],
    email: `persona${i}@ejemplo.com`,
    especialidad: i % 3 ? "arquitectura" : "ingenieria",
    origen: i % 5 ? "referido" : "directo",
    creado_en: hace(i + 1),
    referidos: i % 5 === 0 ? [] : [{ id: `00000000-0000-4000-a000-${String(i).padStart(12, "0")}`, estado: estados[(i + Math.floor(i / 5)) % 5], creado_en: hace(i), referentes: { nombre: "Lucía", apellido: "Gómez" } }],
  }));
  const palabras = params.q.toLowerCase().split(/\s+/).filter(Boolean);
  const coinciden = todas.filter(
    (f) =>
      (!params.estado || (f.referidos ?? []).some((r) => r.estado === params.estado)) &&
      palabras.every((w) => `${f.nombre} ${f.apellido} ${f.email}`.toLowerCase().includes(w)),
  );
  const pagina = coinciden.slice((params.pagina - 1) * 20, params.pagina * 20);

  const cola: ResultadoCola = modo === "error" ? { ok: false } : modo === "vacio" ? { ok: true, casos: [], total: 0 } : { ok: true, casos: armarCola(filasCola, ahora, cfg), total: 3 };
  const pool: ResultadoPool = modo === "error" ? { ok: false } : modo === "vacio" ? { ok: true, filas: [], total: 0 } : { ok: true, filas: armarPool(pagina), total: coinciden.length };
  return { cfg, cola, pool, params };
}
