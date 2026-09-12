# Proof Lane — evidence record (Harness Layer G)

Durable, committed evidence for the authenticated-proof framework. Runtime proof records write to the
gitignored `scripts/live-drive/artifacts/proof-lane/`; this file is the committed summary of what is
proven and what is owed, updated when a capable session runs the flows.

**Framework:** `scripts/live-drive/proof-lane.mjs` · **Docs:** `scripts/live-drive/PROOF-LANE.md` ·
**Flows:** `scripts/live-drive/flows/solo-governed-flows.mjs`

## Evidence by class (§70.1 — separated, truthfully labelled)

| Class | Status | What was run |
|---|---|---|
| **Automated test** (pure logic) | ✅ PASS | `npm run test:proof-lane` — 16 `node --test` cases: capability resolution, attribution (no secret leak), step classification (positive + negative), flow-status folding, flow validation, redaction, and `runFlow` (owed path launches no browser; negative-step-that-succeeded fails the flow). |
| **Build / static** | ✅ wired | `test:proof-lane` added to the CI `verify` job (browser-free). |
| **Structural / harness mechanics** | ✅ PASS (sandbox) | `npm run proof:lane:selftest` — drives **real Chromium** via `data:` URLs (no network/auth/prod): runnable→`VERIFIED`, no-creds→`PROOF_OWED` (no browser launched), un-enforced denial→fails, attribution + screenshot captured, secret redacted. |
| **Authenticated runtime** | ⛔ **PROOF_OWED** | No authenticated run was possible in this session — no Solo test-tenant credentials, and prod is unreachable headless. Not attempted against prod (a reachability failure must not read as a broken surface). |

## Per-flow proof state (as of 2026-09-12)

All seven governed flows are **`PROOF_OWED`** — the framework, mechanics, and definitions are proven;
the authenticated drive is owed to a capable session with the test tenant + secrets.

| Flow | Proves | Authenticated status |
|---|---|---|
| `contact-create-governed` | governed create → readback → receipt/Rail (the reference vertical) | PROOF_OWED |
| `tenant-isolation` | a foreign tenant's record is **denied** (§9) | PROOF_OWED |
| `capability-truth` | Paige reports honest availability, no fabricated capability | PROOF_OWED |
| `approval-behavior` | a high-risk act is gated; nothing executes unattended | PROOF_OWED |
| `readback-persistence` | a saved change survives reload (guards "Saved." that discards the write) | PROOF_OWED |
| `retry-idempotency` | a transient failure recovers with no double effect | PROOF_OWED |
| `account-switch-isolation` | switching workspace shows no cross-tenant bleed | PROOF_OWED |

## The one owner action that discharges PROOF_OWED

1. Provision a **least-privilege Solo test tenant + test user** — standalone (no parent), one base-role
   owner membership, **no** operator/admin/cross-tenant/send/publish/spend/billing/provider/destructive
   authority; clearly test-only records + a cleanup path (`docs/delivery/solo-test-tenant-spec.md`).
2. Set **`LIVE_DRIVE_URL` + `LIVE_DRIVE_EMAIL` + `LIVE_DRIVE_PASSWORD`** in the **approved CI secret
   mechanism** — never printed, committed, logged, or screenshotted.

Then `npm run proof:lane` from a browser-capable, prod-reachable session turns each flow `VERIFIED` /
`PARTIAL` and writes the runtime records; update this summary with the result.

## Honest limits (§13/§32.c)

This headless build/remote session cannot create `auth.users`, set CI secrets, or reach prod — so the
authenticated runtime class is genuinely owed, not skipped-and-claimed. The proof lane exists precisely
so this stops depending on the owner's eyes once the test tenant is provided.
