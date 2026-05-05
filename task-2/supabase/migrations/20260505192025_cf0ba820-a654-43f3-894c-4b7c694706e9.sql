DO $$
DECLARE
  ids uuid[] := ARRAY[
    '4eb863bb-11f5-428a-b53e-581b0f017802'::uuid,
    'e396b59c-ddd5-4eb3-bf9e-2a501a6a32e9'::uuid,
    '72b41140-9133-4606-9d7d-58fa5b40e3b8'::uuid
  ];
BEGIN
  DELETE FROM public.reports WHERE target_type = 'event' AND target_id = ANY(ids);
  DELETE FROM public.gallery_photos WHERE event_id = ANY(ids);
  DELETE FROM public.feedback WHERE event_id = ANY(ids);
  DELETE FROM public.rsvps WHERE event_id = ANY(ids);
  DELETE FROM public.events WHERE id = ANY(ids);
END $$;