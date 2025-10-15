import React from "react";

type BureauState = {
  dnb?: { paydex?: number; status?: string };
  experian?: { intelliscore?: number; status?: string };
  equifax?: { status?: string };
};

type PlaidState = {
  avg_balance_90d?: number;
  dscr?: number;
};

type BuildState = {
  score?: number;
  fundability_pct?: number;
  stages?: Record<"B"|"U"|"I"|"L"|"D",{ percent: number }>;
};

type Vendor = { name: string; status: "Reported"|"Pending"|"Missing"; days_to_pay?: number; early_pay?: boolean };

interface Props {
  bureaus: BureauState;
  plaid: PlaidState;
  build: BuildState;
  vendors: Vendor[];
  onRunAssessment: () => void;
  onSyncBureaus: () => void;
  onParseReport: (file: File) => void;
  onOpenStageTasks: (stageKey: "B"|"U"|"I"|"L"|"D") => void;
  onAddVendors: () => void;
  onOpenFundingPlan: () => void;
  insights: string[];
  uploading?: boolean;
  syncing?: boolean;
}

const currency = (n?: number) =>
  typeof n === "number" ? n.toLocaleString(undefined, { style: "currency", currency: "USD" }) : "—";

const percent = (n?: number) =>
  typeof n === "number" ? `${Math.round(n)}%` : "—";

