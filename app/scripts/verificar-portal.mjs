// Prueba de navegador del login y del portal (puppeteer-core + Chrome instalado).
// Uso: npm run test:portal   (levanta `next dev` por su cuenta en el puerto 3198; /dev/portal solo existe en desarrollo).
// Variables: CHROME (ruta al ejecutable), CAPTURAS (carpeta donde guardar las capturas de cada estado).
// Comprueba: rutas protegidas del lado del servidor, el CTA de la home, el formulario de /ingresar, y los estados del
// portal (con datos, vacío, cargando, error) sin desborde horizontal. El login real con magic link se prueba a mano
// (ver docs/probar-login.md): necesita abrir un mail.
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const PUERTO = 3198;
const BASE = `http://localhost:${PUERTO}`;
const CHROME = process.env.CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CAPTURAS = process.env.CAPTURAS;

const fallos = [];
const ok = (cond, msg) => {
  if (!cond) fallos.push(msg);
  console.log(`${cond ? "  ok " : "  FALLA"} ${msg}`);
};

const servidor = spawn("npx", ["next", "dev", "-p", String(PUERTO)], { shell: true, stdio: "ignore" });
const apagar = () => {
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${servidor.pid} /T /F`, { stdio: "ignore" });
    else servidor.kill();
  } catch {}
};

async function esperarServidor() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}/ingresar`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("El servidor de desarrollo no levantó");
}


