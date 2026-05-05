BEGIN;
SET LOCAL session_replication_role = 'replica';

-- ---------- 1. FK-safe deletion of NON-seed data ----------
WITH keep_hosts AS (
  SELECT id FROM public.hosts WHERE slug IN ('bay-area-devs','brooklyn-book-club')
),
keep_events AS (
  SELECT id FROM public.events
  WHERE slug IN ('intro-to-rust-workshop','react-typescript-meetup','private-reading-tomorrow')
),
del_reports AS (
  DELETE FROM public.reports r
  WHERE (r.target_type = 'event' AND r.target_id NOT IN (SELECT id FROM keep_events))
     OR (r.target_type = 'photo' AND r.target_id IN (
          SELECT id FROM public.gallery_photos WHERE event_id NOT IN (SELECT id FROM keep_events)))
  RETURNING 1
),
del_feedback AS (
  DELETE FROM public.feedback WHERE event_id NOT IN (SELECT id FROM keep_events) RETURNING 1
),
del_gallery AS (
  DELETE FROM public.gallery_photos WHERE event_id NOT IN (SELECT id FROM keep_events) RETURNING 1
),
del_rsvps AS (
  DELETE FROM public.rsvps WHERE event_id NOT IN (SELECT id FROM keep_events) RETURNING 1
),
del_invites AS (
  DELETE FROM public.host_invites WHERE host_id NOT IN (SELECT id FROM keep_hosts) RETURNING 1
),
del_events AS (
  DELETE FROM public.events WHERE id NOT IN (SELECT id FROM keep_events) RETURNING 1
),
del_members AS (
  DELETE FROM public.host_members WHERE host_id NOT IN (SELECT id FROM keep_hosts) RETURNING 1
),
del_hosts AS (
  DELETE FROM public.hosts WHERE id NOT IN (SELECT id FROM keep_hosts) RETURNING 1
)
SELECT 1;

-- ---------- 2. Seed auth users for past-event RSVPs ----------
INSERT INTO auth.users (id, instance_id, email, aud, role, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
VALUES
  ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-000000000000','e@test.local','authenticated','authenticated','', now(), now(), now(),'{"provider":"email"}','{}'),
  ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-000000000000','f@test.local','authenticated','authenticated','', now(), now(), now(),'{"provider":"email"}','{}'),
  ('77777777-7777-7777-7777-777777777777','00000000-0000-0000-0000-000000000000','g@test.local','authenticated','authenticated','', now(), now(), now(),'{"provider":"email"}','{}'),
  ('88888888-8888-8888-8888-888888888888','00000000-0000-0000-0000-000000000000','h@test.local','authenticated','authenticated','', now(), now(), now(),'{"provider":"email"}','{}')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (id, display_name) VALUES
  ('11111111-1111-1111-1111-111111111111','Host A Owner'),
  ('22222222-2222-2222-2222-222222222222','Host B Owner'),
  ('33333333-3333-3333-3333-333333333333','Attendee C'),
  ('44444444-4444-4444-4444-444444444444','Checker D'),
  ('55555555-5555-5555-5555-555555555555','Attendee E'),
  ('66666666-6666-6666-6666-666666666666','Attendee F'),
  ('77777777-7777-7777-7777-777777777777','Attendee G'),
  ('88888888-8888-8888-8888-888888888888','Attendee H')
ON CONFLICT (id) DO NOTHING;

-- ---------- 3. Hosts ----------
INSERT INTO public.hosts (id, slug, name, bio, logo_url, contact_email, created_by) VALUES
  ('20e70477-76ed-4a4c-8e65-b631befa4577','bay-area-devs','Bay Area Devs',
   'A community of Bay Area developers building together.',
   'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=256',
   'hello@bayareadevs.test','11111111-1111-1111-1111-111111111111'),
  ('87e8382b-ca71-4ea0-9acc-8c4915467f4a','brooklyn-book-club','Brooklyn Book Club',
   'Monthly literary gatherings in Brooklyn.',
   'https://images.unsplash.com/photo-1524995997946-a1c2e315a42f?w=256',
   NULL,'22222222-2222-2222-2222-222222222222')
ON CONFLICT (id) DO UPDATE SET slug=EXCLUDED.slug, name=EXCLUDED.name, bio=EXCLUDED.bio,
  logo_url=EXCLUDED.logo_url, contact_email=EXCLUDED.contact_email;

-- ---------- 4. Host members ----------
INSERT INTO public.host_members (host_id, user_id, role, invited_by) VALUES
  ('20e70477-76ed-4a4c-8e65-b631befa4577','11111111-1111-1111-1111-111111111111','host','11111111-1111-1111-1111-111111111111'),
  ('20e70477-76ed-4a4c-8e65-b631befa4577','44444444-4444-4444-4444-444444444444','checker','11111111-1111-1111-1111-111111111111'),
  ('87e8382b-ca71-4ea0-9acc-8c4915467f4a','22222222-2222-2222-2222-222222222222','host','22222222-2222-2222-2222-222222222222')
ON CONFLICT DO NOTHING;

-- ---------- 5. Events ----------
INSERT INTO public.events (id, host_id, slug, title, description, starts_at, ends_at, timezone, venue_address, capacity, visibility, status, created_by, is_hidden) VALUES
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','20e70477-76ed-4a4c-8e65-b631befa4577','intro-to-rust-workshop',
   'Intro to Rust Workshop','Hands-on workshop covering Rust fundamentals.',
   now() - interval '14 days', now() - interval '14 days' + interval '3 hours','America/Los_Angeles',
   'San Francisco, CA',30,'public','published','11111111-1111-1111-1111-111111111111', false),
  ('6cd299b6-7ad3-4e37-a13e-9d291e5764ee','20e70477-76ed-4a4c-8e65-b631befa4577','react-typescript-meetup',
   'React & TypeScript Meetup','Talks and demos on modern React + TS.',
   now() + interval '21 days', now() + interval '21 days' + interval '2 hours','America/Los_Angeles',
   'San Francisco, CA',50,'public','published','11111111-1111-1111-1111-111111111111', false),
  ('d684ceeb-0bc9-4648-b835-d0a6c854af3b','87e8382b-ca71-4ea0-9acc-8c4915467f4a','private-reading-tomorrow',
   'Private Reading: Tomorrow, and Tomorrow, and Tomorrow','Members-only reading night.',
   now() + interval '10 days', now() + interval '10 days' + interval '2 hours','America/New_York',
   'Brooklyn, NY',20,'unlisted','published','22222222-2222-2222-2222-222222222222', false)
