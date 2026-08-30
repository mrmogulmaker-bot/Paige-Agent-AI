import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
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

const PROVIDERS = [
  ["Gmail", "OAuth mailbox", "PARTIAL"], ["Outlook", "OAuth mailbox", "UNAVAILABLE"],
  ["SMTP / Resend", "Outbound sending", "PARTIAL"], ["Twilio", "SMS, MMS & voice", "PARTIAL"],
  ["Vapi", "Voice", "UNAVAILABLE"], ["Meta IG / FB", "Business messaging", "PARTIAL"],
  ["Apple Messages for Business", "Business messaging", "PROPOSED"], ["WhatsApp / RCS", "Vocabulary only", "PROPOSED"],
  ["n8n", "Tenant automation seam", "PARTIAL"], ["Zapier / MCP", "Fragmented connection seams", "PARTIAL"],
  ["Direct APIs", "Permission-specific", "PARTIAL"], ["Make.com", "No connector seam", "UNAVAILABLE"],
] as const;


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

function ReadinessLadder({ r }: { r: CommsReadiness }) {
  const biz = r.business;
  const bizAll = biz.has_name && biz.has_website && biz.has_phone;
  const bizSome = biz.has_name || biz.has_website || biz.has_phone;
  const steps: Array<{ n: string; s: string; truth: SettingsTruth; tone: "ok" | "warn" | "bad" | "neutral"; state: string; detail: string }> = [
    { n: "Messaging account", s: "Your business's own account for texting",
      truth: STEP_TRUTH(r.subaccount === "connected"), tone: r.subaccount === "connected" ? "ok" : "bad",
      state: r.subaccount === "connected" ? "Connected" : r.subaccount === "inactive" ? "Not active" : "Not connected",
      detail: r.subaccount === "connected" ? "Ready." : "Nothing else can be arranged until this is in place." },
    { n: "Business details", s: "Legal name, website and business phone",
      truth: STEP_TRUTH(bizAll, bizSome), tone: bizAll ? "ok" : bizSome ? "warn" : "bad",
      state: bizAll ? "Complete" : bizSome ? "Partly filled in" : "Not provided",
      detail: bizAll ? "Everything carriers ask for is on file."
        : [!biz.has_name && "business name", !biz.has_website && "website", !biz.has_phone && "business phone"]
            .filter(Boolean).join(", ") + " still missing." },
    { n: "Phone number", s: "The number your texts send from",
      truth: STEP_TRUTH(r.number === "assigned"), tone: r.number === "assigned" ? "ok" : "bad",
      state: r.number === "assigned" ? "Assigned" : "None assigned",
      detail: r.number === "assigned" ? `${r.number_e164 ?? "On file"} — its record lists SMS capability.` : "No number on this business." },
    { n: "Business texting", s: "Carrier approval before any text can send",
      truth: r.a2p === "approved" ? "LIVE" : r.a2p === "absent" ? "UNAVAILABLE" : "PARTIAL",
      tone: r.a2p === "approved" ? "ok" : r.a2p === "absent" ? "bad" : "warn",
      state: r.a2p === "approved" ? "Approved" : r.a2p === "submitted" ? "Filed with carriers"
        : r.a2p === "prepared" ? "Prepared, not submitted" : "Not registered",
      detail: r.a2p === "approved" ? "Your business is approved to text."
        : r.a2p === "prepared" ? "Saved on your business. Nothing has been filed with any carrier yet."
        : r.a2p === "submitted" ? "Filed. Carriers have not returned a decision."
        : "Texting stays blocked until a registration is approved." },
    { n: "Consent and opt-outs", s: "Who agreed to hear from you, and who said stop",
      truth: r.consent.state === "ready" ? "LIVE" : "PARTIAL",
      tone: r.consent.state === "ready" ? "ok" : "warn",
      state: r.consent.state === "ready" ? `${r.consent.granted_count} agreed to texts` : "Nothing recorded",
      detail: r.consent.suppressed_count > 0
        ? `${r.consent.suppressed_count} ${r.consent.suppressed_count === 1 ? "person has" : "people have"} asked you to stop. PAIGE will not text them.`
        : r.consent.state === "ready" ? "Consent is on file." : "No consent or opt-out has been recorded yet." },
    { n: "Billing for messaging", s: "The plan messaging costs are billed against", ...billingStep(r.billing) },
    { n: "Sending identity", s: "What Conversations sends from",
      truth: STEP_TRUTH(r.can_send_sms), tone: r.can_send_sms ? "ok" : "warn",
      state: r.can_send_sms ? "Ready" : "Not ready for texting",
      detail: r.can_send_sms ? "Texts send from your own number." : "No permitted texting sender yet." },
    { n: "Delivery and replies", s: "Whether texts arrive and replies come back",
      truth: r.delivery.state === "no_activity" ? "UNAVAILABLE"
        : r.delivery.state === "delivering" ? "LIVE" : "PARTIAL",
      tone: r.delivery.state === "delivering" ? "ok"
        : r.delivery.state === "no_activity" ? "neutral" : "warn",
      state: r.delivery.state === "no_activity" ? "Nothing sent yet"
        : r.delivery.state === "awaiting_receipts" ? `${r.delivery.sent_30d} sent, none confirmed yet`
        : r.delivery.state === "delivering" ? `${r.delivery.delivered_30d} of ${r.delivery.sent_30d} delivered`
        : `${r.delivery.failed_30d} of ${r.delivery.sent_30d} did not arrive`,
      // Replies are NOT reported either way: nothing records an inbound text
      // against this account, so both "replies received" and "no replies
      // received" would be claims the data cannot support.
      detail: r.delivery.state === "no_activity"
        ? "Nothing has been sent in the last 30 days, so there is nothing to report."
        : r.delivery.state === "awaiting_receipts"
        ? "Sent, but no delivery confirmations have come back yet."
        : "Whether replies are arriving is not something we can report yet." },
  ];
  return <div className="ss-ladder">{steps.map((st, i) => (
    <div className="ss-step" data-tone={st.tone} key={st.n}>
      <span className="ss-step-idx">{i + 1}</span>
      <div className="ss-step-name"><strong>{st.n}</strong><span>{st.s}</span></div>
      <div className="ss-step-state"><em>{st.state}</em>{st.detail}</div>
      <Truth value={st.truth}/>
    </div>))}</div>;
}

