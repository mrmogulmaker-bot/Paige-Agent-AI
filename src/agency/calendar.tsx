// @ts-nocheck
// Agency pack — the Calendar screen. Owner-locked port of the Claude Design
// "CRM agency mode" pack (§28/§63 — "We do not drift off this whatsoever"),
// mirroring the Solo calendar precedent (src/solo/calendar.tsx) for the Agency
// design. Source of truth: "Agency Shell.dc.html" — the `view === "calendar"`
// body. Its DCLogic runtime (the cal* view-descriptor block + support.js) is NOT
// ported; its markup, measurements, copy and interaction are mirrored onto React
// + the ./_shared primitives + ./fixtures data, and every literal LIGHT hex is
// routed through the token layer so each surface themes light↔dark (§23) under
// `.paige-agency`. Event/layer/sub brand HUES stay raw — they are data colours
// (like SUBS[].color), not chrome.
//
// FIVE TABS (CAL_TABS): Schedule · Booking links · Availability · Requests ·
// Settings. Only the Schedule month grid is a real grid in the design; Week/Day
// are cosmetic segment states (the design renders the month grid regardless of
// calView), ported faithfully.
//
// POP-OUTS this module owns (per the brief):
//   • New calendar / booking-link (calNewOpen) — the right slide-in "What kind of
//     calendar is this?" builder. Opened by the Settings tab primary CTA.
//   • Booking-link detail (calLinkOpen) — the wide centre modal with the link's
//     rows, the questions she asks, and the "what they see" booking preview.
//   • Full list (calListOpen) — the centre modal of ALL calendars / forms / roles
//     (the Settings "All N →" overflow, shown when the body is short).
//   • Day rail (calRailOpen) — the centre modal the schedule day-rail collapses
//     into when the body is narrow (< 1000px): conflict note, that day's events,
//     assignment rules and connected calendars.
//   • Sub picker (calShowPicker) — the inline chip row over the book. AGENCY-ONLY:
//     it is a cross-book scope switcher, so §51 gates it to agencyView + the
//     "Per sub-account" scope (a single sub-account never sees a picker over other
//     books, and never the parent aggregate).
//
// §51 INVARIANT — a sub-account is NEVER the parent aggregate. `agencyView` (true
// agency, not acting into a sub) gates every cross-book affordance: the Agency /
// Book / Per-sub SCOPE SEGMENT and the sub-account PICKER. When the module presents
// a single book (a standalone sub-account, or the agency acting into one) it shows
// ONLY that book's own calendar — the CAL_SUB_* data path, that book's slug/brand,
// no scope toggle and no picker.
import React from "react";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, SubTabs, SlideOut, Modal, AV } from "./_shared";
import {
  CAL_TABS, CAL_CALENDARS, CAL_SETTING_GROUPS, CAL_FORMS, CAL_ROLES, CAL_LAYERS,
  CAL_EVENTS, CAL_SUB_EVENTS, CAL_LINKS, CAL_SUB_LINKS, CAL_SCHEDULES, CAL_SUB_SCHEDULES,
  CAL_REQUESTS, CAL_SUB_REQUESTS, TEAM, TEAM_SUBS, SUBS, BRAND, GREEN, AMBER
} from "./fixtures";

// Gold act-token (§11 — gold only on the approve/act moment). The design paints
// the primary CTA #C8A02E-family with #241C05 ink; the fill routes through the
// theme token, the ink stays dark for AA on gold.
const GOLD_INK = "#241C05";
const goldBg = "var(--gold-bright)";

// tmInit — the design's two-letter initials helper (Agency Shell:6734). Defined
// locally (not exported by ./_shared or ./fixtures, so no §18 redefinition).
const tmInit = n => (n || "").split(" ").filter(w => w[0] && /[A-Za-z]/.test(w[0])).slice(0, 2).map(w => w[0].toUpperCase()).join("");

// colourOf(kind) — the layer colour for an event kind (falls back to the first).
const colourOf = k => (CAL_LAYERS.find(l => l.key === k) || CAL_LAYERS[0]).color;
const labelOf = k => (CAL_LAYERS.find(l => l.key === k) || {}).label;

// Small segmented control (the design's "white pill in a sunk track"): active pill
// is a raised surface with sh-1, inactive is quiet ink-2. Used for the scope toggle
// and the Month/Week/Day view segment.
const Segment = ({ items, value, onChange }) => (
  <div className="row" style={{ padding: 3, borderRadius: 10, background: "var(--surface-sunk)", border: "1px solid var(--line)", flex: "none", gap: 0 }}>
    {items.map(([k, l]) => {
      const on = value === k;
      return <button key={k} onClick={() => onChange(k)} style={{
        padding: "6px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: on ? 600 : 500, whiteSpace: "nowrap", cursor: "pointer",
        background: on ? "var(--surface)" : "transparent", color: on ? "var(--ink)" : "var(--ink-2)",
        boxShadow: on ? "var(--sh-1)" : "none", border: "none"
      }}>{l}</button>;
    })}
  </div>
);

// Layer toggle chip (Schedule tab): on → tinted with its own hue, off → quiet.
const LayerChip = ({ l, on, onToggle }) => (
  <button onClick={onToggle} className="row" style={{
    gap: 6, padding: "5px 10px", borderRadius: 20, whiteSpace: "nowrap", cursor: "pointer", flex: "none",
    border: "1px solid " + (on ? l.color + "66" : "var(--line)"),
    background: on ? l.color + "1A" : "var(--surface)", color: on ? "var(--ink)" : "var(--ink-3)", fontSize: 11
  }}>
    <span style={{ width: 7, height: 7, borderRadius: "50%", background: l.color, flex: "none", display: "block" }} />{l.label}
  </button>
);

// Field pill (Settings hours/reminders/payments/policies + the New-calendar form):
// a read-only value row with an optional caret / colour swatch.
const FieldRow = ({ label, value, caret, swatch, ph }) => (
  <div style={{ minWidth: 0 }}>
    {label && <div className="eyebrow" style={{ fontSize: 9, letterSpacing: ".13em" }}>{label}</div>}
    <div className="row" style={{ gap: 9, marginTop: label ? 5 : 0, padding: "9px 11px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface)", minWidth: 0 }}>
      {swatch && <span style={{ width: 16, height: 16, borderRadius: 5, background: value, border: "1px solid var(--line)", flex: "none" }} />}
      {value && !swatch && <span className="trunc" style={{ fontSize: 12.5, color: "var(--ink)", minWidth: 0 }}>{value}</span>}
      {swatch && <span className="trunc" style={{ fontSize: 12.5, color: "var(--ink)", minWidth: 0 }}>{value}</span>}
      {!value && ph && <span className="trunc" style={{ fontSize: 12.5, color: "var(--ink-3)", minWidth: 0 }}>{ph}</span>}
      {caret && <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)", flex: "none" }}>▾</span>}
    </div>
  </div>
);

