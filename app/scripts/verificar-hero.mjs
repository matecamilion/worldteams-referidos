// Prueba de navegador (puppeteer-core + Chrome instalado): rotación del titular y links largos de las maquetas.
// Uso: npm run build && npm run test:e2e   (levanta `next start` por su cuenta en el puerto 3199).
// Variables: CHROME (ruta al ejecutable), CAPTURAS (carpeta donde guardar capturas de la transición cada ~50 ms).
import { spawn, execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import puppeteer from "puppeteer-core";

const PUERTO = 3199;
const BASE = `http://localhost:${PUERTO}`;
const CHROME = process.env.CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const CAPTURAS = process.env.CAPTURAS;

const fallos = [];
const ok = (cond, msg) => {
  if (!cond) fallos.push(msg);
  console.log(`${cond ? "  ok " : "  FALLA"} ${msg}`);
};

const servidor = spawn("npx", ["next", "start", "-p", String(PUERTO)], { shell: true, stdio: "ignore" });
const apagar = () => {
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${servidor.pid} /T /F`, { stdio: "ignore" });
    else servidor.kill();
  } catch {}
};

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("El servidor no levantó: ¿falta `npm run build`?");
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Muestrea cada cuadro el estado de los fragmentos del titular durante `ms`. */
const muestrear = (page, ms) =>
  page.evaluate(
    (ms) =>
      new Promise((resolver) => {
        const caja = document.querySelector("[data-fragmento]").parentElement;
        const items = [...document.querySelectorAll("[data-fragmento]")];
        const bajada = caja.closest("h1").nextElementSibling;
        const cuadros = [];
        const t0 = performance.now();
        const paso = () => {
          const rc = caja.getBoundingClientRect();
          cuadros.push({
            t: performance.now() - t0,
            alto: rc.height,
            choca: rc.bottom > bajada.getBoundingClientRect().top + 0.5,
            items: items.map((el) => {
              const e = getComputedStyle(el);
              const r = el.getBoundingClientRect();
              return { visible: e.visibility !== "hidden" && Number(e.opacity) > 0.02, top: r.top, bottom: r.bottom };
            }),
          });
          if (performance.now() - t0 < ms) requestAnimationFrame(paso);
          else resolver(cuadros);
        };
        paso();
      }),
    ms,
  );

async function probarTitular(browser, ancho) {
  console.log(`\nTitular a ${ancho}px`);
  const page = await browser.newPage();
  await page.setViewport({ width: ancho, height: 900 });
  await page.goto(BASE, { waitUntil: "load" });
  const sondeo = muestrear(page, 11000);
  // Ráfaga de capturas (~50 ms) alrededor de la primera transición, si se pidió.
  if (CAPTURAS) {
    mkdirSync(CAPTURAS, { recursive: true });
    await dormir(2300);
    const h1 = await page.$("h1");
    const caja = await h1.boundingBox();
    for (let i = 0; i < 40; i++) {
      await page.screenshot({ path: `${CAPTURAS}/titular-${ancho}-${String(i).padStart(2, "0")}.png`, clip: { ...caja, height: caja.height + 20 } });
      await dormir(30);
    }
  }
  const cuadros = await sondeo;
  const dosVisibles = cuadros.filter((c) => c.items.filter((i) => i.visible).length > 1);
  const superpuestos = cuadros.filter((c) => {
    const v = c.items.filter((i) => i.visible);
    return v.some((a, i) => v.some((b, j) => i < j && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5));
  });
  let cambios = 0;
  let previo = -1;
  for (const c of cuadros) {
    const idx = c.items.findIndex((x) => x.visible);
    if (idx < 0) continue;
    if (previo >= 0 && idx !== previo) cambios++;
    previo = idx;
  }
  ok(cambios >= 2, `rotó al menos 2 veces (${cambios} cambios en ${cuadros.length} cuadros)`);
  ok(dosVisibles.length === 0, `nunca dos frases visibles a la vez (${dosVisibles.length} cuadros con dos)`);
  ok(superpuestos.length === 0, `las cajas de las frases visibles nunca se superponen (${superpuestos.length} cuadros)`);
  // Se ignora la entrada del titular (0,8 s de máscara al cargar): ahí la caja está desplazada a propósito.
  ok(cuadros.filter((c) => c.t > 1500).every((c) => !c.choca), "la caja del titular nunca pisa la bajada");
  const vacios = cuadros.filter((c) => c.items.every((i) => !i.visible)).length;
  const saltos = cuadros.slice(1).filter((c, i) => Math.abs(c.alto - cuadros[i].alto) > 60).length;
  ok(saltos === 0, `el alto de la caja cambia sin saltos (${saltos}); cuadros sin frase visible: ${vacios}`);
  await page.close();
}

async function probarSinMovimiento(browser) {
  console.log("\nMovimiento reducido y sin JavaScript");
  for (const modo of ["reducido", "sin-js"]) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    if (modo === "reducido") await page.emulateMediaFeatures([{ name: "prefers-reduced-motion", value: "reduce" }]);
    else await page.setJavaScriptEnabled(false);
    await page.goto(BASE, { waitUntil: "load" });
    await dormir(modo === "reducido" ? 7000 : 500);
    const visibles = await page.evaluate(() =>
      [...document.querySelectorAll("[data-fragmento]")].map((el) => {
        const e = getComputedStyle(el);
        return e.visibility !== "hidden" && e.display !== "none" && Number(e.opacity) > 0.02;
      }),
    );
    ok(visibles[0] && visibles.slice(1).every((v) => !v), `${modo}: solo se ve la primera frase`);
    await page.close();
  }
}

async function probarLinks(browser, ancho) {
  console.log(`\nLinks de las maquetas a ${ancho}px`);
  const page = await browser.newPage();
  await page.setViewport({ width: ancho, height: 800 });
  await page.goto(BASE, { waitUntil: "load" });
  await dormir(500);
  const r = await page.evaluate(() => {
    const parte = /worldteams-referidos|\.vercel\.app|andrea-h5t8c2qf/;
    const nodos = [];
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (parte.test(n.textContent)) nodos.push(n);
    const recorta = (el) => {
      const ancestros = [];
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (getComputedStyle(p).overflowX !== "visible") ancestros.push(p);
      }
      return ancestros;
    };
    const cajaDe = (el) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const e = getComputedStyle(p);
        if (parseFloat(e.borderTopWidth) > 0) {
          const rc = p.getBoundingClientRect();
          return rc.right - parseFloat(e.borderRightWidth) - parseFloat(e.paddingRight);
        }
      }
      return Infinity;
    };
    return {
      scrollDoc: document.documentElement.scrollWidth,
      ancho: innerWidth,
      nodos: nodos.map((n) => {
        const rango = document.createRange();
        rango.selectNodeContents(n);
        const r = rango.getBoundingClientRect();
        return {
          texto: n.textContent.trim(),
          lineas: rango.getClientRects().length,
          limiteCaja: cajaDe(n.parentElement),
          derecha: r.right,
          izquierda: r.left,
          recortes: recorta(n.parentElement).map((a) => {
            const rc = a.getBoundingClientRect();
            return { derecha: rc.right, izquierda: rc.left };
          }),
        };
      }),
    };
  });
  r.nodos = r.nodos.filter((n) => n.lineas > 0); // los que no se dibujan (display: none) no cuentan
  ok(r.nodos.length >= 5, `se encontraron los links de las dos maquetas (${r.nodos.length} fragmentos dibujados)`);
  ok(r.scrollDoc <= r.ancho, `sin scroll horizontal (documento ${r.scrollDoc}px, ventana ${r.ancho}px)`);
  for (const n of r.nodos) {
    ok(n.lineas === 1, `"${n.texto}" en una sola línea (no se parte a mitad de palabra)`);
    const dentro =
      n.derecha <= n.limiteCaja + 0.5 &&
      n.derecha <= r.ancho + 0.5 && n.izquierda >= -0.5 && n.recortes.every((c) => n.derecha <= c.derecha + 0.5 && n.izquierda >= c.izquierda - 0.5);
    ok(dentro, `"${n.texto}" entra en su caja, en el marco y en la pantalla (derecha ${n.derecha.toFixed(1)}px)`);
  }
  await page.close();
}

try {
  await esperarServidor();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    for (const a of [390, 768, 1024, 1440]) await probarTitular(browser, a);
    await probarSinMovimiento(browser);
    for (const a of [390, 320]) await probarLinks(browser, a);
  } finally {
    await browser.close();
  }
} finally {
  apagar();
}
console.log(fallos.length ? `\n${fallos.length} fallas` : "\nTodo en orden");
process.exit(fallos.length ? 1 : 0);
