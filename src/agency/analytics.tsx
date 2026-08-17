// @ts-nocheck
// Agency pack — Analytics screen. Faithful port of the Claude Design "CRM agency
// mode" pack (Agency Shell.dc.html), owner-locked 2026-08-17 (§28/§63: "We do not
// drift off this whatsoever"). Mirrors the Solo analytics port (src/solo/analytics2.tsx)
// in role, but this surface is the DESIGN's own agency Analytics stage — six sub-tabs
// (Brief · The money · Profitability · Retention · Decisions · Market watch), the
// three-scope segment (Agency · Book · Per sub-account), a draggable window dial on
// Brief, a KPI row, a responsive charts grid (line/bars/donut/scatter/heat/cards/
// scenarios), a fold-cards row, and a right rail — all data-driven by anVals(), the
// verbatim port of the design's anVals() builder (Agency Shell.dc.html:8886-9520).
//
// Pop-outs (each self-managed here): the Fold detail foldout (anPop / anPopOpen — the
// design's center modal, ported through the ./_shared Modal primitive), the Sub picker
// (anPickOpen — AGENCY-ONLY per §51), and Ask Paige (via the shell `openAsk` prop).
// The design's Needs-attention overlay is a Command Center element, NOT shared on this
// surface, so it is intentionally absent here.
//
// §51: a standalone sub-account (isAgency===false) OR the agency acting-as a sub
// (acting != null) collapses to crossBook===false — the [Book]/[Per sub-account]
// scopes, the sub-picker, and every cross-book aggregate are STRUCTURALLY gated behind
// crossBook, leaving only the entity's OWN numbers. AN_SUBS / AN_TABS are the design's
// analytics data; they live in ./fixtures (§18: one home) and are imported here.
//
// The design hardcodes hex; structural chrome (surfaces, borders, ink, semantic status,
// the read banner) is token-driven so it themes light↔dark (§11/§23). The data-viz
// palette (sub brand colors, bar/donut/scatter/heat fills) and the skeuomorphic dial
// stay literal — a decorative chart palette with no semantic token, exactly as the rest
// of the pack treats data colors.
import React from "react";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, SubTabs, Modal, useReducedMotion } from "./_shared";

const noop = () => {};
const money = n => "$" + n.toLocaleString();

// Semantic status → tokens (design consts gold/vio and the kpi delta palette).
const T_OK = "var(--ok)", T_WARN = "var(--warn)", T_BAD = "var(--bad)", T_GOLD = "var(--gold)", T_VIO = "var(--violet)";

// ── AN_SUBS / AN_TABS (Agency Shell.dc.html:8577-8593) ──────────────────────
// Analytics-specific: each sub-account carries mrr + vertical the analytics math
// reads. Decorative names only (§63) — no owner real accounts, no trademarks (§50).
const AN_SUBS = [
  { key: "Sarah's Coaching Practice", owner: "Sarah Whitfield", color: "#7C6CE0", mrr: 1450, vertical: "Fitness coaching" },
  { key: "Northwind Dental Group", owner: "Priya Raman", color: "#2F7A57", mrr: 2100, vertical: "Health" },
  { key: "Coach James Fitness", owner: "James Alarie", color: "#C8702E", mrr: 6200, vertical: "Fitness coaching" },
  { key: "Ridgeline Consulting", owner: "Dana Cole", color: "#4A78C8", mrr: 850, vertical: "Business consulting" },
  { key: "Fernwood Law", owner: "Marcus Reed", color: "#8A5A9E", mrr: 3400, vertical: "Law" },
  { key: "Kestrel Advisory", owner: "Ana Ferreira", color: "#B5822A", mrr: 1900, vertical: "Business consulting" }
];

const AN_TABS = [
  { key: "brief", label: "Brief", title: "Brief", sub: "Where things stand, what changed, what needs you." },
  { key: "money", label: "The money", title: "The money", sub: "Revenue, expenses, cash — where it comes from, where it goes, what's next." },
  { key: "profit", label: "Profitability", title: "Profitability", sub: "Which work makes money, which work loses money, and what to change." },
  { key: "retain", label: "Retention", title: "Retention", sub: "Who's staying, who's leaving, and what she's doing about it." },
  { key: "decide", label: "Decisions", title: "Decisions", sub: "What if you did this? She's already modeled it." },
  { key: "market", label: "Market watch", title: "Market watch", sub: "What's happening in your market — and your sub-accounts' markets." }
];

// SubTabs glyph mapping (mirrors the Solo analytics mapping: brief→spark, money→chart,
// profit→trend, retain→users, decide→shield, market→search).
const TAB_ICON = { brief: () => <Ic.spark size={14} />, money: () => <Ic.chart size={14} />, profit: () => <Ic.trend size={14} />, retain: () => <Ic.users size={14} />, decide: () => <Ic.shield size={14} />, market: () => <Ic.search size={14} /> };

