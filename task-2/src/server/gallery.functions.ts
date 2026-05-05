import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { gallerySignUrl } from "./gallery.server";

export const recordGalleryUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ eventId: z.string().uuid(), storagePath: z.string().min(1) }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: rsvp } = await supabase
      .from("rsvps")
      .select("id")
      .eq("event_id", data.eventId)
      .eq("user_id", userId)
      .neq("status", "cancelled")
      .maybeSingle();
    if (!rsvp) throw new Error("Only attendees can upload photos.");
    const { data: row, error } = await supabase
      .from("gallery_photos")
      .insert({ event_id: data.eventId, user_id: userId, storage_path: data.storagePath })
      .select("id, status, storage_path, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listEventGallery = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: rows } = await supabaseAdmin
      .from("gallery_photos")
      .select("id, storage_path, status, created_at, user_id")
      .eq("event_id", data.eventId)
      .eq("status", "approved")
      .order("created_at", { ascending: false });
    const items = await Promise.all(
      (rows ?? []).map(async (r) => ({
        id: r.id,
        url: await gallerySignUrl(r.storage_path),
        created_at: r.created_at,
      }))
    );
    return items.filter((r) => r.url);
  });

export const listMyEventGallery = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("gallery_photos")
      .select("id, storage_path, status, created_at")
      .eq("event_id", data.eventId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    return Promise.all(
      (rows ?? []).map(async (r) => ({
        id: r.id,
        status: r.status as "pending" | "approved" | "rejected",
        url: await gallerySignUrl(r.storage_path),
        created_at: r.created_at,
      }))
    );
  });

export const listModerationQueue = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ hostSlug: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { data: host } = await supabaseAdmin
      .from("hosts").select("id, name, slug").eq("slug", data.hostSlug).maybeSingle();
    if (!host) throw new Error("Host not found");
    const { data: member } = await supabaseAdmin
      .from("host_members").select("role").eq("host_id", host.id).eq("user_id", userId).maybeSingle();
    if (!member) throw new Error("forbidden");

    const { data: events } = await supabaseAdmin
      .from("events").select("id, title, slug").eq("host_id", host.id);
    const ids = (events ?? []).map((e) => e.id);
    const eventById = new Map((events ?? []).map((e) => [e.id, e]));
    if (!ids.length) return { host, items: [] };
    const { data: photos } = await supabaseAdmin
      .from("gallery_photos")
      .select("id, event_id, user_id, storage_path, status, created_at")
      .in("event_id", ids)
      .order("created_at", { ascending: false });
    const userIds = Array.from(new Set((photos ?? []).map((p) => p.user_id)));
    const { data: profiles } = userIds.length
      ? await supabaseAdmin.from("profiles").select("id, display_name, avatar_url").in("id", userIds)
      : { data: [] as { id: string; display_name: string | null; avatar_url: string | null }[] };
    const byUser = new Map((profiles ?? []).map((p) => [p.id, p]));
    const items = await Promise.all(
      (photos ?? []).map(async (p) => ({
        id: p.id,
        status: p.status as "pending" | "approved" | "rejected",
        created_at: p.created_at,
        url: await gallerySignUrl(p.storage_path),
        event: eventById.get(p.event_id) ?? null,
        uploader: byUser.get(p.user_id) ?? { id: p.user_id, display_name: null, avatar_url: null },
      }))
    );
    return { host, items };
  });

export const setPhotoStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        photoId: z.string().uuid(),
        status: z.enum(["pending", "approved", "rejected"]),
        reportId: z.string().uuid().optional(),
      })
      .parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("set_photo_status", {
      _photo_id: data.photoId,
      _status: data.status,
      _report_id: data.reportId ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
