import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  CircleHelp,
  Compass,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useSoloSetupBrief } from "./data/useSoloSetupBrief";
import {
  applySetupProposal,
  prepareOwnerConfirmedBrief,
  setupSourceLabel,
  validateSoloSetupBrief,
  type SoloSetupBrief,
  type SoloSetupTextField,
} from "./settings-setup-contract";
import "./settings-setup.css";

type SetupEditableTextField = SoloSetupTextField | "businessRegistrationNumber";

type FieldDefinition = {
  key: SetupEditableTextField;
  label: string;
  hint?: string;
  multiline?: boolean;
  options?: ReadonlyArray<{ value: string; label: string }>;
};

const identityFields: FieldDefinition[] = [
  { key: "legalName", label: "Legal business name" },
  { key: "publicName", label: "Public business name" },
  { key: "dbaName", label: "Doing business as" },
  { key: "website", label: "Business website", hint: "Use the actual business website, not the Paige workspace address." },
  { key: "address", label: "Business address", multiline: true },
  { key: "phone", label: "Primary business phone" },
  { key: "industry", label: "Industry" },
  { key: "naicsCode", label: "NAICS code", hint: "Optional. Enter only a code the owner has confirmed." },
  { key: "sicCode", label: "SIC code", hint: "Optional. Enter only a code the owner has confirmed." },
];

const carrierIdentityFields: FieldDefinition[] = [
  { key: "entityType", label: "Legal entity type", options: [
    { value: "", label: "Choose the legal entity type" },
    ...["Co-operative", "Corporation", "Limited Liability Corporation", "Non-profit Corporation", "Partnership"].map((value) => ({ value, label: value })),
  ] },
  { key: "stateOfFormation", label: "State of formation", hint: "Use the two-letter state abbreviation for a U.S. entity." },
  { key: "businessRegistrationIdentifier", label: "Registration identifier", hint: "For a U.S. entity or international tax ID, use EIN.", options: [
    ...["EIN", "DUNS", "CBN", "CN", "ACN", "CIN", "VAT", "VATRN", "RN"].map((value) => ({ value, label: value })),
    { value: "OTHER", label: "Other" },
  ] },
  { key: "businessRegistrationNumber", label: "EIN or tax registration number", hint: "Stored encrypted. Leave blank to keep the saved number." },
  { key: "regionsOfOperation", label: "Regions of operation", hint: "Use USA_AND_CANADA, AFRICA, ASIA, EUROPE, or LATIN_AMERICA. Separate multiple regions with commas." },
  { key: "registeredStreet", label: "Registered street address" },
  { key: "registeredStreetSecondary", label: "Suite or address line 2" },
  { key: "registeredCity", label: "Registered city" },
  { key: "registeredRegion", label: "State or province" },
  { key: "registeredPostalCode", label: "Postal code" },
  { key: "registeredIsoCountry", label: "Country code", hint: "Two-letter ISO country code, such as US." },
  { key: "authorizedRepresentativePhone", label: "Representative phone", hint: "Use E.164 format, such as +14045550123." },
  { key: "authorizedRepresentativeJobPosition", label: "Representative position", options: [
    { value: "", label: "Choose the representative position" },
    ...["Director", "GM", "VP", "CEO", "CFO", "General Counsel", "Other"].map((value) => ({ value, label: value })),
  ] },
];

const modelFields: FieldDefinition[] = [
  { key: "offers", label: "Offers and services", multiline: true },
  { key: "deliveryModel", label: "How the work is delivered", multiline: true },
  { key: "idealCustomer", label: "Ideal customer", multiline: true },
  { key: "customerSegments", label: "Customer segments", multiline: true },
  { key: "serviceArea", label: "Geography and service area", multiline: true },
];

const directionFields: FieldDefinition[] = [
  { key: "currentPriority", label: "Current priority", multiline: true },
  { key: "goals90Day", label: "90-day goals", multiline: true },
  { key: "annualDirection", label: "Annual direction", multiline: true },
  { key: "successDefinition", label: "What success means", multiline: true },
  { key: "constraints", label: "Constraints Paige should plan around", multiline: true },
];

const paigeFields: FieldDefinition[] = [
  { key: "brandVoice", label: "Brand voice", multiline: true },
  { key: "operatingPreferences", label: "Operating preferences", multiline: true },
  { key: "doNotAssume", label: "What Paige should not assume", multiline: true },
];

function SourceBadge({ source }: { source?: "owner_confirmed" | "connection_sourced" | "needs_confirmation" }) {
  const resolved = source ?? "needs_confirmation";
  return <span className="setup-source" data-source={resolved}>{setupSourceLabel(resolved)}</span>;
}

