import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useConfirm } from "@/hooks/useConfirm";
import { registerAccountSwitchGuard } from "@/lib/auth/accountSwitchGuard";
import { PaigeBriefPanel, type PaigeBriefValues } from "./PaigeBriefPanel";
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
  Trash2,
  Users,
} from "lucide-react";
import { useSoloSetupBrief } from "./data/useSoloSetupBrief";
import {
  applySetupProposal,
  cleanSoloBusinessOwners,
  prepareOwnerConfirmedBrief,
  setupSourceLabel,
  validateSoloBusinessOwners,
  validateSoloSetupBrief,
  type SetupSourceDecision,
  type SoloBusinessOwner,
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
    ...["Individual / sole proprietor", "Co-operative", "Corporation", "Limited Liability Company", "Non-profit Corporation", "Partnership", "Trust", "Other legal person"].map((value) => ({ value, label: value })),
  ] },
  { key: "stateOfFormation", label: "Formation jurisdiction", hint: "State, province, territory, or country where the entity was formed." },
  { key: "businessRegistrationIdentifier", label: "Registration identifier", hint: "Choose the identifier actually used in the entity's jurisdiction.", options: [
    { value: "", label: "No identifier selected" },
    ...["EIN", "DUNS", "CBN", "CN", "ACN", "CIN", "VAT", "VATRN", "RN"].map((value) => ({ value, label: value })),
    { value: "OTHER", label: "Other" },
  ] },
  { key: "businessRegistrationNumber", label: "Tax or registration number", hint: "Stored encrypted. Leave blank to keep the saved number." },
  { key: "regionsOfOperation", label: "Regions of operation", hint: "Use USA_AND_CANADA, AFRICA, ASIA, EUROPE, or LATIN_AMERICA. Separate multiple regions with commas." },
  { key: "registeredStreet", label: "Registered street address" },
  { key: "registeredStreetSecondary", label: "Suite or address line 2" },
  { key: "registeredCity", label: "Registered city" },
  { key: "registeredRegion", label: "State, province, territory, or region" },
  { key: "registeredPostalCode", label: "Postal code" },
  { key: "registeredIsoCountry", label: "Country code", hint: "Two-letter ISO country code, such as US, CA, GB, or FR." },
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

const adminOperationalFields = new Set<SoloSetupTextField>([
  "offers", "deliveryModel", "idealCustomer", "customerSegments", "serviceArea",
  "currentPriority", "goals90Day", "annualDirection", "successDefinition", "constraints",
  "brandVoice", "operatingPreferences", "doNotAssume",
]);

function SourceBadge({ source }: { source?: "owner_confirmed" | "connection_sourced" | "needs_confirmation" }) {
  const resolved = source ?? "needs_confirmation";
  return <span className="setup-source" data-source={resolved}>{setupSourceLabel(resolved)}</span>;
}

