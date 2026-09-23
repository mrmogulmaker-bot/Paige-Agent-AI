import { confirmFingerprint } from "../confirm-fingerprint.ts";
import { classifyAction } from "../action-risk.ts";
import { canonicalizePersonName } from "../canonical-person-name.ts";

export const CRM_ACTION_CAPABILITY = {
  "contact.create": "crm_create_contact", "contact.update": "crm_update_contact",
  "contact.archive": "crm_archive_contact", "contact.restore": "crm_restore_contact",
  "contact.link_company": "crm_link_contact_company", "contact.unlink_company": "crm_unlink_contact_company",
  "contact.assign_coach": "crm_assign_coach", "contact.assign_owner": "crm_assign_contact_owner",
  "contact.merge": "crm_merge_contacts", "contact.hard_delete": "crm_hard_delete_contact",
  "contact.bulk_update": "crm_bulk_update_contacts",
  "company.create": "crm_create_company", "company.update": "crm_update_company",
  "company.archive": "crm_archive_company", "company.restore": "crm_restore_company",
  "task.create": "crm_create_task", "task.update": "crm_update_task", "task.assign": "crm_assign_task",
  "task.reschedule": "crm_reschedule_task", "task.complete": "crm_complete_task",
  "task.reopen": "crm_reopen_task", "task.cancel": "crm_cancel_task", "task.delete": "crm_delete_task",
  "activity.log": "crm_log_activity",
  "deal.create": "deal_create", "deal.update": "crm_update_deal",
  "deal.assign_owner": "crm_assign_deal_owner", "deal.assign_contact": "crm_assign_deal_contact",
  "deal.move": "deal_move_stage", "deal.close": "crm_close_deal",
  "deal.reopen": "crm_reopen_deal", "deal.delete": "crm_delete_deal",
} as const;

export type CrmAction = keyof typeof CRM_ACTION_CAPABILITY;
export type CrmCapability = typeof CRM_ACTION_CAPABILITY[CrmAction];
declare const canonicalCrmCommandBrand: unique symbol;
export type CanonicalCrmCommand<T extends Record<string, unknown> = Record<string, unknown>> =
  T & { readonly [canonicalCrmCommandBrand]: true };
export const CRM_TOOL_TO_ACTION = Object.freeze(Object.fromEntries(
  Object.entries(CRM_ACTION_CAPABILITY).map(([action, capability]) => [capability, action]),
)) as Readonly<Record<CrmCapability, CrmAction>>;
export const CRM_COMMAND_TOOL_NAMES = new Set<CrmCapability>(Object.keys(CRM_TOOL_TO_ACTION) as CrmCapability[]);

const CONTACT_NAME_FIELDS = ["first_name", "last_name"] as const;
const fingerprintArgsByCanonicalCommand = new WeakMap<object, Record<string, unknown>>();

function buildCrmCommandFingerprintArgs(command: Record<string, unknown>): Record<string, unknown> {
  const args = Object.fromEntries(Object.entries(command).filter(([key]) => key !== "action"));
  if (command.action !== "contact.create") return Object.freeze(args);
  const sourcePatch = args.patch;
  if (!sourcePatch || typeof sourcePatch !== "object" || Array.isArray(sourcePatch)) {
    return Object.freeze(args);
  }
  const patch = { ...sourcePatch as Record<string, unknown> };
  for (const field of CONTACT_NAME_FIELDS) {
    const canonicalName = canonicalizePersonName(patch[field]);
    if (canonicalName) patch[field] = canonicalName.identity;
  }
  return Object.freeze({ ...args, patch: Object.freeze(patch) });
}

function markCanonicalCrmCommand<T extends Record<string, unknown>>(command: T): CanonicalCrmCommand<T> {
  fingerprintArgsByCanonicalCommand.set(command, buildCrmCommandFingerprintArgs(command));
  return command as CanonicalCrmCommand<T>;
}

/**
 * Returns the precomputed hash projection for a command issued by the
 * canonical command boundary. Raw/model arguments are rejected at runtime,
 * and the branded parameter prevents an uncanonicalized call at compile time.
 */
export function crmCommandFingerprintArgs(command: CanonicalCrmCommand): Record<string, unknown> {
  const args = fingerprintArgsByCanonicalCommand.get(command);
  if (!args) throw new TypeError("CRM_COMMAND_NOT_CANONICAL");
  return args;
}

function stableCommandValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableCommandValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort()
      .map((key) => [key, stableCommandValue((value as Record<string, unknown>)[key])]));
  }
  return value;
}

const LEGACY_CONTACT_LIFECYCLE: Readonly<Record<string, string>> = Object.freeze({
  lead: "new_lead",
  mql: "qualified",
  sql: "hot_lead",
  opportunity: "negotiating",
  customer: "client_active",
  evangelist: "client_alumni",
  churned: "client_churned",
  archived: "client_alumni",
});

// #1234 replaced the original create-contact arguments with a generic patch object. Existing
// model turns can therefore still carry the historical display-name field and pre-V3 lifecycle
// values. Normalize only those proven aliases; every other unknown or malformed field remains in
// place so the canonical executor rejects it rather than silently guessing.
export function canonicalizeCrmCommand<T extends Record<string, unknown>>(command: T): CanonicalCrmCommand<T> {
  if (command.action !== "contact.create") return markCanonicalCrmCommand({ ...command } as T);
  const sourcePatch = command.patch;
  if (!sourcePatch || typeof sourcePatch !== "object" || Array.isArray(sourcePatch)) {
    return markCanonicalCrmCommand({ ...command } as T);
  }

  const patch = { ...sourcePatch as Record<string, unknown> };
  for (const field of CONTACT_NAME_FIELDS) {
    const canonicalName = canonicalizePersonName(patch[field]);
    if (canonicalName) patch[field] = canonicalName.display;
  }
  const legacyName = canonicalizePersonName(patch.name);
  if (legacyName) {
    const presentCanonicalNameFields = CONTACT_NAME_FIELDS.filter((field) =>
      Object.prototype.hasOwnProperty.call(patch, field)
    );
    const malformedCanonicalNameFields = presentCanonicalNameFields.filter((field) =>
      canonicalizePersonName(patch[field]) === null
    );
    for (const field of malformedCanonicalNameFields) delete patch[field];
    const splitAt = legacyName.display.lastIndexOf(" ");
    const legacyFirstName = splitAt > 0 ? legacyName.display.slice(0, splitAt) : legacyName.display;
    const legacyLastName = splitAt > 0 ? legacyName.display.slice(splitAt + 1) : null;
    if (!canonicalizePersonName(patch.first_name)) patch.first_name = legacyFirstName;
    if (legacyLastName && !canonicalizePersonName(patch.last_name)) patch.last_name = legacyLastName;
    // A canonical value wins only when it is actually usable. Malformed canonical values are
    // removed before the decision, so a valid legacy alias can fill each rejected part instead of
    // being discarded merely because a canonical key existed.
    delete patch.name;
  }

  if (typeof patch.lifecycle_stage === "string") {
    const canonicalStage = LEGACY_CONTACT_LIFECYCLE[patch.lifecycle_stage];
    if (canonicalStage) patch.lifecycle_stage = canonicalStage;
  }

  return markCanonicalCrmCommand({ ...command, patch } as T);
}

// Canonical stable subject used only to disambiguate one command inside the operator's already-
// approved same-tool set. The subject is always a required opaque record id (or the exact bulk set)
// when the action has one. Consequential argument drift is safe because the stored proposal executes;
// two approved effects for the same subject deliberately remain ambiguous and fail closed. Create
// actions have no pre-existing record id, so they fall back to the normalized full proposed command.
export async function crmApprovalSubject(action: CrmAction, command: Record<string, unknown>): Promise<string> {
  const canonicalCommand = canonicalizeCrmCommand(command);
  let identity: unknown;
  if (action === "contact.bulk_update") {
    identity = Array.isArray(canonicalCommand.target_ids) ? [...canonicalCommand.target_ids].map(String).sort() : null;
  } else if (action.startsWith("contact.") && !["contact.create"].includes(action)) {
    identity = canonicalCommand.contact_id ?? null;
  } else if (action === "company.create") {
    identity = canonicalCommand.contact_id ?? null;
  } else if (action.startsWith("company.")) {
    identity = canonicalCommand.company_id ?? null;
  } else if (action.startsWith("task.") && action !== "task.create") {
    identity = canonicalCommand.task_id ?? null;
  } else if (action === "activity.log") {
    identity = canonicalCommand.contact_id ?? null;
  } else if (action.startsWith("deal.") && action !== "deal.create") {
    identity = canonicalCommand.deal_id ?? null;
  } else {
    identity = stableCommandValue({ action, ...crmCommandFingerprintArgs(canonicalCommand) });
  }
  return await confirmFingerprint(`crm_approval_subject:${action}`, { identity });
}

