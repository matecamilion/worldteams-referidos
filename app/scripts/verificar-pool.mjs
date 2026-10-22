// Prueba de navegador del buscador y el filtro del talent pool (puppeteer-core + Chrome instalado).
// Uso: npm run test:pool   (levanta `next dev` por su cuenta en el puerto 3197; /dev/panel/pool solo existe en desarrollo).
//      BASE_URL=http://localhost:3000 npm run test:pool   (reutiliza el servidor de desarrollo que ya tengas corriendo).
// Variables: CHROME (ruta al ejecutable).
// Comprueba, con datos ficticios: retardo de 300 ms (una sola navegación al escribir de corrido), que no sume historial
// (replace), reinicio a la página 1, mínimo de 2 caracteres, filtro de estado, que el campo no pierda el foco ni el
// cursor al recargar la tabla, el indicador de carga, el aria-live y el respaldo sin JavaScript.
import { spawn, execSync } from "node:child_process";
import puppeteer from "puppeteer-core";

const PUERTO = 3197;
// Con BASE_URL (por ejemplo http://localhost:3000) usa un `next dev` que ya esté corriendo, en vez de levantar otro:
// dos `next dev` sobre el mismo proyecto se pisan.
const BASE = process.env.BASE_URL ?? `http://localhost:${PUERTO}`;
const RUTA = "/dev/panel/pool";
const CHROME = process.env.CHROME ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

const fallos = [];
const ok = (cond, msg) => {
  if (!cond) fallos.push(msg);
  console.log(`${cond ? "  ok " : "  FALLA"} ${msg}`);
};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

const servidor = process.env.BASE_URL ? null : spawn("npx", ["next", "dev", "-p", String(PUERTO)], { shell: true, stdio: "ignore" });
const apagar = () => {
  if (!servidor) return;
  try {
    if (process.platform === "win32") execSync(`taskkill /pid ${servidor.pid} /T /F`, { stdio: "ignore" });
    else servidor.kill();
  } catch {}
};

