
-- QR code generator: 12-char unambiguous alphabet (no 0/O/1/I/L)
CREATE OR REPLACE FUNCTION public.gen_qr_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; -- 31 chars
  result text := '';
  i int;
  bytes bytea;
BEGIN
  bytes := extensions.gen_random_bytes(12);
  FOR i IN 0..11 LOOP
    result := result || substr(alphabet, (get_byte(bytes, i) % length(alphabet)) + 1, 1);
  END LOOP;
  RETURN result;
END;
$$;

-- Drop default UUID-style qr_code; we'll generate inside create_rsvp
ALTER TABLE public.rsvps ALTER COLUMN qr_code DROP DEFAULT;
ALTER TABLE public.rsvps ALTER COLUMN qr_code SET DEFAULT public.gen_qr_code();

-- Block past-event RSVPs at DB level
CREATE OR REPLACE FUNCTION public.tg_block_past_rsvp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _ends timestamptz;
  _status text;
BEGIN
  SELECT ends_at, status::text INTO _ends, _status FROM public.events WHERE id = NEW.event_id;
  IF _ends IS NULL THEN
    RAISE EXCEPTION 'event not found';
  END IF;
  IF _ends < now() AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'event already ended';
  END IF;
  IF _status <> 'published' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'event not published';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_past_rsvp ON public.rsvps;
CREATE TRIGGER block_past_rsvp
BEFORE INSERT OR UPDATE ON public.rsvps
FOR EACH ROW EXECUTE FUNCTION public.tg_block_past_rsvp();

-- Atomic RSVP create with capacity check
CREATE OR REPLACE FUNCTION public.create_rsvp(_event_id uuid)
RETURNS public.rsvps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _event public.events;
  _count int;
  _next_pos int;
  _status public.rsvp_status;
  _qr text;
  _row public.rsvps;
  _attempts int := 0;
  _existing public.rsvps;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Lock event row to serialize capacity decisions for this event
  SELECT * INTO _event FROM public.events WHERE id = _event_id FOR UPDATE;
  IF _event.id IS NULL THEN
    RAISE EXCEPTION 'event not found';
  END IF;
  IF _event.status <> 'published' THEN
    RAISE EXCEPTION 'event not published';
  END IF;
  IF _event.ends_at < now() THEN
    RAISE EXCEPTION 'event already ended';
  END IF;

  -- If user already has an active RSVP, return it (idempotent)
  SELECT * INTO _existing FROM public.rsvps
    WHERE event_id = _event_id AND user_id = _uid AND status <> 'cancelled'
    LIMIT 1;
  IF _existing.id IS NOT NULL THEN
    RETURN _existing;
  END IF;

  IF _event.capacity IS NULL THEN
    _status := 'going';
    _next_pos := NULL;
  ELSE
    SELECT count(*) INTO _count FROM public.rsvps
      WHERE event_id = _event_id AND status = 'going';
    IF _count < _event.capacity THEN
      _status := 'going';
      _next_pos := NULL;
    ELSE
      _status := 'waitlist';
      SELECT coalesce(max(position), 0) + 1 INTO _next_pos
        FROM public.rsvps WHERE event_id = _event_id AND status = 'waitlist';
    END IF;
  END IF;

  LOOP
    _attempts := _attempts + 1;
    _qr := public.gen_qr_code();
    BEGIN
      INSERT INTO public.rsvps (event_id, user_id, status, position, qr_code)
      VALUES (_event_id, _uid, _status, _next_pos, _qr)
      RETURNING * INTO _row;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF _attempts >= 6 THEN RAISE; END IF;
    END;
  END LOOP;

  RETURN _row;
END;
$$;

-- Cancel own RSVP
CREATE OR REPLACE FUNCTION public.cancel_rsvp(_rsvp_id uuid)
RETURNS public.rsvps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.rsvps;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  UPDATE public.rsvps
     SET status = 'cancelled', position = NULL
   WHERE id = _rsvp_id AND user_id = _uid AND status <> 'cancelled'
   RETURNING * INTO _row;
  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'rsvp not found or already cancelled';
  END IF;
  RETURN _row;
END;
$$;

-- Atomic waitlist promotion
CREATE OR REPLACE FUNCTION public.tg_promote_waitlist()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _event public.events;
  _event_id uuid;
  _going_count int;
  _next public.rsvps;
BEGIN
  IF TG_TABLE_NAME = 'rsvps' THEN
    IF NOT (OLD.status = 'going' AND NEW.status = 'cancelled') THEN
      RETURN NEW;
    END IF;
    _event_id := NEW.event_id;
  ELSE
    -- events table: only run on capacity increase
    IF NEW.capacity IS NULL THEN
      -- went from limited to unlimited: promote everyone
      UPDATE public.rsvps SET status = 'going', position = NULL
        WHERE event_id = NEW.id AND status = 'waitlist';
      RETURN NEW;
    END IF;
    IF OLD.capacity IS NOT NULL AND NEW.capacity <= OLD.capacity THEN
      RETURN NEW;
    END IF;
    _event_id := NEW.id;
  END IF;

  -- Lock event for serialization
  SELECT * INTO _event FROM public.events WHERE id = _event_id FOR UPDATE;
  IF _event.id IS NULL THEN RETURN NEW; END IF;
  IF _event.capacity IS NULL THEN
    UPDATE public.rsvps SET status = 'going', position = NULL
      WHERE event_id = _event_id AND status = 'waitlist';
    RETURN NEW;
  END IF;

  LOOP
    SELECT count(*) INTO _going_count FROM public.rsvps
      WHERE event_id = _event_id AND status = 'going';
    EXIT WHEN _going_count >= _event.capacity;

    SELECT * INTO _next FROM public.rsvps
      WHERE event_id = _event_id AND status = 'waitlist'
      ORDER BY position ASC NULLS LAST, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED;
    EXIT WHEN _next.id IS NULL;

    UPDATE public.rsvps SET status = 'going', position = NULL WHERE id = _next.id;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS promote_after_rsvp_cancel ON public.rsvps;
CREATE TRIGGER promote_after_rsvp_cancel
AFTER UPDATE ON public.rsvps
FOR EACH ROW
WHEN (OLD.status = 'going' AND NEW.status = 'cancelled')
EXECUTE FUNCTION public.tg_promote_waitlist();

DROP TRIGGER IF EXISTS promote_after_capacity_change ON public.events;
CREATE TRIGGER promote_after_capacity_change
AFTER UPDATE OF capacity ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.tg_promote_waitlist();

-- Full-text search column
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS search tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))
  ) STORED;
CREATE INDEX IF NOT EXISTS events_search_idx ON public.events USING gin(search);
CREATE INDEX IF NOT EXISTS events_starts_at_idx ON public.events (starts_at);
CREATE INDEX IF NOT EXISTS events_ends_at_idx ON public.events (ends_at);

-- Realtime on rsvps
ALTER TABLE public.rsvps REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.rsvps;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.create_rsvp(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_rsvp(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.gen_qr_code() TO authenticated, anon;
