import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  FileLock2,
  Globe2,
  KeyRound,
  Mail,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Users,
  Webhook,
  WifiOff,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import { useSoloBusiness } from "./data/useSoloBusiness";
import { useSoloOwner } from "./data/useSoloOwner";
import { useSoloComms } from "./data/useSoloComms";
import { SoloIntegrationsView } from "./settings-integrations";
import {
  createSettingsRequestGate,
  getCustomDomainPresentation,
  getManagedIdentityPresentation,
  resolveSoloSettingsEntry,
  SOLO_SETTINGS_DESTINATIONS,
  type ConnectionStateTone,
  type ManagedIdentityRecord,
  type SettingsTruth,
} from "./settings-contract";
import { CalendarsView } from "./connections-calendars";
import { useUserRoles } from "@/hooks/useUserRoles";
import { BLOCKED_ACTIONS, preparePermission, refusalFor, type PreparePermission, type Refusal } from "./a2pPrepare";
import { domainOutcomeFor, domainPermission, isSendableDomain, type DomainOutcome, type DomainPermission } from "./domainActions";
import "./settings.css";

function Truth({ value, capability = false }: { value: SettingsTruth; capability?: boolean }) {
  return <span className="ss-truth" data-truth={value}>{capability ? `Capability: ${value}` : value}</span>;
}

function Status({ tone = "neutral", children }: { tone?: string; children: ReactNode }) {
  return <span className="ss-status" data-tone={tone}><i />{children}</span>;
}

function Card({ title, icon: Icon, truth, capabilityTruth = false, children, actions }: { title: string; icon: typeof Building2; truth?: SettingsTruth; capabilityTruth?: boolean; children: ReactNode; actions?: ReactNode }) {
  return <section className="ss-card">
    <header><span className="ss-card-icon"><Icon aria-hidden /></span><h2>{title}</h2>{truth && <Truth value={truth} capability={capabilityTruth}/>}<div className="ss-card-actions">{actions}</div></header>
    <div className="ss-card-body">{children}</div>
  </section>;
}

function OrthogonalConnectionState({ accountLabel, healthLabel, tone }: { accountLabel: string; healthLabel: string; tone: ConnectionStateTone }) {
  return <dl className="ss-connection-state">
    <div><dt>Account configuration</dt><dd>{accountLabel}</dd></div>
    <div><dt>Operational health</dt><dd><Status tone={tone}>{healthLabel}</Status></dd></div>
  </dl>;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return <div className="ss-field"><span>{label}</span><strong>{value?.trim() || "Not provided"}</strong></div>;
}

function ReadState({ loading, error, retry, children, errorBody }: { loading: boolean; error: string | null; retry: () => void; children: ReactNode; errorBody?: (error: string) => string }) {
  if (loading) return <div className="ss-state" role="status"><RefreshCw className="ss-spin"/>Clearing and resolving this account…</div>;
  // `errorBody` lets a card that owns a failure vocabulary route its READ error
  // through the same words as its WRITE errors. Without it the domains card —
  // which built `domainOutcomeFor` precisely so a provider payload never reaches
  // a tenant — still printed `Edge Function returned a non-2xx status code`
  // verbatim on the read path.
  if (error) return <div className="ss-state" role="alert"><TriangleAlert/><span><strong>Couldn’t load this account</strong>{errorBody ? errorBody(error) : error}</span><button onClick={retry}>Retry</button></div>;
  return <>{children}</>;
}

function useManagedIdentity() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const [state, setState] = useState<{ tenantId: string | null; loading: boolean; error: string | null; value: ManagedIdentityRecord | null }>({ tenantId: null, loading: true, error: null, value: null });
  const load = useCallback(async () => {
    const token = gate.current.begin();
    setState({ tenantId: null, loading: true, error: null, value: null });
    if (!activeTenantId) {
      setState({ tenantId: null, loading: false, error: null, value: null });
      return;
    }
    // RPC is deployed but not yet present in generated database types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("resolve_tenant_domain_identity");
    if (!gate.current.isCurrent(token)) return;
    const row = Array.isArray(data) ? data[0] : data;
    setState({ tenantId: activeTenantId, loading: false, error: error?.message ?? null, value: error ? null : (row ?? null) });
  }, [activeTenantId]);
  useEffect(() => {
    const activeGate = gate.current;
    if (!tenantLoading) void load();
    return () => activeGate.clear();
  }, [tenantLoading, load]);
  return { ...state, loading: tenantLoading || state.loading || Boolean(activeTenantId && state.tenantId !== activeTenantId), retry: load };
}

function SetupView() {
  const business = useSoloBusiness();
  const owner = useSoloOwner();
  const { activeTenant } = useTenantContext();
  const account = String(activeTenant?.account_number ?? "");
  const pending = [business.name, business.brand.website, business.brand.business_phone, owner.owner.name, owner.owner.email].filter(Boolean).length;
  return <div className="ss-grid">
    <Card title="Setup readiness" icon={CheckCircle2} truth="PARTIAL">
      <div className="ss-progress"><div><strong>{pending}/5</strong><span>supported details present</span></div><progress value={pending} max={5}/></div>
      <p className="ss-note">Setup supplies optional facts and evidence. PAIGE Systems Check owns the daily assessment.</p>
      <div className="ss-actions"><Link to={account ? `/solo/${account}/command-center/systems-check` : "/admin"}>Open Systems Check <ExternalLink/></Link><Link to={account ? `/solo/${account}/analytics` : "/admin/analytics"}>Open Public Presence <ExternalLink/></Link></div>
    </Card>
    <Card title="Business profile" icon={Building2} truth="PARTIAL">
      <ReadState loading={business.loading} error={business.error} retry={business.refresh}>
        <div className="ss-fields"><Field label="Business name" value={business.name}/><Field label="Website" value={business.brand.website}/><Field label="Phone" value={business.brand.business_phone}/><Field label="Industry" value={business.brand.industry}/></div>
      </ReadState>
    </Card>
    <Card title="Owner details" icon={Users} truth="PARTIAL">
      <ReadState loading={owner.loading} error={owner.error} retry={owner.refresh}>
        <div className="ss-fields"><Field label="Name" value={owner.owner.name}/><Field label="Work email" value={owner.owner.email}/><Field label="Phone" value={owner.owner.phone}/><Field label="Website" value={owner.owner.website}/></div>
      </ReadState>
    </Card>
    <Card title="Formation & operating details" icon={FileLock2} truth="UNAVAILABLE"><p>There is no proven structured entity, formation, filing, or operating-details store in this frontend contract. PAIGE ingestion remains unavailable here.</p></Card>
  </div>;
}

function TeamView() {
  return <div className="ss-grid">
    <Card title="Members & access" icon={Users} truth="PARTIAL"><p>The repository proves member, role, invitation, and tenant-admin seams, but this Settings surface has no unified runtime roster read yet.</p><div className="ss-status-row"><Status>Members not loaded</Status><Status tone="warn">Permission-gated</Status></div></Card>
    <Card title="Invitation lifecycle" icon={Mail} truth="PARTIAL"><div className="ss-state-list"><Status>Pending</Status><Status>Expired</Status><Status>Revoked</Status><Status>Accepted</Status></div><p className="ss-note">No invitation counts are shown until a current runtime read proves them.</p></Card>
    <Card title="Workspace permissions" icon={ShieldCheck} truth="PARTIAL"><p>Owners and authorized admins may manage team access. Permissions apply only to this Solo workspace.</p></Card>
  </div>;
}



/**
 * Communications readiness, from the ONE canonical resolver.
 *
 * Every value here comes from `tenant_comms_readiness()`, the same predicate
 * `send-message` enforces — so Settings, Conversations and PAIGE cannot drift
 * into three different answers about whether this account can text. It returns
 * only tenant-safe fields: no credential identifier, no provider SID, no
 * webhook detail, no internal diagnostic.
 */
export interface CommsReadiness {
  tenant_id: string;
  can_send_sms: boolean;
  blocked_reason: string | null;
  subaccount: "connected" | "inactive" | "absent";
  number: "assigned" | "absent";
  number_e164: string | null;
  business: { has_name: boolean; has_website: boolean; has_phone: boolean };
  a2p: "approved" | "submitted" | "prepared" | "absent";
  consent: { granted_count: number; suppressed_count: number; state: "ready" | "none_recorded" };
  delivery: {
    state: "no_activity" | "awaiting_receipts" | "delivering" | "mixed" | "failing";
    sent_30d: number; delivered_30d: number; failed_30d: number;
    last_inbound_at: string | null;
    /** The resolver's own guard, nested here because that is where it is emitted.
     *  Read so this surface and Conversations cannot give different answers. */
    inbound_reporting?: "available" | "unavailable";
  };
  // Connections owns billing setup, so it comes from the SAME canonical record
  // rather than a second read. Carries no provider identifier — the resolver
  // never selects the Stripe subscription/customer ids.
  billing: {
    subscription: "active" | "inactive" | "absent";
    plan_name: string | null;
    period_end: string | null;
    cancel_at_period_end: boolean;
    usage_metering: "recording" | "not_recording";
    metered_events_30d: number;
  };
}

