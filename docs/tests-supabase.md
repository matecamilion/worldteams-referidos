# Pruebas de la base de datos en Supabase

**Fecha:** 22/10/2026 · **Proyecto:** `WorldTeams` (Supabase, región `sa-east-1`, São Paulo)

## Resultado

**93 pasan, 0 fallan, de 93.**

Corrido por Mateo en el editor SQL del proyecto real, en este orden:

1. `supabase/schema.sql` (una sola vez, completo).
2. `supabase/seed.sql`.
3. `supabase/tests.sql` (termina en `ROLLBACK`: no deja datos).

En `tests.sql` el editor preguntó cómo crear la tabla temporal `resultados`; se eligió **"Run without RLS"**. Es una tabla temporal de la sesión de prueba, donde se anotan los OK y las FALLA, y desaparece con el `ROLLBACK`. No es una tabla del esquema ni queda en la base.

El detalle prueba por prueba es la tabla que devuelve el propio `tests.sql` (la primera fila es el resumen). La lista completa de qué se prueba está en el archivo.

## Qué cubren las 93 pruebas

| Área | Qué se verifica |
|---|---|
| Configuración | Las 10 claves del seed existen; se rechazan montos negativos o no numéricos, día de corte fuera de 1–28, hitos mal formados, zona horaria inexistente o `limite_consulta_codigo` incompleto |
| `codigo_referido` | Se genera solo (nombre normalizado + sufijo base36 de 6); el formato viejo y las mayúsculas se rechazan; no se repite; no se puede cambiar; 500 códigos generados son válidos y distintos |
| Candidatos | Email y LinkedIn se guardan normalizados; duplicados por email o LinkedIn (aunque cambien mayúsculas, `www`, barra o parámetros) se rechazan; LinkedIn inválido; aviso de visibilidad obligatorio; `es_prioritario` solo con las 4 condiciones |
| Referidos | Un solo referido vigente por candidato; un descartado convive con el vigente; autorreferido por email y por LinkedIn bloqueado; solo un referente colocado y no sancionado abre referidos; transiciones de estado válidas |
| Historial | El alta y cada cambio quedan registrados con actor y motivo (también en un `UPDATE` directo); no se puede modificar, borrar ni vaciar |
| Pagos | Montos desde `configuracion`; extra prioritario; idempotencia (repetir no duplica; las restricciones únicas rechazan duplicados); bonos de hito acumulativos, una vez por año; un cambio de monto afecta solo a lo nuevo; movimientos inmutables y cerrados al pagarse |
| Ciclo | Corte dentro y fuera del mes; la zona horaria cambia el ciclo del mismo instante (Pago Pago vs. Kiritimati); referente ya no colocado cobra por transferencia |
| Sanción | Cancela pendientes, respeta lo pagado, no cambia el estado de los referidos; un sancionado no abre referidos ni genera movimientos; repetirla no cambia la fecha |
| RLS y permisos | Referente: ve solo lo suyo y **pedir por id los datos de otro referente no devuelve nada**; `v_mis_referidos` muestra rechazado como `no_avanzo`; no escribe ni ejecuta funciones; vínculo por `auth.uid()` con prioridad sobre el email. Reclutamiento: lee todo, no escribe; una persona dada de baja no ve nada. Anónimo: solo lee `configuracion`. RLS activado en las 7 tablas; bucket `cvs` privado (PDF, 5 MB) |

## Cómo se comprobó que las pruebas sirven

Antes de aplicar en Supabase, `schema.sql` y `tests.sql` se corrieron en un Postgres local (PGlite). Además se rompió el esquema a propósito de 11 maneras (sin el índice único parcial, con un monto hardcodeado, con RLS abierta, con historial editable, sin `ON CONFLICT`, con la zona ignorada, con un sancionado que sigue operando, sin el filtro de cada vista del portal y sin la prioridad de `auth.uid()`), y las pruebas detectaron las 11.

## Qué no cubre

- **Rendimiento y carga:** no se midió con volumen.
- **Auth real:** los tokens se simulan con `request.jwt.claims`; el magic link de punta a punta se prueba al construir el portal.
- **Límite de consultas del link:** hoy vive en memoria de la app (decisión 2); pasa a la base al conectar `/r/[codigo]`.
