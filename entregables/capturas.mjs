// Capturas para la sección 3. Uso (desde la raíz del repo): node entregables/capturas.mjs [publico|panel]
//   publico: páginas públicas del sitio publicado (sin sesión: el navegador arranca con un perfil vacío).
//   panel:   /dev/panel y /dev/panel/pool con datos ficticios; necesita `next dev` corriendo (BASE_DEV, por defecto :3197).
// Usa puppeteer-core de app/node_modules y el Chrome instalado (variable CHROME para otra ruta).
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(new URL("../app/package.json", import.meta.url));
const puppeteer = require("puppeteer-core");

const SALIDA = path.join(path.dirname(fileURLToPath(import.meta.url)), "fuente", "recursos");
const CHROME = process.env.CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SITIO = "https://worldteams-referidos.vercel.app";
const BASE_DEV = process.env.BASE_DEV ?? "http://localhost:3197";

const ESCRITORIO = { width: 1440, height: 900, deviceScaleFactor: 1.5 };
const CELULAR = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const modo = process.argv[2] ?? "publico";
const capturas =
  modo === "panel"
    ? [
        { url: `${BASE_DEV}/dev/panel`, archivo: "captura-panel-cola.png", vista: ESCRITORIO },
        { url: `${BASE_DEV}/dev/panel/pool`, archivo: "captura-panel-pool.png", vista: ESCRITORIO },
        // La tarjeta del caso de ejemplo con el motivo cv_dudoso (queda fuera de cuadro en la primera captura).
        { url: `${BASE_DEV}/dev/panel`, archivo: "captura-panel-cv-dudoso.png", vista: ESCRITORIO, tarjeta: "Valentina Ortiz" },
      ]
    : [
        { url: `${SITIO}/`, archivo: "captura-inicio-escritorio.png", vista: ESCRITORIO },
        { url: `${SITIO}/`, archivo: "captura-inicio-celular.png", vista: CELULAR },
        { url: `${SITIO}/r/lucia-k7q2m9xd`, archivo: "captura-link-escritorio.png", vista: ESCRITORIO },
        { url: `${SITIO}/r/lucia-k7q2m9xd`, archivo: "captura-link-celular.png", vista: CELULAR },
      ];

const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  for (const c of capturas) {
    const pagina = await navegador.newPage();
    await pagina.setViewport(c.vista);
    await pagina.goto(c.url, { waitUntil: "networkidle0", timeout: 60000 });
    // Deja terminar la entrada del titular y el render diferido del hero.
    await new Promise((r) => setTimeout(r, 3500));
    // En `next dev` aparece el indicador de desarrollo de Next: no es parte de la página.
    await pagina.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((n) => n.remove()));
    if (c.tarjeta) {
      // Sube desde el nombre hasta la tarjeta (el ancestro más chico que tiene los motivos) y captura solo ese elemento.
      const el = await pagina.evaluateHandle((nombre) => {
        const h = [...document.querySelectorAll("h2,h3")].find((n) => n.textContent.trim() === nombre);
        let n = h;
        while (n && n.parentElement && !/Motivos/.test(n.textContent)) n = n.parentElement;
        return n;
      }, c.tarjeta);
      await el.asElement().screenshot({ path: path.join(SALIDA, c.archivo) });
    } else {
      await pagina.screenshot({ path: path.join(SALIDA, c.archivo) });
    }
    console.log(`  ${c.archivo} <- ${c.url}`);
    await pagina.close();
  }
} finally {
  await navegador.close();
}
