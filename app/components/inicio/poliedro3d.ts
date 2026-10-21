import {
  AmbientLight,
  BufferAttribute,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { tonoDeCara } from "@/lib/poliedro";

export type EventoHero = { quien: string; que: string; monto: string };

type Opciones = {
  contenedor: HTMLElement;
  /** Capa del hexágono: [data-pop] recibe el resorte; [data-quien], [data-que] y [data-monto] el texto. */
  hex: HTMLElement;
  eventos: EventoHero[];
  /** El contexto WebGL se perdió: quien llama vuelve al SVG. */
  alPerder: () => void;
};

const SEGUNDOS_POR_EVENTO = 3.2;
const LIMA = new Color("#d0ef76");

/** Curva de resorte amortiguado como easing `linear()`; si el navegador no la soporta, un rebote simple. */
function resorte() {
  if (typeof CSS === "undefined" || !CSS.supports("animation-timing-function", "linear(0, 1)")) {
    return "cubic-bezier(0.34, 1.56, 0.64, 1)";
  }
  const z = 0.42;
  const w = 16;
  const wd = w * Math.sqrt(1 - z * z);
  const puntos = Array.from({ length: 41 }, (_, i) => {
    const t = (i / 40) * 0.9;
    return (1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t))).toFixed(3);
  });
  return `linear(${puntos.join(",")})`;
}

const suave = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

