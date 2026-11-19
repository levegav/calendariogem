-- Pruebas del calendario general: quién publica, quién lo ve, quién lo modifica,
-- qué no se permite (etiquetar, categorías personales) y a quién se avisa.
begin;
create extension if not exists pgtap with schema extensions;
select plan(45);

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

-- La prueba parte de un calendario general vacío y sin nadie con acceso
-- (la base local puede tener datos de demostración).
update public.profiles set general_access = false;
delete from public.reminders where is_general;
delete from public.notifications;
delete from public.reminder_decisions;

select set_config('test.reunion', (select id::text from public.categories where name = 'Reunión'), true);
select set_config('test.personal', (select id::text from public.categories where name = 'Personal'), true);

create function pg_temp.count_general(p_reminder bigint, p_user uuid, p_action text) returns int language sql as $$
  select count(*)::int from public.notifications
   where reminder_id = p_reminder and user_id = p_user and kind = 'general' and data ->> 'accion' = p_action;
$$;
create function pg_temp.count_general_title(p_title text, p_user uuid, p_action text) returns int language sql as $$
  select count(*)::int from public.notifications
   where reminder_title = p_title and user_id = p_user and kind = 'general' and data ->> 'accion' = p_action;
$$;
create function pg_temp.decisions(p_title text, p_user uuid) returns int language sql as $$
  select count(*)::int from public.reminder_decisions
   where title = p_title and user_id = p_user and reason = 'general_eliminado' and resolved_at is null;
$$;

select is(
  (select personal_only from public.categories where name = 'Personal'), true,
  'La categoría Personal es solo para calendarios personales'
);

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
select lives_ok(
  $$update public.categories set personal_only = true where name = 'Feriado'$$,
  'El admin marca una categoría como solo personal'
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

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$select public.save_reminder(null, 'Con etiquetados', null, '2026-12-02 09:00-06', null, false,
      current_setting('test.reunion')::bigint, null, null,
      array['33333333-3333-3333-3333-333333333333']::uuid[], null, true)$$,
  'P0001', 'En el calendario general no se etiqueta a personas.', 'En el general no se etiqueta a nadie'
);
select throws_ok(
  $$select public.save_reminder(null, 'Cumpleaños', null, '2026-12-02 09:00-06', null, false,
      current_setting('test.personal')::bigint, null, null, '{}'::uuid[], null, true)$$,
  'P0001', 'La categoría «Personal» es solo para calendarios personales: elija otra para el calendario general.',
  'En el general no se usa la categoría Personal'
);

-- Luis publica dos en el general y deja uno personal con Ana etiquetada.
select set_config('test.g1', public.save_reminder(null, 'Comité', null, '2026-12-02 09:00-06', null, false,
  current_setting('test.reunion')::bigint, null, null, '{}'::uuid[], null, true)::text, true);
select set_config('test.g2', public.save_reminder(null, 'Cierre de mes', null, '2026-12-03 09:00-06', null, false,
  current_setting('test.reunion')::bigint, null, null, '{}'::uuid[], null, true)::text, true);
select set_config('test.p', public.save_reminder(null, 'Personal de Luis', null, '2026-12-04 09:00-06', null, false,
  current_setting('test.personal')::bigint, null, null, array['55555555-5555-5555-5555-555555555555']::uuid[], null, false)::text, true);
set constraints all immediate;

select is((select is_general from public.reminders where id = current_setting('test.g1')::bigint), true,
  'Con acceso se publica en el general');
select throws_ok(
  $$insert into public.reminder_participants (reminder_id, user_id)
    values (current_setting('test.g1')::bigint, '33333333-3333-3333-3333-333333333333')$$,
  'P0001', 'En el calendario general no se etiqueta a personas.', 'Tampoco se etiqueta después, directamente'
);
select throws_ok(
  $$select public.save_reminder(current_setting('test.g1')::bigint, 'Comité', null, '2026-12-02 09:00-06', null, false,
      current_setting('test.personal')::bigint, null, null, '{}'::uuid[])$$,
  'P0001', 'La categoría «Personal» es solo para calendarios personales: elija otra para el calendario general.',
  'Ni se le cambia a una categoría personal'
);
select throws_ok(
  $$select public.save_reminder(current_setting('test.p')::bigint, 'Personal de Luis', null, '2026-12-04 09:00-06', null, false,
      current_setting('test.reunion')::bigint, null, null, array['55555555-5555-5555-5555-555555555555']::uuid[], null, true)$$,
  'P0001', 'En el calendario general no se etiqueta a personas. Quite a los etiquetados antes de publicarlo.',
  'No se pasa al general si conserva etiquetados'
);

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