function useCommsReadiness() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const gate = useRef(createSettingsRequestGate());
  const [state, setState] = useState<{ tenantId: string | null; loading: boolean; error: string | null; value: CommsReadiness | null }>(
    { tenantId: null, loading: true, error: null, value: null });
  const load = useCallback(async () => {
    const token = gate.current.begin();
    // Clear first: a previous account's readiness must never linger while a new
    // one resolves (§9 — no substitution across an account switch).
    setState({ tenantId: null, loading: true, error: null, value: null });
    if (!activeTenantId) { setState({ tenantId: null, loading: false, error: null, value: null }); return; }
    // RPC is deployed but not yet present in generated database types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc("tenant_comms_readiness");
    if (!gate.current.isCurrent(token)) return;
    const row = (data as CommsReadiness | null) ?? null;
    // The RPC derives its tenant server-side from the session. If that has not
    // caught up with the client's active account, the answer belongs to a
    // DIFFERENT account — discard it rather than render it under this heading.
    if (row && activeTenantId && row.tenant_id && row.tenant_id !== activeTenantId) {
      setState({ tenantId: null, loading: true, error: null, value: null });
      return;
    }
    setState({ tenantId: activeTenantId, loading: false, error: error?.message ?? null, value: error ? null : row });
  }, [activeTenantId]);
  useEffect(() => { if (!tenantLoading) void load(); }, [load, tenantLoading]);
  return {
    ...state,
    // Stay in the loading state while the tenant context resolves and until the
    // answer we hold belongs to the account now on screen. Without this the card
    // paints "Texting is not ready yet" — a definite claim — before a single read
    // has been attempted.
    loading: state.loading || tenantLoading || Boolean(activeTenantId && state.tenantId !== activeTenantId),
    retry: load,
  };
}

/**
 * What the tenant is told, per blocking reason.
 *
 * TENANT-SAFE BY CONSTRUCTION. These strings never mention credentials, vault
 * references, webhook names, handler names, table names, or who owns a repair.
 * A tenant learns what is not ready and the one next thing they can do.
 */
export const READINESS_COPY: Record<string, { headline: string; next: string }> = {
  messaging_account_missing:  { headline: "Texting is not ready yet", next: "Your business needs its own messaging account before a number or business texting can be arranged." },
  messaging_account_inactive: { headline: "Texting is not ready yet", next: "Your messaging account is not active, so nothing can send from it yet." },
  no_sms_number:              { headline: "Texting is not ready yet", next: "You do not have a phone number yet. One has to be assigned before you can text." },
  // Was: "PAIGE can prepare that registration from your business details."
  // That was an unbacked claim. Paige has no A2P tool registered, and the only
  // caller of comms-a2p-draft / comms-a2p-submit anywhere is the legacy admin tab
  // a flag-enabled Solo tenant is redirected away from — so neither Paige nor the
  // tenant could act on it. Copy now states the fact and promises nothing that
  // cannot happen (§13).
  registration_absent:        { headline: "Texting is not ready yet", next: "Carriers require your business to be registered before any text can send, and nothing has been registered for your business yet." },
  registration_not_approved:  { headline: "Texting is not ready yet", next: "Your registration is prepared but has not been filed with carriers. Texting stays off until it is approved." },
  // Was: "Collect consent through your intake forms first…" — also unbacked. The
  // ONLY writer of paige_consent_events is the inbound-SMS handler, which records
  // a grant when a person replies with a START-class keyword. No intake form
  // records SMS consent, so that sentence sent tenants to do something that
  // stores nothing (§13).
  no_consent_recorded:        { headline: "Texting is not ready yet", next: "Nobody has agreed to be texted yet. Consent is recorded when a person replies to confirm, and until then every message is held." },
};

const STEP_TRUTH = (ok: boolean, partial = false): SettingsTruth =>
  ok ? "LIVE" : partial ? "PARTIAL" : "UNAVAILABLE";

/**
 * The billing row of the readiness ladder, as a pure function of the billing
 * record so the tenant-facing strings sit where the boundary is enforceable —
 * the same reason READINESS_COPY is exported.
 *
 * Reported, never gating. A plan is not part of what decides whether a text can
 * send, so nothing here touches `can_send_sms`; the resolver deliberately keeps
 * billing out of `blocked_reason` so the record cannot contradict the send path.
 *
 * An active plan with nothing metered is NOT "billed". Those are two different
 * records and the copy keeps them apart rather than letting a plan imply usage
 * that demonstrably is not being recorded.
 */
export function billingStep(b: CommsReadiness["billing"]): {
  truth: SettingsTruth; tone: "ok" | "warn" | "bad" | "neutral"; state: string; detail: string;
} {
  if (b.subscription === "absent") {
    return {
      truth: "UNAVAILABLE", tone: "neutral", state: "No plan on file",
      detail: "No plan is on file for this business, so messaging usage has nothing to bill against.",
    };
  }
  if (b.subscription === "inactive") {
    return {
      truth: "PARTIAL", tone: "warn", state: "Plan not active",
      detail: "The plan on file is not active. Messaging usage would have nothing to bill against.",
    };
  }
  const state = b.plan_name ? `${b.plan_name} plan` : "Plan active";
  if (b.usage_metering !== "recording") {
    return {
      truth: "PARTIAL", tone: "warn", state,
      detail: "Messaging usage is not being recorded yet, so nothing has been billed against this plan.",
    };
  }
  return {
    truth: "LIVE", tone: "ok", state,
    detail: `${b.metered_events_30d} usage ${b.metered_events_30d === 1 ? "event" : "events"} recorded in the last 30 days.`,
  };
}

/**
 * ONE source for every readiness step (§18).
 *
 * The Communications subsections and the readiness ladder are two presentations
 * of the SAME canonical record, so they derive from these functions rather than
 * each computing their own answer. A subsection that disagreed with the ladder
 * would be a second opinion about whether this account can text, which is the
 * exact drift `tenant_comms_readiness()` exists to prevent.
 *
 * Every function is pure and exported so the tenant-facing boundary stays
 * enforceable in tests — the same reason `billingStep` is exported.
 */
export type Step = {
  n: string; s: string; truth: SettingsTruth;
  tone: "ok" | "warn" | "bad" | "neutral"; state: string; detail: string;
  /** Position in the canonical path, stamped by `readinessSteps` so a step
   *  rendered on its own carries the same number the ladder gives it. */
  no?: number;
};

export function messagingAccountStep(r: CommsReadiness): Step {
  return { n: "Messaging account", s: "Your business's own account for texting",
    truth: STEP_TRUTH(r.subaccount === "connected"), tone: r.subaccount === "connected" ? "ok" : "bad",
    state: r.subaccount === "connected" ? "Connected" : r.subaccount === "inactive" ? "Not active" : "Not connected",
    detail: r.subaccount === "connected" ? "Ready." : "Nothing else can be arranged until this is in place." };
}

export function businessDetailsStep(r: CommsReadiness): Step {
  const biz = r.business;
  const all = biz.has_name && biz.has_website && biz.has_phone;
  const some = biz.has_name || biz.has_website || biz.has_phone;
  return { n: "Business details", s: "Legal name, website and business phone",
    truth: STEP_TRUTH(all, some), tone: all ? "ok" : some ? "warn" : "bad",
    state: all ? "Complete" : some ? "Partly filled in" : "Not provided",
    detail: all ? "Everything carriers ask for is on file."
      : [!biz.has_name && "business name", !biz.has_website && "website", !biz.has_phone && "business phone"]
          .filter(Boolean).join(", ") + " still missing." };
}

export function phoneStep(r: CommsReadiness): Step {
  return { n: "Phone number", s: "The number your texts send from",
    truth: STEP_TRUTH(r.number === "assigned"), tone: r.number === "assigned" ? "ok" : "bad",
    state: r.number === "assigned" ? "Assigned" : "None assigned",
    detail: r.number === "assigned" ? `${r.number_e164 ?? "On file"} — its record lists SMS capability.` : "No number on this business." };
}

/**
 * The A2P registration step, including the ceiling this product actually has.
 *
 * "Prepared, not submitted" is not a euphemism: `comms-a2p-submit`'s createBrand
 * and createCampaign are `needs_config` stubs, so nothing this surface can do
 * reaches a carrier. The copy states that ceiling rather than implying a filing
 * that cannot happen (§13).
 */
export function registrationStep(r: CommsReadiness): Step {
  return { n: "Business texting", s: "Carrier approval before any text can send",
    truth: r.a2p === "approved" ? "LIVE" : r.a2p === "absent" ? "UNAVAILABLE" : "PARTIAL",
    tone: r.a2p === "approved" ? "ok" : r.a2p === "absent" ? "bad" : "warn",
    state: r.a2p === "approved" ? "Approved" : r.a2p === "submitted" ? "Filed with carriers"
      : r.a2p === "prepared" ? "Prepared, not submitted" : "Not registered",
    detail: r.a2p === "approved" ? "Your business is approved to text."
      : r.a2p === "prepared" ? "Saved on your business. Nothing has been filed with any carrier yet."
      : r.a2p === "submitted" ? "Filed. Carriers have not returned a decision."
      : "Texting stays blocked until a registration is approved." };
}

export function consentStep(r: CommsReadiness): Step {
  return { n: "Consent and opt-outs", s: "Who agreed to hear from you, and who said stop",
    truth: r.consent.state === "ready" ? "LIVE" : "PARTIAL",
    tone: r.consent.state === "ready" ? "ok" : "warn",
    state: r.consent.state === "ready" ? `${r.consent.granted_count} agreed to texts` : "Nothing recorded",
    detail: r.consent.suppressed_count > 0
      ? `${r.consent.suppressed_count} ${r.consent.suppressed_count === 1 ? "person has" : "people have"} asked you to stop. PAIGE will not text them.`
      : r.consent.state === "ready" ? "Consent is on file." : "No consent or opt-out has been recorded yet." };
}

/**
 * Renamed from "Sending identity" so it cannot be read as the EMAIL sending
 * identity, which is a different record on a different subsection. The owner's
 * IA requires the email identity to be clearly separate from phone/SMS, and two
 * steps sharing one name defeats that.
 */
