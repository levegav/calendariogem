-- =============================================================================
-- Fase 4: notificaciones dentro de la app (en tiempo real) y avisos previos.
--
-- * reminder_alerts: avisos previos de cada participante (el creador y cada
--   etiquetado configuran los suyos). Por defecto, 15 min antes; en los de
--   todo el día, el día anterior a las 8:00 a. m.
-- * notifications: bandeja de cada usuario. La llenan los triggers (etiquetado,
--   quitado, salida, modificado) y la tarea programada de avisos previos, que
--   corre en el servidor cada 30 s aunque la app esté cerrada.
-- * Realtime: la tabla notifications se publica; cada usuario recibe solo las
--   suyas (RLS).
-- =============================================================================

create extension if not exists pg_cron with schema pg_catalog;

-- -----------------------------------------------------------------------------
-- Avisos previos
-- -----------------------------------------------------------------------------
create table public.reminder_alerts (
  reminder_id bigint not null references public.reminders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  minutes_before integer not null
    constraint reminder_alerts_minutes check (minutes_before in (0, 5, 15, 30, 60, 120, 1440, 2880, 10080)),
  -- Desde cuándo vale el aviso: no se disparan avisos cuya hora ya había pasado
  -- al configurarlos (o al mover el recordatorio).
  armed_at timestamptz not null default now(),
  -- Hora de disparo ya avisada; si el recordatorio se mueve, vuelve a avisar.
  fired_for timestamptz,
  primary key (reminder_id, user_id, minutes_before)
);

create index reminder_alerts_user_idx on public.reminder_alerts (user_id);

comment on table public.reminder_alerts is
  'Avisos previos de cada participante (creador o etiquetado). minutes_before: 0 = a la hora.';

-- Hora en que se dispara un aviso. Los de todo el día toman como referencia las
-- 8:00 a. m. (Costa Rica) del día de inicio: "a la hora" = ese día a las 8:00,
-- "1 día antes" = el día anterior a las 8:00.
create function private.alert_fire_at(p_start_at timestamptz, p_all_day boolean, p_minutes integer)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select p_start_at
         + case when p_all_day then interval '8 hours' else interval '0' end
         - make_interval(mins => p_minutes);
$$;

create function private.default_alert_minutes(p_all_day boolean)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case when p_all_day then 1440 else 15 end;
$$;

alter table public.reminder_alerts enable row level security;

create policy "Cada quien ve sus avisos" on public.reminder_alerts
  for select to authenticated
  using ((select private.is_active_user()) and user_id = (select auth.uid()));

create policy "Avisos solo en recordatorios propios o donde está etiquetado" on public.reminder_alerts
  for insert to authenticated
  with check (
    (select private.is_active_user())
    and user_id = (select auth.uid())
    and (private.is_reminder_owner(reminder_id) or private.is_reminder_participant(reminder_id))
  );

create policy "Cada quien quita sus avisos" on public.reminder_alerts
  for delete to authenticated
  using ((select private.is_active_user()) and user_id = (select auth.uid()));

revoke all on public.reminder_alerts from anon, authenticated;
grant select, delete on public.reminder_alerts to authenticated;
grant insert (reminder_id, user_id, minutes_before) on public.reminder_alerts to authenticated;

