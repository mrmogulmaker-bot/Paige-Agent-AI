import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ArrowUp, Save } from "lucide-react";
import { toast } from "sonner";
import {
  FEATURE_STATUS_LABEL, FEATURE_STATUS_STYLES, featureCategoryLabel, timeAgo,
  type FeatureStatus,
} from "./supportTypes";

interface FeatureRequest {
  id: string;
  user_id: string;
  title: string;
  description: string;
  category: string;
  status: FeatureStatus;
  vote_count: number;
  admin_response: string | null;
  planned_release: string | null;
  created_at: string;
}

interface Props {
  requestId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function AdminFeatureRequestPanel({ requestId, open, onOpenChange, onUpdated }: Props) {
  const [req, setReq] = useState<FeatureRequest | null>(null);
  const [submitterEmail, setSubmitterEmail] = useState<string | null>(null);
  const [submitterName, setSubmitterName] = useState<string | null>(null);
  const [status, setStatus] = useState<FeatureStatus>("submitted");
  const [plannedRelease, setPlannedRelease] = useState("");
  const [adminResponse, setAdminResponse] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !requestId) return;
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, requestId]);

  const load = async () => {
    if (!requestId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from("feature_requests")
        .select("*")
        .eq("id", requestId)
        .maybeSingle();
      const r = data as FeatureRequest | null;
      setReq(r);
      if (r) {
        setStatus(r.status);
        setPlannedRelease(r.planned_release ?? "");
        setAdminResponse(r.admin_response ?? "");
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name,email")
          .eq("user_id", r.user_id)
          .maybeSingle();
        setSubmitterName((prof as any)?.full_name ?? null);
        setSubmitterEmail((prof as any)?.email ?? null);
      }
    } finally {
      setLoading(false);
    }
  };

  const save = async () => {
    if (!requestId || !req) return;
    setBusy(true);
    try {
      const statusChanged = status !== req.status;
      const responseAdded =
        (adminResponse.trim() || null) !== (req.admin_response || null) && adminResponse.trim().length > 0;

      const { error } = await supabase
        .from("feature_requests")
        .update({
          status,
          planned_release: plannedRelease.trim() || null,
          admin_response: adminResponse.trim() || null,
        })
        .eq("id", requestId);
      if (error) throw error;

      // Notify submitter when status changes or admin response is added
      if ((statusChanged || responseAdded) && submitterEmail) {
        void supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "feature-request-status-update",
            recipientEmail: submitterEmail,
            recipientUserId: req.user_id,
            idempotencyKey: `feature-update-${requestId}-${status}-${Date.now()}`,
            templateData: {
              title: req.title,
              status,
              statusLabel: FEATURE_STATUS_LABEL[status],
              adminResponse: adminResponse.trim() || null,
              plannedRelease: plannedRelease.trim() || null,
            },
          },
        });
      }

      toast.success("Feature request updated");
      onUpdated();
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err?.message || "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{req?.title ?? "Loading..."}</SheetTitle>
          <SheetDescription asChild>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              {req && (
                <>
                  <Badge variant="outline" className={FEATURE_STATUS_STYLES[req.status]}>
                    {FEATURE_STATUS_LABEL[req.status]}
                  </Badge>
                  <Badge variant="outline">{featureCategoryLabel(req.category)}</Badge>
                  <Badge variant="outline" className="bg-accent/10 text-accent border-accent/30">
                    <ArrowUp className="w-3 h-3 mr-1" /> {req.vote_count} votes
                  </Badge>
                </>
              )}
            </div>
          </SheetDescription>
        </SheetHeader>

        {loading && <div className="text-sm text-muted-foreground py-6">Loading...</div>}

        {!loading && req && (
          <div className="space-y-5 py-4">
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <p className="text-sm mt-1 whitespace-pre-wrap leading-relaxed">{req.description}</p>
            </div>

            <div className="text-xs text-muted-foreground">
              Submitted by <span className="font-medium text-foreground">{submitterName || "—"}</span>
              {submitterEmail && <> · {submitterEmail}</>} · {timeAgo(req.created_at)}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as FeatureStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(FEATURE_STATUS_LABEL) as FeatureStatus[]).map((s) => (
                      <SelectItem key={s} value={s}>{FEATURE_STATUS_LABEL[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Planned Release</Label>
                <Input
                  value={plannedRelease}
                  onChange={(e) => setPlannedRelease(e.target.value)}
                  placeholder="e.g. Q3 2026 or Next Sprint"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Admin Response (visible to all clients on the feedback board)</Label>
              <Textarea
                value={adminResponse}
                onChange={(e) => setAdminResponse(e.target.value)}
                rows={5}
                placeholder="Share an update about this request..."
                className="resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
              <Button onClick={save} disabled={busy} className="gap-2">
                <Save className="w-4 h-4" /> {busy ? "Saving..." : "Save & Notify"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
