-- =====================================================================
-- tests.sql — Pruebas del esquema (se corren después de schema.sql, seed.sql, registrar_referido.sql y panel_resolver.sql)
--
-- Todo ocurre dentro de una transacción que termina en ROLLBACK: no deja datos.
-- Cada prueba registra OK / FALLA; el resultado final es una tabla con el resumen arriba.
-- Cubre: unicidad (email, LinkedIn, código, referido vigente), idempotencia de pagos, normalización,
-- formato de codigo_referido, montos desde configuracion, estados con historial, sanción y RLS por rol.
-- =====================================================================
begin;

create temp table resultados (n serial primary key, prueba text not null, ok boolean not null, detalle text);
grant all on resultados to public;

create function pg_temp.registrar(p_prueba text, p_ok boolean, p_detalle text default null) returns void
language sql as $$ insert into pg_temp.resultados (prueba, ok, detalle) values (p_prueba, coalesce(p_ok, false), p_detalle) $$;

-- Ejecuta una sentencia que DEBE fallar con un mensaje que contenga p_fragmento.
create function pg_temp.espera_error(p_prueba text, p_sql text, p_fragmento text) returns void
language plpgsql as $$
declare v_msg text;
begin
  begin
    execute p_sql;
    v_msg := null;
  exception when others then
    v_msg := sqlerrm;
  end;
  perform pg_temp.registrar(p_prueba, v_msg is not null and v_msg ilike '%' || p_fragmento || '%',
                            coalesce('error: ' || v_msg, 'NO falló y debía fallar'));
end $$;

create function pg_temp.nuevo_referente(p_nombre text, p_email text, p_colocado boolean default true) returns uuid
language sql as $$
  insert into public.referentes (nombre, apellido, email, linkedin_url, colocado)
  values (p_nombre, 'Prueba', p_email, 'linkedin.com/in/ref-' || split_part(p_email, '@', 1), p_colocado)
  returning id $$;

create function pg_temp.nuevo_candidato(p_email text, p_prioritario boolean default false) returns uuid
language sql as $$
  insert into public.candidatos (nombre, apellido, email, linkedin_url, especialidad, usa_revit, seniority, nivel_ingles, acepto_visibilidad)
  values ('Cand', 'Prueba', p_email, 'linkedin.com/in/cand-' || split_part(p_email, '@', 1),
          (case when p_prioritario then 'arquitectura' else 'ingenieria' end)::public.tipo_especialidad,
          p_prioritario,
          (case when p_prioritario then 'senior' else 'junior' end)::public.tipo_seniority,
          'avanzado', true)
  returning id $$;

create function pg_temp.nuevo_referido(p_referente uuid, p_candidato uuid) returns uuid
language sql as $$ insert into public.referidos (referente_id, candidato_id) values (p_referente, p_candidato) returning id $$;

-- Crea un referido nuevo (con candidato propio) y lo valida: devuelve el id del referido.
create function pg_temp.referido_validado(p_referente uuid, p_tag text, p_prioritario boolean default false) returns uuid
language plpgsql as $$
declare v_ref uuid;
begin
  v_ref := pg_temp.nuevo_referido(p_referente, pg_temp.nuevo_candidato(p_tag || '@t.com', p_prioritario));
  perform public.cambiar_estado_referido(v_ref, 'validado');
  return v_ref;
end $$;

-- Precondición: la configuración inicial del seed tiene que estar cargada.
select pg_temp.registrar('seed: las 10 claves de configuracion existen',
  (select count(*) = 10 from public.configuracion where clave in
    ('monto_base_usd', 'multiplicador_prioritario', 'hitos', 'periodo_hitos', 'zona_horaria', 'dia_corte_pago', 'alerta_volumen',
     'plazo_respuesta_candidato_dias_habiles', 'plazo_revision_dias_habiles', 'limite_consulta_codigo')),
  'corré seed.sql antes de tests.sql');
select pg_temp.registrar('seed: zona_horaria = America/Argentina/Buenos_Aires',
  (select valor = '"America/Argentina/Buenos_Aires"'::jsonb from public.configuracion where clave = 'zona_horaria'));
select pg_temp.registrar('seed: limite_consulta_codigo = 10 fallos / 600 segundos',
  (select valor = '{"fallos": 10, "segundos": 600}'::jsonb from public.configuracion where clave = 'limite_consulta_codigo'));

-- ---------------------------------------------------------------------
-- 1. codigo_referido: nombre normalizado + sufijo aleatorio (decisión 2)
-- ---------------------------------------------------------------------
do $$
declare v_id uuid; v_cod text;
begin
  insert into public.referentes (nombre, apellido, email) values ('Lucía-María', 'X', 'cod1@t.com')
  returning id, codigo_referido into v_id, v_cod;
  perform pg_temp.registrar('codigo: se genera solo, con nombre normalizado + sufijo base36 de 8', v_cod ~ '^lucia-maria-[0-9a-z]{8}$', v_cod);

  perform pg_temp.espera_error('codigo: el formato viejo (solo el nombre) se rechaza',
    $q$insert into public.referentes (nombre, apellido, email, codigo_referido) values ('A', 'B', 'cod2@t.com', 'lucia-gomez')$q$, 'check constraint');
  perform pg_temp.espera_error('codigo: el sufijo de 6 caracteres de la versión anterior se rechaza',
    $q$insert into public.referentes (nombre, apellido, email, codigo_referido) values ('A', 'B', 'cod2@t.com', 'lucia-k7q2m9')$q$, 'check constraint');
  perform pg_temp.espera_error('codigo: mayúsculas se rechazan',
    $q$insert into public.referentes (nombre, apellido, email, codigo_referido) values ('A', 'B', 'cod2@t.com', 'Lucia-K7Q2M9XD')$q$, 'check constraint');
  perform pg_temp.espera_error('codigo: duplicado se rechaza',
    format($q$insert into public.referentes (nombre, apellido, email, codigo_referido) values ('A', 'B', 'cod3@t.com', %L)$q$, v_cod), 'unique');
  perform pg_temp.espera_error('codigo: no se puede cambiar una vez generado',
    format($q$update public.referentes set codigo_referido = 'otro-abcd1234' where id = %L$q$, v_id), 'codigo_inmutable');

  perform pg_temp.registrar('codigo: 500 generados, todos válidos y distintos',
    (select count(distinct c) = 500 and bool_and(c ~ '^ref-[0-9a-z]{8}$')
       from (select public.generar_codigo_referido('***') as c from generate_series(1, 500)) g));
  perform pg_temp.registrar('codigo: el sufijo usa los 36 caracteres',
    (select count(distinct ch) = 36 from (select regexp_split_to_table(string_agg(public.generar_sufijo_codigo(), ''), '') as ch
                                            from generate_series(1, 400)) z));
end $$;

-- ---------------------------------------------------------------------
-- 2. Candidatos: normalización, unicidad y perfil prioritario (decisiones 7 y 12)
-- ---------------------------------------------------------------------
do $$
begin
  insert into public.candidatos (nombre, apellido, email, linkedin_url, especialidad, usa_revit, seniority, nivel_ingles, acepto_visibilidad)
  values ('Ana', 'Paz', '  Ana.Paz@Test.COM ', 'linkedin.com/in/Ana-Paz', 'arquitectura', true, 'senior', 'avanzado', true);

  perform pg_temp.registrar('candidato: email y LinkedIn se guardan normalizados',
    (select email = 'ana.paz@test.com' and linkedin_url = 'https://www.linkedin.com/in/ana-paz'
       from public.candidatos where email = 'ana.paz@test.com'));

  perform pg_temp.espera_error('candidato: email duplicado (otra mayúscula y espacios) se rechaza',
    $q$insert into public.candidatos (nombre, apellido, email, linkedin_url, especialidad, usa_revit, seniority, nivel_ingles, acepto_visibilidad)
       values ('X', 'Y', 'ANA.PAZ@test.com  ', 'linkedin.com/in/otra-persona', 'arquitectura', true, 'senior', 'avanzado', true)$q$,
    'candidatos_email_key');
  perform pg_temp.espera_error('candidato: LinkedIn duplicado (www, https, barra y parámetros) se rechaza',
    $q$insert into public.candidatos (nombre, apellido, email, linkedin_url, especialidad, usa_revit, seniority, nivel_ingles, acepto_visibilidad)
       values ('X', 'Y', 'otra@test.com', 'HTTPS://www.linkedin.com/in/ANA-PAZ/?utm=1', 'arquitectura', true, 'senior', 'avanzado', true)$q$,
    'candidatos_linkedin_url_key');
  perform pg_temp.espera_error('candidato: LinkedIn que no es un perfil se rechaza',
    $q$insert into public.candidatos (nombre, apellido, email, linkedin_url, especialidad, usa_revit, seniority, nivel_ingles, acepto_visibilidad)
       values ('X', 'Y', 'tercera@test.com', 'https://example.com/in/ana', 'arquitectura', true, 'senior', 'avanzado', true)$q$,
    'linkedin_invalido');
  perform pg_temp.espera_error('candidato: sin aceptar el aviso de visibilidad no entra por referido',
    $q$insert into public.candidatos (nombre, apellido, email, linkedin_url, especialidad, usa_revit, seniority, nivel_ingles)
       values ('X', 'Y', 'cuarta@test.com', 'linkedin.com/in/cuarta', 'arquitectura', true, 'senior', 'avanzado')$q$,
    'candidato_referido_acepto');

  -- es_prioritario = arquitectura AND Revit AND senior AND inglés avanzado/nativo
  insert into public.candidatos (nombre, apellido, email, linkedin_url, especialidad, usa_revit, seniority, nivel_ingles, acepto_visibilidad) values
    ('P', '1', 'p1@test.com', 'linkedin.com/in/p1', 'arquitectura', true,  'senior',      'avanzado',   true),
    ('P', '2', 'p2@test.com', 'linkedin.com/in/p2', 'arquitectura', true,  'senior',      'nativo',     true),
    ('P', '3', 'p3@test.com', 'linkedin.com/in/p3', 'arquitectura', true,  'semi_senior', 'avanzado',   true),
    ('P', '4', 'p4@test.com', 'linkedin.com/in/p4', 'ingenieria',   true,  'senior',      'avanzado',   true),
    ('P', '5', 'p5@test.com', 'linkedin.com/in/p5', 'arquitectura', false, 'senior',      'avanzado',   true),
    ('P', '6', 'p6@test.com', 'linkedin.com/in/p6', 'arquitectura', true,  'senior',      'intermedio', true);
  perform pg_temp.registrar('candidato: es_prioritario verdadero solo con las 4 condiciones',
    (select string_agg(es_prioritario::text, ',' order by email) = 'true,true,false,false,false,false'
       from public.candidatos where email like 'p_@test.com'),
    (select string_agg(es_prioritario::text, ',' order by email) from public.candidatos where email like 'p_@test.com'));
end $$;

-- ---------------------------------------------------------------------
-- 3. Referidos: un solo referido vigente, autorreferido, colocado y transiciones (decisiones 1, 7, 8, 15)
-- ---------------------------------------------------------------------
do $$
declare ra uuid; rb uuid; rn uuid; c1 uuid; c2 uuid; r1 uuid; r2 uuid; r3 uuid;
begin
  ra := pg_temp.nuevo_referente('Ra', 'ra@t.com');
  rb := pg_temp.nuevo_referente('Rb', 'rb@t.com');
  rn := pg_temp.nuevo_referente('Rn', 'rn@t.com', false);
  c1 := pg_temp.nuevo_candidato('c1@t.com');
  r1 := pg_temp.nuevo_referido(ra, c1);

  perform pg_temp.espera_error('referido: un candidato no puede tener dos referidos vigentes (premio a uno solo)',
    format($q$insert into public.referidos (referente_id, candidato_id) values (%L, %L)$q$, rb, c1), 'referidos_candidato_vigente_uk');
  insert into public.referidos (referente_id, candidato_id, estado, motivos_revision)
    values (rb, c1, 'descartado', array['duplicado']);
  perform pg_temp.registrar('referido: un descartado convive con el vigente del mismo candidato',
    (select count(*) = 2 from public.referidos where candidato_id = c1));

  -- Autorreferido (decisión 8): por email y por LinkedIn del referente.
  insert into public.candidatos (nombre, apellido, email, linkedin_url, especialidad, usa_revit, seniority, nivel_ingles, acepto_visibilidad)
    values ('Ra', 'Prueba', 'ra@t.com', 'linkedin.com/in/otro-ra', 'ingenieria', false, 'junior', 'basico', true) returning id into c2;
  perform pg_temp.espera_error('referido: autorreferido por email se bloquea',
    format($q$insert into public.referidos (referente_id, candidato_id) values (%L, %L)$q$, ra, c2), 'autorreferido');
  insert into public.candidatos (nombre, apellido, email, linkedin_url, especialidad, usa_revit, seniority, nivel_ingles, acepto_visibilidad)
    values ('Rb', 'Prueba', 'otro-rb@t.com', 'https://www.linkedin.com/in/ref-rb/', 'ingenieria', false, 'junior', 'basico', true) returning id into c2;
  perform pg_temp.espera_error('referido: autorreferido por LinkedIn se bloquea',
    format($q$insert into public.referidos (referente_id, candidato_id) values (%L, %L)$q$, rb, c2), 'autorreferido');

  perform pg_temp.espera_error('referido: un referente que ya no está colocado no puede referir nuevos',
    format($q$insert into public.referidos (referente_id, candidato_id) values (%L, %L)$q$, rn, pg_temp.nuevo_candidato('cn@t.com')), 'referente_no_colocado');
  perform pg_temp.espera_error('referido: no nace ya validado',
    format($q$insert into public.referidos (referente_id, candidato_id, estado, validado_en) values (%L, %L, 'validado', now())$q$, ra, pg_temp.nuevo_candidato('cv@t.com')),
    'estado_inicial_invalido');

  -- Transiciones: registrado -> en_revision -> rechazado ok; lo demás no.
  r2 := pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('c3@t.com'));
  perform pg_temp.espera_error('referido: registrado -> rechazado no está permitido (solo pasa por revisión)',
    format($q$update public.referidos set estado = 'rechazado' where id = %L$q$, r2), 'transicion_invalida');
  perform public.cambiar_estado_referido(r2, 'en_revision', 'sistema', null, 'perfil incompleto', array['perfil_incompleto']);
  perform public.cambiar_estado_referido(r2, 'rechazado', 'reclutamiento', null, 'no cumple');
  perform pg_temp.espera_error('referido: rechazado solo se reabre a en_revision; rechazado -> validado sigue prohibido (decisión 63)',
    format($q$update public.referidos set estado = 'validado' where id = %L$q$, r2), 'transicion_invalida');

  r3 := pg_temp.referido_validado(ra, 'c4');
  perform pg_temp.espera_error('referido: validado es final (validado -> rechazado)',
    format($q$update public.referidos set estado = 'rechazado' where id = %L$q$, r3), 'transicion_invalida');
  perform pg_temp.espera_error('referido: no se puede reasignar a otro referente',
    format($q$update public.referidos set referente_id = %L where id = %L$q$, rb, r3), 'referido_inmutable');
  perform pg_temp.registrar('referido: validado_en queda fijado al validar',
    (select validado_en is not null and estado = 'validado' from public.referidos where id = r3));
