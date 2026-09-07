# Release Governance & Customer Update Policy

<!-- RELEASE_GOVERNANCE_POLICY -->

**Status:** canonical standing delivery policy

**Owner:** Antonio Cook

**Effective:** 2026-09-06

**Applies to:** every agent, pull request, merge, migration, edge deployment, web deployment, staged rollout, release decision, customer update, and Paige-authored answer about what changed.

## 1. One truthful release system

This policy is the canonical rule for how Paige Agent AI identifies, proves, names, and explains releases. It does not replace the Master Project Reference, Second Brain, Surface Binding Ledger, Integration Capability Registry, tier matrix, or evidence records. Those remain the authoritative stores for their own facts. This policy tells every delivery path how to use them consistently.

The release chain is:

`internal build identity → release channel → customer release identity (only when earned) → What's New → Paige-readable summary`

No layer may infer the next one. A commit is not a deployment. A deployment is not a customer release. A customer release name is not proof that its outcome works.

## 2. The three identities

### Internal build identity — always recorded

Every PR and deployment closeout records:

- exact 40-character commit SHA;
- deployment/provider ID and environment;
- release channel;
- migration status and exact migration identifiers, or `NOT_APPLICABLE`;
- edge-function status and exact deployed functions/versions, or `NOT_APPLICABLE`;
- CI, security, and required production-check results;
- evidence links or reproducible references;
- rollback or forward-fix position.

Within a release record, each internal build is marked `referenced` when its deployment ID appears in
the customer note's internal technical reference, or `supporting` when it is retained only as build history.
The two sets must agree exactly; supporting preview/development evidence cannot satisfy a publication gate.

This identity is operational truth. It is internal by default and need not appear in customer copy. `main`, a branch name, a PR number, “latest,” or a URL alone is not an exact build identity.

### Release channel — always explicit

- `development`: local or isolated work; not customer-reachable.
- `preview`: hosted review evidence; not production and not customer release proof.
- `production`: deployed to the live production environment.
- `staged`: an owner-approved bounded rollout with the cohort, percentage or eligibility rule, start/stop conditions, monitoring owner, and recovery path recorded.

Promotion between channels never changes evidence labels by itself. Preview proof stays preview proof. Production deployment without an authenticated drive stays `PROOF OWED` for claims that require it.

### Customer release identity — only when earned

A human version and release name exist only when a coherent, owner-visible outcome is ready to explain as one release. Routine commits, migrations, edge deploys, repairs, and internal refactors keep their internal build identity without inventing a customer version.

During the Paige Solo Preview / founding-release period, customer releases use `0.x.y`:

- **Patch (`0.x.y`):** fixes, reliability, performance, or small polish. Record internally; generally do not announce unless the issue materially affected customers or requires action.
- **Minor (`0.x.0`):** a meaningful owner-visible capability or workflow improvement. A release note is required.
- **Major (`x.0.0`):** a coherent platform milestone, never a count of PRs. `1.0` requires Antonio's explicit release decision and demonstrated end-to-end operating-system coherence.

Version numbers are assigned at the customer-outcome boundary, not per PR. Several internal builds may compose one customer release; one PR may also remain unversioned.

## 3. Customer announcement gate

A customer-facing release may be announced only when all are true:

1. The actual user outcome is deployed and evidence-backed.
2. CI, security, and every required production check are green for the exact deployment identity.
3. Required authenticated proof is complete, or the release wording names the exact `PROOF OWED` boundary and excludes it from any `LIVE` claim.
4. No prototype, UI shell, listed integration, planned provider capability, fixture, static render, or unavailable contract is described as live.
5. The release record names scope, affected audience/tier, benefits, limitations, rollback/recovery position, and exact deployment identity.
6. The Master Project Reference, relevant Second Brain record, tier matrix when applicable, Surface Binding Ledger when applicable, and Integration Capability Registry when applicable agree with the claim.
7. The owner has approved the customer release identity and publication. Merging or deploying is not publication authority.

If any required check is red, the release is not announced. If proof is unavailable but the usable outcome is otherwise safe and real, the note may use `PARTIAL` or `PROOF OWED` only when it precisely separates what works from what remains unproven.

## 4. Required status language

- `LIVE`: the stated outcome is deployed and proven at the evidence level it requires.
- `PARTIAL`: a proven subset works; the exact missing portion is named.
- `UNAVAILABLE`: the required contract/provider is absent, disconnected, or not offered.
- `PROOF OWED`: implementation exists, but the required authenticated or production evidence is not complete.

