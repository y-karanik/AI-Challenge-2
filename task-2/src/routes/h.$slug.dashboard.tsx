import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CalendarDays, Download, Edit, Copy as CopyIcon, ScanLine, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardData } from "@/server/checkin.functions";
import { duplicateEvent } from "@/server/events.functions";
import { formatEventDateTime } from "@/lib/tz";

export const Route = createFileRoute("/h/$slug/dashboard")({
  component: () => (
    <RequireAuth>
      <Dashboard />
    </RequireAuth>
  ),
  head: () => ({ meta: [{ title: "Host dashboard — Gather" }] }),
  notFoundComponent: () => <AppShell><EmptyState title="Host not found" /></AppShell>,
  errorComponent: ({ error }) => <AppShell><EmptyState title="Error" description={error.message} /></AppShell>,
});

type EventRow = {
  id: string; slug: string; title: string; status: string; visibility: string;
  starts_at: string; ends_at: string; timezone: string; cover_url: string | null; capacity: number | null;
};
type Counts = Record<string, { going: number; waitlist: number; checked_in: number }>;

function Dashboard() {
  const { slug } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = React.useState<{ host: { id: string; name: string; slug: string }; events: EventRow[]; counts: Counts } | null | "forbidden" | "notfound" | "loading">("loading");

  const reload = React.useCallback(async () => {
    try {
      const r = await getDashboardData({ data: { hostSlug: slug } });
      setData(r);
    } catch (e) {
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      if (msg.includes("forbidden")) setData("forbidden");
      else if (msg.includes("not found")) setData("notfound");
      else setData("forbidden");
    }
  }, [slug]);

  React.useEffect(() => {
    if (authLoading || !user) return;
    void reload();
  }, [authLoading, user, reload]);

  // Realtime: refetch counts on any rsvp change for this host's events
  React.useEffect(() => {
    if (!data || data === "loading" || data === "forbidden" || data === "notfound") return;
    const ids = new Set(data.events.map((e) => e.id));
    const ch = supabase
      .channel(`dash-${data.host.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rsvps" }, (payload) => {
        const evId = (payload.new as { event_id?: string } | null)?.event_id ?? (payload.old as { event_id?: string } | null)?.event_id;
        if (evId && ids.has(evId)) void reload();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [data, reload]);

  if (authLoading || data === "loading" || data === null) return <AppShell><EmptyState title="Loading…" /></AppShell>;
  if (data === "notfound") {
    return (
      <AppShell>
        <EmptyState title="Host not found" description="This host doesn't exist or was removed." />
      </AppShell>
    );
  }
  if (data === "forbidden") {
    return (
      <AppShell>
        <EmptyState
          title="Access denied"
          description="Only host members with the host role can view the dashboard."
          action={<Button onClick={() => navigate({ to: "/h/$slug", params: { slug } })}>Back to host page</Button>}
        />
      </AppShell>
    );
  }

  const now = Date.now();
  const upcoming = data.events.filter((e) => new Date(e.ends_at).getTime() >= now);
  const past = data.events.filter((e) => new Date(e.ends_at).getTime() < now);
  const totalEvents = data.events.length;
  const totalRsvps = Object.values(data.counts).reduce((s, c) => s + c.going + c.waitlist, 0);
  const attendanceRates = past
    .map((e) => {
      const c = data.counts[e.id];
      if (!c || c.going === 0) return null;
      return c.checked_in / c.going;
    })
    .filter((v): v is number => v !== null);
  const avgRate = attendanceRates.length ? attendanceRates.reduce((a, b) => a + b, 0) / attendanceRates.length : 0;

  const onDuplicate = async (id: string) => {
    try {
      const row = await duplicateEvent({ data: { id } });
      toast.success("Duplicated as draft");
      navigate({ to: "/events/$id/edit", params: { id: (row as { id: string }).id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const onExport = async (eventId: string) => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token;
    if (!token) return toast.error("Sign in required");
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-attendance?event_id=${eventId}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!resp.ok) return toast.error(`Export failed: ${resp.status}`);
    const blob = await resp.blob();
    const cd = resp.headers.get("Content-Disposition") || "";
    const m = cd.match(/filename="([^"]+)"/);
    const filename = m?.[1] ?? `attendance-${eventId}.csv`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const renderRow = (e: EventRow) => {
    const c = data.counts[e.id] ?? { going: 0, waitlist: 0, checked_in: 0 };
    return (
      <Card key={e.id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
        <div className="hidden h-16 w-28 flex-shrink-0 overflow-hidden rounded bg-muted md:block">
          {e.cover_url ? <img src={e.cover_url} alt="" className="h-full w-full object-cover" />
            : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><CalendarDays className="h-5 w-5" /></div>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium">{e.title}</p>
            <Badge variant={e.status === "published" ? "default" : "secondary"}>{e.status}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">{formatEventDateTime(e.starts_at, e.timezone)}</p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            <span><strong className="text-foreground">{c.going}</strong> going</span>
            <span><strong className="text-foreground">{c.waitlist}</strong> waitlist</span>
            <span><strong className="text-foreground">{c.checked_in}</strong> checked in</span>
            {e.capacity != null && <span className="text-muted-foreground">cap {e.capacity}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" asChild>
            <Link to="/events/$id/edit" params={{ id: e.id }}><Edit className="mr-1 h-4 w-4" />Edit</Link>
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onDuplicate(e.id)}>
            <CopyIcon className="mr-1 h-4 w-4" />Duplicate
          </Button>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/h/$slug/events/$id/check-in" params={{ slug: data.host.slug, id: e.id }}>
              <ScanLine className="mr-1 h-4 w-4" />Check-in
            </Link>
          </Button>
          <Button size="sm" variant="outline" onClick={() => onExport(e.id)}>
            <Download className="mr-1 h-4 w-4" />CSV
          </Button>
        </div>
      </Card>
    );
  };

  return (
    <AppShell>
      <PageHeader
        title={`${data.host.name} — Dashboard`}
        description="Live counters, exports, and check-in."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/h/$slug/moderation" params={{ slug: data.host.slug }}>Moderation</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/h/$slug/reports" params={{ slug: data.host.slug }}>Reports</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/h/$slug/events/new" params={{ slug: data.host.slug }}>
                <Plus className="mr-1 h-4 w-4" />New event
              </Link>
            </Button>
          </div>
        }
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Total events</p>
          <p className="mt-1 text-2xl font-semibold">{totalEvents}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Total RSVPs</p>
          <p className="mt-1 text-2xl font-semibold">{totalRsvps}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase text-muted-foreground">Avg attendance rate</p>
          <p className="mt-1 text-2xl font-semibold">{(avgRate * 100).toFixed(0)}%</p>
        </Card>
      </div>

      <Tabs defaultValue="upcoming" className="mt-8">
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming" className="mt-4 space-y-3">
          {upcoming.length === 0 ? <p className="text-sm text-muted-foreground">No upcoming events.</p> : upcoming.map(renderRow)}
        </TabsContent>
        <TabsContent value="past" className="mt-4 space-y-3">
          {past.length === 0 ? <p className="text-sm text-muted-foreground">No past events.</p> : past.map(renderRow)}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