export function textingSenderStep(r: CommsReadiness): Step {
  return { n: "Texting sender", s: "What Conversations sends texts from",
    truth: STEP_TRUTH(r.can_send_sms), tone: r.can_send_sms ? "ok" : "warn",
    state: r.can_send_sms ? "Ready" : "Not ready for texting",
    detail: r.can_send_sms ? "Texts send from your own number." : "No permitted texting sender yet." };
}

/**
 * Delivery health — PROVEN EVIDENCE ONLY.
 *
 * Reports what the delivery record counted and nothing else. It does not infer
 * deliverability from a plan, consent from a number, or webhook health from a
 * delivered receipt. Replies are deliberately not reported in either direction:
 * nothing records an inbound text against this account, so "replies received"
 * and "no replies received" would both be claims the data cannot support.
 */
/** The states `tenant_comms_readiness()` can actually emit. Anything else is unknown, not bad. */
const DELIVERY_STATES = new Set(["no_activity", "awaiting_receipts", "delivering", "mixed", "failing"]);

export function deliveryStep(r: CommsReadiness): Step {
  const d = r.delivery;
  return { n: "Delivery", s: "Whether texts actually arrived",
    // An unrecognised state must be unrecognised in every field that can differ.
    // Fixing only `state` produced a row reading "Not reported" in a WARN tone over
    // a detail describing what was counted — fields disagreeing about whether
    // anything is known. `tone`, `state` and `detail` each test DELIVERY_STATES.
    // `truth` needs no unrecognised-state arm: an unknown state already falls to
    // the final "PARTIAL", which is what such an arm would emit. One was added
    // anyway and removed here — a guard that cannot change an output is a repair
    // that never happened, which is the thing this file keeps being corrected for.
    truth: d.state === "no_activity" ? "UNAVAILABLE" : d.state === "delivering" ? "LIVE" : "PARTIAL",
    tone: !DELIVERY_STATES.has(d.state) ? "neutral"
      : d.state === "delivering" ? "ok" : d.state === "no_activity" ? "neutral" : "warn",
    // Every state is NAMED. The final arm used to be a catch-all reading
    // "N of M did not arrive", so a sixth resolver state would have rendered as a
    // delivery failure nobody observed — which is exactly how the Conversations
    // consumer came to report "Messages are not arriving" on an account with zero
    // failures. Same canonical record, same mistake, so it is closed here too.
    state: d.state === "no_activity" ? "Nothing sent yet"
      : d.state === "awaiting_receipts" ? `${d.sent_30d} sent, none confirmed yet`
      : d.state === "delivering" ? `${d.delivered_30d} of ${d.sent_30d} delivered`
      : d.state === "mixed" || d.state === "failing" ? `${d.failed_30d} of ${d.sent_30d} did not arrive`
      : "Not reported",
    // The replies disclosure travels WITH the step, not beside it.
    //
    // The pre-refactor step was named "Delivery and replies" and its detail said
    // outright that whether replies arrive is not something we can report. The
    // restructure narrowed the step to delivery and left that sentence only as a
    // note on one card — so the Health ladder, which is where it used to live,
    // silently stopped disclosing it (§58). Appending it here means every
    // rendering of this step carries it, and no future re-arrangement of the
    // surface can drop it without deleting the step.
    detail: (!DELIVERY_STATES.has(d.state)
      ? "This account's delivery state is not one we can report on."
      : d.state === "no_activity"
      ? "Nothing has been sent in the last 30 days, so there is nothing to report."
      : d.state === "awaiting_receipts"
      ? "Sent, but no delivery confirmations have come back yet."
      : "Counted from delivery receipts on what was sent in the last 30 days.")
      // Conditional on the resolver's OWN guard rather than hardcoded, so the two
      // consumers of this record cannot drift: Conversations already reads
      // `delivery.inbound_reporting`, and if that ever becomes "available" this
      // surface would otherwise still say replies are unreported while the other
      // said they were received (§57 — one record, one answer).
      + (d.inbound_reporting === "available"
        ? ""
        : " Whether replies are arriving is not reported — nothing on this account records them.") };
}

export function billingRow(r: CommsReadiness): Step {
  return { n: "Billing for messaging", s: "The plan messaging costs are billed against", ...billingStep(r.billing) };
}

/** The canonical ordered path to operational. Every row is one of the functions above. */
export function readinessSteps(r: CommsReadiness): Step[] {
  return [
    messagingAccountStep(r), businessDetailsStep(r), phoneStep(r), registrationStep(r),
    consentStep(r), billingRow(r), textingSenderStep(r), deliveryStep(r),
  ].map((st, i) => ({ ...st, no: i + 1 }));
}

/**
 * A step's number is its POSITION IN THE PATH, not its index in whatever subset
 * is being drawn.
 *
 * Rendering one step on its own numbered it from that one-element array, so
 * "Business details" read as step 1 inside the registration card and step 2 in
 * the ladder — one step, two numbers, one surface. A hand-maintained order
 * constant would fix the symptom and then drift the first time a step is renamed
 * (a first attempt at this got four of the eight names wrong), so the number is
 * STAMPED BY the canonical list instead. A caller wanting one step asks for it by
 * name and gets that step's real number with it.
 */
export function stepByName(r: CommsReadiness, name: string): Step[] {
  return readinessSteps(r).filter((st) => st.n === name);
}

function StepRows({ steps }: { steps: Step[] }) {
  return <div className="ss-ladder">{steps.map((st, i) => (
    <div className="ss-step" data-tone={st.tone} key={st.n}>
      <span className="ss-step-idx">{st.no ?? i + 1}</span>
      <div className="ss-step-name"><strong>{st.n}</strong><span>{st.s}</span></div>
      <div className="ss-step-state"><em>{st.state}</em>{st.detail}</div>
      <Truth value={st.truth}/>
    </div>))}</div>;
}

function ReadinessLadder({ r }: { r: CommsReadiness }) {
  return <StepRows steps={readinessSteps(r)}/>;
}

/**
 * A collapsible area of the Communications surface.
 *
 * WHY THIS IS A FOLD AND NOT A STACK OF CARDS. Every area rendered permanently
 * expanded, so the surface was four subsections, seven cards and thirteen
 * paragraphs of prose before a tenant reached the one thing they came to do. The
 * whole state of the account is knowable in five lines; the detail behind each is
 * what needs a click, not what needs a scroll (§11 — collapse to accordions
 * rather than build a scroll-wall).
 *
 * THE AT-REST LINE IS THE POINT, AND IT IS REAL. It carries the same string the
 * ladder step carries — `phoneStep(r).state`, `registrationStep(r).state` — so a
 * collapsed fold reports what the RECORD says, never a summary invented for the
 * header. A fold that summarised optimistically would hide exactly the thing this
 * surface exists to state honestly (§13). While the read is in flight or has
 * failed, callers pass the honest line for that case rather than a stale one.
 *
 * `<details>`/`<summary>`, deliberately: it is keyboard- and screen-reader-
 * operable natively, it survives with JavaScript disabled, and the open/closed
 * state is the element's own — no parallel state to drift out of sync.
 */
function Fold({
  id, title, blurb, atRest, tone, defaultOpen = false, children,
}: {
  id: string; title: string; blurb: string;
  atRest: string; tone: "ok" | "warn" | "bad" | "neutral";
  defaultOpen?: boolean; children: ReactNode;
}) {
  // The <section aria-labelledby> is kept from the Subsection this replaces.
  // <details> exposes the heading but not the grouping, so folding the four areas
  // would otherwise have quietly dropped a landmark that was already shipped.
  return <section className="ss-fold-region" aria-labelledby={id}>
    <details className="ss-fold" data-tone={tone} open={defaultOpen}>
    <summary className="ss-fold-summary">
      <span className="ss-fold-title">
        <h3 id={id}>{title}</h3>
        <span className="ss-fold-blurb">{blurb}</span>
      </span>
      <span className="ss-fold-rest">{atRest}</span>
      <span className="ss-fold-chevron" aria-hidden>&rsaquo;</span>
    </summary>
    <div className="ss-fold-body">{children}</div>
    </details>
  </section>;
}

/** Retained for the Health view, which is a single area and needs no fold. */
function Subsection({ id, title, blurb, children }: { id: string; title: string; blurb: string; children: ReactNode }) {
  return <section className="ss-subsection" aria-labelledby={id}>
    <div className="ss-subsection-head">
      <h3 id={id}>{title}</h3>
      <p>{blurb}</p>
    </div>
    {children}
  </section>;
}

const PROVIDERS = [
  ["Gmail", "OAuth mailbox", "PARTIAL"], ["Outlook", "OAuth mailbox", "UNAVAILABLE"],
  ["SMTP / Resend", "Outbound sending", "PARTIAL"], ["Twilio", "SMS, MMS & voice", "PARTIAL"],
  ["Vapi", "Voice", "UNAVAILABLE"], ["Meta IG / FB", "Business messaging", "PARTIAL"],
  ["Apple Messages for Business", "Business messaging", "PROPOSED"], ["WhatsApp / RCS", "Vocabulary only", "PROPOSED"],
  ["n8n", "Tenant automation seam", "PARTIAL"], ["Zapier / MCP", "Fragmented connection seams", "PARTIAL"],
  ["Direct APIs", "Permission-specific", "PARTIAL"], ["Make.com", "No connector seam", "UNAVAILABLE"],
] as const;

/**
 * Settings → Connections.
 *
 * Communications owns provider setup and readiness; Integrations is its own
 * top-level area rather than a shelf inside Communications; Health is a
 * SECONDARY projection of the same canonical record, never a competing owner.
 *
 * Business phone is one step among four here. It previously rendered as a
 * full-width accented panel with a search form at the top of the surface, which
 * made number search read as the whole feature and pushed messaging
 * registration, sending identity and delivery below the fold.
 */
