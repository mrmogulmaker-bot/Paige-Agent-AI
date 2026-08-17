// @ts-nocheck
// Agency pack — Team (TEAM nav) screen. Faithful port of the Claude Design "CRM
// agency mode" pack Team view (owner-locked handoff 2026-08-17, §28/§30/§31/§63 —
// "we do not drift off this whatsoever"), mirroring the Solo team precedent
// (src/solo/team.tsx + team-dir.tsx + team-roles.tsx) and the sibling agency
// modules (CommandCenter / TeamBlock / automations).
//
// Source of truth: "Agency Shell.dc.html" —
//   • the isTeamNav render block          → lines 3323–4182 (header eyebrow/title/
//     banner "!" + capacity pill + agency↔book↔sub ScopeSeg + "Her read" rail-cta +
//     Invite CTA + scopeNote + per-sub picker + center column + rail aside).
//   • the teamData view-builder            → lines 9522–9593 (tab/scope resolution,
//     TEAM_VIEW consumption, tmCenter trim/openAll, tmRail, banners, capacity copy).
//   • the two team pop-outs                → lines 6012–6041 (tmListOpen block-detail
//     modal + tmRailOpen "her read" modal).
//   • sub-tab strip                        → line 12674 (TEAM_TABS → the six tabs).
//
// This module is the FIRST consumer of the already-ported TeamBlock.tsx
// (default TeamBlock({block,gold,ask}) + TEAM_VIEW render-logic). It REUSES both —
// it does NOT re-implement team logic (§18 one home). All row/seat/roster/roledef/
// capacity/feed shaping stays inside TEAM_VIEW / TeamBlock; this file is the shell
// chrome (header, tabs, scope seg, picker, layout, pop-outs) around them.
//
// DCLogic→React notes (§13 honesty):
//  • The design drives compact/short off st.mainW/st.mainH probes on the shell's
//    main region. This module has no shell probe, so it measures ITS OWN root box
//    with a ResizeObserver (narrow = width<1000, short = height<620) — a faithful
//    reproduction of the same responsive logic, keyed to the same thresholds. The
//    two pop-outs are reachable exactly under the design's own conditions:
//      – tmRail  "her read" modal  → the header "Her read →" button, shown when
//        narrow (rail collapses out of the inline column), design line 3348.
//      – tmList  block-detail modal → a block's "View all N →" / "View the full
//        role →" more-link, shown when short (center blocks trim), design 9567.
//    Nothing is stubbed — both open the faithfully-ported center modals below.
//  • Structural chrome is token-driven (var(--…)) so it themes light↔dark under
//    `.paige-agency[data-theme]` (§23). TeamBlock itself is the merged decorative
//    data-viz component and keeps its own literal palette per the handoff — it is
//    passed `gold=var(--gold-bright)` for its act-moment CTA fill.
//
// §51 tier gate: crossBook = isAgency && !acting. The agency↔book↔sub ScopeSeg, the
// Book/Per-sub-account scopes, the per-sub picker, and every cross-book aggregate
// render ONLY behind crossBook. A standalone sub-account (isAgency false) OR an
// agency acting-as a sub (acting != null) collapses to its OWN team numbers only —
// scope is forced to "agency" (their own roster), no parent aggregate (§9/§51; the
// #86 sub-account leak class). §63: every fixture name is fictional.
import React from "react";
import { ScopeSeg, Modal } from "./_shared";
import TeamBlock, { TEAM_VIEW } from "./TeamBlock";
import { TEAM_TABS, TEAM_SUBS, TEAM_CAP } from "./fixtures";

const GOLD_BG = "var(--gold-bright)";
const GOLD_INK = "#241C05";
const noop = () => {};

