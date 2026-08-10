/**
 * Revenue Integrity Audit — task #31 (Wave 8 beta-launch revenue gate).
 *
 * The operator-only, investor-grade proof surface: every PAID tenant's three-gate
 * chain (signed subscriber agreement + live Stripe subscription + revenue-class
 * flip) rendered as an auditable roster, with an on-demand CSV export for
 * investor / auditor / due-diligence hand-off. Reads the ONE callable seam
 * `operator_revenue_integrity_audit()` (§10/§18) — is_platform_owner gated
 * server-side (RAISES 42501 for any non-owner), so no tenant path can reach it.
 *
 * The DB-level trigger (enforce_revenue_integrity_chain) guarantees a tenant
 * CANNOT rest at revenue_class='paid' without both gates — so integrity_ok is
 * always true for a paid row here. The audit surfaces that proof; it does not
 * compute trust (the trigger does). §13: real fields only, no placeholders.
 */
import { useEffect, useState } from "react";
import { ShieldCheck, Download, FileSignature, CreditCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import { SectionCard, DataTableShell, EmptyState, StatePill, type Column } from "@/components/ui/page";

// Mirrors the operator_revenue_integrity_audit() RETURNS TABLE shape (migration 20260815120000).
interface IntegrityRow {
  tenant_id: string;
  tenant_name: string | null;
  revenue_class: string | null;
  classified_at: string | null;
  comp_reason: string | null;
  agreement_on_file: boolean | null;
  agreement_slug: string | null;
  agreement_version: number | null;
  agreement_accepted_at: string | null;
  agreement_ip: string | null;
  subscription_on_file: boolean | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  integrity_ok: boolean | null;
}

const fmtDate = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "—";

// Last 8 chars of a Stripe id for the table (full id lives in the CSV export).
const tailId = (id: string | null): string => (id ? `…${id.slice(-8)}` : "—");

function toCsv(rows: IntegrityRow[], generatedAt: string): string {
  const cols: (keyof IntegrityRow)[] = [
    "tenant_id", "tenant_name", "revenue_class", "integrity_ok",
    "agreement_on_file", "agreement_slug", "agreement_version", "agreement_accepted_at",
    "subscription_on_file", "subscription_status", "stripe_customer_id", "stripe_subscription_id",
    "current_period_start", "current_period_end", "classified_at", "comp_reason",
  ];
  const esc = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = cols.join(",");
  if (rows.length === 0) {
    // §13: zero IS proof. An empty roster still exports as a valid investor/auditor
    // artifact — the header plus a dated attestation that no tenant is classified paid,
    // and that the enforcement lives in the database, not the app.
    const note =
      `# 0 paying tenants as of ${generatedAt}. ` +
      `Enforced at the database by trigger enforce_revenue_integrity_chain (migration 20260815120000): ` +
      `no tenant can rest at revenue_class='paid' without both a signed subscriber agreement and a live Stripe subscription.`;
    return `${header}\n${esc(note)}`;
  }
  const body = rows.map((r) => cols.map((c) => esc(r[c])).join(",")).join("\n");
  return `${header}\n${body}`;
}

export default function RevenueIntegrityAudit() {
  const [rows, setRows] = useState<IntegrityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      // Not in generated Supabase types yet (new #31 RPC); cast — same idiom as the
      // tenant_revenue_classification reads. is_platform_owner gate is server-side.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error: err } = await supabase.rpc("operator_revenue_integrity_audit" as any, {});
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setRows([]);
      } else {
        setRows((data ?? []) as unknown as IntegrityRow[]);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const exportCsv = () => {
    const generatedAt = new Date().toISOString().slice(0, 10);
    const csv = toCsv(rows, generatedAt);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `revenue-integrity-${generatedAt}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const columns: Column[] = [
    { key: "tenant", header: "Tenant" },
    { key: "agreement", header: "Signed agreement" },
    { key: "subscription", header: "Live subscription" },
    { key: "classified", header: "Classified paid" },
    { key: "integrity", header: "Integrity" },
  ];

  return (
    <SectionCard
      title="Revenue integrity"
      icon={ShieldCheck}
      description="Every paying tenant's three-gate proof — signed agreement + live Stripe subscription — enforced at the database. Export for investor or due-diligence review."
      actions={
        // Always exportable — a zero-paid roster is itself a valid investor/auditor
        // artifact (§13: zero IS proof). Export is a neutral data action, not an
        // act/approve — secondary, never gold (§11).
        <Button variant="outline" size="sm" onClick={exportCsv}>
          <Download className="h-3.5 w-3.5" /> Export CSV
        </Button>
      }
    >
      {error ? (
        <p className="text-sm text-muted-foreground">
          The revenue-integrity audit couldn't load right now.
        </p>
      ) : (
        <DataTableShell
          columns={columns}
          loading={loading}
          isEmpty={rows.length === 0}
          empty={
            <EmptyState
              icon={ShieldCheck}
              title="No paying tenants yet"
              description="When a tenant converts to paid, its three-gate proof — signed agreement and a live Stripe subscription — lands here, ready to export. The database blocks any tenant from being marked paid without both."
            />
          }
        >
          {rows.map((r) => (
            <TableRow key={r.tenant_id}>
              <TableCell className="font-medium">{r.tenant_name ?? "—"}</TableCell>
              <TableCell className="text-sm">
                {r.agreement_on_file ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <FileSignature className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                    {r.agreement_slug ? `${r.agreement_slug}` : "on file"}
                    {r.agreement_accepted_at ? ` · ${fmtDate(r.agreement_accepted_at)}` : ""}
                  </span>
                ) : (
                  <span className="text-[hsl(var(--destructive))]">missing</span>
                )}
              </TableCell>
              <TableCell className="text-sm">
                {r.subscription_on_file ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground tabular-nums">
                    <CreditCard className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                    {r.subscription_status ?? "active"} · {tailId(r.stripe_subscription_id)}
                  </span>
                ) : (
                  <span className="text-[hsl(var(--destructive))]">missing</span>
                )}
              </TableCell>
              <TableCell className="text-sm tabular-nums text-muted-foreground">
                {fmtDate(r.classified_at)}
              </TableCell>
              <TableCell>
                <StatePill state={r.integrity_ok ? "success" : "error"}>
                  {r.integrity_ok ? "Verified" : "Gap"}
                </StatePill>
              </TableCell>
            </TableRow>
          ))}
        </DataTableShell>
      )}
    </SectionCard>
  );
}