type ConnectionsSegment = "communications" | "calendars" | "health" | "available";

const CONNECTIONS_SEGMENTS: readonly ConnectionsSegment[] = ["communications", "calendars", "health", "available"];

/**
 * The segment named in the address, if it is one we actually have.
 *
 * Validated rather than cast: the value arrives from a URL, and an unknown
 * string would select nothing and render an empty Connections surface. An
 * unrecognised segment falls back to the default rather than to a blank page.
 */
function requestedSegment(search: string): ConnectionsSegment | undefined {
  const raw = new URLSearchParams(search).get("segment");
  return CONNECTIONS_SEGMENTS.find((s) => s === raw);
}

/**
 * The refusal codes `comms-a2p-draft` can return, pulled out of whatever shape
 * the client hands us.
 *
 * `supabase.functions.invoke` does NOT reject with the function's JSON body: a
 * non-2xx surfaces as a FunctionsHttpError whose `message` is the generic
 * "Edge Function returned a non-2xx status code" and whose real payload sits on
 * `context`. Reading `error.message` would therefore print that generic sentence
 * to a tenant and lose the one thing worth having — the stable code. So the body
 * is dug out and only the CODE is used; the server's message is never rendered.
 */
async function refusalFromInvoke(error: unknown): Promise<Refusal> {
  const ctx = (error as { context?: unknown } | null)?.context as
    | { body?: unknown; json?: () => Promise<unknown> }
    | undefined;
  let payload: unknown = null;
  try {
    if (ctx && typeof ctx.json === "function") payload = await ctx.json();
    else if (typeof ctx?.body === "string") payload = JSON.parse(ctx.body);
    else if (ctx?.body && typeof ctx.body === "object") payload = ctx.body;
  } catch {
    // A body we cannot parse is not a reason to invent one.
    payload = null;
  }
  const code = (payload as { error?: { code?: unknown } } | null)?.error?.code;
  return refusalFor(typeof code === "string" ? code : null);
}

type PrepareOutcome = { kind: "saved" } | { kind: "refused"; refusal: Refusal };

/**
 * Prepare a registration — the drawer, and the only write this surface makes.
 *
 * WHAT IT SENDS, AND WHY THAT IS THE WHOLE FORM. `comms-a2p-draft` takes
 * `{ legal_business_name?, website?, use_case_hint? }` and drafts the regulatory
 * 10DLC prose from them — the campaign description, the sample messages carriers
 * require, and the opt-in language. The tenant does not write compliance copy;
 * that is the point of the seam. So the form asks for the one thing only they
 * know, in their own words, and Paige writes the rest.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It never sends a tenant id — the server
 * derives it and ignores a body value, so sending one would be theatre. It never
 * calls `comms-a2p-submit`; submission is refused by that function and named as
 * unbuilt here instead of offered. And a `needs_config` 200 is treated as a
 * FAILURE, because that response means no draft was written and nothing was
 * saved — reading it as success is the exact "looks stored, persisted nothing"
 * defect the drafting function was itself changed to remove.
 */
function PrepareRegistrationDrawer({
  open, busy, refusal, initialHint, onSave, onClose,
}: {
  open: boolean; busy: boolean; refusal: Refusal | null; initialHint: string;
  onSave: (hint: string) => void; onClose: (dirty: boolean) => void;
}) {
  const [hint, setHint] = useState(initialHint);
  const [confirming, setConfirming] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dirty = hint.trim() !== initialHint.trim();

  // Reset per opening, so a previous attempt's text never appears under a fresh
  // one — and so a refused attempt KEEPS its text, which is the same rule seen
  // from both sides: the drawer stays mounted through a refusal.
  useEffect(() => { if (open) { setHint(initialHint); setConfirming(false); } }, [open, initialHint]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      attemptClose();
    };
    document.addEventListener("keydown", onKey);
    // Remember who had focus so closing can give it back. A dialog that drops
    // focus to <body> leaves a keyboard user at the top of the document.
    const restoreTo = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      if (restoreTo && document.contains(restoreTo)) restoreTo.focus();
    };
    // `confirming` IS in the deps, and its absence was a real defect: the handler
    // closed over `confirming === false` forever, so attemptClose re-entered the
    // "show the prompt" branch on every press and Escape could never close the
    // drawer once anything had been typed. Measured at four presses.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dirty, busy, confirming]);

  if (!open) return null;

  function attemptClose() {
    if (busy) return;                       // a save in flight is not abandonable
    if (dirty && !confirming) { setConfirming(true); return; }
    onClose(dirty);
  }

  // aria-modal says the rest of the page is inert; without a Tab cycle it is not,
  // and a keyboard user walks straight out of the dialog into the page behind it.
  function trapTab(e: React.KeyboardEvent) {
    if (e.key !== "Tab") return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = Array.from(root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    ));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === root)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
  }

  return <>
    <div className="ss-scrim" onClick={attemptClose} aria-hidden />
    <div ref={dialogRef} className="ss-drawer" role="dialog" aria-modal="true"
         onKeyDown={trapTab}
         aria-labelledby="ss-prep-title" tabIndex={-1}>
      <h3 id="ss-prep-title">Prepare messaging registration</h3>
      <p className="ss-note">
        Paige writes the registration copy carriers ask for from what you describe here. It is saved on
        your business as a draft — <strong>preparing is not submitting</strong>, and no carrier sees it.
      </p>

      <label className="ss-drawer-label" htmlFor="ss-prep-hint">How will you use messaging?</label>
      <textarea id="ss-prep-hint" value={hint} disabled={busy}
        placeholder="Appointment reminders and follow-ups for my clients"
        onChange={(e) => { setHint(e.target.value); setConfirming(false); }} />
      <p className="ss-note">In your own words. Paige turns it into the description, sample messages and
        opt-in language the registration needs.</p>

      {refusal && <div className="ss-next ss-read-failure" role="status">
        <strong>{refusal.title}</strong>
        <p>{refusal.body}</p>
        {refusal.recovery && <p>{refusal.recovery}</p>}
      </div>}

      {confirming && <div className="ss-next" role="status">
        <strong>Discard your unsaved changes?</strong>
        <p>What you have written here has not been saved to your business.</p>
        <div className="ss-drawer-acts">
          <button type="button" className="ss-retry" onClick={() => setConfirming(false)}>Keep editing</button>
          <button type="button" className="ss-retry" onClick={() => onClose(true)}>Discard</button>
        </div>
      </div>}

      <div className="ss-drawer-acts">
        <button type="button" className="ss-act ss-act-primary" disabled={busy || !hint.trim()}
          onClick={() => onSave(hint.trim())}>{busy ? "Saving…" : "Save draft"}</button>
        <button type="button" className="ss-act" onClick={attemptClose} disabled={busy}>Cancel</button>
      </div>
    </div>
  </>;
}

/**
 * A control this surface stops short of, rendered rather than hidden.
 *
 * Hiding it would leave a tenant unable to tell "this product cannot do that"
 * from "I have not found where that lives" — and the second is the reading
 * people default to. So the ceiling is shown, disabled, with its reason and
 * whatever recovery honestly exists.
 */
function BlockedAction({ which }: { which: keyof typeof BLOCKED_ACTIONS }) {
  const a = BLOCKED_ACTIONS[which];
  return <div className="ss-blocked">
    <button type="button" className="ss-act" disabled>{a.label}</button>
    <p className="ss-note"><strong>{a.reason}</strong>{a.recovery ? ` ${a.recovery}` : ""}</p>
  </div>;
}

/**
 * Can this caller prepare? Mirrors the server so the two do not disagree.
 *
 * `is_platform_owner()` is asked for separately because the roles table alone
 * would deny an operator the server would allow — the drafting function gates on
 * `is_platform_owner() OR admin OR coach`, and mirroring only half of an OR is
 * how a surface tells someone they lack access they actually have.
 */
/**
 * Is the caller a platform operator? One home, two consumers.
 *
 * It reports only on the CALLER (`is_platform_owner()` takes no argument and
 * reads `auth.uid()`), so it discloses nothing about anyone else — no §9 surface.
 *
 * Two things this deliberately does that the first version did not. It
 * re-subscribes to auth changes, because `useUserRoles` does and a stale operator
 * flag beside fresh roles is a disagreement waiting to happen on a session
 * change. And it distinguishes "the check said no" from "the check FAILED": the
 * old rejection arm set `false`, so an operator whose RPC errored was told
 * "you can see this, but not change it" — fail-closed, which is right, with a
 * false reason, which is not.
 */
function usePlatformOwner(): { owner: boolean | null; failed: boolean } {
  const [state, setState] = useState<{ owner: boolean | null; failed: boolean }>({ owner: null, failed: false });
  useEffect(() => {
    let active = true;
    const ask = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void (supabase as any).rpc("is_platform_owner").then(({ data }: { data: unknown }) => {
        if (active) setState({ owner: data === true, failed: false });
      }, () => { if (active) setState({ owner: null, failed: true }); });
    };
    ask();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // Not inside the callback: a query there can deadlock session hydration.
      window.setTimeout(ask, 0);
    });
    return () => { active = false; sub.subscription.unsubscribe(); };
  }, []);
  return state;
}

function usePreparePermission(): PreparePermission {
  const roles = useUserRoles();
  const { owner, failed } = usePlatformOwner();
  // A failed operator check must not hold the surface at `pending` forever, so it
  // resolves to the roles answer alone — which for a tenant admin or coach is
  // still `allowed`, and for anyone else is a denial they would have got anyway.
  return preparePermission({
    loading: roles.loading,
    isStaff: roles.isStaff,
    isPlatformOwner: failed ? false : owner,
  });
}

