import type { ReactNode } from "react";
import {
  Building2, Users, Package, MapPin, Network, ShieldCheck, ShieldOff,
  Globe, ExternalLink, Phone, Mail, Info, FileSearch, User,
} from "lucide-react";
import { SectionCard, StatePill, EmptyState, GlyphPlate } from "@/components/ui/page";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// UNIVERSAL BUSINESS / ENTITY INTELLIGENCE DOSSIER — renderer (§11, Section E).
//
// Mirrors the engine's `entity_profile` (paige-deep-research → Section B). Every
// fact here is either grounded (carries ≥1 citation resolving to a real cited
// source) or it renders the UNVERIFIED treatment — never a blank, never a
// guessed value (§13). A person with contact_status "not_public" shows name +
// title only; a guessed email is NEVER synthesised in the UI.
//
// GOLD DISCIPLINE (§11/§6): gold is reserved for act/approve/on. NOTHING in this
// dossier is gold — citation links focus on indigo --ring, reliability badges
// use semantic --success / --warning / neutral tokens, contact status uses
// --success / muted. This surface is read-only intel, so it never earns gold.
//
// UNIVERSAL / §2 / §9: this component carries zero vertical vocabulary. It is
// mounted by the funding surface (LenderResearch) AND is exported for any future
// universal research surface to mount unchanged.
// ---------------------------------------------------------------------------

export type EntityKind = "organization" | "person";
type ContactStatus = "verified" | "not_public";
type Confidence = "high" | "medium" | "low";
type SectionStatus = "verified" | "partial" | "not_found";

export interface DossierSource {
  index: number;
  url: string;
  title: string;
  tier?: string;
  reliability?: "high" | "medium" | "low";
  excluded?: boolean;
}

export interface ProfilePerson {
  name: string;
  name_citations: number[];
  title?: string;
  title_citations?: number[];
  contact?: {
    email?: string;
    email_citations?: number[];
    phone?: string;
    phone_citations?: number[];
    profile_url?: string;
    profile_url_citations?: number[];
  };
  division?: string;
  division_citations?: number[];
  contact_status: ContactStatus;
  confidence: Confidence;
  reliability_label: string;
  unverified_fields?: string[];
  email_flags?: string[];
}

export interface ProfileDivision {
  name: string;
  description?: string;
  citations: number[];
  status_note?: string;
}

export interface ProfileOffering {
  name: string;
  detail?: string;
  citations: number[];
}

export interface ProfileLocation {
  label?: string;
  address?: string;
  address_citations?: number[];
  locality?: string;
  locality_citations?: number[];
  phone?: string;
  phone_citations?: number[];
  site?: string;
  site_citations?: number[];
  citations: number[];
}

export interface ProfileSection<T> {
  status: SectionStatus;
  items: T[];
  note: string;
}

export interface EntityProfile {
  name: string;
  kind: EntityKind;
  summary: string;
  people: ProfileSection<ProfilePerson>;
  divisions: ProfileSection<ProfileDivision>;
  offerings: ProfileSection<ProfileOffering>;
  locations: ProfileSection<ProfileLocation>;
  unverified_notes: string[];
  headline: string;
  coverage: {
    people_found: number;
    people_with_verified_contact: number;
    divisions_found: number;
    locations_found: number;
  };
}

// --- helpers ---------------------------------------------------------------

function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function hrefOf(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
}

function resolveCites(
  citations: number[] | undefined,
  byIndex: Map<number, DossierSource>,
): DossierSource[] {
  return (citations ?? [])
    .map((i) => byIndex.get(i))
    .filter((s): s is DossierSource => !!s && !s.excluded);
}

// --- atoms -----------------------------------------------------------------

