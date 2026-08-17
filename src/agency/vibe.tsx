// @ts-nocheck
// Agency pack — the Vibe Studio full-screen composer. Owner-locked port of the
// Claude Design "CRM agency mode" pack (§28/§63 — "We do not drift off this
// whatsoever"), mirroring src/solo/vibe.tsx (the Solo Studio precedent) for the
// Agency design's Studio surface.
//
// Source of truth: "Agency Shell.dc.html" studioOpen block — a fixed, committed-
// DARK cosmic surface (radial gradient, drifting star field) that ESCAPES the app
// chrome: a 246px rail (Back-to-Growth + Esc chip · Vibe Studio brand · New project ·
// nav list · Light-mode / Reduce-motion) and a scrolling main pane (the "Creating
// for:" context chip → the hero composer with TRY chips → "Your projects" grid).
// The DCLogic runtime is NOT ported — its markup, measurements and copy are mirrored
// onto React. The Studio is intentionally single-look dark (like the Solo precedent),
// so it uses local dark constants for chrome + the one shared gold token on the act.
//
// §51: the Studio carries NO cross-sub machinery of its own. WHO it is creating for
// is decided by the caller (Growth) and handed in as { studioContext, ... }; a
// standalone sub-account only ever gets its OWN identity, never a picker.
import React from "react";
import { Logo, useReducedMotion } from "./_shared";
import { STUDIO_PROJECTS, STUDIO_CHIPS } from "./fixtures";

// Studio nav (Agency Shell.dc.html:10286 studioNav) — decorative glyphs, faithful.
const STUDIO_NAV = [
  { key: "recent", label: "Recently viewed", icon: "◔" },
  { key: "mine", label: "My projects", icon: "⊞" },
  { key: "star", label: "Starred", icon: "✦" },
  { key: "tpl", label: "Templates", icon: "▤" },
  { key: "lib", label: "Saved library", icon: "▥" },
];

// StudioStars — the drifting field (Agency Shell.dc.html studioStars, 46, seeded).
// Same seeded-RNG shape as the Solo VsStars precedent; twinkle guarded by the OS
// reduced-motion preference (§11/§22 — motion-safe, one home in ./_shared).
export const StudioStars = ({ n = 46 }) => {
  const reduce = useReducedMotion();
  const stars = React.useMemo(() => Array.from({ length: n }, (_, i) => {
    let s = 9001 + i * 37;
    const r = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
    const a = r(), b = r(), c = r();
    return { left: a * 100, top: b * 100, size: 0.8 + c * 1.8, op: 0.2 + c * 0.6, dur: 2.4 + c * 3, delay: a * 2 };
  }), [n]);
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }} preserveAspectRatio="none">
      {stars.map((s, i) => (
        <circle key={i} cx={s.left + "%"} cy={s.top + "%"} r={s.size} fill={i % 9 === 0 ? "#F5C266" : "#FFFDF8"} opacity={s.op}>
          {!reduce && <animate attributeName="opacity" values={s.op + ";" + (s.op * 0.3) + ";" + s.op} dur={s.dur + "s"} begin={s.delay + "s"} repeatCount="indefinite" />}
        </circle>
      ))}
    </svg>
  );
};

