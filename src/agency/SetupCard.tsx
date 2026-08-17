// @ts-nocheck
// Agency pack — SetupCard + SETUP_VIEW. FAITHFUL port of the Claude Design
// "CRM agency mode" pack (owner-locked 2026-08-17, §28/§63: "We do not drift off
// this whatsoever"). Source: "Setup Card.dc.html" (the presentational block, 5
// layout modes) + the SETUP_VIEW render-logic builder grepped out of
// "Agency Shell.dc.html" (line 7566).
//
// This is Slice 1a — the presentational component + its view-descriptor builder.
// It mounts NOTHING. SetupCard EMITS trigger callbacks (openExpand / openEdit)
// that the parent (AgencyApp, Slice 1b) passes down on each card descriptor; it
// does NOT author the pop-out / edit chrome itself.
//
// DCLogic → React conversion only ({{ }} → { }, <sc-if>/<sc-for> → JSX,
// renderVals() → derived-in-render). No unpkg/Babel/new Function/eval (CSP/§34),
// no @/components/ui import. Decorative names (Cook & Co / Antonio Cook /
// Ridgeline / Meridian / Bellweather …) are kept verbatim per §63; §50 clean.
//
// The design hardcodes its own warm palette in inline styles; a faithful port
// keeps those exact values — this is Claude Design's card, not a token re-skin.
import React from "react";
import {
  BRAND, AGENCY, AGENCY_OPERATOR, DEPARTMENTS, TEAM, TEAM_SEATS,
  SETUP_BENCH, SETUP_ENTITIES,
} from "./fixtures";

// tmInit — render-logic initials helper (Agency Shell.dc.html line 6734), kept
// local because it is view logic, not fixture data.
const tmInit = (n) =>
  (n || "").split(" ").filter((w) => /[A-Za-z]/.test(w[0] || "")).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join("");

// CAP_LABEL — the design's ALL-CAPS field-label detector (Setup Card.dc.html).
const CAP_LABEL = (s) => /^[A-Z0-9 /·&]+$/.test(s || "");

// Hover rules ported from the design's `style-hover` attributes (which have no
// React inline-style equivalent). Scoped classes, injected once per card mount.
const SETUP_CARD_HOVER = `
.agc-setup-act:hover{background:#F5F2EA}
.agc-setup-lrow:hover{background:#FBFAF6}
.agc-setup-more:hover{background:#FBFAF6}
`;

