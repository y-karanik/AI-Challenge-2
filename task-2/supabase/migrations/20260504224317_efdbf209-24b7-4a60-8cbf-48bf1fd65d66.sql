
-- Clean prior runs
DELETE FROM public.rsvps WHERE event_id IN (SELECT id FROM public.events WHERE title LIKE 'TEST_%');
DELETE FROM public.events WHERE title LIKE 'TEST_%';
DELETE FROM public.host_members WHERE host_id IN (SELECT id FROM public.hosts WHERE slug LIKE 'test-%');
DELETE FROM public.hosts WHERE slug LIKE 'test-%';
DELETE FROM auth.users WHERE email LIKE '%@test.local';

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','a@test.local','x', now(), now(), now(),'{"provider":"email"}'::jsonb,'{}'::jsonb, false,'','','',''),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','b@test.local','x', now(), now(), now(),'{"provider":"email"}'::jsonb,'{}'::jsonb, false,'','','',''),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','c@test.local','x', now(), now(), now(),'{"provider":"email"}'::jsonb,'{}'::jsonb, false,'','','',''),
  ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','d@test.local','x', now(), now(), now(),'{"provider":"email"}'::jsonb,'{}'::jsonb, false,'','','','');

INSERT INTO public.hosts (id, name, slug, created_by) VALUES
  ('aaaa1111-0000-0000-0000-000000000001','Host A','test-host-a','11111111-1111-1111-1111-111111111111');
INSERT INTO public.host_members (host_id, user_id, role) VALUES
  ('aaaa1111-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','host'),
  ('aaaa1111-0000-0000-0000-000000000001','44444444-4444-4444-4444-444444444444','checker');

INSERT INTO public.events (id, host_id, title, slug, starts_at, ends_at, timezone, status, visibility, created_by) VALUES
  ('eeee1111-0000-0000-0000-000000000001','aaaa1111-0000-0000-0000-000000000001','TEST_DRAFT','d', now()+interval '1 day', now()+interval '1 day 2 hour','UTC','draft','public','11111111-1111-1111-1111-111111111111'),
  ('eeee1111-0000-0000-0000-000000000002','aaaa1111-0000-0000-0000-000000000001','TEST_PUB','p',  now()+interval '2 day', now()+interval '2 day 2 hour','UTC','published','public','11111111-1111-1111-1111-111111111111'),
  ('eeee1111-0000-0000-0000-000000000003','aaaa1111-0000-0000-0000-000000000001','TEST_UNL','u',  now()+interval '3 day', now()+interval '3 day 2 hour','UTC','published','unlisted','11111111-1111-1111-1111-111111111111');

INSERT INTO public.rsvps (event_id, user_id) VALUES
  ('eeee1111-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222'),
  ('eeee1111-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333');
