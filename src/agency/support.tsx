// @ts-nocheck
// Agency pack — the Client Support screen. Owner-locked port of the Claude Design
// "CRM agency mode" pack (§28/§63 — "We do not drift off this whatsoever"),
// mirroring the Solo-port precedent for the Agency design.
//
// Source of truth: "Agency Shell.dc.html" — the `view === "support"` body (its
// `<sc-if isSupport>` render block) + the `ticketOpen` right slide-out drawer +
// the DCLogic that derives supportHeader / supportFilters / tickets / supportEmpty
// / supportReads / ticket. The DC runtime (the dead support.js) is NOT ported —
// its markup, measurements, copy, and per-view state derivation are mirrored onto
// React + the ./_shared primitives (SlideOut carries the drawer's scrim / Esc /
// focus / reduced-motion), and the source's literal light-hex is routed through
// the token layer so every surface themes light↔dark (§23) under `.paige-agency`.
//
// POP-OUT this module owns: the TICKET DETAIL DRAWER (SlideOut) — the right
// slide-out that shows the thread, Paige's draft (with Send / Edit / Dismiss /
// Add to KB), and a WHO'S-ASKING context rail. The list's "Paige's read this week"
// column is an in-body aside (a rail, not a pop-out). All overlay state
// (selected-ticket index, active filter) lives inside this module.
//
// §51 INVARIANT — a sub-account is NEVER the parent aggregate. `sub` (a standalone
// sub-account, OR the agency acting into one) reads ONLY that book's own tickets
// (SUB_TICKETS); the agency aggregate (TICKETS across the book) renders solely when
// isAgency && !acting. There is no cross-sub picker or "act as" affordance on this
// surface at all — a sub-account sees only its own support queue, by construction.
import React from "react";
import { Ic, SlideOut } from "./_shared";
import { TICKETS, SUB_TICKETS, SUBS, GOLD } from "./fixtures";

// Gold act-ink (§11 — gold spent only on the Send/approve moment; dark ink for AA
// on the gold fill, matching the pack's other act buttons).
const GOLD_INK = "#241C05";

// Filter set + per-status pill map + the decorate() helpers, ported verbatim from
// the design's DCLogic (supportFilters / the `pill` closure / `decorate`).
const FILTERS = ["All", "Awaiting your approval", "Drafted by Paige", "Sent", "Resolved", "At risk"];
const decInitials = name => name.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("");
// hc() — health→tone, tokenised exactly like the shell's own hc() so the dot themes.
const hc = h => (h >= 85 ? "var(--ok)" : h >= 70 ? "var(--warn)" : "var(--bad)");
// Design pill(): resolved/sent = ok, at-risk = bad, otherwise (awaiting / drafted) = warm/warn.
const statusPill = status =>
  status === "Resolved" || status === "Sent" ? { bg: "var(--ok-tint)", color: "var(--ok)" }
    : status === "At risk" ? { bg: "var(--bad-tint)", color: "var(--bad)" }
      : { bg: "var(--warn-tint)", color: "var(--warn)" };

// name → sub-account (for the agency ticket's brand color / health / MRR / tenure).
const subBy = {};
SUBS.forEach(s => { subBy[s.name] = s; });

// Paige's-read cards (design supportReads — agency vs single-book copy, verbatim).
const READS_AGENCY = [
  { title: "4 of your 12 sub-accounts asked the same thing this week", body: "All four wanted to know how to change their booking window. Worth adding it to the onboarding sequence — I drafted the section.", cta: "Read the draft" },
  { title: "Median response is 4h, down from 6h last week", body: "Harbor & Vine and Verde both got answers inside 25 minutes. Coach James is the outlier at five days.", cta: "See the trend" },
  { title: "Coach James is one day from the escalation valve", body: "His ticket has been open 5 business days. At 7, he can loop in Paige directly. The draft answering him is ready now.", cta: "Approve it now" }
];
const READS_SUB = [
  { title: "Three clients asked about payment plans this week", body: "All three came from the group program page, which doesn't mention instalments. I drafted a line for that page.", cta: "Read the draft" },
  { title: "Median first response is 18 minutes", body: "Every question this week was answered the same morning it arrived. Nothing has been open longer than a day.", cta: "See the trend" },
  { title: "Your replay page was the cause of two complaints", body: "Both were about load time on mobile, now fixed. The heads-up to the eleven people affected is drafted and waiting.", cta: "Approve it now" }
];

