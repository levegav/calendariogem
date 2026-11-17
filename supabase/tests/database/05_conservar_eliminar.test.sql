-- Pruebas de la ventana Conservar / Eliminar.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email, aud, role) values
  ('22222222-2222-2222-2222-222222222222', 'test.luis@calendariogem.local', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'test.carlos@calendariogem.local', 'authenticated', 'authenticated'),
  ('55555555-5555-5555-5555-555555555555', 'test.ana@calendariogem.local', 'authenticated', 'authenticated');

update public.profiles set active = true, must_change_password = false
  where id in ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333',
               '55555555-5555-5555-5555-555555555555');

select set_config('test.reunion', (select id::text from public.categories where name = 'Reunión'), true);
select set_config('test.feriado', (select id::text from public.categories where name = 'Feriado'), true);

create function pg_temp.pending(p_user uuid) returns int language sql as $$
  select count(*)::int from public.reminder_decisions where user_id = p_user and resolved_at is null;
$$;
create function pg_temp.as_user(p_user uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$;
-- Crea un recordatorio de Luis con etiquetados (como Luis) y devuelve el id.
create function pg_temp.reminder_of_luis(p_title text, p_start timestamptz, p_people uuid[], p_category bigint)
returns bigint language plpgsql as $$
declare v bigint;
begin
  perform pg_temp.as_user('22222222-2222-2222-2222-222222222222');
  set local role authenticated;
  v := public.save_reminder(null, p_title, 'Detalle', p_start, null, false, p_category, 'Sala 2', 'Nota', p_people, array[30]);
  reset role;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- El creador elimina un recordatorio con etiquetados
-- ---------------------------------------------------------------------------
select set_config('test.r1', pg_temp.reminder_of_luis('Comité', '2026-12-10 14:00-06',
  array['33333333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555']::uuid[],
  current_setting('test.reunion')::bigint)::text, true);

set local role authenticated;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select public.set_reminder_alerts(current_setting('test.r1')::bigint, array[0, 60]);
select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
delete from public.reminders where id = current_setting('test.r1')::bigint;
reset role;

select is(pg_temp.pending('33333333-3333-3333-3333-333333333333'), 1, 'Carlos tiene una decisión pendiente');
select is(pg_temp.pending('55555555-5555-5555-5555-555555555555'), 1, 'Ana tiene una decisión pendiente');
select is(pg_temp.pending('22222222-2222-2222-2222-222222222222'), 0, 'El creador no decide nada');
select is(
  (select row(reason, title, description, location, note, alerts, former_owner_id)::text from public.reminder_decisions
    where user_id = '33333333-3333-3333-3333-333333333333'),
  row('eliminado', 'Comité', 'Detalle', 'Sala 2', 'Nota', array[0, 60], '22222222-2222-2222-2222-222222222222'::uuid)::text,
  'La decisión guarda la copia de los datos y los avisos de la persona');
select is((select count(*)::int from public.notifications where reminder_title = 'Comité' and kind in ('quitado', 'salida')),
  0, 'Eliminar no envía "quitado" ni "salida"');

-- Cada quien ve solo las suyas.
set local role authenticated;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select is((select count(*)::int from public.reminder_decisions), 1, 'Carlos ve solo su decisión');
select set_config('test.d_carlos', (select id::text from public.reminder_decisions), true);
select throws_ok($$update public.reminder_decisions set resolved_at = now(), decision = 'eliminar'$$, '42501', null,
  'Las decisiones no se cambian directamente');

-- Ana no puede resolver la de Carlos.
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select throws_ok(format('select public.resolve_reminder_decision(%s, true)', current_setting('test.d_carlos')),
  'P0002', 'No se encontró la decisión.', 'Nadie resuelve la decisión de otra persona');

-- Carlos conserva.
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select set_config('test.copia', public.resolve_reminder_decision(current_setting('test.d_carlos')::bigint, true)::text, true);
select isnt(current_setting('test.copia'), '', 'Conservar devuelve la copia');
select is(
  (select row(owner_id, title, description, start_at, all_day, category_id, location, note)::text
     from public.reminders where id = current_setting('test.copia')::bigint),
  row('33333333-3333-3333-3333-333333333333'::uuid, 'Comité', 'Detalle', '2026-12-10 14:00-06'::timestamptz, false,
      current_setting('test.reunion')::bigint, 'Sala 2', 'Nota')::text,
  'La copia es de Carlos y tiene los mismos datos');
select is((select array_agg(minutes_before order by minutes_before) from public.reminder_alerts
            where reminder_id = current_setting('test.copia')::bigint), array[0, 60],
  'La copia conserva los avisos que tenía Carlos');
select throws_ok(format('select public.resolve_reminder_decision(%s, false)', current_setting('test.d_carlos')),
  'P0001', 'Esta decisión ya se tomó.', 'No se decide dos veces');

-- Ana elimina.
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select is(public.resolve_reminder_decision((select id from public.reminder_decisions), false), null::bigint,
  'Eliminar no crea copia');
reset role;
select is(
  (select array_agg(decision order by decision) from public.reminder_decisions where reason = 'eliminado'),
  array['conservar', 'eliminar'], 'Cada persona decide por su cuenta');
select is((select count(*)::int from public.reminders where title = 'Comité'), 1,
  'Solo existe la copia de Carlos');

-- ---------------------------------------------------------------------------
-- Se desactiva al creador
-- ---------------------------------------------------------------------------
select set_config('test.futuro', pg_temp.reminder_of_luis('Revisión futura', now() + interval '3 days',
  array['33333333-3333-3333-3333-333333333333']::uuid[], current_setting('test.reunion')::bigint)::text, true);
select set_config('test.pasado', pg_temp.reminder_of_luis('Revisión pasada', now() - interval '3 days',
  array['33333333-3333-3333-3333-333333333333']::uuid[], current_setting('test.reunion')::bigint)::text, true);
select set_config('test.hoy', pg_temp.reminder_of_luis('Todo el día de hoy', now() - interval '1 hour',
  array['55555555-5555-5555-5555-555555555555']::uuid[], current_setting('test.feriado')::bigint)::text, true);
update public.reminders set all_day = true, start_at = date_trunc('day', now() at time zone 'America/Costa_Rica') at time zone 'America/Costa_Rica'
 where id = current_setting('test.hoy')::bigint;
select pg_temp.reminder_of_luis('Sin etiquetados', now() + interval '2 days', '{}', current_setting('test.reunion')::bigint);

update public.profiles set active = false where id = '22222222-2222-2222-2222-222222222222';

select is(
  (select reminder_id::text from public.reminder_decisions
    where user_id = '33333333-3333-3333-3333-333333333333' and reason = 'creador_desactivado' and resolved_at is null),
  current_setting('test.futuro'), 'Carlos decide sobre el recordatorio futuro');
select is(
  (select count(*)::int from public.reminder_decisions where reminder_id = current_setting('test.pasado')::bigint),
  0, 'Los recordatorios que ya pasaron no se tocan');
select is(
  (select count(*)::int from public.reminder_decisions
    where reminder_id = current_setting('test.hoy')::bigint and user_id = '55555555-5555-5555-5555-555555555555'),
  1, 'Uno de todo el día de hoy todavía cuenta como futuro');
select is((select count(*)::int from public.reminders where owner_id = '22222222-2222-2222-2222-222222222222'),
  4, 'Desactivar no borra los recordatorios del creador');

-- Volver a desactivar no duplica.
update public.profiles set active = true where id = '22222222-2222-2222-2222-222222222222';
update public.profiles set active = false where id = '22222222-2222-2222-2222-222222222222';
select is(pg_temp.pending('33333333-3333-3333-3333-333333333333'), 1, 'Desactivar de nuevo no duplica la decisión');

-- Carlos elimina: deja de participar, el original sigue y Luis (inactivo) no recibe "salida".
set local role authenticated;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select public.resolve_reminder_decision(
  (select id from public.reminder_decisions where resolved_at is null), false);
reset role;
select is((select count(*)::int from public.reminder_participants where reminder_id = current_setting('test.futuro')::bigint),
  0, 'Eliminar quita su participación');
select is((select count(*)::int from public.reminders where id = current_setting('test.futuro')::bigint),
  1, 'El original del creador desactivado se mantiene');
select is((select count(*)::int from public.notifications
            where user_id = '22222222-2222-2222-2222-222222222222' and kind = 'salida'),
  0, 'No se notifica a un usuario desactivado');

-- Ana conserva uno cuya categoría ya está desactivada.
update public.categories set active = false where id = current_setting('test.feriado')::bigint;
set local role authenticated;
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select set_config('test.copia_ana', public.resolve_reminder_decision(
  (select id from public.reminder_decisions where resolved_at is null), true)::text, true);
reset role;
select is((select category_id::text from public.reminders where id = current_setting('test.copia_ana')::bigint),
  current_setting('test.feriado'), 'La copia mantiene su categoría aunque esté desactivada');
select is((select all_day from public.reminders where id = current_setting('test.copia_ana')::bigint),
  true, 'La copia mantiene "todo el día"');
select is((select count(*)::int from public.reminder_participants
            where reminder_id = current_setting('test.hoy')::bigint and user_id = '55555555-5555-5555-5555-555555555555'),
  0, 'Conservar también la quita del original');
select throws_ok(
  format($$insert into public.reminders (owner_id, title, start_at, category_id) values ('55555555-5555-5555-5555-555555555555', 'x', now(), %s)$$,
         current_setting('test.feriado')),
  'P0001', 'La categoría seleccionada no existe o está desactivada.',
  'Fuera de "Conservar" sigue sin poder usarse una categoría desactivada');

-- ---------------------------------------------------------------------------
-- Infraestructura
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reminder_decisions'),
  1, 'Las decisiones se publican en tiempo real');
set local role anon;
select throws_ok($$select * from public.reminder_decisions$$, '42501', null, 'Sin sesión no hay acceso a decisiones');
select throws_ok($$select public.resolve_reminder_decision(1, true)$$, '42501', null, 'Sin sesión no se resuelve nada');

select * from finish();
rollback;
