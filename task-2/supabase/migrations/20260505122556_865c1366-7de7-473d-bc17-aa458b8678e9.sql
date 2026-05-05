
BEGIN;

CREATE TEMP TABLE _seed_users (id uuid PRIMARY KEY, email text);
INSERT INTO _seed_users(id, email) VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'a@test.local'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'b@test.local'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'c@test.local'),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'd@test.local');

DELETE FROM public.reports;

DELETE FROM public.gallery_photos
WHERE event_id NOT IN (
  SELECT id FROM public.events
  WHERE slug IN ('react-typescript-meetup','intro-to-rust-workshop','private-reading-tomorrow')
);

DELETE FROM public.feedback
WHERE event_id NOT IN (
  SELECT id FROM public.events
  WHERE slug IN ('react-typescript-meetup','intro-to-rust-workshop','private-reading-tomorrow')
);

DELETE FROM public.rsvps
WHERE event_id NOT IN (
  SELECT id FROM public.events
  WHERE slug IN ('react-typescript-meetup','intro-to-rust-workshop','private-reading-tomorrow')
);

DELETE FROM public.host_invites;

DELETE FROM public.events
WHERE slug NOT IN ('react-typescript-meetup','intro-to-rust-workshop','private-reading-tomorrow');

DELETE FROM public.host_members
WHERE host_id NOT IN (
  SELECT id FROM public.hosts WHERE slug IN ('bay-area-devs','brooklyn-book-club')
);

DELETE FROM public.hosts
WHERE slug NOT IN ('bay-area-devs','brooklyn-book-club');

DELETE FROM public.profiles
WHERE id NOT IN (SELECT id FROM _seed_users);

DELETE FROM auth.users
WHERE id NOT IN (SELECT id FROM _seed_users);

SET LOCAL session_replication_role = replica;

INSERT INTO auth.users
  (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
   created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin,
   confirmation_token, recovery_token, email_change_token_new, email_change)
SELECT s.id, '00000000-0000-0000-0000-000000000000'::uuid, 'authenticated', 'authenticated',
       s.email, 'x', now(), now(), now(),
       '{"provider":"email"}'::jsonb, '{}'::jsonb, false, '', '', '', ''
FROM _seed_users s
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, display_name) VALUES
  ('11111111-1111-1111-1111-111111111111'::uuid, 'Alice (Host A)'),
  ('22222222-2222-2222-2222-222222222222'::uuid, 'Bob (Host B)'),
  ('33333333-3333-3333-3333-333333333333'::uuid, 'Carol'),
  ('44444444-4444-4444-4444-444444444444'::uuid, 'Dave (Checker)')
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO public.hosts (name, slug, bio, logo_url, contact_email, created_by)
VALUES ('Bay Area Devs', 'bay-area-devs',
        'A friendly community for software engineers and designers in the SF Bay Area.',
        'https://images.unsplash.com/photo-1551434678-e076c223a692?w=200&h=200&fit=crop',
        'hello@bayareadevs.example',
        '11111111-1111-1111-1111-111111111111'::uuid)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, bio = EXCLUDED.bio,
      logo_url = EXCLUDED.logo_url, contact_email = EXCLUDED.contact_email;

INSERT INTO public.hosts (name, slug, bio, logo_url, contact_email, created_by)
VALUES ('Brooklyn Book Club', 'brooklyn-book-club',
        'Monthly meetups for book lovers in Brooklyn. Coffee, conversation, community.',
        'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=200&h=200&fit=crop',
        'hello@brooklynbookclub.example',
        '22222222-2222-2222-2222-222222222222'::uuid)
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, bio = EXCLUDED.bio,
      logo_url = EXCLUDED.logo_url, contact_email = EXCLUDED.contact_email;

WITH ha AS (SELECT id FROM public.hosts WHERE slug = 'bay-area-devs'),
     hb AS (SELECT id FROM public.hosts WHERE slug = 'brooklyn-book-club')
INSERT INTO public.host_members (host_id, user_id, role, invited_by)
SELECT ha.id, '11111111-1111-1111-1111-111111111111'::uuid, 'host'::host_role,    '11111111-1111-1111-1111-111111111111'::uuid FROM ha
UNION ALL
SELECT ha.id, '44444444-4444-4444-4444-444444444444'::uuid, 'checker'::host_role, '11111111-1111-1111-1111-111111111111'::uuid FROM ha
UNION ALL
SELECT hb.id, '22222222-2222-2222-2222-222222222222'::uuid, 'host'::host_role,    '22222222-2222-2222-2222-222222222222'::uuid FROM hb
ON CONFLICT (host_id, user_id) DO NOTHING;

