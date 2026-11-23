-- =============================================================================
-- Fase 12 (ajuste): la sincronización con Outlook corre dentro de la empresa.
--
-- El firewall de Exchange no acepta conexiones desde los servidores de Supabase
-- (Estados Unidos). Ahora un script de PowerShell, en la VM de Exchange, lee los
-- calendarios por la red interna y envía las reuniones a la Edge Function
-- `outlook-agent` (solo conexiones de salida). Por eso:
--   * se quita la tarea de pg_cron que llamaba a `outlook-sync` y sus secretos;
--   * se registra cuándo se conectó el script por última vez (para Usuarios);
--   * "Sincronizar Outlook" pide una lectura completa en la próxima pasada.
-- =============================================================================

select cron.unschedule('outlook-sync');
drop function private.request_outlook_sync();
delete from vault.secrets where name in ('outlook_sync_url', 'outlook_sync_token');

-- El turno ya no hace falta: la tarea programada no inicia otra copia mientras una corre.
drop function public.outlook_claim_run(integer);
drop function public.outlook_release_run();
drop table private.outlook_runner;

-- Última conexión del script de la oficina.
create table private.outlook_agent (
  id boolean primary key default true check (id),
  seen_at timestamptz,
  version text,
  host text
);
insert into private.outlook_agent default values;
alter table private.outlook_agent enable row level security;

-- El script avisa que está vivo al pedir la lista de usuarios (solo service_role).
create function public.outlook_agent_checkin(p_version text, p_host text)
returns void
language sql
security definer
set search_path = ''
as $$
  update private.outlook_agent
     set seen_at = now(), version = left(p_version, 50), host = left(p_host, 100)
   where id;
$$;

revoke all on function public.outlook_agent_checkin(text, text) from public, anon, authenticated;
grant execute on function public.outlook_agent_checkin(text, text) to service_role;

-- Admin: cuándo se conectó el script por última vez.
create function public.outlook_agent_status()
returns table (seen_at timestamptz, version text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede ver el estado de la sincronización.' using errcode = '42501';
  end if;
  return query select a.seen_at, a.version from private.outlook_agent a where a.id;
end;
$$;

revoke all on function public.outlook_agent_status() from public, anon, authenticated;
grant execute on function public.outlook_agent_status() to authenticated;

-- Admin: "Sincronizar Outlook". En la próxima pasada (menos de un minuto) el
-- script vuelve a leer todas las reuniones de esos usuarios (o de todos).
create function public.admin_request_outlook_sync(p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede sincronizar Outlook.' using errcode = '42501';
  end if;
  update private.outlook_sync set full_at = null where p_user_id is null or user_id = p_user_id;
end;
$$;

revoke all on function public.admin_request_outlook_sync(uuid) from public, anon, authenticated;
grant execute on function public.admin_request_outlook_sync(uuid) to authenticated;
