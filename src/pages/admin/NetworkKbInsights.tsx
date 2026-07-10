// Platform-owner Network Insights: aggregate KB telemetry across every tenant.
// Reads ONLY metadata (hashed queries, intent tags, match flags) — never raw
// queries or doc content. Plus the review queue for tenant-contributed docs.
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Network, Database, AlertCircle, TrendingUp, Check, X, Inbox } from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  PageShell,
  PageHeader,
  StatRow,
  StatTile,
  SectionCard,
  DataTableShell,
  EmptyState,
} from "@/components/ui/page";

interface PendingDoc {
  id: string;
  title: string;
  summary: string | null;
  category: string | null;
  tags: string[] | null;
  content: string;
  tenant_id: string;
  created_by: string;
  created_at: string;
  tenants?: { name: string; slug: string } | null;
}

interface TelemetryRow {
  tenant_id: string | null;
  result_count: number;
  top_similarity: number | null;
  had_global_match: boolean;
  had_tenant_match: boolean;
  query_intent_tags: string[];
  created_at: string;
}

export default function NetworkKbInsights() {
  const [pending, setPending] = useState<PendingDoc[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [pendingRes, telemRes] = await Promise.all([
      supabase
        .from("tenant_knowledge_docs" as any)
        .select("id, title, summary, category, tags, content, tenant_id, created_by, created_at, tenants(name, slug)")
        .eq("share_to_network", true)
        .eq("network_review_status", "pending")
        .order("created_at", { ascending: false }),
      supabase
        .from("kb_query_telemetry" as any)
        .select("tenant_id, result_count, top_similarity, had_global_match, had_tenant_match, query_intent_tags, created_at")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    setPending((pendingRes.data as any) ?? []);
    setTelemetry((telemRes.data as any) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (docId: string, decision: "approve" | "reject") => {
    const { data, error } = await supabase.functions.invoke("kb-promote-to-network", {
      body: { doc_id: docId, decision },
    });
    if (error || !data?.ok) {
      return toast.error(data?.error ?? error?.message ?? "Failed");
    }
    toast.success(decision === "approve" ? "Promoted to global canon" : "Rejected");
    load();
  };

  // Aggregates — pure metadata.
  const totalQueries = telemetry.length;
  const unmatchedQueries = telemetry.filter((t) => !t.had_global_match && !t.had_tenant_match).length;
  const tenantCoverage = telemetry.filter((t) => t.had_tenant_match).length;
  const avgTopSim = telemetry.length
    ? (telemetry.reduce((s, t) => s + Number(t.top_similarity ?? 0), 0) / telemetry.length).toFixed(3)
    : "0";

  // Intent tag frequency.
  const intentCounts: Record<string, number> = {};
  telemetry.forEach((t) => (t.query_intent_tags ?? []).forEach((tag) => {
    intentCounts[tag] = (intentCounts[tag] ?? 0) + 1;
  }));
  const topIntents = Object.entries(intentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  return (
    <PageShell width="wide">
      <PageHeader
        variant="hero"
        eyebrow="Platform · Network"
        title="Network Insights"
        description="Aggregate signal across every tenant's KB. Metadata only — no raw queries or document content leaves tenant boundaries."
      />

      <StatRow cols={4}>
        <StatTile icon={Database} label="Queries (last 500)" value={String(totalQueries)} loading={loading} />
        <StatTile
          icon={AlertCircle}
          label="Unanswered"
          value={String(unmatchedQueries)}
          intent={unmatchedQueries > 0 ? "negative" : "neutral"}
          loading={loading}
        />
        <StatTile icon={TrendingUp} label="Tenant-KB hits" value={`${tenantCoverage}/${totalQueries}`} loading={loading} />
        <StatTile icon={Network} label="Avg top similarity" value={avgTopSim} loading={loading} />
      </StatRow>

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList>
          <TabsTrigger value="queue">Contribution Queue ({pending.length})</TabsTrigger>
          <TabsTrigger value="intents">Top Intents</TabsTrigger>
        </TabsList>

        <TabsContent value="queue">
          <SectionCard
            title="Pending Network Contributions"
            description="Tenants opted these docs into the network. Approve to add to global canon; reject to leave them tenant-private."
          >
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : pending.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="Queue is clear"
                description="No tenants have offered docs to the shared canon right now. New contributions land here for your review."
              />
            ) : (
              <div className="space-y-3">
                {pending.map((d) => (
                  <div key={d.id} className="rounded-lg border border-border p-4 space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{d.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          from <span className="font-mono">{d.tenants?.name ?? d.tenant_id.slice(0, 8)}</span> · {formatDistanceToNow(new Date(d.created_at), { addSuffix: true })}
                        </div>
                        {d.summary && <p className="text-sm text-muted-foreground mt-1.5">{d.summary}</p>}
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {d.category && <Badge variant="outline">{d.category}</Badge>}
                          {(d.tags ?? []).map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                        </div>
                        <details className="group mt-3 rounded-lg border border-border bg-muted/30">
                          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
                            Preview content
                          </summary>
                          <pre className="whitespace-pre-wrap border-t border-border/60 px-3 py-3 text-xs text-foreground/90 max-h-64 overflow-auto">
                            {d.content.slice(0, 4000)}{d.content.length > 4000 ? "\n…" : ""}
                          </pre>
                        </details>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <Button size="sm" variant="gold" onClick={() => decide(d.id, "approve")}>
                          <Check className="w-4 h-4 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => decide(d.id, "reject")}>
                          <X className="w-4 h-4 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="intents">
          <SectionCard
            title="Top Query Intents"
            description="Most-requested intent tags across the network. Use to prioritize new global-canon content."
            padded={false}
          >
            <DataTableShell
              columns={[
                { key: "intent", header: "Intent" },
                { key: "count", header: "Count", numeric: true },
              ]}
              isEmpty={topIntents.length === 0}
              empty={
                <EmptyState
                  icon={TrendingUp}
                  title="No intent signal yet"
                  description="Once tenants start asking their portals questions, the most-requested intents surface here."
                />
              }
            >
              {topIntents.map(([tag, n]) => (
                <TableRow key={tag}>
                  <TableCell><Badge variant="outline">{tag}</Badge></TableCell>
                  <TableCell className="text-right font-mono tabular-nums">{n}</TableCell>
                </TableRow>
              ))}
            </DataTableShell>
          </SectionCard>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
