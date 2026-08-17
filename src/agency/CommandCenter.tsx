// @ts-nocheck
// Agency pack — Command Center screen. Faithful port of the Claude Design "CRM
// agency mode" pack Command Center (owner-locked 2026-08-17, §28/§63 — "We do not
// drift off this whatsoever"), mirroring the Solo port and the sibling agency
// modules (TeamBlock / SetupCard / PaigeBrain).
//
// Source of truth: "Agency Shell.dc.html" — the `command` view (its four sub-tabs:
// isDash main dashboard / isSystems Systems Check / isTeam Team Pulse / isPipe
// Prospect Pipeline) plus the six global overlays this screen owns: the All-drafts
// queue (draftsAllOpen), the Needs-attention modal (attnOpen), the autonomy Audit
// foldout+peek/change-log (auditOpen/auditPopOpen), the Top-deal modal with paging
// (dealOpen/dealIdx), the Stalled/read side panels (panelOpen), and the Full
// pipeline kanban (kanbanOpen). The DCLogic runtime is NOT ported — its markup,
// measurements, copy and interaction are mirrored onto React + the ./_shared
// primitives (Modal carries portal/focus-trap/Esc/reduced-motion).
//
// PORT NOTES (§13 honesty):
//  • Every color is token-driven (var(--…)) so the screen themes light↔dark under
//    `.paige-agency[data-theme]` (§23) — the design's literal hex is mapped onto the
//    agency-tokens.css scale, status accents (GREEN/AMBER/RED dials, meters, dots)
//    kept as the design's semantic marks.
//  • The Systems Check tab ports the design's own GRID-FALLBACK cluster layout
//    (dials + click-to-focus check list), not the heavy WebGL/canvas orbit ring the
//    DC runtime drives — the fallback is a first-class design layout, faithful to
//    the CLUSTERS/FINDINGS content and interaction. Noted, not hidden.
//  • The "Full pipeline" kanban is defined in the design's state (kanbanTitle /
//    kanbanToggle / columns over BOARD) but its markup was refactored out of the
//    shell; it is rebuilt here from that state as an in-tab Open/Hide toggle so the
//    kanbanOpen pop-out the task requires exists and is faithful to BOARD.
//
// §51: when isAgency===false (a standalone sub-account) this screen shows ONLY the
// sub's own book — the Team Pulse and Prospect Pipeline tabs, the cross-book "My
// agency / Whole book" scope toggle, the autonomy spread, and the cross-sub
// Needs-attention modal are all gated behind isAgency and are structurally absent.
// §63: the design's decorative fixture names are preserved verbatim.
import React from "react";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, Modal } from "./_shared";
import {
  AGENCY, CLUSTERS, FINDINGS, TEAM, DEPT_LOAD,
  STAGES, LIFECYCLE, BOARD, DEALS, AUDIT, TIER_META, SUBS, GREEN, AMBER
} from "./fixtures";
import { tmInit } from "./TeamBlock";
// Slice A wiring (§28 — only the DATA SOURCE changes, the ported design is frozen):
// the greeting, the KPI row, and the "Waiting on you" drafts queue read from the
// real adapter; every surface with no parentage-gated backend (cross-sub attention,
// autonomy/audit, vault, Systems Check, Team Pulse, Prospect Pipeline) keeps its
// frozen fixture markup and is truthfully flagged Preview (§13 — never fabricated).
import { useAgencyCommandCenter } from "./data/useAgencyCommandCenter";

// ── Screen-local fixtures (the design inlines these in its render logic — they are
//    NOT exported from ./fixtures, so they live here, ported verbatim). ──────────
const AGENCY_VAULT = [
  { due: "8d", dueColor: "var(--bad)", name: "Q3 payroll filing", detail: "Gusto · $18,400", pill: "Draft ready", pillBg: "var(--violet-tint)", pillColor: "var(--violet)" },
  { due: "12d", dueColor: "var(--warn)", name: "Agency E&O insurance", detail: "Hartwell Mutual · $4,120 / yr", pill: "Draft ready", pillBg: "var(--violet-tint)", pillColor: "var(--violet)" },
  { due: "34d", dueColor: "var(--ink-3)", name: "paigeagency.com renewal", detail: "Cloudflare · $22 / yr", pill: "Monitoring", pillBg: "var(--surface-sunk)", pillColor: "var(--ink-2)" }
];
const SOLO_VAULT = [
  { due: "past", dueColor: "var(--bad)", name: "Workers' compensation", detail: "Statewide Mutual · $1,120 / yr", pill: "Draft ready", pillBg: "var(--violet-tint)", pillColor: "var(--violet)" },
  { due: "7d", dueColor: "var(--warn)", name: "General liability policy", detail: "Hartwell Mutual · $2,340 / yr", pill: "Draft ready", pillBg: "var(--violet-tint)", pillColor: "var(--violet)" },
  { due: "12d", dueColor: "var(--ink-3)", name: "Accounting subscription", detail: "Ledgerly Pro · $85 / mo", pill: "Monitoring", pillBg: "var(--surface-sunk)", pillColor: "var(--ink-2)" }
];
const AUTONOMY_SPREAD = [
  { band: "90%+ autopilot", pct: "25%", count: "3", color: GREEN },
  { band: "60–89%", pct: "58%", count: "7", color: "var(--gold)" },
  { band: "Under 60%", pct: "17%", count: "2", color: AMBER }
];
const PIPE_KPIS = [
  { label: "PROSPECTS IN FLIGHT", value: "8", delta: "3 closing this week" },
  { label: "WEIGHTED PIPELINE", value: "$47K", delta: "MRR at close" },
  { label: "WIN RATE · 30 DAYS", value: "38%", delta: "5 of 13" },
  { label: "AVG TIME TO CLOSE", value: "24 days", delta: "down from 31" }
];
const PIPE_STALLS = [
  { who: "Hartline Group", note: "No stage change in 12 days. Price is the open question — the drafted reply names a number.", cta: "Read the nudge" },
  { who: "Alder & Co.", note: "Went quiet after discovery 18 days ago. Draft asks one question and closes the loop either way.", cta: "Read the nudge" }
];
const PIPE_READ = "Five of your eight prospects came from sub-account referrals, and those close in 19 days against 34 for cold outbound. The two objections that come up most are white-label reporting and month-to-month terms — both have drafted answers now.";
const WAITING_ON_YOU = [
  { who: "Bellweather Studio", what: "Proposal drafted, needs your approval", age: "9 days" },
  { who: "Hartline Group", what: "Follow-up written, overdue four days", age: "12 days" },
  { who: "Two inbound enquiries", what: "Discovery calls to schedule", age: "3 days" }
];
const WAITING_ON_THEM = [
  { who: "Fernwood Collective", what: "Contract out for signature", age: "2 days" },
  { who: "Kestrel Home Services", what: "Their legal is reading the DPA", age: "5 days" }
];
const TEAM_BLOCKED = [
  { who: "Tomas Klein", block: "Blocked on Ridgeline's ad account access — requested Friday, no response", age: "4 days" },
  { who: "Jon Whitaker", block: "Waiting on your approval of the Bellweather proposal before he can send", age: "9 days" },
  { who: "Marisol Reyes", block: "Two onboarding checklists overdue while she covers Sarah's launch", age: "2 days" }
];
const TEAM_READ = "Client Success has been at 94% for the third week running, and Ops crossed 95% on Monday. Two ways out: hire a second CSM, or route new sub-account onboarding to Paige on green tier for the next quarter. Onboarding is the task Marisol spends most of her overflow hours on.";

