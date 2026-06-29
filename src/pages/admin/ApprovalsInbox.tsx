import { useState } from "react";
import { Link } from "react-router-dom";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { Inbox, Check, X, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import FieldIngestionTab from "@/components/admin/FieldIngestionTab";

const typeLabel: Record<string, string> = {
  cs_draft: "Customer Support Draft",
  campaign_send: "Campaign Send",
  tier_change: "Tier Change",
  other: "Other",
};

export default function ApprovalsInbox() {
  const { items, loading } = usePendingApprovals();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  const toggle = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id); else next.delete(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(items.map((i) => i.id)));
  const clear = () => setSelected(new Set());

  const bulk = async (decision: "approve" | "reject") => {
    if (selected.size === 0) return;
    setBusy(true);
    const ids = Array.from(selected);
    const { error } = await supabase
      .from("paige_pending_approvals")
      .update({
        status: decision === "approve" ? "approved" : "skipped",
        reviewed_at: new Date().toISOString(),
      })
      .in("id", ids);
    setBusy(false);
    clear();
    if (error) { toast.error(error.message); return; }
    toast.success(`${decision === "approve" ? "Approved" : "Rejected"} ${ids.length}`);
    if (decision === "approve") {
      toast.info("Marked approved. Items that auto-send (CS drafts, campaigns) still require opening individually to dispatch.");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
          <Inbox className="w-6 h-6" /> Approvals
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          AI-drafted items waiting for human approval. Updates live.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">
            {loading ? "Loading…" : `${items.length} pending`}
            {selected.size > 0 && <span className="ml-2 text-xs text-muted-foreground">({selected.size} selected)</span>}
          </CardTitle>
          <div className="flex items-center gap-2">
            {items.length > 0 && (
              <Button size="sm" variant="ghost" onClick={selected.size === items.length ? clear : selectAll}>
                {selected.size === items.length ? "Clear" : "Select all"}
              </Button>
            )}
            {selected.size > 0 && (
              <>
                <Button size="sm" variant="outline" onClick={() => bulk("reject")} disabled={busy}>
                  <X className="w-3.5 h-3.5 mr-1" /> Reject
                </Button>
                <Button size="sm" onClick={() => bulk("approve")} disabled={busy}>
                  <Check className="w-3.5 h-3.5 mr-1" /> Approve
                </Button>
              </>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {!loading && items.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Inbox zero. Nothing waiting for review.
            </p>
          )}
          {items.map((item) => {
            const dc = item.draft_content as Record<string, unknown> | string | null;
            const preview =
              typeof dc === "object" && dc !== null
                ? String((dc as Record<string, unknown>).subject ?? (dc as Record<string, unknown>).preview ?? (dc as Record<string, unknown>).body ?? "")
                : String(dc ?? "");
            const isSelected = selected.has(item.id);
            return (
              <div
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-md border transition-colors ${isSelected ? "bg-muted/60 border-accent" : "hover:bg-muted/40"}`}
              >
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={(c) => toggle(item.id, c === true)}
                  className="mt-1"
                />
                <Link to={`/admin/approvals/${item.id}`} className="min-w-0 flex-1 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="secondary" className="text-[10px]">
                        {typeLabel[item.type] ?? item.type}
                      </Badge>
                      {item.created_by_n8n_workflow_key && (
                        <span className="text-[10px] text-muted-foreground">
                          from {item.created_by_n8n_workflow_key}
                        </span>
                      )}
                    </div>
                    <p className="text-sm mt-1 line-clamp-2">{preview.slice(0, 200)}</p>
                  </div>
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap mt-0.5">
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                  </span>
                </Link>
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
