# DECISIONS.md — Registro de decisiones

Formato para decisiones nuevas: **N. Título** — decisión · por qué · alternativas descartadas · [supuesto] si no está confirmado por WorldTeams.

## Respuestas de WorldTeams (Eugenia Franco, Operaciones)
- La meta de 500 → 1000 se mide en **ingresos al talent pool** (personas que se registran y entran a la base), no en colocaciones.
- Perfil más necesitado: **arquitectos con Revit, senior, buen inglés**. Trabajan con arquitectura e ingeniería. No priorizan por país.
- No hay presupuesto por referido ni costo por candidato definido.

---

## Esquema del programa

**1. Quién refiere** — Solo profesionales **colocados** por WorldTeams que trabajan con una firma cliente. Tienen sueldo donde cobrar, su criterio ya fue validado, no hay conflicto de intereses (como alguien en proceso de selección) y tienen menos urgencia económica y más reputación en juego, lo que reduce referidos flojos (hipótesis de diseño). Descartado: cualquier persona, o candidatos sin colocar → segunda etapa.

**2. Cómo se refiere** — Link personal y único por referente (`/r/{codigo}`), con código = nombre normalizado + sufijo aleatorio no adivinable de 8 caracteres base36 generado con crypto (ej. `/r/lucia-k7q2m9xd`, 36^8 ≈ 2,8 billones de combinaciones: adivinarlo es inviable incluso sin límite de intentos). El candidato carga sus propios datos. · por qué: un código que fuera solo el nombre se podía adivinar, permitía atribuciones falsas (usar el link de otro) y exponía quién trabaja con WorldTeams; el nombre queda solo para que el link sea legible · límite (segunda capa): la consulta de un código aplica un tope de códigos inexistentes por IP (10 en 10 minutos, configurable) y, con la IP bloqueada, ni un código válido responde; el formato se descarta antes de consultar la base; con la base conectada el contador vive en la base (decisión 41), no en memoria · historia: nació con 6 caracteres (36^6 ≈ 2.200 millones) y se subió a 8 porque con ~750 referentes y sin límite un barrido a 1.000 consultas por segundo acertaría uno cada ~50 minutos · Descartado: que el referente cargue datos de terceros (sin consentimiento, depende del esfuerzo del referente); código solo con el nombre (adivinable); código totalmente opaco (el nombre ayuda a que el candidato reconozca el link y desconfíe menos).

**3. Tipo de premio** — Efectivo. Consulta informal a 6 personas: 5 prefirieron efectivo por flexibilidad ("con la plata podés hacer lo mismo que ofrece un catálogo"); 1 prefirió créditos (premio con destino fijo). Descartado: créditos canjeables (logística de premios en LATAM, costo impredecible).

**4. Estructura** — Pago por referido validado + bono por hitos (meta progresiva que motiva a seguir refiriendo; idea original de Mateo).

**5. Evento de pago** — El candidato se registra **y su perfil es validado**. Reemplazó la idea inicial de pagar a los 90 días de la colocación, porque la métrica del programa es el ingreso al pool. Descartado: pagar al registrarse (abre la puerta a registros falsos con el bono por hitos).

**6. Candidato que ya estaba en el pool** — No cuenta como referido. El referente recibe un mail avisando, para que no sienta que su recomendación se perdió.

**7. Duplicados y atribución** — No se permiten candidatos duplicados: email normalizado (minúsculas, sin espacios) y LinkedIn normalizado, ambos únicos en la base. El premio va al referente cuyo link usó el candidato al registrarse. La regla se apoya en el comportamiento natural (nadie se registra dos veces) y el chequeo es la red de seguridad.

**8. Autorreferido** — Bloqueado por el chequeo de duplicados (email/LinkedIn del candidato vs. del referente) + validación del perfil + **sanción explícita**: autorreferirse o cargar referidos falsos implica perder los premios y puede implicar la expulsión del programa. Señales por IP/teléfono → segunda etapa.

**9. Validación** — Automática por reglas (perfil completo, CV cargado, sin duplicados, sin alertas) → `validado` sin intervención. Si falla una regla o salta una alerta → `en_revision` y reclutamiento decide. Un solo punto de aprobación humana para que escale al duplicar ingresos. [supuesto] WorldTeams ya filtra candidatos antes de entrar al pool; el programa se engancha a ese paso.

