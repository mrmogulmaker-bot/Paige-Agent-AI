/**
 * INT-178 — the governed READ path that lets PAIGE see a workspace's agreements.
 *
 * WHY THIS EXISTS. The e-signature engine (INT-163) shipped its records, its integrity triggers,
 * its signing contract and its surface — and PAIGE could not see any of it. `registry.ts` even
 * carried a comment saying DRAFT, VOID and STATUS "register here"; nothing did. A capability the
 * product has but the agent cannot reach is not a capability the owner has, which is the whole of
 * this lane's remit.
 *
 * ONE READ, NOT A SECOND SYSTEM (§18). Everything below composes `public.paige_agreement_overview`
 * (migration 20270402000000), whose own header calls it "the read Paige answers from". This module
 * owns no table, no query against `paige_agreements` or `paige_agreement_signers`, and no second
 * aggregation. It resolves nothing the RPC already resolves.
 *
 * WHY THE CALLER'S CLIENT AND NOT THE SERVICE ROLE. `paige_agreement_overview` is SECURITY DEFINER,
 * so §59 requires it to re-prove caller scope in its own body — and it does: it resolves the tenant
 * from `current_user_tenant_id()`, refuses when `_expected_tenant_id` differs, and refuses a
 * non-member. Every one of those guards reads `auth.uid()`, which is NULL under the service role.
 * Handed a service-role client this read would not become permissive, it would become
 * UNAUTHENTICATED and refuse everything — so the caller's JWT client is both the safe choice and
 * the only working one. The service-role client appears here for exactly one purpose: the Rail
 * receipt, whose RPC is `GRANT EXECUTE … TO service_role`.
 *
 * THE EXPECTED-TENANT ARGUMENT IS A BRAKE, NEVER A STEERING WHEEL. `expectedTenantId` is the
 * tenant the CHAT TURN already resolved server-side. Passing it cannot widen what the caller may
 * read: the RPC compares it to the session's own tenant and raises when they differ. Its only
 * effect is to refuse a read whose workspace changed underneath the turn.
 *
 * ── WHAT MAY NEVER CROSS INTO A TOOL RESULT ───────────────────────────────────────────────────
 * Signer evidence stays in the evidence trail: signing IP addresses, user agents, signature
 * images, token hashes and signing-link tokens are not chat-retrievable, not in a result, not in a
 * summary, and not in an error message. Two independent things hold that line here:
 *
 *   1. The RPC does not return any of it. It emits no token hash and no storage key by design.
 *   2. `project()` below is an explicit ALLOWLIST, not a delete-list. A column added to the RPC
 *      later — the widening documented in `docs/delivery/int162-attachment-map.md` is already
 *      accepted and belongs to the backend lane — cannot arrive in a tool result by default. It
 *      has to be named here first. A delete-list would have failed open on exactly that change.
 *
 * The two document hashes the RPC DOES return (`document_sha256`, `sealed_sha256`) are
 * deliberately NOT projected. They are integrity material, they mean nothing to a model reading
 * them, and the question the surface actually asks — "is there a sealed copy?" — is answered
 * identically by a boolean. That is the same instinct the RPC applied when it refused to emit the
 * storage key, carried one layer further out.
 *
 * ERRORS ARE MAPPED, NEVER ECHOED. A PostgrestError carries `message`, `details` and `hint`
 * straight from the database. Serialising one into a tool result would put raw database text in
 * front of a model and into a transcript. Every failure below resolves to a fixed, caller-safe
 * reason; the underlying cause goes to `console.error` where operators can read it and the model
 * cannot.
 */

/** The RPC port. Deliberately structural so vitest can drive this without a Supabase client. */
export type AgreementReadRpcPort = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string; code?: string } | null }>;
};

/** The eight states `paige_agreements.status` may hold (migration 20270401000000:81). */
export const AGREEMENT_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "partially_signed",
  "completed",
  "declined",
  "voided",
  "expired",
] as const;
export type AgreementStatus = (typeof AGREEMENT_STATUSES)[number];

