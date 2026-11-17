-- Pruebas de notificaciones y avisos previos.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email, aud, role) values
  ('22222222-2222-2222-2222-222222222222', 'test.luis@calendariogem.local', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'test.carlos@calendariogem.local', 'authenticated', 'authenticated'),
  ('55555555-5555-5555-5555-555555555555', 'test.ana@calendariogem.local', 'authenticated', 'authenticated');

update public.profiles set active = true, must_change_password = false
  where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
               '55555555-5555-5555-5555-555555555555');

select set_config('test.reunion', (select id::text from public.categories where name = 'Reunión'), true);

-- Avisos de una persona en un recordatorio, ordenados (se consulta como superusuario).
create function pg_temp.alerts_of(p_reminder bigint, p_user uuid) returns int[] language sql as $$
  select coalesce(array_agg(minutes_before order by minutes_before), '{}')
    from public.reminder_alerts where reminder_id = p_reminder and user_id = p_user;
$$;
create function pg_temp.count_kind(p_reminder bigint, p_user uuid, p_kind text) returns int language sql as $$
  select count(*)::int from public.notifications
   where reminder_id = p_reminder and user_id = p_user and kind = p_kind;
$$;

-- ---------------------------------------------------------------------------
-- Hora de disparo
-- ---------------------------------------------------------------------------
select is(private.alert_fire_at('2026-12-10 14:00-06', false, 15), '2026-12-10 13:45-06'::timestamptz,
  'Un aviso de 15 min se dispara 15 min antes');
select is(private.alert_fire_at('2026-12-10 00:00-06', true, 1440), '2026-12-09 08:00-06'::timestamptz,
  'En uno de todo el día, "1 día antes" es el día anterior a las 8:00 a. m.');
select is(private.alert_fire_at('2026-12-10 00:00-06', true, 0), '2026-12-10 08:00-06'::timestamptz,
  'En uno de todo el día, "a la hora" es ese día a las 8:00 a. m.');

-- ---------------------------------------------------------------------------
-- Luis crea un recordatorio, etiqueta a Carlos y Ana y elige sus avisos
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select set_config('test.r', public.save_reminder(
  null, 'Planificación', null, '2026-12-10 14:00-06', null, false,
  current_setting('test.reunion')::bigint, null, null,
  array['33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555']::uuid[],
  array[1440, 30, 30]
)::text, true);

select is((select count(*)::int from public.reminder_alerts where reminder_id = current_setting('test.r')::bigint),
  2, 'El creador solo ve sus propios avisos');
select is((select count(*)::int from public.notifications where user_id <> '22222222-2222-2222-2222-222222222222'),
  0, 'El creador no ve las notificaciones de otros');

reset role;
select is(pg_temp.alerts_of(current_setting('test.r')::bigint, '22222222-2222-2222-2222-222222222222'),
  array[30, 1440], 'El creador guarda los avisos que eligió (sin repetir)');
select is(pg_temp.alerts_of(current_setting('test.r')::bigint, '33333333-3333-3333-3333-333333333333'),
  array[15], 'Al etiquetado se le pone el aviso por defecto (15 min)');
select is(
  (select actor_id::text from public.notifications
    where reminder_id = current_setting('test.r')::bigint and user_id = '33333333-3333-3333-3333-333333333333' and kind = 'etiquetado'),
  '22222222-2222-2222-2222-222222222222', 'Carlos recibe "etiquetado", hecho por Luis');
select is(pg_temp.count_kind(current_setting('test.r')::bigint, '22222222-2222-2222-2222-222222222222', 'etiquetado'),
  0, 'El creador no recibe notificación por etiquetar');

-- ---------------------------------------------------------------------------
-- Carlos configura sus avisos y marca su notificación
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

select lives_ok($$select public.set_reminder_alerts(current_setting('test.r')::bigint, array[0, 60])$$,
  'El etiquetado configura sus propios avisos');
select throws_ok(
  $$insert into public.reminder_alerts (reminder_id, user_id, minutes_before)
    values (current_setting('test.r')::bigint, '22222222-2222-2222-2222-222222222222', 5)$$,
  '42501', null, 'No puede crear avisos para otra persona');
select throws_ok($$select public.set_reminder_alerts(current_setting('test.r')::bigint, array[7])$$,
  '23514', null, 'Solo se aceptan las opciones de la lista');
select isnt_empty($$update public.notifications set read_at = now() where kind = 'etiquetado' returning id$$,
  'Marca como leída su notificación');
select throws_ok($$insert into public.notifications (user_id, kind, reminder_title) values (auth.uid(), 'aviso', 'x')$$,
  '42501', null, 'Nadie crea notificaciones directamente');

-- Ana (también etiquetada) no puede tocar las notificaciones de Carlos.
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
select is_empty($$update public.notifications set read_at = null where user_id = '33333333-3333-3333-3333-333333333333' returning id$$,
  'No se marcan notificaciones ajenas');

reset role;
select is(pg_temp.alerts_of(current_setting('test.r')::bigint, '33333333-3333-3333-3333-333333333333'),
  array[0, 60], 'Carlos quedó con sus avisos');