**10. Volumen** — Sin tope de referidos por referente. Alerta: más de 5 referidos en 7 días (configurable) → esos referidos pasan a revisión.

**11. Cuándo se paga** — Mensual, junto con el sueldo, con fecha de corte configurable (día 25). [supuesto] WorldTeams liquida el sueldo de los colocados y puede sumar el premio.

**12. Montos (USD, pago único, todos en `configuracion`)** — Base 50 · Perfil prioritario 100 (multiplicador x2) · Hitos por año calendario: 3 referidos validados +75, 6 → +150, 10 → +300. No dependen del sueldo de nadie (descartado: % del sueldo del referente, recurrente o único: injusto entre referentes, costo sin techo, dato sensible). Referencia informal: una inmobiliaria paga USD 100 por recomendado incorporado; nuestro evento es más temprano (ingreso al pool), por eso el base queda por debajo. La referencia de USD 5.000/año del programa de clientes de WorldTeams no es comparable.

**13. Meta y escenarios** — La meta es aportar las 500 extra, presentada con tres escenarios y punto de equilibrio. Con 750 referentes, llegar a 500/mes exige 0,67 referidos validados por referente por mes con el 100% participando. Costo promedio por referido validado: USD 65 (30% prioritarios), sin hitos.

| Escenario | Referentes activos | Validados/activo/mes | Ingresos/mes | Costo/mes |
|---|---|---|---|---|
| Conservador | 75 (10%) | 0,5 | ~38 | ~USD 2.400 |
| Base | ~190 (25%) | 0,5 | ~95 | ~USD 6.200 |
| Optimista | 375 (50%) | 1 | ~375 | ~USD 24.400 |
| Para llegar a 500 | 750 (100%) | 0,67 | 500 | ~USD 32.500 |

Punto de equilibrio: el programa se paga solo si al menos X% de los referidos termina colocado, con X = costo por referido ÷ ingreso de WorldTeams por colocación (dato a pedir en la charla). Conclusión: el cuello de botella es la cantidad de referentes, no el costo → la segunda etapa amplía la base. Primero construir bien las bases, después escalar.

**14. Referente que deja de estar colocado** — Cobra igual lo que ya ganó (le pertenece), salvo sanción. Si ya no tiene sueldo, se paga por transferencia en el mismo ciclo. [supuesto] WorldTeams puede pagar por otro medio.

## Modelo de datos

**15. Estados con historial** — Cada referido tiene estado actual + historial de cambios (fecha, actor sistema/reclutamiento, motivo). "Lo que no se mide no se mejora."

**16. Libro de movimientos de pago** — Cada monto es una fila (base, extra prioritario, bono de hito) con estado y ciclo. El monto se copia de la configuración al crearse.

**17. Configuración editable** — Tabla clave/valor, sin versiones. WorldTeams ajusta los números sin depender de quien construyó el sistema. En la etapa 1 se edita desde Supabase; un panel amigable es segunda etapa.

## Interfaces

**18. Panel de revisión** — Una pantalla con login, solo para reclutamiento: lista de casos `en_revision` con su motivo, botones Aprobar/Rechazar que llaman a un webhook de n8n (la lógica no se duplica en el panel). Se construye último. **Respaldo:** mail diario con botones Aprobar/Rechazar.

**19. Portal del referente** — Login por magic link. Muestra su link, sus referidos con estado, sus premios (pendientes/pagados) y la barra de avance al próximo hito. Solo lectura. Sin visibilidad no hay incentivo (argumento de Mateo). Acceso: solo emails de la lista de colocados que carga WorldTeams. **Respaldo:** mail al referente con su estado y avance.

**20. Privacidad del portal** — El referente ve nombre completo y estado de cada referido, nada más (ni mail, ni CV, ni motivos). Rechazados y descartados se ven como "no avanzó". La landing avisa: "Quien te recomendó podrá ver tu nombre y el estado de tu registro."

**21. Formulario** — Nombre, apellido, email, LinkedIn, CV, especialidad (arquitectura/ingeniería), ¿maneja Revit?, seniority (junior/semi senior/senior), nivel de inglés (básico/intermedio/avanzado/nativo), aceptación del aviso de visibilidad.

**22. Idioma** — Español (menos fricción para candidatos de LATAM), textos en archivo de traducciones para sumar inglés y portugués.