/**
 * One agreement as PAIGE may see it. Every field here is a deliberate disclosure decision; see the
 * allowlist note in the header before adding one.
 */
export type AgreementSummary = {
  id: string;
  title: string;
  /** One of AGREEMENT_STATUSES, or the raw string when this build does not recognise it. */
  status: string;
  contactId: string | null;
  contactName: string | null;
  signersTotal: number;
  signersSigned: number;
  /** Signers who have NOT signed yet, in signing order. Names only — never their evidence. */
  outstandingNames: string[];
  sentAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  updatedAt: string | null;
  /** Whether a sealed copy exists. The hash and the storage key are never disclosed. */
  sealed: boolean;
};

/**
 * Why a read did not succeed, as a fixed token rather than prose. The caller needs this to file an
 * honest receipt — a refusal is `capability_refused`, an outage is `capability_failed`, and telling
 * them apart from an English sentence would mean string-matching a message. It carries no detail
 * about the caller, the workspace or the database, so it is safe to put in a tool result.
 */
export type AgreementReadFailure =
  | "no_workspace"
  | "unknown_status"
  | "bad_contact_id"
  | "refused"
  | "unavailable";

/**
 * Why an EMPTY read was empty, when the adapter could establish it. An empty list is the answer
 * most likely to be reported as a confident falsehood, because it looks like an answer rather than
 * an absence — so each case it can distinguish is named, and the caller renders the distinction
 * rather than flattening it to "none".
 */
export type AgreementEmptyReason = "agency_has_no_client_book" | "contact_not_found";

export type AgreementReadResult =
  | {
      success: true;
      agreements: AgreementSummary[];
      count: number;
      note?: string;
      /** Present only on an empty read the adapter could explain. */
      emptyReason?: AgreementEmptyReason;
    }
  | { success: false; error: string; reason: AgreementReadFailure; note?: string };

/**
 * Workspace questions the adapter cannot answer from the overview RPC, asked ONLY when the answer
 * changes what PAIGE should say. Every one is optional, and every one may return `null` for "could
 * not tell" — an unanswerable diagnostic degrades to the plain result, never to a guess (§13).
 *
 * They are a port rather than inline queries so this module stays drivable from vitest without a
 * Supabase client, exactly as the RPC port is.
 */
export type AgreementReadDiagnostics = {
  /**
   * Does the caller hold a DIRECT `tenant_members` row in this workspace? Asked only on a 42501.
   *
   * WHY IT MATTERS, AND IT IS NOT A HYPOTHETICAL. `current_user_tenant_id()` accepts FOUR paths —
   * direct membership, `agency_can_manage_child`, `agency_team_role`, and `is_platform_admin`
   * (migration 20260714144656) — while `paige_agreement_overview`'s third gate accepts only
   * `is_tenant_member()`, which reads `tenant_members` alone (migration 20260629175341:132-142).
   * So an agency owner switched into a managed sub-account, an agency team member, and a platform
   * operator acting-as all RESOLVE the workspace and are then refused. Without this, PAIGE tells
   * them "this account is not a member of it", which is not what happened and sends them to fix
   * the wrong thing.
   */
  isDirectMember?: () => Promise<boolean | null>;
  /** Is this workspace a top-level agency, which structurally holds no client book? Empty reads only. */
  isAgencyWithoutClientBook?: () => Promise<boolean | null>;
  /** Does this contact exist in this workspace at all? Empty reads that named a contact only. */
  contactExists?: (contactId: string) => Promise<boolean | null>;
};

/**
 * Why a read failed, in caller-safe language. `42501` is the SQLSTATE every one of the RPC's three
 * in-body refusals raises, so the three are told apart by nothing here — deliberately. Which of
 * "not signed in", "workspace changed" or "not a member" it was is not a distinction worth leaking
 * a probe over, and the remedy the owner needs is the same in all three.
 */
