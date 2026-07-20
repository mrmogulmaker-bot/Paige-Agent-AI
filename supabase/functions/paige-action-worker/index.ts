// paige-action-worker — the §8 two-way ACTION-BUS DRAINER.
//
// The gap this closes (PLATFORM_ASSESSMENT D2, the single highest-leverage missing piece): paige_actions
// rows get filed with status='filed', but NOTHING drains them — so §8's core promise (Client team
// detects a need → files an action → Owner team DRAFTS it → routes to the coach's approval) only ever
// fired while a human was actively chatting. This worker makes it autonomous: on a */2 cron it claims
// filed actions whose kind has a drafting sub-agent, has that sub-agent draft the work through Paige's
// orchestrator (§14 — her TEAM does it, not her), and advances the action to 'drafted' — which
// advance_action then routes into paige_pending_approvals for the human's yes. Nothing is ever SENT
// here; the drainer only produces drafts and files them for approval.
//
// -- SECURITY (§9/§13) -------------------------------------------------------------------------------
// NOT user-facing. Authorized ONLY by (a) the exact service-role bearer, or (b) a valid Vault cron token
// (verify_cron_token) — the same gate every cron-style fn uses. Fails CLOSED. The tenant of every write
// is taken from the CLAIMED action row (claim_filed_actions returns it), NEVER from the request body.
// The claim is ATOMIC (FOR UPDATE ... SKIP LOCKED in claim_filed_actions) so two concurrent workers can
// never double-draft the same action.
//
// -- HONESTY (§13) -----------------------------------------------------------------------------------
// A claimed action moves filed→drafting (the claim). If the sub-agent draft succeeds, advance_action
// records the REAL draft it produced + the invocation_id that produced it, then routes to approval. If
// the invoke fails, fail_action marks the row 'blocked' with the real error so it SURFACES in the
// Actions queue instead of dying silently. A crashed run's 'drafting' rows self-heal (claim_filed_actions
// reopens a >10-min stale claim). One action failing never aborts the batch — each is independent.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ORCHESTRATOR_URL = `${SUPABASE_URL}/functions/v1/paige-orchestrator`;
// INVARIANT: BATCH_LIMIT × INVOKE_TIMEOUT_MS must stay well under claim_filed_actions' 10-min self-heal
// window. Rows are stamped assigned_at at claim time but drafted serially, so the last row in a batch
// sits 'drafting' for up to (BATCH_LIMIT × INVOKE_TIMEOUT) before it's reached. 5 × 55s ≈ 4.6 min < 10 min
// keeps a legitimately-in-flight row from being self-healed and re-claimed under a concurrent tick. (The
// advance_action approval insert is also idempotent now, so even a race can't double-draft — this just
// avoids the wasted re-invoke.) At */2 that's up to 150 drafts/hr, ample for the current volume.
const BATCH_LIMIT = 5;
const INVOKE_TIMEOUT_MS = 55_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

type ClaimedAction = {
  id: string;
  tenant_id: string;
  action_kind: string;
  contact_id: string | null;
  conversation_id: string | null;
  title: string;
  summary: string | null;
  payload: Record<string, unknown> | null;
  draft_subagent_slug: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // -- Auth: service-role bearer OR a valid Vault cron token. Fail CLOSED (§13). --
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  let authorized = bearer.length > 0 && bearer === SERVICE_ROLE;
  if (!authorized) {
    const cronToken = req.headers.get("x-cron-token") ?? "";
    if (cronToken) {
      const { data: cronOk } = await admin.rpc("verify_cron_token", { _token: cronToken });
      authorized = cronOk === true;
    }
  }
  if (!authorized) return json({ error: "unauthorized" }, 401);

  // -- 1. Atomically claim a batch of draft-eligible filed actions (self-heals stale claims). --
  const { data: claim, error: claimErr } = await admin.rpc("claim_filed_actions", { p_limit: BATCH_LIMIT });
  if (claimErr) return json({ error: "claim_failed", detail: claimErr.message }, 500);
  const claimed: ClaimedAction[] = Array.isArray(claim?.claimed) ? claim.claimed : [];
  if (claimed.length === 0) return json({ ok: true, claimed: 0, drafted: 0, failed: 0 }, 200);

  const drafted: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  // -- 2. Draft each claimed action through Paige's orchestrator, then advance it. Independent. --
  for (const a of claimed) {
    try {
      // Invoke the kind's drafting sub-agent through the orchestrator (§14 — her team drafts it).
      // tenant_id is passed TOP-LEVEL (the orchestrator's trusted service-role tenant source); context
      // carries the contact/conversation. The service-role bearer marks us a trusted internal caller.
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), INVOKE_TIMEOUT_MS);
      let orchRes: Response;
      try {
        orchRes = await fetch(ORCHESTRATOR_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_ROLE}`,
            "apikey": SERVICE_ROLE,
          },
          body: JSON.stringify({
            action: "tool_invoke",
            slug: a.draft_subagent_slug,
            tenant_id: a.tenant_id,
            input: {
              action_kind: a.action_kind,
              title: a.title,
              summary: a.summary,
              payload: a.payload ?? {},
              contact_id: a.contact_id,
            },
            context: { contact_id: a.contact_id, conversation_id: a.conversation_id },
          }),
          signal: ctl.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      const orchBody = await orchRes.json().catch(() => ({}));
      if (!orchRes.ok || orchBody?.ok !== true) {
        const msg = `invoke ${a.draft_subagent_slug} failed (${orchRes.status}): ${
          typeof orchBody?.error === "string" ? orchBody.error : JSON.stringify(orchBody).slice(0, 300)
        }`;
        await admin.rpc("fail_action", { p_action_id: a.id, p_error: msg });
        failed.push({ id: a.id, error: msg });
        continue;
      }

      // The draft the sub-agent produced (§13 — store what it actually returned, not a hoped-for shape).
      const raw = orchBody.result;
      const draftContent = raw && typeof raw === "object" ? raw : { content: raw ?? null };
      const invocationId: string | null = typeof orchBody.invocation_id === "string" ? orchBody.invocation_id : null;

      // Advance to 'drafted' + attach the draft + the invocation that produced it. advance_action then
      // routes send-kinds into paige_pending_approvals (never sends). tenant pinned from the claimed row.
      const { error: advErr } = await admin.rpc("advance_action", {
        p_action_id: a.id,
        p_to_status: "drafted",
        p_draft_content: draftContent,
        p_assigned_subagent_slug: a.draft_subagent_slug,
        p_invocation_id: invocationId,
        p_tenant_id: a.tenant_id,
      });
      if (advErr) {
        await admin.rpc("fail_action", { p_action_id: a.id, p_error: `advance failed: ${advErr.message}` });
        failed.push({ id: a.id, error: advErr.message });
        continue;
      }
      drafted.push(a.id);
    } catch (e) {
      const msg = (e as Error)?.message ?? "worker error";
      try { await admin.rpc("fail_action", { p_action_id: a.id, p_error: msg }); } catch (_e) { /* self-heals */ }
      failed.push({ id: a.id, error: msg });
    }
  }

  return json({ ok: true, claimed: claimed.length, drafted: drafted.length, failed: failed.length, failures: failed }, 200);
});
