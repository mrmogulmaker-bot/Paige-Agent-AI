# Handoff — what is on main, and what is missing

Read from `mrmogulmaker-bot/Paige-Agent-AI@main` (tree `534e2860`) on 2026-08-23.
Findings only. Nothing here is a design decision.

---

## The root cause, in one sentence

**The retired console is still the authority for what renders.** `viewSources.ts` maps the
six-slot IA onto the thirteen-branch console's 78 old addresses, and `SlotSurfaceBody.tsx`
renders those through `OperatorPanel` + `panelSpecs`. So the new shell is correct and the
**content inside it is the old console's panel specs**. The pack's own surfaces were ported
during P2–P7 and never mounted.

---

## Finding 1 — the ported surfaces are dead code (blocker)

`SlotSurfaceBody.tsx` resolves exactly **seven** bespoke components:

```
FleetConsole · SystemsCheckSurface · FleetHistorySurface
FleetAlertRulesSurface · FleetTeamPulseSurface · TrustCompass · KnowledgeSurface
```

Everything else built from the pack is referenced **only by its own tests, or only by
`legacy/OperatorLegacyApp.tsx`** — which nothing mounts:

| File | Only referenced from |
|---|---|
| `MarketplaceSubmissionsSurface.tsx` (30 KB) | `packSurfaces.v3.test.tsx` |
| `CalendarFieldSurface.tsx` (24 KB) | `packSurfaces.v3.test.tsx` |
| `IntegrationsSurface.tsx` (26 KB) | `commsAndIntegrations.v3.test.tsx` |
| `ComposeOutbound.tsx` (17 KB) | `commsAndIntegrations.v3.test.tsx` |
| `MarketplaceSurfaces.tsx` (39 KB) | `bespokeSlots.tsx` → legacy only |
| `CalendarSurfaces.tsx` (31 KB) | `bespokeSlots.tsx` → legacy only |
| `PipelineSurfaces.tsx` (41 KB) | legacy + smoke test |
| `SocialSurfaces.tsx` (17 KB) | legacy only |
| `AnalyticsSurfaces.tsx` (30 KB) | legacy only |
| `SettingsSurfaces.tsx` (47 KB) | nothing |
| `ComposeSurface.tsx` · `SupportThread.tsx` | `bespokeSlots.tsx` → legacy only |
| `OperatorChatRail.tsx` | legacy only |

That is **~370 KB of ported pack surface that never reaches a screen.** `bespokeSlots.tsx` —
the thing that used to route them — is imported by `OperatorLegacyApp.tsx` and by no live
path. CC's own `CLAUDE.md:157` records the tests as the pin; a test rendering a component is
not the same as the console rendering it.

**Required:** every ported surface is mounted at its view in `SlotSurfaceBody`, or it is not
ported. A `git grep` from `OperatorEntry` should reach every file in `surfaces/`.

---

## Finding 2 — 22 of 32 views render the old console's panels

`viewSources.ts` gives 22 views a `panels: [...]` list, and every key in those lists is an
**old-tree address**: `comms/outbound`, `growth/pages`, `revenue/plans`, `revenue/invoices`,
`analytics/marketing`, `settings/setup/operator`, `marketplace/discover`,
`automations/library`, `settings/vault/vendors`, `settings/team/seats` …

Those resolve through `getPanelSpec` to `panelSpecs.ts`, described in its own header as
covering *"all 78 of the old tree's leaves."*

So on screen today: **new chrome, retired content.** Two examples of what that costs:

- `campaigns/catalog` renders `revenue/plans` + `revenue/metering` — the old billing panels.
  The pack draws Catalog as `catVals` (L5684) with `offerVals` (L5556) and the `New offering`
  flow, and it is ported nowhere.
- `settings/vault` renders `settings/vault/vendors` among its panels. **Vault must not read
  `business_vendors`** — that ruling is on record, and the old panel key is how it comes back
  in through the side door.

**Required:** `viewSources.ts` panel keys are replaced by pack surfaces. The `carries` ledger
stays — it is the drop-nothing audit trail and it works. What must stop is `carries` doubling
as `renders`.

---

## Finding 3 — two absences are wrong, one is right

```
relationships/people    → { carries: [] }   "the old tree had no such branch"
relationships/segments  → { carries: [] }   same reason
settings/numbers        → { carries: [] }   correct
```

The reason given is *the old tree had no such branch* — which uses the retired console as the
authority on what exists. **The pack draws both in full:**

| View | Pack builder | Line |
|---|---|---|
| People | `peopleVals(on)` | 4795 |
| Segments | `segVals(on)` | 6334 |
| Segment builder | `segBuildVals(on)` | 6151 |

These are *drawn, not wired* — exactly what the absence copy in `absence-copy.md` says. The
structure ports now; the data does not exist yet. Rendering absence over a drawn surface is
the same error as Finding 1, arriving through the ledger instead of the dispatch.

`settings/numbers` is correctly absent — that view came from an owner ruling and was never
drawn.

---

## Finding 4 — the spine is ported but the pack has more of it

`shell/spine/` has 5 components (Header, FaceStrip, Conversation, Composer, contract).
The pack's spine also contains, unported:

| Pack builder | Line | What it is |
|---|---|---|
| `mindVals()` | 10288 | the Memory face — the neuroscience substrate read |
| `codeVals(on, held, btn)` | 10156 | the Code face |
| `wireVals()` | 4545 | the execution strip — `think` / `act` states |
| `runsVals(on)` | 7526 | agent runs |

`SpineFaceStrip.tsx` is 3 KB, so the tab strip exists. Chat is ported; Memory, Team, Skills
and Code are the faces behind it.

---

## Finding 5 — 20 pack builders with no home in `src/operator`

Cross-checking the pack's 47 `*Vals` builders against the repo:

**Unported, and each one is a surface a view currently fills with an old panel:**

```
peopleVals    segVals      segBuildVals   catVals      offerVals
salesVals     schemaVals   campVals       convoVals    studioVals
postVals      vaultVals    capsVals       autoVals     buildVals
setupVals     teamVals     teamFormVals   pubsVals     storeVals
listingVals   tourVals     firstRunVals   mindVals     codeVals
calSetVals    stageBuilderVals   dealVals   runsVals   chartVals
```

Some have a partial home (`MarketplaceSurfaces` covers part of `storeVals`/`catalogVals`),
but none is reachable from `OperatorEntry` — see Finding 1.

---

## What I am not asking for

No new design. No invented controls. Every item above is **transcription from v3 plus a
dispatch line** — the pack already draws all of it, and `PACK-INVENTORY-v3.md` is the index.

Two things that are genuinely mine and are NOT in this list, so nobody waits on them:
`settings/numbers` (ruled into existence, never drawn) and a sign-out control (the pack has
no glyph). Both stay absent until I draw them.

---

## Suggested order

1. **Mount what is already ported.** Finding 1 is a dispatch problem, not a port problem —
   ~370 KB of correct work is one file away from being on screen.
2. **Replace panel keys with pack surfaces**, view by view, starting with the ones where the
   old panel actively contradicts a ruling (`settings/vault`, `campaigns/catalog`,
   `campaigns/sales`).
3. **People and Segments**: port `peopleVals` / `segVals` / `segBuildVals`; absence stays only
   for the data, per the absence copy.
4. **The spine's remaining four faces.**
5. Everything else in Finding 5, biggest-first off the inventory.

Frames after each step, per the standing cadence.
