// @ts-nocheck
// Agency pack — the Trust Compass screen. Owner-locked port of the Claude Design
// "CRM agency mode" pack (§28/§63 — "We do not drift off this whatsoever"),
// mirroring src/solo/compass.tsx (the Solo precedent) for the Agency design.
//
// Source of truth: "Agency Shell.dc.html" — the `view === "compass"` body: an
// AUTONOMY CONSOLE with three tabs (Agency · Book · Per sub-account). The DCLogic
// runtime (startKnobDrag / seedMatrix / the tcVals block) is NOT ported — its
// markup, measurements, knob physics, copy, and interaction are mirrored onto
// React + the ./_shared primitives + ./fixtures data, and its literal light-hex
// is routed through the token layer so every LIGHT surface themes light↔dark (§23)
// under `.paige-agency`. The dark "console" panels keep their literal gradients —
// they are intentionally dark chrome in BOTH themes (the same call src/solo/compass
// makes for its radar canvas), not an un-themed surface.
//
// POP-OUTS this module owns (per the brief):
//   • Sub-account picker (subPickOpen) — the "Per sub-account" tab's ▾ dropdown of
//     the book. AGENCY-ONLY: it is a cross-book scope switcher, so §51 gates it to
//     agencyView (a single sub-account never sees a picker over other books).
//   • Confirm move-to-AUTO modal (confirmOpen) — the dark center dialog that guards
//     turning a SENSITIVE department (Finance / Legal) to AUTO on the Agency tab.
//   • Propose-to-owner panel (proposeOpen) — the right slide-in the agency uses to
//     propose an autonomy change to a sub-account's owner (they approve on their
//     side). §51 — a sub-account owns its own compass; the agency proposes, never
//     overrides.
// Responsive knob layout is derived from a ResizeObserver on the body (the design's
// mainW < 1120 → single-column row layout), so no shell prop is required.
//
// §51 INVARIANT — a sub-account is NEVER the parent aggregate. `agencyView` (true
// agency, not acting into a sub) gates every cross-book affordance: the Agency/Book/
// Per-sub TAB STRIP, the Book cross-sub matrix, the sub-account PICKER, and the
// book-wide roll-up copy. When the module is presenting a single book (a standalone
// sub-account, or the agency acting into one) it shows ONLY that book's own ten
// department tiers, OBSERVE-ONLY, with no picker and no other-sub data.
import React from "react";
import { Ic, useReducedMotion } from "./_shared";
import { DEPARTMENTS, SUBS, OWNERS, TIERS, TIER_META, AUDIT, PROPOSALS, SENT, seedMatrix, GREEN, AMBER, RED } from "./fixtures";

// Gold act-token (§11 — gold only on the approve/send moment). The design paints
// the primary CTA #C8A02E-family with #241C05 ink; we route the fill through the
// theme token and keep the design's dark ink for AA on gold.
const GOLD_INK = "#241C05";
const goldBg = "var(--gold-bright)";

// angleFor / pct — the design's knob physics, ported verbatim. off = −46°,
// confirm = 0°, auto = +46°; pct averages auto=1 / confirm=.5 / off=0.
const angleFor = tier => (TIERS.indexOf(tier) - 1) * 46;
const pct = tiers => Math.round((tiers.reduce((a, t) => a + (t === "auto" ? 1 : t === "confirm" ? 0.5 : 0), 0) / tiers.length) * 100);

// startKnobDrag — verbatim port of the design's pointer-drag (Agency Shell:8637).
// Turns the cap: maps the pointer angle to the nearest 46° detent and commits the
// final tier on release. `setDrag({dept,tier})` streams the live position; `commit`
// fires once, with the settled tier, only if it changed.
const startKnobDrag = (e, dept, current, commit, setDrag) => {
  const cap = e.currentTarget;
  const b = cap.getBoundingClientRect();
  const cx = b.left + b.width / 2, cy = b.top + b.height / 2;
  const span = 46;
  const base = (TIERS.indexOf(current) - 1) * span;
  const startAng = Math.atan2(e.clientY - cy, e.clientX - cx) * 180 / Math.PI;
  let live = current;
  const idxFor = deg => Math.max(0, Math.min(2, Math.round(deg / span) + 1));
  const move = ev => {
    const ang = Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
    let delta = ang - startAng;
    while (delta > 180) delta -= 360;
    while (delta < -180) delta += 360;
    const deg = Math.max(-span, Math.min(span, base + delta));
    const next = TIERS[idxFor(deg)];
    if (next !== live) { live = next; setDrag({ dept, tier: next }); }
  };
  const up = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    setDrag(null);
    if (live !== current) commit(live);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  e.preventDefault();
};

