// @ts-nocheck
// Agency pack — the Growth screen. Owner-locked port of the Claude Design "CRM
// agency mode" pack (§28/§63 — "We do not drift off this whatsoever"), mirroring
// src/solo/growth2.tsx (the Solo Growth precedent) for the Agency design's Growth
// surface.
//
// Source of truth: "Agency Shell.dc.html" isGrowth block + growthVals — a 7-tab
// strip (Overview · Brand Kit · Social · Pages · Funnels · Forms · Builders), a
// header (eyebrow / title / lede) with the Agency ↔ Book ↔ Per-sub-account SCOPE
// SEGMENT + honesty flag, the per-sub-account PICKER pop-out (gPickOpen), and each
// tab's body. The "✦ Vibe Studio" button (and every Builders card) opens the
// full-screen Studio (./vibe) via local studioOpen state. The DCLogic runtime is
// NOT ported — its markup, measurements and copy are mirrored onto React + the
// ./_shared primitives.
//
// §51 INVARIANT — a sub-account is NEVER the parent aggregate. `crossBook`
// (isAgency && !acting) gates the WHOLE cross-book surface: the scope segment, the
// Book aggregate table, the Per-sub picker, the observe/act-as affordances. When a
// standalone sub-account is in view (isAgency===false) OR the agency is acting-as a
// sub (acting set), this screen shows ONLY that one book's own Growth — no scope
// segment, no picker, no aggregate. The Studio it opens is scoped to that same book.
import React from "react";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { Ic, SubTabs, ScopeSeg, useReducedMotion } from "./_shared";
import {
  GROWTH_TABS, CAMPAIGNS, BRAND_TOKENS, SOCIAL_POSTS, PAGES_LIST, FUNNELS_LIST,
  FORMS_LIST, BUILDERS_LIST, SUBS, OWNERS, AGENCY,
} from "./fixtures";
import VibeStudio from "./vibe";

const noop = () => {};

// Growth-tab → ./_shared Ic mapping (mirrors the Solo Growth precedent's icon
// vocabulary; the design's own glyphs are decorative and re-expressed here).
const TAB_ICON = {
  overview: () => <Ic.bolt size={14} />, brand: () => <Ic.spark size={14} />,
  social: () => <Ic.users size={14} />, pages: () => <Ic.grid size={14} />,
  funnels: () => <Ic.trend size={14} />, forms: () => <Ic.doc size={14} />,
  builders: () => <Ic.store size={14} />,
};
const LEDE = {
  overview: "Live campaigns, pages, funnels, forms, and the builders you already pay for — every one reporting into pipeline and her workflows.",
  brand: "The tokens, marks and voice she writes and designs with.",
  social: "What's going out, what landed, and what's worth doing again.",
  pages: "Everything published, with what each page is actually converting.",
  funnels: "Where people enter, where they fall out, and what she'd fix first.",
  forms: "Every form and what it's bringing in.",
  builders: "The tools you already pay for, one click from the Studio.",
};
const G_FLAG = "No cross-book growth query is confirmed, and the Studio has no confirmed context handoff — figures and the acting-as brand load are layout only.";
const campStatePill = s => s === "Live" ? "pill-ok" : s === "Draft" ? "pill-v" : "pill-n";

