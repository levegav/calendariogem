-- =============================================================================
-- Fase 12: reuniones de Outlook (un solo sentido: Outlook -> Calendario GEM).
--
-- * El admin le asigna a cada usuario su correo de Outlook (outlook_links).
-- * La Edge Function `outlook-sync` lee los calendarios por EWS con una cuenta de
--   servicio de solo lectura y guarda aquí las reuniones (outlook_events).
-- * pg_cron la llama cada minuto mediante pg_net. La dirección de la función y
--   su token se guardan en Vault (no en el código): si faltan, no se llama.
-- * Las reuniones son de solo lectura: cada quien ve las suyas y el admin, todas.
-- =============================================================================

create extension if not exists pg_net with schema extensions;

-- -----------------------------------------------------------------------------
-- Correo de Outlook de cada usuario y estado de su sincronización
-- -----------------------------------------------------------------------------
create table public.outlook_links (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  email text not null unique
    check (email = lower(email) and email ~ '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,}$'),
  -- pendiente: aún no se consulta · ok · sin_permiso: falta el permiso de Revisor ·
  -- no_encontrado: el buzón no existe · error: otro problema (ver status_detail)
  status text not null default 'pendiente'
    check (status in ('pendiente', 'ok', 'sin_permiso', 'no_encontrado', 'error')),
  status_detail text,
  -- Última consulta a Outlook (con o sin cambios) y última vez que se trajeron reuniones.
  checked_at timestamptz,
  refreshed_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.outlook_links is
  'Correo de Outlook de cada usuario cuyo calendario se sincroniza, y el estado de la sincronización.';

-- Estado interno de EWS (no se expone a la app).
create table private.outlook_sync (
  user_id uuid primary key references public.outlook_links (user_id) on delete cascade,
  sync_state text,
  full_at timestamptz
);

-- Evita que dos ejecuciones de la sincronización se pisen.
create table private.outlook_runner (
  id boolean primary key default true check (id),
  busy_until timestamptz not null default '-infinity'
);
insert into private.outlook_runner default values;

-- -----------------------------------------------------------------------------
-- Reuniones importadas (ventana: un mes atrás y tres meses adelante)
-- -----------------------------------------------------------------------------
create table public.outlook_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id text not null,
  subject text not null default '',
  start_at timestamptz not null,
  -- En las de todo el día, como en Outlook: la medianoche siguiente al último día.
  end_at timestamptz not null,
  all_day boolean not null default false,
  location text,
  organizer_name text,
  organizer_email text,
  -- [{ "name": "...", "email": "...", "response": "Accept|Decline|Tentative|Unknown|...", "optional": bool }]
  attendees jsonb not null default '[]',
  join_url text,
  is_recurring boolean not null default false,
  is_cancelled boolean not null default false,
  -- Free | Tentative | Busy | OOF | WorkingElsewhere | NoData
  show_as text,
  -- Organizer | Accept | Tentative | Decline | NoResponseReceived | Unknown
  my_response text,
  unique (user_id, item_id),
  check (end_at >= start_at)
);

create index outlook_events_user_start_idx on public.outlook_events (user_id, start_at);

alter table public.outlook_links enable row level security;
alter table public.outlook_events enable row level security;
alter table private.outlook_sync enable row level security;
alter table private.outlook_runner enable row level security;

create policy "Cada quien ve su vínculo; el admin, todos" on public.outlook_links
  for select to authenticated
  using ((select private.is_admin()) or (user_id = (select auth.uid()) and (select private.is_active_user())));

create policy "Cada quien ve sus reuniones; el admin, todas" on public.outlook_events
  for select to authenticated
  using ((select private.is_admin()) or (user_id = (select auth.uid()) and (select private.is_active_user())));

-- Solo lectura para la app: escribe la sincronización (service_role) mediante funciones.
revoke all on public.outlook_links, public.outlook_events from anon, authenticated;
grant select on public.outlook_links, public.outlook_events to authenticated;

-- -----------------------------------------------------------------------------
-- Admin: asignar, cambiar o quitar el correo de Outlook de un usuario
-- -----------------------------------------------------------------------------
create function public.admin_set_outlook_email(p_user_id uuid, p_email text)
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

  if v_email is null then
    -- Sin correo: deja de sincronizarse y se borran sus reuniones importadas.
    delete from public.outlook_links where user_id = p_user_id;
    delete from public.outlook_events where user_id = p_user_id;
    return;
  end if;

  if v_email !~ '^[a-z0-9._%+''-]+@[a-z0-9.-]+\.[a-z]{2,}$' then
    raise exception 'El correo de Outlook no es válido.' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.outlook_links where email = v_email and user_id <> p_user_id) then
    raise exception 'Ese correo de Outlook ya está asignado a otro usuario.' using errcode = 'P0001';
  end if;

  if v_current is not distinct from v_email then
    return;
  end if;

  -- Correo nuevo o distinto: se empieza de cero con el buzón nuevo.
  delete from public.outlook_links where user_id = p_user_id;
  delete from public.outlook_events where user_id = p_user_id;
  insert into public.outlook_links (user_id, email) values (p_user_id, v_email);
end;
$$;

