-- =====================================================================
-- tests.sql — Pruebas del esquema (se corren después de schema.sql y seed.sql)
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
  perform pg_temp.espera_error('referido: un estado final no cambia (rechazado -> validado)',
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
