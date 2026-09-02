// paige-apply-extraction — the WRITE half of the document proposal seam.
//
// Owner ruling: "any profile/client update is a clear human-reviewed proposal. Never auto-write
// extracted fields." `paige-ai-chat` now stops at the proposal. This is what runs when a person
// looks at that proposal and says yes.
//
// THE ONE RULE THAT SHAPES EVERYTHING HERE: THE REQUEST CANNOT SUPPLY A VALUE.
// It supplies an upload id and a list of field KEYS. Every value written is re-read from the
// extraction this server stored when it produced the proposal. If approval carried values, the
// browser would be deciding what lands on a credit profile, and the human would be approving one
// thing while the server wrote whatever came back — which is not an approval, it is a form post
// wearing one. The key list is intersected with a CLOSED set (`APPROVABLE_KEYS`), so a key nobody
// designed cannot be applied however it is spelled in the body.
//
// §9 — the caller is authorized against the upload row itself, on their OWN JWT, before anything
// is read. The service-role client is used only AFTER that check passes, and only to call the
// owning contract.
//
// §37 — `sync-credit-report-data` is called with exactly the payload shape its four other
// producers send. That contract is untouched by this slice.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.75.0";
import { z } from "https://esm.sh/zod@3.22.4";
import { APPROVABLE_KEYS, buildCreditProposal, buildCreditSyncPayload } from "../_shared/credit-extraction-payload.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const bodySchema = z.object({
  upload_id: z.string().uuid(),
  // What the person ticked. An empty list is a legitimate outcome — "none of these" — and is
  // treated as a decline rather than an error.
  approved_keys: z.array(z.string().max(64)).max(32),
});

/**
 * Which owner-approved groups the sync did NOT actually write.
 *
 * §13 — A 2xx IS NOT A WRITE, AND THIS IS THE FUNCTION THAT SAYS SO. `sync-credit-report-data`
 * answers HTTP 200 with `success: true` and records what really happened per group INSIDE
 * `results`: `scores_error` when the profile update was refused, `negative_items.failed` when rows
 * could not be inserted. Reading only `Response.ok` therefore stamped the upload `applied` and told
 * the person their ticked fields were saved when one or more of them never landed — and `applied`
 * is terminal, so the proposal could not be retried. The card said "Done"; the profile disagreed.
 *
 * WHAT THIS CAN HONESTLY DETECT — WHICH IS LESS THAN AN EARLIER DRAFT OF THIS COMMENT CLAIMED.
 * That draft said "for scores and negative items the sync reports a real outcome, so those are
 * checked properly", and independent review drove the callee and proved it an overclaim (§13).
 * Read against `sync-credit-report-data` as it actually is, this detects EXACTLY:
 *
 *   • a scores step that ERRORED — `results.scores_error` is set from the profiles update's own
 *     error (sync:317). It does NOT detect an update that succeeded and matched NO ROW, because
 *     the callee sets `scores_updated: true` on a clean error-free update either way.
 *   • a negative item that failed to INSERT — `negative_items.failed` is incremented on an insert
 *     error and on an unrecognised bureau (sync:376, :440). It does NOT detect a failed UPDATE of
 *     an existing item: that branch increments `negativeItemsUpdated` without reading its error
 *     (sync:412-425).
 *   • a group the callee did not report on at all — a malformed or truncated 200.
 *
 * It CANNOT detect a failed inquiry or positive-account write. The callee discards those errors and
 * increments unconditionally (sync:456-462, :541-549), so no caller of that contract can see them;
 * for those two groups the presence check is all there is, and on a well-formed body it always
 * passes. Only the groups the person ACTUALLY approved are judged — a `scores_error` on an apply
 * that never asked for scores is not that person's failure.
 *
 * THE REMAINING GAP IS THE CALLEE'S, and it is named rather than papered over: closing it means
 * `sync-credit-report-data` counting the errors it currently throws away, which changes a contract
 * with five producers and is not in this repair's scope (§37). Until then, an approval of only
 * inquiries or only positive accounts can still settle as `applied` with nothing written, and this
 * function has no way to know.
 *
 * A count of zero is NOT treated as failure: sync filters incomplete rows out before its loops, and
 * an inquiry that already exists is skipped by design, so `inserted: 0` is a perfectly legitimate
 * re-apply. Only a reported failure, or a missing report for a group that was asked for, counts.
 */
