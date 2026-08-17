// @ts-nocheck
// Agency pack — Team Block presentational component + the deferred TEAM render-logic
// cluster. Faithful port of the Claude Design "CRM agency mode" pack:
//   • the presentational block renderer  → "Team Block.dc.html"
//   • TEAM_VIEW / TM_SUB_DATA / the TM_* copy-derivation helpers / tmInit / the
//     dynamic banners (tmBanner / subBanner) → the deferred cluster grepped out of
//     "Agency Shell.dc.html" (lines ~6730–7143 + the teamData consumer at ~9522).
//
// Slice 1a = presentational component + runtime layer only. This mounts NOTHING —
// the screen modules, AgencyApp, and the list/rail pop-out chrome are Slice 1b.
// TeamBlock EMITS its trigger callbacks (openAll / askFn) — it does NOT author the
// pop-outs. `openAll` rides on the block descriptor (teamData wires it in Slice 1b);
// `askFn` is the `ask` prop.
//
// §63: the design's decorative fixture names (Cook & Co / Antonio Cook / Ridgeline /
// Meridian / Bellweather …) are preserved verbatim — never a real owner account.
// Shared helpers (AV / loadColor / utilColor / useReducedMotion) are IMPORTED from
// ./_shared, not redefined (§18 one home). TM_GREEN/AMBER/RED/BLUE status colors are
// re-expressed through the token-driven TONE map so the cluster themes light↔dark.
import React from "react";
import { AV, TONE, loadColor, utilColor, useReducedMotion } from "./_shared";
import {
  TEAM, TEAM_TABS, TEAM_CAP, TEAM_SUBS, TEAM_SEATS, TEAM_ROLES, TEAM_ACCOUNTS,
  TEAM_ACTS, TEAM_PERF, TM_SUB_PEOPLE, DEPTS, TEAM_VIEW_BANNERS
} from "./fixtures";

// ── Column flex map (Team Block.dc.html) ──────────────────────────────────────
const FLEX = { CLIENT: "1.6", ROLE: "1.2", OWNER: "1.1", "HRS/MO": ".7", "EFF. RATE": ".8", "SHE HANDLES": "1.5", LOAD: "1", SEATS: ".8", AUTONOMY: ".9", "SEALED RECORDS": "1.1", EXPORT: ".7", INVITE: ".7" };

// One-time keyframe + hover injection (the DC put these in <helmet><style>).
const STYLE_ID = "tmb-styles";
function ensureStyles() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent =
    "@keyframes tmFill{from{transform:scaleX(0)}to{transform:scaleX(1)}}" +
    "@keyframes tmIn{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}" +
    ".tmb-hover:hover{background:#FBFAF6}" +
    ".tmb-hovercard:hover{border-color:#CFC9BB;background:#FFFFFF}";
  document.head.appendChild(el);
}

