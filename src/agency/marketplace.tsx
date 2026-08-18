// @ts-nocheck
// Agency pack — the MARKETPLACE screen (the reseller App Store, §60/§61 resell
// framing). Faithful port of the Claude Design "CRM agency mode" pack `market`
// view (owner-locked 2026-08-17, §28/§30/§31/§63 — "We do not drift off this
// whatsoever"), mirroring the Solo precedent (src/solo/marketplace.tsx +
// src/solo/market.tsx) in STRUCTURE only.
//
// Source of truth: "Agency Shell.dc.html" —
//   • isMarket render block (design lines 947–1300) — the six-tab body:
//     Today (hero + category cards + today grid + top-charts + build/sell band),
//     Browse (filter chips + card grid), Installed (list + adoption-matrix rail),
//     Updates (update cards + signals rail), Curated (KPI row + bulk actions +
//     curated list w/ adoption stack + reseller-intelligence rail), Publish
//     (KPI row + listings table + publisher-intelligence rail).
//   • Pop-out overlays (design lines 5677–5765): the mobile "Her read" rail
//     slide-out (mkRailOpen) and the item detail / install drawer (mkDetailOpen).
//   • Data builder (design lines 10910–11165) — reproduced as the local `card`,
//     `price`, `stars`, `vals` derivation off the ported MK_* fixtures.
// The DCLogic runtime is NOT ported — its markup, measurements and copy are
// mirrored onto React + the ./_shared primitives; structural chrome hex is
// tokenised (var(--surface)/--line/--ink-*/--gold/--ok/--warn/--violet) so it
// themes, while the decorative data-viz palette (MK_GRAD gradients, AV plates,
// per-sub matrix tints, the violet "Get" gradient) stays literal exactly as the
// pack ships.
//
// §51 INVARIANT — a sub-account is NEVER the parent aggregate. `crossBook`
// (isAgency && !acting) gates the WHOLE cross-book surface: the Agency↔Book↔
// Per-sub-account SCOPE SEGMENT, the per-sub PICKER, the adoption MATRIX/stacks,
// the Curated + Publish reseller tabs, and every book-aggregate figure. When a
// standalone sub-account is in view (isAgency===false) OR the agency is acting-as
// a sub (acting!=null), the screen collapses to that ONE book's own numbers — no
// scope seg, no picker, no aggregate, and the tab strip drops Curated/Publish
// (agency-resell-only per §60/§61). This is the #86 leak class, gated shut.
//
// §13: display-only design port over fixture data — inert affordances are
// faithful, no screen or pop-out is stubbed down from the source.
import React from "react";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, SubTabs, ScopeSeg, AV, useReducedMotion } from "./_shared";
import { tmInit } from "./TeamBlock";
import {
  MK_TABS, MK_GRAD, MK_ITEMS, MK_CATS, MK_UPDATES, MK_LISTINGS,
  AGENCY, TEAM_SUBS, GREEN, AMBER,
} from "./fixtures";
// Slice C — the §51-safe, session-derived CURATION adapter. REAL (agency-aggregate
// only): the platform catalog rows (agency_curation_catalog), the sub-account picker
// (agency_list_my_subaccounts — the Args:never firewall), and the curate allowlist
// WRITE (set_agency_item_allowlist). PREVIEW (§38/§13, never fabricated): install
// counts, reseller earnings, reseller markup, and per-sub adoption (the #86 leak).
import { useAgencyMarketplace } from "./data/useAgencyMarketplace";

const noop = () => {};
const GOLD_BG = "var(--gold-bright)", GOLD_INK = "#241C05";
const money = n => "$" + n;
const DASH = "—"; // §13 — where no money/adoption backend exists, show a dash, never a fake figure.

// Honest marker for surfaces the adapter reports NO backend for (§13). Mirrors the
// Solo/CommandCenter PreviewPill (the `pill pill-n` chip).
const PreviewPill = () => (
  <span className="pill pill-n" title="Sample layout — not yet wired to your live data">Preview</span>
);

// Deterministic decorative dressing for a REAL catalog row (§13 — decoration, not
// data). The row carries no hue/glyph (those are viz, not platform records), so a
// stable gradient/glyph is derived from its slug; every money/adoption field the
// frozen card would show is Preview (DASH / empty stack), never invented.
const REAL_HUES = Object.keys(MK_GRAD);
const GLYPHS = ["◍", "◉", "✦", "▣", "◆", "❖", "⬡", "✷"];
const hashStr = s => { let h = 0; for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };
function realCard(row) {
  const hueKey = REAL_HUES[hashStr(row.slug) % REAL_HUES.length];
  const g = MK_GRAD[hueKey] || [hueKey, hueKey];
  return {
    real: true, id: row.id, raw: row, name: row.name, cat: row.category,
    hue: g[0], glyph: GLYPHS[hashStr(row.id) % GLYPHS.length],
    grad: "linear-gradient(150deg," + g[0] + "," + g[1] + ")",
    initials: (row.name || "").split(" ").slice(0, 2).map(w => w[0]).join(""),
    pub: row.tagline || row.itemType,
    note: row.description || row.tagline || "",
    // §51/§9 curation status is REAL (the allowlist flag); resale-licensing has no
    // separate real field, so the pill states the curation fact, not a fabricated one.
    shared: row.shared, pending: row.pending,
    resell: row.shared ? "Curated to book" : "In catalog",
    resellBg: row.shared ? "var(--ok-tint)" : "var(--surface-sunk)",
    resellColor: row.shared ? "var(--ok)" : "var(--ink-2)",
    // PREVIEW money/adoption (§38/§13).
    base: DASH, markup: DASH, final: DASH,
    stars: "", installs: DASH, rating: DASH,
    adoptLine: DASH, adoptPct: DASH, stack: [], overflow: null,
    status: row.shared ? "Live to book" : "Not curated",
    statusBg: row.shared ? "var(--ok-tint)" : "var(--surface-sunk)",
    statusColor: row.shared ? "var(--ok)" : "var(--ink-2)",
    open: noop, // real rows curate inline (no fixture-item detail drawer)
  };
}

// tab-key → ./_shared Ic glyph (design's own glyphs are decorative; re-expressed
// here on the shared icon vocabulary).
const TAB_ICON = {
  today: () => <Ic.spark size={13} />, browse: () => <Ic.grid size={13} />,
  installed: () => <Ic.store size={13} />, updates: () => <Ic.clock size={13} />,
  curated: () => <Ic.shield size={13} />, publish: () => <Ic.trend size={13} />,
};

// tone hex (fixtures GREEN/AMBER) → semantic token, for the KPI value colour.
const toneTok = t => (t === GREEN ? "var(--ok)" : t === AMBER ? "var(--warn)" : "var(--ink)");

