// @ts-nocheck
// Agency pack — the Business Vault screen. Owner-locked port of the Claude Design
// "CRM agency mode" pack (§28/§30/§31/§63 — "we do not drift off this whatsoever"),
// mirroring the sibling agency screens (automations.tsx / billing.tsx) for the
// Agency design's Business Vault surface.
//
// Source of truth: "Agency Shell.dc.html" — the isVault markup block (~L4183–L4427),
// its data builder (~L12000–L12277), and the five vault pop-out blocks in the modal
// stack (bvAddOpen ~L5457, bvOutreachOpen ~L5500, bvDetailOpen ~L5532,
// bvVendorOpen ~L5599, bvRailOpen ~L5649). The DCLogic runtime is NOT ported — its
// markup, measurements and copy are mirrored onto React + the ./_shared primitives
// (Modal/SlideOut carry portal/focus-trap/Esc/reduced-motion). The design hardcodes
// hex; this port keeps structural chrome token-driven so it themes light↔dark, while
// the decorative vendor-plate / owner-dot palette stays literal hex exactly as the
// pack does (per handoff rule).
//
// FOUR tabs (BV_TABS): Vault · Registry · Renewals · Vendors. The builder computes a
// per-tab title/sub. Vault = "what needs you first" + KPI grid + Her-read rail;
// Registry = filterable table; Renewals = decision cards (approve/snooze/undo, held
// in local bvDone state); Vendors = vendor grid (or, in Book scope, cross-book vendor
// cards that open the outreach draft).
//
// §51 INVARIANT — a sub-account is NEVER the parent aggregate. crossBook = isAgency
// && !acting is the ONLY gate under which the agency↔book↔per-sub-account ScopeSeg,
// the per-sub-account picker, the Book KPI roll-up, the cross-book vendor cards, and
// the cross-book "coming due across your book" read render. A standalone sub
// (isAgency false) OR an agency acting-as (acting != null) collapses to scope
// "agency" — its OWN obligations only, no parent aggregate (the #86 leak class).
//
// §38 — DISPLAY-ONLY. Nothing here moves money or files a record: every "Approve
// draft" / "Send it" / "Add it to the vault" / "Open" affordance is inert (no handler
// that implies a charge, send, or write). The honesty "!" banner states plainly that
// every obligation/vendor/renewal figure is a stand-in, not a platform record (§13).
//
// §63 — fixtures carry fictional names only (Cook & Co Agency, Hartwell Brokerage,
// TEAM_SUBS coaches). §50 — no pop-culture marks. Every const consumed here is
// already exported from ./fixtures — nothing is redefined (§18 one home).
import React from "react";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, Modal, SlideOut, ScopeSeg, AV } from "./_shared";
import {
  BV_TABS, BV_OBS, BV_VENDORS, BV_BOOK_VENDORS, TEAM_SUBS, AGENCY,
} from "./fixtures";

const noop = () => {};

// Gold-on-the-act CTA fill (§11 — gold spent only on the primary act). Inert (§38).
const GOLD_BG = "var(--gold-bright)";
const GOLD_INK = "#241C05";

const money = n => "$" + n.toLocaleString();

// BV_TABS glyph (▣ ⌗ ⟳ ◍) → the shared SVG vocabulary (design glyphs are decorative).
const TAB_ICON = {
  vault: s => <Ic.vault size={s} />,
  registry: s => <Ic.doc size={s} />,
  renewals: s => <Ic.clock size={s} />,
  vendors: s => <Ic.store size={s} />,
};

// Due-date urgency → token color (design dueTone: <14 red · <45 amber · else muted).
const dueColor = d => d < 14 ? "var(--bad)" : d < 45 ? "var(--warn)" : "var(--ink-3)";
// Recommendation → token color (design recTone: Renew green · Renegotiate amber ·
// Shop blue → violet · Cancel red · else muted).
const recColor = r => r === "Renew" ? "var(--ok)" : r === "Renegotiate" ? "var(--warn)"
  : r === "Shop" ? "var(--violet)" : r === "Cancel" ? "var(--bad)" : "var(--ink-3)";
// Status / rec / relationship → the pack's token pill classes (design hardcodes the
// bg/color hex; these map onto the shared semantic pills so they theme both ways).
const statusCls = s => s === "Draft ready" ? "pill-warn" : s === "Action needed" ? "pill-bad"
  : s === "Monitoring" ? "pill-n" : "pill-ok";
const recCls = r => r === "Renew" ? "pill-ok" : r === "Renegotiate" ? "pill-warn"
  : r === "Shop" ? "pill-v" : r === "Cancel" ? "pill-bad" : "pill-n";
const relCls = r => r === "Preferred" ? "pill-ok" : r === "Watch" ? "pill-warn"
  : r === "Underperforming" ? "pill-bad" : "pill-n";
// Cross-book vendor tone (design v.tone gold/amber/red) → token edge.
const toneEdge = t => t === "gold" ? "var(--gold)" : t === "amber" ? "var(--warn)" : "var(--bad)";
// KPI tone flag → token color (design tone AMBER/RED/GREEN).
const kColor = k => k.tone === "amber" ? "var(--warn)" : k.tone === "red" ? "var(--bad)"
  : k.tone === "green" ? "var(--ok)" : "var(--ink)";

// Decorative vendor-plate hue ring (design's local palette; kept literal hex per the
// handoff's "decorative data-viz palette may stay literal" rule).
const VENDOR_HUES = ["#7C6CE0", "#3F7F5C", "#B5822A", "#C05B45", "#2F6B8F", "#8A5A9E"];

