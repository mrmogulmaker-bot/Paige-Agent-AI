/**
 * Preparing a messaging registration — the refusal and permission vocabulary.
 *
 * Pure, and separate from the surface, for the same reason `READINESS_COPY` and
 * the step functions are: what a tenant is TOLD when an action is unavailable is
 * the part that has to stay enforceable in a test. A refusal rendered from a
 * server string is a refusal nobody can hold a boundary on.
 *
 * TWO RULES BIND EVERY STRING HERE.
 *
 * 1. NEVER RENDER THE SERVER'S MESSAGE. `comms-a2p-draft` returns a structured
 *    `{ code, message }`. The code is stable and safe to branch on; the message
 *    is not safe to print — `INTERNAL` carries whatever threw, which is how a
 *    raw resolver diagnostic reaches a tenant. This surface already learned that
 *    with `COMMS_READINESS_FORBIDDEN`, so the same posture applies: map the CODE
 *    to copy owned here, and drop the message.
 *
 * 2. EVERY REFUSAL NAMES ITS RECOVERY, or says plainly that there isn't one.
 *    "Unavailable" with no reason is the failure this slice exists to remove. A
 *    `recovery` of null is a deliberate statement that nothing the tenant can do
 *    changes it — not an omission.
 */

export type Refusal = {
  /** The stable code, kept so a report can name what actually came back. */
  code: string;
  title: string;
  body: string;
  /** What the tenant can do about it. `null` means: nothing, honestly. */
  recovery: string | null;
};

/**
 * The refusal codes `comms-a2p-draft` can actually return.
 *
 * Every entry corresponds to a real arm of that function — its own `fail()`
 * calls plus every key of its `SAVE_REFUSAL_STATUS` map, which is where the
 * save RPC's stable hints surface. Codes are not invented here; a code this
 * table does not know falls through to `UNKNOWN` rather than being guessed at.
 */
const REFUSALS: Record<string, Refusal> = {
  LEGAL_PROFILE_REQUIRED: {
    code: "LEGAL_PROFILE_REQUIRED",
    title: "Your legal business name is needed first",
    body:
      "Carriers register a legal entity, not a nickname, so a registration cannot be prepared until " +
      "your legal business name is on file. Nothing was saved.",
    recovery: "Add it to your business profile, then prepare the registration again.",
  },
  REGISTRATION_IMMUTABLE: {
    code: "REGISTRATION_IMMUTABLE",
    title: "This registration can no longer be edited",
    body:
      "It has already left preparation, so it is not a draft any more. Nothing was overwritten and " +
      "what you had is unchanged.",
    recovery: null,
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    title: "You do not have permission to prepare this",
    body: "Preparing a registration needs owner or coach access on this account. Nothing was saved.",
    recovery: "An owner on this account can prepare it, or grant you access.",
  },
  NO_TENANT: {
    code: "NO_TENANT",
    title: "We couldn’t identify your workspace",
    body:
      "Your session did not resolve to a business, so we did not act on any account. Nothing was saved, " +
      "and nothing is being claimed about your setup.",
    recovery: "Sign out and back in, then try again.",
  },
  UNAUTHENTICATED: {
    code: "UNAUTHENTICATED",
    title: "Your session has expired",
    body: "We could not verify your session, so nothing was saved.",
    recovery: "Sign in again, then try again.",
  },
  // The three below are contract-shape refusals from the save RPC. A tenant
  // cannot cause them from this drawer — the drafted copy is generated, not
  // typed — so they are reported as ours to fix rather than blamed on the input.
  USE_CASE_REQUIRED: {
    code: "USE_CASE_REQUIRED",
    title: "The drafted registration came back incomplete",
    body: "It was missing the campaign purpose, so it was not saved. This one is ours, not yours.",
    recovery: "Try again — describing how you’ll use messaging in a little more detail usually helps.",
  },
  SAMPLES_REQUIRED: {
    code: "SAMPLES_REQUIRED",
    title: "The drafted registration came back incomplete",
    body: "It was missing the sample messages carriers require, so it was not saved. This one is ours, not yours.",
    recovery: "Try again — describing how you’ll use messaging in a little more detail usually helps.",
  },
  SAMPLES_INVALID: {
    code: "SAMPLES_INVALID",
    title: "The drafted registration came back incomplete",
    body: "Its sample messages were not in a form we could store, so it was not saved. This one is ours, not yours.",
    recovery: "Try again.",
  },
  MODEL_UNAVAILABLE: {
    code: "MODEL_UNAVAILABLE",
    title: "Drafting is not available right now",
    body:
      "The drafting step is not configured, so no registration copy was written and nothing was saved. " +
      "This is not something about your account.",
    recovery: "Try again later.",
  },
  UNKNOWN: {
    code: "UNKNOWN",
    title: "The registration was not saved",
    body: "Something went wrong on our side. Nothing was saved, and your setup is unchanged.",
    recovery: "Try again in a moment.",
  },
};