// ---------------------------------------------------------------------------
// SetupCard — presentational card with 5 layout modes (fields / checks / list /
// person / tree). Faithful port of the DC <x-dc> template + renderVals().
//
// props.card = the view-descriptor (from SETUP_VIEW), carrying:
//   title, note, foot, sealedHead, actions[], type, rows[], person, tree[],
//   compact, tighter, rowCap, openExpand(), openEdit(mode)
// ---------------------------------------------------------------------------
export function SetupCard({ card }) {
  const c = card || {};

  // ---- renderVals() port ------------------------------------------------
  const cap = c.rowCap == null ? 99 : c.rowCap;
  const all = c.rows || [];
  const urgent = (t) => t === "#B5822A" || t === "#9F3A2A";
  const ordered =
    cap < all.length
      ? all.slice().sort(
          (a, b) =>
            (urgent(b.stateTone) || b.pill ? 1 : 0) -
            (urgent(a.stateTone) || a.pill ? 1 : 0)
        )
      : all;
  const rowsSlice = ordered.slice(0, cap);
  const trimmed = all.length > rowsSlice.length;
  const expand = c.openExpand || (() => {});
  const edit = c.openEdit || (() => {});

  const acts = (c.actions || []).map((a) => ({
    label: a,
    glyph:
      a === "Expand" ? "⤢"
      : a === "Add" ? "＋"
      : a === "Edit" ? "✎"
      : a === "Roles" ? "⛉"
      : a === "Manage" ? "⚙"
      : null,
    onClick:
      a === "Expand" ? expand
      : a === "Add" ? () => edit("Add")
      : () => edit("Edit"),
  }));
  if (trimmed && c.compact) {
    const already = acts.findIndex((a) => a.label === "Expand");
    const chip = { label: "All " + all.length, glyph: "⤢", onClick: expand };
    if (already >= 0) acts[already] = chip;
    else acts.push(chip);
  }

  const footShown = c.foot && !c.compact;
  const moreLabel = trimmed && !c.compact ? "View all " + all.length + " →" : null;
  const rowEdit = () => edit("Edit");

  const isFields = c.type === "fields";
  const isChecks = c.type === "checks";
  const isList = c.type === "list";
  const isPerson = c.type === "person";
  const isTree = c.type === "tree";

  const fieldCols =
    c.compact && all.length > 2 ? "repeat(2,minmax(0,1fr))"
    : all.length > 2 ? "repeat(2,minmax(0,1fr))"
    : "repeat(2,minmax(0,1fr))";
  const person = c.person || {};
  const headPad = c.tighter ? "7px 13px 5px" : c.compact ? "10px 14px 8px" : "15px 16px 12px";
  const rowPad = c.tighter ? "3px 0" : c.compact ? "6px 0" : "10px 0";
  const noteSize = c.compact ? "11px" : "12px";
  const bodyPad = c.tighter ? "0 13px 6px" : c.compact ? "0 14px 10px" : "0 16px 14px";
  const avatarSize = c.compact ? "42px" : "52px";
  const checkGap = c.compact ? "6px" : "9px";
  const titleSize = c.compact ? "13.5px" : "15px";

  const rows = rowsSlice.map((r) => ({
    ...r,
    plainSealed: r.sealed && !r.glyph && !r.initials ? true : false,
    labelSize: CAP_LABEL(r.label) && !r.plain ? "9.5px" : r.who ? "9.5px" : "13px",
    labelTrack: CAP_LABEL(r.label) || r.who ? ".13em" : "0",
    labelColor: CAP_LABEL(r.label) || r.who ? "#8A8478" : "#1B1B1F",
    labelWeight: r.who ? "600" : "500",
    stacked: r.value != null && !r.plain,
    stateBg: r.stateTone ? r.stateTone + "1A" : "#F1EEE5",
    stateColor: r.stateTone || "#5D594F",
    pillBg: r.pill === "Gap" ? "#FBF3DC" : "#FDF3E4",
    pillColor: r.pill === "Gap" ? "#6E5514" : "#8A6D1E",
  }));

  const treeRows = (c.compact ? (c.tree || []).slice(0, 2) : c.tree || []).map((t) => ({
    ...t,
    indent: t.depth * 18 + "px",
    bg: t.depth === 0 ? "#F1EEFC" : "#FFFFFF",
    edge: t.depth === 0 ? "#DFDAF7" : "#EFEBE1",
    tint: t.depth === 0 ? "#4A3FA0" : "#EDEAFB",
    color: t.depth === 0 ? "#FFFFFF" : "#4A3FA0",
  }));

  // ---- template port ----------------------------------------------------
  return (
    <div style={{ border: "1px solid #E7E3D9", borderRadius: 14, background: "#FFFFFF", display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
      <style>{SETUP_CARD_HOVER}</style>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: headPad }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div title={c.note} style={{ fontSize: titleSize, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.title}</div>
            {c.sealedHead && <span title="Sealed record" style={{ color: "#8A8478", fontSize: 11, flex: "none" }}>⚿</span>}
          </div>
          <div style={{ fontSize: noteSize, color: "#8A8478", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.note}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 7, flex: "none" }}>
          {acts.map((a, i) => (
            <div key={i} className="agc-setup-act" onClick={a.onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 9, border: "1px solid #E2DED3", background: "#FFFFFF", fontSize: 11.5, fontWeight: 600, color: "#3E3A33", cursor: "pointer", whiteSpace: "nowrap" }}>
              {a.glyph && <span style={{ fontSize: 10, color: "#8A8478" }}>{a.glyph}</span>}
              {a.label}
            </div>
          ))}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", padding: bodyPad }}>
        {/* ---- fields mode ---- */}
        {isFields && (
          <div style={{ display: "grid", gridTemplateColumns: fieldCols, gap: "12px 18px" }}>
            {rows.map((r, i) => (
              <div key={i} style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                  {r.dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: r.dot, flex: "none" }} />}
                  <div style={{ fontSize: r.labelSize, fontWeight: 600, letterSpacing: r.labelTrack, color: r.labelColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</div>
                  {r.plain && <div style={{ marginLeft: "auto", fontSize: 12.5, color: "#3E3A33", flex: "none", whiteSpace: "nowrap" }}>{r.value}</div>}
                </div>
                {r.stacked && (
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 5, minWidth: 0 }}>
                    {r.sealed && <span style={{ color: "#8A8478", fontSize: 11, flex: "none" }}>⚿</span>}
                    <div style={{ fontSize: 13.5, color: "#1B1B1F", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.value}</div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ---- checks mode ---- */}
        {isChecks && (
          <div style={{ display: "flex", flexDirection: "column", gap: checkGap }}>
            {rows.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <span style={{ color: "#2F7A57", fontSize: 11.5, flex: "none" }}>✓</span>
                <span style={{ fontSize: 13, color: "#1B1B1F", minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</span>
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#6E6A61", flex: "none", whiteSpace: "nowrap" }}>{r.val}</span>
              </div>
            ))}
          </div>
        )}

        {/* ---- list mode ---- */}
        {isList && (
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rows.map((r, i) => (
              <div key={i} className="agc-setup-lrow" onClick={rowEdit} style={{ display: "flex", alignItems: "center", gap: 11, padding: rowPad, borderTop: "1px solid #F3F0E8", minWidth: 0, cursor: "pointer" }}>
                {r.glyph && <span style={{ width: 26, height: 26, borderRadius: 8, background: "#EDEAFB", color: "#4A3FA0", display: "grid", placeItems: "center", fontSize: 11, flex: "none" }}>{r.glyph}</span>}
                {r.initials && <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#EDEAFB", color: "#4A3FA0", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 700, flex: "none" }}>{r.initials}</span>}
                {r.plainSealed && <span style={{ color: "#8A8478", fontSize: 11, flex: "none" }}>⚿</span>}
                {r.dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: r.dot, flex: "none" }} />}
                <div style={{ minWidth: 60, flex: "1 1 auto", overflow: "hidden" }}>
                  <div style={{ fontSize: r.labelSize, fontWeight: r.labelWeight, letterSpacing: r.labelTrack, color: r.labelColor, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.label}</div>
                  {r.who && <div style={{ fontSize: 13, fontWeight: 600, color: "#1B1B1F", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.who}</div>}
                </div>
                {r.access && <span style={{ fontSize: 12, color: "#6E6A61", flex: "none", whiteSpace: "nowrap" }}>{r.access}</span>}
                {r.state && <span style={{ padding: "3px 10px", borderRadius: 20, background: r.stateBg, color: r.stateColor, fontSize: 11, fontWeight: 600, flex: "none", whiteSpace: "nowrap" }}>{r.state}</span>}
                {r.pill && <span style={{ padding: "3px 10px", borderRadius: 20, background: r.pillBg, color: r.pillColor, fontSize: 11, fontWeight: 600, flex: "none", whiteSpace: "nowrap" }}>{r.pill}</span>}
                {r.meta && <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: "#8A8478", flex: "none", whiteSpace: "nowrap" }}>{r.meta}</span>}
                {r.chev && <span style={{ color: "#B2ADA2", fontSize: 12, flex: "none" }}>›</span>}
              </div>
            ))}
          </div>
        )}

        {/* ---- person mode ---- */}
        {isPerson && (
          <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <div style={{ width: avatarSize, height: avatarSize, borderRadius: "50%", background: "#4A3FA0", color: "#FFFFFF", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 700, flex: "none" }}>{person.initials}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.name}</div>
              <div style={{ fontSize: 13, color: "#5D594F", marginTop: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.role}</div>
              <div style={{ fontSize: 13, color: "#5D594F", marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{person.mail}</div>
            </div>
          </div>
        )}

        {/* ---- tree mode ---- */}
        {isTree && (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {treeRows.map((t, i) => (
              <div key={i} style={{ marginLeft: t.indent, display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", border: "1px solid " + t.edge, borderRadius: 11, background: t.bg, minWidth: 0 }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: t.tint, color: t.color, display: "grid", placeItems: "center", fontSize: 10, fontWeight: 700, flex: "none" }}>{t.initials}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "#6E6A61", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.role}</div>
                </div>
                <span style={{ marginLeft: "auto", padding: "2px 9px", borderRadius: 20, background: "#F1EEE5", color: "#4A463E", fontSize: 10.5, fontWeight: 600, flex: "none", whiteSpace: "nowrap" }}>{t.tag}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* moreLabel */}
      {moreLabel && (
        <div className="agc-setup-more" onClick={expand} style={{ padding: "9px 16px", borderTop: "1px solid #EFEBE1", fontSize: 12, fontWeight: 600, color: "#8A6D1E", cursor: "pointer" }}>{moreLabel}</div>
      )}

      {/* foot */}
      {footShown && (
        <div style={{ padding: "10px 16px", borderTop: "1px solid #EFEBE1", background: "#FBFAF6", fontSize: 11.5, lineHeight: 1.5, color: "#5D594F" }}>{c.foot}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SETUP_VIEW — the view-descriptor builder (Agency Shell.dc.html line 7566).
// Given a Setup tab key it returns { title, sub, cards[] }, each card being a
// SetupCard descriptor. Faithful port; `gold` param kept for signature parity
// (the design passes it but SETUP_VIEW does not read it). openExpand/openEdit
// are wired onto each card by the parent (Slice 1b), not here.
// ---------------------------------------------------------------------------
export function SETUP_VIEW(tab, gold) {
  const fields = (rows) => ({ type: "fields", rows });
  const checks = (rows) => ({ type: "checks", rows });
  const list = (rows) => ({ type: "list", rows });

  if (tab === "presence") {
    return {
      title: "Presence",
      sub: "How the business appears in public — listings, ratings, industry codes, and brand.",
      cards: [
        { title: "Public listings", note: "Where the business is listed and claimed", actions: ["Edit", "Expand"], ...list([
          { label: "Google Business Profile", state: "Verified", dot: "#2F7A57" },
          { label: "Bing Places", state: "Claimed", dot: "#2F7A57" },
          { label: "Apple Business Connect", state: "Claimed", dot: "#2F7A57" },
          { label: "Better Business Bureau", state: "A+ accredited", dot: "#2F7A57" },
        ]) },
        { title: "Reputation", note: "Ratings, and how she answers reviews", actions: ["Edit", "Expand"], ...fields([
          { label: "GOOGLE", value: "4.8 · 96 reviews" },
          { label: "CLUTCH", value: "4.9 · 22 reviews" },
          { label: "UNANSWERED", value: "2 · oldest 4 days" },
          { label: "REPLIES", value: "Draft for approval" },
        ]), foot: "Paige: two reviews are unanswered and the older one is four days out. Both replies are drafted." },
        { title: "Industry and codes", note: "What she files and quotes you as", actions: ["Edit", "Expand"], ...fields([
          { label: "PRIMARY NAICS", value: "541613" },
          { label: "SIC", value: "8742" },
          { label: "LICENCE", value: "ATL-2021-88431" },
          { label: "REGISTERED IN", value: "GA, DE, FL, TX" },
        ]) },
        { title: "Brand", note: "What replaces the platform mark in this workspace", actions: ["Edit", "Expand"], ...fields([
          { label: "WORKSPACE NAME", value: BRAND.agency.name },
          { label: "MARK", value: BRAND.agency.initials + " · gold" },
          { label: "LOGO FILE", value: "cook-mark.svg" },
          { label: "PLATFORM CREDIT", value: BRAND.agency.powered },
        ]), foot: "Paige: your mark and name are what the sidebar, the client portal and every send show. Each sub-account brands their own workspace the same way." },
      ],
    };
  }

  if (tab === "owner") {
    return {
      title: "Owner",
      sub: "Your profile, how she signs as you, access, and continuity.",
      cards: [
        { title: "Owner profile", note: "How she signs as you", actions: ["Edit", "Expand"], type: "person",
          person: { name: AGENCY_OPERATOR, initials: "AC", role: "Founder & Principal", mail: "antonio@agency.example" } },
        { title: "Access and recovery", note: "Two seats hold full access", actions: ["Edit", "Expand"], ...checks([
          { label: "Two-factor", val: "Authenticator · enrolled", ok: true },
          { label: "Login alerts", val: "On a new device", ok: true },
          { label: "Session length", val: "12 hours", ok: true },
        ]) },
        { title: "Reveal log", note: "Every time a sealed record was opened", actions: ["Expand"], ...list([
          { label: "EIN", who: "You", meta: "2d ago", sealed: true },
          { label: "GL policy number", who: "You", meta: "1w ago", sealed: true },
          { label: "Bank routing", who: "Nadia Osei", meta: "2w ago", sealed: true },
        ]) },
        { title: "Continuity", note: "If you are unavailable", sealedHead: true, actions: ["Edit", "Expand"], ...list([
          { label: "Emergency contact", state: "Sealed", sealed: true, chev: true },
          { label: "Successor access", state: "Marisol Reyes", dot: "#2F7A57", chev: true },
          { label: "Where key documents live", state: "Business Vault + Drive", dot: "#2F6B8F", chev: true },
          { label: "Broker of record", state: "Renee Hartwell", dot: "#B5822A", chev: true },
        ]), foot: "Continuity planning is informational. Consult counsel for your specific situation." },
      ],
    };
  }

  if (tab === "contacts") {
    return {
      title: "Contacts",
      sub: "Your accountant, attorney, broker, and agent — who she routes to.",
      cards: [
        { title: "Your professional bench", note: "Who she routes to and names in drafts", actions: ["Add", "Expand"], span: true, ...list(
          SETUP_BENCH.map((b) => ({ label: b.role, who: b.who, pill: b.pill, chev: true, glyph: b.pill === "Encrypted" ? "⚿" : b.pill === "Gap" ? "＋" : "◍" }))
        ), foot: "Paige: no bookkeeper on the bench, so reconciliation lands on you every month." },
        { title: "How she works with your bench", note: "What she may send, and what waits for you", actions: ["Edit", "Expand"], ...list([
          { label: "Contacting them directly", state: "Draft for approval", dot: "#B5822A" },
          { label: "Sharing financial records", state: "CPA and bookkeeper only", dot: "#2F6B8F" },
          { label: "Sharing client data", state: "Never without your approval", dot: "#2F7A57" },
          { label: "Copying you on every thread", state: "On", dot: "#2F7A57" },
        ]) },
        { title: "Engagements on file", note: "Letters, NDAs, and renewal dates", actions: ["Add", "Expand"], ...list([
          { label: "Engagement letter — CPA", who: "Dolores Ruiz, CPA", state: "Renews Apr 1", stateTone: "#2F7A57", chev: true, glyph: "▣" },
          { label: "Retainer — counsel", who: "Marcus Feld", state: "Renews Jan 1", stateTone: "#2F7A57", chev: true, glyph: "▣" },
          { label: "NDA — registered agent", who: "Northpoint Agents", state: "No expiry", stateTone: "#6E6A61", chev: true, glyph: "▣" },
          { label: "W-9 — bookkeeper", who: "Missing", state: "Gap", stateTone: "#B5822A", chev: true, glyph: "＋" },
        ]) },
      ],
    };
  }

  if (tab === "people") {
    return {
      title: "People",
      sub: "Seats, roles, reporting lines, and which departments each person can reach.",
      cards: [
        { title: "People", note: TEAM_SEATS.filter((s) => s.invite === "live").length + " of " + TEAM_SEATS.length + " seats in use · click a person to manage access",
          actions: ["Roles", "Expand"], span: true, ...list(TEAM_SEATS.map((s, i) => ({
            label: s.who,
            who: s.title + " · " + s.dept,
            access: i === 0 ? "Full access" : i < 3 ? "Standard" : "Limited",
            sealed: i === 0,
            state: s.invite === "live" ? "Active" : "Invited",
            stateTone: s.invite === "live" ? "#2F7A57" : "#B5822A",
            initials: tmInit(s.who),
            chev: true,
          }))) },
        { title: "Hierarchy", note: "Who reports to whom", actions: ["Expand"], type: "tree", tree: [
          { name: AGENCY_OPERATOR, role: "Founder & Principal", tag: "Owner", depth: 0, initials: "AC" },
          { name: TEAM[0].name, role: TEAM[0].role, tag: "Employee", depth: 1, initials: tmInit(TEAM[0].name) },
          { name: TEAM[3].name, role: TEAM[3].role, tag: "Employee", depth: 2, initials: tmInit(TEAM[3].name) },
          { name: TEAM[1].name, role: TEAM[1].role, tag: "Contractor", depth: 1, initials: tmInit(TEAM[1].name) },
        ] },
        { title: "Access and sign-in", note: "Who can get in, how, and what they've connected", actions: ["Edit", "Expand"], ...list(
          TEAM_SEATS.slice(0, 5).map((s, i) => ({
            label: s.who,
            who: i === 0 ? "Google Workspace · signed in today" : i === 1 ? "Password · 2FA on" : i < 4 ? "Invite accepted · no 2FA yet" : "Invite never sent",
            state: i < 2 ? "Active" : i < 4 ? "No 2FA" : "Not invited",
            stateTone: i < 2 ? "#2F7A57" : i < 4 ? "#B5822A" : "#9F3A2A",
            initials: tmInit(s.who),
            chev: true,
          }))
        ), foot: "Owners can send an invite, set a temporary password, or sign in as someone — every acting-as session is logged with a reason." },
        { title: "Departments", note: "Her " + DEPARTMENTS.length + " departments, and who owns each", actions: ["Expand"], ...fields(
          DEPARTMENTS.map((d, i) => ({
            label: d.name,
            value: i === 0 ? AGENCY_OPERATOR.split(" ")[0] : (TEAM[(i - 1) % TEAM.length] || TEAM[0]).name,
            plain: true,
            dot: d.tier === "auto" ? "#2F7A57" : d.tier === "confirm" ? "#B5822A" : "#9A958A",
          }))
        ) },
      ],
    };
  }

  if (tab === "banking") {
    return {
      title: "Banking",
      sub: "Connected accounts, accounting sync, payouts, and what leaves the business each month.",
      cards: [
        { title: "Bank connections", note: "Linked through Plaid · read-only access", actions: ["Add", "Expand"], span: true, ...list([
          { label: "Regions Bank", who: "Operating · •• 4471", state: "Connected", stateTone: "#2F7A57", meta: "synced 2h ago", chev: true, glyph: "▤" },
          { label: "Regions Bank", who: "Reserve · •• 8802", state: "Connected", stateTone: "#2F7A57", meta: "synced 2h ago", chev: true, glyph: "▤" },
          { label: "Amex Business", who: "Card · •• 3391", state: "Reauth needed", stateTone: "#B5822A", meta: "13d ago", chev: true, glyph: "▤" },
          { label: "Stripe", who: "Platform payouts", state: "Connected", stateTone: "#2F7A57", meta: "synced 1h ago", chev: true, glyph: "▤" },
        ]), foot: "Paige: Amex stopped syncing thirteen days ago, so this month's card spend is incomplete until you reconnect." },
        { title: "Accounting", note: "QuickBooks Online · two-way", actions: ["Edit", "Expand"], ...list([
          { label: "Company file", state: "Cook & Co Agency LLC", dot: "#2F7A57" },
          { label: "Chart of accounts", state: "42 mapped", dot: "#2F7A57" },
          { label: "Invoices push", state: "On create", dot: "#2F6B8F" },
          { label: "Last sync", state: "38 minutes ago", dot: "#2F7A57" },
        ]) },
        { title: "Payouts and billing", note: "Referenced, never stored in full", actions: ["Edit", "Expand"], ...list([
          { label: "Operating account", state: "•• 4471", sealed: true },
          { label: "Payout schedule", state: "Daily", dot: "#2F7A57" },
          { label: "Sub-account billing", state: "Merchant of record", dot: "#2F6B8F" },
        ]) },
        { title: "Spend and vendors", note: "Detected from connected accounts", actions: ["Expand"], ...fields([
          { label: "MONTHLY SOFTWARE", value: "$454 / mo", plain: true },
          { label: "Northlight CRM", value: "$249 / mo", plain: true },
          { label: "Ledgerly Pro", value: "$85 / mo", plain: true },
          { label: "Sendgrid Pro", value: "$120 / mo", plain: true },
        ]) },
      ],
    };
  }

  if (tab === "comms") {
    return {
      title: "Comms & data",
      sub: "Sending identity, notifications, retention, and billing.",
      cards: [
        { title: "Sending identity", note: "Everything she sends goes out as you", actions: ["Edit", "Expand"], ...list([
          { label: "Custom domain", state: "mail.cookagency.com", dot: "#2F7A57" },
          { label: "SPF / DKIM / DMARC", state: "All passing", dot: "#2F7A57" },
          { label: "Per-sub-account domains", state: "12 of 12 verified", dot: "#2F7A57" },
        ]) },
        { title: "Notifications", note: "What reaches you, and how", actions: ["Expand"], ...list([
          { label: "Morning brief", state: "7:00am ET", dot: "#7C6CE0" },
          { label: "Drafted for approval", state: "Immediately", dot: "#7C6CE0" },
          { label: "Sub-account escalations", state: "Immediately", dot: "#7C6CE0" },
        ]) },
        { title: "Data, retention, and export", note: "Your material stays yours", actions: ["Expand"], ...checks([
          { label: "Encryption at rest", val: "AES-256 on every record", ok: true },
          { label: "Trains no models", val: "Your material is excluded", ok: true },
          { label: "Sub-account isolation", val: "Row-level, per tenant", ok: true },
        ]) },
        { title: "Plan and billing", note: AGENCY.plan + " · " + AGENCY.subCount + " sub-accounts", actions: ["Manage", "Expand"], ...fields([
          { label: "PLAN", value: AGENCY.plan },
          { label: "RENEWS", value: "Sep 1, 2026" },
          { label: "BILLED THIS MONTH", value: AGENCY.billedThisMonth },
          { label: "SEATS", value: TEAM_SEATS.length + " of 12" },
        ]) },
      ],
    };
  }

  // default: "business"
  return {
    title: "Business",
    sub: "Legal identity, addresses, entities, and the sealed identifiers she files with.",
    cards: [
      { title: "Legal identity", note: "What appears on filings, contracts, and invoices", actions: ["Edit", "Expand"], ...fields([
        { label: "LEGAL NAME", value: "Cook & Co Agency LLC" },
        { label: "TAX IDS", value: "2 sealed", sealed: true },
      ]) },
      { title: "Where you are", note: "Addresses, hours, and locale", actions: ["Edit", "Expand"], ...fields([
        { label: "PRINCIPAL", value: "1180 Peachtree St NE, Suite 1200" },
        { label: "TIME ZONE", value: "America/New_York" },
      ]) },
      { title: "How the business is reached", note: "She uses these when she speaks for you", actions: ["Edit", "Expand"], ...fields([
        { label: "WEBSITE", value: "cookagency.com" },
        { label: "SENDING DOMAIN", value: "mail.cookagency.com" },
      ]) },
      { title: "Entities", note: SETUP_ENTITIES.length + " tracked · click one to open it", actions: ["Add", "Expand"], ...list(
        SETUP_ENTITIES.map((e) => ({ label: e.name, who: e.note, state: e.state, stateTone: e.state === "Active" ? "#2F7A57" : "#6E6A61", sealed: e.sealed, chev: true, glyph: "▣" }))
      ) },
    ],
  };
}

export default SetupCard;
