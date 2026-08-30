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

const PROVIDERS = [
  ["Gmail", "OAuth mailbox", "PARTIAL"], ["Outlook", "OAuth mailbox", "UNAVAILABLE"],
  ["SMTP / Resend", "Outbound sending", "PARTIAL"], ["Twilio", "SMS, MMS & voice", "PARTIAL"],
  ["Vapi", "Voice", "UNAVAILABLE"], ["Meta IG / FB", "Business messaging", "PARTIAL"],
  ["Apple Messages for Business", "Business messaging", "PROPOSED"], ["WhatsApp / RCS", "Vocabulary only", "PROPOSED"],
  ["n8n", "Tenant automation seam", "PARTIAL"], ["Zapier / MCP", "Fragmented connection seams", "PARTIAL"],
  ["Direct APIs", "Permission-specific", "PARTIAL"], ["Make.com", "No connector seam", "UNAVAILABLE"],
] as const;

function ConnectionsView() {
  const comms = useSoloComms();
  const identity = useManagedIdentity();
  // The owner-locked Connections shape: Communications owns whether a message can
  // send, Calendars owns scheduling configuration, Health reports readiness, and
  // Available stays the provider catalogue. "Connected" was this surface's older
  // name for Communications — same content, named for what it actually holds.
  const [view, setView] = useState<"communications" | "calendars" | "health" | "available">("communications");
  const identityStatus = identity.value?.default_email_status ?? null;
  const identityPresentation = getManagedIdentityPresentation({ identity: identity.value, loading: identity.loading, error: identity.error });
  const domainPresentation = getCustomDomainPresentation({ statuses: comms.domains.map((domain) => domain.status), loading: comms.loading, error: comms.error });
  const sendReady = identityPresentation.accountState === "active";
  return <>
    <div className="ss-segment" role="tablist" aria-label="Connection organization">{(["communications","calendars","health","available"] as const).map(key=><button key={key} role="tab" aria-selected={view===key} onClick={()=>setView(key)}>{key[0].toUpperCase()+key.slice(1)}</button>)}</div>
    {view === "calendars" && <CalendarsView/>}
    {view === "communications" && <div className="ss-grid">
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
      <Card title="Provider readiness" icon={Webhook} truth="PARTIAL"><div className="ss-readiness">{[
        ["Provider connected","Not reported"], ["Identity / number assigned", identity.value?.default_email_sender ? "Email identity assigned" : "Not reported"], ["SMS ready","Not reported"], ["Voice ready","Not reported"], ["A2P approved","Not reported"], ["Send permitted",sendReady ? "Email outbound ready" : "Not proven"], ["Webhook health","Not reported"],
      ].map(([label,value])=><div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></Card>
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
    <header className="ss-page-head"><div><span>Solo settings</span><h1>{current.label}</h1><p>{current.key === "connections" ? "Communications owns whether a message can send. Calendars owns scheduling, links, routing and notification rules." : "Account configuration with honest runtime boundaries."}</p></div><Truth value={current.truth}/></header>
    {entry && <div className="ss-return"><span>Opened from {entry.origin === "calendar" ? "Calendar" : "Conversations"}</span>{entry.returnTo ? <Link to={entry.returnTo}>Return to {entry.origin === "calendar" ? "Calendar" : "Conversations"}</Link> : <span>Return address rejected</span>}</div>}
    <div className="ss-content" data-settings-tab={tab} data-tab-count={tabs.length}>{view}</div>
  </div>;
}
