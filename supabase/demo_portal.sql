-- Datos de demo SOLO para ver el portal antes de tener n8n. Se borran antes de grabar el video (demo_portal_borrar.sql).
-- Pegar en el SQL Editor del proyecto WorldTeams. Es re-ejecutable: lo que ya existe no se duplica ni se vuelve a mover.
--
-- Usa el flujo real de la base: candidato -> referido 'registrado' -> cambiar_estado_referido(), y los movimientos de pago
-- los crea el trigger con los montos de `configuracion`. No escribe en historial_estados ni en movimientos_pago a mano
-- (salvo marcar un premio como pagado, que es una transición permitida).
--
-- Resultado en el portal de Lucía (matecamilion05+lucia@gmail.com):
--   Valentina Ríos   validado (normal)                -> base          (pagado, para ver los dos totales)
--   Tomás Beltrán    validado (perfil prioritario)    -> base + extra  (pendientes)
--   Paula Ibarra     en revisión
--   Diego Mamani     rechazado                        -> se ve como "No avanzó"
--   2 validados de 3: la barra de hitos queda al 67 % ("te falta 1").

do $$
declare
  -- Referente al que se le cargan los datos. Cambiar el email si se quiere otro.
  v_email_referente constant text := 'matecamilion05+lucia@gmail.com';
  v_referente uuid;
  v_candidato uuid;
  v_referido  uuid;
  c record;
begin
  select id into v_referente from public.referentes where email = v_email_referente and colocado and sancionado_en is null;
  if v_referente is null then
    raise exception 'demo_portal: no está el referente % (¿se corrió seed.sql?)', v_email_referente;
  end if;

  for c in
    select * from (values
      ('Valentina', 'Ríos',     'demo.valentina@ejemplo.com', 'demo-portal-valentina-rios', 'ingenieria'::public.tipo_especialidad,   false, 'semi_senior'::public.tipo_seniority, 'intermedio'::public.tipo_nivel_ingles, 'validado'),
      ('Tomás',     'Beltrán',  'demo.tomas@ejemplo.com',     'demo-portal-tomas-beltran',  'arquitectura'::public.tipo_especialidad, true,  'senior'::public.tipo_seniority,      'avanzado'::public.tipo_nivel_ingles,   'validado'),
      ('Paula',     'Ibarra',   'demo.paula@ejemplo.com',     'demo-portal-paula-ibarra',   'ingenieria'::public.tipo_especialidad,   false, 'junior'::public.tipo_seniority,      'intermedio'::public.tipo_nivel_ingles, 'en_revision'),
      ('Diego',     'Mamani',   'demo.diego@ejemplo.com',     'demo-portal-diego-mamani',   'arquitectura'::public.tipo_especialidad, false, 'semi_senior'::public.tipo_seniority, 'basico'::public.tipo_nivel_ingles,     'rechazado')
    ) as t(nombre, apellido, email, linkedin, especialidad, usa_revit, seniority, nivel_ingles, destino)
  loop
    insert into public.candidatos (nombre, apellido, email, linkedin_url, especialidad, usa_revit, seniority, nivel_ingles, acepto_visibilidad, origen)
    values (c.nombre, c.apellido, c.email, 'https://www.linkedin.com/in/' || c.linkedin, c.especialidad, c.usa_revit, c.seniority, c.nivel_ingles, true, 'referido')
    on conflict (email) do nothing;
    select id into v_candidato from public.candidatos where email = c.email;

    -- Si el candidato ya tiene un referido (de una corrida anterior), no se toca.
    if exists (select 1 from public.referidos where candidato_id = v_candidato) then
      continue;
    end if;

    insert into public.referidos (referente_id, candidato_id) values (v_referente, v_candidato) returning id into v_referido;

    if c.destino = 'validado' then
      perform public.cambiar_estado_referido(v_referido, 'validado', 'sistema', null, 'demo del portal');
    elsif c.destino = 'en_revision' then
      perform public.cambiar_estado_referido(v_referido, 'en_revision', 'sistema', null, 'demo del portal', array['alerta_volumen']);
    elsif c.destino = 'rechazado' then
      perform public.cambiar_estado_referido(v_referido, 'en_revision', 'sistema', null, 'demo del portal', array['alerta_volumen']);
      perform public.cambiar_estado_referido(v_referido, 'rechazado', 'reclutamiento', null, 'demo del portal');
    end if;
  end loop;

  -- Un premio pagado (pendiente -> pagado es la transición permitida), para ver los dos totales.
  update public.movimientos_pago m
     set estado = 'pagado'
    from public.referidos r
    join public.candidatos ca on ca.id = r.candidato_id
   where m.referido_id = r.id and m.concepto = 'base' and m.estado = 'pendiente'
     and r.referente_id = v_referente and ca.email = 'demo.valentina@ejemplo.com';
end $$;

-- Lo que quedó cargado (el SQL Editor corre como administrador y ve todo):
select ca.nombre || ' ' || ca.apellido as candidato, r.estado, ca.es_prioritario as prioritario,
       coalesce(string_agg(m.concepto::text || ' ' || m.monto_usd || ' (' || m.estado || ')', ', ' order by m.concepto::text), '—') as premios
  from public.referidos r
  join public.candidatos ca on ca.id = r.candidato_id
  left join public.movimientos_pago m on m.referido_id = r.id
 where ca.email like 'demo.%@ejemplo.com'
 group by ca.nombre, ca.apellido, r.estado, ca.es_prioritario, r.creado_en
 order by r.creado_en;