const toneVar = t => (t === "red" ? "var(--bad)" : t === "amber" ? "var(--warn)" : "var(--ok)");
const clusterTone = h => (h >= 90 ? "var(--ok)" : h >= 75 ? "var(--warn)" : "var(--bad)");
const noop = () => {};

// Time-of-day greeting from the real clock (never a hardcoded "morning"). Mirrors
// the Solo wiring — the design's static AGENCY.greetingWord is replaced by this.
const greetPhrase = () => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; };

// Honest marker for surfaces the adapter reports NO backend for (§13). The frozen
// fixture layout still renders as the sample it is — truthfully labeled, never a
// fabricated live value. Mirrors Solo's PreviewPill (the `pill pill-n` chip).
const PreviewPill = () => (
  <span className="pill pill-n" title="Sample layout — not yet wired to your live data">Preview</span>
);

// One-time keyframe injection for the KPI sparkline draw (the DC put this in its
// <helmet><style>; agency-tokens.css only ships `fi`). Idempotent + SSR-safe.
const CC_STYLE_ID = "cc-styles";
function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(CC_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = CC_STYLE_ID;
  el.textContent = "@keyframes ccDraw{from{stroke-dasharray:120;stroke-dashoffset:120}to{stroke-dasharray:120;stroke-dashoffset:0}}";
  document.head.appendChild(el);
}

// ── small presentational bits ─────────────────────────────────────────────────
// Tray-style toggle (the design's scope / range segment — white active pill on a
// sunk tray). Kept local so it matches the design exactly (ScopeSeg is the ink-fill
// gated agency↔book↔sub toggle, a different control).
const Seg = ({ items, value, onChange }) => (
  <div className="row" style={{ padding: 3, borderRadius: 10, background: "var(--surface-sunk)", border: "1px solid var(--line-soft)", flex: "none" }}>
    {items.map(l => {
      const on = value === l;
      return <button key={l} onClick={() => onChange(l)} style={{ padding: "6px 13px", borderRadius: 8, fontSize: 12.5, fontWeight: on ? 600 : 400, background: on ? "var(--surface)" : "transparent", color: on ? "var(--ink)" : "var(--ink-2)", boxShadow: on ? "var(--sh-1)" : "none", transition: ".15s" }}>{l}</button>;
    })}
  </div>
);

// Gold "act" CTA (§11 — gold spent only on the primary act). Dark ink on gold.
const GoldBtn = ({ children, onClick, style }) => (
  <button onClick={onClick} className="row" style={{ gap: 6, padding: "7px 13px", borderRadius: 9, background: "var(--gold-bright)", color: "#241C05", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", ...style }}>{children}</button>
);

// KPI card — REAL value when the adapter sourced it, an honest Preview chip when it
// did not (§13). No sparkline / delta: the RPCs return point-in-time with no history,
// so a fabricated trend line or "+7.5%" delta would be invented — dropped exactly as
// the Solo Metric does. The card shell (padding, label + value typography) is frozen.
const KpiCard = ({ k }) => (
  <div className="card" style={{ padding: "15px 17px" }}>
    <div className="row" style={{ alignItems: "flex-start", gap: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)", lineHeight: 1.45, maxWidth: 130 }}>{k.label.toUpperCase()}</div>
      {k.kind === "preview" && <span style={{ marginLeft: "auto", flex: "none" }}><PreviewPill /></span>}
    </div>
    <div className="row" style={{ alignItems: "baseline", gap: 8, marginTop: 14, flexWrap: "wrap", rowGap: 2 }}>
      {k.kind === "real"
        ? <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-.02em", minWidth: 0 }}>{k.value}</span>
        : <span style={{ fontSize: 22, fontWeight: 700, color: "var(--ink-3)", letterSpacing: "-.02em" }}>—</span>}
    </div>
  </div>
);

const KpiSkeleton = () => (
  <div className="card" style={{ padding: "15px 17px" }}>
    <div style={{ height: 9, width: "58%", background: "var(--surface-sunk)", borderRadius: 4 }} />
    <div style={{ height: 22, width: "48%", background: "var(--surface-sunk)", borderRadius: 5, marginTop: 18 }} />
  </div>
);

// One draft row (full form — icon, title, dept/kind chips, body, action row). Now
// bound to a real CommandApproval: Approve → execute-approval, Dismiss → RLS reject
// (both via the adapter's server-gated seams). "Read draft" stays the frozen design's
// static affordance (the body already renders inline). meta shows the real age only —
// the design's confidence figure has no backend, so it is dropped, not invented (§13).
const DraftRow = ({ a, first, onAct, busy }) => (
  <div style={{ borderTop: first ? "0" : "1px solid var(--line-soft)", padding: "12px 14px", display: "flex", gap: 11, minWidth: 0 }}>
    <div className="tile" style={{ width: 30, height: 30, borderRadius: 9, background: "var(--violet-tint)", color: "var(--violet)", flex: "none" }}><Ic.spark size={14} /></div>
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="row" style={{ gap: 9, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, minWidth: 0 }}>{a.title}</span>
        <span className="pill pill-n">{a.dept}</span>
        {a.type && <span className="pill pill-v">{a.type}</span>}
      </div>
      <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 7, lineHeight: 1.5 }}>{a.preview || "Paige has no draft body for this one yet."}</div>
      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap", rowGap: 7 }}>
        <button className="btn btn-s btn-p" disabled={busy} onClick={() => onAct(a.id, "ok")}><Ic.check size={12} />{busy ? "Working…" : "Approve"}</button>
        <button className="btn btn-s">Read draft</button>
        <button className="btn btn-s" disabled={busy} onClick={() => onAct(a.id, "no")}>Dismiss</button>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", whiteSpace: "nowrap" }}>⏱ {a.aging}</span>
      </div>
    </div>
  </div>
);

const DraftSkeleton = ({ first }) => (
  <div style={{ borderTop: first ? "0" : "1px solid var(--line-soft)", padding: "12px 14px", display: "flex", gap: 11 }}>
    <span className="tile" style={{ width: 30, height: 30, borderRadius: 9, background: "var(--surface-sunk)", flex: "none" }} />
    <div style={{ flex: 1, display: "grid", gap: 8 }}>
      <span style={{ height: 11, width: "52%", background: "var(--surface-sunk)", borderRadius: 4 }} />
      <span style={{ height: 9, width: "80%", background: "var(--surface-sunk)", borderRadius: 4 }} />
    </div>
  </div>
);

// Crafted empty state (§11 — never a bare "Loading…" / blank). Mirrors Solo's queue empty.
const EmptyQueue = ({ hasLive }) => (
  <div style={{ padding: "46px 20px", textAlign: "center", borderTop: "1px solid var(--line-soft)" }}>
    <div className="tile" style={{ margin: "0 auto 12px", width: 40, height: 40, borderRadius: 14, background: "var(--ok-tint)", color: "var(--ok)" }}><Ic.check size={20} /></div>
    <div style={{ fontWeight: 600 }}>{hasLive ? "Nothing in this window" : "Nothing waiting on you"}</div>
    <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4 }}>{hasLive ? "Switch to All to see the rest." : "Paige will raise the next thing when it earns your attention."}</div>
  </div>
);

