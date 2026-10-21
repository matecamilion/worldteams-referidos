-- =====================================================================
-- consulta_referente.sql — Consulta del link de referido desde la landing (decisiones 2 y 41)
-- Se aplica DESPUÉS de schema.sql y seed.sql. Es re-ejecutable.
--
-- Hace tres cosas:
--   1. Sufijo del código a 8 caracteres base36 (36^8 ≈ 2,8 billones): ALTER del CHECK, nueva generación
--      y regeneración de los códigos que ya existían con 6 (los del seed).
--   2. Dos tablas privadas: `secretos_internos` (el secreto de aplicación) e `intentos_consulta_codigo`.
--   3. La función consultar_referente_por_codigo(codigo, ip, secreto), la única puerta por la que la
--      landing (rol anónimo) puede buscar a un referente sin que la tabla `referentes` quede expuesta.
--
-- El secreto NO está en este archivo: se carga aparte (ver el comando que se entregó fuera del repo).
-- Mientras no esté cargado, la función responde `no_autorizado` a todo: es el estado seguro por defecto.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Sufijo de 8 caracteres (decisión 2)
-- ---------------------------------------------------------------------
create or replace function public.generar_sufijo_codigo()
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

-- El código no se puede cambiar (trigger referentes_codigo); esta migración lo desactiva solo durante la regeneración.
alter table public.referentes drop constraint if exists referentes_codigo_referido_check;
alter table public.referentes disable trigger referentes_codigo;

-- Los referentes de ejemplo conservan códigos fijos (los mismos que app/lib/demo-data.ts); cualquier otro que
-- todavía tenga el formato de 6 caracteres recibe un código nuevo al azar.
update public.referentes r
   set codigo_referido = v.codigo
  from (values
    ('matecamilion05+lucia@gmail.com',  'lucia-k7q2m9xd'),
    ('matecamilion05+martin@gmail.com', 'martin-x4d8w1bn'),
    ('matecamilion05+camila@gmail.com', 'camila-p3n6z5ht'),
    ('matecamilion05+andres@gmail.com', 'andres-m2w5q8vc')
  ) as v(email, codigo)
 where r.email = v.email
   and r.codigo_referido !~ '^[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]{8}$';
update public.referentes
   set codigo_referido = public.generar_codigo_referido(nombre)
 where codigo_referido !~ '^[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]{8}$';

alter table public.referentes enable trigger referentes_codigo;
alter table public.referentes add constraint referentes_codigo_referido_check
  check (codigo_referido ~ '^[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]{8}$' and length(codigo_referido) <= 64);

-- ---------------------------------------------------------------------
-- 2. Tablas privadas (sin políticas ni permisos para anon ni authenticated: solo las toca la función)
-- ---------------------------------------------------------------------

-- Secretos de aplicación. 'consulta_codigo' es el que usa el servidor de la landing (decisión 41).
create table if not exists public.secretos_internos (
  clave          text primary key,
  valor          text not null check (length(valor) >= 32),
  actualizado_en timestamptz not null default now()
);

-- Códigos inexistentes que probó cada IP (la IP del usuario final, informada por el servidor de la landing con el secreto).
create table if not exists public.intentos_consulta_codigo (
  ip        text not null check (length(ip) <= 64),
  codigo    text not null check (length(codigo) <= 64),
  creado_en timestamptz not null default now(),
  primary key (ip, codigo)
);
create index if not exists intentos_consulta_codigo_creado_idx on public.intentos_consulta_codigo (creado_en);

alter table public.secretos_internos        enable row level security;
alter table public.intentos_consulta_codigo enable row level security;
revoke all on public.secretos_internos, public.intentos_consulta_codigo from anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Consulta del link (decisión 41)
-- ---------------------------------------------------------------------
-- Devuelve siempre UNA fila:
--   estado = 'ok'            -> nombre, apellido y codigo_referido (referente colocado y no sancionado)
--   estado = 'no_existe'     -> código inexistente, con formato inválido, de alguien no colocado o sancionado
--                               (los casos se confunden a propósito: no se revela quién existe pero está inactivo)
--   estado = 'bloqueada'     -> esa IP ya probó demasiados códigos distintos que no existen (configuracion.limite_consulta_codigo)
--   estado = 'no_autorizado' -> el secreto no coincide o no está cargado
--
-- Seguridad: la clave anónima es pública, así que cualquiera puede llamar a esta función. SIN el secreto correcto la
-- función no consulta nada, no guarda nada y NO usa la IP que se le pase ni ningún encabezado de la petición (x-forwarded-for
-- lo puede inventar el cliente): responde 'no_autorizado' siempre, incluso para un código válido, así que no sirve para probar
-- códigos ni para llenar la tabla de intentos. Con el secreto (solo el servidor de la landing lo tiene) se confía en la IP
-- que informa el servidor y se aplica el límite por IP.
create or replace function public.consultar_referente_por_codigo(
  p_codigo  text,
  p_ip      text default null,
  p_secreto text default null
) returns table (estado text, nombre text, apellido text, codigo_referido text)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_secreto text;
  v_ip      text;
  v_codigo  text;
  v_limite  jsonb;
  v_max     integer;
  v_seg     integer;
  v_fallos  integer;
  v_ref     record;
begin
  select s.valor into v_secreto from public.secretos_internos s where s.clave = 'consulta_codigo';
  if p_secreto is null or v_secreto is null or p_secreto is distinct from v_secreto then
    return query select 'no_autorizado'::text, null::text, null::text, null::text;
    return;
  end if;

  select c.valor into v_limite from public.configuracion c where c.clave = 'limite_consulta_codigo';
  if v_limite is null then
    raise exception 'configuracion_faltante: limite_consulta_codigo' using errcode = '23514';
  end if;
  v_max := (v_limite ->> 'fallos')::integer;
  v_seg := (v_limite ->> 'segundos')::integer;

  v_ip := left(coalesce(nullif(btrim(p_ip), ''), 'desconocida'), 64);
  v_codigo := lower(btrim(coalesce(p_codigo, '')));

  -- Se borran los intentos vencidos y se cuentan los códigos distintos que esta IP falló dentro de la ventana.
  delete from public.intentos_consulta_codigo i where i.creado_en < now() - make_interval(secs => v_seg);
  select count(*) into v_fallos from public.intentos_consulta_codigo i where i.ip = v_ip;
  if v_fallos >= v_max then
    return query select 'bloqueada'::text, null::text, null::text, null::text;
    return;
  end if;

  if length(v_codigo) <= 64 and v_codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*-[a-z0-9]{8}$' then
    select r.nombre, r.apellido, r.codigo_referido into v_ref
      from public.referentes r
     where r.codigo_referido = v_codigo and r.colocado and r.sancionado_en is null;
    if found then
      return query select 'ok'::text, v_ref.nombre, v_ref.apellido, v_ref.codigo_referido;
      return;
    end if;
  end if;

  -- Repetir el mismo código roto cuenta una sola vez (por la clave primaria).
  insert into public.intentos_consulta_codigo (ip, codigo) values (v_ip, left(v_codigo, 64))
  on conflict (ip, codigo) do nothing;
  return query select 'no_existe'::text, null::text, null::text, null::text;
end $$;

revoke all on function public.consultar_referente_por_codigo(text, text, text) from public;
grant execute on function public.consultar_referente_por_codigo(text, text, text) to anon, authenticated, service_role;