end $$;

-- ---------------------------------------------------------------------
-- 4. Historial de estados (decisión 15)
-- ---------------------------------------------------------------------
do $$
declare ra uuid; r uuid; v_actor uuid := gen_random_uuid();
begin
  ra := pg_temp.nuevo_referente('Rh', 'rh@t.com');
  r := pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('h1@t.com'));
  perform pg_temp.registrar('historial: el alta del referido queda registrada (null -> registrado, sistema)',
    (select count(*) = 1 and bool_and(estado_anterior is null and estado_nuevo = 'registrado' and actor_tipo = 'sistema')
       from public.historial_estados where referido_id = r));

  perform public.cambiar_estado_referido(r, 'en_revision', 'sistema', null, 'alerta de volumen', array['alerta_volumen']);
  perform public.cambiar_estado_referido(r, 'validado', 'reclutamiento', v_actor, 'perfil revisado y aprobado');
  perform pg_temp.registrar('historial: cada cambio guarda actor y motivo',
    (select count(*) = 3
        and bool_or(estado_anterior = 'registrado' and estado_nuevo = 'en_revision' and actor_tipo = 'sistema' and motivo = 'alerta de volumen')
        and bool_or(estado_anterior = 'en_revision' and estado_nuevo = 'validado' and actor_tipo = 'reclutamiento'
                    and actor_id = v_actor and motivo = 'perfil revisado y aprobado')
       from public.historial_estados where referido_id = r));
  perform pg_temp.registrar('historial: los motivos de revisión quedan en el referido',
    (select motivos_revision = array['alerta_volumen'] from public.referidos where id = r));

  -- Un cambio directo, sin pasar por la función, también queda en el historial (la garantía es de la base).
  r := pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('h2@t.com'));
  update public.referidos set estado = 'en_revision' where id = r;
  perform pg_temp.registrar('historial: un UPDATE directo también deja registro',
    (select count(*) = 2 from public.historial_estados where referido_id = r));

  perform pg_temp.espera_error('historial: no se puede modificar',
    format($q$update public.historial_estados set motivo = 'editado' where referido_id = %L$q$, r), 'historial_solo_insercion');
  perform pg_temp.espera_error('historial: no se puede borrar',
    format($q$delete from public.historial_estados where referido_id = %L$q$, r), 'historial_solo_insercion');
  perform pg_temp.espera_error('historial: no se puede vaciar', 'truncate public.historial_estados', 'historial_solo_insercion');
end $$;

-- ---------------------------------------------------------------------
-- 5. Movimientos de pago: montos desde configuracion, idempotencia, hitos, inmutabilidad, sanción (decisiones 11-16)
-- ---------------------------------------------------------------------
do $$
declare ra uuid; r_norm uuid; r_prio uuid; v_base numeric; v_anio integer; v_n integer;
begin
  v_base := public.config_numero('monto_base_usd');
  v_anio := extract(year from now() at time zone public.config_texto('zona_horaria'))::integer;
  ra := pg_temp.nuevo_referente('Rp', 'rp@t.com');

  r_norm := pg_temp.referido_validado(ra, 'm1', false);
  perform pg_temp.registrar('pago: un validado normal genera solo el movimiento base, con el monto de configuracion',
    (select count(*) = 1 and bool_and(concepto = 'base' and monto_usd = v_base and estado = 'pendiente'
                                      and metodo_pago = 'liquidacion_sueldo' and preferencia_cobro = 'efectivo'
                                      and ciclo_pago ~ '^[0-9]{4}-[0-9]{2}$')
       from public.movimientos_pago where referido_id = r_norm));

  r_prio := pg_temp.referido_validado(ra, 'm2', true);
  perform pg_temp.registrar('pago: un validado prioritario suma el extra (base x multiplicador en total)',
    (select count(*) = 2
        and sum(monto_usd) = v_base * public.config_numero('multiplicador_prioritario')
        and bool_or(concepto = 'extra_prioritario')
       from public.movimientos_pago where referido_id = r_prio));

  -- Idempotencia: repetir la creación no duplica; un duplicado manual lo rechaza la restricción.
  v_n := public.crear_movimientos_validacion(r_prio);
  perform pg_temp.registrar('pago: repetir crear_movimientos_validacion no duplica nada',
    v_n = 0 and (select count(*) = 2 from public.movimientos_pago where referido_id = r_prio), 'creados: ' || v_n);
  perform pg_temp.espera_error('pago: un mismo concepto por referido no se paga dos veces (restricción única)',
    format($q$insert into public.movimientos_pago (referente_id, referido_id, concepto, monto_usd, ciclo_pago, metodo_pago)
              values (%L, %L, 'base', 10, '2026-10', 'transferencia')$q$, ra, r_norm), 'movimiento_referido_concepto_uk');
  perform pg_temp.espera_error('pago: solo un referido validado genera movimientos',
    format($q$select public.crear_movimientos_validacion(%L)$q$, pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('m3@t.com'))), 'referido_no_validado');

  perform pg_temp.espera_error('pago: la forma del movimiento se valida (bono con referido)',
    format($q$insert into public.movimientos_pago (referente_id, referido_id, concepto, hito_umbral, periodo_hito, monto_usd, ciclo_pago, metodo_pago)
              values (%L, %L, 'bono_hito', 3, 2026, 75, '2026-10', 'transferencia')$q$, ra, r_norm), 'movimiento_forma');
end $$;

do $$
declare rh uuid; v_anio integer; v_bonos numeric; r_prev uuid;
begin
  v_anio := extract(year from now() at time zone public.config_texto('zona_horaria'))::integer;
  rh := pg_temp.nuevo_referente('Rhit', 'rhit@t.com');

  perform pg_temp.referido_validado(rh, 'hit1'); perform pg_temp.referido_validado(rh, 'hit2');
  perform pg_temp.registrar('hito: con 2 validados todavía no hay bono',
    (select count(*) = 0 from public.movimientos_pago where referente_id = rh and concepto = 'bono_hito'));
  perform pg_temp.referido_validado(rh, 'hit3');
  perform pg_temp.registrar('hito: al llegar a 3 se suma el bono de la configuracion, una sola vez, con su año',
    (select count(*) = 1 and bool_and(hito_umbral = 3 and monto_usd = 75 and periodo_hito = v_anio and referido_id is null)
       from public.movimientos_pago where referente_id = rh and concepto = 'bono_hito'));
  perform pg_temp.referido_validado(rh, 'hit4');
  perform pg_temp.registrar('hito: un 4.º validado no repite el bono del hito 3 (idempotente)',
    (select count(*) = 1 from public.movimientos_pago where referente_id = rh and concepto = 'bono_hito'));
  perform pg_temp.espera_error('hito: el mismo hito no se paga dos veces por año (restricción única)',
    format($q$insert into public.movimientos_pago (referente_id, concepto, hito_umbral, periodo_hito, monto_usd, ciclo_pago, metodo_pago)
              values (%L, 'bono_hito', 3, %s, 75, '2026-10', 'transferencia')$q$, rh, v_anio), 'movimiento_hito_uk');
  perform pg_temp.referido_validado(rh, 'hit5'); perform pg_temp.referido_validado(rh, 'hit6');
  select sum(monto_usd) into v_bonos from public.movimientos_pago where referente_id = rh and concepto = 'bono_hito';
  perform pg_temp.registrar('hito: con 6 validados están los bonos 3 y 6 (acumulativos)', v_bonos = 75 + 150, 'bonos: ' || v_bonos);

  -- El monto se copia al crearse: cambiar la configuracion afecta lo nuevo, no lo ya creado.
  update public.configuracion set valor = '80' where clave = 'monto_base_usd';
  r_prev := pg_temp.referido_validado(rh, 'hit7');
  perform pg_temp.registrar('configuracion: un cambio de monto afecta a los nuevos y no a los creados',
    (select monto_usd = 80 from public.movimientos_pago where referido_id = r_prev and concepto = 'base')
    and (select bool_and(monto_usd = 50) from public.movimientos_pago where referente_id = rh and concepto = 'base' and referido_id <> r_prev));
  update public.configuracion set valor = '50' where clave = 'monto_base_usd';
end $$;

do $$
declare rc uuid; r1 uuid; r2 uuid; r3 uuid; r_pend uuid; v_mov uuid; v_pend integer; v_cancel integer; v_f1 timestamptz;
begin
  perform pg_temp.espera_error('configuracion: un monto negativo se rechaza',
    $q$update public.configuracion set valor = '-5' where clave = 'monto_base_usd'$q$, 'configuracion_invalida');
  perform pg_temp.espera_error('configuracion: un monto que no es número se rechaza',
    $q$update public.configuracion set valor = '"cincuenta"' where clave = 'monto_base_usd'$q$, 'configuracion_invalida');
  perform pg_temp.espera_error('configuracion: el día de corte fuera de 1-28 se rechaza',
    $q$update public.configuracion set valor = '31' where clave = 'dia_corte_pago'$q$, 'configuracion_invalida');
  perform pg_temp.espera_error('configuracion: hitos mal formados se rechazan',
    $q$update public.configuracion set valor = '[{"referidos": 3}]' where clave = 'hitos'$q$, 'configuracion_invalida');
  perform pg_temp.espera_error('configuracion: una zona horaria inexistente se rechaza',
    $q$update public.configuracion set valor = '"Marte/Olympus"' where clave = 'zona_horaria'$q$, 'configuracion_invalida');
  perform pg_temp.espera_error('configuracion: la zona horaria tiene que ser texto',
    $q$update public.configuracion set valor = '3' where clave = 'zona_horaria'$q$, 'configuracion_invalida');
  perform pg_temp.espera_error('configuracion: limite_consulta_codigo sin fallos se rechaza',
    $q$update public.configuracion set valor = '{"segundos": 600}' where clave = 'limite_consulta_codigo'$q$, 'configuracion_invalida');

  rc := pg_temp.nuevo_referente('Rc', 'rc@t.com');
  r1 := pg_temp.referido_validado(rc, 'cy1');
  select id into v_mov from public.movimientos_pago where referido_id = r1 and concepto = 'base';

  perform pg_temp.espera_error('movimiento: el monto no se puede cambiar una vez creado',
    format($q$update public.movimientos_pago set monto_usd = 999 where id = %L$q$, v_mov), 'movimiento_inmutable');
  update public.movimientos_pago set estado = 'pagado' where id = v_mov;
  perform pg_temp.registrar('movimiento: al pasar a pagado se completa pagado_en',
    (select estado = 'pagado' and pagado_en is not null from public.movimientos_pago where id = v_mov));
  perform pg_temp.espera_error('movimiento: un pagado no se modifica',
    format($q$update public.movimientos_pago set estado = 'pendiente', pagado_en = null where id = %L$q$, v_mov), 'movimiento_cerrado');

  -- Sanción (decisión 8): cancela lo pendiente, respeta lo pagado y no cambia el estado de los referidos.
  r2 := pg_temp.referido_validado(rc, 'cy2', true);
  r3 := pg_temp.referido_validado(rc, 'cy3');
  r_pend := pg_temp.nuevo_referido(rc, pg_temp.nuevo_candidato('cy4@t.com'));   -- registrado antes de la sanción
  select count(*) into v_pend from public.movimientos_pago where referente_id = rc and estado = 'pendiente';
  perform pg_temp.registrar('sanción: antes de sancionar, sancionado_en es nulo',
    (select sancionado_en is null from public.referentes where id = rc));
  v_cancel := public.sancionar_referente(rc);
  perform pg_temp.registrar('sanción: cancela todos los movimientos pendientes', v_cancel = v_pend and v_cancel > 0, 'canceló ' || v_cancel || ' de ' || v_pend);
  perform pg_temp.registrar('sanción: lo ya pagado queda intacto y no queda nada pendiente',
    (select estado = 'pagado' from public.movimientos_pago where id = v_mov)
    and (select count(*) = 0 from public.movimientos_pago where referente_id = rc and estado = 'pendiente'));
  perform pg_temp.registrar('sanción: el estado de los referidos no cambia',
    (select count(*) = 4 and count(*) filter (where estado = 'validado') = 3 and count(*) filter (where estado = 'registrado') = 1
       from public.referidos where referente_id = rc));
  perform pg_temp.espera_error('sanción: un movimiento cancelado no se reactiva',
    format($q$update public.movimientos_pago set estado = 'pendiente' where referente_id = %L and estado = 'cancelado_sancion'$q$, rc), 'movimiento_cerrado');

  -- Un sancionado queda igual que un no colocado para lo nuevo: sin referidos nuevos ni movimientos nuevos.
  perform pg_temp.registrar('sanción: sancionar_referente marca sancionado_en',
    (select sancionado_en is not null from public.referentes where id = rc));
  perform pg_temp.espera_error('sanción: un sancionado no abre referidos nuevos',
    format($q$insert into public.referidos (referente_id, candidato_id) values (%L, %L)$q$, rc, pg_temp.nuevo_candidato('sa1@t.com')),
    'referente_sancionado');
  perform pg_temp.espera_error('sanción: un sancionado no genera movimientos nuevos (inserción directa)',
    format($q$insert into public.movimientos_pago (referente_id, referido_id, concepto, monto_usd, ciclo_pago, metodo_pago)
              values (%L, %L, 'extra_prioritario', 5, '2026-10', 'transferencia')$q$, rc, r3),
    'referente_sancionado');
  -- El referido que ya estaba registrado se puede validar (el candidato entra al pool), pero no genera premio.
  perform public.cambiar_estado_referido(r_pend, 'validado');
  perform pg_temp.registrar('sanción: un referido registrado antes se valida pero no genera movimientos',
    (select estado = 'validado' from public.referidos where id = r_pend)
    and (select count(*) = 0 from public.movimientos_pago where referido_id = r_pend)
    and public.crear_movimientos_validacion(r_pend) = 0
    and (select count(*) = 0 from public.movimientos_pago where referente_id = rc and estado = 'pendiente'));
  select sancionado_en into v_f1 from public.referentes where id = rc;
  perform pg_temp.registrar('sanción: repetirla no cambia la fecha ni cancela nada más',
    public.sancionar_referente(rc) = 0 and (select sancionado_en = v_f1 from public.referentes where id = rc));
  perform pg_temp.espera_error('sanción: un referente inexistente da error', $q$select public.sancionar_referente(gen_random_uuid())$q$, 'referente_inexistente');
