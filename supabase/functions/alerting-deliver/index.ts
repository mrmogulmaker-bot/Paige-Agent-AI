// alerting-deliver — A3, the delivery leg.
//
// A2 writes firings and stops. Every row lands delivery_status='pending' and nothing has
// ever moved one. This drains them: for each pending firing it writes an operator
// notification and then — and only then — marks the firing delivered.
//
// WHERE DELIVERY LANDS, and why it is NOT channel-adapters (§18, grounded not assumed).
// The architecture note named both `_shared/channel-adapters.ts` and
// `paige_admin_notifications`. Reading the actual shapes settles which is primary:
//
//   • channel-adapters is THREAD/CONTACT-shaped — ThreadContext, MessageParty, inbound and
//     outbound adapters. It exists for tenant↔client messaging. An operator alert is
//     TENANT-LESS: no thread, no contact, no recipient party. Forcing it through there would
//     mean inventing a fake thread, which is worse than not using the seam.
//   • paige_admin_notifications is exactly the shape — severity, title, body, link_to,
//     source_workflow_key, assigned_role, scope — and it is ALREADY the operator inbox, with
//     a live writer precedent in enforce_subagent_doctrine_116 (source_workflow_key=
//     'doctrine_116_sweep', assigned_role='admin', scope='admin'). This follows it.
//
// channel-adapters becomes the right home for the EXTERNAL leg (email/SMS to an operator).
// That leg is deliberately NOT built here: the platform models tenants and clients, not
// operator recipients, so "who receives the 3am email" is an owner decision and must not be
// quietly hardcoded (§45/§63). In-app needs no such decision, so in-app ships first.
//
// AUTH — verify_jwt=false so the cron poster (no Supabase JWT) can reach it; fails closed
// in-function to the SAME two gates the evaluator uses (§18, one operator gate, not a copy):
// an internal caller (service-role bearer OR x-cron-token), or an operator JWT (§53).

import {
  adminClient,
  corsHeaders,
  isAuthorizedInternalCaller,
  isOperatorJwt,
  json,
} from "../_shared/systems-check-http.ts";

/** Max firings drained per tick. A backlog drains over successive ticks rather than in one
 *  unbounded pass — an alerting system that stalls on its own backlog is its own outage. */
const BATCH = 50;

interface FiringRow {
  id: string;
  rule_id: string;
  fired_at: string;
  observed: Record<string, unknown> | null;
  scope_tenant_id: string | null;
  metadata: Record<string, unknown> | null;
}

interface RuleRow {
  id: string;
  name: string;
  severity: string;
  department: string | null;
  autonomy_lane: string;
}

