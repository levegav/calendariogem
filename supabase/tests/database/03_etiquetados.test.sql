-- Pruebas de etiquetados: quién etiqueta, quién se sale y qué calendarios se ven.
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'test.admin@calendariogem.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'test.luis@calendariogem.local', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'test.carlos@calendariogem.local', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-4444-444444444444', 'test.inactivo@calendariogem.local', 'authenticated', 'authenticated'),
  ('55555555-5555-5555-5555-555555555555', 'test.ana@calendariogem.local', 'authenticated', 'authenticated');

update public.profiles set active = true, must_change_password = false
  where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
               '33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555');
update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111';

select set_config('test.reunion', (select id::text from public.categories where name = 'Reunión'), true);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Luis crea un recordatorio y etiqueta a Carlos y Ana
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select ok(
  set_config('test.r', public.save_reminder(
    null, 'Planificación', null, '2026-11-20 14:00-06', '2026-11-20 15:00-06', false,
    current_setting('test.reunion')::bigint, null, null,
    array['33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555',
          '33333333-3333-3333-3333-333333333333']::uuid[]
  )::text, true) is not null,
  'El creador guarda el recordatorio con sus etiquetados'
);
select is(
  (select count(*)::int from public.reminder_participants where reminder_id = current_setting('test.r')::bigint),
  2, 'Quedan 2 etiquetados (un id repetido no duplica)'
);
select is(
  (select owner_id::text from public.reminders where id = current_setting('test.r')::bigint),
  '22222222-2222-2222-2222-222222222222', 'Es un único registro original del creador'
);
select throws_ok(
  $$select public.save_reminder(current_setting('test.r')::bigint, 'Planificación', null, '2026-11-20 14:00-06', null, false,
      current_setting('test.reunion')::bigint, null, null, array['22222222-2222-2222-2222-222222222222']::uuid[])$$,
  'P0001', 'El creador no se puede etiquetar en su propio recordatorio.', 'El creador no se etiqueta a sí mismo'
);
select throws_ok(
  $$select public.save_reminder(current_setting('test.r')::bigint, 'Planificación', null, '2026-11-20 14:00-06', null, false,
      current_setting('test.reunion')::bigint, null, null, array['44444444-4444-4444-4444-444444444444']::uuid[])$$,
  'P0001', 'Solo se puede etiquetar a usuarios activos.', 'No se etiqueta a un usuario inactivo'
);

-- ---------------------------------------------------------------------------
-- Carlos (etiquetado) no administra el recordatorio, pero puede salirse
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

select throws_ok(
  $$select public.save_reminder(current_setting('test.r')::bigint, 'Cambiado', null, '2026-11-20 14:00-06', null, false,
      current_setting('test.reunion')::bigint, null, null, '{}'::uuid[])$$,
  '42501', 'Solo el creador puede modificar este recordatorio.', 'Un etiquetado no modifica el recordatorio'
);
select throws_ok(
  $$insert into public.reminder_participants (reminder_id, user_id)
    values (current_setting('test.r')::bigint, '11111111-1111-1111-1111-111111111111')$$,
  '42501', null, 'Un etiquetado no etiqueta a otros'
);
select is_empty(
  $$delete from public.reminder_participants
     where reminder_id = current_setting('test.r')::bigint
       and user_id = '55555555-5555-5555-5555-555555555555' returning user_id$$,
  'Un etiquetado no quita a otros'
);
select is(
  (select count(*)::int from public.calendar_reminders(array['33333333-3333-3333-3333-333333333333']::uuid[],
     '2026-11-01 00:00-06', '2026-12-01 00:00-06') where id = current_setting('test.r')::bigint),
  1, 'El recordatorio aparece en el calendario de Carlos'
);
select is(
  (select count(*)::int from public.calendar_reminders(array['11111111-1111-1111-1111-111111111111']::uuid[],
     '2026-11-01 00:00-06', '2026-12-01 00:00-06') where id = current_setting('test.r')::bigint),
  0, 'No aparece en el calendario de quien no participa'
);
select is(
  (select count(*)::int from public.calendar_reminders(array['22222222-2222-2222-2222-222222222222']::uuid[],
     '2026-12-01 00:00-06', '2027-01-01 00:00-06') where id = current_setting('test.r')::bigint),
  0, 'Fuera del rango no aparece'
);
select isnt_empty(
  $$delete from public.reminder_participants
     where reminder_id = current_setting('test.r')::bigint
       and user_id = '33333333-3333-3333-3333-333333333333' returning user_id$$,
  'Carlos se sale del recordatorio'
);
select is(
  (select count(*)::int from public.calendar_reminders(array['33333333-3333-3333-3333-333333333333']::uuid[],
     '2026-11-01 00:00-06', '2026-12-01 00:00-06') where id = current_setting('test.r')::bigint),
  0, 'Tras salirse ya no aparece en su calendario'
);
select is(
  (select count(*)::int from public.reminders where id = current_setting('test.r')::bigint),
  0, 'Tras salirse ya no puede ver el recordatorio'
);
select is(
  (select count(*)::int from public.reminder_participants where reminder_id = current_setting('test.r')::bigint),
  0, 'Ni quiénes están etiquetados'
);

