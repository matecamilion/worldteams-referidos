# Login y portal: configurar y probar (tarea 4)

## 0. Antes de nada: aplicar la función (una sola vez)

1. Supabase → proyecto **WorldTeams** (sa-east-1) → **SQL Editor** → pegar `supabase/email_habilitado.sql` → Run. Es re-ejecutable y no toca el esquema.
2. Para correr las pruebas: pegar `supabase/tests.sql` (termina en `rollback`, no deja datos). Tienen que quedar todas en OK; la sección 8 es la nueva (login y aislamiento del portal).
3. En `app/.env.local` tiene que estar `SUPABASE_CONSULTA_SECRETO` (el mismo valor que está en `secretos_internos`). No hace falta ninguna variable nueva.

## 1. Configuración en Supabase (Authentication)

Dashboard → **Authentication**.

**URL Configuration** (Authentication → URL Configuration)
1. **Site URL**: `https://worldteams-referidos.vercel.app`
2. **Redirect URLs** → *Add URL*, una por una:
   - `https://worldteams-referidos.vercel.app/auth/callback`
   - `http://localhost:3000/auth/callback`
3. Save changes. (Si Vercel te da otro dominio para el deploy, agregá también ese `/auth/callback`.)

**Sign In / Providers**
1. Authentication → **Sign In / Providers** → **Email**: *Enable Email provider* activado.
2. **Confirm email** puede quedar activado: el magic link sirve como confirmación.
3. No hace falta tocar "Allow new users to sign up": la app decide quién entra con `email_habilitado`, antes de pedir el link.

**Plantilla del mail del magic link** (Authentication → **Email Templates** → **Magic Link**)

- **Subject**: `Tu link para entrar a tu portal de WorldTeams`
- **Message body** (pegar tal cual, en modo código fuente):

```html
<h2>Entrá a tu portal</h2>
<p>Hola, pedimos entrar al portal de referidos de WorldTeams con este email.</p>
<p><a href="{{ .ConfirmationURL }}">Entrar a mi portal</a></p>
<p>El link sirve una sola vez y vence en una hora. Abrilo en el mismo navegador desde el que lo pediste.</p>
<p>Si no fuiste vos, ignorá este mail: nadie puede entrar sin el link.</p>
```

Save. (Usa `{{ .ConfirmationURL }}`, que vuelve a `/auth/callback?code=...`, la ruta que implementamos.)

## 2. Mail por defecto de Supabase: límites de hoy

- **Tope de envíos**: el servicio de prueba de Supabase tiene un tope por hora para todo el proyecto (la documentación lo da como valor de configuración; el histórico es **2 mails por hora**). Verificá el número vigente en Authentication → **Rate Limits**. Con ese tope, el límite de la app (3 por email cada 10 min) no es lo que frena primero.
- **Solo entrega a direcciones del equipo**: sin SMTP propio, Supabase se niega a enviar a direcciones que no sean miembros del equipo de la organización (Organization → Team). **Los alias `matecamilion05+lucia@gmail.com` etc. probablemente no lleguen** aunque la app diga "te enviamos un link" (la app responde igual a propósito; el error queda en la consola del servidor).
  - Para probar hoy: (a) invitar al equipo la dirección con la que se registró la cuenta de Supabase y cargar un referente de prueba con **ese** email; o (b) esperar a mañana y configurar Resend como SMTP (Authentication → SMTP Settings), que no tiene ninguna de estas dos restricciones.
  - Alta de un referente de prueba (SQL Editor): `insert into public.referentes (nombre, apellido, email) values ('Prueba', 'Mateo', 'TU-EMAIL-DEL-EQUIPO');` (el código se genera solo).
- Entre pedidos del mismo email Supabase exige 60 segundos.
- Si no llega el mail: mirar la consola de `npm run dev` (línea `[ingreso] No se pudo enviar el magic link: ...`) y Authentication → Logs.

## 3. Checklist de prueba a mano

Con `npm run dev` (http://localhost:3000) y el alias del seed que llegue a una casilla (ver sección 2).

**Sin sesión**
- [ ] `/portal` y `/panel` te mandan a `/ingresar`.
- [ ] En `/ingresar`, un email mal escrito muestra "Revisá el email…".
- [ ] Un email que no está en ninguna lista (`cualquiera@ejemplo.com`) muestra "Si tu email está habilitado, te enviamos un link", **y no llega ningún mail**.

**Referente (`+lucia`)**
- [ ] Pedir el link con `matecamilion05+lucia@gmail.com`: mismo mensaje que el punto anterior, y **sí** llega el mail (con la plantilla en español).
- [ ] Abrir el link **en el mismo navegador**: cae en `/portal` con "Hola, Lucía".
- [ ] El link personal es `worldteams-referidos.vercel.app/r/lucia-k7q2m9xd` y "Copiar" lo copia con `https://`.
- [ ] Se ven solo los referidos, premios y avance de Lucía (compararlos con la base: `select * from v_mis_referidos` corre con el rol del usuario, no sirve en el editor; contrastá con `referidos` por `referente_id`).
- [ ] Ir a `/panel`: te redirige a `/portal`.
- [ ] "Salir" te lleva a `/ingresar`; después `/portal` vuelve a pedir ingreso.
- [ ] Abrir el mismo link del mail por segunda vez: vuelve a `/ingresar` con "Ese link no sirve…".

**Aislamiento (`+martin`)**
- [ ] Salir, entrar como `matecamilion05+martin@gmail.com`: "Hola, Martín" y **ninguno** de los referidos ni premios de Lucía.
- [ ] En el navegador, consola → `fetch` a la API con su sesión no devuelve filas ajenas: la RLS se prueba en `tests.sql` (sección 8.2: "el referente ve solo sus referidos / movimientos / fila de referentes").

**Reclutamiento (`+reclutamiento`)**
- [ ] Entra y cae en `/panel` ("Próximamente: revisión de casos").
- [ ] `/portal` lo redirige a `/panel`.

**Sin habilitación**
- [ ] Con `matecamilion05+andres@gmail.com` (no colocado): la app responde igual que a cualquiera, y no llega mail. (Para ver "Tu email no está habilitado" hace falta una sesión de alguien que ya entró y después fue dado de baja: marcar `colocado = false` a un referente con sesión abierta y recargar `/portal`.)

**Límites**
- [ ] Pedir 4 veces seguidas el link del mismo email: del cuarto en adelante, "Hiciste demasiados intentos…" (la app los cuenta aunque el email no esté habilitado).

## 4. Pruebas automáticas

- `npm test`: unitarias (roles y redirecciones, estados, barra de hitos, premios, límites, `solicitarIngreso`, `email_habilitado`).
- `npm run test:portal`: navegador sobre `next dev` (rutas protegidas, CTA de la home, formulario, estados del portal con datos ficticios en `/dev/portal`, que responde 404 en producción). Capturas: `CAPTURAS=../docs/capturas-tarea4 npm run test:portal`.