// Props from the AgencyApp shell: { isAgency, acting, openAsk }.
const TeamScreen = ({ isAgency = true, acting = null, openAsk = noop }) => {
  const [tab, setTab] = React.useState("roster");            // roster|directory|roles|workload|performance|activity
  const [scopeState, setScopeState] = React.useState("agency"); // agency|book|sub
  const [tSub, setTSub] = React.useState(0);                 // picked sub-account index (observe-a-sub)
  // pop-out state (the two the design's team view owns)
  const [listIdx, setListIdx] = React.useState(null);        // center block index | null → tmListOpen
  const [railOpen, setRailOpen] = React.useState(false);     // → tmRailOpen ("her read")

  // ── Responsive probe (design st.mainW / st.mainH) ───────────────────────────
  const boxRef = React.useRef(null);
  const [dims, setDims] = React.useState({ w: 1280, h: 820 });
  React.useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) {
        const cr = e.contentRect;
        setDims({ w: cr.width, h: cr.height });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const narrow = dims.w > 0 && dims.w < 1000;   // design: st.mainW < 1000
  const short = dims.h > 0 && dims.h < 620;      // design: st.mainH < 620

  // ── Tab / scope resolution (design teamData 9523–9534) ──────────────────────
  const tabDef = TEAM_TABS.find(t => t.key === tab) || TEAM_TABS[0];
  const avail = tabDef.scopes;
  // §51: cross-book scope exists only in agency mode and never while acting-as a sub.
  const crossBook = isAgency && !acting;
  const scopeRaw = crossBook ? scopeState : "agency";
  const scope = avail.indexOf(scopeRaw) < 0 ? "agency" : scopeRaw;
  const picked = TEAM_SUBS[tSub] || TEAM_SUBS[0];

  const built = TEAM_VIEW(tab, scope, picked, short, GOLD_BG);

  const showScopes = crossBook;          // tmShowScopes (§51-gated)
  const showPicker = scope === "sub";    // tmShowPicker (only reachable when crossBook)
  const showRail = !narrow;              // tmShowRail
  const railCta = narrow ? "Her read →" : null; // tmRailCta
  const inviteCta = narrow ? "+ Invite" : "+ Invite someone"; // tmInviteCta
  const showCap = !narrow;               // tmShowCap

  // Capacity pill copy (design tmCapacity / tmCapNote) — book/sub/agency variants.
  const tmCapacity = scope === "book"
    ? TEAM_SUBS.reduce((a, s) => a + s.booked, 0) + "h of " + TEAM_SUBS.reduce((a, s) => a + s.cap, 0) + "h booked"
    : scope === "sub" ? picked.booked + "h of " + picked.cap + "h booked" : TEAM_CAP.line;
  const tmCapNote = scope === "book"
    ? "Across every team in the book."
    : scope === "sub" ? picked.name + "'s own team, " + picked.staff + " seats." : TEAM_CAP.note;

  // Scope segments (design tmScopes — a segment disabled when this tab can't take it).
  const scopeSegs = [["agency", "Agency"], ["book", "Book"], ["sub", "Per sub-account"]].map(([k, l]) => ({
    key: k, label: l, ok: avail.indexOf(k) >= 0,
    why: l + " · not meaningful for this tab"
  }));

  // ── Center block trimming (design teamData 9567–9578, verbatim mechanism) ────
  // No shell probe, so `short`/`narrow` come from the local box measure above; the
  // trim + openAll → tmList wiring is otherwise identical to the source.
  const tmCenter = built.center.map((b, i) => {
    const listy = b.type === "rows" || b.type === "feed" || b.type === "profiles";
    const tabley = b.type === "table" || b.type === "bars";
    const cap = !short ? 99 : 2;
    const full = listy ? (b.list || []) : tabley ? (b.rows || []) : [];
    const trim = (listy || tabley) && full.length > cap;
    const out = {
      ...b, compact: narrow, slim: short, tight: short && scope === "sub",
      more: trim ? "View all " + full.length + " →" : null,
      openAll: () => setListIdx(i)
    };
    if (b.type === "roledef" && short) out.more = "View the full role →";
    if (trim && listy) out.list = full.slice(0, cap);
    if (trim && tabley) out.rows = full.slice(0, cap);
    return out;
  });

  // tmListBlock — the full (untrimmed) block reopened in the detail modal.
  const listBlock = listIdx != null && built.center[listIdx]
    ? { ...built.center[listIdx], compact: narrow, slim: false, tight: false, more: null }
    : null;

  const tmRail = built.rail.map(b => ({ ...b, compact: narrow }));

  // tab switch (named handler so the strip reads cleanly). Reset the block-detail
  // pop-out so a stale center index can never surface on a different tab.
  const goTab = k => { setListIdx(null); setTab(k); };

  return (
    <div ref={boxRef} style={{ display: "flex", flexDirection: "column", height: "100%", minWidth: 0 }}>
      {/* sub-tab strip (design 12674 — the six TEAM_TABS, gold underline active). */}
      <div className="row tabstrip" style={{ gap: 22, padding: "0 26px", borderBottom: "1px solid var(--line)", background: "var(--canvas)", flex: "none", overflowX: "auto" }}>
        {TEAM_TABS.map(t => {
          const on = tab === t.key;
          return (
            <button key={t.key} onClick={() => goTab(t.key)} className="row" style={{ gap: 8, padding: "12px 2px", whiteSpace: "nowrap", fontSize: 13.5, fontWeight: on ? 600 : 450, color: on ? "var(--ink)" : "var(--ink-3)", borderBottom: on ? "2px solid var(--gold)" : "2px solid transparent", flex: "none", background: "transparent", border: "none", cursor: "pointer" }}>
              <span style={{ display: "flex", fontSize: 13, opacity: .9, color: on ? "var(--gold)" : "inherit" }}>{t.icon}</span>{t.label}
            </button>
          );
        })}
      </div>

      <div key={tab + scope} className="fade-in" style={{ flex: 1, minHeight: 0, padding: "18px 26px 22px", display: "flex", flexDirection: "column", gap: short ? 9 : 12, overflow: "hidden" }}>
        {/* Header: eyebrow TEAM + title + banner "!" + capacity pill + scope seg +
            "Her read →" (narrow) + Invite CTA. (design 3325–3352) */}
        <div className="row" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap", flex: "none" }}>
          <div style={{ minWidth: 0 }}>
            <div className="row" style={{ gap: 9 }}>
              <span className="eyebrow" style={{ fontSize: 9.5 }}>TEAM</span>
              <span style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-.02em" }}>{built.title}</span>
              {built.banner && (
                <span title={built.banner} style={{ width: 19, height: 19, borderRadius: 6, background: "var(--gold-tint)", border: "1px solid var(--gold-line)", color: "var(--warn)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, cursor: "help", flex: "none" }}>!</span>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--ink-2)", marginTop: 5 }}>{built.sub}</div>
          </div>
          <div className="row" style={{ marginLeft: "auto", gap: 9, flexWrap: "wrap", justifyContent: "flex-end", minWidth: 0 }}>
            {showCap && (
              <div title={tmCapNote} style={{ padding: "7px 13px", borderRadius: 20, background: "var(--surface-sunk)", border: "1px solid var(--line)", fontSize: 12, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", flex: "none" }}>{tmCapacity}</div>
            )}
            {showScopes && <ScopeSeg segs={scopeSegs} value={scope} onChange={setScopeState} />}
            {railCta && (
              <button onClick={() => setRailOpen(true)} className="row" style={{ gap: 4, padding: "8px 13px", borderRadius: 9, border: "1px solid var(--violet-line)", background: "var(--violet-tint)", fontSize: 12, fontWeight: 600, color: "var(--violet)", whiteSpace: "nowrap", flex: "none", cursor: "pointer" }}>{railCta}</button>
            )}
            <button style={{ padding: "8px 14px", borderRadius: 9, background: GOLD_BG, color: GOLD_INK, fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer", whiteSpace: "nowrap", flex: "none" }}>{inviteCta}</button>
          </div>
        </div>

        {/* scopeNote row (design 3355–3357). */}
        <div className="row" style={{ gap: 9, flex: "none", minWidth: 0 }}>
          <span className="trunc" style={{ fontSize: 11.5, color: "var(--ink-3)", minWidth: 0 }}>{built.scopeNote}</span>
        </div>

        {/* Per-sub-account picker — observe-a-sub scope only (§51). (design 3359–3367) */}
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

        {/* Center column + rail aside (design 3369–3383). */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 13 }}>
          <div className="pane" style={{ flex: "1 1 0", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: short ? 9 : 12, overflowY: "auto", overflowX: "hidden", paddingRight: 2 }}>
            {tmCenter.map((b, i) => <TeamBlock key={tab + scope + "-c" + i} block={b} gold={GOLD_BG} ask={openAsk} />)}
          </div>
          {showRail && (
            <aside style={{ width: 300, flex: "none", minHeight: 0, display: "flex", flexDirection: "column", gap: 11, overflowY: "auto", overflowX: "hidden" }}>
              {tmRail.map((b, i) => <TeamBlock key={tab + scope + "-r" + i} block={b} gold={GOLD_BG} ask={openAsk} />)}
            </aside>
          )}
        </div>
      </div>

      {/* ── tmListOpen — block-detail pop-out (design 6012–6023). Opened by a center
          block's "View all N →" / "View the full role →" more-link (short). ────── */}
      <Modal open={listIdx != null} onClose={() => setListIdx(null)} title={built.title} size={720}>
        {listBlock && <TeamBlock block={listBlock} gold={GOLD_BG} ask={openAsk} />}
      </Modal>

      {/* ── tmRailOpen — "her read" pop-out (design 6026–6041). Opened by the header
          "Her read →" button (narrow). Renders the same rail blocks. ──────────── */}
      <Modal open={railOpen} onClose={() => setRailOpen(false)} title={built.title + " · her read"} size={600}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {tmRail.map((b, i) => <TeamBlock key={"rail-modal-" + i} block={b} gold={GOLD_BG} ask={openAsk} />)}
        </div>
      </Modal>
    </div>
  );
};

export default TeamScreen;