export function syncGroupFailures(
  approvedKeys: Iterable<string>,
  scoped: {
    scores: Record<string, unknown>;
    negative_items: unknown[];
    positive_accounts: unknown[];
    hard_inquiries: unknown[];
  },
  syncBody: unknown,
): string[] {
  /** A postgrest-style report object: not null, not an array, not a primitive. */
  const isReport = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);

  const b = (syncBody ?? {}) as Record<string, unknown>;
  // The sync's own top-level verdict. Anything other than an explicit success — including an
  // unparseable body — is a failure, never an assumption in our favour.
  if (b.success !== true) return ["sync_reported_failure"];
  const results = b.results;
  if (!isReport(results)) return ["sync_reported_no_results"];
  const r = results as Record<string, any>;
  const approved = new Set(approvedKeys);
  const failed: string[] = [];

  // Scores: only when a value was actually sent (an approved-but-absent score sends nothing).
  if (Object.keys(scoped.scores).length > 0) {
    if (r.scores_error != null || r.scores_updated !== true) failed.push("scores");
  }
  // Negative items: the one group with a real per-row failure counter.
  if (approved.has("negative_items") && scoped.negative_items.length > 0) {
    const n = r.negative_items;
    if (!isReport(n)) failed.push("negative_items");
    else {
      // A count that is present but not a number means the contract moved under us. It is treated
      // as a failure rather than coerced: `Number("two") > 0` is false, so the permissive reading
      // would have waved through exactly the case it could not understand.
      const failedCount = n.failed ?? 0;
      if (typeof failedCount !== "number" || !Number.isFinite(failedCount) || failedCount > 0) {
        failed.push("negative_items");
      }
    }
  }
  // Inquiries / positive accounts: presence of the report is all this contract can prove.
  if (approved.has("hard_inquiries") && scoped.hard_inquiries.length > 0 && !isReport(r.hard_inquiries)) {
    failed.push("hard_inquiries");
  }
  if (approved.has("positive_accounts") && scoped.positive_accounts.length > 0 && !isReport(r.positive_accounts)) {
    failed.push("positive_accounts");
  }
  return failed;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Sign in and try again." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // The caller's own client. Every authorization read below happens on THIS one, so RLS applies
  // and `auth.uid()` is the real caller — not a service-role context where both are absent.
  const asCaller = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await asCaller.auth.getUser();
  if (authError || !user) return json({ error: "Sign in and try again." }, 401);

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return json({ error: "That request didn't look right. Try approving from the card again." }, 400);
  }

  // ── Authorization: the caller must be able to SEE this upload on their own credentials. ──
  // RLS on `credit_report_uploads` decides that, which is why this read is on `asCaller`. A
  // service-role read here would return any row to anyone and turn an id in a request body into a
  // cross-tenant write primitive (§59 — the grant is never the guard).
  const { data: upload, error: uploadErr } = await asCaller
    .from("credit_report_uploads")
    .select("id, user_id, client_id, analysis_status, extraction_review_state, analysis_result")
    .eq("id", body.upload_id)
    .maybeSingle();

  if (uploadErr) {
    console.error("[apply-extraction] upload read failed:", uploadErr.message);
    return json({ error: "I couldn't open that document record. Try again in a moment." }, 500);
  }
  if (!upload) {
    // Deliberately the same answer for "does not exist" and "not yours": a different message for
    // each turns this endpoint into a probe for which upload ids are real.
    return json({ error: "I couldn't find that document in this workspace." }, 404);
  }

  if (upload.extraction_review_state === "applied") {
    // Idempotent by state. A double-tap on Approve, or a retry after a dropped response, must not
    // write the same report twice — `sync-credit-report-data` upserts by account, but inquiries
    // and negative items would duplicate.
    return json({ ok: true, already_applied: true, applied_keys: [] });
  }
  if (upload.extraction_review_state !== "awaiting_review") {
    return json({ error: "That document isn't waiting for review any more." }, 409);
  }

  const structured = upload.analysis_result as Record<string, any> | null;
  if (!structured || typeof structured !== "object") {
    return json({ error: "I no longer have the reading of that document, so there's nothing to apply." }, 409);
  }

  // ── Rebuild the payload AND the proposal from the stored extraction. ──
  // The proposal is re-derived rather than trusted from the request, so what is approvable here is
  // exactly what a person could have been shown.
  const payload = buildCreditSyncPayload(structured, upload.user_id as string, (upload.client_id as string | null) ?? null);
  const proposal = buildCreditProposal(String(upload.id), structured, payload);
  const offered = new Set(proposal.fields.map((f) => f.key));

  // ── The key list, intersected with what was ACTUALLY OFFERED — not merely with the closed set. ──
  //
  // §13 — INTERSECTING WITH `APPROVABLE_KEYS` ALONE WAS NOT ENOUGH, and an independent reviewer
  // drove the gap. `buildCreditProposal` deliberately OMITS a score outside 300–850, because a
  // value the model did not plausibly read must never be shown to a human as something extracted
  // from their document. But the apply path checked only "is this key in the closed set" and "is
  // the value non-null" — so naming `credit_score_experian` in the request body wrote a stored 999
  // straight onto `profiles`, a fabricated score the person was never shown and could not have
  // approved.
  //
  // The closed set says which keys EXIST. The proposal says which keys were OFFERED for this
  // document. Only the second is an answer to "what could this person have agreed to", and it is
  // the one the gate needs.
  const approved = new Set(
    body.approved_keys.filter((k): k is typeof APPROVABLE_KEYS[number] =>
      (APPROVABLE_KEYS as readonly string[]).includes(k) && offered.has(k)),
  );

  const admin = createClient(supabaseUrl, serviceKey);

  if (approved.size === 0) {
    // Declining everything is a real answer, not a failure. Guarded like the apply path so a
    // decline cannot overwrite a state something else already moved, and audited for the same
    // reason an apply is: "the person said no" is a decision worth being able to reconstruct.
    const { data: declined } = await admin
      .from("credit_report_uploads")
      .update({ extraction_review_state: "declined" })
      .eq("id", body.upload_id)
      .eq("extraction_review_state", "awaiting_review")
      .select("id");
    if (declined?.length) {
      const { error: declineAuditErr } = await admin.from("audit_logs").insert({
        user_id: user.id,
        entity: "credit_report",
        entity_id: body.upload_id,
        action: "extraction_declined",
        data: { offered_keys: [...offered], source: "paige_chat_extraction_proposal" },
      });
      if (declineAuditErr) console.error("[apply-extraction] decline audit write failed:", declineAuditErr.message);
    }
    return json({ ok: true, declined: true, applied_keys: [] });
  }

  const scores: Record<string, unknown> = {};
  if (approved.has("credit_score_equifax") && payload.scores?.equifax != null) scores.equifax = payload.scores.equifax;
  if (approved.has("credit_score_experian") && payload.scores?.experian != null) scores.experian = payload.scores.experian;
  if (approved.has("credit_score_transunion") && payload.scores?.transunion != null) scores.transunion = payload.scores.transunion;

  const scoped = {
    ...payload,
    scores,
    negative_items: approved.has("negative_items") ? payload.negative_items : [],
    positive_accounts: approved.has("positive_accounts") ? payload.positive_accounts : [],
    hard_inquiries: approved.has("hard_inquiries") ? payload.hard_inquiries : [],
    // Disputes and discrepancies are DERIVED from items the person may not have approved, so they
    // are dropped rather than inferred. Proposing them separately is a later decision, not one to
    // make silently here.
    priority_disputes: [],
    discrepancies: [],
  };

  // ── CLAIM THE ROW FIRST, then write. ──
  //
  // §13 — THE PREVIOUS ORDER WAS READ-THEN-WRITE AND ITS IDEMPOTENCE WAS DECORATIVE. The
  // `already_applied` check above ran against a row that was only stamped `applied` AFTER the sync
  // returned, and the stamp had no state predicate. An independent reviewer fired two approvals of
  // the same row concurrently: both returned 200 and both reached the sync. The only thing standing
  // between a double-tap and duplicated `credit_inquiries` and `credit_negative_items` rows was the
  // browser card disabling its own button.
  //
  // The update below is a compare-and-set: it moves the row out of `awaiting_review` and returns
  // the row only if IT made that transition. A second caller finds nothing to claim and stops. The
  // status is rolled back on a sync failure so the person can retry rather than lose the proposal —
  // which is why the claim is a distinct state rather than the final one.
  const { data: claimed, error: claimErr } = await admin
    .from("credit_report_uploads")
    .update({ extraction_review_state: "applied", last_analyzed_at: new Date().toISOString() })
    .eq("id", body.upload_id)
    .eq("extraction_review_state", "awaiting_review")
    .select("id");
  if (claimErr) {
    console.error("[apply-extraction] claim failed:", claimErr.message);
    return json({ error: "I couldn't save those just now. Nothing was changed — try again." }, 500);
  }
  if (!claimed?.length) {
    // Somebody else claimed it between the read above and here. Not an error to the person: the
    // thing they asked for is happening.
    return json({ ok: true, already_applied: true, applied_keys: [] });
  }

  // ── ONE FAILURE PATH, THREE WAYS TO REACH IT. ──
  //
  // Audit what went wrong, RELEASE THE CLAIM so the person can try again rather than losing the
  // proposal, and answer honestly. Without the release a failure leaves the row `applied` with
  // nothing applied — the worst of both, terminal, and unrecoverable from the card.
  //
  // TWO THINGS THIS RELEASE HAS TO GET RIGHT, both found by review of the pushed diff.
  // It reads its own error, because postgrest RESOLVES a rejection rather than throwing — a
  // release that silently failed would leave exactly the unrecoverable state this exists to
  // prevent, and say nothing. And it is CONDITIONAL on the row still being `applied`: without that
  // predicate a concurrent decline would be stomped back to `awaiting_review`, resurrecting a
  // proposal the person had just dismissed.
  //
  // It is one function rather than three copies because the transport-rejection path was added by
  // review, and a fourth caller that forgets one of those two predicates is exactly how this
  // regresses.
  const releaseAndFail = async (
    auditData: Record<string, unknown>,
    message: string,
    extra: Record<string, unknown> = {},
  ) => {
    const { error: failAuditErr } = await admin.from("audit_logs").insert({
      user_id: user.id,
      entity: "credit_report",
      action: "extraction_apply_failed",
      entity_id: body.upload_id,
      data: { ...auditData, approved_keys: [...approved], source: "paige_chat_extraction_proposal" },
    });
    if (failAuditErr) console.error("[apply-extraction] failure audit write failed:", failAuditErr.message);

    const { data: released, error: relErr } = await admin.from("credit_report_uploads")
      .update({ extraction_review_state: "awaiting_review" })
      .eq("id", body.upload_id)
      .eq("extraction_review_state", "applied")
      .select("id").maybeSingle();
    if (relErr || !released) {
      console.error("[apply-extraction] CLAIM NOT RELEASED", JSON.stringify({
        upload_id: body.upload_id,
        code: relErr?.code ?? null,
        message: relErr?.message ?? (released ? null : "row was no longer claimed"),
      }));
    }
    // `retryable` reports what the RELEASE actually achieved, not what it attempted (§13).
    //
    // HONEST LIMIT: nothing reads this yet. It is truthful data in the answer and in the audit
    // trail, but it does NOT close the hole it describes — when a release fails, the row stays
    // `applied`, and the next attempt takes the `already_applied` branch above and answers 200,
    // which the card renders as "Done". Closing that means changing how the card treats an
    // `already_applied` it did not itself cause, which is a change to the approval path and
    // outside these five repairs. It is recorded as an open finding rather than implied fixed.
    const retryable = !relErr && !!released;
    // §13 — DO NOT SAY "try again" WHEN THE RETRY CANNOT WORK. If the release did not land the row
    // is still `applied`, so the next attempt takes the `already_applied` branch and answers 200 —
    // which the card renders as a completed save. Independent review drove exactly that sequence.
    // Suppressing the invitation does not close that hole (see the note below); it stops this
    // answer actively walking a person into it.
    const answer = retryable ? message : `${message.replace(/ Take a look and try again\.$/i, "")} I couldn't reopen it either, so it needs a hand.`;
    return json({ error: answer, retryable, ...extra }, 502);
  };

  // ── Perform the write through the owning contract. ──
  //
  // §13 — THE TRANSPORT IS WRAPPED, because the claim is already stamped by the time we get here.
  // A `fetch` that REJECTS — a timeout, a DNS failure, a function that is briefly gone — never
  // reaches the non-OK branch below, so the row stayed `applied` with nothing applied and every
  // later attempt answered `already_applied`: the proposal was lost and the person was told the
  // work was done. A rejection is the most likely failure of the three, and was the only one with
  // no release.
  let syncResponse: Response;
  try {
    syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-credit-report-data`, {
      method: "POST",
      headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(scoped),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.error("[apply-extraction] sync transport failed:", detail);
    return await releaseAndFail(
      { transport_error: detail },
      // §13 — IT MUST NOT SAY "NOTHING WAS CHANGED". A rejected request proves only that no ANSWER
      // came back; it does not prove the sync never received it or never wrote. Claiming otherwise
      // about somebody's credit profile is the same fabrication this whole seam exists to stop,
      // pointed the other way. OWED TO CLAUDE DESIGN: the wording is theirs; what this may not
      // ASSERT is ours.
      "I couldn't confirm whether those saved. The proposal is open again — take a look and try again.",
    );
  }
  const syncBody = await syncResponse.json().catch(() => ({ error: "Could not parse sync response" }));

  if (!syncResponse.ok) {
    console.error("[apply-extraction] sync failed:", syncResponse.status, syncBody);
    return await releaseAndFail(
      { status: syncResponse.status, error: syncBody?.error ?? null },
      // The "Nothing was changed" this used to carry was not true either: `sync-credit-report-data`
      // answers 500 from a catch that wraps all five write steps, so a failure at step four means
      // steps one to three already landed. Corrected rather than inherited (§13/§58 — the removal
      // of that claim is called out in the PR, not slipped in).
      "I couldn't save those to the profile. The proposal is open again — take a look and try again.",
    );
  }

  // ── A 2xx IS NOT A WRITE. Check what the sync SAID about every group the person approved. ──
  const failedGroups = syncGroupFailures(approved, scoped, syncBody);
  if (failedGroups.length > 0) {
    console.error("[apply-extraction] sync reported failed groups:", failedGroups, syncBody);
    return await releaseAndFail(
      { failed_groups: failedGroups, sync_results: (syncBody as Record<string, unknown>)?.results ?? null },
      // §13/§11 — TWO THINGS THIS SENTENCE MAY NOT DO, both found by review of the pushed diff.
      // It may not say "Nothing was changed": this branch fires precisely when SOME approved groups
      // succeeded and others did not, so on a partial failure that claim is false about the one
      // thing the person is being asked to trust the card on. And it may not name the groups by
      // interpolating `failed_groups`, because those are payload keys — `negative_items`,
      // `hard_inquiries` — and snake-case backend identifiers do not belong in copy a person reads.
      // The machine-readable list stays in the body and the audit row, where a consumer can use it.
      // OWED TO CLAUDE DESIGN: whether this should name what failed, and in what words, is theirs.
      "Some of those didn't save. The proposal is open again — take a look and try again.",
      { failed_groups: failedGroups },
    );
  }

  // ATTRIBUTION (§13): what a person approved, when, and which of it was applied. Written with the
  // column shape `audit_logs` actually has — `entity`/`entity_id`/`data`, never
  // `resource_type`/`resource_id`/`metadata`, which errors 42703 and is why two other chat writes
  // have been producing no audit row at all.
  const { error: auditErr } = await admin.from("audit_logs").insert({
    user_id: user.id,
    entity: "credit_report",
    action: "extraction_applied",
    entity_id: body.upload_id,
    data: {
      approved_keys: [...approved],
      negative_items: scoped.negative_items.length,
      positive_accounts: scoped.positive_accounts.length,
      hard_inquiries: scoped.hard_inquiries.length,
      scores_applied: Object.keys(scores),
      source: "paige_chat_extraction_proposal",
    },
  });
  // Awaited and checked, not fire-and-forget: an approval nobody can reconstruct afterwards is not
  // an attributable write. A failure here does not undo the sync, so it is reported, not swallowed.
  if (auditErr) console.error("[apply-extraction] audit write failed:", auditErr.message);

  return json({ ok: true, applied_keys: [...approved], audit_recorded: !auditErr });
});
