// ONE HOME for the credit-report sync payload (§18).
//
// WHY THIS MOVED OUT OF THE CHAT HANDLER. A credit report dropped into chat used to be extracted
// and written to eight tables in the same breath, with no person asked. It now produces a PROPOSAL
// that a human reviews, and the write happens later, in `paige-apply-extraction`, only if they say
// yes.
//
// That splits one code path into two — the one that PROPOSES and the one that WRITES — and the
// whole point of the split is that the human approves exactly what gets written. If each side built
// its own payload from the stored extraction, the two could drift, and the drift would be invisible:
// the person would approve a summary derived from one mapping while a different mapping decided the
// rows. So the mapping lives here, both sides call it, and the payload is DERIVED from the stored
// extraction on both sides rather than stored twice in two places that can disagree.
//
// This is a pure function over already-validated input. It performs no I/O, reads no environment,
// and makes no authorization decision — the caller owns all three.

/** The exact request body `sync-credit-report-data` expects. Unchanged from what the chat handler
 *  used to send inline, so the four non-chat producers of that endpoint are unaffected (§37). */
export interface CreditSyncPayload {
  target_user_id: string;
  client_id: string | null;
  report_type: string;
  scores: Record<string, unknown>;
  negative_items: Record<string, unknown>[];
  hard_inquiries: Record<string, unknown>[];
  positive_accounts: Record<string, unknown>[];
  average_account_age_months: unknown;
  oldest_account_age_months: unknown;
  oldest_account_date: unknown;
  discrepancies: unknown[];
  priority_disputes: Record<string, unknown>[];
  fraud_alerts: unknown[];
  security_freezes: unknown[];
}

/**
 * Maps a validated extraction onto the sync contract.
 *
 * The `|| "Unknown"` and `?? true` fallbacks are deliberate and are NOT uncertainty-hiding: this is
 * the WRITE shape, where a null creditor name would violate the destination's own constraints. The
 * PROPOSAL a human reads never uses these defaults — it omits what was not read, so nobody is shown
 * a fabricated value as something extracted from their document. Two different jobs, two different
 * rules, kept apart on purpose.
 */
export function buildCreditSyncPayload(
  structured: Record<string, any>,
  targetUserId: string,
  clientId: string | null,
): CreditSyncPayload {
  return {
    target_user_id: targetUserId,
    client_id: clientId || null,
    report_type: structured.report_type || "consumer",
    scores: structured.scores,
    negative_items: (structured.negative_items || []).map((n: any) => ({
      creditor_name: n.creditor_name || n.account_name || "Unknown",
      account_number_masked: n.account_number_masked || n.account_number || null,
      bureau: n.bureau || "TransUnion",
      item_type: n.item_type || "other",
      amount: n.amount || n.balance || null,
      date_of_occurrence: n.date_of_occurrence || n.date_of_last_activity || null,
      date_reported: n.date_reported || null,
      dispute_basis: n.dispute_basis || null,
      estimated_score_impact: n.estimated_score_impact || null,
      status: n.status || "active",
      is_cross_bureau_discrepancy: n.is_cross_bureau_discrepancy || false,
    })),
    hard_inquiries: (structured.hard_inquiries || []).map((i: any) => ({
      creditor_name: i.creditor_name,
      inquiry_date: i.inquiry_date,
      bureau: i.bureau,
      is_authorized: i.is_authorized ?? true,
    })),
    positive_accounts: (structured.positive_accounts || []).map((a: any) => ({
      creditor: a.creditor || a.account_name || "Unknown",
      account_type: a.account_type || "revolving",
      balance: a.balance || a.current_balance || null,
      credit_limit: a.credit_limit || null,
      utilization: a.utilization || null,
      status: a.status || "current",
      account_open_date: a.account_open_date || a.date_opened || null,
      is_open: a.is_open ?? true,
      payment_status: a.payment_status || null,
      account_number_masked: a.account_number_masked || a.account_number || null,
    })),
    average_account_age_months: structured.average_account_age_months || null,
    oldest_account_age_months: structured.oldest_account_age_months || null,
    oldest_account_date: structured.oldest_account_date || null,
    discrepancies: structured.discrepancies || [],
    priority_disputes: (structured.priority_disputes || []).map((d: any) => ({
      account_name: d.account_name,
      bureau: d.bureau,
      dispute_basis: d.dispute_basis,
    })),
    fraud_alerts: structured.fraud_alerts || [],
    security_freezes: structured.security_freezes || [],
  };
}

