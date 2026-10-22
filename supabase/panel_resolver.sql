-- =====================================================================
-- panel_resolver.sql — Resolución de casos desde el panel (decisiones 63 a 66)
--
-- Se aplica después de schema.sql, seed.sql y registrar_referido.sql. Es re-ejecutable
-- (create or replace; revoke/grant idempotentes).
--
-- 1. Amplía trg_referido_reglas: rechazado -> en_revision (reapertura). Ninguna otra transición cambia;
--    validado sigue siendo final (error transicion_invalida).
-- 2. resolver_referido(referido, decision, motivo): aprobar | rechazar | reabrir, ejecutable solo por
--    `authenticated` y solo si es_reclutamiento(). La llama el panel con la sesión de la persona; la service role
--    no entra a la app.
--
-- Errores (el texto empieza con el código, igual que el resto de las funciones):
--   sin_permiso (42501) · decision_invalida (22023) · referido_inexistente (P0002) · motivo_requerido (23514) ·
--   motivo_demasiado_largo (23514) · ya_resuelto (23514) · estado_invalido (23514)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Reglas del referido (igual que en schema.sql, más rechazado -> en_revision)
-- ---------------------------------------------------------------------
create or replace function public.trg_referido_reglas() returns trigger language plpgsql as $$
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
      -- Decisión 63: un rechazado se puede reabrir (vuelve a en_revision). validado sigue siendo final.
      if not ((old.estado = 'registrado'  and new.estado in ('validado', 'en_revision'))
           or (old.estado = 'en_revision' and new.estado in ('validado', 'rechazado'))
           or (old.estado = 'rechazado'   and new.estado = 'en_revision')) then
        raise exception 'transicion_invalida: % -> % no está permitida', old.estado, new.estado using errcode = '23514';
      end if;
      if new.estado = 'validado' then
        new.validado_en := now();
      end if;
    end if;
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. resolver_referido
-- ---------------------------------------------------------------------
create or replace function public.resolver_referido(
  p_referido uuid,
  p_decision text,
  p_motivo   text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revisor uuid;
  v_motivo  text := nullif(btrim(p_motivo), '');
  v_estado  public.tipo_estado_referido;
  v_nuevo   public.tipo_estado_referido;
  v_referente uuid;
  v_monto   numeric;
  v_sin_pago boolean := false;
begin
  -- Primero el permiso: sin él no se revela ni siquiera si el referido existe.
  if not public.es_reclutamiento() then
    raise exception 'sin_permiso: solo el equipo de reclutamiento puede resolver casos' using errcode = '42501';
  end if;
  -- Mismo criterio de normalización que es_reclutamiento(): minúsculas y sin espacios en los extremos.
  select e.id into v_revisor
    from public.equipo_reclutamiento e
   where e.activo and e.email = lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  if v_revisor is null then
    raise exception 'sin_permiso: no se pudo identificar al revisor' using errcode = '42501';
  end if;

  if p_decision is null or p_decision not in ('aprobar', 'rechazar', 'reabrir') then
    raise exception 'decision_invalida: la decisión debe ser aprobar, rechazar o reabrir' using errcode = '22023';
  end if;
  if length(v_motivo) > 500 then
    raise exception 'motivo_demasiado_largo: el motivo admite hasta 500 caracteres' using errcode = '23514';
  end if;
  if p_decision = 'reabrir' and v_motivo is null then
    raise exception 'motivo_requerido: reabrir un caso exige un motivo' using errcode = '23514';
  end if;

  -- Bloqueo de la fila: dos revisores a la vez se serializan y el segundo ve el estado ya cambiado.
  select estado, referente_id into v_estado, v_referente from public.referidos where id = p_referido for update;
  if not found then
    raise exception 'referido_inexistente: %', p_referido using errcode = 'P0002';
  end if;

  if p_decision in ('aprobar', 'rechazar') then
    if v_estado in ('validado', 'rechazado') then
      raise exception 'ya_resuelto: el caso ya está %', v_estado using errcode = '23514';
    elsif v_estado <> 'en_revision' then
      raise exception 'estado_invalido: el caso está % y solo se resuelve uno en revisión', v_estado using errcode = '23514';
    end if;
    v_nuevo := case p_decision when 'aprobar' then 'validado' else 'rechazado' end;
  else
    -- Reabrir: solo un rechazado. Un validado no se reabre (decisión 64): ya tiene movimientos de pago.
    if v_estado <> 'rechazado' then
      raise exception 'estado_invalido: el caso está % y solo se reabre uno rechazado', v_estado using errcode = '23514';
    end if;
    v_nuevo := 'en_revision';
  end if;

  -- p_motivos va siempre NULL: así motivos_revision (por qué entró a revisión) no se pisa. Los pagos NO se crean
  -- acá: los crea el trigger al pasar a validado.
  perform public.cambiar_estado_referido(p_referido, v_nuevo, 'reclutamiento', v_revisor, v_motivo, null);

  if p_decision = 'aprobar' then
    select coalesce(sum(monto_usd), 0) into v_monto from public.movimientos_pago where referido_id = p_referido;
    -- Referente sancionado (decisión 39): el caso queda validado pero no genera movimientos.
    v_sin_pago := exists (select 1 from public.referentes where id = v_referente and sancionado_en is not null);
  end if;

  return jsonb_build_object(
    'referido_id', p_referido,
    'estado',      v_nuevo,
    'monto_usd',   v_monto,
    'sin_pago',    v_sin_pago
  );
end $$;

-- Solo personas con sesión; la verificación de rol vive adentro. Ni anon, ni public, ni la service role.
revoke all on function public.resolver_referido(uuid, text, text) from public, anon, service_role;
grant execute on function public.resolver_referido(uuid, text, text) to authenticated;