-- ---------------------------------------------------------------------------
-- Luis modifica el recordatorio y quita a Ana
-- ---------------------------------------------------------------------------
-- Los etiquetados se agregaron "antes" (otra transacción en la vida real).
update public.reminder_participants set added_at = now() - interval '1 hour'
 where reminder_id = current_setting('test.r')::bigint;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.save_reminder(
  current_setting('test.r')::bigint, 'Planificación 2027', null, '2026-12-11 09:00-06', null, false,
  current_setting('test.reunion')::bigint, null, null,
  array['33333333-3333-3333-3333-333333333333']::uuid[], null
);
-- El aviso de modificación es diferido (al confirmar); aquí se fuerza.
set constraints all immediate;
reset role;

select is(
  (select data -> 'changes' from public.notifications
    where reminder_id = current_setting('test.r')::bigint and user_id = '33333333-3333-3333-3333-333333333333' and kind = 'modificado'),
  '["titulo", "horario"]'::jsonb, 'Carlos recibe "modificado" con lo que cambió');
select is(
  (select data -> 'before' ->> 'title' from public.notifications
    where reminder_id = current_setting('test.r')::bigint and user_id = '33333333-3333-3333-3333-333333333333' and kind = 'modificado'),
  'Planificación', 'La notificación guarda el título anterior');
select is(pg_temp.count_kind(current_setting('test.r')::bigint, '55555555-5555-5555-5555-555555555555', 'quitado'),
  1, 'Ana recibe "quitado"');
select is(pg_temp.count_kind(current_setting('test.r')::bigint, '55555555-5555-5555-5555-555555555555', 'modificado'),
  0, 'Ana, que fue quitada, recibe solo esa notificación');
select is(pg_temp.alerts_of(current_setting('test.r')::bigint, '55555555-5555-5555-5555-555555555555'),
  '{}'::int[], 'Se borran los avisos de quien fue quitado');
select is(pg_temp.alerts_of(current_setting('test.r')::bigint, '22222222-2222-2222-2222-222222222222'),
  array[30, 1440], 'Con p_alerts null, los avisos del creador no cambian');

-- ---------------------------------------------------------------------------
-- Carlos se sale; Luis pasa el recordatorio a todo el día
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
delete from public.reminder_participants where reminder_id = current_setting('test.r')::bigint and user_id = auth.uid();
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
update public.reminders set all_day = true, start_at = '2026-12-11 00:00-06' where id = current_setting('test.r')::bigint;
reset role;

select is(
  (select actor_id::text from public.notifications
    where reminder_id = current_setting('test.r')::bigint and user_id = '22222222-2222-2222-2222-222222222222' and kind = 'salida'),
  '33333333-3333-3333-3333-333333333333', 'Luis recibe "salida" cuando Carlos se sale');
select is(pg_temp.alerts_of(current_setting('test.r')::bigint, '22222222-2222-2222-2222-222222222222'),
  array[1440], 'Al pasar a todo el día, los avisos vuelven al de por defecto (día anterior)');

-- ---------------------------------------------------------------------------
-- Disparo de avisos previos
-- ---------------------------------------------------------------------------
insert into public.reminders (owner_id, title, start_at, category_id)
values ('22222222-2222-2222-2222-222222222222', 'Pronto', now() + interval '10 minutes', current_setting('test.reunion')::bigint)
returning set_config('test.p', id::text, true);

select private.fire_due_alerts();
select is(pg_temp.count_kind(current_setting('test.p')::bigint, '22222222-2222-2222-2222-222222222222', 'aviso'),
  0, 'No se dispara un aviso cuya hora ya había pasado al configurarlo');

-- Como si el aviso de 15 min se hubiera configurado hace una hora.
update public.reminder_alerts set armed_at = now() - interval '1 hour' where reminder_id = current_setting('test.p')::bigint;
select private.fire_due_alerts();
select private.fire_due_alerts();
select is(pg_temp.count_kind(current_setting('test.p')::bigint, '22222222-2222-2222-2222-222222222222', 'aviso'),
  1, 'El aviso que ya toca se dispara una sola vez');
select is(
  (select (data ->> 'minutes_before')::int from public.notifications
    where reminder_id = current_setting('test.p')::bigint and kind = 'aviso'),
  15, 'La notificación indica cuánto antes era el aviso');

-- Se mueve el recordatorio: vuelve a avisar con la nueva hora.
update public.reminders set start_at = now() + interval '5 minutes' where id = current_setting('test.p')::bigint;
update public.reminder_alerts set armed_at = now() - interval '1 hour' where reminder_id = current_setting('test.p')::bigint;
select private.fire_due_alerts();
select is(pg_temp.count_kind(current_setting('test.p')::bigint, '22222222-2222-2222-2222-222222222222', 'aviso'),
  2, 'Si el recordatorio se mueve, el aviso se vuelve a disparar');

-- ---------------------------------------------------------------------------
-- Infraestructura
-- ---------------------------------------------------------------------------
select is((select count(*)::int from cron.job where jobname = 'avisos-previos'), 1,
  'La tarea de avisos previos está programada');
select is(
  (select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'notifications'),
  1, 'Las notificaciones se publican en tiempo real');

set local role anon;
select throws_ok($$select * from public.notifications$$, '42501', null, 'Sin sesión no hay acceso a notificaciones');

select * from finish();
rollback;
