-- =============================================================================
-- Fase 1: usuarios, roles, colores identificadores, auditoría y seguridad base.
-- Principio: nada es accesible salvo lo que se concede explícitamente aquí.
-- Los perfiles no tienen escritura directa: todo cambio pasa por funciones que
-- validan el rol del llamador en la base de datos.
-- =============================================================================

-- Esquema para funciones auxiliares. No se expone en la Data API.
create schema if not exists private;
revoke all on schema private from public;

-- Exactamente dos tipos de usuario.
create type public.user_role as enum ('admin', 'user');

-- -----------------------------------------------------------------------------
-- Perfiles de usuario (1 a 1 con auth.users). Nunca se borran: se desactivan.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete restrict,
  username text not null unique
    constraint profiles_username_format check (username ~ '^[a-z0-9._-]{3,30}$'),
  full_name text not null
    constraint profiles_full_name_format
      check (full_name = btrim(full_name) and char_length(full_name) between 1 and 100),
  role public.user_role not null default 'user',
  -- Nace desactivado: solo el administrador activa cuentas (la Edge Function
  -- admin-users lo hace al crearlas). Así una cuenta creada fuera de la app
  -- nunca obtiene acceso aunque el registro público se habilitara por error.
  active boolean not null default false,
  must_change_password boolean not null default true,
  -- Color identificador del usuario (#rrggbb en minúsculas). Único entre todos
  -- los usuarios, activos o no, porque sus recordatorios lo siguen mostrando.
  color text not null
    constraint profiles_color_format check (color ~ '^#[0-9a-f]{6}$'),
  theme text not null default 'sistema'
    constraint profiles_theme_valid check (theme in ('claro', 'oscuro', 'sistema')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_color_unique on public.profiles (color);

comment on table public.profiles is 'Datos de cada usuario de la aplicación. Nunca se borran; se desactivan.';
comment on column public.profiles.color is
  'Color identificador del usuario (#rrggbb). Marca los recordatorios que crea en todos los calendarios.';
comment on column public.profiles.theme is 'Apariencia elegida por el usuario: claro, oscuro o sistema.';

-- -----------------------------------------------------------------------------
-- Auditoría de cambios administrativos
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id) on delete restrict,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at desc);
create index audit_log_actor_id_idx on public.audit_log (actor_id);

-- -----------------------------------------------------------------------------
-- Funciones auxiliares de permisos
-- -----------------------------------------------------------------------------
create function private.app_role()
returns public.user_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.active
$$;

comment on function private.app_role() is
  'Rol del usuario autenticado, o NULL si no existe o está desactivado.';

create function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.app_role() is not null
$$;

create function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.app_role() = 'admin', false)
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.app_role() to authenticated;
grant execute on function private.is_active_user() to authenticated;
grant execute on function private.is_admin() to authenticated;

-- -----------------------------------------------------------------------------
-- Colores: paleta sugerida (distinguibles entre sí) y elección automática.
-- El admin puede cambiar el color a cualquier RGB; esta paleta solo da un
-- valor inicial que no esté en uso.
-- -----------------------------------------------------------------------------
create function private.next_free_color()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_palette text[] := array[
    '#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626', '#0891b2',
    '#ca8a04', '#db2777', '#4f46e5', '#059669', '#b45309', '#475569',
    '#e11d48', '#0d9488', '#65a30d', '#c026d3'
  ];
  v_color text;
begin
  foreach v_color in array v_palette loop
    if not exists (select 1 from public.profiles where color = v_color) then
      return v_color;
    end if;
  end loop;

  -- Paleta agotada: un color aleatorio de intensidad media que no esté en uso.
  loop
    v_color := '#' || lpad(to_hex(40 + floor(random() * 176)::int), 2, '0')
                   || lpad(to_hex(40 + floor(random() * 176)::int), 2, '0')
                   || lpad(to_hex(40 + floor(random() * 176)::int), 2, '0');
    exit when not exists (select 1 from public.profiles where color = v_color);
  end loop;
  return v_color;
end;
$$;

