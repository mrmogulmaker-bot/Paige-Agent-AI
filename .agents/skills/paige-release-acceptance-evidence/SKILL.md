---
name: paige-release-acceptance-evidence
description: Module 5 of the Paige UI Delivery Standard. Require evidence separated by class — automated, static, rendered, interactive, authenticated-runtime, provider, deployment, production acceptance — with truthful labels; nothing is LIVE because it merely compiles, renders, or passes a structural harness.
---

# Release Acceptance & Evidence

This is **module 5 of five** in the Paige UI Delivery Standard. It adds no new source of truth. Read
first:

1. `docs/doctrine/paige-ui-delivery-standard.md` —
   [Evidence contract](../../../docs/doctrine/paige-ui-delivery-standard.md#evidence-contract) and
   [Truth labels](../../../docs/doctrine/paige-ui-delivery-standard.md#truth-labels).
2. `docs/doctrine/release-governance-and-customer-update-policy.md`.
3. `CLAUDE.md` §70.1 (the user-usability gate) and §32 (a green build is not a working render).

## Evidence, separated by class (never merged)

Report each class distinctly; do not let one stand in for another:

- **automated** — focused tests, negative controls, regression results;
- **static** — lint, type, build, policy/security scan, contract inspection;
- **visual / rendered** — screenshots or recordings at the required geometry and themes;
- **interactive browser** — real interaction including failures, exits, focus, recovery;
- **authenticated owner / test-tenant** — the real authenticated route and owning server contract;
- **provider / payment / integration** — real provider/test-mode proof where a provider is claimed;
- **deployment** — the exact build/commit/migration/edge identity that is live;
- **production acceptance** — the human completing the job on the real platform;
- **known limitations** and the **rollback / recovery** path.

## Truth labels (use without softening)

Two sets, kept apart so a value lands where CI accepts it:

- **Capability / truth-boundary** (what a claim or `RELEASE_TRUTH_BOUNDARY` may say): `LIVE` · `PARTIAL`
  · `UNAVAILABLE` · `PROOF OWED`. The CI validator accepts exactly these for `RELEASE_TRUTH_BOUNDARY`;
  do not write a delivery-outcome word there.
- **Delivery outcome** (the result of a check or gate): `PASS` · `VERIFIED` · `UNVERIFIED` · `BLOCKED`
  · `FAILED`.

No feature is `LIVE` solely because it compiles, renders, has fixtures, or passes a structural harness
(§32/§70.1). A harness drive against an in-memory double is structural evidence, never authenticated
runtime. When a contract genuinely does not exist, mark that exact capability `UNAVAILABLE` with its
reason and recovery path — and keep delivering every other proven flow.

## Evidence it requires

The evidence classes above (the standard's six core classes — automated, static, rendered, behavioral,
authenticated-runtime, `UNVERIFIED` — plus the release-specific proof: provider, deployment, production
acceptance, and rollback/recovery), plus the seven `RELEASE_*` fields
(`INTERNAL_BUILD_IDENTITY`, `RELEASE_CHANNEL`, `RELEASE_CLASSIFICATION`, `CUSTOMER_RELEASE_IDENTITY`,
`RELEASE_NOTE_REQUIRED`, `RELEASE_TRUTH_BOUNDARY`, `RELEASE_RECOVERY`). No PR is feature-complete, or
put to the owner for go-live, until this gate is met or its gaps are reported `UNVERIFIED` / `UNAVAILABLE`
and excluded from the claimed deliverable.