// ── Main dashboard tab (isDash) ───────────────────────────────────────────────
const DashTab = ({ isAgency, acting, openAsk, enterSub }) => {
  const sub = !isAgency || !!acting;
  // §51 scope spine — the adapter owns the parentage-RPC gating from this context.
  const cc = useAgencyCommandCenter({ isAgency, acting });
  const [scope, setScope] = React.useState(sub ? "My work" : "My agency");
  const [range, setRange] = React.useState("Today");
  const [draftsAll, setDraftsAll] = React.useState(false);
  const [attn, setAttn] = React.useState(false);
  const [auditOpen, setAuditOpen] = React.useState(true);
  const [auditPop, setAuditPop] = React.useState(false);

  // Optimistic hide + toast on approve/decline (mirrors the Solo Command Center):
  // the resolved id disappears immediately, the seam refresh confirms, and on error
  // it is restored with a toast. §13 — reports what actually happened, never a hope.
  const [toast, setToast] = React.useState(null);
  const [resolved, setResolved] = React.useState(() => new Set());
  const [busyId, setBusyId] = React.useState(null);
  const flash = msg => { setToast(msg); setTimeout(() => setToast(null), 3200); };
  const onAct = async (id, k) => {
    const it = cc.approvals.find(x => x.id === id);
    setBusyId(id);
    setResolved(s => new Set(s).add(id));
    const res = k === "ok" ? await cc.approve(id) : await cc.decline(id);
    setBusyId(null);
    if (!res.ok) { setResolved(s => { const n = new Set(s); n.delete(id); return n; }); flash(res.error || "That didn't go through. Try again."); return; }
    flash(k === "ok" ? (it ? 'Approved — Paige is handling "' + it.title + '"' : "Approved.") : "Dismissed. Paige won't raise it again.");
  };
  const live = cc.approvals.filter(a => !resolved.has(a.id));
  const rangeKey = range === "Today" ? "today" : range === "This week" ? "week" : "all";
  const shown = live.filter(a => rangeKey === "all" || a.urgency === rangeKey);

  const vault = sub ? SOLO_VAULT : AGENCY_VAULT;
  const compassLine = (sub ? 74 : AGENCY.autopilotPct) + "% autopilot across " + AGENCY.departments + " departments";
  const vaultLine = sub
    ? (SOLO_VAULT.length + 12) + " obligations tracked"
    : AGENCY.vaultAgencyObligations + " agency obligations · " + AGENCY.vaultBookObligations + " due across your book";
  const vaultDue = String(sub ? 5 : AGENCY.vaultDue30);
  const vaultAction = String(sub ? 6 : AGENCY.vaultNeedAction);

  const audit = AUDIT.map(a => ({
    who: a.who, when: a.when, why: a.why,
    line: a.what + " · " + TIER_META[a.from].label + " → " + TIER_META[a.to].label,
    color: TIER_META[a.to].color
  }));
  const auditPeek = AUDIT.length + " changes logged · newest " + AUDIT[0].what + " → " + TIER_META[AUDIT[0].to].label;

  const attention = [
    { who: "Sarah's Coaching Practice", color: "#7C6CE0", amount: "$8,400", tone: "var(--gold)", cta: "Approve renewal", text: "Approve her renewal draft before Friday, when she opens Q4 planning. She has never negotiated on price." },
    { who: "Ridgeline Outdoor Co.", color: "#3F7F5C", amount: "6 days lost", tone: "var(--bad)", cta: "Fix the pixel", text: "Systems Check found a broken purchase pixel. Six days of attribution are already missing from their ad reporting." },
    { who: "Coach James Fitness", color: "#C1652F", amount: "22% off plan", tone: "var(--warn)", cta: "Read my draft", text: "Third month below plan. I drafted the conversation, including the two offers that carried him last winter." }
  ];
  // Decorative-only (see the CommandCenter header comment) — `attention` rows
  // have no real tenant id/account_number, so this never calls the real enterSub;
  // its button is disabled below rather than silently no-op on click (§13).

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* greeting + scope + Ask Paige */}
      <div className="row" style={{ alignItems: "flex-start", gap: 18, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: ".16em", color: "var(--ink-3)" }}>{cc.greeting.dateLabel.toUpperCase()}</span>
            <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>{greetPhrase() + ", " + cc.greeting.name + "."}</span>
          </div>
          <div style={{ fontSize: 14, color: "var(--ink-2)", marginTop: 7 }}>{cc.greeting.summary}</div>
        </div>
        <div className="row" style={{ marginLeft: "auto", gap: 10, flex: "none", flexWrap: "wrap" }}>
          <Seg items={sub ? ["My work", "Whole business"] : ["My agency", "Whole book"]} value={scope} onChange={setScope} />
          <button onClick={openAsk} className="btn btn-s"><span style={{ color: "var(--gold)" }}><Ic.spark size={14} /></span>Ask Paige</button>
        </div>
      </div>

      {/* KPI row — REAL where the adapter sourced it, honest Preview otherwise (§13) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 13, flex: "none" }}>
        {cc.metrics.loading
          ? [0, 1, 2, 3].map(i => <KpiSkeleton key={i} />)
          : cc.metrics.kpis.map((k, i) => <KpiCard key={i} k={k} />)}
      </div>

      {/* queue + sidebar */}
      <div style={{ flex: "1 1 0", minHeight: 0, display: "flex", gap: 16 }}>
        {/* Waiting on you */}
        <div className="card" style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0, overflow: "hidden" }}>
          <div className="row" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap", padding: "16px 18px 14px", flex: "none" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16.5, fontWeight: 600 }}>Waiting on you</div>
              <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 4 }}>Paige drafted it. You decide.</div>
            </div>
            <div className="row" style={{ marginLeft: "auto", gap: 8, flex: "none" }}>
              {isAgency && <button onClick={() => setAttn(true)} className="btn btn-s" style={{ height: 30 }}>Needs your attention · {AGENCY.needAttention}<Ic.arrow size={13} /></button>}
              <Seg items={["Today", "This week", "All"]} value={range} onChange={setRange} />
            </div>
          </div>
          <div className="pane" style={{ flex: "1 1 auto", minHeight: 0, minWidth: 0 }}>
            {cc.loading
              ? [0, 1, 2].map(i => <DraftSkeleton key={i} first={i === 0} />)
              : shown.length
                ? shown.map((a, i) => <DraftRow key={a.id} a={a} first={i === 0} onAct={onAct} busy={busyId === a.id} />)
                : <EmptyQueue hasLive={live.length > 0} />}
          </div>
          <button onClick={() => setDraftsAll(true)} className="row" style={{ gap: 8, padding: "9px 14px", borderTop: "1px solid var(--line-soft)", fontSize: 12, fontWeight: 600, color: "var(--warn)", flex: "none", justifyContent: "flex-start" }}>
            Open the full queue · {live.length}<span style={{ marginLeft: "auto", color: "var(--ink-3)" }}>›</span>
          </button>
          <div className="row" style={{ gap: 10, padding: "11px 15px", borderTop: "1px solid var(--line-soft)", flex: "none" }}>
            <button className="btn btn-s grow" style={{ justifyContent: "center" }}><span style={{ color: "var(--gold)" }}><Ic.bolt size={13} /></span>Put Paige to work · {sub ? "2 of 5" : "4 of 9"}</button>
            <button className="btn btn-s grow" style={{ justifyContent: "center" }}><span style={{ color: "var(--ink-3)" }}><Ic.pulse size={13} /></span>Activity · {sub ? "6" : "14"}</button>
          </div>
        </div>

        {/* sidebar: Trust Compass + Vault */}
        <aside style={{ width: 312, flex: "none", display: "flex", flexDirection: "column", gap: 10, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 2 }}>
          <div className="card" style={{ padding: "16px 18px", flex: "none" }}>
            <div className="row" style={{ alignItems: "flex-start" }}>
              <div>
                <div className="row" style={{ gap: 8 }}><div style={{ fontSize: 14, fontWeight: 600 }}>Trust Compass</div><PreviewPill /></div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4 }}>{compassLine}</div>
              </div>
              <span style={{ marginLeft: "auto", color: "var(--ink-3)", display: "flex" }}><Ic.shield size={15} /></span>
            </div>
            {isAgency && !acting && (
              <div style={{ marginTop: 14, paddingTop: 13, borderTop: "1px solid var(--line-soft)", display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)" }}>SUB-ACCOUNT AUTONOMY SPREAD</div>
                {AUTONOMY_SPREAD.map(a => (
                  <div key={a.band} className="row" style={{ gap: 10 }}>
                    <span style={{ fontSize: 12, color: "var(--ink-2)", width: 86 }}>{a.band}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 4, background: "var(--surface-sunk)", overflow: "hidden" }}>
                      <div style={{ height: "100%", width: a.pct, background: a.color }} />
                    </div>
                    <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>{a.count}</span>
                  </div>
                ))}
              </div>
            )}
            {/* autonomy change-log — peek + foldout, "Change log →" opens the pop */}
            <div style={{ marginTop: 12, paddingTop: 11, borderTop: "1px solid var(--line-soft)" }}>
              <div className="row" style={{ gap: 10 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600 }}>Recent changes</div>
                <button onClick={() => setAuditOpen(o => !o)} style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "var(--warn)", flex: "none" }}>{auditOpen ? "Hide" : "Show"}</button>
              </div>
              {auditOpen ? (
                <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
                  {audit.slice(0, 3).map((a, i) => (
                    <div key={i} className="row" style={{ alignItems: "flex-start", gap: 11, padding: "9px 0", borderBottom: "1px solid var(--line-soft)" }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: a.color, flex: "none", marginTop: 5 }} />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.line}</div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.4 }}>{a.who} · {a.why}</div>
                      </div>
                      <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{a.when}</span>
                    </div>
                  ))}
                  <button onClick={() => setAuditPop(true)} style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: "var(--warn)", textAlign: "left" }}>Change log →</button>
                </div>
              ) : (
                <div className="row" style={{ gap: 9, marginTop: 9, fontSize: 11, color: "var(--ink-3)" }}>
                  <span className="grow trunc">{auditPeek}</span>
                  <button onClick={() => setAuditPop(true)} style={{ fontWeight: 600, color: "var(--warn)", flex: "none" }}>Change log →</button>
                </div>
              )}
            </div>
          </div>

          <div className="card" style={{ padding: "11px 14px", flex: "none", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div className="row" style={{ alignItems: "flex-start", flex: "none" }}>
              <div>
                <div className="row" style={{ gap: 8 }}><div style={{ fontSize: 14, fontWeight: 600 }}>Business Vault</div><PreviewPill /></div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 5 }}>{vaultLine}</div>
              </div>
              <span style={{ marginLeft: "auto", color: "var(--ink-3)", display: "flex" }}><Ic.vault size={15} /></span>
            </div>
            <div className="row" style={{ gap: 22, margin: "11px 0 2px", flex: "none" }}>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".12em", color: "var(--ink-3)" }}>DUE IN 30 DAYS</div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 3 }}>{vaultDue}</div>
              </div>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".12em", color: "var(--ink-3)" }}>NEED YOUR ACTION</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "var(--warn)", marginTop: 3 }}>{vaultAction}</div>
              </div>
            </div>
            <div style={{ flex: "none", marginTop: 8 }}>
              {vault.map((v, i) => (
                <div key={i} className="row" style={{ gap: 12, padding: "11px 0", borderTop: "1px solid var(--line-soft)" }}>
                  <span className="mono" style={{ fontSize: 11.5, color: v.dueColor, width: 34, flex: "none" }}>{v.due}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500 }}>{v.name}</div>
                    <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 3 }}>{v.detail}</div>
                  </div>
                  <span className="pill" style={{ marginLeft: "auto", background: v.pillBg, color: v.pillColor, flex: "none" }}>{v.pill}</span>
                </div>
              ))}
            </div>
            <button className="btn btn-s" style={{ justifyContent: "center", marginTop: 8, flex: "none" }}>Open Business Vault →</button>
          </div>
        </aside>
      </div>

      {/* ── pop-outs ── */}
      {/* All-drafts queue (draftsAllOpen) */}
      <Modal open={draftsAll} onClose={() => setDraftsAll(false)} size={700} title={"Waiting on you · " + live.length} sub="Paige drafted it. You decide." pad="0">
        <div>
          {live.length ? live.map((a) => (
            <div key={a.id} className="row" style={{ gap: 12, padding: "15px 20px", borderBottom: "1px solid var(--line-soft)", alignItems: "flex-start" }}>
              <div className="tile" style={{ width: 30, height: 30, borderRadius: 9, background: "var(--violet-tint)", color: "var(--violet)", flex: "none" }}><Ic.spark size={14} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 9, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{a.title}</span>
                  <span className="pill pill-n">{a.dept}</span>
                  {a.type && <span className="pill pill-v">{a.type}</span>}
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", flex: "none" }}>⏱ {a.aging}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>{a.preview || "Paige has no draft body for this one yet."}</div>
                <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <GoldBtn onClick={() => onAct(a.id, "ok")}><Ic.check size={12} />{busyId === a.id ? "Working…" : "Approve"}</GoldBtn>
                  <button className="btn btn-s">Read draft</button>
                  <button className="btn btn-s" onClick={() => onAct(a.id, "no")}>Dismiss</button>
                </div>
              </div>
            </div>
          )) : (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 13, color: "var(--ink-2)" }}>Nothing waiting on you — Paige will raise the next thing when it earns your attention.</div>
            </div>
          )}
        </div>
      </Modal>

      {/* Needs-attention modal (attnOpen) — agency only, cross-sub */}
      {isAgency && (
        <Modal open={attn} onClose={() => setAttn(false)} size={660} title={<span className="row" style={{ gap: 8 }}>Needs your attention today <PreviewPill /></span>} sub={"Ranked by dollar impact across all " + AGENCY.subCount + " sub-accounts."}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {attention.map((a, i) => (
              <div key={i} style={{ border: "1px solid var(--line-soft)", borderLeft: "3px solid " + a.tone, borderRadius: "var(--r-m)", padding: "14px 15px", background: "var(--surface-2)" }}>
                <div className="row" style={{ gap: 9, marginBottom: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: a.color, flex: "none" }} />
                  <span style={{ fontSize: 14, fontWeight: 600, minWidth: 0 }}>{a.who}</span>
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 12.5, color: a.tone, flex: "none" }}>{a.amount}</span>
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)" }}>{a.text}</div>
                <div className="row" style={{ gap: 9, marginTop: 13 }}>
                  <GoldBtn style={{ padding: "9px 15px", fontSize: 13 }}>{a.cta}</GoldBtn>
                  <button disabled title="Real per-sub-account jump lands once this panel reads the real roster" className="btn btn-s" style={{ opacity: 0.5, cursor: "not-allowed" }}>Open sub-account</button>
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* Autonomy change-log pop (auditPopOpen) */}
      <Modal open={auditPop} onClose={() => setAuditPop(false)} size={640} title={<span className="row" style={{ gap: 8 }}>Recent changes <PreviewPill /></span>}>
        <div>
          {audit.map((a, i) => (
            <div key={i} className="row" style={{ alignItems: "flex-start", gap: 12, padding: "13px 0", borderBottom: "1px solid var(--line-soft)" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: a.color, flex: "none", marginTop: 6 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{a.line}</div>
                <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.5 }}>{a.who} · {a.why}</div>
              </div>
              <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", flex: "none" }}>{a.when}</span>
            </div>
          ))}
        </div>
      </Modal>

      {toast && <div className="fade-in" style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--rail)", color: "var(--ink-inv)", padding: "11px 18px", borderRadius: 12, fontSize: 13, boxShadow: "var(--sh-3)", zIndex: 60, maxWidth: "min(560px,90vw)" }}>{toast}</div>}
    </div>
  );
};

