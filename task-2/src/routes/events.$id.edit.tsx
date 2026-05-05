import * as React from "react";
import { createFileRoute, useNavigate, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { EmptyState } from "@/components/EmptyState";
import { EventEditor, HostHeader } from "@/components/EventEditor";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { getEditableEvent, getHostForEvent } from "@/server/events.functions";
import { getMyHostRole } from "@/server/hosts.functions";

export const Route = createFileRoute("/events/$id/edit")({
  loader: async ({ params }) => {
    const host = await getHostForEvent({ data: { id: params.id } });
    if (!host) throw notFound();
    return { host };
  },
  notFoundComponent: () => <AppShell><EmptyState title="Event not found" /></AppShell>,
  errorComponent: ({ error }) => <AppShell><EmptyState title="Error" description={error.message} /></AppShell>,
  component: () => (
    <RequireAuth>
      <EditEvent />
    </RequireAuth>
  ),
  head: () => ({ meta: [{ title: "Edit event — Gather" }] }),
});

function EditEvent() {
  const { id } = Route.useParams();
  const { host } = Route.useLoaderData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = React.useState<"host" | "checker" | null | "loading">("loading");
  const [data, setData] = React.useState<Awaited<ReturnType<typeof getEditableEvent>> | null>(null);

  React.useEffect(() => {
    if (!user) return;
    (async () => {
      const r = await getMyHostRole({ data: { hostId: host.id } });
      setRole(r.role);
      if (r.role === "host") {
        const ev = await getEditableEvent({ data: { id } });
        setData(ev);
      }
    })();
  }, [user, host.id, id]);

  if (role === "loading") return <AppShell><EmptyState title="Loading…" /></AppShell>;
  if (role !== "host") {
    return (
      <AppShell>
        <EmptyState
          title="Access denied"
          description="Only hosts can edit events."
          action={<Button onClick={() => navigate({ to: "/h/$slug", params: { slug: host.slug } })}>Back</Button>}
        />
      </AppShell>
    );
  }
  if (!data) return <AppShell><EmptyState title="Loading event…" /></AppShell>;

  return (
    <AppShell>
      <HostHeader host={host} />
      <PageHeader title={`Edit: ${data.title || "Untitled event"}`} />
      <div className="mt-8">
        <EventEditor
          hostId={host.id}
          hostSlug={host.slug}
          initial={{
            id: data.id,
            slug: data.slug,
            title: data.title,
            description: data.description,
            cover_url: data.cover_url,
            starts_at: data.starts_at,
            ends_at: data.ends_at,
            timezone: data.timezone,
            visibility: data.visibility as "public" | "unlisted",
            venue_address: data.venue_address,
            online_url: data.online_url,
            capacity: data.capacity,
            is_paid: data.is_paid,
            status: data.status as "draft" | "published",
          }}
        />
      </div>
    </AppShell>
  );
}
