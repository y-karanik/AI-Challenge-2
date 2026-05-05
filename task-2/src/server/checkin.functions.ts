import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const checkInByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid(), code: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("check_in_by_code", {
      _event_id: data.eventId,
      _code: data.code,
    });
    if (error) throw new Error(error.message);
    const row = Array.isArray(rows) ? rows[0] : rows;
    return row as {
      outcome: "ok" | "already" | "not_found" | "cancelled";
      rsvp_id: string | null;
      user_id: string | null;
      display_name: string | null;
      checked_in_at: string | null;
    };
  });

export const undoCheckIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ rsvpId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("undo_check_in", { _rsvp_id: data.rsvpId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ hostSlug: z.string().min(1) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: host, error: he } = await supabaseAdmin
      .from("hosts").select("id, name, slug").eq("slug", data.hostSlug).maybeSingle();
    if (he) throw new Error(he.message);
    if (!host) throw new Error("Host not found");
    const { data: member } = await supabaseAdmin
      .from("host_members").select("role").eq("host_id", host.id).eq("user_id", userId).maybeSingle();
    if (!member || member.role !== "host") throw new Error("forbidden");

    const { data: events, error: ee } = await supabase
      .from("events")
      .select("id, slug, title, status, visibility, starts_at, ends_at, timezone, cover_url, capacity")
      .eq("host_id", host.id)
      .order("starts_at", { ascending: false });
    if (ee) throw new Error(ee.message);

    const ids = (events ?? []).map((e) => e.id);
    let counts: Record<string, { going: number; waitlist: number; checked_in: number }> = {};
    if (ids.length > 0) {
      const { data: rsvps } = await supabase
        .from("rsvps")
        .select("event_id, status, checked_in_at")
        .in("event_id", ids);
      counts = Object.fromEntries(ids.map((id) => [id, { going: 0, waitlist: 0, checked_in: 0 }]));
      for (const r of rsvps ?? []) {
        const c = counts[r.event_id];
        if (!c) continue;
        if (r.status === "going") c.going++;
        else if (r.status === "waitlist") c.waitlist++;
        if (r.checked_in_at) c.checked_in++;
      }
    }
    return { host, events: events ?? [], counts };
  });

export const getCheckInContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ hostSlug: z.string().min(1), eventId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { userId } = context;
    const { data: host } = await supabaseAdmin.from("hosts").select("id, name, slug").eq("slug", data.hostSlug).maybeSingle();
    if (!host) throw new Error("Host not found");
    const { data: member } = await supabaseAdmin
      .from("host_members").select("role").eq("host_id", host.id).eq("user_id", userId).maybeSingle();
    if (!member) throw new Error("forbidden");
    const { data: event } = await supabaseAdmin
      .from("events")
      .select("id, slug, title, starts_at, ends_at, timezone, capacity, host_id")
      .eq("id", data.eventId).maybeSingle();
    if (!event || event.host_id !== host.id) throw new Error("Event not found");
    return { host, event, role: member.role as "host" | "checker" };
  });
