// @ts-nocheck
// Agency pack — the Billing screen. Owner-locked port of the Claude Design "CRM
// agency mode" pack (§28/§63 — "We do not drift off this whatsoever"), mirroring
// the sibling agency screens (growth.tsx / automations.tsx) for the Agency design's
// Billing surface.
//
// Source of truth: "Agency Shell.dc.html" isBilling block (descriptor ~L11864) +
// its markup (~L4058). AGENCY view carries three sub-tabs — Sub-account billing ·
// Revenue · Your plan (BILL_TABS_AGENCY); SUB view carries two — Invoices · Your
// plan (BILL_TABS_SUB). Each tab renders a header (eyebrow / title / lede + honesty
// banner + send CTA), a 4-KPI grid, a left body (invoice list / plan ladder / plan
// rows), and a right "Waiting on you" + "Her read" rail. The DCLogic runtime is NOT
// ported — its markup, measurements and copy are mirrored onto React + the ./_shared
// primitives (Modal carries portal/focus-trap/Esc/reduced-motion). The design
// hardcodes hex; this port keeps every color token-driven so it themes light↔dark.
//
// §38 — billing here is DISPLAY-ONLY. Nothing on this surface moves money, holds
// funds, or makes Paige merchant of record: every "Send this cycle" / "Pay now" /
// "Retry and chase" / "Update payment method" affordance is an inert, decorative
// control (no handler that implies a charge or transfer). The honesty banner
// (FLAGS.blBanner) states plainly that invoice states, revenue and platform charges
// here are stand-ins, not ledger records.
//
// §51 INVARIANT — a sub-account is NEVER the parent aggregate. In SUB view
// (isSub = !isAgency || acting) the tab set is BILL_TABS_SUB, which has NO Revenue
// tab; blIsRevenue is additionally gated on !isSub; and the invoices/plan/rail speak
// only for that one book (its own invoices from the agency, its own plan). There is
// no cross-sub picker, no book-wide revenue roll-up, no scope segment — a sub-account
// owner sees only their own billing.
//
// RAIL POP-OUT (blRailOpen) — like automations.tsx, this port has no width probe, so
// the "Her read" rail renders INLINE (the right aside) AND a header "Her read" button
// opens the SAME content in a Modal (railOpen → blRailOpen), so the required pop-out
// exists and is reachable regardless of viewport.
import React from "react";
import { Ic, SubTabs, Modal } from "./_shared";
import { AV } from "./_shared";
import { tmInit } from "./TeamBlock";
import {
  BILL_TABS_AGENCY, BILL_TABS_SUB, BILL_INVOICES, BILL_PLANS, AGENCY, TEAM_SEATS, FLAGS,
} from "./fixtures";
// Slice C — the §51-safe, session-derived billing adapter (DISPLAY-ONLY per §38).
// REAL: the caller's OWN L1 plan (name/charge/seats). PREVIEW (never fabricated):
// invoice states + the cross-book revenue roll-up (no parentage RPC → #86 leak).
import { useAgencyBilling } from "./data/useAgencyBilling";

const noop = () => {};

// Honest marker for surfaces the adapter reports NO backend for (§13) — the frozen
// fixture layout still renders as the sample it is, truthfully labeled. Mirrors the
// Solo/CommandCenter PreviewPill (the `pill pill-n` chip).
const PreviewPill = () => (
  <span className="pill pill-n" title="Sample layout — not yet wired to your live data">Preview</span>
);

const centsToDollars = (c) => Math.round((typeof c === "number" ? c : 0) / 100);

// Billing-tab → ./_shared Ic mapping (the design's own glyphs ▤ ↗ ▣ are decorative
// and re-expressed here onto the shared SVG vocabulary; mirrors growth.tsx TAB_ICON).
const TAB_ICON = {
  invoices: () => <Ic.doc size={14} />,
  revenue: () => <Ic.trend size={14} />,
  plan: () => <Ic.card size={14} />,
};