function ConnectionsView() {
  const comms = useSoloComms();
  const identity = useManagedIdentity();
  const [view, setView] = useState<"connected" | "health" | "available">("connected");
  const identityStatus = identity.value?.default_email_status ?? null;
  const identityPresentation = getManagedIdentityPresentation({ identity: identity.value, loading: identity.loading, error: identity.error });
  const domainPresentation = getCustomDomainPresentation({ statuses: comms.domains.map((domain) => domain.status), loading: comms.loading, error: comms.error });
  const readiness = useCommsReadiness();
  return <>
    <div className="ss-segment" role="tablist" aria-label="Connection organization">{(["connected","health","available"] as const).map(key=><button key={key} role="tab" aria-selected={view===key} onClick={()=>setView(key)}>{key[0].toUpperCase()+key.slice(1)}</button>)}</div>
    {view === "connected" && <div className="ss-grid">
      <PhoneSetupPanel/>
      <Card title="PAIGE-managed sending identity" icon={Mail} truth={identityPresentation.capability} capabilityTruth actions={<Status tone={identityPresentation.tone}>{identityPresentation.accountLabel}</Status>}>
        <OrthogonalConnectionState {...identityPresentation}/>
        <ReadState loading={identity.loading} error={identity.error} retry={identity.retry}>{identity.value ? <div className="ss-fields"><Field label="Sender" value={identity.value.default_email_sender}/><Field label="Domain" value={identity.value.default_email_domain}/><Field label="Kind" value={identity.value.default_email_kind}/><Field label="Persisted status" value={identityStatus}/></div> : <p>No managed sending identity is configured for this account.</p>}</ReadState>
        <p className="ss-note">This is a managed outbound identity. It is not called a mailbox because inbound mailbox behavior is not proven.</p>
      </Card>
      <Card title="Custom sending domains" icon={Globe2} truth={domainPresentation.capability} capabilityTruth actions={<Status tone={domainPresentation.tone}>{domainPresentation.accountLabel}</Status>}>
        <OrthogonalConnectionState {...domainPresentation}/>
        <ReadState loading={comms.loading} error={comms.error} retry={comms.refresh}>{comms.domains.length ? <div className="ss-list">{comms.domains.map(domain=><div key={domain.id}><span><strong>{domain.domain}</strong><small>{domain.fromEmailLocal}@{domain.domain}</small></span><Status tone={domain.status === "verified" ? "ok" : "warn"}>{domain.status}</Status></div>)}</div> : <div className="ss-empty"><WifiOff/>No custom sending domain is reported.</div>}</ReadState>
      </Card>
      <Card title="Connected mailbox" icon={Mail} truth="UNAVAILABLE" capabilityTruth>
        <OrthogonalConnectionState accountLabel="Unavailable" healthLabel="Not measurable" tone="neutral"/>
        <p>No current Settings read proves a connected inbound Gmail or Outlook mailbox. OAuth setup must not be represented as connected until that contract exists.</p>
      </Card>
    </div>}
    {view === "health" && <div className="ss-grid">
      <Card title="Business texting readiness" icon={Webhook}
        truth={readiness.value ? (readiness.value.can_send_sms ? "LIVE" : "PARTIAL") : "PARTIAL"}
        actions={readiness.value && !readiness.value.can_send_sms
          ? <Status tone="warn">Texting is not ready yet</Status>
          : readiness.value ? <Status tone="ok">Ready to text</Status> : undefined}>
        {/* The ruled fallback, for EVERY not-ready path — including an RPC error.
            ReadState would otherwise print error.message verbatim, which for this
            resolver means a tenant reading "COMMS_READINESS_FORBIDDEN". */}
        <ReadState loading={readiness.loading} error={null} retry={readiness.retry}>
          {readiness.error ? (
            <div className="ss-next">
              <strong>Texting is not ready yet</strong>
              <p>We couldn&rsquo;t read this account&rsquo;s setup just now, so nothing below is being claimed about it. Try again in a moment.</p>
              <p><button type="button" className="ss-retry" onClick={readiness.retry}>Try again</button></p>
            </div>
          ) : readiness.value ? <>
            {!readiness.value.can_send_sms && readiness.value.blocked_reason && (
              <div className="ss-next">
                <strong>{(READINESS_COPY[readiness.value.blocked_reason] ?? { headline: "Texting is not ready yet" }).headline}</strong>
                <p>{(READINESS_COPY[readiness.value.blocked_reason] ?? { next: "Some setup is still outstanding." }).next}</p>
              </div>
            )}
            <ReadinessLadder r={readiness.value}/>
            <p className="ss-note">Each step reports what its own record says. A step that cannot be checked says so rather than assuming it passed.</p>
          </> : (
            <div className="ss-next">
              <strong>Texting is not ready yet</strong>
              <p>We don&rsquo;t have a setup to read for this account yet.</p>
            </div>
          )}
        </ReadState>
      </Card>
      <Card title="Failure states" icon={TriangleAlert} truth="PARTIAL"><div className="ss-state-list"><Status tone="warn">DNS pending</Status><Status tone="bad">DNS failure</Status><Status tone="bad">Token expired / revoked</Status><Status tone="bad">Webhook failure</Status><Status tone="warn">A2P pending</Status><Status tone="bad">A2P rejected</Status><Status tone="ok">A2P approved</Status><Status>Disconnected</Status></div><p className="ss-note">These are supported display states, not claims about this account.</p></Card>
    </div>}
    {view === "available" && <div className="ss-provider-grid">{PROVIDERS.map(([name,kind,truth])=><article key={name}><Smartphone/><div><strong>{name}</strong><span>{kind}</span></div><Truth value={truth}/></article>)}</div>}
  </>;
}

