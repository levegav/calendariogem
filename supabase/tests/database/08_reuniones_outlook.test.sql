-- Pruebas de las reuniones de Outlook: quién asigna el correo, quién ve qué
-- reuniones, y cómo guarda la sincronización (solo service_role).
begin;
create extension if not exists pgtap with schema extensions;
select plan(29);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'test.admin@calendariogem.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'test.luis@calendariogem.local', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'test.carlos@calendariogem.local', 'authenticated', 'authenticated');
update public.profiles set active = true, must_change_password = false
  where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
               '33333333-3333-3333-3333-333333333333');
update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111';

create function pg_temp.events_of(p_user uuid) returns int language sql security definer as $$
  select count(*)::int from public.outlook_events where user_id = p_user;
$$;
grant execute on function pg_temp.events_of(uuid) to service_role, authenticated;
-- Posición física de la fila: cambia si la fila se actualiza.
create function pg_temp.link_row(p_user uuid) returns text language sql security definer as $$
  select ctid::text from public.outlook_links where user_id = p_user;
$$;
grant execute on function pg_temp.link_row(uuid) to service_role, authenticated;

-- La base local puede tener datos de demostración.
delete from public.outlook_links;
delete from public.outlook_events;

-- ---------------------------------------------------------------------------
-- Asignar el correo
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$select public.admin_set_outlook_email('22222222-2222-2222-2222-222222222222', 'luis@empresa.com')$$,
  '42501', 'Solo el administrador puede modificar usuarios.',
  'Un usuario no puede asignarse un correo de Outlook'
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select lives_ok(
  $$select public.admin_set_outlook_email('22222222-2222-2222-2222-222222222222', '  Luis@Empresa.com ')$$,
  'El admin asigna el correo de Luis'
);
select is((select email from public.outlook_links where user_id = '22222222-2222-2222-2222-222222222222'),
  'luis@empresa.com', 'El correo se guarda en minúsculas y sin espacios');
select is((select status from public.outlook_links where user_id = '22222222-2222-2222-2222-222222222222'),
  'pendiente', 'Queda pendiente de sincronizar');
select throws_ok(
  $$select public.admin_set_outlook_email('33333333-3333-3333-3333-333333333333', 'luis@empresa.com')$$,
  'P0001', 'Ese correo de Outlook ya está asignado a otro usuario.',
  'Un correo no se repite entre usuarios'
);
select throws_ok(
  $$select public.admin_set_outlook_email('33333333-3333-3333-3333-333333333333', 'carlos-empresa')$$,
  'P0001', 'El correo de Outlook no es válido.',
  'Se valida el formato del correo'
);
select public.admin_set_outlook_email('33333333-3333-3333-3333-333333333333', 'carlos@empresa.com');

select throws_ok(
  $$insert into public.outlook_events (user_id, item_id, start_at, end_at)
    values ('22222222-2222-2222-2222-222222222222', 'x', now(), now())$$,
  '42501', null, 'La app no puede escribir reuniones'
);
select throws_ok(
  $$select public.outlook_save_result('22222222-2222-2222-2222-222222222222', 'ok')$$,
  '42501', null, 'La app no puede guardar resultados de la sincronización'
);

-- ---------------------------------------------------------------------------
-- La sincronización (service_role)
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;

select lives_ok($$select public.outlook_agent_checkin('1.0', 'NEPTUNE')$$, 'El script de la oficina avisa que está vivo');

select is(
  (select count(*)::int from public.outlook_sync_targets() where needs_full),
  2, 'Los dos usuarios necesitan la primera lectura completa'
);

select lives_ok(
  $$select public.outlook_save_result('22222222-2222-2222-2222-222222222222', 'ok', null, 'estado-1', '[
      {"item_id":"A","subject":"Comité","start_at":"2026-12-01T15:00:00Z","end_at":"2026-12-01T16:00:00Z",
       "organizer_name":"Ana","attendees":[{"name":"Luis","response":"Accept"}],
       "join_url":"https://teams.microsoft.com/l/meetup-join/abc"},
      {"item_id":"B","subject":"Feriado","start_at":"2026-12-25T06:00:00Z","end_at":"2026-12-26T06:00:00Z","all_day":true}
    ]'::jsonb, true)$$,
  'Guarda la primera lectura completa'
);
select is(pg_temp.events_of('22222222-2222-2222-2222-222222222222'),
  2, 'Se guardan las dos reuniones');
