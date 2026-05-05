import * as React from "react";
import { useNavigate, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Save, Send, EyeOff, Copy, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { NumberStepper } from "@/components/ui/number-stepper";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { slugify, SLUG_RE } from "@/lib/slug";
import { listTimezones, browserTimezone } from "@/lib/tz";
import {
  checkEventSlug,
  upsertEventDraft,
  setEventStatus,
  duplicateEvent,
} from "@/server/events.functions";
import { getMyHostRole } from "@/server/hosts.functions";
import { EmptyState } from "@/components/EmptyState";

type EventState = {
  id?: string;
  host_id: string;
  slug: string;
  title: string;
  description: string;
  cover_url: string | null;
  starts_at: string;
  ends_at: string;
  timezone: string;
  visibility: "public" | "unlisted";
  location_mode: "venue" | "online";
  venue_address: string;
  online_url: string;
  capacity: string;
  is_paid: boolean;
  status: "draft" | "published";
};

function toLocalInput(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

function fromLocalInput(local: string): string {
  if (!local) return "";
  return new Date(local).toISOString();
}

export function EventEditor({
  hostId,
  hostSlug,
  initial,
}: {
  hostId: string;
  hostSlug: string;
  initial?: {
    id: string;
    slug: string;
    title: string;
    description: string | null;
    cover_url: string | null;
    starts_at: string;
    ends_at: string;
    timezone: string;
    visibility: "public" | "unlisted";
    venue_address: string | null;
    online_url: string | null;
    capacity: number | null;
    is_paid: boolean;
    status: "draft" | "published";
  };
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const tzs = React.useMemo(() => listTimezones(), []);
  const [state, setState] = React.useState<EventState>(() => ({
    id: initial?.id,
    host_id: hostId,
    slug: initial?.slug ?? "",
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    cover_url: initial?.cover_url ?? null,
    starts_at: initial?.starts_at ?? "",
    ends_at: initial?.ends_at ?? "",
    timezone: initial?.timezone ?? browserTimezone(),
    visibility: initial?.visibility ?? "public",
    location_mode: initial?.online_url ? "online" : "venue",
    venue_address: initial?.venue_address ?? "",
    online_url: initial?.online_url ?? "",
    capacity: initial?.capacity ? String(initial.capacity) : "",
    is_paid: initial?.is_paid ?? false,
    status: initial?.status ?? "draft",
  }));
  const [slugTouched, setSlugTouched] = React.useState(!!initial);
  const [slugStatus, setSlugStatus] = React.useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [saving, setSaving] = React.useState(false);
  const dirtyRef = React.useRef(false);
  const savingRef = React.useRef(false);
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const [permission, setPermission] = React.useState<"loading" | "allowed" | "denied">("loading");

  React.useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyHostRole({ data: { hostId } })
      .then((r) => {
        if (cancelled) return;
        setPermission(r.role === "host" ? "allowed" : "denied");
      })
      .catch(() => !cancelled && setPermission("denied"));
    return () => {
      cancelled = true;
    };
  }, [user, hostId]);

  React.useEffect(() => {
    if (slugTouched) return;
    update({ slug: slugify(state.title) });
  }, [state.title]);

  React.useEffect(() => {
    if (!state.slug) return setSlugStatus("idle");
    if (!SLUG_RE.test(state.slug)) return setSlugStatus("invalid");
    setSlugStatus("checking");
    const t = setTimeout(async () => {
      const r = await checkEventSlug({ data: { hostId, slug: state.slug, excludeId: state.id } });
      setSlugStatus(r.available ? "ok" : r.reason === "taken" ? "taken" : "invalid");
    }, 350);
    return () => clearTimeout(t);
  }, [state.slug, hostId, state.id]);

  function update(patch: Partial<EventState>) {
    dirtyRef.current = true;
    setState((s) => ({ ...s, ...patch }));
  }

  React.useEffect(() => {
    const id = setInterval(() => {
      if (!dirtyRef.current) return;
      void saveDraft(true);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  async function saveDraft(silent = false) {
    const s = stateRef.current;
    if (permission !== "allowed") {
      if (!silent) toast.error("You do not have permission to create events for this host.");
      return null;
    }
    if (!s.title.trim() || !s.slug.trim() || !s.starts_at || !s.ends_at || slugStatus === "taken" || slugStatus === "invalid") {
      if (!silent) toast.error("Add title, slug, and dates first.");
      return null;
    }
    if (savingRef.current) return null;
    savingRef.current = true;
    setSaving(true);
    try {
      const row = await upsertEventDraft({
        data: {
          id: s.id,
          host_id: s.host_id,
          slug: s.slug,
          title: s.title,
          description: s.description || null,
          cover_url: s.cover_url,
          starts_at: s.starts_at,
          ends_at: s.ends_at,
          timezone: s.timezone,
          visibility: s.visibility,
          venue_address: s.location_mode === "venue" ? s.venue_address || null : null,
          online_url: s.location_mode === "online" ? s.online_url || null : null,
          capacity: s.capacity ? parseInt(s.capacity, 10) : null,
          is_paid: s.is_paid,
        },
      });
      dirtyRef.current = false;
      setSavedAt(new Date());
      if (!s.id && row?.id) {
        setState((cur) => ({ ...cur, id: row.id }));
        window.history.replaceState({}, "", `/events/${row.id}/edit`);
      }
      if (!silent) toast.success("Saved");
      return row;
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Save failed");
      return null;
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  async function publish() {
    const row = await saveDraft(true);
    const id = row?.id ?? state.id;
    if (!id) return toast.error("Couldn't save before publishing.");
    try {
      await setEventStatus({ data: { id, status: "published" } });
      setState((s) => ({ ...s, status: "published" }));
      toast.success("Published");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function unpublish() {
    if (!state.id) return;
    try {
      await setEventStatus({ data: { id: state.id, status: "draft" } });
      setState((s) => ({ ...s, status: "draft" }));
      toast.success("Unpublished");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  async function onDuplicate() {
    if (!state.id) return;
    const row = await duplicateEvent({ data: { id: state.id } });
    if (row?.id) {
      toast.success("Duplicated");
      navigate({ to: "/events/$id/edit", params: { id: row.id } });
    }
  }

  async function onCover(file: File) {
    if (!user) return;
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("event-covers").upload(path, file);
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("event-covers").getPublicUrl(path);
    update({ cover_url: data.publicUrl });
  }

  if (permission === "loading") {
    return <EmptyState title="Loading…" />;
  }
  if (permission === "denied") {
    return (
      <EmptyState
        title="403 — Permission required"
        description="You do not have permission to create or edit events for this host. Ask a host owner to invite you."
        action={
          <Button asChild variant="outline">
            <Link to="/my-events">Back to My events</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-10 pb-32">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
        <Badge variant={state.status === "published" ? "default" : "secondary"}>{state.status}</Badge>
        <span className="text-xs text-muted-foreground">
          {saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : "Not saved yet"}
        </span>
        <span className="ml-auto text-xs text-muted-foreground">
          Auto-saves every 5 seconds while editing.
        </span>
      </div>

      <section id="cover">
        <h2 className="text-lg font-semibold">Cover image</h2>
        <p className="text-sm text-muted-foreground">A 16:9 photo works best.</p>
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-muted">
          {state.cover_url ? (
            <img src={state.cover_url} alt="" className="aspect-[16/9] w-full object-cover" />
          ) : (
            <div className="flex aspect-[16/9] w-full items-center justify-center text-muted-foreground">
              No cover yet
            </div>
          )}
        </div>
        <Input
          type="file"
          accept="image/*"
          className="mt-3 max-w-md"
          onChange={(e) => e.target.files?.[0] && onCover(e.target.files[0])}
        />
      </section>

      <section id="basics" className="space-y-4">
        <h2 className="text-lg font-semibold">Basics</h2>
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input value={state.title} onChange={(e) => update({ title: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>URL slug</Label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">/e/</span>
            <Input
              value={state.slug}
              onChange={(e) => {
                setSlugTouched(true);
                update({ slug: e.target.value });
              }}
            />
          </div>
          <p className="text-xs">
            {slugStatus === "checking" && <span className="text-muted-foreground">Checking…</span>}
            {slugStatus === "ok" && <span className="text-primary">Available ✓</span>}
            {slugStatus === "taken" && <span className="text-destructive">Slug taken on this host</span>}
            {slugStatus === "invalid" && <span className="text-destructive">Lowercase letters, numbers, dashes</span>}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Textarea
            value={state.description}
            onChange={(e) => update({ description: e.target.value })}
            rows={6}
            placeholder="Markdown is supported."
          />
        </div>
      </section>

      <section id="when" className="space-y-4">
        <h2 className="text-lg font-semibold">When</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Starts</Label>
            <DateInput
              type="datetime-local"
              value={toLocalInput(state.starts_at)}
              onChange={(e) => update({ starts_at: fromLocalInput(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ends</Label>
            <DateInput
              type="datetime-local"
              value={toLocalInput(state.ends_at)}
              onChange={(e) => update({ ends_at: fromLocalInput(e.target.value) })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Timezone</Label>
          <Select value={state.timezone} onValueChange={(v) => update({ timezone: v })}>
            <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
            <SelectContent className="max-h-72">
              {tzs.map((tz) => <SelectItem key={tz} value={tz}>{tz}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Times shown to attendees use this timezone, not theirs.
          </p>
        </div>
      </section>

      <section id="where" className="space-y-4">
        <h2 className="text-lg font-semibold">Where</h2>
        <RadioGroup
          value={state.location_mode}
          onValueChange={(v) => update({ location_mode: v as "venue" | "online" })}
          className="flex gap-6"
        >
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="venue" /> In-person venue
          </label>
          <label className="flex items-center gap-2 text-sm">
            <RadioGroupItem value="online" /> Online
          </label>
        </RadioGroup>
        {state.location_mode === "venue" ? (
          <div className="space-y-1.5">
            <Label>Venue address</Label>
            <Input value={state.venue_address} onChange={(e) => update({ venue_address: e.target.value })} />
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label>Online URL (revealed after RSVP)</Label>
            <Input value={state.online_url} onChange={(e) => update({ online_url: e.target.value })} placeholder="https://meet.example.com/..." />
          </div>
        )}
      </section>

      <section id="settings" className="space-y-4">
        <h2 className="text-lg font-semibold">Settings</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Visibility</Label>
            <Select value={state.visibility} onValueChange={(v) => update({ visibility: v as "public" | "unlisted" })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="public">Public (in search & host page)</SelectItem>
                <SelectItem value="unlisted">Unlisted (link only)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Capacity (optional)</Label>
            <NumberStepper
              min={1}
              value={state.capacity}
              onChange={(v) => update({ capacity: v })}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Pricing</Label>
          <TooltipProvider>
            <div className="inline-flex items-center gap-2 rounded-md border border-border p-1">
              <button
                type="button"
                className={`rounded px-3 py-1 text-sm ${!state.is_paid ? "bg-primary text-primary-foreground" : ""}`}
                onClick={() => update({ is_paid: false })}
              >
                Free
              </button>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled
                    className="cursor-not-allowed rounded px-3 py-1 text-sm text-muted-foreground inline-flex items-center gap-1"
                  >
                    Paid <Info className="h-3 w-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Paid ticketing is coming soon.</TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <Button variant="outline" asChild size="sm">
            <Link to="/h/$slug" params={{ slug: hostSlug }}>← Back</Link>
          </Button>
          <span className="ml-2 text-xs text-muted-foreground">
            {saving ? "Saving…" : savedAt ? `Saved ${savedAt.toLocaleTimeString()}` : "Unsaved"}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => void saveDraft(false)}>
              <Save className="mr-2 h-4 w-4" />Save draft
            </Button>
            {state.id && (
              <Button variant="ghost" onClick={onDuplicate}>
                <Copy className="mr-2 h-4 w-4" />Duplicate
              </Button>
            )}
            {state.status === "published" ? (
              <Button variant="outline" onClick={unpublish}>
                <EyeOff className="mr-2 h-4 w-4" />Unpublish
              </Button>
            ) : (
              <Button onClick={publish}>
                <Send className="mr-2 h-4 w-4" />Publish
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HostHeader({ host }: { host: { name: string; slug: string; logo_url: string | null } }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <Avatar className="h-9 w-9">
        <AvatarImage src={host.logo_url ?? undefined} alt="" />
        <AvatarFallback>{host.name[0]?.toUpperCase()}</AvatarFallback>
      </Avatar>
      <div className="text-sm">
        <Link to="/h/$slug" params={{ slug: host.slug }} className="font-medium hover:underline">
          {host.name}
        </Link>
      </div>
    </div>
  );
}