revoke all on function public.admin_set_outlook_email(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_outlook_email(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Consultas de la app
-- -----------------------------------------------------------------------------

-- Reuniones de los calendarios elegidos que se ven en el rango [desde, hasta).
create function public.calendar_outlook_events(p_user_ids uuid[], p_from timestamptz, p_to timestamptz)
returns setof public.outlook_events
language sql
stable
security invoker
set search_path = ''
as $$
  select e.*
    from public.outlook_events e
   where e.user_id = any (p_user_ids)
     and e.start_at < p_to
     and (e.end_at > p_from or (e.end_at = e.start_at and e.start_at >= p_from))
   order by e.start_at, e.id;
$$;

-- Búsqueda (asunto, ubicación y organizador; sin importar tildes; todas las palabras).
create function public.search_outlook_events(p_user_ids uuid[], p_query text, p_limit integer default 100)
returns setof public.outlook_events
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
  select e.*
    from public.outlook_events e, terms
   where terms.words is not null
     and e.user_id = any (p_user_ids)
     and not exists (
       select 1 from unnest(terms.words) as w
        where strpos(private.normalize_text(concat_ws(' ', e.subject, e.location, e.organizer_name)), w) = 0
     )
   order by abs(extract(epoch from (e.start_at - now()))), e.id
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.calendar_outlook_events(uuid[], timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function public.search_outlook_events(uuid[], text, integer) from public, anon, authenticated;
grant execute on function public.calendar_outlook_events(uuid[], timestamptz, timestamptz) to authenticated;
grant execute on function public.search_outlook_events(uuid[], text, integer) to authenticated;

-- -----------------------------------------------------------------------------
-- Funciones de la sincronización (solo service_role: la Edge Function)
-- -----------------------------------------------------------------------------

-- Toma el turno de sincronizar por unos segundos. false = otra ejecución está en curso.
create function public.outlook_claim_run(p_seconds integer default 50)
returns boolean
language sql
security definer
set search_path = ''
as $$
  update private.outlook_runner
     set busy_until = now() + make_interval(secs => least(greatest(p_seconds, 5), 120))
   where id and busy_until < now()
  returning true;
$$;

create function public.outlook_release_run()
returns void
language sql
security definer
set search_path = ''
as $$
  update private.outlook_runner set busy_until = '-infinity' where id;
$$;

-- Usuarios activos a sincronizar, con su estado de EWS. needs_full: toca la
-- actualización completa del día (o nunca se hizo).
create function public.outlook_sync_targets(p_user_id uuid default null)
returns table (user_id uuid, email text, sync_state text, needs_full boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select l.user_id, l.email, s.sync_state,
         s.full_at is null or s.full_at < now() - interval '1 day' or s.sync_state is null
    from public.outlook_links l
    join public.profiles p on p.id = l.user_id and p.active
    left join private.outlook_sync s on s.user_id = l.user_id
   where p_user_id is null or l.user_id = p_user_id
   order by l.checked_at nulls first, l.user_id;
$$;

-- Guarda el resultado de un usuario. p_events = null: no hubo cambios (solo se
-- actualiza el estado); si no, reemplaza todas sus reuniones por las recibidas.
create function public.outlook_save_result(
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

  update public.outlook_links
     set status = p_status,
         status_detail = left(p_detail, 500),
         checked_at = now(),
         refreshed_at = case when p_events is not null then now() else refreshed_at end
   where user_id = p_user_id;

  if p_status = 'ok' then
    insert into private.outlook_sync as s (user_id, sync_state, full_at)
    values (p_user_id, p_sync_state, case when p_full then now() end)
    on conflict (user_id) do update
      set sync_state = coalesce(excluded.sync_state, s.sync_state),
          full_at = case when p_full then now() else s.full_at end;
  elsif p_status in ('sin_permiso', 'no_encontrado') then
    -- Sin acceso al buzón: no se muestran reuniones viejas y, al recuperar el
    -- acceso, se vuelve a leer todo.
    delete from public.outlook_events where user_id = p_user_id;
    delete from private.outlook_sync where user_id = p_user_id;
  end if;
end;
$$;

revoke all on function public.outlook_claim_run(integer) from public, anon, authenticated;
revoke all on function public.outlook_release_run() from public, anon, authenticated;
revoke all on function public.outlook_sync_targets(uuid) from public, anon, authenticated;
revoke all on function public.outlook_save_result(uuid, text, text, text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.outlook_claim_run(integer) to service_role;
grant execute on function public.outlook_release_run() to service_role;
grant execute on function public.outlook_sync_targets(uuid) to service_role;
grant execute on function public.outlook_save_result(uuid, text, text, text, jsonb, boolean) to service_role;

-- -----------------------------------------------------------------------------
-- Llamada cada minuto. Requiere dos secretos en Vault (ver README):
--   outlook_sync_url    https://<proyecto>.supabase.co/functions/v1/outlook-sync
--   outlook_sync_token  el mismo valor que el secreto OUTLOOK_SYNC_TOKEN de la función
-- -----------------------------------------------------------------------------
create function private.request_outlook_sync()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_token text;
begin
  if not exists (
    select 1 from public.outlook_links l join public.profiles p on p.id = l.user_id and p.active
  ) then
    return; -- nadie que sincronizar
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'outlook_sync_url';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'outlook_sync_token';
  if v_url is null or v_token is null then
    return; -- aún no está configurada
  end if;

  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-token', v_token),
    timeout_milliseconds := 55000
  );
end;
$$;

revoke all on function private.request_outlook_sync() from public, anon, authenticated;

select cron.schedule('outlook-sync', '* * * * *', $$select private.request_outlook_sync()$$);
