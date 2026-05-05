import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { listModerationQueue, setPhotoStatus } from "@/server/gallery.functions";

export const Route = createFileRoute("/h/$slug/moderation")({
  component: () => <RequireAuth><Moderation /></RequireAuth>,
  head: () => ({ meta: [{ title: "Moderation — Gather" }] }),
});

type Data = Awaited<ReturnType<typeof listModerationQueue>>;

function Moderation() {
  const { slug } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = React.useState<Data | "forbidden" | "loading">("loading");
  const [filter, setFilter] = React.useState<"pending" | "approved" | "rejected" | "all">("pending");

  const reload = React.useCallback(async () => {
    try {
      const r = await listModerationQueue({ data: { hostSlug: slug } });
      setData(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      setData(msg.includes("forbidden") ? "forbidden" : "forbidden");
    }
  }, [slug]);

  React.useEffect(() => { if (!authLoading && user) void reload(); }, [authLoading, user, reload]);

  React.useEffect(() => {
    const ch = supabase
      .channel(`mod-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gallery_photos" }, () => void reload())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [slug, reload]);

  if (data === "loading") return <AppShell><EmptyState title="Loading…" /></AppShell>;
  if (data === "forbidden") return <AppShell><EmptyState title="Access denied" description="Only host members can moderate." action={<Button onClick={() => navigate({ to: "/h/$slug", params: { slug } })}>Back to host</Button>} /></AppShell>;

  const visible = data.items.filter((p) => filter === "all" || p.status === filter);

  const act = async (id: string, status: "approved" | "rejected") => {
    try {
      await setPhotoStatus({ data: { photoId: id, status } });
      toast.success(status === "approved" ? "Approved" : "Rejected");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <AppShell>
      <PageHeader
        title={`${data.host.name} — Photo moderation`}
        description="Approve or reject community-submitted photos."
        actions={<Button asChild variant="outline" size="sm"><Link to="/h/$slug/dashboard" params={{ slug }}>Dashboard</Link></Button>}
      />

      <div className="mt-6 flex gap-2">
        {(["pending", "approved", "rejected", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f} ({data.items.filter((p) => f === "all" || p.status === f).length})
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <div key={p.id} className="overflow-hidden rounded-lg border border-border bg-card">
              <div className="aspect-square overflow-hidden bg-muted">
                {p.url && <img src={p.url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <p className="truncate text-xs text-muted-foreground">{p.event?.title ?? "—"}</p>
                  <Badge variant={p.status === "pending" ? "secondary" : p.status === "approved" ? "default" : "destructive"}>{p.status}</Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">by {p.uploader.display_name ?? "Someone"}</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" className="flex-1" disabled={p.status === "approved"} onClick={() => act(p.id, "approved")}>
                    <Check className="mr-1 h-4 w-4" /> Approve
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" disabled={p.status === "rejected"} onClick={() => act(p.id, "rejected")}>
                    <X className="mr-1 h-4 w-4" /> Reject
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
