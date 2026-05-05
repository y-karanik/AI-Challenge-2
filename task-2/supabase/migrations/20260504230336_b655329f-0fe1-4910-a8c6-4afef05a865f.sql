
-- Atomic host creation: creates host + makes creator a host_member with role 'host' in one transaction.
create or replace function public.create_host(
  _name text,
  _slug text,
  _bio text default null,
  _logo_url text default null,
  _contact_email text default null
) returns public.hosts
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _row public.hosts;
begin
  if _uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if _name is null or length(trim(_name)) = 0 then
    raise exception 'name required';
  end if;
  if _slug is null or _slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$' then
    raise exception 'invalid slug';
  end if;

  insert into public.hosts (name, slug, bio, logo_url, contact_email, created_by)
  values (trim(_name), _slug, _bio, _logo_url, _contact_email, _uid)
  returning * into _row;

  insert into public.host_members (host_id, user_id, role, invited_by)
  values (_row.id, _uid, 'host', _uid);

  return _row;
end$$;

grant execute on function public.create_host(text, text, text, text, text) to authenticated;

-- Redeem an invite token: marks used_by, adds host_member if role not already present.
create or replace function public.redeem_host_invite(_token text)
returns public.host_members
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid uuid := auth.uid();
  _inv public.host_invites;
  _member public.host_members;
begin
  if _uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into _inv from public.host_invites where token = _token for update;
  if _inv.id is null then
    raise exception 'invite not found' using errcode = 'P0002';
  end if;
  if _inv.used_by is not null then
    raise exception 'invite already used' using errcode = 'P0001';
  end if;
  if _inv.expires_at < now() then
    raise exception 'invite expired' using errcode = 'P0001';
  end if;

  update public.host_invites
    set used_by = _uid
    where id = _inv.id;

  insert into public.host_members (host_id, user_id, role, invited_by)
  values (_inv.host_id, _uid, _inv.role, _inv.used_by)
  on conflict do nothing;

  select * into _member from public.host_members
   where host_id = _inv.host_id and user_id = _uid and role = _inv.role;
  return _member;
end$$;

grant execute on function public.redeem_host_invite(text) to authenticated;

-- Public bucket for host logos
insert into storage.buckets (id, name, public)
values ('host-logos', 'host-logos', true)
on conflict (id) do nothing;

-- Storage policies
create policy "host-logos public read"
  on storage.objects for select
  using (bucket_id = 'host-logos');

create policy "host-logos auth upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'host-logos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "host-logos auth update own"
  on storage.objects for update
  using (bucket_id = 'host-logos' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "host-logos auth delete own"
  on storage.objects for delete
  using (bucket_id = 'host-logos' and auth.uid()::text = (storage.foldername(name))[1]);

-- Same for event-covers (allow uploads scoped to user folder)
create policy "event-covers auth upload own"
  on storage.objects for insert
  with check (
    bucket_id = 'event-covers'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "event-covers auth update own"
  on storage.objects for update
  using (bucket_id = 'event-covers' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "event-covers auth delete own"
  on storage.objects for delete
  using (bucket_id = 'event-covers' and auth.uid()::text = (storage.foldername(name))[1]);

-- updated_at trigger on events for autosave touch
drop trigger if exists tg_events_updated_at on public.events;
create trigger tg_events_updated_at
  before update on public.events
  for each row execute function public.tg_set_updated_at();

drop trigger if exists tg_hosts_updated_at on public.hosts;
create trigger tg_hosts_updated_at
  before update on public.hosts
  for each row execute function public.tg_set_updated_at();
