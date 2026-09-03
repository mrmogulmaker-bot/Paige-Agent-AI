/**
 * Billing Foundation C — Solo Settings › Billing.
 *
 * This is the screen Foundation A was built under and nothing rendered. It mounts the two real
 * server seams — `get_workspace_billing_authority()` and `get_workspace_billing_contacts()` — and
 * renders ONLY what they prove.
 *
 * WHAT IS ACTUALLY INTERACTIVE HERE (§70.1 — a person can finish a job):
 *   Billing contacts and notices. A workspace owner can designate the workspace's primary billing
 *   contact, designate and revoke a billing delegate, and reload to find the change held. Those are
 *   live Owner-only RPCs with structural eligibility guards behind them.
 *
 * WHAT IS DELIBERATELY NOT CLAIMED:
 *   The plan card states what the platform can prove and no more. There is no entitlement
 *   projection yet (Foundation B, packet §4.3 R11), so today it resolves to an EXPLAINED
 *   unavailable — never "no subscription", never a price, never a renewal date, and never the
 *   $149 catalogue figure, which is a price LIST and not a statement that this workspace is
 *   charged anything. `billing-contract.ts` holds that rule and is tested directly.
 *   "Manage billing" says why it cannot open rather than failing vaguely; the portal feature flag
 *   is off on the platform and every current workspace has no billing-account mapping.
 *
 * TERMINOLOGY (owner ruling R27, 2026-09-02). "Primary billing contact" and "billing delegate" are
 * FUNCTIONAL designations for receiving billing notices. Neither creates, changes, transfers,
 * implies or records legal ownership, equity, corporate or trust ownership, trustee status or
 * co-owner status. Receive, view and manage are three separate permissions: a delegate receives
 * notices and gains no view and no manage authority.
 *
 * NOTHING IS SENT. No sender exists for billing notices anywhere on the platform, so the section
 * says that in plain words rather than implying that a designation reaches an inbox.
 *
 * SCOPE. Everything here lives under `src/solo/`. No shared module and no other tier's surface is
 * touched.
 *
 * CLIENT BILLING IS NOT HERE, AND THAT IS THE POINT (owner, 2026-09-03). A "What you charge your
 * clients" card used to sit on this surface as a pointer. It has MOVED to Campaigns → Sales, where
 * the tenant's own commercial activity lives. Billing is one direction of money only: the platform
 * billing this workspace. What the workspace charges its own customers runs on the tenant's own
 * processor (§38 / §197 LAYER 2) and is stated there, not here.
 */
import { useMemo, useState } from "react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { Bell, CalendarClock, CircleDollarSign, CreditCard, ExternalLink, RefreshCw, TriangleAlert, Users } from "lucide-react";
import { Card, NotYours, Outcome, Status, type WriteState } from "./settings-primitives";
import {
  resolveAiUsagePresentation, resolveBillingPortalPresentation, resolveWorkspaceBillingStatusPresentation,
} from "./billing-contract";
import { useWorkspaceAiUsage } from "./data/useWorkspaceAiUsage";
import { useWorkspaceBillingStatus } from "./data/useWorkspaceBillingStatus";
import {
  PORTAL_REFUSAL_COPY, useWorkspaceBillingAuthority,
} from "./data/useWorkspaceBillingAuthority";
import {
  BILLING_CONTACT_REFUSAL_COPY, useWorkspaceBillingContacts,
  type BillingContactDesignation, type WorkspaceBillingContact,
} from "./data/useWorkspaceBillingContacts";
import { useWorkspaceBillingCandidates, type BillingContactCandidate } from "./data/useWorkspaceBillingCandidates";

/** The one sentence the owner required on this surface, rendered wherever a designation is shown. */
const NOT_OWNERSHIP =
  "These are billing-notice designations only. Naming someone here does not change who owns this " +
  "workspace, and it grants no ownership, equity or co-owner status of any kind.";

const NO_DELIVERY =
  "Billing notices are not being sent yet — no sender exists on the platform for them. Designating " +
  "someone records who they will go to when delivery is built; nothing reaches anyone's inbox today.";

type Authority = ReturnType<typeof useWorkspaceBillingAuthority>;
type BillingStatusHook = ReturnType<typeof useWorkspaceBillingStatus>;