// ── anVals — verbatim port of the design's per-tab content builder ──────────
// Returns { agency, book } content per tab. `gold`/`vio` are tone tokens.
function buildTabs(days, dayScale, scaled, line, kpi, bookMrr) {
  const gold = T_GOLD, vio = T_VIO;
  const winLabel = days === 1 ? "Today" : "Last " + days + " days";
  const T = {};

  T.brief = {
    agency: {
      read: [winLabel === "Today" ? "Your read this morning" : "Your read · " + winLabel.toLowerCase(), (days === 1
        ? "Today: MRR from sub-accounts sits at " + money(44430) + ", " + scaled(1120, "$") + " of movement since yesterday. One renewal draft is waiting on you and Client Success is still over 90%."
        : "MRR from sub-accounts is " + money(44430) + ", up " + (7.5 * dayScale).toFixed(1) + "% across " + winLabel.toLowerCase() + " — Coach James's expansion carried most of it. " + scaled(2, "") + " renewals need you, and Client Success has been over 90% capacity for three weeks running.") + " Nothing is on fire; the hiring question is the real decision in front of you."],
      kpis: [kpi("MRR from sub-accounts", money(44430), "+" + (7.5 * dayScale).toFixed(1) + "%"), kpi("Sub-accounts active", "12", days >= 5 ? "+1" : "flat", days >= 5 ? true : null), kpi("Team utilization", "87%", "+" + Math.max(1, Math.round(4 * dayScale)) + " pts", false), kpi("Movement", scaled(1120 * 7, "$"), winLabel, null)],
      charts: [
        { type: "line", title: "MRR trajectory", note: "Twelve months, agency scope", pts: line([28, 30, 31, 33, 34, 36, 37, 39, 40, 41, 43, 44]), foot: money(28000) + " → " + money(44430) },
        { type: "bars", title: "What changed this week", note: "Weighted by MRR impact", rows: [
          { label: "Kestrel Advisory added", val: "+" + money(1900), pct: 100, color: "#2F7A57" },
          { label: "Coach James expanded", val: "+" + money(800), pct: 42, color: "#2F7A57" },
          { label: "Ridgeline downgraded", val: "−" + money(200), pct: 11, color: "#B4483C" }
        ] }
      ],
      folds: [
        { key: "changed", label: "Event log · " + winLabel.toLowerCase(), value: scaled(6, ""), unit: days === 1 ? "events today" : "events", note: "Two add-ons, one downgrade, one new sub-account", tone: gold, rows: [
          { a: "Aug 14", b: "Kestrel Advisory signed", c: "+" + money(1900) + " MRR" },
          { a: "Aug 12", b: "Coach James added the second seat", c: "+" + money(800) + " MRR" },
          { a: "Aug 11", b: "Ridgeline moved to the lighter plan", c: "−" + money(200) + " MRR" },
          { a: "Aug 11", b: "Nadia Cruz started — Client Success", c: "day 4 of 30" },
          { a: "Aug 9", b: "Fernwood renewed for twelve months", c: money(3400) + " MRR held" },
          { a: "Aug 9", b: "Sarah's Practice crossed 90% utilization", c: "flagged" }
        ] },
        { key: "attention", label: "Needs your decision", value: "4", unit: "open items", note: "Two renewals, one hire, one at-risk account", tone: "#B5822A", rows: [
          { a: "Renewal", b: "Northwind Dental — 9 days out", c: "Draft ready" },
          { a: "Renewal", b: "Sarah's Practice — 16 days out", c: "Draft ready" },
          { a: "Hiring", b: "Client Success at 94% for three weeks", c: "Model it" },
          { a: "At risk", b: "Ridgeline — usage down 40%", c: "Play ready" }
        ] },
        { key: "monday", label: "Monday brief", value: "Wk 33", unit: "weekly deep read", note: "The full weekly summary she writes for you", tone: vio, rows: [
          { a: "Money", b: "MRR up 7.5%, expenses flat", c: "healthy" },
          { a: "Book", b: "3 grew, 2 flat, 1 shrank", c: "watch Ridgeline" },
          { a: "Team", b: "Client Success over capacity", c: "decide" },
          { a: "Market", b: "Fitness pricing compressing", c: "3 accounts exposed" }
        ] }
      ],
      rail: [
        { title: "Trending up", rows: [["Coach James Fitness", "+13%"], ["Fernwood Law", "+6%"], ["Northwind Dental", "+4%"]] },
        { title: "Trending down", rows: [["Ridgeline Consulting", "−19%"], ["Kestrel Advisory", "−2%"]] }
      ]
    },
    book: {
      read: ["Her read across your book", "This week across your twelve sub-accounts: three grew MRR, two lost clients, one crossed 90% team utilization. Ridgeline is at 47 days without a new client — flagging that for you. Coach James is 28% of your book, which is the number I'd want you looking at first."],
      kpis: [kpi("Total book MRR", money((bookMrr * 2.9) | 0), "+6.1%"), kpi("Book growth rate", "6.1%", "+0.8 pts"), kpi("Sub-accounts at risk", "3", "+1", false), kpi("Patterns detected", "5", "this week", null)],
      charts: [
        { type: "bars", title: "Book MRR by sub-account", note: "Ranked by contribution", rows: AN_SUBS.slice().sort((a, b) => b.mrr - a.mrr).map(s => ({ label: s.key, val: money(s.mrr), pct: s.mrr / 6200 * 100, color: s.color })) },
        { type: "donut", title: "Concentration", note: "Share of book revenue by top-N", total: "28%", label: "top 1", stops: "conic-gradient(from -90deg,#C8702E 0 28%,#DCC079 28% 52%,#EADFC2 52% 74%,#EFEBE1 74% 100%)", legend: [
          { label: "Coach James Fitness", meta: "28%", color: "#C8702E" },
          { label: "Next two", meta: "24%", color: "#DCC079" },
          { label: "Next three", meta: "22%", color: "#EADFC2" },
          { label: "Remaining six", meta: "26%", color: "#EFEBE1" }
        ] }
      ],
      folds: [
        { key: "bookchange", label: "Book changes this week", value: "11", unit: "events across 12", note: "Three grew, two lost a client, one over capacity", tone: gold, rows: AN_SUBS.map(s => ({ a: s.key.split(" ")[0], b: s.key, c: money(s.mrr) + " MRR" })) },
        { key: "patterns", label: "Patterns she spotted", value: "5", unit: "spanning accounts", note: "Cross-book signals no single account would show", tone: vio, rows: [
          { a: "Pricing", b: "Four accounts asked about annual billing this month", c: "Draft ready" },
          { a: "Onboarding", b: "Q3 cohort is slower to first value than Q2", c: "Investigate" },
          { a: "Support", b: "Same integration question from three owners", c: "Add to KB" },
          { a: "Retention", b: "Engagement drops precede churn by ~5 weeks", c: "Wire alert" },
          { a: "Expansion", b: "Three accounts show second-seat signals", c: "Play ready" }
        ] },
        { key: "concentration", label: "Concentration flag", value: "52%", unit: "in top three", note: "Above the 50% line — worth diversifying", tone: "#B4483C", rows: [
          { a: "Top 1", b: "Coach James Fitness", c: "28% · " + money(6200) },
          { a: "Top 3", b: "James, Fernwood, Northwind", c: "52%" },
          { a: "If top 1 churned", b: "Book MRR drops " + money(6200), c: "runway −2 mo" },
          { a: "Her call", b: "Three accounts carry expansion signals worth working", c: "Play ready" }
        ] }
      ],
      rail: [
        { title: "Grew this week", rows: [["Coach James Fitness", "+13%"], ["Fernwood Law", "+6%"], ["Northwind Dental", "+4%"]] },
        { title: "At risk", rows: [["Ridgeline Consulting", "usage −40%"], ["Fernwood Law", "payment failed"], ["Kestrel Advisory", "sentiment"]] }
      ]
    }
  };

  T.money = {
    agency: {
      read: ["Her read on the money", "You've grown MRR 34% year to date. Your biggest expense growth is Paige compute, and it tracks sub-account count — that's healthy growth, not drift. Cash runway is solid at fourteen months."],
      kpis: [kpi("MRR", money(44430), "+7.5%"), kpi("ARR", money(533160), "+34% YTD"), kpi("Monthly expenses", money(29800), "+2.1%", null), kpi("Net margin", "33%", "+3 pts")],
      charts: [
        { type: "line", title: "Revenue trajectory", note: "Twelve months with growth overlay", pts: line([28, 30, 31, 33, 34, 36, 37, 39, 40, 41, 43, 44]), foot: "Growth rate 6.1% monthly average" },
        { type: "bars", title: "Expense breakdown", note: "Share of " + money(29800) + " monthly", rows: [
          { label: "Team", val: money(18400), pct: 100, color: "#8A6D1E" },
          { label: "Paige compute", val: money(6100), pct: 33, color: "#C8A02E" },
          { label: "Tools", val: money(3200), pct: 17, color: "#DCC079" },
          { label: "Marketing", val: money(2100), pct: 11, color: "#EADFC2" }
        ] }
      ],
      folds: [
        { key: "cash", label: "Cash flow", value: "14 mo", unit: "runway", note: "Inflow against outflow, twelve months", tone: gold, rows: [
          { a: "Inflow", b: "Sub-account billing", c: money(44430) + " / mo" },
          { a: "Outflow", b: "Team, compute, tools, marketing", c: money(29800) + " / mo" },
          { a: "Net", b: "Retained monthly", c: "+" + money(14630) },
          { a: "Reserve", b: "Cash on hand", c: money(204820) }
        ] },
        { key: "unit", label: "Unit economics", value: money(3702), unit: "MRR per sub-account", note: "Average across the book, agency revenue only", tone: vio, rows: [
          { a: "Average", b: "MRR per sub-account", c: money(3702) },
          { a: "Highest", b: "Coach James Fitness", c: money(6200) },
          { a: "Lowest", b: "Ridgeline Consulting", c: money(850) },
          { a: "Break-even", b: "Cost to serve the median account", c: money(1180) }
        ] }
      ],
      rail: [
        { title: "Expense growth", rows: [["Paige compute", "+14%"], ["Team", "+2%"], ["Tools", "flat"]] },
        { title: "Watch", rows: [["Compute per account", money(508)], ["Tool overlap", "2 found"]] }
      ]
    },
    book: {
      read: ["Her read on concentration", "Coach James Fitness is 28% of your book. If he churned tomorrow your MRR drops by " + money(6200) + " and your runway loses two months. Three sub-accounts in your book carry expansion signals worth exploring — that's the cheaper way to fix this than replacing him."],
      kpis: [kpi("Total book MRR", money((bookMrr * 2.9) | 0), "+6.1%"), kpi("Book growth rate", "6.1%", "+0.8 pts"), kpi("Average per sub-account", money(3702), "+3.4%"), kpi("Concentration risk", "52%", "above line", false)],
      charts: [
        { type: "bars", title: "MRR by sub-account", note: "Ranked by contribution to book", rows: AN_SUBS.slice().sort((a, b) => b.mrr - a.mrr).map(s => ({ label: s.key, val: money(s.mrr), pct: s.mrr / 6200 * 100, color: s.color })) },
        { type: "heat", title: "MRR delta by month", note: "Green grew, red shrank", cols: ["M", "J", "J", "A"], rows: AN_SUBS.map(s => ({ label: s.key.split(" ")[0], cells: [1, 2, 0, 1].map((v, i) => ({ bg: (s.mrr > 1500 ? ["#DCEBE1", "#B9DCC7", "#EFEBE1", "#DCEBE1"] : ["#F7DDD9", "#EFEBE1", "#F7DDD9", "#DCEBE1"])[i] })) })) }
      ],
      folds: [
        { key: "cohort", label: "Cohort trajectory", value: "3", unit: "cohorts tracked", note: "Q1, Q2 and Q3 onboards, MRR per account over time", tone: gold, rows: [
          { a: "Q1 cohort", b: "4 accounts, onboarded Jan–Mar", c: money(4820) + " avg" },
          { a: "Q2 cohort", b: "5 accounts, onboarded Apr–Jun", c: money(3410) + " avg" },
          { a: "Q3 cohort", b: "3 accounts, onboarded Jul–Aug", c: money(2180) + " avg" },
          { a: "Her read", b: "Newer cohorts start lower but climb faster", c: "healthy" }
        ] },
        { key: "stress", label: "If your top account left", value: "−2 mo", unit: "runway impact", note: "Stress test on the concentration number", tone: "#B4483C", rows: [
          { a: "MRR lost", b: "Coach James Fitness", c: "−" + money(6200) },
          { a: "Runway", b: "Fourteen months becomes twelve", c: "−2 mo" },
          { a: "Capacity freed", b: "Team hours returned per month", c: "31 hrs" },
          { a: "Cover", b: "Three expansion plays would replace 71%", c: "Play ready" }
        ] }
      ],
      rail: [
        { title: "Top contributors", rows: AN_SUBS.slice().sort((a, b) => b.mrr - a.mrr).slice(0, 3).map(s => [s.key, money(s.mrr)]) },
        { title: "Below break-even", rows: [["Ridgeline Consulting", money(850)], ["Sarah's Practice", money(1450)]] }
      ]
    }
  };

  T.profit = {
    agency: {
      read: ["Her read on margin", "Your Enterprise sub-account tier runs 68% gross margin; Starter runs 22%. If you moved three Starter accounts to Enterprise, net margin improves eight points without adding a single hour of work."],
      kpis: [kpi("Gross margin", "61%", "+2 pts"), kpi("Net margin", "33%", "+3 pts"), kpi("Revenue per team-hour", money(148), "+" + money(9)), kpi("Contribution margin", "44%", "+1 pt")],
      charts: [
        { type: "bars", title: "Margin by service tier", note: "Gross margin per tier", rows: [
          { label: "Enterprise", val: "68%", pct: 100, color: "#2F7A57" },
          { label: "Growth", val: "54%", pct: 79, color: "#7FA98C" },
          { label: "Starter", val: "22%", pct: 32, color: "#C8702E" }
        ] },
        { type: "scatter", title: "Utilization against revenue", note: "One dot per team member", dots: [
          { x: 62, y: 41, c: "#2F7A57", n: "TM" }, { x: 71, y: 55, c: "#2F7A57", n: "RK" },
          { x: 84, y: 62, c: "#C8A02E", n: "NC" }, { x: 94, y: 58, c: "#B4483C", n: "DL" },
          { x: 96, y: 71, c: "#B4483C", n: "SM" }, { x: 55, y: 30, c: "#2F7A57", n: "JP" }
        ], xl: "Utilization", yl: "Revenue attributed" }
      ],
      folds: [
        { key: "waterfall", label: "Cost structure", value: "33%", unit: "net margin", note: "Revenue down to net, step by step", tone: gold, rows: [
          { a: "Revenue", b: "Sub-account billing", c: money(44430) },
          { a: "Delivery", b: "Team hours attributed to accounts", c: "−" + money(13100) },
          { a: "Platform", b: "Paige compute and tooling", c: "−" + money(9300) },
          { a: "Overhead", b: "Marketing, admin, reserve", c: "−" + money(7400) },
          { a: "Net", b: "Retained", c: money(14630) }
        ] },
        { key: "tiermove", label: "Tier upgrade model", value: "+8 pts", unit: "net margin", note: "Three Starter accounts moved to Enterprise", tone: vio, rows: [
          { a: "Candidates", b: "Sarah's Practice, Ridgeline, Kestrel", c: "3 accounts" },
          { a: "Price change", b: "Starter to Enterprise", c: "+" + money(2400) + " MRR" },
          { a: "Hours added", b: "Enterprise touch versus Starter", c: "+4 hrs / mo" },
          { a: "Net effect", b: "Margin improvement", c: "+8 pts" }
        ] }
      ],
      rail: [
        { title: "Best margin", rows: [["Enterprise tier", "68%"], ["Growth tier", "54%"]] },
        { title: "Margin drag", rows: [["Starter tier", "22%"], ["Support-heavy accounts", "3"]] }
      ]
    },
    book: {
      read: ["Her read on cost to serve", "Ridgeline pays " + money(850) + " a month and consumed 38 hours of your team last month — that's below your break-even hour rate. Two options: raise their price, or reduce the touch. I have a draft for both."],
      kpis: [kpi("Average margin per account", "44%", "+1 pt"), kpi("Most profitable", "Coach James", "71%"), kpi("Least profitable", "Ridgeline", "−12%", false), kpi("Accounts below break-even", "2", "of 12", false)],
      charts: [
        { type: "scatter", title: "Cost to serve", note: "Revenue against team-hours consumed", dots: AN_SUBS.map(s => ({ x: Math.min(96, s.mrr / 70), y: s.mrr > 2000 ? 38 : 74, c: s.color, n: s.key.slice(0, 2).toUpperCase() })), xl: "Revenue", yl: "Team-hours" },
        { type: "bars", title: "Margin distribution", note: "Margin per sub-account", rows: AN_SUBS.map(s => ({ label: s.key, val: (s.mrr > 2000 ? "+" : "") + (s.mrr > 2000 ? Math.round(s.mrr / 100) : -12) + "%", pct: s.mrr > 2000 ? Math.min(100, s.mrr / 62) : 14, color: s.mrr > 2000 ? "#2F7A57" : "#B4483C" })) }
      ],
      folds: [
        { key: "support", label: "Support cost", value: "38 hrs", unit: "on one account", note: "Ticket volume times your team-hour cost", tone: "#B4483C", rows: [
          { a: "Ridgeline", b: "14 tickets, 38 hours", c: money(1240) + " cost" },
          { a: "Sarah's Practice", b: "9 tickets, 21 hours", c: money(680) + " cost" },
          { a: "Coach James", b: "4 tickets, 11 hours", c: money(360) + " cost" },
          { a: "Her call", b: "Ridgeline's touch is three times its revenue peer", c: "Draft ready" }
        ] },
        { key: "compute", label: "Compute per account", value: money(508), unit: "average", note: "What each account costs in Paige compute against their MRR", tone: vio, rows: AN_SUBS.slice(0, 4).map(s => ({ a: s.key.split(" ")[0], b: s.key, c: money(Math.round(s.mrr * 0.11)) + " / mo" })) }
      ],
      rail: [
        { title: "Gold quadrant", rows: [["Coach James Fitness", "high rev, low touch"], ["Fernwood Law", "high rev, low touch"]] },
        { title: "Unprofitable", rows: [["Ridgeline Consulting", "−12%"], ["Sarah's Practice", "+4%"]] }
      ]
    }
  };

  T.retain = {
    agency: {
      read: ["Her read on retention", "Net revenue retention is 112% — expansion is outrunning the churn you have. The one number I'd watch is average tenure on the Q3 cohort; it's too early to call, but they're slower to first value than Q2 was."],
      kpis: [kpi("Net revenue retention", "112%", "+6 pts"), kpi("Sub-account churn", "2.1%", "−0.4 pts"), kpi("Average tenure", "19 mo", "+1 mo"), kpi("Expansion revenue", money(4300), "+18%")],
      charts: [
        { type: "line", title: "NRR trend", note: "Twelve months", pts: line([98, 100, 101, 103, 104, 106, 105, 108, 109, 110, 111, 112]), foot: "98% → 112%" },
        { type: "bars", title: "Why accounts left", note: "Last twelve months", rows: [
          { label: "Went in-house", val: "3", pct: 100, color: "#8A6D1E" },
          { label: "Budget cut", val: "2", pct: 67, color: "#C8A02E" },
          { label: "Wrong fit at signup", val: "1", pct: 33, color: "#DCC079" }
        ] }
      ],
      folds: [
        { key: "curve", label: "Retention curve", value: "84%", unit: "at month 12", note: "Cohort retention over time", tone: gold, rows: [
          { a: "Month 3", b: "Retained", c: "97%" },
          { a: "Month 6", b: "Retained", c: "93%" },
          { a: "Month 12", b: "Retained", c: "84%" },
          { a: "Month 24", b: "Retained", c: "76%" }
        ] },
        { key: "expansion", label: "Expansion revenue", value: money(4300), unit: "this month", note: "Where the growth inside existing accounts came from", tone: vio, rows: [
          { a: "Second seats", b: "Two accounts added a seat", c: "+" + money(1600) },
          { a: "Tier moves", b: "One Starter to Growth", c: "+" + money(900) },
          { a: "Add-ons", b: "Four accounts added a department", c: "+" + money(1800) }
        ] }
      ],
      rail: [
        { title: "Longest tenure", rows: [["Fernwood Law", "31 mo"], ["Northwind Dental", "26 mo"]] },
        { title: "Newest", rows: [["Kestrel Advisory", "day 3"], ["Sarah's Practice", "2 mo"]] }
      ]
    },
    book: {
      read: ["Her read on who's at risk", "Three sub-accounts are trending toward churn — Ridgeline is down 40% in usage and hasn't opened a draft in twelve days, Fernwood's payment failed twice, and Kestrel's sentiment turned neutral on the last three replies. I have a retention play drafted for each."],
      kpis: [kpi("Book NRR", "108%", "+3 pts"), kpi("Book churn rate", "3.4%", "+0.6 pts", false), kpi("Average tenure", "14 mo", "+1 mo"), kpi("At risk", "3", "of 12", false)],
      charts: [
        { type: "cards", title: "At-risk board", note: "Her flag, the signal, and the play", cards: [
          { name: "Ridgeline Consulting", color: "#4A78C8", signal: "Usage down 40% · no draft opened in 12 days", play: "Reduce touch, move to the lighter plan, keep the relationship", cta: "Read the play" },
          { name: "Fernwood Law", color: "#8A5A9E", signal: "Payment failed twice · card expiring", play: "Warm billing note from you, drafted in your voice", cta: "Read the draft" },
          { name: "Kestrel Advisory", color: "#B5822A", signal: "Sentiment turned neutral on the last three replies", play: "Check-in call, agenda drafted from their open items", cta: "Read the agenda" }
        ] },
        { type: "heat", title: "Cohort retention", note: "Rows are cohorts, columns are months since onboard", cols: ["M3", "M6", "M9", "M12"], rows: [
          { label: "Q1", cells: [{ bg: "#B9DCC7" }, { bg: "#B9DCC7" }, { bg: "#DCEBE1" }, { bg: "#DCEBE1" }] },
          { label: "Q2", cells: [{ bg: "#B9DCC7" }, { bg: "#DCEBE1" }, { bg: "#EFEBE1" }, { bg: "#EFEBE1" }] },
          { label: "Q3", cells: [{ bg: "#DCEBE1" }, { bg: "#EFEBE1" }, { bg: "#EFEBE1" }, { bg: "#EFEBE1" }] }
        ] }
      ],
      folds: [
        { key: "signals", label: "Churn signals she watches", value: "4", unit: "signal classes", note: "What she reads before an account goes quiet", tone: gold, rows: [
          { a: "Engagement", b: "Drafts opened, replies sent, logins", c: "5 wk lead" },
          { a: "Payment", b: "Failed charges, card expiry", c: "2 wk lead" },
          { a: "Sentiment", b: "Tone across their last replies", c: "3 wk lead" },
          { a: "Support", b: "Ticket volume and escalation rate", c: "4 wk lead" }
        ] },
        { key: "upsell", label: "Expansion signals", value: "3", unit: "accounts ready", note: "The other side of retention — who's ready for more", tone: vio, rows: [
          { a: "Coach James", b: "Third seat requested twice", c: "+" + money(800) },
          { a: "Northwind Dental", b: "Asked about the Finance department", c: "+" + money(600) },
          { a: "Fernwood Law", b: "At capacity on current plan", c: "+" + money(900) }
        ] }
      ],
      rail: [
        { title: "At risk", rows: [["Ridgeline Consulting", "usage"], ["Fernwood Law", "payment"], ["Kestrel Advisory", "sentiment"]] },
        { title: "Expansion ready", rows: [["Coach James Fitness", "+" + money(800)], ["Northwind Dental", "+" + money(600)]] }
      ]
    }
  };

  T.decide = {
    agency: {
      read: ["Her read before you decide", "Client Success has been over 90% for three weeks. Hiring pays back in five months at your current rate; routing new onboarding to her on the green tier costs nothing and buys you six weeks to decide properly."],
      kpis: [kpi("Scenarios modeled", "4", "ready"), kpi("Best payback", "5 mo", "on the hire"), kpi("Capacity headroom", "13%", "−4 pts", false), kpi("Cash for the move", money(204820), "steady", null)],
      charts: [
        { type: "scenarios", title: "Model a decision", note: "Each one opens with her assumptions and the sensitivity", cards: [
          { name: "Should I hire?", color: gold, signal: "Client Success at 94% for three weeks", play: "One Client Success hire at " + money(72000) + ", payback in five months, margin dips two points for one quarter", cta: "Open the model" },
          { name: "Should I raise prices?", color: "#8A5A9E", signal: "Starter tier runs 22% margin", play: "Ten, fifteen or twenty percent across the book, with churn sensitivity per account", cta: "Open the model" },
          { name: "Should I invest in growth?", color: "#4A78C8", signal: money(6000) + " a month uncommitted", play: "Ad spend against content, modeled to sub-accounts acquired and cost per account", cta: "Open the model" },
          { name: "Custom scenario", color: vio, signal: "Ask in your own words", play: "She builds the model from your question and shows the assumptions she used", cta: "Ask Paige" }
        ] }
      ],
      folds: [
        { key: "hire", label: "The hire, modeled", value: "5 mo", unit: "payback", note: "Assumptions, projection and sensitivity", tone: gold, rows: [
          { a: "Cost", b: "One Client Success hire, fully loaded", c: money(72000) + " / yr" },
          { a: "Capacity", b: "Hours returned to the team monthly", c: "+148 hrs" },
          { a: "Revenue", b: "Accounts servable without strain", c: "+4 accounts" },
          { a: "Payback", b: "At current average MRR per account", c: "5 months" },
          { a: "Risk", b: "If growth stalls, margin dips 2 pts for a quarter", c: "recoverable" }
        ] },
        { key: "price", label: "The price rise, modeled", value: "+15%", unit: "recommended", note: "Churn sensitivity per band", tone: "#8A5A9E", rows: [
          { a: "+10%", b: "Expected churn 1 account", c: "+" + money(3900) + " net" },
          { a: "+15%", b: "Expected churn 2 accounts", c: "+" + money(4700) + " net" },
          { a: "+20%", b: "Expected churn 4 accounts", c: "+" + money(2100) + " net" },
          { a: "Her call", b: "Fifteen is the top of the curve", c: "recommended" }
        ] }
      ],
      rail: [
        { title: "Open decisions", rows: [["The hire", "modeled"], ["Price rise", "modeled"], ["Growth spend", "modeled"]] },
        { title: "Decided recently", rows: [["Fernwood renewal", "Aug 9"], ["Nadia hire", "Aug 11"]] }
      ]
    },
    book: {
      read: ["Her read on the book scenarios", "Dropping your bottom three unprofitable accounts frees 71 team-hours a month and costs you " + money(3200) + " in MRR. That trade is worth taking only if you use the hours — otherwise you've just shrunk."],
      kpis: [kpi("Scenarios modeled", "5", "book scope"), kpi("Hours recoverable", "71", "per month"), kpi("MRR at stake", money(3200), "bottom three", null), kpi("Concentration", "52%", "top three", false)],
      charts: [
        { type: "scenarios", title: "Model a book decision", note: "Each one runs across every sub-account you hold", cards: [
          { name: "Drop the bottom three?", color: "#B4483C", signal: "Two accounts run below break-even", play: "−" + money(3200) + " MRR, +71 team-hours a month, capacity to serve four healthier accounts", cta: "Open the model" },
          { name: "Raise the book 10%?", color: gold, signal: "Book average " + money(3702) + " per account", play: "Churn modeled per account by their own price sensitivity, not a flat assumption", cta: "Open the model" },
          { name: "Upsell the top three?", color: "#2F7A57", signal: "All three show expansion signals", play: "+" + money(2300) + " MRR at 64% acceptance, no added headcount", cta: "Open the model" },
          { name: "If concentration hit?", color: "#8A5A9E", signal: "Coach James is 28% of the book", play: "Stress test: runway loses two months, three expansion plays cover 71%", cta: "Open the model" }
        ] }
      ],
      folds: [
        { key: "drop", label: "Dropping the bottom three", value: "+71 hrs", unit: "per month", note: "What you gain and what you give up", tone: "#B4483C", rows: [
          { a: "MRR lost", b: "Ridgeline, Sarah's Practice, one other", c: "−" + money(3200) },
          { a: "Hours freed", b: "Delivery and support returned", c: "+71 hrs" },
          { a: "Margin", b: "Net margin effect", c: "+5 pts" },
          { a: "Condition", b: "Only worth it if the hours get used", c: "her caveat" }
        ] },
        { key: "upsell2", label: "Upselling the top three", value: "+" + money(2300), unit: "MRR", note: "At 64% acceptance, drafted per account", tone: "#2F7A57", rows: [
          { a: "Coach James", b: "Third seat", c: "+" + money(800) },
          { a: "Fernwood Law", b: "Plan move", c: "+" + money(900) },
          { a: "Northwind Dental", b: "Finance department", c: "+" + money(600) }
        ] }
      ],
      rail: [
        { title: "Highest upside", rows: [["Upsell top three", "+" + money(2300)], ["Raise book 10%", "+" + money(3900)]] },
        { title: "Highest risk", rows: [["Drop bottom three", "−" + money(3200)], ["Concentration", "52%"]] }
      ]
    }
  };

  T.market = {
    agency: {
      read: ["Her read on your market", "Two of the four agencies you watch moved on price this quarter, both downward, both bundling Paige-style automation into their base tier. Your position holds because you sell the operator, not the tool — but the pricing floor is moving."],
      kpis: [kpi("Competitors tracked", "4", "agency market"), kpi("Moves this quarter", "6", "+2", null), kpi("Price pressure", "Moderate", "downward", false), kpi("Position", "Holding", "on value", null)],
      charts: [
        { type: "cards", title: "Competitor moves", note: "What changed and what it means for you", cards: [
          { name: "Northlight Collective", color: "#4A78C8", signal: "Cut base tier 18%, bundled automation", play: "They're buying share on price. Your Enterprise tier is unaffected; Starter is exposed.", cta: "Her read" },
          { name: "Vantage Ops", color: "#8A5A9E", signal: "Launched a self-serve tier", play: "Opens the bottom of the market. Watch whether your Starter prospects start comparing.", cta: "Her read" },
          { name: "Harbor & Co", color: "#2F7A57", signal: "Raised prices 12%, narrowed to one vertical", play: "The opposite bet. If it works, specialization is the play worth studying.", cta: "Her read" }
        ] },
        { type: "bars", title: "Where you sit", note: "Her positioning read against the four", rows: [
          { label: "Breadth of service", val: "Strong", pct: 88, color: "#2F7A57" },
          { label: "Price position", val: "Mid", pct: 54, color: "#C8A02E" },
          { label: "Automation depth", val: "Strongest", pct: 96, color: "#2F7A57" },
          { label: "Vertical focus", val: "Diffuse", pct: 34, color: "#C8702E" }
        ] }
      ],
      folds: [
        { key: "threats", label: "Threats and openings", value: "5", unit: "signals", note: "What she'd want you to know this month", tone: "#B4483C", rows: [
          { a: "Threat", b: "Pricing floor moving down in the mid market", c: "watch" },
          { a: "Threat", b: "Self-serve tiers commoditizing the entry point", c: "watch" },
          { a: "Opening", b: "Specialization is being rewarded at the top", c: "explore" },
          { a: "Opening", b: "Nobody in your set sells the operator model", c: "your ground" },
          { a: "Opening", b: "Two competitors dropped their support SLA", c: "your ground" }
        ] }
      ],
      rail: [
        { title: "Moved on price", rows: [["Northlight Collective", "−18%"], ["Harbor & Co", "+12%"]] },
        { title: "New launches", rows: [["Vantage Ops", "self-serve"], ["Solstice AI", "consulting tool"]] }
      ]
    },
    book: {
      read: ["Her read across your book's markets", "Your book is 42% fitness coaching, 25% business consulting, 17% law, 8% health, 8% other. The fitness market is under pricing pressure — three of your fitness sub-accounts could see it. Business consulting has new AI tooling in play; your two consulting accounts should know about the Solstice launch last week."],
      kpis: [kpi("Verticals in book", "5", "tracked"), kpi("Largest exposure", "42%", "fitness coaching", null), kpi("Markets under pressure", "2", "of 5", false), kpi("Signals this week", "7", "+3", null)],
      charts: [
        { type: "donut", title: "Book by vertical", note: "Where your exposure sits", total: "42%", label: "fitness", stops: "conic-gradient(from -90deg,#C8702E 0 42%,#4A78C8 42% 67%,#8A5A9E 67% 84%,#2F7A57 84% 92%,#EFEBE1 92% 100%)", legend: [
          { label: "Fitness coaching", meta: "42%", color: "#C8702E" },
          { label: "Business consulting", meta: "25%", color: "#4A78C8" },
          { label: "Law", meta: "17%", color: "#8A5A9E" },
          { label: "Health", meta: "8%", color: "#2F7A57" },
          { label: "Other", meta: "8%", color: "#EFEBE1" }
        ] },
        { type: "cards", title: "Per-vertical signals", note: "One read per market your book touches", cards: [
          { name: "Fitness coaching", color: "#C8702E", signal: "Price compression across the board", play: "Three of your accounts are exposed. Positioning note drafted for each owner.", cta: "Read the note" },
          { name: "Business consulting", color: "#4A78C8", signal: "Three AI tool launches this month", play: "Solstice AI is the one that matters. Brief drafted for your two consulting owners.", cta: "Read the brief" },
          { name: "Law", color: "#8A5A9E", signal: "Expanding into compliance advisory", play: "Fernwood could add a service line here. Opportunity note ready.", cta: "Read the note" }
        ] }
      ],
      folds: [
        { key: "cross", label: "Cross-vertical patterns", value: "3", unit: "patterns", note: "What holds true across more than one market", tone: vio, rows: [
          { a: "Pricing", b: "Compression in coaching, expansion in law", c: "diverging" },
          { a: "Tooling", b: "AI tools entering consulting fastest", c: "watch" },
          { a: "Demand", b: "Health steady, fitness softening", c: "mixed" }
        ] }
      ],
      rail: [
        { title: "Under pressure", rows: [["Fitness coaching", "42% of book"], ["Business consulting", "25%"]] },
        { title: "Expanding", rows: [["Law", "17%"], ["Health", "8%"]] }
      ]
    }
  };

  return T;
}

