-- =============================================================================
-- Cambio pedido por el usuario (2026-11-17): solo el administrador puede ver
-- todos los calendarios. Un usuario ve únicamente los recordatorios que creó y
-- aquellos en los que está etiquetado (y quiénes más participan en ellos).
-- =============================================================================

-- Funciones auxiliares SECURITY DEFINER: evitan que las políticas de
-- reminders y reminder_participants se consulten entre sí en bucle.
create function private.is_reminder_owner(p_reminder_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reminders r
     where r.id = p_reminder_id and r.owner_id = (select auth.uid())
  );
$$;

create function private.is_reminder_participant(p_reminder_id bigint)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.reminder_participants p
     where p.reminder_id = p_reminder_id and p.user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_reminder_owner(bigint) from public, anon;
revoke all on function private.is_reminder_participant(bigint) from public, anon;
grant execute on function private.is_reminder_owner(bigint) to authenticated;
grant execute on function private.is_reminder_participant(bigint) to authenticated;

-- Recordatorios: el admin ve todos; el usuario, los suyos y donde está etiquetado.
drop policy "Usuarios activos leen recordatorios" on public.reminders;

create policy "Admin ve todos; usuario ve los suyos y donde está etiquetado" on public.reminders
  for select to authenticated
  using (
    (select private.is_active_user())
    and (
      (select private.is_admin())
      or owner_id = (select auth.uid())
      or private.is_reminder_participant(id)
    )
  );

-- Etiquetados: los ve el admin, el creador del recordatorio y sus etiquetados.
drop policy "Usuarios activos ven etiquetados" on public.reminder_participants;

create policy "Ven etiquetados el admin, el creador y los etiquetados" on public.reminder_participants
  for select to authenticated
  using (
    (select private.is_active_user())
    and (
      (select private.is_admin())
      or user_id = (select auth.uid())
      or private.is_reminder_owner(reminder_id)
      or private.is_reminder_participant(reminder_id)
    )
  );

-- Las políticas de insert/delete de etiquetados consultaban reminders con una
-- subconsulta; ahora usan la función auxiliar (misma regla, sin depender de
-- la política de lectura de reminders).
drop policy "El creador etiqueta" on public.reminder_participants;
create policy "El creador etiqueta" on public.reminder_participants
  for insert to authenticated
  with check ((select private.is_active_user()) and private.is_reminder_owner(reminder_id));

drop policy "El creador quita o el etiquetado se sale" on public.reminder_participants;
create policy "El creador quita o el etiquetado se sale" on public.reminder_participants
  for delete to authenticated
  using (
    (select private.is_active_user())
    and (user_id = (select auth.uid()) or private.is_reminder_owner(reminder_id))
  );

comment on function public.calendar_reminders(uuid[], timestamptz, timestamptz) is
  'Recordatorios de los calendarios elegidos. Por RLS, un usuario solo recibe los suyos y aquellos en los que está etiquetado; el admin, todos.';
