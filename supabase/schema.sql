-- =====================================================================
-- schema.sql — Programa de referidos de talento (WorldTeams)
-- Fuente de verdad: DECISIONS.md (decisiones 2, 5-12, 14-17, 19-20 y "Especificación del modelo de datos").
--
-- Principios (CLAUDE.md, regla 5): las garantías viven acá, en la base.
--   · Unicidad e idempotencia: restricciones únicas, no código.
--   · Permisos: RLS en todas las tablas; solo n8n (service role) escribe.
--   · Montos y umbrales: se leen siempre de `configuracion`, nada hardcodeado.
--
-- Orden: tipos -> funciones de normalización -> tablas -> triggers y reglas -> funciones de negocio
--        -> vistas -> RLS y permisos -> storage.
-- Se aplica una sola vez, completo y en una transacción (no es re-ejecutable).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tipos
-- ---------------------------------------------------------------------
create type public.tipo_especialidad  as enum ('arquitectura', 'ingenieria');
create type public.tipo_seniority     as enum ('junior', 'semi_senior', 'senior');
create type public.tipo_nivel_ingles  as enum ('basico', 'intermedio', 'avanzado', 'nativo');
-- Estados del referido (decisión 15 y especificación; rechazado -> en_revision se agrega en panel_resolver.sql, decisión 63): inicio -> descartado | registrado;
-- registrado -> validado | en_revision; en_revision -> validado | rechazado. Finales: validado, rechazado, descartado.
create type public.tipo_estado_referido as enum ('registrado', 'validado', 'en_revision', 'rechazado', 'descartado');
create type public.tipo_actor         as enum ('sistema', 'reclutamiento');
create type public.tipo_concepto_pago as enum ('base', 'extra_prioritario', 'bono_hito');
create type public.tipo_estado_pago   as enum ('pendiente', 'pagado', 'cancelado_sancion');
create type public.tipo_metodo_pago   as enum ('liquidacion_sueldo', 'transferencia');

-- ---------------------------------------------------------------------
-- 2. Normalización (decisión 7): email en minúsculas y sin espacios; LinkedIn en una única forma canónica.
--    Espejo en SQL de `normalizarLinkedin` de app/lib/esquema.ts.
-- ---------------------------------------------------------------------
create function public.normalizar_email(p_email text)
returns text language sql immutable strict
as $$ select lower(btrim(p_email)) $$;

-- Devuelve 'https://www.linkedin.com/in/<usuario>' o null si no es un perfil de LinkedIn reconocible.
create function public.normalizar_linkedin(p_url text)
returns text language sql immutable strict
as $$
  select 'https://www.linkedin.com/in/' || m[1]
  from (select regexp_match(
          lower(btrim(p_url)),
          '^(?:https?://)?(?:[a-z0-9-]+\.)?linkedin\.com/(?:in|pub)/([^/?#[:space:]]+)'
        ) as m) x
  where m is not null
$$;

-- ---------------------------------------------------------------------
-- 3. Tablas
-- ---------------------------------------------------------------------

-- Configuración editable (decisión 17): clave/valor, sin versiones.
create table public.configuracion (
  clave          text primary key check (clave ~ '^[a-z0-9_]+$'),
  valor          jsonb not null,
  descripcion    text,
  actualizado_en timestamptz not null default now(),
  actualizado_por text
);

-- Personas de reclutamiento autorizadas al panel (decisión 18).
create table public.equipo_reclutamiento (
  id     uuid primary key default gen_random_uuid(),
  email  text not null unique check (email = public.normalizar_email(email) and email like '%_@_%'),
  nombre text not null check (btrim(nombre) <> ''),
  activo boolean not null default true
);

