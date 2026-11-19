-- Pruebas del calendario general: quién publica, quién lo ve, quién lo modifica
-- y a quién se notifica.
begin;
create extension if not exists pgtap with schema extensions;
select plan(35);

-- admin (sin acceso), Luis, Carlos y Lucía (con acceso), Ana (sin acceso).
insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'test.admin@calendariogem.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'test.luis@calendariogem.local', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'test.carlos@calendariogem.local', 'authenticated', 'authenticated'),
  ('55555555-5555-5555-5555-555555555555', 'test.ana@calendariogem.local', 'authenticated', 'authenticated'),
  ('66666666-6666-6666-6666-666666666666', 'test.lucia@calendariogem.local', 'authenticated', 'authenticated');

update public.profiles set active = true, must_change_password = false
  where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
               '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555',
               '66666666-6666-6666-6666-666666666666');
update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111';

select set_config('test.reunion', (select id::text from public.categories where name = 'Reunión'), true);

create function pg_temp.count_general(p_reminder bigint, p_user uuid, p_action text) returns int language sql as $$
  select count(*)::int from public.notifications
   where reminder_id = p_reminder and user_id = p_user and kind = 'general' and data ->> 'accion' = p_action;
$$;
create function pg_temp.count_general_title(p_title text, p_user uuid, p_action text) returns int language sql as $$
  select count(*)::int from public.notifications
   where reminder_title = p_title and user_id = p_user and kind = 'general' and data ->> 'accion' = p_action;
$$;

-- ---------------------------------------------------------------------------
-- El admin da el acceso
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$select public.admin_update_user('22222222-2222-2222-2222-222222222222', 'test.luis', 'user', true,
      (select color from public.profiles where id = '22222222-2222-2222-2222-222222222222'), true)$$,
  'El admin da acceso al calendario general'
);
select public.admin_update_user('33333333-3333-3333-3333-333333333333', 'test.carlos', 'user', true,
  (select color from public.profiles where id = '33333333-3333-3333-3333-333333333333'), true);
select public.admin_update_user('66666666-6666-6666-6666-666666666666', 'test.lucia', 'user', true,
  (select color from public.profiles where id = '66666666-6666-6666-6666-666666666666'), true);
select lives_ok(
  $$select public.admin_update_user('55555555-5555-5555-5555-555555555555', 'Ana', 'user', true,
      (select color from public.profiles where id = '55555555-5555-5555-5555-555555555555'))$$,
  'Sin el parámetro nuevo, admin_update_user no toca el acceso'
);
select is(
  (select array_agg(username order by username) from public.profiles where general_access),
  array['test.carlos', 'test.lucia', 'test.luis'], 'Tres usuarios tienen acceso'
);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$select public.admin_update_user('22222222-2222-2222-2222-222222222222', 'test.luis', 'user', true,
      (select color from public.profiles where id = '22222222-2222-2222-2222-222222222222'), false)$$,
  '42501', 'Solo el administrador puede modificar usuarios.', 'Un usuario no cambia accesos'
);

-- ---------------------------------------------------------------------------
-- Publicar
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
select throws_ok(
  $$select public.save_reminder(null, 'Intento', null, '2026-12-01 10:00-06', null, false,
      current_setting('test.reunion')::bigint, null, null, '{}'::uuid[], null, true)$$,
  '42501', 'No tiene acceso al calendario general.', 'Sin acceso no se publica en el general'
);
select throws_ok(
  $$insert into public.reminders (title, start_at, category_id, is_general)
    values ('Directo', '2026-12-01 10:00-06', current_setting('test.reunion')::bigint, true)$$,
  '42501', 'No tiene acceso al calendario general.', 'Tampoco con un insert directo'
);
select set_config('test.ana', public.save_reminder(null, 'Personal de Ana', null, '2026-12-01 10:00-06', null, false,
  current_setting('test.reunion')::bigint, null, null, '{}'::uuid[])::text, true);
select is((select is_general from public.reminders where id = current_setting('test.ana')::bigint), false,
  'Por defecto, un recordatorio es personal');

