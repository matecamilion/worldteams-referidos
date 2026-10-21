# PLAN.md — Tareas en orden de prioridad

Regla: no se pasa a la tarea siguiente hasta que la anterior funcione y esté probada. Si el tiempo aprieta, se aplican los respaldos de abajo, en ese orden.

## Miércoles 21/10 (preparación)
- [ ] Crear carpeta, `git init`, estructura `/app /supabase /n8n /docs`, `.gitignore` con `.env`.
- [ ] Crear proyecto Supabase `worldteams-referidos` (confirmar costo con Mateo antes).
- [ ] Crear cuenta en Resend (dominio de prueba) y en n8n (recomendado: n8n Cloud en prueba, para tener webhooks públicos sin túnel).

## Jueves 22/10 (construcción)
1. [~] **Landing (modo demo, decisiones 27–29)** — primero `/r/[codigo]` con formulario funcionando en demo, después `/` (hero, 3 pasos, premios, calculadora, FAQ, cierre). `/r/[codigo]`: valida el código, muestra quién recomienda, formulario de la decisión 21, reCAPTCHA, subida de CV, aviso de visibilidad, envío al webhook de n8n, pantalla de confirmación (decisión 23) y mensaje neutro para registrados previos. Textos en `i18n/es.json`. Diseño acorde a WorldTeams (verde oscuro, verde lima), sin copiar su página. Luego se conecta a Supabase (lectura de `configuracion` y referentes) y a n8n (`/api/referir` → webhook).
2. [ ] **Base de datos** — `supabase/schema.sql` según `DECISIONS.md`: tablas, restricciones, índice único parcial, columna generada `es_prioritario`, vistas, RLS, bucket privado de CVs. `seed.sql`: configuración inicial, 3–4 referentes de ejemplo, 1 persona de reclutamiento. `tests.sql`: probar que un email duplicado falla, que un segundo movimiento del mismo concepto falla y que el referente solo ve lo suyo.
3. [ ] **Flujo principal n8n** — webhook de registro → referente válido y colocado → normalizar email/LinkedIn → ¿ya en pool? / ¿duplicado? / ¿autorreferido? → `descartado` + mail · si no: crear candidato y referido `registrado` → reglas de validación + alerta de volumen → `validado` (crear movimientos con montos de `configuracion` + bono de hito si corresponde + mail) o `en_revision` (motivos). Historial en cada cambio. Exportar JSON.
4. [ ] **Portal del referente** — magic link (solo emails de `referentes`), link copiable, lista de referidos (nombre + estado), premios pendientes/pagados, barra de avance desde `v_progreso_referente`.
5. [ ] **Panel de revisión** — magic link (solo `equipo_reclutamiento`), casos `en_revision` con motivo y antigüedad, Aprobar/Rechazar → webhook de n8n → mismo flujo de validación.
6. [ ] **Flujos programados n8n** — resumen diario a reclutamiento con vencidos (decisión 26) · cierre mensual: CSV de `v_cierre_ciclo` por mail + botón "Confirmar pago" (decisión 25).

## Viernes 23/10 (entrega, antes de las 11:00)
7. [ ] Prueba completa de punta a punta con datos de demo + video corto (Loom, 3 min) del flujo funcionando.
8. [ ] Diagramas: ERD y flujo de n8n.
9. [ ] Esquema del programa en 1 página (decisiones 1–14).
10. [ ] Nota de decisiones (desde `DECISIONS.md` + `AI-LOG.md`).
11. [ ] PDF de presentación con los 5 entregables + links (landing, repo, video).
12. [ ] Responder el mail de WorldTeams con la entrega.

## Respaldos (en este orden si falta tiempo)
1. Panel de revisión → mail diario con botones Aprobar/Rechazar.
2. Portal del referente → mail al referente con su estado y avance cada vez que algo cambia.
3. Cierre mensual → se documenta y se muestra la vista `v_cierre_ciclo`.
Cada respaldo aplicado se anota en la nota de decisiones como recorte consciente.

## Fuera de alcance (no construir)
Todo lo listado en "Segunda etapa" de `DECISIONS.md`.
