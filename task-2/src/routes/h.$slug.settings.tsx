import * as React from "react";
import { createFileRoute, useNavigate, notFound, Link } from "@tanstack/react-router";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { getPublicHost } from "@/server/public.functions";
import {
  getMyHostRole,
  updateHost,
  listHostMembers,
  createInvite,
  removeMember,
} from "@/server/hosts.functions";

export const Route = createFileRoute("/h/$slug/settings")({
  loader: async ({ params }) => {
    const r = await getPublicHost({ data: { slug: params.slug } });
    if (!r.host) throw notFound();
    return r;
  },
  notFoundComponent: () => (
    <AppShell>
      <EmptyState title="Host not found" />
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell>
      <EmptyState title="Error" description={error.message} />
    </AppShell>
  ),
  component: () => (
    <RequireAuth>
      <Settings />
    </RequireAuth>
  ),
});

function Settings() {
  const { host } = Route.useLoaderData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = React.useState<"host" | "checker" | null | "loading">("loading");

  React.useEffect(() => {
    if (!user) return;
    getMyHostRole({ data: { hostId: host.id } }).then((r) => setRole(r.role));
  }, [user, host.id]);

  if (role === "loading") return <AppShell><EmptyState title="Loading…" /></AppShell>;
  if (role !== "host") {
    return (
      <AppShell>
        <EmptyState
          title="Access denied"
          description="You need the host role on this organization to manage settings."
          action={
            <Button onClick={() => navigate({ to: "/h/$slug", params: { slug: host.slug } })}>
              Back to host page
            </Button>
          }
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title={`${host.name} settings`}
        description="Manage your host profile and team."
        actions={
          <Button asChild variant="outline">
            <Link to="/h/$slug" params={{ slug: host.slug }}>View public page</Link>
          </Button>
        }
      />
      <Tabs defaultValue="profile" className="mt-8">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          <ProfileForm host={host} />
        </TabsContent>
        <TabsContent value="members" className="mt-6">
          <MembersPanel hostId={host.id} hostSlug={host.slug} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

const ProfileSchema = z.object({
  name: z.string().min(2).max(80),
  bio: z.string().max(500).optional(),
  contact_email: z.string().email().optional().or(z.literal("")),
});

function ProfileForm({
  host,
}: {
  host: { id: string; name: string; bio: string | null; logo_url: string | null; contact_email: string | null };
}) {
  const { user } = useAuth();
  const [logoUrl, setLogoUrl] = React.useState(host.logo_url);
  const form = useForm<z.infer<typeof ProfileSchema>>({
    resolver: zodResolver(ProfileSchema),
    defaultValues: {
      name: host.name,
      bio: host.bio ?? "",
      contact_email: host.contact_email ?? "",
    },
  });

  const onLogo = async (file: File) => {
    if (!user) return;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("host-logos").upload(path, file);
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("host-logos").getPublicUrl(path);
    setLogoUrl(data.publicUrl);
  };

  const onSubmit = form.handleSubmit(async (vals) => {
    try {
      await updateHost({
        data: {
          id: host.id,
          name: vals.name,
          bio: vals.bio || null,
          logo_url: logoUrl,
          contact_email: vals.contact_email || null,
        },
      });
      toast.success("Saved");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    }
  });

  return (
    <form onSubmit={onSubmit} className="max-w-2xl space-y-5">
      <div className="flex items-center gap-4">
        <Avatar className="h-20 w-20">
          <AvatarImage src={logoUrl ?? undefined} alt="" />
          <AvatarFallback>{host.name[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <Label htmlFor="logo">Logo</Label>
          <Input id="logo" type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && onLogo(e.target.files[0])} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Name</Label>
        <Input {...form.register("name")} />
      </div>
      <div className="space-y-1.5">
        <Label>Bio</Label>
        <Textarea rows={4} {...form.register("bio")} />
      </div>
      <div className="space-y-1.5">
        <Label>Contact email</Label>
        <Input type="email" {...form.register("contact_email")} />
      </div>
      <Button type="submit" disabled={form.formState.isSubmitting}>Save changes</Button>
    </form>
  );
}

type MemberRow = {
  user_id: string;
  role: "host" | "checker";
  joined_at: string;
  profile: { id: string; display_name: string | null; avatar_url: string | null };
};

function MembersPanel({ hostId, hostSlug: _hostSlug }: { hostId: string; hostSlug: string }) {
  const [members, setMembers] = React.useState<MemberRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [inviteRole, setInviteRole] = React.useState<"host" | "checker">("checker");
  const [lastUrl, setLastUrl] = React.useState<string | null>(null);
  const { user } = useAuth();

  const reload = React.useCallback(() => {
    setLoading(true);
    listHostMembers({ data: { hostId } }).then((m) => {
      setMembers(m as MemberRow[]);
      setLoading(false);
    });
  }, [hostId]);
  React.useEffect(() => reload(), [reload]);

  const onCreateInvite = async () => {
    try {
      const inv = await createInvite({ data: { hostId, role: inviteRole } });
      const url = `${window.location.origin}/join/${inv.token}`;
      setLastUrl(url);
      await navigator.clipboard.writeText(url).catch(() => null);
      toast.success(`Invite link copied (${inviteRole}, expires in 7 days).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const onRemove = async (uid: string) => {
    try {
      await removeMember({ data: { hostId, userId: uid } });
      toast.success("Removed");
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="font-semibold">Invite a member</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Generate a single-use link valid for 7 days.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as "host" | "checker")}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="checker">Checker</SelectItem>
                <SelectItem value="host">Host</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={onCreateInvite}><UserPlus className="mr-2 h-4 w-4" />Generate invite</Button>
        </div>
        {lastUrl && (
          <div className="mt-4 flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-xs">
            <code className="flex-1 truncate">{lastUrl}</code>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { navigator.clipboard.writeText(lastUrl); toast.success("Copied"); }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-3 font-semibold">Team ({members.length})</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {members.map((m) => (
              <li key={`${m.user_id}-${m.role}`} className="flex items-center gap-3 p-3">
                <Avatar className="h-9 w-9">
                  <AvatarImage src={m.profile?.avatar_url ?? undefined} alt="" />
                  <AvatarFallback>{m.profile?.display_name?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{m.profile?.display_name ?? "Unknown"}</p>
                  <p className="text-xs text-muted-foreground">Joined {new Date(m.joined_at).toLocaleDateString()}</p>
                </div>
                <Badge variant={m.role === "host" ? "default" : "secondary"}>{m.role}</Badge>
                {m.user_id !== user?.id && (
                  <Button size="icon" variant="ghost" onClick={() => onRemove(m.user_id)} aria-label="Remove">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
