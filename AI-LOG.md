# AI-LOG.md — Cómo usé la IA y qué corregí

**Método:** usé Claude como interlocutor de diseño (una pregunta por vez, con opciones y recomendación), validé decisiones con fuentes externas (respuestas de WorldTeams, su web, una consulta informal a 6 personas) y luego Claude Code para construir, con este repo como contexto.

| Tema | Qué propuso la IA | Qué corregí o decidí yo |
|---|---|---|
| Quién refiere | Usó "activos o colocados" sin definir "activo" | Pedí definirlo y llegué a solo colocados (sueldo, criterio validado, fidelidad, sin conflicto de intereses) |
| Premio | Efectivo directo | Propuse créditos con premios progresivos; tras consultar a 6 personas quedó efectivo, pero mi idea de la meta progresiva sobrevivió como bono por hitos |
| Validación | Revisión humana de cada referido | Detecté que contradecía la automatización y no escalaba → validación automática con revisión solo de dudosos |
| Meta | Achicar la meta por el costo | Planteé que el premio es una inversión que vuelve; aporté el dato de 750 profesionales, que mostró que el límite real es la cantidad de referentes |
| Monto | Montos fijos | Evalué un % del sueldo; lo descarté por cuidar la billetera de la empresa y la equidad entre referentes |
| Alcance | Dejar paneles fuera | Subí el alcance: panel de revisión y portal del referente ("sin visibilidad no hay incentivo") |
| Mails | 8 tipos de mail | Pedí menos mails y entender la herramienta → 5 momentos con Resend, resumen diario a reclutamiento |
| Referente desvinculado | Lo planteó como caso a debatir | Lo ganado le pertenece: cobra igual |
| Privacidad | Mostrar solo nombre de pila | Nombre completo: el referente ya conoce a la persona (con límites y aviso al candidato) |
| Bienestar | — | Propuse el canje por experiencias para un equipo remoto como mejora de segunda etapa |
| Identidad visual (landing) | Propuse un toque dorado, copiado de la captura de referencia, y el rosa arena como apoyo | Sin dorado: el rosa arena `#D4B5AA` solo como detalle muy puntual y el lima como único acento fuerte. El CSS real de worldteams.com tampoco usa dorado |
| Carpeta del proyecto | Creé los archivos en `C:\dev\WroldTeams` (con el nombre mal escrito del CLAUDE.md) | Corrigió el nombre a `C:\dev\WorldTeams`. La carpeta vieja estaba abierta en la sesión y no se podía renombrar: copié los documentos a la nueva y la vieja se borra a mano |
| Calculadora de premios | Dos controles sueltos: personas a recomendar y cuántas son prioritarias | Pidió que el control de prioritarias nunca supere el total, que el texto diga "por año" (los hitos son por año calendario) y que se aclare que es una estimación (pendiente de construir con la página "/") |
| Git | Había dejado `git init` para la tarea del miércoles | Pidió hacerlo ya, con `.gitignore` que incluya `.env` y commits chicos por cada paso |

<!-- Claude Code: agregá una fila cada vez que Mateo corrija o rechace algo que propongas. -->
