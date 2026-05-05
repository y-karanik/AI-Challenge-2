
-- Revoke EXECUTE on internal helpers (RLS uses them via SECURITY DEFINER from postgres role)
revoke execute on function public.is_host_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.has_host_role(uuid, uuid, public.host_role) from public, anon, authenticated;
revoke execute on function public.is_event_host_member(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.event_host_id(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.tg_set_updated_at() from public, anon, authenticated;
revoke execute on function public.tg_rsvps_restrict_checkin() from public, anon, authenticated;

-- Restrict listing of event-covers bucket: drop broad SELECT, replace with narrower one
-- that requires knowing the object name (no listing). Direct file URLs still work because
-- the bucket is public — Supabase serves /object/public/<bucket>/<path> bypassing this policy.
drop policy if exists "event_covers_public_read" on storage.objects;
-- (No SELECT policy on event-covers via storage.objects API => no listing for anon/auth.
--  Public asset URLs continue to work because the bucket is marked public.)