select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}', true);
select is(
  (select array_agg(id order by id) from public.reminders),
  array[current_setting('test.ana')::bigint, current_setting('test.p')::bigint],
  'Ana (sin acceso) ve lo suyo y donde está etiquetada, nada del general'
);
select is(
  (select count(*)::int from public.search_reminders(array['55555555-5555-5555-5555-555555555555']::uuid[], 'cierre')),
  0, 'Ni lo encuentra al buscar'
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
select is(
  (select count(*)::int from public.notifications where reminder_id = current_setting('test.p')::bigint and kind = 'general'),
  0, 'Lo personal no notifica al grupo'
);

-- Luis cambia la hora del cierre y lo pasa a personal; el personal lo pasa al general quitando a Ana.
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
select lives_ok(
  $$select public.save_reminder(current_setting('test.p')::bigint, 'Personal de Luis', null, '2026-12-04 09:00-06', null, false,
      current_setting('test.reunion')::bigint, null, null, '{}'::uuid[], null, true)$$,
  'Se pasa al general en un solo guardado si se quitan los etiquetados'
);
reset role;
select is(pg_temp.count_general(current_setting('test.g2')::bigint, '66666666-6666-6666-6666-666666666666', 'retirado'),
  1, 'Al pasarlo a personal, los demás reciben "retirado"');
select is(pg_temp.count_general(current_setting('test.p')::bigint, '66666666-6666-6666-6666-666666666666', 'publicado'),
  1, 'Al pasar uno personal al general, reciben "publicado"');
select is(
  (select count(*)::int from public.reminder_participants where reminder_id = current_setting('test.p')::bigint),
  0, 'Ana quedó fuera'
);

-- ---------------------------------------------------------------------------
-- Eliminar uno del general: los demás deciden si conservan una copia
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
delete from public.reminders where id = current_setting('test.p')::bigint;
reset role;
select is(pg_temp.decisions('Personal de Luis', '66666666-6666-6666-6666-666666666666'), 1,
  'Lucía decide si conserva una copia');
select is(pg_temp.decisions('Personal de Luis', '33333333-3333-3333-3333-333333333333'), 1,
  'Carlos también');
select is(pg_temp.decisions('Personal de Luis', '22222222-2222-2222-2222-222222222222')
          + pg_temp.decisions('Personal de Luis', '55555555-5555-5555-5555-555555555555'), 0,
  'Ni quien lo eliminó ni quien no tiene acceso deciden');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select set_config('test.copia', public.resolve_reminder_decision(
  (select id from public.reminder_decisions where title = 'Personal de Luis'), true)::text, true);
select is(
  (select row(owner_id, is_general, title)::text from public.reminders where id = current_setting('test.copia')::bigint),
  row('66666666-6666-6666-6666-666666666666'::uuid, false, 'Personal de Luis')::text,
  'La copia queda en el calendario personal de Lucía'
);
select is(
  (select array_agg(minutes_before) from public.reminder_alerts where reminder_id = current_setting('test.copia')::bigint),
  array[15], 'Con el aviso por defecto'
);

-- Uno que ya pasó solo se avisa.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select set_config('test.viejo', public.save_reminder(null, 'Ya pasó', null, '2020-01-10 09:00-06', null, false,
  current_setting('test.reunion')::bigint, null, null, '{}'::uuid[], null, true)::text, true);
delete from public.reminders where id = current_setting('test.viejo')::bigint;
reset role;
select is(pg_temp.decisions('Ya pasó', '66666666-6666-6666-6666-666666666666'), 0,
  'Si ya pasó, nadie decide');
select is(pg_temp.count_general_title('Ya pasó', '66666666-6666-6666-6666-666666666666', 'eliminado'), 1,
  'Solo reciben "eliminado"');

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
      current_setting('test.reunion')::bigint, null, null, '{}'::uuid[])$$,
  'Sin acceso, sigue modificando lo que publicó'
);
select throws_ok(
  $$select public.save_reminder(current_setting('test.g2')::bigint, 'Cierre de mes', null, '2026-12-03 15:00-06', null, false,
      current_setting('test.reunion')::bigint, null, null, '{}'::uuid[], null, true)$$,
  '42501', 'No tiene acceso al calendario general.', 'Pero no publica nada nuevo en el general'
);

select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select is(
  (select title from public.reminders where id = current_setting('test.g1')::bigint),
  'Comité mensual', 'Lo que publicó sigue visible en el general para los demás'
);

select * from finish();
rollback;