/**
 * PROHIBITED SENSITIVE CATEGORIES — never proposed to a human, whatever a model returns.
 *
 * Owner ruling: "exclude prohibited sensitive categories and preserve uncertainty instead of
 * guessing." There was no exclusion list anywhere on this path before: no redaction was applied to
 * document text, to model output, to `client_memory.content`, or to the extracted object.
 *
 * A DENYLIST OF KEY NAMES, matched as a substring, not a classifier over values — a value-based
 * classifier on free text is a guess, and a wrong guess here is the failure this exists to prevent.
 * Substring matching is what makes `spouse_date_of_birth` and `applicant_ssn` both caught.
 *
 * HONEST BOUND: a key nobody thought of gets through. That is why it is the SECOND layer. The first
 * is that the proposal is built from a CLOSED list of field builders, so a novel key has to be
 * deliberately added by a person before it can ever reach a human.
 *
 * Race, ethnicity, religion, politics, sexual orientation, health, disability, biometrics, union
 * membership and immigration status are here because they are special categories under GDPR Art. 9
 * and its US analogues. The identifiers are here because a credit report is exactly the kind of
 * document that carries them.
 */
export const PROHIBITED_PROPOSAL_KEYS = [
  "ssn", "social_security", "tax_id", "ein", "itin",
  "date_of_birth", "dob", "birth_date",
  "drivers_license", "passport", "national_id",
  "race", "ethnic", "religio", "politic", "sexual_orientation", "gender_identity",
  "health", "medical", "diagnos", "disabilit", "pregnan",
  "biometric", "fingerprint", "genetic",
  "union_member", "immigration", "citizenship", "veteran",
  "account_number", "routing", "card_number", "cvv", "password", "secret", "token",
];

export function isProhibitedProposalKey(key: string): boolean {
  const k = key.toLowerCase();
  return PROHIBITED_PROPOSAL_KEYS.some((banned) => k.includes(banned));
}

/** The closed set of approvable groups. A key absent from here can never be applied, whatever a
 *  request body claims — see `paige-apply-extraction`. */
export const APPROVABLE_KEYS = [
  "credit_score_equifax",
  "credit_score_experian",
  "credit_score_transunion",
  "negative_items",
  "positive_accounts",
  "hard_inquiries",
] as const;
export type ApprovableKey = typeof APPROVABLE_KEYS[number];

const inScoreRange = (v: unknown): v is number => typeof v === "number" && v >= 300 && v <= 850;

/**
 * Turns a validated extraction into the fields a person is asked to approve.
 *
 * UNCERTAINTY IS PRESERVED, NOT GUESSED. A value the model did not actually read is OMITTED rather
 * than defaulted. Showing "Equifax: 0" because a field was missing would present a fabricated number
 * to a human as something extracted from their document — the precise failure the owner's ruling
 * names. The item rows report HOW MANY were found, which is a fact about the extraction rather than
 * a claim about any one account.
 */
export function buildCreditProposal(
  uploadId: string,
  structured: Record<string, any>,
  payload: CreditSyncPayload,
) {
  const scores = structured?.scores ?? {};
  const fields: Array<{ key: string; label: string; value: string | number | boolean | null; displayValue?: string }> = [];

  const pushScore = (key: ApprovableKey, label: string, raw: unknown) => {
    if (!inScoreRange(raw)) return; // absent or implausible means WE DO NOT KNOW
    fields.push({ key, label, value: raw, displayValue: String(raw) });
  };
  pushScore("credit_score_equifax", "Equifax score", scores.equifax);
  pushScore("credit_score_experian", "Experian score", scores.experian);
  pushScore("credit_score_transunion", "TransUnion score", scores.transunion);

  const counts: Array<[ApprovableKey, string, unknown[], (n: number) => string]> = [
    ["negative_items", "Negative items to record", payload.negative_items, (n) => `${n} item${n === 1 ? "" : "s"}`],
    ["positive_accounts", "Open accounts to record", payload.positive_accounts, (n) => `${n} account${n === 1 ? "" : "s"}`],
    ["hard_inquiries", "Hard inquiries to record", payload.hard_inquiries, (n) => `${n} ${n === 1 ? "inquiry" : "inquiries"}`],
  ];
  for (const [key, label, arr, fmt] of counts) {
    const n = Array.isArray(arr) ? arr.length : 0;
    if (n > 0) fields.push({ key, label, value: n, displayValue: fmt(n) });
  }

  return {
    id: uploadId,
    source: "document" as const,
    documentType: "Credit report",
    intro: "I read this report. Nothing has been saved to the profile yet — tell me which of these to record and I'll do just those.",
    fields: fields.filter((f) => !isProhibitedProposalKey(f.key)),
  };
}
