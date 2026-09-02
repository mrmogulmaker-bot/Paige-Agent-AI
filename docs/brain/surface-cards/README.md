# Solo surface cards — template, use rules and index

**Created by the 2026-09-02 Solo Platform Taxonomy docs work.** This directory is the canonical home
for detailed Solo surface cards. It did not exist as this standard before that work.

Read these authorities first:

1. [`docs/brain/solo-platform-taxonomy-and-ui-flow-standard.md`](../solo-platform-taxonomy-and-ui-flow-standard.md)
2. [`docs/brain/paige-spine-integration-standard.md`](../paige-spine-integration-standard.md)
3. this index/template; and
4. the relevant card below.

Supporting references such as the tier matrix, PAIGE Brain Wiring Standard and Connections/Rail
contract may be linked by a card. They do not replace these four canonical preflight paths.

## Use rules

- Create or update the owning surface card **before** design or implementation changes its human
  job, route, data authority, input/edit/create flow, evidence, PAIGE behavior, approval, Rail effect,
  truth status, proof obligation, dependency or collision boundary.
- Map the full owner flow—entry, first/empty, central action, success, refusal, error/retry,
  abandonment, account/client switch, PAIGE closed/open, exit/return and sibling regression—before
  isolated visual polish.
- A card describes the contract and current truth; it does not authorize product code, a provider
  action, migration, merge or deployment. Never upgrade capability from a fixture, type, migration,
  render or structural test.
- Link canonical domain, permission, provider, approval and Spine authorities. Do not copy their
  mechanics into the card.
- A stable Spine registration is self-service. Raise an SCR only for a new shared primitive or
  shared-contract change.
- Preserve `LIVE`, `PARTIAL`, `UNAVAILABLE` and explicit `UNVERIFIED`. `NOT CONNECTED` is an account
  state, not implementation maturity.

## Required template

Each card must contain these fields:

1. **Status and grounding** — date, exact base/source, truth labels and authenticated-proof limit.
2. **AI COO contribution** — what safe business truth PAIGE learns, what bounded help she may offer,
   what she may execute, what requires the owner, and how the outcome returns to durable context.
3. **Human job** — first use, return use and desired outcome.
4. **Owning domain/data** — records, safe server authority and explicit non-owners.
5. **Solo-shell location** — destination, subtab/mode and supported entry/return paths.
6. **Input/edit/create flows** — inputs, validation, save/create/edit, refusal, retry, abandonment and
   account/client switch.
7. **Evidence** — safe fields/facts, source/provenance, audience, freshness and unavailable/error
   states; include the never-list.
8. **What PAIGE may know** — registered, server-resolved evidence within active authority only.
9. **What PAIGE may propose and do** — separate read, proposal, mutation and external effect.
10. **Approval boundary** — domain permission, risk classification and the one Chat gate.
11. **Rail effect** — safe attributable outcome, reference and recovery, or `UNAVAILABLE`.
12. **Truth and browser proof** — capability-leg maturity plus required authenticated flow matrix.
13. **Dependencies and collisions** — file/contract owners, active work, shared primitives and the
    boundary that prevents parallel ownership.
14. **Regression impact map** — upstream/downstream flows and known-good siblings that must hold.

The card must answer the AI COO loop explicitly:

> observe → understand → plan → act within authority → record outcome → learn/follow up

Chat remains the final governed interaction surface, not the product boundary. Trust Compass
expresses owner autonomy intent but is not server enforcement until persisted and enforced
server-side; current authority is domain permission plus server action-risk and the one approval
gate.

## Index

| Surface card | Owner/location | Status |
|---|---|---|
| [`solo-campaigns-pipeline.md`](solo-campaigns-pipeline.md) | Campaigns → Pipeline | First required card; contract `PARTIAL`, authenticated browser proof `UNVERIFIED` in this docs pass |

No other detailed card is claimed to exist yet. The baseline cards in the Solo Platform Taxonomy
remain the current orientation; create the relevant detailed card here before changing another
surface.
