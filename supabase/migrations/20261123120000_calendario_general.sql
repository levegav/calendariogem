-- =============================================================================
-- Fase 11: calendario general.
--
-- * El admin marca a qué usuarios les da "Acceso al calendario general"
--   (profiles.general_access). Puede ser un usuario o un admin.
-- * Un recordatorio puede estar en el calendario personal de su creador o en el
--   calendario general (reminders.is_general). Solo quien tiene acceso puede
--   publicar en el general; solo el creador modifica o elimina, como siempre.
-- * Quien tiene acceso ve siempre, junto con lo suyo, todo lo del calendario
--   general. Los demás usuarios no lo ven (salvo los recordatorios en los que
--   están etiquetados). El admin ya ve todo.
-- * Cuando alguien publica, modifica, retira o elimina un recordatorio del
--   calendario general, los demás usuarios con acceso reciben una notificación
--   ("general"). Los etiquetados no la reciben: ya les llegan las suyas.
-- * Si a alguien se le quita el acceso, lo que publicó sigue en el calendario
--   general (lo sigue viendo y modificando porque es suyo).
-- =============================================================================

alter table public.profiles
  add column general_access boolean not null default false;

comment on column public.profiles.general_access is
  'Acceso al calendario general: ve sus recordatorios y puede publicar en él. Lo asigna el admin.';

alter table public.reminders
  add column is_general boolean not null default false;

comment on column public.reminders.is_general is
  'true = publicado en el calendario general (lo ven todos los usuarios con acceso); false = calendario personal del creador.';

create index reminders_general_start_idx on public.reminders (start_at) where is_general;

-- -----------------------------------------------------------------------------
-- Funciones auxiliares
-- -----------------------------------------------------------------------------
create function private.has_general_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.general_access from public.profiles p where p.id = (select auth.uid()) and p.active),
    false
  );
$$;

comment on function private.has_general_access() is
  'true si el usuario autenticado está activo y tiene acceso al calendario general.';

create function private.is_general_reminder(p_reminder_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.reminders r where r.id = p_reminder_id and r.is_general);
$$;

revoke all on function private.has_general_access() from public, anon;
revoke all on function private.is_general_reminder(bigint) from public, anon;
grant execute on function private.has_general_access() to authenticated;
grant execute on function private.is_general_reminder(bigint) to authenticated;

-- -----------------------------------------------------------------------------
-- Lectura: el calendario general lo ven quienes tienen acceso
-- -----------------------------------------------------------------------------
drop policy "Admin ve todos; usuario ve los suyos y donde está etiquetado" on public.reminders;

create policy "Admin ve todos; usuario ve los suyos, donde está etiquetado y el general si tiene acceso"
  on public.reminders
  for select to authenticated
  using (
    (select private.is_active_user())
    and (
      (select private.is_admin())
      or owner_id = (select auth.uid())
      or private.is_reminder_participant(id)
      or (is_general and (select private.has_general_access()))
    )
  );

drop policy "Ven etiquetados el admin, el creador y los etiquetados" on public.reminder_participants;

create policy "Ven etiquetados el admin, el creador, los etiquetados y el calendario general"
  on public.reminder_participants
  for select to authenticated
  using (
    (select private.is_active_user())
    and (
      (select private.is_admin())
      or user_id = (select auth.uid())
      or private.is_reminder_owner(reminder_id)
      or private.is_reminder_participant(reminder_id)
      or (private.is_general_reminder(reminder_id) and (select private.has_general_access()))
    )
  );

-- -----------------------------------------------------------------------------
-- Escritura: solo quien tiene acceso publica en el calendario general.
-- Quien perdió el acceso puede seguir modificando lo que ya había publicado
-- (sin cambiarlo de calendario hacia el general).
-- -----------------------------------------------------------------------------
create function private.check_reminder_general()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_general
     and (tg_op = 'INSERT' or not old.is_general)
     and not private.has_general_access() then
    raise exception 'No tiene acceso al calendario general.' using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function private.check_reminder_general() from public, anon, authenticated;

create trigger check_general before insert or update of is_general on public.reminders
  for each row execute function private.check_reminder_general();

grant insert (is_general) on public.reminders to authenticated;
grant update (is_general) on public.reminders to authenticated;

-- -----------------------------------------------------------------------------
-- Notificaciones del calendario general
-- -----------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_kind;
alter table public.notifications add constraint notifications_kind
  check (kind in ('etiquetado', 'quitado', 'salida', 'modificado', 'aviso', 'general'));