/**
 * The DOMAIN gate is not the prepare gate — see `domainPermission`. A coach
 * passes the prepare gate and fails this one, and the destructive control on
 * this card is the one place that difference is expensive.
 */
function useDomainPermission(): DomainPermission {
  const roles = useUserRoles();
  const { owner, failed } = usePlatformOwner();
  return domainPermission({
    loading: roles.loading, isAdmin: roles.isAdmin, isPlatformOwner: owner, ownerCheckFailed: failed,
  });
}

/**
 * Custom sending domains — the four released verbs, made reachable.
 *
 * This card rendered a read-only list. The adapter behind it declared every
 * write "a separate slice" and the controls stayed disabled — while
 * `manage-tenant-domain` had already shipped add / refresh / set_default /
 * remove, tenant-scoped and callable. The deferral was a decision an earlier
 * session made, not a missing contract, and reading it as a limit left a
 * supported capability static behind an "unavailable" label.
 *
 * THE DNS RECORDS ARE THE FLOW, NOT A DETAIL. Adding a domain does not make it
 * usable; publishing the returned records at the registrar and then verifying
 * does. A card that let someone add a domain and never showed them what to
 * publish would leave them stuck at "pending" forever with nothing to act on —
 * which is the same dead end as not having the control at all.
 *
 * REMOVE IS DESTRUCTIVE AND ASKS FIRST. It deletes the domain at the provider as
 * well as here, and it cannot be undone from this surface.
 */
function SendingDomainsPanel({
  domains, loading, error, retry, manageDomain, presentation, permission,
}: {
  domains: ReturnType<typeof useSoloComms>["domains"];
  loading: boolean; error: string | null; retry: () => void;
  manageDomain: ReturnType<typeof useSoloComms>["manageDomain"];
  presentation: ReturnType<typeof getCustomDomainPresentation>;
  permission: DomainPermission;
}) {
  const [adding, setAdding] = useState(false);
  const [domain, setDomain] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromLocal, setFromLocal] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<DomainOutcome | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const invalid = domain.trim() !== "" && !isSendableDomain(domain);
  // Writes are off unless the server would allow them. `pending` is off too: an
  // enabled control that is about to be taken away is worse than a brief wait.
  const mayWrite = permission.state === "allowed";
  const [ackId, setAckId] = useState<string | null>(null);

  const run = async (
    key: string,
    verb: "add" | "refresh" | "set_default" | "remove",
    payload: Parameters<typeof manageDomain>[1],
    onDone?: () => void,
  ) => {
    setBusy(key); setOutcome(null); setAckId(null);
    const res = await manageDomain(verb, payload);
    setBusy(null);
    if (!res.ok) { setOutcome(domainOutcomeFor(res.error)); return; }
    onDone?.();
  };

  /* The pill reports the CAPABILITY, exactly as it did before this card gained
     its write controls. A revision of this line derived it from `domains.length`
     and dropped the `capabilityTruth` qualifier, so a tenant whose only domain was
     unverified — who cannot send one email from it — read a bare LIVE two elements
     to the left of a warn chip and a row saying `pending`. A count is not a state,
     and the two sibling cards in this same fold still carry the qualifier. */
  return <Card title="Custom sending domains" icon={Globe2} truth={presentation.capability} capabilityTruth
    actions={<Status tone={presentation.tone}>{presentation.accountLabel}</Status>}>
    {/* Kept from the read-only card this replaces. Dropping it while adding the
        write controls would have removed a shipped signal in a change nominally
        about adding one (§58). */}
    <OrthogonalConnectionState {...presentation}/>
    <ReadState loading={loading} error={error} retry={retry}
      errorBody={(e) => {
        const known = domainOutcomeFor(e);
        // An unrecognised read error keeps its shape out of the tenant's way; a
        // recognised one (an expired session, a workspace that did not resolve)
        // says the true cause. Either way nothing was written, and it says so.
        return known.code === "unknown"
          ? "We couldn’t read your sending domains just now. Nothing on this account was changed."
          : `${known.title}. Nothing on this account was changed.`;
      }}>
      {domains.length ? <div className="ss-list">{domains.map((d) => <div key={d.id} className="ss-domain-row">
        <span>
          <strong>{d.domain}</strong>
          <small>{d.fromEmailLocal}@{d.domain}{d.isDefault ? " · default" : ""}</small>
        </span>
        <Status tone={d.status === "verified" ? "ok" : d.status === "failed" ? "bad" : "warn"}>{d.status}</Status>
        <div className="ss-domain-acts">
          {d.status !== "verified" && <button type="button" className="ss-act ss-act-go"
            disabled={busy !== null || !mayWrite}
            onClick={() => void run(d.id, "refresh", { id: d.id }, () => setAckId(d.id))}>
            {busy === d.id ? "Checking…" : "Check verification"}</button>}
          {!d.isDefault && <button type="button" className="ss-act ss-act-go" disabled={busy !== null || !mayWrite}
            onClick={() => void run(d.id, "set_default", { id: d.id })}>Make default</button>}
          {d.dnsRecords.length > 0 && <button type="button" className="ss-act"
            aria-expanded={expanded === d.id}
            onClick={() => setExpanded(expanded === d.id ? null : d.id)}>
            {expanded === d.id ? "Hide DNS records" : "Show DNS records"}</button>}
          <button type="button" className="ss-act ss-act-danger" disabled={busy !== null || !mayWrite}
            onClick={() => setConfirmRemove(d.id)}>Remove</button>
        </div>

        {/* MINOR, and the one verb whose entire purpose is answering this: a check
            that finds nothing changed used to return the label from "Checking…" to
            "Check verification" and render nothing, so "checked, still pending" and
            "the click did nothing" looked identical. This states the re-read. */}
        {ackId === d.id && busy === null && <p className="ss-note">
          Checked just now — still {d.status}. {d.dnsRecords.length > 0
            ? "The records below still have to be published and found before it can send."
            : "It cannot send until it verifies."}
        </p>}

        {expanded === d.id && <div className="ss-dns">
          <p className="ss-note">Publish these at whoever manages this domain&rsquo;s DNS, then check verification.
            Until they are published and found, this domain stays unverified and cannot send.</p>
          <div className="scroll-x"><table className="ss-dns-table">
            <thead><tr><th>Type</th><th>Name</th><th>Value</th></tr></thead>
            <tbody>{d.dnsRecords.map((rec, i) => <tr key={i}>
              <td>{rec.type}</td><td>{rec.name}</td><td className="ss-dns-value">{rec.value}</td></tr>)}</tbody>
          </table></div>
        </div>}

        {confirmRemove === d.id && <div className="ss-next" role="group" aria-label={`Confirm removing ${d.domain}`}>
          <strong>Remove {d.domain}?</strong>
          <p>This deletes it from your email provider as well as from this account, and it cannot be undone here.
            Anything currently sending from it will stop.</p>
          <div className="ss-drawer-acts">
            <button type="button" className="ss-act" onClick={() => setConfirmRemove(null)}>Keep it</button>
            <button type="button" className="ss-act ss-act-danger" disabled={busy !== null}
              onClick={() => void run(d.id, "remove", { id: d.id }, () => setConfirmRemove(null))}>
              {busy === d.id ? "Removing…" : "Remove it"}</button>
          </div>
        </div>}
      </div>)}</div>
      : <div className="ss-empty"><WifiOff/>No custom sending domain yet. Email sends from the platform default until you add one.</div>}
    </ReadState>

    {outcome && <div className="ss-next ss-read-failure" role="status">
      <strong>{outcome.title}</strong><p>{outcome.body}</p>
      {outcome.recovery && <p>{outcome.recovery}</p>}
    </div>}

    {adding ? <div className="ss-domain-form">
      <label className="ss-drawer-label" htmlFor="ss-dom">Domain</label>
      <input id="ss-dom" value={domain} disabled={busy !== null} placeholder="yourbusiness.com"
        onChange={(e) => { setDomain(e.target.value); setOutcome(null); }}/>
      {invalid && <p className="ss-note ss-invalid">Enter the bare domain — yourbusiness.com, not a web address or an email address.</p>}
      <label className="ss-drawer-label" htmlFor="ss-dom-local">Send from</label>
      <input id="ss-dom-local" value={fromLocal} disabled={busy !== null} placeholder="no-reply"
        onChange={(e) => setFromLocal(e.target.value)}/>
      <label className="ss-drawer-label" htmlFor="ss-dom-name">Sender name</label>
      <input id="ss-dom-name" value={fromName} disabled={busy !== null} placeholder="Notifications"
        onChange={(e) => setFromName(e.target.value)}/>
      <p className="ss-note">Adding it registers the domain and gives you the DNS records to publish. It cannot send
        until those are published and verified.</p>
      <div className="ss-drawer-acts">
        <button type="button" className="ss-act ss-act-primary"
          disabled={busy !== null || !mayWrite || !isSendableDomain(domain)}
          onClick={() => void run("add", "add", {
            domain: domain.trim().toLowerCase(),
            from_name: fromName.trim() || undefined,
            from_email_local: fromLocal.trim() || undefined,
          }, () => { setAdding(false); setDomain(""); setFromName(""); setFromLocal(""); })}>
          {busy === "add" ? "Adding…" : "Add domain"}</button>
        <button type="button" className="ss-act" disabled={busy !== null}
          onClick={() => { setAdding(false); setOutcome(null); }}>Cancel</button>
      </div>
    </div>
    : <div className="ss-actions-row">
        <button type="button" className="ss-act ss-act-primary" disabled={!mayWrite}
          onClick={() => { setAdding(true); setOutcome(null); }}>
          Add a sending domain</button>
      </div>}

    {/* Disabled WITH THE REASON, never hidden — the same rule the blocked A2P
        actions follow. Someone who cannot see the ceiling cannot tell "this needs
        access I don't have" from "this product cannot do it". */}
    {permission.state === "denied" && <div className="ss-next">
      <p className="ss-note">{permission.reason}</p>
      <p className="ss-note">{permission.recovery}</p>
    </div>}
  </Card>;
}

