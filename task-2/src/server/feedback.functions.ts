import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        eventId: z.string().uuid(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(2000).optional().nullable(),
      })
      .parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("upsert_feedback", {
      _event_id: data.eventId,
      _rating: data.rating,
      _comment: data.comment ?? "",
    });
    if (error) throw new Error(error.message);
    return row;
  });

export const getMyFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("feedback")
      .select("id, rating, comment, created_at")
      .eq("event_id", data.eventId)
      .eq("user_id", userId)
      .maybeSingle();
    return row;
  });

export const listEventFeedback = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    // Public read: only for past events
    const { data: ev } = await supabaseAdmin
      .from("events").select("id, ends_at").eq("id", data.eventId).maybeSingle();
    if (!ev || new Date(ev.ends_at) >= new Date()) return { items: [], avg: 0, count: 0 };
    const { data: rows } = await supabaseAdmin
      .from("feedback")
      .select("id, rating, comment, created_at, user_id")
      .eq("event_id", data.eventId)
      .order("created_at", { ascending: false });
    const items = rows ?? [];
    const ids = Array.from(new Set(items.map((i) => i.user_id)));
    const profiles = ids.length
      ? (await supabaseAdmin.from("profiles").select("id, display_name, avatar_url").in("id", ids)).data ?? []
      : [];
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const count = items.length;
    const avg = count ? items.reduce((s, i) => s + i.rating, 0) / count : 0;
    return {
      avg,
      count,
      items: items.map((i) => ({
        id: i.id,
        rating: i.rating,
        comment: i.comment,
        created_at: i.created_at,
        author: byId.get(i.user_id) ?? { id: i.user_id, display_name: null, avatar_url: null },
      })),
    };
  });

export const getMyEventEligibility = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("rsvps")
      .select("id, status, checked_in_at")
      .eq("event_id", data.eventId)
      .eq("user_id", userId)
      .maybeSingle();
    return { rsvp: row };
  });
