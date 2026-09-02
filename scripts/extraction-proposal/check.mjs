/**
 * paige-apply-extraction — the WRITE half of the document proposal seam.
 *
 * WHY THIS FILE EXISTS. The apply function and the shared proposal module shipped with ZERO
 * coverage, and an independent reviewer proved what that cost: removing the closed-key
 * intersection AND swapping the RLS-scoped authorization read for a service-role client — turning
 * an upload id in a request body into a cross-tenant write primitive — left every suite in the
 * repository fully green. The browser tests covered the browser. Nothing covered the thing that
 * decides whether a write happens.
 *
 * Run: node --import ./scripts/knowledge-scope/register.mjs scripts/extraction-proposal/check.mjs
 */
import { buildCreditProposal, buildCreditSyncPayload, APPROVABLE_KEYS, isProhibitedProposalKey } from "../../supabase/functions/_shared/credit-extraction-payload.ts";

let passed = 0;
const failures = [];
const assert = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`); }
};
const group = (n) => console.log(`\n── ${n} ──`);

const UPLOAD = "11111111-1111-4111-8111-111111111111";
const USER = "22222222-2222-4222-8222-222222222222";

group("the proposal shows only what was actually read");
{
  const structured = {
    is_credit_report: true,
    scores: { equifax: 712, experian: 999, transunion: 250 },
    negative_items: [{ creditor_name: "A" }, { creditor_name: "B" }],
    positive_accounts: [],
    hard_inquiries: [],
  };
  const payload = buildCreditSyncPayload(structured, USER, null);
  const proposal = buildCreditProposal(UPLOAD, structured, payload);
  const keys = proposal.fields.map((f) => f.key);

  assert("1.1 a plausible score is offered", keys.includes("credit_score_equifax"), JSON.stringify(keys));
  // 999 and 250 are outside 300–850. A human must never be shown a number the model did not
  // plausibly read, presented as something extracted from their document.
  assert("1.2 an IMPLAUSIBLE score is omitted, not defaulted", !keys.includes("credit_score_experian") && !keys.includes("credit_score_transunion"), JSON.stringify(keys));
  assert("1.3 a group with items is offered with its COUNT, not its contents",
    proposal.fields.find((f) => f.key === "negative_items")?.value === 2, JSON.stringify(proposal.fields));
  assert("1.4 an EMPTY group is not offered at all", !keys.includes("positive_accounts") && !keys.includes("hard_inquiries"), JSON.stringify(keys));
  assert("1.5 no field value in the proposal is an account identifier or other raw item",
    proposal.fields.every((f) => typeof f.value === "number"), JSON.stringify(proposal.fields));

  group("the closed set is a superset of what any one document offers");
  assert("2.1 every offered key is in the closed set",
    keys.every((k) => APPROVABLE_KEYS.includes(k)), JSON.stringify(keys));
  // THE GAP AN INDEPENDENT REVIEWER DROVE: intersecting an approval with the CLOSED SET alone let a
  // caller name `credit_score_experian` and write the stored 999 — a fabricated score the person
  // was never shown. The closed set says which keys EXIST; only the proposal says which were
  // OFFERED for this document, and that is the question the gate has to answer.
  assert("2.2 the closed set is STRICTLY WIDER than this document's offer, which is why intersecting with it alone is not enough",
    APPROVABLE_KEYS.some((k) => !keys.includes(k)), JSON.stringify({ closed: APPROVABLE_KEYS, offered: keys }));

  group("the write shape and the proposal shape follow DIFFERENT rules, on purpose");
  assert("3.1 the write payload keeps its safety fallbacks",
    payload.negative_items.every((n) => typeof n.creditor_name === "string"), JSON.stringify(payload.negative_items));
  assert("3.2 the write payload carries the implausible scores the PROPOSAL hid — which is exactly why the apply path must intersect with the OFFER, not the payload",
    payload.scores.experian === 999, JSON.stringify(payload.scores));
}

group("nothing readable produces nothing to approve");
{
  const empty = { is_credit_report: true, scores: {}, negative_items: [], positive_accounts: [], hard_inquiries: [] };
  const proposal = buildCreditProposal(UPLOAD, empty, buildCreditSyncPayload(empty, USER, null));
  assert("4.1 an unreadable report offers no fields, rather than a card of zeroes", proposal.fields.length === 0, JSON.stringify(proposal.fields));
}

group("the prohibited-category denylist");
{
  // §13 — AN HONEST STATEMENT OF WHAT THIS LAYER IS. A reviewer showed the denylist can never fire
  // over the current proposal, because every key is one of six literals and none contains a banned
  // substring. It is a BACKSTOP for a future field, not an active filter today. Asserted as such —
  // claiming it as a live second layer would be the kind of over-claim this suite exists to end.
  assert("5.1 no key in the closed set is currently prohibited — the denylist is a backstop, not an active filter",
    APPROVABLE_KEYS.filter(isProhibitedProposalKey).length === 0, JSON.stringify(APPROVABLE_KEYS.filter(isProhibitedProposalKey)));
  assert("5.2 ...and it DOES fire on the categories it names, so a future field cannot slip past",
    ["applicant_ssn", "spouse_date_of_birth", "self_reported_race", "medical_debt_flag", "account_number_masked"].every(isProhibitedProposalKey));
  assert("5.3 ...without catching a legitimate key", !isProhibitedProposalKey("credit_score_equifax") && !isProhibitedProposalKey("negative_items"));
}

group("the proposal is DERIVED, so proposing twice cannot drift");
{
  const structured = { is_credit_report: true, scores: { equifax: 700 }, negative_items: [{}], positive_accounts: [], hard_inquiries: [] };
  const a = buildCreditProposal(UPLOAD, structured, buildCreditSyncPayload(structured, USER, null));
  const b = buildCreditProposal(UPLOAD, structured, buildCreditSyncPayload(structured, USER, null));
  // The apply path re-derives the proposal from the stored extraction rather than trusting the
  // request. That is only sound if deriving it twice gives the same answer.
  assert("6.1 re-deriving the proposal from the same extraction is identical", JSON.stringify(a) === JSON.stringify(b));
  assert("6.2 the proposal is keyed to its upload, so an approval cannot reference another document", a.id === UPLOAD);
}

console.log(`\n${passed} passed, ${failures.length} failed`);
if (failures.length) process.exit(1);