-- Referentes: profesionales colocados que cargan WorldTeams (decisión 1).
create table public.referentes (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null check (btrim(nombre) <> ''),
  apellido       text not null check (btrim(apellido) <> ''),
  email          text not null unique check (email = public.normalizar_email(email) and email like '%_@_%'),
  linkedin_url   text check (linkedin_url = public.normalizar_linkedin(linkedin_url)),
  -- Decisión 2: nombre normalizado + sufijo aleatorio base36 de 8 caracteres (ej. lucia-k7q2m9xd).
  -- Se genera una sola vez (trigger) y no se reutiliza; el formato se valida acá y en la app.
  codigo_referido text not null unique
    check (codigo_referido ~ '^[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]{8}$' and length(codigo_referido) <= 64),
  colocado       boolean not null default true,
  -- Sanción (decisión 8): un sancionado no abre referidos nuevos ni genera movimientos nuevos. Lo marca sancionar_referente().
  sancionado_en  timestamptz,
  auth_user_id   uuid unique references auth.users (id) on delete set null,
  creado_en      timestamptz not null default now()
);

-- Candidatos: representa el talent pool (supuesto en DECISIONS.md).
create table public.candidatos (
  id                 uuid primary key default gen_random_uuid(),
  nombre             text not null check (btrim(nombre) <> ''),
  apellido           text not null check (btrim(apellido) <> ''),
  email              text not null unique check (email = public.normalizar_email(email) and email like '%_@_%'),
  linkedin_url       text not null unique check (linkedin_url = public.normalizar_linkedin(linkedin_url)),
  especialidad       public.tipo_especialidad not null,
  usa_revit          boolean not null,
  seniority          public.tipo_seniority not null,
  nivel_ingles       public.tipo_nivel_ingles not null,
  cv_url             text,                       -- ruta dentro del bucket privado `cvs`
  acepto_visibilidad boolean not null default false,
  origen             text not null default 'referido' check (origen in ('referido', 'directo')),
  creado_en          timestamptz not null default now(),
  -- Perfil prioritario (decisión 12): arquitectura, con Revit, senior, inglés avanzado o nativo.
  es_prioritario     boolean generated always as (
    especialidad = 'arquitectura' and usa_revit and seniority = 'senior' and nivel_ingles in ('avanzado', 'nativo')
  ) stored,
  -- Quien llega por un referido tiene que haber aceptado el aviso de visibilidad (decisión 20).
  constraint candidato_referido_acepto check (origen <> 'referido' or acepto_visibilidad)
);

-- Referidos: un candidato atribuido al referente cuyo link usó (decisión 7).
create table public.referidos (
  id               uuid primary key default gen_random_uuid(),
  referente_id     uuid not null references public.referentes (id) on delete restrict,
  candidato_id     uuid not null references public.candidatos (id) on delete restrict,
  estado           public.tipo_estado_referido not null default 'registrado',
  -- Motivos de revisión (en_revision) o de descarte (descartado: ya_en_pool, duplicado, autorreferido).
  motivos_revision text[] not null default '{}',
  validado_en      timestamptz,
  creado_en        timestamptz not null default now(),
  constraint referido_validado_en check ((estado = 'validado') = (validado_en is not null))
);
-- Un candidato tiene a lo sumo un referido vigente: el premio va a un solo referente (decisión 7).
create unique index referidos_candidato_vigente_uk on public.referidos (candidato_id) where estado <> 'descartado';
create index referidos_referente_idx on public.referidos (referente_id, estado);

-- Historial de estados, solo inserción (decisión 15).
create table public.historial_estados (
  id              bigint generated always as identity primary key,
  referido_id     uuid not null references public.referidos (id) on delete restrict,
  estado_anterior public.tipo_estado_referido,
  estado_nuevo    public.tipo_estado_referido not null,
  actor_tipo      public.tipo_actor not null default 'sistema',
  actor_id        uuid,
  motivo          text,
  creado_en       timestamptz not null default now()
);
create index historial_referido_idx on public.historial_estados (referido_id, creado_en);

