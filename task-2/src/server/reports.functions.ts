import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { rateLimit } from "./rate-limit.server";

export const submitReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        targetType: z.enum(["event", "photo"]),
        targetId: z.string().uuid(),
        reason: z.enum(["spam", "inappropriate", "misleading", "other"]),
        details: z.string().max(2000).optional().nullable(),
      })
      .parse(d)
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    rateLimit(`report:${userId}`, 5, 5);
    const { data: row, error } = await supabaseAdmin
      .from("reports")
      .insert({
        target_type: data.targetType,
        target_id: data.targetId,
        reporter_id: userId,
        reason: data.reason,
        details: data.details ?? null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listReportsForHost = createServerFn({ method: "GET" })
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
    const eventIds = (events ?? []).map((e) => e.id);
    const eventById = new Map((events ?? []).map((e) => [e.id, e]));
    if (!eventIds.length) return { host, items: [] };

    const { data: photos } = await supabaseAdmin
      .from("gallery_photos").select("id, event_id, storage_path").in("event_id", eventIds);
    const photoIds = (photos ?? []).map((p) => p.id);
    const photoById = new Map((photos ?? []).map((p) => [p.id, p]));

    const [eventReportsRes, photoReportsRes] = await Promise.all([
      eventIds.length
        ? supabaseAdmin
            .from("reports")
            .select("id, target_type, target_id, reason, details, status, created_at, reporter_id")
            .eq("target_type", "event")
            .in("target_id", eventIds)
        : Promise.resolve({ data: [] as Array<{ id: string; target_type: string; target_id: string; reason: string; details: string | null; status: string; created_at: string; reporter_id: string }> }),
      photoIds.length
        ? supabaseAdmin
            .from("reports")
            .select("id, target_type, target_id, reason, details, status, created_at, reporter_id")
            .eq("target_type", "photo")
            .in("target_id", photoIds)
        : Promise.resolve({ data: [] as Array<{ id: string; target_type: string; target_id: string; reason: string; details: string | null; status: string; created_at: string; reporter_id: string }> }),
    ]);
    const reports = [...(eventReportsRes.data ?? []), ...(photoReportsRes.data ?? [])].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    const reporterIds = Array.from(new Set((reports ?? []).map((r) => r.reporter_id)));
    const { data: profiles } = reporterIds.length
      ? await supabaseAdmin.from("profiles").select("id, display_name").in("id", reporterIds)
      : { data: [] as { id: string; display_name: string | null }[] };
    const byUser = new Map((profiles ?? []).map((p) => [p.id, p]));

    const items = await Promise.all(
      (reports ?? []).map(async (r) => {
        let target: { type: "event" | "photo"; label: string; eventSlug?: string; photoUrl?: string | null } | null = null;
        if (r.target_type === "event") {
          const e = eventById.get(r.target_id);
          target = e ? { type: "event", label: e.title, eventSlug: e.slug } : null;
        } else {
          const p = photoById.get(r.target_id);
          if (p) {
            const sign = await supabaseAdmin.storage.from("gallery-photos").createSignedUrl(p.storage_path, 60 * 60);
            const ev = eventById.get(p.event_id);
            target = { type: "photo", label: ev?.title ?? "Photo", eventSlug: ev?.slug, photoUrl: sign.data?.signedUrl ?? null };
          }
        }
        return {
          id: r.id,
          targetType: r.target_type as "event" | "photo",
          targetId: r.target_id,
          reason: r.reason,
          details: r.details,
          status: r.status as "open" | "hidden" | "dismissed",
          created_at: r.created_at,
          reporter: byUser.get(r.reporter_id) ?? { id: r.reporter_id, display_name: null },
          target,
        };
      })
    );
    return { host, items };
  });

export const hideReportedEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ eventId: z.string().uuid(), reportId: z.string().uuid().optional(), hidden: z.boolean().default(true) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("set_event_hidden", {
      _event_id: data.eventId,
      _hidden: data.hidden,
      _report_id: data.reportId ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const dismissReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ reportId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("dismiss_report", { _report_id: data.reportId });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
