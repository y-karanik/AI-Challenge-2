import * as React from "react";
import { createFileRoute, useNavigate, notFound } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { EmptyState } from "@/components/EmptyState";
import { EventEditor, HostHeader } from "@/components/EventEditor";
import { useAuth } from "@/lib/auth";
import { getPublicHost } from "@/server/public.functions";
import { getMyHostRole } from "@/server/hosts.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/h/$slug/events/new")({
  loader: async ({ params }) => {
    const r = await getPublicHost({ data: { slug: params.slug } });
    if (!r.host) throw notFound();
    return r;
  },
  notFoundComponent: () => (
    <AppShell><EmptyState title="Host not found" /></AppShell>
  ),
  errorComponent: ({ error }) => (
    <AppShell><EmptyState title="Error" description={error.message} /></AppShell>
  ),
  component: () => (
    <RequireAuth>
      <NewEvent />
    </RequireAuth>
  ),
  head: () => ({ meta: [{ title: "New event — Gather" }] }),
});

function NewEvent() {
  const { host } = Route.useLoaderData();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = React.useState<"host" | "checker" | null | "loading">("loading");
  React.useEffect(() => {
    if (!user) return;
    getMyHostRole({ data: { hostId: host.id } }).then((r) => setRole(r.role));
  }, [user, host.id]);

  if (role === "loading") return <AppShell><EmptyState title="Loading…" /></AppShell>;
  if (role !== "host") {
    return (
      <AppShell>
        <EmptyState
          title="Access denied"
          description="Only hosts can create events for this organization."
          action={<Button onClick={() => navigate({ to: "/h/$slug", params: { slug: host.slug } })}>Back</Button>}
        />
      </AppShell>
    );
  }

  return (
    <AppShell>
      <HostHeader host={host} />
      <PageHeader title="New event" description="Fill in the details. We auto-save your draft as you go." />
      <div className="mt-8">
        <EventEditor hostId={host.id} hostSlug={host.slug} />
      </div>
    </AppShell>
  );
}
