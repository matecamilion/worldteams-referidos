-- =====================================================================
-- seed.sql — Datos iniciales del programa de referidos (WorldTeams)
-- Se aplica después de schema.sql. Es re-ejecutable: no pisa lo que ya se editó.
--
-- Los emails usan el alias +nombre de la casilla de pruebas de Mateo (matecamilion05+lucia@gmail.com, etc.): todos
-- llegan a la misma bandeja, así se prueba el ingreso por magic link con cada rol.
-- =====================================================================

-- Configuración inicial (DECISIONS.md, decisiones 10-12, 17, 23, 26 y 2).
-- Los hitos son acumulativos: al llegar a cada umbral en el año calendario se suma su bono.
insert into public.configuracion (clave, valor, descripcion) values
  ('monto_base_usd',          '50',  'Premio base por referido validado, en USD (pago único).'),
  ('multiplicador_prioritario', '2', 'Multiplicador del premio para perfiles prioritarios: se paga base x multiplicador (el extra es la diferencia).'),
  ('hitos',                   '[{"referidos": 3, "bono_usd": 75}, {"referidos": 6, "bono_usd": 150}, {"referidos": 10, "bono_usd": 300}]',
                              'Bono por hitos: al llegar a "referidos" validados en el año calendario se suma "bono_usd".'),
  ('periodo_hitos',           '"anio_calendario"', 'Período de conteo de los hitos. Hoy solo se soporta el año calendario.'),
  ('zona_horaria',           '"America/Argentina/Buenos_Aires"', 'Zona horaria con la que se calcula el ciclo de pago y el año de los hitos (nombre IANA).'),
  ('dia_corte_pago',          '25',  'Día del mes de corte: lo validado hasta ese día entra en el ciclo del mes; después, en el siguiente (1 a 28).'),
  ('alerta_volumen',          '{"cantidad": 5, "dias": 7}', 'Más de "cantidad" referidos de un mismo referente en "dias" días pasan a revisión.'),
  ('plazo_respuesta_candidato_dias_habiles', '5', 'Plazo que se le promete al candidato para recibir respuesta, en días hábiles.'),
  ('plazo_revision_dias_habiles', '3', 'Plazo para que reclutamiento resuelva un caso en revisión, en días hábiles.'),
  ('limite_consulta_codigo',  '{"fallos": 10, "segundos": 600}', 'Tope de códigos de link inexistentes por IP en la ventana de "segundos", antes de bloquear la consulta.')
on conflict (clave) do nothing;

-- Reclutamiento: una persona de ejemplo para el panel.
insert into public.equipo_reclutamiento (email, nombre, activo) values
  ('matecamilion05+reclutamiento@gmail.com', 'Reclutamiento Demo', true)
on conflict (email) do nothing;

-- Referentes de ejemplo. Los códigos son los mismos que usa la app en modo demo (app/lib/demo-data.ts),
-- así la landing en NEXT_PUBLIC_DEMO=false abre los mismos links. El cuarto referente ya no está colocado:
-- sirve para probar que no puede referir y que, si ganó algo, cobra por transferencia (decisión 14).
insert into public.referentes (nombre, apellido, email, linkedin_url, codigo_referido, colocado) values
  ('Lucía',  'Gómez',    'matecamilion05+lucia@gmail.com',    'https://www.linkedin.com/in/lucia-gomez-demo',    'lucia-k7q2m9xd',  true),
  ('Martín', 'Ferreyra', 'matecamilion05+martin@gmail.com', 'https://www.linkedin.com/in/martin-ferreyra-demo', 'martin-x4d8w1bn', true),
  ('Camila', 'Duarte',   'matecamilion05+camila@gmail.com',   'https://www.linkedin.com/in/camila-duarte-demo',   'camila-p3n6z5ht', true),
  ('Andrés', 'Paredes',  'matecamilion05+andres@gmail.com',  'https://www.linkedin.com/in/andres-paredes-demo',  'andres-m2w5q8vc', false)
on conflict (email) do nothing;