type OwnerFactField = "ownerKind" | "legalName" | "displayName" | "ownershipInterest" | "effectiveDate" | "status" | "representativeUserId";
function OwnerFieldLabel({ owner, field, htmlFor, children }: { owner: SoloBusinessOwner; field: OwnerFactField; htmlFor: string; children: ReactNode }) {
  return <div className="setup-field__label"><label htmlFor={htmlFor}>{children}</label><SourceBadge source={owner.provenance?.[field]?.source}/></div>;
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

function BriefFields({ fields, draft, editing, errors, onChange, disabled = false, sourceDecisions = {}, onSourceDecision }: {
  fields: FieldDefinition[];
  draft: SoloSetupBrief;
  editing: boolean;
  errors: Partial<Record<SetupEditableTextField | "authorizedRepresentativeUserId", string>>;
  onChange: (field: SetupEditableTextField, value: string) => void;
  disabled?: boolean;
  sourceDecisions?: Partial<Record<SoloSetupTextField, SetupSourceDecision>>;
  onSourceDecision?: (field: SoloSetupTextField, decision: SetupSourceDecision) => void;
}) {
  return <div className="setup-fields">
    {fields.map((field) => <div className={field.multiline ? "setup-field setup-field--wide" : "setup-field"} key={field.key}>
      <div className="setup-field__label"><label htmlFor={`setup-${field.key}`}>{field.label}</label><SourceBadge source={draft.provenance[field.key]?.source}/></div>
      {editing && !disabled ? field.multiline
        ? <textarea id={`setup-${field.key}`} name={field.key} value={draft[field.key]} onChange={(event) => onChange(field.key, event.target.value)} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `setup-${field.key}-error` : undefined}/>
        : field.options
          ? <select id={`setup-${field.key}`} name={field.key} value={draft[field.key]} onChange={(event) => onChange(field.key, event.target.value)} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `setup-${field.key}-error` : undefined}>{field.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
          : <input id={`setup-${field.key}`} name={field.key} type={field.key === "businessRegistrationNumber" ? "password" : undefined} autoComplete={field.key === "businessRegistrationNumber" ? "off" : undefined} value={draft[field.key]} onChange={(event) => onChange(field.key, event.target.value)} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `setup-${field.key}-error` : undefined}/>
        : <ReadValue>{field.key === "businessRegistrationNumber" ? (draft.businessRegistrationNumberLast4 ? `Stored securely · ending in ${draft.businessRegistrationNumberLast4}` : null) : draft[field.key]}</ReadValue>}
      {editing && !disabled && field.key !== "businessRegistrationNumber" && draft.provenance[field.key]?.source === "connection_sourced" && <div className="setup-source-actions">
        <span>Connected fact: keep it connected, adopt it as owner-confirmed, or explicitly override it.</span>
        <button type="button" onClick={() => onSourceDecision?.(field.key as SoloSetupTextField, "adopt")}>Adopt stored value</button>
        <button type="button" onClick={() => onSourceDecision?.(field.key as SoloSetupTextField, "override")}>Override</button>
        {sourceDecisions[field.key as SoloSetupTextField] && <strong>{sourceDecisions[field.key as SoloSetupTextField] === "adopt" ? "Will adopt on save" : "Override authorized"}</strong>}
      </div>}
      {field.hint && <small>{field.hint}</small>}
      {errors[field.key] && <small id={`setup-${field.key}-error`} className="setup-field__error">{errors[field.key]}</small>}
    </div>)}
  </div>;
}

