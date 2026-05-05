import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { EyeOff, X, ImageIcon, CalendarDays } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { RequireAuth } from "@/components/RequireAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { listReportsForHost, hideReportedEvent, dismissReport } from "@/server/reports.functions";
import { setPhotoStatus } from "@/server/gallery.functions";

export const Route = createFileRoute("/h/$slug/reports")({
  component: () => <RequireAuth><Reports /></RequireAuth>,
  head: () => ({ meta: [{ title: "Reports — Gather" }] }),
});

type Data = Awaited<ReturnType<typeof listReportsForHost>>;

function Reports() {
  const { slug } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = React.useState<Data | "forbidden" | "loading">("loading");
  const [filter, setFilter] = React.useState<"open" | "hidden" | "dismissed" | "all">("open");

  const reload = React.useCallback(async () => {
    try {
      const r = await listReportsForHost({ data: { hostSlug: slug } });
      setData(r);
    } catch {
      setData("forbidden");
    }
  }, [slug]);

  React.useEffect(() => { if (!authLoading && user) void reload(); }, [authLoading, user, reload]);

  if (data === "loading") return <AppShell><EmptyState title="Loading…" /></AppShell>;
  if (data === "forbidden") return <AppShell><EmptyState title="Access denied" action={<Button onClick={() => navigate({ to: "/h/$slug", params: { slug } })}>Back</Button>} /></AppShell>;

  const visible = data.items.filter((r) => filter === "all" || r.status === filter);

  const onHide = async (r: Data["items"][number]) => {
    try {
      if (r.targetType === "event") {
        await hideReportedEvent({ data: { eventId: r.targetId, reportId: r.id, hidden: true } });
      } else {
        await setPhotoStatus({ data: { photoId: r.targetId, status: "rejected", reportId: r.id } });
      }
      toast.success("Hidden");
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };
  const onDismiss = async (id: string) => {
    try {
      await dismissReport({ data: { reportId: id } });
      toast.success("Dismissed");
      void reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <AppShell>
      <PageHeader
        title={`${data.host.name} — Reports`}
        description="Review user-flagged events and photos."
        actions={<Button asChild variant="outline" size="sm"><Link to="/h/$slug/dashboard" params={{ slug }}>Dashboard</Link></Button>}
      />

      <div className="mt-6 flex gap-2">
        {(["open", "hidden", "dismissed", "all"] as const).map((f) => (
          <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)}>
            {f} ({data.items.filter((p) => f === "all" || p.status === f).length})
          </Button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">No reports.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {visible.map((r) => (
            <div key={r.id} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 md:flex-row md:items-center">
              <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
                {r.target?.type === "photo" && r.target.photoUrl ? (
                  <img src={r.target.photoUrl} alt="" className="h-full w-full object-cover" />
                ) : r.target?.type === "event" ? (
                  <CalendarDays className="h-6 w-6 text-muted-foreground" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="capitalize">{r.targetType}</Badge>
                  <Badge variant="secondary" className="capitalize">{r.reason}</Badge>
                  <Badge variant={r.status === "open" ? "destructive" : "secondary"}>{r.status}</Badge>
                  {r.target?.eventSlug && (
                    <Link to="/e/$slug" params={{ slug: r.target.eventSlug }} className="text-sm text-primary underline">
                      {r.target.label}
                    </Link>
                  )}
                </div>
                {r.details && <p className="mt-1 text-sm text-muted-foreground">{r.details}</p>}
                <p className="mt-1 text-xs text-muted-foreground">Reported by {r.reporter.display_name ?? "Someone"} · {new Date(r.created_at).toLocaleString()}</p>
              </div>
              {r.status === "open" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="destructive" onClick={() => onHide(r)}><EyeOff className="mr-1 h-4 w-4" /> Hide</Button>
                  <Button size="sm" variant="outline" onClick={() => onDismiss(r.id)}><X className="mr-1 h-4 w-4" /> Dismiss</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