async function esperarServidor() {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${BASE}${RUTA}`)).ok) return;
    } catch {}
    await espera(500);
  }
  throw new Error("El servidor de desarrollo no levantó");
}

async function main() {
  await esperarServidor();
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    const search = () => new URL(page.url()).searchParams;
    const esperarUrl = (fn, ms = 8000) => page.waitForFunction(fn, { timeout: ms }).then(() => true, () => false);
    const cargar = async (ruta) => {
      await page.goto(BASE + ruta, { waitUntil: "networkidle0" });
      await page.waitForSelector("#pool-q");
      await espera(400); // que termine de hidratar
    };
    let navegaciones = 0;
    page.on("request", (r) => {
      if (r.url().startsWith(BASE + RUTA) && /[?&](q|estado)=/.test(r.url()) && r.url().includes("_rsc")) navegaciones++;
    });

    console.log("Con JavaScript: buscar mientras se escribe");
    await cargar(RUTA + "?pagina=3");
    ok(search().get("pagina") === "3", "arranca en la página 3");
    ok((await page.$$eval("button[type=submit]", (b) => b.filter((x) => x.textContent.trim() === "Buscar").length)) === 0, "el botón Buscar no existe con JavaScript");
    const historia = await page.evaluate(() => history.length);
    await page.evaluate(() => {
      window.__vioSpinner = false;
      new MutationObserver(() => {
        if (document.querySelector('[data-testid="pool-cargando"]')) window.__vioSpinner = true;
      }).observe(document.body, { childList: true, subtree: true });
    });
    const resumenAntes = await page.$eval('[data-testid="pool-anuncio"]', (e) => e.textContent);

    await page.focus("#pool-q");
    navegaciones = 0;
    await page.keyboard.type("persona1", { delay: 40 }); // 8 caracteres de corrido, ~320 ms en total
    await espera(150);
    ok(search().get("q") === null, "antes de los 300 ms no cambió la URL");
    ok(await esperarUrl(() => new URL(location.href).searchParams.get("q") === "persona1"), "pasado el retardo la URL tiene q=persona1");
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="fila-pool"]').length > 0 && !document.querySelector('[data-testid="pool-cargando"]'), { timeout: 8000 });
    ok(navegaciones === 1, `una sola navegación para 8 teclas seguidas (fueron ${navegaciones})`);
    ok(search().get("pagina") === null, "al buscar vuelve a la página 1 (sin ?pagina)");
    ok((await page.evaluate(() => history.length)) === historia, "no suma entradas al historial (replace)");
    ok(await page.evaluate(() => window.__vioSpinner), "se mostró el indicador de carga mientras la transición estaba pendiente");
    ok((await page.$("[data-testid=pool-cargando]")) === null, "el indicador desaparece al terminar");
    const filas = await page.$$eval('[data-testid="fila-pool"] th', (t) => t.length);
    ok(filas > 0 && (await page.$$eval('[data-testid="fila-pool"] td:nth-child(2)', (t) => t.every((x) => x.textContent.includes("persona1")))), `la tabla muestra solo coincidencias (${filas} filas)`);
    const resumenDespues = await page.$eval('[data-testid="pool-anuncio"]', (e) => e.textContent);
    ok(resumenDespues !== resumenAntes && /candidatos/.test(resumenDespues), `la región aria-live cambió: «${resumenDespues}»`);
    ok(await page.$eval('[data-testid="pool-anuncio"]', (e) => e.getAttribute("aria-live") === "polite"), 'la región tiene aria-live="polite"');

    console.log("Foco y cursor");
    ok(await page.evaluate(() => document.activeElement?.id === "pool-q"), "el campo conserva el foco después de recargar la tabla");
    ok((await page.$eval("#pool-q", (i) => i.value)) === "persona1", "y conserva lo escrito");
    // Cursor en el medio, escribir, y que después de la recarga siga ahí (no salte al final).
    await page.evaluate(() => document.querySelector("#pool-q").setSelectionRange(3, 3));
    await page.keyboard.type("X");
    await page.keyboard.press("Backspace"); // vuelve a "persona1": la URL ya está así y no navega
    const cursor = await page.$eval("#pool-q", (i) => [i.selectionStart, i.value]);
    ok(cursor[0] === 3 && cursor[1] === "persona1", `el cursor queda donde estaba (posición ${cursor[0]})`);
    await page.keyboard.press("End");
    await page.keyboard.type("2", { delay: 20 });
    ok(await esperarUrl(() => new URL(location.href).searchParams.get("q") === "persona12"), "seguir escribiendo después de una recarga funciona (q=persona12)");
    await page.waitForFunction(() => !document.querySelector('[data-testid="pool-cargando"]'), { timeout: 8000 });
    ok((await page.$eval("#pool-q", (i) => i.value)) === "persona12" && (await page.evaluate(() => document.activeElement?.id === "pool-q")), "no se perdió ninguna letra ni el foco");

    console.log("Mínimo de 2 caracteres");
    await cargar(RUTA);
    await page.focus("#pool-q");
    navegaciones = 0;
    await page.keyboard.type("a");
    await espera(700);
    ok(search().get("q") === null && navegaciones === 0, "un solo carácter no filtra ni navega");
    await page.keyboard.type("n");
    ok(await esperarUrl(() => new URL(location.href).searchParams.get("q") === "an"), "con 2 caracteres filtra (q=an)");
    await page.waitForFunction(() => !document.querySelector('[data-testid="pool-cargando"]'), { timeout: 8000 });
    await page.keyboard.press("Backspace"); // queda "a"
    await espera(700);
    ok(search().get("q") === "an", "bajar a 1 carácter deja el listado como estaba (no vuelve al completo)");
    await page.keyboard.press("Backspace"); // queda vacío
    ok(await esperarUrl(() => new URL(location.href).searchParams.get("q") === null), "vaciar el campo vuelve al listado completo");

    console.log("Filtro de estado: sin retardo, conserva la búsqueda y vuelve a la página 1");
    await cargar(RUTA + "?q=persona&pagina=2");
    ok(search().get("pagina") === "2", "arranca en la página 2 con q=persona");
    await page.select("#pool-estado", "rechazado");
    ok(await esperarUrl(() => new URL(location.href).searchParams.get("estado") === "rechazado"), "al cambiar el filtro la URL tiene estado=rechazado");
    ok(search().get("q") === "persona" && search().get("pagina") === null, "conserva q y vuelve a la página 1");
    await page.waitForFunction(() => !document.querySelector('[data-testid="pool-cargando"]'), { timeout: 8000 });
    const estados = await page.$$eval('[data-testid="fila-pool"]', (f) => f.map((x) => x.textContent.includes("Rechazado")));
    ok(estados.length > 0 && estados.every(Boolean), `la tabla muestra solo rechazados (${estados.length})`);
    ok(!(await page.$eval("#pool-estado", (s) => [...s.options].some((o) => o.value === "registrado"))), 'el filtro no ofrece "Registrado"');
    await page.select("#pool-estado", "");
    ok(await esperarUrl(() => new URL(location.href).searchParams.get("estado") === null), "volver a «Todos» quita el filtro");

    console.log("Enter aplica ya, sin esperar");
    await cargar(RUTA);
    await page.focus("#pool-q");
    await page.keyboard.type("luis");
    await page.keyboard.press("Enter");
    ok(await esperarUrl(() => new URL(location.href).searchParams.get("q") === "luis", 5000), "Enter aplica la búsqueda y no recarga la página entera");

    console.log("Limpiar y cambios de URL por fuera de la barra");
    await page.waitForSelector('form a[href="/dev/panel/pool"]', { timeout: 8000 }); // aparece cuando el servidor ya devolvió la búsqueda
    await page.click('form a[href="/dev/panel/pool"]');
    ok(await esperarUrl(() => document.querySelector("#pool-q").value === "" && !new URL(location.href).searchParams.get("q")), "«Limpiar» vacía el campo y quita los filtros");
    ok(await esperarUrl(() => !document.querySelector('form a[href="/dev/panel/pool"]')), "y el botón Limpiar desaparece");
    // La pestaña «Talent pool» del menú lleva a la misma ruta sin filtros: el campo tiene que vaciarse también.
    await cargar(RUTA + "?q=persona&estado=validado");
    ok((await page.$eval("#pool-q", (i) => i.value)) === "persona" && (await page.$eval("#pool-estado", (s) => s.value)) === "validado", "arranca con búsqueda y filtro");
    await page.click('nav a[href="/dev/panel/pool"]');
    ok(await esperarUrl(() => document.querySelector("#pool-q").value === "" && document.querySelector("#pool-estado").value === ""), "al ir por la pestaña del menú el campo y el filtro se vacían (no queda texto viejo)");
    // Atrás / adelante: con replace no hay historial del buscador, pero sí el de la carga inicial.
    await cargar(RUTA);
    await page.evaluate(() => history.pushState({}, "", "/dev/panel/pool?q=luis")); // simula otra entrada de historial
    await page.goBack();
    ok(await esperarUrl(() => new URL(location.href).searchParams.get("q") === null), "volver atrás deja la URL sin búsqueda");
    ok((await page.$eval("#pool-q", (i) => i.value)) === "", "y el campo coincide con la URL");

    console.log("Sin JavaScript (respaldo, lo que responde el servidor)");
    // OJO: con JavaScript apagado el navegador no muestra el contenido de las páginas que se arman con streaming
    // (queda en un <div hidden> que solo revela un script). Por eso el respaldo se comprueba en el HTML que entrega el
    // servidor: el formulario GET, el botón dentro de <noscript> y la búsqueda resuelta en el servidor.
    const html = await (await fetch(`${BASE}${RUTA}?q=persona2`)).text();
    ok(/<form[^>]*action="\/dev\/panel\/pool"[^>]*method="get"|<form[^>]*method="get"[^>]*action="\/dev\/panel\/pool"/.test(html), "el HTML trae el formulario GET a /dev/panel/pool");
    ok(/<noscript><button type="submit"[^>]*>Buscar<\/button><\/noscript>/.test(html), "y el botón Buscar dentro de <noscript>");
    const emails = [...html.matchAll(/persona\d+@ejemplo\.com/g)].map((m) => m[0]);
    ok(emails.length > 0 && emails.every((e) => e.startsWith("persona2")), `?q=persona2 se resuelve en el servidor: solo coincidencias (${new Set(emails).size} emails distintos)`);

    console.log("Móvil (390 px)");
    await page.setViewport({ width: 390, height: 844 });
    await cargar(RUTA + "?q=persona");
    ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) === 0, "sin desborde horizontal");
  } finally {
    await browser.close();
  }
}

main()
  .catch((e) => {
    fallos.push(`excepción: ${e.message}`);
    console.error(e);
  })
  .finally(() => {
    apagar();
    console.log(fallos.length ? `\n${fallos.length} falla(s):\n- ${fallos.join("\n- ")}` : "\nTodo bien.");
    process.exit(fallos.length ? 1 : 0);
  });
