-- Crocat 1.5.1: expose authoritative server time for synchronized online countdowns.

create or replace function public.server_clock_ms()
returns bigint
language sql
volatile
security invoker
set search_path = pg_catalog
as $function$
  select floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
$function$;

revoke all on function public.server_clock_ms() from public, anon;
grant execute on function public.server_clock_ms() to authenticated;