/**
 * The Billing Experience rebuild's plan/usage card (owner brief 2026-09-03). Sourced from
 * `get_workspace_billing_status()` via `resolveWorkspaceBillingStatusPresentation` — access_state
 * and provider readiness are read INDEPENDENTLY (R13): a promotional workspace with no provider
 * mapping reads as a valid promotional account with $0 due, never as "billing unavailable".
 *
 * REPLACES the previous mapping-gated `PlanCard` (`resolveBillingPlanPresentation` with
 * `entitlement: null`), which could never show a real access state because Foundation B's
 * entitlement projection did not exist yet. `get_workspace_billing_status()` IS that real read.
 */
function PlanCard({ status }: { status: BillingStatusHook }) {
  const plan = resolveWorkspaceBillingStatusPresentation({
    loading: status.loading,
    readFailed: status.error !== null,
    status: status.status,
  });

  return <Card title="Plan & usage" icon={CircleDollarSign} truth="PARTIAL">
    <div className="ss-state" data-billing-state={plan.state} role={plan.state === "status-loading" ? "status" : plan.state === "status-error" ? "alert" : undefined}>
      {plan.state === "status-loading" ? <RefreshCw className="ss-spin" aria-hidden/> : plan.state === "status-error" ? <TriangleAlert aria-hidden/> : <CircleDollarSign aria-hidden/>}
      <span><strong>{plan.heading}</strong>{plan.body}</span>
      {plan.canRetry && <button type="button" onClick={status.refresh}>Retry</button>}
    </div>
    {plan.planFields.length > 0 && <div className="ss-fields" style={{ marginTop: 9 }}>
      {plan.planFields.map((f) => <div className="ss-field" key={f.label}><span>{f.label}</span><strong>{f.value}</strong></div>)}
    </div>}
    {/* The SEPARATE honest readiness fact (owner brief): whether a provider billing account and a
        payment method exist. Never merged into the access-state claim above. */}
    {plan.providerFields.length > 0 && <div className="ss-fields" style={{ marginTop: 9 }}>
      {plan.providerFields.map((f) => <div className="ss-field" key={f.label}><span>{f.label}</span><strong>{f.value}</strong></div>)}
    </div>}
    {plan.usageFields.length > 0 && <div className="ss-fields" style={{ marginTop: 9 }}>
      {plan.usageFields.map((f) => <div className="ss-field" key={f.label}><span>{f.label}</span><strong>{f.value}</strong></div>)}
    </div>}
    {plan.note && <p className="ss-note">{plan.note}</p>}
  </Card>;
}

function PortalCard({ authority }: { authority: Authority }) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<WriteState>(null);

  if (authority.loading) {
    return <Card title="Payment method" icon={CreditCard} truth="PARTIAL">
      <div className="ss-state" role="status"><RefreshCw className="ss-spin" aria-hidden/>Clearing and resolving this account…</div>
    </Card>;
  }
  // A read that FAILED is not an answer about this account type. Rendering "not applicable to this
  // account type" here would state something nobody checked.
  if (authority.error || !authority.authority) {
    return <Card title="Payment method" icon={CreditCard} truth="PARTIAL">
      <div className="ss-state" data-portal-state="portal-unreadable" role="alert">
        <TriangleAlert aria-hidden/>
        <span><strong>Couldn’t read your billing permissions</strong>Nothing about your access or your billing has changed.</span>
        <button type="button" onClick={authority.refresh}>Retry</button>
      </div>
    </Card>;
  }
  const portal = resolveBillingPortalPresentation({
    scope: authority.authority.scope,
    canManageBilling: authority.authority.canManageBilling,
    billingAccountState: authority.authority.billingAccountState,
  });

  return <Card title="Payment method" icon={CreditCard} truth="PARTIAL">
    <div className="ss-state" data-portal-state={portal.state}>
      <CreditCard aria-hidden/>
      <span><strong>{portal.heading}</strong>{portal.body}</span>
    </div>
    {portal.canOpen && <div className="ss-form-actions" style={{ marginTop: 10 }}>
      <button type="button" className="ss-btn" disabled={busy} onClick={async () => {
        setBusy(true); setOutcome(null);
        const result = await authority.openPortal();
        setBusy(false);
        // A refusal is REPORTED, with the server's reason. It is never a silent no-op and never a
        // generic failure: the whole point of the refusal vocabulary is that the person is told
        // which thing was not true.
        // `in` rather than `!result.ok`: this project compiles with `strict: false`, where the
        // boolean discriminant of a union does NOT narrow, so the obvious form does not type-check.
        if ("reason" in result) setOutcome({ tone: "bad", message: PORTAL_REFUSAL_COPY[result.reason] });
      }}>
        {busy ? <RefreshCw className="ss-spin" aria-hidden/> : <ExternalLink aria-hidden/>}
        {busy ? "Opening…" : "Manage billing"}
      </button>
    </div>}
    <Outcome state={outcome}/>
  </Card>;
}