select is(
  (select count(*)::int from public.outlook_sync_targets('22222222-2222-2222-2222-222222222222') where not needs_full and sync_state = 'estado-1'),
  1, 'Ya no necesita lectura completa y conserva el estado de EWS'
);

select set_config('test.fila', pg_temp.link_row('22222222-2222-2222-2222-222222222222'), true);
select public.outlook_save_result('22222222-2222-2222-2222-222222222222', 'ok', null, 'estado-2', null, false);
select is(pg_temp.events_of('22222222-2222-2222-2222-222222222222'),
  2, 'Sin cambios, las reuniones se conservan');
select is(pg_temp.link_row('22222222-2222-2222-2222-222222222222'), current_setting('test.fila'),
  'Sin cambios no se toca su fila (Realtime no avisa a las páginas abiertas)');
select is(
  (select sync_state from public.outlook_sync_targets('22222222-2222-2222-2222-222222222222')), 'estado-2',
  'Sin cambios igual se guarda el estado nuevo de EWS'
);

select public.outlook_save_result('22222222-2222-2222-2222-222222222222', 'ok', null, 'estado-3', '[
  {"item_id":"A","subject":"Comité (cambió)","start_at":"2026-12-01T15:00:00Z","end_at":"2026-12-01T17:00:00Z"}
]'::jsonb, false);
reset role;
select is(
  (select array_agg(subject) from public.outlook_events where user_id = '22222222-2222-2222-2222-222222222222'),
  array['Comité (cambió)'], 'Con cambios, se reemplazan todas sus reuniones'
);
set local role service_role;

select public.outlook_save_result('33333333-3333-3333-3333-333333333333', 'ok', null, 's', '[
  {"item_id":"C","subject":"Visita","start_at":"2026-12-02T15:00:00Z","end_at":"2026-12-02T16:00:00Z"}
]'::jsonb, true);

-- ---------------------------------------------------------------------------
-- Quién ve qué
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.calendar_outlook_events(
     array['22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333']::uuid[],
     '2026-11-01', '2027-01-01')),
  1, 'Luis ve solo sus reuniones aunque pida las de Carlos'
);
select is((select count(*)::int from public.outlook_links), 1, 'Luis ve solo su propio vínculo');
select is(
  (select count(*)::int from public.search_outlook_events(array['22222222-2222-2222-2222-222222222222']::uuid[], 'comite cambio')),
  1, 'La búsqueda ignora tildes y exige todas las palabras'
);
select throws_ok($$select * from public.outlook_agent_status()$$, '42501', null,
  'Un usuario no ve el estado del script de la oficina');
select throws_ok($$select public.admin_request_outlook_sync()$$, '42501', null,
  'Un usuario no puede pedir una sincronización');

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.calendar_outlook_events(
     array['22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333']::uuid[],
     '2026-11-01', '2027-01-01')),
  2, 'El admin ve las reuniones de los calendarios que elige'
);
select is((select version from public.outlook_agent_status()), '1.0', 'El admin ve cuándo se conectó el script');
select lives_ok($$select public.admin_request_outlook_sync('22222222-2222-2222-2222-222222222222')$$,
  'El admin pide volver a leer el calendario de Luis');
reset role;
select is(
  (select needs_full from public.outlook_sync_targets('22222222-2222-2222-2222-222222222222')), true,
  'En la próxima pasada se lee todo el calendario de Luis'
);
set local role authenticated;

-- ---------------------------------------------------------------------------
-- Sin permiso en Exchange y quitar el correo
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;
select public.outlook_save_result('33333333-3333-3333-3333-333333333333', 'sin_permiso', 'ErrorAccessDenied');
select is(pg_temp.events_of('33333333-3333-3333-3333-333333333333'),
  0, 'Sin permiso, se quitan sus reuniones');

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is((select status from public.outlook_links where user_id = '33333333-3333-3333-3333-333333333333'),
  'sin_permiso', 'El admin ve que falta el permiso');

select public.admin_set_outlook_email('22222222-2222-2222-2222-222222222222', '');
reset role;
select is(
  pg_temp.events_of('22222222-2222-2222-2222-222222222222')
  + (select count(*)::int from public.outlook_links where user_id = '22222222-2222-2222-2222-222222222222'),
  0, 'Al quitar el correo se borran el vínculo y sus reuniones'
);

select * from finish();
rollback;
