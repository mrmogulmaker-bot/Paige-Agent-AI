import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  ArrowRight,
  CalendarDays,
  MessageSquare,
  RefreshCw,
  ShieldCheck,
  UserRound,
  UsersRound,
} from "lucide-react";
import { useTenantContext } from "@/hooks/useTenantContext";
import { RoleGate } from "@/components/auth/RoleGate";
import { useSubtabRoute } from "@/lib/routing/useSubtabRoute";
import type { RouteTierKey } from "@/lib/routing/tierBranches";
import {
  useTenantRelationshipsData,
  type RelationshipWorkspaceVariant,
} from "./useTenantRelationshipsData";
import {
  relationshipWorkspaceVariant,
  workspaceTabs,
  type WorkspaceTab,
} from "./workspaceModel";
import "./tenant-relationships-clients-workspace.css";

const CanonicalConversations = lazy(() => import("@/pages/admin/ClientsConversations"));
const CanonicalCalendar = lazy(() => import("@/pages/admin/CalendarAdmin"));
const PortalStudio = lazy(() => import("@/pages/admin/PortalStudio"));
const ContactPortalAccess = lazy(() => import("@/components/admin/contacts/ContactPortalPanel").then((module) => ({ default: module.ContactPortalPanel })));

function ProofPill({ children, tone = "partial" }: { children: string; tone?: "live" | "partial" | "unavailable" }) {
  return <span className="trc-proof" data-tone={tone}>{children}</span>;
}

function BoundedState({
  eyebrow,
  title,
  detail,
  kind,
  onRetry,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  kind: "loading" | "empty" | "error" | "partial" | "unavailable";
  onRetry?: () => void;
}) {
  const role = kind === "error" ? "alert" : "status";
  return (
    <section className="trc-state" data-state={kind} role={role}>
      <span>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{detail}</p>
      {onRetry && (
        <button type="button" onClick={onRetry}>
          <RefreshCw aria-hidden /> Retry
        </button>
      )}
    </section>
  );
}

