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
let syncFetchThrows = false;
globalThis.fetch = async (url, init) => {
  const href = String(url);
  if (href.includes("sync-credit-report-data")) {
    syncCalls.push(JSON.parse(String(init?.body ?? "{}")));
    // A TRANSPORT REJECTION: the fetch itself throwing before any response (DNS, reset, timeout) —
    // distinct from a non-2xx response, and the case #729 finding 3 left unhandled.
    if (syncFetchThrows) throw new TypeError("network error: connection reset");
    return new Response(JSON.stringify(syncStatus === 200 ? { success: true } : { error: "boom" }),
      { status: syncStatus, headers: { "Content-Type": "application/json" } });
  }
  throw new Error(`apply-extraction: unexpected fetch to ${href}`);
};

const fake = await import("./fake-supabase.mjs");
await import("../../supabase/functions/paige-apply-extraction/index.ts");
const { capturedHandler } = await import("./stub-serve.mjs");
const handler = capturedHandler();

async function drive({ approved_keys, row = {}, claimReturns, releaseError = null, sync = 200, syncThrows = false, auth = true }) {
  syncCalls = []; syncStatus = sync; syncFetchThrows = syncThrows;
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
  let res, body;
  try {
    res = await handler(new Request("http://local/paige-apply-extraction", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test-jwt" },
      body: JSON.stringify({ upload_id: UPLOAD, approved_keys }),
    }));
    body = await res.json().catch(() => ({}));
  } catch (err) {
    // Deno's `serve` returns 500 when a handler THROWS. Model that here so an un-caught handler
    // throw is a testable outcome (status 500, no claim released) rather than a crashed run — which
    // is exactly the pre-fix behaviour of the transport-rejection path #729 finding 3 names.
    syncFetchThrows = false;
    return { rec, status: 500, body: { error: String(err?.message ?? err) }, threw: true, syncCalls: [...syncCalls] };
  }
  syncFetchThrows = false;
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

// ── 7b. A TRANSPORT REJECTION releases the claim too (#729 finding 3). The fetch THROWING before
// any response is not the same as a non-2xx response, and only the latter released the claim. This
// handler has NO outer try/catch around the write (the one at the top only guards body parsing), so
// a rejection escaped `serve` and left the row `applied` with nothing applied. Fails on pre-fix
// source: there `drive` reports status 500 (the un-caught throw) and no release update is recorded.
{
  const r = await drive({ approved_keys: ["negative_items"], syncThrows: true });
  const release = r.rec.updates.filter((u) => u.table === "credit_report_uploads").at(-1);
  assert("7.5 a transport rejection releases the claim (not left `applied` with nothing applied)",
    !!release && release.row.extraction_review_state === "awaiting_review", JSON.stringify(release?.row));
  assert("7.6 …conditional on the row still being the one it claimed (no stomping a concurrent decline)",
    !!release && release.filters.some((f) => f[0] === "eq" && f[1] === "extraction_review_state" && f[2] === "applied"),
    JSON.stringify(release?.filters));
  assert("7.7 …and the person is told nothing was changed, not reported success",
    r.status === 502 && r.body?.ok !== true, `status ${r.status} body ${JSON.stringify(r.body)}`);
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

console.log(`\n${passed} passed, ${failures.length} failed`);
process.exit(failures.length === 0 ? 0 : 1);
