// alerting-evaluate — A2, the evaluator sweep.
//
// Reads active rules, resolves the signals they depend on, decides which should fire, and
// WRITES FIRINGS. It does NOT deliver anything: delivery is A3, and it routes through
// `_shared/channel-adapters.ts` (the single home for multi-channel delivery, §18) rather
// than anything invented here.
//
// That split is deliberate and is the §13 posture the whole substrate is built on: a firing
// is a row BEFORE it is a message, so "did it fire?" stays answerable even when delivery
// later fails. Every firing this function writes lands with delivery_status='pending', which
// is the literal truth until A3 exists.
//
// AUTH — verify_jwt = false in config.toml so the cron poster (no Supabase JWT) can reach it;
// the function FAILS CLOSED in-function to one of two gates, reusing the SAME helpers the
// systems-check runners use (§18 — one home for the operator auth gate, not a second copy):
//   • internal caller (service-role bearer OR valid x-cron-token) — the scheduled tick, and
//   • an operator JWT (is_platform_operator(), §53) — an operator or Paige forcing a sweep.
// Never a tenant JWT, never an identity taken from the request body (§588).

import {
  adminClient,
  corsHeaders,
  isAuthorizedInternalCaller,
  isOperatorJwt,
  json,
} from "../_shared/systems-check-http.ts";
import {
  evaluateCondition,
  shouldFire,
  validateCondition,
  type Condition,
} from "../_shared/alert-conditions.ts";
import { readSignals } from "../_shared/alert-signals.ts";

interface RuleRow {
  id: string;
  name: string;
  condition: unknown;
  severity: string;
  is_active: boolean;
  condition_met_since: string | null;
  last_fired_at: string | null;
}

/** Per-rule outcome, returned to the caller AND logged. A silent sweep is an unauditable one. */
interface RuleOutcome {
  rule: string;
  name: string;
  outcome: "fired" | "held" | "skipped";
  reason: string;
  observed?: Record<string, number | boolean>;
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
    // ── the signal catalogue (config-as-data, §10) ────────────────────────────
    const { data: sigRows, error: sigErr } = await admin
      .from("paige_alert_signal")
      .select("key, is_readable");
    if (sigErr) return json(500, { error: "signal_catalogue_unreadable", detail: sigErr.message });

    const registry = new Map<string, { isReadable: boolean }>(
      ((sigRows ?? []) as Array<{ key: string; is_readable: boolean }>).map((r) => [
        r.key,
        { isReadable: r.is_readable },
      ]),
    );

    // ── active rules ──────────────────────────────────────────────────────────
    const { data: ruleRows, error: ruleErr } = await admin
      .from("paige_alert_rule")
      .select("id, name, condition, severity, is_active, condition_met_since, last_fired_at")
      .eq("is_active", true);
    if (ruleErr) return json(500, { error: "rules_unreadable", detail: ruleErr.message });

    const rules = (ruleRows ?? []) as RuleRow[];
    if (rules.length === 0) {
      return json(200, { evaluated: 0, fired: 0, outcomes: [], note: "no active rules" });
    }

    // Validate first so one malformed rule is skipped rather than taking the sweep down,
    // and so we only read the signals rules actually depend on.
    const validated = rules.map((r) => ({ rule: r, v: validateCondition(r.condition) }));
    const needed = new Set<string>();
    for (const { v } of validated) if (v.ok) v.signals.forEach((s) => needed.add(s));

    const { values, unreadable } = await readSignals(admin, [...needed], registry);

    const outcomes: RuleOutcome[] = [];
    let firedCount = 0;

