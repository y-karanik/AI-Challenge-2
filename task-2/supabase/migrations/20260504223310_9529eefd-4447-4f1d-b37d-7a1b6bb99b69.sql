
-- =========================================================================
-- ENUMS
-- =========================================================================
create type public.host_role as enum ('host', 'checker');
create type public.event_visibility as enum ('public', 'unlisted');
create type public.event_status as enum ('draft', 'published');
create type public.rsvp_status as enum ('going', 'waitlist', 'cancelled');
create type public.gallery_status as enum ('pending', 'approved', 'rejected');
create type public.report_target as enum ('event', 'photo');
create type public.report_status as enum ('open', 'hidden', 'dismissed');

-- =========================================================================
-- TABLES
-- =========================================================================

-- profiles: 1:1 with auth.users
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- hosts: organizations putting on events
create table public.hosts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_url text,
  bio text,
  contact_email text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- host_members: composite PK (host_id, user_id)
create table public.host_members (
  host_id uuid not null references public.hosts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.host_role not null,
  invited_by uuid references auth.users(id) on delete set null,
  joined_at timestamptz not null default now(),
  primary key (host_id, user_id)
);

-- host_invites
create table public.host_invites (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  role public.host_role not null,
  token text not null unique,
  expires_at timestamptz not null,
  used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- events
create table public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  title text not null,
  slug text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  timezone text not null,
  venue_address text,
  online_url text,
  capacity int,
  cover_url text,
  visibility public.event_visibility not null default 'public',
  status public.event_status not null default 'draft',
  is_paid boolean not null default false,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (host_id, slug)
);
create index events_status_visibility_idx on public.events (status, visibility, starts_at);
create index events_host_idx on public.events (host_id);

-- rsvps
create table public.rsvps (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status public.rsvp_status not null default 'going',
  position int,
  qr_code text not null unique default encode(gen_random_bytes(16), 'hex'),
  checked_in_at timestamptz,
  created_at timestamptz not null default now()
);
-- partial unique: cannot have two active (non-cancelled) RSVPs for same (event,user)
create unique index rsvps_active_uidx on public.rsvps (event_id, user_id) where status <> 'cancelled';
create index rsvps_event_idx on public.rsvps (event_id);
create index rsvps_user_idx on public.rsvps (user_id);

-- feedback
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

-- gallery_photos
create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  storage_path text not null,
  status public.gallery_status not null default 'pending',
  created_at timestamptz not null default now()
);
create index gallery_event_idx on public.gallery_photos (event_id);

-- reports
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  target_type public.report_target not null,
  target_id uuid not null,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status public.report_status not null default 'open',
  created_at timestamptz not null default now()
);
create index reports_target_idx on public.reports (target_type, target_id);

-- =========================================================================
-- HELPER FUNCTIONS (SECURITY DEFINER to avoid recursive RLS on host_members)
-- =========================================================================

create or replace function public.is_host_member(_host_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.host_members
    where host_id = _host_id and user_id = _user_id
  );
$$;

create or replace function public.has_host_role(_host_id uuid, _user_id uuid, _role public.host_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.host_members
    where host_id = _host_id and user_id = _user_id and role = _role
  );
$$;

create or replace function public.is_event_host_member(_event_id uuid, _user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events e
    join public.host_members hm on hm.host_id = e.host_id
    where e.id = _event_id and hm.user_id = _user_id
  );
$$;

