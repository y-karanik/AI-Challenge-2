import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const GALLERY_BUCKET = "gallery-photos";

export async function gallerySignUrl(path: string) {
  const { data } = await supabaseAdmin.storage.from(GALLERY_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}
