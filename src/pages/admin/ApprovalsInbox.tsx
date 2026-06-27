import { Link } from "react-router-dom";
import { usePendingApprovals } from "@/hooks/usePendingApprovals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { Inbox } from "lucide-react";

const typeLabel: Record<string, string> = {
  cs_draft: "Customer Support Draft",
  campaign_send: "Campaign Send",
  tier_change: "Tier Change",
  other: "Other",
};

export default function ApprovalsInbox() {
  const { items, loading } = usePendingApprovals();

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
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Loading…" : `${items.length} pending`}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!loading && items.length === 0 && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Inbox zero. Nothing waiting for review.
            </p>
          )}
          {items.map((item) => {
            const preview =
              typeof item.draft_content === "object"
                ? (item.draft_content?.subject ||
                   item.draft_content?.preview ||
                   item.draft_content?.body ||
                   "")
                : String(item.draft_content ?? "");
            return (
              <Link
                key={item.id}
                to={`/admin/approvals/${item.id}`}
                className="flex items-start justify-between gap-3 p-3 rounded-md border hover:bg-muted/40 transition-colors"
              >
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
                  <p className="text-sm mt-1 line-clamp-2">{String(preview).slice(0, 200)}</p>
                </div>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap mt-0.5">
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </span>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
