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
  primaryBusinessEmailProvenance: SetupFactProvenance;
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

const unavailableReason =
  "Unavailable until an authenticated source and evidence contract are implemented.";

function isApproved(provenance?: SetupFactProvenance) {
  return (
    provenance?.source === "owner_confirmed" &&
    provenance.confidence === "confirmed"
  );
}

function sourceLabel(provenance?: SetupFactProvenance) {
  if (isApproved(provenance)) return "Owner confirmed";
  if (provenance?.source === "connection_sourced")
    return "Connected record · owner review required";
  return "Needs owner confirmation";
}

function freshness(provenance?: SetupFactProvenance, fallback?: string) {
  if (!provenance?.confirmedAt) return fallback || "No verified check time";
  const date = new Date(provenance.confirmedAt);
  if (Number.isNaN(date.getTime())) return "Source time unavailable";
  return (
    sourceLabel(provenance) +
    " " +
    date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  );
}

function selectPublicIdentity(brief: SoloSetupBrief) {
  if (brief.publicName)
    return { value: brief.publicName, provenance: brief.provenance.publicName };
  if (brief.dbaName)
    return { value: brief.dbaName, provenance: brief.provenance.dbaName };
  return { value: brief.legalName, provenance: brief.provenance.legalName };
}

function Status({
  tone,
  children,
}: {
  tone: "ok" | "review" | "off";
  children: string;
}) {
  return (
    <span className="presence-status" data-tone={tone}>
      {children}
    </span>
  );
}

function UnavailableState({
  children,
  reason = unavailableReason,
}: {
  children: string;
  reason?: string;
}) {
  return (
    <span
      className="presence-unavailable"
      role="status"
      aria-label={children + ". " + reason}
    >
      <strong>{children}</strong>
      <small>{reason}</small>
    </span>
  );
}

