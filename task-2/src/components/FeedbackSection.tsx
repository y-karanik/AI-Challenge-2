import * as React from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { submitFeedback, getMyFeedback, listEventFeedback, getMyEventEligibility } from "@/server/feedback.functions";

function Stars({ value, onChange, size = 24, readonly = false }: { value: number; onChange?: (v: number) => void; size?: number; readonly?: boolean }) {
  const [hover, setHover] = React.useState(0);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = (hover || value) >= n;
        return (
          <button
            type="button"
            key={n}
            disabled={readonly}
            onClick={() => onChange?.(n)}
            onMouseEnter={() => !readonly && setHover(n)}
            onMouseLeave={() => !readonly && setHover(0)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className={readonly ? "cursor-default" : "cursor-pointer"}
          >
            <Star
              style={{ width: size, height: size }}
              className={filled ? "fill-primary text-primary" : "text-muted-foreground"}
            />
          </button>
        );
      })}
    </div>
  );
}

export function FeedbackSection({ event }: { event: { id: string; ends_at: string } }) {
  const ended = new Date(event.ends_at) < new Date();
  const { user } = useAuth();
  const [eligible, setEligible] = React.useState<boolean | null>(null);
  const [mine, setMine] = React.useState<{ id: string; rating: number; comment: string | null } | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [rating, setRating] = React.useState(5);
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [list, setList] = React.useState<Awaited<ReturnType<typeof listEventFeedback>>>({ avg: 0, count: 0, items: [] });

  const reloadList = React.useCallback(async () => {
    if (!ended) return;
    const r = await listEventFeedback({ data: { eventId: event.id } });
    setList(r);
  }, [ended, event.id]);

  React.useEffect(() => { void reloadList(); }, [reloadList]);

  React.useEffect(() => {
    if (!user || !ended) { setEligible(false); return; }
    (async () => {
      const e = await getMyEventEligibility({ data: { eventId: event.id } });
      setEligible(!!e.rsvp && e.rsvp.status === "going");
      const m = await getMyFeedback({ data: { eventId: event.id } });
      if (m) {
        setMine(m);
        setRating(m.rating);
        setComment(m.comment ?? "");
      }
    })();
  }, [user, ended, event.id]);

  const onSubmit = async () => {
    setBusy(true);
    try {
      await submitFeedback({ data: { eventId: event.id, rating, comment: comment || null } });
      toast.success(mine ? "Feedback updated" : "Thanks for your feedback");
      const m = await getMyFeedback({ data: { eventId: event.id } });
      setMine(m);
      setEditing(false);
      void reloadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Feedback</h2>
        {ended && list.count > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Stars value={Math.round(list.avg)} readonly size={16} />
            <span>{list.avg.toFixed(1)} · {list.count} review{list.count === 1 ? "" : "s"}</span>
          </div>
        )}
      </div>

      {!ended ? (
        <p className="text-sm text-muted-foreground">Available after the event ends.</p>
      ) : !user ? (
        <p className="text-sm text-muted-foreground">Sign in to leave feedback.</p>
      ) : eligible === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !eligible ? (
        <p className="text-sm text-muted-foreground">Only attendees with a confirmed RSVP can leave feedback.</p>
      ) : mine && !editing ? (
        <div className="space-y-2 rounded-md border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <Stars value={mine.rating} readonly size={18} />
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
          </div>
          {mine.comment && <p className="text-sm">{mine.comment}</p>}
        </div>
      ) : (
        <div className="space-y-3">
          <Stars value={rating} onChange={setRating} />
          <Textarea placeholder="Share what stood out…" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={2000} />
          <div className="flex gap-2">
            <Button onClick={onSubmit} disabled={busy}>{busy ? "Saving…" : mine ? "Save" : "Submit"}</Button>
            {mine && <Button variant="ghost" onClick={() => { setEditing(false); setRating(mine.rating); setComment(mine.comment ?? ""); }}>Cancel</Button>}
          </div>
        </div>
      )}

      {ended && list.items.length > 0 && (
        <div className="space-y-3 border-t border-border pt-4">
          {list.items.map((it) => (
            <div key={it.id} className="flex gap-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={it.author.avatar_url ?? undefined} />
                <AvatarFallback>{it.author.display_name?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{it.author.display_name ?? "Someone"}</p>
                  <Stars value={it.rating} readonly size={14} />
                </div>
                {it.comment && <p className="mt-1 text-sm text-muted-foreground">{it.comment}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
