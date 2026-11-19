-- =============================================================================
-- Fase 11, ajustes pedidos por el usuario (19/11/2026):
--
-- * En el calendario general no se etiqueta a personas.
-- * En el calendario general no se usan categorías personales. El admin marca
--   cuáles lo son (categories.personal_only); "Personal" ya viene marcada.
-- * Si se elimina un recordatorio del general que todavía no pasó, los demás
--   usuarios con acceso deciden si conservan una copia en su calendario
--   personal (la misma ventana Conservar / Eliminar de los etiquetados). Si ya
--   pasó, solo reciben la notificación "eliminado", como antes.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Categorías solo para calendarios personales
-- -----------------------------------------------------------------------------
alter table public.categories
  add column personal_only boolean not null default false;

comment on column public.categories.personal_only is
  'true = solo para calendarios personales: no se puede usar en el calendario general.';

update public.categories set personal_only = true where lower(name) = 'personal';

grant insert (personal_only) on public.categories to authenticated;
grant update (personal_only) on public.categories to authenticated;

-- -----------------------------------------------------------------------------
-- Reglas del calendario general al guardar un recordatorio
-- -----------------------------------------------------------------------------
create or replace function private.check_reminder_general()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category text;
begin
  if not new.is_general then
    return new;
  end if;

  if (tg_op = 'INSERT' or not old.is_general) and not private.has_general_access() then
    raise exception 'No tiene acceso al calendario general.' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' or not old.is_general or new.category_id is distinct from old.category_id then
    select c.name into v_category from public.categories c where c.id = new.category_id and c.personal_only;
    if found then
      raise exception 'La categoría «%» es solo para calendarios personales: elija otra para el calendario general.', v_category
        using errcode = 'P0001';
    end if;
  end if;

  if tg_op = 'UPDATE' and not old.is_general
     and exists (select 1 from public.reminder_participants p where p.reminder_id = new.id) then
    raise exception 'En el calendario general no se etiqueta a personas. Quite a los etiquetados antes de publicarlo.'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger check_general on public.reminders;
create trigger check_general before insert or update of is_general, category_id on public.reminders
  for each row execute function private.check_reminder_general();

-- No se etiqueta a nadie en un recordatorio del calendario general.
create or replace function private.check_reminder_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.reminders r where r.id = new.reminder_id and r.is_general) then
    raise exception 'En el calendario general no se etiqueta a personas.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.reminders r where r.id = new.reminder_id and r.owner_id = new.user_id) then
    raise exception 'El creador no se puede etiquetar en su propio recordatorio.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = new.user_id and p.active) then
    raise exception 'Solo se puede etiquetar a usuarios activos.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- save_reminder: al modificar, primero se quita a los etiquetados que ya no
-- están (así un recordatorio se puede pasar al general en un solo guardado).
-- Misma firma y mismas reglas que antes (SECURITY INVOKER).
-- -----------------------------------------------------------------------------
create or replace function public.save_reminder(
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
  p_alerts integer[] default null,
  p_is_general boolean default null
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
    insert into public.reminders (title, description, start_at, end_at, all_day, category_id, location, note, is_general)
    values (p_title, p_description, p_start_at, p_end_at, p_all_day, p_category_id, p_location, p_note,
            coalesce(p_is_general, false))
    returning id into v_id;
  else
    if not private.is_reminder_owner(p_id) then
      raise exception 'Solo el creador puede modificar este recordatorio.' using errcode = '42501';
    end if;

    -- Quitar a quienes ya no están en la lista.
    delete from public.reminder_participants
     where reminder_id = p_id and not (user_id = any (v_participants));

    update public.reminders
       set title = p_title, description = p_description, start_at = p_start_at, end_at = p_end_at,
           all_day = p_all_day, category_id = p_category_id, location = p_location, note = p_note,
           is_general = coalesce(p_is_general, is_general)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Solo el creador puede modificar este recordatorio.' using errcode = '42501';
    end if;
  end if;

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

-- -----------------------------------------------------------------------------
-- Eliminar un recordatorio del general: los demás con acceso deciden si
-- conservan una copia (motivo "general_eliminado").
-- -----------------------------------------------------------------------------
alter table public.reminder_decisions drop constraint reminder_decisions_reason;
alter table public.reminder_decisions add constraint reminder_decisions_reason
  check (reason in ('eliminado', 'creador_desactivado', 'general_eliminado'));

create function private.create_general_decisions(p_reminder public.reminders, p_actor_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.reminder_decisions
    (user_id, reason, reminder_id, former_owner_id, title, description, start_at, end_at, all_day,
     category_id, location, note, alerts)
  select u.id, 'general_eliminado', null, p_reminder.owner_id, p_reminder.title, p_reminder.description,
         p_reminder.start_at, p_reminder.end_at, p_reminder.all_day, p_reminder.category_id,
         p_reminder.location, p_reminder.note,
         -- Sus avisos, si tenía; si no, el aviso por defecto.
         coalesce((select array_agg(a.minutes_before order by a.minutes_before)
                     from public.reminder_alerts a
                    where a.reminder_id = p_reminder.id and a.user_id = u.id),
                  array[private.default_alert_minutes(p_reminder.all_day)])
    from public.profiles u
   where u.active
     and u.general_access
     and u.id is distinct from p_reminder.owner_id
     and u.id is distinct from p_actor_id
     and not exists (
       select 1 from public.reminder_participants p where p.reminder_id = p_reminder.id and p.user_id = u.id
     );
$$;

revoke all on function private.create_general_decisions(public.reminders, uuid) from public, anon, authenticated;

create or replace function private.on_general_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := coalesce((select auth.uid()), old.owner_id);
begin
  if private.reminder_ends_at(old.start_at, old.end_at, old.all_day) > now() then
    perform private.create_general_decisions(old, v_actor);
  else
    perform private.notify_general(old, 'eliminado', v_actor);
  end if;
  return old;
end;
$$;
