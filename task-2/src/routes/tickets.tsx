import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Ticket, RotateCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { listMyTickets, cancelRsvp } from "@/server/rsvps.functions";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { formatEventDateTime } from "@/lib/tz";

export const Route = createFileRoute("/tickets")({
  component: () => (
    <RequireAuth>
      <Tickets />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "My tickets — Gather" },
      { name: "description", content: "Your RSVPs and event tickets." },
    ],
  }),
});

type Ticket = Awaited<ReturnType<typeof listMyTickets>>[number];

function Tickets() {
  const { user } = useAuth();
  const [tickets, setTickets] = React.useState<Ticket[] | null>(null);
  const [flipped, setFlipped] = React.useState<Record<string, boolean>>({});
  const prevStatusRef = React.useRef<Map<string, string>>(new Map());

  const refresh = React.useCallback(async () => {
    const t = await listMyTickets();
    // Detect promotions (waitlist -> going)
    const prev = prevStatusRef.current;
    for (const x of t) {
      const before = prev.get(x.rsvp.id);
      if (before === "waitlist" && x.rsvp.status === "going") {
        toast.success(`You're off the waitlist for ${x.event.title}!`);
      }
    }
    prevStatusRef.current = new Map(t.map((x) => [x.rsvp.id, x.rsvp.status] as const));
    setTickets(t);
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  React.useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`my-rsvps-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rsvps", filter: `user_id=eq.${user.id}` },
        () => { refresh(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refresh]);

  const onCancel = async (id: string) => {
    try {
      await cancelRsvp({ data: { rsvpId: id } });
      toast.success("RSVP cancelled");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Cancel failed");
    }
  };

  return (
    <AppShell>
      <PageHeader title="My tickets" description="Your RSVPs and QR codes for upcoming events." />
      <div className="mt-8">
        {tickets === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : tickets.length === 0 ? (
          <EmptyState
            icon={Ticket}
            title="No tickets yet"
            description="When you RSVP to an event, your ticket will land here with a scannable QR code."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tickets.map(({ rsvp, event }) => {
              const isFlipped = !!flipped[rsvp.id];
              return (
                <div
                  key={rsvp.id}
                  className="relative h-96 cursor-pointer [perspective:1000px]"
                  onClick={() => setFlipped((f) => ({ ...f, [rsvp.id]: !f[rsvp.id] }))}
                >
                  <div
                    className={`relative h-full w-full rounded-2xl transition-transform duration-500 [transform-style:preserve-3d] ${
                      isFlipped ? "[transform:rotateY(180deg)]" : ""
                    }`}
                  >
                    {/* Front */}
                    <div className="absolute inset-0 flex flex-col rounded-2xl border border-border bg-card p-5 [backface-visibility:hidden]">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-card-foreground">{event.title}</p>
                          <p className="text-xs text-muted-foreground">{formatEventDateTime(event.starts_at, event.timezone)}</p>
                        </div>
                        {rsvp.status === "waitlist" ? (
                          <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase text-secondary-foreground">
                            Waitlist #{rsvp.position}
                          </span>
                        ) : (
                          <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase text-primary">
                            Going
                          </span>
                        )}
                      </div>
                      <div className="mt-4 flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-background p-3">
                        <div className="rounded-md bg-white p-2">
                          <QRCodeSVG value={rsvp.qr_code} size={128} level="M" />
                        </div>
                        <p className="mt-3 font-mono text-lg tracking-widest">{rsvp.qr_code}</p>
                        <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">Show this code at the door</p>
                      </div>
                      <p className="mt-3 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                        <RotateCw className="h-3 w-3" /> Tap to flip
                      </p>
                    </div>
                    {/* Back */}
                    <div className="absolute inset-0 flex flex-col rounded-2xl border border-border bg-card p-5 [backface-visibility:hidden] [transform:rotateY(180deg)]">
                      <p className="text-sm font-semibold text-card-foreground">{event.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatEventDateTime(event.starts_at, event.timezone)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">until {formatEventDateTime(event.ends_at, event.timezone)}</p>
                      <p className="mt-3 text-xs text-foreground">
                        {event.online_url ? "Online event" : event.venue_address || "Location TBA"}
                      </p>
                      <div className="mt-auto flex gap-2" onClick={(e) => e.stopPropagation()}>
                        <Button asChild variant="outline" size="sm" className="flex-1">
                          <Link to="/e/$slug" params={{ slug: event.slug }}>Open</Link>
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" className="flex-1">Cancel</Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Cancel RSVP?</AlertDialogTitle>
                              <AlertDialogDescription>
                                You can re-RSVP later if there's still space.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep it</AlertDialogCancel>
                              <AlertDialogAction onClick={() => onCancel(rsvp.id)}>Cancel RSVP</AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}
