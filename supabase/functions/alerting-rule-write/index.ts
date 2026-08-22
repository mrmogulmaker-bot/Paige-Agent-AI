// alerting-rule-write — A5, the authoring seam.
//
// Until now a rule could only be written by hand in SQL. The Fleet tab shipped its
// "+ New rule" control DISABLED because a control that looks live and silently discards the
// operator's work is worse than one that is visibly not ready (§13/§36). This is the seam
// that lets it become real.
//
// ONE SEAM, TWO CALLERS (§18 — decided before code, recorded on tasks #204/#206):
//   • the Fleet tab's authoring form (operator JWT), and
//   • Paige, via paige-mcp in A-Weave-2 (service-role).
// A-Weave-2 adds TOOLS that call this function. It does NOT add a second write path, and it
// must not re-implement validation — which is the whole reason validation lives here and not
// in the form. `_shared/alert-rule-input.ts` calls the SAME `validateCondition` the evaluator
// runs, so a rule can never be stored in a shape the evaluator will later reject.
//
// AUTH — verify_jwt=false so a service-role caller (Paige, headless) reaches it on the same
// terms as a browser; fails closed in-function to the SAME two gates the rest of the substrate
// uses (§18, one operator gate, not a copy): an internal caller (service-role bearer or
// x-cron-token), or an operator JWT (§53 — is_platform_operator, super_admin OR platform_admin,
// derived from the VERIFIED token and never from the body, §588).
//
// RLS is NOT bypassed as a shortcut: the admin client is used so a service-role caller works,
// but `paige_alert_rule` already carries operator-gated INSERT/UPDATE/DELETE policies with
// `with_check = is_platform_operator()` (verified live), and this function's own gate is the
// same predicate. The two agree by construction.

import {
  adminClient,
  corsHeaders,
  isAuthorizedInternalCaller,
  json,
  operatorUserId,
} from "../_shared/systems-check-http.ts";
import {
  validateRuleInput,
  type SignalCatalogueEntry,
} from "../_shared/alert-rule-input.ts";

