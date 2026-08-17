// @ts-nocheck
// Agency pack — Clients (the fleet screen). Faithful port of the Claude Design "CRM
// agency mode" pack `fleet` view (owner-locked 2026-08-17, §28/§63 — "We do not
// drift off this whatsoever"), mirroring the Solo port (src/solo/conversations.tsx
// ClientsHub) and the sibling agency modules (CommandCenter / automations / compass).
//
// Source of truth: "Agency Shell.dc.html" — the `fleet` view's three surfaces:
//   • Directory (isDirectory) — the sub-accounts grid/list with filters + the
//     attention rail (agency); its own "Needs your attention" pop-out (attnOpen).
//   • Pipelines (isPipes) — Book view (the river band + per-sub-account row table)
//     and Per-sub-account (the kanban), toggled by the Book↔Per-sub scope seg, with
//     the sub-account picker pop-out (pipePickOpen, agency-only).
//   • Conversations (isConvos) — the console, which is the richest pop-out cluster
//     and lives in its own co-located module (./conversations, imported below).
//
// §51: when a standalone sub-account is in view (isAgency===false) OR the agency is
// acting-as a sub (crossBook===false), this screen shows ONLY that book's own book —
// the sub-accounts grid becomes the sub's OWN client book, Pipelines drops the scope
// seg + the cross-sub picker + the book aggregate and shows the sub's single pipeline,
// and the Conversations console is scoped to that sub's own threads. Every cross-book
// / scope-picker / act-as affordance is gated behind crossBook and structurally
// absent otherwise — a sub owner sees only their own clients, never the parent's.
import React from "react";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, Avatar, SubTabs, AV, useReducedMotion } from "./_shared";
import { spark, pstr } from "./helpers";
import {
  SUBS, OWNERS, AGENCY, STAGE_SET, seedPipes, CLIENT_NAMES, NEXT_ACTIONS, LBL, FLAGS,
} from "./fixtures";
import ConversationsConsole from "./conversations";

const GOLD_BG = "var(--gold-bright)", GOLD_INK = "#241C05";
const noop = () => {};
const money = n => "$" + (n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "K" : n);
const hc = h => (h >= 85 ? "var(--ok)" : h >= 70 ? "var(--warn)" : "var(--bad)");
const initialsOf = s => s.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("");

// decorate(sub) — the design's fleet-card enrichment (AV plate/ink, health color,
// sparkline path, one-line summary). Verbatim shape, token-ized so it themes.
const decorate = s => {
  const av = AV(s.color);
  return {
    ...s, initials: initialsOf(s.name), tint: av.plate, ink: av.ink,
    healthColor: hc(s.health),
    line: "Health " + s.health + " · " + (s.drafts ? s.drafts + " drafts waiting" : "no drafts waiting") + " · " + s.note,
    spark: pstr(spark(s.name.length + s.health / 10, s.health >= 80)),
    tenureLine: s.tenure + " with you",
  };
};