DELETE FROM public.host_members hm
WHERE NOT (
  (hm.host_id = (SELECT id FROM public.hosts WHERE slug='bay-area-devs')
     AND hm.user_id IN ('11111111-1111-1111-1111-111111111111'::uuid,'44444444-4444-4444-4444-444444444444'::uuid))
  OR
  (hm.host_id = (SELECT id FROM public.hosts WHERE slug='brooklyn-book-club')
     AND hm.user_id = '22222222-2222-2222-2222-222222222222'::uuid)
);

INSERT INTO public.events (host_id, title, slug, description, starts_at, ends_at, timezone,
  venue_address, capacity, cover_url, status, visibility, created_by)
SELECT (SELECT id FROM public.hosts WHERE slug='bay-area-devs'),
       'React & TypeScript Meetup', 'react-typescript-meetup',
       E'Join us for an evening of talks and networking with Bay Area React developers.\n\nAgenda:\n- 6:30pm — Doors open, snacks & drinks\n- 7:00pm — Talk: Server Components in Production\n- 7:30pm — Talk: Type-safe APIs with Zod\n- 8:00pm — Networking\n\nAll skill levels welcome.',
       now() + interval '21 days', now() + interval '21 days 2 hours',
       'America/Los_Angeles', '500 Howard St, San Francisco, CA', 50,
       'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&h=630&fit=crop',
       'published'::event_status, 'public'::event_visibility, '11111111-1111-1111-1111-111111111111'::uuid
ON CONFLICT (host_id, slug) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
  capacity = EXCLUDED.capacity, cover_url = EXCLUDED.cover_url,
  status = EXCLUDED.status, visibility = EXCLUDED.visibility;

INSERT INTO public.events (host_id, title, slug, description, starts_at, ends_at, timezone,
  venue_address, capacity, cover_url, status, visibility, created_by)
SELECT (SELECT id FROM public.hosts WHERE slug='bay-area-devs'),
       'Intro to Rust Workshop', 'intro-to-rust-workshop',
       'A hands-on introduction to the Rust programming language. Bring a laptop with Rust installed.',
       now() - interval '14 days', now() - interval '14 days' + interval '3 hours',
       'America/Los_Angeles', '500 Howard St, San Francisco, CA', 30,
       'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200&h=630&fit=crop',
       'published'::event_status, 'public'::event_visibility, '11111111-1111-1111-1111-111111111111'::uuid
ON CONFLICT (host_id, slug) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  capacity = EXCLUDED.capacity, cover_url = EXCLUDED.cover_url,
  status = EXCLUDED.status, visibility = EXCLUDED.visibility;

INSERT INTO public.events (host_id, title, slug, description, starts_at, ends_at, timezone,
  venue_address, capacity, cover_url, status, visibility, created_by)
SELECT (SELECT id FROM public.hosts WHERE slug='brooklyn-book-club'),
       'Private Reading: Tomorrow, and Tomorrow, and Tomorrow', 'private-reading-tomorrow',
       'Members-only reading discussion. Share the link with friends to invite them.',
       now() + interval '10 days', now() + interval '10 days' + interval '2 hours',
       'America/New_York', '123 Bedford Ave, Brooklyn, NY', 20,
       'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1200&h=630&fit=crop',
       'published'::event_status, 'unlisted'::event_visibility, '22222222-2222-2222-2222-222222222222'::uuid
ON CONFLICT (host_id, slug) DO UPDATE SET
  title = EXCLUDED.title, description = EXCLUDED.description,
  starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
  cover_url = EXCLUDED.cover_url,
  status = EXCLUDED.status, visibility = EXCLUDED.visibility;

DO $seed$
DECLARE
  _ev uuid := (SELECT id FROM public.events WHERE slug='intro-to-rust-workshop');