// ── Month grid (Schedule tab) ──────────────────────────────────────────────
// Faithful port of the design's cell builder: a Monday-start grid, one leading
// blank, days 1..30. Cell count flexes with the body height (tight 21 / short 28
// / else 35). Each in-month cell shows up to 1–2 primary chips (meetings +
// deadlines) then a "+N more".
const MonthGrid = ({ evOf, sel, setSel, short, tight, cellH }) => {
  const dows = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const count = tight ? 21 : short ? 28 : 35;
  const conflicts = [9];
  const cells = [];
  for (let i = 0; i < count; i++) {
    const dayNum = i - 1;
    const inMonth = dayNum >= 1 && dayNum <= 30;
    const evs = inMonth ? evOf(dayNum) : [];
    const primary = evs.filter(e => e.kind === "meetings" || e.kind === "deadlines");
    const rest = evs.length - primary.length;
    const hidden = primary.length - (short ? 1 : 2) + rest;
    cells.push({
      dayNum, inMonth,
      label: inMonth ? String(dayNum) : "",
      sel: dayNum === sel,
      conflict: inMonth && conflicts.indexOf(dayNum) >= 0,
      chips: (short ? primary.slice(0, 1) : primary.slice(0, 2)),
      more: hidden > 0 ? "+" + hidden + " more" : null
    });
  }
  return <div style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 7 }}>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 4, flex: "none" }}>
      {dows.map(d => <div key={d} style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".11em", color: "var(--ink-3)", textAlign: "center" }}>{d}</div>)}
    </div>
    <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 4, alignContent: "start" }}>
      {cells.map((c, i) => <div key={i} onClick={() => c.inMonth && setSel(c.dayNum)} style={{
        border: "1px solid " + (c.sel ? "var(--gold-line)" : "var(--line-soft)"), borderRadius: 9,
        background: !c.inMonth ? "var(--surface-2)" : c.sel ? "var(--gold-tint)" : "var(--surface)",
        minHeight: cellH, padding: "4px 5px", cursor: c.inMonth ? "pointer" : "default", minWidth: 0, overflow: "hidden"
      }}>
        <div className="row" style={{ gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: c.inMonth ? "var(--ink)" : "var(--ink-3)" }}>{c.label}</span>
          {c.conflict && <span title="Three things land on this day" style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: "50%", background: "var(--warn)", flex: "none" }} />}
        </div>
        {c.chips.map((e, j) => <div key={j} className="trunc" style={{ marginTop: 3, padding: "2px 5px", borderRadius: 4, background: colourOf(e.kind) + "1A", borderLeft: "2px solid " + colourOf(e.kind), fontSize: 9.5, color: "var(--ink-2)" }}>{e.label}</div>)}
        {c.more && <div style={{ marginTop: 3, fontSize: 9, color: "var(--ink-3)" }}>{c.more}</div>}
      </div>)}
    </div>
  </div>;
};

// The schedule day-rail body (conflict note + the selected day's events). Rendered
// inline as the 288px aside when wide, and reused inside the calRail modal.
const DayEvents = ({ dayEvents }) => (
  <div style={{ display: "flex", flexDirection: "column", marginTop: 7 }}>
    {dayEvents.map((e, i) => <div key={i} className="row" style={{ alignItems: "flex-start", gap: 9, padding: "9px 0", borderTop: i ? "1px solid var(--line-soft)" : "0", minWidth: 0 }}>
      <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: e.color, flex: "none" }} />
      <div style={{ minWidth: 0, flex: "1 1 auto" }}>
        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.3 }}>{e.label}</div>
        <div className="trunc" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 3 }}>{e.time} · {e.who} · {e.kind}</div>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--gold)", marginTop: 5, cursor: "pointer" }}>{e.editCta}</div>
      </div>
    </div>)}
  </div>
);