// ResizeObserver on the body → mainW, the design's responsive driver (mainW < 1120
// collapses the knob grid to single-column rows). Starts at 0 so the first paint
// shows the wide layout (the design's `w === 0` branch).
const useWidth = () => {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(es => { for (const e of es) setW(Math.round(e.contentRect.width)); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
};

// Layout token bundle derived from the body width (the design's mainW breakpoints).
const layoutFor = (w, knobWide) => {
  const narrow = w > 0 && w < 1120;
  return {
    narrow,
    cols: narrow ? "1fr" : "repeat(5,minmax(0,1fr))",
    dir: narrow ? "row" : "column",
    tileGap: narrow ? 11 : 6,
    gap: narrow ? 2 : 10,
    pad: narrow ? "1px 10px" : "9px 4px 7px",
    panelPad: narrow ? "12px 15px 11px" : "17px 19px 15px",
    headlineSize: narrow ? "15px" : "19px",
    knobSize: narrow ? "15px" : knobWide + "px",
    labelOrder: narrow ? 1 : 4,
    labelFlex: narrow ? "1 1 auto" : "none",
    labelAlign: narrow ? "left" : "center",
    labelSize: narrow ? "11.5px" : "10.5px",
    tierSize: narrow ? "9.5px" : "8.5px",
    showHint: !narrow
  };
};

// The honest §13 disclaimer the design ships in every compass aside — these tiers,
// the cross-tenant read, and the proposal flow have no confirmed backend route yet.
const TC_FLAG = "Per-department autonomy tiers, the cross-tenant read of your sub-accounts' settings, and the proposal flow have no confirmed backend route yet — positions and audit entries here are stand-ins, not platform figures.";

// ---------------------------------------------------------------------------
// Knob — the console dial. `live` = draggable + position-dot editable (Agency
// tab); observe = static with an optional propose ✎ (Per-sub / single-book).
// Faithful port of the design's two knob variants (bright metal / sunk dark).
// ---------------------------------------------------------------------------
const Knob = ({ dept, tier, live, dragging, onDown, onSet, onPropose, reduce, i, L }) => {
  const m = TIER_META[tier];
  const ring = m.glow + (live ? ".5)" : ".28)");
  const ringWide = m.glow + (live ? ".16)" : ".08)");
  const angle = "rotate(" + angleFor(tier) + "deg)";
  const spin = dragging ? "transform .08s linear" : "transform .42s cubic-bezier(.22,1.2,.32,1)";
  return (
    <div style={{
      display: "flex", flexDirection: L.dir, alignItems: "center", gap: L.tileGap, minWidth: 0, padding: L.pad,
      borderRadius: 11, border: "1px solid rgba(255,253,248," + (live ? ".05" : ".04") + ")",
      background: live ? "rgba(255,253,248,.02)" : "rgba(0,0,0,.22)",
      boxShadow: live ? "none" : "inset 0 2px 6px rgba(0,0,0,.4)"
    }}>
      <div onPointerDown={onDown} style={{
        position: "relative", width: "100%", maxWidth: L.knobSize, aspectRatio: "1", flex: "none",
        cursor: live ? (dragging ? "grabbing" : "grab") : "default", touchAction: "none", userSelect: "none"
      }}>
        {live && <div style={{ position: "absolute", inset: -7, borderRadius: "50%", background: "radial-gradient(circle," + ringWide + " 0%,rgba(0,0,0,0) 72%)", animation: reduce ? "none" : "tc-breathe " + (3.4 + (i % 5) * 0.35).toFixed(1) + "s ease-in-out infinite " + (i * 0.2).toFixed(1) + "s" }} />}
        <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: (live ? 2 : 1.5) + "px solid " + ring, boxShadow: live ? "0 0 12px " + ringWide : "none" }} />
        <div style={{
          position: "absolute", inset: live ? 6 : 5, borderRadius: "50%",
          background: live
            ? "conic-gradient(from 210deg,#8E8776 0deg,#EFE9DA 42deg,#9A9384 96deg,#CFC8B7 168deg,#7E786A 228deg,#E4DDCC 300deg,#8E8776 360deg)"
            : "conic-gradient(from 210deg,#6E6A5E,#B8B2A3 14%,#7A7568 30%,#A39D8E 50%,#63604F 68%,#ADA795 86%,#6E6A5E)",
          boxShadow: live ? "inset 0 1px 2px rgba(255,255,255,.55),inset 0 -2px 4px rgba(0,0,0,.45),0 3px 8px rgba(0,0,0,.5)" : "inset 0 -2px 4px rgba(0,0,0,.5)"
        }} />
        <div style={{ position: "absolute", inset: live ? 12 : 10, borderRadius: "50%", background: live ? "radial-gradient(circle at 34% 28%,#4A4437,#241F19 78%)" : "radial-gradient(circle at 34% 28%,#3E3930,#1E1B16)", boxShadow: live ? "inset 0 1px 3px rgba(0,0,0,.7)" : "none" }} />
        <div style={{ position: "absolute", inset: live ? 12 : 10, borderRadius: "50%", transform: angle, transition: live ? spin : "transform .4s cubic-bezier(.22,1.2,.32,1)" }}>
          <div style={{ position: "absolute", left: "50%", top: live ? 4 : 3, width: live ? 2.5 : 2, height: live ? 15 : 12, marginLeft: live ? -1.25 : -1, borderRadius: 2, background: m.color, boxShadow: live ? "0 0 8px " + ring : "none" }} />
        </div>
      </div>
      {live && (
        <div style={{ order: 2, display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
          {TIERS.map(tv => { const on = tv === tier; const tm = TIER_META[tv];
            return <span key={tv} onClick={() => onSet && onSet(tv)} title={tm.label} style={{ width: 7, height: 7, borderRadius: "50%", background: on ? tm.color : "rgba(255,253,248,.12)", border: "1px solid " + (on ? tm.color : "rgba(255,253,248,.22)"), cursor: "pointer", flex: "none" }} />; })}
        </div>
      )}
      <div style={{ order: 3, flex: "none", display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--mono)", fontSize: L.tierSize, letterSpacing: ".07em", color: m.color }}>
        {m.label}
        {onPropose && <span onClick={onPropose} title="Propose change" style={{ fontSize: 11, fontWeight: 600, color: "#D9C98A", cursor: "pointer" }}>✎</span>}
      </div>
      <div style={{ order: L.labelOrder, flex: L.labelFlex, minWidth: 0, fontSize: L.labelSize, color: "rgba(255,253,248,.82)", textAlign: L.labelAlign, lineHeight: 1.25, fontWeight: 500 }}>{dept.split(" / ")[0]}</div>
    </div>
  );
};

// Paige's-read violet card (design #F9F8FE/#DFDAF7/#3A3184 → tokens). `onAsk`
// wires the Ask-Paige CTA up to the shell launcher.
const ReadCard = ({ title, body, onAsk, inline }) => (
  <div style={{ border: "1px solid var(--violet-line)", borderRadius: 13, background: "var(--violet-tint)", padding: "15px 16px", flex: "none" }}>
    <div className="row" style={{ gap: 9 }}>
      <span style={{ color: "var(--violet)", fontSize: 13 }}>✦</span>
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--violet)" }}>{title}</div>
      {inline && <div onClick={onAsk} style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "var(--violet)", cursor: "pointer", flex: "none" }}>Ask Paige</div>}
    </div>
    <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 9 }}>{body}</div>
    {!inline && <div onClick={onAsk} className="row" style={{ display: "inline-flex", gap: 7, marginTop: 12, padding: "8px 14px", borderRadius: 9, border: "1px solid var(--violet-line)", background: "var(--surface)", fontSize: 12.5, fontWeight: 600, color: "var(--violet)", cursor: "pointer" }}>Ask Paige</div>}
  </div>
);