// anVals — the derived render bundle (verbatim logic from Agency Shell.dc.html:8886).
// `crossBook` (§51) forces single-book when a sub-account is in view: scope is pinned
// to "agency" (own numbers), and the Book/Per-sub scopes + sub-picker never surface.
function anVals(st, crossBook) {
  const tab = st.anTab || "brief";
  const scope = crossBook ? (st.anScope || "agency") : "agency";
  const meta = AN_TABS.find(t => t.key === tab) || AN_TABS[0];
  const sel = AN_SUBS[st.anSubIdx || 0];
  const bookMrr = AN_SUBS.reduce((a, s) => a + s.mrr, 0);
  const line = pts => {
    const max = Math.max.apply(null, pts), min = Math.min.apply(null, pts);
    const span = max - min || 1;
    return pts.map((p, i) => (i / (pts.length - 1) * 100).toFixed(1) + "," + (34 - (p - min) / span * 30).toFixed(1)).join(" ");
  };
  const kpi = (label, value, delta, good) => ({ label, value, delta, deltaColor: good === false ? T_BAD : good === null ? "var(--ink-3)" : T_OK, deltaBg: good === false ? "var(--bad-tint)" : good === null ? "var(--surface-sunk)" : "var(--ok-tint)" });
  const days = st.anDays || 7;
  const winLabel = days === 1 ? "Today" : "Last " + days + " days";
  const dayScale = days / 7;
  const scaled = (n, unit) => (unit === "$" ? money(Math.max(1, Math.round(n * dayScale))) : String(Math.max(1, Math.round(n * dayScale))));

  const T = buildTabs(days, dayScale, scaled, line, kpi, bookMrr);
  const scopeKey = scope === "book" ? "book" : "agency";
  const base = (T[tab] && T[tab][scopeKey]) || T[tab].agency;
  const isSubScope = scope === "sub";

  const shown = isSubScope ? {
    read: [base.read[0].replace("your", sel.owner.split(" ")[0] + "'s").replace("across your book", "on " + sel.key), "You're observing " + sel.key + ". " + base.read[1].replace(/^[A-Z]/, c => c.toLowerCase())],
    kpis: base.kpis, charts: base.charts, folds: base.folds, rail: base.rail
  } : base;

  const mW = st.mainW, mH = st.mainH;
  const tall = mH === 0 || mH >= 640;

  const chartPop = /^chart\d+$/.test(st.anPop || "") ? (() => {
    const c = (base.charts || [])[parseInt((st.anPop || "").slice(5), 10)];
    if (!c) return null;
    return {
      label: c.title, note: c.note, tone: T_GOLD,
      value: c.type === "donut" ? c.total : c.type === "line" ? "12 mo" : String((c.rows || c.cards || c.dots || []).length),
      unit: c.type === "donut" ? c.label : c.type === "line" ? "trend" : c.type === "cards" || c.type === "scenarios" ? "to read" : "rows",
      rows: c.rows
        ? c.rows.map(r => ({ a: "", b: r.label, c: r.val || "" }))
        : c.cards
          ? c.cards.map(k => ({ a: k.name.split(" ")[0], b: k.signal + " — " + k.play, c: k.cta }))
          : c.legend
            ? c.legend.map(l => ({ a: "Share", b: l.label, c: l.meta }))
            : c.dots
              ? c.dots.map(d => ({ a: d.n, b: c.xl + " against " + c.yl, c: "" }))
              : [{ a: "Trend", b: c.note, c: c.foot || "" }]
    };
  })() : null;

  const morePop = st.anPop === "more" ? (() => {
    const items = (tall ? [] : (base.charts || []).map(c => ({ label: c.title, note: c.note, value: c.type === "donut" ? c.total : "view" })))
      .concat((base.folds || []).map(fd => ({ label: fd.label, note: fd.note, value: fd.value })));
    const cap = mW > 0 && mW < 560 ? 2 : 4;
    const rest = items.slice(cap - 1);
    return {
      label: "More views", note: "The rest of this tab, at full size", tone: T_VIO,
      value: String(rest.length), unit: "reads",
      rows: rest.map(r => ({ a: r.value, b: r.label, c: "" }))
    };
  })() : null;

  const popFold = morePop || chartPop || (base.folds || []).concat(T[tab].agency.folds || []).find(f => f.key === st.anPop) || null;

  const anFolds = (() => {
    const chartFolds = tall ? [] : (shown.charts || []).map((c, i) => ({
      key: "chart" + i,
      label: c.title,
      value: c.type === "line" ? "12 mo" : c.type === "donut" ? c.total : String((c.rows || c.cards || c.dots || []).length),
      unit: c.type === "line" ? "trend" : c.type === "donut" ? c.label : c.type === "cards" || c.type === "scenarios" ? "to read" : "rows",
      note: c.note,
      tone: c.type === "cards" || c.type === "scenarios" ? T_VIO : T_GOLD,
      rows: c.rows
        ? c.rows.map(r => ({ a: c.type === "heat" ? "Row" : "Bar", b: r.label, c: r.val || "" }))
        : c.cards
          ? c.cards.map(k => ({ a: k.name.split(" ")[0], b: k.signal + " — " + k.play, c: k.cta }))
          : c.legend
            ? c.legend.map(l => ({ a: "Share", b: l.label, c: l.meta }))
            : c.dots
              ? c.dots.map(d => ({ a: d.n, b: c.xl + " against " + c.yl, c: "" }))
              : [{ a: "Trend", b: c.note, c: c.foot || "" }]
    }));
    const all = chartFolds.concat(shown.folds || []);
    const cap = mW > 0 && mW < 560 ? 2 : 4;
    if (all.length <= cap) return all;
    const rest = all.slice(cap - 1);
    return all.slice(0, cap - 1).concat([{
      key: "more", label: "More views", value: String(rest.length), unit: "further reads",
      note: rest.map(r => r.label).join(" · "), tone: T_VIO
    }]);
  })();

  const anFoldCols = (() => {
    const n = (tall ? 0 : (shown.charts || []).length) + (shown.folds || []).length;
    const cap = mW > 0 && mW < 560 ? 2 : 4;
    return String(Math.max(1, Math.min(cap, n)));
  })();

  return {
    tab, scope, meta, sel, isSubScope,
    anTitle: meta.title, anSub: meta.sub,
    anAskContext: isSubScope
      ? "Ask about " + sel.owner.split(" ")[0] + "'s " + meta.label.toLowerCase() + "…"
      : scope === "book"
        ? "Ask about book-wide " + meta.label.toLowerCase() + " patterns…"
        : "Ask about your agency's " + meta.label.toLowerCase() + "…",
    anSeed: (isSubScope ? sel.key + " · " : scope === "book" ? "Across the book · " : "Agency · ") + meta.title,
    anFlag: "Cross-book aggregation, cost-to-serve, at-risk classification and market signals have no confirmed backend route yet — figures here are stand-ins, not platform figures.",
    anReadTitle: shown.read[0], anRead: shown.read[1],
    anKpis: shown.kpis, anCharts: shown.charts || [], anFolds, anFoldCols, anRail: shown.rail || [],
    popFold,
    days, winLabel,
    // responsive tokens (design's mainW/mainH breakpoints)
    anShowSub: (mH === 0 || mH >= 620) && (mW === 0 || mW >= 1080),
    anShowCharts: mH === 0 || mH >= 640,
    anShowDial: tab === "brief" && !(mH > 0 && mH < 620 && isSubScope),
    anShowRanges: (tab !== "brief" || (mH > 0 && mH < 620 && isSubScope)) && (mW === 0 || mW >= 1080),
    anWide: mW === 0 || mW >= 1080,
    anKpiCols: mW > 0 && mW < 560 ? "repeat(2,minmax(0,1fr))" : "repeat(4,minmax(0,1fr))",
    anTitleSize: mW > 0 && mW < 1080 ? "18px" : "21px",
    anReadPad: mH > 0 && mH < 620 ? "9px 13px" : "12px 15px",
    anReadClamp: mH > 0 && mH < 620 ? (tab === "brief" ? "1" : "2") : "4",
    anColGap: mH > 0 && mH < 620 ? "5px" : "11px",
    anFoldH: mH > 0 && mH < 620 ? (tab === "brief" ? "86px" : "104px") : "112px",
    anFoldNoteClamp: mH > 0 && mH < 620 ? "1" : "2",
    anFoldPad: mH > 0 && mH < 620 ? "10px 12px" : "12px 14px",
    anFoldValSize: mH > 0 && mH < 620 ? "17px" : "19px",
    anDialPad: mH > 0 && mH < 620 ? "7px 12px" : "9px 13px",
    anDialSize: mH > 0 && mH < 620 ? "38px" : "46px",
    anChipSize: mH > 0 && mH < 620 ? "23px" : "26px",
    anChartH: mH > 0 && mH < 620 ? "104px" : "148px",
    anKpiPad: mH > 0 && mH < 620 ? "7px 11px" : "13px 15px",
    anKpiSize: mH > 0 && mH < 620 ? "17px" : "24px",
    anPickPad: mH > 0 && mH < 620 ? "6px 12px" : "8px 13px"
  };
}

