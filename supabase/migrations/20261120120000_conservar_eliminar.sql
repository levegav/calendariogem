-- =============================================================================
-- Fase 5: ventana Conservar / Eliminar.
--
-- Cuando el creador elimina un recordatorio, o cuando se desactiva al creador
-- (solo sus recordatorios que aún no terminan), cada etiquetado debe decidir:
--   * Conservar: se crea una copia independiente de la que pasa a ser dueño.
--   * Eliminar: se quita su participación.
-- Cada decisión se guarda con una copia de los datos del recordatorio, porque el
-- original puede ya no existir. Las decisiones de cada persona son independientes.
-- =============================================================================

create table public.reminder_decisions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null
    constraint reminder_decisions_reason check (reason in ('eliminado', 'creador_desactivado')),
  -- Recordatorio original (null si fue eliminado).
  reminder_id bigint references public.reminders (id) on delete set null,
  former_owner_id uuid references public.profiles (id) on delete set null,
  -- Copia de los datos del recordatorio al momento del evento.
  title text not null,
  description text,
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null,
  category_id bigint references public.categories (id) on delete set null,
  location text,
  note text,
  -- Avisos previos que tenía la persona: se conservan en la copia.
  alerts integer[] not null default '{}',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  decision text constraint reminder_decisions_decision check (decision in ('conservar', 'eliminar')),
  kept_reminder_id bigint references public.reminders (id) on delete set null,
  constraint reminder_decisions_resolved check ((resolved_at is null) = (decision is null))
);

create index reminder_decisions_pending_idx on public.reminder_decisions (user_id, created_at) where resolved_at is null;
create index reminder_decisions_reminder_idx on public.reminder_decisions (reminder_id);

comment on table public.reminder_decisions is
  'Decisiones Conservar / Eliminar pendientes y tomadas por cada etiquetado. Solo se resuelven con resolve_reminder_decision.';

alter table public.reminder_decisions enable row level security;

create policy "Cada quien ve sus decisiones" on public.reminder_decisions
  for select to authenticated
  using ((select private.is_active_user()) and user_id = (select auth.uid()));

revoke all on public.reminder_decisions from anon, authenticated;
grant select on public.reminder_decisions to authenticated;

alter publication supabase_realtime add table public.reminder_decisions;

-- Momento en que termina un recordatorio (los de todo el día, al final del día).
create function private.reminder_ends_at(p_start_at timestamptz, p_end_at timestamptz, p_all_day boolean)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_end_at, p_start_at) + case when p_all_day then interval '1 day' else interval '0' end;
$$;

