import * as React from "react";
import { toast } from "sonner";
import { Upload, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { recordGalleryUpload, listEventGallery, listMyEventGallery } from "@/server/gallery.functions";
import { ReportButton } from "@/components/ReportButton";

const BUCKET = "gallery-photos";

export function GallerySection({ event }: { event: { id: string; ends_at: string } }) {
  const ended = new Date(event.ends_at) < new Date();
  const { user } = useAuth();
  const [items, setItems] = React.useState<Awaited<ReturnType<typeof listEventGallery>>>([]);
  const [mine, setMine] = React.useState<Awaited<ReturnType<typeof listMyEventGallery>>>([]);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const reloadAll = React.useCallback(async () => {
    const arr = await listEventGallery({ data: { eventId: event.id } });
    setItems(arr);
    if (user) {
      const m = await listMyEventGallery({ data: { eventId: event.id } });
      setMine(m);
    }
  }, [event.id, user]);

  React.useEffect(() => { void reloadAll(); }, [reloadAll]);

  React.useEffect(() => {
    const ch = supabase
      .channel(`gallery-${event.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gallery_photos", filter: `event_id=eq.${event.id}` }, () => {
        void reloadAll();
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [event.id, reloadAll]);

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setBusy(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const id = crypto.randomUUID();
      const path = `${event.id}/${user.id}/${id}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
        contentType: file.type || "image/jpeg",
        cacheControl: "3600",
      });
      if (upErr) throw upErr;
      await recordGalleryUpload({ data: { eventId: event.id, storagePath: path } });
      toast.success("Uploaded — pending approval");
      void reloadAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!ended) return null;

  return (
    <section className="space-y-5 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold flex items-center gap-2"><ImageIcon className="h-5 w-5" /> Gallery</h2>
        {user && (
          <>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
            <Button size="sm" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Upload className="mr-1 h-4 w-4" /> {busy ? "Uploading…" : "Upload photo"}
            </Button>
          </>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos yet — be the first to share!</p>
      ) : (
        <div className="columns-2 gap-3 md:columns-3 [&>*]:mb-3">
          {items.map((p) => (
            <div key={p.id} className="group relative mb-3 break-inside-avoid overflow-hidden rounded-md border border-border">
              <a href={p.url ?? "#"} target="_blank" rel="noreferrer" className="block">
                <img src={p.url ?? ""} alt="" className="w-full" loading="lazy" />
              </a>
              <div className="absolute right-1 top-1 opacity-0 transition group-hover:opacity-100">
                <ReportButton targetType="photo" targetId={p.id} variant="outline" label="" />
              </div>
            </div>
          ))}
        </div>
      )}

      {user && mine.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your uploads</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {mine.map((p) => (
              <div key={p.id} className="relative overflow-hidden rounded border border-border">
                <img src={p.url ?? ""} alt="" className={p.status === "rejected" ? "w-full opacity-30 grayscale" : "w-full"} />
                <div className="absolute left-1 top-1">
                  {p.status === "pending" && <Badge variant="secondary">Pending</Badge>}
                  {p.status === "rejected" && <Badge variant="destructive">Removed</Badge>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