// ── Systems Check tab (isSystems) ─────────────────────────────────────────────
const SystemsTab = ({ isAgency, acting }) => {
  const sub = !isAgency || !!acting;
  const [focusKey, setFocusKey] = React.useState(null);
  const clusters = CLUSTERS.map(c => ({ ...c, tone: clusterTone(c.health) }));
  const focus = focusKey ? CLUSTERS.find(c => c.key === focusKey) : null;
  const passTotal = CLUSTERS.reduce((a, c) => a + c.pass, 0);
  const total = CLUSTERS.reduce((a, c) => a + c.total, 0);
  const open = FINDINGS.length, urgent = FINDINGS.filter(f => f.tone === "red").length;
  const clusterSummary = open + " findings open · " + urgent + " needs a decision today · " + passTotal + " checks clean";
  const header = sub
    ? AGENCY.checksTotal + " checks running continuously across " + (acting ? acting.name : "this sub-account") + ". Every finding arrives with the fix drafted."
    : AGENCY.checksLive + " of " + AGENCY.checksTotal + " checks running continuously across your agency's own operation. Every finding arrives with the fix drafted.";
  const scopeNote = sub ? "This sub-account's own systems." : "Your agency's own systems — not your sub-accounts'. Each of theirs is watched inside their workspace.";

  return (
    <>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
        <div>
          <div className="row" style={{ gap: 11 }}>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.02em" }}>Systems Check</div>
            <span className="pill pill-ok" style={{ height: 24 }}><span className="dot" />Scanning continuously</span>
            <PreviewPill />
          </div>
          <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 6 }}>{header}</div>
        </div>

        <div className="card" style={{ flex: 1, minHeight: 0, padding: "17px 18px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div className="row" style={{ alignItems: "baseline", gap: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>What she is watching</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{scopeNote}</div>
            {focus && <button onClick={() => setFocusKey(null)} style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "var(--warn)", flex: "none" }}>← Back to all clusters</button>}
          </div>

          {focus ? (
            <div className="fade-in" style={{ flex: 1, minHeight: 0, overflowY: "auto", marginTop: 12 }}>
              <div className="row" style={{ gap: 14, marginBottom: 12 }}>
                <div style={{ width: 62, height: 62, borderRadius: "50%", background: "conic-gradient(from -90deg," + clusterTone(focus.health) + " 0 " + focus.health + "%, var(--surface-sunk) " + focus.health + "% 100%)", display: "grid", placeItems: "center", flex: "none" }}>
                  <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 14.5, fontWeight: 700, color: clusterTone(focus.health) }}>{focus.health}</div>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{focus.key}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 3 }}>{focus.pass} of {focus.total} passing · {focus.note}</div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(220px,100%),1fr))", gap: 9 }}>
                {focus.items.map((it, i) => (
                  <div key={i} className="row" style={{ gap: 9, padding: "9px 11px", border: "1px solid var(--line-soft)", borderRadius: 9, background: "var(--surface-2)" }}>
                    <span style={{ width: 18, height: 18, flex: "none", borderRadius: "50%", background: it.ok ? "var(--ok-tint)" : "var(--bad-tint)", color: it.ok ? "var(--ok)" : "var(--bad)", display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700 }}>{it.ok ? "✓" : "!"}</span>
                    <span style={{ fontSize: 12, lineHeight: 1.3 }}>{it.n}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(200px,100%),1fr))", gap: 10, alignContent: "start" }}>
              {clusters.map(c => (
                <button key={c.key} onClick={() => setFocusKey(c.key)} className="row" style={{ gap: 12, padding: "11px 12px", border: "1px solid var(--line-soft)", borderRadius: 11, background: "var(--surface)", minWidth: 0, textAlign: "left" }}>
                  <div style={{ width: 46, height: 46, flex: "none", borderRadius: "50%", background: "conic-gradient(from -90deg," + c.tone + " 0 " + c.health + "%, var(--surface-sunk) " + c.health + "% 100%)", display: "grid", placeItems: "center" }}>
                    <div style={{ width: 35, height: 35, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: c.tone }}>{c.health}</div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>{c.key}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>{c.pass} of {c.total} passing</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{c.note}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="row" style={{ borderTop: "1px solid var(--line-soft)", paddingTop: 11, marginTop: 6, gap: 12 }}>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{clusterSummary}</div>
            <div style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-3)", flex: "none" }}>{passTotal}/{total} checks passing</div>
          </div>
        </div>
      </div>

      <aside style={{ width: 340, flex: "none", display: "flex", flexDirection: "column", gap: 12, minHeight: 0 }}>
        <div className="card" style={{ padding: 17, display: "flex", flexDirection: "column", gap: 12, minHeight: 0, flex: 1 }}>
          <div>
            <div style={{ fontSize: 16.5, fontWeight: 600 }}>Open findings</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 5 }}>Ranked by what it costs to leave alone.</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, overflowY: "auto", minHeight: 0 }}>
            {FINDINGS.map((f, i) => {
              const c = f.tone === "red" ? "var(--bad)" : "var(--warn)";
              return (
                <div key={i} style={{ border: "1px solid var(--line-soft)", borderLeft: "3px solid " + c, borderRadius: 11, padding: "12px 13px", background: "var(--surface-2)" }}>
                  <div className="row" style={{ gap: 8, marginBottom: 7 }}>
                    <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{f.cluster}</span>
                    <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: c }}>{f.cost}</span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{f.title}</div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 6 }}>{f.body}</div>
                  <div className="row" style={{ gap: 8, marginTop: 11 }}>
                    <GoldBtn style={{ fontSize: 12 }}>{f.fix}</GoldBtn>
                    <span className="pill" style={{ background: f.tone === "red" ? "var(--bad-tint)" : "var(--warn-tint)", color: c }}>Fix ready</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>{f.age}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </aside>
    </>
  );
};