function contactLabel(designation: BillingContactDesignation) {
  return designation === "primary_contact" ? "Primary billing contact" : "Billing delegate";
}

function ContactRow({
  contact, canManage, busy, onRevoke,
}: {
  contact: WorkspaceBillingContact;
  canManage: boolean;
  busy: string | null;
  onRevoke: (contact: WorkspaceBillingContact) => void;
}) {
  const name = contact.displayName?.trim() || "This member";
  return <div data-contact-designation={contact.designation}>
    <span>
      <strong>{name}</strong>
      <small>{contactLabel(contact.designation)}{contact.role ? ` · ${contact.role}` : ""}</small>
    </span>
    {/* Eligibility is recomputed live by the server. A designation that no longer names a current
        owner (or admin) KEEPS its row and is reported as not counted — it is not silently dropped,
        because a row that quietly disappears is indistinguishable from one that was never made. */}
    <Status tone={contact.stillEligible ? "ok" : "warn"}>
      {contact.stillEligible ? "Eligible" : contact.designation === "primary_contact" ? "No longer a current owner — not counted" : "No longer a current admin — not counted"}
    </Status>
    {canManage && <div className="ss-row-actions">
      <button type="button" className="ss-btn ss-btn--danger ss-btn--sm" disabled={busy !== null}
        onClick={() => onRevoke(contact)}>
        {busy === `revoke:${contact.id}` ? <RefreshCw className="ss-spin" aria-hidden/> : null}Remove
      </button>
    </div>}
  </div>;
}

function DesignateForm({
  designation, candidates, eligibleTotal, rosterLoading, rosterUnreadable, busy, onDesignate,
}: {
  designation: BillingContactDesignation;
  /** Eligible people NOT already designated. */
  candidates: ReadonlyArray<BillingContactCandidate>;
  /** Everyone eligible by role, designated or not. */
  eligibleTotal: number;
  rosterLoading: boolean;
  /** The roster READ failed. An empty list then means nothing at all about this workspace. */
  rosterUnreadable: boolean;
  busy: string | null;
  onDesignate: (userId: string, designation: BillingContactDesignation) => void;
}) {
  const [selected, setSelected] = useState("");
  const key = `designate:${designation}`;
  const isPrimary = designation === "primary_contact";

  // "Nobody is left to choose" and "this workspace has nobody eligible" are DIFFERENT facts, and
  // saying the second when the first is true reads as a claim that the workspace has no owner —
  // straight after the owner was designated. The rendered frame said exactly that.
  if (rosterLoading) return null;
  // A read that FAILED produces the same empty list as a workspace with nobody eligible. Saying
  // "no current workspace owner is available" on the strength of it is a claim about the account
  // derived from an answer nobody received. The card states the read failure once, above.
  if (rosterUnreadable) return null;
  if (candidates.length === 0) {
    if (eligibleTotal > 0) {
      return <p className="ss-note">
        {isPrimary
          ? "Everyone eligible to be the primary billing contact is already designated."
          : "Every current admin is already designated as a billing delegate."}
      </p>;
    }
    return <p className="ss-note">
      {isPrimary
        ? "No current workspace owner is available to designate. The primary billing contact must be a current owner of this workspace."
        : "This workspace has no current admin, so there is nobody to designate as a billing delegate."}
    </p>;
  }

  // The selection is validated against the CURRENT candidates on every render rather than cleared in
  // an effect. With two eligible owners, designating one leaves `selected` pointing at a person who
  // is no longer offered: the control shows blank while the button stays enabled, and pressing it
  // re-sends a designation the server can only refuse. Deriving it means the control and the button
  // can never disagree about what is chosen.
  const chosen = candidates.some((c) => c.userId === selected) ? selected : "";

  return <form className="ss-form" onSubmit={(e) => { e.preventDefault(); if (chosen) onDesignate(chosen, designation); }}>
    <div className="ss-form-row">
      <label>
        <span>{isPrimary ? "Primary billing contact" : "Billing delegate"}</span>
        <select value={chosen} disabled={busy !== null} aria-label={isPrimary ? "Choose the primary billing contact" : "Choose a billing delegate"}
          onChange={(e) => setSelected(e.target.value)}>
          <option value="">Choose someone…</option>
          {candidates.map((c) => <option key={c.userId} value={c.userId}>{c.name}</option>)}
        </select>
      </label>
    </div>
    <div className="ss-form-actions">
      {/* Disabled with nothing chosen: a submit that can only fail is not an act, it is a trap. */}
      <button type="submit" className="ss-btn" disabled={busy !== null || chosen === ""}>
        {busy === key ? <RefreshCw className="ss-spin" aria-hidden/> : null}
        {busy === key ? "Saving…" : isPrimary ? "Set primary billing contact" : "Add billing delegate"}
      </button>
    </div>
  </form>;
}

