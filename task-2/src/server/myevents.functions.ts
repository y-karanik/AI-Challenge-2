import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const listMyEventsAggregate = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: members } = await supabaseAdmin
      .from("host_members")
      .select("role, host:hosts(id, name, slug, logo_url)")
      .eq("user_id", userId);
    const rows = (members ?? []).filter((m): m is typeof m & { host: NonNullable<typeof m.host> } => !!m.host);
    const hostIds = rows.map((m) => m.host.id);
    if (!hostIds.length) return { hosts: [], events: [] };

    const { data: events } = await supabaseAdmin
      .from("events")
      .select("id, host_id, slug, title, status, visibility, starts_at, ends_at, timezone, cover_url, capacity, is_hidden")
      .in("host_id", hostIds)
      .order("starts_at", { ascending: false });

    const roleByHost = new Map(rows.map((m) => [m.host.id, m.role as "host" | "checker"]));
    const hostMap = new Map(rows.map((m) => [m.host.id, m.host]));
    return {
      hosts: rows.map((m) => ({ ...m.host, role: m.role as "host" | "checker" })),
      events: (events ?? []).map((e) => ({
        ...e,
        host: hostMap.get(e.host_id)!,
        role: roleByHost.get(e.host_id)!,
      })),
    };
  });
