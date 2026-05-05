
-- Hidden flag for events (moderation)
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;

-- Reports details column
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS details text;

-- Update public events RLS to exclude hidden events from anonymous view
DROP POLICY IF EXISTS events_select_public ON public.events;
CREATE POLICY events_select_public ON public.events
  FOR SELECT
  USING (status = 'published'::event_status AND visibility = 'public'::event_visibility AND is_hidden = false);

DROP POLICY IF EXISTS events_select_published_any_visibility ON public.events;
CREATE POLICY events_select_published_any_visibility ON public.events
  FOR SELECT
  USING (status = 'published'::event_status AND is_hidden = false);

-- Note: events_select_drafts_members covers drafts; add a hidden-aware policy for members
CREATE POLICY events_select_hidden_members ON public.events
  FOR SELECT
  USING (is_hidden = true AND is_host_member(host_id, auth.uid()));

-- Feedback upsert RPC
CREATE OR REPLACE FUNCTION public.upsert_feedback(_event_id uuid, _rating int, _comment text)
RETURNS public.feedback
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ev public.events;
  _rsvp public.rsvps;
  _row public.feedback;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _rating < 1 OR _rating > 5 THEN
    RAISE EXCEPTION 'rating must be 1-5';
  END IF;
  SELECT * INTO _ev FROM public.events WHERE id = _event_id;
  IF _ev.id IS NULL THEN RAISE EXCEPTION 'event not found'; END IF;
  IF _ev.ends_at >= now() THEN RAISE EXCEPTION 'event has not ended yet'; END IF;
  -- v1 rule: must have a non-cancelled RSVP (looser: doesn't require check-in)
  SELECT * INTO _rsvp FROM public.rsvps
    WHERE event_id = _event_id AND user_id = _uid AND status = 'going'
    LIMIT 1;
  IF _rsvp.id IS NULL THEN
    RAISE EXCEPTION 'only attendees can leave feedback';
  END IF;

  INSERT INTO public.feedback (event_id, user_id, rating, comment)
  VALUES (_event_id, _uid, _rating, NULLIF(trim(_comment), ''))
  ON CONFLICT (event_id, user_id)
  DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment
  RETURNING * INTO _row;
  RETURN _row;
END;
$$;

-- Hide event RPC (host role required)
CREATE OR REPLACE FUNCTION public.set_event_hidden(_event_id uuid, _hidden boolean, _report_id uuid DEFAULT NULL)
RETURNS public.events
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ev public.events;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _ev FROM public.events WHERE id = _event_id;
  IF _ev.id IS NULL THEN RAISE EXCEPTION 'event not found'; END IF;
  IF NOT public.has_host_role(_ev.host_id, _uid, 'host'::host_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.events SET is_hidden = _hidden WHERE id = _event_id RETURNING * INTO _ev;
  IF _report_id IS NOT NULL THEN
    UPDATE public.reports SET status = CASE WHEN _hidden THEN 'hidden'::report_status ELSE 'dismissed'::report_status END
      WHERE id = _report_id;
  END IF;
  RETURN _ev;
END;
$$;

-- Set photo status RPC (host member required)
CREATE OR REPLACE FUNCTION public.set_photo_status(_photo_id uuid, _status gallery_status, _report_id uuid DEFAULT NULL)
RETURNS public.gallery_photos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _ph public.gallery_photos;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _ph FROM public.gallery_photos WHERE id = _photo_id;
  IF _ph.id IS NULL THEN RAISE EXCEPTION 'photo not found'; END IF;
  IF NOT public.is_event_host_member(_ph.event_id, _uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.gallery_photos SET status = _status WHERE id = _photo_id RETURNING * INTO _ph;
  IF _report_id IS NOT NULL THEN
    UPDATE public.reports SET status = CASE WHEN _status = 'rejected' THEN 'hidden'::report_status ELSE 'dismissed'::report_status END
      WHERE id = _report_id;
  END IF;
  RETURN _ph;
END;
$$;

-- Dismiss report RPC
CREATE OR REPLACE FUNCTION public.dismiss_report(_report_id uuid)
RETURNS public.reports
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _r public.reports;
  _ok boolean := false;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO _r FROM public.reports WHERE id = _report_id;
  IF _r.id IS NULL THEN RAISE EXCEPTION 'report not found'; END IF;
  IF _r.target_type = 'event' THEN
    SELECT public.is_event_host_member(_r.target_id, _uid) INTO _ok;
  ELSE
    SELECT public.is_event_host_member(gp.event_id, _uid) INTO _ok
      FROM public.gallery_photos gp WHERE gp.id = _r.target_id;
  END IF;
  IF NOT coalesce(_ok, false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  UPDATE public.reports SET status = 'dismissed'::report_status WHERE id = _report_id RETURNING * INTO _r;
  RETURN _r;
END;
$$;

-- Index for filtering reports by status
CREATE INDEX IF NOT EXISTS reports_status_idx ON public.reports(status);
