# Paige agent delivery rules

These instructions apply to Codex, Claude, and every other implementation agent working in this repository.

## Mandatory routing

1. Every software assignment starts by reading the installed Flow-by-Flow skill completely and following every routed reference.
2. Before designing or implementing any visible-interface change, read `.agents/skills/paige-ui-design/SKILL.md` completely and follow every routed reference. Visible interface includes product screens, settings, modals, drawers, forms, onboarding, funnels, landing pages, dashboards, tabs, empty states, responsive/mobile layouts, interaction states, motion, and visual styling.
3. A new or materially changed user flow also requires the installed Flow Prototype skill before production implementation. This includes forms, signup/onboarding, funnels, drawers, modals, settings, payments, connections, destructive actions, and any flow with multiple states or exits.

Do not begin design or implementation until the applicable skills have been read. A wrapper, summary, checkbox, fixture, or rendered screenshot is not a substitute.

## Capability routing (MANDATORY pre-edit gate)

Paige is **one governed operating platform**, not a collection of apps. The binding rule, the
required capability entry path, and the truthful completion rule live in
`docs/PAIGE-MASTER-PROJECT-REFERENCE.md` → "Capability Portfolio — the One Paige Operating Platform
rule". Read it before any substantive feature work. Where a capability belongs, and what proof it
owes, is `docs/doctrine/paige-capability-portfolio.md`.

**This is a PRE-EDIT gate, answered before the first line of code — not a second ship-time
checklist.** The ship-time gate already exists and is unchanged: the six-part checklist in
`docs/brain/paige-brain-wiring-standard.md` §3 (second-brain entry · callable seam · context · tool ·
tier availability · honest-when-it-cannot-answer · modality-neutral acceptance). Answer the ten
questions below to decide **where the work goes and what it must reuse**; answer those six to decide
**whether it is done**. They are two moments in one lifecycle, never two competing lists.

State the answers out loud in the plan or the first message of the build. "I checked" with nothing
named did not happen.

1. **Intended owner outcome** — the real job a human completes, not the component that renders.
2. **Domain owner** — which portfolio family owns this (matrix, column 1), and who else is in flight.
3. **Harness / Gateway dependency** — which shared layer (A–G) it needs, and whether that layer is
   real today per `docs/delivery/harness-completion-map.md`. If the layer is absent, say so; do not
   route around it.
4. **Spine capability** — the exact `domain.capability` key it reads or registers in
   `supabase/functions/_shared/paige-spine/registry.ts`, **or** an explicit honest `UNAVAILABLE`
   with its reason. Never a key you intend to add later, stated as if present.
5. **Provider / connection requirement** — the Integration Capability Registry entry
   (`docs/integration-registry/`) read before, updated before merge. No entry yet → record the
   missing-entry requirement in the work packet and proceed only with work that does not invent
   provider authority. **Listed is never connected** (R1).
6. **Approval / budget / autonomy lane** — its `action-risk` class, its `MUTATION_VERB`, its
   Trust-Compass lane (§67/§68), and the one approval gate
   (`docs/doctrine/one-approval-gate.md`). No slice builds its own confirm channel.
7. **Durable job / event need** — whether it needs the native-event bus or a durable job, and which
   existing producer/drainer it extends. Never a parallel scheduler.
8. **Readback / receipt / Rail** — what proves the act actually happened, and what Paige is allowed
   to say about it. An act with no readback may not be reported as done (R8).
9. **Visible surface + Binding Ledger state** — the `surface` row in
   `docs/binding-ledger/surface-binding-ledger.json`, its current state, and the state this change
   moves it to. A surface not in the ledger is not owner-visible yet.
10. **Authenticated / provider proof required** — the exact evidence class that will make the claim
    true, and what stays `PROOF OWED` or `UNVERIFIED` at merge.

**Prohibited, and blocking.** No domain may create a second Harness, authority or execution engine,
tool registry, job system, browser system, evidence or receipt stream, provider registry, memory, or
orchestrator. If a capability appears to need one, that is a routing conversation, not a build.

