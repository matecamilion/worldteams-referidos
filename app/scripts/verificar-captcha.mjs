// Prueba en modo real de reCAPTCHA en /api/referir (puppeteer-core + Chrome instalado).
// Uso: npm run test:captcha   (levanta `next dev` en el puerto 3197 con NEXT_PUBLIC_DEMO=false; las claves salen de .env.local
// y no se imprimen). El webhook de n8n se apunta a un puerto cerrado: nada sale de la máquina, así que un envío que pasa
// el captcha tiene que fallar después con 502.
// Comprueba: sin token -> 403; token inventado -> 403; token real -> NO es 403 (pasó la verificación, falla recién en n8n);
// el script de Google se carga en /r/[codigo] y no en la home.
// Un token real exige un puntaje alto: si Chrome headless saca menos que RECAPTCHA_MIN_SCORE, la prueba lo informa.
import { spawn, execSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const PUERTO = 3197;
const BASE = `http://localhost:${PUERTO}`;
const CHROME = process.env.CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CODIGO = "lucia-k7q2m9xd";

const fallos = [];
const ok = (cond, msg) => {
  if (!cond) fallos.push(msg);
  console.log(`${cond ? "  ok " : "  FALLA"} ${msg}`);
};

const servidor = spawn("npx", ["next", "dev", "-p", String(PUERTO)], {
  shell: true,
  stdio: "ignore",
  env: { ...process.env, NEXT_PUBLIC_DEMO: "false", NEXT_DIST_DIR: ".next-captcha", N8N_WEBHOOK_URL: "http://127.0.0.1:9/webhook" },
});
const apagar = () => {
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${servidor.pid} /T /F`, { stdio: "ignore" });
    else servidor.kill();
  } catch {}
};

async function esperarServidor() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("El servidor de desarrollo no levantó");
}

const PDF = "%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n";
const cuerpo = (token) => {
  const f = new FormData();
  f.set("codigo_referente", CODIGO);
  f.set("nombre", "Prueba");
  f.set("apellido", "Captcha");
  f.set("email", `captcha.${Date.now()}@ejemplo.com`);
  f.set("linkedin_url", `https://www.linkedin.com/in/prueba-captcha-${Date.now()}`);
  f.set("especialidad", "ingenieria");
  f.set("usa_revit", "no");
  f.set("seniority", "junior");
  f.set("nivel_ingles", "intermedio");
  f.set("acepto_visibilidad", "true");
  f.set("cv", new Blob([PDF], { type: "application/pdf" }), "cv.pdf");
  if (token !== undefined) f.set("recaptcha_token", token);
  return f;
};

async function main() {
  await esperarServidor();

  console.log("Servidor: sin token y con token inventado");
  let r = await fetch(`${BASE}/api/referir`, { method: "POST", body: cuerpo() });
  ok(r.status === 403, `sin token responde 403 (${r.status})`);
  r = await fetch(`${BASE}/api/referir`, { method: "POST", body: cuerpo("token-inventado") });
  ok(r.status === 403, `con un token inventado responde 403 (${r.status})`);

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    const scripts = [];
    page.on("request", (q) => q.url().includes("recaptcha/api.js") && scripts.push(q.url().split("?")[0]));

    console.log("Script de Google solo en /r/[codigo]");
    await page.goto(BASE, { waitUntil: "networkidle2" });
    ok(scripts.length === 0, "la home no carga reCAPTCHA");

    await page.goto(`${BASE}/r/${CODIGO}`, { waitUntil: "networkidle2" });
    ok(scripts.length === 0, "/r/[codigo] no lo carga hasta que la persona toca el formulario");
    await page.waitForFunction(() => document.querySelector("#nombre") && Object.keys(document.querySelector("form") ?? {}).some((k) => k.startsWith("__reactProps")), { timeout: 20000 });
    await page.focus("#nombre");
    await page.waitForFunction(() => window.grecaptcha?.execute, { timeout: 15000 });
    ok(scripts.length === 1, "al enfocar el formulario se carga el script de reCAPTCHA");

    console.log("Servidor: token real");
    const token = await page.evaluate(
      (clave) => new Promise((res) => window.grecaptcha.ready(() => window.grecaptcha.execute(clave, { action: "referir" }).then(res)))
      , await leerClavePublica(page),
    );
    const resp = await page.evaluate(async (t, pdf) => {
      const f = new FormData();
      const base = { codigo_referente: "lucia-k7q2m9xd", nombre: "Prueba", apellido: "Captcha", email: `captcha.${Date.now()}@ejemplo.com`, linkedin_url: `https://www.linkedin.com/in/prueba-captcha-${Date.now()}`, especialidad: "ingenieria", usa_revit: "no", seniority: "junior", nivel_ingles: "intermedio", acepto_visibilidad: "true", recaptcha_token: t };
      for (const [k, v] of Object.entries(base)) f.set(k, v);
      f.set("cv", new Blob([pdf], { type: "application/pdf" }), "cv.pdf");
      const r = await fetch("/api/referir", { method: "POST", body: f });
      return { status: r.status, cuerpo: await r.json().catch(() => null) };
    }, token, PDF);
    if (resp.status === 403) {
      console.log(`  AVISO el token real fue rechazado (403: ${resp.cuerpo?.mensaje}). Si es por puntaje, Chrome headless no llega a RECAPTCHA_MIN_SCORE.`);
    }
    ok(resp.status !== 403, `un token real no devuelve 403 (${resp.status})`);
    ok(resp.status === 502, `pasó el captcha y falló recién en n8n con 502 (${resp.status})`);
  } finally {
    await browser.close();
  }
}

// La clave pública llega al navegador dentro del script que ya cargó; se lee de la URL de api.js.
async function leerClavePublica(page) {
  return page.evaluate(() => new URL([...document.scripts].find((s) => s.src.includes("recaptcha/api.js")).src).searchParams.get("render"));
}

try {
  await main();
} catch (e) {
  fallos.push(String(e));
  console.error(e);
} finally {
  apagar();
}
console.log(fallos.length ? `\n${fallos.length} fallo(s)` : "\nTodo ok");
process.exit(fallos.length ? 1 : 0);