function ReadValue({ children }: { children?: string | null }) {
  return <span className={children ? "setup-read-value" : "setup-read-value setup-read-value--empty"}>{children || "Not provided"}</span>;
}

function Section({ id, eyebrow, title, description, children }: { id: string; eyebrow: string; title: string; description: string; children: ReactNode }) {
  return <section id={id} className="setup-section" aria-labelledby={`${id}-title`}>
    <header className="setup-section__head">
      <span>{eyebrow}</span>
      <h2 id={`${id}-title`}>{title}</h2>
      <p>{description}</p>
    </header>
    {children}
  </section>;
}

function BriefFields({ fields, draft, editing, errors, onChange }: {
  fields: FieldDefinition[];
  draft: SoloSetupBrief;
  editing: boolean;
  errors: Partial<Record<SetupEditableTextField | "authorizedRepresentativeUserId", string>>;
  onChange: (field: SetupEditableTextField, value: string) => void;
}) {
  return <div className="setup-fields">
    {fields.map((field) => <div className={field.multiline ? "setup-field setup-field--wide" : "setup-field"} key={field.key}>
      <div className="setup-field__label"><label htmlFor={`setup-${field.key}`}>{field.label}</label><SourceBadge source={draft.provenance[field.key]?.source}/></div>
      {editing ? field.multiline
        ? <textarea id={`setup-${field.key}`} name={field.key} value={draft[field.key]} onChange={(event) => onChange(field.key, event.target.value)} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `setup-${field.key}-error` : undefined}/>
        : field.options
          ? <select id={`setup-${field.key}`} name={field.key} value={draft[field.key]} onChange={(event) => onChange(field.key, event.target.value)} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `setup-${field.key}-error` : undefined}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          : <input id={`setup-${field.key}`} name={field.key} type={field.key === "businessRegistrationNumber" ? "password" : undefined} autoComplete={field.key === "businessRegistrationNumber" ? "off" : undefined} value={draft[field.key]} onChange={(event) => onChange(field.key, event.target.value)} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `setup-${field.key}-error` : undefined}/>
        : <ReadValue>{draft[field.key]}</ReadValue>}
      {field.hint && <small>{field.hint}</small>}
      {errors[field.key] && <small id={`setup-${field.key}-error`} className="setup-field__error">{errors[field.key]}</small>}
    </div>)}
  </div>;
}

