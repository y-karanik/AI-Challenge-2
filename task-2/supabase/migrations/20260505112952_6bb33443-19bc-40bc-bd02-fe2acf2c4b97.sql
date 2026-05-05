
SET session_replication_role = replica;

DO $seed$
DECLARE
  _user_a uuid := '11111111-1111-1111-1111-111111111111';
  _user_b uuid := '22222222-2222-2222-2222-222222222222';
  _user_c uuid := '33333333-3333-3333-3333-333333333333';
  _user_d uuid := '44444444-4444-4444-4444-444444444444';
  _host_a uuid;
  _host_b uuid;
  _ev_up uuid;
  _ev_past uuid;
  _ev_unlisted uuid;
BEGIN
  INSERT INTO public.hosts (name, slug, bio, logo_url, contact_email, created_by)
  VALUES ('Bay Area Devs', 'bay-area-devs',
          'A friendly community for software engineers and designers in the SF Bay Area.',
          'https://images.unsplash.com/photo-1551434678-e076c223a692?w=200&h=200&fit=crop',
          'hello@bayareadevs.example', _user_a)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO _host_a;

  INSERT INTO public.hosts (name, slug, bio, logo_url, contact_email, created_by)
  VALUES ('Brooklyn Book Club', 'brooklyn-book-club',
          'Monthly meetups for book lovers in Brooklyn. Coffee, conversation, community.',
          'https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=200&h=200&fit=crop',
          'hello@brooklynbookclub.example', _user_b)
  ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO _host_b;

  INSERT INTO public.host_members (host_id, user_id, role, invited_by)
  VALUES (_host_a, _user_a, 'host', _user_a),
         (_host_a, _user_c, 'checker', _user_a),
         (_host_b, _user_b, 'host', _user_b)
  ON CONFLICT DO NOTHING;

  SELECT id INTO _ev_up FROM public.events WHERE slug = 'react-typescript-meetup' LIMIT 1;
  IF _ev_up IS NULL THEN
    INSERT INTO public.events (host_id, title, slug, description, starts_at, ends_at, timezone,
      venue_address, capacity, cover_url, status, visibility, created_by)
    VALUES (_host_a, 'React & TypeScript Meetup', 'react-typescript-meetup',
      E'Join us for an evening of talks and networking with Bay Area React developers.\n\nAgenda:\n- 6:30pm — Doors open, snacks & drinks\n- 7:00pm — Talk: Server Components in Production\n- 7:30pm — Talk: Type-safe APIs with Zod\n- 8:00pm — Networking\n\nAll skill levels welcome.',
      now() + interval '21 days', now() + interval '21 days 2 hours', 'America/Los_Angeles',
      '500 Howard St, San Francisco, CA', 50,
      'https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200&h=630&fit=crop',
      'published', 'public', _user_a)
    RETURNING id INTO _ev_up;
  END IF;

  SELECT id INTO _ev_past FROM public.events WHERE slug = 'intro-to-rust-workshop' LIMIT 1;
  IF _ev_past IS NULL THEN
    INSERT INTO public.events (host_id, title, slug, description, starts_at, ends_at, timezone,
      venue_address, capacity, cover_url, status, visibility, created_by)
    VALUES (_host_a, 'Intro to Rust Workshop', 'intro-to-rust-workshop',
      'A hands-on introduction to the Rust programming language. Bring a laptop with Rust installed.',
      now() - interval '14 days', now() - interval '14 days' + interval '3 hours',
      'America/Los_Angeles', '500 Howard St, San Francisco, CA', 30,
      'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=1200&h=630&fit=crop',
      'published', 'public', _user_a)
    RETURNING id INTO _ev_past;
  END IF;

  SELECT id INTO _ev_unlisted FROM public.events WHERE slug = 'private-reading-tomorrow' LIMIT 1;
  IF _ev_unlisted IS NULL THEN
    INSERT INTO public.events (host_id, title, slug, description, starts_at, ends_at, timezone,
      venue_address, capacity, cover_url, status, visibility, created_by)
    VALUES (_host_b, 'Private Reading: Tomorrow, and Tomorrow, and Tomorrow',
      'private-reading-tomorrow',
      'Members-only reading discussion. Share the link with friends to invite them.',
      now() + interval '10 days', now() + interval '10 days' + interval '2 hours',
      'America/New_York', '123 Bedford Ave, Brooklyn, NY', 20,
      'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=1200&h=630&fit=crop',
      'published', 'unlisted', _user_b)
    RETURNING id INTO _ev_unlisted;
  END IF;

  IF (SELECT count(*) FROM public.rsvps WHERE event_id = _ev_past) = 0 THEN
    INSERT INTO public.rsvps (event_id, user_id, status, qr_code, checked_in_at, created_at) VALUES
      (_ev_past, _user_a, 'going', public.gen_qr_code(), now() - interval '14 days' + interval '30 minutes', now() - interval '20 days'),
      (_ev_past, _user_b, 'going', public.gen_qr_code(), now() - interval '14 days' + interval '35 minutes', now() - interval '20 days'),
      (_ev_past, _user_c, 'going', public.gen_qr_code(), now() - interval '14 days' + interval '40 minutes', now() - interval '20 days'),
      (_ev_past, _user_d, 'going', public.gen_qr_code(), now() - interval '14 days' + interval '45 minutes', now() - interval '19 days'),
      (_ev_past, gen_random_uuid(), 'going', public.gen_qr_code(), now() - interval '14 days' + interval '50 minutes', now() - interval '19 days'),
      (_ev_past, gen_random_uuid(), 'going', public.gen_qr_code(), now() - interval '14 days' + interval '55 minutes', now() - interval '18 days'),
      (_ev_past, gen_random_uuid(), 'going', public.gen_qr_code(), NULL, now() - interval '17 days'),
      (_ev_past, gen_random_uuid(), 'going', public.gen_qr_code(), NULL, now() - interval '16 days');
  END IF;

  INSERT INTO public.feedback (event_id, user_id, rating, comment) VALUES
    (_ev_past, _user_a, 5, 'Loved it! Great speakers and the workshop was very practical.'),
    (_ev_past, _user_b, 4, 'Solid intro. Would have liked more time for hands-on exercises.'),
    (_ev_past, _user_c, 5, 'Best meetup I have been to in months.'),
    (_ev_past, _user_d, 3, 'Good content but the venue was a bit cramped.')
  ON CONFLICT (event_id, user_id) DO NOTHING;

  IF (SELECT count(*) FROM public.gallery_photos WHERE event_id = _ev_past) = 0 THEN
    INSERT INTO public.gallery_photos (event_id, user_id, storage_path, status) VALUES
      (_ev_past, _user_a, 'seed/rust-workshop-1.jpg', 'approved'),
      (_ev_past, _user_b, 'seed/rust-workshop-2.jpg', 'approved'),
      (_ev_past, _user_c, 'seed/rust-workshop-3.jpg', 'approved');
  END IF;
END $seed$;

SET session_replication_role = origin;
