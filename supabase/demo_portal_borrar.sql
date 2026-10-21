-- Limpieza de demo_portal.sql. Pegar en el SQL Editor del proyecto WorldTeams. Es re-ejecutable.
--
-- LÍMITE (decisión 15): historial_estados es de solo inserción (trigger + permisos), y referidos.id lo referencia con
-- ON DELETE RESTRICT. Por eso este script NO puede borrar los referidos ni los candidatos de la demo, y no desactiva el
-- trigger ni usa otra vía para saltearlo. Lo que sí borra son los premios (movimientos_pago) de esos referidos, que no
-- tienen esa protección. Ver el aviso final: qué queda y cómo resolverlo.

with demo as (
  select r.id
    from public.referidos r
    join public.candidatos ca on ca.id = r.candidato_id
   where ca.email like 'demo.%@ejemplo.com'
)
delete from public.movimientos_pago m
 using demo
 where m.referido_id = demo.id;

-- Hitos: si los validados de la demo llegaron a un umbral, el bono por hito no tiene referido_id y no se borra acá
-- (con 2 validados no llega al primer hito, 3). Se avisa si quedó alguno.
select 'quedan ' || count(*) || ' referidos de la demo (con su historial), sin premios' as aviso
  from public.referidos r join public.candidatos ca on ca.id = r.candidato_id
 where ca.email like 'demo.%@ejemplo.com';
