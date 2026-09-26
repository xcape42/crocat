-- Crocat 1.4.5: keep the public heartbeat RPC invoker-safe while the checked implementation stays private.

create or replace function public.touch_room_presence(p_room_id uuid)
returns void
language sql
security invoker
set search_path = public, private, pg_temp
as $function$
  select private.touch_room_presence_impl(p_room_id);
$function$;

revoke all on function private.touch_room_presence_impl(uuid) from public, anon;
grant execute on function private.touch_room_presence_impl(uuid) to authenticated;

revoke all on function public.touch_room_presence(uuid) from public, anon;
grant execute on function public.touch_room_presence(uuid) to authenticated;