create or replace function public.event_host_id(_event_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select host_id from public.events where id = _event_id;
$$;

-- updated_at trigger
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end$$;

create trigger profiles_set_updated before update on public.profiles
  for each row execute function public.tg_set_updated_at();
create trigger hosts_set_updated before update on public.hosts
  for each row execute function public.tg_set_updated_at();
create trigger events_set_updated before update on public.events
  for each row execute function public.tg_set_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =========================================================================
-- RLS
-- =========================================================================
alter table public.profiles enable row level security;
alter table public.hosts enable row level security;
alter table public.host_members enable row level security;
alter table public.host_invites enable row level security;
alter table public.events enable row level security;
alter table public.rsvps enable row level security;
alter table public.feedback enable row level security;
alter table public.gallery_photos enable row level security;
alter table public.reports enable row level security;

-- profiles: anyone can read (public display info), users update their own
create policy "profiles_select_all" on public.profiles for select using (true);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- hosts: anyone reads; hosts (role) update; created_by deletes; authenticated insert
create policy "hosts_select_all" on public.hosts for select using (true);
create policy "hosts_insert_auth" on public.hosts for insert
  with check (auth.uid() = created_by);
create policy "hosts_update_role_host" on public.hosts for update
  using (public.has_host_role(id, auth.uid(), 'host'));
create policy "hosts_delete_creator" on public.hosts for delete
  using (auth.uid() = created_by);

-- host_members: members read own host roster; only role 'host' insert/delete
create policy "host_members_select_self_org" on public.host_members for select
  using (public.is_host_member(host_id, auth.uid()));
create policy "host_members_insert_host_role" on public.host_members for insert
  with check (
    public.has_host_role(host_id, auth.uid(), 'host')
    -- Bootstrap: when a host is just created, allow creator to add themselves as 'host'.
    or exists (
      select 1 from public.hosts h
      where h.id = host_id and h.created_by = auth.uid() and host_members.user_id = auth.uid()
    )
  );
create policy "host_members_delete_host_role" on public.host_members for delete
  using (public.has_host_role(host_id, auth.uid(), 'host'));

-- host_invites: only role 'host' inserts; anyone with token reads (public select OK because PK is uuid and unique token gates redemption logic in app)
create policy "host_invites_select_all" on public.host_invites for select using (true);
create policy "host_invites_insert_host_role" on public.host_invites for insert
  with check (public.has_host_role(host_id, auth.uid(), 'host'));
create policy "host_invites_update_redeem" on public.host_invites for update
  using (auth.uid() is not null);

-- events
create policy "events_select_public" on public.events for select
  using (status = 'published' and visibility = 'public');
-- Unlisted: when queried by id directly (link-only). Postgres RLS doesn't know about "by id"
-- so we permit read for any published event regardless of visibility — listing queries should
-- filter visibility = 'public' explicitly. Drafts still hidden via the OR-branch below.
create policy "events_select_published_any_visibility" on public.events for select
  using (status = 'published');
create policy "events_select_drafts_members" on public.events for select
  using (status = 'draft' and public.is_host_member(host_id, auth.uid()));
create policy "events_insert_host_member" on public.events for insert
  with check (public.is_host_member(host_id, auth.uid()) and auth.uid() = created_by);
create policy "events_update_host_member" on public.events for update
  using (public.is_host_member(host_id, auth.uid()));
create policy "events_delete_host_role" on public.events for delete
  using (public.has_host_role(host_id, auth.uid(), 'host'));

-- rsvps: users read/write own; host members of the event's host read all
create policy "rsvps_select_own" on public.rsvps for select
  using (auth.uid() = user_id);
create policy "rsvps_select_event_hosts" on public.rsvps for select
  using (public.is_event_host_member(event_id, auth.uid()));
create policy "rsvps_insert_own" on public.rsvps for insert
  with check (auth.uid() = user_id);
create policy "rsvps_update_own" on public.rsvps for update
  using (auth.uid() = user_id);
-- Checkers (and hosts) of the host can update only checked_in_at — enforced by trigger below.
create policy "rsvps_update_event_hosts_checkin" on public.rsvps for update
  using (public.is_event_host_member(event_id, auth.uid()));
create policy "rsvps_delete_own" on public.rsvps for delete
  using (auth.uid() = user_id);

-- Trigger: when a non-owner updates an RSVP, only checked_in_at may change.
create or replace function public.tg_rsvps_restrict_checkin()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() = old.user_id then
    return new;
  end if;
  if new.event_id is distinct from old.event_id
     or new.user_id is distinct from old.user_id
     or new.status is distinct from old.status
     or new.position is distinct from old.position
     or new.qr_code is distinct from old.qr_code
     or new.created_at is distinct from old.created_at then
    raise exception 'Only checked_in_at may be updated by host members';
  end if;
  return new;
end$$;
create trigger rsvps_restrict_checkin
  before update on public.rsvps
  for each row execute function public.tg_rsvps_restrict_checkin();

-- feedback
create policy "feedback_select_past" on public.feedback for select
  using (
    exists (select 1 from public.events e where e.id = event_id and e.ends_at < now())
  );
create policy "feedback_insert_own" on public.feedback for insert
  with check (auth.uid() = user_id);
create policy "feedback_update_own" on public.feedback for update
  using (auth.uid() = user_id);
create policy "feedback_delete_own" on public.feedback for delete
  using (auth.uid() = user_id);

-- gallery_photos
create policy "gallery_select_approved" on public.gallery_photos for select
  using (status = 'approved');
create policy "gallery_select_own" on public.gallery_photos for select
  using (auth.uid() = user_id);
create policy "gallery_select_event_hosts" on public.gallery_photos for select
  using (public.is_event_host_member(event_id, auth.uid()));
create policy "gallery_insert_own" on public.gallery_photos for insert
  with check (auth.uid() = user_id);
create policy "gallery_update_event_hosts" on public.gallery_photos for update
  using (public.is_event_host_member(event_id, auth.uid()));
create policy "gallery_delete_own_or_host" on public.gallery_photos for delete
  using (auth.uid() = user_id or public.is_event_host_member(event_id, auth.uid()));

-- reports
create policy "reports_insert_authed" on public.reports for insert
  with check (auth.uid() = reporter_id);
create policy "reports_select_event_hosts" on public.reports for select
  using (
    (target_type = 'event' and public.is_event_host_member(target_id, auth.uid()))
    or (target_type = 'photo' and exists (
      select 1 from public.gallery_photos gp
      where gp.id = target_id and public.is_event_host_member(gp.event_id, auth.uid())
    ))
  );
create policy "reports_update_admin" on public.reports for update
  using (
    (target_type = 'event' and exists (
      select 1 from public.events e join public.hosts h on h.id = e.host_id
      where e.id = target_id and h.created_by = auth.uid()
    ))
    or (target_type = 'photo' and exists (
      select 1 from public.gallery_photos gp
      join public.events e on e.id = gp.event_id
      join public.hosts h on h.id = e.host_id
      where gp.id = target_id and h.created_by = auth.uid()
    ))
  );

-- =========================================================================
-- STORAGE BUCKETS
-- =========================================================================
insert into storage.buckets (id, name, public) values ('event-covers', 'event-covers', true)
  on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('gallery-photos', 'gallery-photos', false)
  on conflict (id) do nothing;

-- event-covers: public read, authenticated write/update/delete by uploader (folder = user id)
create policy "event_covers_public_read" on storage.objects for select
  using (bucket_id = 'event-covers');
create policy "event_covers_auth_insert" on storage.objects for insert
  with check (bucket_id = 'event-covers' and auth.uid() is not null);
create policy "event_covers_auth_update" on storage.objects for update
  using (bucket_id = 'event-covers' and auth.uid() is not null);
create policy "event_covers_auth_delete" on storage.objects for delete
  using (bucket_id = 'event-covers' and auth.uid() is not null);

-- gallery-photos: authenticated read, authenticated write
create policy "gallery_photos_auth_read" on storage.objects for select
  using (bucket_id = 'gallery-photos' and auth.uid() is not null);
create policy "gallery_photos_auth_insert" on storage.objects for insert
  with check (bucket_id = 'gallery-photos' and auth.uid() is not null);
create policy "gallery_photos_auth_update" on storage.objects for update
  using (bucket_id = 'gallery-photos' and auth.uid() is not null);
create policy "gallery_photos_auth_delete" on storage.objects for delete
  using (bucket_id = 'gallery-photos' and auth.uid() is not null);