/** Icosaedro de caras planas que gira despacio, con una cara lima y un hexágono que sigue a esa cara. */
export function montarPoliedro({ contenedor, hex, eventos, alPerder }: Opciones) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const lienzo = renderer.domElement;
  lienzo.setAttribute("aria-hidden", "true");
  lienzo.className = "absolute inset-0 size-full";
  contenedor.prepend(lienzo);

  const escena = new Scene();
  const camara = new PerspectiveCamera(35, 1, 0.1, 20);
  camara.position.set(0, 0, 4.8);
  escena.add(new AmbientLight(0xffffff, 1.6));
  const luz = new DirectionalLight(0xffffff, 2.4);
  luz.position.set(-2, 2.5, 4);
  escena.add(luz);

  const grupo = new Group(); // recibe el parallax
  escena.add(grupo);
  const geometria = new IcosahedronGeometry(1.2, 0);
  const caras = geometria.attributes.position.count / 3;
  const base = Array.from({ length: caras }, (_, i) => new Color(tonoDeCara(i)));
  const colores = new BufferAttribute(new Float32Array(caras * 9), 3);
  geometria.setAttribute("color", colores);
  const material = new MeshLambertMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  const malla = new Mesh(geometria, material);
  const aristas = new EdgesGeometry(geometria);
  const materialAristas = new LineBasicMaterial({ color: 0x58958c, transparent: true, opacity: 0.55 });
  malla.add(new LineSegments(aristas, materialAristas));
  grupo.add(malla);

  // Centro y normal de cada cara en coordenadas locales.
  const pos = geometria.attributes.position;
  const centros: Vector3[] = [];
  const normales: Vector3[] = [];
  for (let f = 0; f < caras; f++) {
    const a = new Vector3().fromBufferAttribute(pos, f * 3);
    const b = new Vector3().fromBufferAttribute(pos, f * 3 + 1);
    const c = new Vector3().fromBufferAttribute(pos, f * 3 + 2);
    centros.push(a.clone().add(b).add(c).divideScalar(3));
    normales.push(b.clone().sub(a).cross(c.clone().sub(a)).normalize());
  }

  const brillo = new Float32Array(caras); // 0..1: cuánto de lima lleva cada cara
  const mezcla = new Color();
  const pintar = () => {
    for (let f = 0; f < caras; f++) {
      mezcla.copy(base[f]).lerp(LIMA, brillo[f]);
      for (let k = 0; k < 3; k++) colores.setXYZ(f * 3 + k, mezcla.r, mezcla.g, mezcla.b);
    }
    colores.needsUpdate = true;
  };

  const pop = hex.querySelector<HTMLElement>("[data-pop]")!;
  const texto = (sel: string) => hex.querySelector<HTMLElement>(sel)!;
  const curva = resorte();
  let animacion: Animation | undefined;

  let evento = -1;
  let cara = 0;
  let reloj = SEGUNDOS_POR_EVENTO; // fuerza el primer evento en el primer cuadro
  let salio = false;

  const mundoN = new Vector3();
  const mundoC = new Vector3();
  const haciaCamara = new Vector3();

  function elegirCara() {
    malla.updateWorldMatrix(true, false);
    let mejor = 0;
    let mejorFrente = -2;
    for (let f = 0; f < caras; f++) {
      if (f === cara) continue;
      mundoN.copy(normales[f]).transformDirection(malla.matrixWorld);
      if (mundoN.z > mejorFrente) {
        mejorFrente = mundoN.z;
        mejor = f;
      }
    }
    return mejor;
  }

  function siguienteEvento() {
    evento = (evento + 1) % eventos.length;
    cara = elegirCara();
    const e = eventos[evento];
    texto("[data-quien]").textContent = e.quien;
    texto("[data-quien]").hidden = !e.quien;
    texto("[data-que]").textContent = e.que;
    texto("[data-monto]").textContent = e.monto;
    animacion?.cancel();
    animacion = pop.animate(
      [{ transform: "scale(0.5)", opacity: 0 }, { transform: "scale(1)", opacity: 1 }],
      { duration: 900, easing: curva, fill: "both" },
    );
    salio = false;
  }

  function salir() {
    animacion?.cancel();
    animacion = pop.animate(
      [{ transform: "scale(1)", opacity: 1 }, { transform: "scale(0.8)", opacity: 0 }],
      { duration: 220, easing: "ease-in", fill: "both" },
    );
    salio = true;
  }

  // Parallax mínimo con el mouse.
  const puntero = { x: 0, y: 0 };
  const suavizado = { x: 0, y: 0 };
  const alMoverse = (e: PointerEvent) => {
    puntero.x = (e.clientX / window.innerWidth) * 2 - 1;
    puntero.y = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener("pointermove", alMoverse, { passive: true });

  let ancho = 1;
  let alto = 1;
  function ajustar() {
    const r = contenedor.getBoundingClientRect();
    if (!r.width || !r.height) return;
    ancho = r.width;
    alto = r.height;
    renderer.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
  }
  const observadorTamano = new ResizeObserver(ajustar);
  observadorTamano.observe(contenedor);
  ajustar();

  let giro = 0;
  function cuadro(dt: number) {
    giro += dt;
    malla.rotation.y += dt * 0.14;
    malla.rotation.x = 0.35 + Math.sin(giro * 0.17) * 0.12;
    suavizado.x += (puntero.x - suavizado.x) * Math.min(1, dt * 3);
    suavizado.y += (puntero.y - suavizado.y) * Math.min(1, dt * 3);
    grupo.rotation.y = suavizado.x * 0.16;
    grupo.rotation.x = suavizado.y * 0.1;
    grupo.updateWorldMatrix(true, true);

    reloj += dt;
    if (reloj >= SEGUNDOS_POR_EVENTO) {
      reloj = 0;
      siguienteEvento();
    } else if (!salio && reloj >= SEGUNDOS_POR_EVENTO - 0.3) {
      salir();
    }

    for (let f = 0; f < caras; f++) {
      const objetivo = f === cara && !salio ? 1 : 0;
      brillo[f] += (objetivo - brillo[f]) * Math.min(1, dt * 7);
    }
    pintar();

    // El hexágono sigue a su cara y se apaga si ésta se aleja de la cámara.
    mundoC.copy(centros[cara]).applyMatrix4(malla.matrixWorld);
    mundoN.copy(normales[cara]).transformDirection(malla.matrixWorld);
    haciaCamara.copy(camara.position).sub(mundoC).normalize();
    const visibilidad = suave(0.3, 0.6, mundoN.dot(haciaCamara));
    mundoC.project(camara);
    hex.style.transform = `translate3d(${((mundoC.x + 1) / 2) * ancho}px, ${((1 - mundoC.y) / 2) * alto}px, 0)`;
    hex.style.opacity = String(visibilidad);

    renderer.render(escena, camara);
  }

  // Pausa fuera de pantalla y con la pestaña oculta; el reloj de eventos pausa con ella.
  let enPantalla = true;
  let raf = 0;
  let ultimo = 0;
  const bucle = (ahora: number) => {
    cuadro(Math.min(0.05, (ahora - ultimo) / 1000));
    ultimo = ahora;
    raf = requestAnimationFrame(bucle);
  };
  const actualizar = () => {
    const debeCorrer = enPantalla && !document.hidden;
    if (debeCorrer && !raf) {
      ultimo = performance.now();
      raf = requestAnimationFrame(bucle);
      animacion?.play();
    } else if (!debeCorrer && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
      animacion?.pause();
    }
  };
  const observadorVista = new IntersectionObserver(([e]) => {
    enPantalla = e.isIntersecting;
    actualizar();
  });
  observadorVista.observe(contenedor);
  document.addEventListener("visibilitychange", actualizar);

  const alPerderContexto = (e: Event) => {
    e.preventDefault();
    alPerder();
  };
  lienzo.addEventListener("webglcontextlost", alPerderContexto);

  actualizar();

  return function destruir() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    animacion?.cancel();
    observadorTamano.disconnect();
    observadorVista.disconnect();
    document.removeEventListener("visibilitychange", actualizar);
    window.removeEventListener("pointermove", alMoverse);
    lienzo.removeEventListener("webglcontextlost", alPerderContexto);
    geometria.dispose();
    aristas.dispose();
    material.dispose();
    materialAristas.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    lienzo.remove();
  };
}
