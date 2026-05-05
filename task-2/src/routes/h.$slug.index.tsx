import * as React from "react";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CalendarDays } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { EmptyState } from "@/components/EmptyState";
import { getPublicHost } from "@/server/public.functions";
import { formatEventDateTime } from "@/lib/tz";

export const Route = createFileRoute("/h/$slug/")({
  loader: async ({ params }) => {
    const r = await getPublicHost({ data: { slug: params.slug } });
    if (!r.host) throw notFound();
    return r;
  },
  head: ({ loaderData }) => {
    const host = loaderData?.host;
    if (!host) return { meta: [{ title: "Host not found" }] };
    const title = `${host.name} — Gather`;
    const desc = host.bio?.slice(0, 160) ?? `Upcoming events from ${host.name} on Gather.`;
    const meta = [
      { title },
      { name: "description", content: desc },
      { property: "og:title", content: host.name },
      { property: "og:description", content: desc },
      { property: "og:type", content: "profile" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: host.name },
      { name: "twitter:description", content: desc },
    ];
    if (host.logo_url) {
      meta.push({ property: "og:image", content: host.logo_url });
      meta.push({ name: "twitter:image", content: host.logo_url });
    }
    return { meta };
  },
  notFoundComponent: () => (
    <AppShell>
      <EmptyState title="Host not found" description="This host doesn't exist or was removed." />
    </AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell>
      <EmptyState title="Couldn't load host" description={error.message} />
    </AppShell>
  ),
  component: HostPage,
});

function EventCard({
  e,
}: {
  e: {
    id: string;
    slug: string;
    title: string;
    starts_at: string;
    timezone: string;
    cover_url: string | null;
    venue_address: string | null;
    online_url: string | null;
  };
}) {
  return (
    <Link to="/e/$slug" params={{ slug: e.slug }}>
      <Card className="overflow-hidden transition hover:border-primary/40 hover:shadow-md">
        {e.cover_url ? (
          <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
            <img src={e.cover_url} alt="" className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="flex aspect-[16/9] w-full items-center justify-center bg-accent text-accent-foreground">
            <CalendarDays className="h-8 w-8" />
          </div>
        )}
        <div className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {formatEventDateTime(e.starts_at, e.timezone)}
          </p>
          <h3 className="mt-1 line-clamp-2 font-semibold text-card-foreground">{e.title}</h3>
          <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">
            {e.online_url ? "Online" : e.venue_address || "Location TBA"}
          </p>
        </div>
      </Card>
    </Link>
  );
}

function HostPage() {
  const { host, upcoming, past } = Route.useLoaderData();
  return (
    <AppShell>
      <header className="flex flex-col items-start gap-5 border-b border-border pb-8 sm:flex-row">
        <Avatar className="h-20 w-20">
          <AvatarImage src={host.logo_url ?? undefined} alt="" />
          <AvatarFallback>{host.name[0]?.toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{host.name}</h1>
          {host.bio && <p className="mt-2 max-w-prose text-sm text-muted-foreground">{host.bio}</p>}
          {host.contact_email && (
            <a className="mt-2 inline-block text-xs text-primary underline" href={`mailto:${host.contact_email}`}>
              {host.contact_email}
            </a>
          )}
        </div>
      </header>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Upcoming events</h2>
        {upcoming.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">No upcoming events yet.</p>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((e: React.ComponentProps<typeof EventCard>["e"]) => (
              <EventCard key={e.id} e={e} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-10">
          <Accordion type="single" collapsible>
            <AccordionItem value="past">
              <AccordionTrigger>Past events ({past.length})</AccordionTrigger>
              <AccordionContent>
                <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
                  {past.map((e: React.ComponentProps<typeof EventCard>["e"]) => (
                    <EventCard key={e.id} e={e} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      )}
    </AppShell>
  );
}
