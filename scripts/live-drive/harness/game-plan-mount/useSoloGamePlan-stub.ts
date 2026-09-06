/**
 * Dev-only stub of `useSoloGamePlan` for the Business Game Plan (Strategy Desk) render harness.
 *
 * MOCK THE PROVIDER, NEVER THE CONTRACT. The REAL `SoloGamePlanWorkspace`, its REAL CSS and the
 * REAL Solo shell chain render against these deterministic view-models — only the composed reads
 * are stubbed. The mode is read from `?mode=` on load, so each frame is a fixed, reproducible
 * state. This proves GEOMETRY, STATE RENDERING and both palettes; it does NOT prove the
 * authenticated production surface — §32.c stays owed to a session that can drive the deployed app.
 * All data below is fictional and labelled.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

const vi = () => {}; // no-op refresh for the harness
const okSave = async () => ({ ok: true, kind: "saved" });

function grounded() {
  return {
    loading: false, error: false, empty: false,
    greeting: { name: "Jordan", dateLabel: "Saturday, September 6", salutation: "Good afternoon" },
    narrative: "", attention: [], bestMove: null, priorities: [], foundation: [],
    coverage: { grounded: 0, partial: 0, degraded: 0, total: 5, caption: "" },
    firstRun: [],
    planBrief: {
      fields: {
        annualDirection: "Become the default operations advisor for Series-A ops leaders in the Northeast.",
        goals90Day: "6 retained clients at ~$4k/mo signed by the end of the quarter.",
        currentPriority: "Convert the 3 warm referrals and ship the ops-audit offer page.",
        successDefinition: "$20k/mo in retained advisory revenue by December.",
        constraints: "Solo capacity — max 8 active clients; no paid-ads budget this quarter.",
        operatingPreferences: "Keep outreach personal; Paige drafts, you approve every send.",
        doNotAssume: "Don't assume a client wants a call before a written summary.",
      },
      provenance: { annualDirection: "owner_confirmed", currentPriority: "owner_confirmed", goals90Day: "owner_confirmed", successDefinition: "owner_confirmed", constraints: "owner_confirmed" },
      hasPlan: true, canEdit: true, saving: false, pendingProposal: null, updatedAt: "2026-09-04T00:00:00Z",
      save: okSave, applyProposal: okSave, dismissProposal: async () => ({ ok: true }),
    },
    horizons: [
      { id: "annual", label: "Annual", sub: "This year", direction: "Become the default operations advisor for Series-A ops leaders in the Northeast.", outcome: "$20k/mo in retained advisory revenue by December.", defined: true },
      { id: "quarter", label: "This quarter", sub: "90 days", direction: "Convert the 3 warm referrals and ship the ops-audit offer page.", outcome: "6 retained clients at ~$4k/mo signed by the end of the quarter.", defined: true },
    ],
    playsStatus: "ready",
    plays: [
      { id: "p1", name: "Q3 Launch campaign", objective: "Put the ops-audit offer in front of the warm list before renewal season.", audience: "Warm list + the 3 referrals + lapsed clients", angle: "Find the 3 operations leaks costing you a hire", window: "Sep 22 – Oct 3", channels: "Email, 1:1 outreach", outcome: "20 booked diagnostics from the launch window.", successSignal: "Diagnostics booked + reply rate.", offerName: "Ops-audit diagnostic", status: "approved", blocked: false },
      { id: "p2", name: "Referral engine", objective: "Turn warm intros into a repeatable pipeline.", audience: "Past clients", angle: "", window: "", channels: "", outcome: "A standing intro sequence + case studies.", successSignal: "", offerName: null, status: "draft", blocked: false },
    ],
    decisions: [
      { id: "d1", title: "Review 3 drafts Paige is holding", detail: "Paige prepared these and stopped for your approval.", source: "recommendation", waiting: true, destination: "paige", evidence: "3 items Paige drafted, waiting on you." },
      { id: "d2", title: "Re-engage 2 clients before they lapse", detail: "These crossed your usual quiet threshold. Paige can draft a note in your voice for each.", source: "recommendation", waiting: false, destination: "clients", evidence: "2 clients flagged at risk in your book." },
    ],
    dependencies: [
      { id: "dep1", title: "Sending identity not verified", reason: "Blocks the Q3 launch campaign send.", blocking: true },
      { id: "dep2", title: "No payment processor declared yet", reason: "Blocks the paid diagnostic.", blocking: true },
    ],
    dependenciesStatus: "ready",
    motion: { status: "ready", items: [], freshness: "No recorded work yet" },
    refresh: vi,
  };
}

function withPatch(patch: any) {
  const base = grounded();
  return { ...base, ...patch, planBrief: { ...base.planBrief, ...(patch.planBrief ?? {}) } };
}

export function viewFor(mode: string) {
  switch (mode) {
    case "loading":
      return withPatch({ loading: true });
    case "error":
      return withPatch({ error: true });
    case "empty":
      return withPatch({
        empty: true,
        firstRun: [
          { label: "Complete your Business Context", hint: "Who you serve and what you sell", destination: "setup" },
          { label: "Add your first offer", hint: "So PAIGE knows what work to move", destination: "catalog" },
          { label: "Connect one operating system", hint: "Calendar or email, to act for real", destination: "connections" },
        ],
      });
    case "partial":
      return withPatch({
        planBrief: {
          fields: { annualDirection: "Grow the advisory to a full book of retained clients.", goals90Day: "", currentPriority: "", successDefinition: "", constraints: "", operatingPreferences: "", doNotAssume: "" },
          provenance: { annualDirection: "owner_confirmed" }, hasPlan: true,
        },
        horizons: [
          { id: "annual", label: "Annual", sub: "This year", direction: "Grow the advisory to a full book of retained clients.", outcome: "", defined: true },
          { id: "quarter", label: "This quarter", sub: "90 days", direction: "", outcome: "", defined: false },
        ],
        plays: [], decisions: [], dependencies: [],
      });
    case "proposal":
      return withPatch({
        planBrief: {
          pendingProposal: { id: "prop1", reason: "From your Sep 6 conversation — narrow the quarter target to 4–5 clients.", proposedAt: "2026-09-06T00:00:00Z", patch: {} },
        },
      });
    case "blocked":
      return withPatch({
        plays: [{ id: "p1", name: "Q3 Launch campaign", objective: "Put the ops-audit offer in front of the warm list.", audience: "Warm list", angle: "Find the 3 leaks", window: "Sep 22 – Oct 3", channels: "Email", outcome: "20 booked diagnostics.", successSignal: "Bookings.", offerName: "Ops-audit diagnostic", status: "blocked", blocked: true }],
      });
    case "motion":
      return withPatch({
        motion: {
          status: "ready",
          items: [
            { id: "e1", title: "Sent a follow-up to a client", summary: "Re-engagement note", byPaige: true, actorAgent: null, department: "Client Success", when: "4m ago" },
            { id: "e2", title: "Published an offer page", summary: null, byPaige: true, actorAgent: null, department: "Marketing", when: "1h ago" },
            { id: "e3", title: "Added a contact", summary: null, byPaige: false, actorAgent: null, department: "Client Success", when: "3h ago" },
          ],
          freshness: "Latest 4m ago",
        },
      });
    default:
      return grounded();
  }
}

export function useSoloGamePlan(_account: string, _workspaceId?: string | null) {
  const mode = new URLSearchParams(window.location.search).get("mode") || "grounded";
  return viewFor(mode);
}
