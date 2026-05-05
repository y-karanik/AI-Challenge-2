
CREATE OR REPLACE FUNCTION public.tg_rsvps_restrict_checkin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
begin
  -- Row owner can do anything to own row.
  if auth.uid() = old.user_id then
    return new;
  end if;
  -- Allow internal waitlist promotion (status: waitlist → going).
  if old.status = 'waitlist' and new.status = 'going' then
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