comment on column public.notifications.data is
  'start_at y all_day del recordatorio; "modificado": changes y before; "aviso": minutes_before; '
  '"general": accion (publicado, modificado, retirado, eliminado) y, si se modificó, changes y before.';

-- Qué cambió entre dos versiones de un recordatorio (lo que se avisa).
create function private.reminder_changes(p_old public.reminders, p_new public.reminders)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array_remove(array[
    case when p_new.title is distinct from p_old.title then 'titulo' end,
    case when p_new.start_at is distinct from p_old.start_at or p_new.end_at is distinct from p_old.end_at
              or p_new.all_day is distinct from p_old.all_day then 'horario' end,
    case when p_new.category_id is distinct from p_old.category_id then 'categoria' end,
    case when p_new.location is distinct from p_old.location then 'ubicacion' end,
    case when p_new.description is distinct from p_old.description then 'descripcion' end,
    case when p_new.note is distinct from p_old.note then 'nota' end
  ], null);
$$;

revoke all on function private.reminder_changes(public.reminders, public.reminders) from public, anon, authenticated;

-- Avisa a los usuarios activos con acceso al calendario general, menos a quien
-- hizo el cambio y a los etiquetados del recordatorio (ellos reciben las suyas).
create function private.notify_general(p_reminder public.reminders, p_action text, p_actor_id uuid, p_extra jsonb default '{}')
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, reminder_id, actor_id, reminder_title, data)
  select u.id, 'general', p_reminder.id, p_actor_id, p_reminder.title,
         jsonb_build_object('start_at', p_reminder.start_at, 'all_day', p_reminder.all_day, 'accion', p_action) || p_extra
    from public.profiles u
   where u.active
     and u.general_access
     and u.id is distinct from p_actor_id
     and not exists (
       select 1 from public.reminder_participants p where p.reminder_id = p_reminder.id and p.user_id = u.id
     );
$$;

revoke all on function private.notify_general(public.reminders, text, uuid, jsonb) from public, anon, authenticated;

-- Publicado en el general. Diferido (al confirmar), para que save_reminder ya
-- haya guardado a los etiquetados.
create function private.on_general_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current public.reminders;
begin
  select * into v_current from public.reminders where id = new.id;
  if not found or not v_current.is_general then
    return null;
  end if;
  perform private.notify_general(v_current, 'publicado', v_current.owner_id);
  return null;
end;
$$;

create constraint trigger notify_general_insert after insert on public.reminders
  deferrable initially deferred
  for each row when (new.is_general)
  execute function private.on_general_insert();

-- Modificado, publicado (pasó de personal a general) o retirado (de general a personal).
create function private.on_general_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes text[];
begin
  if not exists (select 1 from public.reminders where id = new.id) then
    return null;
  end if;

  if new.is_general and not old.is_general then
    perform private.notify_general(new, 'publicado', new.owner_id);
  elsif old.is_general and not new.is_general then
    perform private.notify_general(new, 'retirado', new.owner_id);
  else
    v_changes := private.reminder_changes(old, new);
    if cardinality(v_changes) > 0 then
      perform private.notify_general(
        new, 'modificado', new.owner_id,
        jsonb_build_object(
          'changes', to_jsonb(v_changes),
          'before', jsonb_build_object('title', old.title, 'start_at', old.start_at, 'end_at', old.end_at, 'all_day', old.all_day)
        )
      );
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger notify_general_change after update on public.reminders
  deferrable initially deferred
  for each row when (old.is_general or new.is_general)
  execute function private.on_general_change();

-- Eliminado del general (antes de borrar, para saber quiénes estaban etiquetados).
create function private.on_general_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.notify_general(old, 'eliminado', coalesce((select auth.uid()), old.owner_id));
  return old;
end;
$$;

create trigger notify_general_delete before delete on public.reminders
  for each row when (old.is_general)
  execute function private.on_general_delete();

revoke all on function private.on_general_insert() from public, anon, authenticated;
revoke all on function private.on_general_change() from public, anon, authenticated;
revoke all on function private.on_general_delete() from public, anon, authenticated;

-- El aviso a los etiquetados usa la misma comparación (misma regla que antes).
create or replace function private.on_reminder_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes text[] := private.reminder_changes(old, new);
begin
  if cardinality(v_changes) = 0 then
    return null;
  end if;

  -- Si se eliminó en la misma transacción, no hay a quién avisar.
  if not exists (select 1 from public.reminders where id = new.id) then
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

