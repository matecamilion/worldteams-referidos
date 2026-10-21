-- =====================================================================
-- email_habilitado.sql — Quién puede entrar al login (decisión 44)
-- Se aplica DESPUÉS de schema.sql, seed.sql y consulta_referente.sql (usa su tabla de secretos). Es re-ejecutable.
-- No toca el esquema: agrega una sola función. Para aplicarla, pegá este archivo en el editor SQL de Supabase.
--
-- La app (login) no tiene la service role y el rol anónimo no lee `referentes` ni `equipo_reclutamiento`.
-- Esta función es la única puerta para preguntar "¿este email puede entrar?" y devuelve solo el rol:
--   'reclutamiento'  -> está en equipo_reclutamiento y activo
--   'referente'      -> está en referentes, colocado y sin sanción
--   'ninguno'        -> cualquier otro caso (no existe, no colocado, sancionado, inactivo): no se distinguen a propósito
--   'no_autorizado'  -> el secreto no coincide o no está cargado (mismo secreto de aplicación que consultar_referente_por_codigo)
-- Sin el secreto correcto responde 'no_autorizado' para TODOS los emails, existan o no, así que la clave anónima
-- (pública) no sirve para averiguar quién está en las listas.
-- Si un email está en las dos listas, gana 'reclutamiento'.
-- =====================================================================
create or replace function public.email_habilitado(p_email text, p_secreto text default null)
returns text
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_secreto text;
  v_email   text;
begin
  select s.valor into v_secreto from public.secretos_internos s where s.clave = 'consulta_codigo';
  if p_secreto is null or v_secreto is null or p_secreto is distinct from v_secreto then
    return 'no_autorizado';
  end if;

  v_email := public.normalizar_email(coalesce(p_email, ''));
  if v_email = '' then
    return 'ninguno';
  end if;

  if exists (select 1 from public.equipo_reclutamiento e where e.activo and e.email = v_email) then
    return 'reclutamiento';
  end if;
  if exists (select 1 from public.referentes r where r.email = v_email and r.colocado and r.sancionado_en is null) then
    return 'referente';
  end if;
  return 'ninguno';
end $$;

revoke all on function public.email_habilitado(text, text) from public;
grant execute on function public.email_habilitado(text, text) to anon, authenticated, service_role;
