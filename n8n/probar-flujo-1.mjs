// Prueba real del flujo 1 (webhook de n8n + función registrar_referido), de punta a punta y verificada contra la API.
//
// Uso (desde la raíz del repo):
//   $env:SUPABASE_SERVICE_ROLE_KEY = "..."      # no se imprime nunca; no está en app/.env.local
//   node n8n/probar-flujo-1.mjs
//
// Variables (de la terminal o de app/.env.local, sin pisar las ya definidas):
//   N8N_WEBHOOK_URL, N8N_WEBHOOK_SECRET, NEXT_PUBLIC_SUPABASE_URL (o SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY
//
// La base es permanente (historial de solo inserción, referidos con RESTRICT): no se puede borrar lo que esto crea.
// Por eso cada corrida crea sus propios referentes ficticios y candidatos con email único por caso y por corrida
// (dominio .example, sin buzón). No usa a Lucía ni a ningún referente del seed.
// Los mails no se verifican acá: con el dominio de prueba de Resend los que no son del titular fallan a propósito.

try { process.loadEnvFile(new URL("../app/.env.local", import.meta.url)); } catch { /* sin archivo: se usan las variables de la terminal */ }

const WEBHOOK = process.env.N8N_WEBHOOK_URL;
const SECRETO = process.env.N8N_WEBHOOK_SECRET;
const BASE = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");
const CLAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const faltan = [["N8N_WEBHOOK_URL", WEBHOOK], ["N8N_WEBHOOK_SECRET", SECRETO], ["NEXT_PUBLIC_SUPABASE_URL", BASE], ["SUPABASE_SERVICE_ROLE_KEY", CLAVE]]
  .filter(([, v]) => !v).map(([k]) => k);
if (faltan.length) { console.error("Faltan variables de entorno:", faltan.join(", ")); process.exit(2); }

const corrida = Date.now().toString(36);
const sb = { apikey: CLAVE, Authorization: `Bearer ${CLAVE}` };
const resultados = [];
const verificar = (nombre, ok, detalle = "") => { resultados.push(ok); console.log(`${ok ? "OK   " : "FALLA"} ${nombre}${ok ? "" : detalle ? ` — ${detalle}` : ""}`); };

async function api(ruta, opciones = {}) {
  const r = await fetch(`${BASE}${ruta}`, { ...opciones, headers: { ...sb, ...(opciones.headers ?? {}) } });
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = texto ? JSON.parse(texto) : null; } catch { cuerpo = texto; }
  return { status: r.status, cuerpo };
}
const get = async (ruta) => (await api(ruta)).cuerpo;

async function crearReferente(tag) {
  const { status, cuerpo } = await api("/rest/v1/referentes", {
    method: "POST",
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ nombre: `Prueba${tag.toUpperCase()}`, apellido: "Flujo", email: `flujo1-${corrida}-ref-${tag}@example.com`, linkedin_url: `linkedin.com/in/flujo1-${corrida}-ref-${tag}` }),
  });
  if (status !== 201) throw new Error(`No se pudo crear el referente de prueba ${tag} (${status})`);
  return cuerpo[0];
}

const PDF = new Blob(["%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"], { type: "application/pdf" });
async function enviar(codigo, d, secreto = SECRETO) {
  const f = new FormData();
  f.set("codigo_referente", codigo);
  for (const [k, v] of Object.entries(d)) f.set(k, v);
  f.set("acepto_visibilidad", "true");
  f.set("cv", PDF, "cv.pdf");
  const r = await fetch(WEBHOOK, { method: "POST", body: f, headers: { "x-webhook-secret": secreto }, signal: AbortSignal.timeout(30_000) });
  let cuerpo = null;
  try { cuerpo = await r.json(); } catch { /* sin JSON */ }
  return { status: r.status, cuerpo };
}
const datos = (tag, sobre = {}) => ({
  nombre: "Prueba", apellido: `Caso${tag}${corrida}`, email: `flujo1-${corrida}-${tag}@example.com`,
  linkedin_url: `https://www.linkedin.com/in/flujo1-${corrida}-${tag}/`,
  especialidad: "ingenieria", usa_revit: "no", seniority: "junior", nivel_ingles: "avanzado", ...sobre,
});

