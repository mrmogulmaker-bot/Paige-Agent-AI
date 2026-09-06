# UI delivery evidence — dedicated Paige chat: horizontal-scrollbar fix + real permission chip

**Task:** #17 (P1 UI hotfix). **Date:** 2026-09-06. **Surface:** dedicated Solo Paige workspace chat
(`paige.workspace`) — `PaigeAIChat` mounted by `SoloPaigeWorkspace` inside the `.tcs-paige` panel.
**Skill:** `flow-by-flow` + `.agents/skills/paige-ui-design` (all routed refs read). §00: no visual
direction invented; the owner specified the control; existing primitives + tokens ported.

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
- **Composer:** stays fully visible; the Solo action row is `flex-wrap` so controls reflow (never
  horizontally scroll) on narrow widths.

## Permission chip — real authority, never faked (§13/§18)

- **Component:** `src/components/dashboard/paige/PaigeComposerAutonomyChip.tsx`, mounted only by
  `SoloPaigeWorkspace` via the new `composerAutonomyControl` prop (no non-Solo mount renders it).
- **Reflects real state:** reads `useSoloToolGovernance` (the canonical `list_/resolve_tool_autonomy`
  seam). Label is derived from real per-domain effective posture — "Ask first" (nothing on standing
  auto), "Within policy" (a real standing grant exists), "Checking…" while loading, "Permissions"
  with an honest reason when unconfigured/errored. Never asserts a posture the server does not hold.
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

## Flow prototype

`FLOW_PROTOTYPE: NOT_SEPARATELY_RENDERED` — pre-launch §4/§69 lifts the prototype-approval gate and
the owner directed "don't pause for a new visual approval"; the control was built to the owner's
explicit spec using existing primitives. Flow-by-Flow + this skill were applied in full.
