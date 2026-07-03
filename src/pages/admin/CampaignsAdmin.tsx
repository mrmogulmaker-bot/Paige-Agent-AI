import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Megaphone, ExternalLink, RefreshCw, AlertCircle } from "lucide-react";
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

export default function CampaignsAdmin() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stub, setStub] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setRefreshing(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke("tenant-campaigns", {
        body: { verb: "list_active_campaigns", payload: {} },
      });
      if (error) throw error;
      const list = (data?.data?.campaigns ?? data?.campaigns ?? []) as Campaign[];
      setCampaigns(list);
      setStub(Boolean(data?.stub));
    } catch (err: any) {
      setError(err?.message ?? "Failed to load campaigns");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Megaphone className="w-6 h-6" /> Campaigns
          </h1>
          <p className="text-sm text-muted-foreground">Live state of every campaign n8n is running, read through the MMA OS bridge.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={refreshing}>
          <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {stub && (
        <div className="text-xs flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200 px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5" />
          MMA OS bridge v15 verbs not wired yet — showing empty state. Set <code className="font-mono">MMA_OS_BRIDGE_URL</code> + <code className="font-mono">MMA_OS_BRIDGE_API_KEY</code> on the <code className="font-mono">tenant-campaigns</code> function to go live.
        </div>
      )}

      {error && (
        <div className="text-xs rounded-md border border-red-300 bg-red-50 text-red-900 px-3 py-2">{error}</div>
      )}

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Active campaigns</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : campaigns.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8">No campaigns reported yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Active</TableHead>
                  <TableHead className="text-right">Completed</TableHead>
                  <TableHead>Last fire</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={c.campaign_key}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{c.campaign_key}</div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={c.status === "active" ? "default" : "outline"}
                        className={
                          c.status === "killed" ? "bg-red-100 text-red-800 hover:bg-red-100" :
                          c.status === "paused" ? "bg-amber-100 text-amber-800 hover:bg-amber-100" :
                          ""
                        }
                      >
                        {c.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{c.active_count ?? 0}</TableCell>
                    <TableCell className="text-right font-mono">{c.completed_count ?? 0}</TableCell>
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
        </CardContent>
      </Card>
    </div>
  );
}
