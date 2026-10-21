# CLAUDE.md — Programa de Referidos de Talento (WorldTeams)

## Contexto
Ejercicio práctico de Mateo para el proceso de selección de **Web & Automation Developer (AI-first)** en WorldTeams.
WorldTeams conecta profesionales de LATAM (arquitectura e ingeniería) con firmas de EE.UU.
Hoy entran 500 candidatos por mes al talent pool; el objetivo es llegar a 1000. La solución es un programa de referidos.

**Entrega: viernes 23/10/2026 antes del mediodía (meta interna: 11:00).** Después hay una presentación de 20–30 min.

Entregables pedidos:
1. Esquema del programa (máx. 1 página)
2. Modelo de datos
3. Landing para referir
4. Flujo de automatización
5. Nota de decisiones (supuestos, qué quedó afuera, segunda etapa) + cómo se usó la IA y qué se corrigió

Lo que evalúan: cómo pensamos y priorizamos, que las piezas sean coherentes entre sí y que cada decisión se pueda defender.

## Archivos de este repo (leer antes de trabajar)
- `DECISIONS.md` — las decisiones ya tomadas (hoy 32), supuestos y especificación del modelo de datos. **Es la fuente de verdad.**
- `PLAN.md` — tareas en orden de prioridad, con planes de respaldo.
- `AI-LOG.md` — registro de qué propuso la IA y qué corrigió Mateo (es parte de la entrega).
- Documento de modelo de datos (Claude Doc): https://claude.ai/artifact/5FZzwEEBxq7a16CMjapF2a

## Stack
- **Supabase** (cuenta nueva creada solo para este ejercicio; proyecto **`WorldTeams`**, región `sa-east-1`, São Paulo): Postgres, Auth (magic link), RLS, Storage (bucket privado para CVs). Las claves están en `app/.env.local` (nunca se commitea, nunca se imprime en chat).
- **n8n**: toda la orquestación (webhooks, reglas, mails, flujos programados). Exportar cada flujo como JSON a `/n8n`.
- **Resend**: envío de mails desde n8n. En la demo, dominio de prueba (los mails llegan a la casilla de Mateo).
- **Next.js (App Router) + Tailwind**, deploy en Vercel: landing, portal del referente y panel de revisión en **una sola app con dos roles**.
- reCAPTCHA en el formulario de la landing.

## Estructura
```
/app        Next.js (landing /r/[codigo], /portal, /panel)
/supabase   schema.sql, seed.sql, tests.sql
/n8n        flujos exportados (.json) + diagramas
/docs       esquema del programa, modelo de datos, nota de decisiones
```

## Reglas de trabajo
1. **No reabras decisiones de `DECISIONS.md`.** Si algo no está cubierto, proponé una opción con su porqué, preguntale a Mateo y, cuando la confirme, registrala en `DECISIONS.md` (número nuevo, porqué, alternativas descartadas).
2. **Registrá en `AI-LOG.md`** cada vez que Mateo corrija o rechace algo que propusiste: qué propusiste, qué cambió y por qué.
3. **Respetá el alcance.** Nada de la "Segunda etapa" se construye. Si sobra tiempo, se pule lo existente.
4. **Prioridad absoluta: el camino feliz de punta a punta** (referente → link → candidato se registra → validación → movimiento de pago → mail). Primero que funcione, después que sea lindo.
5. **Las garantías viven en la base, la orquestación en n8n.** Unicidad, idempotencia y permisos se imponen con restricciones y RLS, nunca solo en código.
6. **Nada hardcodeado:** montos, umbrales y plazos se leen de la tabla `configuracion`.
7. **Seguridad:** secretos solo en `.env` (nunca commiteados). La service role key solo la usa n8n. RLS activado en todas las tablas. El formulario envía a un webhook de n8n, no escribe directo en la base.
8. **Supabase:** esa cuenta y el proyecto `WorldTeams` son lo único que se puede tocar. Antes de cualquier llamada a Supabase confirmá que apunta a ese proyecto (nombre y región); si el conector muestra otras cuentas o proyectos, no los listes ni los toques. El esquema y las pruebas se muestran a Mateo y se espera su OK antes de aplicarlos. Crear proyectos nuevos o cualquier acción con costo: pedir confirmación.
9. **Idioma:** la interfaz va en español, con todos los textos en `app/i18n/es.json` (preparado para sumar inglés y portugués). Nombres de tablas y columnas en español, como en `DECISIONS.md`.
10. Al terminar cada tarea de `PLAN.md`, marcala, contá en 3–5 líneas qué quedó y qué falta, y verificá con una prueba real (no solo "debería funcionar").
