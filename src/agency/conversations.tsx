// @ts-nocheck
// Agency pack — the Conversations CONSOLE, the richest pop-out cluster in the
// Claude Design "CRM agency mode" pack (owner-locked 2026-08-17, §28/§63 — "We do
// not drift off this whatsoever"). Co-located sub-component of the Clients screen:
// clients.tsx imports the default export and mounts it under the "Conversations"
// sub-tab. Split out per the task's right-size rule (the Clients directory +
// pipelines already fill clients.tsx; folding this console in would blow past ~30KB).
//
// Source of truth: "Agency Shell.dc.html" — the `isConvos` view. Its own inner tab
// strip (convoInner: Conversations · Manual Actions · Snippets · Trigger Links ·
// Analytics · Settings), the three-pane main console (thread list · chat · rail),
// and EVERY pop-out this console owns, ported faithfully onto React + the ./_shared
// primitives (Modal/SlideOut carry portal + focus-trap + Esc + reduced-motion):
//   • Conversation-settings drawer (csDrawerOpen / csRow) with the three kinds the
//     design distinguishes — DEFAULT (editable + override cascade), POLICY (locked,
//     "why it exists"), BEHAVIOR (editable value). Right-side SlideOut.
//   • "Who sends this?" modal (actAsOpen) — the design's load-bearing "no third
//     option" frame: EXACTLY two choices (Route-to-owner-for-approval vs
//     Act-as-&-send-now) and the closing line "There is no third option." (agency).
//   • Expand thread (expandOpen) — the wide two-pane reader Modal.
//   • New conversation (newConvoOpen) — TO/FROM + channel/call launch Modal.
//   • Channel picker (channelPickOpen) — the composer's upward-opening dropdown.
//   • Call / video overlay (callOpen) — voice widget (callTools + dial pad, padOpen)
//     and the video Modal (videoTools). Both deliberately DARK, as the design draws
//     them (a live-call surface, not a themed working surface).
//   • Batch approve (batchTitle) — the cross-book rail + its "Approve all N" modal.
//   • Conversation full-report 4-step (caReportOpen) — the Analytics tab's expand.
//
// §51: when a standalone sub-account is in view (isAgency===false) OR the agency is
// acting-as a sub, this console shows ONLY that book's own threads. The cross-book
// tenant filter, the "routed to owner for approval" send-as line, the whole "Who
// sends this?" act-as machinery, and the cross-book batch rail are ALL gated behind
// crossBook (= isAgency && !acting) and are structurally absent otherwise — a sub
// owner is the sender, so there is nobody to route to and no other book to batch.
import React from "react";
import { Ic, Avatar, Modal, SlideOut, useReducedMotion } from "./_shared";
import {
  THREADS, SUBS, OWNERS, CHANNELS, CONV_CHANNEL_PERF, CONV_PATTERNS,
  CONV_DEFAULTS, CONV_POLICIES, CONV_BEHAVIOR, CONV_DIVERGENCE, LBL, FLAGS,
  GREEN, AMBER, RED,
} from "./fixtures";

const GOLD_BG = "var(--gold-bright)", GOLD_INK = "#241C05";
const noop = () => {};
const initialsOf = n => n.split(" ").map(w => w[0]).join("");
const delivColorOf = d => (d >= 96 ? "var(--ok)" : d >= 92 ? "var(--warn)" : "var(--bad)");

