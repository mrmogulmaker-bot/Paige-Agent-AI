# Billing payment setup P0 — 2026-09-03

Status: **P0 repair RELEASED (#898, `df38d4c7`). Payment setup remains FAIL pending authenticated owner retest; completion UNVERIFIED.**

## Production facts

The owner tested Mogul Maker Academy after the deployed hotfix `275dabc2`. The attempt reached the provider stage and returned `billing_account_unresolvable`; no hosted page opened and no mapping, payment method, charge, subscription, plan change or promotional-access change was reported. Deployment ancestry and served Billing code were independently checked. Secret-name metadata confirms `STRIPE_SECRET_KEY` present; no secret value was accessed. Missing-secret conjecture is superseded. The exact historical provider error was not recovered.

## Bounded repair

Branch `codex/billing-payment-continuity`, grounded on main `25f0b8aa`. Runtime ownership: Solo Billing contract/hooks/page, `platform-billing-connect`, setup-only arm of `stripe-webhook`, and two additive migrations. Existing PR overlap in webhook is unrelated legacy bridge naming; shared documentation edits preserve sibling sections. Shared onboarding/auth and prepaid credits remain outside this repair.

Setup now explicitly requests cards in Stripe setup mode. The previous request supplied neither payment-method types nor currency; Stripe requires currency when setup mode omits types. This is a confirmed request defect, not proof of the historical provider error. Provider errors receive closed internal classification/stage/retryability without raw provider messages. Existing unmapped provider references fail closed for configuration review before creating another customer. Only an authorized owner click can create the provider customer/session; it does not start a subscription or charge.

Every attempt carries a nonauthorizing workspace comparison and return marker. Client work is bound to workspace and authenticated actor, discarded on switch/unmount, and rechecks server authority before redirect/callback/polling. Return origin is restricted to the three deployed application aliases. Query success is never connection proof; the server status is authoritative.

Signed setup events use async Web Crypto signature verification. A service-only transaction validates tenant/actor/attempt/customer/account bindings and persists mapping, connected state and private completion receipt together. Failed persistence is retryable; completed duplicates are acknowledged from their private receipt without another provider dependency. No default invoice method is selected. Setup writes no card summaries; the Solo status RPC excludes card fields and provider identifiers. Spine retains its narrow plan/promotion, amount due, contact readiness, usage and owner-action contract. Duplicate primary contacts remain Selection needed.

## Same-second confirmation follow-up (#899)

Late review found that Stripe confirmation timestamps have second precision: two valid sessions in that second could overwrite one another by webhook arrival order. Additive migration `20261200000300_payment_setup_deterministic_order.sql` preserves the applied migration and compares confirmation time, first server request audit time, then a stable attempt tie-break. Retry audit rows cannot move the first request time. Unknown pre-upgrade ordering preserves the existing method on equal seconds. Ordering metadata remains server-private and participates in the same persistence transaction. No frontend, provider request, charge, plan or contact mutation is added. Independent local PostgreSQL proof and hosted current-schema rollback proof PASS: forward/reverse delivery, exact ties, first-audit retry order, duplicate immutability, legacy NULL compatibility and injected persistence rollback. Hosted cleanup confirmed; no test data or schema persisted. Production persistence of this follow-up is checked separately after merge.

## Evidence ledger

- Automated: 22 setup/reconciliation tests and 4 actual synthetic HMAC signature tests PASS; changed Edge handlers Deno check PASS. Frontend targeted tests 130/130 PASS; independent final review PASS. TypeScript ratchet PASS (13 existing diagnostics, no increase); full typecheck is not clean.
- Database rollback: real hosted schema privacy proof 5/5 PASS after repair (baseline exposed privacy defects); atomic reconciliation proof PASS, rollback cleanup confirmed. No fixture persisted.
- Database concurrency: 8 simultaneous deliveries produce exactly one completion and seven duplicates; one mapping and receipt. Migration replay twice PASS.
- Rendered: isolated Billing harness 200/200 PASS at 1536×770, 1366×768, 1024×768, 900×1000, both themes, focus/reachability and reduced motion. Connected privacy, provider refusal, Selection needed and read-only/error states covered. Synthetic transport, not authenticated/provider proof. Initial obsolete fixture run is INVALID for product acceptance. Production build PASS.
- Production persistence/deployment: #898 merged as `df38d4c7a84acc3fc3685a9c243fb5d6670931d6`. All PR CI, Security, Spine and migration checks PASS, Supabase preview green. Both automatic production deployment jobs PASS. Vercel `dpl_712nQn5fyJjv7iGkw1GrkuU63iw4` READY on that exact SHA, serving `paigeagent.ai`, `app.paigeagent.ai` and `paige-agent-ai.vercel.app`. Actual production `SoloApp-DGu1uhNE.js` contains correlation/authority checks and no removed card-field names. `platform-billing-connect` ACTIVE v2 and `stripe-webhook` ACTIVE v55; all five changed runtime files match the release source exactly after line-ending normalization. Migrations `20261200000100` and `20261200000200` confirmed in production ledger. Live SQL verifies private status contract, service-only reconciliation, no authenticated receipt read, and forced RLS. Unsigned connect request returns 401; unsigned webhook is refused (existing missing-signature path returns 500), with no provider traffic or mutation.
- Local broad Solo regression: 1274/1275 passed; the shell file-scan test timed out during the concurrent run, then passed 4/4 in isolation unchanged. Full Linux CI suite PASS. No test was removed or weakened.
- Authenticated owner/provider: original attempt FAIL. Hosted page, cancel/completed return and refresh still UNVERIFIED. Never call setup complete from tests or a return flag.

## One-minute owner test after verified deployment

As Mogul Maker Academy Solo owner, open Settings → Billing. Confirm promotional access, PAIGE Platform and $0 due. Under Payment method select Set up payment method. A real Stripe-hosted card setup page must open. Cancel, or complete only an approved test-mode setup after confirming test mode. Return to the same workspace; cancellation must not show connected, and completion must wait for persisted connected state. Refresh and switch workspace: no stale banner, error or card state. No charge, subscription, plan/promotion change or automatic contact selection is permitted.

Prepaid AI packs remain next only after this production flow passes, with owner approval of pack amounts/prices, promotional eligibility, refund/chargeback handling and expiry/roll-forward. One credit is 1,000 recorded tokens; no automatic overage or enforcement.
