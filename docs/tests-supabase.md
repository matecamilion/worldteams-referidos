# Pruebas de la base de datos y de la consulta del link en Supabase

**Proyecto:** `WorldTeams` (Supabase, región `sa-east-1`, São Paulo)

## Resumen

| Qué | Cuándo | Resultado |
|---|---|---|
| `tests.sql` sobre el esquema (schema + seed) | 22/10/2026 | **93 pasan, 0 fallan, de 93** |
| `tests.sql` con la consulta del link (schema + seed + `consulta_referente.sql`) | 22/10/2026 | **124 pasan, 0 fallan, de 124** |
| `verificar-consulta.mjs` contra la API real, con la clave anónima | 22/10/2026 | **18 de 18 comprobaciones OK** |
| Landing `/r/[codigo]` en modo real (`NEXT_PUBLIC_DEMO=false`) contra Supabase | 22/10/2026 | Todos los casos como corresponde (detalle abajo) |
| **`tests.sql` completo, estado actual** (schema + seed + consulta_referente + email_habilitado + panel_resolver + `evaluacion_cv.sql`) | 22/10/2026 | **269 pasan, 0 fallan, de 269** (corrido por Mateo en la base real) |

Las filas de 93 y 124 pruebas son fotos históricas de cada etapa; el estado vigente es el de 269. Desde `evaluacion_cv.sql` la función `registrar_referido` vive en ese archivo (`registrar_referido.sql` quedó solo como comentario), por lo que el orden de aplicación es `schema.sql`, `seed.sql`, `consulta_referente.sql`, `email_habilitado.sql`, `panel_resolver.sql`, `evaluacion_cv.sql` y `tests.sql`.

`tests.sql` lo corrió Mateo en el editor SQL del proyecto real, en este orden: `schema.sql`, `seed.sql`, `consulta_referente.sql`, carga del secreto de aplicación y `tests.sql` (que termina en `ROLLBACK`: no deja datos). En `tests.sql` el editor preguntó cómo crear la tabla temporal `resultados`; se eligió **"Run without RLS"**: es una tabla temporal de la sesión de prueba, donde se anotan los OK y las FALLA, y desaparece con el `ROLLBACK`. No es una tabla del esquema.

El detalle prueba por prueba es la tabla que devuelve `tests.sql` (la primera fila es el resumen).

## Qué cubren las 124 pruebas de `tests.sql`

| Área | Qué se verifica |
|---|---|
| Configuración | Hay **12 claves**: el test de seed *"las 10 claves existen"* cuenta solo las 10 originales y las 2 de la evaluación del CV (`evaluacion_cv_activa`, `evaluacion_cv_umbral`; apagada y en 60 por defecto) tienen sus propias pruebas; se rechazan montos negativos o no numéricos, día de corte fuera de 1–28, hitos mal formados, zona horaria inexistente o `limite_consulta_codigo` incompleto |
| `codigo_referido` | Se genera solo (nombre normalizado + sufijo base36 de **8**); el formato viejo (solo nombre) y el de 6 caracteres se rechazan; mayúsculas rechazadas; no se repite; no se puede cambiar; 500 códigos generados son válidos y distintos; los 4 del seed tienen 8 caracteres |
| Candidatos | Email y LinkedIn se guardan normalizados; duplicados por email o LinkedIn (aunque cambien mayúsculas, `www`, barra o parámetros) se rechazan; LinkedIn inválido; aviso de visibilidad obligatorio; `es_prioritario` solo con las 4 condiciones |
| Referidos | Un solo referido vigente por candidato; un descartado convive con el vigente; autorreferido por email y por LinkedIn bloqueado; solo un referente colocado y no sancionado abre referidos; transiciones de estado válidas |
| Historial | El alta y cada cambio quedan registrados con actor y motivo (también en un `UPDATE` directo); no se puede modificar, borrar ni vaciar |
| Pagos | Montos desde `configuracion`; extra prioritario; idempotencia (repetir no duplica; las restricciones únicas rechazan duplicados); bonos de hito acumulativos, una vez por año; un cambio de monto afecta solo a lo nuevo; movimientos inmutables y cerrados al pagarse |
| Ciclo | Corte dentro y fuera del mes; la zona horaria cambia el ciclo del mismo instante (Pago Pago vs. Kiritimati); referente ya no colocado cobra por transferencia |
| Sanción | Cancela pendientes, respeta lo pagado, no cambia el estado de los referidos; un sancionado no abre referidos ni genera movimientos; repetirla no cambia la fecha |
| RLS y permisos | Referente: ve solo lo suyo y **pedir por id los datos de otro referente no devuelve nada**; `v_mis_referidos` muestra rechazado como `no_avanzo`; vínculo por `auth.uid()` con prioridad sobre el email. Reclutamiento: lee todo, no escribe; una persona dada de baja no ve nada. Anónimo: solo lee `configuracion`. RLS activado en las 9 tablas; bucket `cvs` privado (PDF, 5 MB) |
| Consulta del link (decisión 41) | Con el secreto: devuelve `ok` solo con estado, nombre, apellido y código; el código se normaliza; no colocado, sancionado, formato viejo e inexistente responden `no_existe`. **Sin secreto válido, un código válido responde `no_autorizado`**; 30 intentos sin secreto con IP y encabezados inventados no devuelven datos ni escriben filas ni dejan bloqueada ninguna IP. Límite por IP: 10 códigos distintos y el 11.º bloquea (también a un código válido); otra IP queda libre; repetir un código cuenta una vez; la ventana vence y se limpia; el tope sale de `configuracion`. Permisos: el anónimo llama a la función pero no lee `referentes`, `secretos_internos` ni `intentos_consulta_codigo` y no escribe |