export function SoloSetupView({ account }: { account: string }) {
  const data = useSoloSetupBrief();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.brief);
  const [errors, setErrors] = useState<Partial<Record<SetupEditableTextField | "authorizedRepresentativeUserId", string>>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const errorSummary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editing) setDraft(data.brief);
  }, [data.brief, editing]);

  const beginEdit = () => {
    setDraft(data.brief);
    setProposalId(null);
    setErrors({});
    setNotice(null);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(data.brief);
    setProposalId(null);
    setErrors({});
    setNotice(null);
    setEditing(false);
  };

  const change = (field: SetupEditableTextField, value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const toggleRepresentative = (event: ChangeEvent<HTMLInputElement>) => {
    const id = event.target.value;
    setDraft((current) => ({
      ...current,
      representativeUserIds: event.target.checked
        ? Array.from(new Set([...current.representativeUserIds, id]))
        : current.representativeUserIds.filter((value) => value !== id),
    }));
  };

  const save = async () => {
    const nextErrors = validateSoloSetupBrief(draft);
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      setNotice({ tone: "bad", text: "Fix the highlighted business brief details before saving." });
      queueMicrotask(() => errorSummary.current?.focus());
      return;
    }
    const confirmed = prepareOwnerConfirmedBrief(draft);
    const result = await data.save(confirmed, proposalId);
    if (!result.ok) {
      setNotice({ tone: "bad", text: result.error || "Your changes were not saved." });
      return;
    }
    setEditing(false);
    setProposalId(null);
    setNotice({ tone: "ok", text: "Business brief saved. Paige can now use the owner-confirmed context." });
  };

  const applyProposal = () => {
    if (!data.pendingProposal) return;
    setDraft(applySetupProposal(data.brief, data.pendingProposal));
    setProposalId(data.pendingProposal.id);
    setEditing(true);
    setNotice({ tone: "ok", text: "Paige's suggestion is in your draft. Review it, then save to confirm it." });
  };

  const dismissProposal = async () => {
    if (!data.pendingProposal) return;
    const result = await data.dismissProposal(data.pendingProposal.id);
    setNotice(result.ok
      ? { tone: "ok", text: "Paige's suggestion was dismissed. Your business brief did not change." }
      : { tone: "bad", text: result.error || "The suggestion could not be dismissed." });
  };

  if (data.loading) return <div className="setup-state" role="status"><RefreshCw aria-hidden/>Resolving this workspace’s business truth…</div>;
  if (data.error) return <div className="setup-state setup-state--error" role="alert"><CircleHelp aria-hidden/><span><strong>Couldn’t load this business brief</strong>{data.error}</span><button type="button" onClick={data.refresh}>Retry</button></div>;

  const selectedRepresentatives = data.representatives.filter((person) => draft.representativeUserIds.includes(person.id));
  const connectionsPath = account ? `/solo/${account}/settings/connections?segment=communications` : "/admin";

  return <div className="setup-brief">
    <div className="setup-intro">
      <div>
        <span className="setup-kicker">Owner-confirmed operating context</span>
        <h2>Your business brief</h2>
        <p>Keep the truth Paige should use when she plans, writes and helps operate this business. Setup owns the brief; Team owns people and access; Connections owns email and providers.</p>
      </div>
      <div className="setup-intro__actions">
        {editing ? <><button type="button" className="setup-button setup-button--quiet" onClick={cancel}>Cancel</button><button type="button" className="setup-button setup-button--primary" onClick={() => void save()} disabled={data.saving}>{data.saving ? "Saving…" : "Save changes"}</button></> : <button type="button" className="setup-button setup-button--primary" onClick={beginEdit} disabled={!data.canEdit}>Edit brief</button>}
      </div>
    </div>

    <div className="setup-source-legend" aria-label="Fact sources">
      <SourceBadge source="owner_confirmed"/><span>saved by an authorized owner or admin</span>
      <SourceBadge source="connection_sourced"/><span>read from a connected platform record</span>
      <SourceBadge source="needs_confirmation"/><span>missing or not yet confirmed by the owner</span>
    </div>

    {notice && <div ref={errorSummary} tabIndex={-1} className="setup-notice" data-tone={notice.tone} role={notice.tone === "bad" ? "alert" : "status"}>{notice.tone === "ok" ? <CheckCircle2 aria-hidden/> : <CircleHelp aria-hidden/>}{notice.text}</div>}

    {data.pendingProposal && !proposalId && <aside className="setup-proposal" aria-labelledby="setup-proposal-title">
      <Sparkles aria-hidden/>
      <div><span>Paige suggestion · not saved</span><h3 id="setup-proposal-title">Review a proposed brief update</h3><p>{data.pendingProposal.reason}</p><small>The proposal cannot change business truth until you review and save it.</small></div>
      <div><button type="button" className="setup-button setup-button--quiet" onClick={() => void dismissProposal()}>Dismiss</button><button type="button" className="setup-button setup-button--primary" onClick={applyProposal}>Review in draft</button></div>
    </aside>}

    <nav className="setup-jump" aria-label="Business brief sections">
      <a href="#business-identity">Identity</a><a href="#carrier-identity">Carrier identity</a><a href="#representation">Representation</a><a href="#business-model">Business model</a><a href="#direction">Direction</a><a href="#paige-brief">Paige brief</a><a href="#architecture">How Paige uses it</a>
    </nav>

    <Section id="business-identity" eyebrow="Business identity" title="The business Paige is representing" description="Record the names and contact details the owner can stand behind. Optional industry codes remain blank until the owner confirms them.">
      <BriefFields fields={identityFields} draft={draft} editing={editing} errors={errors} onChange={change}/>
    </Section>

    <Section id="carrier-identity" eyebrow="Carrier identity" title="The legal sender carriers will verify" description="These owner-confirmed facts feed the tenant's Secondary Customer Profile and Brand registration. They never inherit from the agency or Paige platform account.">
      <div className="setup-boundary"><ShieldCheck aria-hidden/><div><strong>Full registration numbers are sealed</strong><span>{draft.businessRegistrationNumberLast4 ? `A number ending in ${draft.businessRegistrationNumberLast4} is stored securely. Enter a new number only to replace it.` : "No EIN or tax registration number is stored yet."}</span></div></div>
      <BriefFields fields={carrierIdentityFields} draft={draft} editing={editing} errors={errors} onChange={change}/>
    </Section>

    <Section id="representation" eyebrow="Representation" title="Who represents this business" description="Designate the owners or executives Paige should understand as business representatives. Team remains the source of truth for people, invitations, access and roles.">
      <div className="setup-boundary"><Users aria-hidden/><div><strong>Team owns invitations, access and workspace roles</strong><span>Setup only selects from people already in Team. It does not create a second roster.</span></div></div>
      {editing ? <fieldset className="setup-people"><legend>Business representatives</legend>{data.representatives.map((person) => <label key={person.id}><input type="checkbox" value={person.id} checked={draft.representativeUserIds.includes(person.id)} disabled={person.status !== "Active"} onChange={toggleRepresentative}/><span><strong>{person.name}</strong><small>{person.role} · {person.status}{person.email ? ` · ${person.email}` : ""}</small></span></label>)}</fieldset>
        : <div className="setup-people setup-people--read"><h3>Business representatives <SourceBadge source={draft.provenance.representatives?.source}/></h3>{selectedRepresentatives.length ? selectedRepresentatives.map((person) => <div key={person.id}><span>{person.name}</span><small>{person.role}</small></div>) : <p>No business representative has been confirmed yet.</p>}</div>}
      <div className="setup-field setup-field--wide">
        <div className="setup-field__label"><label htmlFor="setup-authorized-representative">A2P authorized representative</label><SourceBadge source={draft.provenance.authorizedRepresentative?.source}/></div>
        {editing
          ? <select id="setup-authorized-representative" value={draft.authorizedRepresentativeUserId} onChange={(event) => {
              setDraft((current) => ({ ...current, authorizedRepresentativeUserId: event.target.value }));
              setErrors((current) => ({ ...current, authorizedRepresentativeUserId: undefined }));
            }} aria-invalid={Boolean(errors.authorizedRepresentativeUserId)}>
              <option value="">Choose a confirmed representative</option>
              {selectedRepresentatives.filter((person) => person.status === "Active").map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}
            </select>
          : <ReadValue>{selectedRepresentatives.find((person) => person.id === draft.authorizedRepresentativeUserId)?.name}</ReadValue>}
        {errors.authorizedRepresentativeUserId && <small className="setup-field__error">{errors.authorizedRepresentativeUserId}</small>}
        <small>Twilio may contact this person during vetting. The representative must remain an active Team member.</small>
      </div>
      <div className="setup-email-grid">
        <div><Mail aria-hidden/><span>Platform-assigned sending email</span><ReadValue>{data.managedSendingEmail}</ReadValue><SourceBadge source="connection_sourced"/></div>
        <div><Mail aria-hidden/><span>Primary business email</span><ReadValue>{data.primaryBusinessEmail}</ReadValue><SourceBadge source="connection_sourced"/></div>
      </div>
      <div className="setup-handoff"><div><strong>Connections owns email and provider configuration</strong><span>Setup shows the current records honestly; it does not duplicate email setup.</span></div><Link to={connectionsPath}>Open Connections <ArrowRight aria-hidden/></Link></div>
    </Section>

    <Section id="business-model" eyebrow="Business model and customers" title="What you sell and who it is for" description="Give Paige enough context to help without inventing an offer, audience or service area."><BriefFields fields={modelFields} draft={draft} editing={editing} errors={errors} onChange={change}/></Section>
    <Section id="direction" eyebrow="Direction and goals" title="What the business is working toward" description="Anchor Paige in the current priority, near-term goals, longer direction and real constraints."><BriefFields fields={directionFields} draft={draft} editing={editing} errors={errors} onChange={change}/></Section>
    <Section id="paige-brief" eyebrow="Paige brief" title="How Paige should operate for this business" description="Set the voice, working preferences and the boundaries Paige must not fill with assumptions."><BriefFields fields={paigeFields} draft={draft} editing={editing} errors={errors} onChange={change}/></Section>

    <Section id="architecture" eyebrow="Governed architecture" title="How Paige may use this brief" description="Setup supplies context. It does not silently grant action authority.">
      <div className="setup-architecture">
        <div><BriefcaseBusiness aria-hidden/><strong>Setup</strong><span>Stores owner-confirmed business truth.</span></div>
        <div><Sparkles aria-hidden/><strong>Mind may read</strong><span>Uses only saved facts and their source treatment.</span></div>
        <div><ShieldCheck aria-hidden/><strong>Trust Compass governs</strong><span>Existing action authority still controls what Paige may do.</span></div>
        <div><Compass aria-hidden/><strong>Rail records</strong><span>Owner saves, approved proposals and dismissals are attributable.</span></div>
      </div>
      <p className="setup-architecture__rule"><Check aria-hidden/>Paige may propose an update. The owner reviews and saves it before business truth changes.</p>
    </Section>
  </div>;
}
