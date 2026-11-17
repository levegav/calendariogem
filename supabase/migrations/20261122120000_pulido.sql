-- =============================================================================
-- Fase 7: pulido. Índices para las llaves foráneas que el asesor de Supabase
-- marcó sin índice (aceleran los borrados en cascada y las consultas por ellas).
-- =============================================================================

create index notifications_actor_idx on public.notifications (actor_id);
create index reminder_decisions_category_idx on public.reminder_decisions (category_id);
create index reminder_decisions_former_owner_idx on public.reminder_decisions (former_owner_id);
create index reminder_decisions_kept_reminder_idx on public.reminder_decisions (kept_reminder_id);