function PublicFactsDrawer({
  brief,
  email,
  emailProvenance,
  onClose,
  onEdit,
}: {
  brief: SoloSetupBrief;
  email: string;
  emailProvenance: SetupFactProvenance;
  onClose: () => void;
  onEdit: () => void;
}) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const surface = dialog.current;
    const backdrop = surface?.closest(".presence-drawer-backdrop");
    const background = Array.from(document.body.children)
      .filter((node) => node !== backdrop)
      .map((node) => ({
        node: node as HTMLElement,
        ariaHidden: node.getAttribute("aria-hidden"),
        inert: (node as HTMLElement).inert,
      }));
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    background.forEach(({ node }) => {
      node.inert = true;
      node.setAttribute("aria-hidden", "true");
    });
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
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = priorOverflow;
      background.forEach(({ node, ariaHidden, inert }) => {
        node.inert = inert;
        if (ariaHidden === null) node.removeAttribute("aria-hidden");
        else node.setAttribute("aria-hidden", ariaHidden);
      });
    };
  }, [onClose]);

  const identity = selectPublicIdentity(brief);
  const address = brief.address
    ? { value: brief.address, provenance: brief.provenance.address }
    : {
        value: brief.serviceArea,
        provenance: brief.provenance.serviceArea,
      };
  const facts: Array<{
    label: string;
    value: string;
    provenance?: SetupFactProvenance;
    unavailable?: boolean;
  }> = [
    {
      label: "Public business name",
      value: identity.value,
      provenance: identity.provenance,
    },
    {
      label: "Website / domain",
      value: brief.website,
      provenance: brief.provenance.website,
    },
    {
      label: "Public phone",
      value: brief.phone,
      provenance: brief.provenance.phone,
    },
    {
      label: "Public email",
      value: email,
      provenance: emailProvenance,
    },
    {
      label: "Address or service area",
      value: address.value,
      provenance: address.provenance,
    },
    { label: "Hours", value: "", unavailable: true },
    {
      label: "Category",
      value: brief.industry,
      provenance: brief.provenance.industry,
    },
    {
      label: "Services / offers",
      value: brief.offers,
      provenance: brief.provenance.offers,
    },
    { label: "Public description", value: "", unavailable: true },
    { label: "Social and profile links", value: "", unavailable: true },
    { label: "Logo and public imagery", value: "", unavailable: true },
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
            <h2 id="presence-facts-title">
              Public facts available for review
            </h2>
            <p>
              Business Profile remains the edit home. Only owner-confirmed
              public facts are eligible for a future safe Paige handoff.
            </p>
          </div>
          <button type="button" className="presence-icon-button" aria-label="Close public facts" onClick={onClose}>
            <X aria-hidden />
          </button>
        </header>
        <div className="presence-fact-list">
          {facts.map((fact) => {
            const approved = isApproved(fact.provenance);
            return (
              <div key={fact.label} data-approved={approved}>
                <span>{fact.label}</span>
                <strong>
                  {fact.value ||
                    (fact.unavailable
                      ? "Not available in the canonical record"
                      : "Not yet confirmed")}
                </strong>
                <small>
                  {fact.provenance
                    ? "Source: " +
                      sourceLabel(fact.provenance) +
                      " · " +
                      freshness(fact.provenance)
                    : "Source: No canonical field or confirmed value"}
                </small>
                <small>
                  {approved
                    ? "Paige eligibility: reviewed public context"
                    : "Paige eligibility: excluded until owner confirmed"}
                  {" · Edit authority: Business Profile policy"}
                </small>
              </div>
            );
          })}
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
  primaryBusinessEmailProvenance,
  onReviewBusinessProfile,
}: SettingsPublicPresenceProps) {
  const [view, setView] = useState<PresenceView>("center");
  const [factsOpen, setFactsOpen] = useState(false);
  const factsOpener = useRef<HTMLButtonElement>(null);
  const identityFact = selectPublicIdentity(brief);
  const identity = identityFact.value;
  const identitySource = identityFact.provenance;
  const identityConfirmed = isApproved(identitySource);
  const phoneConfirmed = Boolean(brief.phone) && isApproved(brief.provenance.phone);
  const locationFact = brief.address
    ? { value: brief.address, provenance: brief.provenance.address }
    : {
        value: brief.serviceArea,
        provenance: brief.provenance.serviceArea,
      };
  const locationConfirmed = Boolean(locationFact.value) && isApproved(locationFact.provenance);
  const factsMissing = !identityConfirmed || !phoneConfirmed || !locationConfirmed;

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
          <UnavailableState reason="PAIGE handoff not connected">
            Ask PAIGE
          </UnavailableState>
          <button
            type="button"
            className="presence-button presence-button--primary"
            onClick={onReviewBusinessProfile}
          >
            Review public facts <ArrowRight aria-hidden />
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
                  <h3>
                    {factsMissing
                      ? "Confirm the public facts people should recognize"
                      : brief.website
                        ? "Website saved; public verification is unavailable"
                        : "Add the business website"}
                  </h3>
                  <p>
                    {factsMissing
                      ? "Public Presence reads the approved Business Profile record. Complete missing identity facts there before preparing outside corrections."
                      : brief.website
                        ? "Review the saved website now. Search and listing verification starts only after a supported authenticated source exists."
                        : "Add the canonical website in Business Profile before any future public-source check."}
                  </p>
                </div>
              </div>
              <div className="presence-actions">
                <button
                  type="button"
                  className="presence-button presence-button--primary"
                  onClick={onReviewBusinessProfile}
                >
                  {factsMissing
                    ? "Review Business Profile"
                    : brief.website
                      ? "Review saved website"
                      : "Add website in Business Profile"}{" "}
                  <ArrowRight aria-hidden />
                </button>
                <button ref={factsOpener} type="button" className="presence-button" onClick={() => setFactsOpen(true)}>Inspect public facts</button>
              </div>
            </article>
            <article className="presence-setup-flow">
              <span>PAIGE-CO-OWNED SETUP</span>
              <ol>
                {[
                  [
                    "Confirm canonical public business facts",
                    identityConfirmed
                      ? "Owner-confirmed identity on file"
                      : identity
                        ? "Owner confirmation required"
                        : "Missing facts",
                  ],
                  ["Verify the website and domain", brief.website ? "Website on file · verification unavailable" : "No website on file"],
                  ["Connect supported public venues", "No supported provider source"],
                  ["Compare venue facts to canonical facts", "Waiting for a verified venue source"],
                  ["Set bounded action authority", "Authority contract unavailable"],
                  ["Maintain verified results and exceptions", "Starts after verified provider evidence"],
                ].map(([label, detail], index) => (
                  <li key={label}>
                    <span>{index + 1}</span><div><strong>{label}</strong><small>{detail}</small></div>
                    <UnavailableState reason="PAIGE handoff not connected">
                      Continue with PAIGE
                    </UnavailableState>
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
                  <UnavailableState reason="Authenticated provider required">
                    Provider unavailable
                  </UnavailableState>
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
            <UnavailableState reason="Authenticated review source required">
              Review source unavailable
            </UnavailableState>
          </section>
        )}

        {view === "facts" && (
          <section className="presence-facts-preview">
            <div><span>PUBLIC FACTS</span><h3>One canonical record, coordinated outward</h3><p>Inspect canonical facts, confirmation status, and Paige eligibility without creating a second identity store.</p></div>
            <button ref={factsOpener} type="button" className="presence-button presence-button--primary" onClick={() => setFactsOpen(true)}>Inspect public facts <ExternalLink aria-hidden /></button>
          </section>
        )}
      </div>

      {factsOpen && (
        <PublicFactsDrawer
          brief={brief}
          email={primaryBusinessEmail}
          emailProvenance={primaryBusinessEmailProvenance}
          onClose={closeFacts}
          onEdit={() => { closeFacts(); onReviewBusinessProfile(); }}
        />
      )}
    </section>
  );
}
