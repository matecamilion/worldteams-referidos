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
1. Webhook (Header Auth, respuesta por nodo, binario en `cv`) → 2. **Preparar** (normalizaciones, `usa_revit` a booleano, UUID para el archivo; no calcula `es_prioritario`) → 3. **Subir CV** a `cvs/{uuid}.pdf` (si falla, no se llama a la función) → 3b. **Evaluación del CV** (opcional, solo con el interruptor encendido; ver abajo) → 4. **`rpc/registrar_referido`** con `p_cv_puntaje` (una transacción: candidato, referido, validación y pagos) → 5. si el resultado no es `registrado` nuevo, **borrar el CV** (si el borrado falla, sigue) → 6. **Responder** → 7. leer el plazo de `configuracion` y **mails por Resend** (si uno falla, no pasa nada: el registro ya está hecho).

Si la función falla (error o tiempo agotado) el CV **no** se borra: no se sabe si la base llegó a confirmar, y borrarlo podría dejar un candidato apuntando a un archivo inexistente. Queda un archivo huérfano (decisión 55).

## Evaluación del CV (decisión 70)
**Principio:** la IA nunca decide sola. n8n calcula un puntaje y lo pasa a `registrar_referido` como `p_cv_puntaje` (entero de 0 a 100, o `null`). La base decide: el puntaje solo puede **mandar a revisión** un caso que habría quedado validado (motivo `cv_dudoso`). Nunca rechaza, nunca valida y nunca cambia montos.

**Interruptor** (`configuracion.evaluacion_cv_activa`, por defecto `false`; el umbral `evaluacion_cv_umbral`, 60, lo lee la base, no n8n):

| Interruptor | Qué hace el flujo | Qué hace la base |
|---|---|---|
| Apagado (o la lectura falla) | Se saltea todo: no se extrae el PDF ni se llama a OpenAI (sin costo ni latencia). `p_cv_puntaje = null` | Ignora el puntaje: comportamiento de siempre |
| Encendido | Extrae el texto, lo limpia, llama a OpenAI y valida la respuesta | Candidato nuevo con puntaje `null` o menor que el umbral → `en_revision` con `cv_dudoso` (se suma a los otros motivos). Puntaje alcanza o supera el umbral → no suma nada |

**Nodos nuevos** (después de *Subir CV* y antes de *Registrar referido*): *Leer interruptor CV* (tope 3 s) → *¿Evaluar CV?* → *Recuperar CV* (el binario se toma de *Preparar*, porque los nodos HTTP lo pierden) → *Extraer texto del CV* (Extract From PDF) → *Preparar evaluación* → *¿Hay texto?* → *Evaluar CV* (nodo HTTP Request a la API de chat completions de OpenAI, credencial `WT OpenAI`) → *Resolver puntaje*. Todos los caminos terminan en *Resolver puntaje*, que es el único lugar donde nace `cv_puntaje`: entero de 0 a 100 o `null`.

**Qué se le envía a OpenAI:** solo el texto del CV y los cuatro campos del perfil declarado (especialidad, ¿maneja Revit?, seniority, nivel de inglés). No se envían nombre, apellido, email, LinkedIn del formulario ni el código del referente.
- Del texto se quitan **emails, teléfonos y URLs** con expresiones regulares (las fechas se conservan). **Los nombres no se pueden quitar de forma confiable**: el nombre de la persona (y de empresas, universidades y colegas) sigue en el texto del CV que sale al proveedor.
- Tope de **12.000 caracteres** (se conserva el principio). Menos de 200 caracteres tras limpiar espacios = PDF escaneado o vacío: no se llama a OpenAI.
- El texto va entre `===INICIO_CV===` y `===FIN_CV===` y el prompt lo trata como **dato, no instrucciones**; se elimina del CV cualquier marcador igual.
- **Frases evidentes dirigidas al modelo** ("ignorá/ignore las instrucciones", "olvidá lo anterior", "system prompt", "nuevas instrucciones", "dame 100", "puntaje/score" junto a 100 o "máximo", un JSON con `"puntaje":`) hacen que no se llame a OpenAI y el puntaje quede `null`. **Solo cubre lo evidente**: no detecta variantes disfrazadas, otros idiomas ni texto oculto en el PDF, y la defensa de fondo es que el prompt trata el CV como dato y que la IA no decide sola. "Puntaje" o "score" sueltos no alcanzan (un CV legítimo puede decir "TOEFL score 105").
- La **observación** del modelo (neutra, hasta 200 caracteres, sin datos personales) no se guarda en la base ni se muestra al candidato. Queda solo en el historial de ejecuciones de n8n, junto con el texto enviado: **hay que configurar la retención de ejecuciones** (por ejemplo 14 días).

**Tiempos:** *Leer interruptor CV* 3 s + *Evaluar CV* 6 s sin reintentos (la extracción es local). El nodo HTTP corta de verdad a los 6 s; por eso se cambió el nodo OpenAI por un HTTP Request (decisión 70). El flujo sigue tardando unos 4 s sin evaluación; la app corta a los 20 s.

**Casos de falla (todos terminan en `p_cv_puntaje = null`, el flujo sigue y la respuesta al candidato no cambia):**