These words describe claims, not optimism. A single release may contain more than one status when each item is clearly separated.

## 5. Required What's New format

Every minor or major customer release note uses this order:

1. **Release name, version, and date**
2. **Plain-English customer outcome** — what the owner can now accomplish
3. **What changed** — concise, outcome-led details
4. **Who can use it** — exact audience, role, tier, cohort, or staged eligibility
5. **Action required** — what the owner must do, or “No action required”
6. **Status** — `LIVE`, `PARTIAL`, `UNAVAILABLE`, and/or `PROOF OWED`, applied to specific claims
7. **Known limitations and safe next step**
8. **Exact technical release reference — INTERNAL ONLY** — commit SHA, deployment ID, environment, migrations/edge status, checks, and evidence
9. **Paige-readable summary** — tenant-safe plain language Paige can use to answer, “What changed in my workspace?”

Customer copy never includes secrets, internal sensitive payloads, tenant data from another workspace, raw security findings, or chain-of-thought. The internal technical reference is not displayed in routine customer copy.

## 6. Release record and closeout

The machine-readable contract is `docs/release-governance/release-record.schema.json`. A customer release candidate gets one record under `docs/release-governance/records/` before publication. Internal-only PRs still complete the release-governance fields in the PR body; they do not need a customer release record unless they join a named release train.

Release records are additive historical evidence. Correct an error transparently; do not rewrite a dated release to imply proof that did not exist at publication time. The Master Project Reference remains the source for current platform truth.

Every PR answers:

- What is the internal build identity now, and what remains unknown until deployment?
- Which release channel is affected?
- Is this internal-only, patch, minor-candidate, major-candidate, or part of a named train?
- Is customer release-note content required?
- Which claims are `LIVE`, `PARTIAL`, `UNAVAILABLE`, or `PROOF OWED`?
- Which truth stores must update in this same change?

Every deployment closeout replaces anticipated identifiers with exact observed identifiers and records the post-deploy result. A passed CI run never fills in an unobserved production deployment ID.

## 7. First customer-facing release train — recommendation for owner decision

**Decision state: RECOMMENDED; NOT APPROVED; NOT ANNOUNCED.**

- **Train:** `Paige Solo Preview 0.1.x`
- **First candidate label:** `0.1.0 — Governed Workspace Foundations`
- **Why this is truthful:** the current production record shows meaningful owner-visible Solo workflows and governed foundations, while the Surface Binding Ledger explicitly reports no fully `LIVE` end-to-end Paige surface binding and several capabilities remain `PARTIAL`, `UNAVAILABLE`, or `PROOF OWED`.
- **Required scope before publication:** the owner selects the small set of genuinely usable outcomes to include; each included outcome passes the announcement gate above. Unselected or unproven platform breadth stays out of the note.
- **Not authorized by this recommendation:** assigning `1.0`, publishing marketing, sending a customer announcement, or claiming platform-wide operating-system coherence.

## 8. UX direction — approved policy, interface not built

Future Updates/Release Notes UX should:

- place a subtle unread-update indicator in the existing workspace/account area;
- provide one durable Updates/Release Notes destination;
- avoid disruptive popups for routine patches;
- reuse existing navigation chrome rather than add a second rail, header, launcher, or release center;
- filter by the current workspace's eligible audience/tier and never expose internal technical references;
- let Paige answer from the same published release record, using its Paige-readable summary rather than generating a broader claim.

### Future Updates UI handoff

Before production UI work, use Flow Prototype and obtain the required visual/intended-function approval. Ground the exact existing workspace/account container, unread-state ownership, per-user versus per-workspace read semantics, accessibility announcement behavior, and responsive fit. The implementation should consume published release records through one tenant-safe reader, persist a last-seen marker without treating it as release truth, support empty/loading/error/read/unread states, and preserve the existing shell and navigation. No modal or popup is required for patches. Authenticated cross-workspace and audience/tier proof is mandatory before calling the UI live.

## 9. Authority and conflicts

This policy governs release identity and customer update wording. It does not grant merge, deployment, external-publication, marketing, provider, spending, migration, or destructive-data authority. Current higher-authority owner instructions still control those acts.

If another document conflicts with this policy on release identity or customer updates, stop the conflicting claim, preserve the more conservative evidence state, and record a dated correction in the decision log. Do not create a sibling policy.