// Request row (Requests tab) — accept / offer / decline. `accept` label + the
// state chip tone come from the request's state.
const RequestCard = ({ r }) => {
  const av = AV(r.color);
  const stateBg = r.state === "Pending" ? "var(--warn-tint)" : r.state === "Reschedule" ? "var(--violet-tint)" : "var(--bad-tint)";
  const stateColor = r.state === "Pending" ? "var(--warn)" : r.state === "Reschedule" ? "var(--violet)" : "var(--bad)";
  const accept = r.state === "Cancelled" ? "Send the written update" : r.state === "Reschedule" ? "Accept the new time" : "Confirm it";
  return <div style={{ border: "1px solid var(--line)", borderLeft: "3px solid " + r.color, borderRadius: 12, background: "var(--surface)", padding: "12px 14px", flex: "none", minWidth: 0 }}>
    <div className="row" style={{ gap: 10, minWidth: 0 }}>
      <span style={{ width: 26, height: 26, borderRadius: "50%", background: av.plate, boxShadow: "inset 0 0 0 2px " + r.color, color: av.ink, display: "grid", placeItems: "center", fontSize: 9.5, fontWeight: 700, flex: "none" }}>{tmInit(r.who)}</span>
      <span className="trunc" style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{r.who}</span>
      <span style={{ padding: "2px 9px", borderRadius: 20, background: stateBg, color: stateColor, fontSize: 10, fontWeight: 600, flex: "none" }}>{r.state}</span>
      <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none", whiteSpace: "nowrap" }}>{r.when}</span>
    </div>
    <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>{r.what} · {r.note}</div>
    <div className="row" style={{ gap: 9, marginTop: 10, flexWrap: "wrap" }}>
      <div className="row" style={{ gap: 7, padding: "8px 14px", borderRadius: 9, background: goldBg, color: GOLD_INK, fontSize: 12, fontWeight: 600, cursor: "pointer" }}><span style={{ fontSize: 10 }}>✓</span>{accept}</div>
      <div style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, cursor: "pointer" }}>Offer other times</div>
      <div style={{ padding: "8px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, color: "var(--ink-2)", cursor: "pointer" }}>Decline</div>
    </div>
  </div>;
};

// ── The screen ─────────────────────────────────────────────────────────────
const CalendarHub = ({ isAgency = true, acting = null, openAsk = () => {} }) => {
  const agencyView = !!isAgency && !acting;
  // Single-book identity: the acted-as sub, or (standalone sub-account mode) this
  // book's own decorative identity (SUBS[0], the design's Sarah's Coaching fixture).
  // Null only in true agency aggregate view. §51 — a single book never aggregates.
  const book = acting || (!isAgency ? SUBS[0] : null);
  const isBook = !!book;

  const wrapRef = React.useRef(null);
  const [dim, setDim] = React.useState({ w: 0, h: 0 });
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(es => { for (const e of es) setDim({ w: Math.round(e.contentRect.width), h: Math.round(e.contentRect.height) }); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const short = dim.h > 0 && dim.h < 620;
  const narrow = dim.w > 0 && dim.w < 1000;
  const tight = short && isBook;

  // §39 fix (peer-gate, R3c-i finding #1) — see CommandCenter.tsx for the full note.
  const [tab, setTab] = useSubtabRoute(isAgency ? "agency" : "sub_account", "calendar", "schedule");
  const [scope, setScope] = React.useState("agency");      // agencyView only
  const [tSub, setTSub] = React.useState(0);               // sub-picker index
  const [calView, setCalView] = React.useState("Month");   // cosmetic segment
  const [off, setOff] = React.useState({});                // layer off-map (false = off)
  const [sel, setSel] = React.useState(9);                 // selected day
  const [group, setGroup] = React.useState("calendars");   // settings group
  // pop-out state
  const [newOpen, setNewOpen] = React.useState(false);     // calNewOpen
  const [linkIdx, setLinkIdx] = React.useState(null);      // calLinkOpen
  const [listKey, setListKey] = React.useState(null);      // calListOpen
  const [railOpen, setRailOpen] = React.useState(false);   // calRailOpen

  // In agency aggregate view the scope segment is live; acting/standalone force it.
  const effScope = agencyView ? scope : "agency";
  const readOnly = agencyView && effScope === "sub";       // → sub picker

  // Data path branches ONLY on which book we're presenting (the design's `acting`).
  const EV = isBook ? CAL_SUB_EVENTS : CAL_EVENTS;
  const LK = isBook ? CAL_SUB_LINKS : CAL_LINKS;
  const RQ = isBook ? CAL_SUB_REQUESTS : CAL_REQUESTS;
  const SCH = isBook ? CAL_SUB_SCHEDULES : CAL_SCHEDULES;
  const on = k => off[k] !== false;
  const evOf = d => EV.filter(e => e.day === d && on(e.kind));
  const picked = TEAM_SUBS[tSub] || TEAM_SUBS[0];
  const slugBase = isBook ? "sarahcoaching.paige.link/" : "cookagency.paige.link/";

  const title = { schedule: "Schedule", links: "Booking links", avail: "Availability", requests: "Requests", settings: "Settings" }[tab];
  const sub = {
    schedule: isBook
      ? "Client sessions, deadlines and her runs on one grid — the whole month in one look."
      : "Meetings, deadlines and her runs on one grid — the whole month in one look.",
    links: "What people can book, how long it takes, and what she asks them first.",
    avail: "Named hours you attach to a link, rather than settings buried in each one.",
    requests: "Bookings waiting on a decision — new, moved, and the ones that keep slipping.",
    settings: "Build a calendar, decide when she may book, and take payment at the door."
  }[tab];
  const banner = "No calendar substrate exists yet — bookings, availability and connected calendars here are stand-ins, not real events.";
  const scopeNote = isBook
    ? "This business's own calendar — their meetings, their deadlines, their bookings."
    : effScope === "agency"
      ? "Your agency's calendar. Every sub-account keeps their own, and she books across both."
      : effScope === "book"
        ? "Across the book — who is meeting whom, and which deadlines land this month."
        : "You're observing " + picked.name + "'s calendar. Rescheduling goes to their owner as a proposal.";

  const dayEvents = evOf(sel).map(e => ({
    label: e.label, time: e.time, who: e.who, color: colourOf(e.kind), kind: labelOf(e.kind),
    editCta: e.kind === "deadlines" ? "Move this deadline" : e.kind === "meetings" ? "Open the meeting" : "See the run"
  }));
  const conflictNote = isBook
    ? "Two discovery calls, workshop prep and the proposal deadline all land on the 9th. She can move the second call to the 10th and still make the deadline."
    : "Two discovery calls and a renewal deadline all land on the 9th. She can move the second call to the 10th without touching the deadline.";

  const pool = (short
    ? (isBook ? [{ name: "Sarah Whitfield", role: "Owner", weight: "70%", load: "9 this week", next: true }]
      : [{ name: TEAM[6].name, role: "Sales", weight: "50%", load: "6 this week", next: true }])
    : isBook
      ? [{ name: "Sarah Whitfield", role: "Owner", weight: "70%", load: "9 this week", next: true },
      { name: "Renee Alvarez", role: "Coordinator", weight: "30%", load: "4 this week", next: false }]
      : [{ name: TEAM[6].name, role: "Sales", weight: "50%", load: "6 this week", next: true },
      { name: TEAM[0].name, role: "Client Success", weight: "30%", load: "4 this week", next: false },
      { name: TEAM[3].name, role: "Client Success", weight: "20%", load: "2 this week", next: false }]);
  const allPoolRules = [
    { label: "ASSIGNMENT", value: "Round robin, weighted" },
    { label: "TIE-BREAK", value: "Fewest bookings this week" },
    { label: "IF NOBODY IS FREE", value: "Offer the next open day" },
    { label: "COLLECTIVE EVENTS", value: "Everyone must be free" }
  ];
  const poolRules = short ? allPoolRules.slice(0, 1) : allPoolRules;
  const conn = (isBook
    ? [{ name: "Google · sarah@sarahcoaching.example", state: "Two-way", tone: GREEN, note: "Busy times block bookings" },
    { name: "Zoom", state: "Connected", tone: GREEN, note: "Links generated per session" },
    { name: "Microsoft 365", state: "Not connected", tone: AMBER, note: "Nothing to sync yet" }]
    : [{ name: "Google Workspace · agency", state: "Two-way · 6 seats", tone: GREEN, note: "Busy times block bookings" },
    { name: "Zoom", state: "Connected", tone: GREEN, note: "Links generated per meeting" },
    { name: "Microsoft 365", state: "One seat pending", tone: AMBER, note: "Tomas hasn't authorised yet" }]);
  const availRows = short
    ? [{ label: "TIMEZONE", value: "America/New_York" }, { label: "MINIMUM NOTICE", value: "4 hours" }, { label: "DAILY CAP", value: "5 bookings" }]
    : [{ label: "TIMEZONE", value: "America/New_York" }, { label: "MINIMUM NOTICE", value: "4 hours" }, { label: "DAILY CAP", value: "5 bookings" },
    { label: "BOOKING WINDOW", value: "60 days out" }, { label: "BUFFER DEFAULT", value: "10 minutes after" }, { label: "DATE OVERRIDES", value: "3 · Thanksgiving week closed" }];

  // Settings field grids (config-as-data in the design's DCLogic).
  const hoursRows = [
    { label: "WORKING HOURS", value: "Mon–Fri · 9:00am – 5:00pm" }, { label: "DO NOT DISTURB", value: "12:00 – 1:00pm daily, and after 5:00pm" },
    { label: "PROTECTED BLOCKS", value: "Mon and Fri mornings · deep work" }, { label: "MINIMUM NOTICE", value: "4 hours" },
    { label: "MAXIMUM PER DAY", value: "5 bookings" }, { label: "DATE OVERRIDES", value: "3 · Thanksgiving week closed" }
  ];
  const reminderRows = [
    { label: "BEFORE", value: "24 hours and 15 minutes before" }, { label: "MORNING NOTE", value: "7:00am, with her agenda attached" },
    { label: "AFTER", value: "30 minutes after · recap and next step" }, { label: "NO-SHOW", value: "Waits 8 minutes, then offers two new times" },
    { label: "CHANNEL", value: "Email, and SMS if they gave a number" }
  ];
  const paymentRows = [
    { label: "PROCESSOR", value: "Stripe · connected" }, { label: "WHEN", value: "At booking, before the slot is held" },
    { label: "DEFAULT FEE", value: isBook ? "$180 per session" : "Included in their plan" }, { label: "DEPOSITS", value: "50% on anything over $500" },
    { label: "REFUNDS", value: "Full up to 24 hours out, none after" }, { label: "TAX", value: "GA 8.9% applied at checkout" }
  ];
  const policyRows = [
    { label: "CANCELLATION", value: "Under 12 hours she offers two new times" }, { label: "RESCHEDULES", value: "Twice, then she asks you first" },
    { label: "GUESTS", value: "Up to 3 additional attendees" }, { label: "RECORDING", value: "On for reviews, off for discovery" },
    { label: "WHO SEES DETAILS", value: "The host and owners only" }
  ];
  const groupRows = group === "hours" ? hoursRows : group === "reminders" ? reminderRows : group === "payments" ? paymentRows : policyRows;
  const groupMore = short
    ? group === "calendars" ? "All " + CAL_CALENDARS.length + " calendars →"
      : group === "forms" ? "All " + CAL_FORMS.length + " forms →"
        : group === "roles" ? "All " + CAL_ROLES.length + " roles →" : null
    : null;

  // New-calendar builder fields + kinds.
  const newFields = [
    { label: "Name it", value: "", ph: "Discovery round robin" },
    { label: "Kind", value: "Round robin", caret: true },
    { label: "Seats per slot", value: "1 — one attendee", caret: true },
    { label: "Waitlist when full", value: "On", caret: true },
    { label: "Who is in the pool", value: "Pick from your team", caret: true },
    { label: "How turns are decided", value: "Weighted, then fewest bookings", caret: true },
    { label: "Hours it uses", value: "Agency working hours", caret: true },
    { label: "Colour on the grid", value: "#3F7F5C", swatch: true },
    { label: "Who can see the details", value: "The pool and owners", caret: true }
  ];
  const newKinds = [
    { name: "Personal", note: "One person's own bookings. Busy times block, details stay private." },
    { name: "Shared", note: "One calendar several people book into, everyone sees it." },
    { name: "Round robin", note: "She rotates whoever is up next, weighted if you want." },
    { name: "Collective", note: "Only offers times when everyone required is free." },
    { name: "Group or class", note: "One slot, many seats — she tracks the count and the waitlist." },
    { name: "Webinar", note: "One host, a registration cap, and the replay sent after." }
  ];

  // Link-detail model for the calLink modal.
  const link = linkIdx == null ? null : LK[linkIdx];
  const linkModel = !link ? null : {
    name: link.name, dur: link.dur, host: link.host, slug: slugBase + link.slug,
    rows: [
      { label: "DURATION", value: link.dur }, { label: "BUFFER", value: link.buffer }, { label: "WHO TAKES IT", value: link.host },
      { label: "AVAILABILITY", value: SCH[0].name },
      { label: "WHERE", value: /discovery|consult/i.test(link.name) ? "Zoom · link on confirm" : "Their choice — Zoom or phone" },
      { label: "PAYMENT", value: /consult|discovery/i.test(link.name) ? "Free" : isBook ? "$180 due at booking" : "Included in their plan" },
      { label: "REMINDERS", value: "24h and 1h before, plus a morning note" },
      { label: "IF THEY CANCEL", value: "Under 12 hours she offers two new times" }
    ],
    questions: isBook
      ? ["What made you look for a coach now?", "What would a good six months look like?", "Anything she should read before you meet?"]
      : ["What are you hoping she takes off your plate?", "How many clients do you carry today?", "Anything she should read first?"],
    confirmCopy: "You're booked. She'll send a short note the morning of, and the agenda the hour before.",
    slots: ["9:00am", "9:30am", "10:00am", "11:00am", "1:00pm", "1:30pm", "2:00pm", "3:30pm"],
    days: ["Mon 8", "Tue 9", "Wed 10", "Thu 11", "Fri 12"]
  };

  // Brand tokens for the link "what they see" preview (§6 continuity: the sub's own
  // mark when presenting a book, the agency mark otherwise). AA-nudged via AV().
  const brandName = isBook ? book.name : BRAND.agency.name;
  const brandInitials = isBook ? tmInit(book.name) : BRAND.agency.initials;
  const brandHex = isBook ? book.color : "#C8A02E";
  const brandAV = AV(brandHex);
  const brandRadius = isBook ? "9px" : BRAND.agency.radius;

  const cellH = tight ? 36 : short ? 40 : 58;
  const showRail = !narrow;
  const railCta = narrow && tab === "schedule";
  const cardBase = { border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)" };
  const eyebrow = { fontSize: 9.5, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)" };

  return <div ref={wrapRef} className="fade-in" style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: short ? 9 : 12 }}>
    {/* Tab strip (CAL_TABS) — the in-screen switcher for the five calendar surfaces. */}
    <SubTabs under cur={tab} set={setTab} tabs={CAL_TABS.map(t => [t.key, t.label, () => <span style={{ fontSize: 13 }}>{t.icon}</span>, t.badge])} />

    {/* Header: identity + scope segment (agency-only) + primary CTA. */}
    <div className="row" style={{ alignItems: "flex-start", gap: 12, flex: "none", flexWrap: "wrap" }}>
      <div style={{ minWidth: 0 }}>
        <div className="row" style={{ gap: 9, alignItems: "center" }}>
          <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".15em", color: "var(--ink-3)" }}>CALENDAR</span>
          <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>{title}</span>
          <span title={banner} style={{ width: 19, height: 19, borderRadius: 6, background: "var(--gold-tint)", border: "1px solid var(--gold-line)", color: "var(--gold)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, cursor: "help", flex: "none" }}>!</span>
        </div>
        <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 5 }}>{sub}</div>
      </div>
      <div className="row" style={{ marginLeft: "auto", gap: 9, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
        {/* §51 — scope segment is a cross-book switch: agency aggregate view only. */}
        {agencyView && <Segment items={[["agency", "Agency"], ["book", "Book"], ["sub", "Per sub-account"]]} value={scope} onChange={setScope} />}
        {railCta && <button onClick={() => setRailOpen(true)} style={{ padding: "8px 13px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, fontWeight: 600, color: "var(--gold)", cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>That day →</button>}
        <button onClick={() => tab === "settings" && setNewOpen(true)} style={{ padding: "8px 14px", borderRadius: 9, background: goldBg, color: GOLD_INK, fontSize: 12.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flex: "none", border: "none" }}>
          {tab === "settings" ? "+ New calendar" : readOnly ? "Propose a time" : "+ New booking link"}
        </button>
      </div>
    </div>

    <div className="trunc" style={{ fontSize: 11.5, color: "var(--ink-3)", flex: "none" }}>{scopeNote}</div>

    {/* §51 sub-picker — cross-book chip row, only in agency "Per sub-account" scope. */}
    {readOnly && <div className="row" style={{ gap: 7, flex: "none", overflowX: "auto", paddingBottom: 2 }}>
      {TEAM_SUBS.map((s, i) => <div key={s.name} onClick={() => setTSub(i)} className="row" style={{
        gap: 7, padding: "6px 11px", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap", flex: "none",
        border: "1px solid " + (tSub === i ? s.color + "66" : "var(--line)"), background: tSub === i ? s.color + "1A" : "var(--surface)",
        fontSize: 12, fontWeight: tSub === i ? 600 : 500
      }}>
        <span style={{ width: 7, height: 7, borderRadius: 2, background: s.color, flex: "none" }} />{s.name}
      </div>)}
    </div>}

    {/* ── SCHEDULE ────────────────────────────────────────────────────────── */}
    {tab === "schedule" && <>
      <div className="row" style={{ gap: 9, flex: "none", flexWrap: "wrap" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>September 2026</span>
        <Segment items={[["Month", "Month"], ["Week", "Week"], ["Day", "Day"]]} value={calView} onChange={setCalView} />
        <div className="row" style={{ marginLeft: "auto", gap: 6, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
          {CAL_LAYERS.map(l => <LayerChip key={l.key} l={l} on={on(l.key)} onToggle={() => setOff(o => ({ ...o, [l.key]: o[l.key] === false }))} />)}
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 13 }}>
        <MonthGrid evOf={evOf} sel={sel} setSel={setSel} short={short} tight={tight} cellH={cellH} />
        {showRail && <aside style={{ width: 288, flex: "none", minHeight: 0, display: "flex", flexDirection: "column", gap: 10, overflowY: "auto", overflowX: "hidden" }}>
          <div style={{ border: "1px solid var(--gold-line)", borderLeft: "3px solid var(--warn)", borderRadius: 12, background: "var(--gold-tint)", padding: "11px 13px", flex: "none" }}>
            <div style={{ fontSize: 11.5, lineHeight: 1.55, color: "var(--gold)" }}>{conflictNote}</div>
            <div style={{ display: "inline-flex", marginTop: 9, padding: "6px 11px", borderRadius: 8, background: goldBg, color: GOLD_INK, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>Move the second call</div>
          </div>
          <div style={{ ...cardBase, padding: "12px 14px", flex: "none" }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Tuesday 9 September</div>
            <DayEvents dayEvents={dayEvents} />
          </div>
        </aside>}
      </div>
    </>}

    {/* ── BOOKING LINKS ───────────────────────────────────────────────────── */}
    {tab === "links" && <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 9, paddingRight: 2 }}>
      {LK.map((l, i) => <div key={l.slug} onClick={() => setLinkIdx(i)} style={{ ...cardBase, padding: "12px 14px", cursor: "pointer", flex: "none", minWidth: 0 }}>
        <div className="row" style={{ gap: 9, minWidth: 0 }}>
          <span className="trunc" style={{ fontSize: 13.5, fontWeight: 600, minWidth: 0 }}>{l.name}</span>
          <span style={{ padding: "2px 9px", borderRadius: 20, background: l.live ? "var(--ok-tint)" : "var(--surface-sunk)", color: l.live ? "var(--ok)" : "var(--ink-2)", fontSize: 10, fontWeight: 600, flex: "none" }}>{l.live ? "Live" : "Paused"}</span>
          <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{l.booked} booked</span>
        </div>
        <div className="trunc" style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 5, lineHeight: 1.45, minWidth: 0 }}>{l.note}</div>
        <div className="row" style={{ gap: 10, marginTop: 6, flexWrap: "nowrap", overflow: "hidden" }}>
          <span style={{ fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{l.dur}</span>
          <span style={{ fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>buffer {l.buffer}</span>
          <span style={{ fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{l.host}</span>
          <span className="mono trunc" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--gold)", flex: "none", minWidth: 0 }}>{slugBase + l.slug}</span>
        </div>
      </div>)}
    </div>}

    {/* ── AVAILABILITY ────────────────────────────────────────────────────── */}
    {tab === "avail" && <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 10, paddingRight: 2 }}>
      <div style={{ ...cardBase, flex: "none" }}>
        <div style={{ padding: short ? "10px 15px 6px" : "12px 15px 8px", fontSize: 13.5, fontWeight: 600 }}>Named schedules</div>
        {(short ? SCH.slice(0, 1) : SCH).map(s => <div key={s.name} className="row" style={{ gap: 10, padding: "10px 15px", borderTop: "1px solid var(--line-soft)", minWidth: 0, cursor: "pointer" }}>
          <div style={{ minWidth: 0, flex: "1 1 auto" }}>
            <div className="row" style={{ gap: 8, minWidth: 0 }}>
              <span className="trunc" style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0 }}>{s.name}</span>
              {s.def && <span style={{ padding: "2px 8px", borderRadius: 20, background: "var(--violet-tint)", color: "var(--violet)", fontSize: 10, fontWeight: 600, flex: "none" }}>Default</span>}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 3 }}>{s.days} · {s.hours} · {s.tz}</div>
          </div>
          <span style={{ fontSize: 11, color: "var(--ink-2)", flex: "none" }}>{s.used + (s.used === 1 ? " link" : " links")}</span>
          <span style={{ color: "var(--ink-3)", fontSize: 11, flex: "none" }}>›</span>
        </div>)}
      </div>

      <div style={{ ...cardBase, padding: "13px 15px", flex: "none" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Who takes the booking</div>
        {!short && <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>Round-robin pools, collective invites, and how she breaks a tie.</div>}
        <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
          {pool.map((p, i) => <div key={p.name} className="row" style={{ gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--line-soft)" : "0", minWidth: 0 }}>
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: "var(--violet-tint)", color: "var(--violet)", display: "grid", placeItems: "center", fontSize: 9.5, fontWeight: 700, flex: "none" }}>{tmInit(p.name)}</span>
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <div className="row" style={{ gap: 7, minWidth: 0 }}>
                <span className="trunc" style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0 }}>{p.name}</span>
                {p.next && <span style={{ padding: "2px 8px", borderRadius: 20, background: "var(--ok-tint)", color: "var(--ok)", fontSize: 10, fontWeight: 600, flex: "none" }}>Up next</span>}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{p.role} · {p.load}</div>
            </div>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)", flex: "none" }}>{p.weight}</span>
          </div>)}
        </div>
        {!short && <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "7px 16px", marginTop: 9, paddingTop: 8, borderTop: "1px solid var(--line-soft)" }}>
          {poolRules.map(r => <div key={r.label} style={{ minWidth: 0 }}>
            <div style={eyebrow}>{r.label}</div>
            <div className="trunc" style={{ fontSize: 12, fontWeight: 600, marginTop: 3, minWidth: 0 }}>{r.value}</div>
          </div>)}
        </div>}
        {short && <div onClick={() => setRailOpen(true)} style={{ marginTop: 9, paddingTop: 8, borderTop: "1px solid var(--line-soft)", fontSize: 11.5, fontWeight: 600, color: "var(--gold)", cursor: "pointer" }}>Assignment rules and connected calendars →</div>}
      </div>

      {!short && <div style={{ ...cardBase, padding: "13px 15px", flex: "none" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>Rules that apply to every link</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: "11px 16px", marginTop: 10 }}>
          {availRows.map(r => <div key={r.label} style={{ minWidth: 0 }}>
            <div style={eyebrow}>{r.label}</div>
            <div className="trunc" style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3, minWidth: 0 }}>{r.value}</div>
          </div>)}
        </div>
      </div>}
    </div>}

    {/* ── REQUESTS ────────────────────────────────────────────────────────── */}
    {tab === "requests" && <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", display: "flex", flexDirection: "column", gap: 10, paddingRight: 2 }}>
      {RQ.map(r => <RequestCard key={r.who} r={r} />)}
    </div>}

    {/* ── SETTINGS ────────────────────────────────────────────────────────── */}
    {tab === "settings" && <>
      <div className="row" style={{ gap: 7, flex: "none", overflowX: "auto", paddingBottom: 1 }}>
        {CAL_SETTING_GROUPS.map(g => {
          const gOn = group === g.key;
          return <div key={g.key} onClick={() => setGroup(g.key)} className="row" style={{
            gap: 7, padding: "6px 12px", borderRadius: 20, cursor: "pointer", whiteSpace: "nowrap", flex: "none", fontSize: 11.5, fontWeight: 500,
            border: "1px solid " + (gOn ? "var(--ink)" : "var(--line)"), background: gOn ? "var(--ink)" : "var(--surface)", color: gOn ? "var(--ink-inv)" : "var(--ink-2)"
          }}>{g.label}<span className="mono" style={{ fontSize: 10, opacity: .7 }}>{g.count}</span></div>;
        })}
        {groupMore && <div onClick={() => setListKey(group)} style={{ marginLeft: "auto", padding: "6px 12px", borderRadius: 20, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 11.5, fontWeight: 600, color: "var(--gold)", cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>{groupMore}</div>}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 2 }}>
        {group === "calendars" && <div style={cardBase}>
          {(short ? CAL_CALENDARS.slice(0, 4) : CAL_CALENDARS).map(c => <div key={c.name} className="row" style={{ gap: 11, padding: "10px 14px", borderBottom: "1px solid var(--line-soft)", minWidth: 0, cursor: "pointer" }}>
            <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: c.color, flex: "none" }} />
            <div style={{ minWidth: 70, flex: "1 1 auto", overflow: "hidden" }}>
              <div className="row" style={{ gap: 8, minWidth: 0 }}>
                <span className="trunc" style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0 }}>{c.name}</span>
                {c.def && <span style={{ padding: "2px 8px", borderRadius: 20, background: "var(--violet-tint)", color: "var(--violet)", fontSize: 10, fontWeight: 600, flex: "none" }}>Default</span>}
              </div>
              <div className="trunc" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{c.note}</div>
            </div>
            <span style={{ padding: "2px 9px", borderRadius: 20, background: "var(--surface-sunk)", color: "var(--ink-2)", fontSize: 10, fontWeight: 600, flex: "none" }}>{c.kind}</span>
            <span style={{ fontSize: 11, color: "var(--ink-2)", flex: "none", whiteSpace: "nowrap" }}>{c.owner}</span>
            <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{c.links + (c.links === 1 ? " link" : " links")}</span>
          </div>)}
        </div>}

        {group === "forms" && <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {(short ? CAL_FORMS.slice(0, 2) : CAL_FORMS).map(fm => <div key={fm.name} style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", padding: "11px 14px", minWidth: 0, cursor: "pointer" }}>
            <div className="row" style={{ gap: 9, minWidth: 0 }}>
              <span className="trunc" style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0 }}>{fm.name}</span>
              <span style={{ padding: "2px 9px", borderRadius: 20, background: fm.live ? "var(--ok-tint)" : "var(--surface-sunk)", color: fm.live ? "var(--ok)" : "var(--ink-2)", fontSize: 10, fontWeight: 600, flex: "none" }}>{fm.live ? "Live" : "Draft"}</span>
              <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{fm.fields + " questions"}</span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 5, lineHeight: 1.45 }}>{fm.routes}</div>
            <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 3 }}>{fm.note}</div>
          </div>)}
        </div>}

        {group === "roles" && <div style={cardBase}>
          {(short ? CAL_ROLES.slice(0, 3) : CAL_ROLES).map(r => <div key={r.role} className="row" style={{ alignItems: "flex-start", gap: 11, padding: "10px 14px", borderBottom: "1px solid var(--line-soft)", minWidth: 0 }}>
            <div style={{ width: 96, flex: "none" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{r.role}</div>
              <div className="trunc" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{r.who}</div>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--ink-2)", lineHeight: 1.5, minWidth: 0 }}>{r.can}</div>
          </div>)}
        </div>}

        {(group === "hours" || group === "reminders" || group === "payments" || group === "policies") && <div style={{ ...cardBase, padding: "13px 15px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "12px 18px" }}>
            {groupRows.map(r => <FieldRow key={r.label} label={r.label} value={r.value} caret />)}
          </div>
        </div>}
      </div>
    </>}

    {/* ── POP-OUT: New calendar / booking-link builder (calNewOpen) ─────────── */}
    <SlideOut open={newOpen} onClose={() => setNewOpen(false)} title="What kind of calendar is this?" sub="NEW CALENDAR" icon={<Ic.cal size={15} />}
      foot={<>
        <button className="btn btn-s btn-p" onClick={() => setNewOpen(false)}><Ic.check size={12} />Create it</button>
        <button className="btn btn-s" onClick={() => setNewOpen(false)} style={{ color: "var(--ink-2)" }}>Cancel</button>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {newKinds.map(k => <div key={k.name} className="row" style={{ alignItems: "flex-start", gap: 10, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 11, background: "var(--surface)", cursor: "pointer", minWidth: 0 }}>
          <span style={{ width: 16, height: 16, borderRadius: "50%", border: "1px solid var(--line)", flex: "none", marginTop: 2 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{k.name}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 3, lineHeight: 1.45 }}>{k.note}</div>
          </div>
        </div>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 14 }}>
        {newFields.map(fd => <div key={fd.label} style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ink-2)" }}>{fd.label}</div>
          <FieldRow label="" value={fd.swatch ? fd.value : fd.value} caret={fd.caret} swatch={fd.swatch} ph={fd.ph} />
        </div>)}
      </div>
    </SlideOut>

    {/* ── POP-OUT: Booking-link detail (calLinkOpen) ───────────────────────── */}
    <Modal open={linkIdx != null} onClose={() => setLinkIdx(null)} wide pad="16px 20px"
      title={linkModel ? linkModel.name : ""}
      sub={linkModel ? <span className="mono" style={{ color: "var(--gold)", fontSize: 11 }}>{linkModel.slug}</span> : null}
      foot={<>
        <button className="btn btn-s btn-p" onClick={() => setLinkIdx(null)}><Ic.check size={12} />Save the link</button>
        <button className="btn btn-s">Copy the URL</button>
        <button className="btn btn-s" style={{ color: "var(--ink-2)" }}>Pause it</button>
      </>}>
      {linkModel && <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 300px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 11 }}>
            {linkModel.rows.map(r => <div key={r.label} style={{ border: "1px solid var(--line)", borderRadius: 11, background: "var(--surface-2)", padding: "10px 12px", minWidth: 0 }}>
              <div style={eyebrow}>{r.label}</div>
              <div className="trunc" style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4, minWidth: 0 }}>{r.value}</div>
            </div>)}
          </div>
          <div>
            <div style={eyebrow}>WHAT SHE ASKS THEM</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
              {linkModel.questions.map((q, i) => <div key={i} style={{ border: "1px solid var(--line)", borderRadius: 10, padding: "8px 11px", fontSize: 12, color: "var(--ink-2)", background: "var(--surface)" }}>{q}</div>)}
            </div>
          </div>
          <div style={{ border: "1px solid var(--violet-line)", borderRadius: 11, background: "var(--violet-tint)", padding: "11px 13px" }}>
            <div style={{ ...eyebrow, color: "var(--violet)" }}>AFTER THEY BOOK</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 6 }}>{linkModel.confirmCopy}</div>
          </div>
        </div>

        <div style={{ flex: "1 1 320px", minWidth: 0, border: "1px solid var(--line)", borderRadius: 14, background: "var(--surface-2)", overflow: "hidden" }}>
          <div style={{ padding: "12px 14px", borderBottom: "1px solid var(--line-soft)", background: "var(--surface)" }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".14em", color: "var(--ink-3)" }}>WHAT THEY SEE</div>
            <div className="row" style={{ gap: 10, marginTop: 8, minWidth: 0 }}>
              <div style={{ width: 34, height: 34, borderRadius: brandRadius, background: brandAV.plate, boxShadow: "inset 0 0 0 2px " + brandAV.ring, color: brandAV.ink, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, flex: "none" }}>{brandInitials}</div>
              <div style={{ minWidth: 0 }}>
                <div className="trunc" style={{ fontSize: 12, color: "var(--ink-2)", minWidth: 0 }}>{brandName}</div>
                <div className="trunc" style={{ fontSize: 14, fontWeight: 600, marginTop: 2, minWidth: 0 }}>{linkModel.name}</div>
                <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>{linkModel.dur} · {linkModel.host}</div>
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 10, padding: "12px 14px", alignItems: "flex-start", minWidth: 0 }}>
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <div style={eyebrow}>SEPTEMBER</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 7 }}>
                {linkModel.days.map(d => <div key={d} className="trunc" style={{ padding: "7px 10px", border: "1px solid var(--line)", borderRadius: 9, background: "var(--surface)", fontSize: 12, color: "var(--ink-2)", cursor: "pointer", minWidth: 0 }}>{d}</div>)}
              </div>
            </div>
            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
              <div style={eyebrow}>TUE 9</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 7 }}>
                {linkModel.slots.map(s => <div key={s} style={{ padding: "7px 10px", border: "1px solid var(--gold-line)", borderRadius: 9, background: "var(--gold-tint)", fontSize: 12, fontWeight: 600, color: "var(--gold)", textAlign: "center", cursor: "pointer" }}>{s}</div>)}
              </div>
            </div>
          </div>
        </div>
      </div>}
    </Modal>

    {/* ── POP-OUT: Full list of calendars / forms / roles (calListOpen) ─────── */}
    <Modal open={listKey != null} onClose={() => setListKey(null)} size={660}
      title={listKey === "forms" ? "Forms and routing" : listKey === "roles" ? "Who can do what" : "Calendars"}>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        {listKey === "calendars" && CAL_CALENDARS.map(c => <div key={c.name} className="row" style={{ gap: 11, border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", padding: "11px 13px", minWidth: 0 }}>
          <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: c.color, flex: "none" }} />
          <div style={{ minWidth: 70, flex: "1 1 auto", overflow: "hidden" }}>
            <div className="row" style={{ gap: 8, minWidth: 0 }}>
              <span className="trunc" style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{c.name}</span>
              {c.def && <span style={{ padding: "2px 8px", borderRadius: 20, background: "var(--violet-tint)", color: "var(--violet)", fontSize: 10, fontWeight: 600, flex: "none" }}>Default</span>}
            </div>
            <div style={{ fontSize: 11, color: "var(--ink-2)", marginTop: 3, lineHeight: 1.45 }}>{c.note}</div>
          </div>
          <span style={{ padding: "2px 9px", borderRadius: 20, background: "var(--surface-sunk)", color: "var(--ink-2)", fontSize: 10, fontWeight: 600, flex: "none" }}>{c.kind}</span>
          <span style={{ fontSize: 11, color: "var(--ink-2)", flex: "none", whiteSpace: "nowrap" }}>{c.owner}</span>
          <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{c.links + (c.links === 1 ? " link" : " links")}</span>
        </div>)}
        {listKey === "forms" && CAL_FORMS.map(fm => <div key={fm.name} style={{ border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", padding: "11px 13px", minWidth: 0 }}>
          <div className="row" style={{ gap: 9, minWidth: 0 }}>
            <span className="trunc" style={{ fontSize: 13, fontWeight: 600, minWidth: 0 }}>{fm.name}</span>
            <span style={{ padding: "2px 9px", borderRadius: 20, background: fm.live ? "var(--ok-tint)" : "var(--surface-sunk)", color: fm.live ? "var(--ok)" : "var(--ink-2)", fontSize: 10, fontWeight: 600, flex: "none" }}>{fm.live ? "Live" : "Draft"}</span>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{fm.fields + " questions"}</span>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 6, lineHeight: 1.5 }}>{fm.routes}</div>
          <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 3 }}>{fm.note}</div>
        </div>)}
        {listKey === "roles" && CAL_ROLES.map(r => <div key={r.role} className="row" style={{ alignItems: "flex-start", gap: 12, border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", padding: "11px 13px", minWidth: 0 }}>
          <div style={{ width: 104, flex: "none" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{r.role}</div>
            <div className="trunc" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{r.who}</div>
          </div>
          <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.55, minWidth: 0 }}>{r.can}</div>
        </div>)}
      </div>
    </Modal>

    {/* ── POP-OUT: Day rail (calRailOpen) — collapses the schedule aside ────── */}
    <Modal open={railOpen} onClose={() => setRailOpen(false)} size={620} title="Tuesday 9 September">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ border: "1px solid var(--gold-line)", borderLeft: "3px solid var(--warn)", borderRadius: 12, background: "var(--gold-tint)", padding: "12px 14px" }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--gold)" }}>{conflictNote}</div>
          <div style={{ display: "inline-flex", marginTop: 10, padding: "8px 14px", borderRadius: 9, background: goldBg, color: GOLD_INK, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Move the second call</div>
        </div>
        <div style={{ ...cardBase, padding: "13px 15px" }}>
          <div style={eyebrow}>ON THIS DAY</div>
          <DayEvents dayEvents={dayEvents} />
        </div>
        <div style={{ ...cardBase, padding: "13px 15px" }}>
          <div style={eyebrow}>ASSIGNMENT RULES</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: "10px 16px", marginTop: 9 }}>
            {allPoolRules.map(r => <div key={r.label} style={{ minWidth: 0 }}>
              <div style={{ ...eyebrow, fontSize: 9 }}>{r.label}</div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3 }}>{r.value}</div>
            </div>)}
          </div>
        </div>
        <div style={{ ...cardBase, padding: "13px 15px" }}>
          <div style={eyebrow}>Connected calendars</div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
            {conn.map((c, i) => <div key={c.name} className="row" style={{ gap: 10, padding: "8px 0", borderTop: i ? "1px solid var(--line-soft)" : "0", minWidth: 0 }}>
              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <div className="trunc" style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0 }}>{c.name}</div>
                <div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{c.note}</div>
              </div>
              <span style={{ padding: "2px 9px", borderRadius: 20, background: c.tone + "1A", color: c.tone, fontSize: 10, fontWeight: 600, flex: "none", whiteSpace: "nowrap" }}>{c.state}</span>
            </div>)}
          </div>
        </div>
      </div>
    </Modal>
  </div>;
};

export default CalendarHub;
