# DECISIONS.md — Registro de decisiones

Formato para decisiones nuevas: **N. Título** — decisión · por qué · alternativas descartadas · [supuesto] si no está confirmado por WorldTeams.

## Respuestas de WorldTeams (Eugenia Franco, Operaciones)
- La meta de 500 → 1000 se mide en **ingresos al talent pool** (personas que se registran y entran a la base), no en colocaciones.
- Perfil más necesitado: **arquitectos con Revit, senior, buen inglés**. Trabajan con arquitectura e ingeniería. No priorizan por país.
- No hay presupuesto por referido ni costo por candidato definido.

---

## Esquema del programa

**1. Quién refiere** — Solo profesionales **colocados** por WorldTeams que trabajan con una firma cliente. Tienen sueldo donde cobrar, su criterio ya fue validado, no hay conflicto de intereses (como alguien en proceso de selección) y tienen menos urgencia económica y más reputación en juego, lo que reduce referidos flojos (hipótesis de diseño). Descartado: cualquier persona, o candidatos sin colocar → segunda etapa.

**2. Cómo se refiere** — Link personal y único por referente (`/r/{codigo}`), con código = nombre normalizado + sufijo aleatorio no adivinable de 6 caracteres base36 generado con crypto (ej. `/r/lucia-k7q2m9`, unos 2.200 millones de combinaciones). El candidato carga sus propios datos. · por qué: un código que fuera solo el nombre se podía adivinar, permitía atribuciones falsas (usar el link de otro) y exponía quién trabaja con WorldTeams; el nombre queda solo para que el link sea legible · límite: la consulta de un código aplica un tope de intentos fallidos por IP (10 en 10 minutos, configurable); con la IP bloqueada ni un código válido responde, y el formato se descarta antes de consultar la base · [supuesto] el límite en memoria frena el barrido casual; en producción con varias instancias se pasa a un contador compartido (base de datos o borde) · Descartado: que el referente cargue datos de terceros (sin consentimiento, depende del esfuerzo del referente); código solo con el nombre (adivinable); código totalmente opaco (el nombre ayuda a que el candidato reconozca el link y desconfíe menos).

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

---

## Especificación del modelo de datos

**Tablas**
- `referentes`: id, nombre, apellido, email (único, normalizado), linkedin_url, codigo_referido (único; nombre normalizado + sufijo aleatorio base36 de 6 caracteres generado con CSPRNG; `CHECK` de formato `^[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]{6}$`; se genera una sola vez y no se reutiliza), colocado (bool), auth_user_id, creado_en.
- `candidatos`: id, nombre, apellido, email (único, normalizado), linkedin_url (único, normalizado), especialidad, usa_revit, seniority, nivel_ingles, cv_url, acepto_visibilidad, origen, creado_en. `es_prioritario` = columna generada (arquitectura AND usa_revit AND senior AND inglés avanzado o nativo).
- `referidos`: id, referente_id, candidato_id, estado, motivos_revision (array), validado_en, creado_en. Índice único parcial en candidato_id donde estado <> 'descartado'.
- `historial_estados`: id, referido_id, estado_anterior, estado_nuevo, actor_tipo (sistema/reclutamiento), actor_id, motivo, creado_en. Solo inserción.
- `movimientos_pago`: id, referente_id, referido_id (null en hitos), concepto (base/extra_prioritario/bono_hito), hito_umbral, periodo_hito, monto_usd, estado (pendiente/pagado/cancelado_sancion), ciclo_pago, metodo_pago (liquidacion_sueldo/transferencia), preferencia_cobro (default 'efectivo'), pagado_en, creado_en. Únicos: (referido_id, concepto) y (referente_id, hito_umbral, periodo_hito) → idempotencia.
- `configuracion`: clave (pk), valor (jsonb), descripcion, actualizado_en, actualizado_por.
- `equipo_reclutamiento`: email (único), nombre, activo.

**Vistas**: `v_progreso_referente` (validados del año, próximo hito, cuántos faltan) · `v_cierre_ciclo` (movimientos pendientes por ciclo, referente y método de pago).

**Estados del referido**: inicio → `descartado` (ya en pool, duplicado, autorreferido) | `registrado` → `validado` (automático) | `en_revision` → `validado` | `rechazado`. Finales: validado, rechazado, descartado. Una sanción no cambia el estado: pasa los movimientos pendientes a `cancelado_sancion`.

**Configuración inicial**: monto_base_usd 50 · multiplicador_prioritario 2 · hitos [{3:75},{6:150},{10:300}] · periodo_hitos año calendario · dia_corte_pago 25 · alerta_volumen {cantidad 5, dias 7} · plazo_respuesta_candidato_dias_habiles 5 · plazo_revision_dias_habiles 3 · limite_consulta_codigo {fallos 10, segundos 600}.

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
