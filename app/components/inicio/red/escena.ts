import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  Color,
  DirectionalLight,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineLoop,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  PointLight,
  Quaternion,
  RingGeometry,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { tonoDeCara } from "@/lib/poliedro";

export const LIMA = new Color("#d0ef76");
export const Z_BASE = 7.2;
const FOV = 35;
export const MAX_RUTA = 8;

export type Estado = {
  /** Segundos de reproducción desde el montaje (se detiene con la pestaña oculta). */
  t: number;
  dt: number;
  /** Apertura del poliedro hacia los puntos, 0..1, suavizada. */
  p: number;
  /** Relato sobre la red, 0..1, suavizado. */
  q: number;
  /** Cursor relativo al lienzo, -1..1 (y positiva hacia abajo). */
  px: number;
  py: number;
  /** Hubo movimiento del cursor (falso en pantallas táctiles y antes del primer movimiento). */
  activo: boolean;
};

export type Variante = {
  cuadro(s: Estado): void;
  alPulsar?(): void;
};

export type Cara = {
  i: number;
  malla: Mesh;
  material: MeshLambertMaterial;
  punto: Mesh;
  centro: Vector3;
  normal: Vector3;
  base: Color;
  eje: Vector3;
  /** 0 (arriba) .. 1 (abajo) */
  rangoY: number;
};

export type AjusteCara = { desp: number; escala: number; giro?: number; tumbo?: number; glow?: number };

/**
 * Escena compartida: un icosaedro hecho de 20 caras sueltas, un punto por cara y las 30 líneas que unen caras vecinas
 * (el dodecaedro dual). Además, lo que usa el relato: una ruta resaltada, un viajero y tres anillos.
 */