## Verificación contra la API real (`verificar-consulta.mjs`, 18 de 18 OK)

Se hizo por la API pública de Supabase, con la clave anónima (la misma que tiene cualquiera) y el secreto de la aplicación leído de `app/.env.local` sin imprimirlo.

- **Con el secreto:** un código válido devuelve `ok` con nombre y apellido; la respuesta trae solo `estado, nombre, apellido, codigo_referido` (sin email ni LinkedIn); un código inexistente y el código viejo de 6 caracteres responden `no_existe`.
- **Sin secreto o con uno incorrecto:** un código **válido** responde `no_autorizado` y sin nombre, también con IP inventada y encabezados `x-forwarded-for`, `x-real-ip`, `x-vercel-forwarded-for`, `true-client-ip` y `forwarded` falsificados. 15 llamadas sin secreto con IP y encabezados distintos: todas `no_autorizado` (ninguna `bloqueada` ni `no_existe`: no hay contador ni oráculo). La IP que usaron los falsificadores no queda afectada para quien sí tiene el secreto.
- **`cf-connecting-ip` falsificado:** el borde de Supabase (Cloudflare) rechaza la petición con **HTTP 403** antes de que llegue a la base, incluso con el secreto correcto. La función no usa ese encabezado ni ningún otro, así que esto no condiciona el diseño.
- **Límite por IP (segunda capa):** 10 códigos distintos inexistentes de una IP responden `no_existe`; el 11.º queda `bloqueada`; con la IP bloqueada ni un código válido responde.
- **Tablas cerradas:** el rol anónimo no lee `referentes`, `secretos_internos`, `intentos_consulta_codigo`, `candidatos` ni `movimientos_pago`.

## Landing en modo real (`NEXT_PUBLIC_DEMO=false`, contra Supabase)

La app se levantó con `NEXT_PUBLIC_DEMO=false` pasado por variable de entorno del proceso (`.env.local` sigue con `true`).

| Caso | Resultado |
|---|---|
| `/r/lucia-k7q2m9xd` | Muestra "Lucía Gómez te recomendó…" (HTTP 200) |
| `/r/LUCIA-K7Q2M9XD` (mayúsculas) | Igual: el código se normaliza |
| `/r/zzz-00000000` (formato válido, no existe) | "No encontramos este link" |
| `/r/lucia-gomez` (formato inválido) | "No encontramos este link" |
| `/r/lucia-k7q2m9` (6 caracteres, anterior) | "No encontramos este link" |
| `/r/andres-m2w5q8vc` (referente no colocado) | "No encontramos este link": no se distingue de un código inexistente |
| `/r/%E0%A4%A` (URL mal formada) | HTTP 400, lo corta Next antes de llegar a la página |
| 10 códigos inexistentes distintos desde una IP | Todos "No encontramos este link"; el 11.º y siguientes, "Demasiados intentos" |
| Código **válido** desde esa IP bloqueada | "Demasiados intentos" |
| Código válido desde otra IP | Muestra a Lucía Gómez |
| Secreto de la app equivocado (error de configuración) | "No pudimos abrir este link" (no "link inexistente"), y el servidor lo registra sin escribir el secreto |
| `POST /api/referir` con código válido | HTTP 403 de reCAPTCHA (llegó hasta ahí; no hay n8n todavía) |
| `POST /api/referir` con código inexistente o formato viejo | HTTP 404 `codigo_invalido` |

## Cómo se comprobó que las pruebas sirven

Antes de aplicar en Supabase, todo se corrió en un Postgres local (PGlite), tanto en instalación desde cero como en migración desde el esquema ya aplicado con sufijo de 6 caracteres. Además se rompió el esquema a propósito de 21 maneras (11 sobre el esquema y 10 sobre la función de consulta: sin verificar el secreto, secreto nulo aceptado, guardar intentos sin secreto, devolver sancionados o no colocados, no bloquear códigos válidos, tope fijo, ventana sin vencer, columna extra con el email, etc.). Las pruebas detectaron 20; la restante (quitar el `GRANT` a `anon`) no es una rotura real, porque Supabase ya da ese permiso por defecto.

## Qué no cubre todavía

- **Encabezados de IP en Vercel:** la landing lee la IP del usuario de `x-vercel-forwarded-for`, `x-real-ip` o `x-forwarded-for`. Que Vercel los sobrescribe es lo que dice su documentación; se confirma con el sitio desplegado. Si fallara, el riesgo es acotado: un cliente podría variar su IP aparente para esquivar el límite, pero el sufijo de 8 caracteres hace inviable adivinar un código y la base no confía en ninguna IP sin el secreto.
- **Límite compartido:** vive en la base, así que vale para todas las instancias.
- **Rendimiento y carga:** no se midió con volumen.
- **Auth real:** los tokens se simulan con `request.jwt.claims`; el magic link de punta a punta se prueba al construir el portal.
- **Envío del formulario:** sigue en modo demo hasta que esté el flujo de n8n.
