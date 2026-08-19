import { useMemo } from "react";
import { useSystemsCheck } from "@/hooks/useSystemsCheck";
import { SystemsCheckTile } from "@/components/systems-check/SystemsCheckTile";
import { cn } from "@/lib/utils";

/**
 * Systems Check — Claude Design's `isFleet` block at `tabKey === "main"` (Super Admin Shell.dc.html
 * 6769-6857), on the real operator scan.
 *
 * §30/§58 — the platform already ships this capability: `useSystemsCheck` + `SystemsCheckTile` are
 * the shipped Wave-S3-L3 read + review-and-approve engine (the same tile the operator Command
 * Center already mounts). CD draws its own thirteen-category grid, KPI strip and a static "Run full
 * sweep" button — but those are a picture of a systems check, not the working one. So the pack's
 * chrome renders here (its labels, its KPI strip, its category taxonomy), and the REAL engine — the
 * ranked open-findings review with Paige's interpretation, her drafted fix and the one-click
 * approve — is the shipped `SystemsCheckTile`, not a redrawn copy of it.
 *
 * §13 — THE REGISTRY TODAY HAS ONE REAL DOMAIN. CD draws thirteen categories (infra, model
 * providers, integrations, edge functions, database, CI/CD, scheduled tasks, automations,
 * compliance, security, billing, revenue, fleet-wide tenant health) because that is the taxonomy
 * the design promises. The seeded operator checks (`20260816170000_systems_check_l3_operator_scope.sql`)
 * all carry `domain='infrastructure'` today — twelve of the thirteen categories have no check
 * registered against them yet, not zero findings. Those twelve stay an honest "—", exactly as the
 * ported spec (`fleetSpecs.ts`) already renders them; only Infrastructure gets a real count, because
 * it is the one category any row actually belongs to. A "—" here means "nothing is swept for this
 * category yet," never "swept and clean."
 */

const SYSTEMS_CHECK_CATEGORIES = [
  { id: "infra", name: "Infrastructure" },
  { id: "models", name: "Model providers" },
  { id: "integrations", name: "Third-party integrations" },
  { id: "functions", name: "Edge functions" },
  { id: "db", name: "Database" },
  { id: "cicd", name: "CI/CD pipelines" },
  { id: "crons", name: "Scheduled tasks" },
  { id: "autos", name: "Automations state" },
  { id: "compliance", name: "Compliance seams" },
  { id: "security", name: "Security seams" },
  { id: "billing", name: "Billing seams" },
  { id: "revenue", name: "Revenue integrity" },
  { id: "tenants", name: "Fleet-wide tenant health" },
] as const;

const TONE_PILL: Record<"ok" | "warn" | "risk" | "unknown", string> = {
  ok: "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))]",
  warn: "bg-[hsl(var(--warning)/0.16)] text-[hsl(var(--gold-dark))]",
  risk: "bg-[hsl(var(--destructive)/0.1)] text-[hsl(var(--destructive))]",
  unknown: "bg-muted text-muted-foreground",
};

export default function SystemsCheckSurface() {
  const { run, findings, loading } = useSystemsCheck("operator");

  const stats = useMemo(() => {
    const assessable = findings.filter((f) => f.status !== "skip");
    const passCount = findings.filter((f) => f.status === "pass").length;
    const openFails = findings.filter((f) => f.status === "fail" && !f.resolved_at);
    const red = openFails.filter((f) => (f.severity_at_finding ?? "low") === "blocking").length;
    const amber = openFails.length - red + findings.filter((f) => f.status === "error").length;
    return { assessable: assessable.length, passCount, red, amber, total: findings.length };
  }, [findings]);

  // The one category any seeded operator check actually belongs to today (§13, see file header).
  const infraTone: "ok" | "warn" | "risk" | "unknown" =
    !run || findings.length === 0 ? "unknown" : stats.red > 0 ? "risk" : stats.amber > 0 ? "warn" : "ok";
  const infraCount = !run || findings.length === 0 ? null : `${stats.passCount}/${stats.assessable}`;

  const kpis = [
    {
      label: "OVERALL",
      value: !run ? "—" : `${stats.red} red, ${stats.amber} amber`,
    },
    {
      label: "CHECKS PASSING",
      value: !run ? "—" : `${stats.passCount}/${stats.assessable}`,
    },
    // No incident substrate exists yet (matches `useOperatorChrome`'s own established gap) —
    // honest absence, never a fabricated "0" (§13).
    { label: "OPEN INCIDENT", value: "—" },
    { label: "AUTO-MITIGATED", value: "—" },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3.5">
      {/* ── title row ─────────────────────────────────────────────── */}
      <div className="flex flex-none flex-wrap items-start gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="text-[9.5px] font-semibold tracking-[0.15em] text-muted-foreground">PLATFORM</span>
            <span className="text-[21px] font-bold tracking-[-0.02em]">Systems Check</span>
          </div>
          <div className="mt-1.5 text-[12.5px] text-muted-foreground">
            Thirteen categories, {loading ? "—" : stats.total} checks. Is the machine running for
            everybody.
          </div>
        </div>
        <div className="ml-auto flex-none">
          <span
            title="There is no sweep-on-demand seam yet — Paige runs the operator scan on a schedule."
            className="whitespace-nowrap rounded-[9px] border border-border bg-card px-3.5 py-2 text-[12.5px] font-semibold text-muted-foreground opacity-70"
          >
            Run full sweep
          </span>
        </div>
      </div>

      <div className="text-[11px] text-muted-foreground">
        Green means a check ran and passed. A category that has not been swept says so — it never
        reports green from an unqueried state.
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────── */}
      <div className="grid flex-none grid-cols-2 gap-2.5 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="min-w-0 rounded-xl border-[1.5px] border-border bg-card px-3.5 py-3 shadow-sm">
            <div className="truncate text-[9px] font-semibold tracking-[0.13em] text-muted-foreground">
              {k.label}
            </div>
            <div className="mt-1 whitespace-nowrap text-[24px] font-bold tabular-nums tracking-[-0.02em]">
              {loading ? "—" : k.value}
            </div>
          </div>
        ))}
      </div>

      {/* ── category grid (CD's thirteen, §13 honest per-category) ──── */}
      <div className="flex-none rounded-[13px] border-[1.5px] border-border bg-card px-3.5 py-3 shadow-sm">
        <div className="text-[13.5px] font-semibold">Categories</div>
        <div className="mt-0.5 text-[11px] text-muted-foreground">Click any category for its systems and evidence.</div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SYSTEMS_CHECK_CATEGORIES.map((c) => {
            const isInfra = c.id === "infra";
            const tone = isInfra ? infraTone : "unknown";
            const count = isInfra ? infraCount : null;
            return (
              <div
                key={c.id}
                className="flex min-w-0 items-center justify-between gap-2 rounded-[9px] border border-border bg-muted/30 px-2.5 py-2"
              >
                <span className="min-w-0 truncate text-[11.5px]">{c.name}</span>
                <span className={cn("flex-none whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold", TONE_PILL[tone])}>
                  {count ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── the real engine: Paige's ranked review + one-click approve ──── */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SystemsCheckTile scope="operator" />
      </div>
    </div>
  );
}