// The inline [n] citation chip — links to the exact grounding source. Focus
// ring is indigo --ring (never gold). Hover title carries source title + tier.
function CitationChip({ source }: { source: DossierSource }) {
  const tier = source.tier ? ` · ${source.tier}` : "";
  return (
    <a
      href={hrefOf(source.url)}
      target="_blank"
      rel="noopener noreferrer"
      title={`${source.title || hostOf(source.url)}${tier}`}
      className="inline-flex items-center gap-0.5 rounded-sm px-1 text-[11px] font-medium leading-tight text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
    >
      <span className="tracking-wide">[{source.index}]</span>
    </a>
  );
}

// E2: two states only. Grounded → the value + its [n] chips. Ungrounded /
// dropped → a muted label + a neutral "unverified" StatePill. Never blank,
// never a guessed value. `citations.length > 0` is asserted here.
function Fact({
  label,
  value,
  citations,
  byIndex,
  icon: Icon,
  unverifiedLabel,
  href,
}: {
  label: string;
  value?: string | null;
  citations?: number[];
  byIndex: Map<number, DossierSource>;
  icon?: typeof Info;
  unverifiedLabel: string;
  href?: string | null;
}) {
  const cited = resolveCites(citations, byIndex);
  const grounded = !!value && value.trim().length > 0 && cited.length > 0;

  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm">
      <span className="inline-flex items-center gap-1 font-medium text-foreground">
        {Icon && <Icon className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
        {label}:
      </span>
      {grounded ? (
        <>
          {href ? (
            <a
              href={hrefOf(href)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-sm text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            >
              {value}
              <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
            </a>
          ) : (
            <span className="text-foreground">{value}</span>
          )}
          <span className="inline-flex items-center">
            {cited.map((s) => (
              <CitationChip key={s.index} source={s} />
            ))}
          </span>
        </>
      ) : (
        <span className="inline-flex items-center gap-1.5">
          <span className="text-muted-foreground">{unverifiedLabel}</span>
          <StatePill state="off">Unverified</StatePill>
        </span>
      )}
    </div>
  );
}

// E3: reliability badge — semantic tokens only, never gold.
function ReliabilityBadge({
  confidence,
  label,
}: {
  confidence: Confidence;
  label: string;
}) {
  if (confidence === "high") {
    return (
      <StatePill state="success" icon={<ShieldCheck className="h-3 w-3" aria-hidden />}>
        {label}
      </StatePill>
    );
  }
  if (confidence === "medium") {
    return <StatePill state="warning">{label}</StatePill>;
  }
  return <StatePill state="off">{label}</StatePill>;
}

// contact_status pill: "verified" → --success, "not_public" → muted.
function ContactStatusBadge({ status }: { status: ContactStatus }) {
  return status === "verified" ? (
    <StatePill state="success" icon={<ShieldCheck className="h-3 w-3" aria-hidden />}>
      Contact verified
    </StatePill>
  ) : (
    <StatePill state="off" icon={<ShieldOff className="h-3 w-3" aria-hidden />}>
      Contact not public
    </StatePill>
  );
}

// --- person card -----------------------------------------------------------

function PersonRow({
  person,
  byIndex,
}: {
  person: ProfilePerson;
  byIndex: Map<number, DossierSource>;
}) {
  const nameCited = resolveCites(person.name_citations, byIndex);
  const hasContact = person.contact_status === "verified";

  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-card">
      {/* Header: name (links nowhere) + name citations + status */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <User className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
              {person.name}
            </span>
            <span className="inline-flex items-center">
              {nameCited.map((s) => (
                <CitationChip key={s.index} source={s} />
              ))}
            </span>
          </div>
          {/* Title — grounded or "Title not stated" */}
          <div className="mt-1">
            <Fact
              label="Title"
              value={person.title}
              citations={person.title_citations}
              byIndex={byIndex}
              unverifiedLabel="Title not stated"
            />
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <ContactStatusBadge status={person.contact_status} />
          <ReliabilityBadge confidence={person.confidence} label={person.reliability_label} />
        </div>
      </div>

      {/* Per-field contact facts — each carries its own [n], making the
          per-field citation model visible. not_public → NEVER a guessed email:
          the facts fall through to the muted unverified treatment. */}
      <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 border-t border-border/60 pt-3 sm:grid-cols-2">
        <Fact
          label="Email"
          value={person.contact?.email}
          citations={person.contact?.email_citations}
          byIndex={byIndex}
          icon={Mail}
          unverifiedLabel={hasContact ? "Not listed" : "Not public"}
          href={person.contact?.email ? `mailto:${person.contact.email}` : null}
        />
        <Fact
          label="Phone"
          value={person.contact?.phone}
          citations={person.contact?.phone_citations}
          byIndex={byIndex}
          icon={Phone}
          unverifiedLabel={hasContact ? "Not listed" : "Not public"}
        />
        <Fact
          label="Profile"
          value={person.contact?.profile_url ? hostOf(person.contact.profile_url) : undefined}
          citations={person.contact?.profile_url_citations}
          byIndex={byIndex}
          icon={Globe}
          unverifiedLabel="Not listed"
          href={person.contact?.profile_url}
        />
        <Fact
          label="Division"
          value={person.division}
          citations={person.division_citations}
          byIndex={byIndex}
          icon={Network}
          unverifiedLabel="Division not stated"
        />
      </div>

      {person.email_flags && person.email_flags.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          <Info className="mr-1 inline h-3 w-3" aria-hidden />
          {person.email_flags.includes("personal-domain")
            ? "Email is on a personal/free-mail domain — confirm it's current."
            : person.email_flags.join(", ")}
        </p>
      )}
    </div>
  );
}

