/**
 * `paige-apply-extraction` — the WRITE half of the document proposal seam, DRIVEN.
 *
 * WHY THIS FILE EXISTS. An independent adversarial review found this function had zero coverage:
 * `scripts/extraction-proposal/check.mjs` imports only the shared payload module and never loads
 * the handler, and nothing in vitest touches it. Two mutations proved the cost — removing the
 * concurrent-decline guard from the claim release, and reverting the release to its original
 * silent three-line form — left every suite in the repository green. This is the function that
 * decides whether an approval becomes a write to somebody's credit profile.
 *
 * Only the module boundary is faked (Deno's serve, @supabase/supabase-js, the outbound fetch to
 * `sync-credit-report-data`). The handler itself is the shipped one.
 *
 * Run: node --import ./scripts/apply-extraction/register.mjs scripts/apply-extraction/check.mjs
 */

const USER = "44444444-4444-4444-8444-444444444444";
const UPLOAD = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

let passed = 0;
const failures = [];
const assert = (name, cond, detail = "") => {
  if (cond) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}${detail ? `\n         ${detail}` : ""}`); }
};

globalThis.Deno = {
  env: { get: (k) => ({
    SUPABASE_URL: "https://test.supabase.co", SUPABASE_ANON_KEY: "anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  })[k] ?? "" },
};

/** A believable reading: two plausible scores, one IMPLAUSIBLE one, and some items. */
const STRUCTURED = {
  scores: { equifax: 712, experian: 999, transunion: 698 },
  negative_items: [{ creditor: "A" }, { creditor: "B" }],
  positive_accounts: [{ creditor: "C" }],
  hard_inquiries: [{ creditor: "D" }],
};

let syncCalls = [];
let syncStatus = 200;
// A 2xx body the scenario chooses. `sync-credit-report-data` returns HTTP 200 + success:true and
// records per-group outcomes INSIDE `results` (`scores_error`, `negative_items.failed`), so the
// status line alone cannot say whether an approved group was written.
let syncBody = null;
// A rejected transport (timeout, DNS, a function that is momentarily gone). The claim is already
// stamped `applied` by the time this happens, so nothing but an explicit release makes it
// retryable.
let syncRejects = null;
/** Applied to the live fixture row while the sync is in flight — i.e. between claim and release. */
let mutateDuringSync = null;
globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.includes("sync-credit-report-data")) {
    syncCalls.push(JSON.parse(String(init?.body ?? "{}")));
    if (mutateDuringSync) mutateDuringSync();
    if (syncRejects) throw syncRejects;
    const body = syncBody ?? (syncStatus === 200 ? { success: true, results: DEFAULT_SYNC_RESULTS } : { error: "boom" });
    return new Response(JSON.stringify(body),
      { status: syncStatus, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`apply-extraction: unexpected fetch to ${href}`);
};

/** What a fully-successful sync reports for the groups this fixture ever approves. */
const DEFAULT_SYNC_RESULTS = {
  scores_updated: true,
  negative_items: { inserted: 2, updated: 0, failed: 0 },
  hard_inquiries: { inserted: 1 },
  positive_accounts: { inserted: 1, updated: 0 },
};

const fake = await import("./fake-supabase.mjs");
const fn = await import("../../supabase/functions/paige-apply-extraction/index.ts");
const { capturedHandler } = await import("./stub-serve.mjs");
const handler = capturedHandler();

async function drive({ approved_keys, row = {}, claimReturns, releaseError = null, sync = 200,
                       auth = true, body: syncResultBody = null, rejects = null, claimError = null,
                       duringSync = null }) {
  syncCalls = []; syncStatus = sync; syncBody = syncResultBody; syncRejects = rejects;
  mutateDuringSync = duringSync;
  const rec = fake.setScenario({
    authUser: auth ? { id: USER } : null,
    // `row: null` means the caller CANNOT SEE the upload — RLS returned nothing. Spreading null
    // into the defaults would silently produce a visible row instead, and 8.3 would assert against
    // a fixture that never modelled the case it names.
    uploadRow: row === null ? null : {
      id: UPLOAD, user_id: USER, client_id: null,
      analysis_status: "completed", extraction_review_state: "awaiting_review",
      analysis_result: STRUCTURED, ...row,
    },
    claimReturns, releaseError, claimError,
  });
  const res = await handler(new Request("http://local/paige-apply-extraction", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-jwt" },
    body: JSON.stringify({ upload_id: UPLOAD, approved_keys }),
  }));
  const body = await res.json().catch(() => ({}));
  return { rec, status: res.status, body, syncCalls: [...syncCalls] };
}

// ── 1. THE VALUE COMES FROM THE SERVER, NEVER THE REQUEST — and only what was OFFERED.
{
  // 999 is outside 300–850, so `buildCreditProposal` never offers it. Naming the key anyway must
  // not write it: the person cannot have approved a score they were never shown.
  const r = await drive({ approved_keys: ["credit_score_equifax", "credit_score_experian"] });
  assert("1.1 an approved key that was never OFFERED is not written",
    r.syncCalls.length === 1 && r.syncCalls[0].scores?.experian === undefined,
    JSON.stringify(r.syncCalls[0]?.scores));
  assert("1.2 …while a key that WAS offered is",
    r.syncCalls[0]?.scores?.equifax === 712, JSON.stringify(r.syncCalls[0]?.scores));
  assert("1.3 unapproved collections are sent EMPTY, not silently included",
    Array.isArray(r.syncCalls[0]?.negative_items) && r.syncCalls[0].negative_items.length === 0,
    JSON.stringify(r.syncCalls[0]?.negative_items));
  assert("1.4 derived disputes and discrepancies are never inferred from what was not approved",
    r.syncCalls[0]?.priority_disputes?.length === 0 && r.syncCalls[0]?.discrepancies?.length === 0);
}

// ── 2. A KEY NOBODY DESIGNED cannot be applied however it is spelled.
{
  const r = await drive({ approved_keys: ["profiles.ssn", "credit_score_equifax"] });
  assert("2.1 a key outside the closed set is dropped",
    r.syncCalls.length === 1 && !("ssn" in (r.syncCalls[0] ?? {})),
    JSON.stringify(Object.keys(r.syncCalls[0] ?? {})));
}

// ── 3. THE CLAIM IS A COMPARE-AND-SET, and it happens BEFORE the write.
{
  const r = await drive({ approved_keys: ["negative_items"] });
  const claim = r.rec.updates.find((u) => u.table === "credit_report_uploads");
  assert("3.1 the row is claimed out of awaiting_review before anything is written",
    !!claim && claim.filters.some((f) => f[0] === "eq" && f[1] === "extraction_review_state" && f[2] === "awaiting_review"),
    JSON.stringify(claim?.filters));
  assert("3.2 …and the claim precedes the sync call",
    !!claim && claim.seq < (r.rec.fetchSeq ?? Infinity), `claim@${claim?.seq} fetch@${r.rec.fetchSeq}`);
}

// ── 4. A SECOND APPROVAL OF THE SAME ROW WRITES NOTHING.
{
  const r = await drive({ approved_keys: ["negative_items"], claimReturns: [] });
  assert("4.1 losing the claim performs no write", r.syncCalls.length === 0, JSON.stringify(r.syncCalls));
  assert("4.2 …and is reported to the person as done, not as an error",
    r.status === 200 && r.body.already_applied === true, JSON.stringify(r.body));
}

// ── 5. A ROW ALREADY APPLIED is idempotent; one in another state is refused.
{
  const applied = await drive({ approved_keys: ["negative_items"], row: { extraction_review_state: "applied" } });
  assert("5.1 an already-applied row writes nothing", applied.syncCalls.length === 0 && applied.status === 200);
  const declined = await drive({ approved_keys: ["negative_items"], row: { extraction_review_state: "declined" } });
  assert("5.2 a settled row is refused", declined.status === 409 && declined.syncCalls.length === 0,
    String(declined.status));
}

// ── 6. DECLINING EVERYTHING is a real answer, guarded the same way.
{
  const r = await drive({ approved_keys: [] });
  assert("6.1 declining writes nothing", r.syncCalls.length === 0);
  const upd = r.rec.updates.find((u) => u.table === "credit_report_uploads");
  assert("6.2 …and the decline itself is a compare-and-set, so it cannot stomp another state",
    !!upd && upd.row.extraction_review_state === "declined"
      && upd.filters.some((f) => f[0] === "eq" && f[1] === "extraction_review_state" && f[2] === "awaiting_review"),
    JSON.stringify(upd));
}

// ── 7. A FAILED SYNC RELEASES THE CLAIM — safely.
//
// This is the block the review found unratcheted. Both defects it named are pinned here: the
// release must carry a state predicate so a concurrent decline is not stomped back to
// awaiting_review, and it must read its own error so a release that never landed is not silent.
{
  const r = await drive({ approved_keys: ["negative_items"], sync: 502 });
  const release = r.rec.updates.filter((u) => u.table === "credit_report_uploads").at(-1);
  assert("7.1 a failed sync releases the claim",
    !!release && release.row.extraction_review_state === "awaiting_review", JSON.stringify(release?.row));
  assert("7.2 …only if the row is still the one it claimed (no stomping a concurrent decline)",
    !!release && release.filters.some((f) => f[0] === "eq" && f[1] === "extraction_review_state" && f[2] === "applied"),
    JSON.stringify(release?.filters));
  assert("7.3 …and the person is told nothing was changed", r.status === 502, String(r.status));
}
{
  const r = await drive({ approved_keys: ["negative_items"], sync: 502, releaseError: { message: "denied", code: "42501" } });
  assert("7.4 a release that itself fails is logged, not swallowed",
    r.rec.errors.some((m) => /CLAIM NOT RELEASED/.test(m)), JSON.stringify(r.rec.errors));
}

// ── 8. AUTHORIZATION happens on the CALLER, not on service role.
{
  const r = await drive({ approved_keys: ["negative_items"] });
  const read = r.rec.reads.find((q) => q.table === "credit_report_uploads");
  assert("8.1 the upload is read as the CALLER, so RLS decides what they may approve",
    !!read && read.client === "caller", JSON.stringify(read));
  const anon = await drive({ approved_keys: ["negative_items"], auth: false });
  assert("8.2 an unauthenticated caller writes nothing", anon.status === 401 && anon.syncCalls.length === 0);
}
{
  const missing = await drive({ approved_keys: ["negative_items"], row: null });
  assert("8.3 an upload the caller cannot see is a 404 with no write",
    missing.status === 404 && missing.syncCalls.length === 0, String(missing.status));
}

// ── 9. THE BACKFILL DOES NOT RE-ANALYSE WHAT NOBODY APPROVED ─────────────────────────────────
//
// STATIC, and labelled as such. `backfill-credit-extractions` reads empty `credit_accounts` as
// "needs backfilling" — which is the CORRECT state for an upload still awaiting review — so every
// run would spend a model call per unapproved upload and log a quality grade for data nobody
// accepted. It is also a second door into the auto-population the review gate closed.
//
// Driving it would mean standing up its whole analysis pipeline; the property that matters is one
// predicate on one query, and an independent review proved that deleting that predicate left every
// suite in the repository green. This is the ratchet for it, not a substitute for driving it.
{
  const backfill = await (await import("node:fs/promises")).readFile(
    new URL("../../supabase/functions/backfill-credit-extractions/index.ts", import.meta.url), "utf8");
  const sel = backfill.slice(backfill.indexOf('.from("credit_report_uploads")'),
                             backfill.indexOf("const { data: reports"));
  assert("9.0 the selection under test was found (guards 9.1)",
    sel.includes('analysis_status') && sel.length > 40, `slice length ${sel.length}`);
  assert("9.1 uploads still awaiting a person's review are excluded from the backfill",
    /extraction_review_state[^)]*neq[^)]*awaiting_review|neq[^)]*awaiting_review/.test(sel.replace(/\s+/g, "")),
    sel.trim().slice(0, 200));
  assert("9.2 …and rows predating the review column are still included, since they are what it repairs",
    /extraction_review_state\.is\.null/.test(sel), sel.trim().slice(0, 200));
}

// ── 10. A 2xx IS NOT A WRITE. Partial group failures must not settle as `applied`. ─────────────
//
// `sync-credit-report-data` returns HTTP 200 with `success: true` and records what actually
// happened per group INSIDE `results`: `scores_error` when the profile update was refused,
// `negative_items.failed` when rows could not be inserted. Checking `Response.ok` alone therefore
// marked the upload `applied` and told the card it had saved, while one or more of the things the
// person ticked were never written — and, because `applied` is terminal, there was no way back to
// the proposal to try again. The state has to follow what the sync SAID, not what its status line
// implied.
{
  const r = await drive({
    approved_keys: ["credit_score_equifax", "negative_items"],
    body: { success: true, results: { scores_error: "permission denied for table profiles",
                                      negative_items: { inserted: 2, updated: 0, failed: 0 } } },
  });
  assert("10.1 a scores_error on an approved group is a failure, not a success",
    r.status !== 200 && r.body.ok !== true, `${r.status} ${JSON.stringify(r.body)}`);
  const release = r.rec.updates.filter((u) => u.table === "credit_report_uploads").at(-1);
  assert("10.2 …and the proposal is restored to awaiting_review so it can be retried",
    !!release && release.row.extraction_review_state === "awaiting_review", JSON.stringify(release?.row));
  assert("10.3 …conditionally, so a concurrent decline is not stomped",
    !!release && release.filters.some((f) => f[0] === "eq" && f[1] === "extraction_review_state" && f[2] === "applied"),
    JSON.stringify(release?.filters));
  assert("10.4 …and the answer NAMES what failed rather than saying 'something went wrong'",
    Array.isArray(r.body.failed_groups) && r.body.failed_groups.includes("scores"), JSON.stringify(r.body));
}
{
  const r = await drive({
    approved_keys: ["negative_items"],
    body: { success: true, results: { negative_items: { inserted: 1, updated: 0, failed: 1 } } },
  });
  assert("10.5 a failed negative item is a failure even though the others landed",
    r.status !== 200 && r.body.ok !== true, `${r.status} ${JSON.stringify(r.body)}`);
  assert("10.6 …and it is named",
    Array.isArray(r.body.failed_groups) && r.body.failed_groups.includes("negative_items"), JSON.stringify(r.body));
}
{
  // A group the person did NOT approve cannot make their approval fail.
  const r = await drive({
    approved_keys: ["negative_items"],
    body: { success: true, results: { scores_error: "profiles refused",
                                      negative_items: { inserted: 2, updated: 0, failed: 0 } } },
  });
  assert("10.7 a failure in a group nobody approved does not fail the apply",
    r.status === 200 && r.body.ok === true, `${r.status} ${JSON.stringify(r.body)}`);
}
{
  // The step is missing entirely: the sync never got to the group that was approved.
  const r = await drive({ approved_keys: ["negative_items"], body: { success: true, results: {} } });
  assert("10.8 an approved group the sync never reports on is not assumed written",
    r.status !== 200 && r.body.ok !== true, `${r.status} ${JSON.stringify(r.body)}`);
}
{
  const r = await drive({ approved_keys: ["negative_items"], body: { success: false, results: {} } });
  assert("10.9 success:false is a failure whatever the status line says",
    r.status !== 200 && r.body.ok !== true, `${r.status} ${JSON.stringify(r.body)}`);
}
{
  // §9/§13 — THE FAILURE ANSWER MUST NOT BECOME A LEAK. Naming which groups failed is useful; the
  // sync's raw payload is not the browser's, and a provider/postgres error string can carry column
  // names, row content and internals. The detail belongs in `audit_logs`, the sentence in the card.
  const SECRET = "RAW_PROVIDER_DETAIL_SENTINEL";
  const r = await drive({
    approved_keys: ["credit_score_equifax", "negative_items"],
    body: { success: true, results: {
      scores_error: `duplicate key value violates unique constraint ${SECRET}`,
      negative_items: { inserted: 0, updated: 0, failed: 2, rows: [{ ssn: SECRET }] },
    } },
  });
  const answer = JSON.stringify(r.body);
  assert("10.12 the raw sync payload does not travel back to the browser",
    !answer.includes(SECRET), answer);
  assert("10.13 …but it IS recorded in the audit row, where it belongs",
    r.rec.inserts.some((i) => i.table === "audit_logs" && JSON.stringify(i.row).includes(SECRET)),
    JSON.stringify(r.rec.inserts.map((i) => i.row?.action)));
  assert("10.14 …and the answer still says which groups failed, and that it can be retried",
    Array.isArray(r.body.failed_groups) && r.body.failed_groups.includes("scores")
      && r.body.failed_groups.includes("negative_items") && r.body.retryable === true,
    answer);
}
{
  // The green case must STAY green — this is the regression guard on the check above (§58).
  const r = await drive({ approved_keys: ["credit_score_equifax", "negative_items", "hard_inquiries", "positive_accounts"] });
  assert("10.10 a genuinely complete sync still settles as applied",
    r.status === 200 && r.body.ok === true && Array.isArray(r.body.applied_keys) && r.body.applied_keys.length === 4,
    `${r.status} ${JSON.stringify(r.body)}`);
  const last = r.rec.updates.filter((u) => u.table === "credit_report_uploads").at(-1);
  assert("10.11 …and is NOT released back to awaiting_review",
    !!last && last.row.extraction_review_state === "applied", JSON.stringify(last?.row));
}

// ── 11. A REJECTED TRANSPORT MUST NOT LEAVE THE ROW `applied`. ─────────────────────────────────
//
// The claim is stamped BEFORE the sync is called, deliberately, so two approvals cannot both
// write. But a `fetch` that REJECTS — a timeout, a DNS failure, a function that is briefly gone —
// never reaches the non-OK branch that releases that claim, so the row stayed `applied` with
// nothing applied. Every later attempt then answered `already_applied`: the proposal was lost, and
// the person was told the work was done.
{
  const r = await drive({ approved_keys: ["negative_items"], rejects: new TypeError("error sending request for url") });
  assert("11.1 a rejected sync is reported as a failure, not as success",
    r.status !== 200 && r.body.ok !== true, `${r.status} ${JSON.stringify(r.body)}`);
  const release = r.rec.updates.filter((u) => u.table === "credit_report_uploads").at(-1);
  assert("11.2 …and the claim is RELEASED so the proposal survives",
    !!release && release.row.extraction_review_state === "awaiting_review", JSON.stringify(release?.row));
  assert("11.3 …conditionally, exactly like the non-OK path",
    !!release && release.filters.some((f) => f[0] === "eq" && f[1] === "extraction_review_state" && f[2] === "applied"),
    JSON.stringify(release?.filters));
  assert("11.4 …and the failure is audited rather than vanishing",
    r.rec.inserts.some((i) => i.table === "audit_logs" && i.row.action === "extraction_apply_failed"),
    JSON.stringify(r.rec.inserts.map((i) => i.row?.action)));
}
{
  // A SECOND attempt after the transport failure must be able to proceed — proved as a genuine
  // CONTINUATION, against one row that remembers what the first attempt did to it. A fresh
  // fixture would prove only that a clean row applies, which was never in doubt.
  const rec = fake.setScenario({
    authUser: { id: USER },
    stateful: true,
    uploadRow: {
      id: UPLOAD, user_id: USER, client_id: null, analysis_status: "completed",
      extraction_review_state: "awaiting_review", analysis_result: STRUCTURED,
    },
  });
  const attempt = async () => {
    syncCalls = [];
    const res = await handler(new Request("http://local/paige-apply-extraction", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-jwt" },
      body: JSON.stringify({ upload_id: UPLOAD, approved_keys: ["negative_items"] }),
    }));
    return { status: res.status, body: await res.json().catch(() => ({})), calls: [...syncCalls] };
  };

  syncRejects = new TypeError("error sending request for url"); syncStatus = 200; syncBody = null;
  const first = await attempt();
  assert("11.5 the transport failure is reported honestly",
    first.status === 502 && first.body.ok !== true, `${first.status} ${JSON.stringify(first.body)}`);
  assert("11.6 …and the row it left behind is retryable, not `applied`",
    rec.scenarioRow().extraction_review_state === "awaiting_review",
    rec.scenarioRow().extraction_review_state);

  syncRejects = null;
  const second = await attempt();
  assert("11.7 the SECOND attempt on that same row reaches the sync and applies",
    second.calls.length === 1 && second.status === 200 && second.body.ok === true,
    `${second.calls.length} call(s), ${second.status} ${JSON.stringify(second.body)}`);
  assert("11.8 …leaving the row settled as applied",
    rec.scenarioRow().extraction_review_state === "applied", rec.scenarioRow().extraction_review_state);
}
{
  const r = await drive({ approved_keys: ["negative_items"], rejects: new TypeError("boom"),
                          releaseError: { message: "denied", code: "42501" } });
  assert("11.9 a release that itself fails on the transport path is logged, not swallowed",
    r.rec.errors.some((m) => /CLAIM NOT RELEASED/.test(m)), JSON.stringify(r.rec.errors));
}

// ── 12. THE SENTENCE MAY NOT CLAIM WHAT THIS FUNCTION CANNOT KNOW. ────────────────────────────
//
// Found by independent review of the pushed diff. The partial-failure answer read "Nothing was
// changed — try again." on the ONE branch where that is provably false: it fires when some
// approved groups succeeded and others did not, so scores and rows had in fact been written to
// somebody's credit profile. That is the same fabrication this seam exists to prevent, pointed the
// other way. The transport and non-OK sentences carried the same claim and could not support it
// either — a rejected request does not prove the sync never wrote, and sync's 500 comes from a
// catch wrapping all five write steps.
//
// It also may not name the groups in prose: those are payload keys, and snake-case backend
// identifiers do not belong in copy a person reads (§11). The machine-readable list stays in the
// body and the audit row.
{
  const partial = await drive({
    approved_keys: ["credit_score_equifax", "negative_items"],
    body: { success: true, results: { scores_updated: true,
                                      negative_items: { inserted: 1, updated: 0, failed: 1 } } },
  });
  assert("12.1 a PARTIAL failure never claims nothing was changed",
    !/nothing was changed/i.test(String(partial.body.error)), String(partial.body.error));
  assert("12.2 …and does not put payload keys in front of a person",
    !/negative_items|hard_inquiries|positive_accounts|sync_reported/.test(String(partial.body.error)),
    String(partial.body.error));
  assert("12.3 …while the machine-readable list is still in the body for a consumer",
    Array.isArray(partial.body.failed_groups) && partial.body.failed_groups.includes("negative_items"),
    JSON.stringify(partial.body.failed_groups));
  assert("12.4 …and the sentence still tells the person the proposal is open again",
    /try again/i.test(String(partial.body.error)), String(partial.body.error));
}
{
  const rejected = await drive({ approved_keys: ["negative_items"], rejects: new TypeError("timeout") });
  assert("12.5 a rejected transport does not claim nothing was changed either",
    !/nothing was changed/i.test(String(rejected.body.error)), String(rejected.body.error));
}
{
  const nonOk = await drive({ approved_keys: ["negative_items"], sync: 500 });
  assert("12.6 nor does a non-OK sync, whose 500 can follow partial writes",
    !/nothing was changed/i.test(String(nonOk.body.error)), String(nonOk.body.error));
}
{
  // The one place the claim IS true is kept: the claim update itself failed, so nothing was ever
  // attempted. Removing a true statement would be its own regression (§58).
  const r = await drive({ approved_keys: ["negative_items"], claimError: { message: "deadlock", code: "40P01" } });
  assert("12.7 a failed CLAIM may still say nothing was changed, because nothing was attempted",
    r.status === 500 && /nothing was changed/i.test(String(r.body.error)) && r.syncCalls.length === 0,
    `${r.status} ${JSON.stringify(r.body)}`);
}

// ── 13. A RELEASE THAT MATCHES NO ROW IS NOT A RELEASE. ───────────────────────────────────────
//
// Found by independent review of the pushed diff: this branch — the release runs, postgrest
// returns NO error, and it matched nothing because a concurrent decline moved the row out of
// `applied` — was structurally unreachable in this suite, because the double answered
// `maybeSingle()` with an array and `!![]` is true. So `retryable` could never be observed false
// and the CLAIM NOT RELEASED log could only ever be reached through an explicit error. The double
// now answers the way postgrest does, and this is the scenario that proves the branch exists.
{
  const rec = fake.setScenario({
    authUser: { id: USER },
    stateful: true,
    uploadRow: {
      id: UPLOAD, user_id: USER, client_id: null, analysis_status: "completed",
      extraction_review_state: "awaiting_review", analysis_result: STRUCTURED,
    },
  });
  syncCalls = []; syncStatus = 200; syncBody = null; syncRejects = null;
  // Somebody declines the proposal while the sync is in flight.
  mutateDuringSync = () => { rec.scenarioRow().extraction_review_state = "declined"; };
  syncRejects = new TypeError("error sending request for url");

  const res = await handler(new Request("http://local/paige-apply-extraction", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test-jwt" },
    body: JSON.stringify({ upload_id: UPLOAD, approved_keys: ["negative_items"] }),
  }));
  const body = await res.json().catch(() => ({}));
  mutateDuringSync = null; syncRejects = null;

  assert("13.1 the concurrent decline is NOT stomped back to awaiting_review",
    rec.scenarioRow().extraction_review_state === "declined", rec.scenarioRow().extraction_review_state);
  assert("13.2 …the failed release is reported honestly as not retryable",
    body.retryable === false, JSON.stringify(body));
  assert("13.3 …and it is logged rather than passing silently",
    rec.errors.some((m) => /CLAIM NOT RELEASED/.test(m)), JSON.stringify(rec.errors));
}

// ── 14. THE VALIDATOR'S OWN BRANCHES, driven directly. ────────────────────────────────────────
//
// The handler exercises `syncGroupFailures` through whichever combinations the scenarios above
// happen to reach. These drive its four group branches and its two whole-body verdicts on their
// own, so a branch is not left resting on a scenario that might later be reworded.
{
  const { syncGroupFailures } = fn;
  const none = { scores: {}, negative_items: [], positive_accounts: [], hard_inquiries: [] };
  const ok = { success: true, results: { scores_updated: true,
    negative_items: { inserted: 1, updated: 0, failed: 0 },
    hard_inquiries: { inserted: 1 }, positive_accounts: { inserted: 1, updated: 0 } } };

  assert("14.0 the validator is exported and reachable", typeof syncGroupFailures === "function");
  assert("14.1 an unparseable or unsuccessful body is a whole-apply failure",
    syncGroupFailures([], none, { error: "Could not parse sync response" })[0] === "sync_reported_failure");
  assert("14.2 success:true with no results object is a whole-apply failure",
    syncGroupFailures([], none, { success: true })[0] === "sync_reported_no_results");
  assert("14.3 a fully-successful sync fails nothing",
    syncGroupFailures(["negative_items", "hard_inquiries", "positive_accounts"],
      { scores: { equifax: 712 }, negative_items: [1], positive_accounts: [1], hard_inquiries: [1] },
      ok).length === 0);
  assert("14.4 scores are judged only when a value was actually sent",
    syncGroupFailures(["credit_score_equifax"], none,
      { success: true, results: { scores_error: "refused" } }).length === 0);
  assert("14.5 …and are a failure when one was",
    syncGroupFailures(["credit_score_equifax"], { ...none, scores: { equifax: 712 } },
      { success: true, results: { scores_error: "refused" } }).includes("scores"));
  assert("14.6 …including when the step simply never reported",
    syncGroupFailures(["credit_score_equifax"], { ...none, scores: { equifax: 712 } },
      { success: true, results: {} }).includes("scores"));
  assert("14.7 a group nobody approved is never judged",
    syncGroupFailures([], { ...none, negative_items: [1] },
      { success: true, results: { negative_items: { failed: 3 } } }).length === 0);
  assert("14.8 an approved-but-empty group is never judged",
    syncGroupFailures(["negative_items"], none, { success: true, results: {} }).length === 0);
  assert("14.9 a zero count is NOT a failure — the sync legitimately skips duplicates",
    syncGroupFailures(["hard_inquiries"], { ...none, hard_inquiries: [1] },
      { success: true, results: { hard_inquiries: { inserted: 0 } } }).length === 0);
  assert("14.10 …but a missing report for an approved group is",
    syncGroupFailures(["hard_inquiries", "positive_accounts"],
      { ...none, hard_inquiries: [1], positive_accounts: [1] },
      { success: true, results: {} }).sort().join(",") === "hard_inquiries,positive_accounts");
  assert("14.11 every failed group is named, not just the first",
    syncGroupFailures(["negative_items"], { ...none, scores: { equifax: 712 }, negative_items: [1] },
      { success: true, results: { scores_error: "x", negative_items: { failed: 2 } } }).sort().join(",")
      === "negative_items,scores");
}

// ── 15. AN IMPOSSIBLE RETRY IS NOT OFFERED, AND THE GUARDS GUARD. ─────────────────────────────
{
  // The release matched nothing, so the row is still `applied` and a retry would collect
  // `already_applied` — which the card renders as a completed save. The answer must not invite it.
  const rec = fake.setScenario({
    authUser: { id: USER }, stateful: true,
    uploadRow: { id: UPLOAD, user_id: USER, client_id: null, analysis_status: "completed",
                 extraction_review_state: "awaiting_review", analysis_result: STRUCTURED },
  });
  syncCalls = []; syncStatus = 200; syncBody = null;
  mutateDuringSync = () => { rec.scenarioRow().extraction_review_state = "declined"; };
  syncRejects = new TypeError("timeout");
  const res = await handler(new Request("http://local/paige-apply-extraction", {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer test-jwt" },
    body: JSON.stringify({ upload_id: UPLOAD, approved_keys: ["negative_items"] }),
  }));
  const body = await res.json().catch(() => ({}));
  mutateDuringSync = null; syncRejects = null;
  assert("15.1 a non-retryable failure does not tell the person to try again",
    body.retryable === false && !/try again/i.test(String(body.error)), JSON.stringify(body));
  assert("15.2 …and says the proposal needs a hand instead of going quiet",
    /needs a hand/i.test(String(body.error)), String(body.error));
}
{
  const retryable = await drive({ approved_keys: ["negative_items"], rejects: new TypeError("timeout") });
  assert("15.3 a RETRYABLE failure still invites the retry",
    retryable.body.retryable === true && /try again/i.test(String(retryable.body.error)),
    JSON.stringify(retryable.body));
}
{
  const { syncGroupFailures } = fn;
  const none = { scores: {}, negative_items: [], positive_accounts: [], hard_inquiries: [] };
  assert("15.4 an ARRAY is not a report object",
    syncGroupFailures(["negative_items"], { ...none, negative_items: [1] },
      { success: true, results: { negative_items: [] } }).includes("negative_items"));
  assert("15.5 a non-numeric failure count is a failure, not a value to coerce",
    syncGroupFailures(["negative_items"], { ...none, negative_items: [1] },
      { success: true, results: { negative_items: { failed: "two" } } }).includes("negative_items"));
  assert("15.6 …and NaN is not quietly treated as zero",
    syncGroupFailures(["negative_items"], { ...none, negative_items: [1] },
      { success: true, results: { negative_items: { failed: Number.NaN } } }).includes("negative_items"));
  assert("15.7 a results value that is an array is not a results object",
    syncGroupFailures([], none, { success: true, results: [] })[0] === "sync_reported_no_results");
}

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
