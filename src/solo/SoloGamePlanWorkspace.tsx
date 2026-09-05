// @ts-nocheck
/**
 * SoloGamePlanWorkspace — the Business Game Plan, the default Command Center landing.
 *
 * Renders the owner-approved surface from `useSoloGamePlan` (which composes only released,
 * tenant-safe reads). This component owns navigation: it maps the view-model's SEMANTIC
 * destination to a real route or to opening the one PAIGE conversation (§corr #4 — every
 * primary action goes somewhere real and authorized). All visible copy is plain — no route
 * strings, provider names, or internal identifiers reach the screen (§corr #3).
 */
import React, { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  Target, Star, Lock, Sparkles, ArrowRight, ChevronDown, Building2, Activity,
  AlertTriangle, Check, Info, RefreshCw,
} from "lucide-react";
import { subtabPath } from "@/lib/routing/tierBranches";
import { useSoloGamePlan } from "./data/useSoloGamePlan";
import "./solo-game-plan-workspace.css";

const OWNER = {
  you: { cls: "gp-own-you", label: "You", av: "ME" },
  paige: { cls: "gp-own-paige", label: "PAIGE", av: "P" },
};
const PROOF = {
  live: ["gp-chip-live", "Live"],
  partial: ["gp-chip-partial", "Partial"],
  input: ["gp-chip-input", "Needs input"],
  blocked: ["gp-chip-blocked", "Blocked"],
};
const FND_ICON = { grounded: Check, incomplete: Info, "needs-input": AlertTriangle };
const FND_WORD = { grounded: "Grounded", incomplete: "Finish", "needs-input": "Add" };

function Chip({ proof }) {
  const [cls, label] = PROOF[proof] || PROOF.partial;
  return <span className={`gp-chip ${cls}`}><span className="gp-cd" />{label}</span>;
}
function Owner({ owner }) {
  const o = OWNER[owner] || OWNER.paige;
  return <span className={`gp-own ${o.cls}`}><span className="gp-av">{o.av}</span>{o.label}</span>;
}