**23. Después de enviar** — Pantalla de confirmación con próximos pasos ("lo revisamos y te contactamos en hasta 5 días hábiles"), nombrando a quien lo recomendó, + mail con lo mismo. Si el mail ya estaba registrado: mensaje neutro ("ya tenemos tu perfil en nuestra base…"), sin mencionar referidos ni premios.

## Automatización

**24. Mails** — Resend desde n8n, 5 momentos: (1) bienvenida al referente con link y acceso, una vez; (2) confirmación al candidato; (3) referido validado → referente, con el bono de hito en el mismo mail si corresponde; (4) no cuenta / no avanzó → referente, un solo modelo; (5) resumen diario a reclutamiento, solo si hay casos pendientes. "Se registró con tu link" se ve en el portal, no por mail. Demo: dominio de prueba de Resend; producción: dominio verificado de WorldTeams.

**25. Cierre mensual** — El día de corte, n8n genera un CSV con los movimientos pendientes (referente, concepto, monto, método de pago) y lo manda por mail a quien liquida sueldos, con un botón "Confirmar pago" que marca los movimientos como `pagado`. [supuesto] Aceptan CSV; si usan un sistema de nómina, se adapta el formato.

**26. Plazo de revisión** — 3 días hábiles (configurable), coherente con la promesa de 5 días al candidato. Si se vence: el caso aparece como vencido en el resumen diario y se avisa a la coordinación de Operaciones. Descartado: aprobación automática al vencer (aprueba justo los casos dudosos).

## Landing (decisiones agregadas el 21/10)

**27. Landing primero, en modo demo** — La landing se construye primero, en modo demo (`NEXT_PUBLIC_DEMO=true`), con datos de ejemplo; se conecta a Supabase y n8n después sin rehacerse.

**28. "Landing para referir" = dos páginas** — "/" para el referente (el programa) y "/r/[codigo]" para el candidato (formulario). [supuesto]

**29. Envío vía ruta del servidor** — El formulario envía a una ruta del servidor (`/api/referir`) que verifica reCAPTCHA y reenvía a n8n. La URL del webhook y los secretos nunca llegan al navegador.

**30. Landing "/" con una idea: el hilo que conecta** — referente → candidato → premio. Un hilo lima se dibuja con el scroll en "Cómo funciona" (sección fija con celular de 3 estados, solo en escritorio; en móvil, tres estados apilados con revelado simple). GSAP + ScrollTrigger y Lenis viven solo en "/": el formulario de "/r/[codigo]" queda con scroll nativo y sin animación de scroll. · por qué: una idea fuerte bien ejecutada, no más efectos; el formulario es donde se convierte y no debe tener fricción · descartado: preloader, cursor propio, 3D/WebGL, scroll forzado cerca del formulario.

**31. Movimiento reducido** — con `prefers-reduced-motion` no se carga Lenis ni GSAP: no hay fondo interpolado, ni marquesina, ni números que ruedan, ni sección fija. El contenido es el mismo y cada sección lleva su color fijo (verde, crema, lima, verde).

**32. Datos de ejemplo en la landing** — los referentes y candidatos de las maquetas (celular y portal) son ficticios y se rotulan como "datos de ejemplo". Los montos y totales salen de `config` (`lib/premios.ts`), nunca escritos a mano. Sin imágenes, monedas ni logos de clientes de WorldTeams. La franja lima dice "+750 profesionales · +370 empresas de EE.UU. y Canadá", con el texto de la web de WorldTeams; las cifras salen de su sitio y conviene reconfirmarlas antes de publicar.


## Base de datos (decisiones agregadas el 22/10; aprobadas por Mateo)

**33. Los pagos se generan solos al validar** — un trigger crea los movimientos de pago (base, extra prioritario y bono de hito) cuando un referido pasa a `validado`, con los montos de `configuracion` copiados en ese momento. n8n valida con una sola llamada, `cambiar_estado_referido(referido, estado, actor, actor_id, motivo, motivos)`, que además deja actor y motivo en el historial. · por qué: la regla "pago si y solo si validado" y la idempotencia (restricciones únicas) quedan en la base y no dependen de que el flujo no se repita; es la regla 5 de CLAUDE.md · cambia la tarea 3: n8n ya no crea movimientos a mano · descartado: que n8n los cree con inserciones sueltas (dos caminos, riesgo de duplicar o de olvidar un concepto).

