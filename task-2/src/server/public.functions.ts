import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Public host fetch by slug — bypasses RLS to safely surface public data.
export const getPublicHost = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { data: host, error } = await supabaseAdmin
      .from("hosts")
      .select("id, name, slug, bio, logo_url, contact_email, created_at")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!host) return { host: null, upcoming: [], past: [] } as const;

    const nowIso = new Date().toISOString();
    const baseSelect =
      "id, slug, title, description, cover_url, starts_at, ends_at, timezone, venue_address, online_url, capacity";

    const [{ data: upcoming }, { data: past }] = await Promise.all([
      supabaseAdmin
        .from("events")
        .select(baseSelect)
        .eq("host_id", host.id)
        .eq("status", "published")
        .eq("visibility", "public")
        .eq("is_hidden", false)
        .gte("ends_at", nowIso)
        .order("starts_at", { ascending: true })
        .limit(48),
      supabaseAdmin
        .from("events")
        .select(baseSelect)
        .eq("host_id", host.id)
        .eq("status", "published")
        .eq("visibility", "public")
        .eq("is_hidden", false)
        .lt("ends_at", nowIso)
        .order("starts_at", { ascending: false })
        .limit(24),
    ]);
    return { host, upcoming: upcoming ?? [], past: past ?? [] } as const;
  });

// Public event fetch by slug — supports unlisted via direct link.
// Hidden events return null to non-members. Host members access via dashboard.
export const getPublicEvent = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { data: event, error } = await supabaseAdmin
      .from("events")
      .select(
        "id, slug, title, description, cover_url, starts_at, ends_at, timezone, venue_address, online_url, capacity, status, visibility, is_paid, host_id, is_hidden"
      )
      .eq("slug", data.slug)
      .eq("status", "published")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!event || event.is_hidden) return { event: null, host: null } as const;
    const { data: host } = await supabaseAdmin
      .from("hosts")
      .select("id, name, slug, logo_url")
      .eq("id", event.host_id)
      .maybeSingle();
    return { event, host } as const;
  });

export const searchEvents = createServerFn({ method: "GET" })
  .inputValidator((d) =>
    z
      .object({
        q: z.string().optional().default(""),
        from: z.string().optional(),
        to: z.string().optional(),
        location: z.string().optional().default(""),
        includePast: z.boolean().optional().default(false),
      })
      .parse(d)
  )
  .handler(async ({ data }) => {
    let q = supabaseAdmin
      .from("events")
      .select(
        "id, slug, title, description, starts_at, ends_at, timezone, cover_url, venue_address, online_url, capacity"
      )
      .eq("status", "published")
      .eq("visibility", "public")
      .eq("is_hidden", false)
      .order("starts_at", { ascending: true })
      .limit(60);

    const nowIso = new Date().toISOString();
    if (data.includePast) {
      // Past-only when toggle is on
      q = q.lt("ends_at", nowIso).order("starts_at", { ascending: false });
    } else {
      q = q.gte("ends_at", nowIso);
    }
    if (data.from) q = q.gte("starts_at", data.from);
    if (data.to) q = q.lte("starts_at", data.to);
    if (data.q.trim().length > 0) {
      // websearch_to_tsquery via textSearch
      q = q.textSearch("search", data.q.trim(), { type: "websearch", config: "simple" });
    }
    if (data.location.trim().length > 0) {
      const loc = data.location.trim().toLowerCase();
      if (loc === "online") {
        q = q.not("online_url", "is", null);
      } else {
        q = q.ilike("venue_address", `%${data.location.trim()}%`);
      }
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

