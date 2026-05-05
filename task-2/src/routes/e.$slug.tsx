import * as React from "react";
import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { CalendarX, MapPin, Globe, Users, Calendar, Download } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { getPublicEvent } from "@/server/public.functions";
import { createRsvp, cancelRsvp } from "@/server/rsvps.functions";
import { formatEventDateTime } from "@/lib/tz";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { buildICS, downloadICS, googleCalendarUrl } from "@/lib/ics";
import { FeedbackSection } from "@/components/FeedbackSection";
import { GallerySection } from "@/components/GallerySection";
import { ReportButton } from "@/components/ReportButton";

const SearchSchema = z.object({ rsvp: z.string().optional() });

export const Route = createFileRoute("/e/$slug")({
  validateSearch: (s) => SearchSchema.parse(s),
  loader: async ({ params }) => {
    const r = await getPublicEvent({ data: { slug: params.slug } });
    if (!r.event) throw notFound();
    return r;
  },
  head: ({ loaderData }) => {
    const e = loaderData?.event;
    if (!e) return { meta: [{ title: "Event not found" }] };
    const desc = (e.description ?? "").slice(0, 160) || `Join ${e.title} on Gather.`;
    const meta: Array<{ title?: string; name?: string; property?: string; content?: string }> = [
      { title: `${e.title} — Gather` },
      { name: "description", content: desc },
      { property: "og:title", content: e.title },
      { property: "og:description", content: desc },
      { property: "og:type", content: "event" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: e.title },
      { name: "twitter:description", content: desc },
    ];
    if (e.cover_url) {
      meta.push({ property: "og:image", content: e.cover_url });
      meta.push({ name: "twitter:image", content: e.cover_url });
    }
    return { meta };
  },
  notFoundComponent: () => (
    <AppShell><EmptyState icon={CalendarX} title="Event not found" description="This event was removed or isn't published yet." /></AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell><EmptyState title="Couldn't load event" description={error.message} /></AppShell>
  ),
  component: EventPage,
});

type RsvpRow = { id: string; status: string; position: number | null; qr_code: string };