end $$;

do $$
declare rd uuid; rd2 uuid; r1 uuid; r2 uuid; r3 uuid; r4 uuid; v_zona text; d_pp date;
begin
  -- Decisión 14: si dejó de estar colocado antes de validarse, cobra por transferencia; lo anterior no cambia.
  rd := pg_temp.nuevo_referente('Rd', 'rd@t.com');
  r1 := pg_temp.referido_validado(rd, 'dv1');
  r2 := pg_temp.nuevo_referido(rd, pg_temp.nuevo_candidato('dv2@t.com'));
  update public.referentes set colocado = false where id = rd;
  perform public.cambiar_estado_referido(r2, 'validado');
  perform pg_temp.registrar('pago: referente ya no colocado cobra por transferencia; lo anterior sigue por sueldo',
    (select metodo_pago = 'transferencia' from public.movimientos_pago where referido_id = r2 and concepto = 'base')
    and (select metodo_pago = 'liquidacion_sueldo' from public.movimientos_pago where referido_id = r1 and concepto = 'base'));

  -- Ciclo (decisión 11) en la zona horaria de la configuración.
  v_zona := public.config_texto('zona_horaria');
  rd2 := pg_temp.nuevo_referente('Rd2', 'rd2@t.com');
  update public.configuracion set valor = '28' where clave = 'dia_corte_pago';
  r3 := pg_temp.referido_validado(rd2, 'dv3');
  perform pg_temp.registrar('ciclo: validado antes/en el día de corte entra en el mes actual (corte 28)',
    (select ciclo_pago = to_char(now() at time zone v_zona, 'YYYY-MM') or extract(day from now() at time zone v_zona) > 28
       from public.movimientos_pago where referido_id = r3 and concepto = 'base'));
  update public.configuracion set valor = '1' where clave = 'dia_corte_pago';
  r3 := pg_temp.referido_validado(rd2, 'dv4');
  perform pg_temp.registrar('ciclo: pasado el día de corte entra en el mes siguiente (corte 1)',
    (select ciclo_pago = to_char((now() at time zone v_zona) + interval '1 month', 'YYYY-MM') or extract(day from now() at time zone v_zona) <= 1
       from public.movimientos_pago where referido_id = r3 and concepto = 'base'));

  -- La zona cuenta: Pago Pago (UTC-11) y Kiritimati (UTC+14) están 25 horas corridas, así que el mismo instante cae
  -- en días distintos. Con el corte puesto en el día de hoy de Pago Pago, ahí entra en el mes actual y en Kiritimati
  -- (ya pasado el corte) en el siguiente. Si la zona se ignorara (UTC), alguna de las dos comprobaciones fallaría.
  d_pp := (now() at time zone 'Pacific/Pago_Pago')::date;
  if extract(day from d_pp) > 28 then
    perform pg_temp.registrar('ciclo: la zona horaria cambia el ciclo del mismo instante', true, 'omitida: hoy es día 29-31 en Pago Pago');
  else
    update public.configuracion set valor = to_jsonb(extract(day from d_pp)::integer) where clave = 'dia_corte_pago';
    update public.configuracion set valor = '"Pacific/Pago_Pago"' where clave = 'zona_horaria';
    r3 := pg_temp.referido_validado(rd2, 'dz1');
    update public.configuracion set valor = '"Pacific/Kiritimati"' where clave = 'zona_horaria';
    r4 := pg_temp.referido_validado(rd2, 'dz2');
    perform pg_temp.registrar('ciclo: la zona horaria cambia el ciclo del mismo instante',
      (select ciclo_pago from public.movimientos_pago where referido_id = r3 and concepto = 'base') = to_char(d_pp, 'YYYY-MM')
      and (select ciclo_pago from public.movimientos_pago where referido_id = r4 and concepto = 'base') = to_char(d_pp + interval '1 month', 'YYYY-MM'),
      format('Pago Pago %s / Kiritimati %s', (select ciclo_pago from public.movimientos_pago where referido_id = r3 and concepto = 'base'),
                                              (select ciclo_pago from public.movimientos_pago where referido_id = r4 and concepto = 'base')));
  end if;
  update public.configuracion set valor = '"America/Argentina/Buenos_Aires"' where clave = 'zona_horaria';
  update public.configuracion set valor = '25' where clave = 'dia_corte_pago';
end $$;

-- ---------------------------------------------------------------------
-- 6. RLS y permisos por rol (decisiones 19 y 20; regla 7 de CLAUDE.md)
-- ---------------------------------------------------------------------
do $$
declare ra uuid; rb uuid; c uuid; r_val uuid; r_rev uuid; r_rech uuid;
begin
  ra := pg_temp.nuevo_referente('Rlsa', 'rlsa@t.com');
  rb := pg_temp.nuevo_referente('Rlsb', 'rlsb@t.com');
  r_val := pg_temp.referido_validado(ra, 'rl1');
  r_rev := pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('rl2@t.com'));
  perform public.cambiar_estado_referido(r_rev, 'en_revision', 'sistema', null, 'secreto de revisión', array['motivo_interno']);
  r_rech := pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('rl3@t.com'));
  perform public.cambiar_estado_referido(r_rech, 'en_revision');
  perform public.cambiar_estado_referido(r_rech, 'rechazado');
  perform pg_temp.referido_validado(rb, 'rl4');
  insert into public.equipo_reclutamiento (email, nombre) values ('rec-test@t.com', 'Rec Test');
  insert into public.equipo_reclutamiento (email, nombre, activo) values ('rec-baja@t.com', 'Rec Baja', false);
end $$;

-- Referente A
do $$
declare
  ra uuid := (select id from public.referentes where email = 'rlsa@t.com');
  rb uuid := (select id from public.referentes where email = 'rlsb@t.com');
  rb_referidos uuid[] := array(select id from public.referidos where referente_id = (select id from public.referentes where email = 'rlsb@t.com'));
  v_b_tiene boolean := (select count(*) > 0 from public.movimientos_pago where referente_id = (select id from public.referentes where email = 'rlsb@t.com'));
  n_b_mov int; n_b_mis int; n_b_prog int; n_b_ref int; n_b_mis2 int;
  n_ref int; n_cand int; n_refs int; n_hist int; n_mov int; n_mov_ajenos int; n_mis int; v_estados text; v_prog record;
  v_escribe boolean; v_fn boolean; v_cierre boolean; v_cand_cols boolean; v_motivos boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'email', 'RLSA@t.com ', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n_ref from public.referentes;
  select count(*) into n_cand from public.candidatos;
  select count(*) into n_refs from public.referidos;
  select count(*) into n_hist from public.historial_estados;
  select count(*), count(*) filter (where referente_id <> ra) into n_mov, n_mov_ajenos from public.movimientos_pago;
  select count(*), string_agg(estado_visible, ',' order by estado_visible) into n_mis, v_estados from public.v_mis_referidos;
  select * into v_prog from public.v_progreso_referente;
  -- Intento de ver lo de otro referente (B), pidiéndolo explícitamente por su id.
  select count(*) into n_b_mov from public.movimientos_pago where referente_id = rb;
  select count(*) into n_b_mis from public.v_mis_referidos where referente_id = rb;
  select count(*) into n_b_mis2 from public.v_mis_referidos where referido_id = any (rb_referidos);
  select count(*) into n_b_prog from public.v_progreso_referente where referente_id = rb;
  select count(*) into n_b_ref from public.referentes where id = rb;
  begin insert into public.movimientos_pago (referente_id, referido_id, concepto, monto_usd, ciclo_pago, metodo_pago)
          values (ra, null, 'base', 1, '2026-10', 'transferencia'); v_escribe := true;
  exception when others then v_escribe := not (sqlerrm ilike '%permission denied%'); end;
  begin perform public.cambiar_estado_referido(gen_random_uuid(), 'validado'); v_fn := true;
  exception when others then v_fn := not (sqlerrm ilike '%permission denied%'); end;
  begin perform 1 from public.v_cierre_ciclo; v_cierre := true;
  exception when others then v_cierre := not (sqlerrm ilike '%permission denied%'); end;
  begin perform motivos_revision from public.referidos; v_motivos := true;
  exception when others then v_motivos := not (sqlerrm ilike '%permission denied%'); end;
  execute 'reset role';

  perform pg_temp.registrar('RLS referente: ve solo su propia fila de referentes (y con el email en otro formato)', n_ref = 1, 'filas: ' || n_ref);
  perform pg_temp.registrar('RLS referente: no ve candidatos, referidos ni historial en crudo', n_cand = 0 and n_refs = 0 and n_hist = 0,
    format('candidatos %s, referidos %s, historial %s', n_cand, n_refs, n_hist));
  perform pg_temp.registrar('RLS referente: ve sus movimientos y ninguno ajeno', n_mov > 0 and n_mov_ajenos = 0, format('%s propios, %s ajenos', n_mov, n_mov_ajenos));
  perform pg_temp.registrar('RLS referente: v_mis_referidos muestra solo los suyos; rechazado se ve como no_avanzo',
    n_mis = 3 and v_estados = 'en_revision,no_avanzo,validado', format('%s filas: %s', n_mis, v_estados));
  perform pg_temp.registrar('RLS referente: v_progreso_referente = 1 validado, próximo hito 3, faltan 2',
    v_prog.validados_anio = 1 and v_prog.proximo_hito = 3 and v_prog.faltan = 2 and v_prog.proximo_bono_usd = 75,
    format('%s', row_to_json(v_prog)));
  perform pg_temp.registrar('RLS referente: pedir por id los datos de OTRO referente no devuelve nada (movimientos, vistas y su fila)',
    v_b_tiene and cardinality(rb_referidos) > 0 and n_b_mov = 0 and n_b_mis = 0 and n_b_mis2 = 0 and n_b_prog = 0 and n_b_ref = 0,
    format('B tiene datos: %s; vio movimientos %s, vista referidos %s/%s, progreso %s, fila %s', v_b_tiene, n_b_mov, n_b_mis, n_b_mis2, n_b_prog, n_b_ref));
  perform pg_temp.registrar('RLS referente: no puede escribir movimientos', not v_escribe);
  perform pg_temp.registrar('RLS referente: no puede ejecutar funciones de negocio', not v_fn);
  perform pg_temp.registrar('RLS referente: no accede a v_cierre_ciclo', not v_cierre);
  perform pg_temp.registrar('RLS referente: no puede leer los motivos de revisión (tabla referidos cerrada)', n_refs = 0);
end $$;

-- Vínculo por usuario de Auth (auth.uid()): gana sobre el email, y la vista filtra por ese vínculo.
do $$
declare
  rb uuid := (select id from public.referentes where email = 'rlsb@t.com');
  u uuid := gen_random_uuid();
  v_con_conflicto uuid; v_solo_uid uuid; v_mis_b int; v_otro uuid;
begin
  insert into auth.users (id) values (u);
  update public.referentes set auth_user_id = u where id = rb;

  -- Token con el usuario de B y el email de A: el vínculo por usuario de Auth tiene prioridad (resultado determinista).
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'email', 'rlsa@t.com', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.referente_actual_id() into v_con_conflicto;
  execute 'reset role';
  -- Token con el usuario de B y otro email cualquiera: sigue siendo B por auth.uid(), y ve solo lo de B.
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'email', 'otro@t.com', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.referente_actual_id() into v_solo_uid;
  select count(*) into v_mis_b from public.v_mis_referidos where referente_id = rb;
  execute 'reset role';
  -- Otro usuario de Auth, sin vínculo ni email conocido: no es nadie.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'email', 'otro@t.com', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select public.referente_actual_id() into v_otro;
  execute 'reset role';

  perform pg_temp.registrar('RLS: con usuario de Auth y email de otro referente, gana auth.uid()', v_con_conflicto = rb, coalesce(v_con_conflicto::text, 'null'));
  perform pg_temp.registrar('RLS: el vínculo por auth.uid() funciona sin depender del email y la vista lo respeta',
    v_solo_uid = rb and v_mis_b >= 1, format('id %s, referidos propios %s', v_solo_uid, v_mis_b));
  perform pg_temp.registrar('RLS: un usuario de Auth sin vínculo no resuelve a ningún referente', v_otro is null);
end $$;

