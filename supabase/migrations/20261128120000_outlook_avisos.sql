-- =============================================================================
-- Fase 13: avisos y notificaciones de las reuniones de Outlook.
--
-- * Avisos previos: se copian del recordatorio de la reunión en Outlook
--   (outlook_events.reminder_minutes). Si la persona los cambia en la app
--   (set_outlook_alerts), se respetan los suyos y Outlook ya no los pisa.
--   Los dispara la tarea de pg_cron "avisos-outlook" cada 30 s, como los de
--   los recordatorios (notificación "aviso").
-- * Notificaciones "outlook" (nueva / modificada) de reuniones que organizó
--   otra persona. No en la primera lectura de alguien ni en las que ya pasaron.
-- * Si se cancela o se borra una reunión a la que la invitaron, la persona
--   decide en la ventana Conservar / Eliminar (motivo "outlook_cancelada");
--   Conservar la deja como recordatorio propio.
-- * Cada reunión se identifica con su identificador permanente de Exchange
--   (event_key = UID + repetición), que no cambia al mover una serie. Mientras
--   el script de la oficina no se actualice, event_key = item_id; las reuniones
--   se reconocen por cualquiera de los dos, así el cambio no genera avisos falsos.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Reuniones: identificador permanente y recordatorio de Outlook
-- -----------------------------------------------------------------------------
alter table public.outlook_events add column event_key text;
update public.outlook_events set event_key = item_id;
alter table public.outlook_events alter column event_key set not null;
alter table public.outlook_events drop constraint outlook_events_user_id_item_id_key;
alter table public.outlook_events add constraint outlook_events_user_event_key unique (user_id, event_key);
create index outlook_events_user_item_idx on public.outlook_events (user_id, item_id);

-- Minutos antes del recordatorio que tiene en Outlook (null = sin recordatorio).
alter table public.outlook_events add column reminder_minutes integer
  check (reminder_minutes between 0 and 40320);

-- -----------------------------------------------------------------------------
-- Avisos previos de reuniones de Outlook
-- -----------------------------------------------------------------------------
create table public.outlook_alerts (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_key text not null,
  minutes_before integer not null check (minutes_before between 0 and 40320),
  -- Igual que reminder_alerts: no se disparan avisos cuya hora ya había pasado
  -- al crearlos, y si la reunión se mueve, vuelve a avisar.
  armed_at timestamptz not null default now(),
  fired_for timestamptz,
  primary key (user_id, event_key, minutes_before)
);

-- La persona cambió los avisos de esa reunión en la app: Outlook ya no los pisa.
create table public.outlook_alert_overrides (
  user_id uuid not null references public.profiles (id) on delete cascade,
  event_key text not null,
  primary key (user_id, event_key)
);

alter table public.outlook_alerts enable row level security;
alter table public.outlook_alert_overrides enable row level security;

create policy "Cada quien ve sus avisos de Outlook" on public.outlook_alerts
  for select to authenticated
  using ((select private.is_active_user()) and user_id = (select auth.uid()));

create policy "Cada quien ve sus avisos de Outlook cambiados" on public.outlook_alert_overrides
  for select to authenticated
  using ((select private.is_active_user()) and user_id = (select auth.uid()));

revoke all on public.outlook_alerts, public.outlook_alert_overrides from anon, authenticated;
grant select on public.outlook_alerts, public.outlook_alert_overrides to authenticated;

-- La persona cambia sus avisos de una reunión de su propio calendario de Outlook.
create function public.set_outlook_alerts(p_event_key text, p_minutes integer[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
begin
  if not private.is_active_user() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.outlook_events where user_id = v_user and event_key = p_event_key) then
    raise exception 'Solo puede cambiar los avisos de las reuniones de su calendario.' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(p_minutes, '{}')) as m where m is null or m < 0 or m > 40320) then
    raise exception 'Aviso no válido.' using errcode = '22023';
  end if;

  delete from public.outlook_alerts
   where user_id = v_user and event_key = p_event_key
     and minutes_before <> all (coalesce(p_minutes, '{}'));
  insert into public.outlook_alerts (user_id, event_key, minutes_before)
  select v_user, p_event_key, m from unnest(coalesce(p_minutes, '{}')) as m
  on conflict do nothing;
  insert into public.outlook_alert_overrides (user_id, event_key) values (v_user, p_event_key)
  on conflict do nothing;
end;
$$;