// buildTicket — the design's `ticket` derivation (line ~11429). Shapes a raw
// TICKETS / SUB_TICKETS row into the drawer's view object. `sub` picks the
// single-book presentation (the person asks, not a named sub-account); `acting`
// supplies the book color when the agency is acting into a sub.
const buildTicket = (t, sub, acting) => {
  if (!t) return null;
  const who = (sub ? t.thread[0].who : t.who) || "";
  const s = sub ? (acting || {}) : (subBy[t.who] || {});
  const raw = subBy[t.who] || {};
  const person = (t.thread.filter(m => m.from === "them")[0] || t.thread[0] || {}).who || who;
  const color = s.color || GOLD;
  return {
    who, summary: t.summary, cat: t.cat, status: t.status, age: t.age, first: t.first,
    conf: t.conf + " confident this answers them, based on " + t.kb,
    draft: t.draft, color,
    initials: sub ? who.split(" ").filter(Boolean).map(w => w[0]).join("") : decInitials(t.who),
    tint: color + "1F",
    health: sub ? "—" : (s.health ? String(s.health) : "—"),
    healthColor: sub ? "var(--ink-3)" : hc(s.health),
    mrr: sub ? "$450 / mo" : (s.mrr || "—"),
    tenure: sub ? "7 months" : (raw.tenure || "—"),
    contextTitle: sub ? "WHO'S ASKING · YOUR CLIENT" : "WHO'S ASKING",
    contextFoot: sub ? "Their full history sits in your client record." : "Open their sub-account to see the full operation behind this ticket.",
    voiceNote: "Drafted in " + (sub ? "your" : "your agency's") + " voice, from your knowledge base.",
    showRisk: !!t.risk,
    riskNote: "Open " + t.age + " with no reply. At 7 business days " + person + " can loop in Paige directly.",
    thread: t.thread.map(m => ({
      text: m.text,
      align: m.from === "them" ? "flex-start" : "flex-end",
      bg: m.from === "them" ? "var(--surface-sunk)" : "var(--violet-tint)",
      label: m.who + " · " + m.when
    }))
  };
};