-- Libro de movimientos de pago (decisión 16): cada monto es una fila, con el monto copiado de la configuración.
create table public.movimientos_pago (
  id                uuid primary key default gen_random_uuid(),
  referente_id      uuid not null references public.referentes (id) on delete restrict,
  referido_id       uuid references public.referidos (id) on delete restrict,   -- null en los bonos por hito
  concepto          public.tipo_concepto_pago not null,
  hito_umbral       integer check (hito_umbral > 0),
  periodo_hito      integer check (periodo_hito between 2000 and 2100),         -- año calendario del hito
  monto_usd         numeric(10, 2) not null check (monto_usd > 0),
  estado            public.tipo_estado_pago not null default 'pendiente',
  ciclo_pago        text not null check (ciclo_pago ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),  -- 'AAAA-MM' del mes de liquidación
  metodo_pago       public.tipo_metodo_pago not null,
  preferencia_cobro text not null default 'efectivo',                           -- previsto para la segunda etapa
  pagado_en         timestamptz,
  creado_en         timestamptz not null default now(),
  constraint movimiento_forma check (
    (concepto = 'bono_hito' and referido_id is null and hito_umbral is not null and periodo_hito is not null)
    or (concepto <> 'bono_hito' and referido_id is not null and hito_umbral is null and periodo_hito is null)
  ),
  constraint movimiento_pagado_en check ((estado = 'pagado') = (pagado_en is not null)),
  -- Idempotencia (decisión 16): un mismo concepto no se paga dos veces por referido, ni un hito dos veces por año.
  constraint movimiento_referido_concepto_uk unique (referido_id, concepto),
  constraint movimiento_hito_uk unique (referente_id, hito_umbral, periodo_hito)
);
create index movimientos_referente_idx on public.movimientos_pago (referente_id, estado);
create index movimientos_ciclo_idx on public.movimientos_pago (ciclo_pago, estado);

-- ---------------------------------------------------------------------
-- 4. Funciones de apoyo
-- ---------------------------------------------------------------------