-- Reclutamiento, referente desconocido, usuario dado de baja y anónimo
do $$
declare
  n_cand int; n_refs int; n_hist int; n_ref int; v_escribe boolean; v_motivos int;
  n_ref_x int; n_mov_x int; n_mis_x int; n_prog_x int;
  n_cand_baja int;
  n_cfg int; v_anon_ref boolean; v_anon_vista boolean;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'email', 'rec-test@t.com', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n_cand from public.candidatos;
  select count(*) into n_refs from public.referidos;
  select count(*) into v_motivos from public.referidos where 'motivo_interno' = any (motivos_revision);
  select count(*) into n_hist from public.historial_estados;
  select count(*) into n_ref from public.referentes;
  begin insert into public.referidos (referente_id, candidato_id) values (gen_random_uuid(), gen_random_uuid()); v_escribe := true;
  exception when others then v_escribe := not (sqlerrm ilike '%permission denied%'); end;
  execute 'reset role';
  perform pg_temp.registrar('RLS reclutamiento: lee candidatos, referidos (con motivos), historial y referentes',
    n_cand > 0 and n_refs > 0 and v_motivos = 1 and n_hist > 0 and n_ref > 2,
    format('candidatos %s, referidos %s, con motivo %s, historial %s, referentes %s', n_cand, n_refs, v_motivos, n_hist, n_ref));
  perform pg_temp.registrar('RLS reclutamiento: no escribe por la API (solo n8n)', not v_escribe);

  -- Persona de reclutamiento dada de baja: pierde el acceso.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'email', 'rec-baja@t.com', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n_cand_baja from public.candidatos;
  execute 'reset role';
  perform pg_temp.registrar('RLS reclutamiento: una persona dada de baja (activo = false) no ve nada', n_cand_baja = 0, 'candidatos: ' || n_cand_baja);

  -- Usuario autenticado que no es referente ni reclutamiento
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'email', 'nadie@t.com', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into n_ref_x from public.referentes;
  select count(*) into n_mov_x from public.movimientos_pago;
  select count(*) into n_mis_x from public.v_mis_referidos;
  select count(*) into n_prog_x from public.v_progreso_referente;
  execute 'reset role';
  perform pg_temp.registrar('RLS sin vínculo: un usuario que no es referente ni de reclutamiento no ve nada',
    n_ref_x = 0 and n_mov_x = 0 and n_mis_x = 0 and n_prog_x = 0, format('%s/%s/%s/%s', n_ref_x, n_mov_x, n_mis_x, n_prog_x));

  -- Anónimo: solo configuracion
  execute 'set local role anon';
  select count(*) into n_cfg from public.configuracion;
  begin perform 1 from public.referentes; v_anon_ref := true;
  exception when others then v_anon_ref := not (sqlerrm ilike '%permission denied%'); end;
  begin perform 1 from public.v_mis_referidos; v_anon_vista := true;
  exception when others then v_anon_vista := not (sqlerrm ilike '%permission denied%'); end;
  execute 'reset role';
  perform pg_temp.registrar('RLS anónimo: lee configuracion (montos y plazos públicos)', n_cfg >= 10, 'claves: ' || n_cfg);
  perform pg_temp.registrar('RLS anónimo: no accede a referentes ni a las vistas del portal', not v_anon_ref and not v_anon_vista);
end $$;

-- Estructura: RLS activo en todas las tablas, vistas, bucket de CVs y permisos de historial
select pg_temp.registrar('RLS activado en las 7 tablas',
  (select count(*) = 7 and bool_and(relrowsecurity) from pg_class
    where relnamespace = 'public'::regnamespace and relname in
      ('configuracion', 'equipo_reclutamiento', 'referentes', 'candidatos', 'referidos', 'historial_estados', 'movimientos_pago')));
select pg_temp.registrar('Storage: bucket cvs privado, solo PDF y hasta 5 MB',
  (select not public and file_size_limit = 5242880 and allowed_mime_types = array['application/pdf'] from storage.buckets where id = 'cvs'));
select pg_temp.registrar('v_cierre_ciclo suma los pendientes por ciclo, referente y método',
  (select coalesce(sum(total_usd), 0) = (select coalesce(sum(monto_usd), 0) from public.movimientos_pago where estado = 'pendiente')
        and coalesce(sum(cantidad_movimientos), 0) = (select count(*) from public.movimientos_pago where estado = 'pendiente')
     from public.v_cierre_ciclo));

-- ---------------------------------------------------------------------
-- 7. Consulta del link desde la landing (decisiones 2 y 41): función con secreto, sin exponer `referentes`
--    Requiere consulta_referente.sql aplicado. El secreto real no se toca: estas pruebas fijan uno de prueba dentro
--    de la transacción y el ROLLBACK final restaura el verdadero.
-- ---------------------------------------------------------------------
select pg_temp.registrar('consulta: la función y las tablas privadas existen (aplicá consulta_referente.sql)',
  to_regprocedure('public.consultar_referente_por_codigo(text,text,text)') is not null
  and to_regclass('public.secretos_internos') is not null and to_regclass('public.intentos_consulta_codigo') is not null);

insert into public.secretos_internos (clave, valor) values ('consulta_codigo', 'secreto-de-prueba-0123456789abcdef0123')
on conflict (clave) do update set valor = excluded.valor;

select pg_temp.registrar('codigo: los referentes del seed tienen códigos de 8 caracteres (lucia-k7q2m9xd, etc.)',
  (select count(*) = 4 and bool_and(codigo_referido ~ '^[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]{8}$')
          and bool_or(codigo_referido = 'lucia-k7q2m9xd') and bool_or(codigo_referido = 'andres-m2w5q8vc')
     from public.referentes where email like 'matecamilion05+%@gmail.com'));

-- 7.1 Qué devuelve y a quién
do $$
declare
  k constant text := 'secreto-de-prueba-0123456789abcdef0123';
  v record; v_ok text; v_nc text; v_sa text; v_antiguo text := 'lucia-k7q2m9'; v_cols text[];
begin
  insert into public.referentes (nombre, apellido, email) values ('Cons', 'Ok', 'cons-ok@t.com') returning codigo_referido into v_ok;
  insert into public.referentes (nombre, apellido, email, colocado) values ('Cons', 'Nc', 'cons-nc@t.com', false) returning codigo_referido into v_nc;
  insert into public.referentes (nombre, apellido, email) values ('Cons', 'Sa', 'cons-sa@t.com') returning codigo_referido into v_sa;
  update public.referentes set sancionado_en = now() where email = 'cons-sa@t.com';

  select * into v from public.consultar_referente_por_codigo(v_ok, '10.0.0.1', k);
  perform pg_temp.registrar('consulta: con secreto, un referente colocado devuelve ok con nombre, apellido y código',
    v.estado = 'ok' and v.nombre = 'Cons' and v.apellido = 'Ok' and v.codigo_referido = v_ok, format('%s', row_to_json(v)));

  select * into v from public.consultar_referente_por_codigo('  ' || upper(v_ok) || ' ', '10.0.0.1', k);
  perform pg_temp.registrar('consulta: el código se normaliza (mayúsculas y espacios)', v.estado = 'ok', v.estado);

  select * into v from public.consultar_referente_por_codigo(v_nc, '10.0.0.2', k);
  perform pg_temp.registrar('consulta: un referente que ya no está colocado responde no_existe', v.estado = 'no_existe', v.estado);
  select * into v from public.consultar_referente_por_codigo(v_sa, '10.0.0.3', k);
  perform pg_temp.registrar('consulta: un referente sancionado responde no_existe', v.estado = 'no_existe', v.estado);
  select * into v from public.consultar_referente_por_codigo(v_antiguo, '10.0.0.4', k);
  perform pg_temp.registrar('consulta: el formato viejo de 6 caracteres responde no_existe', v.estado = 'no_existe', v.estado);
  select * into v from public.consultar_referente_por_codigo('zzz-00000000', '10.0.0.5', k);
  perform pg_temp.registrar('consulta: un código con formato válido pero inexistente responde no_existe', v.estado = 'no_existe', v.estado);

  -- La firma devuelve solo estado, nombre, apellido y código: nunca email, LinkedIn ni nada más.
  select proargnames[4:7] into v_cols from pg_proc where proname = 'consultar_referente_por_codigo';
  perform pg_temp.registrar('consulta: solo devuelve estado, nombre, apellido y código (sin email ni LinkedIn)',
    v_cols = array['estado', 'nombre', 'apellido', 'codigo_referido']
    and (select cardinality(proargnames) = 7 from pg_proc where proname = 'consultar_referente_por_codigo'),
    coalesce(v_cols::text, 'null'));
end $$;

-- 7.2 Sin secreto válido no responde nada, y la IP o los encabezados del cliente no sirven para nada
do $$
declare
  k constant text := 'secreto-de-prueba-0123456789abcdef0123';
  v record; v_ok text; i integer; n_antes integer; n_filas integer; v_todos_no_autorizados boolean := true;
begin
  select codigo_referido into v_ok from public.referentes where email = 'cons-ok@t.com';

  select * into v from public.consultar_referente_por_codigo(v_ok, '10.0.0.1', null);
  perform pg_temp.registrar('secreto: sin secreto (null) un código VÁLIDO responde no_autorizado', v.estado = 'no_autorizado' and v.nombre is null, v.estado);
  select * into v from public.consultar_referente_por_codigo(v_ok, '10.0.0.1', 'secreto-equivocado-0123456789abcdef0123');
  perform pg_temp.registrar('secreto: con un secreto incorrecto un código válido responde no_autorizado', v.estado = 'no_autorizado' and v.nombre is null, v.estado);
  select * into v from public.consultar_referente_por_codigo(v_ok, '10.0.0.1', '');
  perform pg_temp.registrar('secreto: con secreto vacío responde no_autorizado', v.estado = 'no_autorizado', v.estado);

  -- Un cliente que inventa x-forwarded-for / cf-connecting-ip / x-real-ip y una IP distinta en cada llamada:
  -- la función no usa nada de eso, no responde nada útil y no escribe ni una fila en la tabla de intentos.
  perform set_config('request.headers',
    '{"x-forwarded-for": "6.6.6.6, 7.7.7.7", "cf-connecting-ip": "6.6.6.6", "x-real-ip": "6.6.6.6"}', true);
  select count(*) into n_antes from public.intentos_consulta_codigo;
  for i in 1..30 loop
    select * into v from public.consultar_referente_por_codigo('zzz-' || lpad(i::text, 8, '0'), '66.66.66.' || i, 'secreto-equivocado-0123456789abcdef0123');
    v_todos_no_autorizados := v_todos_no_autorizados and v.estado = 'no_autorizado';
  end loop;
  select count(*) into n_filas from public.intentos_consulta_codigo;
  perform pg_temp.registrar('secreto: 30 intentos sin secreto con IP y encabezados inventados no devuelven datos ni guardan filas',
    v_todos_no_autorizados and n_filas = n_antes, format('filas antes %s, después %s', n_antes, n_filas));

  -- Y no perjudican a nadie: la IP 6.6.6.6 (la que "inventaron") no queda bloqueada para quien sí tiene el secreto.
  select * into v from public.consultar_referente_por_codigo(v_ok, '6.6.6.6', k);
  perform pg_temp.registrar('secreto: una IP inventada por un cliente sin secreto no queda bloqueada ni afecta a otros', v.estado = 'ok', v.estado);
  perform set_config('request.headers', '', true);

  -- Sin secreto cargado, nada funciona (estado seguro por defecto).
  delete from public.secretos_internos where clave = 'consulta_codigo';
  select * into v from public.consultar_referente_por_codigo(v_ok, '10.0.0.1', k);
  perform pg_temp.registrar('secreto: si no hay secreto cargado, todo responde no_autorizado', v.estado = 'no_autorizado', v.estado);
  insert into public.secretos_internos (clave, valor) values ('consulta_codigo', k);

  perform pg_temp.espera_error('secreto: un secreto de menos de 32 caracteres no se acepta',
    $q$update public.secretos_internos set valor = 'corto' where clave = 'consulta_codigo'$q$, 'check constraint');
end $$;

-- 7.3 Límite por IP: segunda capa (configuracion.limite_consulta_codigo)
do $$
declare
  k constant text := 'secreto-de-prueba-0123456789abcdef0123';
  v record; v_ok text; i integer; v_estados text[] := '{}'; n_viejos integer;
begin
  select codigo_referido into v_ok from public.referentes where email = 'cons-ok@t.com';

  for i in 1..10 loop
    select * into v from public.consultar_referente_por_codigo('zzz-' || lpad(i::text, 8, '0'), '20.0.0.1', k);
    v_estados := v_estados || v.estado;
  end loop;
  perform pg_temp.registrar('límite: los primeros 10 códigos inexistentes de una IP responden no_existe',
    (select bool_and(e = 'no_existe') and count(*) = 10 from unnest(v_estados) e), array_to_string(v_estados, ','));
  select * into v from public.consultar_referente_por_codigo('zzz-00000011', '20.0.0.1', k);
  perform pg_temp.registrar('límite: el 11.º código distinto queda bloqueado', v.estado = 'bloqueada', v.estado);
  select * into v from public.consultar_referente_por_codigo(v_ok, '20.0.0.1', k);
  perform pg_temp.registrar('límite: con la IP bloqueada ni un código válido responde', v.estado = 'bloqueada' and v.nombre is null, v.estado);
  select * into v from public.consultar_referente_por_codigo(v_ok, '20.0.0.2', k);
  perform pg_temp.registrar('límite: otra IP sigue libre', v.estado = 'ok', v.estado);

  for i in 1..25 loop perform * from public.consultar_referente_por_codigo('zzz-99999999', '20.0.0.3', k); end loop;
  select * into v from public.consultar_referente_por_codigo(v_ok, '20.0.0.3', k);
  perform pg_temp.registrar('límite: repetir el mismo código roto 25 veces cuenta una sola vez', v.estado = 'ok', v.estado);

  -- La ventana vence: los intentos viejos se borran al consultar y la IP queda libre.
  update public.intentos_consulta_codigo set creado_en = now() - interval '11 minutes' where ip = '20.0.0.1';
  select * into v from public.consultar_referente_por_codigo(v_ok, '20.0.0.1', k);
  select count(*) into n_viejos from public.intentos_consulta_codigo where creado_en < now() - interval '10 minutes';
  perform pg_temp.registrar('límite: vencida la ventana la IP queda libre y los intentos viejos se borran', v.estado = 'ok' and n_viejos = 0,
    format('estado %s, viejos %s', v.estado, n_viejos));

  -- El tope sale de la configuración.
  update public.configuracion set valor = '{"fallos": 2, "segundos": 600}' where clave = 'limite_consulta_codigo';
  perform * from public.consultar_referente_por_codigo('zzz-00000101', '20.0.0.9', k);
  perform * from public.consultar_referente_por_codigo('zzz-00000102', '20.0.0.9', k);
  select * into v from public.consultar_referente_por_codigo('zzz-00000103', '20.0.0.9', k);
  perform pg_temp.registrar('límite: el tope se lee de configuracion (con 2 fallos bloquea al tercero)', v.estado = 'bloqueada', v.estado);
  update public.configuracion set valor = '{"fallos": 10, "segundos": 600}' where clave = 'limite_consulta_codigo';