// Props from the AgencyApp shell: { isAgency, acting, openAsk }.
const VaultHub = ({ isAgency = true, acting = null, openAsk = noop }) => {
  // §39 fix (peer-gate, R3c-i finding #1) — see CommandCenter.tsx for the full note.
  const [tab, setTab] = useSubtabRoute(isAgency ? "agency" : "sub_account", "business-vault", "vault");             // vault | registry | renewals | vendors
  const [scopeState, setScopeState] = React.useState("agency"); // agency | book | sub
  const [tSub, setTSub] = React.useState(0);                 // picked sub-account (readOnly scope)
  const [filter, setFilter] = React.useState("All");         // registry filter chip
  const [done, setDone] = React.useState({});                // renewal decisions (bvDone)
  const [item, setItem] = React.useState(null);              // obligation index → detail modal
  const [vendor, setVendor] = React.useState(null);          // vendor index → vendor modal
  const [addOpen, setAddOpen] = React.useState(false);       // add/propose slide-out
  const [outreach, setOutreach] = React.useState(null);      // book-vendor name → outreach modal
  const [railOpen, setRailOpen] = React.useState(false);     // her-read pop-out

  // §51: cross-book scope exists ONLY in agency mode and never while acting-as a sub.
  const crossBook = isAgency && !acting;
  // Effective scope collapses to "agency" (own numbers) whenever cross-book is off —
  // a standalone sub or an acting-as agency sees its own book only (design: acting → "agency").
  const scope = crossBook ? scopeState : "agency";
  const readOnly = scope === "sub";        // observing one sub-account (agency only)
  const showScopes = crossBook;            // bvShowScopes
  const showPicker = crossBook && readOnly; // bvShowPicker
  const picked = TEAM_SUBS[tSub] || TEAM_SUBS[0];

  // ── Filtered obligation rows (design matches + rows) ────────────────────────
  const matches = o => filter === "All"
    || (filter === "Insurance" && o.type === "Insurance")
    || (filter === "Subscriptions" && o.type === "Subscription")
    || (filter === "Filings" && (o.type === "Filing" || o.type === "Licence"))
    || (filter === "Due soon" && o.days < 45);
  // Rows carry their true BV_OBS index (obligation detail keys on it) plus, in Book
  // scope only, an owner tag (design's TEAM_SUBS[i % …]).
  const rows = BV_OBS.filter(matches).map((o, i) => ({
    o, idx: BV_OBS.indexOf(o),
    tenant: scope === "book" ? TEAM_SUBS[i % TEAM_SUBS.length].name : null,
    tenantColor: scope === "book" ? TEAM_SUBS[i % TEAM_SUBS.length].color : null,
  }));
  const visRows = rows.slice(0, 7);                         // bvRows (non-short variant)
  const more = rows.length > 7 ? "All " + rows.length : null; // bvMore

  // ── Renewals (design renewals — the drafts/action items with the body copy) ──
  const renewals = BV_OBS.filter(o => o.status === "Draft ready" || o.status === "Action needed").map(o => {
    const body = o.rec === "Renegotiate" && o.type === "Insurance"
      ? o.note + ". I sourced three quotes — Coverwell " + money(2080) + ", Meridian " + money(2150)
        + ", Statewide " + money(2240) + " — all equivalent coverage. Switching to Coverwell saves "
        + money(260) + " a year and takes ten business days."
      : o.rec === "Cancel"
        ? o.note + ". Cancelling before " + o.due + " avoids the full " + money(o.cost) + " and nothing depends on it."
        : o.rec === "Shop"
          ? o.note + ". The lowest is " + money(Math.round(o.cost * 0.91)) + " against your current "
            + money(o.cost) + ", same limits and the same carrier rating."
          : o.note + ". Renewing at " + money(o.cost) + " keeps the terms you have.";
    const state = done[o.name]; // "approved" | "snoozed" | undefined
    return {
      o, idx: BV_OBS.indexOf(o), name: o.name, vendor: o.vendor, due: o.due, rec: o.rec,
      body, cost: money(o.cost) + "/yr",
      approveCta: state === "approved"
        ? (readOnly ? "Proposal sent" : "Approved · logged")
        : (readOnly ? "Propose to " + picked.name.split(" ")[0] : "Approve draft"),
      settled: !!state, pending: !state,
      settledNote: state === "approved"
        ? (readOnly
            ? "Sent to their owner just now. They approve from their own Command Center."
            : "Logged just now. She'll handle the paperwork and confirm when the carrier does.")
        : state === "snoozed" ? "Snoozed until a week before the renewal date." : null,
    };
  });

  // ── Vendor cards (design vendors — the classic grid) ────────────────────────
  const vendors = BV_VENDORS.map((v, i) => {
    const hue = VENDOR_HUES[i % 6];
    const av = AV(hue);
    return {
      v, idx: i, name: v.name, cat: v.cat, rel: v.rel,
      obs: v.obs + (v.obs === 1 ? " obligation" : " obligations"),
      spend: money(v.spend) + "/yr",
      initials: v.name.split(" ").slice(0, 2).map(w => w[0]).join(""),
      hue, plate: av.plate, ink: av.ink,
    };
  });

  const annual = BV_OBS.reduce((n, o) => n + o.cost, 0);

  // ── Per-tab copy (design bvTitle / bvSub) ───────────────────────────────────
  const title = { vault: "Business Vault", registry: "Registry", renewals: "Renewals", vendors: "Vendors" }[tab];
  const sub = {
    vault: "Every obligation with a due date, one home — she watches the calendar so you don't.",
    registry: "Every obligation, filterable and searchable.",
    renewals: "Decisions coming up. She drafted the move; you approve it.",
    vendors: "Who you pay, what they're worth, and where you're paying twice.",
  }[tab];
  const banner = "No obligations, vendor or renewal substrate exists yet — every figure here is a stand-in, not a platform record.";
  const scopeNote = acting
    ? "This business's own obligations — their policies, licences, subscriptions and filings."
    : !isAgency
      ? "Your own obligations — your policies, licences, subscriptions and filings."
      : scope === "agency"
        ? "Your agency's own obligations. Each sub-account's vault lives in their workspace."
        : scope === "book"
          ? "Aggregate across the book. Observe and propose — you can't renew on their behalf from here."
          : "You're observing " + picked.name + "'s vault. Anything you change goes to their owner as a proposal.";

  // ── KPI tiles (design bvKpis — three scope variants) ────────────────────────
  const kpis = (scope === "book"
    ? [
        { label: "OBLIGATIONS ACROSS BOOK", value: "196", note: "in " + AGENCY.subCount + " sub-accounts" },
        { label: "DUE IN 30 DAYS", value: "17", note: "across the book", tone: "amber" },
        { label: "NEED ACTION", value: "9", note: "drafts waiting on owners", tone: "red" },
        { label: "BOOK SPEND", value: money(184600), note: "annual, all tenants" },
      ]
    : readOnly
      ? [
          { label: "THEIR OBLIGATIONS", value: "14", note: "on file" },
          { label: "DUE IN 30 DAYS", value: "2", note: "both insurance", tone: "amber" },
          { label: "NEED ACTION", value: "1", note: "waiting on their owner", tone: "red" },
          { label: "ANNUAL SPEND", value: money(11420), note: "their own obligations" },
        ]
      : [
          { label: "ACTIVE OBLIGATIONS", value: String(BV_OBS.length), note: "across every type" },
          { label: "DUE IN 30 DAYS", value: String(BV_OBS.filter(o => o.days < 30).length), note: "two need a decision", tone: "amber" },
          { label: "NEED YOUR ACTION", value: String(BV_OBS.filter(o => o.status === "Draft ready" || o.status === "Action needed").length), note: "she drafted each one", tone: "red" },
          { label: "ANNUAL SPEND", value: money(annual), note: "recurring obligations" },
        ]);

  const renewStats = [
    { label: "NEXT 30 DAYS", value: "2" },
    { label: "DECISION VALUE", value: money(4008) },
    { label: "AWAITING YOU", value: String(renewals.length), tone: "amber" },
    { label: "SAVED THIS YEAR", value: money(1840), tone: "green" },
  ];

  // ── Her-read rail content (design bvRead — three scope variants) ─────────────
  const read = scope === "book"
    ? "Eight sub-accounts renew workers' comp in Q4 with four different carriers. One agency-wide rate would beat every quote on the table, and the outreach to Statewide is drafted."
    : readOnly
      ? picked.name + " carries no E&O policy and their general liability renews in three weeks. Their owner hasn't opened either notice — both proposals are written in your name."
      : "Two policies renew this month above market. General liability at Hartwell is 12% over regional median and I have three quotes ready. Workers' comp is fair — auto-renew is safe. Ledgerly hasn't been opened in ninety days and renews on the eighth.";
  const activity = [
    { what: "Sourced three E&O quotes", when: "2h ago" },
    { what: "Approved workers' comp renewal", when: "yesterday" },
    { what: "Added the Atlanta licence renewal", when: "3d ago" },
    { what: "Flagged Ledgerly as unused", when: "1w ago" },
  ];
  const vendorIntelTitle = scope === "book" ? "Cross-book vendor intelligence" : "Vendor intelligence";
  const vendorIntel = scope === "book"
    ? BV_BOOK_VENDORS.map(v => ({ text: v.note, cta: v.cta, edge: toneEdge(v.tone) }))
    : [
        { text: "Hartwell holds two of your three policies and both sit above median. That's concentration and price in one place.", cta: "Shop both", edge: "var(--warn)" },
        { text: "No preferred vendor is set for accounting software. She'll keep quoting blind until you name one.", cta: "Name a preferred", edge: "var(--gold)" },
      ];

  // ── Cross-book vendor cards (design bvBookVendors) — Vendors tab, Book scope ──
  const bookVendors = BV_BOOK_VENDORS.map(v => ({
    v, name: v.name, note: v.note, cta: v.cta,
    subs: v.subs + " sub-accounts",
    spend: v.spend ? money(v.spend) + "/yr combined" : "no coverage on file",
    edge: toneEdge(v.tone),
  }));

  // ── Add / Propose obligation fields (design bvAddFields) ─────────────────────
  const addFields = [
    { label: "What is it", value: "", ph: "General liability, Northlight CRM, franchise tax…" },
    { label: "Type", value: "Insurance", caret: true },
    { label: "Vendor", value: "", ph: "Who bills you" },
    { label: "Cost", value: "", ph: "$0.00" },
    { label: "Billed", value: "Annually", caret: true },
    { label: "Next date", value: "", ph: "Renewal or filing date", caret: true },
    { label: "Remind me", value: "30 days before", caret: true },
    { label: "Her autonomy on this", value: "Draft for approval", caret: true },
  ];
  const addTitle = readOnly ? "Propose an obligation to " + picked.name : "Add an obligation";
  const addNote = readOnly
    ? "She'll draft it in your name and send it to their owner. Nothing lands in their vault until they accept."
    : "Fill in what you know. She'll watch the date, chase the paperwork, and draft the renewal when it comes due.";
  const addSave = readOnly ? "Send the proposal" : "Add it to the vault";
  const addCta = readOnly ? "Propose an obligation" : "+ Add an obligation";

  // ── Outreach draft (design bvOutreach) — resolved from the picked book-vendor ─
  const outreachData = (() => {
    const v = BV_BOOK_VENDORS.find(x => x.name === outreach) || BV_BOOK_VENDORS[0];
    return {
      title: v.cta, vendor: v.name,
      subject: v.name === "QuickBooks" ? "Agency-wide pricing for " + v.subs + " accounts"
        : v.name === "Statewide Mutual" ? "Rate parity across our book"
        : "Adding E&O for three accounts",
      body: v.name === "QuickBooks"
        ? "We run " + v.subs + " client accounts on QuickBooks Online, billed separately at " + money(8160)
          + " a year combined. We'd like to consolidate under one agency agreement at your published multi-entity rate, keeping each company file separate. Who handles agency pricing?"
        : v.name === "Statewide Mutual"
          ? "Two of our accounts hold the same coverage tier with you at different premiums — " + money(1120)
            + " and " + money(1340) + ". We're renewing five policies with you this quarter and would like one rate applied across the book. Can we review before the first renewal?"
          : "Three accounts in our book carry no professional liability at all. We'd like to quote them on the same terms as the nine already with you, effective at their next renewal.",
      note: "Drafted in your agency's voice. Nothing sends until you approve it.",
      sendCta: "Send it",
    };
  })();

  // ── Obligation detail (design bvDetail) ─────────────────────────────────────
  const detail = item == null ? null : BV_OBS[item];
  const detailData = detail ? {
    name: detail.name, rec: detail.rec, vendor: detail.vendor, due: detail.due, note: detail.note,
    terms: [
      { label: "TYPE", value: detail.type },
      { label: "VENDOR", value: detail.vendor },
      { label: "NEXT DATE", value: detail.due },
      { label: "COST", value: money(detail.cost) + (detail.per ? "/" + detail.per : "") },
    ],
    docs: [
      { name: detail.name.toLowerCase().replace(/[^a-z]+/g, "-") + "-current.pdf", meta: "PDF · 1.2 MB · replaced Feb 2026" },
      { name: "certificate-2026.pdf", meta: "PDF · 340 KB · issued Jan 2026" },
      { name: "vendor-correspondence.pdf", meta: "PDF · 88 KB · Aug 2026" },
    ].slice(0, detail.docs),
    timeline: [
      { what: "Renewed at " + money(detail.cost), when: "last year" },
      { what: "Rate increased 12%", when: "two years ago" },
      { what: "Policy opened", when: "2021" },
    ],
    approveCta: readOnly ? "Propose to " + picked.name.split(" ")[0] : "Approve her draft",
    audit: readOnly ? "Signed by their owner · 12 Feb 2026" : "Signed by " + AGENCY.operator + " · 12 Feb 2026 · Chrome, Atlanta",
  } : null;

  // ── Vendor detail (design bvVendorDetail) ───────────────────────────────────
  const vDetail = vendor == null ? null : BV_VENDORS[vendor];
  const vDetailData = vDetail ? {
    name: vDetail.name, cat: vDetail.cat, contact: vDetail.contact, note: vDetail.note, rel: vDetail.rel,
    spend: money(vDetail.spend) + "/yr",
    lifetime: money(vDetail.spend * 4) + " lifetime",
    obligations: BV_OBS.filter(o => o.vendor === vDetail.name).map(o => ({
      name: o.name, due: o.due, cost: money(o.cost) + "/yr", status: o.status,
    })),
    history: [
      { what: "Renewed without a rate change", when: "2025" },
      { what: "Certificate issued in two days", when: "2024" },
      { what: "One claim, settled in full", when: "2023" },
    ],
  } : null;

  const goldBtn = (extra = {}) => ({ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, background: GOLD_BG, color: GOLD_INK, fontSize: 13.5, fontWeight: 600, cursor: "pointer", border: "none", whiteSpace: "nowrap", ...extra });
  const ghostBtn = (extra = {}) => ({ padding: "10px 15px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13.5, color: "var(--ink-2)", cursor: "pointer", ...extra });

  const scopeSegs = [["agency", "Agency"], ["book", "Book"], ["sub", "Per sub-account"]]
    .map(([k, l]) => ({ key: k, label: l }));

  const tabs = BV_TABS;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      {/* sub-tab strip (mirrors the agency pack tab bar — gold underline active). */}
      <div className="row tabstrip" style={{ gap: 22, padding: "0 26px", borderBottom: "1px solid var(--line)", background: "var(--canvas)", flex: "none", overflowX: "hidden" }}>
        {tabs.map(t => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="row" style={{ gap: 8, padding: "12px 2px", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: on ? 600 : 450, color: on ? "var(--ink)" : "var(--ink-3)", borderBottom: on ? "2px solid var(--gold)" : "2px solid transparent", flex: "none", background: "transparent", border: "none", cursor: "pointer" }}>
              <span style={{ display: "flex", opacity: .85, color: on ? "var(--gold)" : "inherit" }}>{TAB_ICON[t.key](15)}</span>{t.label}
            </button>
          );
        })}
      </div>

      <div key={tab} className="fade-in" style={{ flex: 1, minHeight: 0, padding: "18px 26px 22px", display: "flex", flexDirection: "column", gap: 12, overflow: "auto" }}>
        {/* Header: eyebrow + title + honesty "!" + scope seg + rail + Add CTA. */}
        <div className="row" style={{ alignItems: "flex-start", gap: 12, flex: "none", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 9 }}>
              <span className="eyebrow" style={{ fontSize: 9.5 }}>BUSINESS VAULT</span>
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.02em" }}>{title}</span>
              <span title={banner} style={{ width: 19, height: 19, borderRadius: 6, background: "var(--gold-tint)", border: "1px solid var(--gold-line)", color: "var(--warn)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, cursor: "help", flex: "none" }}>!</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 5 }}>{sub}</div>
          </div>
          <div className="row" style={{ marginLeft: "auto", gap: 9, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
            {/* §51 — the agency↔book↔per-sub scope segment renders ONLY cross-book. */}
            {showScopes && <ScopeSeg segs={scopeSegs} value={scope} onChange={setScopeState} />}
            <button onClick={() => setRailOpen(true)} className="row" style={{ gap: 6, padding: "8px 13px", borderRadius: 9, border: "1px solid var(--violet-line)", background: "var(--violet-tint)", fontSize: 12, fontWeight: 600, color: "var(--violet)", whiteSpace: "nowrap", flex: "none", cursor: "pointer" }}>
              <Ic.spark size={12} />Her read</button>
            <button onClick={() => setAddOpen(true)} style={{ padding: "8px 14px", borderRadius: 9, background: GOLD_BG, color: GOLD_INK, fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>{addCta}</button>
          </div>
        </div>

        <div className="trunc" style={{ fontSize: 11.5, color: "var(--ink-3)", flex: "none" }}>{scopeNote}</div>

        {/* Per-sub-account picker — agency-only, observe-a-sub scope (§51). */}
        {showPicker && (
          <div className="row" style={{ gap: 7, flex: "none", overflowX: "auto", paddingBottom: 2 }}>
            {TEAM_SUBS.map((s, i) => {
              const on = tSub === i;
              return (
                <button key={s.name} onClick={() => setTSub(i)} className="row" style={{ gap: 7, padding: "6px 11px", borderRadius: 20, border: "1px solid " + (on ? s.color + "66" : "var(--line)"), background: on ? s.color + "1A" : "var(--surface)", fontSize: 12, fontWeight: on ? 600 : 500, whiteSpace: "nowrap", flex: "none", cursor: "pointer" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flex: "none" }} />{s.name}
                </button>
              );
            })}
          </div>
        )}

        {/* ── Vault tab ─────────────────────────────────────────────────────────── */}
        {tab === "vault" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, flex: "none" }}>
              {kpis.map(k => (
                <div key={k.label} title={k.note} className="card" style={{ padding: "13px 15px", minWidth: 0 }}>
                  <div className="eyebrow trunc" style={{ fontSize: 9 }}>{k.label}</div>
                  <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-.02em", marginTop: 4, color: kColor(k) }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 13 }}>
              <div style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="row" style={{ gap: 9, flex: "none" }}>
                  <span className="eyebrow" style={{ fontSize: 10 }}>WHAT NEEDS YOU FIRST</span>
                  {more && (
                    // bvMore/bvList is inert in the design source (no list modal markup
                    // exists) — the "All N" affordance is faithful display-only (§13/§38).
                    <button className="pill pill-n" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--warn)", flex: "none", cursor: "pointer" }}>{more}</button>
                  )}
                </div>
                <div className="card" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: 0 }}>
                  {visRows.map(({ o, idx, tenant, tenantColor }) => (
                    <button key={o.name} onClick={() => setItem(idx)} className="vlt-row" style={{ width: "100%", textAlign: "left", padding: "9px 14px", borderTop: "1px solid var(--line-soft)", borderBottom: "none", borderLeft: "none", borderRight: "none", background: "transparent", cursor: "pointer", minWidth: 0, display: "block" }}>
                      <span className="row" style={{ gap: 9, minWidth: 0 }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: dueColor(o.days), flex: "none" }} />
                        <span className="trunc" style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{o.name}</span>
                        <span className={"pill " + statusCls(o.status)} style={{ fontSize: 10, flex: "none" }}>{o.status}</span>
                        <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: dueColor(o.days), flex: "none", whiteSpace: "nowrap" }}>{o.due}</span>
                      </span>
                      <span className="row" style={{ gap: 9, marginTop: 5, flexWrap: "nowrap", overflow: "hidden" }}>
                        {tenant && (
                          <span className="row" style={{ gap: 6, fontSize: 10.5, color: "var(--ink-2)", flex: "none" }}><span style={{ width: 6, height: 6, borderRadius: 2, background: tenantColor }} />{tenant}</span>
                        )}
                        <span className="trunc" style={{ fontSize: 11.5, color: "var(--ink-2)", minWidth: 0 }}>{o.vendor}</span>
                        <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: recColor(o.rec), flex: "none" }}>{o.rec}</span>
                        <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)", flex: "none" }}>{o.cost ? money(o.cost) + (o.per ? "/" + o.per : "") : "—"}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <VaultRail read={read} activity={activity} openAsk={openAsk} />
            </div>
          </>
        )}

        {/* ── Registry tab ──────────────────────────────────────────────────────── */}
        {tab === "registry" && (
          <>
            <div className="row" style={{ gap: 7, flex: "none", flexWrap: "wrap" }}>
              {["All", "Insurance", "Subscriptions", "Filings", "Due soon"].map(l => {
                const on = filter === l;
                return (
                  <button key={l} onClick={() => setFilter(l)} className="pill" style={{ padding: "6px 12px", background: on ? "var(--ink)" : "var(--surface)", color: on ? "var(--ink-inv)" : "var(--ink-2)", border: "1px solid " + (on ? "var(--ink)" : "var(--line)"), fontSize: 11.5, fontWeight: 500, cursor: "pointer", flex: "none" }}>{l}</button>
                );
              })}
              {more && (
                <button className="pill pill-n" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--warn)", flex: "none", cursor: "pointer" }}>{more}</button>
              )}
            </div>
            <div className="card" style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", padding: 0 }}>
              <div className="row" style={{ gap: 10, padding: "8px 14px", background: "var(--surface-2)", borderBottom: "1px solid var(--line-soft)", position: "sticky", top: 0, zIndex: 1 }}>
                <span className="eyebrow" style={{ flex: 2, minWidth: 0, fontSize: 9 }}>OBLIGATION</span>
                <span className="eyebrow" style={{ flex: 1.4, minWidth: 0, fontSize: 9 }}>VENDOR</span>
                <span className="eyebrow" style={{ flex: .8, minWidth: 0, fontSize: 9 }}>NEXT</span>
                <span className="eyebrow" style={{ flex: .8, minWidth: 0, fontSize: 9 }}>COST</span>
                <span className="eyebrow" style={{ flex: .9, minWidth: 0, fontSize: 9 }}>STATUS</span>
              </div>
              {visRows.map(({ o, idx }) => (
                <button key={o.name} onClick={() => setItem(idx)} className="row vlt-row" style={{ width: "100%", textAlign: "left", gap: 10, padding: "9px 14px", borderTop: "1px solid var(--line-soft)", border: "none", background: "transparent", cursor: "pointer", minWidth: 0 }}>
                  <div style={{ flex: 2, minWidth: 0 }}>
                    <div className="trunc" style={{ fontSize: 12.5, fontWeight: 600 }}>{o.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{o.type} · {o.docs + (o.docs === 1 ? " doc" : " docs")}</div>
                  </div>
                  <span className="trunc" style={{ flex: 1.4, minWidth: 0, fontSize: 12, color: "var(--ink-2)" }}>{o.vendor}</span>
                  <span className="mono" style={{ flex: .8, minWidth: 0, fontSize: 11, color: dueColor(o.days), whiteSpace: "nowrap" }}>{o.due}</span>
                  <span className="mono" style={{ flex: .8, minWidth: 0, fontSize: 11, color: "var(--ink-2)", whiteSpace: "nowrap" }}>{o.cost ? money(o.cost) + (o.per ? "/" + o.per : "") : "—"}</span>
                  <span style={{ flex: .9, minWidth: 0 }}><span className={"pill " + statusCls(o.status)} style={{ fontSize: 10, whiteSpace: "nowrap" }}>{o.status}</span></span>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ── Renewals tab ──────────────────────────────────────────────────────── */}
        {tab === "renewals" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, flex: "none" }}>
              {renewStats.map(k => (
                <div key={k.label} className="card" style={{ padding: "13px 15px", minWidth: 0 }}>
                  <div className="eyebrow trunc" style={{ fontSize: 9 }}>{k.label}</div>
                  <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-.02em", marginTop: 4, color: kColor(k) }}>{k.value}</div>
                </div>
              ))}
            </div>
            <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 13 }}>
              <div style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 10, paddingRight: 2 }}>
                {renewals.map(r => (
                  <div key={r.name} className="card" style={{ borderLeft: "3px solid " + recColor(r.rec), padding: "13px 15px", flex: "none", minWidth: 0 }}>
                    <div className="row" style={{ gap: 9, flexWrap: "wrap" }}>
                      <span className={"pill " + recCls(r.rec)} style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".04em" }}>{r.rec}</span>
                      <span style={{ fontSize: 14, fontWeight: 600, minWidth: 0 }}>{r.name}</span>
                      <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{r.vendor}</span>
                      <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", flex: "none" }}>{r.due} · {r.cost}</span>
                    </div>
                    <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 8 }}>{r.body}</div>
                    {r.settled && (
                      <div className="row" style={{ gap: 9, marginTop: 11, padding: "9px 12px", border: "1px solid var(--ok)", borderRadius: 10, background: "var(--ok-tint)", minWidth: 0 }}>
                        <span style={{ color: "var(--ok)", fontSize: 11, flex: "none" }}>✓</span>
                        <span style={{ fontSize: 11.5, color: "var(--ok)", lineHeight: 1.45, minWidth: 0 }}>{r.settledNote}</span>
                        <button onClick={() => setDone(d => { const n = { ...d }; delete n[r.name]; return n; })} style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: "var(--warn)", cursor: "pointer", flex: "none", background: "transparent", border: "none" }}>Undo</button>
                      </div>
                    )}
                    {r.pending && (
                      <div className="row" style={{ gap: 9, marginTop: 11, flexWrap: "wrap" }}>
                        <button onClick={() => setDone(d => ({ ...d, [r.name]: "approved" }))} style={goldBtn({ padding: "8px 15px", fontSize: 12.5 })}><span style={{ fontSize: 11 }}>✓</span>{r.approveCta}</button>
                        <button onClick={() => setItem(r.idx)} style={ghostBtn({ padding: "8px 13px", fontSize: 12.5 })}>See the quotes</button>
                        <button onClick={() => setDone(d => ({ ...d, [r.name]: "snoozed" }))} style={ghostBtn({ padding: "8px 13px", fontSize: 12.5, color: "var(--ink-3)" })}>Snooze</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <RenewalsRail read={read} openAsk={openAsk} />
            </div>
          </>
        )}

        {/* ── Vendors tab ───────────────────────────────────────────────────────── */}
        {tab === "vendors" && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 13 }}>
            <div style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 2 }}>
              {/* §51 — cross-book vendor cards render ONLY in Book scope (crossBook). */}
              {scope === "book" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {bookVendors.map(v => (
                    <div key={v.name} className="card" style={{ borderLeft: "3px solid " + v.edge, padding: "12px 14px", minWidth: 0 }}>
                      <div className="row" style={{ gap: 9, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{v.name}</span>
                        <span style={{ fontSize: 11, color: "var(--ink-3)" }}>{v.subs}</span>
                        <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-2)", flex: "none" }}>{v.spend}</span>
                      </div>
                      <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 7 }}>{v.note}</div>
                      <button onClick={() => setOutreach(v.name)} style={goldBtn({ display: "inline-flex", marginTop: 10, padding: "8px 14px", fontSize: 12 })}>{v.cta}</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10, alignContent: "start" }}>
                  {vendors.map(v => (
                    <button key={v.name} onClick={() => setVendor(v.idx)} className="card vlt-card" style={{ padding: "13px 14px", cursor: "pointer", minWidth: 0, display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 10, background: v.plate, boxShadow: "inset 0 0 0 2px " + v.hue, color: v.ink, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, flex: "none" }}>{v.initials}</div>
                        <div style={{ minWidth: 0 }}>
                          <div className="trunc" style={{ fontSize: 12.5, fontWeight: 600 }}>{v.name}</div>
                          <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{v.cat}</div>
                        </div>
                      </div>
                      <div className="row" style={{ gap: 8, minWidth: 0 }}>
                        <span className={"pill " + relCls(v.rel)} style={{ fontSize: 10, flex: "none" }}>{v.rel}</span>
                        <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-2)", flex: "none" }}>{v.spend}</span>
                      </div>
                      <div style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{v.obs}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <VendorRail title={vendorIntelTitle} intel={vendorIntel} />
          </div>
        )}
      </div>

      {/* ── bvAddOpen — Add / Propose obligation slide-out ────────────────────────── */}
      <SlideOut open={addOpen} onClose={() => setAddOpen(false)} title={addTitle} sub={addNote}
        foot={<>
          <button onClick={() => setAddOpen(false)} style={goldBtn()}><span style={{ fontSize: 11 }}>✓</span>{addSave}</button>
          <button onClick={() => setAddOpen(false)} style={ghostBtn({ color: "var(--ink-3)" })}>Cancel</button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {addFields.map(fd => (
            <div key={fd.label} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)" }}>{fd.label}</div>
              <div className="row" style={{ gap: 9, marginTop: 5, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", minWidth: 0 }}>
                {fd.value
                  ? <span className="trunc" style={{ fontSize: 13, color: "var(--ink)", minWidth: 0 }}>{fd.value}</span>
                  : <span className="trunc" style={{ fontSize: 13, color: "var(--ink-3)", minWidth: 0 }}>{fd.ph}</span>}
                {fd.caret && <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)", flex: "none" }}>▾</span>}
              </div>
            </div>
          ))}
          <div className="row" style={{ gap: 9, padding: "11px 13px", border: "1px dashed var(--line)", borderRadius: 11, background: "var(--surface)", cursor: "pointer", minWidth: 0 }}>
            <span style={{ width: 26, height: 32, borderRadius: 5, background: "var(--surface-2)", border: "1px solid var(--line)", display: "grid", placeItems: "center", fontSize: 9, color: "var(--ink-3)", flex: "none" }}>PDF</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>Attach the contract or certificate</div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>Documents live on the obligation, so they're findable at renewal.</div>
            </div>
          </div>
        </div>
      </SlideOut>

      {/* ── bvOutreachOpen — Cross-book outreach draft modal ──────────────────────── */}
      <Modal open={outreach != null} onClose={() => setOutreach(null)} size={600}
        title={outreachData.title} sub={"To " + outreachData.vendor}
        foot={<>
          <button onClick={() => setOutreach(null)} style={goldBtn()}><span style={{ fontSize: 11 }}>✓</span>{outreachData.sendCta}</button>
          <button style={ghostBtn()}>Tweak with Paige</button>
          <button onClick={() => setOutreach(null)} style={ghostBtn({ color: "var(--ink-3)" })}>Discard</button>
        </>}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ border: "1px solid var(--line-soft)", borderRadius: 12, background: "var(--surface-2)", padding: "12px 14px" }}>
            <div className="eyebrow" style={{ fontSize: 9.5 }}>SUBJECT</div>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 5 }}>{outreachData.subject}</div>
          </div>
          <div style={{ border: "1px solid var(--line-soft)", borderRadius: 12, background: "var(--surface)", padding: "14px 16px" }}>
            <div style={{ fontSize: 14, lineHeight: 1.7, color: "var(--ink)" }}>{outreachData.body}</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <span style={{ color: "var(--violet)", fontSize: 12 }}>✦</span>
            <span style={{ fontSize: 11.5, color: "var(--ink-2)" }}>{outreachData.note}</span>
          </div>
        </div>
      </Modal>

      {/* ── bvDetailOpen — Obligation detail modal ────────────────────────────────── */}
      <Modal open={detailData != null} onClose={() => setItem(null)} size={680} accent="var(--gold)"
        title={detailData ? detailData.name : ""}
        sub={detailData ? detailData.vendor + " · " + detailData.due : ""}
        foot={detailData ? <>
          <button style={goldBtn()}><span style={{ fontSize: 11 }}>✓</span>{detailData.approveCta}</button>
          <button style={ghostBtn()}>Tweak with Paige</button>
          <button style={ghostBtn({ color: "var(--ink-3)" })}>Snooze</button>
        </> : null}>
        {detailData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <div className="row" style={{ gap: 9, flexWrap: "wrap" }}>
              <span className={"pill " + recCls(detailData.rec)} style={{ fontSize: 10.5, fontWeight: 700 }}>{detailData.rec}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10 }}>
              {detailData.terms.map(t => (
                <div key={t.label} style={{ border: "1px solid var(--line-soft)", borderRadius: 11, background: "var(--surface-2)", padding: "10px 12px", minWidth: 0 }}>
                  <div className="eyebrow" style={{ fontSize: 9 }}>{t.label}</div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4, lineHeight: 1.35 }}>{t.value}</div>
                </div>
              ))}
            </div>
            <div style={{ border: "1px solid var(--violet-line)", borderRadius: 12, background: "var(--violet-tint)", padding: "13px 15px" }}>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ color: "var(--violet)", fontSize: 12 }}>✦</span>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--violet)" }}>Her draft</div>
              </div>
              <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 7 }}>{detailData.note}</div>
            </div>
            <div>
              <div className="eyebrow" style={{ fontSize: 9.5 }}>DOCUMENTS ON THIS OBLIGATION</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 8 }}>
                {detailData.docs.map(d => (
                  <div key={d.name} className="row" style={{ gap: 10, border: "1px solid var(--line-soft)", borderRadius: 11, padding: "9px 11px", minWidth: 0, cursor: "pointer" }}>
                    <span style={{ width: 28, height: 34, borderRadius: 5, background: "var(--surface-2)", border: "1px solid var(--line)", display: "grid", placeItems: "center", fontSize: 9, color: "var(--ink-3)", flex: "none" }}>PDF</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="trunc" style={{ fontSize: 12, fontWeight: 600 }}>{d.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{d.meta}</div>
                    </div>
                    <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: "var(--warn)", flex: "none" }}>Open</span>
                  </div>
                ))}
                <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 12px", border: "1px dashed var(--line)", borderRadius: 11, fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)", cursor: "pointer", alignSelf: "flex-start" }}>＋ Add a document</div>
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{ fontSize: 9.5 }}>HISTORY</div>
              <div style={{ display: "flex", flexDirection: "column", marginTop: 7 }}>
                {detailData.timeline.map((t, i) => (
                  <div key={i} className="row" style={{ gap: 10, padding: "7px 0", borderTop: "1px solid var(--line-soft)", minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: "var(--ink-2)", minWidth: 0 }}>{t.what}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", flex: "none" }}>{t.when}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{detailData.audit}</div>
          </div>
        )}
      </Modal>

      {/* ── bvVendorOpen — Vendor detail modal ────────────────────────────────────── */}
      <Modal open={vDetailData != null} onClose={() => setVendor(null)} size={620}
        title={vDetailData ? vDetailData.name : ""}
        sub={vDetailData ? vDetailData.cat + " · " + vDetailData.contact + " · " + vDetailData.rel : ""}>
        {vDetailData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
            <div className="row" style={{ alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <div>
                <div className="eyebrow" style={{ fontSize: 9 }}>ANNUAL</div>
                <div style={{ fontSize: 20, fontWeight: 700, marginTop: 3 }}>{vDetailData.spend}</div>
              </div>
              <div>
                <div className="eyebrow" style={{ fontSize: 9 }}>LIFETIME</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginTop: 5, color: "var(--ink-2)" }}>{vDetailData.lifetime}</div>
              </div>
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)" }}>{vDetailData.note}</div>
            <div>
              <div className="eyebrow" style={{ fontSize: 9.5 }}>OBLIGATIONS FROM THEM</div>
              <div style={{ display: "flex", flexDirection: "column", marginTop: 7 }}>
                {vDetailData.obligations.map((o, i) => (
                  <div key={i} className="row" style={{ gap: 10, padding: "8px 0", borderTop: "1px solid var(--line-soft)", minWidth: 0 }}>
                    <span className="trunc" style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0 }}>{o.name}</span>
                    <span style={{ fontSize: 11, color: "var(--ink-3)", flex: "none" }}>{o.due}</span>
                    <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-2)", flex: "none" }}>{o.cost}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="eyebrow" style={{ fontSize: 9.5 }}>HOW THEY'VE BEHAVED</div>
              <div style={{ display: "flex", flexDirection: "column", marginTop: 7 }}>
                {vDetailData.history.map((h, i) => (
                  <div key={i} className="row" style={{ gap: 10, padding: "7px 0", borderTop: "1px solid var(--line-soft)", minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: "var(--ink-2)", minWidth: 0 }}>{h.what}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", flex: "none" }}>{h.when}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── bvRailOpen — "Her read" pop-out (mirrors the inline rail for any viewport) ── */}
      <Modal open={railOpen} onClose={() => setRailOpen(false)} size={600} title="Her read">
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          <div style={{ border: "1px solid var(--violet-line)", borderRadius: 12, background: "var(--violet-tint)", padding: "13px 15px" }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink-2)" }}>{read}</div>
            <button onClick={openAsk} className="row" style={{ gap: 5, marginTop: 11, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--violet-line)", background: "var(--surface)", fontSize: 12, fontWeight: 600, color: "var(--violet)", cursor: "pointer" }}>Explore in Ask Paige <Ic.arrow size={12} /></button>
          </div>
          <div className="card" style={{ padding: "13px 15px" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Recent activity</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 7 }}>
              {activity.map((a, i) => (
                <div key={i} className="row" style={{ gap: 10, padding: "8px 0", borderTop: "1px solid var(--line-soft)", minWidth: 0 }}>
                  <span style={{ fontSize: 12.5, color: "var(--ink-2)", minWidth: 0 }}>{a.what}</span>
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", flex: "none" }}>{a.when}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};

// ── Rail pieces ─────────────────────────────────────────────────────────────────
// Her-read card (design's violet "✦ Her read" block — shared by the vault + renewals rails).
const HerReadCard = ({ read, openAsk }) => (
  <div className="card" style={{ borderColor: "var(--violet-line)", background: "var(--violet-tint)", padding: "12px 14px", flex: "none" }}>
    <div className="row" style={{ gap: 8 }}>
      <span style={{ display: "flex", color: "var(--violet)" }}><Ic.spark size={12} /></span>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--violet)" }}>Her read</div>
    </div>
    <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 7 }}>{read}</div>
    <button onClick={openAsk} className="row" style={{ gap: 5, marginTop: 9, padding: "7px 12px", borderRadius: 9, border: "1px solid var(--violet-line)", background: "var(--surface)", fontSize: 11.5, fontWeight: 600, color: "var(--violet)", cursor: "pointer" }}>Explore in Ask Paige <Ic.arrow size={12} /></button>
  </div>
);

// Vault rail — Her read + Recent activity (design bvShowRail on the Vault tab).
const VaultRail = ({ read, activity, openAsk }) => (
  <aside className="vlt-rail" style={{ width: 290, flex: "none", minHeight: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", overflowX: "hidden" }}>
    <HerReadCard read={read} openAsk={openAsk} />
    <div className="card" style={{ padding: "12px 14px", flex: "none" }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>Recent activity</div>
      <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
        {activity.map((a, i) => (
          <div key={i} className="row" style={{ gap: 9, padding: "7px 0", borderTop: "1px solid var(--line-soft)", minWidth: 0 }}>
            <span className="trunc" style={{ fontSize: 11.5, color: "var(--ink-2)", minWidth: 0 }}>{a.what}</span>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{a.when}</span>
          </div>
        ))}
      </div>
    </div>
  </aside>
);

// Renewals rail — Her read only (design bvShowRail on the Renewals tab).
const RenewalsRail = ({ read, openAsk }) => (
  <aside className="vlt-rail" style={{ width: 290, flex: "none", minHeight: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", overflowX: "hidden" }}>
    <HerReadCard read={read} openAsk={openAsk} />
  </aside>
);

// Vendor rail — vendor intelligence signals (design bvShowRail on the Vendors tab).
const VendorRail = ({ title, intel }) => (
  <aside className="vlt-rail" style={{ width: 290, flex: "none", minHeight: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", overflowX: "hidden" }}>
    <div className="card" style={{ padding: "12px 14px", flex: "none" }}>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 9 }}>
        {intel.map((s, i) => (
          <div key={i} style={{ border: "1px solid var(--line-soft)", borderLeft: "3px solid " + s.edge, borderRadius: 10, background: "var(--surface-2)", padding: "9px 11px" }}>
            <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-2)" }}>{s.text}</div>
            <button style={{ display: "inline-flex", marginTop: 8, padding: "6px 11px", borderRadius: 8, background: "var(--gold-bright)", color: "#241C05", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer" }}>{s.cta}</button>
          </div>
        ))}
      </div>
    </div>
  </aside>
);

export default VaultHub;
