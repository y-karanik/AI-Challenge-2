
-- 1) hosts: split SELECT into anon (no contact_email) vs authenticated (full row).
DROP POLICY IF EXISTS "hosts_select_all" ON public.hosts;

-- Authenticated users can see the full row (used by host dashboard, settings, etc.)
CREATE POLICY "hosts_select_authenticated"
  ON public.hosts
  FOR SELECT
  TO authenticated
  USING (true);

-- Anonymous visitors can also SELECT, but column privileges below hide contact_email.
CREATE POLICY "hosts_select_anon"
  ON public.hosts
  FOR SELECT
  TO anon
  USING (true);

-- Hard column-level guard so contact_email never leaks to anon even if a policy
-- changes later. Postgres requires the role to have BOTH the column privilege
-- AND a passing RLS policy in order to read.
REVOKE SELECT ON public.hosts FROM anon;
GRANT SELECT (id, name, slug, bio, logo_url, created_at, updated_at, created_by)
  ON public.hosts TO anon;

-- 2) feedback: restrict reads to owner, event host members, or attending users.
DROP POLICY IF EXISTS "feedback_select_past" ON public.feedback;

CREATE POLICY "feedback_select_own"
  ON public.feedback
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "feedback_select_event_hosts"
  ON public.feedback
  FOR SELECT
  TO authenticated
  USING (public.is_event_host_member(event_id, auth.uid()));

CREATE POLICY "feedback_select_event_attendees"
  ON public.feedback
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.rsvps r
      JOIN public.events e ON e.id = r.event_id
      WHERE r.event_id = feedback.event_id
        AND r.user_id = auth.uid()
        AND r.status = 'going'
        AND e.ends_at < now()
    )
  );

-- 3) gallery_photos: approved photos must belong to a public, published event.
DROP POLICY IF EXISTS "gallery_select_approved" ON public.gallery_photos;

CREATE POLICY "gallery_select_approved_public_events"
  ON public.gallery_photos
  FOR SELECT
  USING (
    status = 'approved'::gallery_status
    AND EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = gallery_photos.event_id
        AND e.status = 'published'
        AND e.visibility = 'public'
        AND e.is_hidden = false
    )
  );
