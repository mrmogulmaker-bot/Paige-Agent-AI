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
  // Handlers are optional. When omitted (no real backend wired yet) the
  // corresponding buttons are hidden so paying subscribers never see a button
  // that only toasts "Coming Soon".
  onRunAssessment?: () => void;
  onSyncBureaus?: () => void;
  onParseReport?: (file: File) => void;
  onOpenStageTasks?: (stageKey: "B"|"U"|"I"|"L"|"D") => void;
  onAddVendors?: () => void;
  onOpenFundingPlan?: () => void;
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
          <h1 className="text-xl md:text-2xl font-bold text-foreground">BUILD Program — Business</h1>
          <p className="text-sm text-muted-foreground mt-1">Build fundable business credit with strategic account placement.</p>
        </div>
        <div className="flex gap-3">
          {onRunAssessment && (
            <button onClick={onRunAssessment} className="rounded-xl bg-primary px-5 py-2.5 text-primary-foreground shadow-md hover:shadow-lg hover:bg-primary-light transition-all text-sm md:text-base font-semibold">
              Run BUILD Assessment
            </button>
          )}
          {onSyncBureaus && (
            <button onClick={onSyncBureaus} className="rounded-xl border-2 border-border px-5 py-2.5 text-foreground hover:border-gold hover:bg-gold/5 transition-all text-sm md:text-base font-semibold">
              Sync Bureaus
            </button>
          )}
        </div>
      </div>

      {/* KPI Row */}
      <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Paydex" value={bureaus.dnb?.paydex ?? undefined} target="80+" accent="bg-gold" />
        <KpiCard label="Intelliscore" value={bureaus.experian?.intelliscore ?? undefined} target="75+" accent="bg-accent" />
        <KpiCard label="Avg Balance (90d)" value={currency(plaid.avg_balance_90d)} target="$5,000+" accent="bg-foreground" />
        <KpiCard label="Fundability %" value={percent(build.fundability_pct)} target="70%+" accent="bg-gold" />
      </div>

      {/* Upload / Sync — only render the cards whose handlers are wired. */}
      {(onParseReport || onSyncBureaus) && (
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {onParseReport && (
            <div className="rounded-2xl border-2 border-gold/40 bg-card p-6 shadow-card hover:shadow-glow transition-all">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-gold flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-base md:text-lg font-bold text-foreground">Upload Business Credit Report</h3>
                  <p className="text-xs text-muted-foreground mt-1">Dun &amp; Bradstreet, Experian, Equifax, or Nav.</p>
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center justify-center rounded-xl border-2 border-gold bg-gradient-gold px-5 py-2.5 hover:shadow-glow transition-all text-sm font-semibold text-primary">
                <input
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && onParseReport(e.target.files[0])}
                />
                {uploading ? "Parsing PDF..." : "Choose PDF File"}
              </label>
            </div>
          )}

          {onSyncBureaus && (
            <div className="rounded-2xl border-2 border-accent/40 bg-card p-6 shadow-card hover:shadow-glow-teal transition-all">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-gradient-accent flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-base md:text-lg font-bold text-foreground">Sync from Bureaus</h3>
                  <p className="text-xs text-muted-foreground mt-1">Connect for automatic updates.</p>
                </div>
              </div>
              <button onClick={onSyncBureaus} className="rounded-xl bg-accent px-5 py-2.5 text-accent-foreground hover:bg-accent-glow transition-all text-sm font-semibold shadow-md hover:shadow-glow-teal">
                {syncing ? "Syncing..." : "Sync Now"}
              </button>
            </div>
          )}
        </div>
      )}

      {/* BUILD Ladder */}
      <div className="mb-6 rounded-2xl bg-gradient-surface p-6 shadow-lg ring-1 ring-border">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base md:text-lg font-bold text-foreground">BUILD Ladder</h3>
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Progress Stages</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(["B","U","I","L","D"] as const).map(key => (
            <StageBar
              key={key}
              label={labelFor(key)}
              percent={build.stages?.[key]?.percent ?? 0}
              onClick={onOpenStageTasks ? () => onOpenStageTasks(key) : undefined}
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
        {onRunAssessment && (
          <div className="mt-4">
            <button onClick={onRunAssessment} className="rounded-xl border border-border px-4 py-2 text-foreground hover:bg-accent text-sm">
              Apply Recommendations
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- UI bits ---------- */

function KpiCard({ label, value, target, accent }: { label: string; value: number|string|undefined; target?: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-card p-4 md:p-5 shadow-card ring-1 ring-border hover:ring-2 hover:ring-gold/20 transition-all">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <span className={`h-3 w-3 rounded-full ${accent || "bg-muted"} shadow-sm`} />
      </div>
      <div className="text-xl md:text-2xl font-bold text-foreground">{value ?? "—"}</div>
      {target && <div className="mt-1 text-xs font-medium text-muted-foreground">Target: {target}</div>}
    </div>
  );
}

function StageBar({ label, percent, onClick }: { label: string; percent: number; onClick?: () => void }) {
  const isComplete = percent >= 100;
  const interactive = !!onClick;
  return (
    <button
      onClick={onClick}
      disabled={!interactive}
      className={`group rounded-xl border-2 p-3 text-left transition-all ${isComplete ? 'border-gold bg-gold/5 shadow-glow' : 'border-border'} ${interactive ? 'hover:border-gold/50 hover:bg-accent/5 cursor-pointer' : 'cursor-default'}`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className={`text-xs md:text-sm font-bold text-foreground transition-colors ${interactive ? 'group-hover:text-gold' : ''}`}>{label}</span>
        <span className={`text-xs font-semibold ${isComplete ? 'text-gold' : 'text-muted-foreground'}`}>{Math.round(percent)}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full transition-all duration-500 ${isComplete ? 'bg-gradient-gold shadow-glow' : 'bg-gold'}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
    </button>
  );
}

function labelFor(k: "B"|"U"|"I"|"L"|"D") {
  return ({ B: "Base", U: "Utility", I: "Intermediate", L: "Leverage", D: "Develop" } as const)[k];
}

function GaugeCard({ score }: { score: number }) {
  const band = score >= 70 ? "text-emerald-600 dark:text-emerald-400" : score >= 40 ? "text-gold" : "text-rose-500 dark:text-rose-400";
  const ringColor = score >= 70 ? "ring-emerald-500/20" : score >= 40 ? "ring-gold/20" : "ring-rose-500/20";
  return (
    <div className={`rounded-2xl bg-card p-6 shadow-card ring-2 ${ringColor} hover:shadow-lg transition-all`}>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">BUILD Score</div>
        <div className="w-2 h-2 rounded-full bg-gold shadow-glow"></div>
      </div>
      <div className={`text-4xl md:text-5xl font-black ${band} mb-2`}>{Math.round(score)}</div>
      <div className="text-xs font-medium text-muted-foreground">
        {score >= 70 ? "✓ Funding Ready" : "70+ unlocks Funding Plan"}
      </div>
    </div>
  );
}

function VendorTable({ vendors, onAddVendors }: { vendors: Vendor[]; onAddVendors?: () => void }) {
  return (
    <div className="rounded-2xl bg-card p-5 shadow-card ring-1 ring-border">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">Vendor Activity</div>
        {onAddVendors && (
          <button onClick={onAddVendors} className="text-xs text-accent hover:underline">Add Starter Vendors</button>
        )}
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
}: { dscr?: number; avgBalance?: number; paydex?: number; intelliscore?: number; onOpenFundingPlan?: () => void }) {
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
      {onOpenFundingPlan && (
        <button onClick={onOpenFundingPlan} className="mt-3 w-full rounded-xl bg-foreground px-4 py-2 text-background hover:opacity-90 text-sm">View Funding Plan</button>
      )}
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