// Tier-meanings aside card (OFF / CONFIRM / AUTO legend), token-driven.
const TierMeanings = () => (
  <div style={{ border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)", padding: "15px 16px", flex: "1 1 auto", minHeight: 116, display: "flex", flexDirection: "column" }}>
    <div style={{ fontSize: 14.5, fontWeight: 600, flex: "none" }}>Tier meanings</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 11, overflowY: "auto", minHeight: 0 }}>
      {[["OFF", "var(--bad)", "She briefs you and stops. Nothing acts."],
        ["CONFIRM", "var(--warn)", "She drafts; you approve each one."],
        ["AUTO", "var(--ok)", "She runs it inside your guardrails."]].map(([k, c, d]) => (
        <div key={k} className="row" style={{ alignItems: "flex-start", gap: 10 }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: c, flex: "none", marginTop: 4 }} />
          <div><div style={{ fontSize: 12.5, fontWeight: 600 }}>{k}</div><div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 2 }}>{d}</div></div>
        </div>
      ))}
    </div>
  </div>
);

// Change-log card (Agency: "Recent changes"; observe: "Their change history").
const AuditCard = ({ title, rows, open, onToggle }) => (
  <div style={{ border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)", padding: "14px 16px", flex: open ? "1 1 auto" : "none", minHeight: open ? 124 : 0, display: "flex", flexDirection: "column" }}>
    <div className="row" style={{ gap: 10, flex: "none" }}>
      <div style={{ fontSize: 14.5, fontWeight: 600 }}>{title}</div>
      <div onClick={onToggle} style={{ marginLeft: "auto", fontSize: 12, fontWeight: 600, color: "var(--gold-line)", cursor: "pointer", flex: "none" }}>{open ? "Hide" : "Show"}</div>
    </div>
    {open && (
      <div style={{ display: "flex", flexDirection: "column", marginTop: 6, overflowY: "auto", minHeight: 0 }}>
        {rows.map((a, i) => (
          <div key={i} className="row" style={{ alignItems: "flex-start", gap: 11, padding: "9px 0", borderBottom: "1px solid var(--line-soft)" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: TIER_META[a.to].color, flex: "none", marginTop: 5 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 600 }}>{a.what} · {TIER_META[a.from].label} → {TIER_META[a.to].label}</div>
              <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.4 }}>{a.who ? a.who + " · " : ""}{a.why}</div>
            </div>
            <span className="mono" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{a.when}</span>
          </div>
        ))}
      </div>
    )}
  </div>
);