end $$;

-- 7.4 Permisos: el anónimo solo puede llamar a la función; las tablas siguen cerradas
do $$
declare
  k constant text := 'secreto-de-prueba-0123456789abcdef0123';
  v_ok text; v_a record; v_u record;
  d_ref boolean; d_sec boolean; d_int boolean; d_ins boolean; d_fn boolean; d_sec_u boolean;
begin
  select codigo_referido into v_ok from public.referentes where email = 'cons-ok@t.com';

  execute 'set local role anon';
  select * into v_a from public.consultar_referente_por_codigo(v_ok, '30.0.0.1', k);
  begin perform 1 from public.referentes; d_ref := true; exception when others then d_ref := not (sqlerrm ilike '%permission denied%'); end;
  begin perform 1 from public.secretos_internos; d_sec := true; exception when others then d_sec := not (sqlerrm ilike '%permission denied%'); end;
  begin perform 1 from public.intentos_consulta_codigo; d_int := true; exception when others then d_int := not (sqlerrm ilike '%permission denied%'); end;
  begin insert into public.intentos_consulta_codigo (ip, codigo) values ('1.1.1.1', 'x'); d_ins := true;
  exception when others then d_ins := not (sqlerrm ilike '%permission denied%'); end;
  begin perform public.cambiar_estado_referido(gen_random_uuid(), 'validado'); d_fn := true;
  exception when others then d_fn := not (sqlerrm ilike '%permission denied%'); end;
  execute 'reset role';

  execute 'set local role authenticated';
  select * into v_u from public.consultar_referente_por_codigo(v_ok, '30.0.0.2', k);
  begin perform 1 from public.secretos_internos; d_sec_u := true; exception when others then d_sec_u := not (sqlerrm ilike '%permission denied%'); end;
  execute 'reset role';

  perform pg_temp.registrar('permisos: el rol anónimo puede llamar a la función (con el secreto) y recibe el nombre', v_a.estado = 'ok' and v_a.nombre = 'Cons', format('%s', row_to_json(v_a)));
  perform pg_temp.registrar('permisos: el rol anónimo sigue sin leer referentes', not d_ref);
  perform pg_temp.registrar('permisos: el rol anónimo no lee el secreto ni la tabla de intentos', not d_sec and not d_int);
  perform pg_temp.registrar('permisos: el rol anónimo no escribe en la tabla de intentos ni ejecuta funciones de negocio', not d_ins and not d_fn);
  perform pg_temp.registrar('permisos: un usuario autenticado tampoco lee el secreto', not d_sec_u);
  perform pg_temp.registrar('permisos: las tablas nuevas tienen RLS activado y ninguna política',
    (select count(*) = 2 and bool_and(relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace
      and relname in ('secretos_internos', 'intentos_consulta_codigo'))
    and (select count(*) = 0 from pg_policies where schemaname = 'public' and tablename in ('secretos_internos', 'intentos_consulta_codigo')));
  perform pg_temp.registrar('permisos: solo la función de consulta es ejecutable por anónimos entre las de negocio',
    has_function_privilege('anon', 'public.consultar_referente_por_codigo(text,text,text)', 'execute')
    and not has_function_privilege('anon', 'public.cambiar_estado_referido(uuid,public.tipo_estado_referido,public.tipo_actor,uuid,text,text[])', 'execute')
    and not has_function_privilege('anon', 'public.sancionar_referente(uuid)', 'execute')
    and not has_function_privilege('anon', 'public.crear_movimientos_validacion(uuid)', 'execute'));
end $$;

-- ---------------------------------------------------------------------
-- 8. Login: email_habilitado (decisión 44) y aislamiento del portal por referente
--    Requiere email_habilitado.sql aplicado. Reutiliza el secreto de prueba fijado en la sección 7.
-- ---------------------------------------------------------------------
select pg_temp.registrar('login: la función email_habilitado existe (aplicá email_habilitado.sql)',
  to_regprocedure('public.email_habilitado(text,text)') is not null);

do $$
declare
  k constant text := 'secreto-de-prueba-0123456789abcdef0123';
  v_sin text[]; v_mal text[];
  d_ref boolean; d_eq boolean; d_sec boolean; ok_anon text;
begin
  insert into public.referentes (nombre, apellido, email) values ('Log', 'Ok', 'log-ok@t.com');
  insert into public.referentes (nombre, apellido, email, colocado) values ('Log', 'Nc', 'log-nc@t.com', false);
  insert into public.referentes (nombre, apellido, email) values ('Log', 'Sa', 'log-sa@t.com');
  update public.referentes set sancionado_en = now() where email = 'log-sa@t.com';
  insert into public.equipo_reclutamiento (email, nombre, activo) values ('log-rec@t.com', 'Rec Activo', true);
  insert into public.equipo_reclutamiento (email, nombre, activo) values ('log-rec-off@t.com', 'Rec Inactivo', false);
  insert into public.equipo_reclutamiento (email, nombre, activo) values ('log-ambos@t.com', 'Ambos', true);
  insert into public.referentes (nombre, apellido, email) values ('Log', 'Ambos', 'log-ambos@t.com');

  -- Con secreto correcto
  perform pg_temp.registrar('login: referente colocado y sin sanción -> referente', public.email_habilitado('log-ok@t.com', k) = 'referente', public.email_habilitado('log-ok@t.com', k));
  perform pg_temp.registrar('login: el email se normaliza (mayúsculas y espacios)', public.email_habilitado('  LOG-OK@T.com ', k) = 'referente');
  perform pg_temp.registrar('login: equipo de reclutamiento activo -> reclutamiento', public.email_habilitado('log-rec@t.com', k) = 'reclutamiento');
  perform pg_temp.registrar('login: reclutamiento inactivo -> ninguno', public.email_habilitado('log-rec-off@t.com', k) = 'ninguno');
  perform pg_temp.registrar('login: referente no colocado -> ninguno', public.email_habilitado('log-nc@t.com', k) = 'ninguno');
  perform pg_temp.registrar('login: referente sancionado -> ninguno', public.email_habilitado('log-sa@t.com', k) = 'ninguno');
  perform pg_temp.registrar('login: email que no está en ninguna lista -> ninguno', public.email_habilitado('nadie@t.com', k) = 'ninguno');
  perform pg_temp.registrar('login: email vacío o nulo -> ninguno', public.email_habilitado('', k) = 'ninguno' and public.email_habilitado(null, k) = 'ninguno');
  perform pg_temp.registrar('login: si está en las dos listas gana reclutamiento', public.email_habilitado('log-ambos@t.com', k) = 'reclutamiento');
  perform pg_temp.registrar('login: los alias del seed responden lo esperado (lucia y martin referente, reclutamiento, andres ninguno)',
    public.email_habilitado('matecamilion05+lucia@gmail.com', k) = 'referente'
    and public.email_habilitado('matecamilion05+martin@gmail.com', k) = 'referente'
    and public.email_habilitado('matecamilion05+reclutamiento@gmail.com', k) = 'reclutamiento'
    and public.email_habilitado('matecamilion05+andres@gmail.com', k) = 'ninguno');

  -- Sin secreto: no revela nada. Emails que existen y que no existen dan EXACTAMENTE la misma respuesta.
  select array_agg(public.email_habilitado(e, null)) into v_sin
    from unnest(array['log-ok@t.com', 'log-rec@t.com', 'log-nc@t.com', 'nadie@t.com', 'matecamilion05+lucia@gmail.com']) e;
  select array_agg(public.email_habilitado(e, 'secreto-equivocado-0123456789abcdef012')) into v_mal
    from unnest(array['log-ok@t.com', 'log-rec@t.com', 'log-nc@t.com', 'nadie@t.com', 'matecamilion05+lucia@gmail.com']) e;
  perform pg_temp.registrar('login: sin secreto responde no_autorizado a todos, existan o no (no revela nada)',
    (select count(distinct x) = 1 and bool_and(x = 'no_autorizado') from unnest(v_sin) x), array_to_string(v_sin, ','));
  perform pg_temp.registrar('login: con un secreto equivocado tampoco revela nada',
    (select count(distinct x) = 1 and bool_and(x = 'no_autorizado') from unnest(v_mal) x), array_to_string(v_mal, ','));

  -- Sin secreto cargado en la base: estado seguro por defecto.
  delete from public.secretos_internos where clave = 'consulta_codigo';
  perform pg_temp.registrar('login: si el secreto no está cargado en la base responde no_autorizado incluso a un secreto "válido"',
    public.email_habilitado('log-ok@t.com', k) = 'no_autorizado');
  insert into public.secretos_internos (clave, valor) values ('consulta_codigo', k);

  -- Permisos: el anónimo puede llamar a la función, pero no leer las listas.
  execute 'set local role anon';
  ok_anon := public.email_habilitado('log-ok@t.com', k);
  begin perform 1 from public.referentes; d_ref := true; exception when others then d_ref := not (sqlerrm ilike '%permission denied%'); end;
  begin perform 1 from public.equipo_reclutamiento; d_eq := true; exception when others then d_eq := not (sqlerrm ilike '%permission denied%'); end;
  begin perform 1 from public.secretos_internos; d_sec := true; exception when others then d_sec := not (sqlerrm ilike '%permission denied%'); end;
  execute 'reset role';
  perform pg_temp.registrar('login: el rol anónimo puede llamar a la función (con el secreto)', ok_anon = 'referente', ok_anon);
  perform pg_temp.registrar('login: el rol anónimo sigue sin leer referentes, equipo_reclutamiento ni secretos', not d_ref and not d_eq and not d_sec);
  perform pg_temp.registrar('login: la función es SECURITY DEFINER y solo la ejecutan anon, authenticated y service_role (no public)',
    (select prosecdef from pg_proc where oid = 'public.email_habilitado(text,text)'::regprocedure)
    and has_function_privilege('anon', 'public.email_habilitado(text,text)', 'execute')
    and has_function_privilege('authenticated', 'public.email_habilitado(text,text)', 'execute'));
end $$;

-- 8.2 Portal: un referente con sesión ve solo lo suyo (lo que lee /portal: referentes, v_mis_referidos, v_progreso_referente, movimientos_pago)
do $$
declare
  ra uuid; rb uuid; ca uuid; cb uuid; da uuid; db uuid;
  v_filas_a int; v_filas_b_de_a int; v_ids_ref uuid[]; v_mov_a int; v_mov_ajenos int; v_prog_ajenos int; v_rec boolean;
begin
  ra := pg_temp.nuevo_referente('PortalA', 'portal-a@t.com');
  rb := pg_temp.nuevo_referente('PortalB', 'portal-b@t.com');
  ca := pg_temp.nuevo_candidato('cand-portal-a@t.com');
  cb := pg_temp.nuevo_candidato('cand-portal-b@t.com');
  insert into public.referidos (referente_id, candidato_id) values (ra, ca) returning id into da;
  insert into public.referidos (referente_id, candidato_id) values (rb, cb) returning id into db;
  perform public.cambiar_estado_referido(da, 'validado');   -- genera movimientos pendientes para A
  perform public.cambiar_estado_referido(db, 'validado');   -- y para B

  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'email', 'portal-a@t.com', 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  select count(*) into v_filas_a from public.v_mis_referidos;
  select count(*) into v_filas_b_de_a from public.v_mis_referidos where referente_id = rb;
  select array_agg(id) into v_ids_ref from public.referentes;
  select count(*) into v_mov_a from public.movimientos_pago where referente_id = ra;
  select count(*) into v_mov_ajenos from public.movimientos_pago where referente_id <> ra;
  select count(*) into v_prog_ajenos from public.v_progreso_referente where referente_id <> ra;
  v_rec := public.es_reclutamiento();
  execute 'reset role';

  perform pg_temp.registrar('portal: el referente ve solo sus referidos en v_mis_referidos', v_filas_a = 1 and v_filas_b_de_a = 0, format('%s propios, %s ajenos', v_filas_a, v_filas_b_de_a));
  perform pg_temp.registrar('portal: el referente ve solo su fila de referentes', v_ids_ref = array[ra], format('%s filas', cardinality(v_ids_ref)));
  perform pg_temp.registrar('portal: el referente ve sus movimientos y ninguno ajeno', v_mov_a >= 1 and v_mov_ajenos = 0, format('%s propios, %s ajenos', v_mov_a, v_mov_ajenos));
  perform pg_temp.registrar('portal: el progreso solo trae su fila', v_prog_ajenos = 0);
  perform pg_temp.registrar('portal: un referente no es reclutamiento', not v_rec);
end $$;

-- ---------------------------------------------------------------------
-- 9. registrar_referido: alta atómica del referido (decisión 51)
--    Requiere registrar_referido.sql aplicado.
-- ---------------------------------------------------------------------
select pg_temp.registrar('registrar_referido: la función existe (aplicá registrar_referido.sql)',
  to_regprocedure('public.registrar_referido(text,text,text,text,text,public.tipo_especialidad,boolean,public.tipo_seniority,public.tipo_nivel_ingles,boolean,text)') is not null);

-- Llama a la función como lo hace n8n. Prioritario = arquitectura + Revit + senior + inglés avanzado.
create function pg_temp.rr(p_codigo text, p_nombre text, p_apellido text, p_email text, p_linkedin text,
                           p_prioritario boolean default false, p_cv text default 'cv-test.pdf') returns jsonb
language sql as $$
  select public.registrar_referido(p_codigo, p_nombre, p_apellido, p_email, p_linkedin,
    (case when p_prioritario then 'arquitectura' else 'ingenieria' end)::public.tipo_especialidad, p_prioritario,
    (case when p_prioritario then 'senior' else 'junior' end)::public.tipo_seniority, 'avanzado', true, p_cv) $$;

create function pg_temp.codigo_de(p_referente uuid) returns text
language sql as $$ select codigo_referido from public.referentes where id = p_referente $$;

-- a) y b) Candidato nuevo: prioritario (100) y no prioritario (50)
do $$
declare ra uuid; cod text; j jsonb; k jsonb; v_ref uuid;
begin
  ra := pg_temp.nuevo_referente('Rra', 'rra@t.com');
  cod := pg_temp.codigo_de(ra);

  j := pg_temp.rr(cod, 'Zoilo', 'Quispe', ' Zoilo.Quispe@T.com ', 'https://www.linkedin.com/in/zoilo-quispe/', true);
  v_ref := (j ->> 'referido_id')::uuid;
  perform pg_temp.registrar('registrar_referido a: nuevo prioritario -> registrado, validado, USD 100, faltan 2 para el hito de 3',
    j ->> 'resultado' = 'registrado' and j ->> 'estado' = 'validado' and (j ->> 'repetido')::boolean = false
    and (j ->> 'monto_usd')::numeric = 100 and (j ->> 'bono_hito_usd')::numeric = 0
    and (j ->> 'validados_anio')::int = 1 and (j -> 'proximo_hito' ->> 'referidos')::int = 3
    and (j -> 'proximo_hito' ->> 'faltan')::int = 2 and (j -> 'proximo_hito' ->> 'bono_usd')::numeric = 75
    and (j ->> 'ciclo_pago') ~ '^[0-9]{4}-[0-9]{2}$' and j -> 'motivos' = '[]'::jsonb
    and j -> 'referente' ->> 'email' = 'rra@t.com' and j -> 'candidato' ->> 'email' = 'zoilo.quispe@t.com', j::text);
  perform pg_temp.registrar('registrar_referido a: el candidato queda normalizado, con CV, origen referido y es_prioritario = true',
    (select email = 'zoilo.quispe@t.com' and linkedin_url = 'https://www.linkedin.com/in/zoilo-quispe'
            and cv_url = 'cv-test.pdf' and origen = 'referido' and acepto_visibilidad and es_prioritario
       from public.candidatos c join public.referidos r on r.candidato_id = c.id where r.id = v_ref));
  perform pg_temp.registrar('registrar_referido a: 2 filas de historial (null -> registrado, registrado -> validado) y 2 movimientos que suman 100',
    (select count(*) = 2 and bool_or(estado_anterior is null and estado_nuevo = 'registrado')
        and bool_or(estado_anterior = 'registrado' and estado_nuevo = 'validado' and actor_tipo = 'sistema')
       from public.historial_estados where referido_id = v_ref)
    and (select count(*) = 2 and sum(monto_usd) = 100 from public.movimientos_pago where referido_id = v_ref));

  k := pg_temp.rr(cod, 'Wilfredo', 'Anccasi', 'wilfredo.a@t.com', 'linkedin.com/in/wilfredo-anccasi', false);
  perform pg_temp.registrar('registrar_referido b: nuevo no prioritario -> validado, USD 50, un solo movimiento (base), faltan 1',
    k ->> 'resultado' = 'registrado' and k ->> 'estado' = 'validado' and (k ->> 'monto_usd')::numeric = 50
    and (select count(*) = 1 and bool_and(concepto = 'base') from public.movimientos_pago where referido_id = (k ->> 'referido_id')::uuid)
    and (k ->> 'validados_anio')::int = 2 and (k -> 'proximo_hito' ->> 'faltan')::int = 1, k::text);

  -- El tercero valida y dispara el bono del hito (3 -> +75): se informa en bono_hito_usd.
  k := pg_temp.rr(cod, 'Ximena', 'Huaman', 'ximena.h@t.com', 'linkedin.com/in/ximena-huaman', false);
  perform pg_temp.registrar('registrar_referido b: el tercer validado informa el bono del hito (75) y apunta al hito de 6',
    (k ->> 'bono_hito_usd')::numeric = 75 and (k ->> 'validados_anio')::int = 3
    and (k -> 'proximo_hito' ->> 'referidos')::int = 6 and (k -> 'proximo_hito' ->> 'faltan')::int = 3, k::text);
