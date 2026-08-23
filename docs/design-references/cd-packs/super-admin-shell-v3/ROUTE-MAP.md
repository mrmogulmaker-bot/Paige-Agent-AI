# ROUTE MAP — every pack surface and where it goes

**Generated from `PAIGE Super Admin Shell v3.dc.html` and `paige-ia.js`. Do not hand-edit.**
Regenerate when the pack changes; a hand edit becomes a typed twin of the file it describes.

This is the answer to *"where does this surface belong?"* — asked and answered without a
round trip. Every builder in the pack is listed with its exact line range and the condition
under which the pack renders it. Nothing here is a design decision; it is the pack's own
dispatch table, read out.

**How to use it.** Pick a row. Read `PAIGE Super Admin Shell v3.dc.html` at the line range.
Port it. Mount it at the address in *Renders at*. No question needed at any step.

- `45` builders total
- `24` render at a slot/view address
- `7` render as a summoned surface (never a slot)
- `14` compose on every render (chrome, spine, tour)

---

## 1 · Builders that render at a view

The address is `dest · View`. `dest` is the slot id in `P.PLACES`; `View` is a member of
that slot's `views` array in `P.DEST`. An *(extra)* condition is a state gate inside the
view, not a second address.

| Builder | Pack lines | Renders at |
|---|---|---|
| `peopleVals` | 4795–5099 | relationships · People |
| `campVals` | 5100–5240 | campaigns · Active |
| `convoVals` | 5241–5555 | relationships · Conversations |
| `catVals` | 5684–5788 | campaigns · Catalog |
| `salesVals` | 5789–5903 | campaigns · Sales |
| `segVals` | 6334–6447 | relationships · Segments |
| `socialVals` | 7333–7469 | campaigns · Social |
| `alertVals` | 7470–7525 | settings · Alerts |
| `runsVals` | 7526–7601 | fleet · History |
| `intVals` | 7928–8083 | settings · Integrations |
| `platformVals` | 8084–8170 | settings · Platform |
| `fleetVals` | 8171–8264 | fleet · Directory |
| `autoVals` | 8484–8593 | settings · Automations |
| `alertVals` | 8594–8698 | settings · Alerts |
| `firstRunVals` | 8767–8814 | settings · Setup *(!s.setSeen)* |
| `setupVals` | 8815–8991 | settings · Setup *(!!s.setSeen)* |
| `teamFormVals` | 8992–9100 | settings · Team *(!!s.tmForm)* |
| `teamVals` | 9101–9333 | settings · Team |
| `catalogVals` | 9334–9439 | marketplace · Catalog |
| `pubsVals` | 9440–9507 | marketplace · Publishers |
| `subsVals` | 9508–9575 | marketplace · Submissions |
| `vaultVals` | 9755–9844 | settings · Vault |
| `capsVals` | 9845–9953 | settings · Capabilities |
| `storeVals` | 9954–10155 | marketplace · Storefront |

---

## 2 · Summoned surfaces

These have **no address and never take a slot.** They open over the workspace and retire when
closed — the pack's own rule. The key is `s.summon`; `P.SUMMONS` in `paige-ia.js` carries each
one's title, deck and foot.

| Builder | Pack lines | Renders at |
|---|---|---|
| `offerVals` | 5556–5683 | summon `offer` |
| `schemaVals` | 5904–6150 | summon `campschema` |
| `segBuildVals` | 6151–6333 | summon `segment` |
| `calSetVals` | 6978–7188 | summon `calset` |
| `studioVals` | 7189–7259 | summon `studio` |
| `postVals` | 7260–7332 | summon `post` |
| `buildVals` | 8265–8483 | summon `builder` |

### `P.SUMMONS` entries

| Key | Title |
|---|---|
| `offer` | New offering |
| `campschema` | What you can change |
| `segment` | Segment |
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
| `wireVals` | 4545–4575 | composed on every render |
| `trustVals` | 4576–4761 | composed on every render |
| `findingVals` | 4762–4794 | composed on every render |
| `chartVals` | 6448–6653 | `s.dest === 'analytics' ? viewName` |
| `stageBuilderVals` | 6654–6731 | composed on every render |
| `dealVals` | 6732–6977 | `dl, dlStage, stages` |
| `intPanelVals` | 7602–7927 | composed on every render |
| `tourVals` | 8699–8766 | composed on every render |
| `reviewVals` | 9576–9655 | composed on every render |
| `listingVals` | 9656–9754 | composed on every render |
| `codeVals` | 10156–10287 | `face === 'code', ceilingHeld, btn` |
| `mindVals` | 10288–10500 | composed on every render |
| `composerVals` | 10501–10618 | composed on every render |
| `renderVals` | 10619 | composed on every render |

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