BEGIN
  DELETE FROM public.rsvps WHERE event_id = _ev;
  INSERT INTO public.rsvps (event_id, user_id, status, qr_code, checked_in_at, created_at) VALUES
    (_ev, '11111111-1111-1111-1111-111111111111'::uuid, 'going', public.gen_qr_code(), now() - interval '14 days' + interval '30 min', now() - interval '20 days'),
    (_ev, '22222222-2222-2222-2222-222222222222'::uuid, 'going', public.gen_qr_code(), now() - interval '14 days' + interval '35 min', now() - interval '20 days'),
    (_ev, '33333333-3333-3333-3333-333333333333'::uuid, 'going', public.gen_qr_code(), now() - interval '14 days' + interval '40 min', now() - interval '20 days'),
    (_ev, '44444444-4444-4444-4444-444444444444'::uuid, 'going', public.gen_qr_code(), now() - interval '14 days' + interval '45 min', now() - interval '19 days'),
    (_ev, gen_random_uuid(), 'going', public.gen_qr_code(), now() - interval '14 days' + interval '50 min', now() - interval '19 days'),
    (_ev, gen_random_uuid(), 'going', public.gen_qr_code(), now() - interval '14 days' + interval '55 min', now() - interval '18 days'),
    (_ev, gen_random_uuid(), 'going', public.gen_qr_code(), NULL, now() - interval '17 days'),
    (_ev, gen_random_uuid(), 'going', public.gen_qr_code(), NULL, now() - interval '16 days');

  DELETE FROM public.feedback WHERE event_id = _ev;
  INSERT INTO public.feedback (event_id, user_id, rating, comment) VALUES
    (_ev, '11111111-1111-1111-1111-111111111111'::uuid, 5, 'Loved it! Great speakers and very practical.'),
    (_ev, '22222222-2222-2222-2222-222222222222'::uuid, 4, 'Solid intro. Would have liked more hands-on time.'),
    (_ev, '33333333-3333-3333-3333-333333333333'::uuid, 5, 'Best meetup I have been to in months.'),
    (_ev, '44444444-4444-4444-4444-444444444444'::uuid, 3, 'Good content but the venue was a bit cramped.');

  DELETE FROM public.gallery_photos WHERE event_id = _ev;
  INSERT INTO public.gallery_photos (event_id, user_id, storage_path, status) VALUES
    (_ev, '11111111-1111-1111-1111-111111111111'::uuid, 'seed/rust-workshop-1.jpg', 'approved'),
    (_ev, '22222222-2222-2222-2222-222222222222'::uuid, 'seed/rust-workshop-2.jpg', 'approved'),
    (_ev, '33333333-3333-3333-3333-333333333333'::uuid, 'seed/rust-workshop-3.jpg', 'approved');
END $seed$;

DELETE FROM storage.objects
WHERE bucket_id = 'gallery-photos'
  AND name NOT IN ('seed/rust-workshop-1.jpg','seed/rust-workshop-2.jpg','seed/rust-workshop-3.jpg');
DELETE FROM storage.objects WHERE bucket_id = 'event-covers';
DELETE FROM storage.objects WHERE bucket_id = 'host-logos';

DO $checks$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.hosts;          IF n <> 2 THEN RAISE EXCEPTION 'hosts=% expected 2', n; END IF;
  SELECT count(*) INTO n FROM public.events;         IF n <> 3 THEN RAISE EXCEPTION 'events=% expected 3', n; END IF;
  SELECT count(*) INTO n FROM public.host_members;   IF n <> 3 THEN RAISE EXCEPTION 'host_members=% expected 3', n; END IF;
  SELECT count(*) INTO n FROM auth.users;            IF n <> 4 THEN RAISE EXCEPTION 'auth.users=% expected 4', n; END IF;
  SELECT count(*) INTO n FROM public.rsvps WHERE status='going'
    AND event_id=(SELECT id FROM public.events WHERE slug='intro-to-rust-workshop');
  IF n <> 8 THEN RAISE EXCEPTION 'going rsvps=% expected 8', n; END IF;
  SELECT count(*) INTO n FROM public.rsvps WHERE checked_in_at IS NOT NULL
    AND event_id=(SELECT id FROM public.events WHERE slug='intro-to-rust-workshop');
  IF n <> 6 THEN RAISE EXCEPTION 'checked-in=% expected 6', n; END IF;
  SELECT count(*) INTO n FROM public.feedback;       IF n <> 4 THEN RAISE EXCEPTION 'feedback=% expected 4', n; END IF;
  SELECT count(*) INTO n FROM public.gallery_photos WHERE status='approved';
  IF n <> 3 THEN RAISE EXCEPTION 'approved photos=% expected 3', n; END IF;
END $checks$;

COMMIT;