    for (const { rule, v } of validated) {
      // ── malformed rule ──────────────────────────────────────────────────────
      if (!v.ok) {
        outcomes.push({
          rule: rule.id,
          name: rule.name,
          outcome: "skipped",
          reason: `invalid condition: ${v.errors.join("; ")}`,
        });
        continue;
      }

      // ── a signal this rule needs could not be read ──────────────────────────
      // last_evaluated_at is deliberately NOT touched, so the surface keeps saying
      // "never evaluated" rather than implying a clean pass (§13). The pack's own foot
      // makes this the point: "A rule that has never fired is not proof of health."
      const blocked = v.signals.filter((s) => unreadable[s] !== undefined);
      if (blocked.length > 0) {
        outcomes.push({
          rule: rule.id,
          name: rule.name,
          outcome: "skipped",
          reason: `signal unreadable — ${blocked.map((b) => `${b}: ${unreadable[b]}`).join("; ")}`,
        });
        continue;
      }

      const met = evaluateCondition(rule.condition as Condition, values);

      // ── every signal read, but the condition still could not be decided ──────
      // Reachable even when nothing is unreadable: an ordered comparison against a boolean
      // reading resolves to `undefined` rather than to a coerced 0/1 answer nobody intended.
      //
      // This gets the SAME treatment as an unreadable signal — skipped, last_evaluated_at NOT
      // advanced. Without it the two "could not decide" paths disagreed: one left the rule
      // honestly reading "never evaluated", the other stamped it "evaluated just now" for a
      // sweep that decided nothing. A half-kept honesty guarantee is the worse kind, because
      // the surface looks trustworthy exactly where it is not.
      if (met === undefined) {
        outcomes.push({
          rule: rule.id,
          name: rule.name,
          outcome: "skipped",
          reason:
            "condition could not be decided from the readings (likely an ordered comparison " +
            "against a boolean signal) — last_evaluated_at deliberately not advanced",
        });
        continue;
      }

      // Episode bookkeeping: opens when the condition first holds, clears when it stops.
      // This is what makes sustained-for meaningful and firing edge-triggered.
      let metSince: Date | null = rule.condition_met_since ? new Date(rule.condition_met_since) : null;
      if (met && !metSince) metSince = now;
      if (!met) metSince = null;

      const decision = shouldFire({
        met,
        sustainMinutes: v.sustainMinutes,
        metSince,
        lastFiredAt: rule.last_fired_at ? new Date(rule.last_fired_at) : null,
        now,
      });

      // Only the signals THIS rule depends on — evidence for this firing, not a dump.
      const observed: Record<string, number | boolean> = {};
      for (const s of v.signals) if (values[s] !== undefined) observed[s] = values[s]!;

      if (decision.fire) {
        // Written BEFORE anything else. A fire is not a delivery (§13).
        const { error: insErr } = await admin.from("paige_alert_firing").insert({
          rule_id: rule.id,
          observed,
          delivery_status: "pending",
          metadata: { severity: rule.severity, evaluator: "alerting-evaluate" },
        });
        if (insErr) {
          // Do NOT advance last_fired_at — if the firing did not record, claiming it fired
          // would put a fabricated event in the evidence table's own bookkeeping.
          outcomes.push({
            rule: rule.id,
            name: rule.name,
            outcome: "skipped",
            reason: `firing insert failed: ${insErr.message}`,
            observed,
          });
          console.error("[alerting-evaluate] firing insert failed", rule.id, insErr.message);
          continue;
        }
        firedCount += 1;
      }

      const { error: updErr } = await admin
        .from("paige_alert_rule")
        .update({
          last_evaluated_at: now.toISOString(),
          condition_met_since: metSince ? metSince.toISOString() : null,
          ...(decision.fire ? { last_fired_at: now.toISOString() } : {}),
        })
        .eq("id", rule.id);
      if (updErr) console.error("[alerting-evaluate] rule bookkeeping failed", rule.id, updErr.message);

      outcomes.push({
        rule: rule.id,
        name: rule.name,
        outcome: decision.fire ? "fired" : "held",
        reason: decision.reason,
        observed,
      });
    }

    // Unreadable signals are reported at the top level too, so a sweep that evaluated
    // nothing because everything was blind cannot read as a quiet success.
    return json(200, {
      evaluated: outcomes.filter((o) => o.outcome !== "skipped").length,
      skipped: outcomes.filter((o) => o.outcome === "skipped").length,
      fired: firedCount,
      unreadable_signals: unreadable,
      outcomes,
      delivery: "not_attempted — delivery lands in A3 via channel-adapters",
    });
  } catch (e) {
    // Loud, and with the real cause. A swallowed sweep failure is indistinguishable from
    // a quiet platform (§32).
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[alerting-evaluate] sweep threw", msg);
    return json(500, { error: "sweep_failed", detail: msg });
  }
});
