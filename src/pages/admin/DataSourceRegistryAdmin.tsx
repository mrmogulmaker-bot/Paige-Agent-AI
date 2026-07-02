import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface RegistryRow {
  id: string;
  surface: string;
  field_key: string;
  ecosystem_owner: string;
  external_source_label: string | null;
  sync_mechanism: string;
  realtime_enabled: boolean;
  staleness_ttl_seconds: number | null;
  paige_context_eligible: boolean;
  pii_sensitive: boolean;
  notes: string | null;
}

const ownerColor: Record<string, string> = {
  paige: "default",
  external_crm: "secondary",
  external_community: "secondary",
  external_billing: "outline",
  external_credit: "outline",
  external_calendar: "outline",
  derived: "outline",
};

/**
 * Ship #2.8 — Admin viewer for the data source registry.
 * §199 ecosystem ownership visible per field. Ship #3.5 CSP context loader
 * consumes rows where paige_context_eligible = true.
 */
export default function DataSourceRegistryAdmin() {
  const [rows, setRows] = useState<RegistryRow[]>([]);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    supabase
      .from("paige_data_source_registry")
      .select("*")
      .order("surface")
      .then(({ data }) => setRows((data as RegistryRow[]) ?? []));
  }, []);

  const filtered = rows.filter((r) =>
    !filter ||
    r.surface.toLowerCase().includes(filter.toLowerCase()) ||
    r.field_key.toLowerCase().includes(filter.toLowerCase()) ||
    r.ecosystem_owner.toLowerCase().includes(filter.toLowerCase())
  );

  const totals = {
    all: rows.length,
    paige: rows.filter((r) => r.ecosystem_owner === "paige").length,
    external: rows.filter((r) => r.ecosystem_owner.startsWith("external_")).length,
    contextEligible: rows.filter((r) => r.paige_context_eligible).length,
    realtime: rows.filter((r) => r.realtime_enabled).length,
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Data Source Registry</h1>
        <p className="text-sm text-muted-foreground">
          §199 ecosystem ownership map. Source of truth for Ship #3.5 Customer-Scoped Paige context loader.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Total fields" value={totals.all} />
        <StatCard label="Paige-owned" value={totals.paige} />
        <StatCard label="External-sourced" value={totals.external} />
        <StatCard label="Realtime" value={totals.realtime} />
        <StatCard label="Paige context eligible" value={totals.contextEligible} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Registry entries</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Filter by surface, field, or ecosystem…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="max-w-md mb-4"
          />
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Surface</TableHead>
                  <TableHead>Field</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Sync</TableHead>
                  <TableHead>Realtime</TableHead>
                  <TableHead>TTL (s)</TableHead>
                  <TableHead>CSP</TableHead>
                  <TableHead>PII</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{r.surface}</TableCell>
                    <TableCell className="text-xs font-mono">{r.field_key}</TableCell>
                    <TableCell>
                      <Badge variant={(ownerColor[r.ecosystem_owner] as never) ?? "outline"}>
                        {r.ecosystem_owner}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{r.external_source_label ?? "—"}</TableCell>
                    <TableCell className="text-xs">{r.sync_mechanism}</TableCell>
                    <TableCell>{r.realtime_enabled ? "✓" : "—"}</TableCell>
                    <TableCell className="text-xs">{r.staleness_ttl_seconds ?? "∞"}</TableCell>
                    <TableCell>{r.paige_context_eligible ? "✓" : "—"}</TableCell>
                    <TableCell>{r.pii_sensitive ? "⚠︎" : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}