async function candidatoPorEmail(email) {
  const filas = await get(`/rest/v1/candidatos?email=eq.${encodeURIComponent(email)}&select=id,email,cv_url,es_prioritario,origen`);
  return Array.isArray(filas) ? filas : [];
}
async function referidoDe(referenteId, candidatoId) {
  const filas = await get(`/rest/v1/referidos?referente_id=eq.${referenteId}&candidato_id=eq.${candidatoId}&select=id,estado,motivos_revision`);
  return filas?.[0];
}
const movimientos = async (referidoId) => get(`/rest/v1/movimientos_pago?referido_id=eq.${referidoId}&select=concepto,monto_usd,estado`);
const historial = async (referidoId) => get(`/rest/v1/historial_estados?referido_id=eq.${referidoId}&select=estado_anterior,estado_nuevo,motivo&order=id`);
const suma = (filas) => (filas ?? []).reduce((s, m) => s + Number(m.monto_usd), 0);
async function cvExiste(ruta) {
  const r = await fetch(`${BASE}/storage/v1/object/authenticated/cvs/${ruta}`, { headers: sb });
  await r.arrayBuffer();
  return r.status === 200;
}
async function nombresEnBucket() {
  const { cuerpo } = await api("/storage/v1/object/list/cvs", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 200, sortBy: { column: "created_at", order: "desc" } }),
  });
  return new Set((Array.isArray(cuerpo) ? cuerpo : []).map((o) => o.name));
}

console.log(`Corrida ${corrida} — webhook en ${new URL(WEBHOOK).host}, base en ${new URL(BASE).host}\n`);
const refA = await crearReferente("a");
const refB = await crearReferente("b");

// 0. Sin el secreto correcto el webhook no procesa nada.
const sinSecreto = await enviar(refA.codigo_referido, datos("sinsecreto"), "secreto-incorrecto");
verificar("0. Secreto incorrecto: el webhook rechaza (401/403) y no crea nada",
  [401, 403].includes(sinSecreto.status) && (await candidatoPorEmail(datos("sinsecreto").email)).length === 0, `status ${sinSecreto.status}`);

// 1. Nuevo prioritario: arquitectura + Revit + senior + inglés avanzado -> USD 100
const d1 = datos("prio", { especialidad: "arquitectura", usa_revit: "si", seniority: "senior" });
const r1 = await enviar(refA.codigo_referido, d1);
const c1 = (await candidatoPorEmail(d1.email))[0];
const ref1 = c1 && await referidoDe(refA.id, c1.id);
const mov1 = ref1 ? await movimientos(ref1.id) : [];
const his1 = ref1 ? await historial(ref1.id) : [];
verificar("1. Nuevo prioritario: responde registrado", r1.status === 200 && r1.cuerpo?.resultado === "registrado", JSON.stringify(r1));
verificar("1. Nuevo prioritario: candidato con es_prioritario (columna generada), origen referido y CV guardado",
  c1?.es_prioritario === true && c1?.origen === "referido" && !!c1?.cv_url && await cvExiste(c1.cv_url));
verificar("1. Nuevo prioritario: referido validado, pagos por USD 100 (base + extra) y 2 filas de historial",
  ref1?.estado === "validado" && suma(mov1) === 100 && mov1.length === 2 && his1?.length === 2, `estado ${ref1?.estado}, pagos ${suma(mov1)}, historial ${his1?.length}`);

// 2. Nuevo no prioritario -> USD 50
const d2 = datos("normal", { nombre: "Normalia", apellido: `Unica${corrida}` });
const r2 = await enviar(refA.codigo_referido, d2);
const c2 = (await candidatoPorEmail(d2.email))[0];
const ref2 = c2 && await referidoDe(refA.id, c2.id);
const mov2 = ref2 ? await movimientos(ref2.id) : [];
verificar("2. Nuevo no prioritario: registrado, validado y un solo pago base de USD 50",
  r2.cuerpo?.resultado === "registrado" && ref2?.estado === "validado" && suma(mov2) === 50 && mov2.length === 1 && c2?.es_prioritario === false,
  `${JSON.stringify(r2)} estado ${ref2?.estado} pagos ${suma(mov2)}`);

