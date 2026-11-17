-- =============================================================================
-- Fase 3: etiquetar usuarios en un recordatorio.
-- El recordatorio sigue siendo un único registro original; los etiquetados son
-- vínculos (reminder_participants), nunca copias. Las notificaciones de "quién
-- hizo qué" llegan en la Fase 4 y la ventana Conservar / Eliminar en la Fase 5.
-- =============================================================================

create table public.reminder_participants (
  reminder_id bigint not null references public.reminders (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete restrict,
  added_at timestamptz not null default now(),
  primary key (reminder_id, user_id)
);

create index reminder_participants_user_idx on public.reminder_participants (user_id);

comment on table public.reminder_participants is
  'Usuarios etiquetados en un recordatorio. El creador agrega o quita; cada etiquetado puede salirse.';

-- Solo se etiqueta a usuarios activos y nunca al propio creador.
create function private.check_reminder_participant()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.reminders r where r.id = new.reminder_id and r.owner_id = new.user_id) then
    raise exception 'El creador no se puede etiquetar en su propio recordatorio.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.profiles p where p.id = new.user_id and p.active) then
    raise exception 'Solo se puede etiquetar a usuarios activos.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function private.check_reminder_participant() from public, anon, authenticated;

create trigger check_participant before insert on public.reminder_participants
  for each row execute function private.check_reminder_participant();

-- -----------------------------------------------------------------------------
-- RLS: todos los usuarios activos ven quién está etiquetado (los calendarios
-- son visibles para todos). El creador del recordatorio agrega y quita; el
-- etiquetado puede quitarse a sí mismo (salirse).
-- -----------------------------------------------------------------------------
alter table public.reminder_participants enable row level security;

create policy "Usuarios activos ven etiquetados" on public.reminder_participants
  for select to authenticated
  using ((select private.is_active_user()));

create policy "El creador etiqueta" on public.reminder_participants
  for insert to authenticated
  with check (
    (select private.is_active_user())
    and exists (
      select 1 from public.reminders r
      where r.id = reminder_id and r.owner_id = (select auth.uid())
    )
  );

create policy "El creador quita o el etiquetado se sale" on public.reminder_participants
  for delete to authenticated
  using (
    (select private.is_active_user())
    and (
      user_id = (select auth.uid())
      or exists (
        select 1 from public.reminders r
        where r.id = reminder_id and r.owner_id = (select auth.uid())
      )
    )
  );

revoke all on public.reminder_participants from anon, authenticated;
grant select, delete on public.reminder_participants to authenticated;
grant insert (reminder_id, user_id) on public.reminder_participants to authenticated;

-- -----------------------------------------------------------------------------
-- Guardar un recordatorio con sus etiquetados en una sola transacción.
-- SECURITY INVOKER: corre con los permisos de quien llama, así que RLS y los
-- permisos por columna se aplican igual que en un insert/update directo.
-- p_id null = crear. Devuelve el id del recordatorio.
-- -----------------------------------------------------------------------------
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
  p_participants uuid[]
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

  return v_id;
end;
$$;

revoke all on function public.save_reminder(bigint, text, text, timestamptz, timestamptz, boolean, bigint, text, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.save_reminder(bigint, text, text, timestamptz, timestamptz, boolean, bigint, text, text, uuid[])
  to authenticated;

-- -----------------------------------------------------------------------------
-- Recordatorios de los calendarios elegidos ("Ver calendario de…") que se ven
-- en el rango [p_from, p_to): los creados por esas personas o en los que están
-- etiquetadas. SECURITY INVOKER: RLS decide qué se puede leer.
-- -----------------------------------------------------------------------------
create function public.calendar_reminders(p_user_ids uuid[], p_from timestamptz, p_to timestamptz)
returns setof public.reminders
language sql
stable
security invoker
set search_path = ''
as $$
  select r.*
    from public.reminders r
   where r.start_at < p_to
     and (r.end_at >= p_from or (r.end_at is null and r.start_at >= p_from))
     and (
       r.owner_id = any (p_user_ids)
       or exists (
         select 1 from public.reminder_participants p
          where p.reminder_id = r.id and p.user_id = any (p_user_ids)
       )
     )
   order by r.start_at, r.id;
$$;

revoke all on function public.calendar_reminders(uuid[], timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.calendar_reminders(uuid[], timestamptz, timestamptz) to authenticated;
