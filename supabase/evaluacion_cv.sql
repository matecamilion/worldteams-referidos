-- =====================================================================
-- evaluacion_cv.sql — Evaluación automática del CV: manda a revisión los casos dudosos
--
-- Se aplica después de schema.sql y seed.sql (y de panel_resolver.sql, por el orden de instalación). Es re-ejecutable.
-- Es la ÚNICA definición de public.registrar_referido (decisión 51, ampliada por la 70): registrar_referido.sql ya no la define.
-- La llama n8n por RPC con la service role: sube el CV, llama a esta función, responde y manda mails. Si cualquier paso
-- falla, la transacción entera se deshace. Resultados: registrado | ya_registrado | codigo_invalido | autorreferido.
-- Errores (excepción): linkedin_invalido, email_invalido, acepto_visibilidad_requerido.
-- Principio: la IA nunca decide sola. El puntaje solo puede MANDAR A REVISIÓN un caso que habría quedado validado
-- (motivo `cv_dudoso`). Nunca rechaza, nunca valida y nunca cambia montos. La regla vive acá; n8n solo trae el puntaje.
--
-- Qué hace:
--   1. Valida las dos claves nuevas de configuracion (reemplaza trg_configuracion_validar).
--   2. Carga las claves con on conflict do nothing (interruptor apagado, umbral 60).
--   3. Reemplaza registrar_referido por una versión con un parámetro opcional al final, p_cv_puntaje.
--      Cambia la firma, así que se borra la anterior (de 11 argumentos): dos sobrecargas harían ambigua la llamada por RPC.
-- =====================================================================