ON CONFLICT (id) DO UPDATE SET host_id=EXCLUDED.host_id, slug=EXCLUDED.slug, title=EXCLUDED.title,
  description=EXCLUDED.description, starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at,
  timezone=EXCLUDED.timezone, venue_address=EXCLUDED.venue_address, capacity=EXCLUDED.capacity,
  visibility=EXCLUDED.visibility, status=EXCLUDED.status, is_hidden=false;

-- ---------- 6. Reset and seed past-event data ----------
DELETE FROM public.feedback        WHERE event_id = 'c80a66bc-fe2c-45de-9612-f67e3b44e380';
DELETE FROM public.gallery_photos  WHERE event_id = 'c80a66bc-fe2c-45de-9612-f67e3b44e380';
DELETE FROM public.rsvps           WHERE event_id = 'c80a66bc-fe2c-45de-9612-f67e3b44e380';

INSERT INTO public.rsvps (event_id, user_id, status, qr_code, checked_in_at) VALUES
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','11111111-1111-1111-1111-111111111111','going', public.gen_qr_code(), now() - interval '14 days'),
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','22222222-2222-2222-2222-222222222222','going', public.gen_qr_code(), now() - interval '14 days'),
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','33333333-3333-3333-3333-333333333333','going', public.gen_qr_code(), now() - interval '14 days'),
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','44444444-4444-4444-4444-444444444444','going', public.gen_qr_code(), now() - interval '14 days'),
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','55555555-5555-5555-5555-555555555555','going', public.gen_qr_code(), now() - interval '14 days'),
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','66666666-6666-6666-6666-666666666666','going', public.gen_qr_code(), now() - interval '14 days'),
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','77777777-7777-7777-7777-777777777777','going', public.gen_qr_code(), NULL),
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','88888888-8888-8888-8888-888888888888','going', public.gen_qr_code(), NULL);

INSERT INTO public.feedback (event_id, user_id, rating, comment) VALUES
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','11111111-1111-1111-1111-111111111111',5,'Loved it!'),
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','22222222-2222-2222-2222-222222222222',4,'Great content.'),
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','33333333-3333-3333-3333-333333333333',3,'Good but long.'),
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','44444444-4444-4444-4444-444444444444',2,'Hard to follow.');

INSERT INTO public.gallery_photos (event_id, user_id, storage_path, status) VALUES
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','11111111-1111-1111-1111-111111111111',
   'c80a66bc-fe2c-45de-9612-f67e3b44e380/seed/photo-1.jpg','approved'),
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','22222222-2222-2222-2222-222222222222',
   'c80a66bc-fe2c-45de-9612-f67e3b44e380/seed/photo-2.jpg','approved'),
  ('c80a66bc-fe2c-45de-9612-f67e3b44e380','33333333-3333-3333-3333-333333333333',
   'c80a66bc-fe2c-45de-9612-f67e3b44e380/seed/photo-3.jpg','approved');

-- ---------- 7. Storage cleanup ----------
DELETE FROM storage.objects o
WHERE o.bucket_id IN ('event-covers','host-logos','gallery-photos')
  AND NOT EXISTS (SELECT 1 FROM public.hosts h WHERE h.logo_url LIKE '%' || o.name)
  AND NOT EXISTS (SELECT 1 FROM public.events e WHERE e.cover_url LIKE '%' || o.name)
  AND NOT EXISTS (SELECT 1 FROM public.gallery_photos gp WHERE gp.storage_path = o.name);

COMMIT;