import type { SpineEvidenceRpcClient } from "../resolveEvidence.ts";

/**
 * Chat's adapter onto the `business_context.readiness` capability (see ./business_context.ts).
 *
 * Deliberately NOT routed through resolveSpineEvidence/mindEvidence.ts — that machinery projects
 * Rail SIGNAL rows (a durable evidence table with a citation, an outcome ref, a stored history).
 * public.get_business_context_readiness is a live, stateless read straight over Setup's own
 * current record; there is no Rail signal to resolve. Per the Spine Change Request this capability
 * shipped under, Rails involvement is a SEPARATE, later decision ("Rails is used only if a durable
 * Systems Check result/history is needed") — building on the Rail resolver now would invent a
 * signal row this capability was explicitly scoped not to need yet.
 *
 * WHAT THIS RENDERS: status + provenance + freshness for exactly the four fields the contract
 * exposes (website, business_phone, industry, primary_business_email). Never a raw value — the
 * RPC itself never returns one (§9 narrow projection, see the migration header for why).
 */

export type BusinessContextFieldStatus =
  | "owner_confirmed"
  | "connection_sourced"
  | "needs_confirmation"
  | "invalid_format"
  | "unavailable";

type ReadinessRow = {
  field_key: string;
  status: BusinessContextFieldStatus;
  source: string | null;
  as_of: string | null;
  reason: string | null;
};

export type BusinessContextReadinessEvidence =
  | { readonly status: "available"; readonly rows: readonly ReadinessRow[] }
  | { readonly status: "unavailable"; readonly reason: string }
  /** The contract deliberately refused this caller (a non-staff role — see the role gate in
   *  20261111000000_business_context_readiness.sql). Distinct from "unavailable" on purpose: a
   *  refusal renders NOTHING, because a client chatting with their coach's PAIGE should not be
   *  told the coach's setup status is unreadable — that is not their conversation. A genuine read
   *  failure still renders the honest block, so PAIGE says "I can't check" instead of guessing. */
  | { readonly status: "not_permitted" };

const FIELD_LABEL: Record<string, string> = {
  website: "Website",
  business_phone: "Business phone",
  industry: "Industry",
  primary_business_email: "Primary business email",
};

/** One honest sentence per status — this is the ONE place that vocabulary is written, so PAIGE's
 *  chat framing and any future consumer of this evidence never invent their own wording for the
 *  same status (§18). Every sentence names what IS true, never implies more than the row proves. */
function statusSentence(row: ReadinessRow): string {
  switch (row.status) {
    case "owner_confirmed":
      return `confirmed in Setup${row.as_of ? ` (as of ${row.as_of})` : ""}.`;
    case "connection_sourced":
      return "present from a connected account, but not yet confirmed by the owner in Setup.";
    case "needs_confirmation":
      return "not entered yet — the owner has not saved this in Setup.";
    case "invalid_format":
      return "entered in Setup, but does not look like a valid value — ask the owner to re-check it.";
    case "unavailable":
    default:
      return `could not be read right now${row.reason ? ` (${row.reason})` : ""} — do not report this as missing or confirmed; say it is unknown.`;
  }
}

/** The exact reason string the SQL role gate returns on a refusal. Matched, not guessed — if the
 *  migration's wording ever changes without this constant, the refusal degrades to the honest
 *  UNAVAILABLE block, which is noisy but never a leak. */
const REFUSED_REASON = "not permitted for this account";

export async function loadBusinessContextReadinessForChat(
  client: SpineEvidenceRpcClient,
): Promise<BusinessContextReadinessEvidence> {
  try {
    const { data, error } = await client.rpc("get_business_context_readiness", {});
    if (error) return { status: "unavailable", reason: "read_failed" };
    const rows = (Array.isArray(data) ? data : []) as ReadinessRow[];
    if (!rows.length) return { status: "unavailable", reason: "no_rows" };
    // Every row refused ⇒ the role gate turned this caller away. Render nothing (see the type).
    if (rows.every((row) => row.status === "unavailable" && row.reason === REFUSED_REASON)) {
      return { status: "not_permitted" };
    }
    return { status: "available", rows };
  } catch {
    return { status: "unavailable", reason: "read_failed" };
  }
}

const HEADER = "=== BUSINESS CONTEXT READINESS (Setup, via Systems Check) ===";
const FOOTER = "=== END BUSINESS CONTEXT READINESS ===";

const UNAVAILABLE = [
  HEADER,
  "Status: UNAVAILABLE",
  "This workspace's Setup status could not be read for this turn. Do not say a field is missing or confirmed — say you can't check right now.",
  FOOTER,
].join("\n");

/** Render the evidence for the model. §13: every line states only what the row proves — never
 *  "missing" for a field the row marks confirmed, and never "confirmed" for anything else. */
export function renderBusinessContextReadinessForChat(evidence: BusinessContextReadinessEvidence): string {
  if (evidence.status === "not_permitted") return "";
  if (evidence.status === "unavailable") return UNAVAILABLE;

  const lines = evidence.rows.map((row) => {
    const label = FIELD_LABEL[row.field_key] ?? row.field_key;
    return `- ${label}: ${statusSentence(row)}`;
  });

  return [
    HEADER,
    ...lines,
    "This is Setup's CURRENT record, read fresh for this turn — not an old scan. Use only these statuses; do not guess a raw value that isn't shown elsewhere in your context. To change any of these, the owner edits them in Setup (Settings → Setup) — you do not write them here.",
    FOOTER,
  ].join("\n");
}

export async function buildBusinessContextReadinessBlock(client: SpineEvidenceRpcClient): Promise<string> {
  return renderBusinessContextReadinessForChat(await loadBusinessContextReadinessForChat(client));
}
