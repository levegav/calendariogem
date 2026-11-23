-- =============================================================================
-- Fase 12 (ajuste): las reuniones de Outlook aparecen sin recargar la página.
--
-- outlook_links entra a Realtime: cuando el script de la oficina guarda cambios
-- de una persona, las páginas abiertas que la muestran se enteran y recargan el
-- calendario. Para que eso pase solo cuando hay algo nuevo, outlook_save_result
-- ya no toca la fila en cada pasada sin cambios (el script avisa que está vivo
-- con outlook_agent_checkin; checked_at pasa a ser la última vez que cambió algo).
-- RLS también aplica a Realtime: cada quien recibe solo lo que puede leer.
-- =============================================================================

alter publication supabase_realtime add table public.outlook_links;

create or replace function public.outlook_save_result(
  p_user_id uuid,
  p_status text,
  p_detail text default null,
  p_sync_state text default null,
  p_events jsonb default null,
  p_full boolean default false
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_detail text := left(p_detail, 500);
begin
  if not exists (select 1 from public.outlook_links where user_id = p_user_id) then
    return; -- le quitaron el correo mientras se sincronizaba
  end if;

  if p_events is not null then
    delete from public.outlook_events where user_id = p_user_id;
    insert into public.outlook_events (
      user_id, item_id, subject, start_at, end_at, all_day, location, organizer_name, organizer_email,
      attendees, join_url, is_recurring, is_cancelled, show_as, my_response
    )
    select p_user_id, e.item_id, coalesce(e.subject, ''), e.start_at, greatest(e.end_at, e.start_at),
           coalesce(e.all_day, false), nullif(e.location, ''), nullif(e.organizer_name, ''),
           nullif(e.organizer_email, ''), coalesce(e.attendees, '[]'), nullif(e.join_url, ''),
           coalesce(e.is_recurring, false), coalesce(e.is_cancelled, false), e.show_as, e.my_response
      from jsonb_to_recordset(p_events) as e (
        item_id text, subject text, start_at timestamptz, end_at timestamptz, all_day boolean, location text,
        organizer_name text, organizer_email text, attendees jsonb, join_url text, is_recurring boolean,
        is_cancelled boolean, show_as text, my_response text
      )
     where e.item_id is not null and e.start_at is not null and e.end_at is not null
    on conflict (user_id, item_id) do nothing;
  end if;

  -- Solo si cambió algo (reuniones nuevas, o el estado): así Realtime avisa
  -- a las páginas abiertas únicamente cuando hay que recargar.
  update public.outlook_links
     set status = p_status,
         status_detail = v_detail,
         checked_at = now(),
         refreshed_at = case when p_events is not null then now() else refreshed_at end
   where user_id = p_user_id
     and (p_events is not null or status is distinct from p_status or status_detail is distinct from v_detail);

  if p_status = 'ok' then
    insert into private.outlook_sync as s (user_id, sync_state, full_at)
    values (p_user_id, p_sync_state, case when p_full then now() end)
    on conflict (user_id) do update
      set sync_state = coalesce(excluded.sync_state, s.sync_state),
          full_at = case when p_full then now() else s.full_at end;
  elsif p_status in ('sin_permiso', 'no_encontrado') then
    delete from public.outlook_events where user_id = p_user_id;
    delete from private.outlook_sync where user_id = p_user_id;
  end if;
end;
$$;
