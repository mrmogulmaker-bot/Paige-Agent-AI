-- The revenue check's DRAFTED FIX still describes the check it used to be.
--
-- 20261203000000's sibling commit repointed `revenue_tracking_configured` from
-- `operator_revenue_integrity_audit` (platform billing — owner-ruled out of scope 2026-09-05) at the
-- tenant's own pipeline shape. The RUNNER changed. The registry row that produces the remediation
-- did not, and the two are separate seams: `systems-check-runner.ts` builds `paige_drafted_fix` by
-- forging `paige_systems_check_registry.remediation_prompt`, never from the runner's interpretation.
--
-- So on every fail the console now shows the owner two contradicting instructions on one screen:
--
--   the finding says   "Add a closing stage to your pipeline."
--   the drafted fix says "...walk them through connecting their processor and confirm the numbers
--                         reconcile before presenting any revenue figure as real."
--
-- Connecting a processor is a DIFFERENT check (`payment_processor_connected`, seeded in the same
-- migration), so the drafted fix sends the owner to work that will not move this check no matter
-- how completely they do it. Reconciliation language is worse than merely stale — it describes the
-- platform-billing audit that the owner ruled has nothing to do with a tenant's sales revenue.
--
-- Found by the §39 peer gate on the runner commit, independently by two reviewers, and confirmed
-- against the LIVE row on prod rather than against this file — the seed below is where the live
-- value comes from, and no later migration had superseded it.
--
-- §13: the prompt is now what the check actually measures. §2: coaching-generic, no finance
-- vertical, no processor named. §9: tenant-scoped by construction — the forge fills
-- {{tenant.business_name}} from the tenant being scanned.
--
-- Idempotent and narrow: one column, one row, keyed by check_id. It does NOT touch check_name,
-- domain, severity or priority — those are task #21's, and folding them in here would make this
-- migration's intent unreadable.

update public.paige_systems_check_registry
   set remediation_prompt =
         'Explain to {{tenant.business_name}} that their pipeline has no live stage marking a deal '
      || 'as won, so there is nothing for a sale to be recorded against and their revenue will read '
      || 'zero however much they sell. Tell them what to do about it in their own words: add a '
      || 'closing stage to the pipeline they actually work in, or restore the closing stage if it '
      || 'was archived. Do not discuss payment processors, invoicing or reconciliation — those are '
      || 'separate checks and neither one changes this result.'
 where check_id = 'revenue_tracking_configured';
