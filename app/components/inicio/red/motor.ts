import { crearCoreografia, SEGUNDOS_ENTRADA } from "./coreografia";
import { crearEscena } from "./escena";
import { crearHexagono, type EventoHero } from "./hexagono";
import { tramo } from "./util";

type Opciones = {
  /** Donde se inserta el canvas (cubre toda la escena fija). */
  contenedor: HTMLElement;
  /** La pista alta que da el recorrido del scroll. */
  pista: HTMLElement;
  /** Capa del hexágono: [data-pop] recibe el resorte; [data-quien], [data-que] y [data-monto] el texto. */
  hex: HTMLElement;
  /** Rótulos del relato, en orden de hito (el último hito no lleva rótulo). */
  rotulos: HTMLElement[];
  /** Frases del relato (tres), una visible a la vez según el avance del scroll. */
  leyendas: HTMLElement[];
  eventos: EventoHero[];
  /** El contexto WebGL se perdió: quien llama vuelve al SVG. */
  alPerder: () => void;
};

/** Con `?medir` en la URL el motor deja en `window.__redCuadros` pares [intervalo entre cuadros, ms de JS de la escena]. */
declare global {
  interface Window {
    __redCuadros?: number[];
  }
}

/**
 * Monta la portada animada: un solo requestAnimationFrame, sin estado de React por cuadro. Se pausa fuera de pantalla y
 * con la pestaña oculta. Devuelve la función que lo desmonta.
 */