**34. Reglas que impone la base** — transiciones de estado permitidas (registrado → validado o en_revision; en_revision → validado o rechazado; los finales no cambian); un referido nace registrado o descartado; autorreferido bloqueado (email o LinkedIn del candidato igual al del referente); solo un referente colocado y no sancionado abre referidos; el historial se registra solo y es de solo inserción; los movimientos fijan monto y concepto al crearse y los pagados o cancelados no se tocan; la configuración se valida al guardarla (un valor roto frenaría los pagos). Solo la service role (n8n) escribe y ejecuta funciones de negocio.

**35. Forma de los hitos en `configuracion`** — `[{"referidos": 3, "bono_usd": 75}, {"referidos": 6, "bono_usd": 150}, {"referidos": 10, "bono_usd": 300}]`, igual que `app/lib/config.ts`, en vez de la notación `{3:75}`. Los bonos son acumulativos: con 6 referidos validados en el año se cobran el de 3 y el de 6, una vez cada uno.

**36. Extra por perfil prioritario** — es un movimiento aparte de valor base × (multiplicador − 1): con base 50 y multiplicador 2, USD 50 de base más USD 50 de extra, USD 100 en total. · por qué: cada monto es una fila (decisión 16) y el extra se puede auditar y pagar por separado.

**37. Zona horaria del ciclo de pago** — `configuracion.zona_horaria` (por defecto `America/Argentina/Buenos_Aires`) define el día en que se valida el referido para el ciclo mensual y el año calendario de los hitos. El día de corte va de 1 a 28. · por qué: un mismo instante cae en días distintos según la zona, y eso mueve el ciclo; no puede quedar fijo en UTC · descartado: UTC (propuesta inicial de la IA).

**38. El portal lee por vistas filtradas por el vínculo del usuario** — el referente no puede leer `referidos` ni `candidatos` en crudo (verían motivos de revisión y emails, decisión 20): ve sus referidos por `v_mis_referidos` (nombre y estado; rechazado y descartado como `no_avanzo`) y su avance por `v_progreso_referente`, y lee directo solo su fila de `referentes` y sus movimientos, por RLS. Las vistas corren con los permisos de su dueño y filtran por `referente_actual_id()`, que resuelve primero por `auth.uid()` (referente vinculado a su usuario de Auth) y, si no está vinculado, por el email verificado del magic link. Si hubiera dos coincidencias gana el usuario de Auth. · el *advisor* de Supabase las marca como "security definer view": es a propósito · [supuesto] el magic link solo emite sesión para emails confirmados; al construir el portal conviene dejar cerrado el registro libre en Auth.

**39. Sanción** — `referentes.sancionado_en` (fecha; nulo = sin sanción). `sancionar_referente(referente)` lo marca, cancela los movimientos pendientes (`cancelado_sancion`), no toca lo ya pagado ni el estado de los referidos, y repetirla no cambia la fecha. Un sancionado queda como un no colocado para lo nuevo: no abre referidos y no genera movimientos nuevos; un referido que ya estaba registrado se puede validar (el candidato entra al pool) pero sin premio. · [supuesto] no hay función para levantar una sanción; si hiciera falta, la resuelve reclutamiento editando la fila.

**40. Datos de prueba y almacenamiento** — el seed usa el alias `matecamilion05+nombre@gmail.com` (todos llegan a la misma bandeja) para probar el magic link con cada rol; el cuarto referente no está colocado. CVs en el bucket privado `cvs` (solo PDF, hasta 5 MB; lo escribe n8n y lo lee reclutamiento). Los candidatos que ya estaban en el pool se cargan con `origen = 'directo'`.