/** Human-readable evidence line. The operator should see WHY it fired without opening a row. */
function describeObserved(observed: Record<string, unknown> | null): string {
  if (!observed || Object.keys(observed).length === 0) return "No signal readings were recorded.";
  return Object.entries(observed)
    .map(([k, v]) => `${k} = ${typeof v === "number" ? v : JSON.stringify(v)}`)
    .join(" · ");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const admin = adminClient();
  const internal = await isAuthorizedInternalCaller(req, admin);
  const operator = internal ? false : await isOperatorJwt(req);
  if (!internal && !operator) return json(401, { error: "unauthorized" });

  const now = new Date();

  try {
    const { data: firingRows, error: fErr } = await admin
      .from("paige_alert_firing")
      .select("id, rule_id, fired_at, observed, scope_tenant_id, metadata")
      .eq("delivery_status", "pending")
      .order("fired_at", { ascending: true })
      .limit(BATCH);
    if (fErr) return json(500, { error: "firings_unreadable", detail: fErr.message });

    const firings = (firingRows ?? []) as FiringRow[];
    if (firings.length === 0) {
      return json(200, { drained: 0, delivered: 0, failed: 0, skipped: 0, note: "no pending firings" });
    }

    // Rules for exactly the firings in hand.
    const ruleIds = [...new Set(firings.map((f) => f.rule_id))];
    const { data: ruleRows, error: rErr } = await admin
      .from("paige_alert_rule")
      .select("id, name, severity, department, autonomy_lane")
      .in("id", ruleIds);
    if (rErr) return json(500, { error: "rules_unreadable", detail: rErr.message });
    const rules = new Map((((ruleRows ?? []) as RuleRow[])).map((r) => [r.id, r]));

    const outcomes: Array<Record<string, unknown>> = [];
    let delivered = 0, failed = 0, skipped = 0;

    for (const f of firings) {
      const rule = rules.get(f.rule_id);

      // A firing whose rule vanished cannot be described honestly — no name, no severity,
      // no lane. Mark it failed with the real reason rather than inventing a placeholder.
      if (!rule) {
        await admin.from("paige_alert_firing").update({
          delivery_status: "failed",
          delivery_error: `rule ${f.rule_id} no longer exists; cannot describe this firing`,
        }).eq("id", f.id);
        failed += 1;
        outcomes.push({ firing: f.id, outcome: "failed", reason: "orphaned firing — rule deleted" });
        continue;
      }

      // §16 autonomy lane. 'off' means brief-a-human, never auto-deliver. That is a SKIP with
      // a stated reason, not a silent drop and not a failure — 'skipped' exists in the
      // delivery_status vocabulary for exactly this.
      if (rule.autonomy_lane === "off") {
        await admin.from("paige_alert_firing").update({
          delivery_status: "skipped",
          delivery_error: "autonomy_lane=off — human-briefed only, no automated delivery (§16)",
        }).eq("id", f.id);
        skipped += 1;
        outcomes.push({ firing: f.id, rule: rule.name, outcome: "skipped", reason: "autonomy_lane=off" });
        continue;
      }

      // IDEMPOTENCY. A crash between the notification insert and the firing update would
      // otherwise re-notify on the next tick. link_to carries the firing id, so an existing
      // notification for this firing is proof the send already happened — in which case only
      // the bookkeeping is behind, and we self-heal it instead of notifying twice.
      //
      // HONEST LIMIT: check-then-insert is not atomic. Two concurrent invocations could still
      // double-write. The sweep is a single 5-minute cron, so concurrency is not expected;
      // if A5 ever adds an operator "deliver now" button, this needs a real claim (an
      // advisory lock on the firing id, as the evaluator does for episodes).
      const link = `/operator/fleet/alerting?firing=${f.id}`;
      const { data: already, error: dupErr } = await admin
        .from("paige_admin_notifications")
        .select("id")
        .eq("source_workflow_key", "paige_alerting")
        .eq("link_to", link)
        .limit(1);
      if (dupErr) {
        await admin.from("paige_alert_firing").update({
          delivery_status: "failed",
          delivery_error: `idempotency check failed: ${dupErr.message}`,
        }).eq("id", f.id);
        failed += 1;
        outcomes.push({ firing: f.id, rule: rule.name, outcome: "failed", reason: dupErr.message });
        continue;
      }

      if (already && already.length > 0) {
        await admin.from("paige_alert_firing").update({
          delivery_status: "delivered",
          delivered_at: now.toISOString(),
          delivery_error: null,
        }).eq("id", f.id);
        delivered += 1;
        outcomes.push({ firing: f.id, rule: rule.name, outcome: "delivered", reason: "already notified — bookkeeping self-healed" });
        continue;
      }

      const body =
        `${describeObserved(f.observed)}\n\n` +
        `Fired ${f.fired_at}.` +
        (f.scope_tenant_id ? ` Scoped to tenant ${f.scope_tenant_id}.` : " Platform-wide.") +
        (rule.department ? ` Department: ${rule.department}.` : "");

      const { error: insErr } = await admin.from("paige_admin_notifications").insert({
        severity: rule.severity,          // vocabularies are identical (info|warning|urgent) — passthrough
        title: `Alert: ${rule.name}`,
        body,
        link_to: link,
        source_workflow_key: "paige_alerting",
        assigned_role: "admin",
        scope: "admin",
      });

      // THE RULE THIS SLICE EXISTS FOR (§13): delivered is written ONLY after a real success.
      // A failed insert records the actual error and stays undelivered, so the firing is still
      // visibly outstanding rather than quietly marked done.
      if (insErr) {
        await admin.from("paige_alert_firing").update({
          delivery_status: "failed",
          delivery_error: insErr.message,
        }).eq("id", f.id);
        failed += 1;
        console.error("[alerting-deliver] notification insert failed", f.id, insErr.message);
        outcomes.push({ firing: f.id, rule: rule.name, outcome: "failed", reason: insErr.message });
        continue;
      }

      const { error: updErr } = await admin.from("paige_alert_firing").update({
        delivery_status: "delivered",
        delivered_at: now.toISOString(),
        delivery_error: null,
      }).eq("id", f.id);
      if (updErr) {
        // The operator HAS been notified; only the bookkeeping failed. Log it and leave the
        // row pending — the idempotency check above makes the next tick self-heal rather
        // than notify twice.
        console.error("[alerting-deliver] delivered but bookkeeping failed", f.id, updErr.message);
      }
      delivered += 1;
      outcomes.push({ firing: f.id, rule: rule.name, outcome: "delivered" });
    }

    return json(200, {
      drained: firings.length,
      delivered,
      failed,
      skipped,
      batch_limit: BATCH,
      more_pending_possible: firings.length === BATCH,
      external_delivery: "not_attempted — in-app only; operator recipient identity is an owner decision",
      outcomes,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[alerting-deliver] drain threw", msg);
    return json(500, { error: "drain_failed", detail: msg });
  }
});