// Invoice state → pill class + token tone. The design hardcodes stateBg/stateColor
// hex (#E6F1EA/#2A6B4C …); these map onto the pack's token pills so they theme.
const statePill = s => s === "Paid" ? "pill-ok" : s === "Failed" ? "pill-bad" : s === "Sent" ? "pill-warn" : "pill-n";

// Gold-on-the-act CTA (§11 — gold spent only on the primary act). Inert here (§38).
const goldBtn = (extra = {}) => ({
  display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 9,
  background: "var(--gold-bright)", color: "#241C05", fontWeight: 600, border: "none",
  cursor: "pointer", whiteSpace: "nowrap", flex: "none", ...extra,
});

const money = n => "$" + n.toLocaleString();
const MRR = BILL_INVOICES.reduce((n, i) => n + i.amount, 0);

// Acting-as-a-sub-account: the invoices THIS business is billed by the agency
// (design's local subInvoices, verbatim). §51 — one book's own history, never a roll-up.
const SUB_INVOICES = [
  { label: "September", amount: 620, state: "Sent", due: "due Sep 1", method: "Visa •• 4412" },
  { label: "August", amount: 620, state: "Paid", due: "paid Aug 1", method: "Visa •• 4412" },
  { label: "July", amount: 620, state: "Paid", due: "paid Jul 1", method: "Visa •• 4412" },
  { label: "June", amount: 480, state: "Paid", due: "paid Jun 1", method: "Visa •• 4412" },
];

// ── KPI tiles (design blKpis) — four per view, token tones ──────────────────────
const kpisFor = (isSub, tab) => (isSub
  ? [
      { label: "YOUR PLAN", value: "Growth", note: "3 seats · billed monthly" },
      { label: "MONTHLY", value: money(620), note: "next charge Sep 1" },
      { label: "STATUS", value: "Current", note: "no balance owed", tone: "var(--ok)" },
      { label: "PAID THIS YEAR", value: money(5240), note: "eight invoices" },
    ]
  : tab === "plan"
    ? [
        { label: "PLATFORM PLAN", value: AGENCY.plan.replace(" plan", ""), note: "15 sub-accounts included" },
        { label: "PLATFORM CHARGE", value: money(1490), note: "billed to you Sep 1" },
        { label: "SEATS IN USE", value: TEAM_SEATS.length + " of 12", note: "no overage yet" },
        { label: "SUB-ACCOUNTS", value: AGENCY.subCount + " of 15", note: "3 more before the next tier", tone: "var(--ok)" },
      ]
    : tab === "revenue"
      ? [
          { label: "BOOK MRR", value: money(MRR), note: "billed to sub-accounts" },
          { label: "PLATFORM COST", value: money(1490), note: "what you pay for the book" },
          { label: "GROSS MARGIN", value: Math.round(((MRR - 1490) / MRR) * 100) + "%", note: money(MRR - 1490) + " kept", tone: "var(--ok)" },
          { label: "AT RISK", value: money(680), note: "one failed payment", tone: "var(--bad)" },
        ]
      : [
          { label: "BILLED THIS CYCLE", value: money(MRR), note: BILL_INVOICES.length + " sub-accounts" },
          { label: "COLLECTED", value: money(960), note: "two paid so far", tone: "var(--ok)" },
          { label: "FAILED", value: "1", note: "Ridgeline · card declined", tone: "var(--bad)" },
          { label: "NOT SENT", value: "1", note: "Verde has no method on file", tone: "var(--warn)" },
        ]
).map(k => ({ ...k, color: k.tone || "var(--ink)" }));

