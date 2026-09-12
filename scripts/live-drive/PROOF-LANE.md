# Proof Lane — the reusable authenticated-proof framework (Harness Layer G)

The proof lane turns "prove an authenticated governed flow end to end" into **data + a runner**, so a
capable session stops hand-rolling a 400-line `*-drive.mjs` each time and stops being vague about what
was actually proven. It **extends** `live-drive.mjs` (§18/§30 — it calls `liveDrive`, it never forks the
Chromium launch), and it is **honest by construction** (§13/§32): it reports `VERIFIED` only when a real
authenticated drive actually asserted, and `PROOF_OWED` when this session could not run it.

## Files

| File | Role | Runs in CI? |
|---|---|---|
| `proof-lane.mjs` | The framework: status vocabulary, `defineFlow` data model, `runFlow` runner, attribution, redaction | its pure logic, yes |
| `__tests__/proof-lane.test.mjs` | `node --test` unit tests for the pure core (no browser) | **yes** (`npm run test:proof-lane`) |
| `proof-lane.selftest.mjs` | Browser **mechanics** proof — drives real Chromium via `data:` URLs | no (sandbox only; CI has no browser) |
| `flows/solo-governed-flows.mjs` | The concrete governed-flow **definitions** + runner entry | n/a (run from a capable session) |

```bash
npm run test:proof-lane        # pure-logic unit tests (CI + anywhere)
npm run proof:lane:selftest    # browser mechanics proof (pre-provisioned sandbox)
npm run proof:lane             # run the governed flows (VERIFIED with creds; PROOF_OWED without)
```

## The proof-status vocabulary (one home)

| Status | Meaning |
|---|---|
| `VERIFIED` | Ran, asserted, passed — with evidence captured |
| `PARTIAL` | Some steps verified, at least one owed/unavailable — **none failed** |
| `PROOF_OWED` | Could run, but this session lacked the capability (creds / reachability / browser) |
| `UNAVAILABLE` | Cannot run: a required contract/surface does not exist yet (honest absence) |
| `UNVERIFIED` | Not attempted / unknown — the default; **never a silent pass** |

A single **failed** step fails the whole flow. Empty or unknown is `UNVERIFIED`, never a pass.

## Defining a flow

A flow is data. Each step names what the authenticated run must prove (`intent`), the surface `path`
(resolved against `LIVE_DRIVE_URL` — never a hardcoded host), and an `expect` the runner classifies:

**Positive:** `render`, `readback`. **Negative (a guard that MUST hold):** `denied`,
`approval_required`, `unavailable_connection`, `provider_failure`, `retry_succeeds`, `cancelled`,
`account_switch_isolated`.

The asymmetry is the point: a `denied` step is `VERIFIED` only when a refusal **actually happened**; a
`denied` step whose action unexpectedly **succeeded** fails the flow — that is a real §9 authority/
isolation hole, never a pass. A capable session wires each step's `assert(page, markers)` to set the
boolean markers (e.g. `{ refused: true }`) the runner reads — markers only, never page text, so no
content or secret ever enters the record.

## Evidence + attribution

Every record carries non-secret attribution: **build SHA** (`LIVE_DRIVE_BUILD_SHA` ||
`VERCEL_GIT_COMMIT_SHA` || `GITHUB_SHA`), a **tenant ref** and **actor ref** (non-secret labels), the
env kind, and a timestamp. Records write to the gitignored `artifacts/proof-lane/` (runtime output);
the durable, committed evidence summary lives at `docs/evidence/proof-lane/`.

## The one owner action that turns PROOF_OWED into VERIFIED

The framework, its mechanics, and the flow definitions are complete and proven headless. The
**authenticated runs** are `PROOF_OWED` until a capable session has:

1. a **least-privilege Solo test tenant + test user** — standalone (no parent), one base-role owner
   membership, **no** operator/admin/cross-tenant/send/publish/spend/billing/provider/destructive
   authority; clearly test-only records with a cleanup path (`docs/delivery/solo-test-tenant-spec.md`);
2. **`LIVE_DRIVE_URL` + `LIVE_DRIVE_EMAIL` + `LIVE_DRIVE_PASSWORD`** set in the **approved CI secret
   mechanism** — never printed, committed, logged, or screenshotted (the runner and `liveDrive` redact
   them defensively regardless).

Then `npm run proof:lane` from a browser-capable, prod-reachable session turns each flow `VERIFIED` /
`PARTIAL` and writes the evidence. No credential value is ever needed in code or a record.

## Scope fence (owner rule, 2026-09-12)

No flow sends, publishes, spends, bills, calls a paid provider, or mutates real-client data. Mutations
are confined to clearly test-only records on the isolated Solo test tenant, each with a cleanup path.
External comms, publication, payments, provider actions, and real-client mutation stay **outside** the
automated proof scope unless separately authorized.