-- Luis publica dos en el general: uno con Ana etiquetada y otro sin etiquetados.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select set_config('test.g1', public.save_reminder(null, 'Comité', null, '2026-12-02 09:00-06', null, false,
  current_setting('test.reunion')::bigint, null, null,
  array['55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333']::uuid[], null, true)::text, true);
select set_config('test.g2', public.save_reminder(null, 'Cierre de mes', null, '2026-12-03 09:00-06', null, false,
  current_setting('test.reunion')::bigint, null, null, '{}'::uuid[], null, true)::text, true);
select set_config('test.p', public.save_reminder(null, 'Personal de Luis', null, '2026-12-04 09:00-06', null, false,
  current_setting('test.reunion')::bigint, null, null, '{}'::uuid[], null, false)::text, true);
set constraints all immediate;

select is((select is_general from public.reminders where id = current_setting('test.g1')::bigint), true,
  'Con acceso se publica en el general');

-- ---------------------------------------------------------------------------
-- Quién lo ve
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select is(
  (select array_agg(id order by id) from public.reminders),
  array[current_setting('test.g1')::bigint, current_setting('test.g2')::bigint],
  'Lucía (con acceso) ve el calendario general, no lo personal de otros'
);
select is(
  (select array_agg(id order by id) from public.calendar_reminders(
     array['66666666-6666-6666-6666-666666666666']::uuid[], '2026-12-01 00:00-06', '2027-01-01 00:00-06')),
  array[current_setting('test.g1')::bigint, current_setting('test.g2')::bigint],
  'El general aparece en su calendario junto con lo suyo'
);
select is(
  (select count(*)::int from public.search_reminders(array['66666666-6666-6666-6666-666666666666']::uuid[], 'cierre')),
  1, 'La búsqueda también encuentra lo del general'
);
select is(
  (select count(*)::int from public.reminder_participants where reminder_id = current_setting('test.g1')::bigint),
  2, 'Ve quiénes están etiquetados en un recordatorio general'
);

select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
select is(
  (select array_agg(id order by id) from public.reminders),
  array[current_setting('test.ana')::bigint, current_setting('test.g1')::bigint],
  'Ana (sin acceso) ve lo suyo y solo el general donde está etiquetada'
);
select is(
  (select count(*)::int from public.calendar_reminders(
     array['55555555-5555-5555-5555-555555555555']::uuid[], '2026-12-01 00:00-06', '2027-01-01 00:00-06')
    where id = current_setting('test.g2')::bigint),
  0, 'El general no aparece en el calendario de quien no tiene acceso'
);
select is(
  (select count(*)::int from public.search_reminders(array['55555555-5555-5555-5555-555555555555']::uuid[], 'cierre')),
  0, 'Ni en su búsqueda'
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.reminders where is_general),
  2, 'El admin ve todo, también el general'
);

-- ---------------------------------------------------------------------------
-- Solo el creador modifica o elimina
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select throws_ok(
  $$select public.save_reminder(current_setting('test.g2')::bigint, 'Cambiado', null, '2026-12-03 09:00-06', null, false,
      current_setting('test.reunion')::bigint, null, null, '{}'::uuid[])$$,
  '42501', 'Solo el creador puede modificar este recordatorio.', 'Otro con acceso no modifica lo del general'
);
select is_empty(
  $$delete from public.reminders where id = current_setting('test.g2')::bigint returning id$$,
  'Otro con acceso no elimina lo del general'
);
select is_empty(
  $$update public.reminders set is_general = false where id = current_setting('test.g2')::bigint returning id$$,
  'Otro con acceso no lo retira del general'
);

-- ---------------------------------------------------------------------------
-- Notificaciones
-- ---------------------------------------------------------------------------
reset role;
select is(pg_temp.count_general(current_setting('test.g2')::bigint, '66666666-6666-6666-6666-666666666666', 'publicado'),
  1, 'Lucía recibe "publicado"');
select is(pg_temp.count_general(current_setting('test.g2')::bigint, '33333333-3333-3333-3333-333333333333', 'publicado'),
  1, 'Carlos recibe "publicado"');
select is(pg_temp.count_general(current_setting('test.g2')::bigint, '22222222-2222-2222-2222-222222222222', 'publicado'),
  0, 'Quien publica no se notifica a sí mismo');
