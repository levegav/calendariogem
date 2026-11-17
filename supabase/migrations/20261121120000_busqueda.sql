-- =============================================================================
-- Fase 6: búsqueda de recordatorios.
-- Busca en título, descripción, ubicación y nota, sin importar tildes ni
-- mayúsculas; con varias palabras, deben aparecer todas. Abarca todas las
-- fechas de los calendarios elegidos. SECURITY INVOKER: RLS decide qué ve cada
-- quien (un usuario, lo suyo y donde está etiquetado; el admin, todo).
-- =============================================================================

create extension if not exists unaccent with schema extensions;

-- Texto normalizado para comparar: minúsculas y sin tildes.
create function private.normalize_text(p_text text)
returns text
language sql
stable
set search_path = ''
as $$
  select lower(extensions.unaccent(coalesce(p_text, '')));
$$;

grant execute on function private.normalize_text(text) to authenticated;

create function public.search_reminders(p_user_ids uuid[], p_query text, p_limit integer default 100)
returns setof public.reminders
language sql
stable
security invoker
set search_path = ''
as $$
  with terms as (
    select array_agg(t) as words
      from unnest(regexp_split_to_array(private.normalize_text(btrim(p_query)), '\s+')) as t
     where t <> ''
  )
  select r.*
    from public.reminders r, terms
   where terms.words is not null
     and (
       r.owner_id = any (p_user_ids)
       or exists (
         select 1 from public.reminder_participants p
          where p.reminder_id = r.id and p.user_id = any (p_user_ids)
       )
     )
     and not exists (
       select 1 from unnest(terms.words) as w
        where strpos(
                private.normalize_text(concat_ws(' ', r.title, r.description, r.location, r.note)),
                w
              ) = 0
     )
   -- Primero lo más cercano a hoy (hacia adelante o hacia atrás).
   order by abs(extract(epoch from (r.start_at - now()))), r.id
   limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

revoke all on function public.search_reminders(uuid[], text, integer) from public, anon, authenticated;
grant execute on function public.search_reminders(uuid[], text, integer) to authenticated;
