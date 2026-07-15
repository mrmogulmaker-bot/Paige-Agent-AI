// Campaigns Overview — the live state of every running campaign, read through the same
// tenant-scoped seam Paige drives (§10). Until real campaign data flows, the function
// answers with an honest stub flag — the UI treats stub/empty as a crafted empty state
// and reserves the error state for a real failure. No backend names, env vars, or
// internal jargon ever reach the screen (§11).
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SectionCard, EmptyState, StatePill } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Megaphone, ExternalLink, RefreshCw } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDistanceToNow } from "date-fns";

type Campaign = {
  campaign_key: string;
  name: string;
  status: "active" | "paused" | "killed" | string;
  enrolled_count?: number;
  active_count?: number;
  completed_count?: number;
  last_fire_at?: string | null;
};

function campaignPill(status: string) {
  switch (status) {
    case "active":
      return <StatePill state="success">Active</StatePill>;
    case "paused":
      return <StatePill state="warning">Paused</StatePill>;
    case "killed":
      return <StatePill state="error">Stopped</StatePill>;
    default:
      return <StatePill state="off">{status}</StatePill>;
  }
}

export default function CampaignsAdmin() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [failed, setFailed] = useState(false);

  async function load() {
    setRefreshing(true);
    setFailed(false);
    try {
      const { data, error } = await supabase.functions.invoke("tenant-campaigns", {
        body: { verb: "list_active_campaigns", payload: {} },
      });
      if (error) throw error;
      const list = (data?.data?.campaigns ?? data?.campaigns ?? []) as Campaign[];
      setCampaigns(list);
    } catch (err) {
      // A real invoke failure — the raw message stays in the console, never on screen (§11).
      console.error("[campaigns] failed to load:", err);
      setFailed(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <SectionCard
      icon={Megaphone}
      title="Active campaigns"
      description="Every campaign running for this workspace, live."
      actions={
        <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} /> Refresh
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none" />
          ))}
        </div>
      ) : failed ? (
        <EmptyState
          icon={AlertTriangle}
          title="Couldn't load your campaigns"
          description="Give it a moment and hit refresh — your campaigns are safe."
          action={
            <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
              <RefreshCw className="w-4 h-4 mr-1" /> Retry
            </Button>
          }
        />
      ) : campaigns.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          tone="brand"
          title="No campaigns yet"
          description="When a campaign starts running, its live status — who's enrolled, who's active, the last send — lands here."
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Campaign</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Active</TableHead>
              <TableHead className="text-right">Completed</TableHead>
              <TableHead>Last send</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {campaigns.map((c) => (
              <TableRow key={c.campaign_key}>
                <TableCell>
                  <div className="font-medium">{c.name}</div>
                </TableCell>
                <TableCell>{campaignPill(c.status)}</TableCell>
                <TableCell className="text-right tabular-nums">{c.active_count ?? 0}</TableCell>
                <TableCell className="text-right tabular-nums">{c.completed_count ?? 0}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {c.last_fire_at ? formatDistanceToNow(new Date(c.last_fire_at), { addSuffix: true }) : "—"}
                </TableCell>
                <TableCell>
                  <Button asChild variant="ghost" size="sm">
                    <Link to={`/admin/campaigns/${encodeURIComponent(c.campaign_key)}`}>
                      Open <ExternalLink className="w-3 h-3 ml-1" />
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SectionCard>
  );
}