end $$;

-- c) Ya registrado con otro referente (por email y por LinkedIn) y d) reintento del mismo referente
do $$
declare r1 uuid; r2 uuid; r3 uuid; j jsonb; k jsonb; v_ref1 uuid; v_ref2 uuid;
begin
  r1 := pg_temp.nuevo_referente('Rrc1', 'rrc1@t.com');
  r2 := pg_temp.nuevo_referente('Rrc2', 'rrc2@t.com');
  r3 := pg_temp.nuevo_referente('Rrc3', 'rrc3@t.com');

  j := pg_temp.rr(pg_temp.codigo_de(r1), 'Efrain', 'Mamani', 'efrain.m@t.com', 'linkedin.com/in/efrain-mamani');
  v_ref1 := (j ->> 'referido_id')::uuid;

  -- d) el mismo referente repite el envío (doble clic, reintento)
  k := pg_temp.rr(pg_temp.codigo_de(r1), 'Efrain', 'Mamani', 'EFRAIN.M@t.com', 'linkedin.com/in/efrain-mamani');
  perform pg_temp.registrar('registrar_referido d: el reintento del mismo referente -> registrado con repetido = true, mismo referido',
    k ->> 'resultado' = 'registrado' and (k ->> 'repetido')::boolean and (k ->> 'referido_id')::uuid = v_ref1 and k ->> 'estado' = 'validado', k::text);
  perform pg_temp.registrar('registrar_referido d: sigue habiendo un solo referido, un solo candidato y los mismos movimientos',
    (select count(*) = 1 from public.referidos where candidato_id = (select candidato_id from public.referidos where id = v_ref1))
    and (select count(*) = 1 from public.candidatos where email = 'efrain.m@t.com')
    and (select count(*) = 1 from public.movimientos_pago where referido_id = v_ref1));

  -- c) otro referente envía al mismo candidato (con el email en otro formato)
  k := pg_temp.rr(pg_temp.codigo_de(r2), 'Efrain', 'Mamani', ' Efrain.M@T.com', 'linkedin.com/in/otro-efrain');
  v_ref2 := (k ->> 'referido_id')::uuid;
  perform pg_temp.registrar('registrar_referido c: ya está en el pool (otro referente) -> ya_registrado, estado descartado',
    k ->> 'resultado' = 'ya_registrado' and k ->> 'estado' = 'descartado' and k -> 'motivos' = '["ya_en_pool"]'::jsonb
    and k -> 'referente' ->> 'email' = 'rrc2@t.com' and (k ->> 'monto_usd')::numeric = 0, k::text);
  perform pg_temp.registrar('registrar_referido c: un solo candidato con ese email, 0 movimientos para el descartado, el referido original intacto',
    (select count(*) = 1 from public.candidatos where email = 'efrain.m@t.com')
    and (select count(*) = 0 from public.movimientos_pago where referido_id = v_ref2)
    and (select estado = 'descartado' and motivos_revision = array['ya_en_pool'] from public.referidos where id = v_ref2)
    and (select estado = 'validado' from public.referidos where id = v_ref1));
  perform pg_temp.registrar('registrar_referido c: el historial del descartado deja el motivo ya_en_pool (sistema)',
    (select count(*) = 1 and bool_and(estado_anterior is null and estado_nuevo = 'descartado' and motivo = 'ya_en_pool' and actor_tipo = 'sistema')
       from public.historial_estados where referido_id = v_ref2));

  -- d) el que quedó descartado lo vuelve a enviar: no se duplica el descartado y sigue siendo ya_registrado
  k := pg_temp.rr(pg_temp.codigo_de(r2), 'Efrain', 'Mamani', 'efrain.m@t.com', 'linkedin.com/in/efrain-mamani');
  perform pg_temp.registrar('registrar_referido d: reintento de un descartado -> ya_registrado, sin referidos nuevos',
    k ->> 'resultado' = 'ya_registrado' and (k ->> 'repetido')::boolean = false and (k ->> 'referido_id')::uuid = v_ref2
    and (select count(*) = 1 from public.referidos where referente_id = r2), k::text);

  -- c) por LinkedIn: otro email, mismo perfil (en otra forma de escribirlo)
  k := pg_temp.rr(pg_temp.codigo_de(r3), 'Efrain', 'Mamani', 'efrain.otro@t.com', 'https://es.linkedin.com/in/Efrain-Mamani/?utm=1');
  perform pg_temp.registrar('registrar_referido c: mismo LinkedIn con otro email -> ya_registrado, sin candidato nuevo',
    k ->> 'resultado' = 'ya_registrado' and k ->> 'estado' = 'descartado'
    and (select count(*) = 0 from public.candidatos where email = 'efrain.otro@t.com')
    and (select count(*) = 1 from public.candidatos where linkedin_url = 'https://www.linkedin.com/in/efrain-mamani'), k::text);
end $$;

-- e) Autorreferido, f) código inválido, g) sin aviso de visibilidad, y LinkedIn inválido
do $$
declare ra uuid; rn uuid; rs uuid; j jsonb; n_antes int; n_despues int;
begin
  ra := pg_temp.nuevo_referente('Rfx', 'rfx@t.com');     -- LinkedIn de la ficha: https://www.linkedin.com/in/ref-rfx
  select count(*) into n_antes from public.candidatos;

  j := pg_temp.rr(pg_temp.codigo_de(ra), 'Otro', 'Nombre', ' RFX@T.com ', 'linkedin.com/in/alguien-mas');
  perform pg_temp.registrar('registrar_referido e: autorreferido por email -> autorreferido, sin candidato', j ->> 'resultado' = 'autorreferido', j::text);
  j := pg_temp.rr(pg_temp.codigo_de(ra), 'Otro', 'Nombre', 'otro.rfx@t.com', 'https://www.linkedin.com/in/ref-rfx/?utm=1');
  perform pg_temp.registrar('registrar_referido e: autorreferido por LinkedIn en otro formato -> autorreferido', j ->> 'resultado' = 'autorreferido', j::text);
  select count(*) into n_despues from public.candidatos;
  perform pg_temp.registrar('registrar_referido e: el autorreferido no crea candidato ni referido ni pago',
    n_antes = n_despues and (select count(*) = 0 from public.referidos where referente_id = ra)
    and (select count(*) = 0 from public.movimientos_pago where referente_id = ra));

  -- f) códigos que no abren referidos
  rn := pg_temp.nuevo_referente('Rfn', 'rfn@t.com', false);
  rs := pg_temp.nuevo_referente('Rfs', 'rfs@t.com');
  update public.referentes set sancionado_en = now() where id = rs;
  perform pg_temp.registrar('registrar_referido f: código inexistente -> codigo_invalido',
    pg_temp.rr('inexistente-00000000', 'Aa', 'Bb', 'f1@t.com', 'linkedin.com/in/f1') ->> 'resultado' = 'codigo_invalido');
  perform pg_temp.registrar('registrar_referido f: código con formato roto o nulo -> codigo_invalido',
    pg_temp.rr('', 'Aa', 'Bb', 'f1@t.com', 'linkedin.com/in/f1') ->> 'resultado' = 'codigo_invalido'
    and pg_temp.rr(null, 'Aa', 'Bb', 'f1@t.com', 'linkedin.com/in/f1') ->> 'resultado' = 'codigo_invalido');
  perform pg_temp.registrar('registrar_referido f: referente no colocado -> codigo_invalido',
    pg_temp.rr(pg_temp.codigo_de(rn), 'Aa', 'Bb', 'f2@t.com', 'linkedin.com/in/f2') ->> 'resultado' = 'codigo_invalido');
  perform pg_temp.registrar('registrar_referido f: referente sancionado -> codigo_invalido',
    pg_temp.rr(pg_temp.codigo_de(rs), 'Aa', 'Bb', 'f3@t.com', 'linkedin.com/in/f3') ->> 'resultado' = 'codigo_invalido');
  perform pg_temp.registrar('registrar_referido f: ninguno de los casos inválidos creó candidatos',
    (select count(*) = 0 from public.candidatos where email in ('f1@t.com', 'f2@t.com', 'f3@t.com')));
  perform pg_temp.registrar('registrar_referido f: el código se acepta en mayúsculas y con espacios',
    pg_temp.rr('  ' || upper(pg_temp.codigo_de(ra)) || ' ', 'Casimiro', 'Yupanqui', 'casimiro.y@t.com', 'linkedin.com/in/casimiro-yupanqui') ->> 'resultado' = 'registrado');

  -- g) sin aceptar el aviso de visibilidad: error, y no se crea nada
  perform pg_temp.espera_error('registrar_referido g: acepto_visibilidad = false se rechaza',
    format($q$select public.registrar_referido(%L, 'Aa', 'Bb', 'g1@t.com', 'linkedin.com/in/g1', 'arquitectura', true, 'senior', 'avanzado', false, 'cv.pdf')$q$,
           pg_temp.codigo_de(ra)), 'acepto_visibilidad_requerido');
  perform pg_temp.espera_error('registrar_referido g: acepto_visibilidad nulo también se rechaza',
    format($q$select public.registrar_referido(%L, 'Aa', 'Bb', 'g2@t.com', 'linkedin.com/in/g2', 'arquitectura', true, 'senior', 'avanzado', null, 'cv.pdf')$q$,
           pg_temp.codigo_de(ra)), 'acepto_visibilidad_requerido');
  perform pg_temp.espera_error('registrar_referido g: un LinkedIn que no es un perfil se rechaza',
    format($q$select public.registrar_referido(%L, 'Aa', 'Bb', 'g3@t.com', 'https://example.com/in/g3', 'arquitectura', true, 'senior', 'avanzado', true, 'cv.pdf')$q$,
           pg_temp.codigo_de(ra)), 'linkedin_invalido');
  perform pg_temp.registrar('registrar_referido g: los rechazados no dejaron candidatos',
    (select count(*) = 0 from public.candidatos where email in ('g1@t.com', 'g2@t.com', 'g3@t.com')));
end $$;