// ── ResizeObserver → measured [ref, mainW, mainH] (compass's useWidth pattern) ──
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

// ── Chart card (line / bars / donut / scatter / heat / cards / scenarios) ────
const ChartCard = ({ c, chartH, onOpenFold }) => (
  <div style={{ border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)", padding: "13px 15px", minWidth: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, flex: "none", minWidth: 0 }}>
      <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap" }}>{c.title}</div>
      <div className="trunc" style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 0 }}>{c.note}</div>
    </div>

    {c.type === "line" && <>
      <div style={{ marginTop: 10, height: chartH, minHeight: 0 }}>
        <svg viewBox="0 0 100 36" preserveAspectRatio="none" style={{ width: "100%", height: "100%" }}>
          <polyline points={c.pts} fill="none" stroke="var(--gold)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 6, flex: "none" }}>{c.foot}</div>
    </>}

    {c.type === "bars" && <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 8, minHeight: 0, overflow: "hidden" }}>
      {c.rows.map((r, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span className="trunc" style={{ fontSize: 11.5, color: "var(--ink-2)", width: 104, flex: "none" }}>{r.label}</span>
        <span style={{ flex: 1, height: 7, borderRadius: 4, background: "var(--surface-sunk)", minWidth: 0, overflow: "hidden", display: "block" }}>
          <span style={{ display: "block", height: "100%", width: r.pct + "%", borderRadius: 4, background: r.color }} /></span>
        <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)", flex: "none" }}>{r.val}</span>
      </div>)}
    </div>}

    {c.type === "donut" && <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 11, minHeight: 0 }}>
      <div style={{ width: 82, height: 82, borderRadius: "50%", background: c.stops, display: "grid", placeItems: "center", flex: "none" }}>
        <div style={{ width: 54, height: 54, borderRadius: "50%", background: "var(--surface)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-.02em" }}>{c.total}</div>
          <div style={{ fontSize: 9.5, color: "var(--ink-3)" }}>{c.label}</div>
        </div></div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {c.legend.map((l, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ width: 9, height: 9, borderRadius: 3, background: l.color, flex: "none" }} />
          <span className="trunc" style={{ fontSize: 12, minWidth: 0 }}>{l.label}</span>
          <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-2)", flex: "none" }}>{l.meta}</span>
        </div>)}
      </div>
    </div>}

    {c.type === "scatter" && <>
      <div style={{ position: "relative", marginTop: 11, height: chartH, borderLeft: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)" }}>
        {c.dots.map((d, i) => <div key={i} title={d.n} style={{ position: "absolute", left: d.x + "%", bottom: d.y + "%", width: 11, height: 11, margin: -5, borderRadius: "50%", background: d.c, border: "1.5px solid var(--surface)", boxShadow: "var(--sh-1)" }} />)}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 6, flex: "none" }}>
        <span style={{ fontSize: 10.5, color: "var(--ink-3)" }}>{c.xl} →</span>
        <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)" }}>↑ {c.yl}</span>
      </div>
    </>}

    {c.type === "heat" && <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 4, minHeight: 0, overflow: "hidden" }}>
      {c.rows.map((r, i) => <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
        <span className="trunc" style={{ fontSize: 11, color: "var(--ink-2)", width: 66, flex: "none" }}>{r.label}</span>
        {r.cells.map((cell, j) => <span key={j} style={{ flex: 1, height: 15, borderRadius: 4, background: cell.bg }} />)}
      </div>)}
    </div>}

    {c.type === "cards" && <div style={{ marginTop: 11, display: "flex", flexDirection: "column", gap: 8, minHeight: 0, overflowY: "auto" }}>
      {c.cards.map((k, i) => <button key={i} onClick={onOpenFold} style={{ textAlign: "left", border: "1px solid var(--line-soft)", borderLeft: "3px solid " + k.color, borderRadius: 10, background: "var(--surface-2)", padding: "10px 12px", cursor: "pointer" }}>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{k.name}</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4, lineHeight: 1.4 }}>{k.signal}</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.45, marginTop: 7 }}>{k.play}</div>
        <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--warn)", marginTop: 7 }}>{k.cta} →</div>
      </button>)}
    </div>}

    {c.type === "scenarios" && <div style={{ marginTop: 11, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(212px,100%),1fr))", gap: 9, minHeight: 0, overflowY: "auto" }}>
      {c.cards.map((k, i) => <button key={i} onClick={onOpenFold} style={{ textAlign: "left", border: "1px solid var(--line-soft)", borderRadius: 11, background: "var(--surface-2)", padding: "11px 13px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius: 3, background: k.color, flex: "none" }} />
          <div style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{k.name}</div></div>
        <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.4 }}>{k.signal}</div>
        <div style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.45 }}>{k.play}</div>
        <div style={{ marginTop: "auto", fontSize: 11.5, fontWeight: 600, color: "var(--warn)" }}>{k.cta} →</div>
      </button>)}
    </div>}
  </div>
);

