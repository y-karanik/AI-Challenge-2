DO $$
DECLARE _eid uuid := 'ad469f6d-afa0-4082-9db9-5b21c60b3b6a';
BEGIN
  DELETE FROM public.reports WHERE target_type = 'event' AND target_id = _eid;
  DELETE FROM public.reports WHERE target_type = 'photo' AND target_id IN (SELECT id FROM public.gallery_photos WHERE event_id = _eid);
  DELETE FROM public.gallery_photos WHERE event_id = _eid;
  DELETE FROM public.feedback WHERE event_id = _eid;
  DELETE FROM public.rsvps WHERE event_id = _eid;
  DELETE FROM public.events WHERE id = _eid;
END $$;