const CONTACT_LIFECYCLE_STAGES = [
  "new_lead", "qualified", "nurturing", "hot_lead", "negotiating", "won",
  "client_active", "client_paused", "client_churned", "client_funded", "client_alumni",
] as const;

const contactCreatePatch = {
  type: "object",
  description: "Canonical fields for the new contact. Omit fields the operator did not provide.",
  additionalProperties: false,
  properties: {
    first_name: { type: "string", description: "First or single name. Split a full person name into first_name and last_name." },
    last_name: { type: "string", description: "Last name when the operator supplied one." },
    email: { type: "string" },
    phone: { type: "string" },
    entity_name: { type: "string", description: "Company or business name." },
    entity_type: { type: "string" },
    title: { type: "string", description: "Job title or role." },
    lifecycle_stage: { type: "string", enum: CONTACT_LIFECYCLE_STAGES },
    source: { type: "string" },
    tags: { type: "array", maxItems: 50, items: { type: "string" } },
    primary_offer: { type: "string" },
    notes: { type: "string", maxLength: 10000 },
    do_not_contact: { type: "boolean" },
    website: { type: "string" },
    linkedin_url: { type: "string" },
    street_address: { type: "string" },
    city: { type: "string" },
    state: { type: "string" },
    zip_code: { type: "string" },
    funding_goal: { type: "number" },
    monthly_revenue: { type: "number" },
  },
} as const;

const properties = {
  idempotency_key: { type: "string", maxLength: 192, description: "Optional stable retry key. Paige may omit it; the server settles one." },
  contact_id: { type: ["string", "null"], description: "Exact contact UUID from a current CRM read." },
  loser_contact_id: { type: "string", description: "Exact losing contact UUID for merge." },
  company_id: { type: "string", description: "Exact company UUID from a current CRM read." },
  task_id: { type: "string", description: "Exact task UUID from a current CRM read." },
  deal_id: { type: "string", description: "Exact deal UUID from a current Pipeline read." },
  pipeline_id: { type: "string" }, stage_id: { type: "string" }, target_stage_id: { type: "string" },
  owner_user_id: { type: ["string", "null"], description: "Exact active member UUID. Null unassigns only where supported." },
  expected_updated_at: { type: "string", description: "Exact updated_at returned by the latest read." },
  expected_loser_updated_at: { type: "string", description: "Exact losing-contact updated_at returned by the latest read." },
  expected_version: { type: "integer", minimum: 1 }, expected_target_version: { type: "integer", minimum: 1 },
  target_ids: { type: "array", minItems: 1, maxItems: 200, items: { type: "string" } },
  resolutions: { type: "object", additionalProperties: { type: "string", enum: ["survivor", "loser"] } },
  patch: { type: "object", description: "Only fields the operator asked to change." },
  title: { type: "string" }, value_cents: { type: "integer", minimum: 0 }, currency: { type: "string" },
  expected_close_date: { type: "string" }, offer_type: { type: "string" }, tags: { type: "array", items: { type: "string" } },
  notes: { type: "string" }, outcome_type: { type: "string", enum: ["won", "lost", "not_fit", "closed_without_decision"] },
  outcome_date: { type: "string" }, reason: { type: "string" },
} as const;

