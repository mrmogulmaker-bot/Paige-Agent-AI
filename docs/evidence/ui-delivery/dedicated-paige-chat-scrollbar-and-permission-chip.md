# UI delivery evidence — dedicated Paige chat: horizontal-scrollbar fix + real permission chip

**Task:** #17 (P1 UI hotfix). **Date:** 2026-09-06. **Surface:** dedicated Solo Paige workspace chat
(`paige.workspace`) — `PaigeAIChat` mounted by `SoloPaigeWorkspace` inside the `.tcs-paige` panel.
**Skill:** `flow-by-flow` + `.agents/skills/paige-ui-design` (all routed refs read). §00: no visual
direction invented; the owner specified the control; existing primitives + tokens ported.

<!-- Machine-readable attestation block (scripts/ci/ui-delivery-evidence.mjs). Runtime-dependent
     fields are honestly UNVERIFIED on this headless, browserless session (§13/§32.c); the prose
     below carries the full record. -->

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: flow-by-flow applied — actor (Solo owner) / goal (read+compose with no horizontal scroll; set Paige's permission posture) / states + exits mapped in "Complete-state coverage" below; pre-edit frame recorded in the task ledger for #17
PAIGE_UI_DESIGN: PASS: `.agents/skills/paige-ui-design/SKILL.md` + UPSTREAM.md + vendor/frontend-design/SKILL.md + accessibility-checklist.md + references/paige-quality-gates.md + references/review-and-testing.md all read; Solo verification matrix and no-clipping/scroll-owner rule applied here
MATERIAL_FLOW_CHANGE: YES: adds a new composer affordance (a permission chip) with its own goal, states, and a real persisted consequence (bulk confirm-mode write) — a new user goal, not only a defect repair
FLOW_PROTOTYPE: PASS: owner directive of 2026-09-06 specified the exact control — label `Paige permissions · Ask first ▾`, three named options, real server-backed authority behavior, modeled on the supplied reference approval control — which is the owner-intent approval of appearance and intended function; pre-launch §4/§69 lifts the separate prototype-render gate and the owner directed "don't pause for a new visual approval"
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: remove a real horizontal scrollbar (layout defect) and give the Solo owner a truthful, usable composer control over how much Paige may do; audience = Solo owner/authorized rep; primary actions = (a) read/compose with no horizontal scroll, (b) set Paige's permission posture backed by the real governance seam
VISUAL_DIRECTION: PASS: owner-specified compact neutral/violet chip in the composer action bar; gold reserved for Send; ported with the established Radix DropdownMenu + design tokens (border-border, bg-muted/40, ring-ring) — no new visual direction invented (§00)
AUTOMATED_EVIDENCE: PASS: `src/__tests__/dedicated-chat-overflow-contract.test.ts` (DOM-contract guard for all four overflow fixes + fake-badge removal) and `src/components/dashboard/paige/PaigeComposerAutonomyChip.test.tsx` (pure `deriveChipView` across every authority state + trigger render: accessible name, reflected label, no-gold); `SoloPaigeWorkspace.contract.test.tsx` green with the chip mounted; full suite 3736/3736 (see closeout)
STATIC_EVIDENCE: PASS: `ci:tsc` ratchet green (no new errors); `gold-discipline` clean on all changed files; `lint:tier-features` clean; `lint:binding-ledger` green (26 surfaces); `build` green (see closeout)
RENDERED_EVIDENCE: UNVERIFIED: headless session with no browser — rendered-pixel capture (screenshots per viewport/theme) is owed to a browser-capable session (Cowork/Chrome) per §32.c
BEHAVIORAL_EVIDENCE: UNVERIFIED: headless session with no browser — the browser drive of the menu open/close, the Ask-first write, and the Trust Compass route is owed to a browser-capable session
AUTHENTICATED_RUNTIME: UNVERIFIED: headless session with no browser and no authenticated Solo tenant drive — the deployed-revision authenticated proof is owed to a browser-capable session
KEYBOARD_FOCUS: UNVERIFIED: keyboard route (arrow-key nav, Escape close, focus restoration) not driven headless; Radix `DropdownMenu` provides menuitem semantics + Escape + focus-restore by construction — runtime keyboard proof owed to a browser-capable session
ZOOM_REFLOW: UNVERIFIED: zoom/reflow not observed headless; static basis is `flex-wrap` on the Solo action row + `break-words`/`whitespace-pre-wrap` + `min-w-0` so content wraps instead of overflowing — runtime reflow proof at the five viewports owed to a browser-capable session
REDUCED_MOTION: PASS: static — the chip trigger carries `motion-reduce:transition-none` and the shared `DropdownMenuContent`/`SubContent` primitive the popover uses now carries `motion-reduce:animate-none` (added in this PR per the §39 peer-gate), so the popover's open/close animation is suppressed under `prefers-reduced-motion`; overflow fixes are static layout; runtime observation owed to a browser-capable session
STATE_COVERAGE: PASS: loading (`Checking…`) · unconfigured/error (honest reason) · configured ask-first · configured within-policy · non-admin read-only · authority-unconfirmed · write success / partial-failure (honest toast) · long-message/code/entity-diagram/error-card/attachment-chip wrap-or-self-scroll · narrow width (controls wrap) — covered by `deriveChipView` unit tests + the DOM-contract guard
TRUTHFUL_STATE_LABELS: PASS: chip label derived from the real `useSoloToolGovernance` (`list_/resolve_tool_autonomy`) seam — never a posture the server does not hold; the pre-existing FAKE static "Ask first" badge in the shell header was removed (§13 correction)
SOLO_UI: YES: dedicated Solo Paige workspace chat (`paige.workspace`) — `SoloPaigeWorkspace` + `PaigeAIChat` + `TenantCommandCenterShell`
SOLO_1536X770_PAIGE_CLOSED: UNVERIFIED: headless session, no browser — owed to a browser-capable session per §32.c (see "Proof owed")
SOLO_1536X770_PAIGE_OPEN: UNVERIFIED: headless session, no browser — owed to a browser-capable session per §32.c
SOLO_1366X768_PAIGE_CLOSED: UNVERIFIED: headless session, no browser — owed to a browser-capable session per §32.c
SOLO_1366X768_PAIGE_OPEN: UNVERIFIED: headless session, no browser — owed to a browser-capable session per §32.c
SOLO_1024X768_PAIGE_CLOSED: UNVERIFIED: headless session, no browser — owed to a browser-capable session per §32.c
SOLO_1024X768_PAIGE_OPEN: UNVERIFIED: headless session, no browser — owed to a browser-capable session per §32.c
SOLO_900X1000_PAIGE_CLOSED: UNVERIFIED: headless session, no browser — owed to a browser-capable session per §32.c
SOLO_900X1000_PAIGE_OPEN: UNVERIFIED: headless session, no browser — owed to a browser-capable session per §32.c
UNVERIFIED: Rendered-pixel, browser-behavioral, authenticated-runtime, keyboard/focus, zoom/reflow, and all eight Solo viewport×theme checks are owed to a browser-capable session (Cowork/Chrome) per §32.c — this is a headless session with no browser. Static + automated + source-contract evidence is complete and green.

## Job / audience / primary action / direction / evidence boundary

- **Purpose:** remove a real horizontal scrollbar across the chat/composer (a layout defect that
  clips/obstructs), and give the owner a truthful, usable control over how much Paige may do.
- **Audience:** the Solo owner/authorized rep operating their own workspace.
- **Primary actions:** (a) read the transcript / type in the composer with no horizontal scroll;
  (b) set Paige's permission posture from the composer, backed by the real governance seam.
- **Visual direction:** owner-specified compact neutral/violet chip in the composer action bar; gold
  reserved for Send. Ported with the established Radix DropdownMenu + design tokens.
- **Evidence boundary (honest):** this is a **headless** session with **no browser**. Automated +
  static + source-contract evidence is provided below. **Rendered-pixel and authenticated-runtime
  proof is `UNVERIFIED (Proof Owed)`** to a browser-capable session (see "Proof owed").

## Scroll ownership + overflow (the defect, fixed at the source — not clipped)

- **One intended vertical scroll owner:** `#solo-paige-transcript` (`data-paige-transcript-scroll`),
  `overflow-y-auto`. Unchanged as the sole vertical owner.
- **Root cause (proven by grounding):** the message bubble is the lone flex item of its row and, in
  the `cd=false` (app) branch every live mount uses, lacked `min-w-0` — so it refused to shrink below
  its content's min-content width and pushed the transcript wider than the panel. The transcript's
  `overflow-y-auto` with no `overflow-x` then made the browser render a horizontal bar right above the
  composer.
- **Fix (cause, not cover-up):**
  1. `min-w-0` on the message bubble (app branch) — the real cause; lets it shrink so content wraps.
  2. `whitespace-pre-wrap break-words` on the user's own text — long tokens/URLs wrap.
  3. `overflow-x-hidden` on the transcript — defense-in-depth so a stray future wide child can never
     re-introduce the bar. Because (1)+(2) make content wrap, **nothing is clipped**.
  4. Wide entity-diagram cards now `max-w-full overflow-x-auto` — genuinely wide content self-scrolls
     in its own container, so it stays reachable under the transcript's `overflow-x-hidden`
     (the skill's wide-content pattern; never hidden).
  5. **§39 fold — wide GFM tables self-scroll, never clipped:** `MarkdownMessage` now overrides the
     `table` renderer to wrap every table in an `overflow-x-auto` container (and the table's own width
     class no longer forces it wider than that wrapper). Without this, a wide markdown table — a common
     Paige output — would have been clipped-and-unreachable under the transcript's `overflow-x-hidden`,
     the exact "hide instead of fix" failure. A rendered DOM test (`MarkdownMessage.test.tsx`) proves the
     wrapper exists; the peer-gate's contract test now exercises a table, which its first cut did not.
- **Composer:** stays fully visible; the Solo action row is `flex-wrap` so controls reflow (never
  horizontally scroll) on narrow widths.

## Permission chip — real authority, never faked (§13/§18)

- **Component:** `src/components/dashboard/paige/PaigeComposerAutonomyChip.tsx`, mounted only by
  `SoloPaigeWorkspace` via the new `composerAutonomyControl` prop (no non-Solo mount renders it).
- **Reflects real state:** reads `useSoloToolGovernance` (the canonical `list_/resolve_tool_autonomy`
  seam). Label is derived from real **per-tool effective** state (`byTool`) — "Within policy" when at
  least one governed tool will actually run at `auto` (a real standing grant), "Ask first" when nothing
  runs on standing auto, "Checking…" while loading, "Permissions" with an honest reason when
  unconfigured/errored. Never asserts a posture the server does not hold.
- **§39/§5 fold — honesty defect fixed before merge:** the first cut keyed the standing-grant signal on
  the domain aggregate (`posture === "guardrails"`), which requires *every* actable tool in a domain to
  be effective-`auto`; but each domain carries a `high`-risk tool capped at `confirm`, so that aggregate
  is unreachable — the chip would have shown "Ask first" forever and *understated* a real `auto` grant (a
  §13 lie). Re-keyed to the tool level; a reachability test now drives it through the real
  `deriveGovernance` (ordinary tool at `auto` → "Within policy"; high tool at stored `auto` → clamped →
  "Ask first"), so the green proof exercises a state the runtime can actually emit.
- **"Ask first"** = a REAL persisted safety brake: bulk `setDomainMode(…, "confirm")` through the
  canonical `set_tool_autonomy` seam. Admin-gated exactly as the server predicate (`canWrite`);
  non-admin sees a read-only, honestly-explained item. Honestly non-atomic + honest toast on partial
  failure; copy states standing automations are managed in Trust Compass.
- **"Act within my policy" / "Custom permissions"** route to the real Trust Compass controls
  (`/solo/{account_number}/command-center/trust-compass`). Granting autonomy stays deliberate/bounded
  (§67/§68) — the chip never blanket-enables `auto`, never fakes a write.
- **No parallel system:** reuses the one governance seam; removed the pre-existing **fake** static
  "Ask first" badge in the shell header (§13 correction).
- **Accessibility:** Radix DropdownMenu → keyboard nav, Escape close, focus restoration, menuitem
  semantics; trigger carries an accessible name stating the current mode; neutral/violet, never gold.

## Complete-state coverage

first-use/loading (`Checking…`) · unconfigured/error (honest reason) · configured ask-first ·
configured within-policy · non-admin read-only (+ honest note, routes) · authority-unconfirmed
(honest "couldn't confirm your access") · write success / partial-failure (honest toast) · long
message / code / entity-diagram / error card / attachment chip wrap or self-scroll · narrow width
(controls wrap). Workspace-switch: the hook re-keys on `accountEpoch`.

## Evidence

- **Automated:** `src/__tests__/dedicated-chat-overflow-contract.test.ts` (DOM-contract guard for all
  four overflow fixes + fake-badge removal); `src/components/dashboard/paige/PaigeComposerAutonomyChip.test.tsx`
  (pure `deriveChipView` across every authority state + trigger render: accessible name, reflected
  label, no-gold). `SoloPaigeWorkspace.contract.test.tsx` green with the chip mounted. Full suite: see
  closeout.
- **Static:** `ci:tsc` ratchet green (no new errors); `gold-discipline` clean on all changed files;
  `lint:tier-features` clean; `build` (see closeout).
- **Rendered / behavioral / authenticated-runtime:** `UNVERIFIED (Proof Owed)` — headless session,
  no browser. Owed to a browser-capable session (Cowork/Chrome), per §32.c capability-conditional.

## Proof owed (§32.c — honest)

A browser-capable session must, on the deployed revision, at **1536×770, 1366×768, 1024×768,
900×1000, and a narrow mobile width**, in **Mineral and Obsidian**, PAIGE open/closed:
1. confirm **no horizontal scrollbar** anywhere in the transcript/composer, and the composer is fully
   visible; paste a long unbroken token + render an entity diagram and confirm wrap / self-scroll with
   nothing clipped; confirm the transcript is the only vertical scroll owner;
2. open the permission chip, confirm the label matches the workspace's real posture; as an admin click
   **Ask first** and confirm capabilities persist to confirm (reload); confirm **Custom permissions**
   opens Trust Compass; confirm keyboard nav + Escape + focus restoration + reduced-motion.

## Flow prototype note

The prototype/approval reference is recorded in the machine-readable `FLOW_PROTOTYPE` field above:
the control was built to the owner's explicit 2026-09-06 spec (label, three options, real-authority
behavior, modeled on the supplied reference control) using existing primitives; pre-launch §4/§69
lifts the separate prototype-render gate. Flow-by-Flow + this skill were applied in full.