// ── Sub-accounts directory (agency) ───────────────────────────────────────────
const Directory = ({ openAsk }) => {
  const [filter, setFilter] = React.useState("All");
  const [attnOpen, setAttnOpen] = React.useState(false);
  const all = SUBS.map(decorate);

  const filterFns = {
    All: () => true,
    "Healthy (7)": s => s.health >= 80,
    "Needs attention (3)": s => s.health < 70 || s.drafts >= 4,
    "New this month (2)": s => s.tenure.indexOf("1 month") === 0 || s.tenure.indexOf("2 month") === 0,
    "At-risk (0)": () => false,
  };
  const subs = all.filter(filterFns[filter] || filterFns.All);
  const attention = [
    { who: "Sarah's Coaching Practice", color: "#7C6CE0", amount: "$8,400", tone: "var(--gold)", cta: "Approve renewal", text: "Approve her renewal draft before Friday, when she opens Q4 planning. She has never negotiated on price." },
    { who: "Ridgeline Outdoor Co.", color: "#3F7F5C", amount: "6 days lost", tone: "var(--bad)", cta: "Fix the pixel", text: "Systems Check found a broken purchase pixel. Six days of attribution are already missing from their ad reporting." },
    { who: "Coach James Fitness", color: "#C1652F", amount: "22% off plan", tone: "var(--warn)", cta: "Read my draft", text: "Third month below plan. I drafted the conversation, including the two offers that carried him last winter." },
  ];

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", gap: 15 }}>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 15 }}>
        <div className="row" style={{ alignItems: "flex-end", gap: 16, flex: "none", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.02em" }}>Your sub-accounts</div>
            <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 6 }}>{AGENCY.subCount} active · {AGENCY.needAttention} need attention today · book average health {AGENCY.bookHealth}</div>
          </div>
          <div className="row" style={{ marginLeft: "auto", gap: 9, flex: "none" }}>
            <button onClick={() => setAttnOpen(true)} style={{ padding: "10px 15px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12.5, fontWeight: 600, color: "var(--gold)", cursor: "pointer", whiteSpace: "nowrap" }}>Needs your attention · {AGENCY.needAttention} →</button>
            <button style={{ padding: "10px 16px", borderRadius: 10, background: GOLD_BG, color: GOLD_INK, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", border: "none" }}>+ Add a sub-account</button>
          </div>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: "wrap", flex: "none" }}>
          {Object.keys(filterFns).map(label => {
            const on = filter === label;
            const shown = label === "All" ? "All (12)" : label;
            return <button key={label} onClick={() => setFilter(label)} style={{ padding: "7px 13px", borderRadius: 20, cursor: "pointer", fontSize: 12.5, fontWeight: 500, border: "1px solid " + (on ? "var(--gold-line)" : "var(--line)"), background: on ? "var(--gold-tint)" : "var(--surface)", color: on ? "var(--gold)" : "var(--ink-2)" }}>{shown}</button>;
          })}
          <div className="row" style={{ marginLeft: "auto", gap: 8, fontSize: 12.5, color: "var(--ink-2)" }}>Sort<span style={{ padding: "7px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }}>Health score ▾</span></div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 13, paddingRight: 4, alignContent: "start" }}>
          {subs.map(s => (
            <div key={s.name} className="card" style={{ overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 208, padding: 0 }}>
              <div style={{ height: 3, background: s.color }} />
              <div style={{ padding: "15px 16px 12px", display: "flex", flexDirection: "column", gap: 11, flex: "0 0 auto" }}>
                <div className="row" style={{ gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: s.tint, boxShadow: "inset 0 0 0 2px " + s.color, color: s.ink, display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 700, flex: "none" }}>{s.initials}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.25 }}>{s.name}</div>
                  <span style={{ marginLeft: "auto", width: 9, height: 9, borderRadius: "50%", background: s.healthColor, flex: "none" }} />
                </div>
                <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45 }}>{s.line}</div>
                <div className="row" style={{ alignItems: "flex-end", gap: 10 }}>
                  <div>
                    <div className="eyebrow" style={{ fontSize: 10 }}>MRR</div>
                    <div style={{ fontSize: 17, fontWeight: 700, marginTop: 3 }}>{s.mrr}</div>
                  </div>
                  <svg viewBox="0 0 92 26" width="92" height="26" style={{ marginLeft: "auto", overflow: "visible" }}>
                    <polyline points={s.spark} fill="none" stroke={s.color} strokeWidth="1.7" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              <div className="row" style={{ marginTop: "auto", padding: "11px 16px", borderTop: "1px solid var(--line-soft)", justifyContent: "space-between", fontSize: 12.5, color: "var(--ink-2)" }}>
                <span>{s.tenureLine}</span><span style={{ color: "var(--gold)", fontWeight: 600 }}>Enter →</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <aside style={{ width: 322, flex: "none", display: "flex", flexDirection: "column", gap: 13, minHeight: 0, overflowY: "auto" }}>
        <div className="card" style={{ padding: 17, flex: "none" }}>
          <div style={{ fontSize: 16.5, fontWeight: 600 }}>Needs your attention today</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 5 }}>Ranked by dollar impact across all {AGENCY.subCount} sub-accounts.</div>
        </div>
        {attention.map(a => (
          <div key={a.who} style={{ border: "1px solid var(--line-soft)", borderLeft: "3px solid " + a.tone, borderRadius: 11, padding: "12px 13px", background: "var(--surface-2)", flex: "none" }}>
            <div className="row" style={{ gap: 8, marginBottom: 7 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: a.color }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>{a.who}</span>
              <span className="mono" style={{ marginLeft: "auto", fontSize: 11.5, color: a.tone }}>{a.amount}</span>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-2)" }}>{a.text}</div>
            <div className="row" style={{ gap: 8, marginTop: 11 }}>
              <button style={{ padding: "7px 12px", borderRadius: 9, background: "var(--ink)", color: "var(--ink-inv)", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none" }}>{a.cta}</button>
              <button className="btn btn-s" style={{ height: 30, borderRadius: 9, fontSize: 12, color: "var(--ink-2)" }}>Open sub-account</button>
            </div>
          </div>
        ))}
      </aside>

      {/* Needs-your-attention pop-out. */}
      {attnOpen && (
        <div onClick={e => { if (e.target === e.currentTarget) setAttnOpen(false); }} className="fade-in" style={{ position: "fixed", inset: 0, background: "rgba(23,19,49,.5)", backdropFilter: "blur(4px)", display: "grid", placeItems: "center", zIndex: 120, padding: 30 }}>
          <div className="card" style={{ width: "min(560px,100%)", maxHeight: "84vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div className="row" style={{ padding: "14px 20px", borderBottom: "1px solid var(--line-soft)", gap: 11 }}>
              <span style={{ width: 3, height: 22, borderRadius: 2, background: "var(--gold-bright)", flex: "none" }} />
              <div className="grow"><div style={{ fontSize: 15, fontWeight: 600 }}>Needs your attention today</div><div className="sub">Ranked by dollar impact across all {AGENCY.subCount} sub-accounts.</div></div>
              <button onClick={() => setAttnOpen(false)} className="btn btn-s" style={{ width: 30, height: 30, padding: 0, justifyContent: "center", borderRadius: 9 }}><Ic.x size={14} /></button>
            </div>
            <div className="pane" style={{ padding: "8px 20px 18px" }}>
              {attention.map(a => (
                <div key={a.who} style={{ border: "1px solid var(--line-soft)", borderLeft: "3px solid " + a.tone, borderRadius: 11, padding: "13px 14px", background: "var(--surface-2)", marginTop: 10 }}>
                  <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: a.color }} />
                    <span style={{ fontSize: 12.5, fontWeight: 600 }}>{a.who}</span>
                    <span className="mono" style={{ marginLeft: "auto", fontSize: 12, color: a.tone }}>{a.amount}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: "var(--ink-2)" }}>{a.text}</div>
                  <div className="row" style={{ gap: 8, marginTop: 11 }}>
                    <button style={{ padding: "7px 13px", borderRadius: 9, background: GOLD_BG, color: GOLD_INK, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none" }}>{a.cta}</button>
                    <button onClick={openAsk} className="btn btn-s" style={{ height: 30, borderRadius: 9, fontSize: 12, color: "var(--ink-2)" }}>Ask Paige</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Own client book (sub-account scope, §51 — no cross-sub anything) ──────────
const OwnBook = ({ ownName }) => {
  const [filter, setFilter] = React.useState("All");
  const clients = CLIENT_NAMES.map((c, i) => ({
    name: c[0], biz: c[1], color: SUBS[i % SUBS.length].color,
    health: 92 - (i % 5) * 7, mrr: money(600 + (i % 6) * 340),
    next: NEXT_ACTIONS[i % NEXT_ACTIONS.length], tenure: (2 + (i % 22)) + " months",
  }));
  const shown = filter === "All" ? clients : filter === "Needs attention" ? clients.filter(c => c.health < 78) : clients.filter(c => c.health >= 85);
  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 15 }}>
      <div className="row" style={{ alignItems: "flex-end", gap: 16, flex: "none", flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-.02em" }}>Your clients</div>
          <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 6 }}>{clients.length} active in {ownName} · Paige working every thread</div>
        </div>
        <button style={{ marginLeft: "auto", padding: "10px 16px", borderRadius: 10, background: GOLD_BG, color: GOLD_INK, fontSize: 13, fontWeight: 600, cursor: "pointer", border: "none", flex: "none" }}>+ Add a client</button>
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", flex: "none" }}>
        {["All", "Healthy", "Needs attention"].map(l => {
          const on = filter === l;
          return <button key={l} onClick={() => setFilter(l)} style={{ padding: "7px 13px", borderRadius: 20, cursor: "pointer", fontSize: 12.5, fontWeight: 500, border: "1px solid " + (on ? "var(--gold-line)" : "var(--line)"), background: on ? "var(--gold-tint)" : "var(--surface)", color: on ? "var(--gold)" : "var(--ink-2)" }}>{l}</button>;
        })}
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 13, paddingRight: 4, alignContent: "start" }}>
        {shown.map(c => (
          <div key={c.name} className="card" style={{ padding: "15px 16px", display: "flex", flexDirection: "column", gap: 10, minHeight: 150 }}>
            <div className="row" style={{ gap: 10 }}>
              <Avatar name={c.name} size={30} />
              <div style={{ minWidth: 0 }}><div className="trunc" style={{ fontSize: 13.5, fontWeight: 600 }}>{c.name}</div><div className="sub trunc">{c.biz}</div></div>
              <span style={{ marginLeft: "auto", width: 9, height: 9, borderRadius: "50%", background: hc(c.health), flex: "none" }} />
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.45 }}>{c.next}</div>
            <div className="row" style={{ marginTop: "auto", justifyContent: "space-between", fontSize: 12.5, color: "var(--ink-2)" }}>
              <span className="mono" style={{ fontWeight: 600, color: "var(--ink)" }}>{c.mrr}</span>
              <span style={{ color: "var(--gold)", fontWeight: 600 }}>Open →</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Pipelines ─────────────────────────────────────────────────────────────────
const kanbanFor = (pipes, i) => {
  let s = 4200 + i * 31;
  const r = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
  return STAGE_SET.map((stg, j) => ({
    key: stg.key, tint: stg.tint, ink: stg.ink, count: String(pipes[i].counts[j]),
    cards: Array.from({ length: Math.min(3, pipes[i].counts[j]) }, (_, k) => {
      const c = CLIENT_NAMES[(i + j + k) % CLIENT_NAMES.length];
      return { name: c[0], biz: c[1], days: (2 + Math.round(r() * 22)) + "d in stage", value: money(800 + Math.round(r() * 5200)), next: NEXT_ACTIONS[(i + j + k) % NEXT_ACTIONS.length] };
    }),
  }));
};

const Kanban = ({ cols, proposeLabel, actAsLabel, crossBook }) => (
  <div className="row" style={{ gap: 10, overflowX: "auto", paddingBottom: 4, flex: "none", alignItems: "flex-start" }}>
    {cols.map(c => (
      <div key={c.key} style={{ flex: "0 0 176px", display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="row" style={{ gap: 7, paddingBottom: 7, borderBottom: "2px solid " + c.tint }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: c.ink }}>{c.key}</span>
          <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)" }}>{c.count}</span>
        </div>
        {c.cards.map((k, ki) => (
          <div key={ki} style={{ border: "1px solid var(--line-soft)", borderRadius: 10, background: "var(--surface-sunk)", padding: "10px 11px" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>{k.name}</div>
            <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{k.biz}</div>
            <div className="row" style={{ gap: 8, marginTop: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{k.value}</span>
              <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)" }}>{k.days}</span>
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.4 }}>{k.next}</div>
            {crossBook && (
              <div className="row" style={{ gap: 6, marginTop: 9 }}>
                <span style={{ padding: "5px 9px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 10.5, fontWeight: 600, color: "var(--ink-2)", cursor: "pointer" }}>{proposeLabel}</span>
                <span style={{ padding: "5px 9px", borderRadius: 7, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 10.5, color: "var(--ink-2)", cursor: "pointer" }}>{actAsLabel}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    ))}
  </div>
);

const Pipelines = ({ crossBook, ownName, ownIdx, openAsk }) => {
  const pipes = React.useMemo(() => seedPipes(), []);
  const [scope, setScope] = React.useState(crossBook ? "Book view" : "Per");
  const [pipeSel, setPipeSel] = React.useState(crossBook ? 0 : ownIdx);
  const [pickOpen, setPickOpen] = React.useState(false);

  const stageTotals = STAGE_SET.map((s, j) => pipes.reduce((a, p) => a + p.counts[j], 0));
  const totalFlight = stageTotals.slice(0, 4).reduce((a, c) => a + c, 0);
  const bookWeighted = pipes.reduce((a, p) => a + p.value, 0);
  const bookView = crossBook && scope === "Book view";

  const proposeLabel = "Propose to " + (OWNERS[pipeSel] || "owner").split(" ")[0];
  const actAsLabel = "Act as " + SUBS[pipeSel].name.split(" ")[0];

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
        <div className="row" style={{ alignItems: "flex-start", gap: 12, flex: "none", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 9 }}>
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.02em" }}>{crossBook ? "Pipelines across " + LBL.owner : "Pipeline"}</span>
              <span title={FLAGS.pipesFlag} style={{ width: 19, height: 19, borderRadius: 6, background: "var(--gold-tint)", border: "1px solid var(--gold-line)", color: "var(--gold)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, cursor: "help", flex: "none" }}>!</span>
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 5 }}>{crossBook ? totalFlight + " prospects in flight · " + money(bookWeighted) + " weighted · " + pipes.reduce((a, p) => a + p.stalled, 0) + " stalled 14+ days" : totalFlight ? "Your prospects, ranked by what moves them next" : ""}</div>
          </div>
          {crossBook && (
            <div className="row" style={{ marginLeft: "auto", gap: 6, flex: "none" }}>
              {["Book view", "Per sub-account"].map(l => {
                const val = l === "Book view" ? "Book view" : "Per";
                const on = scope === val;
                return <button key={l} onClick={() => setScope(val)} style={{ padding: "7px 13px", borderRadius: 9, fontSize: 12, fontWeight: 600, border: "1px solid " + (on ? "var(--ink)" : "var(--line)"), background: on ? "var(--ink)" : "var(--surface)", color: on ? "var(--ink-inv)" : "var(--ink-2)", cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>;
              })}
            </div>
          )}
        </div>

        {bookView ? (
          <>
            {/* River band: where the book's clients sit. */}
            <div className="card" style={{ padding: "14px 16px", flex: "none" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Where the book's clients sit</div>
              <div className="row" style={{ gap: 2, marginTop: 11, alignItems: "stretch" }}>
                {STAGE_SET.map((s, j) => {
                  const total = stageTotals.reduce((a, c) => a + c, 0) || 1;
                  return <div key={s.key} title={s.key + " · " + stageTotals[j]} style={{ flex: "0 0 " + ((stageTotals[j] / total) * 100).toFixed(2) + "%", minWidth: 6, height: 18, borderRadius: 3, background: s.tint }} />;
                })}
              </div>
              <div className="row" style={{ gap: 2, marginTop: 5 }}>
                {STAGE_SET.map((s, j) => { const total = stageTotals.reduce((a, c) => a + c, 0) || 1; return <span key={s.key} className="mono" style={{ fontSize: 10, color: "var(--ink-3)", flex: "0 0 " + ((stageTotals[j] / total) * 100).toFixed(2) + "%", minWidth: 10 }}>{s.key} {stageTotals[j]}</span>; })}
              </div>
            </div>

            {/* Per-sub row table. */}
            <div className="card" style={{ flex: "none", padding: 0 }}>
              {SUBS.map((s, i) => {
                const p = pipes[i];
                return (
                  <div key={s.name} className="row" style={{ gap: 12, padding: "12px 15px", borderBottom: i < SUBS.length - 1 ? "1px solid var(--line-soft)" : "0" }}>
                    <span style={{ width: 3, height: 34, borderRadius: 2, background: s.color, flex: "none" }} />
                    <div style={{ width: 150, flex: "none", minWidth: 0 }}>
                      <div className="trunc" style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</div>
                      <div className="trunc" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>{OWNERS[i] || ""}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 60 }}>
                      <div className="row" style={{ gap: 2, alignItems: "stretch" }}>
                        {STAGE_SET.map((stg, j) => { const tot = p.counts.reduce((a, c) => a + c, 0) || 1; return <div key={j} title={String(p.counts[j])} style={{ flex: "0 0 " + ((p.counts[j] / tot) * 100).toFixed(2) + "%", minWidth: 4, height: 14, borderRadius: 3, background: stg.tint }} />; })}
                      </div>
                    </div>
                    <div style={{ width: 98, flex: "none", textAlign: "right" }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{money(p.value)}</div>
                      <div className="mono" style={{ fontSize: 10.5, color: p.delta >= 0 ? "var(--ok)" : "var(--bad)", marginTop: 3 }}>{(p.delta >= 0 ? "+" : "") + p.delta}% wk</div>
                    </div>
                    <span style={{ fontSize: 11, color: p.stalled > 1 ? "var(--warn)" : "var(--ink-3)", width: 72, flex: "none", textAlign: "right" }}>{p.stalled > 0 ? p.stalled + " stalled" : "none stalled"}</span>
                    <button onClick={() => { setPipeSel(i); setScope("Per"); }} style={{ fontSize: 12, fontWeight: 600, color: "var(--gold)", cursor: "pointer", flex: "none", background: "transparent", border: "none" }}>Enter →</button>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <>
            {/* Per-sub-account picker (agency) → pipePickOpen. */}
            {crossBook && (
              <div style={{ position: "relative", flex: "none" }}>
                <button onClick={() => setPickOpen(v => !v)} className="row" style={{ width: "100%", gap: 11, padding: "11px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", cursor: "pointer" }}>
                  <span style={{ width: 3, height: 20, borderRadius: 2, background: SUBS[pipeSel].color, flex: "none" }} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{SUBS[pipeSel].name}</span>
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{OWNERS[pipeSel] || ""}</span>
                  <span className="mono" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-2)", flex: "none" }}>{money(pipes[pipeSel].value)} weighted · {pipes[pipeSel].counts.slice(0, 4).reduce((a, c) => a + c, 0)} in flight</span>
                  <span style={{ color: "var(--ink-3)", fontSize: 11, flex: "none" }}>▾</span>
                </button>
                {pickOpen && (
                  <>
                    <div onClick={() => setPickOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
                    <div className="fade-in card" style={{ position: "absolute", left: 0, right: 0, top: 52, zIndex: 61, maxHeight: 270, overflowY: "auto", padding: 6, boxShadow: "var(--sh-3)" }}>
                      {SUBS.map((s, i) => (
                        <button key={s.name} onClick={() => { setPipeSel(i); setPickOpen(false); }} className="row" style={{ width: "100%", gap: 10, padding: "9px 11px", borderRadius: 9, cursor: "pointer", background: i === pipeSel ? "var(--surface-sunk)" : "transparent", border: "none", textAlign: "left" }}
                          onMouseEnter={e => { if (i !== pipeSel) e.currentTarget.style.background = "var(--surface-2)"; }} onMouseLeave={e => { if (i !== pipeSel) e.currentTarget.style.background = "transparent"; }}>
                          <span style={{ width: 3, height: 18, borderRadius: 2, background: s.color, flex: "none" }} />
                          <span className="trunc" style={{ fontSize: 13, fontWeight: 500, minWidth: 0 }}>{s.name}</span>
                          <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-3)", flex: "none" }}>{OWNERS[i] || ""}</span>
                          <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)", flex: "none" }}>{money(pipes[i].value)}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {crossBook && <div style={{ fontSize: 11.5, color: "var(--ink-3)", flex: "none" }}>Observing {(OWNERS[pipeSel] || "the owner")}'s board. Move a client by proposing it to them, or by acting as their workspace.</div>}
            <Kanban cols={kanbanFor(pipes, pipeSel)} proposeLabel={proposeLabel} actAsLabel={actAsLabel} crossBook={crossBook} />
          </>
        )}
      </div>

      {/* Right rail — Paige's read + book-wide proposals (agency only). */}
      {crossBook && (
        <aside style={{ width: 296, flex: "0 1 296px", minWidth: 0, display: "flex", flexDirection: "column", gap: 11, minHeight: 0, overflowY: "auto" }}>
          <div style={{ border: "1px solid var(--violet-line)", borderRadius: 13, background: "var(--violet-tint)", padding: "15px 16px", flex: "none" }}>
            <div className="row" style={{ gap: 9 }}><span style={{ color: "var(--violet)", display: "flex" }}><Ic.spark size={13} /></span><div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--violet)" }}>Paige's read on {LBL.owner}'s pipelines</div></div>
            <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 9 }}>Four {LBL.tenants.toLowerCase()} have prospects stalled in Proposal past 14 days, and three show the same objection — pricing raised right after Discovery. She's drafted a response for each.</div>
            <button onClick={openAsk} className="row" style={{ marginTop: 11, gap: 7, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--violet-line)", background: "var(--surface)", fontSize: 12, fontWeight: 600, color: "var(--violet)", cursor: "pointer" }}>Ask Paige <Ic.arrow size={12} /></button>
          </div>
          <div className="card" style={{ padding: "15px 16px", flex: "none" }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Book-wide proposals</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 11 }}>
              {[{ title: "Batch nudge for stalled Proposals", meta: "4 " + LBL.tenants.toLowerCase() + " · 8 prospects", note: "Stage-appropriate nudge drafted per prospect. Owners approve on their end." }, { title: "Template refresh for Discovery follow-ups", meta: "6 " + LBL.tenants.toLowerCase() + " affected", note: "Same objection pattern across the book. One rewrite covers all six." }].map(p => (
                <div key={p.title} style={{ border: "1px solid var(--line-soft)", borderRadius: 11, background: "var(--surface-2)", padding: "12px 13px" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>{p.title}</div>
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 5 }}>{p.meta}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.45 }}>{p.note}</div>
                  <div className="row" style={{ flexWrap: "wrap", gap: 7, marginTop: 10 }}>
                    <span style={{ padding: "7px 13px", borderRadius: 8, background: GOLD_BG, color: GOLD_INK, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Approve to send</span>
                    <span className="btn btn-s" style={{ height: 30, fontSize: 11.5 }}>Read drafts</span>
                    <span className="btn btn-s" style={{ height: 30, fontSize: 11.5, color: "var(--ink-2)" }}>Dismiss</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      )}
    </div>
  );
};

// ── ClientsHub (root screen) ──────────────────────────────────────────────────
const ClientsHub = ({ isAgency = true, acting = null, openAsk = noop }) => {
  useReducedMotion(); // keep the pack's motion-preference subscription warm on this surface
  const crossBook = isAgency && !acting;
  const ownName = acting ? acting.name : SUBS[0].name;
  const ownIdx = acting ? Math.max(0, SUBS.findIndex(s => s.name === acting.name)) : 0;

  const [tab, setTab] = useSubtabRoute("agency", "clients", "directory");
  const tabs = [
    ["directory", crossBook ? "Sub-accounts" : "Clients", () => <Ic.users size={15} />],
    ["pipes", crossBook ? "Pipelines" : "Pipeline", () => <Ic.trend size={15} />],
    ["convos", "Conversations", () => <Ic.mail size={15} />, "2"],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0, alignItems: "stretch" }}>
      <SubTabs tabs={tabs} cur={tab} set={setTab} />
      <div key={tab} className="fade-in" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "18px 26px 22px", width: "100%", maxWidth: 1440, margin: "0 auto" }}>
        {tab === "directory" && (crossBook ? <Directory openAsk={openAsk} /> : <OwnBook ownName={ownName} />)}
        {tab === "pipes" && <Pipelines crossBook={crossBook} ownName={ownName} ownIdx={ownIdx} openAsk={openAsk} />}
        {tab === "convos" && <ConversationsConsole isAgency={isAgency} acting={acting} openAsk={openAsk} />}
      </div>
    </div>
  );
};

export default ClientsHub;
export { ClientsHub };