const REFUSED =
  "That workspace's agreements could not be read — the active workspace may have changed, or this account is not a member of it. Reopen the workspace and try again.";
/**
 * The refusal for a caller who reached the workspace by DELEGATED access rather than membership.
 * It names the real boundary instead of denying their access, because they do have access to the
 * workspace — just not, today, to its agreements. Widening the RPC's gate to honour the agency rail
 * is a deliberate §53 decision for the backend lane, not something this read may assume.
 */
const NOT_A_DIRECT_MEMBER =
  "Agreements can only be read by someone with their own membership in this workspace. Access you hold by managing this account from a parent agency, or as a platform operator, does not extend to its agreements — so nothing can be shown here, and this is a limit rather than an error.";
const UNAVAILABLE =
  "The agreements could not be read just now. Nothing was changed. Try again, and if it keeps failing the agreements engine may need attention.";
const NO_WORKSPACE = "No workspace is active. Open a workspace and try again.";

/**
 * A contact id is validated HERE, not left to the tool schema. JSON-Schema `format: "uuid"` is
 * advisory — nothing enforces it, and a model inventing an id is an ordinary occurrence rather than
 * an edge case. Two different wrong answers follow from letting one through: Postgres fails the cast
 * and the owner is told the agreements engine needs attention (blaming the platform for the model),
 * and the Rail records a platform failure that never happened. Same guard, same reason, as
 * `calendar-link-tenant-brain.ts`.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const text = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const count = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
};

/**
 * The allowlist. A row the RPC returns becomes exactly these fields and nothing else — an unknown
 * column is dropped rather than forwarded, which is what makes a later widening of the RPC safe by
 * default rather than safe only if someone remembers.
 */
/**
 * States in which no further signature can or should arrive. The RPC computes `outstanding_names`
 * as every signer whose status is not `signed` (migration 20270402000000:76-78) — which is the
 * right query for a live agreement and the wrong one for a dead one. A declined signer stays
 * `declined`, and the remaining links are revoked when the agreement ends, so on a declined, voided
 * or expired agreement those names are not people we are waiting on. Reporting them as outstanding
 * would have PAIGE tell the owner to chase someone who cannot sign.
 */
const TERMINAL_STATUSES = new Set(["declined", "voided", "expired"]);

function project(row: Record<string, unknown>): AgreementSummary {
  const status = text(row.status) ?? "unknown";
  const outstanding = TERMINAL_STATUSES.has(status) || !Array.isArray(row.outstanding_names)
    ? []
    : row.outstanding_names.map(text).filter((name): name is string => name !== null);
  return {
    id: String(row.id),
    title: text(row.title) ?? "Untitled agreement",
    // A status this build does not recognise is REPORTED, never coerced into one that it does.
    // Renaming a state in a later migration must read as unfamiliar, not as the wrong state.
    status,
    contactId: text(row.contact_id),
    contactName: text(row.contact_name),
    signersTotal: count(row.signers_total),
    signersSigned: count(row.signers_signed),
    outstandingNames: outstanding,
    sentAt: text(row.sent_at),
    completedAt: text(row.completed_at),
    expiresAt: text(row.expires_at),
    updatedAt: text(row.updated_at),
    sealed: text(row.sealed_sha256) !== null,
  };
}

/**
 * Read a workspace's agreements through the one governed seam.
 *
 * `contactId` and `status` narrow the read; both are optional and both are passed to the RPC,
 * which applies them inside the same tenant filter. Neither can widen the result set.
 *
 * Never throws. A failure is a `{ success: false }` with a fixed reason — never a hoped-for
 * success and never the database's own words.
 */
