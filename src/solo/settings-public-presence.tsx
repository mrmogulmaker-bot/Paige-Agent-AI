import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  ExternalLink,
  Globe2,
  MapPin,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import type { SetupFactProvenance, SoloSetupBrief } from "./settings-setup-contract";
import "./settings-public-presence.css";

type PresenceView =
  | "center"
  | "profiles"
  | "website"
  | "reviews"
  | "facts";

type SettingsPublicPresenceProps = {
  brief: SoloSetupBrief;
  primaryBusinessEmail: string;
  onReviewBusinessProfile: () => void;
};

const views: Array<{ id: PresenceView; label: string }> = [
  { id: "center", label: "Presence Center" },
  { id: "profiles", label: "Profiles & Listings" },
  { id: "website", label: "Website & Search" },
  { id: "reviews", label: "Reviews & Reputation" },
  { id: "facts", label: "Public Facts" },
];

const venues = [
  ["Google Business Profile", "Search and Maps business venue"],
  ["Apple Business Connect", "Apple Maps business venue"],
  ["Bing Places", "Bing search and maps venue"],
  ["Facebook", "Public business profile"],
  ["LinkedIn", "Public company profile"],
  ["Yelp", "Public directory and reputation venue"],
  ["Directory networks", "411-style and industry directories"],
] as const;

const unavailableTitle =
  "Unavailable until an authenticated provider connection and evidence contract are implemented.";

function freshness(provenance?: SetupFactProvenance, fallback?: string) {
  if (!provenance?.confirmedAt) return fallback || "No verified check time";
  const date = new Date(provenance.confirmedAt);
  if (Number.isNaN(date.getTime())) return "Saved record · time unavailable";
  return `Owner confirmed ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}`;
}

function Status({ tone, children }: { tone: "ok" | "review" | "off"; children: string }) {
  return (
    <span className="presence-status" data-tone={tone}>
      {children}
    </span>
  );
}

function UnavailableButton({ children }: { children: string }) {
  return (
    <button className="presence-button" type="button" disabled title={unavailableTitle}>
      {children}
    </button>
  );
}

function PublicFactsDrawer({
  brief,
  email,
  onClose,
  onEdit,
}: {
  brief: SoloSetupBrief;
  email: string;
  onClose: () => void;
  onEdit: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const surface = dialog.current;
    const focusable = () =>
      Array.from(
        surface?.querySelectorAll<HTMLElement>("button:not(:disabled),a[href]") ?? [],
      );
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const facts = [
    ["Public business name", brief.publicName || brief.dbaName || brief.legalName],
    ["Website / domain", brief.website],
    ["Public phone", brief.phone],
    ["Public email", email],
    ["Address or service area", brief.address || brief.serviceArea],
    ["Hours", "Not available in the canonical record"],
    ["Category", brief.industry],
    ["Services / offers", brief.offers],
    ["Public description", "Not available in the canonical record"],
    ["Social and profile links", "Not available in the canonical record"],
    ["Logo and public imagery", "Not available in the canonical record"],
  ];

  return createPortal(
    <div className="presence-drawer-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside
        ref={dialog}
        className="presence-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="presence-facts-title"
      >
        <header>
          <div>
            <span>PUBLIC FACTS · READ ONLY</span>
            <h2 id="presence-facts-title">Approved facts Paige may use publicly</h2>
            <p>Business Profile remains the edit home. This inspector coordinates outward use without forking identity.</p>
          </div>
          <button type="button" className="presence-icon-button" aria-label="Close public facts" onClick={onClose}>
            <X aria-hidden />
          </button>
        </header>
        <div className="presence-fact-list">
          {facts.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value || "Not yet confirmed"}</strong>
              <small>Source: Business Profile · Edit authority: owner or authorized representative</small>
            </div>
          ))}
        </div>
        <footer>
          <button type="button" className="presence-button" onClick={onClose}>Close inspector</button>
          <button type="button" className="presence-button presence-button--primary" onClick={onEdit}>
            Review Business Profile <ArrowRight aria-hidden />
          </button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}

