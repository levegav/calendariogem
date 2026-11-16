-- Pruebas de usuarios: alta automática, colores, permisos y funciones del admin.
begin;
create extension if not exists pgtap with schema extensions;
select plan(31);

insert into auth.users (id, email, aud, role) values
  ('11111111-1111-1111-1111-111111111111', 'test.admin@calendariogem.local', 'authenticated', 'authenticated'),
  ('22222222-2222-2222-2222-222222222222', 'test.user@calendariogem.local', 'authenticated', 'authenticated'),
  ('33333333-3333-3333-3333-333333333333', 'test.nuevo@calendariogem.local', 'authenticated', 'authenticated');

-- ---------------------------------------------------------------------------
-- Alta automática del perfil
-- ---------------------------------------------------------------------------
select is(
  (select username || '|' || role || '|' || active::text || '|' || must_change_password::text
     from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'test.nuevo|user|false|true',
  'El perfil nace como user, desactivado y con contraseña temporal'
);
select ok(
  (select color ~ '^#[0-9a-f]{6}$' from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'El perfil nace con un color válido'
);
select is(
  (select count(distinct color)::int from public.profiles where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')),
  3,
  'Cada usuario nuevo recibe un color distinto'
);

-- Se simula la activación que hace la Edge Function.
update public.profiles set active = true, role = 'admin', must_change_password = false
  where id = '11111111-1111-1111-1111-111111111111';
update public.profiles set active = true where id = '22222222-2222-2222-2222-222222222222';

-- ---------------------------------------------------------------------------
-- Anónimo: no ve nada
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$select * from public.profiles$$, '42501', null, 'Anónimo no puede leer perfiles');
select throws_ok(
  $$select public.set_my_theme('oscuro')$$, '42501', null, 'Anónimo no puede ejecutar funciones'
);
reset role;

-- ---------------------------------------------------------------------------
-- Usuario inactivo: no ve perfiles
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select is((select count(*)::int from public.profiles), 0, 'Un usuario desactivado no ve ningún perfil');
select throws_ok($$select public.set_my_theme('oscuro')$$, '42501', 'Sesión no válida.', 'Un desactivado no cambia su tema');
reset role;

-- ---------------------------------------------------------------------------
-- Usuario estándar
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select is((select count(*)::int from public.profiles where id in ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')), 3, 'Un usuario activo ve todos los perfiles (nombres y colores)');
select throws_ok(
  $$update public.profiles set role = 'admin' where id = '22222222-2222-2222-2222-222222222222'$$,
  '42501', null, 'Nadie escribe directamente en profiles'
);
select throws_ok(
  $$select public.admin_update_user('22222222-2222-2222-2222-222222222222', 'Yo', 'admin', true, '#123456')$$,
  '42501', 'Solo el administrador puede modificar usuarios.',
  'Un user no puede cambiar su propio rol'
);
select throws_ok(
  $$select public.admin_flag_password_reset('33333333-3333-3333-3333-333333333333')$$,
  '42501', null, 'Un user no puede restablecer contraseñas'
);
select is((select count(*)::int from public.audit_log), 0, 'Un user no ve ningún registro de auditoría');
select lives_ok($$select public.set_my_theme('oscuro')$$, 'El usuario cambia su tema');
select throws_ok($$select public.set_my_theme('rosado')$$, 'P0001', 'Tema no válido.', 'Rechaza temas inválidos');
select lives_ok($$select public.complete_password_change()$$, 'El usuario marca su contraseña como cambiada');

reset role;
select is(
  (select theme || '|' || must_change_password::text from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'oscuro|false',
  'Tema y cambio de contraseña se guardan en el propio perfil'
);

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select lives_ok(
  $$select public.admin_update_user('33333333-3333-3333-3333-333333333333', '  María Pérez  ', 'user', true, ' #A1B2C3 ')$$,
  'Admin asigna nombre, estado y color RGB a un usuario nuevo'
);
select is(
  (select full_name || '|' || role || '|' || active::text || '|' || color
     from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'María Pérez|user|true|#a1b2c3',
  'Se guardan sin espacios extra y el color en minúsculas'
);
select ok(
  exists (select 1 from public.audit_log
          where entity = 'profiles' and action = 'actualizar'
            and entity_id = '33333333-3333-3333-3333-333333333333'
            and details -> 'color' ->> 'despues' = '#a1b2c3'
            and actor_id = '11111111-1111-1111-1111-111111111111'),
  'El cambio de color queda auditado con el responsable'
);
select throws_ok(
  $$select public.admin_update_user('22222222-2222-2222-2222-222222222222', 'Carlos', 'user', true, '#A1B2C3')$$,
  'P0001', 'Ese color ya lo usa otro usuario. Elija uno distinto.',
  'Dos usuarios no pueden tener el mismo color'
);
select throws_ok(
  $$select public.admin_update_user('22222222-2222-2222-2222-222222222222', 'Carlos', 'user', true, 'azul')$$,
  'P0001', 'El color no es válido. Use el formato #RRGGBB.',
  'Rechaza colores con formato inválido'
);
select throws_ok(
  $$select public.admin_update_user('22222222-2222-2222-2222-222222222222', 'Carlos', 'user', true, null)$$,
  'P0001', 'El color no es válido. Use el formato #RRGGBB.',
  'Rechaza color vacío'
);
select lives_ok(
  $$select public.admin_update_user('33333333-3333-3333-3333-333333333333', 'María Pérez', 'user', true, '#a1b2c3')$$,
  'Un usuario puede conservar su propio color al editarse'
);
select lives_ok(
  $$select public.admin_update_user('33333333-3333-3333-3333-333333333333', 'María Pérez', 'user', false, '#a1b2c3')$$,
  'Admin desactiva un usuario'
);
select is(
  (select count(*)::int from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  1,
  'Desactivar no borra el perfil (el admin lo sigue viendo)'
);
select throws_ok(
  $$select public.admin_update_user('11111111-1111-1111-1111-111111111111', 'Admin', 'user', true,
      (select color from public.profiles where id = '11111111-1111-1111-1111-111111111111'))$$,
  'P0001', 'No puede cambiar su propio rol ni desactivar su propia cuenta.',
  'El admin no puede cambiar su propio rol'
);
select throws_ok(
  $$select public.admin_update_user('11111111-1111-1111-1111-111111111111', 'Admin', 'admin', false,
      (select color from public.profiles where id = '11111111-1111-1111-1111-111111111111'))$$,
  'P0001', 'No puede cambiar su propio rol ni desactivar su propia cuenta.',
  'El admin no puede desactivarse'
);
select throws_ok(
  $$select public.admin_update_user('11111111-1111-1111-1111-111111111111', '   ', 'admin', true, '#000000')$$,
  'P0001', 'El nombre completo debe tener entre 1 y 100 caracteres.', 'Rechaza nombres vacíos'
);
select lives_ok(
  $$select public.admin_flag_password_reset('22222222-2222-2222-2222-222222222222')$$,
  'Admin marca un restablecimiento de contraseña'
);
select ok(
  (select must_change_password from public.profiles where id = '22222222-2222-2222-2222-222222222222')
  and exists (select 1 from public.audit_log where action = 'restablecer_contrasena'
              and entity_id = '22222222-2222-2222-2222-222222222222'),
  'Tras restablecer, el usuario debe cambiar la contraseña y queda auditado'
);
select ok((select count(*) > 0 from public.audit_log), 'El admin puede consultar la auditoría');

reset role;

select * from finish();
rollback;
