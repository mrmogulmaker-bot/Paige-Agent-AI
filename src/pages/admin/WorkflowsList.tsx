import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Play, Workflow, AlertTriangle, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";

const CATEGORY_LABEL: Record<string, string> = {
  customer_support: "Customer Support",
  campaigns: "Campaigns",
  campaign: "Campaigns",
  editorial: "Editorial",
  admin: "Admin & Ops",
  funding: "Funding",
  observability: "Observability",
  analytics: "Analytics",
};

const CATEGORY_ORDER = [
  "customer_support",
  "campaigns",
  "campaign",
  "editorial",
  "funding",
  "admin",
  "observability",
  "analytics",
];

const PROVIDER_LABEL: Record<string, string> = {
  n8n: "n8n",
  langgraph: "LangGraph",
  direct_edge_function: "Direct",
  cron_only: "Cron",
};

interface WorkflowRow {
  id: string;
  key: string;
  label: string;
  description: string | null;
  category: string;
  provider: string;
  needs_n8n_link: boolean;
  requires_approval: boolean;
  sort_order: number;
}

export default function WorkflowsList({ embedded = false }: { embedded?: boolean } = {}) {
  const [rows, setRows] = useState<WorkflowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("paige_workflow_registry")
      .select("id, key, label, description, category, provider, needs_n8n_link, requires_approval, sort_order")
      .eq("is_active", true)
      .order("category")
      .order("sort_order")
      .order("label");
    setRows((data ?? []) as WorkflowRow[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("n8n-list-workflows", { body: {} });
    setSyncing(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Synced — linked ${data?.curated_linked ?? 0}, added ${data?.auto_upserted ?? 0}`);
    load();
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(
      (r) => r.label.toLowerCase().includes(q) || (r.description ?? "").toLowerCase().includes(q) || r.key.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, WorkflowRow[]>();
    for (const r of filtered) {
      const arr = map.get(r.category) ?? [];
      arr.push(r);
      map.set(r.category, arr);
    }
    return Array.from(map.entries()).sort(
      ([a], [b]) => (CATEGORY_ORDER.indexOf(a) + 999) - (CATEGORY_ORDER.indexOf(b) + 999),
    );
  }, [filtered]);

  const needsLinkCount = rows.filter((r) => r.needs_n8n_link).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        {/* When embedded (e.g. Setup › Automations), the host surface owns the page
            header — suppress our own h1 so there's no doubled heading. §11/§18. */}
        {!embedded && (
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold flex items-center gap-2">
              <Workflow className="w-6 h-6" /> Workflows
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Every operation Paige can run. Replaces the Telegram command surface.
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing…" : "Sync n8n"}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/workflows/runs">Recent runs</Link>
          </Button>
        </div>
      </div>

      {needsLinkCount > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-3 flex items-center gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>
              <strong>{needsLinkCount}</strong> curated workflow{needsLinkCount === 1 ? "" : "s"} not yet linked to a live n8n workflow.
              Click <strong>Sync n8n</strong> to resolve by matching workflow names.
            </span>
          </CardContent>
        </Card>
      )}

      <div className="relative max-w-sm">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search workflows…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {!loading && rows.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No workflows yet.</CardContent></Card>
      )}
      {!loading && rows.length > 0 && filtered.length === 0 && (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No workflows match "{search}".</CardContent></Card>
      )}

      {grouped.map(([cat, items]) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>{CATEGORY_LABEL[cat] ?? cat}</span>
              <span className="text-xs font-normal text-muted-foreground">{items.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map((w) => (
              <Link
                key={w.id}
                to={`/admin/workflows/${w.key}`}
                className="block p-4 rounded-md border hover:border-accent hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium text-sm">{w.label}</div>
                  <div className="flex flex-col items-end gap-1">
                    {w.requires_approval && <Badge variant="outline" className="text-[9px]">approval</Badge>}
                    <Badge variant="secondary" className="text-[9px]">{PROVIDER_LABEL[w.provider] ?? w.provider}</Badge>
                  </div>
                </div>
                {w.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{w.description}</p>
                )}
                <div className="mt-3 flex items-center justify-between text-xs">
                  {w.needs_n8n_link ? (
                    <span className="text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Needs n8n link
                    </span>
                  ) : w.provider === "cron_only" ? (
                    <span className="text-muted-foreground">Scheduled</span>
                  ) : (
                    <span className="text-gold-dark flex items-center gap-1"><Play className="w-3 h-3" /> Run</span>
                  )}
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