// ─────────────────────────────────────────────────────────────────────────────
// renderVals — verbatim port of the DC's renderVals (Team Block.dc.html). Maps a
// block descriptor + accent gold + reduced-motion flag → the flat view object the
// JSX below consumes. `AV` is the imported _shared helper (identical math).
// ─────────────────────────────────────────────────────────────────────────────
function renderVals(b, gold, reduced, ask) {
  const t = b.type;
  const anim = reduced ? "none" : "tmFill .5s cubic-bezier(.22,.8,.3,1) both";
  const goldFill = gold || "linear-gradient(180deg,#DCC079,#C8A02E)";
  const isGoldCta = !!b.cta && (/^✓/.test(b.cta) || /^\+/.test(b.cta) || /^Propose/.test(b.cta) || /^Send/.test(b.cta) || /^Draft/.test(b.cta) || /^Raise/.test(b.cta));

  return {
    isStats: t === "stats", isRows: t === "rows", isTable: t === "table",
    isProfiles: t === "profiles", isRoledef: t === "roledef", isInvites: t === "invites", isCapacity: t === "capacity",
    foot: b.foot,
    profileCols: "repeat(2,minmax(0,1fr))",
    cardPad: b.tight ? "10px 12px" : "12px 13px",
    adminBadge: b.adminBadge, seatLine: b.seatLine, editCta: b.editCta, inviteCta: b.inviteCta,
    roleGlyph: (b.title || "?")[0],
    showFullRole: !b.slim,
    showRoleBody: !b.tight,
    showDirTools: !b.tight,
    showProfileCta: !b.tight,
    footShown: b.foot && !b.tight,
    responsibilities: b.tight ? (b.responsibilities || []).slice(0, 1) : b.slim ? (b.responsibilities || []).slice(0, 2) : (b.responsibilities || []),
    depts: b.depts || [],
    unlocks: b.unlocks || [],
    statLabel: b.statLabel, statValue: b.statValue, statNote: b.statNote,
    statWidth: (b.pct == null ? 0 : b.pct) + "%",
    statColor: (b.pct || 0) >= 60 ? "#2F7A57" : (b.pct || 0) >= 30 ? "#B5822A" : "#9F3A2A",
    hasRoleList: !!(b.roleList && b.roleList.length),
    roleList: (b.roleList || []).map(r => ({ ...r, tint: AV(r.color).plate, ink: AV(r.color).ink })),
    openTitle: b.openTitle, bigCta: b.bigCta,
    statCols: "repeat(4,minmax(0,1fr))",
    statPad: b.compact ? "7px 10px" : "11px 13px",
    statSize: b.compact ? "15.5px" : "19px",
    headPad: b.compact ? "10px 14px 8px" : "13px 15px 10px",
    rowPad: b.compact ? "7px 14px" : "9px 15px",
    showSub: !b.compact,
    showStatNote: !b.compact,
    wide: !b.compact, narrow: !!b.compact,
    recordList: (b.rows || []).map(r => {
      const head = (b.head || []);
      const cells = r.cells || [];
      return {
        head: cells[0],
        pill: r.pill,
        pillBg: r.tone ? "color-mix(in srgb," + r.tone + " 12%, transparent)" : "#F1EEE5",
        pillColor: r.tone || "#5D594F",
        pairs: cells.slice(1, cells.length - (r.pill ? 1 : 0)).map((c, i) => ({ label: head[i + 1], value: c }))
      };
    }),
    isBars: t === "bars", isFeed: t === "feed", isRead: t === "read", isNote: t === "note",
    title: b.title, sub: b.sub, body: b.body, cta: b.cta,
    more: b.more, openAll: b.openAll || (() => {}),
    askFn: ask || (() => {}),
    ctaBg: isGoldCta ? goldFill : "#FFFFFF",
    ctaColor: isGoldCta ? "#241C05" : "#5D594F",
    ctaEdge: isGoldCta ? "transparent" : "#E2DED3",
    items: (b.items || []).map(i => ({ label: i.label, value: i.value, note: i.note, hover: i.label + " · " + i.value + " · " + i.note, color: i.tone || "#1B1B1F" })),
    list: t === "rows"
      ? (b.list || []).map(r => ({ ...r, tint: AV(r.color).plate, ink: AV(r.color).ink, width: (r.pct == null ? 0 : r.pct) + "%", anim }))
      : t === "profiles"
        ? (b.list || []).map(p => ({
            ...p, tint: AV(p.color).plate, ink: AV(p.color).ink,
            photoNote: p.photo ? null : "No photo",
            badges: (p.badges || []).map(x => ({
              label: x.label,
              bg: x.kind === "role" ? "#EDEAFB" : x.kind === "live" ? "#E6F1EA" : x.kind === "invited" ? "#FBF3DC" : "#F1EEE5",
              color: x.kind === "role" ? "#4A3FA0" : x.kind === "live" ? "#2A6B4C" : x.kind === "invited" ? "#6E5514" : "#5D594F"
            }))
          }))
        : t === "capacity"
          ? (b.list || []).map(c => ({ ...c, tint: AV(c.color).plate, ink: AV(c.color).ink, width: (c.pct == null ? 0 : c.pct) + "%" }))
          : t === "invites"
            ? (b.list || []).map(i => ({ ...i, tint: AV(i.color).plate, ink: AV(i.color).ink }))
            : (b.list || []),
    head: (b.head || []).map(h => ({ label: h, flex: FLEX[h] || "1" })),
    rowsList: (b.rows || []).map(r => ({
      cells: (r.cells || []).map((c, i) => {
        const key = (b.head || [])[i];
        const last = i === (r.cells || []).length - 1;
        return {
          text: c, flex: FLEX[key] || "1",
          weight: i === 0 ? "600" : last && r.tone ? "600" : "500",
          color: last && r.tone ? r.tone : i === 0 ? "#1B1B1F" : "#5D594F"
        };
      })
    })),
    barRows: (b.rows || []).map(r => ({ label: r.label, val: r.val, hours: r.hours, tail: r.tail, color: r.color, width: r.pct + "%", anim }))
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TeamBlock — the presentational block renderer. 11 block types (stats / rows /
// table / profiles / roledef / invites / capacity / feed / read / note / bars).
// Props: { block, gold?, ask? }. openAll rides on the block; ask is a prop.
// ─────────────────────────────────────────────────────────────────────────────
export function TeamBlock({ block, gold, ask }) {
  const reduced = useReducedMotion();
  React.useEffect(() => { ensureStyles(); }, []);
  if (typeof document !== "undefined") ensureStyles();
  const v = renderVals(block || {}, gold, reduced, ask);

  // ── stats ───────────────────────────────────────────────────────────────
  if (v.isStats) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: v.statCols, gap: 10, flex: "none" }}>
        {v.items.map((i, k) => (
          <div key={k} title={i.hover} style={{ border: "1px solid #E7E3D9", borderRadius: 12, background: "#FFFFFF", padding: v.statPad, minWidth: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".13em", color: "#8A8478", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.label}</div>
            <div style={{ fontSize: v.statSize, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4, color: i.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.value}</div>
            {v.showStatNote && <div style={{ fontSize: 11, color: "#6E6A61", marginTop: 3, lineHeight: 1.35 }}>{i.note}</div>}
          </div>
        ))}
      </div>
    );
  }

  // ── rows ────────────────────────────────────────────────────────────────
  if (v.isRows) {
    return (
      <div style={{ border: "1px solid #E7E3D9", borderRadius: 13, background: "#FFFFFF", display: "flex", flexDirection: "column", minWidth: 0, flex: "none" }}>
        <div title={v.sub} style={{ padding: v.headPad }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{v.title}</div>
          {v.showSub && <div style={{ fontSize: 11.5, color: "#8A8478", marginTop: 3 }}>{v.sub}</div>}
        </div>
        {v.list.map((r, k) => (
          <div key={k} className="tmb-hover" style={{ display: "flex", alignItems: "center", gap: 11, padding: v.rowPad, borderTop: "1px solid #F3F0E8", minWidth: 0 }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: r.tint, boxShadow: "inset 0 0 0 2px " + r.color, color: r.ink, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, flex: "none" }}>{r.initials}</div>
            <div style={{ minWidth: 96, flex: "1 1 auto", overflow: "hidden" }}>
              <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.name}</div>
              <div style={{ fontSize: 11, color: "#6E6A61", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.line}</div>
            </div>
            <div style={{ width: 64, height: 5, borderRadius: 3, background: "#EFEBE1", overflow: "hidden", flex: "none" }}>
              <div style={{ height: "100%", width: r.width, background: r.dot, transformOrigin: "left", animation: r.anim }} />
            </div>
            <div style={{ textAlign: "right", flex: "none", minWidth: 58 }}>
              <div style={{ fontSize: 12.5, fontWeight: 700 }}>{r.value}</div>
              <div style={{ fontSize: 10, color: "#8A8478", marginTop: 2, whiteSpace: "nowrap" }}>{r.meta}</div>
            </div>
            {r.tail && <span style={{ fontSize: 11.5, fontWeight: 600, color: "#8A6D1E", flex: "none", whiteSpace: "nowrap" }}>{r.tail}</span>}
          </div>
        ))}
        {v.more && <div onClick={v.openAll} className="tmb-hover" style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 15px", borderTop: "1px solid #EFEBE1", fontSize: 12, fontWeight: 600, color: "#8A6D1E", cursor: "pointer" }}>{v.more}</div>}
      </div>
    );
  }

  // ── table ───────────────────────────────────────────────────────────────
  if (v.isTable) {
    return (
      <div style={{ border: "1px solid #E7E3D9", borderRadius: 13, background: "#FFFFFF", minWidth: 0, flex: "none", overflow: "hidden" }}>
        <div style={{ padding: "13px 15px 10px" }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{v.title}</div>
          <div style={{ fontSize: 11.5, color: "#8A8478", marginTop: 3 }}>{v.sub}</div>
        </div>
        {v.wide && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 15px", background: "#FBFAF6", borderTop: "1px solid #F3F0E8", borderBottom: "1px solid #F3F0E8" }}>
              {v.head.map((h, k) => (
                <div key={k} style={{ flex: h.flex, minWidth: 0, fontSize: 9, fontWeight: 600, letterSpacing: ".12em", color: "#8A8478", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{h.label}</div>
              ))}
            </div>
            {v.rowsList.map((r, k) => (
              <div key={k} className="tmb-hover" style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 15px", borderBottom: "1px solid #F6F4EE", minWidth: 0 }}>
                {r.cells.map((c, j) => (
                  <div key={j} style={{ flex: c.flex, minWidth: 0, fontSize: 12, fontWeight: c.weight, color: c.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.text}</div>
                ))}
              </div>
            ))}
          </>
        )}
        {v.narrow && v.recordList.map((r, k) => (
          <div key={k} className="tmb-hover" style={{ padding: "8px 14px", borderTop: "1px solid #F3F0E8", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.head}</span>
              {r.pill && <span style={{ marginLeft: "auto", padding: "2px 9px", borderRadius: 20, background: r.pillBg, color: r.pillColor, fontSize: 10.5, fontWeight: 600, flex: "none", whiteSpace: "nowrap" }}>{r.pill}</span>}
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 5, minWidth: 0, overflow: "hidden" }}>
              {r.pairs.map((p, j) => (
                <div key={j} title={p.label + " " + p.value} style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".11em", color: "#8A8478", flex: "none" }}>{p.label}</span>
                  <span style={{ fontSize: 11.5, color: "#3E3A33", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {v.footShown && <div style={{ padding: "10px 15px", borderTop: "1px solid #EFEBE1", background: "#FBFAF6", fontSize: 11.5, lineHeight: 1.55, color: "#5D594F" }}>{v.foot}</div>}
        {v.more && <div onClick={v.openAll} className="tmb-hover" style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 15px", borderTop: "1px solid #EFEBE1", fontSize: 12, fontWeight: 600, color: "#8A6D1E", cursor: "pointer" }}>{v.more}</div>}
      </div>
    );
  }

  // ── bars ────────────────────────────────────────────────────────────────
  if (v.isBars) {
    return (
      <div style={{ border: "1px solid #E7E3D9", borderRadius: 13, background: "#FFFFFF", padding: "13px 15px", minWidth: 0, flex: "none" }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{v.title}</div>
        <div style={{ fontSize: 11.5, color: "#8A8478", marginTop: 3 }}>{v.sub}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 11 }}>
          {v.barRows.map((b2, k) => (
            <div key={k} style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 9, minWidth: 0 }}>
                <span style={{ fontSize: 11.5, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b2.label}</span>
                <span style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#5D594F", flex: "none", whiteSpace: "nowrap" }}>{b2.val}</span>
                {b2.hours && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, fontWeight: 600, color: b2.color, flex: "none", whiteSpace: "nowrap" }}>{b2.hours}</span>}
                {b2.tail && <span style={{ fontSize: 10, color: "#8A8478", flex: "none", whiteSpace: "nowrap" }}>{b2.tail}</span>}
              </div>
              <div style={{ height: 6, borderRadius: 3, background: "#EFEBE1", marginTop: 5, overflow: "hidden" }}>
                <div style={{ height: "100%", width: b2.width, background: b2.color, transformOrigin: "left", animation: b2.anim }} />
              </div>
            </div>
          ))}
        </div>
        {v.foot && <div style={{ marginTop: 11, paddingTop: 10, borderTop: "1px solid #EFEBE1", fontSize: 11.5, lineHeight: 1.55, color: "#5D594F" }}>{v.foot}</div>}
        {v.more && <div onClick={v.openAll} style={{ marginTop: 9, fontSize: 12, fontWeight: 600, color: "#8A6D1E", cursor: "pointer" }}>{v.more}</div>}
      </div>
    );
  }

  // ── profiles ──────────────────────────────────────────────────────────────
  if (v.isProfiles) {
    return (
      <div style={{ border: "1px solid #E7E3D9", borderRadius: 13, background: "#FFFFFF", minWidth: 0, flex: "none" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: v.headPad }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>{v.title}</div>
            <div style={{ fontSize: 11.5, color: "#8A8478", marginTop: 3 }}>{v.sub}</div>
          </div>
          {v.showDirTools && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "7px 11px", borderRadius: 9, border: "1px solid #E2DED3", background: "#FBFAF6", fontSize: 11.5, color: "#9A958A", whiteSpace: "nowrap" }}><span style={{ fontSize: 10 }}>⌕</span>Find someone</div>
              <div style={{ padding: "7px 12px", borderRadius: 9, background: "#1D1D26", color: "#FFFDF8", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>+ Add member</div>
            </div>
          )}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: v.profileCols, gap: 10, padding: "0 14px 13px" }}>
          {v.list.map((p, k) => (
            <div key={k} className="tmb-hovercard" style={{ border: "1px solid #EFEBE1", borderRadius: 12, background: "#FBFAF6", padding: v.cardPad, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <div style={{ position: "relative", flex: "none" }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: p.tint, boxShadow: "inset 0 0 0 2px " + p.color, color: p.ink, display: "grid", placeItems: "center", fontSize: 11.5, fontWeight: 700 }}>{p.initials}</div>
                  <span style={{ position: "absolute", right: -1, bottom: -1, width: 9, height: 9, borderRadius: "50%", background: p.dot, border: "2px solid #FBFAF6" }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                  <div style={{ fontSize: 11.5, color: "#6E6A61", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.role}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 9, minWidth: 0, overflow: "hidden" }}>
                {p.badges.map((b3, j) => (
                  <span key={j} style={{ padding: "2px 8px", borderRadius: 20, background: b3.bg, color: b3.color, fontSize: 10, fontWeight: 600, whiteSpace: "nowrap", flex: "none" }}>{b3.label}</span>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 9, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}><span style={{ fontSize: 10, color: "#B2ADA2", flex: "none" }}>✉</span><span style={{ fontSize: 11, color: "#5D594F", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.mail}</span></div>
                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}><span style={{ fontSize: 10, color: "#B2ADA2", flex: "none" }}>◕</span><span style={{ fontSize: 11, color: "#5D594F", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.tz}</span></div>
              </div>
              {v.showProfileCta && (
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginTop: 10 }}>
                  <div style={{ padding: "6px 11px", borderRadius: 8, border: "1px solid #E2DED3", background: "#FFFFFF", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{p.cta}</div>
                  {p.photoNote && <span style={{ marginLeft: "auto", fontSize: 10.5, color: "#9A958A", flex: "none" }}>{p.photoNote}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
        {v.more && <div onClick={v.openAll} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 15px", borderTop: "1px solid #EFEBE1", fontSize: 12, fontWeight: 600, color: "#8A6D1E", cursor: "pointer" }}>{v.more}</div>}
      </div>
    );
  }

  // ── roledef ─────────────────────────────────────────────────────────────
  if (v.isRoledef) {
    return (
      <div style={{ border: "1px solid #E7E3D9", borderRadius: 13, background: "#FFFFFF", minWidth: 0, flex: "none" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: v.headPad, borderBottom: "1px solid #F3F0E8" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{v.title}</div>
            <div style={{ fontSize: 11.5, color: "#8A8478", marginTop: 3 }}>{v.sub}</div>
          </div>
          {v.adminBadge && <span style={{ marginLeft: "auto", padding: "3px 10px", borderRadius: 20, background: "#EDEAFB", color: "#4A3FA0", fontSize: 10.5, fontWeight: 600, flex: "none", whiteSpace: "nowrap" }}>{v.adminBadge}</span>}
        </div>
        <div style={{ padding: "13px 15px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#F1EEE5", color: "#5D594F", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, flex: "none" }}>{v.roleGlyph}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{v.title}</div>
              <div style={{ fontSize: 11, color: "#8A8478", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{v.seatLine}</div>
            </div>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
              <div style={{ padding: "6px 11px", borderRadius: 8, border: "1px solid #E2DED3", background: "#FFFFFF", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{v.editCta}</div>
              {v.inviteCta && <div style={{ padding: "6px 11px", borderRadius: 8, background: "#1D1D26", color: "#FFFDF8", fontSize: 11.5, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{v.inviteCta}</div>}
            </div>
          </div>
          {v.showRoleBody && <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "#3E3A33", marginTop: 11 }}>{v.body}</div>}
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".13em", color: "#8A8478", marginTop: 13 }}>RESPONSIBILITIES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 7 }}>
            {v.responsibilities.map((r, k) => (
              <div key={k} style={{ display: "flex", alignItems: "flex-start", gap: 8, minWidth: 0 }}>
                <span style={{ color: "#2F7A57", fontSize: 11, flex: "none" }}>✓</span>
                <span style={{ fontSize: 12, color: "#3E3A33", lineHeight: 1.45 }}>{r}</span>
              </div>
            ))}
          </div>
          {v.showFullRole && (
            <>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".13em", color: "#8A8478", marginTop: 13 }}>DEPARTMENTS THEY CAN DIRECT</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                {v.depts.map((d, k) => (
                  <span key={k} style={{ padding: "4px 11px", borderRadius: 20, background: "#F1EEE5", color: "#4A463E", fontSize: 11, fontWeight: 500 }}>{d}</span>
                ))}
              </div>
              <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".13em", color: "#8A8478", marginTop: 13 }}>WHAT THE ROLE UNLOCKS</div>
              <div style={{ border: "1px solid #EFEBE1", borderRadius: 11, marginTop: 7, overflow: "hidden" }}>
                {v.unlocks.map((u, k) => (
                  <div key={k} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", borderBottom: "1px solid #F6F4EE", minWidth: 0 }}>
                    <span style={{ color: "#2F7A57", fontSize: 11, flex: "none" }}>✓</span>
                    <span style={{ fontSize: 12, color: "#3E3A33", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: 600, color: "#2F7A57", flex: "none" }}>{u.val}</span>
                  </div>
                ))}
              </div>
            </>
          )}
          {v.more && <div onClick={v.openAll} style={{ marginTop: 11, fontSize: 12, fontWeight: 600, color: "#8A6D1E", cursor: "pointer" }}>{v.more}</div>}
        </div>
      </div>
    );
  }

  // ── invites ─────────────────────────────────────────────────────────────
  if (v.isInvites) {
    return (
      <div style={{ border: "1px solid #E7E3D9", borderRadius: 13, background: "#FFFFFF", padding: "13px 15px", minWidth: 0, flex: "none" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>{v.title}</div>
            <div style={{ fontSize: 11.5, color: "#8A8478", marginTop: 3 }}>{v.sub}</div>
          </div>
          {v.bigCta && <div style={{ marginLeft: "auto", padding: "6px 11px", borderRadius: 9, border: "1px solid #E2DED3", background: "#FFFFFF", fontSize: 11, fontWeight: 600, cursor: "pointer", flex: "none", whiteSpace: "nowrap" }}>+ New role</div>}
        </div>
        {v.statValue && (
          <div style={{ border: "1px solid #EFEBE1", borderRadius: 12, background: "#FBFAF6", padding: "12px 13px", marginTop: 11 }}>
            <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".13em", color: "#8A8478" }}>{v.statLabel}</div>
            <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", marginTop: 4 }}>{v.statValue}</div>
            <div style={{ height: 5, borderRadius: 3, background: "#EFEBE1", marginTop: 9, overflow: "hidden" }}>
              <div style={{ height: "100%", width: v.statWidth, background: v.statColor }} />
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.5, color: "#5D594F", marginTop: 9 }}>{v.statNote}</div>
          </div>
        )}
        {v.hasRoleList && (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 9 }}>
            {v.roleList.map((r, k) => (
              <div key={k} className="tmb-hover" style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderTop: "1px solid #F3F0E8", minWidth: 0, cursor: "pointer" }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: r.tint, boxShadow: "inset 0 0 0 2px " + r.color, color: r.ink, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, flex: "none" }}>{r.initials}</div>
                <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.role}</div>
                  <div style={{ fontSize: 11, color: "#6E6A61", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.who}</div>
                </div>
                {r.admin && <span style={{ padding: "2px 8px", borderRadius: 20, background: "#EDEAFB", color: "#4A3FA0", fontSize: 10, fontWeight: 600, flex: "none" }}>{r.admin}</span>}
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: "#8A8478", flex: "none" }}>{r.seats}</span>
                <span style={{ color: "#B2ADA2", fontSize: 11, flex: "none" }}>›</span>
              </div>
            ))}
          </div>
        )}
        {v.openTitle && <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: ".13em", color: "#8A8478", marginTop: 12 }}>{v.openTitle}</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 9 }}>
          {v.list.map((i, k) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, border: "1px solid #EFEBE1", borderRadius: 11, padding: "9px 11px", minWidth: 0 }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: i.tint, boxShadow: "inset 0 0 0 2px " + i.color, color: i.ink, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, flex: "none" }}>{i.initials}</div>
              <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</div>
                <div style={{ fontSize: 10.5, color: "#6E6A61", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.state}</div>
              </div>
              <div style={{ padding: "6px 11px", borderRadius: 8, border: "1px solid #E2DED3", background: "#FFFFFF", fontSize: 11, fontWeight: 600, cursor: "pointer", flex: "none" }}>{i.cta}</div>
            </div>
          ))}
        </div>
        {v.bigCta && <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 10, padding: 10, borderRadius: 10, background: "#1D1D26", color: "#FFFDF8", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{v.bigCta}</div>}
        {v.foot && <div style={{ fontSize: 11, lineHeight: 1.5, color: "#6E6A61", marginTop: 11, paddingTop: 10, borderTop: "1px solid #EFEBE1" }}>{v.foot}</div>}
      </div>
    );
  }

  // ── capacity ────────────────────────────────────────────────────────────
  if (v.isCapacity) {
    return (
      <div style={{ border: "1px solid #E7E3D9", borderRadius: 13, background: "#FFFFFF", padding: "13px 15px", minWidth: 0, flex: "none" }}>
        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{v.title}</div>
        <div style={{ fontSize: 11.5, color: "#8A8478", marginTop: 3 }}>{v.sub}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          {v.list.map((c, k) => (
            <div key={k} style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <div style={{ width: 24, height: 24, borderRadius: "50%", background: c.tint, boxShadow: "inset 0 0 0 2px " + c.color, color: c.ink, display: "grid", placeItems: "center", fontSize: 9.5, fontWeight: 700, flex: "none" }}>{c.initials}</div>
                <span style={{ fontSize: 12, fontWeight: 600, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                <span style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: c.tone, flex: "none", whiteSpace: "nowrap" }}>{c.val}</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#8A8478", flex: "none", whiteSpace: "nowrap" }}>/ {c.max}</span>
              </div>
              <div style={{ height: 4, borderRadius: 3, background: "#EFEBE1", marginTop: 6, overflow: "hidden" }}>
                <div style={{ height: "100%", width: c.width, background: c.tone }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── feed ──────────────────────────────────────────────────────────────────
  if (v.isFeed) {
    return (
      <div style={{ border: "1px solid #E7E3D9", borderRadius: 13, background: "#FFFFFF", minWidth: 0, flex: "none" }}>
        <div title={v.sub} style={{ padding: v.headPad }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{v.title}</div>
          {v.showSub && <div style={{ fontSize: 11.5, color: "#8A8478", marginTop: 3 }}>{v.sub}</div>}
        </div>
        {v.list.map((a, k) => (
          <div key={k} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 15px", borderTop: "1px solid #F3F0E8", minWidth: 0, animation: reduced ? "none" : "tmIn .18s ease both" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#7B6BE0", marginTop: 5, flex: "none" }} />
            <div style={{ minWidth: 0, flex: "1 1 auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", minWidth: 0 }}>
                <span style={{ padding: "2px 8px", borderRadius: 20, background: a.badgeBg, color: a.badgeColor, fontSize: 10.5, fontWeight: 600, whiteSpace: "nowrap" }}>{a.who}</span>
                {a.tenant && <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10.5, color: "#6E6A61", whiteSpace: "nowrap" }}><span style={{ width: 6, height: 6, borderRadius: 2, background: a.color }} />{a.tenant}</span>}
                <span style={{ marginLeft: "auto", fontFamily: "'IBM Plex Mono',monospace", fontSize: 10.5, color: "#8A8478", flex: "none", whiteSpace: "nowrap" }}>{a.when}</span>
              </div>
              <div style={{ fontSize: 12.5, fontWeight: 600, marginTop: 4, lineHeight: 1.35 }}>{a.what}</div>
              <div style={{ fontSize: 11.5, color: "#5D594F", marginTop: 3, lineHeight: 1.45 }}>{a.note}</div>
            </div>
          </div>
        ))}
        {v.more && <div onClick={v.openAll} className="tmb-hover" style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 15px", borderTop: "1px solid #EFEBE1", fontSize: 12, fontWeight: 600, color: "#8A6D1E", cursor: "pointer" }}>{v.more}</div>}
      </div>
    );
  }

  // ── read ──────────────────────────────────────────────────────────────────
  if (v.isRead) {
    return (
      <div style={{ border: "1px solid #DFDAF7", borderRadius: 13, background: "#F9F8FE", padding: "13px 15px", minWidth: 0, flex: "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: "#4A3FA0", fontSize: 12 }}>✦</span>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: "#3A3184" }}>{v.title}</div>
        </div>
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: "#3E3A33", marginTop: 8 }}>{v.body}</div>
        <div onClick={v.askFn} style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 10, padding: "7px 13px", borderRadius: 9, border: "1px solid #D5CFF2", background: "#FFFFFF", fontSize: 11.5, fontWeight: 600, color: "#3A3184", cursor: "pointer" }}>Explore in Ask Paige →</div>
      </div>
    );
  }

  // ── note ──────────────────────────────────────────────────────────────────
  if (v.isNote) {
    return (
      <div style={{ border: "1px solid #E7E3D9", borderRadius: 13, background: "#FFFFFF", padding: "13px 15px", minWidth: 0, flex: "none" }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{v.title}</div>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: "#5D594F", marginTop: 7 }}>{v.body}</div>
        {v.cta && <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 10, padding: "8px 14px", borderRadius: 9, background: v.ctaBg, color: v.ctaColor, border: "1px solid " + v.ctaEdge, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>{v.cta}</div>}
      </div>
    );
  }

  return null;
}

export default TeamBlock;

// ═════════════════════════════════════════════════════════════════════════════
// TEAM render-logic cluster (deferred from Agency Shell.dc.html ~6730–7143).
// tmInit + the TM_* copy-derivation helpers + TM_SUB_DATA + TEAM_VIEW. Status
// colors route through the token TONE map (§11 theme-aware) instead of the design's
// raw TM_* hex. Cross-book banners reuse the static wording from fixtures'
// TEAM_VIEW_BANNERS; the per-sub `subBanner` is built dynamically inside TEAM_VIEW.
// ═════════════════════════════════════════════════════════════════════════════

// Status tokens (was TM_GREEN/AMBER/RED/BLUE hex — now theme-aware).
const S_GREEN = TONE.green, S_AMBER = TONE.amber, S_RED = TONE.red, S_BLUE = TONE.blue;

export const tmInit = n => n.split(" ").filter(w => /[A-Za-z]/.test(w[0])).slice(0, 2).map(w => w[0].toUpperCase()).join("");

// loadColor / utilColor are imported from _shared (identical thresholds, token
// return) — the design's tmLoadColor/tmUtilColor are those exact maps.
const tmLoadColor = loadColor;
const tmUtilColor = utilColor;

export const TM_TIGHT = (() => { const m = TEAM.slice().sort((a, b) => b.util - a.util)[0]; return { ...m, first: m.name.split(" ")[0] }; })();
export const TM_SLACK = (() => { const m = TEAM.filter(x => !x.newHire).slice().sort((a, b) => a.util - b.util)[0]; return { ...m, first: m.name.split(" ")[0] }; })();
export const TM_RESP_SUB = 3.2, TM_RESP_AGENCY = 2.4;

export const TM_BOOK = () => {
  const per = TEAM_SUBS.map(s => ({ s, d: TM_SUB_DATA(s) }));
  return {
    per,
    seats: per.reduce((a, x) => a + x.d.seats.length, 0),
    live: per.reduce((a, x) => a + x.d.seats.filter(z => z.invite === "live").length, 0),
    accounts: per.reduce((a, x) => a + x.d.accounts.length, 0),
    hours: per.reduce((a, x) => a + Math.round(x.s.booked * 0.9), 0)
  };
};
export const TM_ACCT_WORD = n => n + (n === 1 ? " account" : " accounts");
export const TM_SORTED_ACCTS = TEAM_ACCOUNTS.slice().sort((a, b) => parseInt(b.hrs) - parseInt(a.hrs));
export const TM_HEAVY = TM_SORTED_ACCTS[0];
export const TM_HEAVY2 = TM_SORTED_ACCTS[1];
export const TM_BOOKED = parseInt(TEAM_CAP.line);
export const TM_MOVE = (() => {
  const tightH = parseInt(TM_TIGHT.hours);
  const slackH = parseInt(TM_SLACK.hours);
  const slackCap = Math.round(slackH / (TM_SLACK.util / 100));
  const room = Math.max(0, slackCap - slackH);
  const owned = TEAM_ACCOUNTS.filter(a => a.owner === TM_TIGHT.name).sort((a, b) => parseInt(b.hrs) - parseInt(a.hrs));
  const acct = owned[0] || TM_SORTED_ACCTS[0];
  const h = parseInt(acct.hrs);
  const toSlack = Math.min(room, h);
  const toDept = h - toSlack;
  return {
    acct: acct.client, tightFirst: TM_TIGHT.first, slackFirst: TM_SLACK.first,
    tightH, slackH, slackCap, room, h, toSlack, toDept,
    tightAfter: tightH - h, slackAfter: slackH + toSlack
  };
})();
export const TM_MOVED = parseInt(TM_HEAVY.hrs) + parseInt(TM_HEAVY2.hrs);

// Per-sub-account team generator (was inline in Agency Shell). TM_SUB_PEOPLE is
// the pure data (fixtures); this is the render-logic that shapes it into roster /
// seat / account rows + a capacity line.
export function TM_SUB_DATA(sub) {
  const src = TM_SUB_PEOPLE[sub.name] || TM_SUB_PEOPLE["Sarah's Coaching Practice"];
  const perSeat = Math.max(1, Math.round(sub.cap / Math.max(1, sub.staff)));
  const rawSum = src.people.reduce((a, p) => a + p[2], 0);
  const scale = sub.booked / rawSum;
  const team = src.people.map(([name, role, raw], i) => {
    const hours = Math.max(1, Math.round(raw * scale));
    return {
      name, role, hours: hours + "h",
      util: Math.min(160, Math.round((hours / perSeat) * 100)),
      focus: src.clients[i] ? "Carrying " + src.clients[i][0].toLowerCase() : "Supporting the book",
      subs: src.clients[i] ? [src.clients[i][0]] : []
    };
  });
  const seats = team.map((m, i) => ({
    role: i === 0 ? "Owner" : i === 1 ? "Manager" : "Specialist",
    seat: i === 0 ? "Owner" : i === 1 ? "Manager" : "Specialist",
    title: m.role, dept: i === 0 ? "Leadership" : i === 1 ? "Client Success" : "Delivery",
    who: m.name, used: 1, of: 1, admin: i === 0,
    tz: sub.tz || "America/Chicago",
    mail: m.name.split(" ")[0].toLowerCase().replace(/[^a-z]/g, "") + "@" + src.domain,
    photo: i < 2, invite: i < team.length - 1 ? "live" : "unsent"
  }));
  const clientSum = src.clients.reduce((a, c) => a + parseInt(c[1]), 0);
  const cScale = sub.booked / clientSum;
  const accounts = src.clients.map(([client, hrs], i) => ({
    client, owner: team[Math.min(i, team.length - 1)].name, hrs: Math.max(1, Math.round(parseInt(hrs) * cScale)) + "h",
    rate: "$" + (128 + i * 46), paige: i % 2 ? "Client Success" : "Client Success, Marketing",
    load: team[Math.min(i, team.length - 1)].util > 110 ? "Upside down" : team[Math.min(i, team.length - 1)].util > 95 ? "Heavy" : team[Math.min(i, team.length - 1)].util > 70 ? "Balanced" : "Light"
  }));
  return { team, seats, accounts, cap: { line: sub.booked + "h of " + sub.cap + "h booked", note: sub.name + "'s own team." } };
}

// TEAM_VIEW — the per-scope view-descriptor builder. Returns { title, sub,
// scopeNote, banner, center:[blocks], rail:[blocks] } for a (tab, scope, picked)
// triple. `banner` IS what the teamData consumer surfaces as `tmBanner`; the
// per-sub `subBanner` is built dynamically here. Cross-book static banners reuse
// TEAM_VIEW_BANNERS (fixtures). scope ∈ {agency, book, sub}.
export function TEAM_VIEW(tab, scope, picked, short, gold) {
  const SRC = scope === "sub"
    ? TM_SUB_DATA(picked)
    : { team: TEAM, seats: TEAM_SEATS, accounts: TEAM_ACCOUNTS, cap: TEAM_CAP };
  const T = SRC.team, S = SRC.seats, A = SRC.accounts, CAP = SRC.cap;
  const R = scope === "sub" ? S : TEAM_ROLES;
  const subBanner = scope === "sub" ? "No per-tenant team substrate is confirmed — " + picked.name + "'s figures here are stand-ins, not platform figures." : null;
  const readOnly = scope === "sub";
  const who = readOnly ? picked.name : "your agency";
  const scopeNote = scope === "agency"
    ? "Your agency's own team. Each sub-account's team lives inside their workspace."
    : scope === "book"
      ? "Aggregate across the book. Observe patterns, propose moves — you can't edit their teams from here."
      : "You're observing " + picked.name + "'s team. Changes go to their owner as a proposal.";

  const read = (title, body) => ({ type: "read", title, body });
  const note = (title, body, cta) => ({ type: "note", title, body, cta });
  const stats = items => ({ type: "stats", items });
  const bars = (title, sub, rows, foot) => ({ type: "bars", title, sub, rows, foot });
  const table = (title, sub, head, rows, foot) => ({ type: "table", title, sub, head, rows, foot });
  const rows = (title, sub, list) => ({ type: "rows", title, sub, list });
  const feed = (title, sub, list) => ({ type: "feed", title, sub, list, filters: ["Everything", "Paige", "People"] });
  const profiles = (title, sub, list) => ({ type: "profiles", title, sub, list });
  const roledef = o => ({ type: "roledef", ...o });
  const invites = o => ({ type: "invites", ...o });
  const capacity = (title, sub, list) => ({ type: "capacity", title, sub, list });

  const proposeCta = readOnly ? "Propose to " + picked.name.split(" ")[0] : null;

  if (tab === "roster") {
    if (scope === "book") {
      const over = TEAM_SUBS.filter(s => s.booked > s.cap).length;
      const under = TEAM_SUBS.filter(s => s.booked < s.cap * 0.75).length;
      return {
        title: "Roster", sub: "Every sub-account's team size and capacity, side by side.",
        scopeNote, banner: TEAM_VIEW_BANNERS.roster,
        center: [
          stats([
            { label: "STAFF ACROSS BOOK", value: String(TEAM_SUBS.reduce((a, s) => a + s.staff, 0)), note: "in " + TEAM_SUBS.length + " sub-accounts" },
            { label: "CAPACITY", value: TEAM_SUBS.reduce((a, s) => a + s.cap, 0) + "h", note: TEAM_SUBS.reduce((a, s) => a + s.booked, 0) + "h booked" },
            { label: "OVERLOADED", value: String(over), note: "over 100% capacity", tone: S_RED },
            { label: "UNDER-USED", value: String(under), note: "below 75% booked", tone: S_GREEN }
          ]),
          rows("Team size and load by sub-account", "Click a row to observe that team.", TEAM_SUBS.map(s => ({
            name: s.name, color: s.color, initials: tmInit(s.name),
            line: s.staff + " on the team · " + s.booked + "h booked of " + s.cap + "h",
            value: Math.round((s.booked / s.cap) * 100) + "%",
            meta: s.booked > s.cap ? "over" : s.booked < s.cap * 0.75 ? "room to spare" : "healthy",
            dot: s.booked > s.cap ? S_RED : s.booked < s.cap * 0.75 ? S_GREEN : S_AMBER,
            pct: Math.min(100, Math.round((s.booked / s.cap) * 100))
          })))
        ],
        rail: [
          read("Cross-book team health", "Three sub-account teams are over 100%. Coach James's has been over for six weeks running, and his response time is the only one trending the wrong way. Sarah's team is 40 hours under — the same skill set, idle."),
          note("Unfilled seats", "Four sub-accounts invited someone and never onboarded them. The nudge is written for each.", "Send all four nudges")
        ]
      };
    }
    const list = T.map(m => ({
      name: m.name, color: readOnly ? picked.color : "#7C6CE0", initials: tmInit(m.name),
      line: m.role + " · " + m.focus,
      value: m.hours, meta: m.util + "% of capacity",
      dot: tmUtilColor(m.util), pct: Math.min(100, m.util),
      tail: m.subs.length ? m.subs.length + (m.subs.length === 1 ? " account" : " accounts") : "no accounts"
    }));
    return {
      title: "Roster", sub: "Everyone doing the work — the people you hired and the departments she runs.",
      scopeNote, banner: subBanner,
      center: [
        stats([
          { label: "SEATS", value: String(S.length), note: S.filter(x => x.invite === "live").length + " live, " + S.filter(x => x.invite !== "live").length + " invited" },
          { label: "DEPARTMENTS SHE RUNS", value: String(DEPTS.length), note: "under your autonomy tiers" },
          { label: "BOOKED", value: CAP.line.split(" of ")[0], note: "against " + CAP.line.split(" of ")[1].replace(" booked", " contracted") },
          { label: "OVER CAPACITY", value: String(T.filter(m => m.util > 95).length), note: "seats over 95%", tone: S_RED }
        ]),
        rows(readOnly ? picked.name + "'s roster" : "Who is carrying the work", readOnly ? "Read-only. Propose changes to their owner." : "People first, then the departments she covers.", list)
      ],
      rail: [
        read("Where the team is thin", readOnly
          ? picked.name + " has one seat carrying four accounts and one seat that has never signed in. Their owner hasn't seen this yet — the summary is drafted."
          : TM_TIGHT.name + " is at " + TM_TIGHT.util + "% and carrying " + TM_ACCT_WORD(TM_TIGHT.subs.length) + ", while " + TM_SLACK.first + " sits at " + TM_SLACK.util + "% with " + (TM_SLACK.subs.length ? "only " + TM_ACCT_WORD(TM_SLACK.subs.length) : "no accounts") + ". The Advisor seat still has no invite out."),
        note(readOnly ? "What you can do here" : "What she would fix first",
          readOnly ? "You can observe and propose. Their owner approves anything that changes their team." : "Send the Advisor invite, then move " + TM_MOVE.acct + " off " + TM_MOVE.tightFirst + " — " + TM_MOVE.toSlack + "h of it is all " + TM_MOVE.slackFirst + " has room for, so the other " + TM_MOVE.toDept + "h goes to Finance. The full move is on the Workload tab.",
          proposeCta || "Send the Advisor invite")
      ]
    };
  }

  if (tab === "directory") {
    const withPhoto = S.filter(s => s.photo).length;
    return {
      title: "Directory", sub: "Team members only. Photos, contact details, role and reporting line.",
      scopeNote, banner: subBanner,
      center: [
        profiles(readOnly ? picked.name + "'s directory" : "Team directory",
          readOnly ? "Read-only — profile changes go through their owner." : "Team members only — full profiles, editable.",
          S.map(s => ({
            name: s.who, initials: tmInit(s.who), color: readOnly ? picked.color : "#7C6CE0",
            role: s.title, mail: s.mail, tz: s.tz, photo: s.photo,
            badges: [
              { label: s.seat, kind: "role" },
              { label: s.dept, kind: "dept" },
              { label: s.invite === "live" ? "Live" : "Invited", kind: s.invite === "live" ? "live" : "invited" }
            ],
            cta: readOnly ? "Propose edit" : "Edit profile",
            dot: s.invite === "live" ? S_GREEN : S_AMBER
          })))
      ],
      rail: [
        invites({
          title: "Profile health", sub: "What's missing before they start",
          statLabel: "PHOTOS ON FILE", statValue: withPhoto + " of " + S.length,
          pct: Math.round((withPhoto / S.length) * 100),
          statNote: "Photos show up on client-facing recaps and the contact sheet she embeds. Open a profile to drop one in.",
          list: S.filter(s => !s.photo || s.invite !== "live").slice(0, 4).map(s => ({
            name: s.who, initials: tmInit(s.who), color: readOnly ? picked.color : "#7C6CE0",
            state: s.invite === "live" ? "No photo on file" : "Invite never sent",
            cta: s.invite === "live" ? "Upload" : "Send"
          })),
          foot: "Outside professionals — CPA, attorney, insurance broker, registered agent — are kept in Setup, not here."
        })
      ]
    };
  }

  if (tab === "roles") {
    return {
      title: "Roles & invites", sub: "What each role is responsible for, what it unlocks, and who can invite into it.",
      scopeNote, banner: subBanner,
      center: [
        roledef({
          title: R[0].role, sub: "Role definition and what it reaches",
          adminBadge: R[0].admin ? "Admin role" : null,
          seatLine: R[0].used + " of " + R[0].of + " seats used · " + (readOnly ? "all " + A.length + " engagements" : "all " + TEAM_ACCOUNTS.length + " accounts"),
          body: "Runs the business and answers for it. The only seat that can move autonomy or open sealed records.",
          editCta: readOnly ? "Propose a change" : "Edit role",
          inviteCta: readOnly ? null : "Invite to this role",
          responsibilities: [
            "Sets every department's autonomy level",
            "Approves anything she drafts above draft-only",
            "Owns pricing, contracts and repricing conversations",
            "Signs off on new seats and role changes",
            "Reads the books monthly"
          ],
          depts: ["All departments"],
          unlocks: [
            { label: "Change autonomy", val: "Yes" },
            { label: "Open sealed records", val: "Yes" },
            { label: "Export client data", val: "Yes" },
            { label: "Invite and remove seats", val: "Yes" }
          ]
        })
      ],
      rail: [
        invites({
          title: "Roles", sub: R.length + " defined · " + R.filter(s => s.used > 0).length + " filled",
          roleList: R.map(s => ({
            role: s.role, who: s.who + (s.invite === "live" ? "" : " (invited)"),
            initials: s.role[0], seats: s.used + " of " + s.of,
            admin: s.admin ? "Admin" : null,
            color: readOnly ? picked.color : "#7C6CE0"
          })),
          openTitle: "OPEN INVITES",
          list: R.filter(s => s.invite !== "live").map(s => ({
            name: s.who, initials: tmInit(s.who), color: readOnly ? picked.color : "#7C6CE0",
            state: s.role + " · never sent", cta: "Send"
          })),
          bigCta: readOnly ? proposeCta : "Invite someone"
        })
      ]
    };
  }

  if (tab === "workload") {
    if (scope === "book") {
      return {
        title: "Workload", sub: "Where the book's hours sit, and which teams are carrying more than they can.",
        scopeNote, banner: TEAM_VIEW_BANNERS.workload,
        center: [
          stats([
            { label: "BOOK CAPACITY", value: TEAM_SUBS.reduce((a, s) => a + s.cap, 0) + "h", note: "across " + TEAM_SUBS.length + " teams" },
            { label: "BOOKED", value: Math.round((TEAM_SUBS.reduce((a, s) => a + s.booked, 0) / TEAM_SUBS.reduce((a, s) => a + s.cap, 0)) * 100) + "%", note: "of book capacity" },
            { label: "OVERLOADED", value: String(TEAM_SUBS.filter(s => s.booked > s.cap).length), note: "teams over 100%", tone: S_RED },
            { label: "IDLE HOURS", value: TEAM_SUBS.filter(s => s.booked < s.cap).reduce((a, s) => a + (s.cap - s.booked), 0) + "h", note: "unbooked across the book", tone: S_GREEN }
          ]),
          bars("Utilization by sub-account team", "Anything past the line is over capacity.", TEAM_SUBS.map(s => ({
            label: s.name, val: Math.round((s.booked / s.cap) * 100) + "%",
            pct: Math.min(100, Math.round((s.booked / s.cap) * 78)),
            color: s.booked > s.cap ? S_RED : s.booked < s.cap * 0.75 ? S_GREEN : S_AMBER
          })))
        ],
        rail: [
          read("Her read across the book", "Coach James's team is 22 hours over and Sarah's is 40 under — same skills, opposite problems. A shared resource pool between them would fix both without a hire."),
          note("Drafted, not applied", "Two book-wide moves are written: a shared pool for Sarah and Coach James, and Finance routed to her on green tier for the four smallest teams.", "See the math")
        ]
      };
    }
    return {
      title: "Workload", sub: "What each account costs in hours, who owns it, and where the load is wrong.",
      scopeNote, banner: subBanner,
      center: [
        table(readOnly ? picked.name + "'s accounts" : "Account assignment", readOnly ? "Read-only. Rebalances go to their owner as a proposal." : "Sorted by worst ratio of hours to effective rate.",
          ["CLIENT", "OWNER", "HRS/MO", "EFF. RATE", "SHE HANDLES", "LOAD"],
          A.map(a => ({
            cells: [a.client, a.owner, a.hrs, a.rate, a.paige, a.load],
            pill: a.load, tone: tmLoadColor(a.load)
          })), (() => {
            const sorted = A.slice().sort((x, y) => parseInt(y.hrs) - parseInt(x.hrs));
            const a0 = sorted[0], a1 = sorted[1];
            return "Her read: " + a0.client + " and " + a1.client + " take " + (parseInt(a0.hrs) + parseInt(a1.hrs)) + " hours a month between them, on " + (a0.owner === a1.owner ? "one seat" : "two seats") + ". Those two are the whole capacity problem.";
          })())
      ],
      rail: [
        capacity("Rebalance", "Drafted, not applied", T.slice(0, 5).map(m => ({
          name: m.name, initials: tmInit(m.name), color: readOnly ? picked.color : "#7C6CE0",
          val: m.hours, max: Math.round(parseInt(m.hours) / (m.util / 100)) + "h",
          pct: Math.min(100, m.util * 0.78), tone: tmUtilColor(m.util)
        }))),
        note(readOnly ? "Her proposal, for their owner" : "Her proposal", readOnly
          ? "Move two accounts off the seat that's over capacity and hand invoicing to Finance. Drafted in their owner's name — they approve, not you."
          : "Move " + TM_MOVE.acct + " off " + TM_MOVE.tightFirst + ". " + TM_MOVE.toSlack + "h of it fits " + TM_MOVE.slackFirst + "'s free capacity and the remaining " + TM_MOVE.toDept + "h of invoicing goes to Finance, which is the only part that leaves the team. " + TM_MOVE.tightFirst + " comes down from " + TM_MOVE.tightH + "h to " + TM_MOVE.tightAfter + "h and " + TM_MOVE.slackFirst + " sits at " + TM_MOVE.slackAfter + "h of her " + TM_MOVE.slackCap + "h.",
          readOnly ? proposeCta : "✓ Apply the move")
      ]
    };
  }

  if (tab === "performance") {
    if (scope === "book") {
      const BK = TM_BOOK();
      return {
        title: "Performance", sub: "Closed work and hours returned, across every team in the book.",
        scopeNote, banner: TEAM_VIEW_BANNERS.performance,
        center: [
          stats([
            { label: "ACCOUNTS ACROSS BOOK", value: String(BK.accounts), note: "carried by " + TEAM_SUBS.reduce((a, s) => a + s.staff, 0) + " people" },
            { label: "HOURS SHE RETURNED", value: BK.hours + "h", note: "this month, all teams" },
            { label: "BOOK RESPONSE TIME", value: TM_RESP_SUB + "h", note: "median across the book" },
            { label: "SEATS LIVE", value: BK.live + " of " + BK.seats, note: (BK.seats - BK.live) + " invites unopened", tone: S_AMBER }
          ]),
          bars("Hours returned by sub-account team", "Ranked by hours she gave back this month.", BK.per
            .map(x => ({ label: x.s.name, hours: Math.round(x.s.booked * 0.9), color: x.s.color }))
            .sort((a, b) => b.hours - a.hours)
            .map((x, i, arr) => ({ label: x.label, val: x.hours + "h", pct: Math.round((x.hours / arr[0].hours) * 90), color: x.color })))
        ],
        rail: [
          read("What the book has in common", "The four teams with Finance on draft-and-send returned twice the hours of the four keeping it on ask-first. The tier is the variable, not the team."),
          note("Worth proposing", "Raising Finance to draft-and-send for the four ask-first teams would return roughly 90 hours a month across the book.", "Draft the four proposals")
        ]
      };
    }
    const max = TEAM_PERF[0].closed;
    return {
      title: "Performance", sub: "Closed work, hours returned, and the honest numbers per department.",
      scopeNote, banner: subBanner,
      center: [
        stats([
          { label: "ACCOUNTS CARRIED", value: A.length + " of " + A.length, note: "across " + T.length + " seats", tone: S_RED },
          { label: "HOURS SHE RETURNED", value: (readOnly ? Math.round(picked.booked * 0.9) : 204) + "h", note: "this month, " + DEPTS.length + " departments", tone: S_GREEN },
          { label: "RESPONSE TIME", value: (readOnly ? TM_RESP_SUB : TM_RESP_AGENCY) + "h", note: readOnly ? "their own median this month" : "down from 6.1h before her", tone: S_BLUE },
          { label: "SEATS LIVE", value: S.filter(x => x.invite === "live").length + " of " + S.length, note: S.filter(x => x.invite !== "live").length + " invite unopened", tone: S_AMBER }
        ]),
        readOnly
          ? bars("Hours by engagement", "Per-tenant department output isn't available — this is where their hours sit.", A.map((a, i) => ({
              label: a.client, val: a.hrs, pct: Math.round((parseInt(a.hrs) / Math.max(1, parseInt(A[0].hrs))) * 90), color: picked.color
            })))
          : bars("Items closed and hours returned", "By department, this month against last.", TEAM_PERF.map(p => ({
              label: p.dept, val: p.closed + " closed", hours: "+" + p.hours, pct: Math.round((p.closed / max) * 92),
              color: p.tier === "Draft and send" ? S_GREEN : p.tier === "Ask first" ? S_AMBER : "#7C6CE0", tail: p.tier
            })), "Her read: the two departments on draft-and-send closed " + (TEAM_PERF[0].closed + TEAM_PERF[2].closed) + " items between them without asking you anything. The draft-only ones are where the queues are.")
      ],
      rail: [
        read("Her read on the numbers", readOnly
          ? picked.name + "'s two draft-and-send departments closed three times what their ask-first ones did. Same workload, different tier."
          : "The two departments on draft-and-send closed three times what the draft-only ones did. Sales is still draft-only and it's the slowest surface you have."),
        note("The move", readOnly ? "Raising their Sales department a tier is drafted for their owner." : "Raise Sales to ask-first for a month and compare. Nothing sends without you either way.", readOnly ? proposeCta : "Raise Sales a tier")
      ]
    };
  }

  // tab === "activity"
  const acts = scope === "book"
    ? TEAM_ACTS
    : scope === "sub"
      ? TEAM_ACTS.slice(0, 4).map((a, i) => ({
          ...a,
          who: a.kind === "person" ? T[i % T.length].name : a.who,
          tenant: picked.name, color: picked.color
        }))
      : TEAM_ACTS.filter(a => a.tenant === "Agency" || a.kind === "person");
  return {
    title: "Activity", sub: "A single timeline of what people did and what she did on her own.",
    scopeNote,
    banner: scope === "book" ? TEAM_VIEW_BANNERS.activity : subBanner,
    center: [
      feed(scope === "book" ? "Everything moving across the book" : readOnly ? picked.name + "'s activity" : "What the team did",
        scope === "book" ? "Every sub-account and the agency, in one stream." : "People and departments on one timeline.",
        acts.map(a => ({
          who: a.who, what: a.what, note: a.note, when: a.when,
          badge: a.kind === "person" ? "person" : "department",
          badgeBg: a.kind === "person" ? "#F1EEE5" : "#EDEAFB",
          badgeColor: a.kind === "person" ? "#5D594F" : "#4A3FA0",
          tenant: scope === "book" ? a.tenant : null, color: a.color
        })))
    ],
    rail: [
      read("What she noticed", scope === "book"
        ? "Ridgeline had three autonomy escalations today, all in Operations. Every other team had none — worth a look at how their tiers are set."
        : readOnly ? picked.name + " has had no human action in four days. Everything moving there is hers, under the tiers their owner set."
          : "Two thirds of today's motion was hers, all inside the tiers you set. The escalation in Operations is the only thing that waited on a person."),
      note("Volume", scope === "book" ? "142 events across the book today, against a 96-event average. The spike is Ridgeline's pixel fix." : "38 events today, against a 24-event average.", null)
    ]
  };
}
