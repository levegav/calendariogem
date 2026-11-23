-- Pruebas de la Fase 13: avisos copiados de Outlook, notificaciones de cambios
-- y Conservar / Eliminar cuando se cancela una reunión a la que invitaron.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'test.admin@calendariogem.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'test.luis@calendariogem.local', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'test.carlos@calendariogem.local', 'authenticated', 'authenticated');
update public.profiles set active = true, must_change_password = false
  where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
               '33333333-3333-3333-3333-333333333333');
update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111';

delete from public.outlook_links;
delete from public.outlook_events;
delete from public.outlook_alerts;
delete from public.outlook_alert_overrides;
delete from public.notifications;
delete from public.reminder_decisions;
insert into public.outlook_links (user_id, email) values ('22222222-2222-2222-2222-222222222222', 'luis@empresa.com');

-- Una reunión para enviar desde el "script". p_hours: horas desde ahora.
create function pg_temp.ev(
  p_key text, p_subject text, p_hours numeric, p_organizer text default 'Ana', p_response text default 'Accept',
  p_reminder integer default null, p_cancelled boolean default false, p_item text default null
) returns jsonb language sql as $$
  select jsonb_build_object(
    'event_key', p_key, 'item_id', coalesce(p_item, 'item-' || p_key), 'subject', p_subject,
    'start_at', now() + make_interval(secs => (p_hours * 3600)::double precision),
    'end_at', now() + make_interval(secs => ((p_hours + 1) * 3600)::double precision),
    'organizer_name', p_organizer, 'organizer_email', lower(p_organizer) || '@empresa.com',
    'my_response', p_response, 'reminder_minutes', p_reminder, 'is_cancelled', p_cancelled,
    'join_url', 'https://teams.microsoft.com/l/meetup-join/' || p_key);
$$;
create function pg_temp.save(p_events jsonb) returns void language sql as $$
  select public.outlook_save_result('22222222-2222-2222-2222-222222222222', 'ok', null, 's', p_events, false);
$$;
create function pg_temp.outlook_notes(p_accion text) returns text[] language sql security definer as $$
  select coalesce(array_agg(reminder_title order by reminder_title), '{}') from public.notifications
   where user_id = '22222222-2222-2222-2222-222222222222' and kind = 'outlook' and data ->> 'accion' = p_accion;
$$;
create function pg_temp.alerts_of(p_key text) returns int[] language sql security definer as $$
  select coalesce(array_agg(minutes_before order by minutes_before), '{}') from public.outlook_alerts
   where user_id = '22222222-2222-2222-2222-222222222222' and event_key = p_key;
$$;
create function pg_temp.decisions() returns text[] language sql security definer as $$
  select coalesce(array_agg(title order by title), '{}') from public.reminder_decisions
   where user_id = '22222222-2222-2222-2222-222222222222' and reason = 'outlook_cancelada' and resolved_at is null;
$$;
grant execute on all functions in schema pg_temp to service_role, authenticated;

-- ---------------------------------------------------------------------------
-- Primera lectura: no notifica nada, pero copia los avisos de Outlook
-- ---------------------------------------------------------------------------
set local role service_role;
select pg_temp.save(jsonb_build_array(
  pg_temp.ev('A', 'Comité', 24, p_reminder => 15),
  pg_temp.ev('B', 'Mi reunión', 26, 'Luis', 'Organizer', 30),
  pg_temp.ev('C', 'Visita', 30),
  pg_temp.ev('D', 'Pasada', -48),
  pg_temp.ev(null, 'Serie', 50, p_item => 'X1'),
  pg_temp.ev('G', 'Pronto', 0.15, p_reminder => 15)
));
reset role;
select is((select count(*)::int from public.notifications where user_id = '22222222-2222-2222-2222-222222222222'), 0,
  'La primera lectura no genera notificaciones');
select is(pg_temp.decisions(), '{}'::text[], 'La primera lectura no genera decisiones');
select is(pg_temp.alerts_of('A'), array[15], 'Copia el aviso de Outlook (15 min antes)');
select is(pg_temp.alerts_of('C'), '{}'::int[], 'Sin recordatorio en Outlook, no hay aviso');
select is((select event_key from public.outlook_events where item_id = 'X1'), 'X1',
  'Sin identificador permanente (script viejo), se usa el item_id');

