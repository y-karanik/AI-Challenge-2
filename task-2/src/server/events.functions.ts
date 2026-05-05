import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SLUG_RE } from "@/lib/slug";

const EVENT_COLS = "id, host_id, title, slug, description, starts_at, ends_at, timezone, venue_address, online_url, capacity, cover_url, visibility, status, is_paid, created_by, created_at, updated_at";

export const checkEventSlug = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z.object({ hostId: z.string().uuid(), slug: z.string(), excludeId: z.string().uuid().optional() }).parse(d)
  )
  .handler(async ({ data }) => {
    if (!SLUG_RE.test(data.slug)) return { available: false, reason: "invalid" as const };
    let q = supabaseAdmin.from("events").select("id").eq("host_id", data.hostId).eq("slug", data.slug);
    if (data.excludeId) q = q.neq("id", data.excludeId);
    const { data: row } = await q.maybeSingle();
    return { available: !row, reason: row ? ("taken" as const) : ("ok" as const) };
  });

const EventDraft = z.object({
  id: z.string().uuid().optional(),
  host_id: z.string().uuid(),
  slug: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  cover_url: z.string().url().nullable().optional(),
  starts_at: z.string().min(1),
  ends_at: z.string().min(1),
  timezone: z.string().min(1),
  visibility: z.enum(["public", "unlisted"]).default("public"),
  venue_address: z.string().nullable().optional(),
  online_url: z.string().url().nullable().optional().or(z.literal("").transform(() => null)),
  capacity: z.number().int().positive().nullable().optional(),
  is_paid: z.boolean().default(false),
});

export const upsertEventDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => EventDraft.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.id) {
      const { data: row, error } = await supabase
        .from("events")
        .update({
          slug: data.slug,
          title: data.title,
          description: data.description ?? null,
          cover_url: data.cover_url ?? null,
          starts_at: data.starts_at,
          ends_at: data.ends_at,
          timezone: data.timezone,
          visibility: data.visibility,
          venue_address: data.venue_address ?? null,
          online_url: data.online_url ?? null,
          capacity: data.capacity ?? null,
          is_paid: data.is_paid,
        })
        .eq("id", data.id)
        .select(EVENT_COLS)
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await supabase
      .from("events")
      .insert({
        host_id: data.host_id,
        created_by: userId,
        slug: data.slug,
        title: data.title,
        description: data.description ?? null,
        cover_url: data.cover_url ?? null,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        timezone: data.timezone,
        visibility: data.visibility,
        venue_address: data.venue_address ?? null,
        online_url: data.online_url ?? null,
        capacity: data.capacity ?? null,
        is_paid: data.is_paid,
        status: "draft",
      })
      .select(EVENT_COLS)
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("That slug is taken for this host.");
      throw new Error(error.message);
    }
    return row;
  });

export const setEventStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), status: z.enum(["draft", "published"]) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error, data: rows } = await supabase
      .from("events")
      .update({ status: data.status })
      .eq("id", data.id)
      .select("id");
    if (error) {
      if (error.code === "42501" || /row-level security/i.test(error.message)) {
        throw new Error("You need host access to publish this event.");
      }
      throw new Error(error.message);
    }
    if (!rows || rows.length === 0) {
      throw new Error("You need host access to publish this event.");
    }
    return { ok: true };
  });

export const duplicateEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: src, error: e1 } = await supabase.from("events").select(EVENT_COLS).eq("id", data.id).single();
    if (e1 || !src) throw new Error(e1?.message ?? "not found");
    const newSlug = `${src.slug}-copy-${Math.random().toString(36).slice(2, 6)}`;
    const { data: row, error } = await supabase
      .from("events")
      .insert({
        host_id: src.host_id,
        created_by: userId,
        slug: newSlug,
        title: `${src.title} (copy)`,
        description: src.description,
        cover_url: src.cover_url,
        starts_at: src.starts_at,
        ends_at: src.ends_at,
        timezone: src.timezone,
        visibility: src.visibility,
        venue_address: src.venue_address,
        online_url: src.online_url,
        capacity: src.capacity,
        is_paid: src.is_paid,
        status: "draft",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const getEditableEvent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.from("events").select(EVENT_COLS).eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const listHostEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ hostId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("events")
      .select("id, slug, title, status, visibility, starts_at, ends_at, timezone, cover_url")
      .eq("host_id", data.hostId)
      .order("starts_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getHostForEvent = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: e } = await supabaseAdmin.from("events").select("host_id").eq("id", data.id).maybeSingle();
    if (!e) return null;
    const { data: h } = await supabaseAdmin
      .from("hosts")
      .select("id, name, slug, logo_url")
      .eq("id", e.host_id)
      .maybeSingle();
    return h;
  });
