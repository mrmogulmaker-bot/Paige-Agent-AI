# AGENTS.md — cross-agent entrypoint for the Paige Agent AI repo

This file is the root instruction every implementation agent reads — Claude, Codex, and any other.
It is intentionally short. **The full operating doctrine is `CLAUDE.md`; read it first.** This file
exists so that one rule in particular cannot be missed.

## Read first

1. **`CLAUDE.md`** — the complete working doctrine (jurisdiction §00, tenant/platform seams,
   honesty §13, verification §32/§70, and everything else). It governs.
2. **`docs/PAIGE-MASTER-PROJECT-REFERENCE.md`** — the single source of truth for what is shipped,
   gapped, and planned (§0).
3. **`docs/brain/README.md`** — the second brain; read before work, update with work (§BRAIN).

## MANDATORY: UI work runs through the Paige UI Delivery Standard

Any agent that **designs, redesigns, or materially changes a Paige user interface** — product
screens, settings, modals, drawers, forms, onboarding, funnels, landing pages, dashboards, tabs,
empty states, mobile layouts, interaction states, animation, or visual styling — MUST follow the
Paige UI Delivery Skills Standard. It is not optional and it is not "if there's time."

**Standard:** `docs/paige-ui-delivery/UI-DELIVERY-STANDARD.md`
**Active skill (load it):** `.claude/skills/paige-ui-delivery/SKILL.md`
**Curated, pinned upstream bundle:** `docs/paige-ui-delivery/upstream/` (provenance in `PROVENANCE.md`)

### The five rules

1. **Flow-by-Flow first** — every software/UI task begins with the `flow-by-flow` skill (§69).
2. **The UI bundle before design or implementation** — for any visible interface, load
   `paige-ui-delivery` (and through it `frontend-design`) BEFORE you design or build.
3. **Flow Prototype before production for any new/changed flow** — forms, signup/onboarding,
   funnels, drawers, modals, settings, payment, connection, destructive actions, anything
   multi-state/multi-exit: use `flow-prototype` before production implementation.
4. **Design around the user's real job** — not generic cards, decorative chrome, empty dashboard
   filler, or a static mockup that cannot be used.
5. **"It renders" is not "it works"** — no agent claims a UI feature works because it renders, has
   fixtures, or passes a structural test. Claims require rendered + behavioral evidence (§32/§70),
   labelled truthfully **LIVE / PARTIAL / UNAVAILABLE / UNVERIFIED**.

### Routing

`flow-by-flow` → (visible interface? ) `paige-ui-delivery` bundle → (new/changed flow?)
`flow-prototype` → design → implement → verify (rendered + behavioral) → evidence → ship.

### Enforcement

A PR that changes shipped UI (`src` `.tsx`/`.css`, excluding tests/stories) must carry the **UI
Delivery Evidence** block from `docs/PULL_REQUEST_TEMPLATE.md`; CI (`lint:ui-evidence`) fails without
it. DB-only, edge-function-only, docs-only, test-only, and backend-only PRs are a no-op pass. The
gate forces the evidence to exist and be reviewable — it is a guardrail, not proof the feature works.

For Codex specifically: this repo's skills live under `.claude/skills/`; if your client cannot
discover them there, treat this section and `docs/paige-ui-delivery/UI-DELIVERY-STANDARD.md` as the
instructions and follow the routing above.

## Boundaries

- Do not redesign unrelated product surfaces as a side effect.
- Do not alter, merge, close, or rebase other owners' active work (A2P, Zapier, AI Orchestration,
  Sales, Billing, Trust Compass, etc.). If you hit a collision in a shared file (root instructions,
  CI), preserve the other owner's change, isolate yours, and resolve only what is necessary.
- Do not install unreviewed dependencies or copy upstream material without retaining provenance and
  checking its license.
- A checklist checkbox is never production proof.
