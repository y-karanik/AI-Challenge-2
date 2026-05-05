import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarHeart, Ticket, Users } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Home,
  head: () => ({
    meta: [
      { title: "Gather — host and discover community events" },
      { name: "description", content: "A lightweight platform for free community events: RSVPs, check-ins, photos, feedback." },
    ],
  }),
});

function Home() {
  return (
    <AppShell>
      <section className="grid gap-10 py-6 md:grid-cols-2 md:items-center md:py-12">
        <div>
          <p className="text-sm font-medium uppercase tracking-wider text-primary">Community-first</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Gather your people. Skip the spreadsheet.
          </h1>
          <p className="mt-4 max-w-prose text-base text-muted-foreground">
            Host free events, share a clean public page, collect RSVPs with QR-coded tickets, and run smooth check-ins —
            all in one place.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/explore">Browse events</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/become-a-host">Become a host</Link>
            </Button>
          </div>
        </div>
        <ul className="grid gap-4 sm:grid-cols-2">
          {[
            { icon: CalendarHeart, title: "Beautiful event pages", desc: "Cover image, schedule, location, capacity." },
            { icon: Ticket, title: "QR-coded tickets", desc: "Attendees keep tickets, hosts scan in seconds." },
            { icon: Users, title: "Co-hosts & checkers", desc: "Invite your team with the right permissions." },
            { icon: CalendarHeart, title: "Photos & feedback", desc: "Capture the night, learn for next time." },
          ].map(({ icon: Icon, title, desc }) => (
            <li key={title} className="rounded-xl border border-border bg-card p-5">
              <Icon className="h-6 w-6 text-primary" aria-hidden />
              <h3 className="mt-3 font-medium text-card-foreground">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
