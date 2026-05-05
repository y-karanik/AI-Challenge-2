
-- Check in by code: returns the affected rsvp row + outcome via OUT params
CREATE OR REPLACE FUNCTION public.check_in_by_code(_event_id uuid, _code text)
RETURNS TABLE(outcome text, rsvp_id uuid, user_id uuid, display_name text, checked_in_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rsvp public.rsvps;
  _name text;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_event_host_member(_event_id, _uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _rsvp FROM public.rsvps
    WHERE event_id = _event_id AND upper(qr_code) = upper(trim(_code))
    FOR UPDATE;

  IF _rsvp.id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT display_name INTO _name FROM public.profiles WHERE id = _rsvp.user_id;

  IF _rsvp.checked_in_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already'::text, _rsvp.id, _rsvp.user_id, _name, _rsvp.checked_in_at;
    RETURN;
  END IF;

  IF _rsvp.status = 'cancelled' THEN
    RETURN QUERY SELECT 'cancelled'::text, _rsvp.id, _rsvp.user_id, _name, NULL::timestamptz;
    RETURN;
  END IF;

  UPDATE public.rsvps SET checked_in_at = now() WHERE id = _rsvp.id
    RETURNING checked_in_at INTO _rsvp.checked_in_at;

  RETURN QUERY SELECT 'ok'::text, _rsvp.id, _rsvp.user_id, _name, _rsvp.checked_in_at;
END;
$$;

-- Undo a check-in: caller must be host member of the event
CREATE OR REPLACE FUNCTION public.undo_check_in(_rsvp_id uuid)
RETURNS public.rsvps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _rsvp public.rsvps;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _rsvp FROM public.rsvps WHERE id = _rsvp_id FOR UPDATE;
  IF _rsvp.id IS NULL THEN
    RAISE EXCEPTION 'rsvp not found';
  END IF;
  IF NOT public.is_event_host_member(_rsvp.event_id, _uid) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.rsvps SET checked_in_at = NULL WHERE id = _rsvp.id RETURNING * INTO _rsvp;
  RETURN _rsvp;
END;
$$;