// ── ResizeObserver → measured [ref, mainW, mainH] (the pack's mainW/mainH) ─────
const useStage = () => {
  const ref = React.useRef(null);
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(es => { for (const e of es) setSize({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size.w, size.h];
};

// price(it) / stars(r) — verbatim from the data builder.
const price = it => ({
  base: it.base ? money(it.base) : "Free",
  markup: it.markup ? "+" + money(it.markup) : "—",
  final: it.base + it.markup ? money(it.base + it.markup) : "Free",
});
const stars = r => "★★★★★".slice(0, Math.round(r)) + "☆☆☆☆☆".slice(0, 5 - Math.round(r));

// ── Shared aside pieces (installed / updates / curated / publish rails) ────────
const SignalsCard = ({ title, signals }) => (
  <div style={{ border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)", padding: "12px 14px", flex: "none" }}>
    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 9 }}>
      {signals.map((s, i) => (
        <div key={i} style={{ border: "1px solid var(--line-soft)", borderLeft: "3px solid " + s.edge, borderRadius: 10, background: "var(--surface-2)", padding: "9px 11px" }}>
          <div style={{ fontSize: 11.5, lineHeight: 1.5, color: "var(--ink-2)" }}>{s.text}</div>
          <div style={{ display: "inline-flex", marginTop: 8, padding: "6px 11px", borderRadius: 8, background: GOLD_BG, color: GOLD_INK, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{s.cta}</div>
        </div>
      ))}
    </div>
  </div>
);

const ReadCard = ({ title, body, ask, onAsk }) => (
  <div style={{ border: "1px solid var(--violet-line)", borderRadius: 13, background: "var(--violet-tint)", padding: "12px 14px", flex: "none" }}>
    <div className="row" style={{ gap: 8 }}>
      <span style={{ color: "var(--violet)", fontSize: 12 }}>✦</span>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--violet)" }}>{title}</div>
    </div>
    <div style={{ fontSize: 12, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 7 }}>{body}</div>
    <div onClick={onAsk} style={{ display: "inline-flex", marginTop: 9, padding: "7px 12px", borderRadius: 9, border: "1px solid var(--violet-line)", background: "var(--surface)", fontSize: 11.5, fontWeight: 600, color: "var(--violet)", cursor: "pointer" }}>{ask}</div>
  </div>
);

const KpiRow = ({ kpis, pad, size }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 10, flex: "none" }}>
    {kpis.map((k, i) => (
      <div key={i} title={k.note} style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", padding: pad, minWidth: 0 }}>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{k.label}</div>
        <div style={{ fontSize: size, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4, color: k.color }}>{k.value}</div>
      </div>
    ))}
  </div>
);

// ── Marketplace screen ────────────────────────────────────────────────────────
export default function AgencyMarketplace({ isAgency = true, acting = null, openAsk = noop }) {
  const reduced = useReducedMotion();
  const [stageRef, mainW, mainH] = useStage();
  const crossBook = isAgency && !acting;                       // §51 master gate

  // §39 fix (peer-gate, R3c-i finding #1) — see CommandCenter.tsx for the full note.
  const [tab, setTab] = useSubtabRoute(isAgency ? "agency" : "sub_account", "marketplace", "today");
  const [mScope, setMScope] = React.useState("agency");
  const [mkFilter, setMkFilter] = React.useState("All");
  const [tSub, setTSub] = React.useState(0);
  const [mkItem, setMkItem] = React.useState(null);           // index | null (fixture item)
  const [mkRail, setMkRail] = React.useState(false);
  const [childId, setChildId] = React.useState(null);         // real sub tenant_id | null (per-child scope)
  const [toast, setToast] = React.useState(null);
  const flash = msg => { setToast(msg); setTimeout(() => setToast(null), 3200); };

  // §51 scope spine — session-derived only. Agency-aggregate resolves the real catalog
  // + sub picker + curate WRITE; own-book/acting returns available:false (never touches
  // the parentage/curation RPCs — the #86-leak firewall). The per-child scope is keyed
  // on a real tenant_id the picker sets (the adapter re-validates it is in the book).
  const mp = useAgencyMarketplace({ isAgency, acting }, { selectedChildId: childId });

  // Tab set: agency (crossBook) gets all six; a sub in view (acting OR standalone)
  // gets today/browse/installed/updates only — Curated + Publish are the agency's
  // resell functions (§60/§61), structurally absent for a sub.
  const subTabKeys = ["today", "browse", "installed", "updates"];
  const tabSet = crossBook ? MK_TABS : MK_TABS.filter(t => subTabKeys.indexOf(t.key) >= 0);
  const tabDef = tabSet.find(t => t.key === tab) || tabSet[0];
  const cur = tabDef.key;
  // scope: only crossBook may leave "agency"; a sub collapses to its own numbers.
  const scopeRaw = crossBook ? (mScope || "agency") : "agency";
  const scope = tabDef.scopes.indexOf(scopeRaw) < 0 ? "agency" : scopeRaw;
  const readOnly = scope === "sub";
  const picked = TEAM_SUBS[tSub || 0];

  const short = mainH > 0 && mainH < 620;
  const narrow = mainW > 0 && mainW < 1000;
  const cardCols = narrow ? "repeat(2,minmax(0,1fr))" : "repeat(3,minmax(0,1fr))";
  const colGap = short ? 9 : 12;
  const kpiPad = short ? "9px 12px" : "13px 15px";
  const kpiSize = short ? 18 : 23;
  const showRail = !narrow;

  // card(it) — the data builder's enrichment, tokenised where structural.
  const card = it => {
    const g = MK_GRAD[it.hue] || [it.hue, it.hue];
    const isOpen = it.adopt >= 6;
    return {
      raw: it, name: it.name, cat: it.cat, note: it.note, hue: it.hue, glyph: it.glyph, docs: it.docs,
      grad: "linear-gradient(150deg," + g[0] + "," + g[1] + ")",
      stars: stars(it.rating || 4),
      metaLine: it.cat + " · " + it.docs,
      actionLabel: isOpen ? "Open" : "Get",
      actionBg: isOpen ? "var(--surface)" : "linear-gradient(180deg,#8E7CF0,#5B49C4)",
      actionColor: isOpen ? "var(--ink-2)" : "#FFFFFF",
      actionEdge: isOpen ? "var(--line)" : "transparent",
      initials: it.name.split(" ").slice(0, 2).map(w => w[0]).join(""),
      rating: it.rating ? it.rating.toFixed(1) : "new",
      installs: it.installs > 999 ? (it.installs / 1000).toFixed(1) + "k" : String(it.installs),
      pub: it.pub, resell: it.resell ? "Resellable" : "Agency only",
      resellBg: it.resell ? "var(--ok-tint)" : "var(--surface-sunk)",
      resellColor: it.resell ? "var(--ok)" : "var(--ink-2)",
      ...price(it),
      adoptLine: it.adopt + " of " + AGENCY.subCount,
      adoptPct: Math.round((it.adopt / AGENCY.subCount) * 100) + "%",
      stack: TEAM_SUBS.slice(0, Math.min(4, it.adopt)).map(s => ({ color: s.color, plate: AV(s.color).plate, ink: AV(s.color).ink, initials: tmInit(s.name) })),
      overflow: it.adopt > 4 ? "+" + (it.adopt - 4) : null,
      open: () => setMkItem(MK_ITEMS.indexOf(it)),
    };
  };
  const items = MK_ITEMS.map(card);
  const detailRaw = mkItem == null ? null : MK_ITEMS[mkItem];

  // ── REAL catalog wiring (agency-aggregate only; §51-gated by the adapter) ──────
  const realItems = mp.available ? mp.rows.map(r => realCard(r)) : [];
  const hasReal = mp.available && realItems.length > 0;
  // REAL sub picker (Args:never firewall). Null → fall back to the frozen fixture chips.
  const realSubs = mp.available && mp.subaccounts.length ? mp.subaccounts : null;
  // The curate WRITE (§10 callable seam) — agency-default allowlist, or a per-child
  // override when a real child is selected. Reports what actually happened (§13).
  const doCurate = async (row, on) => {
    const res = childId ? await mp.curateChild(row, on, childId) : await mp.curate(row, on);
    flash(res.ok ? (on ? "Curated to the book." : "Removed from the book.")
                 : (res.error || "Couldn't update that."));
  };
  // Browse over real rows, honoring the resell/curated filter (Free has no price
  // backend, so it never fabricates a $0 subset — it falls through to all).
  const browseReal = realItems.filter(i => {
    const f = mkFilter || "All";
    if (f === "Resellable") return i.shared;
    if (f === "Agency only") return !i.shared;
    return true;
  });
  const curatedReal = realItems.filter(i => i.shared);

  // ── Derived view values (mirrors the vals object) ───────────────────────────
  const mkTitle = tabDef.label;
  const mkSub = ({
    today: "New for your book, and what's moving across the platform.",
    browse: "Everything she can run — filter by what you can resell.",
    installed: "What's running for your agency, and across your book.",
    updates: "Three capabilities have newer versions waiting.",
    curated: "The capabilities you've made available to your sub-accounts.",
    publish: "Your listings, your earnings, your reseller performance.",
  })[cur];
  const mkScopeNote = acting
    ? "What " + acting.name + " can install — your agency decides what appears here."
    : scope === "agency"
      ? "Everything here derives from the platform catalog. Your curation is a selection from it."
      : scope === "book"
        ? "Aggregate across the book. Observe adoption and propose — you can't install for them from here."
        : "You're observing " + picked.name + ". Installs go to their owner as a proposal.";
  const mkBanner = "No catalog, curation or earnings substrate exists yet — install counts, adoption and revenue here are stand-ins, not platform records.";

  const showScopes = crossBook && tabDef.scopes.length > 1;
  const scopeSegs = [["agency", "Agency"], ["book", "Book"], ["sub", "Per sub-account"]].map(([k, l]) => {
    const on = tabDef.scopes.indexOf(k) >= 0;
    return { key: k, label: l, ok: on, why: on ? "" : l + " · single-scope surface" };
  });
  const showPicker = crossBook && readOnly;

  const mkHero = {
    eyebrow: "NOW RESELLABLE ON AGENCY",
    name: "Give her a funding brain",
    note: "The Borrower-to-Banker methodology, 42 documents, resellable to every sub-account in one tap.",
    grad: "linear-gradient(105deg,#2B2450 0%,#4A3FA0 46%,#8E7CF0 100%)",
    tileGrad: "linear-gradient(150deg,#D9A23F,#9A6B18)",
    tileGlyph: "◉",
    dots: [true, false, false],
    base: money(MK_ITEMS[0].base), markup: "+" + money(MK_ITEMS[0].markup), final: money(MK_ITEMS[0].base + MK_ITEMS[0].markup),
    cta: "Curate for the book", second: "See what it does",
    open: () => setMkItem(0),
  };
  const mkCats = MK_CATS.map((c, i) => ({ ...c, hue: MK_ITEMS[i].hue, tint: MK_ITEMS[i].hue + "14", countLine: c.count + " capabilities" }));
  const mkTodayRow = short ? items.slice(0, 3) : items.slice(0, 6);
  const mkCharts = MK_ITEMS.slice().sort((a, b) => b.installs - a.installs).slice(0, 4).map((it, i) => {
    const g = MK_GRAD[it.hue] || [it.hue, it.hue];
    return {
      rank: String(i + 1), name: it.name, cat: it.cat + " · " + it.docs,
      installs: (it.installs > 999 ? (it.installs / 1000).toFixed(1) + "k" : it.installs) + " installs",
      glyph: it.glyph, grad: "linear-gradient(150deg," + g[0] + "," + g[1] + ")",
      open: () => setMkItem(MK_ITEMS.indexOf(it)),
    };
  });
  const mkChartsTitle = "Top charts";
  const mkSellEyebrow = "BUILD AND SELL";
  const mkSellTitle = "Publish your own capability";
  const mkSellSecond = "Publisher terms";
  const mkSellBody = acting
    ? "Ask your agency about packaging what this business does well. They publish on your behalf and handle the billing."
    : "Package a playbook, curriculum, workflow or vertical brain you built. Sell it to your sub-accounts, the platform, or both. You set the markup, we handle billing and updates.";
  const mkSellCta = "Start a listing";
  const goPublish = () => crossBook && setTab("publish");

  const browseFilters = ["All", "Resellable", "Agency only", "Free"];
  const browseItems = short ? items.slice(0, 4) : items;

  const mkInstalled = (readOnly ? items.slice(0, 4) : items.slice(0, 5)).map(it => ({
    ...it,
    state: readOnly ? "Installed by their owner" : "Live",
    cta: readOnly ? "Propose a change" : "Configure",
  }));
  const matrixTitle = "Adoption across the book";
  const matrixRows = MK_ITEMS.slice(0, short ? 4 : 6).map(it => ({
    name: it.name,
    cells: TEAM_SUBS.map((s, i) => {
      const on = i < it.adopt % (TEAM_SUBS.length + 1);
      return { on, bg: on ? s.color + "26" : "var(--surface-2)", edge: on ? s.color + "66" : "var(--line-soft)" };
    }),
    adopt: it.adopt + "/" + AGENCY.subCount,
  }));

  const mkUpdates = MK_UPDATES.map(u => ({
    ...u,
    tone: u.urgent ? "var(--warn)" : "var(--ok)",
    badge: u.urgent ? "Breaking" : "Safe",
    badgeBg: u.urgent ? "var(--warn-tint)" : "var(--ok-tint)",
    badgeColor: u.urgent ? "var(--warn)" : "var(--ok)",
    cta: readOnly ? "Propose the update" : "Update",
  }));
  const updateAll = readOnly ? null : "Update all safe · 2";

  const mkCurated = (short ? items.slice(0, 3) : items.filter((x, i) => MK_ITEMS[i].resell)).map(it => ({
    ...it, status: "Live to book", statusBg: "var(--ok-tint)", statusColor: "var(--ok)",
  }));
  const bulk = ["Enable for all", "Enable for selected", "Set markup", "Pause", "Retire"];

  const kpis = (cur === "publish"
    ? [
        { label: "ACTIVE LISTINGS", value: String(MK_LISTINGS.filter(l => l.status === "Live").length), note: MK_LISTINGS.length + " total" },
        { label: "INSTALLS THIS MONTH", value: "1,030", note: "platform + book" },
        { label: "PUBLISHER EARNINGS", value: money(3020), note: "platform installs", tone: GREEN },
        { label: "RESELLER REVENUE", value: money(219), note: "your markup on the book", tone: GREEN },
      ]
    : [
        { label: "CURATED", value: "47", note: "available to the book" },
        { label: "INSTALLED", value: "12", note: "across " + AGENCY.subCount + " sub-accounts" },
        { label: "ADOPTION", value: "26%", note: "of what you offered", tone: AMBER },
        { label: "MARKUP REVENUE", value: money(219), note: "this month", tone: GREEN },
      ]).map(k => ({ ...k, color: toneTok(k.tone) }));

  const mkListings = (short ? MK_LISTINGS.slice(0, 3) : MK_LISTINGS).map(l => ({
    name: l.name, cat: l.cat, scope: l.scope,
    installs: l.installs ? l.installs + " platform · " + l.book + " book" : l.book ? l.book + " book" : "no installs yet",
    rating: l.rating ? l.rating.toFixed(1) : "—",
    pubRev: l.pubRev ? money(l.pubRev) : "—",
    resellRev: l.resellRev ? money(l.resellRev) : "—",
    status: l.status,
    statusBg: l.status === "Live" ? "var(--ok-tint)" : l.status === "Pending review" ? "var(--warn-tint)" : "var(--surface-sunk)",
    statusColor: l.status === "Live" ? "var(--ok)" : l.status === "Pending review" ? "var(--warn)" : "var(--ink-2)",
  }));

  const railTitle = cur === "publish" ? "Publisher intelligence" : cur === "curated" ? "Reseller intelligence" : "Worth knowing";
  const signals = (cur === "publish"
    ? [
        { text: "You built three workflows in Vibe Studio last month that could be listed. I can draft the listing pages.", cta: "Draft the listings", edge: "var(--gold)" },
        { text: "Playbooks with eight to twelve documents have the highest install rate. Discovery Call Mastery has four.", cta: "Expand it", edge: "var(--warn)" },
      ]
    : cur === "curated"
      ? [
          { text: "Six of twelve sub-accounts haven't installed " + MK_ITEMS[0].name + " — you offered it thirty days ago.", cta: "Draft a nudge", edge: "var(--gold)" },
          { text: "You've curated 47 capabilities and the book has installed 12. The friction is price, not interest — nine looked and left.", cta: "Review markups", edge: "var(--warn)" },
        ]
      : [
          { text: "QuickBooks Bridge 3.0 is a breaking change. Four sub-accounts run it — I'd stage it one at a time.", cta: "Stage the rollout", edge: "var(--warn)" },
          { text: "Client Portal Themes is installed everywhere in your book. Nothing to do — it's your only clean sweep.", cta: "See the book", edge: "var(--ok)" },
        ]);
  const readTitle = "Her read";
  const read = cur === "publish"
    ? "Client Retention Playbook is trending — 418 installs, 4.6 stars, " + money(1180) + " earned. It's your second seller after Discovery Call Mastery, and the two pair naturally in one bundle."
    : cur === "curated"
      ? "Your book installed 89 capabilities this quarter. " + MK_ITEMS[0].name + " is your top reseller product at " + money(219) + " in markup. Discovery Call Mastery is the natural next promotion."
      : "The platform catalog grew by 31 capabilities this month. Four are resellable in your verticals, and two of those are free to you — markup is pure margin.";
  const askCta = "Explore in Ask Paige →";

  // detail (mkDetail) — full card + install/curate/markup/what-it-does
  const detail = detailRaw ? {
    ...card(detailRaw),
    installCta: readOnly ? "Propose to " + picked.name.split(" ")[0] : "Install for the agency",
    curateCta: detailRaw.resell ? (readOnly ? null : "Curate for the book") : null,
    markupNote: detailRaw.resell
      ? "Base " + (detailRaw.base ? money(detailRaw.base) : "free") + " · your markup " + (detailRaw.markup ? money(detailRaw.markup) : "none set") + " · sub-accounts pay " + (detailRaw.base + detailRaw.markup ? money(detailRaw.base + detailRaw.markup) : "nothing")
      : "This one stays with the agency — the publisher hasn't licensed it for resale.",
    whatItDoes: [
      "Runs inside each tenant's own brand and voice",
      "Files its work under the department you assign",
      "Respects that tenant's autonomy tier, not yours",
    ],
  } : null;

  const tabs = tabSet.map(t => [t.key, t.label, TAB_ICON[t.key], t.badge]);
  const railAside = (extraRead) => (
    <aside style={{ width: 288, flex: "none", minHeight: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", overflowX: "hidden" }}>
      <SignalsCard title={railTitle} signals={signals} />
      {extraRead && <ReadCard title={readTitle} body={read} ask={askCta} onAsk={openAsk} />}
    </aside>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0, alignItems: "stretch" }}>
      <SubTabs tabs={tabs} cur={cur} set={setTab} />

      <div ref={stageRef} key={cur} className={reduced ? "" : "fade-in"} style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: colGap, padding: "16px 26px 22px", width: "100%", maxWidth: 1440, margin: "0 auto" }}>

        {/* Header row */}
        <div className="row" style={{ alignItems: "flex-start", gap: 12, flex: "none", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 9 }}>
              <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".15em", color: "var(--ink-3)" }}>MARKETPLACE</span>
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>{mkTitle}</span>
              <span title={mkBanner} style={{ width: 19, height: 19, borderRadius: 6, background: "var(--warn-tint)", border: "1px solid var(--gold-line)", color: "var(--warn)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, cursor: "help", flex: "none" }}>!</span>
              {/* §13 — Browse/Curated show REAL catalog + a live curate write; Today,
                  Installed, Updates and Publish remain the frozen sample (install counts,
                  earnings and markup have no backend), so they carry the honest marker. */}
              {["today", "installed", "updates", "publish"].indexOf(cur) >= 0 && <PreviewPill />}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 5 }}>{mkSub}</div>
          </div>
          <div className="row" style={{ marginLeft: "auto", gap: 9, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
            {showScopes && <ScopeSeg segs={scopeSegs} value={scope} onChange={setMScope} />}
            <div className="row" style={{ gap: 7, padding: "6px 12px", borderRadius: 20, background: "var(--ok-tint)", fontSize: 11.5, fontWeight: 600, color: "var(--ok)", whiteSpace: "nowrap", flex: "none" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--ok)" }} />5 installed
            </div>
            <div style={{ padding: "6px 12px", borderRadius: 20, background: GOLD_BG, color: GOLD_INK, fontSize: 11.5, fontWeight: 600, whiteSpace: "nowrap", flex: "none" }}>{MK_UPDATES.length + " updates"}</div>
            {narrow && (
              <div onClick={() => setMkRail(true)} style={{ padding: "8px 13px", borderRadius: 9, border: "1px solid var(--violet-line)", background: "var(--violet-tint)", fontSize: 12, fontWeight: 600, color: "var(--violet)", cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>Her read →</div>
            )}
            <div onClick={goPublish} style={{ padding: "8px 14px", borderRadius: 9, background: GOLD_BG, color: GOLD_INK, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>{mkSellCta}</div>
          </div>
        </div>

        <div style={{ fontSize: 11.5, color: "var(--ink-3)", flex: "none", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{mkScopeNote}</div>

        {/* Per-sub-account picker (§51: crossBook + read-only scope only). REAL roster
            (Args:never firewall) when the adapter sourced it; selecting a real sub sets
            the per-child curation scope (childId) the adapter re-validates in-book. */}
        {showPicker && (
          <div className="row" style={{ gap: 7, flex: "none", overflowX: "auto", paddingBottom: 2 }}>
            {(realSubs || TEAM_SUBS).map((s, i) => {
              const sid = realSubs ? s.id : null;
              const on = realSubs ? childId === sid : (tSub || 0) === i;
              const dot = realSubs ? (TEAM_SUBS[i % TEAM_SUBS.length].color) : s.color;
              return (
                <div key={sid || i} onClick={() => { setTSub(i); setChildId(realSubs ? (on ? null : sid) : null); }} className="row" style={{ gap: 7, padding: "6px 11px", borderRadius: 20, border: "1px solid " + (on ? dot + "66" : "var(--line)"), background: on ? dot + "1A" : "var(--surface)", fontSize: 12, fontWeight: on ? 600 : 500, cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>
                  <span style={{ width: 7, height: 7, borderRadius: 2, background: dot, flex: "none" }} />{s.name}
                </div>
              );
            })}
          </div>
        )}

        {/* ── TODAY ── */}
        {cur === "today" && (
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 12, paddingRight: 2 }}>
            {/* Hero */}
            <div onClick={mkHero.open} style={{ position: "relative", borderRadius: 18, background: mkHero.grad, padding: "20px 22px", cursor: "pointer", flex: "none", minWidth: 0, overflow: "hidden", boxShadow: "0 18px 40px rgba(43,36,80,.28)" }}>
              <div style={{ position: "absolute", right: -40, top: -30, width: 190, height: 190, borderRadius: "50%", background: "rgba(255,255,255,.07)" }} />
              <div className="row" style={{ alignItems: "flex-start", gap: 18, minWidth: 0 }}>
                <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".18em", color: "rgba(255,255,255,.72)" }}>{mkHero.eyebrow}</div>
                  <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", marginTop: 8, lineHeight: 1.15, color: "#FFFFFF" }}>{mkHero.name}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.55, color: "rgba(255,255,255,.82)", marginTop: 8, maxWidth: 480 }}>{mkHero.note}</div>
                  <div className="row" style={{ gap: 9, marginTop: 15, flexWrap: "wrap" }}>
                    <div style={{ padding: "9px 18px", borderRadius: 22, background: GOLD_BG, color: GOLD_INK, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{mkHero.cta}</div>
                    <div style={{ padding: "9px 16px", borderRadius: 22, border: "1px solid rgba(255,255,255,.34)", color: "#FFFFFF", fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>{mkHero.second}</div>
                    <div className="row" style={{ marginLeft: "auto", alignItems: "baseline", gap: 9, flex: "none" }}>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>BASE {mkHero.base}</span>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,.6)" }}>MARKUP {mkHero.markup}</span>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFFFF" }}>{mkHero.final}</span>
                    </div>
                  </div>
                </div>
                <div style={{ width: 74, height: 74, borderRadius: 20, background: mkHero.tileGrad, display: "grid", placeItems: "center", fontSize: 28, color: "#FFFFFF", flex: "none", boxShadow: "0 12px 26px rgba(20,14,40,.34)" }}>{mkHero.tileGlyph}</div>
              </div>
              <div className="row" style={{ gap: 5, marginTop: 14 }}>
                {mkHero.dots.map((d, i) => <span key={i} style={{ width: 16, height: 3, borderRadius: 2, background: "rgba(255,255,255,.4)" }} />)}
              </div>
            </div>

            {/* Category cards */}
            <div style={{ display: "grid", gridTemplateColumns: cardCols, gap: 10, flex: "none" }}>
              {mkCats.map((c, i) => (
                <div key={i} style={{ border: "1px solid var(--line-soft)", borderRadius: 15, background: "linear-gradient(150deg," + c.tint + ",var(--surface) 72%)", padding: "13px 15px", cursor: "pointer", minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.4 }}>{c.note}</div>
                  <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 7 }}>{c.countLine}</div>
                </div>
              ))}
            </div>

            {/* Today grid */}
            <div style={{ display: "grid", gridTemplateColumns: cardCols, gap: 10, flex: "none" }}>
              {mkTodayRow.map((i, k) => (
                <div key={k} onClick={i.open} style={{ border: "1px solid var(--line-soft)", borderRadius: 16, background: "var(--surface)", padding: 14, cursor: "pointer", minWidth: 0, display: "flex", flexDirection: "column", gap: 9, boxShadow: "0 2px 8px rgba(40,33,14,.05)" }}>
                  <div className="row" style={{ gap: 11, minWidth: 0 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 13, background: i.grad, color: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 17, flex: "none", boxShadow: "0 6px 14px rgba(30,22,60,.18)" }}>{i.glyph}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</div>
                      <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.pub}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.note}</div>
                  <div className="row" style={{ gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 11, color: "var(--warn)", letterSpacing: ".06em", flex: "none" }}>{i.stars}</span>
                    <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{i.installs}</span>
                    <div style={{ marginLeft: "auto", padding: "6px 15px", borderRadius: 20, background: i.actionBg, color: i.actionColor, border: "1px solid " + i.actionEdge, fontSize: 11.5, fontWeight: 600, cursor: "pointer", flex: "none" }}>{i.actionLabel}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Top charts */}
            <div style={{ border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)", flex: "none" }}>
              <div style={{ padding: "12px 15px 8px", fontSize: 14, fontWeight: 600 }}>{mkChartsTitle}</div>
              {mkCharts.map((c, i) => (
                <div key={i} onClick={c.open} className="row" style={{ gap: 11, padding: "9px 15px", borderTop: "1px solid var(--line-soft)", cursor: "pointer", minWidth: 0 }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "var(--ink-3)", width: 14, flex: "none" }}>{c.rank}</span>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: c.grad, color: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 13, flex: "none", boxShadow: "0 4px 10px rgba(30,22,60,.16)" }}>{c.glyph}</div>
                  <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{c.cat}</div>
                  </div>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--ink-3)", flex: "none" }}>{c.installs}</span>
                </div>
              ))}
            </div>

            {/* Build & sell band */}
            <div onClick={goPublish} style={{ borderRadius: 16, background: "linear-gradient(150deg,#1E1B2E,#12101C)", padding: "17px 19px", cursor: "pointer", flex: "none", boxShadow: "0 16px 34px rgba(14,11,26,.3)" }}>
              <div className="row" style={{ gap: 8 }}>
                <span style={{ color: "#DCC079", fontSize: 11 }}>⚡</span>
                <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".18em", color: "#DCC079" }}>{mkSellEyebrow}</span>
              </div>
              <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", color: "#FFFDF8", marginTop: 8 }}>{mkSellTitle}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "rgba(255,253,248,.74)", marginTop: 7, maxWidth: 540 }}>{mkSellBody}</div>
              <div className="row" style={{ gap: 9, marginTop: 13, flexWrap: "wrap" }}>
                <div style={{ padding: "9px 16px", borderRadius: 10, background: GOLD_BG, color: GOLD_INK, fontSize: 12.5, fontWeight: 600 }}>{mkSellCta}</div>
                <div style={{ padding: "9px 15px", borderRadius: 10, border: "1px solid rgba(255,253,248,.24)", color: "#FFFDF8", fontSize: 12.5, fontWeight: 500 }}>{mkSellSecond}</div>
              </div>
            </div>
          </div>
        )}

        {/* ── BROWSE ── */}
        {cur === "browse" && (
          <>
            <div className="row" style={{ gap: 7, flex: "none", flexWrap: "wrap" }}>
              {browseFilters.map(l => {
                const on = (mkFilter || "All") === l;
                return (
                  <div key={l} onClick={() => setMkFilter(l)} style={{ padding: "6px 12px", borderRadius: 20, border: "1px solid " + (on ? "var(--ink)" : "var(--line)"), background: on ? "var(--ink)" : "var(--surface)", color: on ? "var(--ink-inv)" : "var(--ink-2)", fontSize: 11.5, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>{l}</div>
                );
              })}
              {/* §13 — names/categories/curation status are REAL; pricing has no backend. */}
              {hasReal && <span className="row" style={{ gap: 6, marginLeft: "auto", flex: "none" }}><span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>Prices</span><PreviewPill /></span>}
            </div>
            {mp.isError && <div style={{ flex: "none", padding: "9px 13px", borderRadius: 10, border: "1px solid var(--bad)", fontSize: 12, fontWeight: 600, color: "var(--bad)" }}>Couldn't load the live catalog just now.</div>}
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "grid", gridTemplateColumns: cardCols, gap: 10, alignContent: "start", paddingRight: 2 }}>
              {(hasReal ? browseReal : browseItems).map((i, k) => (
                <div key={i.real ? i.id : k} onClick={i.real ? undefined : i.open} style={{ border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)", padding: "13px 14px", cursor: i.real ? "default" : "pointer", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div className="row" style={{ gap: 10, minWidth: 0 }}>
                    <div style={{ width: 38, height: 38, borderRadius: 12, background: i.grad, color: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 15, flex: "none", boxShadow: "0 5px 12px rgba(30,22,60,.16)" }}>{i.glyph}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</div>
                      <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.cat}</div>
                    </div>
                    <span style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 20, background: i.resellBg, color: i.resellColor, fontSize: 10, fontWeight: 600, flex: "none" }}>{i.resell}</span>
                  </div>
                  {i.real ? (
                    // REAL row — the live curate toggle (§10 write); pricing is Preview.
                    <div className="row" style={{ alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, color: "var(--ink-3)" }}>Price</span><PreviewPill />
                      <button
                        onClick={e => { e.stopPropagation(); doCurate(i.raw, !i.shared); }}
                        disabled={mp.saving === i.id || mp.forbidden}
                        title={mp.forbidden ? "Only an agency owner or admin can curate" : ""}
                        style={{ marginLeft: "auto", padding: "6px 13px", borderRadius: 9, background: i.shared ? "var(--surface)" : GOLD_BG, color: i.shared ? "var(--ink-2)" : GOLD_INK, border: "1px solid " + (i.shared ? "var(--line)" : "transparent"), fontSize: 11.5, fontWeight: 600, cursor: mp.forbidden ? "not-allowed" : "pointer", flex: "none", opacity: mp.forbidden ? 0.6 : 1 }}
                      >{mp.saving === i.id ? "Working…" : i.shared ? "Curated ✓" : "Curate for the book"}</button>
                    </div>
                  ) : (
                    <div className="row" style={{ alignItems: "baseline", gap: 9, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 10, color: "var(--ink-3)" }}>BASE {i.base}</span>
                      <span style={{ fontSize: 10, color: "var(--ink-3)" }}>{i.markup}</span>
                      <span style={{ marginLeft: "auto", fontSize: 13.5, fontWeight: 700 }}>{i.final}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── INSTALLED ── */}
        {cur === "installed" && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 13 }}>
            <div style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, overflowY: "auto", overflowX: "hidden", border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)" }}>
              {mkInstalled.map((i, k) => (
                <div key={k} onClick={i.open} className="row" style={{ gap: 11, padding: "10px 14px", borderBottom: "1px solid var(--line-soft)", cursor: "pointer", minWidth: 0 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 11, background: i.grad, color: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 14, flex: "none", boxShadow: "0 4px 10px rgba(30,22,60,.16)" }}>{i.glyph}</div>
                  <div style={{ minWidth: 80, flex: "1 1 auto", overflow: "hidden" }}>
                    <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.cat} · {i.state}</div>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, flex: "none" }}>{i.final}</span>
                  <span style={{ padding: "5px 11px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)", flex: "none", whiteSpace: "nowrap" }}>{i.cta}</span>
                </div>
              ))}
            </div>
            {showRail && (
              <aside style={{ width: 288, flex: "none", minHeight: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", overflowX: "hidden" }}>
                {/* §51/#86: the "Adoption across the book" matrix is a CROSS-BOOK
                    aggregate (TEAM_SUBS cells + AGENCY.subCount) — it renders ONLY in
                    agency mode with no acting-as. A standalone sub (isAgency false) OR
                    the agency acting-as a sub (acting != null) has crossBook===false and
                    must never see another book's adoption; it keeps only "Her read". */}
                {crossBook && (
                  <div style={{ border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)", padding: "12px 14px", flex: "none" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600 }}>{matrixTitle}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 9 }}>
                      {matrixRows.map((r, i) => (
                        <div key={i} style={{ minWidth: 0 }}>
                          <div className="row" style={{ gap: 8, minWidth: 0 }}>
                            <span style={{ fontSize: 11.5, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</span>
                            <span style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{r.adopt}</span>
                          </div>
                          <div className="row" style={{ gap: 3, marginTop: 5 }}>
                            {r.cells.map((c, j) => <span key={j} style={{ flex: 1, height: 12, borderRadius: 3, border: "1px solid " + c.edge, background: c.bg }} />)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <ReadCard title={readTitle} body={read} ask={askCta} onAsk={openAsk} />
              </aside>
            )}
          </div>
        )}

        {/* ── UPDATES ── */}
        {cur === "updates" && (
          <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 13 }}>
            <div style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 9 }}>
              {updateAll && (
                <div className="row" style={{ display: "inline-flex", gap: 8, padding: "8px 14px", borderRadius: 9, background: GOLD_BG, color: GOLD_INK, fontSize: 12.5, fontWeight: 600, cursor: "pointer", alignSelf: "flex-start", flex: "none" }}><span style={{ fontSize: 11 }}>✓</span>{updateAll}</div>
              )}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 10 }}>
                {mkUpdates.map((u, i) => (
                  <div key={i} style={{ border: "1px solid var(--line)", borderLeft: "3px solid " + u.tone, borderRadius: 12, background: "var(--surface)", padding: "12px 14px", flex: "none", minWidth: 0 }}>
                    <div className="row" style={{ gap: 9, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>{u.name}</span>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "var(--ink-2)" }}>{u.ver}</span>
                      <span style={{ padding: "2px 9px", borderRadius: 20, background: u.badgeBg, color: u.badgeColor, fontSize: 10.5, fontWeight: 600 }}>{u.badge}</span>
                    </div>
                    <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>{u.note}</div>
                    <div style={{ display: "inline-flex", marginTop: 10, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, fontWeight: 600, color: "var(--ink-2)", cursor: "pointer" }}>{u.cta}</div>
                  </div>
                ))}
              </div>
            </div>
            {showRail && <aside style={{ width: 288, flex: "none", minHeight: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", overflowX: "hidden" }}><SignalsCard title={railTitle} signals={signals} /></aside>}
          </div>
        )}

        {/* ── CURATED (§60/§61 resell — crossBook only) ── */}
        {cur === "curated" && (
          <>
            {/* §13 — CURATED/INSTALLED/ADOPTION/MARKUP have no adoption/earnings backend. */}
            <div className="row" style={{ gap: 7, flex: "none", alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)" }}>YOUR CURATION</span>
              <PreviewPill />
              <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>Counts, adoption and markup revenue are stand-ins; the curate toggles below are live.</span>
            </div>
            <KpiRow kpis={kpis} pad={kpiPad} size={kpiSize} />
            <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 13 }}>
              <div style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="row" style={{ gap: 7, flex: "none", overflowX: "auto", paddingBottom: 1 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)", flex: "none" }}>BULK</span>
                  {bulk.map((b, i) => (
                    <div key={i} style={{ padding: "6px 11px", borderRadius: 20, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 11, color: "var(--ink-2)", cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>{b}</div>
                  ))}
                </div>
                {mp.forbidden && (
                  <div className="row" style={{ gap: 8, flex: "none", padding: "9px 13px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 11.5, color: "var(--ink-2)" }}>
                    <span style={{ flex: "none" }}>⚿</span>Read-only — only an agency owner or admin can curate the catalog.
                  </div>
                )}
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)" }}>
                  {/* REAL curation catalog + live curate WRITE (§10). Preview only where the
                      frozen design shows adoption/price (no backend). Fixture fallback keeps
                      the byte-identical sample when there is no real catalog to show yet. */}
                  {hasReal
                    ? (curatedReal.length === 0
                        ? <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--ink-2)", fontSize: 13 }}>Nothing curated to the book yet. Open Browse to curate a capability.</div>
                        : curatedReal.map((i, k) => (
                          <div key={i.id} style={{ padding: "10px 14px", borderBottom: "1px solid var(--line-soft)", minWidth: 0 }}>
                            <div className="row" style={{ gap: 10, minWidth: 0 }}>
                              <div style={{ width: 30, height: 30, borderRadius: 10, background: i.grad, color: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 13, flex: "none", boxShadow: "0 4px 10px rgba(30,22,60,.16)" }}>{i.glyph}</div>
                              <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</span>
                              <span style={{ padding: "2px 8px", borderRadius: 20, background: i.statusBg, color: i.statusColor, fontSize: 10, fontWeight: 600, flex: "none" }}>{i.status}</span>
                              <span style={{ marginLeft: "auto", flex: "none" }}><PreviewPill /></span>
                            </div>
                            <div className="row" style={{ gap: 9, marginTop: 7, minWidth: 0 }}>
                              <span style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.cat}</span>
                              <button
                                onClick={() => doCurate(i.raw, false)}
                                disabled={mp.saving === i.id}
                                style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)", cursor: "pointer", flex: "none" }}
                              >{mp.saving === i.id ? "Working…" : "Remove from book"}</button>
                            </div>
                          </div>
                        )))
                    : mkCurated.map((i, k) => (
                    <div key={k} onClick={i.open} style={{ padding: "10px 14px", borderBottom: "1px solid var(--line-soft)", cursor: "pointer", minWidth: 0 }}>
                      <div className="row" style={{ gap: 10, minWidth: 0 }}>
                        <div style={{ width: 30, height: 30, borderRadius: 10, background: i.grad, color: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 13, flex: "none", boxShadow: "0 4px 10px rgba(30,22,60,.16)" }}>{i.glyph}</div>
                        <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 20, background: i.statusBg, color: i.statusColor, fontSize: 10, fontWeight: 600, flex: "none" }}>{i.status}</span>
                        <span style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{i.adoptLine}</span>
                      </div>
                      <div className="row" style={{ gap: 9, marginTop: 7, flexWrap: "nowrap", overflow: "hidden" }}>
                        <div className="row" style={{ flex: "none" }}>
                          {i.stack.map((s, j) => (
                            <span key={j} style={{ width: 20, height: 20, borderRadius: "50%", background: s.plate, color: s.ink, display: "grid", placeItems: "center", fontSize: 8, fontWeight: 700, marginRight: -6, border: "2px solid var(--surface)" }}>{s.initials}</span>
                          ))}
                          {i.overflow && <span style={{ marginLeft: 10, fontSize: 10.5, color: "var(--ink-3)" }}>{i.overflow}</span>}
                        </div>
                        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)", flex: "none" }}>BASE {i.base}</span>
                        <span style={{ fontSize: 10, color: "var(--ink-3)", flex: "none" }}>MARKUP {i.markup}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, flex: "none" }}>{i.final}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {showRail && railAside(true)}
            </div>
          </>
        )}

        {/* ── PUBLISH (§60/§61 resell — crossBook only) ── */}
        {cur === "publish" && (
          <>
            <KpiRow kpis={kpis} pad={kpiPad} size={kpiSize} />
            <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 13 }}>
              <div style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 9 }}>
                <div className="row" style={{ gap: 9, flex: "none" }}>
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>Your listings</span>
                  <div style={{ marginLeft: "auto", padding: "7px 13px", borderRadius: 9, background: GOLD_BG, color: GOLD_INK, fontSize: 12, fontWeight: 600, cursor: "pointer", flex: "none" }}>+ Start a new listing</div>
                </div>
                <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)" }}>
                  {mkListings.map((l, i) => (
                    <div key={i} style={{ padding: "10px 14px", borderBottom: "1px solid var(--line-soft)", minWidth: 0, cursor: "pointer" }}>
                      <div className="row" style={{ gap: 9, minWidth: 0 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.name}</span>
                        <span style={{ padding: "2px 8px", borderRadius: 20, background: l.statusBg, color: l.statusColor, fontSize: 10, fontWeight: 600, flex: "none" }}>{l.status}</span>
                        <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none", whiteSpace: "nowrap" }}>{l.scope}</span>
                      </div>
                      <div className="row" style={{ gap: 12, marginTop: 6, flexWrap: "nowrap", overflow: "hidden" }}>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: "var(--ink-2)", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l.installs}</span>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>★ {l.rating}</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)", flex: "none" }}>PUBLISHER {l.pubRev}</span>
                        <span style={{ fontSize: 10, color: "var(--ink-3)", flex: "none" }}>RESELL {l.resellRev}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {showRail && railAside(true)}
            </div>
          </>
        )}
      </div>

      {/* ── Mobile "Her read" rail slide-out (mkRailOpen) ── */}
      {mkRail && (
        <div onClick={e => { if (e.target === e.currentTarget) setMkRail(false); }} style={{ position: "fixed", inset: 0, background: "rgba(38,32,18,.42)", display: "grid", placeItems: "center", zIndex: 88, padding: 30 }}>
          <div className={reduced ? "" : "fade-in"} style={{ width: "min(600px,100%)", maxHeight: "86vh", border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface-2)", boxShadow: "0 40px 90px rgba(35,28,10,.26)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className="row" style={{ gap: 12, padding: "15px 20px", borderBottom: "1px solid var(--line-soft)", background: "var(--surface)", flex: "none" }}>
              <div style={{ fontSize: 15.5, fontWeight: 600 }}>{railTitle}</div>
              <div onClick={() => setMkRail(false)} style={{ marginLeft: "auto", cursor: "pointer", color: "var(--ink-3)", fontSize: 14, flex: "none" }}>✕</div>
            </div>
            <div style={{ padding: "16px 20px", overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 11 }}>
              {signals.map((s, i) => (
                <div key={i} style={{ border: "1px solid var(--line-soft)", borderLeft: "3px solid " + s.edge, borderRadius: 12, background: "var(--surface)", padding: "13px 15px" }}>
                  <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)" }}>{s.text}</div>
                  <div style={{ display: "inline-flex", marginTop: 11, padding: "9px 15px", borderRadius: 9, background: GOLD_BG, color: GOLD_INK, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{s.cta}</div>
                </div>
              ))}
              <div style={{ border: "1px solid var(--violet-line)", borderRadius: 12, background: "var(--violet-tint)", padding: "13px 15px" }}>
                <div className="row" style={{ gap: 8 }}>
                  <span style={{ color: "var(--violet)", fontSize: 12 }}>✦</span>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--violet)" }}>{readTitle}</div>
                </div>
                <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 8 }}>{read}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Item detail / install drawer (mkDetailOpen) ── */}
      {detail && (
        <div onClick={e => { if (e.target === e.currentTarget) setMkItem(null); }} style={{ position: "fixed", inset: 0, background: "rgba(38,32,18,.42)", display: "grid", placeItems: "center", zIndex: 88, padding: 30 }}>
          <div className={reduced ? "" : "fade-in"} style={{ width: "min(660px,100%)", maxHeight: "86vh", border: "1px solid var(--line)", borderRadius: 16, background: "var(--surface)", boxShadow: "0 40px 90px rgba(35,28,10,.26)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div className="row" style={{ alignItems: "flex-start", gap: 13, padding: "18px 20px", borderBottom: "1px solid var(--line-soft)", background: "linear-gradient(135deg," + detail.hue + "1A,var(--surface-2) 70%)", flex: "none" }}>
              <div style={{ width: 52, height: 52, borderRadius: 15, background: detail.hue, color: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 17, fontWeight: 700, flex: "none" }}>{detail.initials}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.25 }}>{detail.name}</div>
                <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 5 }}>{detail.cat} · {detail.pub}</div>
                <div className="row" style={{ gap: 10, marginTop: 7, flexWrap: "wrap" }}>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: "var(--ink-2)" }}>★ {detail.rating}</span>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11.5, color: "var(--ink-3)" }}>{detail.installs} installs</span>
                  <span style={{ padding: "2px 9px", borderRadius: 20, background: detail.resellBg, color: detail.resellColor, fontSize: 10.5, fontWeight: 600 }}>{detail.resell}</span>
                </div>
              </div>
              <div onClick={() => setMkItem(null)} style={{ marginLeft: "auto", cursor: "pointer", color: "var(--ink-3)", fontSize: 14, flex: "none" }}>✕</div>
            </div>
            <div style={{ padding: "18px 20px", overflowY: "auto", minHeight: 0, display: "flex", flexDirection: "column", gap: 13 }}>
              <div style={{ fontSize: 14.5, lineHeight: 1.6, color: "var(--ink)" }}>{detail.note}</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 10 }}>
                <div style={{ border: "1px solid var(--line-soft)", borderRadius: 11, background: "var(--surface-2)", padding: "11px 13px" }}>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)" }}>BASE</div>
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{detail.base}</div>
                </div>
                <div style={{ border: "1px solid var(--line-soft)", borderRadius: 11, background: "var(--surface-2)", padding: "11px 13px" }}>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)" }}>YOUR MARKUP</div>
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4 }}>{detail.markup}</div>
                </div>
                <div style={{ border: "1px solid var(--gold-line)", borderRadius: 11, background: "var(--gold-tint)", padding: "11px 13px" }}>
                  <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".13em", color: "var(--warn)" }}>THEY PAY</div>
                  <div style={{ fontSize: 17, fontWeight: 700, marginTop: 4, color: "var(--warn)" }}>{detail.final}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--ink-2)" }}>{detail.markupNote}</div>
              <div>
                <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)" }}>WHAT IT DOES</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                  {detail.whatItDoes.map((w, i) => (
                    <div key={i} className="row" style={{ alignItems: "flex-start", gap: 8 }}>
                      <span style={{ color: "var(--ok)", fontSize: 11, flex: "none" }}>✓</span>
                      <span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{w}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* WHO HAS IT — adoption stack (§51: crossBook only; a sub sees no book aggregate) */}
              {crossBook && (
                <div>
                  <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)" }}>WHO HAS IT</div>
                  <div className="row" style={{ gap: 11, marginTop: 9 }}>
                    <div className="row">
                      {detail.stack.map((s, i) => (
                        <span key={i} style={{ width: 26, height: 26, borderRadius: "50%", background: s.plate, color: s.ink, display: "grid", placeItems: "center", fontSize: 9.5, fontWeight: 700, marginRight: -7, border: "2px solid var(--surface)" }}>{s.initials}</span>
                      ))}
                    </div>
                    <span style={{ fontSize: 12.5, color: "var(--ink-2)", marginLeft: 8 }}>{detail.adoptLine} sub-accounts · {detail.adoptPct}</span>
                  </div>
                </div>
              )}
            </div>
            <div className="row" style={{ gap: 10, padding: "14px 20px", borderTop: "1px solid var(--line-soft)", background: "var(--surface-2)", flex: "none", flexWrap: "wrap" }}>
              {detail.curateCta && (
                <div className="row" style={{ gap: 8, padding: "10px 18px", borderRadius: 10, background: GOLD_BG, color: GOLD_INK, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}><span style={{ fontSize: 11 }}>✓</span>{detail.curateCta}</div>
              )}
              <div style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13.5, fontWeight: 600, color: "var(--ink-2)", cursor: "pointer" }}>{detail.installCta}</div>
            </div>
          </div>
        </div>
      )}

      {/* Curate-write toast (§13 — reports what actually happened, never a hope). */}
      {toast && (
        <div className={reduced ? "" : "fade-in"} style={{ position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", zIndex: 96, padding: "10px 16px", borderRadius: 10, background: "var(--ink)", color: "var(--ink-inv)", fontSize: 12.5, fontWeight: 600, boxShadow: "0 12px 30px rgba(20,16,8,.3)" }}>{toast}</div>
      )}
    </div>
  );
}