// ---------------------------------------------------------------------------
// Confirm move-to-AUTO modal (confirmOpen) — dark center dialog guarding a
// sensitive department flip. Faithful to the design's dark-gradient card; Escape
// + scrim-click dismiss, reduced-motion drops the enter.
// ---------------------------------------------------------------------------
const ConfirmModal = ({ dept, onYes, onNo, reduce }) => {
  React.useEffect(() => { const k = e => { if (e.key === "Escape") onNo(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onNo]);
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onNo(); }} style={{ position: "fixed", inset: 0, background: "rgba(20,17,28,.5)", backdropFilter: "blur(3px)", display: "grid", placeItems: "center", zIndex: 120, padding: 32, animation: reduce ? "none" : "tc-fade .16s ease both" }}>
      <div role="dialog" aria-modal="true" style={{ width: "min(460px,100%)", border: "1px solid #2E2838", borderRadius: 16, background: "linear-gradient(168deg,#221E2E,#141220)", boxShadow: "0 40px 90px rgba(10,8,18,.5)", padding: "24px 26px", animation: reduce ? "none" : "tc-cardin .22s cubic-bezier(.22,.8,.3,1) both" }}>
        <div className="row" style={{ gap: 11 }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#2F7A57", boxShadow: "0 0 12px rgba(63,150,104,.7)", flex: "none" }} />
          <div style={{ fontSize: 17, fontWeight: 700, color: "#FFFDF8" }}>Turn {dept} to AUTO?</div>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "rgba(255,253,248,.72)", marginTop: 12 }}>
          Moving {dept} to AUTO means she acts without waiting for you — inside the guardrails you set. You can turn it back any time.
        </div>
        <div className="row" style={{ gap: 10, marginTop: 20 }}>
          <div onClick={onYes} style={{ padding: "10px 18px", borderRadius: 9, background: goldBg, color: GOLD_INK, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Turn it to AUTO</div>
          <div onClick={onNo} style={{ padding: "10px 16px", borderRadius: 9, border: "1px solid rgba(255,253,248,.18)", color: "rgba(255,253,248,.75)", fontSize: 13, cursor: "pointer" }}>Leave it</div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Propose-to-owner panel (proposeOpen) — right slide-in the agency uses to draft
// an autonomy change for a sub-account's OWNER to approve (§51 — she proposes,
// the owner decides). Light surface, token-driven; Escape + scrim dismiss.
// ---------------------------------------------------------------------------
const ProposePanel = ({ dept, from, ownerName, subName, onClose, reduce }) => {
  React.useEffect(() => { const k = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
  const to = from === "off" ? "confirm" : "auto";
  const first = (ownerName || subName || "").split(" ")[0];
  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(23,19,49,.4)", backdropFilter: "blur(3px)", display: "flex", justifyContent: "flex-end", zIndex: 120, animation: reduce ? "none" : "tc-fade .16s ease both" }}>
      <div role="dialog" aria-modal="true" style={{ width: "min(468px,100%)", height: "100%", background: "var(--surface)", borderLeft: "1px solid var(--line)", boxShadow: "var(--sh-3)", display: "flex", flexDirection: "column", padding: "22px 24px", gap: 14, overflowY: "auto" }}>
        <div className="row" style={{ alignItems: "flex-start", gap: 12 }}>
          <div>
            <div className="eyebrow" style={{ fontSize: 10 }}>Proposal</div>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.01em", marginTop: 5 }}>Propose to {ownerName || subName}</div>
          </div>
          <button onClick={onClose} className="btn btn-s" style={{ marginLeft: "auto", width: 28, height: 28, padding: 0, justifyContent: "center", borderRadius: "50%", flex: "none" }}><Ic.x size={13} /></button>
        </div>
        <div style={{ padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 11, background: "var(--surface-2)", fontSize: 13.5, fontWeight: 600 }}>Turn {dept} from {TIER_META[from].label} to {TIER_META[to].label}</div>
        <div style={{ padding: "15px 16px", border: "1px solid var(--violet-line)", borderRadius: 12, background: "var(--violet-tint)" }}>
          <div className="row" style={{ gap: 9 }}>
            <span style={{ color: "var(--violet)", fontSize: 12 }}>✦</span>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--violet)" }}>Her draft rationale</div>
          </div>
          <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--ink-2)", marginTop: 9 }}>
            {first} — your {dept} autonomy is set to {TIER_META[from].label}. Three items have been sitting over a week. On CONFIRM, Paige drafts each one in your voice and you approve with one tap. Nothing sends without your OK. Want to try it for 30 days?
          </div>
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>They approve it on their side. Nothing changes on their compass until they do.</div>
        <div className="row" style={{ gap: 10, marginTop: "auto", paddingTop: 14, borderTop: "1px solid var(--line-soft)" }}>
          <div onClick={onClose} style={{ padding: "11px 18px", borderRadius: 10, background: goldBg, color: GOLD_INK, fontSize: 13.5, fontWeight: 600, cursor: "pointer" }}>Send proposal</div>
          <div style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13.5, cursor: "pointer" }}>Edit first</div>
          <div onClick={onClose} style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 13.5, color: "var(--ink-2)", cursor: "pointer" }}>Cancel</div>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// AgencyPanel — the "Agency" tab: the agency's OWN ten departments as LIVE
