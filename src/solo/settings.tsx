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
import { settingsScrollOwner, SETTINGS_SCROLLBAR_SHOWN } from "./settings-scroll-owner";
import { CalendarsView } from "./connections-calendars";
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

function ReadState({ loading, error, retry, children }: { loading: boolean; error: string | null; retry: () => void; children: ReactNode }) {
  if (loading) return <div className="ss-state" role="status"><RefreshCw className="ss-spin"/>Clearing and resolving this account…</div>;
  if (error) return <div className="ss-state" role="alert"><TriangleAlert/><span><strong>Couldn’t load this account</strong>{error}</span><button onClick={retry}>Retry</button></div>;
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

function ConnectionsView({ initialSegment }: { initialSegment?: ConnectionsSegment }) {
  // The account slug, for the one link this surface owes to Setup — where the
  // business record actually lives.
  const account = useParams().account ?? "";
  const comms = useSoloComms();
  const identity = useManagedIdentity();
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
      <Subsection id="ss-sub-phone" title="Business phone"
        blurb="The number this business texts and calls from.">
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
      </Subsection>

      <Subsection id="ss-sub-registration" title="Messaging registration"
        blurb="Carriers require a registered business, and a recorded agreement from each person, before any text can send.">
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
            {/* These three fields live in SETUP, not here (owner ruling,
                2026-08-31): the business owner, legal name, address and phone are
                Setup's, and Connections owns only what we hand the tenant from our
                own server — the sending domain and the email address on it.

                So this card GRADES them and points at their one home. An earlier
                revision of this branch put an editor here, which made Connections a
                second place to type a business name while `SuBusiness` on Setup was
                already the first — exactly the duplication §18 exists to stop. */}
            <p className="ss-note">
              Your legal name, website and business phone live in{" "}
              <Link to={`/solo/${account}/settings/setup`}>Setup</Link>. Carriers read them from there.
            </p>
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
      </Subsection>

      <Subsection id="ss-sub-identity" title="Sending identity"
        blurb="What email sends from. Separate from the phone number and from texting.">
        <div className="ss-grid">
          <Card title="PAIGE-managed sending identity" icon={Mail} truth={identityPresentation.capability} capabilityTruth actions={<Status tone={identityPresentation.tone}>{identityPresentation.accountLabel}</Status>}>
            <OrthogonalConnectionState {...identityPresentation}/>
            <ReadState loading={identity.loading} error={identity.error} retry={identity.retry}>{identity.value ? <div className="ss-fields"><Field label="Sender" value={identity.value.default_email_sender}/><Field label="Domain" value={identity.value.default_email_domain}/><Field label="Kind" value={identity.value.default_email_kind}/><Field label="Persisted status" value={identityStatus}/></div> : <p>No managed sending identity is configured for this account.</p>}</ReadState>
            <p className="ss-note">This is a managed outbound identity. It is not called a mailbox because inbound mailbox behavior is not proven.</p>
          </Card>
          <Card title="Custom sending domains" icon={Globe2} truth={domainPresentation.capability} capabilityTruth actions={<Status tone={domainPresentation.tone}>{domainPresentation.accountLabel}</Status>}>
            <OrthogonalConnectionState {...domainPresentation}/>
            <ReadState loading={comms.loading} error={comms.error} retry={comms.refresh}><SendingDomainsPanel comms={comms}/></ReadState>
          </Card>
          {/* SENDING ACCOUNT, not "mailbox". The scope granted is `gmail.send`
              only, so inbound remains genuinely unproven — but the outbound half
              is live, and reporting the whole card UNAVAILABLE hid a capability
              that had already shipped. Outlook has no function in this repo at
              all, so it is named as absent rather than implied as coming. */}
          <Card title="Connected sending account" icon={Mail}
            truth={comms.mailbox?.connected ? "LIVE" : "PARTIAL"} capabilityTruth
            actions={<Status tone={comms.mailbox?.connected ? "ok" : "neutral"}>{comms.mailbox?.connected ? "Connected" : "Not connected"}</Status>}>
            <ReadState loading={comms.loading} error={comms.error} retry={comms.refresh}>
              <GoogleSendingAccountPanel comms={comms}/>
            </ReadState>
            <p className="ss-note">Google only. There is no Outlook connection on this platform yet, and none is implied here.</p>
          </Card>
        </div>
      </Subsection>

      <Subsection id="ss-sub-delivery" title="Delivery health"
        blurb="Counted from delivery receipts only. Nothing here is inferred.">
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
      </Subsection>
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
/* ---------------------------------------------------------------------------
 * Editable Connections controls.
 *
 * These three panels exist because the cards above them used to REPORT a state
 * and offer no way to change it — "business name still missing" with no field,
 * "Not configured" with no control, "Unavailable" for a capability whose backend
 * had shipped. Describing a capability is not providing it (§70).
 *
 * Each takes the ALREADY-MOUNTED `useSoloComms()` value as a prop. Calling the
 * hook again inside a panel would create a second copy of this surface's state
 * and a second set of network reads, so a save in one place would leave the
 * other showing a stale answer.
 *
 * Shared contract, all three: the control is disabled while a write is in
 * flight, the outcome states what actually happened, and the adapter re-reads
 * afterwards so what appears is the PERSISTED value rather than what was typed
 * (§70.1 — a toast is not persistence).
 * ------------------------------------------------------------------------- */

type WriteState = { tone: "ok" | "bad"; message: string } | null;

function Outcome({ state }: { state: WriteState }) {
  if (!state) return null;
  return <div className="ss-outcome" data-tone={state.tone} role="status" aria-live="polite">
    {state.tone === "ok" ? <CheckCircle2 aria-hidden/> : <TriangleAlert aria-hidden/>}
    <span>{state.message}</span>
  </div>;
}

/** Shown in place of the controls when the caller may not write here (§9). */
function NotYours({ what }: { what: string }) {
  return <p className="ss-note">Only a workspace admin can change {what}. Your access here is read-only.</p>;
}

function SendingDomainsPanel({ comms }: { comms: ReturnType<typeof useSoloComms> }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ domain: "", fromEmailLocal: "no-reply", fromName: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<WriteState>(null);

  const run = async (key: string, fn: () => Promise<{ ok: boolean; error: string | null }>, okMessage: string) => {
    setBusy(key); setOutcome(null);
    const res = await fn();
    setBusy(null);
    setOutcome(res.ok ? { tone: "ok", message: okMessage } : { tone: "bad", message: res.error ?? "That didn't work." });
    return res.ok;
  };

  if (!comms.canManage) return <NotYours what="sending domains"/>;

  return <>
    {comms.domains.length > 0 && <div className="ss-list">
      {comms.domains.map((d) => <div key={d.id}>
        <span>
          <strong>{d.domain}{d.isDefault ? " · default" : ""}</strong>
          <small>{d.fromEmailLocal}@{d.domain}</small>
        </span>
        <Status tone={d.status === "verified" ? "ok" : "warn"}>{d.status}</Status>
        <div className="ss-row-actions">
          {/* "Check DNS" rather than "Verify": this asks the provider what the
              records currently say. It cannot make an unpublished record exist,
              and a button that implied otherwise would promise a result the
              person has to produce at their registrar. */}
          <button type="button" className="ss-btn ss-btn--quiet ss-btn--sm" disabled={busy !== null}
            onClick={() => run(`refresh:${d.id}`, () => comms.refreshDomain(d.id), `Re-read the DNS records for ${d.domain}.`)}>
            {busy === `refresh:${d.id}` ? <RefreshCw className="ss-spin" aria-hidden/> : <RefreshCw aria-hidden/>}Check DNS
          </button>
          {!d.isDefault && d.status === "verified" && <button type="button" className="ss-btn ss-btn--quiet ss-btn--sm" disabled={busy !== null}
            onClick={() => run(`default:${d.id}`, () => comms.setDefaultDomain(d.id), `${d.domain} is now the default sender.`)}>
            Make default
          </button>}
          <button type="button" className="ss-btn ss-btn--danger ss-btn--sm" disabled={busy !== null}
            onClick={() => { if (window.confirm(`Remove ${d.domain}? Mail already sent is unaffected, but this domain stops being available as a sender.`)) void run(`remove:${d.id}`, () => comms.removeDomain(d.id), `${d.domain} removed.`); }}>
            Remove
          </button>
        </div>
      </div>)}
    </div>}

    {comms.domains.length === 0 && <div className="ss-empty"><WifiOff aria-hidden/>No custom sending domain yet — mail goes out on the PAIGE-managed identity above.</div>}

    {!showAdd && <div className="ss-form-actions" style={{ marginTop: 11 }}>
      <button type="button" className="ss-btn" onClick={() => { setShowAdd(true); setOutcome(null); }}>
        <Globe2 aria-hidden/>Add a domain
      </button>
    </div>}

    {showAdd && <form className="ss-form" onSubmit={async (e) => {
      e.preventDefault();
      if (!form.domain.trim() || !form.fromName.trim()) { setOutcome({ tone: "bad", message: "A domain and a From name are both required." }); return; }
      const ok = await run("add", () => comms.addDomain(form), "Registered. Publish the DNS records it returns, then Check DNS.");
      if (ok) { setShowAdd(false); setForm({ domain: "", fromEmailLocal: "no-reply", fromName: "" }); }
    }}>
      <div className="ss-form-row">
        <label><span>Domain</span>
          <input value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} placeholder="mail.yourbusiness.com" disabled={busy !== null} autoFocus/></label>
        <label><span>Sends from</span>
          <input value={form.fromEmailLocal} onChange={(e) => setForm((f) => ({ ...f, fromEmailLocal: e.target.value }))} placeholder="no-reply" disabled={busy !== null}/></label>
        <label><span>From name</span>
          <input value={form.fromName} onChange={(e) => setForm((f) => ({ ...f, fromName: e.target.value }))} placeholder="Your business" disabled={busy !== null}/></label>
      </div>
      <div className="ss-form-actions">
        <button type="submit" className="ss-btn" disabled={busy !== null}>
          {busy === "add" ? <RefreshCw className="ss-spin" aria-hidden/> : <CheckCircle2 aria-hidden/>}
          {busy === "add" ? "Registering…" : "Register domain"}
        </button>
        <button type="button" className="ss-btn ss-btn--quiet" disabled={busy !== null} onClick={() => { setShowAdd(false); setOutcome(null); }}>Cancel</button>
      </div>
      <p className="ss-note">Registering a domain creates it at the email provider and returns DNS records for you to publish. It does not send anything.</p>
    </form>}

    <Outcome state={outcome}/>
  </>;
}

/**
 * The Google sending account.
 *
 * Called a SENDING ACCOUNT, never a mailbox: `gmail-oauth-start` requests
 * `gmail.send` and `userinfo.email` and nothing else, so no inbound scope is
 * granted and nothing here proves mail is read. The card this replaced said
 * "no Settings read proves a connected mailbox" — true about inbound, and it
 * had been reading as though the whole capability were missing when the
 * outbound half had shipped and simply was not wired to a read.
 */
function GoogleSendingAccountPanel({ comms }: { comms: ReturnType<typeof useSoloComms> }) {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<WriteState>(null);

  if (!comms.canManage) return <NotYours what="the connected sending account"/>;

  if (comms.mailbox === null) {
    // Distinct from "not connected": the read itself did not come back.
    return <p className="ss-note">The connected-account record could not be read, so this is unknown rather than empty. Reload to try again.</p>;
  }

  if (comms.mailbox.connected) {
    return <>
      <div className="ss-fields">
        <Field label="Google account" value={comms.mailbox.address}/>
        <Field label="Status" value={comms.mailbox.status}/>
      </div>
      <div className="ss-form-actions" style={{ marginTop: 11 }}>
        <button type="button" className="ss-btn ss-btn--danger" disabled={busy}
          onClick={async () => {
            if (!window.confirm("Disconnect this Google account? PAIGE stops sending as it, and the stored token is revoked.")) return;
            setBusy(true); setOutcome(null);
            const res = await comms.disconnectGmail();
            setBusy(false);
            setOutcome(res.ok ? { tone: "ok", message: "Disconnected." } : { tone: "bad", message: res.error ?? "That didn't work." });
          }}>
          {busy ? <RefreshCw className="ss-spin" aria-hidden/> : null}{busy ? "Disconnecting…" : "Disconnect"}
        </button>
      </div>
      <p className="ss-note">This account is authorised to SEND only. Reading incoming mail is a separate permission this connection does not request.</p>
      <Outcome state={outcome}/>
    </>;
  }

  return <>
    <p>Connect a Google account so PAIGE can send email as you, rather than from the managed identity.</p>
    <div className="ss-form-actions" style={{ marginTop: 11 }}>
      <button type="button" className="ss-btn" disabled={busy}
        onClick={async () => {
          setBusy(true); setOutcome(null);
          const { url, error } = await comms.startGmailConnect();
          setBusy(false);
          if (!url) { setOutcome({ tone: "bad", message: error ?? "Couldn't start the Google sign-in." }); return; }
          // Opened, never auto-redirected: the consent screen is something the
          // person chose to go to, in a window they can close (§38).
          window.location.assign(url);
        }}>
        {busy ? <RefreshCw className="ss-spin" aria-hidden/> : <ExternalLink aria-hidden/>}
        {busy ? "Opening Google…" : "Connect a Google account"}
      </button>
    </div>
    <p className="ss-note">You'll sign in at Google and grant permission to send. PAIGE never sees your password, and asks for send permission only.</p>
    <Outcome state={outcome}/>
  </>;
}

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
  // The element that actually scrolls Settings is SoloApp's screen host when the
  // shell provides one, and the shell's own `#tenant-shell-main` otherwise (the
  // Settings surface is also mounted bare in tests and harnesses). Dressing the
  // outer main while the inner host owns the scroll left the visible scrollbar
  // undressed, which is the contract `.tcs-main--settings-scrollbar-hidden` exists
  // to hold.
  const scrollOwnerOf = settingsScrollOwner;
  useEffect(() => {
    const scrollOwner = scrollOwnerOf(rootRef.current);
    if (!scrollOwner) return;
    scrollOwner.classList.add("tcs-main--settings-scrollbar-hidden");

    // EVERY Settings destination, not just the long ones. Owner policy makes
    // Settings the intentionally scrollable browse class, so its one scroll owner
    // has to be visible AND drivable from the keyboard wherever you land.
    //
    // `tabindex="-1"` makes the owner focusable without adding a tab stop, and
    // focus is taken only when nothing else holds it, so it never steals focus
    // from a control already in use. Without it the owner cannot hold focus at
    // all: on a fresh load focus sits on <body>, Blink propagates scroll keys
    // UPWARD from the focused node and never descends into a scrollable
    // descendant, and the shell above is `overflow: hidden` — so Space, PageDown
    // and End each left `scrollTop` at 0.
    scrollOwner.classList.add(SETTINGS_SCROLLBAR_SHOWN);
    const hadTabIndex = scrollOwner.hasAttribute("tabindex");
    if (!hadTabIndex) scrollOwner.setAttribute("tabindex", "-1");
    if (document.activeElement === document.body || document.activeElement === null) {
      scrollOwner.focus({ preventScroll: true });
    }

    return () => {
      scrollOwner.classList.remove("tcs-main--settings-scrollbar-hidden");
      scrollOwner.classList.remove(SETTINGS_SCROLLBAR_SHOWN);
      if (!hadTabIndex) {
        // Blur BEFORE the attribute goes: removing `tabindex` does not itself
        // blur, and once the element is not focusable `blur()` is not reliably
        // honoured. Reversed, focus stays on shared chrome after Settings is gone.
        if (document.activeElement === scrollOwner) scrollOwner.blur();
        scrollOwner.removeAttribute("tabindex");
      }
    };
  }, []);
  // One scroll owner across the whole route means one scroll POSITION across it
  // too: without this, opening a short destination after scrolling a long one
  // lands part-way down its content instead of on its heading.
  //
  // AND ONE FOCUS POSITION. `SoloSettings` does NOT remount when the destination
  // changes — the contextual nav renders into the shell chrome, outside `<main>`,
  // and activating it changes only the URL splat. So the mount effect above runs
  // exactly once, at cold load, and every destination reached the normal way was
  // left with focus on the nav link: outside the owner, and Blink propagates
  // scroll keys UPWARD from the focused node, so End and PageDown did nothing.
  // Measured: 1,228px of Connections content unreachable by keyboard after an
  // in-app nav click, while the wheel still worked and a click into the content
  // silently fixed it. Every drive missed it because a harness always arrives by
  // cold load, which is the one path that was never broken.
  //
  // Focus moves only when the owner does not already contain it, so a control the
  // human is using inside the page is never interrupted. Taking it FROM the nav
  // link is the intended behaviour, not a theft: activating that link is a
  // commitment to the destination, and moving focus into the region that just
  // rendered is what a keyboard user needs in order to read it.
  useEffect(() => {
    const scrollOwner = scrollOwnerOf(rootRef.current);
    if (!scrollOwner) return;
    scrollOwner.scrollTop = 0;
    if (!scrollOwner.contains(document.activeElement)) {
      scrollOwner.focus({ preventScroll: true });
    }
  }, [tab, segment]);
  const current = SOLO_SETTINGS_DESTINATIONS.find(item => item.key === tab) ?? SOLO_SETTINGS_DESTINATIONS[0];
  const view = tab === "team" ? <TeamView/> : tab === "connections" ? <ConnectionsView initialSegment={segment}/> : tab === "integrations" ? <SoloIntegrationsView/> : tab === "notifications" ? <NotificationsView/> : tab === "security-data" ? <SecurityView/> : tab === "vault" ? <VaultView/> : tab === "billing" ? <BillingView/> : <SetupView/>;
  return <div ref={rootRef} className="solo-settings">
    <header className="ss-page-head"><div><span>Solo settings</span><h1>{current.label}</h1><p>{current.key === "connections" ? "Communications owns whether a message can send. Calendars owns scheduling, links, routing and notification rules." : current.key === "integrations" ? "External tools, bridges, and safe configuration handoffs." : "Account configuration with honest runtime boundaries."}</p></div><Truth value={current.truth}/></header>
    {entry && <div className="ss-return"><span>Opened from {entry.origin === "calendar" ? "Calendar" : "Conversations"}</span>{entry.returnTo ? <Link to={entry.returnTo}>Return to {entry.origin === "calendar" ? "Calendar" : "Conversations"}</Link> : <span>Return address rejected</span>}</div>}
    <div className="ss-content" data-settings-tab={tab} data-tab-count={tabs.length}>{view}</div>
  </div>;
}