-- h) Posible duplicado por nombre y apellido, y perfil incompleto
do $$
declare ra uuid; j jsonb; k jsonb; m jsonb;
begin
  ra := pg_temp.nuevo_referente('Rrh', 'rrh@t.com');
  j := pg_temp.rr(pg_temp.codigo_de(ra), 'Genoveva', 'Cusi', 'genoveva.c1@t.com', 'linkedin.com/in/genoveva-cusi-1');
  k := pg_temp.rr(pg_temp.codigo_de(ra), ' GENOVEVA ', 'cusi', 'genoveva.c2@t.com', 'linkedin.com/in/genoveva-cusi-2');
  perform pg_temp.registrar('registrar_referido h: mismo nombre y apellido (otras mayúsculas) con otro email -> en_revision por posible_duplicado, 0 pagos',
    j ->> 'estado' = 'validado' and k ->> 'resultado' = 'registrado' and k ->> 'estado' = 'en_revision'
    and k -> 'motivos' = '["posible_duplicado"]'::jsonb and (k ->> 'monto_usd')::numeric = 0 and k ->> 'ciclo_pago' is null
    and (select count(*) = 0 from public.movimientos_pago where referido_id = (k ->> 'referido_id')::uuid)
    and (select count(*) = 1 from public.candidatos where email = 'genoveva.c2@t.com'), k::text);
  perform pg_temp.registrar('registrar_referido h: el historial deja registrado -> en_revision con el motivo, y el referido guarda los motivos',
    (select count(*) = 2 and bool_or(estado_anterior = 'registrado' and estado_nuevo = 'en_revision' and motivo = 'posible_duplicado')
       from public.historial_estados where referido_id = (k ->> 'referido_id')::uuid)
    and (select motivos_revision = array['posible_duplicado'] from public.referidos where id = (k ->> 'referido_id')::uuid));

  -- perfil_incompleto (defensiva): sin CV
  m := pg_temp.rr(pg_temp.codigo_de(ra), 'Hortensia', 'Ccori', 'hortensia.c@t.com', 'linkedin.com/in/hortensia-ccori', false, null);
  perform pg_temp.registrar('registrar_referido h: sin CV -> en_revision por perfil_incompleto',
    m ->> 'estado' = 'en_revision' and m -> 'motivos' = '["perfil_incompleto"]'::jsonb, m::text);
end $$;

-- i) Alerta de volumen: el tope sale de configuracion (5 en 7 días); los descartados no cuentan
do $$
declare ra uuid; cod text; j5 jsonb; j6 jsonb; i int; j jsonb; rd uuid;
begin
  ra := pg_temp.nuevo_referente('Rvol', 'rvol@t.com');
  cod := pg_temp.codigo_de(ra);
  for i in 1..4 loop perform pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('vol' || i || '@t.com')); end loop;

  j5 := pg_temp.rr(cod, 'Ladislao', 'Ticona', 'ladislao.t@t.com', 'linkedin.com/in/ladislao-ticona');
  perform pg_temp.registrar('registrar_referido i: el 5.º referido (en el tope) todavía se valida', j5 ->> 'estado' = 'validado', j5::text);
  j6 := pg_temp.rr(cod, 'Nemesio', 'Choque', 'nemesio.c@t.com', 'linkedin.com/in/nemesio-choque');
  perform pg_temp.registrar('registrar_referido i: con 5 referidos no descartados, el 6.º va a en_revision con alerta_volumen',
    j6 ->> 'estado' = 'en_revision' and j6 -> 'motivos' = '["alerta_volumen"]'::jsonb and (j6 ->> 'monto_usd')::numeric = 0, j6::text);

  -- Los descartados (ya en el pool) no suman al volumen.
  rd := pg_temp.nuevo_referente('Rvol2', 'rvol2@t.com');
  for i in 1..6 loop
    perform pg_temp.rr(pg_temp.codigo_de(rd), 'Dup', 'Existente', 'ladislao.t@t.com', 'linkedin.com/in/ladislao-ticona');   -- repite: no crea nada
  end loop;
  perform pg_temp.registrar('registrar_referido i: los descartados no cuentan para la alerta (1 descartado, no 6)',
    (select count(*) = 1 from public.referidos where referente_id = rd));
  j := pg_temp.rr(pg_temp.codigo_de(rd), 'Aurelio', 'Pari', 'aurelio.p@t.com', 'linkedin.com/in/aurelio-pari');
  perform pg_temp.registrar('registrar_referido i: tras los descartados, un referido nuevo se valida normal', j ->> 'estado' = 'validado', j::text);

  -- El tope se lee de configuracion: con 1 en 7 días, el segundo ya va a revisión.
  update public.configuracion set valor = '{"cantidad": 1, "dias": 7}' where clave = 'alerta_volumen';
  j := pg_temp.rr(pg_temp.codigo_de(rd), 'Belisario', 'Pari', 'belisario.p@t.com', 'linkedin.com/in/belisario-pari');
  perform pg_temp.registrar('registrar_referido i: el tope sale de configuracion (cantidad 1 -> el segundo va a revisión)',
    j ->> 'estado' = 'en_revision' and j -> 'motivos' = '["alerta_volumen"]'::jsonb, j::text);
  update public.configuracion set valor = '{"cantidad": 5, "dias": 7}' where clave = 'alerta_volumen';
end $$;

-- j) Permisos: solo la service role ejecuta la función
do $$
declare
  ra uuid; cod text; v_sig regprocedure :=
    'public.registrar_referido(text,text,text,text,text,public.tipo_especialidad,boolean,public.tipo_seniority,public.tipo_nivel_ingles,boolean,text)'::regprocedure;
  v_anon boolean; v_auth boolean; v_sr jsonb; v_sr_err text; n_antes int;