-- Un usuario no puede ver el calendario de otro (solo el admin).
select is(
  (select count(*)::int from public.calendar_reminders(array['22222222-2222-2222-2222-222222222222']::uuid[],
     '2026-11-01 00:00-06', '2026-12-01 00:00-06')),
  0, 'Un usuario no ve el calendario de otro'
);

-- El admin sí ve todos los calendarios.
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select is(
  (select count(*)::int from public.calendar_reminders(array['22222222-2222-2222-2222-222222222222']::uuid[],
     '2026-11-01 00:00-06', '2026-12-01 00:00-06') where id = current_setting('test.r')::bigint),
  1, 'El admin ve el calendario de Luis'
);
select is(
  (select count(*)::int from public.reminder_participants where reminder_id = current_setting('test.r')::bigint),
  1, 'El admin ve los etiquetados (queda Ana)'
);
-- ---------------------------------------------------------------------------
-- El creador edita los etiquetados
-- ---------------------------------------------------------------------------
-- Se marca la fecha en que se etiquetó a Ana para comprobar que no se reinserta.
reset role;
update public.reminder_participants set added_at = '2020-01-01 00:00+00'
 where reminder_id = current_setting('test.r')::bigint and user_id = '55555555-5555-5555-5555-555555555555';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select lives_ok(
  $$select public.save_reminder(current_setting('test.r')::bigint, 'Planificación Q1', null, '2026-11-20 14:00-06', null, false,
      current_setting('test.reunion')::bigint, null, null,
      array['55555555-5555-5555-5555-555555555555', '33333333-3333-3333-3333-333333333333']::uuid[])$$,
  'El creador vuelve a etiquetar a Carlos'
);
select is(
  (select string_agg(user_id::text, ',' order by user_id) from public.reminder_participants
    where reminder_id = current_setting('test.r')::bigint),
  '33333333-3333-3333-3333-333333333333,55555555-5555-5555-5555-555555555555',
  'Están Carlos y Ana'
);
select is(
  (select added_at from public.reminder_participants
    where reminder_id = current_setting('test.r')::bigint and user_id = '55555555-5555-5555-5555-555555555555'),
  '2020-01-01 00:00+00'::timestamptz,
  'Quien ya estaba etiquetado se mantiene (no se vuelve a agregar)'
);
select lives_ok(
  $$select public.save_reminder(current_setting('test.r')::bigint, 'Planificación Q1', null, '2026-11-20 14:00-06', null, false,
      current_setting('test.reunion')::bigint, null, null, array['55555555-5555-5555-5555-555555555555']::uuid[])$$,
  'El creador quita a Carlos'
);
select is(
  (select count(*)::int from public.reminder_participants where reminder_id = current_setting('test.r')::bigint),
  1, 'Queda solo Ana'
);
select lives_ok(
  $$delete from public.reminders where id = current_setting('test.r')::bigint$$,
  'El creador elimina el recordatorio'
);
select is(
  (select count(*)::int from public.reminder_participants where reminder_id = current_setting('test.r')::bigint),
  0, 'Al eliminarlo desaparecen sus etiquetados'
);

-- ---------------------------------------------------------------------------
-- Sin sesión no hay acceso
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok(
  $$select count(*) from public.reminder_participants$$,
  '42501', null, 'Sin sesión no se ven etiquetados'
);

select * from finish();
rollback;