// ── Team Pulse tab (isTeam) — agency only ─────────────────────────────────────
const TeamTab = ({ openAsk }) => {
  const byName = {}; SUBS.forEach(s => { byName[s.name] = s; });
  const team = TEAM.map(m => {
    const tone = m.util > 95 ? "var(--bad)" : m.util >= 80 ? "var(--warn)" : "var(--ok)";
    return {
      name: m.name, role: m.role, hours: m.hours, focus: m.focus, util: m.util + "%",
      tone, initials: tmInit(m.name),
      chips: m.subs.slice(0, 4).map(n => ({ color: (byName[n] || {}).color || "var(--gold)", initials: tmInit(n) })),
      overflow: m.subs.length > 4 ? "+" + (m.subs.length - 4) : "",
      subsLabel: m.subs.length === 0 ? "Agency-side work only" : m.subs.length + " assigned"
    };
  });
  const deptLoad = DEPT_LOAD.map(d => ({ dept: d.dept, pct: d.pct + "%", color: toneVar(d.tone) }));
  const newHires = TEAM.filter(m => m.newHire).map(m => ({ name: m.name, role: m.role, day: m.newHire, pct: m.onboard, initials: tmInit(m.name) }));
  const header = TEAM.length + " team members · " + TEAM.filter(m => m.util >= 90).length + " slammed · " + TEAM.filter(m => m.util < 75).length + " available for new work";

  return (
    <>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
        <div>
          <div className="row" style={{ gap: 11 }}><div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.02em" }}>Team pulse</div><PreviewPill /></div>
          <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 6 }}>{header}</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 12, alignContent: "start", paddingRight: 4 }}>
          {team.map((m, i) => (
            <div key={i} className="card" style={{ padding: "14px 15px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="row" style={{ gap: 11 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--rail-2)", color: "var(--ink-inv)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 600, flex: "none" }}>{m.initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.25 }}>{m.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{m.role}</div>
                </div>
                <div style={{ marginLeft: "auto", textAlign: "right", flex: "none" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: m.tone }}>{m.util}</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{m.hours} logged</div>
                </div>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: "var(--surface-sunk)", overflow: "hidden" }}>
                <div style={{ height: "100%", width: m.util, background: m.tone }} />
              </div>
              <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--ink-2)" }}>{m.focus}</div>
              <div className="row" style={{ gap: 6, marginTop: "auto" }}>
                {m.chips.map((c, j) => <span key={j} style={{ width: 22, height: 22, borderRadius: 6, background: c.color, color: "#fff", display: "grid", placeItems: "center", fontSize: 9.5, fontWeight: 700 }}>{c.initials}</span>)}
                {m.overflow && <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{m.overflow}</span>}
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-3)" }}>{m.subsLabel}</span>
              </div>
            </div>
          ))}

          <div className="card" style={{ gridColumn: "1 / -1", padding: "15px 17px" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Workload across the {AGENCY.departments} departments</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 12 }}>
              {deptLoad.map((d, i) => (
                <div key={i} className="row" style={{ gap: 11 }}>
                  <span style={{ fontSize: 12.5, color: "var(--ink-2)", width: 118, flex: "none" }}>{d.dept}</span>
                  <div style={{ flex: 1, height: 8, borderRadius: 5, background: "var(--surface-sunk)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: d.pct, background: d.color }} />
                  </div>
                  <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-2)", width: 40, textAlign: "right", flex: "none" }}>{d.pct}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card" style={{ gridColumn: "1 / -1", padding: "15px 17px", background: "var(--violet-tint)", borderColor: "var(--violet-line)" }}>
            <div className="row" style={{ gap: 9 }}>
              <span style={{ color: "var(--violet)", display: "flex" }}><Ic.spark size={14} /></span>
              <div style={{ fontSize: 15, fontWeight: 600, color: "var(--violet)" }}>Paige's read on team health</div>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 9 }}>{TEAM_READ}</div>
            <button onClick={openAsk} className="btn btn-s" style={{ marginTop: 12, color: "var(--violet)", borderColor: "var(--violet-line)" }}>Explore in Ask Paige</button>
          </div>
        </div>
      </div>

      <aside style={{ width: 322, flex: "none", display: "flex", flexDirection: "column", gap: 13, minHeight: 0 }}>
        <div className="card" style={{ padding: 17, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 16.5, fontWeight: 600 }}>Who needs help today</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12, overflowY: "auto", minHeight: 0 }}>
            {TEAM_BLOCKED.map((b, i) => (
              <div key={i} style={{ border: "1px solid var(--line-soft)", borderRadius: 11, padding: "11px 12px", background: "var(--surface-2)" }}>
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600 }}>{b.who}</span>
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>{b.age}</span>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 6 }}>{b.block}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 17, flex: "none" }}>
          <div style={{ fontSize: 16.5, fontWeight: 600 }}>Recent hires</div>
          {newHires.map((h, i) => (
            <div key={i} style={{ marginTop: 12 }}>
              <div className="row" style={{ gap: 10 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--rail-2)", color: "var(--ink-inv)", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 600, flex: "none" }}>{h.initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{h.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{h.role} · {h.day}</div>
                </div>
                <span className="mono" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-2)" }}>{h.pct}</span>
              </div>
              <div style={{ height: 6, borderRadius: 4, background: "var(--surface-sunk)", overflow: "hidden", marginTop: 9 }}>
                <div style={{ height: "100%", width: h.pct, background: "var(--gold)" }} />
              </div>
            </div>
          ))}
        </div>
      </aside>
    </>
  );
};