-- -----------------------------------------------------------------------------
-- save_reminder: nuevo parámetro p_is_general (null = al crear, personal; al
-- modificar, no cambiarlo de calendario). SECURITY INVOKER, como antes.
-- -----------------------------------------------------------------------------
drop function public.save_reminder(bigint, text, text, timestamptz, timestamptz, boolean, bigint, text, text, uuid[], integer[]);

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

revoke all on function public.save_reminder(bigint, text, text, timestamptz, timestamptz, boolean, bigint, text, text, uuid[], integer[], boolean)
  from public, anon, authenticated;
grant execute on function public.save_reminder(bigint, text, text, timestamptz, timestamptz, boolean, bigint, text, text, uuid[], integer[], boolean)
  to authenticated;

-- -----------------------------------------------------------------------------
-- Calendario y búsqueda: quien tiene acceso recibe siempre, además de los
-- calendarios elegidos, todo el calendario general.
-- -----------------------------------------------------------------------------
create or replace function public.calendar_reminders(p_user_ids uuid[], p_from timestamptz, p_to timestamptz)
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
       or (r.is_general and (select private.has_general_access()))
     )
   order by r.start_at, r.id;
$$;

create or replace function public.search_reminders(p_user_ids uuid[], p_query text, p_limit integer default 100)
returns setof public.reminders
language sql
stable
security invoker
set search_path = ''
as $$
  with terms as (
    select array_agg(t) as words
      from unnest(regexp_split_to_array(private.normalize_text(btrim(p_query)), '\s+')) as t
     where t <> ''
  )
  select r.*
    from public.reminders r, terms
   where terms.words is not null
     and (
       r.owner_id = any (p_user_ids)
       or exists (
         select 1 from public.reminder_participants p
          where p.reminder_id = r.id and p.user_id = any (p_user_ids)
       )
       or (r.is_general and (select private.has_general_access()))
     )
     and not exists (
       select 1 from unnest(terms.words) as w
        where strpos(
                private.normalize_text(concat_ws(' ', r.title, r.description, r.location, r.note)),
                w
              ) = 0
     )
   -- Primero lo más cercano a hoy (hacia adelante o hacia atrás).
   order by abs(extract(epoch from (r.start_at - now()))), r.id
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

-- -----------------------------------------------------------------------------
-- admin_update_user: nuevo parámetro p_general_access (null = no cambiarlo).
-- -----------------------------------------------------------------------------
drop function public.admin_update_user(uuid, text, public.user_role, boolean, text);

create function public.admin_update_user(
  p_user_id uuid,
  p_full_name text,
  p_role public.user_role,
  p_active boolean,
  p_color text,
  p_general_access boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_full_name text := btrim(coalesce(p_full_name, ''));
  v_color text := lower(btrim(coalesce(p_color, '')));
  v_current public.profiles;
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede modificar usuarios.' using errcode = '42501';
  end if;

  select * into v_current from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'El usuario no existe.' using errcode = 'P0001';
  end if;

  if char_length(v_full_name) not between 1 and 100 then
    raise exception 'El nombre completo debe tener entre 1 y 100 caracteres.' using errcode = 'P0001';
  end if;

  if p_role is null or p_active is null then
    raise exception 'Debe indicar el rol y el estado.' using errcode = 'P0001';
  end if;

  if v_color !~ '^#[0-9a-f]{6}$' then
    raise exception 'El color no es válido. Use el formato #RRGGBB.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.profiles where color = v_color and id <> p_user_id) then
    raise exception 'Ese color ya lo usa otro usuario. Elija uno distinto.' using errcode = 'P0001';
  end if;

  if p_user_id = v_actor and (p_role <> v_current.role or p_active <> v_current.active) then
    raise exception 'No puede cambiar su propio rol ni desactivar su propia cuenta.' using errcode = 'P0001';
  end if;

  update public.profiles
     set full_name = v_full_name,
         role = p_role,
         active = p_active,
         color = v_color,
         general_access = coalesce(p_general_access, general_access)
   where id = p_user_id;
end;
$$;

revoke all on function public.admin_update_user(uuid, text, public.user_role, boolean, text, boolean)
  from public, anon, authenticated;
grant execute on function public.admin_update_user(uuid, text, public.user_role, boolean, text, boolean) to authenticated;
