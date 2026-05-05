import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { rateLimit } from "./rate-limit.server";

export const createRsvp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    rateLimit(`rsvp:${userId}`, 10, 10);
    const { data: row, error } = await supabase.rpc("create_rsvp", { _event_id: data.eventId });
    if (error) throw new Error(error.message);
    return row as unknown as {
      id: string; event_id: string; user_id: string; status: "going" | "waitlist" | "cancelled";
      position: number | null; qr_code: string; created_at: string; checked_in_at: string | null;
    };
  });

export const cancelRsvp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ rsvpId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("cancel_rsvp", { _rsvp_id: data.rsvpId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const nowIso = new Date().toISOString();
    const { data: rsvps, error } = await supabase
      .from("rsvps")
      .select("id, event_id, status, position, qr_code, created_at, checked_in_at")
      .eq("user_id", userId)
      .neq("status", "cancelled");
    if (error) throw new Error(error.message);
    const ids = (rsvps ?? []).map((r) => r.event_id);
    if (ids.length === 0) return [];
    const { data: events } = await supabase
      .from("events")
      .select("id, slug, title, starts_at, ends_at, timezone, venue_address, online_url, cover_url, host_id")
      .in("id", ids)
      .gte("ends_at", nowIso);
    const byId = new Map((events ?? []).map((e) => [e.id, e] as const));
    return (rsvps ?? [])
      .filter((r) => byId.has(r.event_id))
      .map((r) => ({ rsvp: r, event: byId.get(r.event_id)! }));
  });
