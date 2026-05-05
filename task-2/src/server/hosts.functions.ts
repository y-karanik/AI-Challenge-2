import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { SLUG_RE } from "@/lib/slug";

export const checkHostSlug = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    if (!SLUG_RE.test(data.slug)) return { available: false, reason: "invalid" as const };
    const { data: row } = await supabaseAdmin
      .from("hosts")
      .select("id")
      .eq("slug", data.slug)
      .maybeSingle();
    return { available: !row, reason: row ? ("taken" as const) : ("ok" as const) };
  });

export const createHost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        name: z.string().min(2).max(80),
        slug: z.string().regex(SLUG_RE, "Invalid slug"),
        bio: z.string().max(500).optional().nullable(),
        logo_url: z.string().url().optional().nullable(),
        contact_email: z.string().email().optional().nullable(),
      })
      .parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("create_host", {
      _name: data.name,
      _slug: data.slug,
      _bio: data.bio ?? undefined,
      _logo_url: data.logo_url ?? undefined,
      _contact_email: data.contact_email ?? undefined,
    });
    if (error) {
      // unique_violation
      if (error.code === "23505") throw new Error("That slug is taken. Try another.");
      throw new Error(error.message);
    }
    return row;
  });

export const updateHost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(2).max(80),
        bio: z.string().max(500).optional().nullable(),
        logo_url: z.string().url().optional().nullable(),
        contact_email: z.string().email().optional().nullable(),
      })
      .parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("hosts")
      .update({
        name: data.name,
        bio: data.bio ?? null,
        logo_url: data.logo_url ?? null,
        contact_email: data.contact_email ?? null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMyHosts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("host_members")
      .select("role, host:hosts(id, name, slug, logo_url)")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listHostMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ hostId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: members, error } = await supabase
      .from("host_members")
      .select("user_id, role, joined_at")
      .eq("host_id", data.hostId);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((members ?? []).map((m) => m.user_id)));
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids)
      : { data: [] as { id: string; display_name: string | null; avatar_url: string | null }[] };
    const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
    return (members ?? []).map((m) => ({
      ...m,
      profile: byId.get(m.user_id) ?? { id: m.user_id, display_name: null, avatar_url: null },
    }));
  });

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ hostId: z.string().uuid(), role: z.enum(["host", "checker"]) }).parse(d)
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data: row, error } = await supabase
      .from("host_invites")
      .insert({ host_id: data.hostId, role: data.role, token, expires_at: expires })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ hostId: z.string().uuid(), userId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    if (data.userId === userId) throw new Error("You can't remove yourself.");
    const { error } = await supabase
      .from("host_members")
      .delete()
      .eq("host_id", data.hostId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const redeemInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ token: z.string().min(8) }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error } = await supabase.rpc("redeem_host_invite", { _token: data.token });
    if (error) throw new Error(error.message);
    return row;
  });

export const getMyHostRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ hostId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("host_members")
      .select("role")
      .eq("host_id", data.hostId)
      .eq("user_id", userId)
      .maybeSingle();
    return { role: (row?.role as "host" | "checker" | undefined) ?? null };
  });