// ── Analytics full-report — 4-step Modal (caReportOpen) ───────────────────────
const CaReport = ({ open, onClose, step, setStep, ownerWord }) => {
  const kpis = [
    { label: "VOLUME · 30 DAYS", value: "8,890", delta: "+12%", tone: "var(--ok)", note: "sent and received, all channels" },
    { label: "REPLY RATE", value: "47%", delta: "+3 pts", tone: "var(--ok)", note: "client replied within 7 days" },
    { label: "MEDIAN FIRST REPLY", value: "2h 10m", delta: "−26m", tone: "var(--ok)", note: "across " + ownerWord },
    { label: "DELIVERABILITY", value: "96%", delta: "−1 pt", tone: "var(--warn)", note: "bounce, spam and blocks combined" },
  ];
  const channels = CONV_CHANNEL_PERF.map(c => ({ key: c.key, reply: c.reply + "%", bar: c.reply + "%", resp: c.resp, deliv: c.deliv + "%", delivColor: delivColorOf(c.deliv), vol: c.vol.toLocaleString() }));
  const best = SUBS.slice(0, 5).map((s, i) => ({ name: s.name, color: s.color, score: String(94 - i * 2), strength: ["fastest replies in the book", "98% deliverability", "highest approval rate", "no escalations in 30 days", "best reply rate on SMS"][i] }));
  const worst = SUBS.slice(6, 11).map((s, i) => ({ name: s.name, color: s.color, issue: ["deliverability at 88% and falling", "first reply doubled week over week", "DMARC failing on their domain", "four drafts sat unapproved past send window", "reply rate halved on Instagram"][i], fix: ["Apply the DNS fix", "Draft the nudge", "Fix DMARC", "Nudge the owner", "Rewrite the opener"][i] }));
  const paigeKpis = [
    { label: "APPROVED WITHOUT EDITS", value: "88%", delta: "+5 pts" },
    { label: "AUTO-SENT, POSITIVE REPLY", value: "72%", delta: "+2 pts" },
    { label: "ESCALATED TO A HUMAN", value: "9%", delta: "−4 pts" },
    { label: "VOICE MATCH", value: "91", delta: "+6" },
  ];
  const traj = SUBS.slice(0, 5).map((s, i) => {
    const pts = [58, 64, 71, 79, 84, 88].map(v => v - i * 4 + (i === 3 ? -14 : 0));
    const w = 92, h = 26;
    return { name: s.name, color: s.color, path: pts.map((v, j) => (j / (pts.length - 1) * w).toFixed(1) + "," + (h - (v - 40) / 60 * h).toFixed(1)).join(" "), end: pts[pts.length - 1] + "%", verdict: i === 3 ? "flat — worth a look" : "rising", verdictColor: i === 3 ? "var(--warn)" : "var(--ok)" };
  });
  const stepTitle = ["Book-wide performance", "Sub-account comparison", "How she's performing", "What she's learned"][step];
  return (
    <Modal open={open} onClose={onClose} wide pad="20px 22px"
      title={stepTitle} sub={"Conversation analytics across " + ownerWord} accent="var(--gold-bright)"
      foot={
        <>
          <button onClick={() => setStep(Math.max(0, step - 1))} className="btn btn-s" style={{ height: 34, borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: "var(--ink-2)" }}>← Back</button>
          <span style={{ fontSize: 11.5, color: "var(--ink-3)" }}>{(step + 1) + " of 4"}</span>
          <button onClick={() => setStep(Math.min(3, step + 1))} style={{ marginLeft: "auto", padding: "9px 17px", borderRadius: 9, background: GOLD_BG, color: GOLD_INK, fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer" }}>Next →</button>
        </>
      }>
      {step === 0 && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(180px,100%),1fr))", gap: 12 }}>
            {kpis.map(k => (
              <div key={k.label} className="card" style={{ background: "var(--surface-2)", padding: "15px 17px" }}>
                <div className="eyebrow" style={{ fontSize: 9.5 }}>{k.label}</div>
                <div className="row" style={{ gap: 9, alignItems: "baseline", marginTop: 9 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-.02em" }}>{k.value}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: k.tone }}>{k.delta}</span>
                </div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 6 }}>{k.note}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 20 }}>By channel</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 11 }}>
            {channels.map(c => (
              <div key={c.key} className="row" style={{ gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500, flex: "0 0 96px" }}>{c.key}</span>
                <span style={{ flex: 1, height: 8, borderRadius: 5, background: "var(--surface-sunk)", overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: c.bar, background: "var(--gold)" }} /></span>
                <span className="mono" style={{ fontSize: 12, flex: "none", width: 46, textAlign: "right" }}>{c.reply}</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)", flex: "none", width: 62, textAlign: "right" }}>{c.resp}</span>
                <span className="mono" style={{ fontSize: 12, color: c.delivColor, flex: "none", width: 46, textAlign: "right" }}>{c.deliv}</span>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-3)", flex: "none", width: 60, textAlign: "right" }}>{c.vol}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {step === 1 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(320px,100%),1fr))", gap: 16 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Healthiest this month</div>
            {best.map(b => (
              <div key={b.name} className="row" style={{ gap: 11, padding: "11px 0", borderBottom: "1px solid var(--line-soft)" }}>
                <span style={{ width: 3, height: 26, borderRadius: 2, background: b.color, flex: "none" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{b.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>{b.strength}</div>
                </div>
                <span style={{ marginLeft: "auto", fontSize: 17, fontWeight: 700, color: "var(--ok)", flex: "none" }}>{b.score}</span>
              </div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Needing attention</div>
            {worst.map(w => (
              <div key={w.name} className="row" style={{ gap: 11, padding: "11px 0", borderBottom: "1px solid var(--line-soft)" }}>
                <span style={{ width: 3, height: 26, borderRadius: 2, background: w.color, flex: "none" }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{w.name}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3, lineHeight: 1.4 }}>{w.issue}</div>
                </div>
                <button style={{ marginLeft: "auto", padding: "7px 12px", borderRadius: 8, background: GOLD_BG, color: GOLD_INK, fontSize: 11.5, fontWeight: 600, border: "none", cursor: "pointer", flex: "none", whiteSpace: "nowrap" }}>{w.fix}</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {step === 2 && (
        <>
          <div style={{ fontSize: 11.5, color: "var(--gold)" }}>Pending measurement substrate — these four aren't being recorded yet.</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(170px,100%),1fr))", gap: 12, marginTop: 11 }}>
            {paigeKpis.map(k => (
              <div key={k.label} className="card" style={{ background: "var(--surface-2)", padding: "14px 16px" }}>
                <div className="eyebrow" style={{ fontSize: 9.5, lineHeight: 1.3 }}>{k.label}</div>
                <div className="row" style={{ gap: 8, alignItems: "baseline", marginTop: 8 }}>
                  <span style={{ fontSize: 24, fontWeight: 700 }}>{k.value}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: "var(--ok)" }}>{k.delta}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 20 }}>Is she learning each voice?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 11 }}>
            {traj.map(t => (
              <div key={t.name} className="row" style={{ gap: 13 }}>
                <span className="trunc" style={{ fontSize: 13, flex: "0 0 168px", minWidth: 0 }}>{t.name}</span>
                <svg viewBox="0 0 92 26" preserveAspectRatio="none" style={{ flex: 1, height: 32, overflow: "hidden" }}>
                  <polyline points={t.path} fill="none" stroke={t.color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </svg>
                <span className="mono" style={{ fontSize: 12, flex: "none", width: 44, textAlign: "right" }}>{t.end}</span>
                <span style={{ fontSize: 11.5, color: t.verdictColor, flex: "none", width: 118, textAlign: "right" }}>{t.verdict}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {step === 3 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {CONV_PATTERNS.map(p => (
            <div key={p.tag} className="card" style={{ borderColor: "var(--violet-line)", borderLeft: "3px solid var(--violet)", background: "var(--violet-tint)", padding: "15px 17px" }}>
              <div className="row" style={{ gap: 9 }}>
                <span style={{ display: "flex", color: "var(--violet)" }}><Ic.spark size={12} /></span>
                <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".12em", color: "var(--violet)" }}>{p.tag}</span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", marginTop: 8 }}>{p.body}</div>
              <div className="row" style={{ flexWrap: "wrap", gap: 8, marginTop: 12 }}>
                <button style={{ padding: "8px 15px", borderRadius: 9, background: GOLD_BG, color: GOLD_INK, fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer" }}>{p.action}</button>
                <button className="btn btn-s" style={{ height: 34, borderRadius: 9, fontSize: 12.5, fontWeight: 600, color: "var(--violet)", borderColor: "var(--violet-line)" }}>Ask Paige about this →</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

// ── Settings drawer — DEFAULT / POLICY / BEHAVIOR kinds (csDrawerOpen) ─────────
const CsDrawer = ({ open, onClose, group, row }) => {
  const drawer = (() => {
    if (row == null) return {};
    if (group === "policies") { const p = CONV_POLICIES[row] || {}; return { kind: "POLICY", name: p.name, value: "Applies to all " + SUBS.length, body: p.body, why: p.why, isPolicy: true, isDefault: false, overrides: [] }; }
    if (group === "behavior") { const b = CONV_BEHAVIOR[row] || {}; return { kind: "BEHAVIOR", name: b.name, value: b.value, body: b.note, why: "", isPolicy: false, isDefault: true, overrides: [] }; }
    const d = CONV_DEFAULTS[row] || {};
    return {
      kind: "DEFAULT", name: d.name, value: d.value, body: d.note,
      why: d.over === 0 ? "Every sub-account is on your default." : d.over + " changed it on their side. That's theirs to decide.",
      isPolicy: false, isDefault: true,
      overrides: SUBS.slice(0, d.over).map((s, k) => ({ name: s.name, color: s.color, value: ["48 business hours", "Aggressive", "11pm SMS allowed", "Their own signature"][k % 4] })),
    };
  })();
  return (
    <SlideOut open={open} onClose={onClose} title={drawer.name} sub={drawer.kind} icon={drawer.isPolicy ? <span style={{ fontSize: 14 }}>⛉</span> : <Ic.gear size={15} />}
      foot={
        <>
          <button style={{ padding: "10px 18px", borderRadius: 10, background: GOLD_BG, color: GOLD_INK, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>Save</button>
          <button onClick={onClose} className="btn btn-s" style={{ height: 40, borderRadius: 10, fontSize: 13, color: "var(--ink-2)" }}>Cancel</button>
        </>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-2)" }}>{drawer.body}</div>
        <div className="card" style={{ padding: "14px 15px" }}>
          <div className="eyebrow" style={{ fontSize: 9.5 }}>CURRENT</div>
          {drawer.isPolicy
            ? <div style={{ marginTop: 9, padding: "10px 12px", border: "1px solid var(--line-soft)", borderRadius: 9, background: "var(--surface-sunk)", color: "var(--ink-2)", fontSize: 13.5 }}>{drawer.value}</div>
            : <input defaultValue={drawer.value} style={{ width: "100%", marginTop: 9, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 9, background: "var(--surface-2)", color: "var(--ink)", fontSize: 13.5, fontFamily: "inherit", outline: "none" }} />}
        </div>
        {drawer.isPolicy && (
          <div style={{ border: "1px solid var(--gold-line)", borderRadius: 12, background: "var(--gold-tint)", padding: "13px 15px" }}>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".13em", color: "var(--gold)" }}>WHY IT EXISTS</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--gold)", marginTop: 7 }}>{drawer.why}</div>
          </div>
        )}
        {drawer.isDefault && drawer.why && (
          <div className="card" style={{ padding: "14px 15px" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{drawer.why}</div>
            {drawer.overrides.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 11 }}>
                {drawer.overrides.map(o => (
                  <div key={o.name} className="row" style={{ gap: 10, minWidth: 0 }}>
                    <span style={{ width: 3, height: 22, borderRadius: 2, background: o.color, flex: "none" }} />
                    <span className="trunc" style={{ fontSize: 12.5, minWidth: 0 }}>{o.name}</span>
                    <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-2)", flex: "none" }}>{o.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </SlideOut>
  );
};

// ── "Who sends this?" — the load-bearing two-choice modal (actAsOpen) ─────────
const ActAsModal = ({ open, onClose, tenant, owner }) => {
  const firstOwner = (owner || "the owner").split(" ")[0];
  const options = [
    { key: "route", title: "Route to " + firstOwner + " for approval", body: "She drafts it in their voice, they approve, it sends from their identity. Default, and the safest.", tag: "Recommended", tagBg: "var(--ok-tint)", tagColor: "var(--ok)" },
    { key: "actas", title: "Act as " + tenant + " and send now", body: "Switches your shell into their workspace so you send it yourself. Logged on their record as you.", tag: "You take it", tagBg: "var(--gold-tint)", tagColor: "var(--gold)" },
  ];
  return (
    <Modal open={open} onClose={onClose} size={486} title="Who sends this?" sub={"Either way it goes out under " + tenant + "'s name. The client never sees your agency."}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {options.map(o => (
          <button key={o.key} onClick={onClose} className="card" style={{ textAlign: "left", background: "var(--surface-2)", padding: "14px 15px", cursor: "pointer", transition: ".15s" }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--gold-line)"; e.currentTarget.style.background = "var(--gold-tint)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.background = "var(--surface-2)"; }}>
            <div className="row" style={{ gap: 10 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.35, minWidth: 0 }}>{o.title}</div>
              <span className="pill" style={{ marginLeft: "auto", background: o.tagBg, color: o.tagColor, fontSize: 10.5, flex: "none" }}>{o.tag}</span>
            </div>
            <div style={{ fontSize: 12, color: "var(--ink-2)", lineHeight: 1.5, marginTop: 6 }}>{o.body}</div>
          </button>
        ))}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-3)", lineHeight: 1.5, marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--line-soft)" }}>There is no third option. Nothing in a client thread can go out under your agency's name.</div>
    </Modal>
  );
};

// ── New conversation (newConvoOpen) ───────────────────────────────────────────
const NewConvoModal = ({ open, onClose, crossBook, tenant, owner, color, onCall }) => (
  <Modal open={open} onClose={onClose} size={520} title="Start a conversation"
    sub={"Pick who it's with and how it goes out." + (crossBook ? " It sends under their " + LBL.tenant + "'s name, never yours." : "")}
    foot={
      <>
        <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 10, background: GOLD_BG, color: GOLD_INK, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>Start it</button>
        <button className="btn btn-s" style={{ height: 40, borderRadius: 10, fontSize: 13, fontWeight: 600, color: "var(--violet)", borderColor: "var(--violet-line)" }}><Ic.spark size={12} />Let Paige open it</button>
        <button onClick={onClose} className="btn btn-s" style={{ marginLeft: "auto", height: 40, borderRadius: 10, fontSize: 13, color: "var(--ink-2)" }}>Cancel</button>
      </>
    }>
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="row" style={{ gap: 9, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface-2)" }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)", flex: "none" }}>TO</span>
        <span style={{ fontSize: 12.5, color: "var(--ink-3)" }}>Search a client, or type a number or email</span>
      </div>
      <div className="row" style={{ gap: 9, padding: "10px 12px", border: "1px solid var(--line)", borderRadius: 10, background: "var(--surface-2)" }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)", flex: "none" }}>FROM</span>
        <span style={{ width: 3, height: 18, borderRadius: 2, background: color, flex: "none" }} />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{tenant}</span>
        {crossBook && <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--ink-3)", flex: "none" }}>routed to {owner}</span>}
      </div>
    </div>
    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: ".13em", color: "var(--ink-3)", marginTop: 16 }}>HOW IT GOES OUT</div>
    <div className="row" style={{ gap: 7, flexWrap: "wrap", marginTop: 9 }}>
      {CHANNELS.map(c => (
        <span key={c.key} className="row" style={{ gap: 7, padding: "8px 13px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, cursor: "pointer" }}><span style={{ fontSize: 11, color: "var(--ink-3)" }}>{c.icon}</span>{c.key}</span>
      ))}
      <button onClick={() => onCall("voice")} className="row" style={{ gap: 7, padding: "8px 13px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, cursor: "pointer" }}><span style={{ fontSize: 11, color: "var(--ink-3)" }}>☏</span>Call</button>
      <button onClick={() => onCall("video")} className="row" style={{ gap: 7, padding: "8px 13px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, cursor: "pointer" }}><span style={{ fontSize: 11, color: "var(--ink-3)" }}>▢</span>Video</button>
    </div>
  </Modal>
);

// ── Batch approve (batchTitle) — cross-book "Approve all N" modal ─────────────
const BatchModal = ({ open, onClose, ownerWord, rows }) => (
  <Modal open={open} onClose={onClose} size={560} title={"She drafted across " + ownerWord + " today"} sub={rows.length + " waiting on approval"} icon={<Ic.spark size={16} />}
    foot={
      <>
        <button onClick={onClose} style={{ padding: "10px 18px", borderRadius: 10, background: GOLD_BG, color: GOLD_INK, fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer" }}>Approve all {rows.length}</button>
        <button onClick={onClose} className="btn btn-s" style={{ marginLeft: "auto", height: 40, borderRadius: 10, fontSize: 13, color: "var(--ink-2)" }}>Review one by one</button>
      </>
    }>
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {rows.map((b, i) => (
        <div key={i} className="row" style={{ gap: 11, padding: "12px 2px", borderBottom: i < rows.length - 1 ? "1px solid var(--line-soft)" : "0" }}>
          <span style={{ width: 3, height: 30, borderRadius: 2, background: b.color, flex: "none" }} />
          <Avatar name={b.who} size={28} />
          <div style={{ minWidth: 0 }}>
            <div className="trunc" style={{ fontSize: 13, fontWeight: 600 }}>{b.who}</div>
            <div className="trunc" style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{b.tenant} · {b.age}</div>
          </div>
          <span className="pill pill-v" style={{ marginLeft: "auto", flex: "none" }}><Ic.spark size={11} />Drafted</span>
        </div>
      ))}
    </div>
  </Modal>
);

// ── Call / video overlays (callOpen) — deliberately dark, per the design ──────
const CallOverlay = ({ mode, live, secs, who, number, asLine, initials, onEnd, padOpen, setPadOpen, dialed, pushKey, clearDialed, tools }) => {
  if (mode !== "voice") return null;
  const timer = String((secs / 60) | 0).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0");
  return (
    <div className="fade-in" style={{ position: "fixed", right: 26, bottom: 26, width: 308, zIndex: 130, border: "1px solid #2E2838", borderRadius: 16, background: "linear-gradient(168deg,#221E2E,#131120)", boxShadow: "0 30px 70px rgba(10,8,18,.5)", overflow: "hidden" }}>
      <div style={{ padding: "16px 17px 14px" }}>
        <div className="row" style={{ gap: 11 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#3A3450", color: "#FFFDF8", display: "grid", placeItems: "center", fontSize: 13, fontWeight: 600, flex: "none" }}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div className="trunc" style={{ fontSize: 14.5, fontWeight: 600, color: "#FFFDF8" }}>{who}</div>
            <div className="mono" style={{ fontSize: 11, color: "rgba(255,253,248,.5)", marginTop: 3 }}>{number}</div>
          </div>
          <div style={{ marginLeft: "auto", textAlign: "right", flex: "none" }}>
            <div className="row" style={{ gap: 6, justifyContent: "flex-end" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: live ? GREEN : AMBER }} />
              <span style={{ fontSize: 11, color: "rgba(255,253,248,.72)" }}>{live ? "Connected" : "Dialing…"}</span>
            </div>
            <div className="mono" style={{ fontSize: 13, color: "#FFFDF8", marginTop: 4 }}>{timer}</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "rgba(255,253,248,.45)", marginTop: 11 }}>{asLine}</div>
        <div className="row" style={{ gap: 7, marginTop: 13 }}>
          {tools.map(t => (
            <button key={t.label} onClick={t.onClick || noop} title={t.label} style={{ flex: 1, height: 34, borderRadius: 9, border: "1px solid rgba(255,253,248,.14)", background: t.on ? "rgba(255,253,248,.18)" : "rgba(255,253,248,.05)", display: "grid", placeItems: "center", fontSize: 13, color: "rgba(255,253,248,.8)", cursor: "pointer" }}>{t.icon}</button>
          ))}
        </div>
        {padOpen && (
          <div className="fade-in" style={{ marginTop: 12 }}>
            <div className="row" style={{ gap: 8, padding: "8px 11px", borderRadius: 9, background: "rgba(0,0,0,.3)", border: "1px solid rgba(255,253,248,.1)" }}>
              <span className="mono" style={{ fontSize: 14, color: "#FFFDF8", letterSpacing: ".08em", minWidth: 0, overflow: "hidden" }}>{dialed || " "}</span>
              {dialed && <span onClick={clearDialed} style={{ marginLeft: "auto", fontSize: 11, color: "rgba(255,253,248,.5)", cursor: "pointer", flex: "none" }}>clear</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 7, marginTop: 9 }}>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "✱", "0", "#"].map(k => (
                <button key={k} onClick={() => pushKey(k)} style={{ height: 38, borderRadius: 10, border: "1px solid rgba(255,253,248,.12)", background: "rgba(255,253,248,.04)", display: "grid", placeItems: "center", fontFamily: "var(--mono)", fontSize: 15, color: "#FFFDF8", cursor: "pointer", userSelect: "none" }}>{k}</button>
              ))}
            </div>
          </div>
        )}
        <div className="row" style={{ gap: 9, marginTop: 13 }}>
          <button onClick={() => setPadOpen(!padOpen)} style={{ padding: "9px 13px", borderRadius: 9, border: "1px solid rgba(255,253,248,.16)", background: "transparent", fontSize: 12, fontWeight: 600, color: "rgba(255,253,248,.82)", cursor: "pointer" }}>{padOpen ? "Hide keypad" : "Keypad"}</button>
          <button onClick={onEnd} style={{ marginLeft: "auto", padding: "9px 17px", borderRadius: 9, background: "#B4483C", color: "#FFFDF8", fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: "none", flex: "none" }}>End call</button>
        </div>
      </div>
      <div style={{ padding: "10px 17px", background: "rgba(123,107,224,.12)", borderTop: "1px solid rgba(255,253,248,.08)" }}>
        <div className="row" style={{ gap: 8, alignItems: "flex-start" }}>
          <span style={{ color: "#B9AEEA", fontSize: 11, flex: "none" }}>✦</span>
          <span style={{ fontSize: 11, lineHeight: 1.45, color: "rgba(255,253,248,.66)" }}>She's listening in and will write the summary and next steps when you hang up.</span>
        </div>
      </div>
    </div>
  );
};

const VideoOverlay = ({ open, live, secs, who, asLine, initials, onEnd, tools }) => {
  const reduce = useReducedMotion();
  if (!open) return null;
  const timer = String((secs / 60) | 0).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0");
  return (
    <div className={reduce ? "" : "fade-in"} style={{ position: "fixed", inset: 0, background: "rgba(10,8,16,.62)", display: "grid", placeItems: "center", zIndex: 130, padding: 34 }}>
      <div style={{ width: "min(760px,100%)", border: "1px solid #2E2838", borderRadius: 18, background: "linear-gradient(168deg,#1E1A2A,#100E1A)", boxShadow: "0 40px 90px rgba(8,6,14,.55)", overflow: "hidden" }}>
        <div className="row" style={{ gap: 11, padding: "13px 18px", borderBottom: "1px solid rgba(255,253,248,.07)" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: live ? GREEN : AMBER, flex: "none" }} />
          <div style={{ fontSize: 13.5, fontWeight: 600, color: "#FFFDF8" }}>{who}</div>
          <span style={{ fontSize: 11.5, color: "rgba(255,253,248,.5)" }}>{asLine}</span>
          <div className="row" style={{ marginLeft: "auto", gap: 12, flex: "none" }}>
            <span className="mono" style={{ fontSize: 13, color: "#FFFDF8" }}>{timer}</span>
            <span onClick={onEnd} style={{ cursor: "pointer", color: "rgba(255,253,248,.6)", fontSize: 14 }}>✕</span>
          </div>
        </div>
        <div style={{ position: "relative", aspectRatio: "16/9", background: "radial-gradient(circle at 50% 42%,#2A2440,#120F1C 72%)", display: "grid", placeItems: "center" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 74, height: 74, borderRadius: "50%", background: "#3A3450", color: "#FFFDF8", display: "grid", placeItems: "center", fontSize: 22, fontWeight: 600, margin: "0 auto" }}>{initials}</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,253,248,.55)", marginTop: 12 }}>{live ? "Connected" : "Dialing…"}</div>
          </div>
          <div style={{ position: "absolute", right: 16, bottom: 16, width: 132, aspectRatio: "16/9", borderRadius: 10, border: "1px solid rgba(255,253,248,.14)", background: "linear-gradient(150deg,#2E2842,#171325)", display: "grid", placeItems: "center", fontSize: 11, color: "rgba(255,253,248,.45)" }}>You</div>
        </div>
        <div className="row" style={{ gap: 9, padding: "13px 18px" }}>
          {tools.map(t => (
            <button key={t.label} onClick={t.onClick || noop} title={t.label} className="row" style={{ gap: 7, padding: "9px 14px", borderRadius: 10, border: "1px solid rgba(255,253,248,.14)", background: t.on ? "rgba(255,253,248,.18)" : "rgba(255,253,248,.05)", fontSize: 12, color: "rgba(255,253,248,.82)", cursor: "pointer" }}><span style={{ fontSize: 12 }}>{t.icon}</span>{t.label}</button>
          ))}
          <button onClick={onEnd} style={{ marginLeft: "auto", padding: "9px 18px", borderRadius: 10, background: "#B4483C", color: "#FFFDF8", fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: "none", flex: "none" }}>Leave</button>
        </div>
        <div className="row" style={{ gap: 9, padding: "10px 18px", background: "rgba(123,107,224,.1)", borderTop: "1px solid rgba(255,253,248,.07)" }}>
          <span style={{ color: "#B9AEEA", fontSize: 11, flex: "none" }}>✦</span>
          <span style={{ fontSize: 11, color: "rgba(255,253,248,.62)" }}>She's listening in and will write the summary and next steps when you hang up.</span>
          <span style={{ marginLeft: "auto", fontSize: 10.5, color: "rgba(255,253,248,.36)", flex: "none" }}>Voice and video ride your existing telephony provider — no confirmed route from this shell to it yet.</span>
        </div>
      </div>
    </div>
  );
};

// ── Expand thread — wide two-pane reader (expandOpen) ─────────────────────────
const ExpandModal = ({ open, onClose, th, ownerWord, sendAsLine, crossBook, onActAs, onCall }) => (
  <Modal open={open} onClose={onClose} wide pad="0">
    <div style={{ display: "flex", flexDirection: "column", height: "min(84vh,720px)" }}>
      <div className="row" style={{ gap: 11, padding: "14px 20px", borderBottom: "1px solid var(--line-soft)", flex: "none" }}>
        <span style={{ width: 3, height: 22, borderRadius: 2, background: th.color, flex: "none" }} />
        <div style={{ minWidth: 0 }}>
          <div className="trunc" style={{ fontSize: 15, fontWeight: 600 }}>{th.who}{crossBook ? " · " + th.tenant : ""}</div>
          <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>{sendAsLine}</div>
        </div>
        {/* Call actions in the expand reader header (design L4917–4920): Call / Video /
            Voice note, then Collapse. Voice note is inert (design ships it inert too). */}
        <div className="row" style={{ marginLeft: "auto", gap: 8, flex: "none" }}>
          {[{ icon: "☏", label: "Call", m: "voice" }, { icon: "▢", label: "Video", m: "video" }, { icon: "◉", label: "Voice note", m: null }].map(a => (
            <button key={a.label} onClick={() => a.m && onCall && onCall(a.m)} title={a.label} style={{ width: 30, height: 30, padding: 0, borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 13, color: "var(--ink-2)", cursor: "pointer", flex: "none" }}>{a.icon}</button>
          ))}
          <button onClick={onClose} title="Collapse" className="btn btn-s" style={{ width: 30, height: 30, padding: 0, justifyContent: "center", borderRadius: 9, flex: "none" }}><Ic.x size={14} /></button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "18px 22px", background: "var(--canvas)", display: "flex", flexDirection: "column", gap: 13 }}>
            {th.msgs.map((m, i) => (
              <div key={i} className="row" style={{ justifyContent: m.mine ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "76%" }}>
                  <div style={{ padding: "13px 16px", border: "1px solid " + (m.mine ? "var(--ink)" : "var(--line-soft)"), borderRadius: 13, background: m.mine ? "var(--ink)" : "var(--surface)", color: m.mine ? "var(--ink-inv)" : "var(--ink)", fontSize: 14, lineHeight: 1.62 }}>{m.text}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 5, padding: "0 3px" }}>{m.when}</div>
                </div>
              </div>
            ))}
            <div style={{ border: "1px solid var(--violet-line)", borderLeft: "3px solid var(--violet)", borderRadius: 12, background: "var(--violet-tint)", padding: "14px 16px" }}>
              <div className="row" style={{ gap: 9 }}>
                <span style={{ display: "flex", color: "var(--violet)" }}><Ic.spark size={12} /></span>
                <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".14em", color: "var(--violet)" }}>PAIGE SUGGESTS</span>
              </div>
              <div style={{ fontSize: 14, lineHeight: 1.65, color: "var(--ink)", marginTop: 9 }}>{th.draft}</div>
            </div>
          </div>
          <div style={{ padding: "12px 20px 15px", borderTop: "1px solid var(--line-soft)", flex: "none", display: "flex", flexDirection: "column", gap: 9 }}>
            <div className="row" style={{ gap: 7, overflowX: "auto" }}>
              {th.quick.map(q => <span key={q} className="pill" style={{ background: "var(--surface-sunk)", color: "var(--ink-2)", height: 26, cursor: "pointer", flex: "none" }}>{q}</span>)}
            </div>
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: "12px 14px 26px", fontSize: 13.5, color: "var(--ink-3)" }}>Write a reply, or let her draft it…</div>
              <div className="row" style={{ gap: 6, padding: "0 11px 10px" }}>
                <span className="row" style={{ gap: 7, padding: "6px 11px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 11.5, fontWeight: 600 }}>{th.channel}</span>
                {crossBook && <button onClick={onActAs} style={{ marginLeft: "auto", background: "transparent", border: "none", fontSize: 11.5, fontWeight: 600, color: "var(--gold)", cursor: "pointer" }}>Who sends this →</button>}
                <button style={{ marginLeft: crossBook ? 0 : "auto", padding: "8px 13px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, fontWeight: 600, color: "var(--violet)", cursor: "pointer", flex: "none" }}>✦ Draft</button>
                <button style={{ padding: "8px 18px", borderRadius: 9, background: GOLD_BG, color: GOLD_INK, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: "none", flex: "none" }}>Send</button>
              </div>
            </div>
          </div>
        </div>
        <aside style={{ width: 268, flex: "none", borderLeft: "1px solid var(--line-soft)", padding: 16, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--rail-2)", color: "#FFFDF8", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 600, margin: "0 auto" }}>{th.initials}</div>
            <div style={{ fontSize: 14.5, fontWeight: 600, marginTop: 9 }}>{th.who}</div>
            <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>{th.role}</div>
          </div>
          <div style={{ border: "1px solid var(--violet-line)", borderRadius: 12, background: "var(--violet-tint)", padding: "13px 14px" }}>
            <div className="row" style={{ gap: 8 }}><span style={{ display: "flex", color: "var(--violet)" }}><Ic.spark size={12} /></span><div style={{ fontSize: 12, fontWeight: 600, color: "var(--violet)" }}>Paige on this thread</div></div>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 8 }}>{th.insight}</div>
          </div>
          {crossBook && (
            <div className="card" style={{ background: "var(--surface-2)", padding: "13px 14px" }}>
              <div className="eyebrow" style={{ fontSize: 9.5 }}>WHOSE RELATIONSHIP</div>
              <div className="row" style={{ gap: 9, marginTop: 9 }}>
                <span style={{ width: 3, height: 24, borderRadius: 2, background: th.color, flex: "none" }} />
                <div style={{ minWidth: 0 }}><div className="trunc" style={{ fontSize: 12.5, fontWeight: 600 }}>{th.tenant}</div><div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{th.owner}</div></div>
              </div>
              <div style={{ marginTop: 11, paddingTop: 11, borderTop: "1px solid var(--line-soft)", display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ fontSize: 11.5, color: "var(--ink-2)" }}>{th.email}</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-2)" }}>{th.phone}</div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  </Modal>
);

// ── Main console ──────────────────────────────────────────────────────────────
const ConversationsConsole = ({ isAgency = true, acting = null, openAsk = noop }) => {
  const crossBook = isAgency && !acting;

  const [inner, setInner] = React.useState("Conversations");
  const [convoFilter, setConvoFilter] = React.useState("All");
  const [threadIdx, setThreadIdx] = React.useState(0);
  const [channel, setChannel] = React.useState(null);
  const [channelPickOpen, setChannelPickOpen] = React.useState(false);
  const [actAsOpen, setActAsOpen] = React.useState(false);
  const [expandOpen, setExpandOpen] = React.useState(false);
  const [newConvoOpen, setNewConvoOpen] = React.useState(false);
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [caLens, setCaLens] = React.useState("perf");
  const [caReport, setCaReport] = React.useState(false);
  const [caStep, setCaStep] = React.useState(0);
  const [csGroup, setCsGroup] = React.useState("defaults");
  const [csRow, setCsRow] = React.useState(null);

  // Call state (voice widget + video modal).
  const [callMode, setCallMode] = React.useState(null); // null | 'voice' | 'video'
  const [callLive, setCallLive] = React.useState(false);
  const [callSecs, setCallSecs] = React.useState(0);
  const [padOpen, setPadOpen] = React.useState(false);
  const [dialed, setDialed] = React.useState("");
  const [muted, setMuted] = React.useState(false);
  const [held, setHeld] = React.useState(false);
  const [rec, setRec] = React.useState(false);
  const [camOff, setCamOff] = React.useState(false);

  const ownerWord = LBL.owner;
  const active = THREADS[threadIdx] || THREADS[0];
  const activeChannel = channel || active.channel;

  // The active thread, resolved to view shape (tenant/owner hidden in sub scope).
  const th = {
    who: active.who, role: active.role, initials: initialsOf(active.who),
    color: crossBook ? SUBS[active.sub].color : (acting ? acting.color : SUBS[0].color),
    tenant: crossBook ? SUBS[active.sub].name : (acting ? acting.name : SUBS[0].name),
    owner: OWNERS[active.sub] || "", insight: active.insight,
    email: active.email, phone: active.phone, draft: active.draft, channel: activeChannel,
    quick: active.quick,
    msgs: active.msgs.map(m => ({ text: m.text, when: m.when, mine: m.from === "us" })),
  };
  const firstOwner = (th.owner || "the owner").split(" ")[0];
  const sendAsLine = crossBook
    ? "Sending as " + th.tenant + " · routed to " + firstOwner + " for approval"
    : "Sending as " + th.tenant;

  // Timer: run once a call is placed; go live after a beat, then tick seconds.
  React.useEffect(() => {
    if (!callMode) return undefined;
    const live = setTimeout(() => setCallLive(true), 1400);
    const tick = setInterval(() => setCallSecs(s => s + 1), 1000);
    return () => { clearTimeout(live); clearInterval(tick); };
  }, [callMode]);
  const startCall = mode => { setCallMode(mode); setCallLive(false); setCallSecs(0); setPadOpen(false); setDialed(""); };
  const stopCall = () => { setCallMode(null); setCallLive(false); setCallSecs(0); setPadOpen(false); setDialed(""); setMuted(false); setHeld(false); setRec(false); setCamOff(false); };

  const callTools = [
    { icon: "◌", label: "Mute", on: muted, onClick: () => setMuted(v => !v) },
    { icon: "◍", label: "Hold", on: held, onClick: () => setHeld(v => !v) },
    { icon: "◉", label: "Record", on: rec, onClick: () => setRec(v => !v) },
    { icon: "＋", label: "Add someone", on: false, onClick: null },
  ];
  const videoTools = [
    { icon: "◌", label: "Mute", on: muted, onClick: () => setMuted(v => !v) },
    { icon: "▢", label: "Camera", on: camOff, onClick: () => setCamOff(v => !v) },
    { icon: "▤", label: "Share", on: false, onClick: null },
    { icon: "◉", label: "Record", on: rec, onClick: () => setRec(v => !v) },
  ];
  const callActions = [
    { icon: "☏", label: "Call", onClick: () => startCall("voice") },
    { icon: "▢", label: "Video", onClick: () => startCall("video") },
    { icon: "◉", label: "Voice note", onClick: null },
  ];
  const composerTools = [
    { icon: "＋", label: "Attach a file" }, { icon: "◉", label: "Record a voice note" },
    { icon: "▤", label: "Insert a snippet" }, { icon: "☺", label: "Emoji" },
  ];

  // Thread list (filtered), tenant label only in cross-book scope.
  const threads = THREADS
    .filter(t => convoFilter === "All" || (convoFilter === "Unread" ? t.unread > 0 : !!t.draft))
    .map(t => ({ idx: THREADS.indexOf(t), who: t.who, role: t.role, preview: t.preview, age: t.age, color: SUBS[t.sub].color, tenant: SUBS[t.sub].name, initials: initialsOf(t.who), unread: t.unread }));

  const batchRows = THREADS.map(t => ({ who: t.who, tenant: SUBS[t.sub].name, age: t.age, color: SUBS[t.sub].color }));

  const innerTabs = ["Conversations", "Manual Actions", "Snippets", "Trigger Links", "Analytics", "Settings"];
  const activeChannelIcon = (CHANNELS.filter(c => c.key === activeChannel)[0] || CHANNELS[0]).icon;
  const isEmail = activeChannel === "Email";

  return (
    <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 11 }}>
      {/* Console title + honesty flag. */}
      <div className="row" style={{ alignItems: "baseline", gap: 11, flex: "none", overflow: "hidden" }}>
        <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: "-.01em", flex: "none" }}>{crossBook ? "Conversations across " + ownerWord : "Conversations"}</div>
        <div className="trunc" style={{ fontSize: 11.5, color: "var(--ink-3)", minWidth: 0 }}>{crossBook ? "Every thread, every channel, every " + LBL.tenant + " — one console with Paige drafting inside." : "Every thread, every channel — Paige drafting inside it."}</div>
        {crossBook && <span title={FLAGS.convosFlag} style={{ width: 20, height: 20, borderRadius: 6, background: "var(--gold-tint)", border: "1px solid var(--gold-line)", color: "var(--gold)", display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700, cursor: "help", flex: "none" }}>!</span>}
      </div>

      {/* Inner tab strip. */}
      <div className="row tabstrip" style={{ gap: 16, borderBottom: "1px solid var(--line)", flex: "none", flexWrap: "wrap", rowGap: 2 }}>
        {innerTabs.map(t => {
          const on = inner === t;
          return <button key={t} onClick={() => setInner(t)} style={{ padding: "8px 2px", cursor: "pointer", fontSize: 12.5, fontWeight: on ? 600 : 450, color: on ? "var(--ink)" : "var(--ink-3)", borderBottom: "2px solid " + (on ? "var(--gold)" : "transparent"), whiteSpace: "nowrap", background: "transparent", border: "none" }}>{t}</button>;
        })}
      </div>

      {/* ── Conversations (main) ─────────────────────────────────────────────── */}
      {inner === "Conversations" && (
        <>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", flex: "none" }}>
            <span className="row" style={{ gap: 7, padding: "7px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, color: "var(--ink-2)", cursor: "pointer" }}>All channels <span style={{ color: "var(--ink-3)", fontSize: 10 }}>▾</span></span>
            {crossBook && <span className="row" style={{ gap: 7, padding: "7px 12px", borderRadius: 9, border: "1px solid var(--line)", background: "var(--surface)", fontSize: 12, color: "var(--ink-2)", cursor: "pointer" }}>All conversations <span style={{ color: "var(--ink-3)", fontSize: 10 }}>▾</span></span>}
            <div className="row" style={{ marginLeft: "auto", gap: 7, flex: "none" }}>
              {["All", "Unread", "Paige drafts"].map(l => {
                const on = convoFilter === l;
                return <button key={l} onClick={() => setConvoFilter(l)} className="pill" style={{ height: 26, cursor: "pointer", background: on ? "var(--gold-tint)" : "var(--surface)", border: "1px solid " + (on ? "var(--gold-line)" : "var(--line)"), color: on ? "var(--gold)" : "var(--ink-2)", fontSize: 11.5 }}>{l}</button>;
              })}
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 12, alignItems: "stretch" }}>
            {/* Thread list. */}
            <div className="card" style={{ width: 252, flex: "0 1 216px", minWidth: 186, minHeight: 0, alignSelf: "flex-start", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div className="row" style={{ gap: 8, padding: "9px 11px", borderBottom: "1px solid var(--line-soft)", flex: "none" }}>
                <span style={{ color: "var(--ink-3)", fontSize: 11, flex: "none" }}>⌕</span>
                <input placeholder="Search threads" style={{ flex: 1, minWidth: 0, border: "none", background: "transparent", color: "var(--ink)", fontSize: 12.5, fontFamily: "inherit", outline: "none" }} />
                <button onClick={() => setNewConvoOpen(true)} style={{ padding: "5px 10px", borderRadius: 8, background: "var(--ink)", color: "var(--ink-inv)", fontSize: 11.5, fontWeight: 600, cursor: "pointer", border: "none", flex: "none" }}>+ New</button>
              </div>
              {crossBook && (
                <div className="row" style={{ gap: 7, padding: "7px 11px", borderBottom: "1px solid var(--line-soft)", flex: "none" }}>
                  <span style={{ fontSize: 11, color: "var(--ink-3)", flex: "none" }}>▥</span>
                  <span className="trunc" style={{ fontSize: 11.5, color: "var(--ink-2)", minWidth: 0 }}>All {LBL.tenants.toLowerCase()}</span>
                  <span style={{ marginLeft: "auto", fontSize: 9, color: "var(--ink-3)", flex: "none" }}>▾</span>
                </div>
              )}
              <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
                {threads.map(t => {
                  const on = t.idx === threadIdx;
                  return (
                    <button key={t.idx} onClick={() => setThreadIdx(t.idx)} className="row" style={{ width: "100%", textAlign: "left", alignItems: "flex-start", gap: 10, padding: "12px 13px", borderBottom: "1px solid var(--line-soft)", cursor: "pointer", background: on ? "var(--surface-sunk)" : "transparent" }}>
                      <span style={{ width: 3, alignSelf: "stretch", borderRadius: 2, background: t.color, flex: "none" }} />
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: "var(--rail-2)", color: "#FFFDF8", display: "grid", placeItems: "center", fontSize: 10.5, fontWeight: 600, flex: "none" }}>{t.initials}</div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="row" style={{ alignItems: "baseline", gap: 7 }}>
                          <span className="trunc" style={{ fontSize: 12.5, fontWeight: on ? 600 : 500 }}>{t.who}</span>
                          <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: "var(--ink-3)", flex: "none" }}>{t.age}</span>
                        </div>
                        {crossBook && <div className="trunc" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{t.tenant}</div>}
                        <div style={{ fontSize: 11.5, color: "var(--ink-2)", marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{t.preview}</div>
                      </div>
                      {t.unread > 0 && <span style={{ minWidth: 17, height: 17, padding: "0 5px", borderRadius: 9, background: t.color, color: "#FFFDF8", fontSize: 10, fontWeight: 600, display: "grid", placeItems: "center", flex: "none" }}>{t.unread}</span>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chat pane. */}
            <div className="card" style={{ flex: "1 1 0", minWidth: 248, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ flex: "1 1 auto", minHeight: 132, overflowY: "auto", padding: "13px 15px", background: "var(--canvas)", display: "flex", flexDirection: "column", gap: 11 }}>
                {th.msgs.map((m, i) => (
                  <div key={i} className="row" style={{ justifyContent: m.mine ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "82%" }}>
                      <div style={{ padding: "12px 15px", border: "1px solid " + (m.mine ? "var(--ink)" : "var(--line-soft)"), borderRadius: 13, background: m.mine ? "var(--ink)" : "var(--surface)", color: m.mine ? "var(--ink-inv)" : "var(--ink)", fontSize: 13.5, lineHeight: 1.6, overflowWrap: "anywhere" }}>{m.text}</div>
                      <div className="mono" style={{ fontSize: 10, color: "var(--ink-3)", marginTop: 5, padding: "0 3px" }}>{m.when}</div>
                    </div>
                  </div>
                ))}
                <div className="row" style={{ gap: 8, justifyContent: "center", padding: "2px 0" }}>
                  <span style={{ height: 1, flex: 1, background: "var(--line-soft)" }} />
                  <span className="trunc" style={{ fontSize: 10.5, color: "var(--ink-3)", maxWidth: "78%" }}>Call · 6 min · yesterday 3:12pm · she asked about the review cadence</span>
                  <span style={{ height: 1, flex: 1, background: "var(--line-soft)" }} />
                </div>
                <div style={{ border: "1px solid var(--violet-line)", borderLeft: "3px solid var(--violet)", borderRadius: 12, background: "var(--violet-tint)", padding: "13px 15px" }}>
                  <div className="row" style={{ gap: 9, overflow: "hidden" }}>
                    <span style={{ display: "flex", color: "var(--violet)", flex: "none" }}><Ic.spark size={12} /></span>
                    <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".14em", color: "var(--violet)" }}>PAIGE SUGGESTS</span>
                    <span className="trunc" style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", minWidth: 0 }}>Drafted in {th.tenant}'s voice, not yours.</span>
                  </div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.65, color: "var(--ink)", marginTop: 9 }}>{th.draft}</div>
                  <div className="row" style={{ gap: 8, marginTop: 11 }}>
                    <button className="row" style={{ gap: 6, padding: "8px 14px", borderRadius: 9, background: GOLD_BG, color: GOLD_INK, fontSize: 12.5, fontWeight: 600, cursor: "pointer", border: "none" }}><Ic.check size={12} />Send it</button>
                    <button className="btn btn-s" style={{ height: 33, borderRadius: 9, fontSize: 12.5, borderColor: "var(--violet-line)" }}>Edit</button>
                    <button className="btn btn-s" style={{ height: 33, borderRadius: 9, fontSize: 12.5, color: "var(--ink-2)", borderColor: "var(--violet-line)" }}>Not now</button>
                  </div>
                </div>
              </div>

              {/* Composer. */}
              <div style={{ padding: "8px 12px 10px", borderTop: "1px solid var(--line-soft)", flex: "none", display: "flex", flexDirection: "column", gap: 7 }}>
                <div className="row" style={{ gap: 6, overflowX: "auto", flex: "none" }}>
                  {th.quick.map(q => <span key={q} className="pill" style={{ background: "var(--surface-sunk)", color: "var(--ink-2)", height: 24, cursor: "pointer", flex: "none", fontSize: 11 }}>{q}</span>)}
                </div>
                <div title={"Never sent under your agency's name. The client only ever hears from " + th.tenant + "."} className="row" style={{ gap: 7, flex: "none", overflow: "hidden" }}>
                  <span style={{ width: 3, height: 12, borderRadius: 2, background: th.color, flex: "none" }} />
                  <span className="trunc" style={{ fontSize: 10.5, color: "var(--ink-3)", minWidth: 0 }}>{sendAsLine}</span>
                  {crossBook && <span onClick={() => setActAsOpen(true)} title={"Act as " + th.tenant.split(" ")[0] + " and send now"} style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 600, color: "var(--gold)", cursor: "pointer", flex: "none" }}>Who sends this →</span>}
                  <span onClick={() => setExpandOpen(true)} title="Open in a wider window" style={{ marginLeft: crossBook ? 0 : "auto", fontSize: 11, color: "var(--ink-3)", cursor: "pointer", flex: "none", paddingLeft: 8 }}>⤢</span>
                </div>
                <div className="card" style={{ padding: 0, flex: "none" }}>
                  {isEmail && (
                    <div className="row" style={{ gap: 7, padding: "7px 12px 0", overflow: "hidden" }}>
                      <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: ".12em", color: "var(--ink-3)", flex: "none" }}>SUBJ</span>
                      <span className="trunc" style={{ fontSize: 11.5, color: "var(--ink-2)", minWidth: 0 }}>Re: onboarding timeline and the quarterly review</span>
                    </div>
                  )}
                  <div style={{ padding: "8px 12px 5px", fontSize: 12.5, color: "var(--ink-3)" }}>Write a reply, or let her draft it…</div>
                  <div className="row" style={{ gap: 5, padding: "0 8px 8px", flexWrap: "wrap", rowGap: 6 }}>
                    <div style={{ position: "relative", flex: "none" }}>
                      <button onClick={() => setChannelPickOpen(v => !v)} className="row" style={{ gap: 6, padding: "5px 9px", borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface-2)", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                        <span style={{ fontSize: 10, color: "var(--ink-3)" }}>{activeChannelIcon}</span>{activeChannel}<span style={{ fontSize: 8, color: "var(--ink-3)" }}>▾</span>
                      </button>
                      {channelPickOpen && (
                        <>
                          <div onClick={() => setChannelPickOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 60 }} />
                          <div className="fade-in card" style={{ position: "absolute", bottom: 36, left: 0, width: 212, zIndex: 61, padding: 6, boxShadow: "var(--sh-3)" }}>
                            {CHANNELS.map(c => {
                              const on = c.key === activeChannel;
                              const reach = c.key === "Email" ? active.email.split("@")[1] : c.key === "Instagram" ? "@" + active.who.split(" ")[0].toLowerCase() : active.phone;
                              return (
                                <button key={c.key} onClick={() => { setChannel(c.key); setChannelPickOpen(false); }} className="row" style={{ width: "100%", gap: 9, padding: "7px 10px", borderRadius: 8, cursor: "pointer", background: on ? "var(--surface-sunk)" : "transparent", border: "none", textAlign: "left" }}
                                  onMouseEnter={e => { if (!on) e.currentTarget.style.background = "var(--surface-2)"; }} onMouseLeave={e => { if (!on) e.currentTarget.style.background = "transparent"; }}>
                                  <span style={{ fontSize: 11, color: on ? "var(--ok)" : "var(--ink-3)", flex: "none" }}>{c.icon}</span>
                                  <span style={{ fontSize: 12.5, fontWeight: on ? 600 : 400 }}>{c.key}</span>
                                  <span style={{ marginLeft: "auto", fontSize: 10.5, color: "var(--ink-3)", flex: "none" }}>{reach}</span>
                                </button>
                              );
                            })}
                            <div style={{ height: 1, background: "var(--line-soft)", margin: "5px 4px" }} />
                            <div style={{ padding: "7px 10px", fontSize: 11.5, fontWeight: 600, color: "var(--gold)", cursor: "pointer" }}>+ Connect a channel</div>
                          </div>
                        </>
                      )}
                    </div>
                    {composerTools.map(t => <div key={t.label} title={t.label} style={{ width: 25, height: 25, borderRadius: 7, display: "grid", placeItems: "center", fontSize: 12, color: "var(--ink-3)", cursor: "pointer", flex: "none" }}>{t.icon}</div>)}
                    <span style={{ width: 1, height: 18, background: "var(--line-soft)", flex: "none", margin: "0 2px" }} />
                    {callActions.map(a => <button key={a.label} onClick={a.onClick || noop} title={a.label} style={{ width: 25, height: 25, borderRadius: 7, display: "grid", placeItems: "center", fontSize: 12, color: "var(--ink-3)", cursor: "pointer", flex: "none", background: "transparent", border: "none" }}>{a.icon}</button>)}
                    <div className="row" style={{ marginLeft: "auto", gap: 6, flex: "none" }}>
                      <div title="Draft with Paige" style={{ width: 27, height: 27, borderRadius: 8, border: "1px solid var(--line)", background: "var(--surface)", display: "grid", placeItems: "center", fontSize: 12, color: "var(--violet)", cursor: "pointer" }}>✦</div>
                      <div style={{ padding: "6px 14px", borderRadius: 8, background: GOLD_BG, color: GOLD_INK, fontSize: 11.5, fontWeight: 600, cursor: "pointer" }}>Send</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Rail — cross-book batch, or the contact rail in sub scope. */}
            {crossBook ? (
              <aside style={{ width: 236, flex: "none", minHeight: 0, alignSelf: "flex-start", height: "100%", display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
                <div className="card" style={{ padding: "13px 14px", flex: "none" }}>
                  <div className="eyebrow" style={{ fontSize: 9.5 }}>WHOSE RELATIONSHIP</div>
                  <div className="row" style={{ gap: 9, marginTop: 8 }}>
                    <span style={{ width: 3, height: 24, borderRadius: 2, background: th.color, flex: "none" }} />
                    <div style={{ minWidth: 0 }}><div className="trunc" style={{ fontSize: 12, fontWeight: 600 }}>{th.tenant}</div><div style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{th.owner}</div></div>
                  </div>
                </div>
                <div className="card" style={{ padding: "13px 14px", flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, flex: "none" }}>She drafted across {ownerWord} today</div>
                  <div style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 4, flex: "none" }}>{batchRows.length} waiting on approval</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 10, overflowY: "auto", minHeight: 0 }}>
                    {batchRows.map((b, i) => (
                      <div key={i} className="row" style={{ gap: 8, alignItems: "flex-start" }}>
                        <span style={{ width: 3, height: 26, borderRadius: 2, background: b.color, flex: "none" }} />
                        <div style={{ minWidth: 0 }}>
                          <div className="trunc" style={{ fontSize: 11.5, fontWeight: 600 }}>{b.who}</div>
                          <div className="trunc" style={{ fontSize: 10.5, color: "var(--ink-3)", marginTop: 2 }}>{b.tenant} · {b.age}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => setBatchOpen(true)} style={{ marginTop: 10, padding: "8px 12px", borderRadius: 9, background: GOLD_BG, color: GOLD_INK, fontSize: 11.5, fontWeight: 600, cursor: "pointer", textAlign: "center", flex: "none", border: "none" }}>Approve all {batchRows.length}</button>
                </div>
              </aside>
            ) : (
              <aside style={{ width: 262, flex: "none", minHeight: 0, alignSelf: "flex-start", height: "100%", display: "flex", flexDirection: "column", gap: 11, overflowY: "auto" }}>
                <div className="card" style={{ padding: "15px 16px", flex: "none", textAlign: "center" }}>
                  <div style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--rail-2)", color: "#FFFDF8", display: "grid", placeItems: "center", fontSize: 14, fontWeight: 600, margin: "0 auto" }}>{th.initials}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginTop: 9 }}>{th.who}</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 3 }}>{th.role}</div>
                  <div className="row" style={{ justifyContent: "center", gap: 7, marginTop: 11 }}>
                    {["☏", "✉", "▤", "☾"].map(g => <span key={g} style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid var(--line)", display: "grid", placeItems: "center", fontSize: 11, color: "var(--ink-2)", cursor: "pointer" }}>{g}</span>)}
                  </div>
                </div>
                <div style={{ border: "1px solid var(--violet-line)", borderRadius: 12, background: "var(--violet-tint)", padding: "14px 15px", flex: "none" }}>
                  <div className="row" style={{ gap: 8 }}><span style={{ display: "flex", color: "var(--violet)" }}><Ic.spark size={12} /></span><div style={{ fontSize: 12, fontWeight: 600, color: "var(--violet)" }}>Paige on this thread</div></div>
                  <div style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ink-2)", marginTop: 8 }}>{th.insight}</div>
                </div>
                <div className="card" style={{ padding: "14px 15px", flex: "none" }}>
                  <div className="eyebrow" style={{ fontSize: 9.5 }}>REACH THEM</div>
                  <div style={{ marginTop: 9, display: "flex", flexDirection: "column", gap: 6 }}>
                    <div style={{ fontSize: 11.5, color: "var(--ink-2)" }}>{th.email}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-2)" }}>{th.phone}</div>
                  </div>
                </div>
              </aside>
            )}
          </div>
        </>
      )}

      {/* ── Analytics ────────────────────────────────────────────────────────── */}
      {inner === "Analytics" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="row" style={{ gap: 8, flex: "none", flexWrap: "wrap" }}>
            <div className="row" style={{ gap: 6, flex: "none" }}>
              {[["perf", "Performance"], ["compare", "Comparison"], ["paige", "Her work"]].map(([k, l]) => {
                const on = caLens === k;
                return <button key={k} onClick={() => setCaLens(k)} style={{ padding: "7px 13px", borderRadius: 9, border: "1px solid " + (on ? "var(--ink)" : "var(--line)"), background: on ? "var(--ink)" : "var(--surface)", color: on ? "var(--ink-inv)" : "var(--ink-2)", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{l}</button>;
              })}
            </div>
            <button onClick={() => { setCaReport(true); setCaStep(0); }} className="btn btn-s" style={{ marginLeft: "auto", height: 32, borderRadius: 9, fontSize: 12, fontWeight: 600, color: "var(--gold)", flex: "none" }}>Full report ⤢</button>
            <span title={FLAGS.caFlag} style={{ flex: "none", width: 22, height: 22, borderRadius: "50%", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", color: "var(--gold)", display: "grid", placeItems: "center", fontSize: 11, cursor: "help" }}>!</span>
          </div>
          <div className="g4" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(116px,100%),1fr))", gap: 9, flex: "none" }}>
            {[["VOLUME · 30 DAYS", "8,890", "+12%", "var(--ok)"], ["REPLY RATE", "47%", "+3 pts", "var(--ok)"], ["MEDIAN FIRST REPLY", "2h 10m", "−26m", "var(--ok)"], ["DELIVERABILITY", "96%", "−1 pt", "var(--warn)"]].map(([l, v, d, tone]) => (
              <div key={l} className="card" style={{ padding: "10px 12px", minWidth: 0 }}>
                <div className="eyebrow trunc" style={{ fontSize: 9 }}>{l}</div>
                <div className="row" style={{ gap: 7, alignItems: "baseline", marginTop: 6 }}>
                  <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-.02em" }}>{v}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: tone }}>{d}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(248px,100%),1fr))", gap: 10, flex: 1, minHeight: 0 }}>
            <div className="card" style={{ padding: "12px 14px", minHeight: 0, overflowY: "auto" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Who's driving the volume</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 11 }}>
                {SUBS.slice(0, 6).map((s, i) => (
                  <div key={s.name} className="row" style={{ gap: 9, minWidth: 0 }}>
                    <span style={{ width: 3, height: 14, borderRadius: 2, background: s.color, flex: "none" }} />
                    <span className="trunc" style={{ fontSize: 11.5, minWidth: 0, flex: "0 1 110px" }}>{s.name}</span>
                    <div style={{ flex: 1, minWidth: 24, height: 6, borderRadius: 4, background: "var(--surface-sunk)", overflow: "hidden" }}><div style={{ height: "100%", width: ((26 - i * 3) / 26 * 100).toFixed(1) + "%", background: s.color }} /></div>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-2)", flex: "none" }}>{26 - i * 3}%</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="card" style={{ padding: "12px 14px", minHeight: 0, overflowY: "auto" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>By channel</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 9, marginTop: 11 }}>
                {CONV_CHANNEL_PERF.map(c => (
                  <div key={c.key} className="row" style={{ gap: 9, minWidth: 0 }}>
                    <span style={{ fontSize: 11.5, fontWeight: 500, flex: "0 0 66px" }}>{c.key}</span>
                    <div style={{ flex: 1, minWidth: 20, height: 6, borderRadius: 4, background: "var(--surface-sunk)", overflow: "hidden" }}><div style={{ height: "100%", width: c.reply + "%", background: "var(--gold)" }} /></div>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-2)", flex: "none", width: 34, textAlign: "right" }}>{c.reply}%</span>
                    <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-3)", flex: "none", width: 48, textAlign: "right" }}>{c.resp}</span>
                    <span className="mono" style={{ fontSize: 10.5, color: delivColorOf(c.deliv), flex: "none", width: 34, textAlign: "right" }}>{c.deliv}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Settings ─────────────────────────────────────────────────────────── */}
      {inner === "Settings" && (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 11, overflowY: "auto" }}>
          <div className="row" style={{ gap: 8, flex: "none", flexWrap: "wrap" }}>
            <div className="row" style={{ gap: 6 }}>
              {[["defaults", "Defaults", CONV_DEFAULTS.length], ["policies", "Policies", CONV_POLICIES.length], ["behavior", "Her behavior", CONV_BEHAVIOR.length]].map(([k, l, n]) => {
                const on = csGroup === k;
                return <button key={k} onClick={() => { setCsGroup(k); setCsRow(null); }} style={{ padding: "7px 13px", borderRadius: 9, border: "1px solid " + (on ? "var(--ink)" : "var(--line)"), background: on ? "var(--ink)" : "var(--surface)", color: on ? "var(--ink-inv)" : "var(--ink-2)", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>{l} · {n}</button>;
              })}
            </div>
            <span title={FLAGS.csFlag} style={{ marginLeft: "auto", flex: "none", width: 22, height: 22, borderRadius: "50%", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", color: "var(--gold)", display: "grid", placeItems: "center", fontSize: 11, cursor: "help" }}>!</span>
          </div>
          {csGroup === "defaults" && (
            <div className="card tbl" style={{ flex: "none" }}>
              <div className="hd"><div><h3>Your defaults</h3><div className="sub">They start here. Each sub-account can change it on their side.</div></div></div>
              {CONV_DEFAULTS.map((d, i) => (
                <button key={d.name} onClick={() => setCsRow(i)} className="row" style={{ width: "100%", textAlign: "left", gap: 12, padding: "13px 20px", borderTop: "1px solid var(--line-soft)", background: "transparent", border: "none", borderTopStyle: "solid", cursor: "pointer" }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="trunc" style={{ fontSize: 13.2, fontWeight: 600 }}>{d.name}</div>
                    <div className="sub trunc" style={{ marginTop: 2 }}>{d.value}</div>
                  </div>
                  <span style={{ fontSize: 11, color: d.over === 0 ? "var(--ink-3)" : "var(--gold)", flex: "none", whiteSpace: "nowrap" }}>{d.over === 0 ? d.using + " of " + SUBS.length + " using this" : d.using + " of " + SUBS.length + " · " + d.over + " overridden"}</span>
                  <Ic.chev size={14} style={{ color: "var(--ink-3)", flex: "none" }} />
                </button>
              ))}
            </div>
          )}
          {csGroup === "policies" && (
            <div className="card tbl" style={{ flex: "none" }}>
              <div className="hd"><div><h3>Book-wide policies</h3><div className="sub">Sub-accounts see these as enforced. They can't switch them off.</div></div><button className="btn btn-s"><Ic.plus size={13} />Add a policy</button></div>
              {CONV_POLICIES.map((p, i) => (
                <button key={p.name} onClick={() => setCsRow(i)} className="row" style={{ width: "100%", textAlign: "left", gap: 12, padding: "13px 20px", borderTop: "1px solid var(--line-soft)", background: "transparent", border: "none", borderTopStyle: "solid", cursor: "pointer" }}>
                  <span style={{ fontSize: 12, color: "var(--gold)", flex: "none" }}>⛉</span>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="trunc" style={{ fontSize: 13.2, fontWeight: 600 }}>{p.name}</div>
                    <div className="sub trunc" style={{ marginTop: 2 }}>{p.body}</div>
                  </div>
                  <span className="pill pill-warn" style={{ flex: "none" }}>Locked</span>
                  <Ic.chev size={14} style={{ color: "var(--ink-3)", flex: "none" }} />
                </button>
              ))}
            </div>
          )}
          {csGroup === "behavior" && (
            <div className="card tbl" style={{ flex: "none" }}>
              <div className="hd"><div><h3>How she behaves in comms</h3><div className="sub">The knobs on her drafting and sending across {ownerWord}.</div></div></div>
              {CONV_BEHAVIOR.map((b, i) => (
                <button key={b.name} onClick={() => setCsRow(i)} className="row" style={{ width: "100%", textAlign: "left", gap: 12, padding: "13px 20px", borderTop: "1px solid var(--line-soft)", background: "transparent", border: "none", borderTopStyle: "solid", cursor: "pointer" }}>
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="trunc" style={{ fontSize: 13.2, fontWeight: 600 }}>{b.name}</div>
                    <div className="sub trunc" style={{ marginTop: 2 }}>{b.note}</div>
                  </div>
                  <span className="mono" style={{ fontSize: 12.5, color: "var(--ink)", flex: "none" }}>{b.value}</span>
                  <Ic.chev size={14} style={{ color: "var(--ink-3)", flex: "none" }} />
                </button>
              ))}
            </div>
          )}
          {crossBook && (
            <div className="card" style={{ padding: "14px 16px", flex: "none" }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Where sub-accounts diverge</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 11 }}>
                {CONV_DIVERGENCE.map((d, i) => (
                  <div key={i} className="row" style={{ gap: 10, minWidth: 0 }}>
                    <span style={{ color: d.ok ? "var(--ok)" : "var(--warn)", fontSize: 12, flex: "none" }}>{d.ok ? "✓" : "!"}</span>
                    <span style={{ width: 3, height: 20, borderRadius: 2, background: SUBS[d.who].color, flex: "none" }} />
                    <div style={{ minWidth: 0 }}><div className="trunc" style={{ fontSize: 12.5, fontWeight: 600 }}>{SUBS[d.who].name}</div><div className="trunc" style={{ fontSize: 11, color: "var(--ink-3)", marginTop: 2 }}>{d.what}</div></div>
                    <span className="trunc" style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--ink-2)", flex: "0 1 220px", textAlign: "right" }}>{d.read}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Stub utilities (Manual Actions / Snippets / Trigger Links) ────────── */}
      {["Manual Actions", "Snippets", "Trigger Links"].indexOf(inner) >= 0 && (
        <div className="card" style={{ padding: "44px 30px", textAlign: "center", flex: "none" }}>
          <div className="tile" style={{ margin: "0 auto 14px", width: 44, height: 44, borderRadius: 15, background: "var(--violet-tint)", color: "var(--violet)" }}><Ic.spark size={22} /></div>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{inner}</div>
          <div className="sub" style={{ maxWidth: 420, margin: "6px auto 0" }}>Pattern-cloned from the Solo console. Book-wide scope for this utility is not built yet — no data source is confirmed for it.</div>
        </div>
      )}

      {/* ── Pop-outs ─────────────────────────────────────────────────────────── */}
      <CsDrawer open={csRow != null} onClose={() => setCsRow(null)} group={csGroup} row={csRow} />
      {crossBook && <ActAsModal open={actAsOpen} onClose={() => setActAsOpen(false)} tenant={th.tenant} owner={th.owner} />}
      <ExpandModal open={expandOpen} onClose={() => setExpandOpen(false)} th={th} ownerWord={ownerWord} sendAsLine={sendAsLine} crossBook={crossBook} onActAs={() => setActAsOpen(true)} onCall={m => { setExpandOpen(false); startCall(m); }} />
      <NewConvoModal open={newConvoOpen} onClose={() => setNewConvoOpen(false)} crossBook={crossBook} tenant={th.tenant} owner={firstOwner} color={th.color} onCall={m => { setNewConvoOpen(false); startCall(m); }} />
      {crossBook && <BatchModal open={batchOpen} onClose={() => setBatchOpen(false)} ownerWord={ownerWord} rows={batchRows} />}
      <CaReport open={caReport} onClose={() => setCaReport(false)} step={caStep} setStep={setCaStep} ownerWord={ownerWord} />
      <CallOverlay mode={callMode} live={callLive} secs={callSecs} who={th.who} number={th.phone} asLine={"Calling as " + th.tenant} initials={th.initials} onEnd={stopCall} padOpen={padOpen} setPadOpen={setPadOpen} dialed={dialed} pushKey={k => setDialed(d => d + k)} clearDialed={() => setDialed("")} tools={callTools} />
      <VideoOverlay open={callMode === "video"} live={callLive} secs={callSecs} who={th.who} asLine={"Calling as " + th.tenant} initials={th.initials} onEnd={stopCall} tools={videoTools} />
    </div>
  );
};

export default ConversationsConsole;
export { ConversationsConsole };
