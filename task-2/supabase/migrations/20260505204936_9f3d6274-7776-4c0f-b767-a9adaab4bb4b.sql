-- Allow direct read of published unlisted events (link-only access).
-- Listing pages must continue to filter by visibility='public' in their queries.
DROP POLICY IF EXISTS events_select_unlisted_published ON public.events;
CREATE POLICY events_select_unlisted_published
ON public.events
FOR SELECT
USING (
  status = 'published'::event_status
  AND visibility = 'unlisted'::event_visibility
  AND is_hidden = false
);