**41. Consulta del link desde la landing, sin exponer `referentes`** — la página `/r/[codigo]` llama a la función `consultar_referente_por_codigo(codigo, ip, secreto)` de la base (`SECURITY DEFINER`, ejecutable por el rol anónimo). Devuelve `ok` con nombre, apellido y código solo si el referente está colocado y no sancionado; si no, `no_existe`; y `bloqueada` cuando esa IP ya probó demasiados códigos distintos que no existen. · **secreto de aplicación:** solo quien conoce el secreto (guardado en la tabla privada `secretos_internos` y en la variable de entorno de servidor `SUPABASE_CONSULTA_SECRETO`, nunca en el navegador) puede consultar; sin secreto válido la función responde `no_autorizado`, no consulta nada, no guarda nada y no usa ninguna IP ni encabezado del cliente. · **por qué:** la clave anónima es pública, así que cualquiera puede llamar a la función directamente; `x-forwarded-for` lo puede inventar el cliente y un contador por IP compartido por todas las llamadas desde el servidor bloquearía a candidatos reales. Sin secreto no hay respuesta que sirva para probar códigos (ningún "oráculo"), y quien no tiene el secreto tampoco puede escribir filas en la tabla de intentos. · **IP del usuario final:** la lee el servidor de Next del encabezado que pone la plataforma (`x-vercel-forwarded-for`, luego `x-real-ip`, luego `x-forwarded-for`) y se la pasa a la función junto con el secreto; hay que confirmar en el deploy que Vercel lo sobrescribe [supuesto] · verificado contra la API real: el borde de Supabase (Cloudflare) rechaza con 403 cualquier petición que traiga un `cf-connecting-ip` puesto por el cliente, y los demás encabezados de IP falsificados llegan a la función, que los ignora · **intentos:** se cuentan códigos distintos (repetir el mismo cuenta una vez) según `configuracion.limite_consulta_codigo` (10 en 600 s) y se borran al vencer la ventana. · descartado: preguntarle a n8n (ata cada carga de página a n8n y a su latencia); usar la service role en Next (la regla 7 la reserva a n8n); confiar en un encabezado de IP del cliente sin secreto; un contador global estricto para llamadas sin secreto (como ya no responden datos, no hay nada que contar).

**42. Hero de "/" con poliedro propio** — icosaedro de caras planas con three.js (import dinámico, solo ≥1024 px, sin movimiento reducido y con WebGL, después del primer render; ~123 KB comprimido, bajo el tope de 150 KB) y un hexágono que sigue a una cara lima y rota eventos del programa cada ~3,2 s (montos desde `lib/config.ts`). En móvil, con movimiento reducido o sin WebGL: SVG estático con hexágono fijo "+USD 50". Se sacó el bloque "Tu link personal" del hero. · **por qué:** pieza propia y liviana que muestra el premio en acción sin copiar nada de worldteams.com. · descartado: CSS 3D (no hizo falta: el peso quedó bajo el tope).

**43. Rendimiento: la medición que vale es la del deploy** — el criterio de Lighthouse móvil ≥ 90 se baja a "sin regresiones graves". Las mediciones locales (`next start`, estimación con CPU 4x más lenta) son ruidosas: de 80 a 87 en la misma página, y la versión previa al cambio dio 86. Se mide de nuevo sobre el deploy en Vercel. · descartado: seguir optimizando contra el número local (diferir GSAP/Lenis no mejoró de forma clara y se revirtió).

## Login y portal (decisiones agregadas el 22/10, tarea 4; pedidas por Mateo)

**44. Acceso solo por lista, sin registro público** — entran únicamente los emails de `referentes` (colocado y sin sanción) y de `equipo_reclutamiento` (activo). La lista la carga WorldTeams; el panel de carga queda para segunda etapa. La app no tiene la service role y el rol anónimo no lee esas tablas, así que pregunta por la función `email_habilitado(p_email, p_secreto)` (`SECURITY DEFINER`, `supabase/email_habilitado.sql`), que usa el mismo secreto de aplicación que `consultar_referente_por_codigo` y devuelve solo el rol: `referente`, `reclutamiento` o `ninguno`. Sin secreto válido responde `no_autorizado` a todos los emails, existan o no. Si un email está en las dos listas gana `reclutamiento`. · por qué: la lista de quién está colocado es un dato sensible y la puerta tiene que ser una sola, con la garantía en la base (regla 5).

**45. Login y portal siempre contra Supabase real** — no dependen de n8n ni de `NEXT_PUBLIC_DEMO`. Si faltan las variables de Supabase, `/ingresar`, `/portal` y `/panel` muestran "no disponible" y la landing sigue funcionando. Si la base falla o el secreto no coincide también es "no disponible", nunca "habilitado". · por qué: la autenticación no se puede simular sin dar una falsa sensación de seguridad.