/**
 * Map a code to tenant-facing copy.
 *
 * An unmapped code keeps its own identity in `code` while rendering the UNKNOWN
 * copy, so a new server code is reportable without being mistranslated into a
 * reason we made up.
 */
export function refusalFor(code: string | null | undefined): Refusal {
  const key = (code ?? "").trim().toUpperCase();
  const hit = REFUSALS[key];
  if (hit) return hit;
  return { ...REFUSALS.UNKNOWN, code: key || "UNKNOWN" };
}

/** Codes this surface has copy for — exported so a test can prove the set is covered. */
export const KNOWN_REFUSAL_CODES = Object.keys(REFUSALS).filter((c) => c !== "UNKNOWN");

/**
 * Whether this caller may prepare, and — when not — why and what to do.
 *
 * MIRRORS THE SERVER, AND IS NEVER THE AUTHORITY. `comms-a2p-draft` gates on
 * `is_platform_owner() OR admin OR coach`; this computes the same answer so the
 * surface and the server do not give two different ones (§57). But the server
 * decides: a FORBIDDEN that arrives anyway is still rendered as a refusal, which
 * is why `refusalFor("FORBIDDEN")` exists alongside this.
 *
 * WHILE ROLES ARE STILL LOADING WE CLAIM NOTHING. Returning "you may not" during
 * the load would flash a permission denial at an owner on every visit, and
 * returning "you may" would enable a control that is about to be taken away.
 * `pending` is its own answer and the caller renders it as such.
 */
export type PreparePermission =
  | { state: "pending" }
  | { state: "allowed" }
  | { state: "denied"; reason: string; recovery: string };

export function preparePermission(input: {
  loading: boolean;
  isStaff: boolean;
  isPlatformOwner: boolean | null;
}): PreparePermission {
  // `isPlatformOwner === null` means the operator check has not come back. A
  // non-staff caller could still be an operator, so we must not deny yet.
  if (input.loading || (!input.isStaff && input.isPlatformOwner === null)) return { state: "pending" };
  if (input.isStaff || input.isPlatformOwner === true) return { state: "allowed" };
  return {
    state: "denied",
    reason: "You can see this, but not change it. Preparing a registration needs owner or coach access on this account.",
    recovery: "An owner on this account can prepare it, or grant you access.",
  };
}

/**
 * Actions this surface deliberately does not offer, and the honest reason.
 *
 * These are rendered as DISABLED CONTROLS WITH A STATED REASON rather than
 * hidden, because a capability the product visibly stops short of is different
 * from one that does not exist — and a tenant who cannot see the ceiling cannot
 * tell which of the two they are looking at. None of these is a placeholder for
 * a control that secretly works.
 */
export const BLOCKED_ACTIONS: Record<"submit" | "search_number" | "assign_number", { label: string; reason: string; recovery: string | null }> = {
  submit: {
    label: "Submit to carriers",
    reason:
      "Filing with carriers is not built yet. Nothing is queued, and no carrier has seen anything about your business.",
    recovery: null,
  },
  search_number: {
    label: "Search for a number",
    reason:
      "Finding a number contacts the phone provider and spends money, which this screen has no authority to do.",
    recovery: "An owner with provider access arranges it, and the number then appears here.",
  },
  assign_number: {
    label: "Assign an existing number",
    reason: "Assigning a number changes your provider account, which this screen has no authority to do.",
    recovery: "An owner with provider access arranges it, and the number then appears here.",
  },
};