// (draggable + click-to-set) knobs, plus the change-log card. Turning a sensitive
// department (Finance / Legal) to AUTO routes through ConfirmModal.
// ---------------------------------------------------------------------------
const AgencyPanel = ({ tiers, setTiers, onConfirm, onAsk, drag, setDrag, reduce, L, auditOpen, setAuditOpen }) => {
  const list = DEPARTMENTS.map(d => tiers[d.name]);
  const setAgency = (dept, tv) => {
    const sensitive = dept === "Finance" || dept === "Legal / Compliance";
    if (sensitive && tv === "auto" && tiers[dept] !== "auto") { onConfirm(dept); return; }
    setTiers({ ...tiers, [dept]: tv });
  };
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 14 }}>
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 11, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 2 }}>
        <div style={{ position: "relative", borderRadius: 15, overflow: "hidden", background: "linear-gradient(168deg,#221E2E 0%,#171420 58%,#100E17 100%)", border: "1px solid #2E2838", padding: L.panelPad, flex: "none" }}>
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(255,253,248,.05),rgba(255,253,248,0) 34%)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: "34%", background: "linear-gradient(180deg,rgba(200,160,46,.07),rgba(200,160,46,0))", animation: reduce ? "none" : "tc-scan 6.5s linear infinite", pointerEvents: "none" }} />
          <div style={{ position: "relative", display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: L.headlineSize, fontWeight: 700, color: "#FFFDF8", letterSpacing: "-0.01em" }}>{pct(list)}% autopilot across ten departments</div>
            <div className="mono" style={{ fontSize: 11.5, color: "rgba(255,253,248,.5)" }}>{list.filter(t => t === "auto").length} on AUTO · {list.filter(t => t === "confirm").length} on CONFIRM · {list.filter(t => t === "off").length} on OFF</div>
            {L.showHint && <div style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,253,248,.42)", flex: "none" }}>Drag a cap to turn it, or click a position</div>}
          </div>
          <div style={{ position: "relative", display: "grid", gridTemplateColumns: L.cols, gap: L.gap, marginTop: 12 }}>
            {DEPARTMENTS.map((d, i) => {
              const dragging = drag && drag.dept === d.name;
              const tier = dragging ? drag.tier : tiers[d.name];
              return <Knob key={d.name} dept={d.name} tier={tier} live dragging={!!dragging} i={i} L={L} reduce={reduce}
                onDown={e => startKnobDrag(e, d.name, tiers[d.name], tv => setAgency(d.name, tv), setDrag)}
                onSet={tv => setAgency(d.name, tv)} />;
            })}
          </div>
        </div>
        <AuditCard title="Recent changes" rows={AUDIT} open={auditOpen} onToggle={() => setAuditOpen(v => !v)} />
      </div>
      <aside style={{ width: 296, flex: "0 1 296px", minWidth: 0, display: "flex", flexDirection: "column", gap: 11, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 2 }}>
        <div style={{ border: "1px solid var(--gold-line)", borderRadius: 11, background: "var(--gold-tint)", padding: "10px 12px", fontSize: 11.5, lineHeight: 1.45, color: "var(--gold-line)", flex: "none" }}>{TC_FLAG}</div>
        <ReadCard title="Paige's read on your autonomy" onAsk={onAsk}
          body="You have Sales at OFF. Your team is at 94% capacity and follow-ups are slipping past a week. She can draft them in your voice and hold each one for your approval — CONFIRM is the smaller first step." />
        <TierMeanings />
      </aside>
    </div>
  );
};

