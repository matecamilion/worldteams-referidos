import { Vector3 } from "three";
import { MAX_RUTA, Z_BASE, type Escena, type Estado, type Variante } from "./escena";
import { ENTRADA_SALIDA, REBOTE, SALIDA, acotar, mezclar, resorte, tramo, type Resorte } from "./util";

const R_CARA = 0.9537; // distancia del centro de una cara al centro de la figura
const R_RED = 1.85; // radio de la constelación de puntos
/** Fracción de la mitad del alto visible que ocupa el punto más alejado del centro (deja aire para el radio del punto y los rótulos). */
const FILL = 0.88;
const Z_ENTRADA = 9.6;
/** Duración de la entrada alrededor del poliedro. */
export const SEGUNDOS_ENTRADA = 2.4;

/** Lo que el motor necesita saber del relato para colocar los rótulos. */
export type Relato = {
  activo: boolean;
  /** Caras por las que pasa el recorrido, de punta a punta. */
  nodos: number[];
  /** Índices dentro de `nodos` donde cae cada hito (inicio, medio, fin). */
  hitos: [number, number, number];
  /** Cuántos hitos ya se alcanzaron (0..3). */
  alcanzados: number;
};

export type Coreografia = Variante & {
  relato: Relato;
  /** Da la entrada por terminada (si el visitante ya estaba más abajo o la pantalla no da el ritmo). */
  terminarEntrada(): void;
};

/**
 * Coreografía de la portada. Entrada: la figura nace como una red de puntos y líneas alrededor del texto, se pliega hasta
 * ser el poliedro y la cámara se acerca (2,4 s). Reposo: luz lima que sigue al cursor, caras que se levantan y brillan, onda
 * al clic, inclinación con resorte. Scroll: apertura en estallido con giro hasta los puntos (p) y relato sobre la red (q):
 * una línea recorre el mapa de un extremo a otro, en tres momentos.
 */
