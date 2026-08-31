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
import { APPROVABLE_KEYS, buildCreditSyncPayload } from "../_shared/credit-extraction-payload.ts";

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
    .select("id, user_id, client_id, analysis_status, analysis_result")
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

  if (upload.analysis_status === "applied") {
    // Idempotent by state. A double-tap on Approve, or a retry after a dropped response, must not
    // write the same report twice — `sync-credit-report-data` upserts by account, but inquiries
    // and negative items would duplicate.
    return json({ ok: true, already_applied: true, applied_keys: [] });
  }
  if (upload.analysis_status !== "awaiting_review") {
    return json({ error: "That document isn't waiting for review any more." }, 409);
  }

  const structured = upload.analysis_result as Record<string, any> | null;
  if (!structured || typeof structured !== "object") {
    return json({ error: "I no longer have the reading of that document, so there's nothing to apply." }, 409);
  }

  // ── The key list, intersected with the closed set. ──
  const approved = new Set(
    body.approved_keys.filter((k): k is typeof APPROVABLE_KEYS[number] =>
      (APPROVABLE_KEYS as readonly string[]).includes(k)),
  );
  if (approved.size === 0) {
    // Declining everything is a real answer, not a failure. Record it so the card does not come
    // back and so the row's state reflects what the person decided.
    await createClient(supabaseUrl, serviceKey)
      .from("credit_report_uploads")
      .update({ analysis_status: "declined" })
      .eq("id", body.upload_id);
    return json({ ok: true, declined: true, applied_keys: [] });
  }

  // ── Build the write from the STORED extraction, then remove what was not approved. ──
  // Same mapping the proposal was derived from (`_shared/credit-extraction-payload.ts`), so the
  // person approves and the server writes the same thing by construction rather than by review.
  const payload = buildCreditSyncPayload(structured, upload.user_id as string, (upload.client_id as string | null) ?? null);

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

  // ── Perform the write through the owning contract. ──
  const syncResponse = await fetch(`${supabaseUrl}/functions/v1/sync-credit-report-data`, {
    method: "POST",
    headers: { Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(scoped),
  });
  const syncBody = await syncResponse.json().catch(() => ({ error: "Could not parse sync response" }));

  const admin = createClient(supabaseUrl, serviceKey);

  if (!syncResponse.ok) {
    console.error("[apply-extraction] sync failed:", syncResponse.status, syncBody);
    await admin.from("audit_logs").insert({
      user_id: user.id,
      entity: "credit_report",
      action: "extraction_apply_failed",
      entity_id: body.upload_id,
      data: { status: syncResponse.status, approved_keys: [...approved], error: syncBody?.error ?? null },
    });
    // The row stays `awaiting_review` so the person can try again rather than losing the proposal.
    return json({ error: "I couldn't save those to the profile. Nothing was changed — try again." }, 502);
  }

  await admin.from("credit_report_uploads")
    .update({ analysis_status: "applied", last_analyzed_at: new Date().toISOString() })
    .eq("id", body.upload_id);

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