// --- generic cited row (divisions / offerings) -----------------------------

function CitedRow({
  name,
  detail,
  note,
  citations,
  byIndex,
  icon: Icon,
}: {
  name: string;
  detail?: string;
  note?: string;
  citations: number[];
  byIndex: Map<number, DossierSource>;
  icon: typeof Info;
}) {
  const cited = resolveCites(citations, byIndex);
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-baseline gap-x-1.5">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {name}
        </span>
        <span className="inline-flex items-center">
          {cited.map((s) => (
            <CitationChip key={s.index} source={s} />
          ))}
        </span>
      </div>
      {detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}
      {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

// --- location row ----------------------------------------------------------

function LocationRow({
  location,
  byIndex,
}: {
  location: ProfileLocation;
  byIndex: Map<number, DossierSource>;
}) {
  return (
    <div className="rounded-[var(--radius)] border border-border bg-card p-4 shadow-card">
      {location.label && (
        <p className="mb-1 inline-flex items-center gap-1.5 font-medium text-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          {location.label}
        </p>
      )}
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
        <Fact
          label="Address"
          value={location.address}
          citations={location.address_citations}
          byIndex={byIndex}
          icon={MapPin}
          unverifiedLabel="Address not public"
        />
        <Fact
          label="City / region"
          value={location.locality}
          citations={location.locality_citations}
          byIndex={byIndex}
          unverifiedLabel="Not stated"
        />
        <Fact
          label="Phone"
          value={location.phone}
          citations={location.phone_citations}
          byIndex={byIndex}
          icon={Phone}
          unverifiedLabel="Not listed"
        />
        <Fact
          label="Site"
          value={location.site ? hostOf(location.site) : undefined}
          citations={location.site_citations}
          byIndex={byIndex}
          icon={Globe}
          unverifiedLabel="Not listed"
          href={location.site}
        />
      </div>
    </div>
  );
}

// --- section wrapper: renders items or crafted EmptyState (never a blank row)

function DossierSection<T>({
  title,
  icon,
  section,
  emptyIcon,
  children,
}: {
  title: string;
  icon: typeof Info;
  section: ProfileSection<T>;
  emptyIcon: typeof Info;
  children: (items: T[]) => ReactNode;
}) {
  const count = section.items?.length ?? 0;
  return (
    <SectionCard
      title={title}
      icon={icon}
      actions={
        count > 0 ? (
          <span className="text-xs font-medium text-muted-foreground">
            {count} {count === 1 ? "item" : "items"}
          </span>
        ) : undefined
      }
    >
      {count > 0 ? (
        <div className="grid gap-3">{children(section.items)}</div>
      ) : (
        <EmptyState
          icon={emptyIcon}
          title="Nothing verifiable here"
          description={section.note}
        />
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
// EntityDossier — the reusable, exported top-level renderer.
// ---------------------------------------------------------------------------

export function EntityDossier({
  profile,
  sources,
  className,
}: {
  profile: EntityProfile;
  sources: DossierSource[];
  className?: string;
}) {
  const byIndex = new Map<number, DossierSource>(sources.map((s) => [s.index, s]));
  const cov = profile.coverage;

  return (
    <div className={cn("space-y-4", className)}>
      {/* Masthead: kind glyph + name + headline + summary */}
      <SectionCard>
        <div className="flex items-start gap-3">
          <GlyphPlate icon={profile.kind === "person" ? User : Building2} size="md" />
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold leading-tight text-foreground">
              {profile.name}
            </h2>
            {profile.headline && (
              <p className="mt-1 text-sm font-medium text-foreground">{profile.headline}</p>
            )}
            {profile.summary && (
              <p className="mt-1.5 text-sm text-muted-foreground">{profile.summary}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span>
                <span className="font-semibold text-foreground">{cov.people_found}</span> people
                {" · "}
                <span className="font-semibold text-foreground">
                  {cov.people_with_verified_contact}
                </span>{" "}
                with verified contact
              </span>
              <span>
                <span className="font-semibold text-foreground">{cov.divisions_found}</span>{" "}
                divisions
              </span>
              <span>
                <span className="font-semibold text-foreground">{cov.locations_found}</span>{" "}
                locations
              </span>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Structure — divisions */}
      <DossierSection
        title="Structure"
        icon={Network}
        section={profile.divisions}
        emptyIcon={Network}
      >
        {(items) =>
          items.map((d, i) => (
            <CitedRow
              key={i}
              name={d.name}
              detail={d.description}
              note={d.status_note}
              citations={d.citations}
              byIndex={byIndex}
              icon={Network}
            />
          ))
        }
      </DossierSection>

      {/* People */}
      <DossierSection
        title="People"
        icon={Users}
        section={profile.people}
        emptyIcon={Users}
      >
        {(items) =>
          items.map((p, i) => <PersonRow key={i} person={p} byIndex={byIndex} />)
        }
      </DossierSection>

      {/* Offerings */}
      <DossierSection
        title="Offerings"
        icon={Package}
        section={profile.offerings}
        emptyIcon={Package}
      >
        {(items) =>
          items.map((o, i) => (
            <CitedRow
              key={i}
              name={o.name}
              detail={o.detail}
              citations={o.citations}
              byIndex={byIndex}
              icon={Package}
            />
          ))
        }
      </DossierSection>

      {/* Locations */}
      <DossierSection
        title="Locations"
        icon={MapPin}
        section={profile.locations}
        emptyIcon={MapPin}
      >
        {(items) =>
          items.map((l, i) => <LocationRow key={i} location={l} byIndex={byIndex} />)
        }
      </DossierSection>

      {/* E6: "What we couldn't verify" — absence as visible as presence */}
      {profile.unverified_notes.length > 0 && (
        <SectionCard title="What we couldn't verify" icon={FileSearch}>
          <ul className="space-y-2">
            {profile.unverified_notes.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* E5: standing, non-dismissable "verify before acting" footer */}
      <p className="rounded-[var(--radius)] border border-border/60 bg-muted/40 px-4 py-3 text-xs text-muted-foreground">
        Every name, number, and address here is quoted from a cited public source and linked to
        it. Details change — open the source and confirm before you contact anyone or act on a
        figure.
      </p>
    </div>
  );
}
