
-- =====================================================
-- Security hardening migration
-- =====================================================

-- 1) hosts.contact_email column-level restriction: hide from anon
REVOKE SELECT (contact_email) ON public.hosts FROM anon;
-- Authenticated users can still read it (used by host dashboard / settings).
-- Server functions using the service-role admin client are unaffected.

-- 2) host_invites: drop overly permissive SELECT and UPDATE policies.
DROP POLICY IF EXISTS "host_invites_select_all" ON public.host_invites;
DROP POLICY IF EXISTS "host_invites_update_redeem" ON public.host_invites;

-- Allow host-team admins to view their own host's invites (for invite mgmt UI).
CREATE POLICY "host_invites_select_host_role"
  ON public.host_invites
  FOR SELECT
  USING (public.has_host_role(host_id, auth.uid(), 'host'::host_role));

-- Note: invite redemption goes through the SECURITY DEFINER function
-- public.redeem_host_invite(_token), so no UPDATE RLS policy is required.

-- 3) events: remove the policy that exposed unlisted events to everyone.
DROP POLICY IF EXISTS "events_select_published_any_visibility" ON public.events;
-- Unlisted events are fetched server-side via the admin client in
-- getPublicEvent (direct-link access is preserved).

-- 4) Storage: remove broad event-covers policies; keep folder-ownership ones.
DROP POLICY IF EXISTS "event_covers_auth_insert" ON storage.objects;
DROP POLICY IF EXISTS "event_covers_auth_update" ON storage.objects;
DROP POLICY IF EXISTS "event_covers_auth_delete" ON storage.objects;

-- 5) Public buckets: drop broad SELECT policy that allows listing all files.
-- Direct file URLs (/storage/v1/object/public/...) keep working because the
-- buckets are flagged public; only directory listing via the API is blocked.
DROP POLICY IF EXISTS "host-logos public read" ON storage.objects;

-- 6) Lock down SECURITY DEFINER helper functions: revoke from anon,
-- and restrict the RLS-helper functions so they cannot be called directly.
REVOKE EXECUTE ON FUNCTION public.create_host(text, text, text, text, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.redeem_host_invite(text) FROM anon, public;

REVOKE EXECUTE ON FUNCTION public.is_host_member(uuid, uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.has_host_role(uuid, uuid, public.host_role) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.is_event_host_member(uuid, uuid) FROM anon, authenticated, public;