// VibeStudio — full-screen Studio. `onBack` closes it (the caller's studioOpen→false);
// ESC also closes (mirrors the design's onEsc). The creating-for context is resolved
// by the caller and passed in, so this surface holds NO scope/sub state (§51).
const VibeStudio = ({ onBack = () => {}, studioContext = "", studioContextColor = "var(--gold-bright)", studioActing = false, voiceNote = "" }) => {
  const [nav, setNav] = React.useState("recent");
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    const k = e => { if (e.key === "Escape") onBack(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onBack]);

  // Committed-dark Studio chrome (single look, like the Solo precedent). Gold on the
  // act stays the shared token; everything else is the design's dark cosmic palette.
  const line = "rgba(255,253,248,.12)";
  const txt = "#FFFDF8";
  const dim = "rgba(255,253,248,.6)";
  const panel = "rgba(255,253,248,.08)";
  const projState = st => st === "Published"
    ? { bg: "rgba(63,150,104,.2)", color: "#7FD3A6" }
    : { bg: "rgba(255,253,248,.1)", color: dim };

  return (
    <div className="fade-in" style={{ position: "fixed", inset: 0, zIndex: 96, display: "flex", overflow: "hidden", color: txt,
      background: "radial-gradient(circle at 62% 22%,#241E42 0%,#141033 42%,#0A0820 100%)" }}>
      <StudioStars />

      {/* ── Rail ── */}
      <aside style={{ position: "relative", width: 246, flex: "none", borderRight: "1px solid " + line, padding: "18px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
        <button onClick={onBack} className="row" style={{ gap: 9, background: "transparent", border: "none", cursor: "pointer", padding: "2px 2px", flex: "none", textAlign: "left" }}>
          <span style={{ color: dim, fontSize: 14, transform: "rotate(180deg)", display: "flex" }}>›</span>
          <span style={{ fontSize: 12.5, color: "rgba(255,253,248,.78)" }}>Back to Growth</span>
          <span className="mono" style={{ marginLeft: "auto", padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(255,253,248,.18)", fontSize: 10, color: dim }}>Esc</span>
        </button>
        <div className="row" style={{ gap: 9, flex: "none", padding: "0 2px" }}>
          <Logo size={22} />
          <span style={{ fontSize: 15, fontWeight: 700, color: "#FFFDF8", letterSpacing: "-.02em" }}>Vibe Studio</span>
        </div>
        <button className="row" style={{ justifyContent: "center", gap: 7, padding: 11, borderRadius: 11, background: "var(--gold-bright)", color: "#241C05", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", flex: "none" }}>＋ New project</button>
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: "none" }}>
          {STUDIO_NAV.map(n => {
            const on = nav === n.key;
            return (
              <button key={n.key} onClick={() => setNav(n.key)} className="row" style={{ gap: 11, padding: "9px 11px", borderRadius: 9, cursor: "pointer", border: "none", textAlign: "left",
                background: on ? panel : "transparent", color: on ? txt : dim, fontSize: 13, fontWeight: on ? 600 : 400 }}
                onMouseEnter={e => { if (!on) e.currentTarget.style.background = "rgba(255,253,248,.05)"; }}
                onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                <span style={{ width: 16, textAlign: "center", fontSize: 11, opacity: 0.85, color: on ? "var(--gold-bright)" : "inherit" }}>{n.icon}</span>{n.label}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid " + line, display: "flex", flexDirection: "column", gap: 3, flex: "none" }}>
          {[["☀", "Light mode"], ["∿", "Reduce motion"]].map(([g, l]) => (
            <button key={l} className="row" style={{ gap: 10, padding: "8px 11px", borderRadius: 9, fontSize: 12, color: dim, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
              <span style={{ width: 16, textAlign: "center", fontSize: 11 }}>{g}</span>{l}
            </button>
          ))}
        </div>
      </aside>

      {/* ── Main ── */}
      <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", flexDirection: "column", overflowY: "auto" }}>
        {/* Creating-for context chip (§51 — identity resolved by the caller). */}
        <div className="row" style={{ gap: 10, padding: "16px 26px", flex: "none" }}>
          <span className="row" style={{ gap: 8, padding: "6px 13px", borderRadius: 20, background: panel, border: "1px solid rgba(255,253,248,.14)", fontSize: 11.5, color: "#FFFDF8" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: studioContextColor }} />{studioContext}
          </span>
          {studioActing && voiceNote && <span style={{ fontSize: 11, color: "rgba(255,253,248,.5)" }}>{voiceNote}</span>}
        </div>

        {/* Hero composer. */}
        <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "center", padding: "22px 26px 30px" }}>
          <Logo size={30} />
          <div className="mono" style={{ fontSize: 10.5, letterSpacing: ".34em", color: "rgba(255,253,248,.55)", marginTop: 10 }}>VIBE STUDIO</div>
          <div style={{ fontSize: 34, fontWeight: 700, color: "#FFFDF8", letterSpacing: "-.02em", marginTop: 14, textAlign: "center" }}>What do you want to build?</div>

          <div style={{ width: "min(680px,100%)", marginTop: 22, border: "1px solid rgba(255,253,248,.13)", borderRadius: 14, background: "rgba(255,253,248,.05)", padding: "15px 17px" }}>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              <span className="mono" style={{ fontSize: 10, letterSpacing: ".18em", color: "rgba(255,253,248,.45)", flex: "none" }}>TRY</span>
              {STUDIO_CHIPS.map(c => (
                <button key={c} onClick={() => setQ(c)} style={{ padding: "6px 13px", borderRadius: 20, background: "rgba(255,253,248,.09)", border: "1px solid rgba(255,253,248,.12)", fontSize: 12, color: "#FFFDF8", cursor: "pointer", whiteSpace: "nowrap" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(255,253,248,.16)"} onMouseLeave={e => e.currentTarget.style.background = "rgba(255,253,248,.09)"}>{c}</button>
              ))}
            </div>
            <textarea value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. a teardown offer page for the Q4 push, with an application form…"
              style={{ width: "100%", minHeight: 74, resize: "none", border: 0, outline: "none", background: "none", color: txt, fontFamily: "var(--font)", fontSize: 14, lineHeight: 1.55, marginTop: 14 }} />
            <div className="row" style={{ gap: 12, paddingTop: 12, borderTop: "1px solid rgba(255,253,248,.1)" }}>
              <span style={{ fontSize: 12.5, color: "rgba(255,253,248,.75)", flex: "none", cursor: "pointer" }}>＋ Attach</span>
              <span style={{ fontSize: 11.5, color: "rgba(255,253,248,.42)", minWidth: 0 }}>Pages, funnels, forms, images, and internal tools — one session, no type picker.</span>
              <span style={{ marginLeft: "auto", width: 30, height: 30, borderRadius: "50%", background: q ? "var(--gold-bright)" : "rgba(255,253,248,.14)", color: q ? "#241C05" : "#FFFDF8", display: "grid", placeItems: "center", fontSize: 13, flex: "none" }}>↑</span>
            </div>
          </div>
        </div>

        {/* Your projects. */}
        <div style={{ flex: "none", padding: "20px 26px 26px", borderTop: "1px solid rgba(255,253,248,.07)", background: "rgba(10,8,26,.5)" }}>
          <div className="row" style={{ alignItems: "baseline", gap: 11 }}>
            <div style={{ fontSize: 19, fontWeight: 700, color: "#FFFDF8" }}>Your projects</div>
            <div style={{ fontSize: 12, color: "rgba(255,253,248,.5)" }}>{STUDIO_PROJECTS.length} projects</div>
            <div style={{ marginLeft: "auto", fontSize: 11.5, color: "rgba(255,253,248,.55)", cursor: "pointer", flex: "none" }}>Recently edited ▾</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(196px,100%),1fr))", gap: 12, marginTop: 14 }}>
            {STUDIO_PROJECTS.map(p => {
              const stt = projState(p.state);
              return (
                <div key={p.name} style={{ border: "1px solid rgba(255,253,248,.12)", borderRadius: 12, background: "rgba(255,253,248,.05)", overflow: "hidden", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(233,185,73,.5)"} onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,253,248,.12)"}>
                  <div style={{ height: 72, background: "linear-gradient(150deg,rgba(60,50,110,.7),rgba(24,20,52,.9))", display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, padding: "0 16px" }}>
                    <div style={{ height: 5, width: "52%", borderRadius: 3, background: "var(--gold-bright)" }} />
                    <div style={{ height: 4, width: "74%", borderRadius: 3, background: "rgba(255,253,248,.28)" }} />
                    <div style={{ height: 4, width: "40%", borderRadius: 3, background: "rgba(255,253,248,.18)" }} />
                  </div>
                  <div style={{ padding: "11px 13px" }}>
                    <div className="row" style={{ gap: 8 }}>
                      <span className="trunc" style={{ fontSize: 12.5, fontWeight: 600, color: "#FFFDF8", minWidth: 0 }}>{p.name}</span>
                      <span style={{ marginLeft: "auto", padding: "2px 8px", borderRadius: 20, background: stt.bg, color: stt.color, fontSize: 9.5, fontWeight: 600, flex: "none" }}>{p.state}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,253,248,.45)", marginTop: 5 }}>{p.kind} · {p.when}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default VibeStudio;
