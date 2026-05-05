
DROP POLICY IF EXISTS gallery_photos_auth_insert ON storage.objects;
DROP POLICY IF EXISTS gallery_photos_auth_update ON storage.objects;
DROP POLICY IF EXISTS gallery_photos_auth_delete ON storage.objects;
DROP POLICY IF EXISTS gallery_photos_auth_read ON storage.objects;

-- Path is <event_id>/<user_id>/<uuid>.<ext>; user_id is the 2nd segment.
CREATE POLICY gallery_photos_user_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'gallery-photos'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );
CREATE POLICY gallery_photos_user_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'gallery-photos'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );
CREATE POLICY gallery_photos_user_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'gallery-photos'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );
-- Read: only the uploader directly. Approved photos are surfaced via server-issued signed URLs from supabaseAdmin.
CREATE POLICY gallery_photos_owner_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'gallery-photos'
    AND auth.uid()::text = (storage.foldername(name))[2]
  );