**46. Mensaje idéntico y límites por IP y por email** — `/ingresar` responde siempre "Si tu email está habilitado, te enviamos un link", haya o no envío, y también cuando Supabase rechaza el envío (distinguirlo delataría que el email estaba habilitado; el error queda en el log del servidor). Se limita por IP (5) y por email (3) cada 10 minutos (`config.limiteIngreso`), contando todos los intentos, no solo los de emails habilitados, y antes de consultar la base. La respuesta tiene un tiempo mínimo para que no se note a ojo si hubo envío. Es el mismo patrón que la consulta de códigos: en memoria de cada instancia; la segunda barrera es el tope de envíos por hora de Supabase Auth. · límite conocido: con varias instancias el tope efectivo se multiplica y el tiempo mínimo no es una garantía contra una medición fina; en producción se movería a la base o al borde.

**47. Sesión y rutas protegidas en el servidor** — cookies con `@supabase/ssr`; `/auth/callback` canjea el código (PKCE) y redirige por rol (referente a `/portal`, reclutamiento a `/panel`, sin habilitación a `/portal`, que muestra "Tu email no está habilitado" sin datos). El rol sale de la base con la propia sesión (`es_reclutamiento()` y la fila propia de `referentes`, que además debe seguir colocada y sin sanción), no de lo que diga el navegador. Tres capas: `proxy.ts` (optimista: refresca la sesión y manda a `/ingresar` a quien no tiene), `exigirRol()` en cada página antes de leer datos (sin sesión a `/ingresar`, otro rol a su página), y la RLS de la base. · limitación: el link se debe abrir en el mismo navegador que lo pidió (PKCE guarda el verificador en una cookie).

**48. Portal de solo lectura y acceso desde la home** — `/portal` lee con la sesión del referente: `v_mis_referidos` (rechazado y descartado como "no avanzó"), `v_progreso_referente` (barra de hitos) y `movimientos_pago` (solo pendientes y pagados; los cancelados por sanción no se muestran ni suman). El link personal se muestra como `worldteams-referidos.vercel.app/r/<codigo>` (`NEXT_PUBLIC_SITE_URL` lo puede cambiar) y el botón copia la URL con https. El hero de "/" no tenía un CTA "Entrar a mi portal": el acceso quedó en el encabezado de la home, para no sumar un tercer botón al hero.

---

## Especificación del modelo de datos

**Tablas**
- `referentes`: id, nombre, apellido, email (único, normalizado), linkedin_url, codigo_referido (único; nombre normalizado + sufijo aleatorio base36 de 8 caracteres generado con CSPRNG; `CHECK` de formato `^[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]{8}$`; se genera una sola vez y no se reutiliza), colocado (bool), sancionado_en (fecha o nulo, decisión 39), auth_user_id, creado_en.
- `candidatos`: id, nombre, apellido, email (único, normalizado), linkedin_url (único, normalizado), especialidad, usa_revit, seniority, nivel_ingles, cv_url, acepto_visibilidad, origen, creado_en. `es_prioritario` = columna generada (arquitectura AND usa_revit AND senior AND inglés avanzado o nativo).
- `referidos`: id, referente_id, candidato_id, estado, motivos_revision (array), validado_en, creado_en. Índice único parcial en candidato_id donde estado <> 'descartado'.
- `historial_estados`: id, referido_id, estado_anterior, estado_nuevo, actor_tipo (sistema/reclutamiento), actor_id, motivo, creado_en. Solo inserción.
- `movimientos_pago`: id, referente_id, referido_id (null en hitos), concepto (base/extra_prioritario/bono_hito), hito_umbral, periodo_hito, monto_usd, estado (pendiente/pagado/cancelado_sancion), ciclo_pago, metodo_pago (liquidacion_sueldo/transferencia), preferencia_cobro (default 'efectivo'), pagado_en, creado_en. Únicos: (referido_id, concepto) y (referente_id, hito_umbral, periodo_hito) → idempotencia.
- `configuracion`: clave (pk), valor (jsonb), descripcion, actualizado_en, actualizado_por.
- `equipo_reclutamiento`: email (único), nombre, activo.

**Vistas**: `v_progreso_referente` (validados del año, próximo hito, cuántos faltan) · `v_mis_referidos` (nombre y estado de los referidos del referente, decisión 38) · `v_cierre_ciclo` (movimientos pendientes por ciclo, referente y método de pago).