function EventPage() {
  const { event, host } = Route.useLoaderData();
  const { rsvp: rsvpFlag } = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useAuth();
  const ended = new Date(event.ends_at) < new Date();
  const [myRsvp, setMyRsvp] = React.useState<RsvpRow | null | "loading">("loading");
  const [busy, setBusy] = React.useState(false);
  const autoTriggeredRef = React.useRef(false);

  const refresh = React.useCallback(async () => {
    if (!user) { setMyRsvp(null); return; }
    const { data } = await supabase
      .from("rsvps")
      .select("id, status, position, qr_code")
      .eq("event_id", event.id)
      .eq("user_id", user.id)
      .neq("status", "cancelled")
      .maybeSingle();
    setMyRsvp((data as RsvpRow | null) ?? null);
  }, [user, event.id]);

  React.useEffect(() => { refresh(); }, [refresh]);

  // Realtime: listen for changes on this user's RSVPs for this event
  React.useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`rsvp-${event.id}-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rsvps", filter: `event_id=eq.${event.id}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { user_id?: string } | undefined;
          if (row?.user_id === user.id) refresh();
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, event.id, refresh]);

  const onRsvp = React.useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const row = await createRsvp({ data: { eventId: event.id } });
      setMyRsvp({ id: row.id, status: row.status, position: row.position, qr_code: row.qr_code });
      toast.success(row.status === "going" ? "You're going!" : `Added to waitlist (#${row.position})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "RSVP failed");
    } finally {
      setBusy(false);
    }
  }, [busy, event.id]);

  const onCancel = async () => {
    if (!myRsvp || myRsvp === "loading") return;
    setBusy(true);
    try {
      await cancelRsvp({ data: { rsvpId: myRsvp.id } });
      setMyRsvp(null);
      toast.success("RSVP cancelled");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  };

  // Auto-trigger after sign-in redirect
  React.useEffect(() => {
    if (autoTriggeredRef.current) return;
    if (rsvpFlag !== "1") return;
    if (!user || ended) return;
    if (myRsvp === "loading") return;
    if (myRsvp) {
      // Already RSVP'd; just clear flag.
      autoTriggeredRef.current = true;
      navigate({ to: "/e/$slug", params: { slug: event.slug }, search: {} as never, replace: true });
      return;
    }
    autoTriggeredRef.current = true;
    onRsvp().finally(() => {
      navigate({ to: "/e/$slug", params: { slug: event.slug }, search: {} as never, replace: true });
    });
  }, [rsvpFlag, user, ended, myRsvp, event.slug, navigate, onRsvp]);

  const ics = React.useMemo(
    () =>
      buildICS({
        uid: event.id,
        title: event.title,
        description: event.description,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        location: event.online_url || event.venue_address,
      }),
    [event]
  );
  const gcalUrl = React.useMemo(
    () =>
      googleCalendarUrl({
        uid: event.id,
        title: event.title,
        description: event.description,
        starts_at: event.starts_at,
        ends_at: event.ends_at,
        location: event.online_url || event.venue_address,
      }),
    [event]
  );

  return (
    <AppShell>
      <article className="space-y-8">
        {event.cover_url ? (
          <div className="overflow-hidden rounded-2xl border border-border bg-muted">
            <img src={event.cover_url} alt="" className="aspect-[16/9] w-full object-cover" />
          </div>
        ) : null}

        <section className="grid items-start gap-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            <header className="space-y-4">
              {host && (
                <Link to="/h/$slug" params={{ slug: host.slug }} className="inline-flex items-center gap-2">
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={host.logo_url ?? undefined} alt="" />
                    <AvatarFallback>{host.name[0]?.toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground hover:text-foreground">{host.name}</span>
                </Link>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{event.title}</h1>
                {ended && <Badge variant="destructive">Ended</Badge>}
                {event.visibility === "unlisted" && <Badge variant="secondary">Unlisted</Badge>}
              </div>
              <p className="text-base font-medium text-foreground">{formatEventDateTime(event.starts_at, event.timezone)}</p>
              <p className="text-sm text-muted-foreground">until {formatEventDateTime(event.ends_at, event.timezone)}</p>
            </header>
            <h2 className="text-lg font-semibold">About</h2>
            <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm text-foreground">
              {event.description || <span className="text-muted-foreground">No description provided.</span>}
            </div>
          </div>
          <aside className="space-y-4 rounded-xl border border-border bg-card p-5">
            <div>
              <h3 className="text-sm font-semibold">Location</h3>
              {event.online_url ? (
                <p className="mt-1 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="h-4 w-4" />
                  {myRsvp && myRsvp !== "loading" && myRsvp.status !== "cancelled" ? (
                    <a className="text-primary underline" href={event.online_url} target="_blank" rel="noreferrer">Join online</a>
                  ) : (
                    <span>Online — link revealed after RSVP</span>
                  )}
                </p>
              ) : event.venue_address ? (
                <p className="mt-1 inline-flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <a className="text-primary underline" target="_blank" rel="noreferrer"
                    href={`https://maps.google.com/?q=${encodeURIComponent(event.venue_address)}`}>
                    {event.venue_address}
                  </a>
                </p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">Location TBA</p>
              )}
            </div>

            {event.capacity && (
              <div>
                <h3 className="text-sm font-semibold">Capacity</h3>
                <p className="mt-1 inline-flex items-center gap-2 text-sm text-muted-foreground">
                  <Users className="h-4 w-4" /> {event.capacity}
                </p>
              </div>
            )}

            <div>
              <h3 className="text-sm font-semibold">RSVP</h3>
              <div className="mt-2 space-y-2">
                {ended ? (
                  <Button disabled className="w-full">Ended</Button>
                ) : !user ? (
                  <Button asChild className="w-full">
                    <Link to="/sign-in" search={{ redirect: `/e/${event.slug}?rsvp=1` } as never}>Sign in to RSVP</Link>
                  </Button>
                ) : myRsvp === "loading" ? (
                  <Button disabled className="w-full">Loading…</Button>
                ) : myRsvp ? (
                  <>
                    {myRsvp.status === "waitlist" ? (
                      <Button disabled className="w-full">On waitlist (#{myRsvp.position ?? "?"})</Button>
                    ) : (
                      <Button disabled className="w-full">You're going!</Button>
                    )}
                    <div className="flex flex-col items-center rounded-md border border-border bg-background p-3">
                      <div className="rounded-md bg-white p-2">
                        <QRCodeSVG value={myRsvp.qr_code} size={140} level="M" />
                      </div>
                      <p className="mt-3 font-mono text-lg tracking-widest">{myRsvp.qr_code}</p>
                      <p className="mt-1 text-[10px] uppercase text-muted-foreground">Your code</p>
                    </div>
                    <Button variant="outline" size="sm" className="w-full" onClick={onCancel} disabled={busy}>
                      Cancel RSVP
                    </Button>
                  </>
                ) : (
                  <Button className="w-full" onClick={onRsvp} disabled={busy}>
                    {busy ? "Reserving…" : "RSVP"}
                  </Button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Add to calendar</h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={() => downloadICS(`${event.slug}.ics`, ics)}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> .ics
                </Button>
                <Button variant="outline" size="sm" className="flex-1" asChild>
                  <a href={gcalUrl} target="_blank" rel="noreferrer">
                    <Calendar className="mr-1.5 h-3.5 w-3.5" /> Google
                  </a>
                </Button>
              </div>
            </div>
          </aside>
        </section>

        <FeedbackSection event={{ id: event.id, ends_at: event.ends_at }} />
        <GallerySection event={{ id: event.id, ends_at: event.ends_at }} />

        <div className="flex justify-end">
          <ReportButton targetType="event" targetId={event.id} />
        </div>
      </article>
    </AppShell>
  );
}