// ---------------------------------------------------------------------------
// ClientSupport — the shell hosts this as the `support` screen body and passes
// { isAgency, acting, openAsk }. `sub` = a single book's own queue (a standalone
// sub-account, or the agency acting into one); the book-wide aggregate renders
// only for the true agency view (§51).
// ---------------------------------------------------------------------------
const ClientSupport = ({ isAgency = true, acting = null, openAsk = () => {} }) => {
  const sub = !isAgency || !!acting;
  const [filter, setFilter] = React.useState("All");
  const [selIdx, setSelIdx] = React.useState(null);           // real index into basePool; null = drawer closed

  const basePool = sub ? SUB_TICKETS : TICKETS;
  const whoOf = t => (sub ? t.thread[0].who : t.who) || "";
  const colorOf = t => (sub ? (acting || {}) : (subBy[t.who] || {})).color || GOLD;

  const count = name => name === "All" ? basePool.length
    : name === "At risk" ? basePool.filter(t => t.risk).length
      : basePool.filter(t => t.status === name).length;
  const match = t => filter === "All" || t.status === filter || (filter === "At risk" && t.risk);
  const visible = basePool.map((t, i) => ({ t, i })).filter(({ t }) => match(t));
  const empty = visible.length === 0;
  const emptyLine = filter === "At risk"
    ? "Nothing is at risk. Every open ticket has been answered inside a day."
    : "Nothing here right now. Try another filter.";

  const header = sub
    ? "2 open · 1 draft ready for you · median response 18 min"
    : "7 open · 4 drafts ready for you · median response 4h";
  // §13 honesty marker — this queue (own-book and the agency aggregate alike) has no
  // ticket substrate yet, so the counts, response times, and tickets are stand-ins.
  // Mirrors the "!" badge the automations / calendar / vault ports already ship.
  const banner = "No support-ticket substrate exists yet — the ticket queue, open counts and response times here are stand-ins, not platform records.";
  const reads = sub ? READS_SUB : READS_AGENCY;
  const readsSub = sub ? "Patterns in what your clients are asking." : "Patterns across every sub-account's tickets.";

  const ticket = selIdx === null ? null : buildTicket(basePool[selIdx], sub, acting);
  const pickFilter = name => { setFilter(name); setSelIdx(null); };

  return (
    <div className="fade-in" style={{ display: "flex", gap: 16, height: "100%", minHeight: 0, padding: "20px 24px 22px", overflow: "hidden" }}>
      {/* ── Main column: header · filter chips · tickets list ─────────────── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="row" style={{ alignItems: "flex-end", gap: 16, flex: "none" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 9, alignItems: "center" }}>
              <span style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>Client Support</span>
              <span title={banner} style={{ width: 19, height: 19, borderRadius: 6, background: "var(--gold-tint)", border: "1px solid var(--gold-line)", color: "var(--warn)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, cursor: "help", flex: "none" }}>!</span>
            </div>
            <div style={{ fontSize: 13.5, color: "var(--ink-2)", marginTop: 6 }}>{header}</div>
          </div>
          <div className="row" style={{ marginLeft: "auto", gap: 8, fontSize: 12.5, color: "var(--ink-2)", flex: "none" }}>
            Sort<span style={{ padding: "7px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)" }}>Most urgent ▾</span>
          </div>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: "wrap", flex: "none" }}>
          {FILTERS.map(name => {
            const on = filter === name;
            return (
              <button key={name} onClick={() => pickFilter(name)}
                style={{ padding: "7px 13px", borderRadius: 20, cursor: "pointer", fontSize: 12.5, fontWeight: 500,
                  border: "1px solid " + (on ? "var(--gold-line)" : "var(--line)"),
                  background: on ? "var(--warn-tint)" : "var(--surface)",
                  color: on ? "var(--warn)" : "var(--ink-2)" }}>
                {name} ({count(name)})
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)" }}>
          {empty ? (
            <div style={{ height: "100%", minHeight: 200, display: "grid", placeItems: "center", padding: 26 }}>
              <div style={{ textAlign: "center", maxWidth: 320 }}>
                <div className="tile" style={{ width: 34, height: 34, borderRadius: 10, background: "var(--ok-tint)", color: "var(--ok)", margin: "0 auto 12px", fontSize: 14 }}>✓</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)" }}>{emptyLine}</div>
              </div>
            </div>
          ) : (
            visible.map(({ t, i }) => {
              const on = selIdx === i;
              const p = statusPill(t.status);
              const rowBg = on ? "var(--surface-2)" : "var(--surface)";
              return (
                <button key={i} onClick={() => setSelIdx(i)}
                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = "var(--surface-2)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = rowBg; }}
                  className="row" style={{ width: "100%", textAlign: "left", gap: 13, padding: "13px 16px", borderBottom: "1px solid var(--line-soft)", cursor: "pointer", background: rowBg }}>
                  <span style={{ width: 3, height: 34, borderRadius: 2, background: colorOf(t), flex: "none" }} />
                  <div style={{ width: 186, flex: "none" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3 }} className="trunc">{whoOf(t)}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>{t.cat}</div>
                  </div>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: "var(--ink-2)", lineHeight: 1.4 }}>{t.summary}</div>
                    {t.proactive && <div style={{ fontSize: 11.5, color: "var(--violet)", marginTop: 4 }}>✦ Paige drafted this first</div>}
                  </div>
                  <span style={{ padding: "4px 10px", borderRadius: 20, background: p.bg, color: p.color, fontSize: 11.5, fontWeight: 500, flex: "none" }}>{t.status}</span>
                  <span className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)", width: 104, textAlign: "right", flex: "none" }}>{t.age}</span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Paige's-read rail (in-body aside) ────────────────────────────── */}
      <aside style={{ width: 322, flex: "none", display: "flex", flexDirection: "column", gap: 13, border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)", padding: 17, minHeight: 0 }}>
        <div style={{ flex: "none" }}>
          <div style={{ fontSize: 16.5, fontWeight: 600 }}>Paige's read this week</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 5 }}>{readsSub}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11, overflowY: "auto", minHeight: 0 }}>
          {reads.map((r, i) => (
            <div key={i} style={{ border: "1px solid var(--line-soft)", borderRadius: 11, padding: "12px 13px", background: "var(--surface-2)" }}>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>{r.title}</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-2)", marginTop: 6 }}>{r.body}</div>
              <button onClick={openAsk} style={{ padding: "7px 12px", marginTop: 11, borderRadius: 9, background: "var(--ink)", color: "var(--ink-inv)", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none" }}>{r.cta}</button>
            </div>
          ))}
        </div>
      </aside>

      {/* ── Ticket detail drawer (SlideOut) ──────────────────────────────── */}
      <SlideOut open={!!ticket} onClose={() => setSelIdx(null)} wide
        title={ticket ? ticket.who : ""} sub={ticket ? ticket.summary : ""}
        tone={ticket ? ticket.tint : undefined}
        icon={ticket ? <span style={{ fontSize: 11.5, fontWeight: 700, color: ticket.color }}>{ticket.initials}</span> : null}>
        {ticket && (
          <div style={{ display: "flex", gap: 16, minHeight: 0 }}>
            {/* Thread + Paige's draft */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 13 }}>
              {ticket.showRisk && (
                <div style={{ border: "1px solid var(--bad-tint)", borderLeft: "3px solid var(--bad)", borderRadius: 11, background: "var(--bad-tint)", padding: "12px 13px", fontSize: 12.5, lineHeight: 1.5, color: "var(--bad)" }}>{ticket.riskNote}</div>
              )}
              {ticket.thread.map((m, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", gap: 5, alignItems: m.align }}>
                  <div style={{ fontSize: 11, color: "var(--ink-3)" }}>{m.label}</div>
                  <div style={{ maxWidth: "86%", padding: "11px 14px", borderRadius: 12, background: m.bg, fontSize: 13.5, lineHeight: 1.55, color: "var(--ink-2)" }}>{m.text}</div>
                </div>
              ))}
              <div style={{ border: "1px solid var(--violet-line)", borderRadius: 13, background: "var(--surface)", overflow: "hidden" }}>
                <div className="row" style={{ gap: 9, padding: "11px 14px", background: "var(--violet-tint)", borderBottom: "1px solid var(--violet-line)" }}>
                  <span style={{ color: "var(--violet)", fontSize: 12.5 }}>✦</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--violet)" }}>Paige's draft</span>
                  <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-3)" }}>{ticket.conf}</span>
                </div>
                <div style={{ padding: 14, fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-2)" }}>{ticket.draft}</div>
                <div style={{ padding: "0 14px 12px", fontSize: 11.5, color: "var(--ink-3)" }}>{ticket.voiceNote}</div>
                <div className="row" style={{ gap: 9, padding: "12px 14px", borderTop: "1px solid var(--line-soft)", background: "var(--surface-2)", flexWrap: "wrap" }}>
                  <button className="row" style={{ gap: 7, padding: "9px 16px", borderRadius: 9, background: "var(--gold-bright)", color: GOLD_INK, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}><Ic.check size={13} />Send response</button>
                  <button className="btn btn-s" style={{ height: "auto", padding: "9px 14px", borderRadius: 9, fontSize: 13 }}>Edit first</button>
                  <button className="btn btn-s" style={{ height: "auto", padding: "9px 14px", borderRadius: 9, fontSize: 13, color: "var(--ink-2)" }}>Dismiss</button>
                  <button style={{ marginLeft: "auto", fontSize: 12, color: "var(--gold)", fontWeight: 600, cursor: "pointer", background: "none", border: "none" }}>+ Add to knowledge base</button>
                </div>
              </div>
            </div>

            {/* WHO'S-ASKING context rail */}
            <div style={{ width: 196, flex: "none", borderLeft: "1px solid var(--line)", paddingLeft: 16, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".14em", color: "var(--ink-3)" }}>{ticket.contextTitle}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                <div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Health score</div>
                  <div className="row" style={{ gap: 7, marginTop: 4 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: ticket.healthColor }} /><span style={{ fontSize: 15, fontWeight: 600 }}>{ticket.health}</span></div>
                </div>
                <div><div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>MRR</div><div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{ticket.mrr}</div></div>
                <div><div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>With you</div><div style={{ fontSize: 13.5, marginTop: 4 }}>{ticket.tenure}</div></div>
                <div><div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Category</div><div style={{ fontSize: 13.5, marginTop: 4 }}>{ticket.cat}</div></div>
                <div><div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>First response</div><div style={{ fontSize: 13.5, marginTop: 4 }}>{ticket.first}</div></div>
                <div><div style={{ fontSize: 11.5, color: "var(--ink-3)" }}>Open for</div><div style={{ fontSize: 13.5, marginTop: 4 }}>{ticket.age}</div></div>
              </div>
              <div style={{ marginTop: "auto", paddingTop: 13, borderTop: "1px solid var(--line-soft)", fontSize: 12, lineHeight: 1.5, color: "var(--ink-3)" }}>{ticket.contextFoot}</div>
            </div>
          </div>
        )}
      </SlideOut>
    </div>
  );
};

export default ClientSupport;