**Estados del referido**: inicio → `descartado` (ya en pool, duplicado, autorreferido) | `registrado` → `validado` (automático) | `en_revision` → `validado` | `rechazado`. Finales: validado, rechazado, descartado. Una sanción no cambia el estado: pasa los movimientos pendientes a `cancelado_sancion`.

**Configuración inicial**: monto_base_usd 50 · multiplicador_prioritario 2 · hitos [{referidos 3, bono_usd 75}, {6, 150}, {10, 300}] (decisión 35) · periodo_hitos año calendario · zona_horaria America/Argentina/Buenos_Aires (decisión 37) · dia_corte_pago 25 · alerta_volumen {cantidad 5, dias 7} · plazo_respuesta_candidato_dias_habiles 5 · plazo_revision_dias_habiles 3 · limite_consulta_codigo {fallos 10, segundos 600}.

**RLS**: referente → lee solo lo suyo (nombre y estado de sus referidos vía vista); reclutamiento → lee candidatos/referidos/historial; n8n (service role) → único que escribe referidos y movimientos.

---

## Supuestos (a anotar en la nota)
- Stack Supabase + n8n + Resend + Next.js (no preguntamos su stack).
- `candidatos` representa el talent pool; en producción se sincronizaría con su sistema de seguimiento de candidatos.
- La web dice "más de 750 profesionales": puede incluir no colocados. Confirmar en la charla.
- Montos propios, sin presupuesto de referencia. Porcentajes de participación de los escenarios: supuestos.
- Alcance: el mail dice "diseñá el sistema"; se construye el camino principal funcionando y lo demás se documenta.

## Hallazgos
- WorldTeams ya tiene un programa de referidos **para clientes** (empresas) en su web. Este cubre el lado del talento y podría convivir. Pregunta para la charla: ¿comparten base o plataforma de pago?
- Ellos usan reCAPTCHA → se suma al formulario.

## Segunda etapa
- Pago adicional por colocación en una firma (nuevo concepto en movimientos).
- Canje opcional por experiencias para el bienestar del equipo remoto (propuesta de Mateo: incentivar a salir y socializar). Previsto en `preferencia_cobro`.
- Abrir el programa a candidatos del pool o gente de afuera, con otro método de pago, si la base de referentes no alcanza.
- Señales antifraude (IP, teléfono, dispositivo).
- Configuración versionada y panel de edición amigable.
- Panel de métricas y panel de pagos.
- Inglés y portugués en la landing.
- Premio recurrente mientras el referido siga colocado (variante de la idea de % de Mateo).

**49. SMTP de Supabase Auth con Resend y plantillas en español** — el SMTP de Supabase Auth queda con Resend (no el mail por defecto de Supabase, que solo entrega a miembros del equipo y tiene un tope bajo por hora). Las plantillas *Confirm sign up* y *Magic Link* están en español. · por qué: el login tiene que llegar a cualquier casilla habilitada, no solo a la del equipo, y el mail tiene que estar en el idioma del producto (regla 9). · alternativa descartada: dejar el mail por defecto de Supabase.

**50. reCAPTCHA v3 verificado en el servidor, antes de consultar el código** — el script de Google se carga solo en `/r/[codigo]`, solo con `NEXT_PUBLIC_DEMO=false` y recién cuando la persona toca el formulario (la home y el modo demo no lo cargan); el token se pide al enviar con la acción `referir`. `/api/referir` lo verifica antes de mirar el código: puntaje contra `RECAPTCHA_MIN_SCORE` (si falta o está mal escrito, 0.5), acción `referir` y dominio de la respuesta de Google igual al del sitio (`NEXT_PUBLIC_SITE_URL`; `localhost` solo fuera de producción). Sin token o rechazado: 403. Token vencido o repetido, o Google sin responder (5 s): 403/503 con `reintentable` y un botón "Reintentar" que conserva los datos. Esas fallas no cuentan como intentos de adivinar códigos, porque el captcha corre antes del límite por IP, y quien no lo pasa nunca llega a probar un código. Se deja visible el cartelito de Google, que ya incluye su texto legal. · por qué: separar "parece un bot" de "falló una dependencia" evita castigar a una persona real por un problema nuestro o de Google. · alternativa descartada: verificar después de validar el código (un bot podía gastar intentos del límite sin captcha).
