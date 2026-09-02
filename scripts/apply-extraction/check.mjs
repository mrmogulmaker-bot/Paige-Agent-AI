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
globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.includes("sync-credit-report-data")) {
    syncCalls.push(JSON.parse(String(init?.body ?? "{}")));
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
await import("../../supabase/functions/paige-apply-extraction/index.ts");
const { capturedHandler } = await import("./stub-serve.mjs");
const handler = capturedHandler();

async function drive({ approved_keys, row = {}, claimReturns, releaseError = null, sync = 200,
                       auth = true, body: syncResultBody = null, rejects = null }) {
  syncCalls = []; syncStatus = sync; syncBody = syncResultBody; syncRejects = rejects;
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
    claimReturns, releaseError,
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

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
