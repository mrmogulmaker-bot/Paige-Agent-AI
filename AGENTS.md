# Paige agent delivery rules

These instructions apply to Codex, Claude, and every other implementation agent working in this repository.

## Mandatory routing

1. Every software assignment starts by reading the installed Flow-by-Flow skill completely and following every routed reference.
2. Before designing or implementing any visible-interface change, read `.agents/skills/paige-ui-design/SKILL.md` completely and follow every routed reference. Visible interface includes product screens, settings, modals, drawers, forms, onboarding, funnels, landing pages, dashboards, tabs, empty states, responsive/mobile layouts, interaction states, motion, and visual styling.
3. A new or materially changed user flow also requires the installed Flow Prototype skill before production implementation. This includes forms, signup/onboarding, funnels, drawers, modals, settings, payments, connections, destructive actions, and any flow with multiple states or exits.

Do not begin design or implementation until the applicable skills have been read. A wrapper, summary, checkbox, fixture, or rendered screenshot is not a substitute.

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
