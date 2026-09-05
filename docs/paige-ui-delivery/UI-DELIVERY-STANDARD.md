# Paige UI Delivery Skills Standard

**Owner-commissioned governance (2026-09-05).** Any agent — Claude, Codex, or otherwise — that
designs, redesigns, or materially changes a Paige user interface follows the workflow below. This
standard is *delivery governance*: it decides which skills run, in what order, and what evidence a
UI change must carry before it is called done. It does not decide taste. Design decisions remain
Claude Design's and the owner's (CLAUDE.md §00); this standard only guarantees the disciplined
workflow and honest evidence around them.

It **extends** existing doctrine, it does not replace it: §69 (Flow-by-Flow is mandatory on every
software task), §11/§22/§23 (design floor, tokens, colour-is-emotional), §13 (honest reporting),
§28/§58 (approved-frozen, anti-regression), §32/§70 (a green build is not a working render; the
deliverable is a human finishing the job), and §00 (design jurisdiction).

---

## The five mandatory rules

1. **Flow-by-Flow first.** Every software/UI assignment begins with the `flow-by-flow` skill, as
   §69 already requires. No exceptions.
2. **The Paige UI Design bundle before design or implementation.** Every assignment that affects a
   visible interface then loads the **`paige-ui-delivery`** skill and, through it, the curated
   upstream bundle (`frontend-design` first) **before** any design or implementation work begins —
   not after, not "if there's time."
3. **Flow Prototype for any new or materially changed flow.** Any new or materially changed user
   flow also uses the `flow-prototype` skill **before** production implementation. This includes
   forms, signup/onboarding, funnels, drawers, modals, settings flows, payment flows, connection
   flows, destructive actions, and any flow with multiple states or exits. (Pre-launch, §4/§69's
   override lets you build the prototype and keep going to merge; it does not let you skip building
   it.)
4. **Design around the user's real job.** The interface is built around the actual task the user
   came to do — not generic cards, decorative gradients, empty dashboard chrome, or a static mockup
   that cannot be used.
5. **A UI feature is not "working" because it renders.** No agent may claim a UI feature works
   merely because it renders, has fixtures, or passes a structural test. Claims require the
   appropriate **rendered and behavioral** evidence (see *Expected evidence*). This is §32/§70,
   restated for the interface.

---

## When the UI skill is required — "what counts as a UI change"

The bundle is required whenever a change creates or materially alters something a person **sees or
operates**. Non-exhaustively:

- product screens, dashboards, tabs, sub-tabs;
- settings, modals, drawers, popovers, sheets;
- forms, signup/onboarding, funnels, wizards, connection flows, payment flows;
- landing / marketing pages;
- empty states, first-use states, loading/skeleton, error/retry, permission-denied, success,
  cancellation;
- interaction states (hover, focus, active, selected, disabled, busy), animation and motion;
- visual styling — colour, type, spacing, hierarchy, depth, iconography;
- responsive / mobile layout and reflow behavior.

**What does NOT count** (the bundle is not required, though `flow-by-flow` still is): database-only
migrations, edge-function-only or other backend-only changes, documentation-only changes, test-only
changes, build/CI/tooling changes, and pure non-visual logic (`.ts` that renders nothing). When a
change is genuinely mixed, the UI parts follow this standard and the rest follow their own.

**The mechanical trigger the CI guardrail uses:** a pull request whose diff adds or modifies a
shipped UI file — `src/**/*.tsx` or `src/**/*.css` (excluding `*.test.*`, `*.stories.*`, and
`__tests__/`) — is a UI change and must carry the evidence attestation. That path set is a
deliberate, narrow proxy: it fires on the files where visible interface actually lives and stays
silent on backend/DB/docs/test/tooling work.

## When Flow Prototype is *additionally* required

`flow-prototype` is required on top of the bundle whenever the change introduces or materially
changes a **flow** — more than one screen/state/exit wired together:

- new or changed forms, signup, onboarding, funnels;
- drawers, modals, and settings flows that carry their own steps and exits;
- payment, connection, and any provider-authorization flows;
- destructive actions (delete, disconnect, revoke) and their confirm/recover paths;
- anything with multiple states, branches, or ways out.

A single static screen, an isolated component, a copy tweak, or a logic-only experiment does **not**
require `flow-prototype` (it still requires the bundle if it is visible).

---

## Routing (the order is not optional)

```
UI/Software assignment
        │
        ▼
1. flow-by-flow            ← always first (§69). Frames the actor-goal flows, states, gates.
        │
        ▼
   Visible interface touched?  ──no──▶  proceed under flow-by-flow only (backend/DB/docs path)
        │ yes
        ▼
2. paige-ui-delivery        ← load BEFORE design/impl. Routes to frontend-design (+ web-design-
        │                     reviewer, accessibility, web-testing) and applies Paige rules below.
        ▼
   New or materially changed FLOW?  ──no──▶  design + implement the single surface/component
        │ yes
        ▼
3. flow-prototype           ← BEFORE production implementation. Prototype the states/exits, get
        │                     the appearance+function read (Gate 1), then build.
        ▼
   design → implement → VERIFY (rendered + behavioral) → evidence → ship
```

The active entrypoint is the **`paige-ui-delivery`** skill (`.claude/skills/paige-ui-delivery/`).
It points here and to the vendored bundle. The bundle's own entry is
[`./upstream/frontend-design/SKILL.md`](./upstream/frontend-design/SKILL.md); after implementation,
[`web-design-reviewer`](./upstream/web-design-reviewer/SKILL.md) for browser visual QA,
[`accessibility`](./upstream/accessibility/SKILL.md) for the WCAG 2.2 pass, and
[`web-testing`](./upstream/web-testing/SKILL.md) for behavioral/E2E verification. Provenance and the
pin are in [`./upstream/PROVENANCE.md`](./upstream/PROVENANCE.md).

