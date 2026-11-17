-- Pruebas de la búsqueda de recordatorios.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'test.admin@calendariogem.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'test.luis@calendariogem.local', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'test.carlos@calendariogem.local', 'authenticated', 'authenticated');

update public.profiles set active = true, must_change_password = false
  where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
               '33333333-3333-3333-3333-333333333333');
update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111';

select set_config('test.cat', (select id::text from public.categories where name = 'Reunión'), true);

insert into public.reminders (owner_id, title, description, start_at, category_id, location, note) values
  ('22222222-2222-2222-2222-222222222222', 'Reunión de Planificación', null, '2026-12-01 09:00-06', current_setting('test.cat')::bigint, null, null),
  ('22222222-2222-2222-2222-222222222222', 'Llamada', 'Revisar el presupuesto anual', '2026-12-02 09:00-06', current_setting('test.cat')::bigint, null, null),
  ('22222222-2222-2222-2222-222222222222', 'Visita', null, '2026-12-03 09:00-06', current_setting('test.cat')::bigint, 'Oficina de San José', 'Llevar 100% de los documentos'),
  ('33333333-3333-3333-3333-333333333333', 'Reunión privada de Carlos', null, '2026-12-04 09:00-06', current_setting('test.cat')::bigint, null, null);

create function pg_temp.titles(p_user uuid, p_ids uuid[], p_query text) returns text[] language plpgsql as $$
declare v text[];
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select coalesce(array_agg(title order by title), '{}') into v from public.search_reminders(p_ids, p_query);
  reset role;
  return v;
end;
$$;

select is(pg_temp.titles('22222222-2222-2222-2222-222222222222', array['22222222-2222-2222-2222-222222222222']::uuid[], 'reunion'),
  array['Reunión de Planificación'], 'Ignora tildes y mayúsculas');
select is(pg_temp.titles('22222222-2222-2222-2222-222222222222', array['22222222-2222-2222-2222-222222222222']::uuid[], 'PRESUPUESTO'),
  array['Llamada'], 'Busca en la descripción');
select is(pg_temp.titles('22222222-2222-2222-2222-222222222222', array['22222222-2222-2222-2222-222222222222']::uuid[], 'jose'),
  array['Visita'], 'Busca en la ubicación');
select is(pg_temp.titles('22222222-2222-2222-2222-222222222222', array['22222222-2222-2222-2222-222222222222']::uuid[], '100%'),
  array['Visita'], 'Busca en la nota (y % no es comodín)');
select is(pg_temp.titles('22222222-2222-2222-2222-222222222222', array['22222222-2222-2222-2222-222222222222']::uuid[], '  planificacion   reunion '),
  array['Reunión de Planificación'], 'Con varias palabras deben aparecer todas, en cualquier orden');
select is(pg_temp.titles('22222222-2222-2222-2222-222222222222', array['22222222-2222-2222-2222-222222222222']::uuid[], 'reunion carlos'),
  '{}'::text[], 'Si falta una palabra no aparece');
select is(pg_temp.titles('22222222-2222-2222-2222-222222222222', array['22222222-2222-2222-2222-222222222222']::uuid[], '   '),
  '{}'::text[], 'Una búsqueda vacía no devuelve nada');
select is(pg_temp.titles('22222222-2222-2222-2222-222222222222', array['33333333-3333-3333-3333-333333333333']::uuid[], 'reunion'),
  '{}'::text[], 'Un usuario no encuentra recordatorios de otros');
select is(pg_temp.titles('11111111-1111-1111-1111-111111111111',
    array['22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333']::uuid[], 'reunion'),
  array['Reunión de Planificación', 'Reunión privada de Carlos'], 'El admin busca en los calendarios elegidos');
select is(pg_temp.titles('11111111-1111-1111-1111-111111111111', array['11111111-1111-1111-1111-111111111111']::uuid[], 'reunion'),
  '{}'::text[], 'Solo en los calendarios elegidos');

set local role anon;
select throws_ok($$select * from public.search_reminders(array[]::uuid[], 'x')$$, '42501', null, 'Sin sesión no se busca');

select * from finish();
rollback;