export function SoloSetupView({ account }: { account: string }) {
  const data = useSoloSetupBrief();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const persistedOwnersKey = JSON.stringify(data.businessOwners ?? []);
  const persistedOwners = useMemo(
    () => cleanSoloBusinessOwners(JSON.parse(persistedOwnersKey) as unknown),
    [persistedOwnersKey],
  );
  const accessScope = data.accessScope ?? (data.canEdit ? "owner_full" : "read_only");
  const canEditLegal = data.canEditLegal ?? data.canEdit;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(data.brief);
  const [businessOwners, setBusinessOwners] = useState<SoloBusinessOwner[]>(persistedOwners);
  const [ownerErrors, setOwnerErrors] = useState<Record<string, string>>({});
  const [sourceDecisions, setSourceDecisions] = useState<Partial<Record<SoloSetupTextField, SetupSourceDecision>>>({});
  const [errors, setErrors] = useState<Partial<Record<SetupEditableTextField | "authorizedRepresentativeUserId", string>>>({});
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [saveRecovery, setSaveRecovery] = useState<"failed" | "conflict" | "stale" | null>(null);
  const [proposalId, setProposalId] = useState<string | null>(null);
  const [paigeDrawerDirty, setPaigeDrawerDirty] = useState(false);
  const previousTenant = useRef(data.activeTenantId);
  const errorSummary = useRef<HTMLDivElement>(null);
  const dirty = JSON.stringify(draft) !== JSON.stringify(data.brief)
    || JSON.stringify(businessOwners) !== JSON.stringify(persistedOwners)
    || Object.keys(sourceDecisions).length > 0;
  const hasUnsavedSetup = (editing && dirty) || paigeDrawerDirty;

  useEffect(() => {
    if (!hasUnsavedSetup && !data.saving) return;
    return registerAccountSwitchGuard(async ({ toTenantName }) => {
      if (data.saving) {
        setNotice({ tone: "bad", text: "Wait for this save to finish before switching accounts. The current write cannot be safely discarded." });
        return false;
      }
      return confirm({
        title: "Discard Setup changes and switch accounts?",
        description: `Your unsaved Setup changes in this account will be discarded before opening ${toTenantName}.`,
        actionLabel: "Discard and switch",
        cancelLabel: "Stay here",
        destructive: true,
      });
    });
  }, [confirm, data.saving, hasUnsavedSetup]);

  useEffect(() => {
    if (!editing) {
      setDraft(data.brief);
      setBusinessOwners(persistedOwners);
    }
  }, [data.brief, persistedOwners, editing]);

  useEffect(() => {
    if (previousTenant.current && previousTenant.current !== data.activeTenantId && editing) {
      setEditing(false);
      setProposalId(null);
      setSourceDecisions({});
      setErrors({});
      setOwnerErrors({});
      setPaigeDrawerDirty(false);
      setNotice({ tone: "bad", text: "The active account changed. The prior account's unsaved draft was discarded and no stale save result was applied." });
    }
    previousTenant.current = data.activeTenantId;
  }, [data.activeTenantId, editing]);

  const beginEdit = () => {
    setDraft(data.brief);
    setBusinessOwners(persistedOwners);
    setSourceDecisions({});
    setProposalId(null);
    setErrors({});
    setNotice(null);
    setEditing(true);
  };

  const cancel = async () => {
    if (data.saving) {
      setNotice({ tone: "bad", text: "Wait for this save to finish before cancelling. The current write cannot be safely discarded." });
      return;
    }
    if (dirty && !await confirm({
      title: "Discard unsaved Setup changes?",
      description: "The saved workspace record will remain unchanged.",
      actionLabel: "Discard changes",
      cancelLabel: "Keep editing",
      destructive: true,
    })) return;
    setDraft(data.brief);
    setBusinessOwners(persistedOwners);
    setSourceDecisions({});
    setProposalId(null);
    setErrors({});
    setNotice(null);
    setEditing(false);
  };

  const change = (field: SetupEditableTextField, value: string) => {
    if (field !== "businessRegistrationNumber" && draft.provenance[field]?.source === "connection_sourced" && sourceDecisions[field] !== "override") {
      return;
    }
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const setSourceDecision = (field: SoloSetupTextField, decision: SetupSourceDecision) => {
    if (decision === "adopt") setDraft((current) => ({ ...current, [field]: data.brief[field] }));
    setSourceDecisions((current) => ({ ...current, [field]: decision }));
  };

  const addBusinessOwner = () => {
    setBusinessOwners((current) => [...current, {
      id: "",
      ownerKind: "individual",
      legalName: "",
      displayName: "",
      ownershipInterest: "",
      effectiveDate: "",
      status: "active",
      representativeUserId: "",
    }]);
  };

  const updateBusinessOwner = (index: number, patch: Partial<SoloBusinessOwner>) => {
    setBusinessOwners((current) => current.map((owner, ownerIndex) => {
      if (ownerIndex !== index) return owner;
      if (patch.sourceDecision === "adopt") {
        const stored = persistedOwners.find((candidate) => candidate.id && candidate.id === owner.id);
        return stored ? { ...stored, sourceDecision: "adopt" } : { ...owner, sourceDecision: "adopt" };
      }
      const connected = Object.values(owner.provenance ?? {}).some((fact) => fact?.source === "connection_sourced");
      if (connected && owner.sourceDecision !== "override" && !patch.sourceDecision) return owner;
      return { ...owner, ...patch };
    }));
    setOwnerErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`${index}.`))));
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
    const allErrors = validateSoloSetupBrief(draft, Boolean(data.brief.legalName.trim()));
    const nextErrors = accessScope === "admin_operational"
      ? Object.fromEntries(Object.entries(allErrors).filter(([field]) => adminOperationalFields.has(field as SoloSetupTextField)))
      : allErrors;
    const nextOwnerErrors = canEditLegal ? validateSoloBusinessOwners(businessOwners) : {};
    if (Object.keys(nextErrors).length || Object.keys(nextOwnerErrors).length) {
      setErrors(nextErrors);
      setOwnerErrors(nextOwnerErrors);
      setNotice({ tone: "bad", text: "Fix the highlighted business brief details before saving." });
      queueMicrotask(() => errorSummary.current?.focus());
      return;
    }
    const confirmed = prepareOwnerConfirmedBrief(draft, new Date().toISOString(), data.brief, sourceDecisions);
    const result = await data.save(confirmed, businessOwners, proposalId);
    if (result.ok === false) {
      setSaveRecovery(result.kind);
      setNotice({ tone: "bad", text: result.error || "Your changes were not saved." });
      return;
    }
    setEditing(false);
    setProposalId(null);
    setSourceDecisions({});
    setSaveRecovery(null);
    setNotice({ tone: "ok", text: "Saved and verified from the durable workspace record. PAIGE, Mind, Spine, and Rail consumption remain unverified until their separate runtime paths are proven." });
  };

  const applyProposal = () => {
    if (!data.pendingProposal || accessScope !== "owner_full" || !data.canEdit) return;
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

  const applyPaigeBriefDraft = (values: PaigeBriefValues) => {
    const fields = ["brandVoice", "operatingPreferences", "doNotAssume"] as const;
    const blocked = fields.filter((field) => draft.provenance[field]?.source === "connection_sourced" && sourceDecisions[field] !== "override");
    setDraft((current) => {
      const next = { ...current };
      fields.forEach((field) => {
        if (blocked.includes(field)) return;
        next[field] = values[field];
      });
      return next;
    });
    setErrors((current) => ({ ...current, brandVoice: undefined, operatingPreferences: undefined, doNotAssume: undefined }));
    setEditing(true);
    setPaigeDrawerDirty(false);
    setNotice(blocked.length
      ? { tone: "bad", text: "The editable Paige Brief fields were added to your Setup draft. A connection-sourced field was preserved; explicitly choose Override before changing it." }
      : { tone: "ok", text: "Paige Brief added to your Setup draft. Save changes to make it durable." });
  };

  const confirmPaigeBriefDiscard = () => confirm({
    title: "Discard this unfinished Paige Brief?",
    description: "The saved workspace record and the main Setup draft will remain unchanged.",
    actionLabel: "Discard draft",
    cancelLabel: "Keep working",
    destructive: true,
  });

  if (data.loading) return <div className="setup-state" role="status"><RefreshCw aria-hidden/>Resolving this workspace’s business truth…</div>;
  if (data.error) return <div className="setup-state setup-state--error" role="alert"><CircleHelp aria-hidden/><span><strong>Couldn’t load this business brief</strong>{data.error}</span><button type="button" onClick={data.refresh}>Retry</button></div>;

  const selectedRepresentatives = data.representatives.filter((person) => draft.representativeUserIds.includes(person.id));
  const representativesUnavailable = data.representativesLoading || Boolean(data.representativesError);
  const connectionsPath = account ? `/solo/${account}/settings/connections?segment=communications` : "/choose-account";

  return <div className="setup-brief" aria-busy={data.saving}>
    {confirmDialog}
    <div className="setup-intro">
      <div>
        <span className="setup-kicker">Owner-confirmed operating context</span>
        <h2>Your business brief</h2>
        <p>Keep the truth Paige should use when she plans, writes and helps operate this business. Setup owns the brief; Team owns people and access; Connections owns email and providers.</p>
      </div>
      <div className="setup-intro__actions">
        {editing ? <><button type="button" className="setup-button setup-button--quiet" onClick={() => void cancel()} disabled={data.saving}>Cancel</button><button type="button" className="setup-button setup-button--primary" onClick={() => void save()} disabled={data.saving}>{data.saving ? "Saving…" : "Save changes"}</button></> : <button type="button" className="setup-button setup-button--primary" onClick={beginEdit} disabled={!data.canEdit}>Edit brief</button>}
      </div>
    </div>

    {accessScope === "read_only" && <div className="setup-notice" data-tone="bad" role="status"><ShieldCheck aria-hidden/>This account is read-only for Setup. Workspace Owners may edit all facts; verified Admins may edit only the operational brief.</div>}
    {accessScope === "admin_operational" && <div className="setup-notice" role="status"><ShieldCheck aria-hidden/>Admin edit is limited to business model, direction, and PAIGE operating context. Legal identity, representation, and business ownership remain Owner-only.</div>}

    <div className="setup-source-legend" aria-label="Fact sources">
      <SourceBadge source="owner_confirmed"/><span>saved by an authorized owner or admin</span>
      <SourceBadge source="connection_sourced"/><span>read from a connected platform record</span>
      <SourceBadge source="needs_confirmation"/><span>missing or not yet confirmed by the owner</span>
    </div>

    {notice && <div ref={errorSummary} tabIndex={-1} className="setup-notice" data-tone={notice.tone} role={notice.tone === "bad" ? "alert" : "status"}>{notice.tone === "ok" ? <CheckCircle2 aria-hidden/> : <CircleHelp aria-hidden/>}<span>{notice.text}{saveRecovery && <span className="setup-recovery-actions">{saveRecovery !== "conflict" && <button type="button" onClick={() => void save()} disabled={data.saving}>Retry save</button>}{saveRecovery === "conflict" && <button type="button" onClick={() => { setEditing(false); setSaveRecovery(null); data.refresh(); }}>Load stored version</button>}<button type="button" onClick={() => setSaveRecovery(null)}>Review my draft</button></span>}</span></div>}

    {data.pendingProposal && !proposalId && accessScope === "owner_full" && data.canEdit && <aside className="setup-proposal" aria-labelledby="setup-proposal-title">
      <Sparkles aria-hidden/>
      <div><span>Paige suggestion · not saved</span><h3 id="setup-proposal-title">Review a proposed brief update</h3><p>{data.pendingProposal.reason}</p><small>The proposal cannot change business truth until you review and save it.</small></div>
      <div><button type="button" className="setup-button setup-button--quiet" onClick={() => void dismissProposal()}>Dismiss</button><button type="button" className="setup-button setup-button--primary" onClick={applyProposal}>Review in draft</button></div>
    </aside>}

    <nav className="setup-jump" aria-label="Business brief sections">
      <a href="#business-identity">Identity</a><a href="#carrier-identity">Carrier identity</a><a href="#representation">Representation</a><a href="#business-model">Business model</a><a href="#direction">Direction</a><a href="#paige-brief">Paige brief</a><a href="#architecture">How Paige uses it</a>
    </nav>

    <Section id="business-identity" eyebrow="Business identity" title="The business Paige is representing" description="Record the names and contact details the owner can stand behind. Optional industry codes remain blank until the owner confirms them.">
      <BriefFields fields={identityFields} draft={draft} editing={editing} disabled={!canEditLegal || data.saving} errors={errors} onChange={change} sourceDecisions={sourceDecisions} onSourceDecision={setSourceDecision}/>
    </Section>

    <Section id="carrier-identity" eyebrow="Carrier identity" title="The legal sender carriers will verify" description="These owner-confirmed facts feed the tenant's Secondary Customer Profile and Brand registration. They never inherit from the agency or Paige platform account.">
      <div className="setup-boundary"><ShieldCheck aria-hidden/><div><strong>Full registration numbers are sealed</strong><span>{draft.businessRegistrationNumberLast4 ? `A number ending in ${draft.businessRegistrationNumberLast4} is stored securely. Enter a new number only to replace it.` : "No EIN or tax registration number is stored yet."}</span></div></div>
      <BriefFields fields={carrierIdentityFields} draft={draft} editing={editing} disabled={!canEditLegal || data.saving} errors={errors} onChange={change} sourceDecisions={sourceDecisions} onSourceDecision={setSourceDecision}/>
    </Section>

    <Section id="representation" eyebrow="Representation" title="Who represents this business" description="Designate the owners or executives Paige should understand as business representatives. Team remains the source of truth for people, invitations, access and roles.">
      <div className="setup-boundary"><Users aria-hidden/><div><strong>Team owns invitations, access and workspace roles</strong><span>Setup only selects from people already in Team. It does not create a second roster.</span></div></div>
      {data.representativesError && <div className="setup-notice" data-tone="bad" role="status"><CircleHelp aria-hidden/>The active Team roster could not be loaded, so representative changes are unavailable. The rest of Setup remains readable.</div>}
      {editing && canEditLegal && !representativesUnavailable ? <fieldset className="setup-people" disabled={data.saving}><legend>Business representatives</legend>{data.representatives.map((person) => <label key={person.id}><input type="checkbox" value={person.id} checked={draft.representativeUserIds.includes(person.id)} disabled={person.status !== "Active"} onChange={toggleRepresentative}/><span><strong>{person.name}</strong><small>{person.role} · {person.status}{person.email ? ` · ${person.email}` : ""}</small></span></label>)}</fieldset>
        : <div className="setup-people setup-people--read"><h3>Business representatives <SourceBadge source={draft.provenance.representatives?.source}/></h3>{selectedRepresentatives.length ? selectedRepresentatives.map((person) => <div key={person.id}><span>{person.name}</span><small>{person.role}</small></div>) : <p>No business representative has been confirmed yet.</p>}</div>}
      <div className="setup-field setup-field--wide">
        <div className="setup-field__label"><label htmlFor="setup-authorized-representative">A2P authorized representative</label><SourceBadge source={draft.provenance.authorizedRepresentative?.source}/></div>
        {editing && canEditLegal && !representativesUnavailable
          ? <select id="setup-authorized-representative" disabled={data.saving} value={draft.authorizedRepresentativeUserId} onChange={(event) => {
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
      <div className="setup-ownership">
        <div className="setup-ownership__head">
          <div><h3>Business ownership</h3><p>Business ownership facts are separate from Team access and do not prove that percentages total 100%.</p></div>
          {editing && canEditLegal && <button type="button" className="setup-button setup-button--quiet" onClick={addBusinessOwner} disabled={data.saving}>Add business owner</button>}
        </div>
        {businessOwners.every((owner) => owner.deleteRequested) ? <p className="setup-ownership__empty">No business ownership record has been confirmed.</p> : businessOwners.map((owner, index) => owner.deleteRequested ? null : <div className="setup-owner-card" key={owner.id || `new-${index}`}>
          {editing && canEditLegal ? <fieldset className="setup-owner-card__fields" disabled={data.saving}>
            {Object.values(owner.provenance ?? {}).some((fact) => fact?.source === "connection_sourced") && <div className="setup-field setup-field--wide"><div className="setup-source-actions"><span>Adopt the connected record unchanged, or explicitly override it before editing.</span><button type="button" onClick={() => updateBusinessOwner(index, { sourceDecision: "adopt" })}>Adopt</button><button type="button" onClick={() => updateBusinessOwner(index, { sourceDecision: "override" })}>Override</button></div></div>}
            <div className="setup-field"><OwnerFieldLabel owner={owner} field="ownerKind" htmlFor={`setup-owner-kind-${index}`}>Owner type</OwnerFieldLabel><select id={`setup-owner-kind-${index}`} value={owner.ownerKind} onChange={(event) => updateBusinessOwner(index, { ownerKind: event.target.value as SoloBusinessOwner["ownerKind"] })}><option value="individual">Individual</option><option value="company">Corporation or company</option><option value="trust">Trust</option><option value="other_legal_person">Other legal person</option></select></div>
            <div className="setup-field"><OwnerFieldLabel owner={owner} field="legalName" htmlFor={`setup-owner-legal-${index}`}>Legal name</OwnerFieldLabel><input id={`setup-owner-legal-${index}`} value={owner.legalName} onChange={(event) => updateBusinessOwner(index, { legalName: event.target.value })} aria-invalid={Boolean(ownerErrors[`${index}.legalName`])}/>{ownerErrors[`${index}.legalName`] && <small className="setup-field__error">{ownerErrors[`${index}.legalName`]}</small>}</div>
            <div className="setup-field"><OwnerFieldLabel owner={owner} field="displayName" htmlFor={`setup-owner-display-${index}`}>Display name</OwnerFieldLabel><input id={`setup-owner-display-${index}`} value={owner.displayName} onChange={(event) => updateBusinessOwner(index, { displayName: event.target.value })}/></div>
            <div className="setup-field"><OwnerFieldLabel owner={owner} field="ownershipInterest" htmlFor={`setup-owner-interest-${index}`}>Ownership interest (optional)</OwnerFieldLabel><input id={`setup-owner-interest-${index}`} inputMode="decimal" value={owner.ownershipInterest} onChange={(event) => updateBusinessOwner(index, { ownershipInterest: event.target.value })} aria-invalid={Boolean(ownerErrors[`${index}.ownershipInterest`])}/>{ownerErrors[`${index}.ownershipInterest`] && <small className="setup-field__error">{ownerErrors[`${index}.ownershipInterest`]}</small>}</div>
            <div className="setup-field"><OwnerFieldLabel owner={owner} field="effectiveDate" htmlFor={`setup-owner-date-${index}`}>Effective date (optional)</OwnerFieldLabel><input id={`setup-owner-date-${index}`} type="date" value={owner.effectiveDate} onChange={(event) => updateBusinessOwner(index, { effectiveDate: event.target.value })}/></div>
            <div className="setup-field"><OwnerFieldLabel owner={owner} field="status" htmlFor={`setup-owner-status-${index}`}>Ownership status</OwnerFieldLabel><select id={`setup-owner-status-${index}`} value={owner.status} onChange={(event) => updateBusinessOwner(index, { status: event.target.value as SoloBusinessOwner["status"] })}><option value="active">Active</option><option value="former">Former</option><option value="pending">Pending</option><option value="other">Other</option></select></div>
            <div className="setup-field setup-field--wide"><OwnerFieldLabel owner={owner} field="representativeUserId" htmlFor={`setup-owner-rep-${index}`}>Designated human representative</OwnerFieldLabel><select id={`setup-owner-rep-${index}`} disabled={representativesUnavailable} value={owner.representativeUserId} onChange={(event) => updateBusinessOwner(index, { representativeUserId: event.target.value })}><option value="">None selected</option>{data.representatives.map((person) => <option key={person.id} value={person.id}>{person.name} · {person.role}</option>)}</select><small>Selections come only from active Team people. This does not grant or transfer workspace authority.</small></div>
            <button type="button" className="setup-owner-card__remove" onClick={() => setBusinessOwners((current) => current.map((candidate, ownerIndex) => ownerIndex !== index ? candidate : Object.values(candidate.provenance ?? {}).some((fact) => fact?.source === "connection_sourced") ? { ...candidate, sourceDecision: "override" as const, deleteRequested: true } : candidate).filter((candidate, ownerIndex) => ownerIndex !== index || candidate.deleteRequested))}><Trash2 aria-hidden/>{Object.values(owner.provenance ?? {}).some((fact) => fact?.source === "connection_sourced") ? "Override and remove record" : "Remove record"}</button>
          </fieldset> : <><strong>{owner.displayName || owner.legalName}</strong><span>{owner.ownerKind.replace(/_/g, " ")} · {owner.status}{owner.ownershipInterest ? ` · ${owner.ownershipInterest}% provided` : " · ownership interest not provided"}</span><small>Designated representative: {data.representatives.find((person) => person.id === owner.representativeUserId)?.name || (owner.representativeUserId ? "Active Team person" : "Not selected")}</small></>}
        </div>)}
        <small className="setup-ownership__legal">Setup records owner-provided facts only. It does not validate legal ownership or provide legal advice. Granting or transferring workspace authority belongs to Team Ownership & Authority Lifecycle.</small>
      </div>
      <div className="setup-email-grid">
        <div><Mail aria-hidden/><span>Platform-assigned sending email</span><ReadValue>{data.managedSendingEmail}</ReadValue><SourceBadge source="connection_sourced"/></div>
        <div><Mail aria-hidden/><span>Primary business email</span><ReadValue>{data.primaryBusinessEmail}</ReadValue><SourceBadge source="connection_sourced"/></div>
      </div>
      <div className="setup-handoff"><div><strong>Connections owns email and provider configuration</strong><span>Setup shows the current records honestly; it does not duplicate email setup.</span></div><Link to={connectionsPath}>Open Connections <ArrowRight aria-hidden/></Link></div>
    </Section>

    <Section id="business-model" eyebrow="Business model and customers" title="What you sell and who it is for" description="Give Paige enough context to help without inventing an offer, audience or service area."><BriefFields fields={modelFields} draft={draft} editing={editing} disabled={data.saving} errors={errors} onChange={change} sourceDecisions={sourceDecisions} onSourceDecision={setSourceDecision}/></Section>
    <Section id="direction" eyebrow="Direction and goals" title="What the business is working toward" description="Anchor Paige in the current priority, near-term goals, longer direction and real constraints."><BriefFields fields={directionFields} draft={draft} editing={editing} disabled={data.saving} errors={errors} onChange={change} sourceDecisions={sourceDecisions} onSourceDecision={setSourceDecision}/></Section>
    <Section id="paige-brief" eyebrow="Paige brief" title="Teach Paige how this business sounds and works" description="Capture the voice, working style, and boundaries a founder or operator knows. The guided drawer returns here; it is not a hidden page or another Settings destination.">
      <PaigeBriefPanel key={data.activeTenantId || "unresolved"} draft={draft} canEdit={data.canEdit} disabled={data.saving} sourceDecisions={sourceDecisions} onApply={applyPaigeBriefDraft} onDirtyChange={setPaigeDrawerDirty} confirmDiscard={confirmPaigeBriefDiscard}/>
      {editing && <details className="setup-paige-brief__manual"><summary>Fine-tune directly in Edit brief</summary><BriefFields fields={paigeFields} draft={draft} editing={editing} disabled={data.saving} errors={errors} onChange={change} sourceDecisions={sourceDecisions} onSourceDecision={setSourceDecision}/></details>}
    </Section>

    <Section id="architecture" eyebrow="Governed architecture" title="How Paige may use this brief" description="Setup supplies context. It does not silently grant action authority.">
      <div className="setup-architecture">
        <div><BriefcaseBusiness aria-hidden/><strong>Setup · PARTIAL</strong><span>Durable repair is pending exact-head authenticated runtime proof.</span></div>
        <div><Sparkles aria-hidden/><strong>PAIGE / Mind · PROPOSED</strong><span>A safe-field handoff exists; runtime consumption is not yet verified.</span></div>
        <div><ShieldCheck aria-hidden/><strong>Approval policy · PARTIAL</strong><span>Setup does not expand PAIGE authority or permissions.</span></div>
        <div><Compass aria-hidden/><strong>Rail · UNAVAILABLE</strong><span>Internal audit entries exist; Rail integration is not claimed.</span></div>
      </div>
      <p className="setup-architecture__rule"><Check aria-hidden/>Paige may propose an update. The owner reviews and saves it before business truth changes.</p>
    </Section>
  </div>;
}