function ContactsCard({ authority, primarySelectionNeeded }: { authority: Authority; primarySelectionNeeded: boolean }) {
  const contacts = useWorkspaceBillingContacts();
  // The roster is read only for someone who could actually designate from it (§9 least privilege:
  // a read-only viewer has no reason to pull the workspace's member list from this surface).
  const candidates = useWorkspaceBillingCandidates(authority.authority?.canManageBilling === true);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<WriteState>(null);

  // `null` while loading or after a failed read. Fail closed for the CONTROLS, and say which of
  // the two it is rather than telling someone their access is read-only when nobody checked.
  const authorityUnreadable = !authority.loading && (authority.error !== null || authority.authority === null);
  const canManage = authority.authority?.canManageBilling === true;
  const designated = useMemo(() => contacts.contacts ?? [], [contacts.contacts]);
  const alreadyDesignated = useMemo(() => new Set(designated.map((c) => c.userId)), [designated]);
  const primaryCandidates = useMemo(
    () => candidates.owners.filter((c) => !alreadyDesignated.has(c.userId)),
    [candidates.owners, alreadyDesignated],
  );
  const delegateCandidates = useMemo(
    () => candidates.admins.filter((c) => !alreadyDesignated.has(c.userId)),
    [candidates.admins, alreadyDesignated],
  );
  const hasLivePrimary = designated.some((c) => c.designation === "primary_contact" && c.stillEligible);

  const run = async (key: string, act: () => Promise<{ ok: true } | { ok: false; reason: keyof typeof BILLING_CONTACT_REFUSAL_COPY }>, okMessage: string) => {
    setBusy(key); setOutcome(null);
    const result = await act();
    setBusy(null);
    setOutcome("reason" in result
      ? { tone: "bad", message: BILLING_CONTACT_REFUSAL_COPY[result.reason] }
      : { tone: "ok", message: okMessage });
  };

  const body = () => {
    if (authorityUnreadable) {
      return <div className="ss-state" data-contacts-state="authority-unreadable" role="alert">
        <TriangleAlert aria-hidden/>
        <span><strong>Couldn’t read your billing permissions</strong>The billing contacts for this workspace are not shown, because it is not established who may see them. Nothing has changed.</span>
        <button type="button" onClick={authority.refresh}>Retry</button>
      </div>;
    }
    if (authority.loading || contacts.loading) {
      return <div className="ss-state" role="status"><RefreshCw className="ss-spin" aria-hidden/>Clearing and resolving this account…</div>;
    }
    // A refusal is a state of its own: "owner only" and "not applicable here" are never rendered
    // as "no billing contacts", which would be a false claim about the workspace (R8).
    if (contacts.refusal) {
      return <div className="ss-state" data-contacts-state={`refusal:${contacts.refusal}`} role={contacts.refusal === "network" ? "alert" : undefined}>
        <TriangleAlert aria-hidden/>
        <span><strong>{contacts.refusal === "network" ? "Couldn’t read this workspace’s billing contacts" : "Not available here"}</strong>{BILLING_CONTACT_REFUSAL_COPY[contacts.refusal]}</span>
        {contacts.refusal === "network" && <button type="button" onClick={contacts.refresh}>Retry</button>}
      </div>;
    }
    return <>
      {/* THE SELECTION-NEEDED STATE (owner brief 2026-09-03, item 2). Historical data can leave a
          workspace with TWO live primary billing contacts — the platform never silently picks one
          (a DB trigger blocks any NEW second primary going forward, but tolerates the existing
          pair). This banner is distinct from the per-row "Eligible" badges below: it names the
          fact that a choice is owed, and by whom, rather than letting two "Primary billing
          contact" rows sit there looking like an accepted state. */}
      {primarySelectionNeeded && <div className="ss-state" data-selection-needed="true" role="alert">
        <TriangleAlert aria-hidden/>
        <span><strong>Selection needed</strong>This workspace has more than one primary billing contact on record.
          The platform does not choose one for you — an owner of this workspace must remove all but one below.</span>
      </div>}

      {designated.length > 0
        ? <div className="ss-list" data-contacts-state="designated">
            {designated.map((c) => <ContactRow key={c.id} contact={c} canManage={canManage} busy={busy}
              onRevoke={(target) => {
                const isLastPrimary = target.designation === "primary_contact"
                  && designated.filter((x) => x.designation === "primary_contact").length === 1;
                const question = isLastPrimary
                  ? `Remove ${target.displayName?.trim() || "this member"} as the primary billing contact? This workspace would then have none, and a paid plan cannot start without one.`
                  : `Remove ${target.displayName?.trim() || "this member"} as ${contactLabel(target.designation).toLowerCase()}?`;
                // Cancelling here changes nothing and says nothing: an abandoned act must not
                // leave an outcome message implying something happened.
                if (!window.confirm(question)) return;
                void run(`revoke:${target.id}`, () => contacts.revoke(target.id), `${target.displayName?.trim() || "That member"} is no longer ${contactLabel(target.designation).toLowerCase()} for this workspace.`);
              }}/>)}
          </div>
        : <div className="ss-empty" data-contacts-state="none"><Bell aria-hidden/>No billing contact has been designated for this workspace yet.</div>}

      {!hasLivePrimary && <p className="ss-note">
        A paid plan cannot start for this workspace until a current owner is designated as its primary
        billing contact. Nothing is designated automatically, and nothing is inferred from whoever is
        signed in.
      </p>}

      {canManage
        ? <>
            <DesignateForm designation="primary_contact" candidates={primaryCandidates}
              eligibleTotal={candidates.owners.length} rosterLoading={candidates.loading}
              rosterUnreadable={candidates.error} busy={busy}
              onDesignate={(userId, designation) => void run(`designate:${designation}`, () => contacts.designate(userId, designation), "Primary billing contact set for this workspace.")}/>
            <DesignateForm designation="delegate" candidates={delegateCandidates}
              eligibleTotal={candidates.admins.length} rosterLoading={candidates.loading}
              rosterUnreadable={candidates.error} busy={busy}
              onDesignate={(userId, designation) => void run(`designate:${designation}`, () => contacts.designate(userId, designation), "Billing delegate added for this workspace.")}/>
          </>
        : <NotYours what="this workspace’s billing contacts"/>}

      <p className="ss-note">{NOT_OWNERSHIP}</p>
      <p className="ss-note">{NO_DELIVERY}</p>
      <Outcome state={outcome}/>
    </>;
  };

  return <Card title="Billing contacts and notices" icon={Users} truth="PARTIAL"
    actions={authority.authority?.receivesBillingNotices ? <Status tone="ok">You receive billing notices here</Status> : undefined}>
    {body()}
    {candidates.error && <p className="ss-note">The list of people who could be designated could not be read just now, so only the current designations are shown.</p>}
  </Card>;
}

