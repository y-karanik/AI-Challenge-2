import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { CalendarSearch, CalendarDays, Search } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { searchEvents } from "@/server/public.functions";
import { formatEventDateTime } from "@/lib/tz";

const SearchSchema = z.object({
  q: z.string().optional().default(""),
  from: z.string().optional().default(""),
  to: z.string().optional().default(""),
  location: z.string().optional().default(""),
  past: z.union([z.literal("1"), z.literal("0")]).optional().default("0"),
});

export const Route = createFileRoute("/explore")({
  validateSearch: (s) => SearchSchema.parse(s),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) =>
    searchEvents({
      data: {
        q: deps.q || "",
        from: deps.from || undefined,
        to: deps.to || undefined,
        location: deps.location || "",
        includePast: deps.past === "1",
      },
    }),
  head: () => ({
    meta: [
      { title: "Explore events — Gather" },
      { name: "description", content: "Discover upcoming community events." },
    ],
  }),
  component: Explore,
});

type EventRow = {
  id: string; slug: string; title: string; starts_at: string; timezone: string;
  cover_url: string | null; venue_address: string | null; online_url: string | null;
};

function Explore() {
  const events = Route.useLoaderData() as EventRow[];
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = React.useState(search.q);
  const [loc, setLoc] = React.useState(search.location);
  const [from, setFrom] = React.useState(search.from);
  const [to, setTo] = React.useState(search.to);
  const past = search.past === "1";

  // Debounce search/location -> URL
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (q !== search.q || loc !== search.location) {
        navigate({
          to: "/explore",
          search: { ...search, q, location: loc } as never,
          replace: true,
        });
      }
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, loc]);

  const apply = (patch: Record<string, string>) => {
    navigate({ to: "/explore", search: { ...search, ...patch } as never, replace: true });
  };

  return (
    <AppShell>
      <PageHeader title="Explore events" description="Public, upcoming events from hosts on Gather." />

      <div className="mt-6 grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-12">
        <div className="md:col-span-5">
          <Label htmlFor="q" className="text-xs">Search</Label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
            <Input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Coffee, music, talks…" className="pl-8" />
          </div>
        </div>
        <div className="md:col-span-3">
          <Label htmlFor="loc" className="text-xs">Location (or "online")</Label>
          <Input id="loc" value={loc} onChange={(e) => setLoc(e.target.value)} placeholder="Brooklyn, online…" />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="from" className="text-xs">From</Label>
          <DateInput id="from" value={from} onChange={(e) => { setFrom(e.target.value); apply({ from: e.target.value }); }} />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="to" className="text-xs">To</Label>
          <DateInput id="to" value={to} onChange={(e) => { setTo(e.target.value); apply({ to: e.target.value }); }} />
        </div>
        <div className="md:col-span-12 flex items-center gap-2">
          <Switch id="past" checked={past} onCheckedChange={(v) => apply({ past: v ? "1" : "0" })} />
          <Label htmlFor="past" className="text-sm">Show past events</Label>
        </div>
      </div>

      <div className="mt-8">
        {events.length === 0 ? (
          <EmptyState
            icon={CalendarSearch}
            title="No events match your filters"
            description="Try clearing search or expanding the date range."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {events.map((e) => (
              <Link key={e.id} to="/e/$slug" params={{ slug: e.slug }}>
                <Card className="overflow-hidden transition hover:border-primary/40 hover:shadow-md">
                  {e.cover_url ? (
                    <img src={e.cover_url} alt="" className="aspect-[16/9] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[16/9] w-full items-center justify-center bg-accent text-accent-foreground">
                      <CalendarDays className="h-8 w-8" />
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      {formatEventDateTime(e.starts_at, e.timezone)}
                    </p>
                    <h3 className="mt-1 line-clamp-2 font-semibold">{e.title}</h3>
                    <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {e.online_url ? "Online" : e.venue_address || "Location TBA"}
                    </p>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

// Skeleton export retained for potential pending UI hookup.
export function ExploreSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-64 w-full" />
      ))}
    </div>
  );
}