function formatDate(value: string | null) {
  if (!value) return "No recorded touch";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recorded" : new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

export function TenantRelationshipsClientsWorkspace({
  routeTier,
  openPaige,
}: {
  routeTier: Extract<RouteTierKey, "agency" | "enterprise" | "solo" | "sub_account">;
  openPaige: () => void;
}) {
  const location = useLocation();
  const { activeTenantId, activeTenant, accountContextLoading, refresh } = useTenantContext();
  const variant = relationshipWorkspaceVariant(activeTenant?.account_type, activeTenant?.parent_tenant_id);
  const tabs = workspaceTabs(variant);
  const [routeTab, setRouteTab] = useSubtabRoute(routeTier, "clients", "people");
  const activeTab = tabs.some(({ id }) => id === routeTab) ? routeTab as WorkspaceTab : null;
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const data = useTenantRelationshipsData({ activeTenantId, variant });
  const calendarReturnAddress = location.pathname;

  useEffect(() => setSelectedContactId(null), [activeTenantId]);

  const onTabKeyDown = (index: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabs.length - 1
        : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    setRouteTab(tabs[next].id);
    tabRefs.current[next]?.focus();
  };

  if (accountContextLoading) {
    return <BoundedState eyebrow="Resolving account context" title="Loading this workspace" detail="No relationship data appears until the authenticated account is accepted." kind="loading" />;
  }

  if (!activeTenantId || !activeTenant) {
    return <BoundedState eyebrow="Account context required" title="We couldn't resolve this workspace" detail="Relationship data stays blocked until the authenticated account context is available." kind="error" onRetry={() => void refresh()} />;
  }

  const workspaceName = variant === "relationships" ? "Relationships" : "Clients";
  const proof = activeTab === null
    ? { label: "View · UNAVAILABLE", tone: "unavailable" as const }
    : activeTab === "segments"
    ? { label: "Segments · UNAVAILABLE", tone: "unavailable" as const }
    : activeTab === "people" && variant === "relationships"
      ? { label: "People · UNAVAILABLE", tone: "unavailable" as const }
      : { label: `${tabs.find(({ id }) => id === activeTab)?.label ?? workspaceName} · PARTIAL`, tone: "partial" as const };

  return (
    <section className="trc-workspace" data-relationship-workspace data-variant={variant}>
      <header className="trc-heading">
        <div>
          <span>{workspaceName} · {activeTenant.name}</span>
          <h1>{variant === "relationships" ? "The relationship book" : "Your client book"}</h1>
          <p>{variant === "relationships"
            ? "People and activity across the server-authorized book, with ownership intact."
            : "One trustworthy record for every client relationship this account serves."}</p>
        </div>
        <ProofPill tone={proof.tone}>{proof.label}</ProofPill>
      </header>

      <div className="trc-tabs" role="tablist" aria-label={`${workspaceName} views`}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(node) => { tabRefs.current[index] = node; }}
            id={`trc-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="trc-panel"
            tabIndex={activeTab === tab.id || (activeTab === null && index === 0) ? 0 : -1}
            onClick={() => setRouteTab(tab.id)}
            onKeyDown={(event) => onTabKeyDown(index, event)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id="trc-panel"
        className="trc-panel"
        role="tabpanel"
        aria-labelledby={activeTab ? `trc-tab-${activeTab}` : undefined}
        aria-label={activeTab ? undefined : "Unavailable relationship view"}
        tabIndex={0}
      >
        {activeTab === null && <BoundedState eyebrow="View · UNAVAILABLE" title="This view is not available in the active account context" detail="The address is preserved, but no different account capability is substituted in its place." kind="unavailable" />}
        {activeTab === "people" && (
          <PeopleView key={activeTenantId} variant={variant} data={data} openPaige={openPaige} selectedContactId={selectedContactId} onSelectContact={setSelectedContactId} />
        )}
        {activeTab === "conversations" && (
          <ConversationsView variant={variant} data={data} openPaige={openPaige} activeTenantId={activeTenantId} />
        )}
        {activeTab === "calendar" && <CalendarLens key={activeTenantId} activeTenantId={activeTenantId} returnAddress={calendarReturnAddress} />}
        {activeTab === "segments" && <SegmentsView />}
        {activeTab === "portal" && <PortalView key={activeTenantId} activeTenantId={activeTenantId} data={data} selectedContactId={selectedContactId} />}
      </div>
    </section>
  );
}

function PeopleView({ variant, data, openPaige, selectedContactId, onSelectContact }: { variant: RelationshipWorkspaceVariant; data: ReturnType<typeof useTenantRelationshipsData>; openPaige: () => void; selectedContactId: string | null; onSelectContact: (id: string) => void }) {
  const [search, setSearch] = useState("");
  const people = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return data.people;
    return data.people.filter((person) => [person.name, person.company, person.email, person.relationship, person.owner]
      .some((value) => value?.toLowerCase().includes(query)));
  }, [data.people, search]);
  const selected = people.find(({ id }) => id === selectedContactId) ?? null;
  if (!data.peopleAvailable) return <BoundedState eyebrow="People · UNAVAILABLE" title="Book-wide People are not connected" detail="The existing parent roster contains Sub-accounts, not people. A server-authorized parent People contract is required before this view can show records across the book." kind="unavailable" />;
  if (data.peopleLoading) return <BoundedState eyebrow="People · LIVE" title="Loading the authorized book" detail="The previous account is cleared while this account resolves." kind="loading" />;
  if (data.peopleError) return <BoundedState eyebrow="People · UNAVAILABLE" title="We couldn't load People" detail="No count or relationship state is inferred from a failed read." kind="error" onRetry={() => void data.retryPeople()} />;
  if (!data.people.length) return <BoundedState eyebrow="People · LIVE" title="No people here yet" detail="The active account returned no records. No sample contacts replace that result." kind="empty" />;
  return (
    <div className="trc-people-surface">
      <div className="trc-toolbar">
        <label><span className="sr-only">Search people</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search people, company, email…" /></label>
        <button type="button" disabled>Filters</button>
        <button type="button" disabled>Add person</button>
      </div>
      <div className="trc-people-grid">
      <section className="trc-card trc-table-card">
        <table>
          <thead><tr><th>Person</th><th>Relationship</th><th>Owner</th><th>Last touch</th></tr></thead>
          <tbody>{people.map((person) => (
            <tr key={person.id} data-selected={selected?.id === person.id ? "true" : "false"}>
              <td><button type="button" className="trc-person-select" aria-pressed={selected?.id === person.id} onClick={() => onSelectContact(person.id)}><strong>{person.name}</strong><small>{person.company || person.email || "Authorized contact"}</small></button></td>
              <td>{person.relationship}</td>
              <td>{person.owner}</td>
              <td>{formatDate(person.lastTouch)}</td>
            </tr>
          ))}</tbody>
        </table>
      </section>
      <aside className="trc-card trc-detail-card">
        <UserRound aria-hidden />
        <h2>{selected?.name ?? "Select a person"}</h2>
        <p>{selected ? `${selected.relationship} · ${selected.owner}` : "Choose an authorized record to inspect its relationship context."}</p>
        {selected?.email && <span>{selected.email}</span>}
        {selected?.company && <span>{selected.company}</span>}
        <button type="button" onClick={openPaige}>Ask PAIGE about this view</button>
      </aside>
      </div>
    </div>
  );
}

function ConversationsView({ variant, openPaige, activeTenantId }: { variant: RelationshipWorkspaceVariant; data: ReturnType<typeof useTenantRelationshipsData>; openPaige: () => void; activeTenantId: string }) {
  if (variant === "relationships") {
    return <BoundedState eyebrow="Conversations · UNAVAILABLE" title="Book-wide threads are not connected" detail="A parent-authorized aggregate is required before PAIGE can show conversations across Sub-accounts. No child inboxes are joined in the browser." kind="unavailable" />;
  }
  return (
    <div className="trc-conversations" data-canonical-conversations>
      <header><div><span>Clients · Conversations</span><h2>Client conversations</h2><p>The existing tenant inbox remains the one canonical thread, composer, and relationship surface.</p></div><button type="button" onClick={openPaige}>Draft with PAIGE</button></header>
      <Suspense fallback={<BoundedState eyebrow="Conversations · PARTIAL" title="Loading canonical Conversations" detail="Only the active account's RLS-authorized inbox is mounted." kind="loading" />}>
        <CanonicalConversations key={activeTenantId} />
      </Suspense>
    </div>
  );
}

function CalendarLens({ activeTenantId, returnAddress }: { activeTenantId: string; returnAddress: string }) {
  const [fullCalendarOpen, setFullCalendarOpen] = useState(false);
  return (
    <div className="trc-calendar-lens">
      <div className="trc-two-column">
      <BoundedState eyebrow="Calendar · PARTIAL" title="Relationship association is not yet provable" detail="The canonical Calendar is live, but its current booking contract does not carry a trusted relationship identifier. No events are matched by name or email." kind="partial" />
      <aside className="trc-card trc-detail-card">
        <CalendarDays aria-hidden />
        <h2>One Calendar, one source of truth</h2>
        <p>Create and edit work remains in the canonical Calendar. The active account tree is preserved when you open it.</p>
        <button type="button" onClick={() => setFullCalendarOpen((open) => !open)}>{fullCalendarOpen ? "Close full Calendar" : "Open full Calendar"} <ArrowRight aria-hidden /></button>
      </aside>
      </div>
      {fullCalendarOpen && (
        <div className="trc-canonical-mount" data-canonical-calendar data-return-address={returnAddress}>
          <Suspense fallback={<BoundedState eyebrow="Calendar · LIVE OWNER" title="Loading canonical Calendar" detail="The authenticated active account remains unchanged while the Calendar owner mounts." kind="loading" />}>
            <CanonicalCalendar key={activeTenantId} />
          </Suspense>
        </div>
      )}
    </div>
  );
}

function SegmentsView() {
  return (
    <div className="trc-two-column">
      <BoundedState eyebrow="Segments · UNAVAILABLE" title="Saved segment evaluation is not connected" detail="Definitions, allowlisted rules, membership evaluation, coverage, and counts require a server-authorized book-scoped contract." kind="unavailable" />
      <aside className="trc-card trc-detail-card">
        <UsersRound aria-hidden />
        <h2>Explicit parent scope</h2>
        <p>Segments will group People in the authorized book. They will not expose sales stages, campaign execution, or a browser-built cross-account rollup.</p>
      </aside>
    </div>
  );
}

function PortalView({ activeTenantId, data, selectedContactId }: { activeTenantId: string; data: ReturnType<typeof useTenantRelationshipsData>; selectedContactId: string | null }) {
  const [configurationOpen, setConfigurationOpen] = useState(false);
  const [accessOpen, setAccessOpen] = useState(false);
  const selectedContact = data.people.find(({ id }) => id === selectedContactId) ?? null;
  if (data.portalLoading) return <BoundedState eyebrow="Portal · PARTIAL" title="Loading Portal configuration" detail="The previous account's configuration is not reused while this account resolves." kind="loading" />;
  if (data.portalError) return <BoundedState eyebrow="Portal · UNAVAILABLE" title="We couldn't load Portal configuration" detail="Client access and configuration remain blocked until the scoped read succeeds." kind="error" onRetry={() => void data.retryPortal()} />;
  return (
    <section className="trc-portal">
      <header>
        <div><span>Clients · Portal</span><h2>One relationship. Two authorized views.</h2><p>Staff supervise the same client-visible objects without receiving a client session or exposing internal material.</p></div>
        <ProofPill>Configuration substrate · LIVE</ProofPill>
      </header>
      <div className="trc-audience">
        <section><small>Shared with client</small><strong>Approved messages, requests, decisions, progress, and deliverables</strong></section>
        <section><small>Internal team</small><strong>Private notes, supervision, and escalation controls</strong></section>
        <section><small>Restricted system evidence</small><strong>PAIGE reasoning, source evidence, and Trust configuration</strong></section>
      </div>
      <div className="trc-portal-actions">
        <article><ShieldCheck aria-hidden /><div><strong>Client-visible home</strong><span>{Object.keys(data.portalConfig).length ? "PARTIAL · scoped configuration loaded" : "PARTIAL · authorized default configuration"}</span></div></article>
        <article><MessageSquare aria-hidden /><div><strong>Portal conversation</strong><span>PARTIAL · canonical thread convergence is not complete.</span></div></article>
        <article><UserRound aria-hidden /><div><strong>Requests and action items</strong><span>UNAVAILABLE · no aggregate workflow contract is connected.</span></div></article>
        <article><ShieldCheck aria-hidden /><div><strong>Portal access</strong><span>PARTIAL · invite and access state remains on the selected client record.</span></div></article>
        <article><UserRound aria-hidden /><div><strong>Engagement progress</strong><span>UNAVAILABLE · the relationship progress contract is incomplete.</span></div></article>
        <article><ShieldCheck aria-hidden /><div><strong>Files and agreements</strong><span>PARTIAL · existing seams vary by authorized account.</span></div></article>
      </div>
      <div className="trc-integrity"><ShieldCheck aria-hidden /><p><strong>Preview is not impersonation.</strong> Client-facing projection never grants staff a client session.</p></div>
      <div className="trc-portal-links">
        <button type="button" onClick={() => setConfigurationOpen((open) => !open)}>{configurationOpen ? "Close Portal configuration" : "Open gated Portal configuration"}</button>
        {selectedContact ? (
          <button type="button" onClick={() => setAccessOpen((open) => !open)}>{accessOpen ? "Close selected client access" : "Open selected client access"}</button>
        ) : (
          <button type="button" disabled>Choose a client to manage access</button>
        )}
        <ProofPill tone="unavailable">Configuration remains owner/admin gated</ProofPill>
      </div>
      {configurationOpen && (
        <div className="trc-canonical-mount" data-portal-configuration>
          <RoleGate allow={["admin"]} fallback={<BoundedState eyebrow="Portal · PERMISSION LIMITED" title="Owner or admin access required" detail="Portal configuration remains behind its existing administrative gate." kind="unavailable" />}>
            <Suspense fallback={<BoundedState eyebrow="Portal · PARTIAL" title="Loading Portal configuration" detail="The existing PortalStudio owner is mounting for the active account." kind="loading" />}><PortalStudio key={activeTenantId} /></Suspense>
          </RoleGate>
        </div>
      )}
      {accessOpen && selectedContact && (
        <div className="trc-canonical-mount" data-contact-portal-access>
          <Suspense fallback={<BoundedState eyebrow="Portal access · PARTIAL" title="Loading selected client access" detail="No other contact is substituted while the selected record loads." kind="loading" />}>
            <ContactPortalAccess key={`${activeTenantId}:${selectedContact.id}`} contactId={selectedContact.id} email={selectedContact.email} linkedUserId={selectedContact.linkedUserId} />
          </Suspense>
        </div>
      )}
    </section>
  );
}