/**
 * RESTORED, not new (§58). The pre-Foundation-C `BillingView` carried this card and this slice
 * deleted it without calling the removal out — an independent compliance read caught it. The copy
 * is the shipped copy, unchanged: it is still exactly true, and it is packet §9 flow F3's only
 * presence on this surface. Removing a shipped card is an owner decision, not a side effect of
 * rewriting the two cards either side of it.
 */
/**
 * AI usage (owner ruling 2026-09-03). This card USED to say UNAVAILABLE, because the platform had
 * no allowance model and no tenant-safe read of the meter. Both now exist — the allowance lives on
 * `platform_subscription_plans` and `get_workspace_ai_usage()` reads the existing
 * `platform_usage_events` meter — so the card states a real total for a real period.
 *
 * It states usage and nothing else. No cost, no projection, no overage, and no consequence: the
 * allowance is VISIBILITY (D6), exhausting it changes nothing (D7), and there is no overage to
 * charge (D8). Every one of those absences is deliberate and tested in `ai-usage-contract.test.ts`.
 */
function UsageCard() {
  const { loading, error, usage, reload } = useWorkspaceAiUsage();
  const view = resolveAiUsagePresentation({
    loading,
    readFailed: error !== null,
    // While loading, and after a failed read, `usage` is null. The resolver's own precedence
    // decides those two cases first, so this fallback is only ever consumed once neither holds —
    // the same discipline PlanCard uses, for the same reason: a silent "no workspace" default
    // reads as a statement about the account.
    usageState: usage?.usageState ?? "no_workspace",
    revenueClass: usage?.revenueClass ?? null,
    includedAiTokensMonth: usage?.includedAiTokensMonth ?? null,
    aiCreditTokenRatio: usage?.aiCreditTokenRatio ?? null,
    periodSource: usage?.periodSource ?? null,
    periodStart: usage?.periodStart ?? null,
    periodEnd: usage?.periodEnd ?? null,
    tokensUsed: usage?.tokensUsed ?? null,
  });

  return <Card title="AI usage" icon={CalendarClock} truth="PARTIAL">
    <div className="ss-state" data-usage-state={view.state} role={view.state === "usage-loading" ? "status" : view.state === "usage-error" ? "alert" : undefined}>
      {view.state === "usage-loading" ? <RefreshCw className="ss-spin" aria-hidden/> : view.state === "usage-error" ? <TriangleAlert aria-hidden/> : <CalendarClock aria-hidden/>}
      <span><strong>{view.heading}</strong>{view.body}</span>
      {view.canRetry && <button type="button" onClick={() => void reload()}>Retry</button>}
    </div>
    {view.fields.length > 0 && <div className="ss-fields" style={{ marginTop: 9 }}>
      {view.fields.map((f) => <div className="ss-field" key={f.label}><span>{f.label}</span><strong>{f.value}</strong></div>)}
    </div>}
    {view.note && <p className="ss-note">{view.note}</p>}
  </Card>;
}

