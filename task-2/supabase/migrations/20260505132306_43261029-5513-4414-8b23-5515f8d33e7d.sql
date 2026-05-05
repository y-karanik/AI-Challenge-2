GRANT EXECUTE ON FUNCTION public.is_event_host_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_host_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_host_role(uuid, uuid, public.host_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.event_host_id(uuid) TO authenticated, anon;