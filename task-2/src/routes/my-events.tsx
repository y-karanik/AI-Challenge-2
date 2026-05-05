import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarPlus, Edit, ScanLine, LayoutDashboard, Search, X, Plus, Settings } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { listMyEventsAggregate } from "@/server/myevents.functions";
import { formatEventDateTime } from "@/lib/tz";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/my-events")({
  component: () => <RequireAuth><MyEvents /></RequireAuth>,
  head: () => ({ meta: [{ title: "My events — Gather" }, { name: "description", content: "Events you host or check in." }] }),
});

type Data = Awaited<ReturnType<typeof listMyEventsAggregate>>;

function MyEvents() {
  const { user, loading: authLoading } = useAuth();
  const [data, setData] = React.useState<Data | null>(null);
  const [selectedHosts, setSelectedHosts] = React.useState<Set<string>>(new Set());
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [q, setQ] = React.useState("");

  React.useEffect(() => {
    if (authLoading || !user) return;
    void listMyEventsAggregate().then(setData).catch(() => setData({ hosts: [], events: [] }));
  }, [authLoading, user]);

  if (!data) return <AppShell><EmptyState title="Loading…" /></AppShell>;

  if (data.hosts.length === 0) {
    return (
      <AppShell>
        <PageHeader title="My events" />
        <div className="mt-8">
          <EmptyState
            icon={CalendarPlus}
            title="No host roles yet"
            description="Create a host or accept an invite to see events here."
            action={<Button asChild><Link to="/become-a-host">Become a host</Link></Button>}
          />
        </div>
      </AppShell>
    );
  }

  const filtered = data.events.filter((e) => {
    if (selectedHosts.size > 0 && !selectedHosts.has(e.host_id)) return false;
    if (q && !e.title.toLowerCase().includes(q.toLowerCase())) return false;
    if (from && new Date(e.starts_at) < new Date(from)) return false;
    if (to && new Date(e.starts_at) > new Date(to)) return false;
    return true;
  });

  const toggleHost = (id: string) => {
    const next = new Set(selectedHosts);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedHosts(next);
  };

  const clearFilters = () => { setSelectedHosts(new Set()); setFrom(""); setTo(""); setQ(""); };

  const hostRoleHosts = data.hosts.filter((h) => h.role === "host");
  const createAction =
    hostRoleHosts.length === 1 ? (
      <Button asChild>
        <Link to="/h/$slug/events/new" params={{ slug: hostRoleHosts[0].slug }}>
          <Plus className="mr-1 h-4 w-4" />New event
        </Link>
      </Button>
    ) : hostRoleHosts.length > 1 ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button><Plus className="mr-1 h-4 w-4" />New event</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {hostRoleHosts.map((h) => (
            <DropdownMenuItem key={h.id} asChild>
              <Link to="/h/$slug/events/new" params={{ slug: h.slug }}>{h.name}</Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <AppShell>
      <PageHeader title="My events" description="Events from hosts you belong to." actions={createAction} />


      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap gap-2">
          {data.hosts.map((h) => (
            <button
              key={h.id}
              onClick={() => toggleHost(h.id)}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition ${
                selectedHosts.has(h.id) ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-accent"
              }`}
            >
              <Avatar className="h-5 w-5">
                <AvatarImage src={h.logo_url ?? undefined} />
                <AvatarFallback>{h.name[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              {h.name} <span className="text-xs text-muted-foreground">({h.role})</span>
            </button>
          ))}
          <Link
            to="/become-a-host"
            className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            Add host
          </Link>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:gap-2 sm:items-end">
          <div className="relative">
            <label htmlFor="my-events-search" className="mb-1 block text-sm font-medium sm:sr-only">Search</label>
            <Search className="absolute left-3 top-[calc(50%+0.6rem)] h-4 w-4 -translate-y-1/2 text-muted-foreground sm:top-1/2" />
            <Input id="my-events-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by title…" className="pl-9" />
          </div>
          <div>
            <label htmlFor="my-events-from" className="mb-1 block text-sm font-medium sm:sr-only">From</label>
            <DateInput id="my-events-from" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
          </div>
          <div>
            <label htmlFor="my-events-to" className="mb-1 block text-sm font-medium sm:sr-only">To</label>
            <DateInput id="my-events-to" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>
          <Button variant="ghost" onClick={clearFilters} className="w-full sm:w-auto"><X className="mr-1 h-4 w-4" />Clear</Button>
        </div>
      </div>

      <div className="mt-8 space-y-3">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events match those filters.</p>
        ) : filtered.map((e) => (
          <Card key={e.id} className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:gap-3">
            <div className="hidden h-16 w-28 flex-shrink-0 overflow-hidden rounded bg-muted md:block">
              {e.cover_url && <img src={e.cover_url} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1 space-y-2 md:space-y-1">
              <p className="font-medium leading-snug md:truncate">{e.title}</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={e.status === "published" ? "default" : "secondary"}>{e.status}</Badge>
                {e.is_hidden && <Badge variant="destructive">hidden</Badge>}
                <Badge variant="outline">{e.host.name}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{formatEventDateTime(e.starts_at, e.timezone)}</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap md:gap-2">
              {e.role === "host" && (
                <>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/events/$id/edit" params={{ id: e.id }}><Edit className="mr-1 h-4 w-4" />Edit</Link>
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/h/$slug/dashboard" params={{ slug: e.host.slug }}><LayoutDashboard className="mr-1 h-4 w-4" />Dashboard</Link>
                  </Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/h/$slug/settings" params={{ slug: e.host.slug }}><Settings className="mr-1 h-4 w-4" />Settings</Link>
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" asChild>
                <Link to="/h/$slug/events/$id/check-in" params={{ slug: e.host.slug, id: e.id }}>
                  <ScanLine className="mr-1 h-4 w-4" />Check-in
                </Link>
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
