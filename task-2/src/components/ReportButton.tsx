import * as React from "react";
import { toast } from "sonner";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAuth } from "@/lib/auth";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { submitReport } from "@/server/reports.functions";

type Reason = "spam" | "inappropriate" | "misleading" | "other";

export function ReportButton({
  targetType,
  targetId,
  size = "sm",
  variant = "ghost",
  label = "Report",
}: {
  targetType: "event" | "photo";
  targetId: string;
  size?: "sm" | "default" | "icon";
  variant?: "ghost" | "outline" | "default";
  label?: string;
}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState<Reason>("spam");
  const [details, setDetails] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const onClickTrigger = (e: React.MouseEvent) => {
    if (!user) {
      e.preventDefault();
      navigate({
        to: "/sign-in",
        search: { redirect: `${location.pathname}${location.searchStr ?? ""}` } as never,
      });
    }
  };

  const onSubmit = async () => {
    setBusy(true);
    try {
      await submitReport({ data: { targetType, targetId, reason, details: details || null } });
      toast.success("Report submitted. Thank you.");
      setOpen(false);
      setDetails("");
      setReason("spam");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size={size} variant={variant} onClick={onClickTrigger}>
          <Flag className="mr-1 h-3.5 w-3.5" /> {label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Report {targetType}</DialogTitle>
          <DialogDescription>Tell us why this content shouldn't be on Gather.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Reason</Label>
            <RadioGroup value={reason} onValueChange={(v) => setReason(v as Reason)}>
              {(["spam", "inappropriate", "misleading", "other"] as Reason[]).map((r) => (
                <div key={r} className="flex items-center gap-2">
                  <RadioGroupItem value={r} id={`reason-${r}`} />
                  <Label htmlFor={`reason-${r}`} className="capitalize">{r}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>
          <div>
            <Label htmlFor="report-details" className="mb-2 block">Details (optional)</Label>
            <Textarea id="report-details" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={onSubmit} disabled={busy}>{busy ? "Submitting…" : "Submit report"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