export function crearCoreografia(e: Escena): Coreografia {
  const rx: Resorte = { x: 0, v: 0 };
  const ry: Resorte = { x: 0, v: 0 };
  let giro = 0;
  let presencia = 0; // 0..1: cuánto de la reacción al cursor está activa
  let pulso = -10;
  let desdeCara = 0;
  let reloj = 0;
  let ultimoPx = 0;
  let ultimoPy = 0;
  let entradaTerminada = false;
  const mundo = new Vector3();
  const normalMundo = new Vector3();
  const origen = new Vector3();

  let ajuste = 1;
  const relato: Relato = { activo: false, nodos: [], hitos: [0, 0, 0], alcanzados: 0 };

  e.foco.intensity = 0;

  /**
   * Escala uniforme `s` con la que el punto más alto o más bajo de la red (en la orientación actual, con perspectiva) llega
   * a FILL de la mitad del alto visible. Búsqueda binaria: la altura proyectada crece con `s`.
   */
  function escalaParaLlenar() {
    const z = e.camara.position.z;
    const tan = Math.tan((35 / 2) * (Math.PI / 180));
    const altura = (s: number) => {
      let m = 0;
      for (const c of e.caras) {
        mundo.copy(c.normal).multiplyScalar(R_RED).applyQuaternion(e.cuerpo.quaternion);
        const h = (Math.abs(mundo.y) * s) / ((z - mundo.z * s) * tan);
        if (h > m) m = h;
      }
      return m;
    };
    let lo = 0.6;
    let hi = 2.2;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) / 2;
      if (altura(mid) < FILL) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Recorrido más corto, de punta a punta de la pantalla, sobre las líneas de la red. */
  function elegirRecorrido() {
    e.inclinacion.updateMatrixWorld(true);
    let a = 0;
    let d = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const c of e.caras) {
      mundo.copy(c.punto.position).applyMatrix4(e.cuerpo.matrixWorld).project(e.camara);
      if (mundo.x < minX) {
        minX = mundo.x;
        a = c.i;
      }
      if (mundo.x > maxX) {
        maxX = mundo.x;
        d = c.i;
      }
    }
    const previo = new Array<number>(e.caras.length).fill(-1);
    const cola = [a];
    previo[a] = a;
    while (cola.length) {
      const n = cola.shift()!;
      if (n === d) break;
      for (const v of e.vecinos[n]) {
        if (previo[v] === -1) {
          previo[v] = n;
          cola.push(v);
        }
      }
    }
    const nodos = [d];
    while (nodos[0] !== a) nodos.unshift(previo[nodos[0]]);
    const aristas = Math.min(MAX_RUTA, nodos.length - 1);
    nodos.length = aristas + 1;
    relato.nodos = nodos;
    relato.hitos = [0, Math.round(aristas / 2), aristas];
  }

  return {
    relato,
    terminarEntrada() {
      entradaTerminada = true;
    },
    alPulsar() {
      pulso = reloj;
      // La onda nace en la cara más cercana al cursor.
      let mejor = 1e9;
      for (const c of e.caras) {
        mundo.copy(c.centro).applyMatrix4(e.cuerpo.matrixWorld).project(e.camara);
        const d = (mundo.x - ultimoPx) ** 2 + (-mundo.y - ultimoPy) ** 2;
        if (d < mejor) {
          mejor = d;
          desdeCara = c.i;
        }
      }
    },
    cuadro({ t: tReloj, dt, p, q, px, py, activo }: Estado) {
      reloj = tReloj;
      const t = entradaTerminada ? 99 : tReloj;
      ultimoPx = px;
      ultimoPy = py;
      presencia += ((activo ? 1 : 0) - presencia) * Math.min(1, dt * 4);

      // --- Entrada: red de puntos → poliedro; la cámara se acerca. ---
      const camE = ENTRADA_SALIDA(tramo(t, 0, SEGUNDOS_ENTRADA));
      const pliegue = ENTRADA_SALIDA(tramo(t, 0.7, 1.8));
      const red = R_RED - R_CARA;
      const listo = tramo(t, 1.7, 2.4); // desde acá el cursor reacciona

      // --- Apertura (p) y relato (q). ---
      const anticipo = ENTRADA_SALIDA(tramo(p, 0, 0.12));
      const estallido = SALIDA(tramo(p, 0.1, 0.46));
      const asienta = ENTRADA_SALIDA(tramo(p, 0.42, 0.86));
      const union = tramo(p, 0.7, 1);
      const sinApertura = p < 0.02;

      // Giro y cursor.
      giro += dt * mezclar(0.5, 0.16, camE) * (1 - 0.5 * tramo(p, 0, 0.5)) * (1 - tramo(p, 0.6, 0.95));
      const quieto = 1 - tramo(p, 0.2, 0.5);
      resorte(rx, py * 0.3 * quieto * listo, dt, 70, 9);
      resorte(ry, px * 0.45 * quieto * listo, dt, 70, 9);
      e.cuerpo.rotation.set(0.35 + Math.sin(giro * 1.3) * 0.12, giro, 0);
      e.inclinacion.rotation.set(rx.x, ry.x, 0);
      e.actualizarBillboard();
      e.foco.position.set(px * 3.2, -py * 2.2, 2.4);
      e.foco.intensity = 22 * presencia * listo * (1 - tramo(p, 0, 0.1));
      e.camara.position.z = Z_BASE + (Z_ENTRADA - Z_BASE) * (1 - camE);
      e.inclinacion.updateMatrixWorld(true);
      origen.copy(e.caras[desdeCara].normal);

      // La red crece de forma uniforme hasta llenar el alto de la pantalla sin cortar los puntos de arriba y de abajo.
      ajuste += (escalaParaLlenar() - ajuste) * Math.min(1, dt * 3);
      e.compensacion.k = mezclar(1, ajuste, ENTRADA_SALIDA(tramo(p, 0.4, 1)));
      e.cuerpo.scale.setScalar(e.compensacion.k);

      for (const c of e.caras) {
        const r = c.rangoY;
        // Entrada: cada cara se despliega desde su punto, de arriba abajo.
        const ini = 0.65 + r * 0.5;
        const local = SALIDA(tramo(t, ini, ini + 0.7));
        let desp = (1 - local) * red;
        let escala = local;
        let glow = (1 - tramo(t, 1.0 + r * 0.5, 2.1 + r * 0.2)) * 0.32 * (t < 99 ? 1 : 0);
        let tumbo = 0;

        let levanta = 0;
        if (sinApertura && presencia > 0.01 && listo > 0) {
          mundo.copy(c.centro).applyMatrix4(e.cuerpo.matrixWorld).project(e.camara);
          normalMundo.copy(c.normal).transformDirection(e.cuerpo.matrixWorld);
          const frente = normalMundo.z > -0.2 ? 1 : 0.3;
          const d2 = (mundo.x - px) ** 2 + (-mundo.y - py) ** 2;
          const cerca = Math.exp(-d2 / 0.07) * frente * presencia * listo;
          levanta = cerca * 0.2;
          glow += cerca * 0.6;
        }
        if (sinApertura && listo > 0) {
          // Onda del clic.
          const edad = tReloj - pulso;
          if (edad < 1.4) {
            const ang = Math.acos(Math.max(-1, Math.min(1, c.normal.dot(origen))));
            const dist = ang - edad * 3.2;
            const onda = Math.exp(-(dist * dist) / 0.12) * (1 - edad / 1.4);
            levanta += onda * 0.35;
            glow += onda * 0.8;
          }
        }
        desp += levanta;

        // Apertura: toma impulso, estalla con giro y se asienta en puntos.
        desp += -0.09 * anticipo + (R_RED - R_CARA - 0.1) * estallido + 0.1 * asienta;
        tumbo += estallido * (azarCara(c.i) - 0.5) * 9 * (1 - asienta);
        escala *= (1 - 0.06 * anticipo) * (1 - asienta);
        glow += asienta * 0.9;

        e.aplicarCara(c, { desp, escala, giro: estallido * (1 - asienta) * (azarCara(c.i) - 0.5) * 4, tumbo, glow });

        // Puntos: nacen en la entrada, se apagan al plegarse y vuelven con la apertura.
        const nace = SALIDA(tramo(t, r * 0.3, r * 0.3 + 0.4));
        const dePliegue = 0.055 * nace * (1 - local);
        const deApertura = 0.055 * REBOTE(tramo(p, 0.46 + azarCara(c.i) * 0.12, 0.74));
        e.aplicarPunto(c, R_CARA + desp, Math.max(dePliegue, deApertura));
      }

      // Aristas del poliedro.
      e.aristas.opacity = 0.55 * tramo(pliegue, 0.2, 1) * (1 - asienta);

      // Líneas de la red: en la entrada se dibujan de un extremo a otro y se retiran al plegarse; con la apertura vuelven.
      let visible = false;
      for (let l = 0; l < e.pares.length; l++) {
        const rl = e.rangoLinea[l];
        const dibuja = SALIDA(tramo(t, 0.05 + rl * 0.55, 0.05 + rl * 0.55 + 0.4)) * (1 - tramo(pliegue, 0, 0.6));
        const abre = SALIDA(tramo(union, rl * 0.55, rl * 0.55 + 0.45));
        const f = Math.max(dibuja, abre);
        e.trazar(l, f);
        if (f > 0) visible = true;
      }
      // Durante el relato la red de fondo baja de brillo para que la ruta destaque.
      e.cerrarLineas(visible ? mezclar(0.9, 0.38, ENTRADA_SALIDA(tramo(q, 0, 0.08))) : 0);

      e.encuadrar(mezclar(0.74, 0.5, ENTRADA_SALIDA(tramo(p, 0.24, 0.85))));

      // --- Relato: una línea recorre la red de punta a punta, en tres momentos (salir, pasar por el medio, llegar). ---
      relato.activo = q > 0 && p > 0.98;
      if (relato.activo && relato.nodos.length === 0) elegirRecorrido();
      if (p < 0.9 && relato.nodos.length) relato.nodos = [];
      if (relato.activo && relato.nodos.length > 1) {
        const k = relato.nodos.length - 1;
        const [, h1, h2] = relato.hitos;
        const avance = mezclar(0, h1, ENTRADA_SALIDA(tramo(q, 0.08, 0.4))) + mezclar(0, h2 - h1, ENTRADA_SALIDA(tramo(q, 0.52, 0.86)));

        for (let i = 0; i < k; i++) e.trazarRuta(i, relato.nodos[i], relato.nodos[i + 1], acotar(avance - i, 0, 1));
        e.cerrarRuta(Math.min(k, Math.ceil(avance)));

        const idx = Math.min(k - 1, Math.floor(avance));
        const viaja = q > 0.06 && q < 0.9 && avance > 0.001 && avance < k - 0.001;
        e.viajero.visible = viaja;
        if (viaja) {
          e.viajero.position.lerpVectors(e.caras[relato.nodos[idx]].punto.position, e.caras[relato.nodos[idx + 1]].punto.position, acotar(avance - idx, 0, 1));
          e.viajero.quaternion.copy(e.billboard);
          e.viajero.scale.setScalar(VIAJERO / e.compensacion.k);
        }

        // Anillos en los tres hitos, en el momento en que la línea sale, pasa y llega.
        relato.alcanzados = 0;
        e.anillos.forEach((an, n) => {
          const inicio = LLEGADAS[n];
          if (q >= inicio) relato.alcanzados++;
          const edad = tramo(q, inicio, inicio + 0.14);
          an.visible = q >= inicio && edad < 1;
          if (an.visible) {
            an.position.copy(e.caras[relato.nodos[relato.hitos[n]]].punto.position);
            an.quaternion.copy(e.billboard);
            const rad = mezclar(0.1, 0.3, SALIDA(edad));
            an.scale.setScalar(rad / e.compensacion.k);
            (an.material as { opacity: number }).opacity = (1 - edad) * 0.85;
          }
        });
      } else {
        e.cerrarRuta(0);
        e.viajero.visible = false;
        e.anillos.forEach((an) => (an.visible = false));
        relato.alcanzados = 0;
      }
    },
  };
}

/** Momento del relato (q) en que se enciende cada hito: sale, pasa por el medio y llega. */
const LLEGADAS = [0, 0.4, 0.86];
const VIAJERO = 0.095;

const azarCara = (i: number) => {
  const x = Math.sin((i + 1) * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

