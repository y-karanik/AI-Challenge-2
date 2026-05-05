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

  SELECT * INTO _rsvp FROM public.rsvps r
    WHERE r.event_id = _event_id AND upper(r.qr_code) = upper(trim(_code))
    FOR UPDATE;

  IF _rsvp.id IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::text, NULL::timestamptz;
    RETURN;
  END IF;

  SELECT p.display_name INTO _name FROM public.profiles p WHERE p.id = _rsvp.user_id;

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