-- -----------------------------------------------------------------------------
-- Triggers genéricos
-- -----------------------------------------------------------------------------
create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Registra altas y cambios administrativos en audit_log. Ignora preferencias
-- personales (tema) y marcas internas.
create function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb;
  v_ignored text[] := array['updated_at', 'must_change_password', 'theme'];
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values (
      (select auth.uid()),
      'crear',
      tg_table_name,
      new.id::text,
      to_jsonb(new) - v_ignored - 'created_at'
    );
    return new;
  end if;

  select coalesce(
           jsonb_object_agg(n.key, jsonb_build_object('antes', o.value, 'despues', n.value)),
           '{}'::jsonb
         )
    into v_changes
  from jsonb_each(to_jsonb(new)) n
  join jsonb_each(to_jsonb(old)) o on o.key = n.key
  where n.value is distinct from o.value
    and n.key <> all (v_ignored);

  if v_changes <> '{}'::jsonb then
    insert into public.audit_log (actor_id, action, entity, entity_id, details)
    values ((select auth.uid()), 'actualizar', tg_table_name, new.id::text, v_changes);
  end if;

  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- Alta automática del perfil al crear un usuario en Auth.
-- Nace como "user" DESACTIVADO, con un color libre. No se lee ningún metadato
-- (user_metadata es editable por el propio usuario).
-- El nombre de usuario es la parte local del correo interno (usuario@calendariogem.local).
-- -----------------------------------------------------------------------------
create function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_username text := lower(split_part(new.email, '@', 1));
begin
  insert into public.profiles (id, username, full_name, role, active, color)
  values (new.id, v_username, v_username, 'user', false, private.next_free_color());
  return new;
end;
$$;

revoke all on function private.next_free_color() from public, anon, authenticated;
revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.audit_row_change() from public, anon, authenticated;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create trigger set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

create trigger audit after insert or update on public.profiles
  for each row execute function private.audit_row_change();

-- -----------------------------------------------------------------------------
-- Row Level Security y permisos explícitos
-- -----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.audit_log enable row level security;

-- Todos los usuarios activos ven los perfiles: nombres y colores se muestran
-- en los calendarios ("Creado por") y al etiquetar.
create policy "Usuarios activos leen perfiles" on public.profiles
  for select to authenticated
  using ((select private.is_active_user()));

create policy "Admin lee auditoría" on public.audit_log
  for select to authenticated
  using ((select private.is_admin()));

revoke all on public.profiles, public.audit_log from anon, authenticated;
grant select on public.profiles to authenticated;
grant select on public.audit_log to authenticated;

-- =============================================================================
-- Funciones de administración y preferencias
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Cambiar nombre, rol, estado y color de un usuario (solo admin).
-- El admin no puede cambiar su propio rol ni desactivarse: así siempre queda
-- al menos un administrador activo.
-- -----------------------------------------------------------------------------
create function public.admin_update_user(
  p_user_id uuid,
  p_full_name text,
  p_role public.user_role,
  p_active boolean,
  p_color text
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
         color = v_color
   where id = p_user_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Marca que el usuario debe cambiar su contraseña (tras un restablecimiento).
-- La contraseña en sí la cambia la Edge Function con la API de Auth.
-- -----------------------------------------------------------------------------
create function public.admin_flag_password_reset(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Solo el administrador puede restablecer contraseñas.' using errcode = '42501';
  end if;

  update public.profiles set must_change_password = true where id = p_user_id;
  if not found then
    raise exception 'El usuario no existe.' using errcode = 'P0001';
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values ((select auth.uid()), 'restablecer_contrasena', 'profiles', p_user_id::text, '{}'::jsonb);
end;
$$;

-- -----------------------------------------------------------------------------
-- El propio usuario indica que ya cambió su contraseña temporal.
-- -----------------------------------------------------------------------------
create function public.complete_password_change()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'Sesión no válida.' using errcode = '42501';
  end if;

  update public.profiles
     set must_change_password = false
   where id = (select auth.uid());
end;
$$;

-- -----------------------------------------------------------------------------
-- Apariencia elegida por el propio usuario.
-- -----------------------------------------------------------------------------
create function public.set_my_theme(p_theme text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_user() then
    raise exception 'Sesión no válida.' using errcode = '42501';
  end if;

  if p_theme is null or p_theme not in ('claro', 'oscuro', 'sistema') then
    raise exception 'Tema no válido.' using errcode = 'P0001';
  end if;

  update public.profiles set theme = p_theme where id = (select auth.uid());
end;
$$;

revoke all on function public.admin_update_user(uuid, text, public.user_role, boolean, text)
  from public, anon, authenticated;
revoke all on function public.admin_flag_password_reset(uuid) from public, anon, authenticated;
revoke all on function public.complete_password_change() from public, anon, authenticated;
revoke all on function public.set_my_theme(text) from public, anon, authenticated;

grant execute on function public.admin_update_user(uuid, text, public.user_role, boolean, text) to authenticated;
grant execute on function public.admin_flag_password_reset(uuid) to authenticated;
grant execute on function public.complete_password_change() to authenticated;
grant execute on function public.set_my_theme(text) to authenticated;
