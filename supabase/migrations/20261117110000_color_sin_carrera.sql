-- Corrección: si se creaban dos usuarios al mismo tiempo, ambos podían recibir
-- el mismo color inicial y la segunda creación fallaba (índice único de color).
-- El bloqueo hace que la elección de color se haga de a uno, hasta el final de
-- la transacción que crea el perfil.
create or replace function private.next_free_color()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_palette text[] := array[
    '#2563eb', '#16a34a', '#ea580c', '#9333ea', '#dc2626', '#0891b2',
    '#ca8a04', '#db2777', '#4f46e5', '#059669', '#b45309', '#475569',
    '#e11d48', '#0d9488', '#65a30d', '#c026d3'
  ];
  v_color text;
begin
  perform pg_advisory_xact_lock(hashtext('calendariogem.profiles.color'));

  foreach v_color in array v_palette loop
    if not exists (select 1 from public.profiles where color = v_color) then
      return v_color;
    end if;
  end loop;

  -- Paleta agotada: un color aleatorio de intensidad media que no esté en uso.
  loop
    v_color := '#' || lpad(to_hex(40 + floor(random() * 176)::int), 2, '0')
                   || lpad(to_hex(40 + floor(random() * 176)::int), 2, '0')
                   || lpad(to_hex(40 + floor(random() * 176)::int), 2, '0');
    exit when not exists (select 1 from public.profiles where color = v_color);
  end loop;
  return v_color;
end;
$$;

revoke all on function private.next_free_color() from public, anon, authenticated;