type Action = "create" | "update" | "set_active" | "delete";
const ACTIONS: readonly Action[] = ["create", "update", "set_active", "delete"];

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const admin = adminClient();

  // ── authz, fail-closed ──────────────────────────────────────────────────
  // Resolve the operator FIRST so a JWT write can be attributed. A service-role caller has no
  // uid, which is correct and is recorded as such rather than being attributed to anyone.
  const actorId = await operatorUserId(req);
  const internal = actorId === null ? await isAuthorizedInternalCaller(req, admin) : false;
  if (actorId === null && !internal) {
    return json(401, { error: "unauthorized", detail: "Operator JWT or internal caller required." });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const action = body.action;
  if (typeof action !== "string" || !ACTIONS.includes(action as Action)) {
    return json(400, { error: "invalid_action", allowed: ACTIONS });
  }

  // ── the signal catalogue, read once ─────────────────────────────────────
  // Needed to reject a condition bound to a signal with no reader. §13: if the catalogue
  // itself cannot be read we REFUSE the write rather than skipping the check — accepting a
  // rule we could not fully validate is exactly the silent defect this seam exists to stop.
  let catalogue: SignalCatalogueEntry[] = [];
  if (action === "create" || action === "update") {
    const { data, error } = await admin.from("paige_alert_signal").select("key,is_readable");
    if (error) {
      return json(503, {
        error: "catalogue_unreadable",
        detail: `The signal catalogue could not be read, so this rule could not be fully validated: ${error.message}`,
      });
    }
    catalogue = (data ?? []) as SignalCatalogueEntry[];
  }

  // ── create ──────────────────────────────────────────────────────────────
  if (action === "create") {
    const verdict = validateRuleInput(body.rule, catalogue);
    if (!verdict.ok) return json(422, { error: "invalid_rule", errors: verdict.errors });

    const { data, error } = await admin
      .from("paige_alert_rule")
      .insert({ ...verdict.rule, created_by: actorId })
      .select("id,name,is_active")
      .single();

    if (error) return json(500, { error: "insert_failed", detail: error.message });
    return json(200, {
      ok: true,
      action,
      rule: data,
      // Stated explicitly so a caller never has to infer it from a missing field: a new rule
      // is INERT unless it asked to be active. Paige in particular must be able to report
      // truthfully what it just created (§13).
      note: data.is_active
        ? "Rule created and ACTIVE — the next sweep will evaluate it."
        : "Rule created but PAUSED — it will not be evaluated until it is activated.",
    });
  }

  // ── update / set_active / delete all address an existing row ────────────
  const ruleId = body.rule_id;
  if (typeof ruleId !== "string" || ruleId.length === 0) {
    return json(400, { error: "rule_id_required" });
  }

  if (action === "update") {
    const verdict = validateRuleInput(body.rule, catalogue, { partial: true });
    if (!verdict.ok) return json(422, { error: "invalid_rule", errors: verdict.errors });

    // Only the fields the caller actually supplied are written — a partial update must not
    // silently reset severity/lane/channels to their defaults just because they were omitted.
    const supplied = (body.rule ?? {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const field of [
      "name",
      "description",
      "condition",
      "department",
      "autonomy_lane",
      "channels",
      "severity",
      "is_active",
    ] as const) {
      if (field in supplied) patch[field] = verdict.rule![field];
    }

    // A changed condition invalidates the sustained-for window that was accumulating against
    // the OLD condition — carrying it forward would let an edited rule fire on evidence it
    // never actually observed (§13).
    if ("condition" in supplied) patch.condition_met_since = null;

    const { data, error } = await admin
      .from("paige_alert_rule")
      .update(patch)
      .eq("id", ruleId)
      .select("id,name,is_active")
      .maybeSingle();

    if (error) return json(500, { error: "update_failed", detail: error.message });
    if (!data) return json(404, { error: "rule_not_found", rule_id: ruleId });
    return json(200, { ok: true, action, rule: data });
  }

  if (action === "set_active") {
    const isActive = body.is_active;
    if (typeof isActive !== "boolean") return json(400, { error: "is_active_must_be_boolean" });

    const { data, error } = await admin
      .from("paige_alert_rule")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", ruleId)
      .select("id,name,is_active")
      .maybeSingle();

    if (error) return json(500, { error: "set_active_failed", detail: error.message });
    if (!data) return json(404, { error: "rule_not_found", rule_id: ruleId });
    return json(200, { ok: true, action, rule: data });
  }

  // ── delete ──────────────────────────────────────────────────────────────
  // paige_alert_firing.rule_id FKs this row. Deleting a rule with history would either
  // cascade its firings away or fail on the constraint — and a firing is the record that
  // something actually happened, so destroying that history to tidy a list is not a trade
  // this seam makes on its own (§13/§58). Pause is the reversible move and is offered by name.
  const { count, error: countErr } = await admin
    .from("paige_alert_firing")
    .select("id", { count: "exact", head: true })
    .eq("rule_id", ruleId);

  if (countErr) return json(500, { error: "firing_check_failed", detail: countErr.message });
  if ((count ?? 0) > 0) {
    return json(409, {
      error: "rule_has_firings",
      firing_count: count,
      detail:
        `This rule has ${count} recorded firing(s). Deleting it would destroy the record that ` +
        `those alerts happened. Pause it instead (action "set_active", is_active false).`,
    });
  }

  const { data, error } = await admin
    .from("paige_alert_rule")
    .delete()
    .eq("id", ruleId)
    .select("id,name")
    .maybeSingle();

  if (error) return json(500, { error: "delete_failed", detail: error.message });
  if (!data) return json(404, { error: "rule_not_found", rule_id: ruleId });
  return json(200, { ok: true, action, rule: data });
});
