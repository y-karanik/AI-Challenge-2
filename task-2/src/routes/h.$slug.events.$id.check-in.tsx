import * as React from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Undo2, ScanLine, Info, QrCode, UserCheck, Clock, Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { PageHeader } from "@/components/PageHeader";
import { RequireAuth } from "@/components/RequireAuth";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { checkInByCode, undoCheckIn, getCheckInContext } from "@/server/checkin.functions";

export const Route = createFileRoute("/h/$slug/events/$id/check-in")({
  component: () => <RequireAuth><CheckInPage /></RequireAuth>,
  head: () => ({ meta: [{ title: "Check-in — Gather" }] }),
});

type Result =
  | { kind: "ok"; name: string; rsvpId: string }
  | { kind: "already"; name: string; at: string }
  | { kind: "not_found" }
  | { kind: "cancelled"; name: string };

type Counters = { going: number; checked_in: number };

function CheckInPage() {
  const { slug, id } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [ctx, setCtx] = React.useState<{ event: { id: string; title: string }; role: "host" | "checker" } | null | "forbidden" | "loading">("loading");
  const [code, setCode] = React.useState("");
  const [result, setResult] = React.useState<Result | null>(null);
  const [counts, setCounts] = React.useState<Counters>({ going: 0, checked_in: 0 });
  const undoStack = React.useRef<string[]>([]); // session-local rsvp ids
  const inputRef = React.useRef<HTMLInputElement>(null);
  const audioRef = React.useRef<AudioContext | null>(null);

  React.useEffect(() => {
    if (loading || !user) return;
    getCheckInContext({ data: { hostSlug: slug, eventId: id } })
      .then((r) => setCtx({ event: r.event, role: r.role }))
      .catch(() => setCtx("forbidden"));
  }, [loading, user, slug, id]);

  const refreshCounts = React.useCallback(async () => {
    const { data: rows } = await supabase
      .from("rsvps")
      .select("status, checked_in_at")
      .eq("event_id", id);
    let g = 0, ci = 0;
    for (const r of rows ?? []) {
      if (r.status === "going") g++;
      if (r.checked_in_at) ci++;
    }
    setCounts({ going: g, checked_in: ci });
  }, [id]);

  React.useEffect(() => {
    if (!ctx || ctx === "loading" || ctx === "forbidden") return;
    void refreshCounts();
    const ch = supabase
      .channel(`checkin-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rsvps", filter: `event_id=eq.${id}` }, () => {
        void refreshCounts();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [ctx, id, refreshCounts]);

  React.useEffect(() => {
    if (ctx && ctx !== "loading" && ctx !== "forbidden") inputRef.current?.focus();
  }, [ctx]);

  const beep = (ok: boolean) => {
    try {
      audioRef.current ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const ctxA = audioRef.current;
      const osc = ctxA.createOscillator();
      const gain = ctxA.createGain();
      osc.frequency.value = ok ? 880 : 220;
      osc.connect(gain); gain.connect(ctxA.destination);
      gain.gain.setValueAtTime(0.1, ctxA.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctxA.currentTime + 0.18);
      osc.start(); osc.stop(ctxA.currentTime + 0.2);
    } catch { /* ignore */ }
  };

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const c = code.trim();
    if (!c) return;
    setCode("");
    try {
      const r = await checkInByCode({ data: { eventId: id, code: c } });
      if (r.outcome === "ok") {
        beep(true);
        navigator.vibrate?.(50);
        if (r.rsvp_id) undoStack.current.push(r.rsvp_id);
        setResult({ kind: "ok", name: r.display_name ?? "Guest", rsvpId: r.rsvp_id! });
      } else if (r.outcome === "already") {
        beep(false);
        const at = r.checked_in_at ? new Date(r.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        setResult({ kind: "already", name: r.display_name ?? "Guest", at });
      } else if (r.outcome === "cancelled") {
        beep(false);
        setResult({ kind: "cancelled", name: r.display_name ?? "Guest" });
      } else {
        beep(false);
        setResult({ kind: "not_found" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Check-in failed");
    } finally {
      inputRef.current?.focus();
      window.setTimeout(() => setResult(null), 3000);
    }
  };

  const onUndo = async () => {
    const last = undoStack.current.pop();
    if (!last) return toast.message("Nothing to undo");
    try {
      await undoCheckIn({ data: { rsvpId: last } });
      toast.success("Undone");
      void refreshCounts();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Undo failed");
    }
  };

  if (ctx === "loading" || ctx === null) return <AppShell><EmptyState title="Loading…" /></AppShell>;
  if (ctx === "forbidden") {
    return (
      <AppShell>
        <EmptyState title="Access denied" description="Only host members and checkers can scan codes."
          action={<Button onClick={() => navigate({ to: "/h/$slug", params: { slug } })}>Back</Button>}
        />
      </AppShell>
    );
  }

  const remaining = Math.max(counts.going - counts.checked_in, 0);

  return (
    <AppShell>
      <PageHeader
        title={`Check-in: ${ctx.event.title}`}
        description="Scan or type the attendee code."
        actions={ctx.role === "host" ? (
          <Button asChild variant="outline" size="sm">
            <Link to="/h/$slug/dashboard" params={{ slug }}>Dashboard</Link>
          </Button>
        ) : null}
      />

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Going</p>
            <p className="mt-1 text-2xl font-semibold">{counts.going}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ScanLine className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Checked-in</p>
            <p className="mt-1 text-2xl font-semibold">{counts.checked_in}</p>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
            <Clock className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase text-muted-foreground">Remaining</p>
            <p className="mt-1 text-2xl font-semibold">{remaining}</p>
          </div>
        </Card>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Check in attendee</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Tab strip */}
            <div role="tablist" aria-label="Check-in method" className="grid grid-cols-2 border-b border-border">
              <button
                type="button"
                role="tab"
                aria-selected="true"
                className="border-b-2 border-primary py-3 text-sm font-medium text-foreground"
              >
                Enter code
              </button>
              <button
                type="button"
                role="tab"
                aria-selected="false"
                aria-disabled="true"
                disabled
                tabIndex={-1}
                className="flex items-center justify-center gap-2 border-b-2 border-transparent py-3 text-sm font-medium text-muted-foreground opacity-60 cursor-not-allowed"
              >
                Scan code
                <Badge variant="secondary" className="text-[10px] uppercase">Coming soon</Badge>
              </button>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <label htmlFor="code" className="block text-sm font-medium">Attendee code</label>
              <Input
                id="code"
                ref={inputRef}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder="Enter or scan code"
                className="font-mono text-lg tracking-widest"
                autoFocus
              />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={onUndo}><Undo2 className="mr-1 h-4 w-4" />Undo last</Button>
                <Button type="submit"><ScanLine className="mr-1 h-4 w-4" />Check in</Button>
              </div>
            </form>

            {result && (
              <div className={
                "rounded-md border p-4 text-center font-medium " +
                (result.kind === "ok" ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-300"
                  : result.kind === "already" ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300"
                  : "border-border bg-muted text-muted-foreground")
              }>
                {result.kind === "ok" && <p>✓ Checked in: {result.name}</p>}
                {result.kind === "already" && <p>Already checked in at {result.at}</p>}
                {result.kind === "cancelled" && <p>{result.name} — RSVP cancelled</p>}
                {result.kind === "not_found" && <p>Code not found</p>}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Check-in tips</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-600 dark:text-green-400">
                  <QrCode className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Find the code</p>
                  <p className="text-sm text-muted-foreground">Ask the attendee to show their QR code or 8-character code.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <UserCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Check in</p>
                  <p className="text-sm text-muted-foreground">Enter the code or scan it to mark them as checked-in.</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Track progress</p>
                  <p className="text-sm text-muted-foreground">Monitor check-ins in real time above.</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-start gap-3 p-4">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Megaphone className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-medium">Mobile scanning is coming soon</p>
                <p className="text-sm text-muted-foreground">Use your phone to scan QR codes directly. Stay tuned!</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Card className="mt-6">
        <CardContent className="flex items-start gap-3 p-4">
          <Info className="mt-0.5 h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-medium">Having trouble?</p>
            <p className="text-sm text-muted-foreground">You can undo the last check-in if something went wrong.</p>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
