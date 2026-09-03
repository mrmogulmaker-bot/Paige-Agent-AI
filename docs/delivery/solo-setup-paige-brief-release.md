# Solo Setup Paige Brief — release evidence

## Current refinement — 2026-09-03

Branch `codex/solo-paige-brief-entry`, base `3e0c282fd14a64e1257c9a88163ef7084cad5d66`.
The older anchored-section record below is historical; #859 made Paige brief a separate
`/solo/{account}/settings/setup/paige-brief` subtab for the canonical Solo shell.

Goal: an authorized owner can add, refine, and durably save a rich brief and examples directly.
Human: business owner, without needing to discover Edit above the fold.
Entry/exit: Paige brief → existing guided/example drawer → same subtab.
System: preserve the approved cards, drawers, tokens and Settings scroll owner.
Signature: owner-reviewed profile plus concrete sounds-like/avoid examples.
Feedback: apply/keep means draft; only the existing server readback means saved. No new motion/haptics.
Reject: fake conversation, automatic ingestion, tenant-specific defaults, or a parallel knowledge store.
Variants: Owner edits rich context; Admin retains existing operational-only scope; Member read-only.

| Path | Behavior and proof |
| --- | --- |
| Direct entry / first use | Teach Paige and Add an example begin the existing edit transaction; two failing-first tests reproduced the old disabled buttons |
| Apply / Keep | Drawer closes into the unsaved Setup draft; no write or model invocation |
| Save / failure / retry | Local Save business context invokes the same guarded page save and existing revision-aware adapter; retry retains content |
| Existing example | Edit from read mode keeps the record ID; new and edit titles differ |
| Validation | Profile fields: 4,000 characters; example: 8,000; note: 1,000; blank/oversize example stays correctable |
| Discard / account change | Existing drawer and whole-page confirmations; old-tenant drawer and draft cleared |
| Links / documents | Links & documents opens the existing Knowledge bucket, preserving the Setup draft; no second importer |
| Spine / voice / Mind / Rail | Not connected by this repair; handoff remains PROPOSED |

The owner-approved Flow Prototype `solo-setup-paige-brief-v2.html` was reread and its direct-entry,
discard and read-only paths traversed in eight viewport/theme cases. This is a functional repair
of the existing approved interaction, not a new visual design or voice integration.
Automated: 118 tests across component, adapter, contract, route and scroll suites pass;
scoped ESLint and production build pass. Expanded rendered matrix, final review and hosted
release checks are pending at this pre-release checkpoint. Authenticated Runtime Proof Owed.
The first expanded browser run completed 104 cases with zero flow/runtime/overflow failures,
then correctly failed its old 96-case completeness assertion. That expected count is now 104;
the exact final run must pass without weakening any per-flow checks.

### Collision-safe documentation handoff

Active #731 owns `docs/doctrine/surface-cards/setup.md`; #754 owns brain/master updates.
Do not edit their files in this branch. The exact proposed Setup card/brain text is:
“Paige brief is a URL-addressed Setup subtab. Owners can start the guided editor, add examples,
or edit an existing example directly. Apply/Keep changes only the Setup draft; local Save business
context calls the existing durable transaction. Links and documents remain in Knowledge bucket.
Rich profile/examples are Owner-only. Voice and Spine/Mind/Rail consumption remain PROPOSED.”
Master owner #754: place the same text under §4, “Solo Settings → Setup durable persistence repair”;
brain owner #754: update `docs/brain/codebase-map.md` Solo Settings/Setup entry with that text and
the exact release/proof status at merge. Reason: active ownership collisions, not missing work.
The concrete source contract is in `docs/handoff/solo-setup-business-context-spine-handoff.md`.

## Historical anchored-section release

## Flow delivered

Paige Brief remains the sixth anchored section of the existing Solo Settings → Setup page. The
owner can review the saved voice, working style, and boundaries in place, open **Teach Paige** as a
slide-out, return with **Back to Setup** or close, apply changes to the ordinary Setup draft, and
then use the existing durable **Save changes** action. Applying the slide-out never claims a save.

The drawer provides guided prompts for:

1. voice character, tone, signature language, and intended audience feeling;
2. working and message style, channel differences, calls to action, and uncertainty handling;
3. prohibited assumptions, claims, tones, topics, and decisions.

Connection-sourced facts remain locked in the drawer until the owner uses Setup's existing explicit
Override treatment. A dirty drawer requires discard confirmation; account switching uses the
existing Setup unsaved-change guard. Workspace Owner and policy-verified Admin may use the guided
operational brief; read-only users cannot open it.

## Truth and architecture

- Manual guided editor: `PARTIAL` until authenticated exact-head browser proof.
- Durable persistence: unchanged existing tenant-scoped Setup save/read-back contract.
- Talk with Paige, transcript extraction, and example-library indexing: `PROPOSED`.
- New PAIGE, Mind, or Spine consumption: `PROPOSED`; no runtime integration is claimed.
- Rail outcome: `UNAVAILABLE`; no drawer content is emitted to Rail.
- Legal ownership, exact addresses, tax identifiers, and private contact data: excluded from this
  editor and from future PAIGE/Rail context by default.

## Scope and collision record

Changed only Solo-owned implementation, tests, and documentation:

- `src/solo/PaigeBriefPanel.tsx`
- `src/solo/settings-setup.tsx`
- `src/solo/settings-setup.css`
- `src/solo/settings-setup.test.tsx`
- `docs/doctrine/surface-cards/setup.md`
- this release record

Deliberately untouched: shared authentication/routing, Agency and sub-account shells, Operator,
legacy Admin, Team, Billing, Connections, PAIGE Chat, Mind, Spine, Rail, migrations, and Setup's
tenant data contract. The active `codex/solo-setup-paige-representative-hotfix` branch overlaps the
Setup contract/tests but not this slice's contract or shared runtime files; the implementation does
not add or alter fields.

## Required proof

- Automated: integrated location/jump link, guided apply-to-draft then durable save, read-only
  refusal, connection-source preservation, dirty close, and account-switch guard, plus the existing
  Setup persistence regression suite.
- Static: Solo-only diff, no new shared imports beyond existing seams, no sensitive payload or
  PAIGE/Spine/Rail write.
- Rendered: supported Solo viewports and both themes, drawer open/close/return, focus behavior,
  clipping, overflow, and Settings scroll ownership.
- Authenticated runtime: signed-in Solo Owner opens the real Setup route, changes the brief, applies,
  saves, reloads, reopens, and switches away/back on the exact deployed head.

Until the rendered and authenticated proof above is captured on the exact release head, status is
**Authenticated Runtime Proof Owed**, not fully `LIVE`.