// ── Overview ──────────────────────────────────────────────────────────────────
// Book scope → the cross-book aggregate table (§51: agency-only). Every other scope
// (agency-self, per-sub observe, standalone-sub own) → the single-workspace KPIs +
// campaign table.
const Overview = ({ book, perSub, sel, factor, openAsk }) => {
  const base = [["LIVE FUNNELS", 3], ["LIVE PAGES", 7], ["LIVE FORMS", 5], ["SUBMISSIONS (7D)", 184]];
  const kpis = base.map(([label, n]) => ({ label: book ? label + " · BOOK" : label, value: String(Math.max(1, Math.round(n * factor))) }));
  const gRead = book
    ? "Three sub-accounts are running the same offer with wildly different pages — the two converting at 6% are using her page copy, the third isn't. She's drafted the swap."
    : perSub
      ? SUBS[sel].name + " has one funnel doing all the work and two pages nobody visits. The fix is a redirect, and she's written it."
      : "The Teardown series carries almost all attributed revenue. The Meta ad fills the calendar with people who convert at 21% — pausing it and moving that spend into referral credits is the drafted recommendation.";
  const readCta = book ? "Explore in Ask Paige" : "Read it";

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="g4">{kpis.map((k, i) => (
        <div key={i} className="card" style={{ padding: "11px 13px", minWidth: 0 }}>
          <div className="row" style={{ gap: 8 }}>
            <div className="eyebrow trunc" style={{ fontSize: 9 }}>{k.label}</div>
            {!book && <span className="tile" style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: 6, background: "var(--violet-tint)", color: "var(--violet)", flex: "none" }}><Ic.bolt size={10} /></span>}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.02em", marginTop: 6 }}>{k.value}</div>
        </div>
      ))}</div>

      {book ? (
        <div className="card tbl"><div style={{ minWidth: 720 }}>
          <div className="row" style={{ padding: "9px 14px", borderBottom: "1px solid var(--line-soft)", fontSize: 9, fontWeight: 600, letterSpacing: ".11em", color: "var(--ink-3)" }}>
            <span style={{ flex: "1.6 1 0", minWidth: 0 }}>SUB-ACCOUNT</span>
            {["CAMPS", "PAGES", "FUNNELS", "FORMS", "SUBS 7D", "TREND"].map(h => <span key={h} style={{ flex: "0.6 1 0", textAlign: "right" }}>{h}</span>)}
          </div>
          {SUBS.map((s, i) => {
            const down = i % 3 === 2;
            return (
              <div key={s.name} className="row" style={{ padding: "9px 14px", borderBottom: i < SUBS.length - 1 ? "1px solid var(--line-soft)" : 0, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = "var(--surface-2)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span className="row" style={{ flex: "1.6 1 0", minWidth: 0, gap: 8 }}>
                  <span style={{ width: 3, height: 18, borderRadius: 2, background: s.color, flex: "none" }} />
                  <span className="trunc" style={{ fontSize: 12, fontWeight: 500 }}>{s.name}</span>
                </span>
                <span className="mono" style={{ flex: "0.6 1 0", textAlign: "right", fontSize: 11.5 }}>{1 + (i % 4)}</span>
                <span className="mono" style={{ flex: "0.6 1 0", textAlign: "right", fontSize: 11.5 }}>{2 + (i % 6)}</span>
                <span className="mono" style={{ flex: "0.6 1 0", textAlign: "right", fontSize: 11.5 }}>{1 + (i % 3)}</span>
                <span className="mono" style={{ flex: "0.6 1 0", textAlign: "right", fontSize: 11.5 }}>{2 + (i % 5)}</span>
                <span className="mono" style={{ flex: "0.6 1 0", textAlign: "right", fontSize: 11.5 }}>{18 + i * 7}</span>
                <span className="mono" style={{ flex: "0.6 1 0", textAlign: "right", fontSize: 11.5, color: down ? "var(--bad)" : "var(--ok)" }}>{(down ? "−" : "+") + (4 + (i % 9)) + "%"}</span>
              </div>
            );
          })}
        </div></div>
      ) : (
        <div className="card"><div className="tbl"><div style={{ minWidth: 640 }}>
          <div className="hd"><div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 14 }}>{perSub ? SUBS[sel].name + "'s campaigns" : "Active campaigns"}</h3>
            <div className="sub">{perSub ? "Observing. Propose a change or act as them to run it." : "Every campaign running for this workspace, live"}</div>
          </div>
            <div className="row" style={{ gap: 7 }}>
              {perSub && <button className="btn btn-s">Act as {SUBS[sel].name.split(" ")[0]}</button>}
              <button className="btn btn-s btn-p"><Ic.plus size={13} />{perSub ? "Propose a campaign to " + (OWNERS[sel] || "owner").split(" ")[0] : "New campaign"}</button>
            </div></div>
          <div className="row" style={{ padding: "8px 15px", background: "var(--surface-2)", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", fontSize: 9, fontWeight: 600, letterSpacing: ".11em", color: "var(--ink-3)" }}>
            <span style={{ flex: "1.9 1 0", minWidth: 0 }}>CAMPAIGN</span>
            {["REACHED", "OPEN", "REPLIES", "ATTRIBUTED", "STATE"].map(h => <span key={h} style={{ flex: "0.7 1 0", textAlign: "right" }}>{h}</span>)}
          </div>
          {CAMPAIGNS.map((c, i) => (
            <div key={c.name} className="row" style={{ padding: "10px 15px", borderBottom: i < CAMPAIGNS.length - 1 ? "1px solid var(--line-soft)" : 0 }}>
              <span style={{ flex: "1.9 1 0", minWidth: 0 }}><span className="trunc" style={{ fontSize: 12.5, fontWeight: 600, display: "block" }}>{c.name}</span><span className="sub">{c.ch}</span></span>
              <span className="mono" style={{ flex: "0.7 1 0", textAlign: "right", fontSize: 11.5 }}>{c.reached}</span>
              <span className="mono" style={{ flex: "0.7 1 0", textAlign: "right", fontSize: 11.5 }}>{c.open}</span>
              <span className="mono" style={{ flex: "0.7 1 0", textAlign: "right", fontSize: 11.5, color: "var(--ok)", fontWeight: 600 }}>{c.replies}</span>
              <span className="mono" style={{ flex: "0.7 1 0", textAlign: "right", fontSize: 11.5 }}>{c.attr}</span>
              <span style={{ flex: "0.7 1 0", textAlign: "right" }}><span className={"pill " + campStatePill(c.state)}>{c.state}</span></span>
            </div>
          ))}
        </div></div></div>
      )}

      <div className="row" style={{ gap: 9, padding: "10px 13px", border: "1px solid var(--violet-line)", borderRadius: "var(--r-m)", background: "var(--violet-tint)" }}>
        <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--violet)", flex: "none" }}>Paige:</span>
        <span style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.45, minWidth: 0 }}>{gRead}</span>
        <button onClick={openAsk} className="btn btn-s" style={{ marginLeft: "auto", flex: "none" }}>{readCta}</button>
      </div>
    </div>
  );
};