-- 1. Validación de la configuración: igual que en schema.sql, más las dos claves nuevas.
create or replace function public.trg_configuracion_validar() returns trigger language plpgsql as $$
declare h jsonb;
begin
  new.actualizado_en := now();
  new.actualizado_por := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', current_user);

  if new.clave in ('monto_base_usd', 'multiplicador_prioritario', 'dia_corte_pago',
                   'plazo_respuesta_candidato_dias_habiles', 'plazo_revision_dias_habiles') then
    if jsonb_typeof(new.valor) <> 'number' or (new.valor #>> '{}')::numeric <= 0 then
      raise exception 'configuracion_invalida: % debe ser un número mayor que 0', new.clave using errcode = '23514';
    end if;
    if new.clave = 'multiplicador_prioritario' and (new.valor #>> '{}')::numeric < 1 then
      raise exception 'configuracion_invalida: multiplicador_prioritario debe ser al menos 1' using errcode = '23514';
    end if;
    if new.clave = 'dia_corte_pago' and (new.valor #>> '{}')::numeric not between 1 and 28 then
      raise exception 'configuracion_invalida: dia_corte_pago debe estar entre 1 y 28' using errcode = '23514';
    end if;
  elsif new.clave = 'hitos' then
    if jsonb_typeof(new.valor) <> 'array' then
      raise exception 'configuracion_invalida: hitos debe ser una lista' using errcode = '23514';
    end if;
    for h in select * from jsonb_array_elements(new.valor) loop
      if coalesce((h ->> 'referidos')::int, 0) <= 0 or coalesce((h ->> 'bono_usd')::numeric, 0) <= 0 then
        raise exception 'configuracion_invalida: cada hito necesita referidos y bono_usd mayores que 0' using errcode = '23514';
      end if;
    end loop;
  elsif new.clave = 'alerta_volumen' then
    if coalesce((new.valor ->> 'cantidad')::int, 0) <= 0 or coalesce((new.valor ->> 'dias')::int, 0) <= 0 then
      raise exception 'configuracion_invalida: alerta_volumen necesita cantidad y dias mayores que 0' using errcode = '23514';
    end if;
  elsif new.clave = 'zona_horaria' then
    begin
      if jsonb_typeof(new.valor) <> 'string' then
        raise exception 'no es texto';
      end if;
      perform now() at time zone (new.valor #>> '{}');   -- falla si la zona no existe
    exception when others then
      raise exception 'configuracion_invalida: zona_horaria debe ser una zona horaria válida (ej. America/Argentina/Buenos_Aires)'
        using errcode = '23514';
    end;
  elsif new.clave = 'limite_consulta_codigo' then
    if coalesce((new.valor ->> 'fallos')::int, 0) <= 0 or coalesce((new.valor ->> 'segundos')::int, 0) <= 0 then
      raise exception 'configuracion_invalida: limite_consulta_codigo necesita fallos y segundos mayores que 0' using errcode = '23514';
    end if;
  elsif new.clave = 'evaluacion_cv_activa' then
    if jsonb_typeof(new.valor) <> 'boolean' then
      raise exception 'configuracion_invalida: evaluacion_cv_activa debe ser true o false' using errcode = '23514';
    end if;
  elsif new.clave = 'evaluacion_cv_umbral' then
    if jsonb_typeof(new.valor) <> 'number' then
      raise exception 'configuracion_invalida: evaluacion_cv_umbral debe ser un entero de 0 a 100' using errcode = '23514';
    end if;
    if (new.valor #>> '{}')::numeric not between 0 and 100 or (new.valor #>> '{}')::numeric <> trunc((new.valor #>> '{}')::numeric) then
      raise exception 'configuracion_invalida: evaluacion_cv_umbral debe ser un entero de 0 a 100' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

-- 2. Claves nuevas. Apagado por defecto: hasta que alguien lo encienda, el comportamiento es el de siempre.
insert into public.configuracion (clave, valor, descripcion) values
  ('evaluacion_cv_activa', 'false', 'Si es true, un candidato nuevo con puntaje de CV nulo o menor que el umbral va a revisión (motivo cv_dudoso). Nunca rechaza ni valida.'),
  ('evaluacion_cv_umbral', '60',    'Puntaje mínimo del CV (entero de 0 a 100). Por debajo, el caso va a revisión si la evaluación está activa.')
on conflict (clave) do nothing;

-- 3. registrar_referido con p_cv_puntaje opcional al final.
drop function if exists public.registrar_referido(text, text, text, text, text, public.tipo_especialidad, boolean,
  public.tipo_seniority, public.tipo_nivel_ingles, boolean, text);

create or replace function public.registrar_referido(
  p_codigo             text,
  p_nombre             text,
  p_apellido           text,
  p_email              text,
  p_linkedin_url       text,
  p_especialidad       public.tipo_especialidad,
  p_usa_revit          boolean,
  p_seniority          public.tipo_seniority,
  p_nivel_ingles       public.tipo_nivel_ingles,
  p_acepto_visibilidad boolean,
  p_cv_url             text default null,
  p_cv_puntaje         integer default null
) returns jsonb
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_email      text := public.normalizar_email(p_email);
  v_linkedin   text := public.normalizar_linkedin(p_linkedin_url);
  v_nombre     text := btrim(p_nombre);
  v_apellido   text := btrim(p_apellido);
  ref          public.referentes;
  cand         public.candidatos;
  red          public.referidos;
  v_resultado  text;
  v_repetido   boolean := false;
  v_motivos    text[] := '{}';
  v_alerta     jsonb;
  v_n          integer;
  v_bono_antes numeric;
  v_bono       numeric := 0;
  v_zona       text;
  v_validados  integer;
  v_hito       jsonb;
  v_proximo    jsonb;
  v_monto      numeric;
  v_ciclo      text;
  -- Evaluación del CV: el puntaje fuera de 0..100 se trata como nulo. v_cv_informado es lo que se devuelve (informativo).
  v_cv_puntaje   integer := case when p_cv_puntaje between 0 and 100 then p_cv_puntaje end;
  v_cv_informado integer;
begin
  -- 1. Normalización. El LinkedIn que no es un perfil reconocible se rechaza antes de tocar nada.
  if v_email is null or v_email not like '%_@_%' then
    raise exception 'email_invalido: el email no tiene un formato reconocible' using errcode = '23514';
  end if;
  if v_linkedin is null then
    raise exception 'linkedin_invalido: no es un perfil de LinkedIn reconocible' using errcode = '23514';
  end if;

  -- 2. El aviso de visibilidad se rechaza si no está aceptado; nunca se fija a true (decisión 20).
  if p_acepto_visibilidad is distinct from true then
    raise exception 'acepto_visibilidad_requerido: hay que aceptar el aviso de visibilidad' using errcode = '23514';
  end if;

  -- 3. Serializa el doble clic y los envíos simultáneos del mismo email o del mismo LinkedIn. Siempre en este orden
  --    (email, después LinkedIn), así que dos envíos no se pueden trabar entre sí. Cada sentencia siguiente ve lo que
  --    el envío anterior ya confirmó (READ COMMITTED).
  perform pg_advisory_xact_lock(hashtextextended('registrar_referido:email:' || v_email, 0));
  perform pg_advisory_xact_lock(hashtextextended('registrar_referido:linkedin:' || v_linkedin, 0));

  -- 4. Referente por código: tiene que existir, estar colocado y no estar sancionado (decisiones 1, 8 y 41).
  select * into ref from public.referentes where codigo_referido = lower(btrim(p_codigo));
  if ref.id is null or not ref.colocado or ref.sancionado_en is not null then
    return jsonb_build_object('resultado', 'codigo_invalido');
  end if;

  -- 5. Autorreferido (decisión 8): no se inserta nada y no queda rastro en la base.
  if v_email = ref.email or (ref.linkedin_url is not null and v_linkedin = ref.linkedin_url) then
    return jsonb_build_object('resultado', 'autorreferido');
  end if;

  -- 6. Candidato que ya estaba en la base (decisiones 6 y 7), por email o por LinkedIn.
  select * into cand from public.candidatos
   where email = v_email or linkedin_url = v_linkedin
   order by (email = v_email) desc
   limit 1;

  if cand.id is not null then
    select * into red from public.referidos
     where referente_id = ref.id and candidato_id = cand.id
     order by (estado <> 'descartado') desc, creado_en desc
     limit 1;

    if red.id is not null then
      -- Reintento del mismo referente: no se duplica nada (y el puntaje no se vuelve a evaluar).
      v_resultado := case when red.estado <> 'descartado' then 'registrado' else 'ya_registrado' end;
      v_repetido  := red.estado <> 'descartado';
    else
      -- Ya estaba en el pool (o lo trajo otro referente): no cuenta, queda descartado y sin pago.
      insert into public.referidos (referente_id, candidato_id, estado, motivos_revision)
      values (ref.id, cand.id, 'descartado', array['ya_en_pool'])
      returning * into red;
      v_resultado := 'ya_registrado';
    end if;

  else
    -- 7. Candidato nuevo: reglas que mandan el caso a revisión (decisión 9).
    if exists (select 1 from public.candidatos
                where lower(btrim(nombre)) = lower(v_nombre) and lower(btrim(apellido)) = lower(v_apellido)) then
      v_motivos := array_append(v_motivos, 'posible_duplicado');
    end if;

    select valor into v_alerta from public.configuracion where clave = 'alerta_volumen';
    if v_alerta is null then
      raise exception 'configuracion_faltante: alerta_volumen debe existir' using errcode = '23514';
    end if;
    select count(*) into v_n from public.referidos
     where referente_id = ref.id and estado <> 'descartado'
       and creado_en >= now() - make_interval(days => (v_alerta ->> 'dias')::integer);
    if v_n + 1 > (v_alerta ->> 'cantidad')::integer then   -- cuenta también al que se está registrando
      v_motivos := array_append(v_motivos, 'alerta_volumen');
    end if;

    if nullif(btrim(p_cv_url), '') is null then
      v_motivos := array_append(v_motivos, 'perfil_incompleto');
    end if;

    -- Evaluación del CV (solo suma un motivo; nunca valida, rechaza ni toca montos). Si la clave del interruptor no
    -- existe se trata como apagado; con el interruptor encendido, el umbral tiene que existir (config_numero falla fuerte).
    if coalesce((select valor = 'true'::jsonb from public.configuracion where clave = 'evaluacion_cv_activa'), false) then
      v_cv_informado := v_cv_puntaje;
      if v_cv_puntaje is null or v_cv_puntaje < public.config_numero('evaluacion_cv_umbral') then
        v_motivos := array_append(v_motivos, 'cv_dudoso');
      end if;
    end if;

    -- 8. Alta. es_prioritario es una columna generada: no se inserta.
    insert into public.candidatos (nombre, apellido, email, linkedin_url, especialidad, usa_revit, seniority,
                                   nivel_ingles, cv_url, acepto_visibilidad, origen)
    values (v_nombre, v_apellido, v_email, v_linkedin, p_especialidad, p_usa_revit, p_seniority,
            p_nivel_ingles, nullif(btrim(p_cv_url), ''), true, 'referido')
    returning * into cand;

    insert into public.referidos (referente_id, candidato_id) values (ref.id, cand.id) returning * into red;

    select coalesce(sum(monto_usd), 0) into v_bono_antes
      from public.movimientos_pago where referente_id = ref.id and concepto = 'bono_hito';

    if cardinality(v_motivos) = 0 then
      -- p_motivos NULL: pasar un array pisaría motivos_revision. Los pagos los crea el trigger al validar.
      red := public.cambiar_estado_referido(red.id, 'validado', 'sistema', null, 'validacion_automatica', null);
    else
      red := public.cambiar_estado_referido(red.id, 'en_revision', 'sistema', null,
                                            array_to_string(v_motivos, ', '), v_motivos);
    end if;

    select coalesce(sum(monto_usd), 0) - v_bono_antes into v_bono
      from public.movimientos_pago where referente_id = ref.id and concepto = 'bono_hito';
    v_resultado := 'registrado';
  end if;

  -- 9. Respuesta: todo calculado acá, n8n no recalcula nada (decisión 24).
  select coalesce(sum(monto_usd), 0) into v_monto from public.movimientos_pago where referido_id = red.id;
  select ciclo_pago into v_ciclo from public.movimientos_pago where referido_id = red.id and concepto = 'base';

  v_zona := public.config_texto('zona_horaria');
  select count(*)::integer into v_validados from public.referidos d
   where d.referente_id = ref.id and d.estado = 'validado'
     and extract(year from d.validado_en at time zone v_zona) = extract(year from now() at time zone v_zona);
  select h into v_hito
    from jsonb_array_elements((select valor from public.configuracion where clave = 'hitos')) h
   where (h ->> 'referidos')::integer > v_validados
   order by (h ->> 'referidos')::integer
   limit 1;
  if v_hito is not null then
    v_proximo := jsonb_build_object('referidos', (v_hito ->> 'referidos')::integer,
                                    'faltan', (v_hito ->> 'referidos')::integer - v_validados,
                                    'bono_usd', (v_hito ->> 'bono_usd')::numeric);
  end if;

  return jsonb_build_object(
    'resultado',      v_resultado,
    'repetido',       v_repetido,
    'referido_id',    red.id,
    'estado',         red.estado,
    'motivos',        to_jsonb(red.motivos_revision),
    'referente',      jsonb_build_object('nombre', ref.nombre, 'email', ref.email),
    -- en ya_registrado el candidato es el que se envió (el de la base puede ser otra persona o un registro previo)
    'candidato',      case when v_resultado = 'ya_registrado'
                        then jsonb_build_object('nombre', v_nombre, 'apellido', v_apellido, 'email', v_email)
                        else jsonb_build_object('nombre', cand.nombre, 'apellido', cand.apellido, 'email', cand.email) end,
    'monto_usd',      v_monto,
    'bono_hito_usd',  v_bono,
    'ciclo_pago',     v_ciclo,
    'validados_anio', v_validados,
    'proximo_hito',   v_proximo,
    -- Informativo: el puntaje válido que se evaluó (null si la evaluación está apagada, no es un candidato nuevo o venía inválido).
    'cv_puntaje',     v_cv_informado
  );
end $$;

-- Solo la service role (n8n). Supabase concede execute por defecto a anon y authenticated en las funciones nuevas.
revoke execute on function public.registrar_referido(text, text, text, text, text, public.tipo_especialidad, boolean,
  public.tipo_seniority, public.tipo_nivel_ingles, boolean, text, integer) from public, anon, authenticated;
grant execute on function public.registrar_referido(text, text, text, text, text, public.tipo_especialidad, boolean,
  public.tipo_seniority, public.tipo_nivel_ingles, boolean, text, integer) to service_role;