// ── Left body: invoices (agency book) ───────────────────────────────────────────
const InvoiceRows = () => (
  <div className="card" style={{ overflow: "hidden", flex: "none" }}>
    {BILL_INVOICES.map((i, idx) => {
      const av = AV(i.color);
      return (
        <div key={i.who} className="row" style={{ gap: 11, padding: "10px 14px", borderBottom: idx < BILL_INVOICES.length - 1 ? "1px solid var(--line-soft)" : 0, minWidth: 0, cursor: "pointer" }}
          onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <span style={{ width: 28, height: 28, borderRadius: "50%", background: av.plate, boxShadow: "inset 0 0 0 2px " + i.color, color: av.ink, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, flex: "none" }}>{tmInit(i.who)}</span>
          <div style={{ minWidth: 70, flex: "1 1 auto", overflow: "hidden" }}>
            <div className="trunc" style={{ fontSize: 12.5, fontWeight: 600 }}>{i.who}</div>
            <div className="trunc sub" style={{ fontSize: 10.5, marginTop: 2 }}>{i.plan} · {i.method}</div>
          </div>
          <span className={"pill " + statePill(i.state)} style={{ flex: "none" }}>{i.state}</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, flex: "none" }}>{money(i.amount)}</span>
          <button className="btn btn-s" style={{ flex: "none", height: 28, padding: "0 11px", fontSize: 11, fontWeight: 600 }}>
            {i.state === "Failed" ? "Retry and chase" : i.state === "Draft" ? "Ask for a method" : i.state === "Sent" ? "Send a reminder" : "Receipt"}
          </button>
        </div>
      );
    })}
  </div>
);

// ── Left body: sub-account's own invoice history (acting-as / standalone sub) ────
const SubInvoiceRows = () => (
  <div className="card" style={{ overflow: "hidden", flex: "none" }}>
    {SUB_INVOICES.map((i, idx) => (
      <div key={i.label} className="row" style={{ gap: 11, padding: "11px 14px", borderBottom: idx < SUB_INVOICES.length - 1 ? "1px solid var(--line-soft)" : 0, minWidth: 0, cursor: "pointer" }}
        onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <div style={{ minWidth: 70, flex: "1 1 auto", overflow: "hidden" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{i.label}</div>
          <div className="sub" style={{ fontSize: 10.5, marginTop: 2 }}>{i.due} · {i.method}</div>
        </div>
        <span className={"pill " + statePill(i.state)} style={{ flex: "none" }}>{i.state}</span>
        <span style={{ fontSize: 13.5, fontWeight: 700, flex: "none" }}>{money(i.amount)}</span>
        <button className="btn btn-s" style={{ flex: "none", height: 28, padding: "0 11px", fontSize: 11, fontWeight: 600 }}>
          {i.state === "Paid" ? "Receipt" : "Pay now"}
        </button>
      </div>
    ))}
  </div>
);

// ── Left body: revenue ladder (agency-only, "What you charge, by plan") ─────────
const RevenueLadder = () => (
  <div className="card" style={{ padding: "14px 16px", flex: "none" }}>
    <div style={{ fontSize: 14, fontWeight: 600 }}>What you charge, by plan</div>
    <div style={{ display: "flex", flexDirection: "column", marginTop: 9 }}>
      {BILL_PLANS.map(p => (
        <div key={p.name} className="row" style={{ gap: 11, padding: "10px 0", borderTop: "1px solid var(--line-soft)", minWidth: 0 }}>
          <div style={{ minWidth: 70, flex: "1 1 auto", overflow: "hidden" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
            <div className="trunc sub" style={{ fontSize: 11, marginTop: 2 }}>{p.note}</div>
          </div>
          <span style={{ fontSize: 11.5, color: "var(--ink-2)", flex: "none" }}>{p.subs + (p.subs === 1 ? " sub-account" : " sub-accounts")}</span>
          <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)", flex: "none" }}>{money(p.price)}/mo</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, flex: "none" }}>{money(p.price * p.subs)}/mo</span>
        </div>
      ))}
    </div>
  </div>
);

// ── Left body: plan rows (2-col config-as-data view) ────────────────────────────
const PlanRows = ({ rows }) => (
  <div className="card" style={{ padding: "14px 16px", flex: "none" }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px 18px" }}>
      {rows.map(r => (
        <div key={r.label} style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ fontSize: 9.5 }}>{r.label}</div>
          <div className="trunc" style={{ fontSize: 13.5, fontWeight: 600, marginTop: 4 }}>{r.value}</div>
        </div>
      ))}
    </div>
  </div>
);

// ── Rail pieces (inline aside + the pop-out share these) ────────────────────────
const ActionsCard = ({ actions }) => (
  <div className="card" style={{ padding: "12px 14px", flex: "none" }}>
    <div style={{ fontSize: 13.5, fontWeight: 600 }}>Waiting on you</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 9 }}>
      {actions.map((a, i) => (
        <div key={i} style={{ border: "1px solid var(--line-soft)", borderLeft: "3px solid " + a.edge, borderRadius: 10, background: "var(--surface-2)", padding: "9px 11px", minWidth: 0 }}>
          <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-2)" }}>{a.text}</div>
          <button style={goldBtn({ marginTop: 8, padding: "6px 11px", fontSize: 11 })}>{a.cta}</button>
        </div>
      ))}
    </div>
  </div>
);