export function SoloBillingView() {
  // ONE authority read (portal act + contacts-write gating) and ONE status read (plan, usage,
  // provider readiness, primary-selection-needed) for the whole surface. The status read replaces
  // authority as PlanCard's source; authority is still the real, correctly-mapped seam behind the
  // hosted-portal "Manage billing" act, so it stays.
  const authority = useWorkspaceBillingAuthority();
  const status = useWorkspaceBillingStatus();
  // KEYED ON THE WORKSPACE. The hooks reset their DATA on a switch, but the cards' own local state
  // — the outcome banner, the busy key, a half-made selection — is not data and survived it. That
  // put "Primary billing contact set for this workspace." under a workspace where nothing was set,
  // and a portal refusal under a workspace where the portal was never pressed. Remounting is the
  // whole answer: an outcome is a report about ONE workspace and cannot outlive it.
  const { activeTenantId } = useTenantContext();
  const workspace = activeTenantId ?? "none";
  return <div className="ss-grid">
    <PlanCard status={status}/>
    <ContactsCard key={`contacts:${workspace}`} authority={authority}
      primarySelectionNeeded={status.status?.primarySelectionNeeded === true}/>
    <PortalCard key={`portal:${workspace}`} authority={authority}/>
    {/* NOT keyed on the workspace, unlike its two neighbours, and that is deliberate rather than
        an oversight. They are keyed because they hold LOCAL state — an outcome banner, a half-made
        selection — which is not data and survived a switch. This card holds none: everything it
        shows is derived from the hook, whose own request gate resets on a switch and drops a late
        answer for a workspace already left. A key here was written first and then removed, because
        deleting it did not turn a single test red — a guard that cannot fail is decoration, and
        decoration in a place like this reads as protection that isn't there. The switch is proven
        by the test instead ("never paints one workspace's usage total under the next one"). */}
    <UsageCard/>
  </div>;
}