-- ---------------------------------------------------------------------------
-- Segunda lectura con cambios
-- ---------------------------------------------------------------------------
set local role service_role;
select pg_temp.save(jsonb_build_array(
  pg_temp.ev('A', 'Comité', 25, p_reminder => 10),          -- se movió una hora y cambió su recordatorio
  pg_temp.ev('B', 'Mi reunión (cambió)', 27, 'Luis', 'Organizer', 30),  -- la organicé yo
  -- C desapareció (la borraron); D salió de la ventana (ya pasó)
  pg_temp.ev('E', 'Capacitación', 40, p_reminder => 5),     -- nueva
  pg_temp.ev('F', 'Otra mía', 41, 'Luis', 'Organizer'),     -- nueva, pero mía
  pg_temp.ev('UID-X|', 'Serie', 50, p_item => 'X1'),        -- el script nuevo manda el identificador permanente
  pg_temp.ev('G', 'Pronto', 0.15, p_reminder => 15)
));
reset role;
select is(pg_temp.outlook_notes('nueva'), array['Capacitación'], 'Avisa las reuniones nuevas que organizó otra persona');
select is(pg_temp.outlook_notes('modificada'), array['Comité'], 'Avisa los cambios de reuniones de otros (no las mías)');
select is(
  (select data -> 'changes' from public.notifications where kind = 'outlook' and data ->> 'accion' = 'modificada'),
  '["horario"]'::jsonb, 'Indica qué cambió'
);
select is(pg_temp.decisions(), array['Visita'], 'Si borran una reunión a la que me invitaron, decido si la conservo');
select is(
  (select array[category_id::text, outlook_organizer, description, note] from public.reminder_decisions where title = 'Visita'),
  array[(select id::text from public.categories where name = 'Reunión'), 'Ana', 'Reunión de Outlook organizada por Ana',
        'Enlace de la reunión: https://teams.microsoft.com/l/meetup-join/C'],
  'La copia sería una Reunión con el organizador y el enlace'
);
select is(pg_temp.alerts_of('A'), array[10], 'El aviso sigue al recordatorio de Outlook');
select is((select event_key from public.outlook_events where item_id = 'X1'), 'UID-X|',
  'Pasa al identificador permanente sin avisar nada (la reconoce por el item_id)');
select is((select count(*)::int from public.notifications where reminder_title = 'Serie'), 0,
  'El cambio de identificador no genera notificaciones falsas');

-- ---------------------------------------------------------------------------
-- La persona cambia sus avisos en la app: Outlook ya no los pisa
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select lives_ok($$select public.set_outlook_alerts('E', array[0, 30])$$, 'Luis cambia los avisos de una reunión suya');
select is((select array_agg(minutes_before order by minutes_before) from public.outlook_alerts where event_key = 'E'),
  array[0, 30], 'Luis ve sus avisos');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select throws_ok($$select public.set_outlook_alerts('E', array[5])$$, '42501', null,
  'No se pueden cambiar los avisos de reuniones de otro calendario');
select is((select count(*)::int from public.outlook_alerts), 0, 'Carlos no ve los avisos de Luis');

reset role;
set local role service_role;
select pg_temp.save(jsonb_build_array(
  pg_temp.ev('A', 'Comité', 25, p_reminder => 10),
  pg_temp.ev('E', 'Capacitación', 40, p_reminder => 60),
  pg_temp.ev('UID-X|', 'Serie', 50, p_item => 'X1'),
  pg_temp.ev('G', 'Pronto', 0.15, p_reminder => 15)
));
reset role;
select is(pg_temp.alerts_of('E'), array[0, 30], 'Los avisos que cambió en la app se mantienen');

-- ---------------------------------------------------------------------------
-- Cancelada en Outlook
-- ---------------------------------------------------------------------------
set local role service_role;
select pg_temp.save(jsonb_build_array(
  pg_temp.ev('A', 'Comité', 25, p_reminder => 10),
  pg_temp.ev('E', 'Capacitación', 40, p_reminder => 60, p_cancelled => true),
  pg_temp.ev('UID-X|', 'Serie', 50, p_item => 'X1'),
  pg_temp.ev('G', 'Pronto', 0.15, p_reminder => 15)
));
reset role;
select is(pg_temp.decisions(), array['Capacitación', 'Visita'], 'Si la cancelan, también decido si la conservo');
select is(pg_temp.alerts_of('E'), '{}'::int[], 'Una reunión cancelada ya no avisa');

-- ---------------------------------------------------------------------------
-- Disparo de los avisos
-- ---------------------------------------------------------------------------
select is(private.fire_due_outlook_alerts(), 0, 'No avisa si la hora del aviso ya había pasado al crearlo');
update public.outlook_alerts set armed_at = now() - interval '1 hour' where event_key = 'G';
select is(private.fire_due_outlook_alerts(), 1, 'Dispara el aviso cuando llega su hora');
select is(
  (select array[reminder_title, data ->> 'minutes_before', data ->> 'outlook'] from public.notifications where kind = 'aviso'),
  array['Pronto', '15', 'true'], 'El aviso dice de qué reunión es'
);
select is(private.fire_due_outlook_alerts(), 0, 'No repite el mismo aviso');

-- ---------------------------------------------------------------------------
-- Conservar
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select isnt(
  public.resolve_reminder_decision((select id from public.reminder_decisions where title = 'Visita'), true), null,
  'Luis conserva la reunión cancelada'
);
select is(
  (select array[title, (select name from public.categories c where c.id = r.category_id)] from public.reminders r
    where owner_id = '22222222-2222-2222-2222-222222222222' and title = 'Visita'),
  array['Visita', 'Reunión'], 'Queda como recordatorio propio'
);

select * from finish();
rollback;