// ── Fold detail pop-out — the design's center modal, through the Modal primitive ──
const FoldPop = ({ pop, range, onClose, onAsk }) => (
  <Modal open={!!pop} onClose={onClose} pad="0" size={680}>
    {pop && <div style={{ display: "flex", flexDirection: "column", minHeight: 0, maxHeight: "84vh" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 24px", borderBottom: "1px solid var(--line-soft)", background: "var(--surface-2)", flex: "none" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <span style={{ width: 9, height: 9, borderRadius: 3, background: pop.tone, flex: "none" }} />
            <div style={{ fontSize: 16.5, fontWeight: 600 }}>{pop.label}</div>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 5 }}>{pop.note}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, flex: "none" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.02em" }}>{pop.value}</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{pop.unit}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--ink-3)", fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      </div>
      <div className="pane" style={{ padding: "6px 24px 8px", minHeight: 0, flex: 1 }}>
        {(pop.rows || []).map((r, i) => <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "13px 0", borderBottom: "1px solid var(--line-soft)", minWidth: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".12em", color: "var(--ink-3)", width: 88, flex: "none", textTransform: "uppercase" }}>{r.a}</span>
          <span style={{ fontSize: 14, color: "var(--ink)", lineHeight: 1.5, minWidth: 0 }}>{r.b}</span>
          <span className="mono" style={{ marginLeft: "auto", fontSize: 12, color: "var(--ink-2)", flex: "none", whiteSpace: "nowrap" }}>{r.c}</span>
        </div>)}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "15px 24px", borderTop: "1px solid var(--line-soft)", background: "var(--surface-2)", flex: "none" }}>
        <button className="btn btn-g" onClick={onAsk}><Ic.spark size={13} />Explore in Ask Paige</button>
        <button className="btn" onClick={onClose}>Close</button>
        <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", flex: "none" }}>{range}</div>
      </div>
    </div>}
  </Modal>
);