-- Lee una clave de configuración numérica; falla fuerte si falta (mejor frenar que pagar mal).
create function public.config_numero(p_clave text)
returns numeric language plpgsql stable
as $$
declare v jsonb;
begin
  select valor into v from public.configuracion where clave = p_clave;
  if v is null or jsonb_typeof(v) <> 'number' then
    raise exception 'configuracion_faltante: % debe existir y ser un número', p_clave using errcode = '23514';
  end if;
  return (v #>> '{}')::numeric;
end $$;

-- Lee una clave de configuración de texto (ej. zona_horaria); falla fuerte si falta.
create function public.config_texto(p_clave text)
returns text language plpgsql stable
as $$
declare v jsonb;
begin
  select valor into v from public.configuracion where clave = p_clave;
  if v is null or jsonb_typeof(v) <> 'string' then
    raise exception 'configuracion_faltante: % debe existir y ser un texto', p_clave using errcode = '23514';
  end if;
  return v #>> '{}';
end $$;

-- Sufijo aleatorio base36 de 8 caracteres. La fuente es gen_random_uuid() (generador criptográfico de Postgres);
-- se descartan los bytes >= 252 para que los 36 caracteres sean igual de probables (sin sesgo de módulo).
create function public.generar_sufijo_codigo()
returns text language plpgsql volatile
as $$
declare
  alfabeto constant text := '0123456789abcdefghijklmnopqrstuvwxyz';
  resultado text := '';
  bytes bytea;
  i integer;
  b integer;
begin
  while length(resultado) < 8 loop
    bytes := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
    -- Los bytes 6 y 8 de un UUID v4 llevan bits fijos de versión y variante: se saltean.
    foreach i in array array[0, 1, 2, 3, 4, 5, 9, 10, 11, 12, 13, 14, 15] loop
      b := get_byte(bytes, i);
      if b < 252 and length(resultado) < 8 then
        resultado := resultado || substr(alfabeto, (b % 36) + 1, 1);
      end if;
    end loop;
  end loop;
  return resultado;
end $$;

create function public.generar_codigo_referido(p_nombre text)
returns text language plpgsql volatile
as $$
declare
  base text;
  codigo text;
begin
  base := regexp_replace(
            translate(lower(btrim(p_nombre)), 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc'),
            '[^a-z0-9]+', '-', 'g');
  base := coalesce(nullif(left(btrim(base, '-'), 40), ''), 'ref');
  loop
    codigo := base || '-' || public.generar_sufijo_codigo();
    exit when not exists (select 1 from public.referentes where codigo_referido = codigo);
  end loop;
  return codigo;
end $$;

-- ¿La persona que hace la consulta es de reclutamiento? Usa el email verificado del JWT (magic link).
create function public.es_reclutamiento()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.equipo_reclutamiento e
    where e.activo and e.email = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  )
$$;

-- Id del referente que hace la consulta, o null. Toma el usuario de Auth (auth.uid()) y, si el referente todavía
-- no está vinculado, el email verificado del JWT (magic link). Es lo que usan la RLS y las vistas del portal.
create function public.referente_actual_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select r.id from public.referentes r
  where r.auth_user_id = auth.uid()
     or r.email = lower(btrim(coalesce(auth.jwt() ->> 'email', '')))
  order by (r.auth_user_id = auth.uid()) desc nulls last   -- si hubiera dos coincidencias, gana el usuario de Auth
  limit 1
$$;

-- ---------------------------------------------------------------------
-- 5. Triggers: normalización y reglas de integridad
-- ---------------------------------------------------------------------

create function public.trg_normalizar_email() returns trigger language plpgsql as $$
begin
  new.email := public.normalizar_email(new.email);
  return new;
end $$;

create function public.trg_normalizar_contacto() returns trigger language plpgsql as $$
begin
  new.email := public.normalizar_email(new.email);
  if new.linkedin_url is not null then
    new.linkedin_url := public.normalizar_linkedin(new.linkedin_url);
    if new.linkedin_url is null then
      raise exception 'linkedin_invalido: no es un perfil de LinkedIn reconocible' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger equipo_normalizar before insert or update on public.equipo_reclutamiento
  for each row execute function public.trg_normalizar_email();
create trigger referentes_normalizar before insert or update on public.referentes
  for each row execute function public.trg_normalizar_contacto();
create trigger candidatos_normalizar before insert or update on public.candidatos
  for each row execute function public.trg_normalizar_contacto();

-- El código se genera si no viene y no se puede cambiar después (decisión 2: "una sola vez, no se reutiliza").
create function public.trg_referente_codigo() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.codigo_referido := coalesce(new.codigo_referido, public.generar_codigo_referido(new.nombre));
  elsif new.codigo_referido is distinct from old.codigo_referido then
    raise exception 'codigo_inmutable: el código de referido no se puede cambiar' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger referentes_codigo before insert or update on public.referentes
  for each row execute function public.trg_referente_codigo();

-- Validación de la configuración: un valor roto bloquearía los pagos, así que se rechaza al guardarlo.
create function public.trg_configuracion_validar() returns trigger language plpgsql as $$
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
  end if;
  return new;
end $$;
create trigger configuracion_validar before insert or update on public.configuracion
  for each row execute function public.trg_configuracion_validar();

-- Reglas del referido: estado inicial, transiciones permitidas, autorreferido y referente colocado.
create function public.trg_referido_reglas() returns trigger language plpgsql as $$
declare
  r public.referentes;
  c public.candidatos;
begin
  if tg_op = 'INSERT' then
    if new.estado not in ('registrado', 'descartado') then
      raise exception 'estado_inicial_invalido: un referido nace registrado o descartado' using errcode = '23514';
    end if;
    select * into r from public.referentes where id = new.referente_id;
    if not r.colocado then
      raise exception 'referente_no_colocado: solo los colocados pueden referir (decisión 1)' using errcode = '23514';
    end if;
    if r.sancionado_en is not null then
      raise exception 'referente_sancionado: un referente sancionado no abre referidos nuevos (decisión 8)' using errcode = '23514';
    end if;
    if new.estado <> 'descartado' then
      select * into c from public.candidatos where id = new.candidato_id;
      if c.email = r.email or (r.linkedin_url is not null and c.linkedin_url = r.linkedin_url) then
        raise exception 'autorreferido: el candidato es el propio referente (decisión 8)' using errcode = '23514';
      end if;
    end if;
  else
    if new.referente_id <> old.referente_id or new.candidato_id <> old.candidato_id then
      raise exception 'referido_inmutable: no se puede cambiar el referente ni el candidato' using errcode = '23514';
    end if;
    if new.estado <> old.estado then
      if not ((old.estado = 'registrado'  and new.estado in ('validado', 'en_revision'))
           or (old.estado = 'en_revision' and new.estado in ('validado', 'rechazado'))) then
        raise exception 'transicion_invalida: % -> % no está permitida', old.estado, new.estado using errcode = '23514';
      end if;
      if new.estado = 'validado' then
        new.validado_en := now();
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger referidos_reglas before insert or update on public.referidos
  for each row execute function public.trg_referido_reglas();

-- Historial automático de cada alta y cada cambio de estado. El actor y el motivo llegan por
-- variables de sesión que fija cambiar_estado_referido(); sin ellas, actor = sistema.
create function public.trg_referido_historial() returns trigger language plpgsql as $$
begin
  insert into public.historial_estados (referido_id, estado_anterior, estado_nuevo, actor_tipo, actor_id, motivo)
  values (
    new.id,
    case when tg_op = 'UPDATE' then old.estado end,
    new.estado,
    coalesce(nullif(current_setting('app.actor_tipo', true), ''), 'sistema')::public.tipo_actor,
    nullif(current_setting('app.actor_id', true), '')::uuid,
    coalesce(nullif(current_setting('app.motivo', true), ''), nullif(array_to_string(new.motivos_revision, ', '), ''))
  );
  return null;
end $$;
create trigger referidos_historial_alta after insert on public.referidos
  for each row execute function public.trg_referido_historial();
create trigger referidos_historial_cambio after update of estado on public.referidos
  for each row when (old.estado is distinct from new.estado) execute function public.trg_referido_historial();

-- El historial es de solo inserción (decisión 15).
create function public.trg_historial_solo_insercion() returns trigger language plpgsql as $$
begin
  raise exception 'historial_solo_insercion: el historial de estados no se modifica ni se borra' using errcode = '23514';
end $$;
create trigger historial_no_modificar before update or delete on public.historial_estados
  for each row execute function public.trg_historial_solo_insercion();
create trigger historial_no_vaciar before truncate on public.historial_estados
  for each statement execute function public.trg_historial_solo_insercion();

-- Movimientos: el monto y el concepto se fijan al crearse; solo un movimiento pendiente puede cambiar de estado.
create function public.trg_movimiento_reglas() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and exists (select 1 from public.referentes where id = new.referente_id and sancionado_en is not null) then
    raise exception 'referente_sancionado: un referente sancionado no genera movimientos nuevos (decisión 8)' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then
    if new.referente_id <> old.referente_id
       or new.referido_id is distinct from old.referido_id
       or new.concepto <> old.concepto
       or new.hito_umbral is distinct from old.hito_umbral
       or new.periodo_hito is distinct from old.periodo_hito
       or new.monto_usd <> old.monto_usd then
      raise exception 'movimiento_inmutable: el monto y el concepto se fijan al crear el movimiento' using errcode = '23514';
    end if;
    if old.estado <> 'pendiente' then
      raise exception 'movimiento_cerrado: un movimiento % no se puede modificar', old.estado using errcode = '23514';
    end if;
  end if;
  if new.estado = 'pagado' and new.pagado_en is null then
    new.pagado_en := now();
  end if;
  return new;
end $$;
create trigger movimientos_reglas before insert or update on public.movimientos_pago
  for each row execute function public.trg_movimiento_reglas();

-- ---------------------------------------------------------------------
-- 6. Funciones de negocio (las llama n8n con la service role)
-- ---------------------------------------------------------------------

-- Cambia el estado de un referido dejando actor y motivo en el historial, en una sola transacción.
create function public.cambiar_estado_referido(
  p_referido    uuid,
  p_estado      public.tipo_estado_referido,
  p_actor_tipo  public.tipo_actor default 'sistema',
  p_actor_id    uuid default null,
  p_motivo      text default null,
  p_motivos     text[] default null
) returns public.referidos language plpgsql as $$
declare resultado public.referidos;
begin
  perform set_config('app.actor_tipo', p_actor_tipo::text, true);
  perform set_config('app.actor_id', coalesce(p_actor_id::text, ''), true);
  perform set_config('app.motivo', coalesce(p_motivo, ''), true);
  update public.referidos
     set estado = p_estado,
         motivos_revision = coalesce(p_motivos, motivos_revision)
   where id = p_referido
   returning * into resultado;
  perform set_config('app.actor_tipo', '', true);
  perform set_config('app.actor_id', '', true);
  perform set_config('app.motivo', '', true);
  if resultado.id is null then
    raise exception 'referido_inexistente: %', p_referido using errcode = 'P0002';
  end if;
  return resultado;
end $$;

-- Crea los movimientos de pago de un referido validado, con los montos de `configuracion` (decisiones 11, 12, 14, 16).
-- Es idempotente: las restricciones únicas hacen que repetirla no duplique nada.
create function public.crear_movimientos_validacion(p_referido uuid)
returns integer language plpgsql as $$
declare
  r public.referidos;
  ref public.referentes;
  cand public.candidatos;
  v_base numeric := public.config_numero('monto_base_usd');
  v_mult numeric := public.config_numero('multiplicador_prioritario');
  v_corte integer := public.config_numero('dia_corte_pago')::integer;
  v_zona text := public.config_texto('zona_horaria');
  v_dia date;
  v_ciclo text;
  v_metodo public.tipo_metodo_pago;
  v_anio integer;
  v_validados integer;
  h jsonb;
  v_creados integer := 0;
  v_n integer;
begin
  select * into r from public.referidos where id = p_referido;
  if r.id is null or r.estado <> 'validado' then
    raise exception 'referido_no_validado: solo un referido validado genera movimientos' using errcode = '23514';
  end if;
  select * into ref from public.referentes where id = r.referente_id;
  -- Un referente sancionado no genera movimientos nuevos (decisión 8); el referido igual queda validado.
  if ref.sancionado_en is not null then
    return 0;
  end if;
  select * into cand from public.candidatos where id = r.candidato_id;

  -- Mensual con fecha de corte (decisión 11), en la zona horaria de la configuración: hasta el día de corte entra
  -- en el ciclo del mes; después, en el siguiente.
  -- Referente que dejó de estar colocado: cobra por transferencia en el mismo ciclo (decisión 14).
  v_dia := (r.validado_en at time zone v_zona)::date;
  v_ciclo := to_char(case when extract(day from v_dia) <= v_corte then v_dia else v_dia + interval '1 month' end, 'YYYY-MM');
  v_metodo := case when ref.colocado then 'liquidacion_sueldo' else 'transferencia' end;

  insert into public.movimientos_pago (referente_id, referido_id, concepto, monto_usd, ciclo_pago, metodo_pago)
  values (r.referente_id, r.id, 'base', v_base, v_ciclo, v_metodo)
  on conflict do nothing;
  get diagnostics v_n = row_count;
  v_creados := v_creados + v_n;

  if cand.es_prioritario then
    insert into public.movimientos_pago (referente_id, referido_id, concepto, monto_usd, ciclo_pago, metodo_pago)
    values (r.referente_id, r.id, 'extra_prioritario', v_base * (v_mult - 1), v_ciclo, v_metodo)
    on conflict do nothing;
    get diagnostics v_n = row_count;
    v_creados := v_creados + v_n;
  end if;

  -- Bonos por hitos del año calendario (decisión 12): acumulativos, uno por umbral y por año.
  v_anio := extract(year from r.validado_en at time zone v_zona)::integer;
  select count(*) into v_validados
    from public.referidos d
   where d.referente_id = r.referente_id and d.estado = 'validado'
     and extract(year from d.validado_en at time zone v_zona) = v_anio;
  for h in select * from jsonb_array_elements((select valor from public.configuracion where clave = 'hitos')) loop
    if v_validados >= (h ->> 'referidos')::integer then
      insert into public.movimientos_pago (referente_id, concepto, hito_umbral, periodo_hito, monto_usd, ciclo_pago, metodo_pago)
      values (r.referente_id, 'bono_hito', (h ->> 'referidos')::integer, v_anio, (h ->> 'bono_usd')::numeric, v_ciclo, v_metodo)
      on conflict do nothing;
      get diagnostics v_n = row_count;
      v_creados := v_creados + v_n;
    end if;
  end loop;
  return v_creados;
end $$;

create function public.trg_referido_movimientos() returns trigger language plpgsql as $$
begin
  perform public.crear_movimientos_validacion(new.id);
  return null;
end $$;
create trigger referidos_movimientos after update of estado on public.referidos
  for each row when (new.estado = 'validado' and old.estado is distinct from new.estado)
  execute function public.trg_referido_movimientos();

-- Sanción (decisión 8): marca al referente (sancionado_en), cancela sus movimientos pendientes y no toca lo ya pagado
-- ni el estado de sus referidos. Devuelve cuántos movimientos canceló. Repetirla no cambia la fecha original.
create function public.sancionar_referente(p_referente uuid)
returns integer language plpgsql as $$
declare v_cancelados integer;
begin
  update public.referentes set sancionado_en = coalesce(sancionado_en, now()) where id = p_referente;
  if not found then
    raise exception 'referente_inexistente: %', p_referente using errcode = 'P0002';
  end if;
  update public.movimientos_pago set estado = 'cancelado_sancion'
   where referente_id = p_referente and estado = 'pendiente';
  get diagnostics v_cancelados = row_count;
  return v_cancelados;
end $$;

-- ---------------------------------------------------------------------
-- 7. Vistas
-- ---------------------------------------------------------------------

-- Progreso del referente en el año calendario (decisión 19). La vista corre con los permisos de su dueño para poder
-- contar referidos que el referente no puede leer en crudo (decisión 20), y se limita sola a su propio id.
create view public.v_progreso_referente with (security_invoker = false) as
select
  r.id as referente_id,
  extract(year from now() at time zone public.config_texto('zona_horaria'))::integer as anio,
  v.validados as validados_anio,
  p.referidos as proximo_hito,
  p.bono_usd as proximo_bono_usd,
  case when p.referidos is null then 0 else p.referidos - v.validados end as faltan
from public.referentes r
cross join lateral (
  select count(*)::integer as validados
    from public.referidos d
   where d.referente_id = r.id and d.estado = 'validado'
     and extract(year from d.validado_en at time zone public.config_texto('zona_horaria'))
         = extract(year from now() at time zone public.config_texto('zona_horaria'))
) v
left join lateral (
  select (h ->> 'referidos')::integer as referidos, (h ->> 'bono_usd')::numeric as bono_usd
    from jsonb_array_elements((select valor from public.configuracion where clave = 'hitos')) h
   where (h ->> 'referidos')::integer > v.validados
   order by (h ->> 'referidos')::integer
   limit 1
) p on true
where r.id = public.referente_actual_id() or public.es_reclutamiento();

-- Lo que el referente ve de sus referidos: nombre completo y estado, nada más (decisión 20).
-- Rechazados y descartados se muestran como "no_avanzo".
create view public.v_mis_referidos with (security_invoker = false) as
select
  d.id as referido_id,
  d.referente_id,
  c.nombre,
  c.apellido,
  case when d.estado in ('rechazado', 'descartado') then 'no_avanzo' else d.estado::text end as estado_visible,
  d.creado_en
from public.referidos d
join public.candidatos c on c.id = d.candidato_id
where d.referente_id = public.referente_actual_id();

-- Cierre mensual (decisión 25): movimientos pendientes por ciclo, referente y método de pago. Solo la service role (n8n).
create view public.v_cierre_ciclo with (security_invoker = true) as
select
  m.ciclo_pago,
  m.referente_id,
  r.nombre,
  r.apellido,
  r.email,
  m.metodo_pago,
  count(*)::integer as cantidad_movimientos,
  sum(m.monto_usd) as total_usd,
  string_agg(m.concepto::text, ', ' order by m.concepto::text) as conceptos
from public.movimientos_pago m
join public.referentes r on r.id = m.referente_id
where m.estado = 'pendiente'
group by m.ciclo_pago, m.referente_id, r.nombre, r.apellido, r.email, m.metodo_pago;

-- ---------------------------------------------------------------------
-- 8. RLS y permisos (decisiones 19, 20 y regla 7 de CLAUDE.md)
--    Solo n8n (service role) escribe. Los demás leen según su rol:
--      referente     -> lo suyo, y solo por las vistas v_progreso_referente / v_mis_referidos / sus movimientos
--      reclutamiento -> candidatos, referidos, historial, movimientos y referentes
--      anónimo       -> solo `configuracion` (montos y plazos públicos de la landing)
-- ---------------------------------------------------------------------
alter table public.configuracion         enable row level security;
alter table public.equipo_reclutamiento  enable row level security;
alter table public.referentes            enable row level security;
alter table public.candidatos            enable row level security;
alter table public.referidos             enable row level security;
alter table public.historial_estados     enable row level security;
alter table public.movimientos_pago      enable row level security;

create policy configuracion_lectura on public.configuracion
  for select to anon, authenticated using (true);
create policy referentes_lectura on public.referentes
  for select to authenticated using (id = public.referente_actual_id() or public.es_reclutamiento());
create policy candidatos_lectura on public.candidatos
  for select to authenticated using (public.es_reclutamiento());
create policy referidos_lectura on public.referidos
  for select to authenticated using (public.es_reclutamiento());
create policy historial_lectura on public.historial_estados
  for select to authenticated using (public.es_reclutamiento());
create policy movimientos_lectura on public.movimientos_pago
  for select to authenticated using (referente_id = public.referente_actual_id() or public.es_reclutamiento());
-- equipo_reclutamiento: sin políticas, no se lee por la API (la consulta pasa por es_reclutamiento()).

-- Permisos explícitos: se parte de cero y se concede solo lo necesario (la RLS es la segunda barrera).
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

grant select on public.configuracion to anon, authenticated;
grant select on public.referentes, public.candidatos, public.referidos,
                public.historial_estados, public.movimientos_pago to authenticated;
grant select on public.v_progreso_referente, public.v_mis_referidos to authenticated;
-- Historial de solo inserción también por permisos, además del trigger.
revoke update, delete, truncate on public.historial_estados from service_role;

-- Funciones: las de negocio solo las llama n8n; las dos de RLS las necesita quien consulta.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.es_reclutamiento(), public.referente_actual_id() to authenticated, service_role;
-- Las vistas del portal llaman a config_texto(), y las funciones de una vista corren con los permisos de quien consulta
-- (no del dueño de la vista). Solo lee configuracion, que ya es pública.
grant execute on function public.config_texto(text) to authenticated;
grant execute on all functions in schema public to service_role;

-- ---------------------------------------------------------------------
-- 9. Storage: bucket privado para CVs (PDF, hasta 5 MB = config cvMaxMb de la app)
--    Escribe n8n con la service role; reclutamiento lee desde el panel.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cvs', 'cvs', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy cvs_lectura_reclutamiento on storage.objects
  for select to authenticated using (bucket_id = 'cvs' and public.es_reclutamiento());
