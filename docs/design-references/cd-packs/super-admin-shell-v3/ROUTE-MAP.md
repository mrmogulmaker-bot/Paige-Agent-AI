# ROUTE MAP — every pack surface and where it goes

**Generated from `PAIGE Super Admin Shell v3.dc.html` and `paige-ia.js`. Do not hand-edit.**
Regenerate when the pack changes; a hand edit becomes a typed twin of the file it describes.

This is the answer to *"where does this surface belong?"* — asked and answered without a
round trip. Every builder in the pack is listed with its exact line range and the condition
under which the pack renders it. Nothing here is a design decision; it is the pack's own
dispatch table, read out.

**How to use it.** Pick a row. Read `PAIGE Super Admin Shell v3.dc.html` at the line range.
Port it. Mount it at the address in *Renders at*. No question needed at any step.

- `46` builders total
- `24` render at a slot/view address
- `8` render as a summoned surface (never a slot)
- `14` compose on every render (chrome, spine, tour)

---

## 1 · Builders that render at a view

The address is `dest · View`. `dest` is the slot id in `P.PLACES`; `View` is a member of
that slot's `views` array in `P.DEST`. An *(extra)* condition is a state gate inside the
view, not a second address.

| Builder | Pack lines | Renders at |
|---|---|---|
| `peopleVals` | 4852–5156 | relationships · People |
| `campVals` | 5157–5297 | campaigns · Active |
| `convoVals` | 5298–5612 | relationships · Conversations |
| `catVals` | 5741–5845 | campaigns · Catalog |
| `salesVals` | 5846–5960 | campaigns · Sales |
| `segVals` | 6391–6504 | relationships · Segments |
| `socialVals` | 7431–7567 | campaigns · Social |
| `alertVals` | 7568–7623 | settings · Alerts |
| `runsVals` | 7624–7699 | fleet · History |
| `intVals` | 8026–8181 | settings · Integrations |
| `platformVals` | 8182–8268 | settings · Platform |
| `fleetVals` | 8269–8362 | fleet · Directory |
| `autoVals` | 8582–8691 | settings · Automations |
| `alertVals` | 8692–8796 | settings · Alerts |
| `firstRunVals` | 8865–8912 | settings · Setup *(!s.setSeen)* |
| `setupVals` | 8913–9089 | settings · Setup *(!!s.setSeen)* |
| `teamFormVals` | 9090–9198 | settings · Team *(!!s.tmForm)* |
| `teamVals` | 9199–9431 | settings · Team |
| `catalogVals` | 9432–9537 | marketplace · Catalog |
| `pubsVals` | 9538–9605 | marketplace · Publishers |
| `subsVals` | 9606–9673 | marketplace · Submissions |
| `vaultVals` | 9853–9942 | settings · Vault |
| `capsVals` | 9943–10051 | settings · Capabilities |
| `storeVals` | 10052–10253 | marketplace · Storefront |

---

## 2 · Summoned surfaces

These have **no address and never take a slot.** They open over the workspace and retire when
closed — the pack's own rule. The key is `s.summon`; `P.SUMMONS` in `paige-ia.js` carries each
one's title, deck and foot.

| Builder | Pack lines | Renders at |
|---|---|---|
| `offerVals` | 5613–5740 | summon `offer` |
| `schemaVals` | 5961–6207 | summon `campschema` |
| `segBuildVals` | 6208–6390 | summon `segment` |
| `calSetVals` | 7035–7248 | summon `calset` |
| `codeworkVals` | 7249–7286 | summon `codework` |
| `studioVals` | 7287–7357 | summon `studio` |
| `postVals` | 7358–7430 | summon `post` |
| `buildVals` | 8363–8581 | summon `builder` |

### `P.SUMMONS` entries

| Key | Title |
|---|---|
| `offer` | New offering |
| `campschema` | What you can change |
| `segment` | Segment |
| `codework` | She is writing |
| `finding` | Finding |
| `pipehealth` | Pipeline health |
| `campstep` | Campaign step |
| `trust` | Trust Compass |
| `stages` | Stage builder |
| `deal` | Deal |
| `review` | Submission |
| `owed` | Needs you today |
| `calset` | Calendar settings |
| `studio` | Vibe Studio |
| `post` | Post |
| `social` | Account |
| `integration` | Integration |
| `builder` | Automation |
| `listing` | Listing |
| `sweep` | Systems sweep |
| `web` | Web search |
| `browse` | Browser |
| `sandbox` | Sandbox |
| `connect` | Connect a tool |
| `email` | Compose |
| `sequence` | Sequence |
| `query` | Query |
| `enter` | Tenant scope |
| `rule` | Alert rule |

---

## 3 · Composed on every render

Chrome, the spine, and the tour. Not addressable — always present, gated internally.

| Builder | Pack lines | Renders at |
|---|---|---|
| `wireVals` | 4602–4632 | composed on every render |
| `trustVals` | 4633–4818 | composed on every render |
| `findingVals` | 4819–4851 | composed on every render |
| `chartVals` | 6505–6710 | `s.dest === 'analytics' ? viewName` |
| `stageBuilderVals` | 6711–6788 | composed on every render |
| `dealVals` | 6789–7034 | `dl, dlStage, stages` |
| `intPanelVals` | 7700–8025 | composed on every render |
| `tourVals` | 8797–8864 | composed on every render |
| `reviewVals` | 9674–9753 | composed on every render |
| `listingVals` | 9754–9852 | composed on every render |
| `codeVals` | 10254–10424 | `face === 'code', ceilingHeld, btn` |
| `mindVals` | 10425–10637 | composed on every render |
| `composerVals` | 10638–10755 | composed on every render |
| `renderVals` | 10756 | composed on every render |

---

## 4 · The six slots and their views

Source: `P.PLACES` (ids and glyph paths) and `P.DEST` (views).

| Slot | Views |
|---|---|
| `fleet` | Systems check · Directory · History |
| `relationships` | People · Conversations · Calendar · Segments |
| `campaigns` | Active · Catalog · Sales · Pipeline · Social · Performance |
| `marketplace` | Storefront · Catalog · Submissions · Publishers |
| `analytics` | Fleet · Relationships · Campaigns · Autonomy · Platform health |
| `settings` | Setup · Platform · Integrations · Mind · Automations · Alerts · Capabilities · Vault · Governance · Team |

Anything not in this table is not a place. If a capability seems to need a seventh slot, it
is a summoned surface — section 2 is where it goes.

---

## 5 · The questions this file removes

| Was asked | Answer is here |
|---|---|
| Where does this surface live? | §1 or §2, by builder name |
| Is this a place or a summon? | §1 = place · §2 = summon. No third answer. |
| Which lines do I port? | the *Pack lines* column |
| Is X missing from the pack? | if it is not in §1–§3, it is not in the pack |
| Does this need a new slot? | no — §4 is closed |

Two things this file cannot answer, and they are the only two that come to the design side:

1. **Copy that was never written.** If the pack has no string for it, it does not exist yet.
2. **A capability with no builder at all.** Not a gap to fill by inference — say so, and it
   gets drawn in v3 first.

Everything else is transcription.
