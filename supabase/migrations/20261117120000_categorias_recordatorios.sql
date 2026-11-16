-- =============================================================================
-- Fase 2: categorías (solo admin) y recordatorios (cada usuario los suyos).
-- Los etiquetados, notificaciones y la ventana Conservar / Eliminar llegan en
-- fases posteriores; aquí solo existe el registro original y su dueño.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Categorías: nombre y color configurables por el admin. Nunca se borran si
-- hay recordatorios que las usan (se desactivan y conservan su información).
-- -----------------------------------------------------------------------------
create table public.categories (
  id bigint generated always as identity primary key,
  name text not null
    constraint categories_name_format
      check (name = btrim(name) and char_length(name) between 1 and 40),
  color text not null
    constraint categories_color_format check (color ~ '^#[0-9a-f]{6}$'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_name_unique on public.categories (lower(name));

comment on table public.categories is
  'Categorías de recordatorios. Si una categoría está en uso, "eliminar" solo la desactiva.';

insert into public.categories (name, color) values
  ('Reunión', '#2563eb'),
  ('Vencimiento', '#dc2626'),
  ('Tarea', '#16a34a'),
  ('Personal', '#9333ea'),
  ('Feriado', '#ca8a04');

-- -----------------------------------------------------------------------------
-- Recordatorios / eventos. Un único registro original por recordatorio, con un
-- único dueño (owner_id). Las fechas se guardan como instantes (timestamptz);
-- la app las muestra en hora de Costa Rica.
-- -----------------------------------------------------------------------------
create table public.reminders (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete restrict,
  title text not null
    constraint reminders_title_format
      check (title = btrim(title) and char_length(title) between 1 and 150),
  description text
    constraint reminders_description_length check (description is null or char_length(description) <= 2000),
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  category_id bigint not null references public.categories (id) on delete restrict,
  location text
    constraint reminders_location_length check (location is null or char_length(location) <= 300),
  note text
    constraint reminders_note_length check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reminders_end_after_start check (end_at is null or end_at >= start_at)
);

create index reminders_owner_start_idx on public.reminders (owner_id, start_at);
create index reminders_start_idx on public.reminders (start_at);
create index reminders_category_idx on public.reminders (category_id);

comment on column public.reminders.owner_id is
  'Creador original. Solo él puede modificar o eliminar el recordatorio.';
comment on column public.reminders.all_day is
  'Evento de todo el día: start_at (y end_at, si hay) son la medianoche de Costa Rica del día correspondiente.';

-- -----------------------------------------------------------------------------
-- Reglas de negocio
-- -----------------------------------------------------------------------------

-- Solo se puede asignar una categoría activa. Un recordatorio que ya usa una
-- categoría desactivada la conserva mientras no se cambie.
create function private.check_reminder_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (tg_op = 'INSERT' or new.category_id is distinct from old.category_id)
     and not exists (select 1 from public.categories c where c.id = new.category_id and c.active) then
    raise exception 'La categoría seleccionada no existe o está desactivada.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

-- El dueño no cambia nunca.
create function private.keep_reminder_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.owner_id := old.owner_id;
  return new;
end;
$$;

revoke all on function private.check_reminder_category() from public, anon, authenticated;
revoke all on function private.keep_reminder_owner() from public, anon, authenticated;

create trigger set_updated_at before update on public.categories
  for each row execute function private.set_updated_at();
create trigger audit after insert or update on public.categories
  for each row execute function private.audit_row_change();

create trigger set_updated_at before update on public.reminders
  for each row execute function private.set_updated_at();
create trigger check_category before insert or update of category_id on public.reminders
  for each row execute function private.check_reminder_category();
create trigger keep_owner before update on public.reminders
  for each row execute function private.keep_reminder_owner();

-- -----------------------------------------------------------------------------
-- Row Level Security y permisos
-- -----------------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.reminders enable row level security;

create policy "Usuarios activos leen categorías" on public.categories
  for select to authenticated
  using ((select private.is_active_user()));

create policy "Admin crea categorías" on public.categories
  for insert to authenticated
  with check ((select private.is_admin()));

create policy "Admin modifica categorías" on public.categories
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- Todos los calendarios se pueden consultar (acordado con el usuario); solo el
-- dueño modifica o elimina.
create policy "Usuarios activos leen recordatorios" on public.reminders
  for select to authenticated
  using ((select private.is_active_user()));

create policy "Usuarios crean sus recordatorios" on public.reminders
  for insert to authenticated
  with check ((select private.is_active_user()) and owner_id = (select auth.uid()));

create policy "El dueño modifica sus recordatorios" on public.reminders
  for update to authenticated
  using ((select private.is_active_user()) and owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "El dueño elimina sus recordatorios" on public.reminders
  for delete to authenticated
  using ((select private.is_active_user()) and owner_id = (select auth.uid()));

revoke all on public.categories, public.reminders from anon, authenticated;

grant select on public.categories to authenticated;
grant insert (name, color) on public.categories to authenticated;
grant update (name, color, active) on public.categories to authenticated;

grant select, delete on public.reminders to authenticated;
grant insert (title, description, start_at, end_at, all_day, category_id, location, note)
  on public.reminders to authenticated;
grant update (title, description, start_at, end_at, all_day, category_id, location, note)
  on public.reminders to authenticated;

-- -----------------------------------------------------------------------------
-- Eliminar una categoría (solo admin): si algún recordatorio la usa se
-- desactiva; si no, se borra. Devuelve 'eliminada' o 'desactivada'.
-- -----------------------------------------------------------------------------
create function public.admin_delete_category(p_category_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede eliminar categorías.' using errcode = '42501';
  end if;

  select name into v_name from public.categories where id = p_category_id for update;
  if not found then
    raise exception 'La categoría no existe.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.reminders where category_id = p_category_id) then
    update public.categories set active = false where id = p_category_id;
    return 'desactivada';
  end if;

  delete from public.categories where id = p_category_id;
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'eliminar', 'categories', p_category_id::text, jsonb_build_object('name', v_name));
  return 'eliminada';
end;
$$;

revoke all on function public.admin_delete_category(bigint) from public, anon, authenticated;
grant execute on function public.admin_delete_category(bigint) to authenticated;
