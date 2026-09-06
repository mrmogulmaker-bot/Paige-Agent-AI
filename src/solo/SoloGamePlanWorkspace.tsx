/**
 * SoloGamePlanWorkspace — the Business Game Plan, reimagined as the owner's STRATEGY DESK
 * (owner-approved 2026-09-06). The spine is the owner's approved strategy — direction, outcomes,
 * priorities, plays, decisions — NOT a readiness list. Systems Check is demoted to a compact,
 * collapsible "Plan dependencies". The Plan Brief is genuinely EDITABLE and persists through the
 * existing setup-brief save seam (§18/§70). Every value carries a source class so the owner always
 * sees how sure Paige is (§13). Ports the owner-approved prototype onto the shipped `.paige-solo`
 * tokens; gold is spent only on the one act (§11). Copy is plain — no route strings, provider names,
 * or internal identifiers reach the screen.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Target, Flag, Layers, Scale, Plug, Sparkles, ArrowRight, ChevronDown, Lock, Check, Info,
  AlertTriangle, RefreshCw, Pencil, X, Shield, Activity, Megaphone,
} from "lucide-react";
import { subtabPath } from "@/lib/routing/tierBranches";
import { resolveTenantAccountContext, type TenantAccountContext } from "@/components/tenant-shell/tenantShellRoutes";
import {
  useSoloGamePlan, type GamePlanDestination, type SourceClass, type PlanBriefField, type DecisionItem,
} from "./data/useSoloGamePlan";
import "./solo-game-plan-workspace.css";

const SR_ONLY: React.CSSProperties = { position: "absolute", width: 1, height: 1, overflow: "hidden", clipPath: "inset(50%)" };

// Plain-language name for each semantic destination — for accessible labels, never a route string.
const DEST_LABEL: Record<string, string> = {
  setup: "Setup", catalog: "Catalog", connections: "Connections",
  "systems-check": "Systems Check", knowledge: "Knowledge", clients: "Clients", paige: "PAIGE",
};

const SRC: Record<SourceClass, [string, string]> = {
  fact: ["sd-src-fact", "Fact"],
  direction: ["sd-src-direction", "Your direction"],
  recommendation: ["sd-src-recommendation", "Paige suggests"],
  assumption: ["sd-src-assumption", "Assumption"],
  unavailable: ["sd-src-unavailable", "Source unavailable"],
  owed: ["sd-src-owed", "Proof owed"],
  blocked: ["sd-src-blocked", "Blocked"],
};
function Src({ kind }: { kind: SourceClass }) {
  const [cls, label] = SRC[kind];
  return <span className={`sd-src ${cls}`}><span className="sdd" />{label}</span>;
}

// Provenance source → source class for a Plan-Brief field. Owner-confirmed is the owner's direction;
// a connection-sourced or needs-confirmation value is shown as an assumption until confirmed (§13).
function provSource(s: string | undefined): SourceClass {
  return s === "owner_confirmed" ? "direction" : "assumption";
}

interface Props {
  accountContext?: TenantAccountContext | null;
  openPaige?: () => void;
  workspaceId?: string | null;
}

type OverlayKind = "edit" | "legend" | null;

export function SoloGamePlanWorkspace({ accountContext, openPaige, workspaceId }: Props = {}) {
  const params = useParams();
  const account = params.account || "";
  const navigate = useNavigate();
  const plan = useSoloGamePlan(account, workspaceId);

  const [horizon, setHorizon] = useState<"annual" | "quarter">("quarter");
  const [openPlays, setOpenPlays] = useState<Set<string>>(new Set());
  const [depOpen, setDepOpen] = useState(false);
  const [deckDismissed, setDeckDismissed] = useState<Set<string>>(new Set());
  const [overlay, setOverlay] = useState<OverlayKind>(null);
  const [draft, setDraft] = useState<Record<PlanBriefField, string> | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resolvedAccount = resolveTenantAccountContext(accountContext);
  const identityMarker = (
    <span style={SR_ONLY}>
      <span data-tenant-account-name>{resolvedAccount.accountName}</span>
      <span aria-hidden="true"> · </span>
      <span data-tenant-account-tier>{resolvedAccount.accountTypeLabel}</span>
    </span>
  );

  const routeFor = (dest: GamePlanDestination): string | null => {
    switch (dest) {
      case "setup": return subtabPath("solo", account, "settings", "setup");
      case "catalog": return subtabPath("solo", account, "growth", "catalog");
      case "connections": return subtabPath("solo", account, "settings", "connections");
      case "systems-check": return subtabPath("solo", account, "command-center", "systems-check");
      case "knowledge": return subtabPath("solo", account, "paige", "knowledge");
      case "clients": return subtabPath("solo", account, "clients", "people");
      default: return null;
    }
  };
  const go = useCallback((dest: GamePlanDestination) => {
    if (dest === "paige") { openPaige?.(); return; }
    const r = routeFor(dest);
    if (r) navigate(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, navigate, openPaige]);

  const flash = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const pb = plan.planBrief;
  const f = pb.fields;

  // ── loading ──
  if (plan.loading) {
    return (
      <div className="gp" aria-busy="true">
        {identityMarker}
        <div className="sd-top">
          <div>
            <div className="sd-sk" style={{ width: 200, height: 11 }} />
            <div className="sd-sk" style={{ width: "55%", height: 24, margin: "10px 0" }} />
            <div className="sd-sk" style={{ width: "70%", height: 12 }} />
          </div>
          <div className="sd-sk" style={{ width: 150, height: 34, borderRadius: 10 }} />
        </div>
        <div className="sd-sk" style={{ height: 40, borderRadius: 11 }} />
        <div className="sd-field">
          <div className="sd-col"><div className="sd-sk" style={{ height: 200, borderRadius: 18 }} /><div className="sd-sk" style={{ height: 220, borderRadius: 18 }} /></div>
          <div className="sd-rail"><div className="sd-sk" style={{ height: 180, borderRadius: 18 }} /><div className="sd-sk" style={{ height: 120, borderRadius: 18 }} /></div>
        </div>
      </div>
    );
  }

  // ── error (spine failed) ──
  if (plan.error) {
    return (
      <div className="gp">
        {identityMarker}
        <div className="sd-field">
          <div className="sd-col">
            <div className="sd-card">
              <div className="sd-errbox">
                <div className="ei"><AlertTriangle /></div>
                <h3>Couldn't load your game plan</h3>
                <p>The connected read didn't respond. Nothing is lost — try again.</p>
                <button className="sd-btn sd-btn-sm" onClick={plan.refresh}><RefreshCw /> Retry</button>
              </div>
            </div>
          </div>
          <div className="sd-rail" />
        </div>
      </div>
    );
  }

  // ── empty first-run ──
  if (plan.empty) {
    return (
      <div className="gp">
        {identityMarker}
        <div className="sd-first">
          <div className="sd-first-in">
            <div className="sd-first-badge"><Target /></div>
            <h1>Let's build your game plan with Paige.</h1>
            <p>This is where your business strategy lives — the direction, the outcomes that matter, and the plays to get there. There's no approved direction yet. Talk it through with Paige, or set it directly, and it becomes your plan.</p>
            <div className="sd-first-steps">
              {plan.firstRun.map((s, i) => (
                <button key={s.destination} className="sd-first-step" onClick={() => go(s.destination)}>
                  <span className="num">{i + 1}</span>
                  <span className="st"><b>{s.label}</b><span>{s.hint}</span></span>
                  <span className="go"><ArrowRight /></span>
                </button>
              ))}
            </div>
            <div className="sd-first-steps" style={{ maxWidth: 470 }}>
              <button className="sd-btn sd-act" onClick={() => go("paige")} style={{ justifyContent: "center" }}><Sparkles /> Plan with Paige</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const hz = horizon === "annual"
    ? { direction: f.annualDirection, outcome: f.successDefinition }
    : { direction: f.currentPriority || f.goals90Day, outcome: f.goals90Day };
  // The provenance chip must label the field ACTUALLY shown — the quarter direction falls back from
  // currentPriority to goals90Day, so its source class follows the same fallback (§13, peer-gate).
  const dirField: PlanBriefField = horizon === "annual"
    ? "annualDirection"
    : (f.currentPriority.trim() ? "currentPriority" : "goals90Day");

  const togglePlay = (id: string) => setOpenPlays((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Plan Brief edit ──
  const openEdit = () => {
    setDraft({ ...f });
    setSaveErr(null);
    setOverlay("edit");
  };
  const saveEdit = async () => {
    if (!draft || saving) return;
    setSaving(true);
    setSaveErr(null);
    try {
      const res = await pb.save(draft);
      if (res.ok) { setOverlay(null); setDraft(null); flash("Saved. Your plan is updated."); }
      else if (res.kind === "conflict" || res.kind === "stale") {
        setSaveErr("This plan changed somewhere else. Close and reopen to get the latest, then edit again.");
      } else setSaveErr(("error" in res && res.error) || "Couldn't save just now. Try again.");
    } catch {
      setSaveErr("Couldn't save just now. Try again.");
    } finally {
      setSaving(false);
    }
  };
  const applyProposal = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await pb.applyProposal();
      if (res.ok) flash("Applied Paige's proposed change to your plan.");
      else flash(("error" in res && res.error) || "Couldn't apply the proposal just now.");
    } finally { setSaving(false); }
  };
  const dismissProposal = async () => {
    await pb.dismissProposal();
    flash("Dismissed — your approved plan is unchanged.");
  };

  // Decision deck (button/keyboard-driven advance; pointer-swipe is a fast-follow slice).
  const deckList = plan.decisions.filter((d) => !deckDismissed.has(d.id));
  const dismissDecision = (id: string) => setDeckDismissed((prev) => new Set(prev).add(id));
  const actDecision = (d: DecisionItem) => { dismissDecision(d.id); go(d.destination); };

  const approvedLabel = pb.updatedAt
    ? `Confirmed · ${new Date(pb.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
    : "Owner-set";

  return (
    <div className="gp">
      {identityMarker}

      {/* ── kicker + primary act ── */}
      <div className="sd-top">
        <div>
          <div className="sd-kicker">
            {[resolvedAccount.accountName, resolvedAccount.accountTypeLabel, plan.greeting.dateLabel].filter(Boolean).map((seg, i) => (
              <React.Fragment key={i}>{i > 0 && <span className="sep">·</span>}{seg}</React.Fragment>
            ))}
          </div>
          <h1 className="sd-h1">{plan.greeting.salutation}, {plan.greeting.name}.</h1>
          <p className="sd-sub">Here's where the business is going and what matters most now — the strategy you and Paige run together.</p>
        </div>
        <div className="sd-acts">
          <button className="sd-btn sd-btn-quiet sd-btn-sm" onClick={plan.refresh}><RefreshCw /> Refresh</button>
          <button className="sd-btn sd-act" onClick={() => go("paige")}><Sparkles /> Plan with Paige</button>
        </div>
      </div>

      {/* ── horizon navigator ── */}
      <div className="sd-horizon">
        <div className="sd-hz-strip" role="group" aria-label="Planning horizon">
          {plan.horizons.map((h) => (
            <button key={h.id} className="sd-hz" aria-pressed={horizon === h.id} onClick={() => setHorizon(h.id)}>
              <span className="hzt">{h.label}</span>
              <span className="hzs">{h.sub}</span>
            </button>
          ))}
        </div>
        <div className="sd-hz-meta"><span className="mlbl">Now:</span><span>{horizon === "annual" ? "Annual — this year" : "This quarter — 90 days"}</span></div>
      </div>

      <div className="sd-field">
        {/* ── strategy spine ── */}
        <div className="sd-col">
          {/* Plan Brief (editable) */}
          <div className="sd-card sd-brief">
            <div className="sd-brief-in">
              <div className="sd-brief-top">
                <span className="sd-eyebrow"><Flag /> Plan brief · {horizon === "annual" ? "Annual" : "This quarter"}</span>
                <div className="sd-hdacts">
                  {pb.pendingProposal && <span className="sd-src sd-src-recommendation"><span className="sdd" />Revision proposed</span>}
                  {pb.hasPlan && <span className="sd-approved"><Check /> {approvedLabel}</span>}
                </div>
              </div>

              {hz.direction ? (
                <>
                  <h2>{hz.direction}</h2>
                  <div style={{ marginTop: -3 }}><Src kind={provSource(pb.provenance[dirField])} /></div>
                </>
              ) : (
                <h2 style={{ color: "var(--ink-3)" }}>No {horizon === "annual" ? "annual direction" : "quarter focus"} set yet.</h2>
              )}

              <div className="bd-outcome"><Target /><span>{hz.outcome ? (<><b>Desired outcome.</b> {hz.outcome} </>) : (<span style={{ color: "var(--ink-3)" }}>Add the outcome that matters most this {horizon === "annual" ? "year" : "quarter"}.</span>)}{hz.outcome && <Src kind={provSource(pb.provenance[horizon === "annual" ? "successDefinition" : "goals90Day"])} />}</span></div>

              <div className="sd-bd-grid">
                <BriefCell label="Priorities" value={f.currentPriority} src={provSource(pb.provenance.currentPriority)} />
                <BriefCell label="Constraints" value={f.constraints} src={provSource(pb.provenance.constraints)} />
                <BriefCell label="How Paige should operate" value={f.operatingPreferences} src={provSource(pb.provenance.operatingPreferences)} />
                <BriefCell label="Don't assume" value={f.doNotAssume} src={provSource(pb.provenance.doNotAssume)} />
              </div>

              <div className="sd-detail-cta">
                <button className="sd-btn sd-btn-sm" onClick={openEdit} disabled={!pb.canEdit}><Pencil /> {pb.hasPlan ? "Edit brief" : "Set your plan"}</button>
                <button className="sd-btn sd-btn-sm sd-btn-quiet" onClick={() => setOverlay("legend")}><Info /> What the labels mean</button>
                <span className="sd-living" style={{ marginLeft: "auto" }}><Sparkles /> You or Paige can change this anytime</span>
              </div>

              {pb.pendingProposal && (
                <div className="sd-banner sd-banner-prop" style={{ gridColumn: "auto" }}>
                  <Sparkles />
                  <span><span className="bt">Paige proposed a change to your plan.</span> {pb.pendingProposal.reason}</span>
                  <span className="sd-hdacts bact">
                    <button className="sd-btn sd-btn-sm sd-act" onClick={applyProposal} disabled={saving}><Check /> Apply</button>
                    <button className="sd-btn sd-btn-sm" onClick={dismissProposal} disabled={saving}><X /> Dismiss</button>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Strategic plays (real campaign briefs) */}
          <div className="sd-card">
            <div className="sd-card-hd">
              <span className="sd-eyebrow"><Layers /> Strategic plays</span>
              <span className="sd-src sd-src-direction"><span className="sdd" />Your deliberate strategy</span>
            </div>
            <div className="sd-list">
              {plan.playsStatus === "ready" && plan.plays.length === 0 && (
                <div className="sd-todo"><Info /><span>No plays defined yet. A play is a deliberate campaign — an offer, an audience, a window. <button className="sd-inline-link" onClick={() => go("paige")}>Shape one with Paige</button> or build it in Campaigns.</span></div>
              )}
              {(plan.playsStatus === "error" || plan.playsStatus === "unavailable") && (
                <div className="sd-todo"><Info /><span>Your plays didn't load just now. <button className="sd-inline-link" onClick={plan.refresh}>Retry</button>.</span></div>
              )}
              {plan.plays.map((p) => {
                const open = openPlays.has(p.id);
                return (
                  <div key={p.id} className="sd-item" data-open={open}>
                    <div className="sd-row" onClick={() => togglePlay(p.id)} style={{ cursor: "pointer" }}>
                      <span className={`sd-ic ${p.blocked ? "bad" : "v"}`}><Megaphone /></span>
                      <span className="sd-main">
                        <span className="sd-title">{p.name} <Src kind="direction" />{p.blocked && <Src kind="blocked" />}</span>
                        <span className="sd-note">{p.objective || "Campaign play"}</span>
                        <span className="sd-tags">
                          {p.window && <span className="sd-src sd-src-unavailable"><span className="sdd" />{p.window}</span>}
                          {p.offerName && <span className="sd-src sd-src-unavailable"><span className="sdd" />{p.offerName}</span>}
                        </span>
                      </span>
                      <span className="sd-hdacts">
                        <button className="sd-caret" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${p.name}`} onClick={(e) => { e.stopPropagation(); togglePlay(p.id); }}><ChevronDown /></button>
                      </span>
                    </div>
                    <div className="sd-detail"><div><div className="sd-detail-in">
                      {p.outcome && <Fact label="Outcome" value={p.outcome} />}
                      {p.audience && <Fact label="Audience" value={p.audience} />}
                      {p.angle && <Fact label="Angle" value={p.angle} />}
                      {(p.window || p.channels) && <Fact label="Window · channels" value={[p.window, p.channels].filter(Boolean).join(" · ")} />}
                      {p.successSignal && <Fact label="Success signal" value={p.successSignal} />}
                      <div className="sd-detail-cta">
                        <button className="sd-btn sd-btn-sm sd-btn-quiet" onClick={() => go("paige")}><Sparkles /> Work this with Paige</button>
                      </div>
                    </div></div></div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Decision & opportunity desk */}
          <div className="sd-card">
            <div className="sd-card-hd">
              <span className="sd-eyebrow"><Scale /> Decision &amp; opportunity desk</span>
              <div className="sd-hdacts"><span className="sd-living"><Sparkles /> You or Paige can change this</span></div>
            </div>
            <Deck items={deckList} onDismiss={dismissDecision} onAct={actDecision} />
          </div>
        </div>

        {/* ── operating rail ── */}
        <div className="sd-rail">
          {/* Plan dependencies (Systems Check demoted) */}
          <div className="sd-card sd-dep" data-open={depOpen}>
            <div className="sd-card-hd" role="button" tabIndex={0} aria-expanded={depOpen}
              onClick={() => setDepOpen((v) => !v)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDepOpen((v) => !v); } }}>
              <span className="sd-eyebrow"><Plug /> Plan dependencies</span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {plan.dependenciesStatus === "unavailable"
                  ? <span className="sd-src sd-src-unavailable"><span className="sdd" />Couldn't check</span>
                  : plan.dependencies.length > 0
                    ? <span className="sd-dep-count">{plan.dependencies.length} affect this plan</span>
                    : <span className="sd-dep-clear">All clear</span>}
                <span className="sd-caret" style={depOpen ? { transform: "rotate(180deg)" } : undefined} aria-hidden="true"><ChevronDown /></span>
              </span>
            </div>
            <div className="sd-dep-body"><div>
              {plan.dependenciesStatus === "unavailable" ? (
                <div className="sd-todo" style={{ borderTop: "1px solid var(--line-soft)" }}><AlertTriangle /><span>Couldn't check your plan dependencies just now — this isn't an all-clear. <button className="sd-inline-link" onClick={() => go("systems-check")}>Open Systems Check</button> to see the latest.</span></div>
              ) : plan.dependencies.length === 0 ? (
                <div className="sd-todo" style={{ borderTop: "1px solid var(--line-soft)" }}><Check /><span>Nothing is blocking your plays right now.</span></div>
              ) : plan.dependencies.map((d) => (
                <button key={d.id} className="sd-dep-row" onClick={() => go("systems-check")}>
                  <span className={`sd-dep-ic ${d.blocking ? "" : "warn"}`}><AlertTriangle /></span>
                  <span><span className="sd-dep-name">{d.title}</span><span className="sd-dep-note">{d.reason}</span></span>
                  <span className="sd-dep-go">Systems Check <ArrowRight /></span>
                </button>
              ))}
              <div className="sd-todo" style={{ borderTop: "1px solid var(--line-soft)", fontSize: 11 }}><Info /><span>Systems Check is a <b style={{ color: "var(--ink-2)", fontWeight: 600 }}>supporting check</b> here — it can block a play, but it is never the plan. Fixes happen in Systems Check.</span></div>
            </div></div>
          </div>

          {/* Work in motion (recorded Rail) */}
          <div className="sd-card">
            <div className="sd-card-hd">
              <span className="sd-eyebrow"><Activity /> Work in motion</span>
              {plan.motion.status === "ready" && plan.motion.items.length > 0
                ? <span className="sd-src sd-src-fact"><span className="sdd" />Recorded</span>
                : <span className="sd-src sd-src-unavailable"><span className="sdd" />{plan.motion.freshness || "—"}</span>}
            </div>
            {plan.motion.status === "ready" && plan.motion.items.length > 0 && (
              <>
                {plan.motion.items.slice(0, 5).map((m) => (
                  <div key={m.id} className="sd-mot-row">
                    <div><div className="sd-mot-name">{m.title}</div><div className="sd-mot-sub">{m.department}{m.summary ? ` · ${m.summary}` : ""}</div></div>
                    <div className="sd-mot-when">{m.when}</div>
                  </div>
                ))}
              </>
            )}
            {plan.motion.status === "ready" && plan.motion.items.length === 0 && (
              <div className="sd-todo" style={{ padding: "14px 15px" }}><Activity /><span>No recorded work yet. As you and Paige act on the plan, it appears here.</span></div>
            )}
            {plan.motion.status === "forbidden" && (
              <div className="sd-todo" style={{ padding: "14px 15px" }}><Lock /><span>You don't have access to this workspace's recorded activity.</span></div>
            )}
            {plan.motion.status === "unavailable" && (
              <div className="sd-errbox"><div className="ei"><AlertTriangle /></div><h3>Couldn't load recent activity</h3><button className="sd-btn sd-btn-sm" onClick={plan.refresh}><RefreshCw /> Retry</button></div>
            )}
          </div>

          {/* Paige's operating contribution */}
          <div className="sd-card sd-partner">
            <div className="sd-card-hd"><span className="sd-eyebrow"><Sparkles /> Your operating partner</span></div>
            <div className="sd-partner-in">
              <div className="sd-align">
                <span className="al-ic"><Shield /></span>
                <span><span className="al-t">Paige runs the plan with you</span><span className="al-s">She has your approved plan and today's priorities in view.</span></span>
              </div>
              <div className="sd-contrib">
                <div className="honest"><Info /><span>Sends and price changes stay your approval — nothing goes out on its own. What Paige may do is set by your Trust Compass.</span></div>
              </div>
              <button className="sd-btn sd-partner-open" onClick={() => go("paige")}><Sparkles /> Open PAIGE <ArrowRight /></button>
            </div>
          </div>
        </div>
      </div>

      {/* ── overlays ── */}
      {overlay === "edit" && draft && (
        <Overlay kind="drawer" title={pb.hasPlan ? "Edit plan brief" : "Set your plan"} sub="You can change this — and so can Paige from your chat" onClose={() => { setOverlay(null); setDraft(null); }}>
          <div className="ov-body">
            <div className="ov-note"><Info /><span>Editing saves as your direction, with a record of when you confirmed it. Paige can also propose changes from your chat, which you approve here.</span></div>
            <EditField label="Annual direction" value={draft.annualDirection} onChange={(v) => setDraft({ ...draft, annualDirection: v })} />
            <EditField label="This quarter's focus" value={draft.currentPriority} onChange={(v) => setDraft({ ...draft, currentPriority: v })} />
            <EditField label="Desired outcome (90 days)" value={draft.goals90Day} onChange={(v) => setDraft({ ...draft, goals90Day: v })} />
            <EditField label="What success looks like" value={draft.successDefinition} onChange={(v) => setDraft({ ...draft, successDefinition: v })} />
            <EditField label="Constraints" value={draft.constraints} onChange={(v) => setDraft({ ...draft, constraints: v })} />
            <EditField label="How Paige should operate" value={draft.operatingPreferences} onChange={(v) => setDraft({ ...draft, operatingPreferences: v })} />
            <EditField label="Don't assume" value={draft.doNotAssume} onChange={(v) => setDraft({ ...draft, doNotAssume: v })} />
            {saveErr && <div className="ov-err">{saveErr}</div>}
          </div>
          <div className="ov-foot">
            <button className="sd-btn sd-btn-sm sd-btn-quiet" onClick={() => { setOverlay(null); setDraft(null); }}>Cancel</button>
            <button className="sd-btn sd-btn-sm sd-act" onClick={saveEdit} disabled={saving}><Check /> {saving ? "Saving…" : "Save changes"}</button>
          </div>
        </Overlay>
      )}
      {overlay === "legend" && (
        <Overlay kind="modal" title="What the source labels mean" sub="Every value on this desk is labelled by how sure Paige is" onClose={() => setOverlay(null)}>
          <div className="ov-body"><div className="ov-legend">
            {(["fact", "direction", "recommendation", "assumption", "unavailable", "owed"] as SourceClass[]).map((k) => (
              <div className="lg" key={k}><Src kind={k} /><div><div className="lgt">{SRC[k][1]}</div><div className="lgd">{LEGEND[k]}</div></div></div>
            ))}
          </div></div>
          <div className="ov-foot"><button className="sd-btn sd-btn-sm sd-btn-quiet" onClick={() => setOverlay(null)}>Close</button></div>
        </Overlay>
      )}

      {toast && <div className="sd-toast" role="status" aria-live="polite"><Info />{toast}</div>}
    </div>
  );
}

const LEGEND: Record<string, string> = {
  fact: "Read straight from your data — a pipeline count, a recorded event.",
  direction: "Something you decided and Paige is holding to.",
  recommendation: "A recommendation from Paige — yours to accept, edit, or reject.",
  assumption: "A model estimate standing in until real data confirms it.",
  unavailable: "An honest gap — Paige shows nothing rather than guessing.",
  owed: "A claim the plan leans on that still needs data to prove.",
};

function BriefCell({ label, value, src }: { label: string; value: string; src: SourceClass }) {
  return (
    <div className="sd-bd-cell">
      <div className="bl"><span>{label}</span>{value.trim() && <Src kind={src} />}</div>
      <div className={`bv${value.trim() ? "" : " empty"}`}>{value.trim() || "Not set yet"}</div>
    </div>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return <div className="sd-fact"><span className="fl">{label}</span><span className="fv">{value}</span></div>;
}
function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="ov-field">
      <label>{label}</label>
      <textarea className="fin" rows={2} maxLength={4000} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/** A focus-trapped overlay (drawer or modal): Escape closes, focus enters + returns, Tab wraps. */
function Overlay({ kind, title, sub, onClose, children }: { kind: "drawer" | "modal"; title: string; sub?: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Read onClose through a ref so the focus-trap effect can run ONCE (mount) instead of re-running
  // whenever the parent passes a new inline onClose identity. Re-running it on every keystroke
  // (via setDraft → parent re-render → new onClose) refocuses the FIRST field on each character,
  // making every field but the first uneditable — the exact §70 defect the peer-gate caught.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    opener.current = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () => Array.from(node?.querySelectorAll<HTMLElement>('button,[href],input,textarea,select,[tabindex]:not([tabindex="-1"])') ?? []).filter((n) => n.offsetParent !== null);
    focusables()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key === "Tab") {
        const nodes = focusables();
        if (!nodes.length) return;
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); opener.current?.focus?.(); };
    // Mount-once: focus enters once and returns on unmount; onClose is read live via the ref (only
    // refs are referenced, so there are no reactive deps to declare).
  }, []);
  return (
    <div className="ov-scrim" data-kind={kind} role="dialog" aria-modal="true" aria-label={title} ref={ref}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ov-sheet">
        <div className="ov-hd">
          <span className="oh-ic">{kind === "drawer" ? <Pencil /> : <Info />}</span>
          <div><h3>{title}</h3>{sub && <div className="oh-sub">{sub}</div>}</div>
          <button className="oh-x" aria-label="Close" onClick={onClose}><X /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** The decision & opportunity deck — a stack you clear one card at a time (buttons + keyboard;
 *  pointer-swipe is a fast-follow). Each card is source-labelled. */
function Deck({ items, onDismiss, onAct }: { items: DecisionItem[]; onDismiss: (id: string) => void; onAct: (d: DecisionItem) => void }) {
  if (items.length === 0) {
    return (
      <div className="sd-deck"><div className="sd-deck-empty">
        <div className="de-ic"><Check /></div>
        <h4>All caught up</h4>
        <p>New decisions and opportunities land here as things change — from your data or from Paige.</p>
      </div></div>
    );
  }
  const top = items[0];
  const peeks = items.slice(1, 3);
  return (
    <div className="sd-deck">
      <div className="sd-deck-stack">
        {peeks.map((d, i) => (
          <div key={d.id} className={`sd-dcard peek peek${i + 1}`} aria-hidden="true">
            <div className="sd-dcard-top"><span className="sd-dcard-ic"><Sparkles /></span><Src kind={d.source} /></div>
            <h4>{d.title}</h4><div className="dc-note">{d.detail}</div>
          </div>
        ))}
        <div className="sd-dcard top" tabIndex={0} role="group"
          aria-label={`${top.title}. Use the buttons or arrow keys.`}
          onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); onDismiss(top.id); } else if (e.key === "ArrowRight") { e.preventDefault(); onAct(top); } }}>
          <div className="sd-dcard-top">
            <span className="sd-dcard-ic"><Sparkles /></span>
            <div className="sd-hdacts"><Src kind={top.source} />{top.waiting && <span className="sd-src sd-src-direction"><span className="sdd" />Waiting on you</span>}</div>
          </div>
          <h4>{top.title}</h4>
          <div className="dc-note">{top.detail}</div>
          <div className="dc-ev"><Info /><span>{top.evidence}</span></div>
          <div className="dc-acts">
            <button className="sd-btn sd-btn-sm sd-btn-quiet" onClick={() => onDismiss(top.id)}><X /> Not now</button>
            <button className="sd-btn sd-btn-sm" onClick={() => onAct(top)}>Open {DEST_LABEL[top.destination] || "PAIGE"} <ArrowRight /></button>
          </div>
        </div>
      </div>
      <div className="sd-deck-foot">
        <div className="sd-deck-swipehint"><Info /> Clear one at a time</div>
        <div className="sd-deck-count">{items.length} left</div>
      </div>
    </div>
  );
}

export default SoloGamePlanWorkspace;