// ── Brand Kit (book disabled — each sub owns their brand, §51/gDef.book=false) ──
const BrandKit = ({ isAgency, perSub, sel }) => {
  const ownerLine = !isAgency
    ? "Your brand · used for anything you make"
    : perSub ? SUBS[sel].name + "'s brand · view only" : "Your agency's brand · used for anything you make at agency scope";
  const voice = perSub ? "Warm, plain, quick to the point. Never salesy." : "Direct, warm, competent. Name the number. Never \"partner with you on your journey\".";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(250px,100%),1fr))", gap: 11, alignContent: "start" }}>
      <div className="card" style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Colour</div>
        <div className="sub" style={{ marginTop: 3 }}>{ownerLine}</div>
        <div className="row" style={{ gap: 9, marginTop: 12, flexWrap: "wrap" }}>{BRAND_TOKENS.map(t => (
          <div key={t.label} style={{ textAlign: "center" }}>
            <div style={{ width: 46, height: 46, borderRadius: 11, background: t.value, border: "1px solid var(--line)" }} />
            <div style={{ fontSize: 10.5, fontWeight: 600, marginTop: 5 }}>{t.label}</div>
            <div className="mono sub" style={{ fontSize: 9.5 }}>{t.value}</div>
          </div>
        ))}</div>
      </div>
      <div className="card" style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Marks</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 11 }}>{["Primary mark", "Stacked", "Glyph only"].map(m => (
          <div key={m} className="row" style={{ gap: 10, padding: "9px 11px", border: "1px solid var(--line-soft)", borderRadius: 10, background: "var(--surface-2)" }}>
            <span className="tile" style={{ width: 22, height: 22, borderRadius: 7, background: "var(--rail)", color: "var(--gold-bright)", flex: "none" }}><Ic.spark size={11} /></span>
            <span style={{ fontSize: 12 }}>{m}</span>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--gold)", cursor: "pointer", flex: "none" }}>Download</span>
          </div>
        ))}</div>
      </div>
      <div className="card" style={{ padding: "14px 16px" }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Type &amp; voice</div>
        <div style={{ fontSize: 12, color: "var(--ink-2)", marginTop: 9 }}>Söhne for headings · IBM Plex Mono for figures</div>
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--line-soft)" }}>{voice}</div>
        {perSub && <button className="btn btn-s btn-p" style={{ marginTop: 12 }}>Propose a brand change</button>}
      </div>
    </div>
  );
};