revoke all on function public.set_outlook_alerts(text, integer[]) from public, anon, authenticated;
grant execute on function public.set_outlook_alerts(text, integer[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Notificaciones y decisiones
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind;
alter table public.notifications add constraint notifications_kind
  check (kind in ('etiquetado', 'quitado', 'salida', 'modificado', 'aviso', 'general', 'outlook'));

comment on column public.notifications.data is
  'start_at y all_day del recordatorio; "modificado": changes y before; "aviso": minutes_before (y outlook = true '
  'si es de una reunión de Outlook); "general": accion (publicado, modificado, retirado, eliminado) y, si se '
  'modificó, changes y before; "outlook": accion (nueva, modificada), organizer y, si se modificó, changes y before.';

alter table public.reminder_decisions drop constraint reminder_decisions_reason;
alter table public.reminder_decisions add constraint reminder_decisions_reason
  check (reason in ('eliminado', 'creador_desactivado', 'general_eliminado', 'outlook_cancelada'));
-- Quién organizaba la reunión de Outlook cancelada (no es usuario de la app).
alter table public.reminder_decisions add column outlook_organizer text;

-- -----------------------------------------------------------------------------
-- Guardar el resultado de la sincronización (reemplaza al de la Fase 12).
-- p_window_to: fin de la ventana leída; una reunión que falta y empezaba
-- después no se considera borrada (pudo moverse fuera de la ventana).
-- -----------------------------------------------------------------------------
drop function public.outlook_save_result(uuid, text, text, text, jsonb, boolean);

create function public.outlook_save_result(
  p_user_id uuid,
  p_status text,
  p_detail text default null,
  p_sync_state text default null,
  p_events jsonb default null,
  p_full boolean default false,
  p_window_to timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_detail text := left(p_detail, 500);
  v_link public.outlook_links;
  v_first boolean;
  v_window_to timestamptz := coalesce(p_window_to, now() + interval '90 days');
  v_reunion bigint := (select c.id from public.categories c where c.name = 'Reunión' and c.active limit 1);
begin
  select * into v_link from public.outlook_links where user_id = p_user_id for update;
  if not found then
    return; -- le quitaron el correo mientras se sincronizaba
  end if;
  -- Primera lectura de esta persona: no se notifica nada (son reuniones que ya tenía).
  v_first := v_link.refreshed_at is null;

  if p_events is not null then
    -- Tablas de trabajo de esta llamada (pueden quedar de otra llamada en la misma transacción).
    drop table if exists pg_temp.incoming, pg_temp.pairs;
    create temp table incoming on commit drop as
    select distinct on (coalesce(nullif(e.event_key, ''), e.item_id))
           coalesce(nullif(e.event_key, ''), e.item_id) as event_key, e.item_id,
           coalesce(e.subject, '') as subject, e.start_at, greatest(e.end_at, e.start_at) as end_at,
           coalesce(e.all_day, false) as all_day, nullif(e.location, '') as location,
           nullif(e.organizer_name, '') as organizer_name, nullif(e.organizer_email, '') as organizer_email,
           coalesce(e.attendees, '[]') as attendees, nullif(e.join_url, '') as join_url,
           coalesce(e.is_recurring, false) as is_recurring, coalesce(e.is_cancelled, false) as is_cancelled,
           e.show_as, e.my_response,
           case when e.reminder_minutes between 0 and 40320 then e.reminder_minutes end as reminder_minutes
      from jsonb_to_recordset(p_events) as e (
        event_key text, item_id text, subject text, start_at timestamptz, end_at timestamptz, all_day boolean,
        location text, organizer_name text, organizer_email text, attendees jsonb, join_url text,
        is_recurring boolean, is_cancelled boolean, show_as text, my_response text, reminder_minutes integer
      )
     where e.item_id is not null and e.start_at is not null and e.end_at is not null
     order by coalesce(nullif(e.event_key, ''), e.item_id), e.start_at;

    -- Reuniones guardadas y su par en lo recibido (por identificador permanente o por item_id).
    create temp table pairs on commit drop as
    select o.event_key as old_key, o.item_id as old_item, o.subject as old_subject, o.start_at as old_start,
           o.end_at as old_end, o.all_day as old_all_day, o.location as old_location, o.is_cancelled as old_cancelled,
           o.organizer_name as old_organizer, o.organizer_email as old_organizer_email, o.my_response as old_response,
           o.join_url as old_join_url, i.event_key as new_key
      from public.outlook_events o
      left join lateral (
        select i.event_key from incoming i
         where i.event_key = o.event_key or i.item_id = o.item_id
         order by (i.event_key = o.event_key) desc
         limit 1
      ) i on true
     where o.user_id = p_user_id;

    if not v_first then
      -- Nueva reunión (que organizó otra persona y todavía no pasa).
      insert into public.notifications (user_id, kind, reminder_id, actor_id, reminder_title, data)
      select p_user_id, 'outlook', null, null, i.subject,
             jsonb_build_object('accion', 'nueva', 'start_at', i.start_at, 'all_day', i.all_day,
                                'organizer', i.organizer_name)
        from incoming i
       where not i.is_cancelled
         and i.end_at > now()
         and not private.outlook_is_mine(i.my_response, i.organizer_email, v_link.email)
         and not exists (select 1 from pairs p where p.new_key = i.event_key);

      -- Reunión modificada: fecha y hora, asunto o lugar.
      insert into public.notifications (user_id, kind, reminder_id, actor_id, reminder_title, data)
      select p_user_id, 'outlook', null, null, i.subject,
             jsonb_build_object(
               'accion', 'modificada', 'start_at', i.start_at, 'all_day', i.all_day, 'organizer', i.organizer_name,
               'changes', to_jsonb(array_remove(array[
                 case when i.start_at <> p.old_start or i.end_at <> p.old_end or i.all_day <> p.old_all_day
                      then 'horario' end,
                 case when i.subject <> p.old_subject then 'titulo' end,
                 case when i.location is distinct from p.old_location then 'ubicacion' end
               ], null)),
               'before', jsonb_build_object('title', p.old_subject, 'start_at', p.old_start,
                                            'end_at', p.old_end, 'all_day', p.old_all_day))
        from incoming i
        join pairs p on p.new_key = i.event_key
       where not i.is_cancelled and not p.old_cancelled
         and i.end_at > now()
         and not private.outlook_is_mine(i.my_response, i.organizer_email, v_link.email)
         and (i.start_at <> p.old_start or i.end_at <> p.old_end or i.all_day <> p.old_all_day
              or i.subject <> p.old_subject or i.location is distinct from p.old_location);

      -- Cancelada o borrada (de una reunión a la que la invitaron): decide si la conserva.
      insert into public.reminder_decisions
        (user_id, reason, reminder_id, former_owner_id, title, description, start_at, end_at, all_day,
         category_id, location, note, alerts, outlook_organizer)
      select p_user_id, 'outlook_cancelada', null, null, c.subject,
             case when c.organizer is not null then 'Reunión de Outlook organizada por ' || c.organizer end,
             c.start_at,
             -- La app guarda el último día (no la medianoche siguiente, como Outlook).
             case when c.all_day then greatest(c.end_at - interval '1 day', c.start_at) else c.end_at end,
             c.all_day, v_reunion, c.location,
             case when c.join_url is not null then 'Enlace de la reunión: ' || c.join_url end,
             coalesce((select array_agg(a.minutes_before order by a.minutes_before)
                         from public.outlook_alerts a
                        where a.user_id = p_user_id and a.event_key = c.event_key
                          and a.minutes_before in (0, 5, 15, 30, 60, 120, 1440, 2880, 10080)),
                      array[private.default_alert_minutes(c.all_day)]),
             c.organizer
        from (
          -- Desapareció de Outlook (y empezaba dentro de la ventana leída).
          select p.old_key as event_key, p.old_subject as subject, p.old_start as start_at, p.old_end as end_at,
                 p.old_all_day as all_day, p.old_location as location, p.old_organizer as organizer,
                 p.old_join_url as join_url
            from pairs p
           where p.new_key is null and not p.old_cancelled
             and p.old_end > now() and p.old_start < v_window_to
             and not private.outlook_is_mine(p.old_response, p.old_organizer_email, v_link.email)
          union all
          -- Sigue en Outlook, pero ahora como cancelada.
          select i.event_key, i.subject, i.start_at, i.end_at, i.all_day, i.location, i.organizer_name, i.join_url
            from incoming i
            join pairs p on p.new_key = i.event_key
           where i.is_cancelled and not p.old_cancelled and i.end_at > now()
             and not private.outlook_is_mine(i.my_response, i.organizer_email, v_link.email)
        ) c
       where exists (select 1 from public.profiles u where u.id = p_user_id and u.active);
    end if;

    -- Reemplaza las reuniones por las recibidas.
    delete from public.outlook_events where user_id = p_user_id;
    insert into public.outlook_events (
      user_id, event_key, item_id, subject, start_at, end_at, all_day, location, organizer_name, organizer_email,
      attendees, join_url, is_recurring, is_cancelled, show_as, my_response, reminder_minutes
    )
    select p_user_id, i.event_key, i.item_id, i.subject, i.start_at, i.end_at, i.all_day, i.location,
           i.organizer_name, i.organizer_email, i.attendees, i.join_url, i.is_recurring, i.is_cancelled,
           i.show_as, i.my_response, i.reminder_minutes
      from incoming i;

    -- Avisos: los de reuniones que ya no están (o se cancelaron) se quitan.
    delete from public.outlook_alerts a
     where a.user_id = p_user_id
       and not exists (select 1 from incoming i where i.event_key = a.event_key and not i.is_cancelled);
    delete from public.outlook_alert_overrides o
     where o.user_id = p_user_id
       and not exists (select 1 from incoming i where i.event_key = o.event_key and not i.is_cancelled);
    -- Los que la persona no cambió siguen al recordatorio de Outlook.
    delete from public.outlook_alerts a
     where a.user_id = p_user_id
       and not exists (select 1 from public.outlook_alert_overrides o
                        where o.user_id = a.user_id and o.event_key = a.event_key)
       and not exists (select 1 from incoming i
                        where i.event_key = a.event_key and i.reminder_minutes = a.minutes_before);
    insert into public.outlook_alerts (user_id, event_key, minutes_before)
    select p_user_id, i.event_key, i.reminder_minutes
      from incoming i
     where i.reminder_minutes is not null and not i.is_cancelled
       and not exists (select 1 from public.outlook_alert_overrides o
                        where o.user_id = p_user_id and o.event_key = i.event_key)
    on conflict do nothing;
  end if;

  -- Solo si cambió algo: así Realtime avisa a las páginas abiertas únicamente cuando hay que recargar.
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
    delete from public.outlook_alerts where user_id = p_user_id;
    delete from public.outlook_alert_overrides where user_id = p_user_id;
    delete from private.outlook_sync where user_id = p_user_id;
  end if;
end;
$$;

-- ¿La organizó la propia persona? (de esas no se le avisa: los cambios los hizo ella)
create function private.outlook_is_mine(p_response text, p_organizer_email text, p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_response = 'Organizer', false) or coalesce(lower(p_organizer_email) = lower(p_email), false);
$$;

revoke all on function private.outlook_is_mine(text, text, text) from public, anon, authenticated;
revoke all on function public.outlook_save_result(uuid, text, text, text, jsonb, boolean, timestamptz)
  from public, anon, authenticated;
grant execute on function public.outlook_save_result(uuid, text, text, text, jsonb, boolean, timestamptz) to service_role;

-- Quitar el correo de Outlook también borra sus avisos.
create or replace function public.admin_set_outlook_email(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_current text;
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede modificar usuarios.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'El usuario no existe.' using errcode = 'P0001';
  end if;

  select email into v_current from public.outlook_links where user_id = p_user_id;

  if v_email is not null and v_email !~ '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'El correo de Outlook no es válido.' using errcode = 'P0001';
  end if;
  if v_email is not null and exists (select 1 from public.outlook_links where email = v_email and user_id <> p_user_id) then
    raise exception 'Ese correo de Outlook ya está asignado a otro usuario.' using errcode = 'P0001';
  end if;
  if v_current is not distinct from v_email then
    return;
  end if;

  -- Sin correo, o con otro: se empieza de cero.
  delete from public.outlook_links where user_id = p_user_id;
  delete from public.outlook_events where user_id = p_user_id;
  delete from public.outlook_alerts where user_id = p_user_id;
  delete from public.outlook_alert_overrides where user_id = p_user_id;
  if v_email is not null then
    insert into public.outlook_links (user_id, email) values (p_user_id, v_email);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Disparo de los avisos de Outlook (cada 30 s, como los de los recordatorios)
-- -----------------------------------------------------------------------------
create function private.fire_due_outlook_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select a.user_id, a.event_key, a.minutes_before,
           private.alert_fire_at(e.start_at, e.all_day, a.minutes_before) as fire_at
      from public.outlook_alerts a
      join public.outlook_events e on e.user_id = a.user_id and e.event_key = a.event_key and not e.is_cancelled
      join public.profiles u on u.id = a.user_id and u.active
     where e.start_at > now() - interval '2 days'
       and private.alert_fire_at(e.start_at, e.all_day, a.minutes_before) <= now()
       and private.alert_fire_at(e.start_at, e.all_day, a.minutes_before) >= a.armed_at - interval '1 minute'
       and a.fired_for is distinct from private.alert_fire_at(e.start_at, e.all_day, a.minutes_before)
       for update of a skip locked
  ),
  marked as (
    update public.outlook_alerts a
       set fired_for = d.fire_at
      from due d
     where a.user_id = d.user_id and a.event_key = d.event_key and a.minutes_before = d.minutes_before
    returning a.user_id, a.event_key, a.minutes_before, d.fire_at
  )
  insert into public.notifications (user_id, kind, reminder_id, actor_id, reminder_title, data)
  select m.user_id, 'aviso', null, null, e.subject,
         jsonb_build_object('start_at', e.start_at, 'all_day', e.all_day,
                            'end_at', case when e.all_day then null else e.end_at end,
                            'minutes_before', m.minutes_before, 'fire_at', m.fire_at, 'outlook', true)
    from marked m
    join public.outlook_events e on e.user_id = m.user_id and e.event_key = m.event_key;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.fire_due_outlook_alerts() from public, anon, authenticated;

select cron.schedule('avisos-outlook', '30 seconds', $$select private.fire_due_outlook_alerts()$$);