function ConnectionsView({ initialSegment }: { initialSegment?: ConnectionsSegment }) {
  const { activeTenantId } = useTenantContext();
  const comms = useSoloComms();
  const identity = useManagedIdentity();
  const domainPerm = useDomainPermission();
  // The owner-locked Connections shape, from #660: Communications owns whether a
  // message can send, Calendars owns scheduling configuration, Health reports
  // readiness, and Available stays the provider catalogue.
  //
  // The initial segment comes from the VALIDATED entry state, so the Calendar's
  // "Manage calendar settings" exit opens calendar settings. Arriving on
  // Communications after following a link that says Calendars is the kind of miss
  // that makes someone believe the setting is not there.
  const [view, setView] = useState<ConnectionsSegment>(initialSegment ?? "communications");
  const identityStatus = identity.value?.default_email_status ?? null;
  const identityPresentation = getManagedIdentityPresentation({ identity: identity.value, loading: identity.loading, error: identity.error });
  const domainPresentation = getCustomDomainPresentation({ statuses: comms.domains.map((domain) => domain.status), loading: comms.loading, error: comms.error });
  const readiness = useCommsReadiness();
  const r = readiness.value;
  const permission = usePreparePermission();

  /**
   * The prepare attempt.
   *
   * `activeTenantId` is in the reset key deliberately: an open drawer, a
   * half-typed hint and a refusal all belong to the account they were made
   * against. Carrying them across an account switch would put one business's
   * words under another business's heading — the same substitution
   * `useCommsReadiness` clears its value to avoid.
   */
  const [prepare, setPrepare] = useState<{ open: boolean; busy: boolean; refusal: Refusal | null; hint: string }>(
    { open: false, busy: false, refusal: null, hint: "" });
  useEffect(() => { setPrepare({ open: false, busy: false, refusal: null, hint: "" }); }, [activeTenantId]);

  const savePrepared = useCallback(async (hint: string) => {
    // The attempted hint is DELIBERATELY not written back into `prepare.hint`.
    // It used to be, and that quietly defeated the drawer's own discard guard:
    // the value flowed back down as `initialHint`, the drawer's reset effect
    // re-ran, `dirty` became false, and Cancel then destroyed the text with no
    // prompt — on the refusal path, which is exactly where a tenant has typed the
    // most and is likeliest to back out. The drawer stays mounted through a
    // refusal and holds its own text; nothing here needs a copy of it.
    setPrepare((p) => ({ ...p, busy: true, refusal: null }));
    // No tenant_id: the server derives it for a JWT caller and IGNORES a body
    // value, so sending one would suggest an authority this call does not have.
    const { data, error } = await supabase.functions.invoke("comms-a2p-draft", {
      body: { use_case_hint: hint },
    });
    if (error) {
      const refusal = await refusalFromInvoke(error);
      setPrepare((p) => ({ ...p, busy: false, refusal }));
      return;
    }
    // A 200 carrying needs_config means NO draft was written and nothing was
    // saved. Treating it as success is the "looks stored, persisted nothing"
    // failure the drafting function was itself corrected to stop returning.
    if ((data as { needs_config?: boolean } | null)?.needs_config) {
      setPrepare((p) => ({ ...p, busy: false, refusal: refusalFor("MODEL_UNAVAILABLE") }));
      return;
    }
    setPrepare({ open: false, busy: false, refusal: null, hint: "" });
    // Re-read rather than assume: the card must report what the record now says,
    // not what we hoped this call did to it.
    await readiness.retry();
  }, [readiness]);

  // Integrations is deliberately NOT built as a tab here. It is its own Settings
  // destination, shipped by #657, so Connections does not become a second home
  // for it (§18). `Available` below is #660's provider CATALOGUE, which predates
  // that split and is annotated there as part of the owner-locked shape — it is
  // preserved rather than deleted, because removing another lane's shipped
  // surface is not this PR's call (§58).
  const TABS = [
    ["communications", "Communications"],
    ["calendars", "Calendars"],
    ["health", "Health"],
    ["available", "Available"],
  ] as const;

  /** The ruled fallback for a not-ready path where the read SUCCEEDED and there
   *  is simply nothing to report. A failed read goes through `readFailureNotice`
   *  instead — this used to serve both, and the comment outlived that. */
  const notReady = (body: string) => <div className="ss-next">
    <strong>Texting is not ready yet</strong><p>{body}</p>
  </div>;

  /**
   * A FAILED READ IS NOT AN EMPTY ACCOUNT, and the difference is the whole point.
   *
   * These cards pass `error={null}` to ReadState deliberately: ReadState prints
   * `error.message` verbatim, and this resolver's message is a raw
   * `COMMS_READINESS_FORBIDDEN` / `COMMS_READINESS_NO_TENANT` — an internal
   * diagnostic, not something to show a tenant. But suppressing the MESSAGE is
   * not licence to suppress the FACT. Without this, a resolver failure rendered
   * five confident sentences of the form "No X record has been read for this
   * account yet" — each a statement about the ACCOUNT, made when nothing about
   * the account had been learned — with no error and no retry on the default view.
   *
   * That is reachable, not hypothetical: the resolver raises FORBIDDEN for any
   * authenticated caller who is not admin / coach / platform-operator, so a
   * sales_rep or an ungranted team member met exactly this on every load.
   *
   * So: one notice states that the read failed and offers the retry, and each
   * card fallback says which of the two actually happened.
   */
  const readFailed = !readiness.loading && !!readiness.error;
  const noRecord = (what: string) =>
    readFailed
      ? <p>We couldn&rsquo;t read this account&rsquo;s setup just now, so nothing is being claimed about its {what}.</p>
      : <p>No {what} record has been read for this account yet.</p>;
  /**
   * The collapsed line for a fold, and the three cases it must tell apart.
   *
   * A fold is closed by default, so this line is often the ONLY thing a tenant
   * reads about that area. It therefore has to distinguish "we haven't read yet"
   * from "the read failed" from "here is what the record says" — the same
   * distinction the cards inside make, made once more at the summary level. A
   * single fallback string for all three would reintroduce, in the header, the
   * exact confident-negative this surface was corrected for.
   */
  const rest = (fromRecord: () => { state: string; tone: "ok" | "warn" | "bad" | "neutral" }):
    { atRest: string; tone: "ok" | "warn" | "bad" | "neutral" } => {
    if (readiness.loading) return { atRest: "Reading this account…", tone: "neutral" };
    if (readFailed) return { atRest: "Couldn’t be read", tone: "neutral" };
    if (!r) return { atRest: "Nothing read yet", tone: "neutral" };
    const st = fromRecord();
    return { atRest: st.state, tone: st.tone };
  };

  const readFailureNotice = readFailed
    ? <div className="ss-next ss-read-failure" role="status">
        <strong>We couldn&rsquo;t read this account&rsquo;s setup</strong>
        <p>Nothing below is being claimed about this account until the read succeeds.</p>
        <p><button type="button" className="ss-retry" onClick={readiness.retry}>Try again</button></p>
      </div>
    : null;

  return <>
    {/* Pinned so the context never leaves on a surface that is deliberately long:
        scroll into the Calendars builder and you can still see where you are and
        step back out. The bar spans the content column and paints an opaque
        ground, so nothing scrolls visibly beneath it. */}
    <div className="ss-subnav">
      <span className="ss-subnav-here">Connections</span>
      <div className="ss-segment" role="tablist" aria-label="Connections areas">
        {TABS.map(([key, label]) => (
          <button key={key} role="tab" aria-selected={view === key} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>
    </div>

    {view === "calendars" && <CalendarsView/>}

    {view === "communications" && <div className="ss-sections">
      {readFailureNotice}
      <Fold id="ss-sub-phone" title="Business phone"
        blurb="The number this business texts and calls from."
        {...rest(() => phoneStep(r!))}>
        <div className="ss-grid">
          <Card title="Number on this business" icon={Smartphone}
            truth={r ? phoneStep(r).truth : "PARTIAL"}
            actions={r ? <Status tone={phoneStep(r).tone}>{phoneStep(r).state}</Status> : undefined}>
            <ReadState loading={readiness.loading} error={null} retry={readiness.retry}>
              {r ? <><p>{phoneStep(r).detail}</p>
                {r.number === "assigned" && <div className="ss-fields"><Field label="Number" value={r.number_e164}/></div>}
              </> : noRecord("number")}
            </ReadState>
          </Card>
          <PhoneSetupPanel/>
        </div>
        {/* Named, not offered. Both contact the provider and spend money, which
            this screen holds no authority to do — and a tenant who cannot see
            the ceiling cannot tell "we don't do that" from "I can't find it". */}
        <div className="ss-actions-row">
          <BlockedAction which="search_number"/>
          <BlockedAction which="assign_number"/>
        </div>
      </Fold>

      {/* The one fold that opens itself, and only when the record says this is the
          step in the way. Opening every fold defeats the point; opening none makes a
          tenant hunt for the thing they were just told is blocking them. */}
      <Fold id="ss-sub-registration" title="Messaging registration"
        blurb="Carriers require a registered business, and a recorded agreement from each person, before any text can send."
        defaultOpen={!readiness.loading && !readFailed && !!r &&
          (r.blocked_reason === "registration_absent" || r.blocked_reason === "registration_not_approved")}
        {...rest(() => registrationStep(r!))}>
        <div className="ss-grid">
          <Card title="Carrier registration" icon={Webhook}
            truth={r ? registrationStep(r).truth : "PARTIAL"}
            actions={r ? <Status tone={registrationStep(r).tone}>{registrationStep(r).state}</Status> : undefined}>
            <ReadState loading={readiness.loading} error={null} retry={readiness.retry}>
              {r ? <>
                <p>{registrationStep(r).detail}</p>
                <StepRows steps={stepByName(r, businessDetailsStep(r).n)}/>
                <p className="ss-note">Filing with a carrier is not something this surface can do. A registration can be
                  prepared and saved here; it stops at <strong>prepared, not submitted</strong>.</p>
              </> : noRecord("registration")}
            </ReadState>
            {/* The action the copy above promises. It used to promise it and offer
                nothing — the only caller of the drafting seam was a legacy admin
                tab this tenant is redirected away from, so the sentence was true
                of the product and false of the screen printing it. */}
            {!readFailed && <div className="ss-actions-row">
              <button type="button" className="ss-act ss-act-primary"
                disabled={permission.state !== "allowed"}
                onClick={() => setPrepare({ open: true, busy: false, refusal: null, hint: "" })}>
                {r?.a2p === "prepared" ? "Revise registration" : "Prepare registration"}
              </button>
              {permission.state === "denied" && <p className="ss-note">
                <strong>{permission.reason}</strong> {permission.recovery}
              </p>}
              <BlockedAction which="submit"/>
            </div>}
          </Card>
          <Card title="Consent and opt-outs" icon={ShieldCheck}
            truth={r ? consentStep(r).truth : "PARTIAL"}
            actions={r ? <Status tone={consentStep(r).tone}>{consentStep(r).state}</Status> : undefined}>
            <ReadState loading={readiness.loading} error={null} retry={readiness.retry}>
              {r ? <p>{consentStep(r).detail}</p>
                 : noRecord("consent")}
            </ReadState>
            <p className="ss-note">Consent is recorded when a person replies to confirm. Nothing else on this account writes it.</p>
          </Card>
        </div>
      </Fold>

      <Fold id="ss-sub-identity" title="Sending identity"
        blurb="What email sends from. Separate from the phone number and from texting."
        atRest={identity.loading ? "Reading this account…"
          : identity.error ? "Couldn’t be read"
          : identityPresentation.accountLabel}
        tone={identity.loading || identity.error ? "neutral" : identityPresentation.tone as "ok" | "warn" | "bad" | "neutral"}>
        <div className="ss-grid">
          <Card title="PAIGE-managed sending identity" icon={Mail} truth={identityPresentation.capability} capabilityTruth actions={<Status tone={identityPresentation.tone}>{identityPresentation.accountLabel}</Status>}>
            <OrthogonalConnectionState {...identityPresentation}/>
            <ReadState loading={identity.loading} error={identity.error} retry={identity.retry}>{identity.value ? <div className="ss-fields"><Field label="Sender" value={identity.value.default_email_sender}/><Field label="Domain" value={identity.value.default_email_domain}/><Field label="Kind" value={identity.value.default_email_kind}/><Field label="Persisted status" value={identityStatus}/></div> : <p>No managed sending identity is configured for this account.</p>}</ReadState>
            <p className="ss-note">This is a managed outbound identity. It is not called a mailbox because inbound mailbox behavior is not proven.</p>
          </Card>
          {/* `key` is load-bearing, not cosmetic. This panel holds a refusal, a
              half-typed domain, an open remove-confirm and an expanded DNS block
              in local state, and it had NO tenant dependency — measured: a
              `forbidden` refusal raised under account A stayed on screen under
              account B's heading, with A's domain still in B's Add form, one
              click from registering it against B. The write itself was never
              cross-tenant (the function pins the tenant server-side), but the
              words were about the wrong business. `ConnectionsView` resets
              `prepare` on the same key for the same reason. */}
          <SendingDomainsPanel key={activeTenantId ?? "no-tenant"}
            domains={comms.domains} loading={comms.loading} error={comms.error}
            retry={comms.refresh} manageDomain={comms.manageDomain}
            presentation={domainPresentation} permission={domainPerm}/>
          <Card title="Connected mailbox" icon={Mail} truth="UNAVAILABLE" capabilityTruth>
            <OrthogonalConnectionState accountLabel="Unavailable" healthLabel="Not measurable" tone="neutral"/>
            <p>No current Settings read proves a connected inbound Gmail or Outlook mailbox. OAuth setup must not be represented as connected until that contract exists.</p>
          </Card>
        </div>
      </Fold>

      <Fold id="ss-sub-delivery" title="Delivery health"
        blurb="Counted from delivery receipts only. Nothing here is inferred."
        {...rest(() => deliveryStep(r!))}>
        <div className="ss-grid">
          <Card title="Delivery" icon={TriangleAlert}
            truth={r ? deliveryStep(r).truth : "PARTIAL"}
            actions={r ? <Status tone={deliveryStep(r).tone}>{deliveryStep(r).state}</Status> : undefined}>
            <ReadState loading={readiness.loading} error={null} retry={readiness.retry}>
              {r ? <p>{deliveryStep(r).detail}</p> : noRecord("delivery")}
            </ReadState>
            {/* Three things are deliberately absent, each because no record backs
                them: whether replies arrive (nothing writes an inbound SMS row),
                webhook registration health, and any inference of deliverability
                from a plan or a consent count. */}
            {/* Conditional for the same reason the step's detail is: making the
                function honest and leaving this note absolute would have kept the
                exact contradiction the change set out to remove — the card would
                still say nothing records replies while Conversations reported
                them. Webhook health has no record either way, so it stays. */}
            <p className="ss-note">{r?.delivery.inbound_reporting === "available"
              ? <>Webhook health is <strong>not reported</strong> — nothing on this account records it.</>
              : <>Replies and webhook health are <strong>not reported</strong> — nothing on this
                account records them, so neither a positive nor a negative would be true.</>}</p>
          </Card>
          <Card title="Billing for messaging" icon={Building2}
            truth={r ? billingStep(r.billing).truth : "PARTIAL"}
            actions={r ? <Status tone={billingStep(r.billing).tone}>{billingStep(r.billing).state}</Status> : undefined}>
            <ReadState loading={readiness.loading} error={null} retry={readiness.retry}>
              {r ? <p>{billingStep(r.billing).detail}</p> : noRecord("billing")}
            </ReadState>
            <p className="ss-note">Reported here because messaging costs bill against it. Plans and payment are owned by
              Settings → Billing, not by Connections.</p>
          </Card>
        </div>
      </Fold>

      <PrepareRegistrationDrawer
        open={prepare.open} busy={prepare.busy} refusal={prepare.refusal} initialHint={prepare.hint}
        onSave={(hint) => { void savePrepared(hint); }}
        onClose={() => setPrepare({ open: false, busy: false, refusal: null, hint: "" })}/>
    </div>}

    {view === "health" && <div className="ss-sections">
      <Subsection id="ss-sub-health" title="Readiness"
        blurb="A secondary view of the same records shown above — the ordered path to being operational.">
        <div className="ss-grid">
          <Card title="Business texting readiness" icon={Webhook}
            truth={r ? (r.can_send_sms ? "LIVE" : "PARTIAL") : "PARTIAL"}
            // `r` alone is the correct guard, and `&& !readFailed` was removed as
            // dead: `useCommsReadiness` sets `value: error ? null : row`, so a
            // record and an error can never coexist. A previous commit message
            // claimed this pill "was populated from a record that had not been
            // read" — it was not, and the added conjunct could not have changed
            // anything. Left simple rather than defensively redundant, because a
            // guard that cannot fire reads as a repair that never happened.
            actions={r ? (r.can_send_sms ? <Status tone="ok">Ready to text</Status> : <Status tone="warn">Texting is not ready yet</Status>) : undefined}>
            <ReadState loading={readiness.loading} error={null} retry={readiness.retry}>
              {/* "Texting is not ready yet" is a definite claim about the account,
                  and it used to head the FAILED-READ block — one line above a
                  sentence saying nothing is being claimed about the account. The
                  five Communications cards were repaired and this was missed. */}
              {readFailed ? <div className="ss-next ss-read-failure" role="status">
                  <strong>We couldn&rsquo;t read this account&rsquo;s setup</strong>
                  <p>Nothing below is being claimed about it. Try again in a moment.</p>
                  <p><button type="button" className="ss-retry" onClick={readiness.retry}>Try again</button></p>
                </div>
              : r ? <>
                  {!r.can_send_sms && r.blocked_reason && (
                    <div className="ss-next">
                      <strong>{(READINESS_COPY[r.blocked_reason] ?? { headline: "Texting is not ready yet" }).headline}</strong>
                      <p>{(READINESS_COPY[r.blocked_reason] ?? { next: "Some setup is still outstanding." }).next}</p>
                    </div>
                  )}
                  <ReadinessLadder r={r}/>
                  <p className="ss-note">Each step reports what its own record says. A step that cannot be checked says so
                    rather than assuming it passed. Setup lives under Communications; this view only reflects it.</p>
                </>
              : notReady("We don\u2019t have a setup to read for this account yet.")}
            </ReadState>
          </Card>
          <Card title="Supported failure states" icon={TriangleAlert} truth="PARTIAL">
            <div className="ss-state-list"><Status tone="warn">DNS pending</Status><Status tone="bad">DNS failure</Status><Status tone="bad">Token expired / revoked</Status><Status tone="bad">Webhook failure</Status><Status tone="warn">A2P pending</Status><Status tone="bad">A2P rejected</Status><Status tone="ok">A2P approved</Status><Status>Disconnected</Status></div>
            <p className="ss-note">These are display states this surface supports. They are <strong>not</strong> claims about this account.</p>
          </Card>
        </div>
      </Subsection>
    </div>}

    {/* #660's provider catalogue, preserved verbatim. This branch had deleted it
        and disclosed the resulting visibility gap under §58; #657 then shipped a
        real top-level Integrations owner, and #660 annotated Available as part of
        the owner-locked Connections shape. Both facts point the same way: keep it,
        withdraw the removal, and leave whether Available still earns a place here
        to the owner and the lane that owns it. */}
    {view === "available" && <div className="ss-provider-grid">{PROVIDERS.map(([name,kind,truth])=><article key={name}><Smartphone/><div><strong>{name}</strong><span>{kind}</span></div><Truth value={truth}/></article>)}</div>}
  </>;
}

/**
 * Business phone provisioning — a PEER of the number record, not the surface.
 *
 * Previously this rendered full-width with an accent rail at the top of
 * Connections, so number search visually replaced the whole feature. It is now
 * one card inside the Business phone subsection, and it still states its own
 * ceiling: no provider search runs from here.
 */
function PhoneSetupPanel() {
  const [searchAttempted, setSearchAttempted] = useState(false);
  return <section className="ss-card" aria-labelledby="ss-phone-title">
    <header>
      <span className="ss-card-icon"><Search aria-hidden/></span>
      <div className="ss-phone-heading">
        <h2 id="ss-phone-title" className="ss-phone-title">Find a number</h2>
      </div>
      <Truth value="PROPOSED"/>
    </header>
    <div className="ss-card-body">
      <p className="ss-phone-contract">Choose a locality and the capabilities you need. Live availability, pricing, purchase and assignment are not connected in this Settings contract.</p>
      <form className="ss-phone-search" onSubmit={(event) => { event.preventDefault(); setSearchAttempted(true); }}>
        <label><span>Area code or locality</span><input type="search" name="phone-locality" placeholder="Atlanta or 404" autoComplete="off"/></label>
        <label><span>Required capabilities</span><select name="phone-capabilities" defaultValue="sms-voice"><option value="sms-voice">SMS + voice</option><option value="sms">SMS</option><option value="voice">Voice</option></select></label>
        <button type="submit"><Search aria-hidden/>Search numbers</button>
      </form>
      {searchAttempted && <div className="ss-phone-unavailable" role="status"><TriangleAlert aria-hidden/><span><strong>Number search is not connected yet.</strong> No provider search ran, and no number, charge, or account data changed.</span></div>}
    </div>
  </section>;
}

function NotificationsView() { return <div className="ss-grid"><Card title="Customer notifications" icon={Bell} truth="PARTIAL"><p>Customer-facing preference seams exist in legacy surfaces, but a unified Solo Settings read and mutation contract is not proven. No fabricated toggles are enabled.</p></Card><Card title="Delivery failures" icon={TriangleAlert} truth="UNAVAILABLE"><p>Bounce, webhook, and provider-delivery alert preferences are unavailable until a supported runtime contract is owned here.</p></Card></div>; }

function SecurityView() { return <div className="ss-grid"><Card title="Account security" icon={ShieldCheck} truth="PARTIAL"><p>Authentication and workspace access remain protected by existing account security controls.</p></Card><Card title="Privacy & data" icon={FileLock2} truth="PARTIAL"><p>Data controls must follow Trust Compass authority and proven retention/export contracts. Unsupported controls remain unavailable.</p></Card><Card title="Credential storage" icon={KeyRound} truth="UNAVAILABLE"><p>Vault is not a password manager. Raw passwords and secrets must not enter Vault records, PAIGE memory, or conversation content. Use proven OAuth/provider flows or an external password manager.</p></Card></div>; }

function VaultView() { return <div className="ss-grid"><Card title="Outside relationships & obligations" icon={FileLock2} truth="PROPOSED"><div className="ss-tags">{["Insurance","Lease / rent","Utilities","Vendors","Registrations","Licenses","Annual filings","Tax & compliance"].map(x=><span key={x}>{x}</span>)}</div><p className="ss-note">Structured records, evidence, responsible contacts, renewals, and due dates require a separately approved backend contract.</p></Card><Card title="PAIGE-assisted intake" icon={CalendarClock} truth="PROPOSED"><p>PAIGE may eventually ingest, classify, draft, and store supported information under permission and Trust Compass rules. No upload or memory claim is active here.</p></Card><Card title="Passwords & secrets" icon={KeyRound} truth="UNAVAILABLE"><p>Ordinary Vault fields and documents never accept raw credentials. Secure credential storage is unavailable without a dedicated encrypted contract.</p></Card></div>; }

function BillingView() {
  const comms = useSoloComms();
  return <div className="ss-grid"><Card title="Platform subscription" icon={CircleDollarSign} truth="PARTIAL"><ReadState loading={comms.loading} error={comms.error} retry={comms.refresh}>{comms.billing ? <div className="ss-fields"><Field label="Plan" value={comms.billing.name}/><Field label="Status" value={comms.billing.status}/><Field label="Price" value={comms.billing.priceLabel}/><Field label="Renewal" value={comms.billing.renewsLabel}/></div> : <p>No current Solo subscription record was returned.</p>}</ReadState></Card><Card title="Invoices & payment method" icon={FileLock2} truth="UNAVAILABLE"><p>No proven frontend read supports invoices or payment methods here.</p></Card><Card title="Usage & limits" icon={CalendarClock} truth="UNAVAILABLE"><p>Frozen metering designs do not prove runtime usage totals or complete limits. No totals are shown.</p></Card></div>;
}

export function SoloSettings() {
  const [tab] = useSubtabRoute("solo", "settings", "setup");
  const tabs=[['setup','Setup'],['team','Team'],['connections','Connections'],['integrations','Integrations'],['notifications','Notifications'],['security-data','Security & data'],['vault','Vault'],['billing','Billing']];
  const location = useLocation();
  const params = useParams();
  const account = params.account ?? "";
  const entry = useMemo(() => resolveSoloSettingsEntry(location.search, account), [location.search, account]);
  // BOTH ways in are one-shot, and neither can be expressed by deleting a
  // parameter alone.
  //
  // `segment` comes from the OAuth return address and CAN be removed once read.
  // `origin=calendar` cannot: the "Return to Calendar" banner needs it for as
  // long as the page is open. But an origin that stays in the address keeps
  // deriving its segment on every mount, so removing the `segment` parameter
  // alone left the same staleness for exactly the journey the origin serves —
  // switch to Communications, refresh, and Calendar's link picks Calendars
  // again, a place you had already left.
  //
  // So the decision is marked spent in history state rather than in the query.
  // It survives a reload, which is what makes a refresh stop re-deciding, and it
  // leaves the return address intact for the banner.
  //
  // The fuller answer — the address always naming the segment, both directions —
  // is the §65 route-taxonomy work, not a hotfix.
  const segmentSpent = Boolean((location.state as { segmentSpent?: boolean } | null)?.segmentSpent);
  const segment = useMemo(
    () => (segmentSpent
      ? undefined
      // An explicit `segment` wins over the entry origin: it is set by a surface
      // that knew exactly where it was, while the origin only says which feature
      // sent you here.
      : requestedSegment(location.search) ?? (entry?.origin === "calendar" ? ("calendars" as const) : undefined)),
    [segmentSpent, location.search, entry?.origin],
  );
  const navigate = useNavigate();
  useEffect(() => {
    // Nothing to spend, or already spent.
    if (!segment || segmentSpent) return;
    const next = new URLSearchParams(location.search);
    next.delete("segment");
    const query = next.toString();
    navigate(`${location.pathname}${query ? `?${query}` : ""}`, {
      replace: true,
      state: { ...(location.state as object | null), segmentSpent: true },
    });
  }, [segment, segmentSpent, location.pathname, location.search, location.state, navigate]);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scrollOwner = rootRef.current?.closest<HTMLElement>("#tenant-shell-main");
    scrollOwner?.classList.add("tcs-main--settings-scrollbar-hidden");
    return () => scrollOwner?.classList.remove("tcs-main--settings-scrollbar-hidden");
  }, []);
  const current = SOLO_SETTINGS_DESTINATIONS.find(item => item.key === tab) ?? SOLO_SETTINGS_DESTINATIONS[0];
  const view = tab === "team" ? <TeamView/> : tab === "connections" ? <ConnectionsView initialSegment={segment}/> : tab === "integrations" ? <SoloIntegrationsView/> : tab === "notifications" ? <NotificationsView/> : tab === "security-data" ? <SecurityView/> : tab === "vault" ? <VaultView/> : tab === "billing" ? <BillingView/> : <SetupView/>;
  return <div ref={rootRef} className="solo-settings">
    <header className="ss-page-head"><div><span>Solo settings</span><h1>{current.label}</h1><p>{current.key === "connections" ? "Communications owns whether a message can send. Calendars owns scheduling, links, routing and notification rules." : current.key === "integrations" ? "External tools, bridges, and safe configuration handoffs." : "Account configuration with honest runtime boundaries."}</p></div><Truth value={current.truth}/></header>
    {entry && <div className="ss-return"><span>Opened from {entry.origin === "calendar" ? "Calendar" : "Conversations"}</span>{entry.returnTo ? <Link to={entry.returnTo}>Return to {entry.origin === "calendar" ? "Calendar" : "Conversations"}</Link> : <span>Return address rejected</span>}</div>}
    <div className="ss-content" data-settings-tab={tab} data-tab-count={tabs.length}>{view}</div>
  </div>;
}