// 3. Ya registrado: otro referente envía a la misma persona (email en otro formato)
const antes3 = await nombresEnBucket();
const r3 = await enviar(refB.codigo_referido, datos("prio", { ...d1, email: d1.email.toUpperCase(), linkedin_url: `linkedin.com/in/otro-${corrida}` }));
const ref3 = c1 && await referidoDe(refB.id, c1.id);
const despues3 = await nombresEnBucket();
verificar("3. Ya registrado: responde ya_registrado", r3.status === 200 && r3.cuerpo?.resultado === "ya_registrado", JSON.stringify(r3));
verificar("3. Ya registrado: referido descartado con ya_en_pool, sin pagos, un solo candidato y el CV nuevo se borró",
  ref3?.estado === "descartado" && ref3?.motivos_revision?.includes("ya_en_pool") && suma(ref3 ? await movimientos(ref3.id) : [1]) === 0
  && (await candidatoPorEmail(d1.email)).length === 1 && [...despues3].every((n) => antes3.has(n)),
  `estado ${ref3?.estado}, archivos nuevos ${[...despues3].filter((n) => !antes3.has(n)).length}`);

// 4. Autorreferido: el referente se envía a sí mismo (n8n lo traduce a ya_registrado, sin rastro en la base)
const antes4 = await nombresEnBucket();
const r4 = await enviar(refA.codigo_referido, datos("auto", { email: refA.email.toUpperCase() }));
const despues4 = await nombresEnBucket();
verificar("4. Autorreferido: responde ya_registrado", r4.status === 200 && r4.cuerpo?.resultado === "ya_registrado", JSON.stringify(r4));
verificar("4. Autorreferido: no se creó candidato ni referido nuevo y el CV se borró",
  (await candidatoPorEmail(refA.email)).length === 0
  && (await get(`/rest/v1/referidos?referente_id=eq.${refA.id}&select=id`)).length === 2
  && [...despues4].every((n) => antes4.has(n)));

// 5. A revisión por posible duplicado: mismo nombre y apellido que el caso 2, otro email
const d5 = datos("dup", { nombre: "NORMALIA", apellido: `unica${corrida}` });
const r5 = await enviar(refA.codigo_referido, d5);
const c5 = (await candidatoPorEmail(d5.email))[0];
const ref5 = c5 && await referidoDe(refA.id, c5.id);
verificar("5. Duplicado por nombre: registrado, en_revision con posible_duplicado y sin pagos",
  r5.cuerpo?.resultado === "registrado" && ref5?.estado === "en_revision" && ref5?.motivos_revision?.includes("posible_duplicado")
  && suma(ref5 ? await movimientos(ref5.id) : [1]) === 0 && !!c5?.cv_url && await cvExiste(c5.cv_url),
  `${JSON.stringify(r5)} estado ${ref5?.estado}`);

// 6. Doble envío del mismo referente: no duplica (repetido) y conserva el CV original
const r6 = await enviar(refA.codigo_referido, d2);
const nCand6 = (await candidatoPorEmail(d2.email)).length;
const nRef6 = (await get(`/rest/v1/referidos?candidato_id=eq.${c2?.id}&select=id`)).length;
verificar("6. Reintento del mismo referente: registrado, sin duplicar candidato ni referido, CV original intacto",
  r6.cuerpo?.resultado === "registrado" && nCand6 === 1 && nRef6 === 1 && !!c2?.cv_url && await cvExiste(c2.cv_url));

// 7. Código inexistente
const r7 = await enviar("inexistente-00000000", datos("codigo"));
verificar("7. Código inexistente: codigo_invalido y no se creó candidato",
  r7.cuerpo?.resultado === "codigo_invalido" && (await candidatoPorEmail(datos("codigo").email)).length === 0, JSON.stringify(r7));

const fallas = resultados.filter((ok) => !ok).length;
console.log(`\n${resultados.length - fallas} OK, ${fallas} con falla (referentes de esta corrida: ${refA.email}, ${refB.email})`);
process.exit(fallas ? 1 : 0);
