# Contrato del webhook de registro (flujo 1)

`app/api/referir/route.ts` → webhook de n8n → función `registrar_referido` de la base. Archivos: `flujo-1-registro.json` (importable) y `probar-flujo-1.mjs` (prueba real).

## Entrada
`POST {N8N_WEBHOOK_URL}` · `multipart/form-data` · header `x-webhook-secret` (credencial Header Auth).

| Campo | Valores |
|---|---|
| `codigo_referente` | código del link (`lucia-k7q2m9xd`) |
| `nombre`, `apellido`, `email` | texto; el email ya viene en minúsculas |
| `linkedin_url` | ya normalizada por la app (`https://www.linkedin.com/in/usuario`) |
| `especialidad` | `arquitectura` \| `ingenieria` |
| `usa_revit` | `si` \| `no` (n8n lo pasa a booleano) |
| `seniority` | `junior` \| `semi_senior` \| `senior` |
| `nivel_ingles` | `basico` \| `intermedio` \| `avanzado` \| `nativo` |
| `acepto_visibilidad` | `true` (la función rechaza cualquier otro valor) |
| `cv` | archivo PDF (≤ 5 MB; la app ya comprobó extensión y firma `%PDF`) |

Verificado contra `app/api/referir/route.ts`: arma exactamente estos campos y este header. No hizo falta cambiarlo.

## Salida
`200` con JSON `{ "resultado": "registrado" | "ya_registrado" | "codigo_invalido" }`. Cualquier otra cosa (incluido un error de n8n) hace que la app responda 502.

| Caso | `resultado` | CV | Mails |
|---|---|---|---|
| Candidato nuevo (validado o `en_revision`) | `registrado` | se conserva | confirmación al candidato; "validado" al referente solo si `estado = validado` |
| Reintento del mismo referente (`repetido = true`) | `registrado` | el nuevo se borra | ninguno |
| Ya estaba en el pool | `ya_registrado` | se borra | "no cuenta" al referente; nada al candidato |
| Autorreferido (la función devuelve `autorreferido`) | `ya_registrado` | se borra | ninguno |
| Código inexistente, referente no colocado o sancionado | `codigo_invalido` | se borra | ninguno |
| La subida del CV o la función fallan | respuesta 502 `{ "resultado": "error" }` | ver abajo | ninguno |

## Orden del flujo
1. Webhook (Header Auth, respuesta por nodo, binario en `cv`) → 2. **Preparar** (normalizaciones, `usa_revit` a booleano, UUID para el archivo; no calcula `es_prioritario`) → 3. **Subir CV** a `cvs/{uuid}.pdf` (si falla, no se llama a la función) → 4. **`rpc/registrar_referido`** (una transacción: candidato, referido, validación y pagos) → 5. si el resultado no es `registrado` nuevo, **borrar el CV** (si el borrado falla, sigue) → 6. **Responder** → 7. leer el plazo de `configuracion` y **mails por Resend** (si uno falla, no pasa nada: el registro ya está hecho).

Si la función falla (error o tiempo agotado) el CV **no** se borra: no se sabe si la base llegó a confirmar, y borrarlo podría dejar un candidato apuntando a un archivo inexistente. Queda un archivo huérfano (decisión 55).

## Credenciales de n8n (nunca en el JSON)
- **WT Webhook Secret** — Header Auth: nombre `x-webhook-secret`, valor = `N8N_WEBHOOK_SECRET` de la app.
- **WT Supabase** — Custom Auth: `{"headers": {"apikey": "<service role>", "Authorization": "Bearer <service role>"}}`. La service role solo vive acá (regla 7).
- **WT Resend** — Header Auth: nombre `Authorization`, valor `Bearer <clave de Resend>`.

La URL del proyecto Supabase está escrita en los nodos HTTP (viene de `NEXT_PUBLIC_SUPABASE_URL`, no es secreta); confirmá que es la del proyecto `WorldTeams`. Remitente de los mails: `onboarding@resend.dev` (dominio de prueba: solo entrega a la casilla titular de Resend).
