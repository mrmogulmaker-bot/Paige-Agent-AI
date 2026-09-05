# UI delivery evidence — Command Center → Mind (Gate 1 prototype)

**Surface:** Solo Command Center → Mind subtab (redesign).
**Deliverable:** clickable interactive prototype for owner visual approval (Gate 1). **No production UI changed.**
**Artifact:** `docs/prototypes/command-center-mind-gate1.html` (self-contained; no network beyond fonts).
**Jurisdiction (§00):** ports the owner's brief + reference image onto the installed `--pg-*` pack
design system (Mineral = light, Obsidian = dark). Zero CC design taste. Where the brief was silent,
values were DERIVED from the pack and are flagged for owner ruling.
**Flow-by-Flow / paige-ui-design / Flow-Prototype:** followed. Pre-edit packet + honest data map:
`scratchpad/mind-flow-packet.md` (this session).

## Evidence classes (paige-ui-design)

| Class | Result |
|---|---|
| Automated | Headless Playwright render/smoke across the full matrix (below). Behavioral asserts pass. |
| Static | Self-contained HTML; token values lifted verbatim from `design-system-port.md`. |
| Rendered | 22 frames captured at all four Solo viewports × Mineral/Obsidian + states + drawer/capture/annotations/responsive. |
| Behavioral | Drawer open→focus-to-close, Esc→close+focus-return, search filter, no-results, capture routing — all exercised. |
| Authenticated runtime | **UNVERIFIED — N/A.** This is a standalone prototype; it consumes NO live contract. Production wiring is a later slice after approval. |

## Render matrix (headless Chromium, deviceScaleFactor 1)

Viewports rendered PAIGE-closed in BOTH themes: **1536×770, 1366×768, 1024×768, 900×1000**.
PAIGE-open captured at 1536×770 in both themes. Responsive fold captured at 760px (Mineral).
Frames: `scratchpad/shots/` (vp_*, paige_open_*, state_*, drawer_evidence, capture_confirm,
annotations_*, responsive_760_light, search_*).

## States exercised

Populated · first-use empty · partial coverage (banner) · source unavailable (banner) · loading
(skeletons) · workspace switching (reset copy) · no-results (search) · evidence drawer · capture
(confirm→Setup) · capture (add-context honest-unavailable) · annotations overlay (both themes).

## Contrast (WCAG 2.2 AA, computed, both themes) — all ≥ 4.5:1

| Element | Obsidian | Mineral |
|---|---|---|
| Mind title / empty h2 | 17.18 | 15.71 |
| Nav workspace name | 17.53 | 14.65 |
| Domain name / fact name / attn title | 16.01 | 14.78 |
| Brief / state-pill text | 12.53 | 10.74 |
| Domain summary | 7.40 | 5.37 |
| Empty body / fact source | 5.66–7.94 | 5.13–5.71 |
| Eyebrow | 6.07 | 5.46 |

## Defect found and fixed (§32 — a green file is not a working render)

**BLOCKER (fixed):** base text (`Mind` title, domain names, nav workspace name) computed to
`rgb(0,0,0)` in Obsidian → contrast ~1.17, near-invisible. Cause: `body{color:var(--pg-ink)}` while
`[data-pg]` (where `--pg-ink` is defined) sits on `#root`, body's child — the var was undefined on
`body`, falling back to black. Light theme survived by luck (black-on-ivory reads). Fix: base
color/background/type moved onto the token-scoped `#root[data-pg]`. Re-measured: all text ≥4.5:1 in
both themes. Caught only by measurement, not by the build or a glance — the exact §32 failure class.

## Behavioral checks (asserted in the render script)

- drawer opens → focus moves to close button: **PASS**
- Esc closes drawer → focus returns to launcher: **PASS**
- search "agreement" → filters to 1 domain: **PASS**
- search no-match → honest no-results panel: **PASS**
- capture "try to save anyway" (free-form) → refuses with honest "not saved, no write path": **PASS** (by design)

## Honest region → source map (annotation layer in the artifact)

Nothing is authenticated-runtime LIVE (matrix axis B = NO everywhere). Per-region verdicts and their
real sources are embedded in the prototype's annotation overlay and mirror the scout's confirmed
contract map. Key truths: Knowledge & resources = LIVE(read) via `tenant_knowledge_docs`; Business
identity = PARTIAL via `business_context.readiness` (state+provenance, never raw value); durable
change log = UNAVAILABLE (Rail unreadable from browser).

**Governed-memory correction (§13/§BRAIN.2, applied after the branch fast-forwarded to latest main):**
Release C (migration `20261223000000`, `docs/brain/paige-memory-contract.md` +
`docs/doctrine/relationship-context-and-governed-memory-contract.md`) shipped a governed write seam —
`record_paige_memory` (stores as `proposed`, corrects via supersede), `forget_paige_memory` (retire),
`get_paige_memory` (read), authenticated with in-body caller scope (§59). No Mind UI is wired to it
yet and chat auto-write is deferred. This moved four prototype labels from an over-conservative
UNAVAILABLE to the accurate **PARTIAL**: capture (a governed seam exists, UI unwired), retire
(`forget_paige_memory` seam), and the People/relationship + Goals/decisions domains (governed
context store exists but nothing writes to it yet — "empty governed store", not "no store"). The
four-layer rule is preserved in copy: a typed fact stores as `proposed` and never auto-becomes a
canonical CRM record (People/Clients Layer 1) without confirmation.

## Two font requests fail behind the sandbox proxy (ERR_CONNECTION_RESET)

Google Fonts / fontshare are progressive enhancement with the pack's real fallback stacks
(`system-ui`, `serif`); they load in the owner's browser. Render is correct with fallbacks.

## Adversarial verifier (§39) + compliance officer (§5)

<!-- filled after crew returns -->

## Owed / next

- Owner visual approval (Gate 1) before ANY production implementation (owner's explicit instruction
  for this surface; overrides the pre-launch §4 auto-merge for the production step).
- Production port: coordinate the Command Center tab reorder with the other three subtab redesigns
  (`src/solo/CommandCenter.tsx` + `src/lib/routing/tierBranches.ts`, contract-tested); preserve the
  `/command-center/mind` deep link + `/directory`,`/history` aliases.
- Authenticated runtime proof at production port time (§32.c).