// ── Prospect Pipeline tab (isPipe) — agency only ──────────────────────────────
const PipeTab = ({ openAsk }) => {
  const [dealIdx, setDealIdx] = React.useState(null);
  const [panel, setPanel] = React.useState(null);
  const [kanbanOpen, setKanbanOpen] = React.useState(false);

  const shades = ["#EADFC2", "#DCC079", "#C8A02E", "#8A6D1E"];
  const stageTotal = STAGES.reduce((a, s) => a + s.weighted, 0);
  let acc = 0;
  const donut = "conic-gradient(from -90deg," + STAGES.map((s, i) => {
    const from = (acc / stageTotal) * 100; acc += s.weighted; return shades[i] + " " + from.toFixed(2) + "% " + ((acc / stageTotal) * 100).toFixed(2) + "%";
  }).join(",") + ")";
  const stageLegend = STAGES.map((s, i) => ({ key: s.key, meta: s.count + " · " + s.label, color: shades[i] }));
  const maxLife = LIFECYCLE.reduce((a, l) => Math.max(a, l.count), 0);
  const lifecycle = LIFECYCLE.map(l => ({ ...l, ring: "conic-gradient(from -90deg," + l.color + " 0 " + ((l.count / maxLife) * 100).toFixed(1) + "%, var(--surface-sunk) " + ((l.count / maxLife) * 100).toFixed(1) + "% 100%)" }));

  const top = DEALS.slice(0, 3);
  const stageBg = st => (st === "Closing" ? "var(--ok-tint)" : st === "Negotiation" ? "var(--warn-tint)" : "var(--surface-sunk)");
  const stageColor = st => (st === "Closing" ? "var(--ok)" : st === "Negotiation" ? "var(--warn)" : "var(--ink-2)");
  const entryTiles = [
    { label: "TOP PRIORITY", value: String(top.length), unit: "decisions drafted", note: "Closing soonest · " + DEALS[0].name.split(" ")[0] + " first", tone: "var(--gold)", onClick: () => setDealIdx(0) },
    { label: "STALLED", value: "2", unit: "prospects not moving", note: "Longest sat 18 days · nudges written", tone: "var(--warn)", onClick: () => setPanel("stalls") },
    { label: "PAIGE'S READ", value: "5 of 8", unit: "came from referrals", note: "Referrals close in 19 days, cold in 34", tone: "var(--violet)", onClick: () => setPanel("read") }
  ];

  const kanCols = ["Discovery", "Proposal", "Negotiation", "Closing", "Won", "Lost"].map(k => {
    const cards = BOARD.filter(b => b.stage === k);
    const tone = k === "Won" ? "var(--ok)" : k === "Lost" ? "var(--ink-3)" : k === "Closing" ? "var(--gold)" : "var(--ink-3)";
    return { key: k, tone, count: cards.length, cards: cards.map(c => ({ name: c.name, mrr: c.mrr, days: c.days + "d", dayColor: c.days >= 14 ? "var(--bad)" : c.days >= 7 ? "var(--warn)" : "var(--ink-3)" })) };
  });

  const d = dealIdx === null ? null : top[dealIdx];

  return (
    <>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14, minHeight: 0 }}>
        <div>
          <div className="row" style={{ gap: 11 }}><div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.02em" }}>Prospect Pipeline</div><PreviewPill /></div>
          <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 6 }}>{AGENCY.pipeProspects} active prospects · {AGENCY.pipeWeighted} weighted · {AGENCY.pipeClosing} closing this week</div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(292px,100%),1fr))", gap: 12, flex: "none" }}>
          <div className="card" style={{ padding: "15px 17px" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Where the money sits</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Weighted value by stage.</div>
            <div className="row" style={{ gap: 14, marginTop: 12 }}>
              <div style={{ width: 84, height: 84, borderRadius: "50%", background: donut, display: "grid", placeItems: "center", flex: "none" }}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "var(--surface)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.02em" }}>{stageTotal}K</div>
                  <div style={{ fontSize: 9.5, color: "var(--ink-3)" }}>weighted</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
                {stageLegend.map(s => (
                  <div key={s.key} className="row" style={{ gap: 9, minWidth: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: s.color, flex: "none" }} />
                    <span style={{ fontSize: 12.5 }}>{s.key}</span>
                    <span className="mono" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-2)", whiteSpace: "nowrap", flex: "none" }}>{s.meta}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: "15px 17px" }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Who sits where</div>
            <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Everyone in your book, by stage of the relationship.</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, marginTop: 12 }}>
              {lifecycle.map(l => (
                <div key={l.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, minWidth: 0 }}>
                  <div style={{ width: 54, height: 54, borderRadius: "50%", background: l.ring, display: "grid", placeItems: "center", flex: "none" }}>
                    <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 13.5, fontWeight: 700, color: l.color }}>{l.count}</div>
                  </div>
                  <div style={{ textAlign: "center", minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, fontWeight: 600, lineHeight: 1.25 }}>{l.key}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2, lineHeight: 1.3 }}>{l.note}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 12, flex: "none" }}>
          {PIPE_KPIS.map((k, i) => (
            <div key={i} className="card" style={{ padding: "14px 16px" }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".12em", color: "var(--ink-3)" }}>{k.label}</div>
              <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.02em", marginTop: 10 }}>{k.value}</div>
              <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 5 }}>{k.delta}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(214px,100%),1fr))", gap: 12, flex: "none" }}>
          {entryTiles.map((t, i) => (
            <button key={i} onClick={t.onClick} className="card" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 7, minHeight: 118, textAlign: "left" }}>
              <div className="row" style={{ gap: 9 }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: t.tone, flex: "none" }} />
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".14em", color: "var(--ink-3)" }}>{t.label}</span>
              </div>
              <div className="row" style={{ alignItems: "baseline", gap: 9 }}>
                <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>{t.value}</span>
                <span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{t.unit}</span>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45 }}>{t.note}</div>
              <div style={{ marginTop: "auto", fontSize: 12.5, fontWeight: 600, color: "var(--warn)" }}>Open →</div>
            </button>
          ))}
        </div>

        {/* Full pipeline kanban (kanbanOpen) — Open/Hide toggle over BOARD */}
        <div className="card" style={{ padding: "13px 16px", flex: "none" }}>
          <div className="row" style={{ gap: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Full pipeline</div>
            <button onClick={() => setKanbanOpen(o => !o)} className="btn btn-s" style={{ marginLeft: "auto", height: 30 }}>{kanbanOpen ? "Hide" : "Open"}</button>
          </div>
          {kanbanOpen && (
            <div className="fade-in" style={{ display: "flex", gap: 12, overflowX: "auto", marginTop: 12, paddingBottom: 4 }}>
              {kanCols.map(col => (
                <div key={col.key} style={{ width: 190, flex: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 3, background: col.tone, flex: "none" }} />
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{col.key}</span>
                    <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>{col.count}</span>
                  </div>
                  {col.cards.map((c, j) => (
                    <div key={j} style={{ border: "1px solid var(--line-soft)", borderRadius: 10, padding: "10px 11px", background: "var(--surface-2)" }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0 }} className="trunc">{c.name}</div>
                      <div className="row" style={{ gap: 8, marginTop: 6 }}>
                        <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-2)" }}>{c.mrr}</span>
                        <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: c.dayColor }}>{c.days}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <aside style={{ width: 322, flex: "none", display: "flex", flexDirection: "column", gap: 13, minHeight: 0, overflowY: "auto", paddingRight: 2 }}>
        <div className="card" style={{ padding: 17, flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 16.5, fontWeight: 600 }}>Waiting on you</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 12, overflowY: "auto", minHeight: 0 }}>
            {WAITING_ON_YOU.map((w, i) => (
              <div key={i} className="row" style={{ alignItems: "flex-start", gap: 10, paddingBottom: 11, borderBottom: "1px solid var(--line-soft)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{w.who}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.45 }}>{w.what}</div>
                </div>
                <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--warn)", flex: "none" }}>{w.age}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card" style={{ padding: 17, flex: "none" }}>
          <div style={{ fontSize: 16.5, fontWeight: 600 }}>Waiting on prospects</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 12 }}>
            {WAITING_ON_THEM.map((w, i) => (
              <div key={i} className="row" style={{ alignItems: "flex-start", gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{w.who}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.45 }}>{w.what}</div>
                </div>
                <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", flex: "none" }}>{w.age}</span>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Top-deal modal with paging (dealOpen/dealIdx) */}
      <Modal open={d !== null} onClose={() => setDealIdx(null)} size={720} title="Top priority · closing soonest"
        foot={d && (
          <>
            <GoldBtn style={{ padding: "11px 20px", fontSize: 14 }}><Ic.check size={12} />Approve</GoldBtn>
            <button className="btn">{d.cta}</button>
            <button className="btn" style={{ color: "var(--ink-2)" }}>Dismiss</button>
            <button onClick={() => setDealIdx((dealIdx + 1) % top.length)} style={{ marginLeft: "auto", fontSize: 13, fontWeight: 600, color: "var(--warn)", flex: "none" }}>Next decision →</button>
          </>
        )}>
        {d && (
          <div>
            <div className="row" style={{ gap: 10, marginBottom: 16 }}>
              <button onClick={() => setDealIdx((dealIdx - 1 + top.length) % top.length)} className="btn btn-s" style={{ width: 28, height: 28, padding: 0, justifyContent: "center" }}>‹</button>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{dealIdx + 1} of {top.length}</span>
              <button onClick={() => setDealIdx((dealIdx + 1) % top.length)} className="btn btn-s" style={{ width: 28, height: 28, padding: 0, justifyContent: "center" }}>›</button>
            </div>
            <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-.02em" }}>{d.name}</div>
              <span className="pill" style={{ background: stageBg(d.stage), color: stageColor(d.stage) }}>{d.stage}</span>
              <span className="mono" style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-3)", flex: "none" }}>{d.age} in this stage</span>
            </div>
            <div className="row" style={{ alignItems: "baseline", gap: 10, marginTop: 16 }}>
              <span style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-.03em" }}>{d.mrr}</span>
              <span style={{ fontSize: 13.5, color: "var(--ink-2)" }}>MRR at close</span>
            </div>
            <div style={{ marginTop: 20, padding: "15px 16px", border: "1px solid var(--line-soft)", borderRadius: "var(--r-m)", background: "var(--surface-2)" }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)" }}>NEXT ACTION</div>
              <div style={{ fontSize: 15, lineHeight: 1.55, marginTop: 7 }}>{d.next}</div>
            </div>
            <div style={{ marginTop: 12, padding: "15px 16px", border: "1px solid var(--violet-line)", borderRadius: "var(--r-m)", background: "var(--violet-tint)" }}>
              <div className="row" style={{ gap: 9 }}>
                <span style={{ color: "var(--violet)", display: "flex" }}><Ic.spark size={13} /></span>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--violet)" }}>Paige's read</div>
              </div>
              <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 8 }}>{d.read}</div>
            </div>
          </div>
        )}
      </Modal>

      {/* Stalled / read side panels (panelOpen) */}
      <Modal open={panel !== null} onClose={() => setPanel(null)} size={680} title={panel === "read" ? "Paige's read on pipeline health" : "Stalled prospects"} icon={panel === "read" ? <Ic.spark size={16} /> : null} accent={panel === "read" ? "var(--violet)" : "var(--warn)"}>
        {panel === "stalls" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {PIPE_STALLS.map((s, i) => (
              <div key={i} style={{ border: "1px solid var(--line-soft)", borderLeft: "3px solid var(--warn)", borderRadius: "var(--r-m)", padding: "15px 16px", background: "var(--surface-2)" }}>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{s.who}</div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 8 }}>{s.note}</div>
                <div className="row" style={{ gap: 9, marginTop: 13 }}>
                  <GoldBtn style={{ padding: "10px 17px", fontSize: 13.5 }}><Ic.check size={12} />Send the nudge</GoldBtn>
                  <button className="btn">{s.cta}</button>
                </div>
              </div>
            ))}
          </div>
        )}
        {panel === "read" && (
          <div>
            <div style={{ fontSize: 16, lineHeight: 1.7 }}>{PIPE_READ}</div>
            <button onClick={openAsk} className="btn btn-s" style={{ marginTop: 18, color: "var(--violet)", borderColor: "var(--violet-line)" }}>Explore in Ask Paige</button>
          </div>
        )}
      </Modal>
    </>
  );
};

