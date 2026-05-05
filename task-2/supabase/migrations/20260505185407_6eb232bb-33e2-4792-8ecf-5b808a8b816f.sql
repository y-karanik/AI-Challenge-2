DROP POLICY IF EXISTS "events_update_host_role" ON public.events;
CREATE POLICY "events_update_host_role" ON public.events
  FOR UPDATE
  USING (public.has_host_role(host_id, auth.uid(), 'host'::host_role))
  WITH CHECK (public.has_host_role(host_id, auth.uid(), 'host'::host_role));