export function crearEscena(contenedor: HTMLElement) {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  const lienzo = renderer.domElement;
  lienzo.setAttribute("aria-hidden", "true");
  lienzo.className = "absolute inset-0 size-full";
  contenedor.prepend(lienzo);

  const escena = new Scene();
  const camara = new PerspectiveCamera(FOV, 1, 0.1, 40);
  camara.position.set(0, 0, Z_BASE);
  const ambiente = new AmbientLight(0xffffff, 1.1);
  const luz = new DirectionalLight(0xffffff, 2.4);
  luz.position.set(-2, 2.5, 4);
  const foco = new PointLight(LIMA, 0, 0, 2);
  foco.position.set(0, 0, 3);
  escena.add(ambiente, luz, foco);

  const inclinacion = new Group(); // posición en pantalla + inclinación por cursor
  const cuerpo = new Group(); // giro propio
  escena.add(inclinacion);
  inclinacion.add(cuerpo);
  /** Escala uniforme de la red; los discos la compensan para conservar su tamaño en pantalla. */
  const compensacion = { k: 1 };

  const matAristas = new LineBasicMaterial({ color: 0x58958c, transparent: true, opacity: 0.55 });
  const matPunto = new MeshBasicMaterial({ color: LIMA });
  const matLinea = new LineBasicMaterial({ color: LIMA, transparent: true, opacity: 0.9 });
  const matRuta = new LineBasicMaterial({ color: LIMA, transparent: true, opacity: 1 });
  const matAnillo = new MeshBasicMaterial({ color: LIMA, transparent: true, opacity: 0, depthWrite: false });
  // Discos que siempre miran a la cámara (puntos redondos desde cualquier orientación).
  const esfera = new CircleGeometry(1, 28);
  const anilloGeo = new RingGeometry(0.92, 1, 40);

  const fuente = new IcosahedronGeometry(1.2, 0);
  const pos = fuente.attributes.position;
  const total = pos.count / 3;
  const caras: Cara[] = [];
  const geometrias: BufferGeometry[] = [];
  const claves: string[][] = [];

  for (let f = 0; f < total; f++) {
    const v = [0, 1, 2].map((k) => new Vector3().fromBufferAttribute(pos, f * 3 + k));
    const centro = v[0].clone().add(v[1]).add(v[2]).divideScalar(3);
    const normal = v[1].clone().sub(v[0]).cross(v[2].clone().sub(v[0])).normalize();
    claves.push(v.map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)}`));

    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(v.flatMap((p) => [p.x - centro.x, p.y - centro.y, p.z - centro.z]), 3));
    g.computeVertexNormals();
    geometrias.push(g);

    const mat = new MeshLambertMaterial({ color: tonoDeCara(f), polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const malla = new Mesh(g, mat);
    malla.position.copy(centro);
    malla.add(new LineLoop(g, matAristas));
    cuerpo.add(malla);

    const punto = new Mesh(esfera, matPunto);
    punto.visible = false;
    punto.scale.setScalar(0.0001);
    cuerpo.add(punto);

    const a = (n: number) => Math.sin((f + 1) * 12.9898 + n * 78.233) * 43758.5453 - Math.floor(Math.sin((f + 1) * 12.9898 + n * 78.233) * 43758.5453) - 0.5;
    caras.push({
      i: f,
      malla,
      material: mat,
      punto,
      centro,
      normal,
      base: new Color(tonoDeCara(f)),
      eje: new Vector3(a(1), a(2), a(3) + 0.01).normalize(),
      rangoY: 0,
    });
  }
  [...caras].sort((p, q) => q.centro.y - p.centro.y).forEach((c, k) => (c.rangoY = k / (total - 1)));

  // Caras vecinas = 2 vértices en común. Unidas por el centro: 20 puntos, 30 líneas.
  const pares: [number, number][] = [];
  const vecinos: number[][] = caras.map(() => []);
  for (let a = 0; a < total; a++) {
    for (let b = a + 1; b < total; b++) {
      if (claves[a].filter((k) => claves[b].includes(k)).length === 2) {
        pares.push([a, b]);
        vecinos[a].push(b);
        vecinos[b].push(a);
      }
    }
  }
  const rangoLinea = pares
    .map(([a, b], k) => ({ k, x: caras[a].centro.x + caras[b].centro.x }))
    .sort((p, q) => p.x - q.x)
    .reduce((acc, { k }, orden) => ((acc[k] = orden / (pares.length - 1)), acc), [] as number[]);

  const crearLineas = (segmentos: number, material: LineBasicMaterial) => {
    const buf = new Float32Array(segmentos * 6);
    const attr = new BufferAttribute(buf, 3);
    attr.setUsage(DynamicDrawUsage);
    const geo = new BufferGeometry();
    geo.setAttribute("position", attr);
    const obj = new LineSegments(geo, material);
    obj.frustumCulled = false;
    obj.visible = false;
    cuerpo.add(obj);
    return { buf, attr, geo, obj };
  };
  const red = crearLineas(pares.length, matLinea);
  const ruta = crearLineas(MAX_RUTA, matRuta);

  const viajero = new Mesh(esfera, matPunto);
  viajero.visible = false;
  cuerpo.add(viajero);
  const anillos = [0, 1, 2].map(() => {
    const m = new Mesh(anilloGeo, matAnillo.clone());
    m.visible = false;
    cuerpo.add(m);
    return m;
  });

  const q1 = new Quaternion();
  /** Orientación local (dentro de `cuerpo`) con la que un disco queda de frente a la cámara. */
  const billboard = new Quaternion();
  const qAux = new Quaternion();
  const q2 = new Quaternion();
  const tmp = new Color();
  /** Brillo que otros módulos (el hexágono) piden para una cara, 0..1. */
  const brilloExterno = new Float32Array(total);

  /** Recalcula `billboard`; llamar después de fijar las rotaciones de `inclinacion` y `cuerpo`. */
  function actualizarBillboard() {
    qAux.copy(inclinacion.quaternion).multiply(cuerpo.quaternion).invert();
    billboard.copy(qAux).multiply(camara.quaternion);
  }

  /** Coloca una cara: `desp` la empuja a lo largo de su normal; `giro` es sobre la normal y `tumbo` sobre su eje propio. */
  function aplicarCara(c: Cara, { desp, escala, giro = 0, tumbo = 0, glow = 0 }: AjusteCara) {
    const visible = escala > 0.003;
    c.malla.visible = visible;
    if (!visible) return;
    c.malla.position.copy(c.centro).addScaledVector(c.normal, desp);
    c.malla.scale.setScalar(escala);
    q1.setFromAxisAngle(c.normal, giro);
    q2.setFromAxisAngle(c.eje, tumbo);
    c.malla.quaternion.copy(q1).multiply(q2);
    tmp.copy(c.base).lerp(LIMA, Math.min(1, Math.max(0, Math.max(glow, brilloExterno[c.i]))));
    c.material.color.copy(tmp);
  }

  /** El punto de la cara: sobre su normal, a `dist` del centro de la figura. */
  function aplicarPunto(c: Cara, dist: number, radio: number) {
    const visible = radio > 0.002;
    c.punto.visible = visible;
    if (!visible) return;
    c.punto.position.copy(c.normal).multiplyScalar(dist);
    c.punto.quaternion.copy(billboard);
    c.punto.scale.setScalar(radio / compensacion.k);
  }

  /** Dibuja la línea k desde su primer punto hacia el segundo, `fase` 0..1. */
  function escribirSegmento(l: { buf: Float32Array }, o: number, a: Vector3, b: Vector3, fase: number) {
    l.buf[o] = a.x;
    l.buf[o + 1] = a.y;
    l.buf[o + 2] = a.z;
    l.buf[o + 3] = a.x + (b.x - a.x) * fase;
    l.buf[o + 4] = a.y + (b.y - a.y) * fase;
    l.buf[o + 5] = a.z + (b.z - a.z) * fase;
  }
  function trazar(k: number, fase: number) {
    escribirSegmento(red, k * 6, caras[pares[k][0]].punto.position, caras[pares[k][1]].punto.position, fase);
  }
  function cerrarLineas(opacidad: number) {
    red.attr.needsUpdate = true;
    matLinea.opacity = opacidad;
    red.obj.visible = opacidad > 0.01;
  }
  /** Segmento k de la ruta resaltada, de la cara `de` a la cara `a`, hasta `fase`. */
  function trazarRuta(k: number, de: number, a: number, fase: number) {
    escribirSegmento(ruta, k * 6, caras[de].punto.position, caras[a].punto.position, fase);
  }
  function cerrarRuta(segmentos: number) {
    for (let k = segmentos; k < MAX_RUTA; k++) escribirSegmento(ruta, k * 6, caras[0].punto.position, caras[0].punto.position, 0);
    ruta.attr.needsUpdate = true;
    ruta.obj.visible = segmentos > 0;
  }

  let ancho = 1;
  let alto = 1;
  const medidas = () => {
    const r = contenedor.getBoundingClientRect();
    if (!r.width || !r.height) return;
    ancho = r.width;
    alto = r.height;
    renderer.setSize(ancho, alto, false);
    camara.aspect = ancho / alto;
    camara.updateProjectionMatrix();
  };
  const observador = new ResizeObserver(medidas);
  observador.observe(contenedor);
  medidas();

  /** Coloca la figura en la fracción `fx` (0..1) del ancho de pantalla, según la distancia actual de la cámara. */
  function encuadrar(fx: number) {
    inclinacion.position.x = (fx * 2 - 1) * mediaAncho();
  }
  /** Mitad del ancho visible en el plano de la figura. */
  function mediaAncho() {
    return Math.tan((FOV / 2) * (Math.PI / 180)) * camara.position.z * camara.aspect;
  }

  function destruir() {
    observador.disconnect();
    geometrias.forEach((g) => g.dispose());
    caras.forEach((c) => c.material.dispose());
    anillos.forEach((a) => (a.material as MeshBasicMaterial).dispose());
    fuente.dispose();
    esfera.dispose();
    anilloGeo.dispose();
    red.geo.dispose();
    ruta.geo.dispose();
    matAristas.dispose();
    matPunto.dispose();
    matLinea.dispose();
    matRuta.dispose();
    matAnillo.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    lienzo.remove();
  }

  return {
    renderer,
    lienzo,
    escena,
    camara,
    luz,
    foco,
    ambiente,
    inclinacion,
    cuerpo,
    caras,
    pares,
    vecinos,
    rangoLinea,
    aristas: matAristas,
    matRuta,
    viajero,
    anillos,
    compensacion,
    billboard,
    actualizarBillboard,
    vector: new Vector3(),
    brilloExterno,
    aplicarCara,
    aplicarPunto,
    trazar,
    cerrarLineas,
    trazarRuta,
    cerrarRuta,
    encuadrar,
    mediaAncho,
    render: () => renderer.render(escena, camara),
    destruir,
  };
}

export type Escena = ReturnType<typeof crearEscena>;
