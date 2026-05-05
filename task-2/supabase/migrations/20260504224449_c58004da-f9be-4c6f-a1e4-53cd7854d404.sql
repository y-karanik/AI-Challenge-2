
-- Re-grant EXECUTE so RLS expressions can call these helpers.
grant execute on function public.is_host_member(uuid, uuid) to authenticated, anon;
grant execute on function public.has_host_role(uuid, uuid, public.host_role) to authenticated, anon;
grant execute on function public.is_event_host_member(uuid, uuid) to authenticated, anon;
grant execute on function public.event_host_id(uuid) to authenticated, anon;

-- Tighten event UPDATE: only members with role 'host' may update an event row.
-- (Checkers should only update RSVP check-ins.)
drop policy if exists "events_update_host_member" on public.events;
create policy "events_update_host_role" on public.events for update
  using (public.has_host_role(host_id, auth.uid(), 'host'));