async function main() {
  if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
  await esperarServidor();

  console.log("Rutas protegidas (sin sesión, del lado del servidor)");
  for (const ruta of ["/portal", "/panel"]) {
    const r = await fetch(BASE + ruta, { redirect: "manual" });
    ok(r.status >= 300 && r.status < 400 && new URL(r.headers.get("location") ?? "", BASE).pathname === "/ingresar", `${ruta} sin sesión redirige a /ingresar (HTTP ${r.status})`);
  }
  const cb = await fetch(`${BASE}/auth/callback?code=invalido`, { redirect: "manual" });
  ok(new URL(cb.headers.get("location") ?? "", BASE).pathname === "/ingresar", "/auth/callback con un código inválido vuelve a /ingresar");

  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    await browser.defaultBrowserContext().overridePermissions(BASE, ["clipboard-read", "clipboard-write", "clipboard-sanitized-write"]);
    await page.bringToFront();

    console.log("Home: acceso al portal");
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(BASE, { waitUntil: "networkidle2" });
    const cta = await page.$eval('header a[href="/ingresar"]', (a) => a.textContent?.trim()).catch(() => null);
    ok(cta === "Entrar a mi portal", `la home tiene el CTA "Entrar a mi portal" hacia /ingresar (${cta})`);

    console.log("Login (/ingresar)");
    for (const ancho of [390, 1280]) {
      await page.setViewport({ width: ancho, height: 800 });
      await page.goto(`${BASE}/ingresar`, { waitUntil: "networkidle2" });
      ok(await page.$eval("h1", (h) => h.textContent?.includes("Entrá a tu portal")), `/ingresar muestra el título a ${ancho}px`);
      ok(await sinDesborde(page), `/ingresar sin desborde horizontal a ${ancho}px`);
      if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/ingresar-${ancho}.png` });
    }
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(`${BASE}/ingresar`, { waitUntil: "networkidle2" });
    await page.type("#email", "esto-no-es-un-email");
    await page.click('button[type="submit"]');
    await page.waitForFunction(() => document.querySelector("#email-error")?.textContent?.trim(), { timeout: 8000 });
    const msg = await page.$eval("#email-error", (e) => e.textContent);
    ok(msg?.includes("no parece una dirección válida"), `un email inválido muestra el error ("${msg}")`);
    if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/ingresar-error-1280.png` });
    // Un email que no está en ninguna lista: no manda ningún mail. Responde "enviado" (con la función aplicada en la base)
    // o "no disponible" (si todavía no se aplicó email_habilitado.sql); en los dos casos la página no se rompe.
    await page.goto(`${BASE}/ingresar`, { waitUntil: "networkidle2" });
    await page.waitForFunction(() => Object.keys(document.querySelector("form") ?? {}).some((k) => k.startsWith("__reactProps")), { timeout: 15000 });
    await page.type("#email", "nadie-en-la-lista@ejemplo.com");
    await page.click('button[type="submit"]');
    await page.waitForFunction(
      () => document.querySelector("#email-error")?.textContent?.trim() || document.querySelector("[role=status]")?.textContent?.includes("Si tu email está habilitado, te enviamos un link"),
      { timeout: 15000 },
    );
    const respuesta = await page.evaluate(() => document.querySelector("[role=status]")?.textContent || document.querySelector("#email-error")?.textContent);
    console.log(`    respuesta: ${respuesta}`);
    ok(/Si tu email está habilitado, te enviamos un link|no está disponible por ahora/.test(respuesta ?? ""), "un email fuera de la lista recibe la respuesta neutra (o 'no disponible' si falta aplicar la función)");
    if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/ingresar-respuesta-1280.png` });
    await page.goto(`${BASE}/ingresar?error=enlace`, { waitUntil: "networkidle2" });
    ok((await page.$eval("#email-error", (e) => e.textContent))?.includes("Ese link no sirve"), "un link vencido vuelve con el aviso");

    console.log("Portal: estados (vista previa con datos ficticios)");
    const estados = {
      datos: async () => {
        ok(await page.$eval("h1", (h) => h.textContent?.includes("Hola, Lucía")), "datos: saludo con el nombre");
        const filas = await page.$$eval('section[aria-labelledby="titulo-referidos"] li', (l) => l.map((x) => x.textContent));
        ok(filas.length === 5, `datos: 5 referidos (${filas.length})`);
        ok(filas.some((f) => f?.includes("Diego Mamani") && f.includes("No avanzó")), "datos: el rechazado se ve como 'No avanzó'");
        ok(!filas.some((f) => /rechazado|descartado/i.test(f ?? "")), "datos: nunca aparece 'rechazado' ni 'descartado'");
        ok((await page.$eval('[data-testid="premios-pendiente"]', (e) => e.textContent)) === "USD 100", "datos: pendiente USD 100");
        ok((await page.$eval('[data-testid="premios-pagado"]', (e) => e.textContent)) === "USD 50", "datos: pagado USD 50");
        ok((await page.$eval('[role="progressbar"]', (e) => e.getAttribute("aria-valuenow"))) === "67", "datos: la barra de hitos marca 67 %");
        ok((await page.$eval('[data-testid="link-personal"]', (e) => e.getAttribute("aria-label"))) === "worldteams-referidos.vercel.app/r/lucia-k7q2m9xd", "datos: el link personal");
        // Espera a que React hidrate el botón: en desarrollo `networkidle2` llega antes.
        await page.waitForFunction(() => {
          const b = document.querySelector("section button");
          return b && Object.keys(b).some((k) => k.startsWith("__reactProps"));
        }, { timeout: 15000 });
        await page.click("section button");
        await page
          .waitForFunction(() => document.querySelector("section button")?.textContent === "Copiado", { timeout: 4000 })
          .catch(async () => console.log("    texto del botón:", await page.$eval("section button", (b) => b.textContent), "| aviso:", await page.$eval("section [role=status]", (b) => b.textContent)));
        const copiado = await page.evaluate(() => navigator.clipboard.readText());
        ok(copiado === "https://worldteams-referidos.vercel.app/r/lucia-k7q2m9xd", `datos: el botón copia el link completo (${copiado})`);
      },
      vacio: async () => {
        ok(await page.$('[data-testid="vacio"]'), "vacío: muestra el estado vacío");
        ok((await page.$eval('[data-testid="vacio"]', (e) => e.textContent))?.includes("Todavía no recomendaste a nadie"), "vacío: dice 'Todavía no recomendaste a nadie'");
      },
      cargando: async () => ok(await page.$('[data-testid="cargando"]'), "cargando: muestra el esqueleto"),
      error: async () => ok((await page.$eval("h1", (h) => h.textContent))?.includes("No pudimos cargar tu portal"), "error: muestra el estado de error"),
      completo: async () => ok((await page.$eval('[role="progressbar"]', (e) => e.getAttribute("aria-valuenow"))) === "100", "completo: sin próximo hito la barra está llena"),
    };
    for (const [estado, comprobar] of Object.entries(estados)) {
      for (const ancho of [390, 1280]) {
        await page.setViewport({ width: ancho, height: 900 });
        await page.goto(`${BASE}/dev/portal?estado=${estado}`, { waitUntil: "networkidle2" });
        if (ancho === 1280) await comprobar();
        ok(await sinDesborde(page), `${estado}: sin desborde horizontal a ${ancho}px`);
        if (CAPTURAS) await page.screenshot({ path: `${CAPTURAS}/portal-${estado}-${ancho}.png`, fullPage: true });
      }
    }
  } finally {
    await browser.close();
  }
}

const sinDesborde = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

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