export function SoloGamePlanWorkspace({ accountContext, openPaige, workspaceId } = {}) {
  const params = useParams();
  const account = params.account || "";
  const navigate = useNavigate();
  const plan = useSoloGamePlan(account, workspaceId);
  const [openId, setOpenId] = useState(null);

  const routeFor = (dest) => {
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
  const go = (dest) => {
    if (dest === "paige") { openPaige?.(); return; }
    const r = routeFor(dest);
    if (r) navigate(r);
  };

  // ── loading ──
  if (plan.loading) {
    return (
      <div className="gp" aria-busy="true">
        <div className="gp-brief">
          <div>
            <div className="gp-sk" style={{ width: 180, height: 11 }} />
            <div className="gp-sk" style={{ width: "60%", height: 26, margin: "10px 0" }} />
            <div className="gp-sk" style={{ width: "80%", height: 12 }} />
          </div>
          <div className="gp-sk" style={{ width: 150, height: 36, borderRadius: 10 }} />
        </div>
        <div className="gp-field">
          <div className="gp-col">
            <div className="gp-card gp-sk" style={{ height: 150, border: 0 }} />
            <div className="gp-card" style={{ padding: 16 }}>
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <div className="gp-sk" style={{ width: "70%", height: 12, margin: "7px 0" }} />
                  <div className="gp-sk" style={{ width: "45%", height: 12, margin: "7px 0" }} />
                </div>
              ))}
            </div>
          </div>
          <div className="gp-rail">
            <div className="gp-card gp-sk" style={{ height: 210, border: 0 }} />
            <div className="gp-card gp-sk" style={{ height: 120, border: 0 }} />
          </div>
        </div>
      </div>
    );
  }

  // ── error (spine failed) ──
  if (plan.error) {
    return (
      <div className="gp">
        <div className="gp-field">
          <div className="gp-col">
            <div className="gp-card">
              <div className="gp-errbox">
                <div className="gp-ei"><AlertTriangle /></div>
                <h3>Couldn't load your game plan</h3>
                <p>The connected read didn't respond. Nothing is lost — try again.</p>
                <button className="gp-btn gp-btn-sm" onClick={plan.refresh}><RefreshCw /> Retry</button>
              </div>
            </div>
          </div>
          <div className="gp-rail" />
        </div>
      </div>
    );
  }

  // ── empty first-run ──
  if (plan.empty) {
    return (
      <div className="gp">
        <div className="gp-first">
          <div className="gp-first-in">
            <div className="gp-first-badge"><Target /></div>
            <h1>Let's build your game plan.</h1>
            <p>This is day one. PAIGE can't ground a plan yet — she needs the shape of your business first. Start with your Business Context; the rest of the plan builds from there.</p>
            <div className="gp-first-steps">
              {plan.firstRun.map((s, i) => (
                <button key={s.destination} className="gp-first-step" onClick={() => go(s.destination)}>
                  <span className="gp-num">{i + 1}</span>
                  <span className="gp-st"><b>{s.label}</b><span>{s.hint}</span></span>
                  <span className="gp-go"><ArrowRight /></span>
                </button>
              ))}
            </div>
            <div className="gp-first-cta">
              <button className="gp-btn gp-act" onClick={() => go("setup")}><ArrowRight /> Start Business Context</button>
              <button className="gp-btn" onClick={() => go("paige")}><Sparkles /> Or let PAIGE walk you through it</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const best = plan.bestMove;

  return (
    <div className="gp">
      {/* operating brief */}
      <div className="gp-brief">
        <div>
          <div className="gp-kicker">
            {(accountContext?.name || "Your business")}<span className="gp-sep">·</span>Solo<span className="gp-sep">·</span>{plan.greeting.dateLabel}
          </div>
          <h1>{plan.greeting.salutation}, {plan.greeting.name}.</h1>
          <p className="gp-narr">{plan.narrative}</p>
          {plan.attention.length > 0 && (
            <div className="gp-attn">
              {plan.attention.map((a, i) => {
                const [cls] = PROOF[a.tone] || PROOF.partial;
                return <span key={i} className={`gp-chip ${cls}`}><span className="gp-cd" />{a.label}</span>;
              })}
            </div>
          )}
        </div>
        <div className="gp-actions">
          <button className="gp-btn gp-btn-quiet gp-btn-sm" onClick={plan.refresh}><RefreshCw /> Refresh</button>
          <button className="gp-btn gp-act" onClick={() => go("paige")}><Sparkles /> Put PAIGE to work</button>
        </div>
      </div>

      <div className="gp-field">
        {/* priority column */}
        <div className="gp-col">
          {best && (
            <div className={`gp-card gp-bnm ${best.proof === "blocked" ? "gp-blocked" : ""}`}>
              <div className="gp-bnm-in">
                <div className="gp-bnm-top">
                  <div className="gp-bnm-star">{best.proof === "blocked" ? <Lock /> : <Star />}</div>
                  <span className="gp-bnm-lbl">{best.proof === "blocked" ? "Top move · blocked" : "The one move that matters most now"}</span>
                </div>
                <h2>{best.title}</h2>
                <p className="gp-bnm-why">{best.why}</p>
                {best.blockedReason && (
                  <div className="gp-bnm-block"><AlertTriangle /><span>{best.blockedReason}</span></div>
                )}
                <div className="gp-bnm-meta"><Owner owner={best.owner} /><Chip proof={best.proof} /></div>
                <div className="gp-bnm-cta">
                  <button className="gp-btn gp-act" onClick={() => go(best.destination)}>{best.ctaLabel} <ArrowRight /></button>
                  {best.destination !== "paige" && (
                    <button className="gp-btn" onClick={() => go("paige")}><Sparkles /> Ask PAIGE</button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="gp-card">
            <div className="gp-card-hd">
              <span className="gp-eyebrow"><Target /> Priority path</span>
              <span className="gp-chip gp-chip-ghost">Derived from your foundation &amp; findings</span>
            </div>
            <div className="gp-pp-list">
              {plan.priorities.length === 0 && (
                <div className="gp-pp"><div className="gp-pp-why" style={{ margin: 0 }}>Nothing else is queued right now. Bring PAIGE a goal and she'll add the next moves.</div></div>
              )}
              {plan.priorities.map((pr, idx) => {
                const isOpen = openId === pr.id;
                const toggle = () => setOpenId(isOpen ? null : pr.id);
                return (
                  <div key={pr.id} className={`gp-pp ${pr.proof === "blocked" ? "gp-is-blocked" : ""}`} data-open={isOpen}>
                    <div
                      className="gp-pp-row" role="button" tabIndex={0} aria-expanded={isOpen}
                      onClick={toggle}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}
                    >
                      <div className="gp-pp-rank">{idx + 2}</div>
                      <div className="gp-pp-main">
                        <div className="gp-pp-title">{pr.title}</div>
                        <div className="gp-pp-why">{pr.why}</div>
                        <div className="gp-pp-tags"><Owner owner={pr.owner} /><Chip proof={pr.proof} /></div>
                      </div>
                      <div className="gp-pp-caret"><ChevronDown /></div>
                    </div>
                    <div className="gp-pp-detail"><div><div className="gp-pp-detail-in">
                      <div className="gp-fact"><span className="gp-fl">Why now</span><span className="gp-fv">{pr.why}</span></div>
                      <div className="gp-fact"><span className="gp-fl">Evidence</span><span className="gp-fv">{pr.evidence}</span></div>
                      <div className="gp-fact"><span className="gp-fl">What happens</span><span className="gp-fv">{pr.outcome}</span></div>
                      <div className="gp-bnm-cta">
                        <button className="gp-btn gp-btn-sm" onClick={() => go(pr.destination)}>{pr.ctaLabel} <ArrowRight /></button>
                      </div>
                    </div></div></div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* rail */}
        <div className="gp-rail">
          {/* foundation + coverage */}
          <div className="gp-card">
            <div className="gp-card-hd">
              <span className="gp-eyebrow"><Building2 /> Business foundation</span>
              <Chip proof={plan.coverage.grounded === plan.coverage.total ? "live" : plan.foundation.some((f) => f.status === "needs-input") ? "input" : "partial"} />
            </div>
            <div className="gp-fnd">
              {plan.foundation.map((f) => {
                const Ic = FND_ICON[f.status] || Info;
                return (
                  <button key={f.key} className={`gp-fnd-row gp-${f.status}`} onClick={() => go(f.destination)}>
                    <span className="gp-fnd-ic"><Ic /></span>
                    <span className="gp-fnd-body">
                      <span className="gp-fnd-name">{f.label}</span>
                      <span className="gp-fnd-note">{f.note}</span>
                    </span>
                    <span className="gp-fnd-go">{FND_WORD[f.status]} <ArrowRight /></span>
                  </button>
                );
              })}
            </div>
            <div className="gp-cov">
              <div className="gp-cov-top">
                <span className="gp-eyebrow">What PAIGE can ground</span>
                <b>{plan.coverage.grounded}<span className="gp-of"> / {plan.coverage.total}</span></b>
              </div>
              <div className="gp-cov-bar">
                <i className="gp-g" style={{ width: `${Math.round((plan.coverage.grounded / plan.coverage.total) * 100)}%` }} />
                <i className="gp-p" style={{ width: `${Math.round((plan.coverage.partial / plan.coverage.total) * 100)}%` }} />
              </div>
              <div className="gp-cov-cap">{plan.coverage.caption}</div>
            </div>
          </div>

          {/* work in motion */}
          <div className="gp-card">
            <div className="gp-card-hd">
              <span className="gp-eyebrow"><Activity /> Work in motion</span>
              {plan.motion.status === "ready" && plan.motion.items.length > 0
                ? <Chip proof="live" />
                : <span className="gp-chip gp-chip-unavail"><span className="gp-cd" />{plan.motion.freshness || "—"}</span>}
            </div>
            {plan.motion.status === "loading" && (
              <div style={{ padding: 16 }}><div className="gp-sk" style={{ width: "60%", height: 12 }} /></div>
            )}
            {plan.motion.status === "ready" && plan.motion.items.length > 0 && (
              <>
                {plan.motion.items.slice(0, 6).map((m) => (
                  <div key={m.id} className="gp-mot-row">
                    <div>
                      <div className="gp-mot-name">{m.title}</div>
                      <div className="gp-mot-sub">{m.department}{m.summary ? ` · ${m.summary}` : ""}</div>
                    </div>
                    <div className="gp-mot-when">{m.when}</div>
                  </div>
                ))}
                <div className="gp-mot-caveat"><Info /><span>Shown by department. Which specialist handled each item isn't recorded yet, so we don't name one.</span></div>
              </>
            )}
            {plan.motion.status === "ready" && plan.motion.items.length === 0 && (
              <div className="gp-mot-first">
                <div className="gp-mot-ic"><Activity /></div>
                <h3>No recorded work yet</h3>
                <p>As you and PAIGE act on the plan, the work she picks up appears here — with what's waiting on you. It stays empty until there's real work to show.</p>
              </div>
            )}
            {plan.motion.status === "forbidden" && (
              <div className="gp-mot-first">
                <div className="gp-mot-ic"><Lock /></div>
                <h3>Activity isn't available here</h3>
                <p>You don't have access to this workspace's recorded activity.</p>
              </div>
            )}
            {plan.motion.status === "unavailable" && (
              <div className="gp-errbox">
                <div className="gp-ei"><AlertTriangle /></div>
                <h3>Couldn't load recent activity</h3>
                <button className="gp-btn gp-btn-sm" onClick={plan.refresh}><RefreshCw /> Retry</button>
              </div>
            )}
          </div>

          {/* PAIGE partner */}
          <div className="gp-card gp-partner">
            <div className="gp-card-hd"><span className="gp-eyebrow"><Sparkles /> Your operating partner</span></div>
            <div className="gp-partner-in">
              <p>PAIGE runs the plan with you. Open the conversation to talk through what matters now — she has your foundation and today's priorities in view.</p>
              <button className="gp-btn gp-partner-open" onClick={() => go("paige")}>Open PAIGE <ArrowRight /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SoloGamePlanWorkspace;