export default function BuildProgramBusiness({
  bureaus, plaid, build, vendors,
  onRunAssessment, onSyncBureaus, onParseReport,
  onOpenStageTasks, onAddVendors, onOpenFundingPlan,
  insights, uploading, syncing
}: Props) {
  return (
    <div className="mx-auto max-w-6xl p-3 md:p-6">
      {/* Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-foreground">BUILD Program — Business</h1>
          <p className="text-sm text-muted-foreground">Build fundable business credit with strategic account placement.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onRunAssessment} className="rounded-xl bg-foreground px-4 py-2 text-background shadow hover:opacity-90 text-sm md:text-base">Run BUILD Assessment</button>
          <button onClick={onSyncBureaus} className="rounded-xl border border-border px-4 py-2 text-foreground hover:bg-accent text-sm md:text-base">Sync Bureaus</button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Paydex" value={bureaus.dnb?.paydex ?? undefined} target="80+" accent="bg-gold" />
        <KpiCard label="Intelliscore" value={bureaus.experian?.intelliscore ?? undefined} target="75+" accent="bg-accent" />
        <KpiCard label="Avg Balance (90d)" value={currency(plaid.avg_balance_90d)} target="$5,000+" accent="bg-foreground" />
        <KpiCard label="Fundability %" value={percent(build.fundability_pct)} target="70%+" accent="bg-gold" />
      </div>

      {/* Upload / Sync */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-gold/30 bg-card p-5 shadow-card">
          <h3 className="mb-2 text-base md:text-lg font-semibold text-foreground">Upload Business Credit Report (PDF)</h3>
          <p className="mb-4 text-sm text-muted-foreground">Dun &amp; Bradstreet, Experian, Equifax, or Nav.</p>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-border px-4 py-2 hover:bg-accent text-sm">
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && onParseReport(e.target.files[0])}
            />
            {uploading ? "Parsing…" : "Choose File"}
          </label>
        </div>

        <div className="rounded-2xl border border-accent/30 bg-card p-5 shadow-card">
          <h3 className="mb-2 text-base md:text-lg font-semibold text-foreground">Sync from Bureaus</h3>
          <p className="mb-4 text-sm text-muted-foreground">Connect to business bureaus for automatic updates.</p>
          <button onClick={onSyncBureaus} className="rounded-xl bg-accent px-4 py-2 text-accent-foreground hover:opacity-90 text-sm">
            {syncing ? "Syncing…" : "Sync Now"}
          </button>
        </div>
      </div>

      {/* BUILD Ladder */}
      <div className="mb-6 rounded-2xl bg-card p-5 shadow-card ring-1 ring-border">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base md:text-lg font-semibold text-foreground">BUILD Ladder</h3>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(["B","U","I","L","D"] as const).map(key => (
            <StageBar
              key={key}
              label={labelFor(key)}
              percent={build.stages?.[key]?.percent ?? 0}
              onClick={() => onOpenStageTasks(key)}
            />
          ))}
        </div>
      </div>

      {/* Gauge + Vendor + Funding */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <GaugeCard score={build.score ?? 0} />
        <VendorTable vendors={vendors} onAddVendors={onAddVendors} />
        <FundingReadiness
          dscr={plaid.dscr}
          avgBalance={plaid.avg_balance_90d}
          paydex={bureaus.dnb?.paydex}
          intelliscore={bureaus.experian?.intelliscore}
          onOpenFundingPlan={onOpenFundingPlan}
        />
      </div>

      {/* Bureau Snapshot */}
      <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <BadgeCard title="D-U-N-S" status={bureaus.dnb?.status} />
        <BadgeCard title="Experian Business" status={bureaus.experian?.status} />
        <BadgeCard title="Equifax Business" status={bureaus.equifax?.status} />
      </div>

      {/* Insights */}
      <div className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-border">
        <h3 className="mb-2 text-base md:text-lg font-semibold text-foreground">Insights from Paige</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground text-sm">
          {insights?.length ? insights.map((t, i) => <li key={i}>{t}</li>) : <li>No insights yet.</li>}
        </ul>
        <div className="mt-4">
          <button onClick={onRunAssessment} className="rounded-xl border border-border px-4 py-2 text-foreground hover:bg-accent text-sm">
            Apply Recommendations
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- UI bits ---------- */

function KpiCard({ label, value, target, accent }: { label: string; value: number|string|undefined; target?: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 md:p-5 shadow-card ring-1 ring-border">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs md:text-sm text-muted-foreground">{label}</span>
        <span className={`h-2 w-2 rounded-full ${accent || "bg-muted"}`} />
      </div>
      <div className="text-xl md:text-2xl font-semibold text-foreground">{value ?? "—"}</div>
      {target && <div className="mt-1 text-xs text-muted-foreground">Target {target}</div>}
    </div>
  );
}

function StageBar({ label, percent, onClick }: { label: string; percent: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group rounded-xl border border-border p-3 text-left transition hover:bg-accent">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs md:text-sm font-medium text-foreground">{label}</span>
        <span className="text-xs text-muted-foreground">{Math.round(percent)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded bg-muted">
        <div className="h-full bg-gold transition-all" style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </button>
  );
}

function labelFor(k: "B"|"U"|"I"|"L"|"D") {
  return ({ B: "Base", U: "Utility", I: "Intermediate", L: "Leverage", D: "Develop" } as const)[k];
}

function GaugeCard({ score }: { score: number }) {
  const band = score >= 70 ? "text-emerald-600" : score >= 40 ? "text-amber-500" : "text-rose-500";
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-border">
      <div className="mb-2 text-sm text-muted-foreground">BUILD Score</div>
      <div className={`text-3xl md:text-4xl font-bold ${band}`}>{Math.round(score)}</div>
      <div className="mt-1 text-xs text-muted-foreground">70+ unlocks Funding Plan</div>
    </div>
  );
}

function VendorTable({ vendors, onAddVendors }: { vendors: Vendor[]; onAddVendors: () => void }) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-border">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Vendor Activity</div>
        <button onClick={onAddVendors} className="text-xs text-accent hover:underline">Add Starter Vendors</button>
      </div>
      <div className="divide-y divide-border">
        {vendors?.length ? vendors.map((v, i) => (
          <div key={i} className="flex items-center justify-between py-2 text-sm gap-2">
            <span className="text-foreground truncate">{v.name}</span>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-muted-foreground hidden sm:inline">{v.days_to_pay ?? "—"} days</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${v.status === "Reported" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : v.status === "Pending" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-muted text-muted-foreground"}`}>{v.status}</span>
              {v.early_pay && <span className="rounded-full bg-gold/20 px-2 py-0.5 text-xs text-gold-foreground hidden md:inline">Early</span>}
            </div>
          </div>
        )) : <div className="py-6 text-sm text-muted-foreground">No tradelines yet.</div>}
      </div>
    </div>
  );
}

function FundingReadiness({
  dscr, avgBalance, paydex, intelliscore, onOpenFundingPlan
}: { dscr?: number; avgBalance?: number; paydex?: number; intelliscore?: number; onOpenFundingPlan: () => void }) {
  const Item = ({ label, value, target }: { label: string; value: string; target: string }) => (
    <div className="flex items-center justify-between py-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value} <span className="ml-1 text-xs text-muted-foreground">({target})</span></span>
    </div>
  );
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-border">
      <div className="mb-2 text-sm text-muted-foreground">Funding Readiness</div>
      <Item label="DSCR" value={dscr?.toFixed(2) ?? "—"} target="≥ 1.25" />
      <Item label="Avg Balance (90d)" value={currency(avgBalance)} target="≥ $5,000" />
      <Item label="Paydex" value={`${paydex ?? "—"}`} target="≥ 80" />
      <Item label="Intelliscore" value={`${intelliscore ?? "—"}`} target="≥ 75" />
      <button onClick={onOpenFundingPlan} className="mt-3 w-full rounded-xl bg-foreground px-4 py-2 text-background hover:opacity-90 text-sm">View Funding Plan</button>
    </div>
  );
}

function BadgeCard({ title, status }: { title: string; status?: string }) {
  const badge = status || "Unknown";
  const tone =
    badge === "Verified" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
    badge === "Pending" ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
    badge === "Update Needed" ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" :
    "bg-muted text-muted-foreground";
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-border">
      <div className="mb-2 text-sm text-muted-foreground">{title}</div>
      <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs ${tone}`}>{badge}</span>
    </div>
  );
}
