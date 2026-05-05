import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { Button } from "@/components/ui/button";
import { redeemInvite } from "@/server/hosts.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/join/$token")({
  component: () => (
    <RequireAuth>
      <Join />
    </RequireAuth>
  ),
  head: () => ({ meta: [{ title: "Join host — Gather" }] }),
});

function Join() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const [state, setState] = React.useState<"idle" | "joining" | "ok" | "error">("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [hostSlug, setHostSlug] = React.useState<string | null>(null);

  const onJoin = async () => {
    setState("joining");
    try {
      const member = await redeemInvite({ data: { token } });
      const { data } = await supabase.from("hosts").select("slug").eq("id", member.host_id).maybeSingle();
      setHostSlug(data?.slug ?? null);
      setState("ok");
      toast.success(`Joined as ${member.role}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setState("error");
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-md">
        <PageHeader title="Join host team" description="Accept your invite to start managing or checking in attendees." />
        <div className="mt-8 space-y-4">
          {state === "idle" && (
            <Button size="lg" className="w-full" onClick={onJoin}>Accept invite</Button>
          )}
          {state === "joining" && <p className="text-sm text-muted-foreground">Joining…</p>}
          {state === "ok" && (
            <div className="rounded-lg border border-border bg-card p-5 text-sm">
              <p className="font-medium">You're in!</p>
              {hostSlug && (
                <Button className="mt-4" onClick={() => navigate({ to: "/h/$slug", params: { slug: hostSlug } })}>
                  Go to host page
                </Button>
              )}
            </div>
          )}
          {state === "error" && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-5 text-sm">
              <p className="font-medium text-destructive">Invite couldn't be redeemed</p>
              <p className="mt-1 text-muted-foreground">{error}</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