**Fixture-backed capability claims are prohibited.** A capability is not real because a component
renders, a tool exists, a fixture or structural test passes, a provider name appears in
documentation, a flag is set, a migration merged, a preview deployed, or a previous agent's report
said so. State `UNVERIFIED` or `UNAVAILABLE` honestly instead — that is always an acceptable answer,
and a false `LIVE` never is.

## Interface standard

Design around the user's actual job, real data contracts, permissions, and complete flow. Reuse Paige's established tokens and design system before creating replacements. Do not fabricate metrics, activity, history, health, providers, authorization, or capabilities. Do not ship generic card grids, decorative gradients, empty dashboard chrome, static-looking controls, or purposeless effects.

The UI skill does not grant design authority. Follow `CLAUDE.md` §00: implementation agents record and faithfully port the approved Claude Design pack; they do not invent or override visual direction.

All states must be honest:

- `LIVE`: backed by a proven, usable contract in the tested environment.
- `PARTIAL`: a proven subset works and the missing part is named.
- `UNAVAILABLE`: the required provider or backend contract does not exist or is not connected.
- `UNVERIFIED`: the claim was not proven at the evidence level stated.

A UI feature is not working merely because it renders, has fixtures, passes a structural test, or has an attestation. Claims require appropriate static, automated, rendered, behavioral, and authenticated-runtime evidence, with untested behavior labeled `UNVERIFIED`.

## Release identity and customer updates

<!-- RELEASE_GOVERNANCE_POLICY -->

Before opening or closing a PR, merging, deploying, assigning a version, or describing a change to a customer, read `docs/doctrine/release-governance-and-customer-update-policy.md`. Record the exact internal build identity and release channel for every delivery. Create a customer release name/version only for a coherent owner-visible outcome that passes the policy's announcement gate. Never turn a commit, preview, prototype, shell, listed provider, or `PROOF OWED` capability into a `LIVE` customer claim.

## Shipped Delivery Log

At workstream startup and before PR preparation, read `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` Section 4.0. After every merge to `main`, append one verified row to its Shipped Delivery Log in the same closeout change: exact PR and main commit, what shipped and why, actual delivery/proof boundary, canonical evidence, and customer-release eligibility. A workstream may not be reported complete until that row exists, or its closeout records an explicit `N/A` because the PR did not reach `main`. Never create a second shipped log, delivery ledger, master file, roadmap, or program registry.

A closeout-only PR whose sole change is recording the exact post-merge identity of the preceding delivery closes that preceding row and is not logged recursively. Git remains the evidence for that mechanical closeout commit. This exception may not carry product, policy, capability, or status change.

## Evidence and review

Every UI pull request must add a record under `docs/evidence/ui-delivery/` based on `docs/evidence/ui-delivery/TEMPLATE.md` and use `.github/PULL_REQUEST_TEMPLATE/ui-delivery.md`. The `ui-delivery-evidence` workflow checks recognized UI paths for that record. The guardrail validates structure only; reviewers must inspect the evidence and the user-visible flow. A backend, RPC, edge-function, entitlement, or provider-contract change that alters a visible customer flow declares it with a `Visible-Flow-Impact: yes` commit trailer and adds the evidence record. The CI guardrail auto-routes such a declared change when it touches `supabase/functions/**` or `supabase/migrations/**`; a declared change on any other path (e.g. a non-UI `src/**` client) is review-routed, not CI-routed, so reviewers must inspect the flow.

For Solo UI, cover 1536x770, 1366x768, 1024x768, and 900x1000 with PAIGE closed and open. Test a relevant tenant and a different known-good tenant. Verify the real scroll owner, clipping, reachability, keyboard path, focus, zoom/reflow, reduced motion, relevant states, cancellation, and workspace switching.

See `docs/doctrine/paige-ui-delivery-standard.md` for the binding standard and `docs/guides/how-paige-ui-work-gets-designed-tested-released.md` for the owner-facing release map.