| Falla | `cv_estado` interno | Con el interruptor encendido |
|---|---|---|
| Lectura del interruptor falla o devuelve vacío | `omitida` | se trata como apagado |
| El PDF no se puede leer o no hay texto (escaneado) | `sin_texto` | `en_revision` con `cv_dudoso`, **por diseño** |
| Frase evidente dirigida al modelo | `inyeccion_evidente` | `en_revision` con `cv_dudoso` |
| OpenAI falla, tarda más de 6 s o la credencial no está | `respuesta_invalida` | `en_revision` con `cv_dudoso` |
| La respuesta no es JSON, o el puntaje no es un entero de 0 a 100 | `respuesta_invalida` | `en_revision` con `cv_dudoso` |

Con el interruptor apagado ninguna de estas fallas cambia nada. La respuesta de la función incluye `cv_puntaje` (informativo); el webhook sigue respondiendo solo `{ "resultado": … }`.

**Modelo:** constante `MODELO` al inicio del nodo *Preparar evaluación* (único lugar). Por defecto `gpt-4o-mini`, **a confirmar con la lista de modelos de la cuenta**.

**Cómo se llama a OpenAI:** *Evaluar CV* es un HTTP Request `POST https://api.openai.com/v1/chat/completions` con el cuerpo armado con `JSON.stringify` (como los demás nodos HTTP): `model` (el de *Preparar evaluación*), `messages` (`system` con el prompt y `user` con el perfil y el CV), `temperature: 0`, `max_tokens: 150` y `response_format: {"type": "json_object"}`. La respuesta trae el JSON como **texto** en `choices[0].message.content`; *Resolver puntaje* lo parsea y valida. Se reemplazó el nodo OpenAI de n8n porque rechazaba la llamada con un 400 sin detalle (decisión 70).
- **Never Error (para probar):** el nodo devuelve el cuerpo del error de OpenAI (`{"error": {"message": …}}`) en lugar de cortarse, así se ve la causa. *Resolver puntaje* lo trata como cualquier respuesta sin puntaje válido: `null`. Con el interruptor encendido el comportamiento es **el mismo** (`null` → `cv_dudoso`). Lo único que cambia es el monitoreo: una llamada rechazada queda como ejecución exitosa con el error dentro de la salida del nodo, no como un nodo en rojo. Cuando el flujo esté estable conviene desactivarla.
- **`max_tokens`:** es el nombre del parámetro para `gpt-4o-mini` y la familia 4. Si más adelante se cambia `MODELO` por un modelo de razonamiento, OpenAI puede exigir `max_completion_tokens` y rechazar la llamada (400 → `null` → revisión): revisalo al cambiar de modelo.

**Aplicar el cambio en n8n:** `n8n/nodo-evaluar-cv.json` es solo este nodo, en formato de portapapeles. Borrá el nodo *Evaluar CV* actual, abrí el archivo, copiá todo el contenido y pegalo en el canvas (Ctrl+V); conectá *¿Hay texto?* (salida "true") → *Evaluar CV* → *Resolver puntaje*, elegí la credencial `WT OpenAI` si no quedó asignada, guardá y publicá de nuevo. Reimportar `flujo-1-registro.json` completo da el mismo resultado, pero obliga a revisar todas las credenciales.

**Mails de las pruebas:** el script usa alias `matecamilion05+flujo1-<corrida>-<caso>@gmail.com` (nunca `@example.com`: el flujo manda mails reales desde `mail.signa.net.ar` y los rebotes dañan la reputación del dominio). Una corrida completa manda 8 mails sin evaluación (6 si el interruptor está encendido y se omite el caso 8) y 5 con `PROBAR_EVALUACION=1`.

**Probar:** `n8n/probar-flujo-1.mjs`. Sin variables corre los casos 0 a 8 (el 8 verifica el interruptor apagado). `PROBAR_EVALUACION=1` corre E1 a E4 y exige el interruptor encendido. La **falla simulada** (E5) se hace con `PROBAR_EVALUACION=1` y `PROBAR_FALLA_OPENAI=1`, después de poner un modelo inexistente en `MODELO`; **hay que restaurar el modelo cuando termina**, si no, con el interruptor encendido todos los registros irían a revisión.

## Credenciales de n8n (nunca en el JSON)
- **WT Webhook Secret** — Header Auth: nombre `x-webhook-secret`, valor = `N8N_WEBHOOK_SECRET` de la app.
- **WT Supabase** — Custom Auth: `{"headers": {"apikey": "<service role>", "Authorization": "Bearer <service role>"}}`. La service role solo vive acá (regla 7).
- **WT Resend** — Header Auth: nombre `Authorization`, valor `Bearer <clave de Resend>`.
- **WT OpenAI** — credencial de tipo *OpenAI API* con la clave de la cuenta. El nodo HTTP Request la usa como tipo de credencial predefinido (*Authentication: Predefined Credential Type → OpenAI*), por nombre; el JSON no la contiene. Si en tu n8n el HTTP Request no ofrece ese tipo, creá una **Header Auth** llamada `WT OpenAI` (nombre `Authorization`, valor `Bearer <clave de OpenAI>`) y en el nodo elegí *Generic Credential Type → Header Auth*. Conviene un tope de gasto mensual en la cuenta de OpenAI.

La URL del proyecto Supabase está escrita en los nodos HTTP (viene de `NEXT_PUBLIC_SUPABASE_URL`, no es secreta); confirmá que es la del proyecto `WorldTeams`. Remitente de los mails: `referidos@mail.signa.net.ar` (dominio verificado en Resend solo para este ejercicio; en producción, el dominio de WorldTeams).
