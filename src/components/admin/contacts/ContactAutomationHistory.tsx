import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Zap } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type Event = {
  id: string;
  rule_id: string | null;
  deal_id: string | null;
  from_stage_id: string | null;
  to_stage_id: string | null;
  status: string;
  error: string | null;
  dispatched_at: string | null;
  created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  dispatched: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  pending: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  failed: "bg-destructive/15 text-destructive",
  skipped_inactive: "bg-muted text-muted-foreground",
  skipped_no_webhook: "bg-muted text-muted-foreground",
  skipped_no_rule: "bg-muted text-muted-foreground",
  skipped_no_consent: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
};

export function ContactAutomationHistory({ contactId }: { contactId: string }) {
  const [rows, setRows] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("stage_automation_events")
        .select("id, rule_id, deal_id, from_stage_id, to_stage_id, status, error, dispatched_at, created_at")
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (!cancelled) {
        if (!error) setRows((data ?? []) as Event[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [contactId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="w-4 h-4" /> Stage Automation History
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No automation events for this contact yet. Rules fire when a linked deal changes stage.
          </p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
                <div className="min-w-0 text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-[10px] ${STATUS_TONE[r.status] ?? ""}`} variant="secondary">
                      {r.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  {r.error && (
                    <div className="text-xs text-destructive mt-1 break-words">{r.error}</div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-1 space-x-2">
                    {r.deal_id && <span>deal: <code>{r.deal_id.slice(0, 8)}</code></span>}
                    {r.rule_id && <span>rule: <code>{r.rule_id.slice(0, 8)}</code></span>}
                    {r.dispatched_at && (
                      <span>dispatched: {formatDistanceToNow(new Date(r.dispatched_at), { addSuffix: true })}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