// ---------------------------------------------------------------------------
// BookPanel — the "Book" tab (AGENCY-ONLY, §51): the cross-sub × department
// autonomy MATRIX, plus book-wide proposals. A single sub-account never reaches
// this tab.
// ---------------------------------------------------------------------------
const BookPanel = ({ matrix, onCell, onAsk }) => {
  const rows = SUBS.map((s, i) => ({ name: s.name, owner: OWNERS[i] || "", color: s.color, pctv: pct(matrix[i]), cells: matrix[i] }));
  const avg = Math.round(rows.reduce((a, r) => a + r.pctv, 0) / rows.length);
  const sorted = rows.map((r, i) => ({ i, v: r.pctv })).sort((a, b) => a.v - b.v);
  const csIdx = DEPARTMENTS.findIndex(d => d.name === "Client Success");
  const csAuto = matrix.filter(row => row[csIdx] === "auto").length;
  const bookRead = (() => {
    const salesIdx = DEPARTMENTS.findIndex(d => d.name === "Sales");
    const salesOff = matrix.filter(r => r[salesIdx] === "off").length;
    const noAuto = matrix.filter(r => r.every(t => t !== "auto")).length;
    const high = rows.filter(r => r.pctv >= 85).length;
    const acct = n => n === 1 ? "one sub-account" : n + " sub-accounts";
    const parts = [];
    parts.push(salesOff === 0 ? "Every sub-account has Sales turned on." : (salesOff === 1 ? "One sub-account has" : salesOff + " sub-accounts have") + " Sales at OFF.");
    if (noAuto > 0) parts.push(acct(noAuto).replace(/^one/, "One") + (noAuto === 1 ? " hasn't" : " haven't") + " turned on a single AUTO department.");
    parts.push(high === 0 ? "None are running at 85% or better across the board." : (high === 1 ? "One is running" : high + " are running") + " at 85% or better across the board.");
    return parts.join(" ");
  })();
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 14 }}>
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 11, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 2 }}>
        <div style={{ flex: "none" }}>
          <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em" }}>Book autonomy: {avg}% average</div>
          <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 4 }}>Range: {sorted[0].v}% ({rows[sorted[0].i].name}) to {sorted[sorted.length - 1].v}% ({rows[sorted[sorted.length - 1].i].name}) · Most delegated: Client Success ({csAuto} of {SUBS.length} on AUTO)</div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", borderRadius: 15, background: "linear-gradient(168deg,#221E2E,#100E17)", border: "1px solid #2E2838", padding: "13px 15px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "150px repeat(10,minmax(30px,1fr))", gap: 5, alignItems: "center" }}>
            <div />
            {DEPARTMENTS.map(d => (
              <div key={d.name} title={d.name} className="mono" style={{ fontSize: 8.5, color: "rgba(255,253,248,.45)", textAlign: "center", letterSpacing: ".04em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name.split(" / ")[0].split(" ")[0]}</div>
            ))}
            {rows.map((r, ri) => (
              <div key={ri} style={{ display: "contents" }}>
                <div className="row" style={{ gap: 8, minWidth: 0, paddingRight: 6 }}>
                  <span style={{ width: 3, height: 22, borderRadius: 2, background: r.color, flex: "none" }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 11.5, color: "#FFFDF8", fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
                    <div className="mono" style={{ fontSize: 9.5, color: "rgba(255,253,248,.4)" }}>{r.owner} · {r.pctv}%</div>
                  </div>
                </div>
                {r.cells.map((tv, ci) => {
                  const m = TIER_META[tv];
                  return (
                    <div key={ci} onClick={() => onCell(ri, DEPARTMENTS[ci].name)} title={r.name + " · " + DEPARTMENTS[ci].name + " · " + m.label} style={{ position: "relative", width: 26, height: 26, margin: "0 auto", cursor: "pointer" }}>
                      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid " + m.glow + ".42)", boxShadow: "0 0 7px " + m.glow + ".42)" }} />
                      <div style={{ position: "absolute", inset: 3.5, borderRadius: "50%", background: "conic-gradient(from 210deg,#8E8776,#EFE9DA 12%,#9A9384 28%,#CFC8B7 48%,#7E786A 66%,#E4DDCC 84%,#8E8776)", boxShadow: "inset 0 -1px 2px rgba(0,0,0,.5)" }} />
                      <div style={{ position: "absolute", inset: 6.5, borderRadius: "50%", background: "radial-gradient(circle at 34% 28%,#4A4437,#241F19)" }} />
                      <div style={{ position: "absolute", inset: 6.5, borderRadius: "50%", transform: "rotate(" + angleFor(tv) + "deg)", transition: "transform .4s cubic-bezier(.22,1.2,.32,1)" }}>
                        <div style={{ position: "absolute", left: "50%", top: 1, width: 1.8, height: 6, marginLeft: -0.9, borderRadius: 2, background: m.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
        <ReadCard inline title="Paige's read on your book's autonomy" body={bookRead} onAsk={onAsk} />
      </div>
      <aside style={{ width: 296, flex: "0 1 296px", minWidth: 0, display: "flex", flexDirection: "column", gap: 11, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 2 }}>
        <div style={{ border: "1px solid var(--gold-line)", borderRadius: 11, background: "var(--gold-tint)", padding: "10px 12px", fontSize: 11.5, lineHeight: 1.45, color: "var(--gold-line)", flex: "none" }}>{TC_FLAG}</div>
        <div style={{ border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)", padding: "15px 16px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, flex: "none" }}>Book-wide proposals from Paige</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 5, lineHeight: 1.45, flex: "none" }}>She drafted these from the patterns above. You approve the send; the owner approves the change.</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 12, overflowY: "auto", minHeight: 0 }}>
            {PROPOSALS.map((p, i) => (
              <div key={i} style={{ border: "1px solid var(--line-soft)", borderRadius: 11, background: "var(--surface-2)", padding: "12px 13px" }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.4 }}>{p.title}</div>
                <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 6 }}>{p.scope} · {p.est}</div>
                <div className="row" style={{ flexWrap: "wrap", gap: 7, marginTop: 10 }}>
                  <div style={{ padding: "7px 13px", borderRadius: 8, background: goldBg, color: GOLD_INK, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Approve to send</div>
                  <div style={{ padding: "7px 11px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 11.5, cursor: "pointer" }}>Read draft</div>
                  <div style={{ padding: "7px 11px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 11.5, color: "var(--ink-2)", cursor: "pointer" }}>Dismiss</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SubPanel — a SINGLE book's own ten department tiers, OBSERVE-ONLY. Serves both
// the agency's "Per sub-account" tab (with a picker + propose flow) and the §51
// single-book view (a standalone sub-account, or the agency acting into one).
// `showPicker` is AGENCY-ONLY; `canPropose` = the agency observing a book it does
// not own (Per-sub tab, or acting into a sub) — never a sub proposing to itself.
// ---------------------------------------------------------------------------
const SubPanel = ({ idx, tiers, showPicker, pickOpen, setPickOpen, onPick, matrix, canPropose, onPropose, onAsk, reduce, L, auditOpen, setAuditOpen, notice, subhead }) => {
  const book = SUBS[idx];
  const owner = OWNERS[idx] || "";
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 14 }}>
      <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", gap: 11, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 2 }}>
        {showPicker && (
          <div style={{ position: "relative", flex: "none" }}>
            <div onClick={() => setPickOpen(v => !v)} className="row" style={{ gap: 11, padding: "11px 14px", border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", cursor: "pointer" }}>
              {L.showHint && <span className="eyebrow" style={{ fontSize: 10, flex: "none" }}>Viewing</span>}
              <span style={{ width: 3, height: 18, borderRadius: 2, background: book.color, flex: "none" }} />
              <span style={{ fontSize: 13.5, fontWeight: 600, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{book.name}</span>
              <span style={{ fontSize: 12, color: "var(--ink-3)", whiteSpace: "nowrap", flex: "none" }}>{owner}</span>
              <span style={{ marginLeft: "auto", color: "var(--ink-3)", fontSize: 11, flex: "none" }}>▾</span>
            </div>
            {pickOpen && (
              <div className="fade-in" style={{ position: "absolute", left: 0, right: 0, top: 52, zIndex: 40, maxHeight: 280, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", boxShadow: "var(--sh-3)", padding: 6 }}>
                {SUBS.map((s, i) => (
                  <div key={i} onClick={() => onPick(i)} className="row" style={{ gap: 10, padding: "9px 11px", borderRadius: 9, cursor: "pointer", background: i === idx ? "var(--surface-sunk)" : "transparent" }}>
                    <span style={{ width: 3, height: 18, borderRadius: 2, background: s.color, flex: "none" }} />
                    <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-3)", flex: "none" }}>{OWNERS[i] || ""}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-2)", flex: "none" }}>{pct(matrix[i])}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div style={{ position: "relative", borderRadius: 15, overflow: "hidden", background: "linear-gradient(168deg,#1C1A24 0%,#141219 60%,#0E0D13 100%)", border: "1px solid #2A2732", padding: L.panelPad, flex: "none" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: L.headlineSize, fontWeight: 700, color: "#FFFDF8", letterSpacing: "-0.01em" }}>{pct(tiers)}% autopilot · {book.name}</div>
            <span style={{ padding: "3px 10px", borderRadius: 20, background: "rgba(255,253,248,.08)", color: "rgba(255,253,248,.7)", fontSize: 10.5, fontWeight: 600, letterSpacing: ".06em" }}>OBSERVING</span>
          </div>
          <div title={notice} style={{ fontSize: 11.5, color: "rgba(255,253,248,.5)", marginTop: 6, lineHeight: 1.5, maxWidth: 640 }}>{notice}</div>
          <div style={{ display: "grid", gridTemplateColumns: L.cols, gap: L.gap, marginTop: 12 }}>
            {DEPARTMENTS.map((d, i) => (
              <Knob key={d.name} dept={d.name} tier={tiers[i] || "confirm"} live={false} i={i} L={L} reduce={reduce}
                onPropose={canPropose ? () => onPropose(d.name, tiers[i] || "confirm") : null} />
            ))}
          </div>
        </div>

        <AuditCard title={canPropose ? "Their change history" : "Recent changes"} rows={AUDIT.slice(0, 4)} open={auditOpen} onToggle={() => setAuditOpen(v => !v)} />
      </div>

      <aside style={{ width: 296, flex: "0 1 296px", minWidth: 0, display: "flex", flexDirection: "column", gap: 11, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingRight: 2 }}>
        <div style={{ border: "1px solid var(--gold-line)", borderRadius: 11, background: "var(--gold-tint)", padding: "10px 12px", fontSize: 11.5, lineHeight: 1.45, color: "var(--gold-line)", flex: "none" }}>{TC_FLAG}</div>
        {canPropose && (
          <div style={{ border: "1px solid var(--line)", borderRadius: 13, background: "var(--surface)", padding: "15px 16px", flex: "none" }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>Recent proposals from you</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 11 }}>
              {SENT.map((s, i) => {
                const c = s.status === "Accepted" ? GREEN : s.status === "Declined" ? RED : AMBER;
                const bg = s.status === "Accepted" ? "var(--ok-tint)" : s.status === "Declined" ? "var(--bad-tint)" : "var(--warn-tint)";
                return (
                  <div key={i} className="row" style={{ gap: 10 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</div>
                      <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 3 }}>{s.when}</div>
                    </div>
                    <span style={{ marginLeft: "auto", padding: "3px 9px", borderRadius: 20, background: bg, color: c, fontSize: 10.5, fontWeight: 600, flex: "none" }}>{s.status}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <ReadCard title={canPropose ? "Paige's read on this sub-account" : "Paige's read on your autonomy"} onAsk={onAsk}
          body={canPropose
            ? (book.health >= 85
              ? book.name + " keeps Legal tight and runs green nearly everywhere else. That's a healthy posture for their book."
              : book.name + " has never accepted a proposal you've sent. Worth a personal check-in before the next one.")
            : subhead} />
        <TierMeanings />
      </aside>
    </div>
  );
};

// ---------------------------------------------------------------------------
// TrustCompass — the shell hosts this as the `compass` screen body and passes
// { isAgency, acting, openAsk }. `agencyView` = true agency aggregate (not acting
// into a sub); it gates every §51 cross-book affordance (the tab strip, the Book
// matrix, the sub-account picker). A single book (standalone sub-account, or the
// agency acting into one) renders ONE observe-only panel of its own tiers.
// ---------------------------------------------------------------------------
const TrustCompass = ({ isAgency = true, acting = null, openAsk = () => {} }) => {
  const agencyView = !!isAgency && !acting;
  const reduce = useReducedMotion();
  const [bodyRef, w] = useWidth();

  const [tab, setTab] = React.useState("agency");                 // agencyView tab strip
  const [tiers, setTiers] = React.useState(() => { const o = {}; DEPARTMENTS.forEach(d => { o[d.name] = d.tier; }); return o; });
  const matrix = React.useMemo(() => seedMatrix(), []);
  const [selIdx, setSelIdx] = React.useState(0);
  const [subPickOpen, setSubPickOpen] = React.useState(false);    // pop-out: sub-account picker (§51 agency-only)
  const [confirmDept, setConfirmDept] = React.useState(null);     // pop-out: confirm move-to-AUTO
  const [propose, setPropose] = React.useState(null);             // pop-out: propose-to-owner { dept, from }
  const [drag, setDrag] = React.useState(null);                   // live knob drag stream
  const [auditOpen, setAuditOpen] = React.useState(true);

  // The single book presented in §51 single-book mode: the acted-into sub, else
  // the standalone sub-account's own book (mirrors AgencyApp's `own = SUBS[0]`).
  const singleIdx = React.useMemo(() => {
    if (acting) { const i = SUBS.findIndex(s => s.name === acting.name); return i < 0 ? 0 : i; }
    return 0;
  }, [acting]);

  const L = layoutFor(w, agencyView && tab === "agency" ? 62 : 52);

  const tcTabs = [["agency", "Agency"], ["book", "Book"], ["sub", "Per sub-account"]];

  return (
    <div ref={bodyRef} className="fade-in" style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, padding: "20px 24px 22px", overflow: "hidden" }}>
      <div className="row" style={{ alignItems: "flex-end", gap: 14, flexWrap: "wrap", flex: "none", marginBottom: 12 }}>
        <div>
          <div className="eyebrow" style={{ fontSize: 10 }}>Autonomy console</div>
          <div style={{ fontSize: 23, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>Trust Compass</div>
        </div>
        {/* §51 — the Agency / Book / Per-sub tab strip is a cross-book scope switch: agency-only. */}
        {agencyView && (
          <div className="row" style={{ marginLeft: "auto", gap: 7, flex: "none" }}>
            {tcTabs.map(([k, label]) => {
              const on = tab === k;
              return <div key={k} onClick={() => setTab(k)} style={{ padding: "8px 15px", borderRadius: 9, border: "1px solid " + (on ? "var(--ink)" : "var(--line)"), background: on ? "var(--ink)" : "var(--surface)", color: on ? "var(--ink-inv)" : "var(--ink-2)", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{label}</div>;
            })}
          </div>
        )}
      </div>

      {agencyView && tab === "agency" && (
        <AgencyPanel tiers={tiers} setTiers={setTiers} onConfirm={setConfirmDept} onAsk={openAsk}
          drag={drag} setDrag={setDrag} reduce={reduce} L={L} auditOpen={auditOpen} setAuditOpen={setAuditOpen} />
      )}
      {agencyView && tab === "book" && (
        <BookPanel matrix={matrix} onAsk={openAsk} onCell={(ri, dept) => { setSelIdx(ri); setTab("sub"); }} />
      )}
      {agencyView && tab === "sub" && (
        <SubPanel idx={selIdx} tiers={matrix[selIdx] || []} showPicker pickOpen={subPickOpen} setPickOpen={setSubPickOpen}
          onPick={i => { setSelIdx(i); setSubPickOpen(false); }} matrix={matrix} canPropose
          onPropose={(dept, from) => setPropose({ dept, from })} onAsk={openAsk} reduce={reduce} L={L}
          auditOpen={auditOpen} setAuditOpen={setAuditOpen}
          notice={"You're observing " + (OWNERS[selIdx] || "the owner") + "'s settings. They own this compass — you can propose changes and they approve. You can't turn their knobs."} />
      )}

      {/* §51 single-book — a standalone sub-account, or the agency acting into one: ONLY its own tiers, observe-only, no picker, no parent aggregate. */}
      {!agencyView && (
        <SubPanel idx={singleIdx} tiers={matrix[singleIdx] || []} showPicker={false} pickOpen={false} setPickOpen={() => {}}
          onPick={() => {}} matrix={matrix} canPropose={!!acting}
          onPropose={(dept, from) => setPropose({ dept, from })} onAsk={openAsk} reduce={reduce} L={L}
          auditOpen={auditOpen} setAuditOpen={setAuditOpen}
          notice={acting
            ? "You're observing " + (OWNERS[singleIdx] || "the owner") + "'s settings. They own this compass — you can propose changes and they approve. You can't turn their knobs."
            : "Your ten departments and the autonomy you've set for each. Ask Paige to move a tier and she'll walk you through it."}
          subhead="Your book runs green nearly everywhere. Sales is the one still on OFF — the smaller first step is CONFIRM, where she drafts and you approve." />
      )}

      {/* Pop-outs (§ this module owns all its own overlay state). */}
      {confirmDept && (
        <ConfirmModal dept={confirmDept} reduce={reduce}
          onYes={() => { setTiers(t => ({ ...t, [confirmDept]: "auto" })); setConfirmDept(null); }}
          onNo={() => setConfirmDept(null)} />
      )}
      {propose && (
        <ProposePanel dept={propose.dept} from={propose.from}
          ownerName={agencyView ? OWNERS[selIdx] : OWNERS[singleIdx]}
          subName={agencyView ? SUBS[selIdx].name : SUBS[singleIdx].name}
          reduce={reduce} onClose={() => setPropose(null)} />
      )}

      <style>{"@keyframes tc-breathe{0%,100%{opacity:.5}50%{opacity:1}}@keyframes tc-scan{0%{transform:translateY(-40%)}100%{transform:translateY(320%)}}@keyframes tc-fade{from{opacity:0}to{opacity:1}}@keyframes tc-cardin{from{opacity:0;transform:translateY(8px) scale(.985)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){[style*=\"tc-breathe\"],[style*=\"tc-scan\"]{animation:none !important}}"}</style>
    </div>
  );
};

export default TrustCompass;