begin
  ra := pg_temp.nuevo_referente('Rperm', 'rperm@t.com');
  cod := pg_temp.codigo_de(ra);
  select count(*) into n_antes from public.candidatos;

  execute 'set local role anon';
  begin perform pg_temp.rr(cod, 'Pa', 'Anon', 'perm.anon@t.com', 'linkedin.com/in/perm-anon'); v_anon := true;
  exception when others then v_anon := not (sqlerrm ilike '%permission denied%'); end;
  execute 'reset role';

  execute 'set local role authenticated';
  begin perform pg_temp.rr(cod, 'Pa', 'Auth', 'perm.auth@t.com', 'linkedin.com/in/perm-auth'); v_auth := true;
  exception when others then v_auth := not (sqlerrm ilike '%permission denied%'); end;
  execute 'reset role';

  execute 'set local role service_role';
  begin v_sr := pg_temp.rr(cod, 'Pa', 'Servicio', 'perm.sr@t.com', 'linkedin.com/in/perm-sr');
  exception when others then v_sr_err := sqlerrm; end;
  execute 'reset role';

  perform pg_temp.registrar('registrar_referido j: anon no puede ejecutarla (permission denied) y no creó nada', not v_anon
    and (select count(*) = 0 from public.candidatos where email = 'perm.anon@t.com'));
  perform pg_temp.registrar('registrar_referido j: authenticated no puede ejecutarla (permission denied) y no creó nada', not v_auth
    and (select count(*) = 0 from public.candidatos where email = 'perm.auth@t.com'));
  perform pg_temp.registrar('registrar_referido j: service_role la ejecuta de punta a punta (alta, validación y pagos)',
    v_sr ->> 'resultado' = 'registrado' and v_sr ->> 'estado' = 'validado' and (v_sr ->> 'monto_usd')::numeric = 50,
    coalesce(v_sr_err, v_sr::text));
  perform pg_temp.registrar('registrar_referido j: privilegios: service_role sí; anon, authenticated y public no',
    has_function_privilege('service_role', v_sig, 'execute')
    and not has_function_privilege('anon', v_sig, 'execute')
    and not has_function_privilege('authenticated', v_sig, 'execute')
    and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     where p.oid = v_sig and a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  perform pg_temp.registrar('registrar_referido j: no es SECURITY DEFINER y fija search_path = public, pg_temp',
    (select not prosecdef and exists (select 1 from unnest(proconfig) c where c like 'search_path=%public%pg_temp%')
       from pg_proc where oid = v_sig));
end $$;

-- ---------------------------------------------------------------------
-- 10. Resolución desde el panel: reapertura y resolver_referido (decisiones 63 a 66; panel_resolver.sql)
-- ---------------------------------------------------------------------
-- Ejecuta resolver_referido como una persona con sesión (rol authenticated y email en el JWT) y devuelve el
-- resultado, o {"error": "<mensaje>"} si falló. El rol vuelve a postgres antes de salir.
create function pg_temp.resolver_como(p_email text, p_referido uuid, p_decision text, p_motivo text default null) returns jsonb
language plpgsql as $$
declare v jsonb;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'email', p_email, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
  begin
    v := public.resolver_referido(p_referido, p_decision, p_motivo);
  exception when others then
    v := jsonb_build_object('error', sqlerrm);
  end;
  execute 'reset role';
  return v;
end $$;

-- Cuántos movimientos y qué suma tiene un referido (para comprobar que no se duplican ni se tocan).
create function pg_temp.pagos_de(p_referido uuid) returns text
language sql as $$
  select count(*) || ' mov / ' || coalesce(sum(monto_usd), 0) || ' USD / ' || coalesce(string_agg(distinct estado::text, ','), '-')
    from public.movimientos_pago where referido_id = p_referido $$;

do $$
declare
  ra uuid; rs uuid; rev uuid; rev_baja uuid;
  c_pri uuid; c_norm uuid; c_rech uuid; c_reab uuid; c_reg uuid; c_desc uuid; c_san uuid; c_largo uuid; c_ref uuid; c_perm uuid;
  v jsonb; v_antes text; v_motivos text[]; v_msg text;
begin
  insert into public.equipo_reclutamiento (email, nombre) values ('res-rev@t.com', 'Revisor Resolver') returning id into rev;
  insert into public.equipo_reclutamiento (email, nombre, activo) values ('res-baja@t.com', 'Revisor de baja', false) returning id into rev_baja;
  ra := pg_temp.nuevo_referente('Resa', 'resa@t.com');
  rs := pg_temp.nuevo_referente('Ress', 'ress@t.com');

  -- Casos en revisión (con motivos de revisión que no deben pisarse).
  c_pri := pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('res-pri@t.com', true));
  perform public.cambiar_estado_referido(c_pri, 'en_revision', 'sistema', null, null, array['posible_duplicado', 'alerta_volumen']);
  c_norm := pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('res-norm@t.com'));
  perform public.cambiar_estado_referido(c_norm, 'en_revision', 'sistema', null, null, array['perfil_incompleto']);

  -- 10.1 Transiciones de la base (nivel trigger).
  c_rech := pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('res-rech@t.com'));
  perform public.cambiar_estado_referido(c_rech, 'en_revision');
  perform public.cambiar_estado_referido(c_rech, 'rechazado');
  update public.referidos set estado = 'en_revision' where id = c_rech;
  perform pg_temp.registrar('reapertura (trigger): rechazado -> en_revision está permitido',
    (select estado = 'en_revision' and validado_en is null from public.referidos where id = c_rech));
  perform public.cambiar_estado_referido(c_rech, 'rechazado');
  perform pg_temp.espera_error('reapertura (trigger): rechazado -> validado sigue prohibido',
    format($q$update public.referidos set estado = 'validado' where id = %L$q$, c_rech), 'transicion_invalida');
  perform pg_temp.espera_error('reapertura (trigger): rechazado -> registrado sigue prohibido',
    format($q$update public.referidos set estado = 'registrado' where id = %L$q$, c_rech), 'transicion_invalida');
  perform pg_temp.espera_error('reapertura (trigger): rechazado -> descartado sigue prohibido',
    format($q$update public.referidos set estado = 'descartado' where id = %L$q$, c_rech), 'transicion_invalida');
  perform pg_temp.espera_error('reapertura (trigger): registrado -> rechazado sigue prohibido',
    format($q$update public.referidos set estado = 'rechazado' where id = %L$q$, pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('res-t1@t.com'))), 'transicion_invalida');

  -- 10.2 Aprobar: prioritario (100 = 50 base + 50 extra), con actor y revisor en el historial.
  v := pg_temp.resolver_como(' RES-REV@t.com ', c_pri, 'aprobar');
  perform pg_temp.registrar('resolver aprobar: queda validado, devuelve estado, referido_id y monto 100 sin sin_pago',
    v ->> 'estado' = 'validado' and (v ->> 'referido_id')::uuid = c_pri and (v ->> 'monto_usd')::numeric = 100 and (v ->> 'sin_pago')::boolean = false
    and (select estado = 'validado' and validado_en is not null from public.referidos where id = c_pri), v::text);
  perform pg_temp.registrar('resolver aprobar: crea los pagos por el trigger (base 50 + extra 50, pendientes)',
    (select count(*) = 2 and sum(monto_usd) = 100 and bool_and(estado = 'pendiente')
        and bool_or(concepto = 'base' and monto_usd = 50) and bool_or(concepto = 'extra_prioritario' and monto_usd = 50)
       from public.movimientos_pago where referido_id = c_pri), pg_temp.pagos_de(c_pri));
  perform pg_temp.registrar('resolver aprobar: el historial registra actor reclutamiento y el id del revisor (email en otro formato)',
    (select count(*) = 1 from public.historial_estados
      where referido_id = c_pri and estado_anterior = 'en_revision' and estado_nuevo = 'validado' and actor_tipo = 'reclutamiento' and actor_id = rev));
  perform pg_temp.registrar('resolver aprobar: no pisa motivos_revision',
    (select motivos_revision = array['posible_duplicado', 'alerta_volumen'] from public.referidos where id = c_pri));

  -- Aprobar uno común: 50.
  v := pg_temp.resolver_como('res-rev@t.com', c_norm, 'aprobar');
  perform pg_temp.registrar('resolver aprobar: un caso común paga 50',
    (v ->> 'monto_usd')::numeric = 50 and pg_temp.pagos_de(c_norm) like '1 mov / 50%', v::text);

  -- 10.3 Resolver dos veces no duplica pagos.
  v_antes := pg_temp.pagos_de(c_pri);
  v := pg_temp.resolver_como('res-rev@t.com', c_pri, 'aprobar');
  perform pg_temp.registrar('resolver dos veces: la segunda da ya_resuelto y no duplica pagos',
    v ->> 'error' like 'ya_resuelto%' and pg_temp.pagos_de(c_pri) = v_antes, v::text || ' / ' || pg_temp.pagos_de(c_pri));
  v := pg_temp.resolver_como('res-rev@t.com', c_pri, 'rechazar');
  perform pg_temp.registrar('resolver: rechazar un validado da ya_resuelto y no cambia nada',
    v ->> 'error' like 'ya_resuelto%' and pg_temp.pagos_de(c_pri) = v_antes
    and (select estado = 'validado' from public.referidos where id = c_pri), v::text);

  -- 10.4 Rechazar: sin pagos, con motivo opcional.
  c_reab := pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('res-reab@t.com'));
  perform public.cambiar_estado_referido(c_reab, 'en_revision', 'sistema', null, null, array['perfil_incompleto']);
  v := pg_temp.resolver_como('res-rev@t.com', c_reab, 'rechazar', '  No cumple el perfil  ');
  perform pg_temp.registrar('resolver rechazar: queda rechazado, sin pagos, monto nulo y sin sin_pago',
    v ->> 'estado' = 'rechazado' and v -> 'monto_usd' = 'null'::jsonb and (v ->> 'sin_pago')::boolean = false
    and pg_temp.pagos_de(c_reab) like '0 mov%', v::text);
  perform pg_temp.registrar('resolver rechazar: el historial guarda actor, revisor y el motivo recortado',
    (select count(*) = 1 from public.historial_estados
      where referido_id = c_reab and estado_nuevo = 'rechazado' and actor_tipo = 'reclutamiento' and actor_id = rev and motivo = 'No cumple el perfil'));
  c_ref := pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('res-sinmot@t.com'));
  perform public.cambiar_estado_referido(c_ref, 'en_revision', 'sistema', null, null, array['alerta_volumen']);
  v := pg_temp.resolver_como('res-rev@t.com', c_ref, 'rechazar');
  perform pg_temp.registrar('resolver rechazar: el motivo es opcional', v ->> 'estado' = 'rechazado', v::text);

  -- 10.5 Reabrir: motivo obligatorio.
  v_motivos := (select motivos_revision from public.referidos where id = c_reab);
  v := pg_temp.resolver_como('res-rev@t.com', c_reab, 'reabrir');
  perform pg_temp.registrar('resolver reabrir: sin motivo falla (motivo_requerido) y no cambia el estado',
    v ->> 'error' like 'motivo_requerido%' and (select estado = 'rechazado' from public.referidos where id = c_reab), v::text);
  v := pg_temp.resolver_como('res-rev@t.com', c_reab, 'reabrir', '   ');
  perform pg_temp.registrar('resolver reabrir: un motivo en blanco cuenta como vacío',
    v ->> 'error' like 'motivo_requerido%' and (select estado = 'rechazado' from public.referidos where id = c_reab), v::text);

  -- 10.6 Reabrir un rechazado y aprobarlo después.
  v := pg_temp.resolver_como('res-rev@t.com', c_reab, 'reabrir', 'Llegó el CV que faltaba');
  perform pg_temp.registrar('resolver reabrir: el rechazado vuelve a en_revision con motivos_revision intactos y sin pagos',
    v ->> 'estado' = 'en_revision'
    and (select estado = 'en_revision' and motivos_revision = v_motivos and validado_en is null from public.referidos where id = c_reab)
    and pg_temp.pagos_de(c_reab) like '0 mov%', v::text);
  perform pg_temp.registrar('resolver reabrir: el historial guarda rechazado -> en_revision con actor, revisor y motivo',
    (select count(*) = 1 from public.historial_estados
      where referido_id = c_reab and estado_anterior = 'rechazado' and estado_nuevo = 'en_revision'
        and actor_tipo = 'reclutamiento' and actor_id = rev and motivo = 'Llegó el CV que faltaba'));
  v := pg_temp.resolver_como('res-rev@t.com', c_reab, 'reabrir', 'otra vez');
  perform pg_temp.registrar('resolver reabrir: un caso que ya está en revisión da estado_invalido', v ->> 'error' like 'estado_invalido%', v::text);
  v := pg_temp.resolver_como('res-rev@t.com', c_reab, 'aprobar');
  perform pg_temp.registrar('resolver: el reabierto se aprueba y paga 50 una sola vez',
    v ->> 'estado' = 'validado' and (v ->> 'monto_usd')::numeric = 50 and pg_temp.pagos_de(c_reab) like '1 mov / 50%',
    v::text || ' / ' || pg_temp.pagos_de(c_reab));
  perform pg_temp.registrar('resolver: el historial completo del reabierto tiene los 5 pasos en orden',
    (select string_agg(coalesce(estado_anterior::text, 'alta') || '>' || estado_nuevo, ' ' order by id) =
            'alta>registrado registrado>en_revision en_revision>rechazado rechazado>en_revision en_revision>validado'
       from public.historial_estados where referido_id = c_reab));

  -- 10.7 Un validado no se reabre, ni por la función ni por la base, y sus pagos no se tocan.
  v_antes := pg_temp.pagos_de(c_pri);
  v := pg_temp.resolver_como('res-rev@t.com', c_pri, 'reabrir', 'me arrepentí');
  perform pg_temp.registrar('resolver reabrir: un validado da estado_invalido y no toca los pagos',
    v ->> 'error' like 'estado_invalido%' and pg_temp.pagos_de(c_pri) = v_antes
    and (select estado = 'validado' from public.referidos where id = c_pri), v::text);
  perform pg_temp.espera_error('reapertura (trigger): validado -> en_revision da transicion_invalida',
    format($q$update public.referidos set estado = 'en_revision' where id = %L$q$, c_pri), 'transicion_invalida');
  perform pg_temp.registrar('reapertura (trigger): tras el intento los pagos del validado siguen iguales',
    pg_temp.pagos_de(c_pri) = v_antes and (select estado = 'validado' from public.referidos where id = c_pri));

  -- 10.8 Estados que no se resuelven y entradas inválidas.
  c_reg := pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('res-reg@t.com'));
  insert into public.referidos (referente_id, candidato_id, estado, motivos_revision)
    values (ra, pg_temp.nuevo_candidato('res-desc@t.com'), 'descartado', array['duplicado']) returning id into c_desc;
  v := pg_temp.resolver_como('res-rev@t.com', c_reg, 'aprobar');
  perform pg_temp.registrar('resolver: aprobar un registrado da estado_invalido', v ->> 'error' like 'estado_invalido%', v::text);
  v := pg_temp.resolver_como('res-rev@t.com', c_reg, 'rechazar');
  perform pg_temp.registrar('resolver: rechazar un registrado da estado_invalido', v ->> 'error' like 'estado_invalido%', v::text);
  v := pg_temp.resolver_como('res-rev@t.com', c_desc, 'aprobar');
  perform pg_temp.registrar('resolver: aprobar un descartado da estado_invalido', v ->> 'error' like 'estado_invalido%', v::text);
  v := pg_temp.resolver_como('res-rev@t.com', c_desc, 'reabrir', 'probar');
  perform pg_temp.registrar('resolver: reabrir un descartado da estado_invalido', v ->> 'error' like 'estado_invalido%', v::text);
  perform pg_temp.registrar('resolver: los registrados y descartados no cambiaron',
    (select count(*) = 2 from public.referidos where id in (c_reg, c_desc) and estado in ('registrado', 'descartado')));
  v := pg_temp.resolver_como('res-rev@t.com', c_reab, 'rechazar');
  perform pg_temp.registrar('resolver: rechazar uno ya validado da ya_resuelto', v ->> 'error' like 'ya_resuelto%', v::text);
  v := pg_temp.resolver_como('res-rev@t.com', c_ref, 'aprobar');
  perform pg_temp.registrar('resolver: aprobar uno ya rechazado da ya_resuelto', v ->> 'error' like 'ya_resuelto%', v::text);
  v := pg_temp.resolver_como('res-rev@t.com', c_norm, 'borrar');
  perform pg_temp.registrar('resolver: una decisión desconocida da decision_invalida', v ->> 'error' like 'decision_invalida%', v::text);
  v := pg_temp.resolver_como('res-rev@t.com', null, 'aprobar');
  perform pg_temp.registrar('resolver: un id nulo da referido_inexistente', v ->> 'error' like 'referido_inexistente%', v::text);
  v := pg_temp.resolver_como('res-rev@t.com', gen_random_uuid(), 'aprobar');
  perform pg_temp.registrar('resolver: un id que no existe da referido_inexistente', v ->> 'error' like 'referido_inexistente%', v::text);
  c_largo := pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('res-largo@t.com'));
  perform public.cambiar_estado_referido(c_largo, 'en_revision');
  v := pg_temp.resolver_como('res-rev@t.com', c_largo, 'rechazar', repeat('x', 501));
  perform pg_temp.registrar('resolver: un motivo de más de 500 caracteres da motivo_demasiado_largo y no cambia nada',
    v ->> 'error' like 'motivo_demasiado_largo%' and (select estado = 'en_revision' from public.referidos where id = c_largo), v::text);
  v := pg_temp.resolver_como('res-rev@t.com', c_largo, 'rechazar', repeat('x', 500));
  perform pg_temp.registrar('resolver: un motivo de exactamente 500 caracteres se acepta', v ->> 'estado' = 'rechazado', v::text);

  -- 10.9 Permisos: la base decide, no el botón.
  c_perm := pg_temp.nuevo_referido(ra, pg_temp.nuevo_candidato('res-perm@t.com'));
  perform public.cambiar_estado_referido(c_perm, 'en_revision');
  v := pg_temp.resolver_como('resa@t.com', c_perm, 'aprobar');
  perform pg_temp.registrar('resolver permisos: un referente con sesión recibe sin_permiso y el caso no cambia',
    v ->> 'error' like 'sin_permiso%' and (select estado = 'en_revision' from public.referidos where id = c_perm)
    and pg_temp.pagos_de(c_perm) like '0 mov%', v::text);
  v := pg_temp.resolver_como('nadie@t.com', c_perm, 'rechazar');
  perform pg_temp.registrar('resolver permisos: un usuario sin vínculo recibe sin_permiso', v ->> 'error' like 'sin_permiso%', v::text);
  v := pg_temp.resolver_como('res-baja@t.com', c_perm, 'aprobar');
  perform pg_temp.registrar('resolver permisos: una persona de reclutamiento dada de baja recibe sin_permiso', v ->> 'error' like 'sin_permiso%', v::text);
  v := pg_temp.resolver_como('', c_perm, 'aprobar');
  perform pg_temp.registrar('resolver permisos: una sesión sin email recibe sin_permiso', v ->> 'error' like 'sin_permiso%', v::text);
  v := pg_temp.resolver_como('res-baja@t.com', gen_random_uuid(), 'aprobar');
  perform pg_temp.registrar('resolver permisos: sin permiso no se revela si el referido existe (mismo error)', v ->> 'error' like 'sin_permiso%', v::text);
  perform pg_temp.registrar('resolver permisos: tras los intentos sin permiso el caso sigue en revisión',
    (select estado = 'en_revision' from public.referidos where id = c_perm));

  perform set_config('request.jwt.claims', '', true);
  execute 'set local role anon';
  begin perform public.resolver_referido(c_perm, 'aprobar'); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.registrar('resolver permisos: anon no puede ejecutarla (permission denied) y el caso no cambia',
    v_msg ilike '%permission denied%' and (select estado = 'en_revision' from public.referidos where id = c_perm), v_msg);
  execute 'set local role service_role';
  begin perform public.resolver_referido(c_perm, 'aprobar'); v_msg := null;
  exception when others then v_msg := sqlerrm; end;
  execute 'reset role';
  perform pg_temp.registrar('resolver permisos: la service role tampoco puede ejecutarla', v_msg ilike '%permission denied%', v_msg);

  perform pg_temp.registrar('resolver permisos: privilegios: authenticated sí; anon, service_role y public no',
    has_function_privilege('authenticated', 'public.resolver_referido(uuid, text, text)', 'execute')
    and not has_function_privilege('anon', 'public.resolver_referido(uuid, text, text)', 'execute')
    and not has_function_privilege('service_role', 'public.resolver_referido(uuid, text, text)', 'execute')
    and not exists (select 1 from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
                     where p.oid = 'public.resolver_referido(uuid, text, text)'::regprocedure and a.grantee = 0 and a.privilege_type = 'EXECUTE'));
  perform pg_temp.registrar('resolver: es SECURITY DEFINER y fija search_path = public, pg_temp',
    (select prosecdef and exists (select 1 from unnest(proconfig) c where c like 'search_path=%public%pg_temp%')
       from pg_proc where oid = 'public.resolver_referido(uuid, text, text)'::regprocedure));
  -- La única puerta para quien tiene sesión es resolver_referido: las funciones de negocio siguen cerradas.
  perform pg_temp.registrar('resolver: authenticated sigue sin poder llamar a cambiar_estado_referido directamente',
    not has_function_privilege('authenticated', 'public.cambiar_estado_referido(uuid, public.tipo_estado_referido, public.tipo_actor, uuid, text, text[])', 'execute'));

  -- 10.10 Referente sancionado (decisión 39): se valida, pero no se genera ningún pago.
  c_san := pg_temp.nuevo_referido(rs, pg_temp.nuevo_candidato('res-san@t.com', true));
  perform public.cambiar_estado_referido(c_san, 'en_revision', 'sistema', null, null, array['alerta_volumen']);
  perform public.sancionar_referente(rs);
  v := pg_temp.resolver_como('res-rev@t.com', c_san, 'aprobar');
  perform pg_temp.registrar('resolver sancionado: aprobar valida, devuelve sin_pago = true, monto 0 y no crea movimientos',
    v ->> 'estado' = 'validado' and (v ->> 'sin_pago')::boolean and (v ->> 'monto_usd')::numeric = 0
    and pg_temp.pagos_de(c_san) like '0 mov%' and (select estado = 'validado' from public.referidos where id = c_san), v::text);
end $$;

-- Resultado: el resumen primero y después cada prueba.
select resultado, prueba, detalle from (
  select 0 as orden, 'RESUMEN' as resultado,
         count(*) filter (where ok) || ' pasan, ' || count(*) filter (where not ok) || ' fallan, de ' || count(*) as prueba,
         null::text as detalle
    from pg_temp.resultados
  union all
  select n, case when ok then 'OK' else 'FALLA' end, prueba, detalle from pg_temp.resultados
) x order by orden;

rollback;
