---
name: paige-protected-behavior-regression
description: Module 4 of the Paige UI Delivery Standard. Before editing, declare which protected seams the change can affect, test every impacted seam, and explicitly name every seam it does not affect — never "I looked nearby."
---

# Protected Behavior Regression

This is **module 4 of five** in the Paige UI Delivery Standard. It adds no new source of truth. Read
first:

1. `CLAUDE.md` §58 (a shipped, owner-approved capability is never silently removed) and §70.1.
2. `docs/doctrine/paige-ui-delivery-standard.md`.
3. The protected-seam list below, each with its owning contract.

"I looked nearby" is not regression scope. This module makes the scope **named, visible, and testable**.

## The protected-seam declaration (pre-edit, mandatory)

Before editing, state — in the evidence record under `PROTECTED_SEAMS` — for each seam below whether
the change **can** affect it. For every seam marked affected: test it and attach the proof. For every
seam marked not-affected: say so explicitly (the explicit "not affected" is the point — it proves the
seam was considered).

| Seam | Owning contract |
|---|---|
| tenant / workspace / client / account isolation | `docs/doctrine/tier-matrix.md` (§51), `CLAUDE.md` §59, `DOCTRINE_203` |
| authentication & account choice | `src/lib/routing/`, `docs/security/OPERATOR-ACCESS-MODEL.md` |
| Solo entitlement / signup / paywall / billing / provisioning | `docs/delivery/billing-foundation-*`, `docs/doctrine/money-spine-architecture.md` |
| approval / autonomy / authority rules | `docs/doctrine/one-approval-gate.md`, `autonomy-architecture.md` §10 |
| Spine tool execution | `docs/doctrine/governed-execution-seam.md`, `docs/brain/paige-spine-and-rail-state.md` |
| canonical writes & readback | `docs/brain/solo-tenant-brain.md`, `docs/delivery/canonical-readiness-contract.md` |
| Rail / receipts / audit / Memory boundaries | `docs/brain/paige-receipt-rail-contract.md`, `docs/brain/paige-memory-contract.md` |
| chat transcript scroll / stream / message identity / thread change / pop-out / minimize-restore / history hydration | `docs/evidence/ui-delivery/paige-chat-scroll-*` (runtime in `src` chat components) |
| Live Conversation state | `docs/doctrine/paige-modality-neutrality.md` |
| Secure Browser / Vault & credential boundaries | `docs/handoff/paige-secure-browser-build-handoff.md` |
| integration / provider status & external side effects | `docs/integration-registry/`, `docs/doctrine/connections-rail-contract.md` |
| durable job scheduling / retries / idempotency / recovery | `docs/brain/paige-durable-job-contract.md` |
| responsive shell geometry | `docs/doctrine/solo-shell-contract.md` (hand the viewport proof to module 3) |
| accessibility | module 3 |
| privacy, secrets, and sensitive-data handling | `_shared/capability-record.ts` `redactDetail()`, `security-audit.yml` |

## The gate

- A change that can affect a seam and does not test it is not done.
- A seam left undeclared (neither affected nor explicitly not-affected) is an incomplete declaration.
- Never fix a seam outside the change's scope by absorbing it; route it to its owner (§58, the
  Attention Register).

Evidence: `PROTECTED_SEAMS` — not yet required or checked by the CI guardrail (it ignores unknown
fields); Phase 3 wires it as optional, required only per an announced cutover.