// ── Window dial (Brief only) — draggable 1–7-day window + long-range seg ─────
const WindowDial = ({ v, dialPad, dialSize, chipSize, showCharts, reduce, setDays, range, setRange }) => {
  const daysRef = React.useRef(v);
  daysRef.current = v;
  const angle = "rotate(" + (-120 + (v - 1) / 6 * 240).toFixed(1) + "deg)";
  const onDown = e => {
    const box = e.currentTarget.getBoundingClientRect();
    const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
    const move = ev => {
      let a = Math.atan2(ev.clientX - cx, cy - ev.clientY) * 180 / Math.PI;
      a = Math.max(-120, Math.min(120, a));
      const d = Math.round((a + 120) / 240 * 6) + 1;
      if (d !== daysRef.current) { daysRef.current = d; setDays(d); }
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    move(e);
  };
  const winLabel = v === 1 ? "Today" : "Last " + v + " days";
  return <div style={{ display: "flex", alignItems: "center", gap: 11, padding: dialPad, border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", flex: "none", flexWrap: "wrap" }}>
    <div onPointerDown={onDown} title="Drag to set the window" style={{ position: "relative", width: dialSize, height: dialSize, flex: "none", cursor: "grab", touchAction: "none", userSelect: "none" }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle at 34% 26%,#3A3448,#17141F 78%)", border: "1px solid #2E2838" }} />
      {[1, 2, 3, 4, 5, 6, 7].map(d => {
        const on = d === v; const ang = -120 + (d - 1) / 6 * 240; const rad = ang * Math.PI / 180;
        return <div key={d} onClick={() => setDays(d)} title={String(d)} style={{ position: "absolute", left: (50 + Math.sin(rad) * 42).toFixed(1) + "%", top: (50 - Math.cos(rad) * 42).toFixed(1) + "%", width: on ? 7 : 5, height: on ? 7 : 5, margin: -3, borderRadius: "50%", background: on ? "#C8A02E" : "rgba(255,253,248,.22)", cursor: "pointer" }} />;
      })}
      <div style={{ position: "absolute", inset: 9, borderRadius: "50%", background: "conic-gradient(from 210deg,#8E8776 0deg,#EFE9DA 42deg,#9A9384 96deg,#CFC8B7 168deg,#7E786A 228deg,#E4DDCC 300deg,#8E8776 360deg)", boxShadow: "inset 0 1px 2px rgba(255,255,255,.5),inset 0 -2px 4px rgba(0,0,0,.45)" }} />
      <div style={{ position: "absolute", inset: 9, borderRadius: "50%", transform: angle, transition: reduce ? "none" : "transform .3s cubic-bezier(.22,1.2,.32,1)" }}>
        <div style={{ position: "absolute", left: "50%", top: 3, width: 2.5, height: 11, marginLeft: -1.25, borderRadius: 2, background: "#C8A02E" }} /></div>
    </div>
    <div style={{ flex: "none" }}>
      <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)" }}>WINDOW</div>
      <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 2, whiteSpace: "nowrap" }}>{winLabel}</div>
    </div>
    <div style={{ display: "flex", gap: 4, flex: "none" }}>
      {[1, 2, 3, 4, 5, 6, 7].map(d => { const on = d === v; return <button key={d} onClick={() => setDays(d)} style={{ width: chipSize, height: chipSize, borderRadius: 8, border: "1px solid " + (on ? "var(--gold-line)" : "transparent"), background: on ? "var(--gold-tint)" : "transparent", color: on ? "var(--ink)" : "var(--ink-3)", fontWeight: on ? 600 : 500, fontSize: 12, display: "grid", placeItems: "center", cursor: "pointer" }}>{d}</button>; })}
    </div>
    <div className="seg" style={{ flex: "none" }}>
      {[["30d", "Last 30 days"], ["12 mo", "Last 12 months"]].map(([l, full]) => <button key={l} aria-pressed={range === full} onClick={() => { setRange(full); setDays(null); }}>{l}</button>)}
    </div>
    {showCharts && <div style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", flex: "none" }}>Day by day, or the long view</div>}
  </div>;
};

// ── Analytics2 — default export, shell context { isAgency, acting, openAsk } ─────
const Analytics2 = ({ isAgency = true, acting = null, openAsk = noop }) => {
  const crossBook = isAgency && !acting;               // §51: single-book when a sub is in view
  const reduce = useReducedMotion();
  const [stageRef, mW, mH] = useStage();
  const [anTab, setAnTab] = useSubtabRoute("agency", "analytics", "brief");
  const [anScope, setAnScope] = React.useState("agency");
  const [anSubIdx, setAnSubIdx] = React.useState(0);
  const [anRange, setAnRange] = React.useState("Last 30 days");
  const [anDays, setAnDays] = React.useState(7);
  const [anPickOpen, setAnPickOpen] = React.useState(false);
  const [anPop, setAnPop] = React.useState(null);

  const st = { anTab, anScope, anSubIdx, anRange, anDays, anPickOpen, anPop, mainW: mW, mainH: mH };
  const v = anVals(st, crossBook);

  const setDays = d => { setAnDays(d); setAnRange(d == null ? anRange : d === 1 ? "Today" : "Last " + d + " days"); };
  const openFold = key => setAnPop(key);
  const goTab = key => { setAnTab(key); setAnPop(null); };
  const goScope = key => { setAnScope(key); setAnPop(null); };
  const doAsk = () => openAsk(v.anSeed);

  const tabs = AN_TABS.map(t => [t.key, t.label, TAB_ICON[t.key]]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, minWidth: 0 }}>
      <SubTabs tabs={tabs} cur={anTab} set={goTab} />

      <div ref={stageRef} style={{ flex: 1, minHeight: 0, minWidth: 0, display: "flex", gap: 16, padding: "18px 22px 20px", overflow: "hidden" }}>
        {/* Stage column */}
        <div style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: v.anColGap }}>

          {/* Header: title · flag · ranges · scope seg (agency only) · Ask */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: "none", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px", minWidth: 150 }}>
              <div style={{ fontSize: v.anTitleSize, fontWeight: 700, letterSpacing: "-.02em", whiteSpace: "nowrap" }}>{v.anTitle}</div>
              {v.anShowSub && <div style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 4 }}>{v.anSub}</div>}
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flex: "0 0 auto" }}>
              <div title={v.anFlag} style={{ width: 26, height: 26, borderRadius: 8, border: "1px solid var(--gold-line)", background: "var(--gold-tint)", color: "var(--gold)", display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, cursor: "help" }}>!</div>
              {v.anShowRanges && <div className="seg">
                {[["7d", "Last 7 days"], ["30d", "Last 30 days"], ["12 mo", "Last 12 months"]].map(([l, full]) => <button key={l} aria-pressed={anRange === full} onClick={() => { setAnRange(full); if (l === "7d") setAnDays(7); else setAnDays(null); }}>{l}</button>)}
              </div>}
              {crossBook && <div className="seg">
                {[["agency", "Agency"], ["book", "Book"], ["sub", "Per sub-account"]].map(([k, l]) => <button key={k} aria-pressed={v.scope === k} onClick={() => goScope(k)}>{l}</button>)}
              </div>}
              <button className="btn btn-g" title={v.anAskContext} onClick={doAsk}><Ic.spark size={13} />Ask Paige</button>
            </div>
          </div>

          {/* Window dial (Brief only) */}
          {v.anShowDial && <WindowDial v={v.days} dialPad={v.anDialPad} dialSize={v.anDialSize} chipSize={v.anChipSize} showCharts={v.anShowCharts} reduce={reduce} setDays={setDays} range={anRange} setRange={setAnRange} />}

          {/* Sub picker — AGENCY-ONLY, Per-sub-account scope (§51) */}
          {crossBook && v.isSubScope && <div style={{ position: "relative", flex: "none" }}>
            <button onClick={() => setAnPickOpen(o => !o)} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: v.anPickPad, border: "1px solid var(--line)", borderRadius: 11, background: "var(--surface)", cursor: "pointer" }}>
              <span style={{ width: 3, height: 17, borderRadius: 2, background: v.sel.color, flex: "none" }} />
              <span className="trunc" style={{ fontSize: 13.5, fontWeight: 600, minWidth: 0 }}>{v.sel.key}</span>
              <span style={{ fontSize: 12, color: "var(--ink-3)", flex: "none" }}>{v.sel.owner}</span>
              <span style={{ padding: "2px 9px", borderRadius: 20, background: "var(--surface-sunk)", fontSize: 11, color: "var(--ink-2)", flex: "none" }}>{v.sel.vertical}</span>
              <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>Observing · propose or act as</span>
              <span style={{ color: "var(--ink-3)", fontSize: 11, flex: "none" }}>▾</span>
            </button>
            {anPickOpen && <div style={{ position: "absolute", left: 0, right: 0, top: 46, zIndex: 44, maxHeight: 250, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", boxShadow: "var(--sh-3)", padding: 6 }}>
              {AN_SUBS.map((o, i) => <button key={i} onClick={() => { setAnSubIdx(i); setAnPickOpen(false); }} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", borderRadius: 9, cursor: "pointer", border: "none", background: i === anSubIdx ? "var(--surface-sunk)" : "transparent" }}>
                <span style={{ width: 3, height: 16, borderRadius: 2, background: o.color, flex: "none" }} />
                <span className="trunc" style={{ fontSize: 13, fontWeight: 500, minWidth: 0 }}>{o.key}</span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-3)", flex: "none" }}>{o.owner}</span>
                <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)", flex: "none" }}>{money(o.mrr)}</span>
              </button>)}
            </div>}
          </div>}

          {/* Read banner */}
          <div style={{ border: "1px solid var(--violet-line)", borderRadius: 12, background: "var(--violet-tint)", padding: v.anReadPad, flex: "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ color: "var(--violet)", fontSize: 12 }}>✦</span>
              <div className="trunc" style={{ fontSize: 12.5, fontWeight: 600, color: "var(--violet)", minWidth: 0 }}>{v.anReadTitle}</div>
              <button onClick={doAsk} style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "var(--violet)", cursor: "pointer", flex: "none", background: "transparent", border: "none" }}>Explore in Ask Paige →</button>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 6, display: "-webkit-box", WebkitLineClamp: v.anReadClamp, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{v.anRead}</div>
          </div>

          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: v.anKpiCols, gap: 11, flex: "none" }}>
            {v.anKpis.map((k, i) => <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", padding: v.anKpiPad, minWidth: 0 }}>
              <div className="trunc" style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 0 }}>{k.label}</div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 4, marginTop: 5, minWidth: 0 }}>
                <span className="trunc" style={{ fontSize: v.anKpiSize, fontWeight: 700, letterSpacing: "-.02em", maxWidth: "100%" }}>{k.value}</span>
                <span className="trunc" style={{ padding: "2px 7px", borderRadius: 20, background: k.deltaBg, color: k.deltaColor, fontSize: 10.5, fontWeight: 600, maxWidth: "100%" }}>{k.delta}</span>
              </div>
            </div>)}
          </div>

          {/* Charts grid */}
          {v.anShowCharts && <div style={{ flex: "1 1 auto", minHeight: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: 11, alignContent: "start", overflow: "hidden" }}>
            {v.anCharts.map((c, i) => <ChartCard key={i} c={c} chartH={v.anChartH} onOpenFold={() => openFold((v.anFolds[0] && v.anFolds[0].key) || null)} />)}
          </div>}

          {/* Fold cards row */}
          <div style={{ flex: "0 0 " + v.anFoldH, minHeight: 0, display: "grid", gridTemplateColumns: "repeat(" + v.anFoldCols + ",minmax(0,1fr))", gap: 10, overflow: "hidden" }}>
            {v.anFolds.map((f, i) => <button key={i} onClick={() => openFold(f.key)} style={{ textAlign: "left", border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", padding: v.anFoldPad, cursor: "pointer", display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: 3, background: f.tone, flex: "none" }} />
                <span className="trunc" style={{ fontSize: 11.5, fontWeight: 600, minWidth: 0 }}>{f.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 7, minWidth: 0 }}>
                <span style={{ fontSize: v.anFoldValSize, fontWeight: 700, letterSpacing: "-.02em" }}>{f.value}</span>
                <span className="trunc" style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 0 }}>{f.unit}</span>
              </div>
              <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.35, display: "-webkit-box", WebkitLineClamp: v.anFoldNoteClamp, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{f.note}</div>
            </button>)}
          </div>
        </div>

        {/* Right rail (wide only) */}
        {v.anWide && <aside style={{ width: 262, flex: "0 1 262px", minWidth: 0, display: "flex", flexDirection: "column", gap: 11, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
          {v.anRail.map((r, i) => <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)", padding: "13px 15px", flex: "none" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</div>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 6 }}>
              {r.rows.map((row, j) => <div key={j} style={{ display: "flex", alignItems: "center", gap: 9, padding: "7px 0", borderTop: "1px solid var(--line-soft)", minWidth: 0 }}>
                <span className="trunc" style={{ fontSize: 12, minWidth: 0 }}>{row[0]}</span>
                <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-2)", flex: "none" }}>{row[1]}</span>
              </div>)}
            </div>
          </div>)}
        </aside>}
      </div>

      {/* Fold detail pop-out */}
      <FoldPop pop={v.popFold} range={anRange} onClose={() => setAnPop(null)} onAsk={() => { setAnPop(null); doAsk(); }} />
    </div>
  );
};

export default Analytics2;
