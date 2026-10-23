# Presupuesto de rendimiento — portada animada y sección de la red

Límites que la animación nueva no puede pasar. Se miden con `scripts/` de la auditoría y con `app/dev/hero` (`window.__heroCuadros`). Si un efecto no entra en el presupuesto, se deja afuera.

## Cuadros por segundo
| Dónde | Objetivo | Piso (se apaga el efecto si no se cumple) |
| --- | --- | --- |
| Escritorio ≥ 1024 px, 1280×800, GPU real | 60 fps medios; p95 del intervalo entre cuadros ≤ 17 ms | 55 fps medios |
| Escritorio con CPU 4× más lenta | 55 fps medios; p95 ≤ 20 ms | 45 fps medios |
| < 1024 px y móvil | No hay animación 3D (no se carga three.js). Lo único que se mueve es CSS/SVG compositor-only. | 0 cuadros perdidos atribuibles al efecto |

Con 120 Hz el presupuesto por cuadro es 8 ms: el JS de la animación debe quedar ≤ 1 ms por cuadro en escritorio (≤ 4 ms con CPU 4×).

## Tareas largas (> 50 ms)
- Después de la carga, **0** tareas largas atribuibles a la animación (entrada, cursor, scroll).
- Se permite **una** al iniciar: el `import()` de three.js y la creación de la escena, ≤ 120 ms, después del primer render (hoy el montaje espera 400 ms).
- Ninguna tarea de más de 200 ms, nunca.
- Bloqueo total (TBT) a 390 px y a 768 px: sin aumento respecto de la tanda anterior (no se carga three.js ahí).

## Peso de JS nuevo (gzip)
- Código propio de la animación (motor, escena, coreografía, sección de la red): **≤ 8 KB**.
- Crecimiento del chunk de three.js por clases nuevas (esfera, rayo, luz puntual): **≤ 10 KB**. Medido hoy: el chunk que contiene `WebGLRenderer` pesa 122 KB gzip *incluyendo* los tres prototipos, así que es el techo del punto de partida.
- Dependencias nuevas: **0**. Imágenes, fotos o fuentes nuevas: **0**. Peticiones de red nuevas: **0**.
- El JS inicial de `/` no crece: todo lo nuevo entra con `import()` dinámico, solo en ≥ 1024 px y sin movimiento reducido.

## Reglas de ejecución
- Un solo `requestAnimationFrame` para todo; pausa con la pestaña oculta y con la escena fuera de pantalla.
- Sin `setState` por cuadro y sin asignaciones por cuadro (se reutilizan vectores y colores).
- Solo `transform` y `opacity` en el DOM; el resto vive dentro del canvas. Sin `transition: all`, sin blur animado.
- Presupuesto de dibujo: ≤ 80 llamadas por cuadro (hoy 61), ≤ 2 000 triángulos, píxel ratio ≤ 2, sin postprocesado.
- `prefers-reduced-motion`: versión estática equivalente, sin cuadros.
