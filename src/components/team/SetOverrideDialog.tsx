// Set-override dialog (IA slice 1c-ix). An admin/coach/manager (or platform owner)
// pins a teammate's presence — "busy", "away", "off" — or clears it, via the already-
// built `presence_set_override` RPC (§10: the UI is one caller of the callable seam).
// §9: the RPC derives the tenant server-side and enforces same-tenant authority; we
// never pass a tenant id.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export type OverrideTarget = {
  user_id: string;
  name: string;
  current_override_status?: string | null;
  current_override_reason?: string | null;
};

// "clear" is a sentinel — it maps to p_status = null (removes the pin).
const STATUS_OPTIONS = [
  { value: "clear", label: "Clear override (use live status)" },
  { value: "online", label: "Online" },
  { value: "busy", label: "Busy" },
  { value: "away", label: "Away" },
  { value: "offline", label: "Off" },
] as const;

export function SetOverrideDialog({
  target,
  open,
  onOpenChange,
  onSaved,
}: {
  target: OverrideTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}) {
  const [status, setStatus] = useState<string>("busy");
  const [reason, setReason] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && target) {
      setStatus(target.current_override_status ?? "busy");
      setReason(target.current_override_reason ?? "");
    }
  }, [open, target]);

  const save = async () => {
    if (!target) return;
    setSaving(true);
    const cleared = status === "clear";
    const { data, error } = await supabase.rpc(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "presence_set_override" as any,
      {
        p_user_id: target.user_id,
        p_status: cleared ? null : status,
        p_reason: cleared ? null : reason.trim() || null,
      },
    );
    setSaving(false);

    if (error) {
      const msg = error.message || "";
      if (msg.includes("PRESENCE_FORBIDDEN")) {
        toast.error("You can only set the status for someone on your own team.");
      } else if (msg.includes("PRESENCE_BAD_STATUS")) {
        toast.error("That status isn't valid.");
      } else {
        toast.error(msg || "Couldn't update presence.");
      }
      return;
    }
    // The RPC returns a jsonb payload; a defensive ok:false is surfaced honestly (§13).
    if (data && typeof data === "object" && (data as { ok?: boolean }).ok === false) {
      toast.error((data as { error?: string }).error ?? "Couldn't update presence.");
      return;
    }

    toast.success(cleared ? `Cleared ${target.name}'s override` : `Set ${target.name} to ${status}`);
    onSaved?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set availability{target ? ` for ${target.name}` : ""}</DialogTitle>
          <DialogDescription>
            Pin their status when their heartbeat can't speak for them — on PTO, in a workshop, heads-down. It
            ages out on its own, or clear it anytime.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {status !== "clear" && (
            <div className="space-y-1.5">
              <Label>Reason <span className="text-muted-foreground">(optional)</span></Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="e.g. on PTO, in an all-day workshop"
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