// ── CommandCenter (root screen) ───────────────────────────────────────────────
// Props from the AgencyApp shell: { isAgency, acting, openAsk, enterSub }.
//  • enterSub(child) is the shell's REAL act-as action (§65 Option B2,
//    AgencyApp.tsx's enterSubaccount — agency_enter_subaccount + switchTenant).
//    It expects a REAL roster row (child.id + child.accountNumber); it silently
//    no-ops on anything else (§13 — never fakes an act-as into non-existent
//    data). The `attention` array below is 100% decorative demo content (no
//    real per-sub-account backend yet), so its "Open sub-account" CTA is
//    disabled rather than wired to enterSub — an honest inert control beats a
//    button that pretends to jump into a sub-account that isn't real.
const CommandCenter = ({ isAgency = true, acting = null, openAsk = noop, enterSub = noop }) => {
  React.useEffect(() => { ensureStyles(); }, []);
  const [tab, setTab] = useSubtabRoute("agency", "command-center", "main");
  // §51: sub-account gets ONLY its own two tabs — no cross-book Team/Pipeline.
  const tabs = isAgency
    ? [["main", "Command Center", () => <Ic.grid size={15} />], ["systems", "Systems Check", () => <Ic.pulse size={15} />], ["team", "Team Pulse", () => <Ic.users size={15} />], ["pipe", "Prospect Pipeline", () => <Ic.trend size={15} />]]
    : [["main", "Command Center", () => <Ic.grid size={15} />], ["systems", "Systems Check", () => <Ic.pulse size={15} />]];
  // guard: if a stale tab is somehow selected in sub mode, fall back to main.
  const cur = tabs.some(t => t[0] === tab) ? tab : "main";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      {/* sub-tab strip (mirrors the design's command tab bar — gold underline active) */}
      <div className="row tabstrip" style={{ gap: 22, padding: "0 26px", borderBottom: "1px solid var(--line)", background: "var(--canvas)", flex: "none", overflowX: "hidden" }}>
        {tabs.map(t => {
          const on = cur === t[0];
          return (
            <button key={t[0]} onClick={() => setTab(t[0])} className="row" style={{ gap: 8, padding: "12px 2px", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: on ? 600 : 450, color: on ? "var(--ink)" : "var(--ink-3)", borderBottom: on ? "2px solid var(--gold)" : "2px solid transparent", flex: "none" }}>
              <span style={{ display: "flex", opacity: .85, color: on ? "var(--gold)" : "inherit" }}>{t[2]()}</span>{t[1]}
            </button>
          );
        })}
      </div>

      <div key={cur} className="fade-in" style={{ flex: 1, minHeight: 0, padding: "22px 26px 24px", display: "flex", gap: 18, overflow: "auto" }}>
        {cur === "main" && <DashTab isAgency={isAgency} acting={acting} openAsk={openAsk} enterSub={enterSub} />}
        {cur === "systems" && <SystemsTab isAgency={isAgency} acting={acting} />}
        {cur === "team" && isAgency && <TeamTab openAsk={openAsk} />}
        {cur === "pipe" && isAgency && <PipeTab openAsk={openAsk} />}
      </div>
    </div>
  );
};

export default CommandCenter;
export { CommandCenter };