export function montar({ contenedor, pista, hex, rotulos, leyendas, eventos, alPerder }: Opciones) {
  const e = crearEscena(contenedor);
  const coreo = crearCoreografia(e);
  const hexagono = crearHexagono(e, hex, eventos);
  const medir = new URLSearchParams(window.location.search).has("medir");
  if (medir) window.__redCuadros = [];

  const estado = { t: 0, dt: 0, p: 0, q: 0, px: 0, py: 0, activo: false };
  let sCrudo = 0;
  let s = 0;
  const leerScroll = () => {
    const r = pista.getBoundingClientRect();
    const recorrido = r.height - window.innerHeight;
    sCrudo = recorrido > 0 ? Math.min(1, Math.max(0, -r.top / recorrido)) : 0;
  };
  leerScroll();
  s = sCrudo;
  // Si la persona llega ya más abajo (recarga con scroll, enlace), no hay entrada: la figura aparece como corresponde.
  if (s > 0.01) coreo.terminarEntrada();
  window.addEventListener("scroll", leerScroll, { passive: true });
  window.addEventListener("resize", leerScroll);

  const alMoverse = (ev: PointerEvent) => {
    const r = contenedor.getBoundingClientRect();
    if (!r.width || !r.height) return;
    estado.activo = true;
    estado.px = Math.max(-1, Math.min(1, ((ev.clientX - r.left) / r.width) * 2 - 1));
    estado.py = Math.max(-1, Math.min(1, ((ev.clientY - r.top) / r.height) * 2 - 1));
  };
  const alSalir = () => {
    estado.activo = false;
    estado.px = 0;
    estado.py = 0;
  };
  const alPulsar = (ev: PointerEvent) => {
    if ((ev.target as Element).closest("a,button,nav,input,summary")) return;
    coreo.alPulsar?.();
  };
  window.addEventListener("pointermove", alMoverse, { passive: true });
  document.documentElement.addEventListener("pointerleave", alSalir);
  window.addEventListener("pointerdown", alPulsar, { passive: true });

  let raf = 0;
  let ultimo = 0;
  let enPantalla = true;
  let degradada = false;
  let muestras = 0;
  let sumaMs = 0;
  const bucle = (ahora: number) => {
    const real = ahora - ultimo;
    const dt = Math.min(0.05, real / 1000);
    ultimo = ahora;
    estado.t += dt;
    estado.dt = dt;
    // El avance del scroll se suaviza para que no haya escalones.
    s += (sCrudo - s) * Math.min(1, dt * 7);
    if (Math.abs(sCrudo - s) < 0.0004) s = sCrudo;
    estado.p = tramo(s, 0, 0.5);
    estado.q = tramo(s, 0.56, 0.94);

    // Si la entrada no da el ritmo (menos de 55 fps medios en sus primeros 0,5 s), se degrada a un fundido simple.
    if (!degradada && estado.t > 0.2 && estado.t < SEGUNDOS_ENTRADA) {
      if (estado.t <= 0.75) {
        muestras++;
        sumaMs += real;
      } else if (muestras > 8) {
        if (1000 / (sumaMs / muestras) < 55) {
          coreo.terminarEntrada();
          e.lienzo.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: "cubic-bezier(0.23, 1, 0.32, 1)" });
        }
        degradada = true;
      }
    }

    const t0 = performance.now();
    coreo.cuadro(estado);
    const r = contenedor.getBoundingClientRect();
    hexagono.cuadro(dt, estado.p, r.width, r.height, estado.t >= SEGUNDOS_ENTRADA || degradada || s > 0.01);
    posicionarRotulos(r.width, r.height);
    mostrarLeyenda(s);
    const ms = performance.now() - t0;
    e.render();
    if (medir && window.__redCuadros && window.__redCuadros.length < 8000) window.__redCuadros.push(real, ms);
    raf = requestAnimationFrame(bucle);
  };

  const proyectado = { x: 0, y: 0 };
  const posicionarRotulos = (ancho: number, alto: number) => {
    const rel = coreo.relato;
    rotulos.forEach((el, n) => {
      const visible = rel.activo && rel.nodos.length > 1 && rel.alcanzados > n;
      if (!visible) {
        if (el.dataset.visible !== "0") {
          el.dataset.visible = "0";
          el.style.opacity = "0";
        }
        return;
      }
      const c = e.caras[rel.nodos[rel.hitos[n]]];
      e.vector.copy(c.punto.position).applyMatrix4(e.cuerpo.matrixWorld).project(e.camara);
      proyectado.x = ((e.vector.x + 1) / 2) * ancho;
      proyectado.y = ((1 - e.vector.y) / 2) * alto;
      el.style.transform = `translate3d(${proyectado.x}px, ${proyectado.y}px, 0)`;
      if (el.dataset.visible !== "1") {
        el.dataset.visible = "1";
        el.style.opacity = "1";
      }
    });
  };

  // Frase 1 acompaña la formación de la red y la salida del relato; la 2, el paso por el medio; la 3, la llegada.
  let leyendaActual = -2;
  const mostrarLeyenda = (avance: number) => {
    const n = avance < 0.36 ? -1 : avance < 0.7 ? 0 : avance < 0.88 ? 1 : 2;
    if (n === leyendaActual) return;
    leyendaActual = n;
    leyendas.forEach((el, i) => (el.style.opacity = i === n ? "1" : "0"));
  };

  const actualizar = () => {
    const debe = enPantalla && !document.hidden;
    if (debe && !raf) {
      ultimo = performance.now();
      raf = requestAnimationFrame(bucle);
      hexagono.reanudar();
    } else if (!debe && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      hexagono.pausar();
    }
  };
  const observador = new IntersectionObserver(([en]) => {
    enPantalla = en.isIntersecting;
    actualizar();
  });
  observador.observe(pista);
  document.addEventListener("visibilitychange", actualizar);

  const alPerderContexto = (ev: Event) => {
    ev.preventDefault();
    alPerder();
  };
  e.lienzo.addEventListener("webglcontextlost", alPerderContexto);
  actualizar();

  return function desmontar() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    observador.disconnect();
    document.removeEventListener("visibilitychange", actualizar);
    window.removeEventListener("scroll", leerScroll);
    window.removeEventListener("resize", leerScroll);
    window.removeEventListener("pointermove", alMoverse);
    window.removeEventListener("pointerdown", alPulsar);
    document.documentElement.removeEventListener("pointerleave", alSalir);
    e.lienzo.removeEventListener("webglcontextlost", alPerderContexto);
    hexagono.destruir();
    leyendas.forEach((el) => (el.style.opacity = ""));
    rotulos.forEach((el) => {
      el.style.opacity = "";
      el.style.transform = "";
      delete el.dataset.visible;
    });
    e.destruir();
  };
}
