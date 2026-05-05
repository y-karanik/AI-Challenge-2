// CSV export edge function — UTF-8 with BOM, RFC 4180 quoting.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const eventId = url.searchParams.get("event_id");
    if (!eventId) return new Response("event_id required", { status: 400, headers: corsHeaders });

    const auth = req.headers.get("Authorization");
    if (!auth) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: auth } } }
    );
    const { data: userRes } = await userClient.auth.getUser();
    if (!userRes.user) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: event } = await admin
      .from("events").select("id, slug, host_id").eq("id", eventId).maybeSingle();
    if (!event) return new Response("Event not found", { status: 404, headers: corsHeaders });

    const { data: member } = await admin
      .from("host_members").select("role").eq("host_id", event.host_id).eq("user_id", userRes.user.id).maybeSingle();
    if (!member || member.role !== "host") return new Response("Forbidden", { status: 403, headers: corsHeaders });

    const { data: rsvps } = await admin
      .from("rsvps")
      .select("user_id, status, checked_in_at, created_at")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    const userIds = Array.from(new Set((rsvps ?? []).map((r) => r.user_id)));
    const { data: profiles } = userIds.length
      ? await admin.from("profiles").select("id, display_name").in("id", userIds)
      : { data: [] };
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name ?? ""]));

    // Get emails via auth admin
    const emailById = new Map<string, string>();
    for (const id of userIds) {
      const { data: u } = await admin.auth.admin.getUserById(id);
      if (u?.user?.email) emailById.set(id, u.user.email);
    }

    const header = ["name", "email", "rsvp_status", "check_in_time"];
    const lines = [header.join(",")];
    for (const r of rsvps ?? []) {
      lines.push([
        csvEscape(nameById.get(r.user_id) ?? ""),
        csvEscape(emailById.get(r.user_id) ?? ""),
        csvEscape(r.status),
        csvEscape(r.checked_in_at ?? ""),
      ].join(","));
    }
    const body = "\uFEFF" + lines.join("\r\n") + "\r\n";
    const date = new Date().toISOString().slice(0, 10);
    const filename = `${event.slug}-attendance-${date}.csv`;

    return new Response(body, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e) {
    return new Response(`Error: ${e instanceof Error ? e.message : String(e)}`, { status: 500, headers: corsHeaders });
  }
});
