import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Gauge, TrendingUp, Users } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

type Row = {
  contact_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  entity_name: string | null;
  readiness_score: number | null;
  owner_fico: number | null;
  bank_connections_active: number;
  envelopes_pending: number;
  envelopes_completed: number;
  envelopes_total: number;
  runway_days: number | null;
};

function band(s: number | null) {
  if (s == null) return { label: "No data", color: "bg-muted text-muted-foreground" };
  if (s >= 80) return { label: "Ready", color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" };
  if (s >= 60) return { label: "Almost", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" };
  if (s >= 40) return { label: "Building", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" };
  return { label: "Foundational", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" };
}

export default function FundingLensHub() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("contact_readiness_rollup")
        .select(
          "contact_id, first_name, last_name, email, entity_name, readiness_score, owner_fico, bank_connections_active, envelopes_pending, envelopes_completed, envelopes_total, runway_days"
        )
        .order("readiness_score", { ascending: false, nullsFirst: false })
        .limit(500);
      if (!cancel) {
        setRows((data || []) as Row[]);
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) =>
      [r.first_name, r.last_name, r.email, r.entity_name]
        .filter(Boolean).join(" ").toLowerCase().includes(needle)
    );
  }, [rows, q]);

  const stats = useMemo(() => {
    const scored = rows.filter((r) => r.readiness_score != null) as (Row & { readiness_score: number })[];
    const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b.readiness_score, 0) / scored.length) : 0;
    const ready = scored.filter((r) => r.readiness_score >= 80).length;
    const almost = scored.filter((r) => r.readiness_score >= 60 && r.readiness_score < 80).length;
    const building = scored.filter((r) => r.readiness_score < 60).length;
    const pendingSigs = rows.reduce((s, r) => s + (r.envelopes_pending || 0), 0);
    return { avg, ready, almost, building, pendingSigs, total: rows.length };
  }, [rows]);

  return (
    <AdminLayout userRole={profile?.role || "admin"}>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Funding Readiness Lens</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Owner credit, business credit, banking, cash flow and signatures — consolidated per client with a single readiness score.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { icon: Users, label: "Contacts tracked", value: stats.total },
            { icon: Gauge, label: "Avg readiness", value: stats.avg ? `${stats.avg}/100` : "—" },
            { icon: TrendingUp, label: "Ready (80+)", value: stats.ready },
            { icon: TrendingUp, label: "Almost (60–79)", value: stats.almost },
            { icon: TrendingUp, label: "Building (<60)", value: stats.building },
          ].map((s, i) => (
            <Card key={i}>
              <CardContent className="p-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                  <s.icon className="h-3.5 w-3.5" /> {s.label}
                </div>
                <div className="mt-1 text-2xl font-semibold">{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="text-base">Client roster</CardTitle>
            <div className="relative w-64">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Search name, email, entity…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">No contacts match.</div>
            ) : (
              <div className="divide-y">
                <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground bg-muted/40">
                  <div className="col-span-4">Client</div>
                  <div className="col-span-2">Readiness</div>
                  <div className="col-span-2">Owner FICO</div>
                  <div className="col-span-1">Banks</div>
                  <div className="col-span-1">Runway</div>
                  <div className="col-span-1">Sigs</div>
                  <div className="col-span-1 text-right">Open</div>
                </div>
                {filtered.map((r) => {
                  const b = band(r.readiness_score);
                  return (
                    <div key={r.contact_id} className="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm hover:bg-muted/30">
                      <div className="col-span-4 min-w-0">
                        <div className="font-medium truncate">
                          {[r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Unnamed"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {r.entity_name || r.email || "—"}
                        </div>
                      </div>
                      <div className="col-span-2 flex items-center gap-2">
                        <span className="font-semibold tabular-nums">
                          {r.readiness_score ?? "—"}
                        </span>
                        <Badge className={`${b.color} border-transparent`}>{b.label}</Badge>
                      </div>
                      <div className="col-span-2 tabular-nums">{r.owner_fico ?? "—"}</div>
                      <div className="col-span-1 tabular-nums">{r.bank_connections_active}</div>
                      <div className="col-span-1 tabular-nums">{r.runway_days ? `${r.runway_days}d` : "—"}</div>
                      <div className="col-span-1 tabular-nums">
                        {r.envelopes_completed}/{r.envelopes_total}
                      </div>
                      <div className="col-span-1 text-right">
                        <Button asChild size="sm" variant="ghost">
                          <Link to={`/admin/contacts/${r.contact_id}?tab=funding-lens`}>Open</Link>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {stats.pendingSigs > 0 && (
          <Card>
            <CardContent className="p-4 text-sm">
              <span className="font-medium">{stats.pendingSigs}</span> signature{stats.pendingSigs === 1 ? " is" : "s are"} pending across all clients. Open a client to send a reminder or download the completed PDF.
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