// ── Social · Pages · Forms (flat lists — scope-invariant per the design) ────────
const Social = () => (
  <div className="card" style={{ overflow: "hidden" }}>{SOCIAL_POSTS.map((p, i) => (
    <div key={i} className="row" style={{ gap: 12, padding: "12px 15px", borderBottom: i < SOCIAL_POSTS.length - 1 ? "1px solid var(--line-soft)" : 0, alignItems: "flex-start" }}>
      <span className="pill pill-n" style={{ flex: "none" }}>{p.where}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{p.text}</div>
        <div className="mono sub" style={{ fontSize: 10.5, marginTop: 5 }}>{p.reach} reached · {p.eng} engaged · {p.when}</div>
      </div>
    </div>
  ))}</div>
);

const Pages = () => (
  <div className="card" style={{ overflow: "hidden" }}>{PAGES_LIST.map((p, i) => (
    <div key={p.name} className="row" style={{ gap: 12, padding: "12px 15px", borderBottom: i < PAGES_LIST.length - 1 ? "1px solid var(--line-soft)" : 0 }}>
      <span className="grow trunc" style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0 }}>{p.name}</span>
      <span className="mono" style={{ flex: "none", width: 60, textAlign: "right", fontSize: 11.5, color: "var(--ink-2)" }}>{p.views}</span>
      <span className="mono" style={{ flex: "none", width: 52, textAlign: "right", fontSize: 11.5, color: "var(--ok)" }}>{p.conv}</span>
      <span className={"pill " + (p.state === "Live" ? "pill-ok" : "pill-v")} style={{ flex: "none" }}>{p.state}</span>
    </div>
  ))}</div>
);

const Funnels = () => {
  const reduce = useReducedMotion();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{FUNNELS_LIST.map(fn => (
      <div key={fn.name} className="card" style={{ padding: "12px 15px" }}>
        <div className="row" style={{ alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{fn.name}</div>
          <div className="sub">{fn.steps} steps</div>
          <div className="mono" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-2)", flex: "none" }}>{fn.entered} in · {fn.finished} out · {fn.rate}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 9 }}>
          {Array.from({ length: fn.steps }, (_, k) => (
            <div key={k} style={{ height: 9, borderRadius: 5, width: (100 - k * (60 / fn.steps)).toFixed(0) + "%",
              background: "var(--gold-tint)",
              backgroundImage: reduce ? "none" : "repeating-linear-gradient(115deg,rgba(255,255,255,.45) 0 8px,rgba(255,255,255,0) 8px 24px)",
              backgroundSize: "48px 100%", animation: reduce ? "none" : "riverDrift " + (6 - k * 0.4).toFixed(1) + "s linear infinite" }} />
          ))}
        </div>
      </div>
    ))}</div>
  );
};

const Forms = () => (
  <div className="card" style={{ overflow: "hidden" }}>{FORMS_LIST.map((fm, i) => (
    <div key={fm.name} className="row" style={{ gap: 12, padding: "12px 15px", borderBottom: i < FORMS_LIST.length - 1 ? "1px solid var(--line-soft)" : 0 }}>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="trunc" style={{ fontSize: 12.5, fontWeight: 600 }}>{fm.name}</div>
        <div className="sub trunc" style={{ fontSize: 10.5, marginTop: 2 }}>on {fm.where}</div>
      </div>
      <span className="mono" style={{ flex: "none", width: 52, textAlign: "right", fontSize: 11.5 }}>{fm.subs}</span>
      <span className="mono" style={{ flex: "none", width: 48, textAlign: "right", fontSize: 11.5, color: "var(--ok)" }}>{fm.rate}</span>
    </div>
  ))}</div>
);