const HerReadCard = ({ read, openAsk }) => (
  <div className="card" style={{ borderColor: "var(--violet-line)", background: "var(--violet-tint)", padding: "12px 14px", flex: "none" }}>
    <div className="row" style={{ gap: 8 }}>
      <span style={{ display: "flex", color: "var(--violet)" }}><Ic.spark size={12} /></span>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--violet)" }}>Her read</div>
    </div>
    <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 7 }}>{read}</div>
    <button onClick={openAsk} className="row" style={{ gap: 5, marginTop: 9, padding: "7px 12px", borderRadius: 9, border: "1px solid var(--violet-line)", background: "var(--surface)", fontSize: 11.5, fontWeight: 600, color: "var(--violet)" }}>
      Explore in Ask Paige <Ic.arrow size={12} /></button>
  </div>
);

// ── Billing (root screen) ───────────────────────────────────────────────────────
const Billing = ({ isAgency = true, acting = null, openAsk = noop }) => {
  // isSub — presenting as a sub-account (standalone sub, or agency acting into one).
  // Drives the two-tab set and the sub-scoped copy. §51: a sub never gets Revenue.
  const isSub = !isAgency || !!acting;
  const them = acting ? acting.name : "";
  const billTabs = isSub ? BILL_TABS_SUB : BILL_TABS_AGENCY;

  // §51 scope spine — session-derived only (the adapter reads the caller's OWN
  // tenant plan; no client-supplied tenant_id). REAL: plan; PREVIEW: invoices/revenue.
  const bill = useAgencyBilling({ isAgency, acting });
  const rp = bill.plan;                                   // REAL plan | null
  const realSeats = typeof bill.seatLimit === "number" ? bill.seatLimit : null;

  const [tabKey, setTab] = React.useState("invoices");
  const [railOpen, setRailOpen] = React.useState(false); // → blRailOpen ("Her read" pop-out)

  // Guard the active tab against the current tab-set (switching agency↔sub can strand
  // a "revenue" selection the sub view has no tab for — fall back to invoices).
  const tab = billTabs.find(t => t.key === tabKey) ? tabKey : "invoices";
  const blIsInvoices = tab === "invoices";
  const blIsRevenue = tab === "revenue" && !isSub; // §51 — never for a sub
  const blIsPlan = tab === "plan";

  const title = isSub
    ? (tab === "plan" ? "Your plan" : "Invoices")
    : ({ invoices: "Sub-account billing", revenue: "Revenue", plan: "Your plan" })[tab];
  const sub = isSub
    ? (tab === "plan"
        ? "What " + them + " pays " + AGENCY.operator + " Agency, and what's included."
        : "Every invoice " + AGENCY.operator + " Agency has sent this business.")
    : ({
        invoices: "What each sub-account owes you this cycle. She sends, chases and reconciles.",
        revenue: "What the book pays you, what it costs, and what's left.",
        plan: "What your agency pays the platform, and what your book's usage adds.",
      })[tab];

  const sendCta = isSub ? "Update payment method" : "Send this cycle";

  const planRows = isSub
    ? [
        { label: "PLAN", value: "Growth · " + them },
        { label: "SEATS", value: "3 of 4 in use" },
        { label: "DEPARTMENTS", value: "Ten, all running" },
        { label: "BILLED BY", value: AGENCY.operator + " Agency" },
        { label: "NEXT CHARGE", value: money(620) + " on Sep 1" },
        { label: "METHOD", value: "Visa •• 4412" },
      ]
    : [
        { label: "PLAN", value: AGENCY.plan },
        { label: "BILLED BY", value: "Paige Agent AI · platform" },
        { label: "SUB-ACCOUNTS", value: AGENCY.subCount + " of 15 included" },
        { label: "SEATS", value: TEAM_SEATS.length + " of 12 included" },
        { label: "NEXT CHARGE", value: money(1490) + " on Sep 1" },
        { label: "METHOD", value: "Visa •• 8821" },
      ];

  const read = isSub
    ? "Nothing is outstanding here. The June invoice was lower because the third seat started mid-month, and the card on file expires in November — worth replacing before the renewal."
    : tab === "plan"
      ? "You're three sub-accounts from the next platform tier, which adds " + money(400) + " a month. Two of your prospects would cross that line together — worth timing them so the tier change lands after both are billing."
      : tab === "revenue"
        ? "The book bills " + money(MRR) + " against " + money(1490) + " of platform cost, so you keep " + Math.round(((MRR - 1490) / MRR) * 100) + "%. Ridgeline's failed payment is the only thing between you and a clean month."
        : "Ridgeline's card declined this morning — I drafted the retry and a note in your voice. Verde has never had a payment method on file, so their invoice has sat in draft since June.";

  const actions = isSub
    ? [
        { text: "The card on file expires in November, before your next renewal.", cta: "Replace the card", edge: "var(--warn)" },
      ]
    : [
        { text: "Ridgeline's card declined for " + money(680) + ". The retry and the note are drafted in your voice.", cta: "Retry and send", edge: "var(--bad)" },
        { text: "Verde Landscaping has no payment method on file, so June through September sit in draft.", cta: "Request a method", edge: "var(--warn)" },
        { text: "Coach James is on a custom rate " + money(780) + " above your Growth plan. His renewal is in six weeks.", cta: "Draft the renewal", edge: "var(--gold)" },
      ];

  const kpis = kpisFor(isSub, tab);
  // REAL plan overlay (§13) — only substitute values the adapter actually sourced;
  // leave the frozen fixture value in place where the caller has no matched plan row,
  // so the layout stays byte-identical (§28) and nothing is fabricated.
  if (blIsPlan) {
    if (rp && kpis[0]) kpis[0] = { ...kpis[0], value: rp.name.replace(/ plan$/i, "") };
    if (rp && kpis[1]) kpis[1] = { ...kpis[1], value: money(centsToDollars(rp.monthlyPriceCents)) };
    if (!isSub && realSeats != null && kpis[2]) kpis[2] = { ...kpis[2], value: TEAM_SEATS.length + " of " + realSeats };
  }
  // planRows real overlay — PLAN name + SEATS allotment where the adapter sourced them.
  if (blIsPlan) {
    for (const r of planRows) {
      if (r.label === "PLAN" && rp) r.value = isSub ? rp.name.replace(/ plan$/i, "") + " · " + them : rp.name;
      if (r.label === "SEATS" && !isSub && realSeats != null) r.value = TEAM_SEATS.length + " of " + realSeats + " included";
      if (r.label === "NEXT CHARGE" && !isSub && rp) r.value = money(centsToDollars(rp.monthlyPriceCents)) + " on Sep 1";
    }
  }

  const tabs = billTabs.map(t => [t.key, t.label, TAB_ICON[t.key]]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0, alignItems: "stretch" }}>
      <SubTabs tabs={tabs} cur={tab} set={setTab} />

      <div key={tab} className="fade-in" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 12, padding: "16px 26px 22px", width: "100%", maxWidth: 1440, margin: "0 auto" }}>
        {/* Header: eyebrow / title / lede + honesty banner + "Her read" pop-out CTA + send CTA. */}
        <div className="row" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap", flex: "none" }}>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <div className="row" style={{ alignItems: "center", gap: 9, flexWrap: "wrap" }}>
              <span className="eyebrow" style={{ fontSize: 9.5 }}>BILLING</span>
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.02em" }}>{title}</span>
              <span title={FLAGS.blBanner} style={{ width: 19, height: 19, borderRadius: 6, background: "var(--gold-tint)", border: "1px solid var(--gold-line)", color: "var(--gold)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, cursor: "help", flex: "none" }}>!</span>
              {/* §13 honesty — invoices/revenue have no ledger/roll-up backend (the
                  cross-book #86-leak surface); the plan tab is REAL, so it carries no pill. */}
              {(blIsInvoices || blIsRevenue) && <PreviewPill />}
            </div>
            <div className="sub" style={{ fontSize: 12.5, marginTop: 5 }}>{sub}</div>
          </div>
          <div className="row" style={{ marginLeft: "auto", gap: 9, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
            <button onClick={() => setRailOpen(true)} className="row" style={{ gap: 6, padding: "8px 13px", borderRadius: 9, border: "1px solid var(--violet-line)", background: "var(--violet-tint)", fontSize: 12, fontWeight: 600, color: "var(--violet)", whiteSpace: "nowrap", flex: "none" }}>
              <Ic.spark size={12} />Her read</button>
            {/* §38 — display-only: no handler, no money movement. */}
            <button style={goldBtn({ padding: "8px 14px", fontSize: 12.5 })}>{sendCta}</button>
          </div>
        </div>

        {/* KPI grid. */}
        <div className="g4" style={{ flex: "none" }}>
          {kpis.map((k, i) => (
            <div key={i} title={k.note} className="card" style={{ padding: "13px 15px", minWidth: 0 }}>
              <div className="eyebrow trunc" style={{ fontSize: 9 }}>{k.label}</div>
              <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-.02em", marginTop: 4, color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* §13/§32 — surface a real read failure loudly, never swallow it. */}
        {bill.isError && (
          <div className="row" style={{ gap: 8, flex: "none", padding: "9px 13px", borderRadius: 10, border: "1px solid var(--bad)", background: "var(--bad-tint, var(--surface-2))", fontSize: 12, fontWeight: 600, color: "var(--bad)", minWidth: 0 }}>
            <span style={{ flex: "none" }}>!</span>
            <span className="trunc" style={{ minWidth: 0 }}>Couldn't load your live plan just now — showing the last known layout.</span>
          </div>
        )}

        {/* Body: left column (scrolls) + right rail. */}
        <div className="row" style={{ flex: 1, minHeight: 0, alignItems: "stretch", gap: 13 }}>
          <div style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 2 }}>
            {blIsInvoices && (isSub ? <SubInvoiceRows /> : <InvoiceRows />)}
            {blIsRevenue && <RevenueLadder />}
            {blIsPlan && <PlanRows rows={planRows} />}
          </div>

          <aside className="cc-rail" style={{ width: 290, flex: "none", minHeight: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
            <ActionsCard actions={actions} />
            <HerReadCard read={read} openAsk={openAsk} />
          </aside>
        </div>
      </div>

      {/* ── blRailOpen — "Her read" rail pop-out (same content as the inline aside) ── */}
      <Modal open={railOpen} onClose={() => setRailOpen(false)} size={600} title="Her read" icon={<Ic.spark size={16} />}>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div className="card" style={{ borderColor: "var(--violet-line)", background: "var(--violet-tint)", padding: "13px 15px" }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-2)" }}>{read}</div>
            <button onClick={openAsk} className="row" style={{ gap: 5, marginTop: 11, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--violet-line)", background: "var(--surface)", fontSize: 12, fontWeight: 600, color: "var(--violet)" }}>
              Explore in Ask Paige <Ic.arrow size={12} /></button>
          </div>
          <ActionsCard actions={actions} />
        </div>
      </Modal>
    </div>
  );
};

export default Billing;
