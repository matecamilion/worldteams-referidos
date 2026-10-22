// Genera los PDF de la entrega desde las fuentes HTML de entregables/fuente/.
// Uso (desde la raíz del repo): node entregables/generar.mjs
// Usa puppeteer-core, que ya está en app/node_modules, y el Chrome instalado (variable CHROME para otra ruta).
// No agrega dependencias: la herramienta vive solo en entregables/.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const require = createRequire(new URL("../app/package.json", import.meta.url));
const puppeteer = require("puppeteer-core");

const DIR = path.dirname(fileURLToPath(import.meta.url));
const FUENTE = path.join(DIR, "fuente");
const CHROME = process.env.CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// Orden de la entrega. Cada sección suelta sale de su propio HTML; el PDF único concatena los mismos contenidos.
const UNICO = "WorldTeams-Referidos-Mateo-Camilion.pdf";
const SECCIONES = [
  { html: "01-esquema.html", pdf: "01-esquema.pdf" },
  { html: "02-modelo.html", pdf: "02-modelo.pdf" },
  { html: "03-landing.html", pdf: "03-landing.pdf" },
  { html: "04-flujo.html", pdf: "04-flujo.pdf" },
  { html: "05-nota.html", pdf: "05-nota.pdf" },
];

const contenido = (archivo) => {
  const html = readFileSync(path.join(FUENTE, archivo), "utf8");
  const m = html.match(/<!-- contenido -->([\s\S]*?)<!-- \/contenido -->/);
  if (!m) throw new Error(`${archivo}: faltan los marcadores de contenido`);
  return m[1];
};

// El PDF único se arma en fuente/entrega.html (generado; se edita en los archivos de cada sección).
const unico = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>WorldTeams — Programa de referidos de talento</title>
<link rel="stylesheet" href="estilos.css">
</head>
<body>
<!-- Generado por entregables/generar.mjs: no editar a mano. -->
${["00-portada.html", ...SECCIONES.map((s) => s.html)].map(contenido).join("\n")}
</body>
</html>
`;
writeFileSync(path.join(FUENTE, "entrega.html"), unico);

const navegador = await puppeteer.launch({ executablePath: CHROME, headless: true });
try {
  const imprimir = async (html, salida) => {
    const pagina = await navegador.newPage();
    await pagina.goto(pathToFileURL(path.join(FUENTE, html)).href, { waitUntil: "networkidle0" });
    // Chrome solo descarga las caras que usa el contenido; el encabezado y el pie (cajas de @page) no cuentan.
    await pagina.evaluate(() => Promise.allSettled([...document.fonts].map((f) => f.load())));
    const faltan = await pagina.evaluate(() =>
      [...document.fonts].filter((f) => f.status === "error").map((f) => f.family),
    );
    if (faltan.length) throw new Error(`${html}: no cargó la fuente ${faltan.join(", ")}`);
    await pagina.pdf({ path: path.join(DIR, salida), preferCSSPageSize: true, printBackground: true, tagged: true });
    await pagina.close();
    console.log(`  ${salida}`);
  };

  rmSync(path.join(DIR, "WorldTeams-Referidos-Entrega.pdf"), { force: true }); // nombre anterior
  await imprimir("entrega.html", UNICO);
  for (const s of SECCIONES) await imprimir(s.html, s.pdf);
} finally {
  await navegador.close();
}

// Chrome no escribe autor en el PDF: los metadatos los fija metadatos.py (PyMuPDF).
execFileSync("python", [path.join(DIR, "metadatos.py")], { stdio: "inherit" });