-- Crea las decisiones pendientes de los etiquetados de un recordatorio.
-- No duplica si la persona ya tiene una pendiente para ese recordatorio.
create function private.create_decisions(p_reminder public.reminders, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.reminder_decisions
    (user_id, reason, reminder_id, former_owner_id, title, description, start_at, end_at, all_day,
     category_id, location, note, alerts)
  select p.user_id, p_reason,
         case when p_reason = 'eliminado' then null else p_reminder.id end,
         p_reminder.owner_id, p_reminder.title, p_reminder.description, p_reminder.start_at, p_reminder.end_at,
         p_reminder.all_day, p_reminder.category_id, p_reminder.location, p_reminder.note,
         coalesce((select array_agg(a.minutes_before order by a.minutes_before)
                     from public.reminder_alerts a
                    where a.reminder_id = p_reminder.id and a.user_id = p.user_id), '{}')
    from public.reminder_participants p
   where p.reminder_id = p_reminder.id
     and not exists (
       select 1 from public.reminder_decisions d
        where d.user_id = p.user_id and d.reminder_id = p_reminder.id and d.resolved_at is null
     );
$$;

revoke all on function private.create_decisions(public.reminders, text) from public, anon, authenticated;

-- El creador elimina: cada etiquetado decide. (Antes de borrar, para leer los
-- etiquetados y sus avisos; el borrado en cascada no notifica.)
create function private.on_reminder_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Una decisión pendiente por desactivación de este mismo recordatorio queda
  -- reemplazada por la de eliminado (primero se quita, para no bloquear la nueva).
  delete from public.reminder_decisions
   where reminder_id = old.id and reason = 'creador_desactivado' and resolved_at is null;
  perform private.create_decisions(old, 'eliminado');
  return old;
end;
$$;

revoke all on function private.on_reminder_delete() from public, anon, authenticated;

create trigger decisions_on_delete before delete on public.reminders
  for each row execute function private.on_reminder_delete();

-- Se desactiva a un usuario: los etiquetados de sus recordatorios que aún no
-- terminan deciden. Su información no se borra.
create function private.on_profile_deactivated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reminder public.reminders;
begin
  for v_reminder in
    select r.* from public.reminders r
     where r.owner_id = new.id
       and private.reminder_ends_at(r.start_at, r.end_at, r.all_day) > now()
       and exists (select 1 from public.reminder_participants p where p.reminder_id = r.id)
  loop
    perform private.create_decisions(v_reminder, 'creador_desactivado');
  end loop;
  return null;
end;
$$;

revoke all on function private.on_profile_deactivated() from public, anon, authenticated;

create trigger decisions_on_deactivate after update of active on public.profiles
  for each row when (old.active and not new.active)
  execute function private.on_profile_deactivated();

-- La copia que se conserva mantiene su categoría aunque esté desactivada.
create or replace function private.check_reminder_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and current_setting('app.copia_recordatorio', true) = 'on' then
    return new;
  end if;
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and not exists (select 1 from public.categories c where c.id = new.category_id and c.active) then
    raise exception 'La categoría seleccionada no existe o está desactivada.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- Las notificaciones solo se envían a usuarios activos (p. ej. no avisar
-- "salida" a un creador desactivado).
create or replace function private.notify(
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
  select p_user_id, p_kind, p_reminder.id, p_actor_id, p_reminder.title,
         jsonb_build_object('start_at', p_reminder.start_at, 'all_day', p_reminder.all_day) || p_extra
   where exists (select 1 from public.profiles u where u.id = p_user_id and u.active);
$$;

-- -----------------------------------------------------------------------------
-- Resolver una decisión. Devuelve el id de la copia (Conservar) o null (Eliminar).
-- -----------------------------------------------------------------------------
create function public.resolve_reminder_decision(p_id bigint, p_keep boolean)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_decision public.reminder_decisions;
  v_copy bigint;
begin
  if p_keep is null then
    raise exception 'Indique si conserva o elimina el recordatorio.' using errcode = '22023';
  end if;
  if not private.is_active_user() then
    raise exception 'No autorizado.' using errcode = '42501';
  end if;

  select * into v_decision from public.reminder_decisions
   where id = p_id and user_id = v_user
   for update;
  if not found then
    raise exception 'No se encontró la decisión.' using errcode = 'P0002';
  end if;
  if v_decision.resolved_at is not null then
    raise exception 'Esta decisión ya se tomó.' using errcode = 'P0001';
  end if;

  if p_keep then
    perform set_config('app.copia_recordatorio', 'on', true);
    insert into public.reminders (owner_id, title, description, start_at, end_at, all_day, category_id, location, note)
    values (
      v_user, v_decision.title, v_decision.description, v_decision.start_at, v_decision.end_at, v_decision.all_day,
      coalesce(v_decision.category_id,
               (select c.id from public.categories c where c.active order by c.id limit 1)),
      v_decision.location, v_decision.note
    )
    returning id into v_copy;
    perform set_config('app.copia_recordatorio', 'off', true);

    -- Los mismos avisos que tenía (en vez del aviso por defecto).
    delete from public.reminder_alerts where reminder_id = v_copy and user_id = v_user;
    insert into public.reminder_alerts (reminder_id, user_id, minutes_before)
    select v_copy, v_user, m from unnest(v_decision.alerts) as m group by m;
  end if;

  -- En ambos casos deja de participar en el original (si todavía existe).
  if v_decision.reminder_id is not null then
    delete from public.reminder_participants
     where reminder_id = v_decision.reminder_id and user_id = v_user;
  end if;

  update public.reminder_decisions
     set resolved_at = now(),
         decision = case when p_keep then 'conservar' else 'eliminar' end,
         kept_reminder_id = v_copy
   where id = p_id;

  return v_copy;
end;
$$;

revoke all on function public.resolve_reminder_decision(bigint, boolean) from public, anon, authenticated;
grant execute on function public.resolve_reminder_decision(bigint, boolean) to authenticated;
