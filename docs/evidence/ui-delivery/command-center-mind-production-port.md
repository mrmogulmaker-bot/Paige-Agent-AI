# UI delivery evidence — Command Center → Mind (production port of the approved orb)

**Surface:** Solo (and sub-account) Command Center → Mind subtab — `src/solo/SoloMindWorkspace.tsx`.
**Change:** replace the hand-rolled 2D-canvas Mind topology with the **owner-approved WebGL orb**
(Gate-1 approved 2026-09-06, `command-center-mind-gate1.md`), running in the real app over live reads.
**Jurisdiction (§00):** ports the approved design; invents no visual direction. Measurements below are
WORKS facts, not taste.

## What shipped

- **Engine (§28-faithful):** the frozen approved prototype engine promoted verbatim into
  `src/solo/mind-orb/engine.ts` as a `createMindOrb()` factory — **no rendering values changed**
  (geometry, materials, bloom, camera, motion byte-identical; only IIFE→factory + TS types).
- **Mount:** `src/solo/mind-orb/MindOrbCanvas.tsx` — WebGL-gated (`src/lib/webgl.ts`), three loaded
  through a dynamic `import()` so it ships as a **separate 48 KB lazy chunk** (`dist/assets/engine-*.js`),
  never the main bundle (§22). A `SceneBoundary` degrades LOUDLY to the parent's record list — never a
  white screen (§32). Reduced-motion (toggle **and** OS `prefers-reduced-motion`), offscreen pause,
  resize, and dispose all wired. Re-mounts (fresh context) only on a node **structure** change
  (id-signature key); theme/focus/pause reconcile in place with no rotation jump (§28).
- **Honesty reconciliation (§13/§70):** `src/solo/mind-orb/mindDomains.ts` maps the six approved
  domains onto the REAL read contracts — Knowledge ← `tenant_knowledge_docs` (live), Connected sources
  ← n8n readiness (live, status only), Operating decisions ← pending approvals (live). Business context
  / Client relationships have **no frontend hook yet**, Offers lives in Campaigns — all render honest
  absence, never invented data. Empty inputs yield zero record nodes. Nodes carry a record's canonical
  source STATE; the orb renders presentation, never fabricated activity.
- **§58:** Systems Check findings are NOT surfaced in Mind (approved boundary — they stay in the
  Systems Check subtab). The prior 5-category model (`recall/knowledge/skills/identity/judgment`) is
  replaced by the six approved domains. Every other shipped capability is preserved: record list,
  domain filter, source-signal legend, domain callouts, evidence drawer + provenance, states,
  announcements, refresh, Open PAIGE, and the per-user/per-tenant orbit-pause seam.

## Evidence classes (SEPARATED — §70/§32)

| Class | Result |
|---|---|
| Automated | 28 unit tests green: `mindDomains.test.ts` (17 — reconciliation honesty: six domains, no fabricated records when empty, §58 findings never surfaced, ghosts only on empty domains, geometry deterministic) + `SoloMindWorkspace.test.tsx` (11 — records/truth, WebGL-off fallback, §58, domain filter, drawer focus/Esc, pause persistence, reduced-motion, refresh-not-a-scan, Open PAIGE, loading/empty/partial). 47 sibling command-center tests green (no routing/shell regression). |
| Static | `tsc -p tsconfig.app.json`: 0 errors on the new/changed files (13 pre-existing ratchet-baseline errors unrelated). `eslint`: 0. |
| Rendered (headless) | `docs/prototypes/_build/mind-engine-smoke.mjs` (SwiftShader): the **production** `createMindOrb` factory renders lit pixels, disposes cleanly (`available()`→false), builds the correct node count (17 = 6 hubs + 5 records + 6 ghosts), zero console errors. `vite build` green; engine code-split into its own chunk. |
| Behavioural | Fallback path, drawer focus/Esc/restore, pause persistence, reduced-motion, domain filter, refresh — all exercised in the unit suite. |
| Authenticated runtime | **UNVERIFIED — OWED (§32.c).** Headless cannot authenticate the app, so the live-drive of the deployed Mind surface on a real Solo/sub-account tenant is the owner's live look (or a capable Cowork/Chrome session). This is the honest gap, not a skipped step. |

## Tier (§9/§51/§56)

Reads go through existing **tenant-scoped** hooks (read-only) — no new tenant surface, no cross-tenant
id, no tier-gating change. Solo and sub-account share this shell (`SoloMindWorkspace`); the port is
identical for both. Subtab order unchanged (Systems Check → Mind); no reorder.

## Owed / next

- **§32.c authenticated live-drive** of the deployed surface (owner or capable session).
- Fast-follow: frontend hooks for Business context (`business_context.readiness`) and Client
  relationships / Operating-decisions governed memory, to light up those three domains with live data.
- A real screen-reader pass (this was code + automated a11y assertions).