-- Reemplaza los avisos del usuario actual en un recordatorio. SECURITY INVOKER:
-- RLS decide si puede (debe ser el creador o estar etiquetado).
create function public.set_reminder_alerts(p_reminder_id bigint, p_minutes integer[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_minutes integer[] := coalesce(p_minutes, '{}');
begin
  if not (private.is_reminder_owner(p_reminder_id) or private.is_reminder_participant(p_reminder_id)) then
    raise exception 'Solo el creador y los etiquetados configuran avisos en este recordatorio.' using errcode = '42501';
  end if;

  delete from public.reminder_alerts
   where reminder_id = p_reminder_id and user_id = (select auth.uid())
     and not (minutes_before = any (v_minutes));

  insert into public.reminder_alerts (reminder_id, user_id, minutes_before)
  select p_reminder_id, (select auth.uid()), m
    from unnest(v_minutes) as m
   where not exists (
     select 1 from public.reminder_alerts a
      where a.reminder_id = p_reminder_id and a.user_id = (select auth.uid()) and a.minutes_before = m
   )
  group by m;
end;
$$;

revoke all on function public.set_reminder_alerts(bigint, integer[]) from public, anon, authenticated;
grant execute on function public.set_reminder_alerts(bigint, integer[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Notificaciones
-- -----------------------------------------------------------------------------
create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null
    constraint notifications_kind check (kind in ('etiquetado', 'quitado', 'salida', 'modificado', 'aviso')),
  reminder_id bigint references public.reminders (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  -- Copia del título: quien fue quitado ya no puede leer el recordatorio.
  reminder_title text not null,
  -- start_at y all_day del recordatorio; "modificado": changes y before;
  -- "aviso": minutes_before.
  data jsonb not null default '{}',
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_reminder_idx on public.notifications (reminder_id);

comment on table public.notifications is
  'Notificaciones dentro de la app. Las crean triggers y la tarea de avisos previos; el usuario solo las lee y las marca como leídas.';

alter table public.notifications enable row level security;

create policy "Cada quien ve sus notificaciones" on public.notifications
  for select to authenticated
  using ((select private.is_active_user()) and user_id = (select auth.uid()));

create policy "Cada quien marca sus notificaciones" on public.notifications
  for update to authenticated
  using ((select private.is_active_user()) and user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

alter publication supabase_realtime add table public.notifications;

-- Inserta una notificación con la copia del recordatorio (título, inicio, todo el día).
create function private.notify(
  p_user_id uuid,
  p_kind text,
  p_reminder public.reminders,
  p_actor_id uuid,
  p_extra jsonb default '{}'
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, reminder_id, actor_id, reminder_title, data)
  values (
    p_user_id, p_kind, p_reminder.id, p_actor_id, p_reminder.title,
    jsonb_build_object('start_at', p_reminder.start_at, 'all_day', p_reminder.all_day) || p_extra
  );
$$;

revoke all on function private.notify(uuid, text, public.reminders, uuid, jsonb) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Triggers
-- -----------------------------------------------------------------------------

-- Recordatorio nuevo: aviso por defecto para el creador.
create function private.on_reminder_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.reminder_alerts (reminder_id, user_id, minutes_before)
  values (new.id, new.owner_id, private.default_alert_minutes(new.all_day));
  return null;
end;
$$;

create trigger default_alert after insert on public.reminders
  for each row execute function private.on_reminder_insert();

-- Cambio de horario: los avisos se rearman (vuelven a avisar con la nueva hora).
-- Si cambia "todo el día", las opciones no equivalen: todos vuelven al aviso
-- por defecto (save_reminder aplica después los que eligió el creador).
create function private.on_reminder_time_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.all_day is distinct from old.all_day then
    delete from public.reminder_alerts where reminder_id = new.id;
    insert into public.reminder_alerts (reminder_id, user_id, minutes_before)
    select new.id, u, private.default_alert_minutes(new.all_day)
      from (
        select new.owner_id as u
        union
        select p.user_id from public.reminder_participants p where p.reminder_id = new.id
      ) people;
  else
    update public.reminder_alerts
       set armed_at = now(), fired_for = null
     where reminder_id = new.id;
  end if;
  return null;
end;
$$;

create trigger rearm_alerts after update of start_at, all_day on public.reminders
  for each row
  when (new.start_at is distinct from old.start_at or new.all_day is distinct from old.all_day)
  execute function private.on_reminder_time_change();

-- Modificación: se avisa a los etiquetados qué cambió. Es un trigger diferido
-- (corre al confirmar la transacción) para que save_reminder ya haya
-- sincronizado los etiquetados: quien fue quitado recibe solo "quitado" y quien
-- recién se agregó recibe solo "etiquetado".
create function private.on_reminder_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes text[] := '{}';
  v_current public.reminders;
begin
  if new.title is distinct from old.title then v_changes := array_append(v_changes, 'titulo'); end if;
  if new.start_at is distinct from old.start_at or new.end_at is distinct from old.end_at
     or new.all_day is distinct from old.all_day then
    v_changes := array_append(v_changes, 'horario');
  end if;
  if new.category_id is distinct from old.category_id then v_changes := array_append(v_changes, 'categoria'); end if;
  if new.location is distinct from old.location then v_changes := array_append(v_changes, 'ubicacion'); end if;
  if new.description is distinct from old.description then v_changes := array_append(v_changes, 'descripcion'); end if;
  if new.note is distinct from old.note then v_changes := array_append(v_changes, 'nota'); end if;
  if cardinality(v_changes) = 0 then
    return null;
  end if;

  -- Si se eliminó en la misma transacción, no hay a quién avisar.
  select * into v_current from public.reminders where id = new.id;
  if not found then
    return null;
  end if;

  perform private.notify(
    p.user_id, 'modificado', new, new.owner_id,
    jsonb_build_object(
      'changes', to_jsonb(v_changes),
      'before', jsonb_build_object('title', old.title, 'start_at', old.start_at, 'end_at', old.end_at, 'all_day', old.all_day)
    )
  )
    from public.reminder_participants p
   where p.reminder_id = new.id
     and p.added_at <> now();  -- los agregados en esta misma transacción ya reciben "etiquetado"
  return null;
end;
$$;

create constraint trigger notify_change after update on public.reminders
  deferrable initially deferred
  for each row execute function private.on_reminder_change();

-- Etiquetado: notificación y aviso por defecto para la persona.
create function private.on_participant_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reminder public.reminders;
begin
  select * into v_reminder from public.reminders where id = new.reminder_id;
  insert into public.reminder_alerts (reminder_id, user_id, minutes_before)
  values (new.reminder_id, new.user_id, private.default_alert_minutes(v_reminder.all_day))
  on conflict do nothing;
  perform private.notify(new.user_id, 'etiquetado', v_reminder, v_reminder.owner_id);
  return null;
end;
$$;

create trigger notify_tagged after insert on public.reminder_participants
  for each row execute function private.on_participant_insert();

-- Quitado o salida: se borran los avisos de esa persona. Si se salió, se
-- notifica al creador; si la quitaron, solo a ella. Si el recordatorio se está
-- eliminando (borrado en cascada) no se notifica aquí (Fase 5).
create function private.on_participant_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reminder public.reminders;
begin
  delete from public.reminder_alerts where reminder_id = old.reminder_id and user_id = old.user_id;

  select * into v_reminder from public.reminders where id = old.reminder_id;
  if not found then
    return null;
  end if;

  if (select auth.uid()) = old.user_id then
    perform private.notify(v_reminder.owner_id, 'salida', v_reminder, old.user_id);
  else
    perform private.notify(old.user_id, 'quitado', v_reminder, coalesce((select auth.uid()), v_reminder.owner_id));
  end if;
  return null;
end;
$$;

create trigger notify_removed after delete on public.reminder_participants
  for each row execute function private.on_participant_delete();

revoke all on function private.on_reminder_insert() from public, anon, authenticated;
revoke all on function private.on_reminder_time_change() from public, anon, authenticated;
revoke all on function private.on_reminder_change() from public, anon, authenticated;
revoke all on function private.on_participant_insert() from public, anon, authenticated;
revoke all on function private.on_participant_delete() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Avisos previos que ya tocan: se convierten en notificaciones "aviso".
-- La ejecuta pg_cron cada 30 s. Devuelve cuántos avisos disparó.
-- -----------------------------------------------------------------------------
create function private.fire_due_alerts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with due as (
    select a.reminder_id, a.user_id, a.minutes_before,
           private.alert_fire_at(r.start_at, r.all_day, a.minutes_before) as fire_at
      from public.reminder_alerts a
      join public.reminders r on r.id = a.reminder_id
      join public.profiles u on u.id = a.user_id and u.active
     where r.start_at > now() - interval '2 days'
       and private.alert_fire_at(r.start_at, r.all_day, a.minutes_before) <= now()
       and private.alert_fire_at(r.start_at, r.all_day, a.minutes_before) >= a.armed_at - interval '1 minute'
       and a.fired_for is distinct from private.alert_fire_at(r.start_at, r.all_day, a.minutes_before)
       for update of a skip locked
  ),
  marked as (
    update public.reminder_alerts a
       set fired_for = d.fire_at
      from due d
     where a.reminder_id = d.reminder_id and a.user_id = d.user_id and a.minutes_before = d.minutes_before
    returning a.reminder_id, a.user_id, a.minutes_before, d.fire_at
  )
  insert into public.notifications (user_id, kind, reminder_id, actor_id, reminder_title, data)
  select m.user_id, 'aviso', r.id, null, r.title,
         jsonb_build_object('start_at', r.start_at, 'all_day', r.all_day, 'end_at', r.end_at,
                            'minutes_before', m.minutes_before, 'fire_at', m.fire_at)
    from marked m
    join public.reminders r on r.id = m.reminder_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function private.fire_due_alerts() from public, anon, authenticated;

select cron.schedule('avisos-previos', '30 seconds', $$select private.fire_due_alerts()$$);

-- -----------------------------------------------------------------------------
-- save_reminder ahora también guarda los avisos del creador (p_alerts; null =
-- no tocarlos). Misma regla que antes: SECURITY INVOKER.
-- -----------------------------------------------------------------------------
drop function public.save_reminder(bigint, text, text, timestamptz, timestamptz, boolean, bigint, text, text, uuid[]);

create function public.save_reminder(
  p_id bigint,
  p_title text,
  p_description text,
  p_start_at timestamptz,
  p_end_at timestamptz,
  p_all_day boolean,
  p_category_id bigint,
  p_location text,
  p_note text,
  p_participants uuid[],
  p_alerts integer[] default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id bigint;
  v_participants uuid[] := coalesce(p_participants, '{}');
begin
  if p_id is null then
    insert into public.reminders (title, description, start_at, end_at, all_day, category_id, location, note)
    values (p_title, p_description, p_start_at, p_end_at, p_all_day, p_category_id, p_location, p_note)
    returning id into v_id;
  else
    update public.reminders
       set title = p_title, description = p_description, start_at = p_start_at, end_at = p_end_at,
           all_day = p_all_day, category_id = p_category_id, location = p_location, note = p_note
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Solo el creador puede modificar este recordatorio.' using errcode = '42501';
    end if;
  end if;

  -- Quitar a quienes ya no están en la lista.
  delete from public.reminder_participants
   where reminder_id = v_id and not (user_id = any (v_participants));

  -- Agregar solo a los nuevos (los que ya estaban se mantienen tal cual).
  insert into public.reminder_participants (reminder_id, user_id)
  select v_id, u
    from unnest(v_participants) as u
   where not exists (
     select 1 from public.reminder_participants p where p.reminder_id = v_id and p.user_id = u
   )
  group by u;

  if p_alerts is not null then
    perform public.set_reminder_alerts(v_id, p_alerts);
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_reminder(bigint, text, text, timestamptz, timestamptz, boolean, bigint, text, text, uuid[], integer[])
  from public, anon, authenticated;
grant execute on function public.save_reminder(bigint, text, text, timestamptz, timestamptz, boolean, bigint, text, text, uuid[], integer[])
  to authenticated;

-- Recordatorios que ya existían: aviso por defecto para su creador y sus etiquetados.
insert into public.reminder_alerts (reminder_id, user_id, minutes_before)
select r.id, r.owner_id, private.default_alert_minutes(r.all_day) from public.reminders r
union
select r.id, p.user_id, private.default_alert_minutes(r.all_day)
  from public.reminders r join public.reminder_participants p on p.reminder_id = r.id
on conflict do nothing;