---

## Paige-specific quality gates

These are Paige's additions on top of `frontend-design`'s universal gates. They are checked as part
of the design and verification passes, not as a checkbox ritual.

### Reuse the system before inventing

Reuse Paige's established tokens and design system before creating replacements:
`src/solo/solo-tokens.css` (the `.paige-solo` Mineral/Obsidian tokens), `@/components/ui/page`
primitives, and the sibling surfaces' patterns. Gold is spent only on the act (§11); depth comes
from layered elevation, not darkening (§23); light must read as genuinely light and dark as
genuinely dark (§23).

### Solo rendered-verification viewports

For Solo interfaces, verify the **rendered** experience at, at minimum:

- **1536 × 770**
- **1366 × 768**
- **1024 × 768**
- **900 × 1000**

Remember the Solo shell docks a PAIGE column: the surface's content column is narrower than the
viewport, and container width — not viewport width — is what the layout must respond to. At each
size confirm: the actual **scroll owner** (one owner, no double scrollbars, no dead clip), no
**clipping** of content or controls, **reachability** of every control, a working **keyboard path**
and visible **focus** handling, **zoom/reflow** to 200% without loss, and the **loading / empty /
error / retry / permission-denied / success / cancellation / workspace-switch** behavior where each
is relevant.

### Forms and funnels

Require all of:

- clear **first-use and empty** guidance;
- **real editable controls**, not static-looking selectors that don't actually open/change;
- **visible field labels** (never placeholder-as-label) and **understandable validation**;
- **no fake success** — never show success before the operation actually succeeded;
- **preserved recoverable input** after a failure (the user does not retype everything);
- **cancel / close / back paths that actually work**;
- **appropriate confirmation and recovery** for risky or destructive actions;
- **keyboard and screen-reader-safe** behavior;
- **honest unavailable states** when provider capability or backend support does not exist — say so
  plainly, do not fake a control that cannot work.

### Visual work

Require all of:

- a stated **purpose, audience, primary action, and visual direction**;
- **reuse** of Paige's established tokens and design system before inventing replacements;
- **purposeful** colour, hierarchy, hover, focus, motion, and reduced-motion behavior;
- **no** redundant banners, oversized empty areas, generic copy, or decorative effects with no
  usability purpose (§11);
- **no fabricated** metrics, history, health, or capabilities (§13). A figure is a real value or an
  honest absence with the reason named.

---

## Expected evidence

Every UI change reports evidence **by class**, and never conflates the classes (§32/§70):

| Class | What it proves | Example |
|---|---|---|
| **Automated test** | Logic/contract behaves | vitest unit/contract/render suites pass |
| **Static / build** | It type-checks and builds | `ci:tsc` clean, `vite build` green, lints green |
| **Structural / harness render** | The component mounts and its states exist | `createRoot`/`act` render of the surface's states |
| **Authenticated runtime** | A human can actually finish the job on the real platform | live drive at the required viewports; the flow completed end to end |
| **UNVERIFIED / owed** | Named, with the reason and who owes it | "authenticated live drive owed — no browser in this session (§32.c)" |

A structural render is **not** authenticated runtime proof. "It renders" and "tests pass" do not
satisfy Rule 5. When you cannot produce a class of evidence, say so with `UNVERIFIED` and the
reason — that is honest and allowed; a silent gap is not.

## Truthful state labels

Use these labels consistently, in surfaces, delivery docs, and evidence, so "does this work?" has a
truthful one-word answer everywhere:

- **LIVE** — wired to a real backend/provider and verified working end to end.
- **PARTIAL** — real for some inputs/states; the boundary is stated (what works, what does not yet).
- **UNAVAILABLE** — the capability does not exist yet (no provider connection, no backend contract).
  The surface says so honestly and offers no control that cannot work.
- **UNVERIFIED** — built, but a required evidence class (usually authenticated runtime) has not been
  produced; the reason and owner are named.

Never label something LIVE on the strength of a render or a passing test alone.

---

## §00 boundary (so this standard is not misread)

This standard governs **process and evidence**, which is engineering's to own. It does **not** hand
any implementation agent design-taste authority: which layout, colour, motion, or copy is *right*
remains Claude Design's and the owner's call (§00). When an agent renders a frame, it is evidence
handed over (address, theme, width, measured geometry, what loaded), never a design verdict. The
one thing an implementation agent raises about the interface is an incompatibility — the design
cannot be wired as drawn, or the backend must change for it to work (§00's round-table exception).

---

## Enforcement (honest about what it is)

- **CLAUDE.md** and root **`AGENTS.md`** carry the mandatory trigger so no agent misses it.
- **CI guardrail** (`lint:ui-evidence`): a PR that touches shipped UI paths must carry the UI
  Delivery Evidence attestation (in the PR body, from the template) or an explicit, reasoned
  exemption. It is narrowly targeted — DB-only, edge-only, docs-only, test-only, and backend-only
  PRs are a no-op pass.
- **This gate is a guardrail, not proof.** It forces the evidence artifact to exist and be
  reviewable; it cannot and does not certify that the agent truly used the skills or that the
  feature works. A ticked checkbox is never production proof (Rule 5). The real proof is the
  rendered + behavioral evidence a human or an adversarial reviewer checks.