function PhoneSetupPanel() {
  const [searchAttempted, setSearchAttempted] = useState(false);
  return <section className="ss-card ss-phone-setup" aria-labelledby="ss-phone-title">
    <header>
      <span className="ss-card-icon"><Search aria-hidden/></span>
      <div className="ss-phone-heading">
        <h2 id="ss-phone-title" className="ss-phone-title">Business phone</h2>
        <p>Search available phone numbers</p>
      </div>
      <Truth value="PROPOSED"/>
    </header>
    <div className="ss-card-body">
      <p className="ss-phone-contract">Choose a locality and the capabilities you need. Live availability, pricing, purchase, assignment, and messaging registration are not connected in this Settings contract.</p>
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
  const tabs=[['setup','Setup'],['team','Team'],['connections','Connections'],['notifications','Notifications'],['security-data','Security & data'],['vault','Vault'],['billing','Billing']];
  const location = useLocation();
  const params = useParams();
  const account = params.account ?? "";
  const entry = useMemo(() => resolveSoloSettingsEntry(location.search, account), [location.search, account]);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const scrollOwner = rootRef.current?.closest<HTMLElement>("#tenant-shell-main");
    scrollOwner?.classList.add("tcs-main--settings-scrollbar-hidden");
    return () => scrollOwner?.classList.remove("tcs-main--settings-scrollbar-hidden");
  }, []);
  const current = SOLO_SETTINGS_DESTINATIONS.find(item => item.key === tab) ?? SOLO_SETTINGS_DESTINATIONS[0];
  const view = tab === "team" ? <TeamView/> : tab === "connections" ? <ConnectionsView/> : tab === "notifications" ? <NotificationsView/> : tab === "security-data" ? <SecurityView/> : tab === "vault" ? <VaultView/> : tab === "billing" ? <BillingView/> : <SetupView/>;
  return <div ref={rootRef} className="solo-settings">
    <header className="ss-page-head"><div><span>Solo settings</span><h1>{current.label}</h1><p>{current.key === "connections" ? "Provider, identity, and readiness truth in one owned home." : "Account configuration with honest runtime boundaries."}</p></div><Truth value={current.truth}/></header>
    {entry && <div className="ss-return"><span>Opened from {entry.origin === "calendar" ? "Calendar" : "Conversations"}</span>{entry.returnTo ? <Link to={entry.returnTo}>Return to {entry.origin === "calendar" ? "Calendar" : "Conversations"}</Link> : <span>Return address rejected</span>}</div>}
    <div className="ss-content" data-settings-tab={tab} data-tab-count={tabs.length}>{view}</div>
  </div>;
}