export function SettingsPublicPresence({
  brief,
  primaryBusinessEmail,
  onReviewBusinessProfile,
}: SettingsPublicPresenceProps) {
  const [view, setView] = useState<PresenceView>("center");
  const [factsOpen, setFactsOpen] = useState(false);
  const factsOpener = useRef<HTMLButtonElement>(null);
  const identity = brief.publicName || brief.dbaName || brief.legalName;
  const identitySource = brief.provenance.publicName;
  const identityConfirmed =
    identitySource?.source === "owner_confirmed" &&
    identitySource.confidence === "confirmed";
  const factsMissing = !identityConfirmed || !brief.phone || !(brief.address || brief.serviceArea);

  const pulse = useMemo<Array<{ label: string; status: string; tone: "ok" | "review" | "off"; source: string; checked: string }>>(
    () => [
      {
        label: "Business identity",
        status: identityConfirmed && !factsMissing ? "On file" : "Needs review",
        tone: identityConfirmed && !factsMissing ? "ok" : "review",
        source: identityConfirmed
          ? "Business Profile · owner confirmed"
          : identity
            ? "Business Profile · confirmation required"
            : "Business Profile · missing facts",
        checked: freshness(identitySource, "No owner-confirmed check time"),
      },
      {
        label: "Website discoverability",
        status: brief.website ? "Needs review" : "Not connected",
        tone: brief.website ? "review" : "off",
        source: brief.website ? "Business Profile URL · no search source" : "No website on file",
        checked: brief.website ? "Discoverability not checked" : "No verified check time",
      },
      ...["Maps and listings", "Directory coverage", "Reputation"].map((label) => ({
        label,
        status: "Unavailable",
        tone: "off" as const,
        source: "No supported provider source",
        checked: "No verified check time",
      })),
    ],
    [brief.website, factsMissing, identity, identityConfirmed, identitySource],
  );

  const closeFacts = () => {
    setFactsOpen(false);
    queueMicrotask(() => factsOpener.current?.focus());
  };
  const chooseView = (next: PresenceView) => setView(next);

  return (
    <section className="presence-workspace" aria-labelledby="presence-title">
      <header className="presence-heading">
        <div>
          <span>SETUP · PUBLIC PRESENCE</span>
          <h2 id="presence-title">Be found. Be recognized. Be trusted.</h2>
          <p>See which approved business facts are ready for public use, what outside sources can actually verify, and the next honest move.</p>
        </div>
        <div className="presence-heading__actions">
          <UnavailableButton>Ask PAIGE</UnavailableButton>
          <button type="button" className="presence-button presence-button--primary" onClick={onReviewBusinessProfile}>
            Improve public presence <ArrowRight aria-hidden />
          </button>
        </div>
      </header>

      <div className="presence-pulse" aria-label="Presence Pulse">
        {pulse.map((item) => (
          <article key={item.label}>
            <div><span>{item.label}</span><Status tone={item.tone}>{item.status}</Status></div>
            <strong>{item.source}</strong>
            <small>{item.checked}</small>
          </article>
        ))}
      </div>

      <div className="presence-view-tabs" role="tablist" aria-label="Public Presence views">
        {views.map((item, index) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`presence-view-${item.id}`}
            aria-controls={`presence-panel-${item.id}`}
            aria-selected={view === item.id}
            tabIndex={view === item.id ? 0 : -1}
            onClick={() => chooseView(item.id)}
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? 0 : event.key === "End" ? views.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + views.length) % views.length;
              chooseView(views[next].id);
              queueMicrotask(() => document.getElementById(`presence-view-${views[next].id}`)?.focus());
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="presence-panel" role="tabpanel" id={`presence-panel-${view}`} aria-labelledby={`presence-view-${view}`}>
        {view === "center" && (
          <div className="presence-center">
            <article className="presence-next">
              <span>NEXT BEST ACTION</span>
              <div>
                <Globe2 aria-hidden />
                <div>
                  <h3>{factsMissing ? "Confirm the public facts people should recognize" : brief.website ? "Verify where the website appears publicly" : "Add the business website"}</h3>
                  <p>{factsMissing ? "Public Presence reads the approved Business Profile record. Complete missing identity facts there before preparing outside corrections." : "Search and listing checks stay unavailable until a supported, authenticated source is connected."}</p>
                </div>
              </div>
              <div className="presence-actions">
                <button type="button" className="presence-button presence-button--primary" onClick={onReviewBusinessProfile}>Review Business Profile <ArrowRight aria-hidden /></button>
                <button ref={factsOpener} type="button" className="presence-button" onClick={() => setFactsOpen(true)}>Inspect public facts</button>
              </div>
            </article>
            <article className="presence-setup-flow">
              <span>PAIGE-CO-OWNED SETUP</span>
              <ol>
                {[
                  ["Confirm canonical public business facts", identity ? "Ready to review" : "Missing facts"],
                  ["Verify the website and domain", brief.website ? "Website on file · verification unavailable" : "No website on file"],
                  ["Connect supported public venues", "No supported provider source"],
                  ["Compare venue facts to canonical facts", "Waiting for a verified venue source"],
                  ["Set bounded action authority", "Authority contract unavailable"],
                  ["Maintain verified results and exceptions", "Starts after verified provider evidence"],
                ].map(([label, detail], index) => (
                  <li key={label}>
                    <span>{index + 1}</span><div><strong>{label}</strong><small>{detail}</small></div>
                    <UnavailableButton>Continue with PAIGE</UnavailableButton>
                  </li>
                ))}
              </ol>
              <p className="presence-truth-note"><ShieldCheck aria-hidden /> Paige context handoff is not connected on this surface yet. No private documents, credentials, tokens, or unreviewed uploads are exposed.</p>
            </article>
          </div>
        )}

        {view === "profiles" && (
          <section className="presence-venue-list">
            <header><div><span>PROFILES & LISTINGS</span><h3>Public venues with evidence, not assumptions</h3></div><p>Connection setup stays in Integrations. Public Presence will coordinate fact consistency after a supported source exists.</p></header>
            {venues.map(([name, description]) => (
              <details key={name}>
                <summary><div><MapPin aria-hidden /><span><strong>{name}</strong><small>{description}</small></span></div><Status tone="off">Unavailable</Status></summary>
                <div className="presence-venue-detail">
                  <p>No authenticated source is available for this venue, so public facts and state are not asserted here.</p>
                  <div><span>Source</span><strong>No supported provider source</strong><span>Last checked</span><strong>No verified check time</strong></div>
                  <UnavailableButton>Provider unavailable</UnavailableButton>
                </div>
              </details>
            ))}
          </section>
        )}

        {view === "website" && (
          <section className="presence-readiness">
            <header><span>WEBSITE & SEARCH</span><h3>Business-readable readiness</h3><p>A website on file is not proof of indexing, search performance, or metadata quality.</p></header>
            {[
              ["Website / domain", brief.website || "No website on file", brief.website ? "Needs review" : "Not connected"],
              ["Search and indexing source", "No supported search source", "Unavailable"],
              ["Sitemap and indexability", "Not checked", "Unavailable"],
              ["Business schema and public metadata", "Not checked", "Unavailable"],
              ["Contact, services, about, locations and booking pages", "Not checked", "Unavailable"],
            ].map(([label, detail, status]) => (
              <div key={label}><Search aria-hidden /><span><strong>{label}</strong><small>{detail}</small></span><Status tone={status === "Needs review" ? "review" : "off"}>{status}</Status></div>
            ))}
          </section>
        )}

        {view === "reviews" && (
          <section className="presence-empty-state">
            <ShieldCheck aria-hidden />
            <h3>No connected review source</h3>
            <p>Review queues and response work appear only after a source proves them. Paige cannot draft or send a response from this surface yet.</p>
            <UnavailableButton>Review source unavailable</UnavailableButton>
          </section>
        )}

        {view === "facts" && (
          <section className="presence-facts-preview">
            <div><span>PUBLIC FACTS</span><h3>One canonical record, coordinated outward</h3><p>Inspect approved facts and their edit authority without creating a second identity store.</p></div>
            <button ref={factsOpener} type="button" className="presence-button presence-button--primary" onClick={() => setFactsOpen(true)}>Inspect public facts <ExternalLink aria-hidden /></button>
          </section>
        )}
      </div>

      {factsOpen && (
        <PublicFactsDrawer
          brief={brief}
          email={primaryBusinessEmail}
          onClose={closeFacts}
          onEdit={() => { closeFacts(); onReviewBusinessProfile(); }}
        />
      )}
    </section>
  );
}
