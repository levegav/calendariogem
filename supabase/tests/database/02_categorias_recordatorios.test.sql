-- Pruebas de categorías y recordatorios: permisos, reglas y propiedad.
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'test.admin@calendariogem.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'test.luis@calendariogem.local', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'test.carlos@calendariogem.local', 'authenticated', 'authenticated'),
  ('44444444-4444-4444-4444-444444444444', 'test.inactivo@calendariogem.local', 'authenticated', 'authenticated');

update public.profiles set active = true, must_change_password = false
  where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222',
               '33333333-3333-3333-3333-333333333333');
update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select string_agg(name, ',' order by id) from public.categories),
  'Reunión,Vencimiento,Tarea,Personal,Feriado',
  'Existen las 5 categorías iniciales'
);

-- ---------------------------------------------------------------------------
-- Categorías: solo el admin las administra
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.categories), 5, 'Un usuario ve las categorías');
select throws_ok(
  $$insert into public.categories (name, color) values ('Mía', '#000000')$$,
  '42501', null, 'Un usuario no crea categorías'
);
select is_empty(
  $$update public.categories set name = 'Hack' where name = 'Tarea' returning id$$,
  'Un usuario no modifica categorías'
);
select throws_ok(
  $$select public.admin_delete_category((select id from public.categories where name = 'Tarea'))$$,
  '42501', null, 'Un usuario no elimina categorías'
);

-- ---------------------------------------------------------------------------
-- Recordatorios de un usuario
-- ---------------------------------------------------------------------------
select lives_ok(
  $$insert into public.reminders (title, start_at, end_at, category_id, description, location, note)
    values ('Reunión de equipo', '2026-11-20 14:00-06', '2026-11-20 15:00-06',
            (select id from public.categories where name = 'Reunión'), 'Revisar avances', 'Sala 2', 'Llevar laptop')$$,
  'Un usuario crea su recordatorio'
);
select is(
  (select owner_id::text from public.reminders where title = 'Reunión de equipo'),
  '22222222-2222-2222-2222-222222222222',
  'El dueño es quien lo creó'
);
select throws_ok(
  $$insert into public.reminders (owner_id, title, start_at, category_id)
    values ('33333333-3333-3333-3333-333333333333', 'Suplantado', now(),
            (select id from public.categories where name = 'Tarea'))$$,
  '42501', null, 'No se puede crear un recordatorio a nombre de otro'
);
select throws_ok(
  $$insert into public.reminders (title, start_at, end_at, category_id)
    values ('Al revés', '2026-11-20 15:00-06', '2026-11-20 14:00-06',
            (select id from public.categories where name = 'Tarea'))$$,
  '23514', null, 'La finalización no puede ser anterior al inicio'
);
select throws_ok(
  $$insert into public.reminders (title, start_at, category_id)
    values ('   ', now(), (select id from public.categories where name = 'Tarea'))$$,
  '23514', null, 'El título no puede estar vacío'
);
select lives_ok(
  $$insert into public.reminders (title, start_at, all_day, category_id)
    values ('Cierre de mes', '2026-11-30 00:00-06', true, (select id from public.categories where name = 'Vencimiento'))$$,
  'Crea un recordatorio de todo el día'
);
select lives_ok(
  $$update public.reminders set title = 'Reunión semanal' where title = 'Reunión de equipo'$$,
  'El dueño edita su recordatorio'
);
select throws_ok(
  $$update public.reminders set owner_id = '33333333-3333-3333-3333-333333333333' where title = 'Reunión semanal'$$,
  '42501', null, 'Nadie puede cambiar el dueño de un recordatorio'
);
reset role;
select is(
  (select owner_id::text from public.reminders where title = 'Reunión semanal'),
  '22222222-2222-2222-2222-222222222222',
  'El dueño sigue siendo el creador original'
);

-- ---------------------------------------------------------------------------
-- Otro usuario: ve, pero no modifica ni elimina
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

select is((select count(*)::int from public.reminders where owner_id = '22222222-2222-2222-2222-222222222222'), 2, 'Otro usuario ve los recordatorios de los demás');
select is_empty(
  $$update public.reminders set title = 'Modificado' where title = 'Reunión semanal' returning id$$,
  'Otro usuario no modifica un recordatorio ajeno'
);
select is_empty(
  $$delete from public.reminders where title = 'Reunión semanal' returning id$$,
  'Otro usuario no elimina un recordatorio ajeno'
);
reset role;
select is((select count(*)::int from public.reminders where owner_id = '22222222-2222-2222-2222-222222222222'), 2, 'Los recordatorios ajenos siguen intactos');

-- ---------------------------------------------------------------------------
-- Usuario desactivado y anónimo: nada
-- ---------------------------------------------------------------------------
-- El desactivado tampoco ve categorías: se pasa el id directamente.
select set_config('test.categoria', (select id::text from public.categories where name = 'Tarea'), true);
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select is((select count(*)::int from public.reminders), 0, 'Un usuario desactivado no ve recordatorios');
select throws_ok(
  $$insert into public.reminders (title, start_at, category_id)
    values ('Intento', now(), current_setting('test.categoria')::bigint)$$,
  '42501', null, 'Un usuario desactivado no crea recordatorios'
);
reset role;

set local role anon;
select throws_ok($$select * from public.reminders$$, '42501', null, 'Anónimo no ve recordatorios');
reset role;

-- ---------------------------------------------------------------------------
-- Admin: categorías
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$insert into public.categories (name, color) values ('Capacitación', '#0891b2')$$,
  'El admin crea una categoría'
);
select throws_ok(
  $$insert into public.categories (name, color) values ('capacitación', '#000000')$$,
  '23505', null, 'No se repiten nombres de categoría (sin importar mayúsculas)'
);
select throws_ok(
  $$insert into public.categories (name, color) values ('Mal color', 'rojo')$$,
  '23514', null, 'El color de la categoría debe ser #rrggbb'
);
select lives_ok(
  $$update public.categories set name = 'Capacitaciones', color = '#0d9488' where name = 'Capacitación'$$,
  'El admin edita nombre y color'
);
select is(
  public.admin_delete_category((select id from public.categories where name = 'Capacitaciones')),
  'eliminada',
  'Una categoría sin uso se elimina'
);
select is(
  public.admin_delete_category((select id from public.categories where name = 'Reunión')),
  'desactivada',
  'Una categoría en uso solo se desactiva'
);
select is(
  (select c.name || '|' || c.active::text from public.reminders r join public.categories c on c.id = r.category_id
    where r.title = 'Reunión semanal'),
  'Reunión|false',
  'El recordatorio conserva su categoría desactivada'
);
reset role;

-- ---------------------------------------------------------------------------
-- Categoría desactivada: no se asigna a nada nuevo
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select throws_ok(
  $$insert into public.reminders (title, start_at, category_id)
    values ('Nueva reunión', now(), (select id from public.categories where name = 'Reunión'))$$,
  'P0001', 'La categoría seleccionada no existe o está desactivada.',
  'No se puede usar una categoría desactivada en un recordatorio nuevo'
);
select lives_ok(
  $$update public.reminders set note = 'Cambió la sala' where title = 'Reunión semanal'$$,
  'Un recordatorio con categoría desactivada se puede editar sin cambiarla'
);
reset role;

select * from finish();
rollback;
