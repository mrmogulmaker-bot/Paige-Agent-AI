// systems-check-runners/operator/index.ts — the §18 one-home barrel that registers the OPERATOR-scope
// runner modules into the core's dispatch map (SYSTEMS_CHECK_DISPATCH) via registerRunner().
//
// The operator flavor edge function (systems-check-run-operator) imports the core AND this barrel;
// importing the barrel is what populates the dispatch registry with the operator runners. The core reports
// any operator runner_key with no registered runner as an 'error' finding (fail-loud §32) — so a mistyped
// runner_key or a missing module surfaces loudly, never as a silent pass.
//
// SCOPE SEPARATION: this barrel is SEPARATE from the tenant barrel (../index.ts) so the operator edge fn
// registers ONLY operator runners and the tenant edge fns register ONLY tenant runners — the two dispatch
// sets never bleed. (Registration is idempotent-by-last-write in the core, and the catalog is already
// scope-filtered, so even a double-import would be safe; the split is for clarity + minimal surface.)
//
// §13: REGISTERED_OPERATOR_RUNNER_KEYS is exported so a smoke test / the edge fn can assert every seeded
// operator catalog key is covered before a scan runs.

import { registerRunner } from "../../systems-check-runner.ts";

import * as operatorDbHealth from "./operator_db_health.ts";
import * as operatorRlsCoverage from "./operator_rls_coverage.ts";
import * as operatorStripeWebhookHealth from "./operator_stripe_webhook_health.ts";
import * as operatorTwilioHealth from "./operator_twilio_health.ts";
import * as operatorDomainSsl from "./operator_domain_ssl.ts";
import * as operatorLlmFailover from "./operator_llm_failover.ts";
import * as operatorDoctrineBinding from "./operator_doctrine_binding.ts";
import * as operatorCrossTenantCanary from "./operator_cross_tenant_canary.ts";
import * as operatorMigrationDrift from "./operator_migration_drift.ts";  // DEFERRED (needs_config)
import * as operatorEdgeDrift from "./operator_edge_drift.ts";            // DEFERRED (needs_config)

const OPERATOR_MODULES = [
  operatorDbHealth,
  operatorRlsCoverage,
  operatorStripeWebhookHealth,
  operatorTwilioHealth,
  operatorDomainSsl,
  operatorLlmFailover,
  operatorDoctrineBinding,
  operatorCrossTenantCanary,
  operatorMigrationDrift,
  operatorEdgeDrift,
] as const;

for (const m of OPERATOR_MODULES) {
  registerRunner(m.runnerKey, m.run);
}

/** The 10 operator runner_keys this barrel registers — matches the L3 operator catalog seeds
 *  (20260816170000). 8 edge-drivable + 2 deferred (git-tag drift → needs_config). */
export const REGISTERED_OPERATOR_RUNNER_KEYS: readonly string[] = OPERATOR_MODULES.map((m) => m.runnerKey);