select is(pg_temp.count_general(current_setting('test.g2')::bigint, '55555555-5555-5555-5555-555555555555', 'publicado'),
  0, 'Quien no tiene acceso no recibe notificación');
select is(pg_temp.count_general(current_setting('test.g1')::bigint, '33333333-3333-3333-3333-333333333333', 'publicado'),
  0, 'Carlos, etiquetado en el Comité, recibe solo "etiquetado"');
select is(
  (select count(*)::int from public.notifications where reminder_id = current_setting('test.p')::bigint),
  0, 'Lo personal no notifica a nadie'
);

-- Luis cambia la hora del cierre, luego lo pasa a personal y otro personal al general.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.save_reminder(current_setting('test.g2')::bigint, 'Cierre de mes', null, '2026-12-03 15:00-06', null, false,
  current_setting('test.reunion')::bigint, null, null, '{}'::uuid[]);
reset role;
select is(
  (select data -> 'changes' from public.notifications
    where reminder_id = current_setting('test.g2')::bigint and user_id = '66666666-6666-6666-6666-666666666666'
      and kind = 'general' and data ->> 'accion' = 'modificado'),
  '["horario"]'::jsonb, 'Lucía recibe "modificado" con lo que cambió'
);
select is(
  (select is_general from public.reminders where id = current_setting('test.g2')::bigint), true,
  'Sin p_is_general, al modificar no cambia de calendario'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.save_reminder(current_setting('test.g2')::bigint, 'Cierre de mes', null, '2026-12-03 15:00-06', null, false,
  current_setting('test.reunion')::bigint, null, null, '{}'::uuid[], null, false);
select public.save_reminder(current_setting('test.p')::bigint, 'Personal de Luis', null, '2026-12-04 09:00-06', null, false,
  current_setting('test.reunion')::bigint, null, null, '{}'::uuid[], null, true);
reset role;
select is(pg_temp.count_general(current_setting('test.g2')::bigint, '66666666-6666-6666-6666-666666666666', 'retirado'),
  1, 'Al pasarlo a personal, los demás reciben "retirado"');
select is(pg_temp.count_general(current_setting('test.p')::bigint, '66666666-6666-6666-6666-666666666666', 'publicado'),
  1, 'Al pasar uno personal al general, reciben "publicado"');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.reminders where id = current_setting('test.g2')::bigint),
  0, 'Lo retirado del general ya no lo ven los demás'
);

-- Luis elimina uno del general.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
delete from public.reminders where id = current_setting('test.p')::bigint;
reset role;
select is(pg_temp.count_general_title('Personal de Luis', '66666666-6666-6666-6666-666666666666', 'eliminado'),
  1, 'Al eliminarlo, los demás reciben "eliminado"');

-- ---------------------------------------------------------------------------
-- Se quita el acceso a Luis: lo que publicó sigue en el general
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.admin_update_user('22222222-2222-2222-2222-222222222222', 'test.luis', 'user', true,
  (select color from public.profiles where id = '22222222-2222-2222-2222-222222222222'), false);

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select lives_ok(
  $$select public.save_reminder(current_setting('test.g1')::bigint, 'Comité mensual', null, '2026-12-02 09:00-06', null, false,
      current_setting('test.reunion')::bigint, null, null,
      array['55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333']::uuid[])$$,
  'Sin acceso, sigue modificando lo que publicó'
);
select throws_ok(
  $$select public.save_reminder(current_setting('test.g2')::bigint, 'Cierre de mes', null, '2026-12-03 15:00-06', null, false,
      current_setting('test.reunion')::bigint, null, null, '{}'::uuid[], null, true)$$,
  '42501', 'No tiene acceso al calendario general.', 'Pero no publica nada nuevo en el general'
);
select is(
  (select count(*)::int from public.calendar_reminders(
     array['22222222-2222-2222-2222-222222222222']::uuid[], '2026-12-01 00:00-06', '2027-01-01 00:00-06')
    where is_general and owner_id <> '22222222-2222-2222-2222-222222222222'),
  0, 'Ya no ve lo que otros publican en el general'
);

select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select is(
  (select title from public.reminders where id = current_setting('test.g1')::bigint),
  'Comité mensual', 'Lo que publicó sigue visible en el general para los demás'
);

select * from finish();
rollback;