export async function readAgreements(input: {
  caller: AgreementReadRpcPort;
  expectedTenantId: string | null;
  contactId?: string | null;
  status?: string | null;
  /** `agreement_status` sets this: a read for ONE client may not silently become a read for all. */
  requireContact?: boolean;
  /** Workspace questions asked only where the answer changes what PAIGE should say. */
  diagnostics?: AgreementReadDiagnostics;
}): Promise<AgreementReadResult> {
  if (!input.expectedTenantId) return { success: false, error: NO_WORKSPACE, reason: "no_workspace" };

  // A NON-STRING FILTER MUST REFUSE, NOT VANISH. `text()` answers null for a number, an object or
  // an array, so a model that sent `status: 42` would have had its filter silently dropped and been
  // handed the ENTIRE workspace book as though it had asked for one. That is the same widening the
  // contact id guard below prevents, and the tool schema does not stop it: JSON-Schema `enum` is
  // advisory, and nothing between the model and here enforces it.
  if (input.status !== undefined && input.status !== null && typeof input.status !== "string") {
    return {
      success: false,
      error: `A status filter has to be one of: ${AGREEMENT_STATUSES.join(", ")}.`,
      reason: "unknown_status",
    };
  }
  // An unrecognised status would otherwise reach the RPC, match no row, and return an empty list
  // that reads exactly like "you have no agreements" — a false negative stated confidently. It is
  // refused here instead, naming the states that exist.
  const status = text(input.status ?? null);
  if (status !== null && !(AGREEMENT_STATUSES as readonly string[]).includes(status)) {
    return {
      success: false,
      error: `"${status}" is not an agreement status. The states are: ${AGREEMENT_STATUSES.join(", ")}.`,
      reason: "unknown_status",
    };
  }

  // `requireContact` is the difference between the two tools, and it is enforced here rather than
  // by the schema's `required`. Coercing a missing or malformed id to NULL would make the RPC's
  // `(_contact_id IS NULL OR …)` filter a no-op — so a tool whose whole contract is "this ONE
  // client's agreements" would answer with the entire workspace book, and the model would present
  // that as the client's. Refusing is the only honest option; `agreement_list` already exists for
  // the unfiltered read.
  const contactId = text(input.contactId ?? null);
  if (contactId !== null && !UUID_RE.test(contactId)) {
    return { success: false, error: "That is not a valid contact id. Look the contact up first, then try again.", reason: "bad_contact_id" };
  }
  if (input.requireContact && contactId === null) {
    return { success: false, error: "Which client's agreement? Look the contact up first, then try again.", reason: "bad_contact_id" };
  }

  let payload: { data: unknown; error: { message?: string; code?: string } | null };
  try {
    payload = await input.caller.rpc("paige_agreement_overview", {
      _expected_tenant_id: input.expectedTenantId,
      _contact_id: contactId,
      _status: status,
    });
  } catch (e) {
    console.error("[agreements/chat-read] rpc threw", { reason: e instanceof Error ? e.message : "unknown" });
    return { success: false, error: UNAVAILABLE, reason: "unavailable" };
  }

  if (payload.error) {
    // Logged, never returned. `code` is a SQLSTATE and `message` is database text.
    console.error("[agreements/chat-read] overview refused", {
      code: payload.error.code ?? null,
      reason: payload.error.message ?? "unknown",
    });
    if (payload.error.code !== "42501") {
      return { success: false, error: UNAVAILABLE, reason: "unavailable" };
    }
    // All three of the RPC's in-body refusals raise 42501, so the code alone cannot tell them
    // apart — and the difference matters to the person reading the answer. A caller who reached
    // this workspace by delegated access is not "not a member of it"; they are a member of the
    // parent, or the operator, and agreements simply do not travel down that rail today.
    let direct: boolean | null = null;
    try { direct = (await input.diagnostics?.isDirectMember?.()) ?? null; } catch { direct = null; }
    return direct === false
      ? { success: false, error: NOT_A_DIRECT_MEMBER, reason: "refused" }
      : { success: false, error: REFUSED, reason: "refused" };
  }

  const rows = Array.isArray(payload.data) ? (payload.data as Record<string, unknown>[]) : [];
  const agreements = rows.filter((row) => row && typeof row === "object" && row.id != null).map(project);

  // AN EMPTY RESULT IS TWO DIFFERENT ANSWERS, AND SAYING THE WRONG ONE IS A CONFIDENT FALSEHOOD.
  // A top-level Agency manages sub-accounts rather than a client book, and `trg_agreement_tier`
  // (migration 20270405000000) refuses the write, so it can never hold an agreement. The read still
  // succeeds and returns zero rows — so without this, PAIGE tells an agency owner "you have no
  // agreements", when the truth is "agreements are not available on this account type; they belong
  // to the sub-account that holds the client relationship." That is the same false negative this
  // module already refuses for an unknown status filter, and it would be worse here because it
  // sounds like an answer rather than an error.
  if (agreements.length === 0 && input.diagnostics) {
    // A CONTACT THAT DOES NOT EXIST IS NOT A CONTACT WITH NO AGREEMENTS. A syntactically valid
    // UUID the model invented, or one left over from an earlier turn, filters to zero rows — and
    // `paige_agreement_overview` filters agreements, so it can never say "no such contact". Told
    // only "count: 0", PAIGE reports that the client has nothing outstanding, which is a confident
    // statement about a person the workspace may not even have. Checked first because it is the
    // more specific claim: on an agency, a bad contact id is still a bad contact id.
    if (contactId !== null) {
      let exists: boolean | null = null;
      try { exists = (await input.diagnostics.contactExists?.(contactId)) ?? null; } catch { exists = null; }
      if (exists === false) {
        return {
          success: true,
          agreements,
          count: 0,
          emptyReason: "contact_not_found",
          note: "No contact with that id exists in this workspace, so this is NOT 'that client has no agreements' — the client could not be found at all. Look the contact up by name and try again with the id that returns.",
        };
      }
    }
    // AN AGENCY'S EMPTY BOOK IS STRUCTURAL, NOT INCIDENTAL. A top-level agency manages
    // sub-accounts rather than clients, and `trg_agreement_tier` (migration 20270405000000)
    // refuses the write, so it can never hold an agreement. The read still succeeds and returns
    // zero rows — so without this, PAIGE tells an agency owner "you have no agreements" when the
    // truth is that this account type does not have a client book to hold them.
    // ONLY WHEN NOTHING WAS FILTERED. A tenant converted to a top-level agency after drafting KEEPS
    // its existing agreements — migration 20270405000000:71-74 says so in terms, blocking later
    // writes while preserving the rows. So on a FILTERED read, zero rows means "none matched this
    // filter", and answering "this account holds no agreements of its own" would be false for an
    // agency that is holding some. The structural explanation is only true of the whole book.
    const filtered = contactId !== null || status !== null;
    let agency: boolean | null = null;
    if (!filtered) {
      try { agency = (await input.diagnostics.isAgencyWithoutClientBook?.()) ?? null; } catch { agency = null; }
    }
    if (agency === true) {
      return {
        success: true,
        agreements,
        count: 0,
        emptyReason: "agency_has_no_client_book",
        note: "This account is an agency, which manages sub-accounts rather than a client book, so it holds no agreements of its own. Agreements live in the sub-account that holds the client relationship — switch into it to see them. Do NOT report this as 'no agreements'.",
      };
    }
  }

  return {
    success: true,
    agreements,
    count: agreements.length,
    // The RPC caps at 200 rows (migration 20270402000000). At exactly 200 this cannot tell a capped
    // page from a book that happens to hold 200, so the note claims neither — it states the cap,
    // which is true either way. Asserting "not the complete list" would be a guess at the boundary.
    ...(agreements.length >= 200
      ? { note: "Only the 200 most recently updated agreements are readable here, so there may be more." }
      : {}),
  };
}
