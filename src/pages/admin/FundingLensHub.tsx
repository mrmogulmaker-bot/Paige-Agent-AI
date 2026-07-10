import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  PageShell,
  PageHeader,
  StatRow,
  StatTile,
  SectionCard,
  DataTableShell,
  EmptyState,
  StatePill,
  type Column,
  type PillState,
} from "@/components/ui/page";
import { Search, Gauge, TrendingUp, Users } from "lucide-react";


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

function band(s: number | null): { label: string; state: PillState } {
  if (s == null) return { label: "No data", state: "off" };
  if (s >= 80) return { label: "Ready", state: "success" };
  if (s >= 60) return { label: "Almost", state: "pending" };
  if (s >= 40) return { label: "Building", state: "off" };
  return { label: "Foundational", state: "error" };
}

const COLUMNS: Column[] = [
  { key: "client", header: "Client" },
  { key: "readiness", header: "Readiness" },
  { key: "fico", header: "Owner FICO", numeric: true },
  { key: "banks", header: "Banks", numeric: true },
  { key: "runway", header: "Runway", numeric: true },
  { key: "sigs", header: "Sigs", numeric: true },
  { key: "open", header: "", numeric: true },
];

export default function FundingLensHub() {
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
      <PageShell width="wide">
        <PageHeader
          variant="hero"
          eyebrow="Funding Readiness Lens"
          title="Every client's readiness, on one score"
          description="Owner credit, business credit, banking, cash flow and signatures — consolidated per client with a single readiness score."
        />

        <StatRow cols={4}>
          <StatTile
            icon={Users}
            label="Contacts tracked"
            value={stats.total}
            loading={loading}
          />
          <StatTile
            icon={Gauge}
            label="Avg readiness"
            value={stats.avg ? `${stats.avg}/100` : "—"}
            loading={loading}
          />
          <StatTile
            icon={TrendingUp}
            label="Ready (80+)"
            value={stats.ready}
            intent="positive"
            loading={loading}
          />
          <StatTile
            icon={TrendingUp}
            label="Almost (60–79)"
            value={stats.almost}
            loading={loading}
          />
          <StatTile
            icon={TrendingUp}
            label="Building (<60)"
            value={stats.building}
            intent="negative"
            loading={loading}
          />
        </StatRow>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-lg font-semibold text-foreground">Client roster</h2>
          <div className="relative w-full sm:w-64">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input
              placeholder="Search name, email, entity…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
        </div>

        <DataTableShell
          columns={COLUMNS}
          loading={loading}
          isEmpty={filtered.length === 0}
          empty={
            <EmptyState
              icon={Users}
              title="No clients match"
              description="Adjust your search to see clients and their readiness scores."
            />
          }
        >
          {filtered.map((r) => {
            const b = band(r.readiness_score);
            return (
              <TableRow key={r.contact_id}>
                <TableCell className="min-w-0">
                  <div className="font-medium truncate">
                    {[r.first_name, r.last_name].filter(Boolean).join(" ") || r.email || "Unnamed"}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.entity_name || r.email || "—"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold tabular-nums">
                      {r.readiness_score ?? "—"}
                    </span>
                    <StatePill state={b.state}>{b.label}</StatePill>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.owner_fico ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{r.bank_connections_active}</TableCell>
                <TableCell className="text-right tabular-nums">{r.runway_days ? `${r.runway_days}d` : "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.envelopes_completed}/{r.envelopes_total}
                </TableCell>
                <TableCell className="text-right">
                  <Button asChild size="sm" variant="ghost">
                    <Link to={`/admin/contacts/${r.contact_id}?tab=funding-lens`}>Open</Link>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </DataTableShell>

        {stats.pendingSigs > 0 && (
          <SectionCard>
            <p className="text-sm">
              <span className="font-medium">{stats.pendingSigs}</span> signature{stats.pendingSigs === 1 ? " is" : "s are"} pending across all clients. Open a client to send a reminder or download the completed PDF.
            </p>
          </SectionCard>
        )}
      </PageShell>
  );
}