// ── Builders (book disabled — per-workspace tools, §51/gDef.book=false) ─────────
const Builders = ({ observing, openStudio }) => (
  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(196px,100%),1fr))", gap: 10, alignContent: "start" }}>
    {BUILDERS_LIST.map(b => (
      <button key={b.name} onClick={openStudio} className="card" style={{ padding: "13px 14px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 6, textAlign: "left", border: "1px solid var(--line)" }}>
        <span className="tile" style={{ width: 26, height: 26, borderRadius: 8, background: "var(--rail)", color: "var(--gold-bright)", flex: "none" }}><Ic.store size={13} /></span>
        <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 3 }}>{b.name}</div>
        <div className="sub" style={{ fontSize: 11, lineHeight: 1.4 }}>{b.note}</div>
        <div className="row" style={{ gap: 8, marginTop: "auto", paddingTop: 8 }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-3)" }}>{b.used}</span>
          <span style={{ marginLeft: "auto", fontSize: 11, fontWeight: 600, color: "var(--gold)", flex: "none" }}>{observing ? "Act as to open" : "Open in Studio"}</span>
        </div>
      </button>
    ))}
  </div>
);

// ── GrowthHub (root screen) ────────────────────────────────────────────────────
const GrowthHub = ({ isAgency = true, acting = null, openAsk = noop }) => {
  useReducedMotion(); // keep the pack's motion-preference subscription warm on this surface
  const crossBook = isAgency && !acting; // §51 — cross-book UI lives ONLY here

  const [tab, setTab] = useSubtabRoute("agency", "growth", "overview");
  const [scopeRaw, setScopeRaw] = React.useState("agency");
  const [sel, setSel] = React.useState(0);
  const [pickOpen, setPickOpen] = React.useState(false);
  const [studioOpen, setStudioOpen] = React.useState(false);

  const gDef = GROWTH_TABS.find(t => t.key === tab) || GROWTH_TABS[0];
  // Scope only exists in cross-book view; it also degrades book→agency where the tab
  // has no book aggregate (Brand Kit / Builders). Non-cross-book is always self.
  const scope = !crossBook ? "self" : (scopeRaw === "book" && !gDef.book) ? "agency" : scopeRaw;
  const book = scope === "book";
  const perSub = scope === "sub";
  const factor = book ? 9 : perSub ? 0.5 : 1;

  const tabs = GROWTH_TABS.map(t => [t.key, t.label, TAB_ICON[t.key]]);

  // Studio creating-for context (§51 — resolved here, handed to the Studio).
  const studioCtx = perSub
    ? { context: "Creating for: " + SUBS[sel].name + " (you're acting as them)", color: SUBS[sel].color, acting: true, voice: "Drafted in " + SUBS[sel].name + "'s voice, not yours." }
    : acting
      ? { context: "Creating for: " + acting.name + " (you're acting as them)", color: acting.color, acting: true, voice: "Drafted in " + acting.name + "'s voice, not yours." }
      : isAgency
        ? { context: "Creating for: " + AGENCY.operator + " Agency", color: "var(--gold-bright)", acting: false, voice: "" }
        : { context: "Creating for: " + SUBS[0].name, color: SUBS[0].color, acting: false, voice: "" };

  // Scope segment (agency-only): Agency · Book (per gDef.book) · Per sub-account.
  const segs = [
    { key: "agency", label: "Agency", ok: true },
    { key: "book", label: "Book", ok: gDef.book, why: gDef.bookWhy || "" },
    { key: "sub", label: "Per sub-account", ok: gDef.sub, why: "" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0, alignItems: "stretch" }}>
      <SubTabs tabs={tabs} cur={tab} set={setTab}
        right={<>
          <button className="btn btn-s"><Ic.clock size={13} />Last 7 days</button>
          <button onClick={() => setStudioOpen(true)} className="btn btn-s btn-p"><Ic.spark size={13} />Vibe Studio</button>
        </>} />

      <div key={tab} className="fade-in" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 12, padding: "16px 26px 22px", width: "100%", maxWidth: 1440, margin: "0 auto" }}>
        {/* Header: eyebrow / title / lede + scope segment (agency-only) + honesty flag. */}
        <div className="row" style={{ alignItems: "flex-start", gap: 14, flexWrap: "wrap", flex: "none" }}>
          <div style={{ minWidth: 0, flex: "1 1 320px" }}>
            <div className="row" style={{ alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span className="eyebrow" style={{ fontSize: 10 }}>GROWTH &amp; ACQUISITION</span>
              <span style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.01em" }}>{gDef.label}</span>
            </div>
            <div className="sub" style={{ marginTop: 4, lineHeight: 1.45 }}>{LEDE[tab]}</div>
          </div>
          {crossBook && (
            <div className="row" style={{ gap: 6, flex: "none", alignItems: "center" }}>
              <ScopeSeg segs={segs} value={scope} onChange={k => { setScopeRaw(k); setPickOpen(false); }} />
              <span title={G_FLAG} style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", color: "var(--gold)", display: "grid", placeItems: "center", fontSize: 11, cursor: "help", flex: "none" }}>!</span>
            </div>
          )}
        </div>

        {/* Per-sub-account picker (agency, sub scope) → gPickOpen. */}
        {crossBook && perSub && (
          <div style={{ position: "relative", flex: "none" }}>
            <button onClick={() => setPickOpen(v => !v)} className="row" style={{ width: "100%", gap: 10, padding: "9px 13px", border: "1px solid var(--line)", borderRadius: 11, background: "var(--surface)", cursor: "pointer" }}>
              <span style={{ width: 3, height: 18, borderRadius: 2, background: SUBS[sel].color, flex: "none" }} />
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{SUBS[sel].name}</span>
              <span className="sub" style={{ fontSize: 11.5 }}>{OWNERS[sel] || ""}</span>
              <span className="trunc" style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", minWidth: 0 }}>Observing {OWNERS[sel] || "the owner"}'s growth. Nothing here is yours to edit — propose it, or act as them.</span>
              <span style={{ color: "var(--ink-3)", fontSize: 9, flex: "none" }}>▾</span>
            </button>
            {pickOpen && (<>
              <div onClick={() => setPickOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div className="fade-in" style={{ position: "absolute", left: 0, right: 0, top: 48, zIndex: 41, maxHeight: 250, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 12, background: "var(--surface)", boxShadow: "var(--sh-3)", padding: 6 }}>
                {SUBS.map((s, i) => (
                  <button key={s.name} onClick={() => { setSel(i); setPickOpen(false); }} className="row" style={{ width: "100%", gap: 10, padding: "8px 11px", borderRadius: 9, cursor: "pointer", border: "none", textAlign: "left", background: i === sel ? "var(--surface-sunk)" : "transparent" }}
                    onMouseEnter={e => { if (i !== sel) e.currentTarget.style.background = "var(--surface-2)"; }} onMouseLeave={e => { if (i !== sel) e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ width: 3, height: 16, borderRadius: 2, background: s.color, flex: "none" }} />
                    <span className="trunc" style={{ fontSize: 12.5, minWidth: 0 }}>{s.name}</span>
                    <span className="sub" style={{ marginLeft: "auto", fontSize: 11, flex: "none" }}>{OWNERS[i] || ""}</span>
                  </button>
                ))}
              </div>
            </>)}
          </div>
        )}

        {/* Tab body. */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
          {tab === "overview" && <Overview book={book} perSub={perSub} sel={sel} factor={factor} openAsk={openAsk} />}
          {tab === "brand" && <BrandKit isAgency={isAgency} perSub={perSub} sel={sel} />}
          {tab === "social" && <Social />}
          {tab === "pages" && <Pages />}
          {tab === "funnels" && <Funnels />}
          {tab === "forms" && <Forms />}
          {tab === "builders" && <Builders observing={perSub} openStudio={() => setStudioOpen(true)} />}
        </div>
      </div>

      {/* Vibe Studio full-screen composer (studioOpen) — ESC or Back closes it. */}
      {studioOpen && (
        <VibeStudio onBack={() => setStudioOpen(false)}
          studioContext={studioCtx.context} studioContextColor={studioCtx.color}
          studioActing={studioCtx.acting} voiceNote={studioCtx.voice} />
      )}
    </div>
  );
};

export default GrowthHub;