const required: Record<CrmAction, string[]> = {
  "contact.create": ["patch"], "contact.update": ["contact_id","expected_updated_at","patch"],
  "contact.archive": ["contact_id","expected_updated_at"], "contact.restore": ["contact_id","expected_updated_at"],
  "contact.link_company": ["contact_id","company_id","expected_updated_at"], "contact.unlink_company": ["contact_id","expected_updated_at"],
  "contact.assign_coach": ["contact_id","owner_user_id","expected_updated_at"], "contact.assign_owner": ["contact_id","owner_user_id","expected_updated_at"],
  "contact.merge": ["contact_id","loser_contact_id","expected_updated_at","expected_loser_updated_at"],
  "contact.hard_delete": ["contact_id","expected_updated_at"], "contact.bulk_update": ["target_ids","patch"],
  "company.create": ["contact_id","patch"], "company.update": ["company_id","expected_updated_at","patch"],
  "company.archive": ["company_id","expected_updated_at"], "company.restore": ["company_id","expected_updated_at"],
  "task.create": ["patch"], "task.update": ["task_id","expected_updated_at","patch"], "task.assign": ["task_id","expected_updated_at","patch"],
  "task.reschedule": ["task_id","expected_updated_at","patch"], "task.complete": ["task_id","expected_updated_at"],
  "task.reopen": ["task_id","expected_updated_at"], "task.cancel": ["task_id","expected_updated_at"], "task.delete": ["task_id","expected_updated_at"],
  "activity.log": ["contact_id","patch"],
  "deal.create": ["title","pipeline_id","stage_id"], "deal.update": ["deal_id","expected_version"],
  "deal.assign_owner": ["deal_id","owner_user_id","expected_version"], "deal.assign_contact": ["deal_id","contact_id","expected_version"],
  "deal.move": ["deal_id","pipeline_id","target_stage_id","expected_version","expected_target_version"],
  "deal.close": ["deal_id","expected_version","outcome_type"], "deal.reopen": ["deal_id","expected_version","target_stage_id"],
  "deal.delete": ["deal_id","expected_version"],
};

const labels: Record<CrmAction, string> = {
  "contact.create":"create a contact", "contact.update":"edit a contact", "contact.archive":"archive a contact", "contact.restore":"restore a contact",
  "contact.link_company":"link a contact to a company", "contact.unlink_company":"unlink a contact from a company", "contact.assign_coach":"change a contact's coach",
  "contact.assign_owner":"change a contact's owner", "contact.merge":"merge two contacts after reviewing conflicts and dependencies",
  "contact.hard_delete":"permanently delete an eligible contact", "contact.bulk_update":"update an exact set of contacts",
  "company.create":"create a company", "company.update":"edit a company", "company.archive":"archive a company", "company.restore":"restore a company",
  "task.create":"create a task; company and deal links are supported, while contact linking remains unavailable until the canonical task model owns that relationship", "task.update":"edit a task", "task.assign":"assign a task", "task.reschedule":"reschedule a task",
  "task.complete":"complete a task", "task.reopen":"reopen a task", "task.cancel":"cancel a task while retaining its history", "task.delete":"permanently delete a task",
  "activity.log":"log an internal CRM activity; this never sends email or SMS and never places a call",
  "deal.create":"create a deal", "deal.update":"edit reversible deal fields", "deal.assign_owner":"change a deal's owner",
  "deal.assign_contact":"change a deal's contact", "deal.move":"move a deal stage", "deal.close":"close a deal",
  "deal.reopen":"reopen a deal", "deal.delete":"permanently delete a deal",
};

export const CRM_COMMAND_TOOLS = (Object.entries(CRM_ACTION_CAPABILITY) as [CrmAction, CrmCapability][]).map(([action, capability]) => ({
  type: "function",
  function: {
    name: capability,
    description: `Governed CRM: ${labels[action]}. Resolve exact IDs and version fields from a current read. Tenant, actor, role, account, authority and approval are always resolved by the server. Returns durable readback, receipt state and a route locator; destructive and ownership operations require the rendered approval card.`,
    parameters: {
      type: "object",
      properties: {
        ...properties,
        patch: action === "contact.create" ? contactCreatePatch : properties.patch,
        confirm: {
          type: "boolean",
          description: classifyAction(capability) === "high"
            ? "Set true only after the operator has explicitly approved this exact action. The model saying so is not enough on its own; the server requires the single-use rendered approval card."
            : "Set true only after the operator has explicitly approved this exact action. Omit or false on the proposal call; server policy and stored approval remain authoritative.",
        },
      },
      required: required[action],
      // `crm-command` validates that deal.update carries at least one reversible field before
      // execution. Keep that invariant at the authoritative executor: Anthropic rejects a
      // top-level schema combinator in a tool input_schema, which otherwise rejects every Chat
      // turn before the model can answer.
      additionalProperties: false,
    },
  },
}));
