# BUILD ORDER — layer by layer

> ## STANDING CONTRACT — read before anything else
>
> **1 · The design is the specification. The backend accommodates it.**
> Nothing drawn changes to fit what ships. Every accommodation is made in the
> implementation. If a table cannot serve the design, **the table changes.** Not open to
> re-negotiation one surface at a time.
>
> **2 · Make it live first. Edit after.**
> The whole instruction is to get the platform live against this pack. Improvements,
> refactors, simplifications and "while I was in here" changes wait until it runs. A better
> idea mid-layer is a note, not a commit.
>
> **3 · No design decisions. Ever.**
> Do not invent a control, a label, an empty state, a colour, a glyph, a radius, a size or a
> layout. If it is not in the pack, it does not exist yet. Reaching for a new top-level route
> to reach a capability is the tell — stop there.
>
> **4 · No proposals without asking first.**
> Do not propose a change by shipping it and reporting after. Ask, get an answer, then build.
> A change that lands before the question was answered is a deviation even when it turns out
> to be right.
>
> **5 · Escalate, never infer.**
> Two things — and only these two — come back to the design side:
>
> | Situation | What to send |
> |---|---|
> | A component or surface is **not drawn in the pack** | the capability, where it would go, and the search you ran to establish absence. It gets **drawn in v3 first**, then `ROUTE-MAP.md` regenerates and you port it. |
> | **Copy was never written** | the surface, the slot the copy fills, and what it has to say |
>
> Everything else is answered by `ROUTE-MAP.md`, this file, or `design-system-port.md`.
> If a question is answered in one of those three, it is not a question.
>
> **6 · Silence is not absence.**
> A surface nobody mentioned is not a surface that does not exist. The pack is the index;
> `ROUTE-MAP.md` lists all 45 builders. Anything not in it is genuinely absent — that is the
> only evidence of absence that counts. *(This rule exists because the entire Paige spine was
> drawn in the pack, on no list, and therefore never opened.)*
>
> **7 · Driven, or not done.**
> A surface is not finished until it has been rendered and measured — both themes, 1600 and
> 900. Every defect this console was rejected for passed `tsc`, `eslint` and the suite first.


Companion to `ROUTE-MAP.md`. The route map says *where every surface goes*; this says
*in what order to build them, and when each layer is done.*

Read both once. Then work down this file without asking anything that `ROUTE-MAP.md`
answers.

---

## The two rules that make this mechanical

**1 · Structure before data.** Port a surface's shape first and let every unbacked figure
render an em-dash. A surface with correct geometry and honest em-dashes is finished work; a
surface with plausible numbers and no read behind them is the failure this console has been
rejected for twice. Wiring is a separate layer and it comes last.

**2 · Cite the pack, and only v3.** Every port names `PAIGE Super Admin Shell v3.dc.html`
and its line range in a header comment. A file citing `Super Admin Shell.dc.html` or
`v2` is the retired design and must not be mounted — that is how 232 KB of dead-pack surface
nearly went into the new shell through the fix for it.

---

## Layer 0 · Done

Shell geometry, the collapse order, the token system at 44/44 parity, the two faces, the
Command Mark, the scope band, the command bar and palette, the spine's Chat face. Nothing to
do here; it is the ground the rest sits on.

---

## Layer 1 · Mount what is already ported

Three v3 surfaces exist and are reachable from nothing. This is a dispatch line each, not a
port.

`MarketplaceSubmissionsSurface` → `marketplace · Submissions`
`CalendarFieldSurface` → `relationships · Calendar`
`IntegrationsSurface` → `settings · Integrations`

**Done when:** `git grep` from `OperatorEntry` reaches every file under `surfaces/`. A file
no live path imports is not shipped, whatever its tests say.

---

## Layer 2 · Strip the dead pack

Delete the files citing the retired pack, and `legacy/OperatorLegacyApp.tsx` with them. Their
capability is carried by the `carries` ledger in `viewSources.ts`, which stays.

**Done when:** no file under `src/operator/` cites any pack but v3, and `viewSources.ts` has
no `panels:` key pointing at an old-tree address. Replace those keys with the v3 builder
that owns the view — `ROUTE-MAP.md` §1 is the lookup.

**Priority inside this layer:** three views currently render an old panel that contradicts a
standing ruling. Do these first.

| View | Old panel | Why it must go |
|---|---|---|
| `settings · Vault` | `settings/vault/vendors` | Vault must not read `business_vendors` — the funding vertical's credit tracker sharing a name. It would render plausibly and be wrong. |
| `campaigns · Catalog` | `revenue/plans`, `revenue/metering` | old billing panels standing where `catVals` belongs |
| `campaigns · Sales` | `revenue/invoices`, `revenue/at-risk` | same, and Sales must derive from lines, never hold its own ledger |

---

## Layer 3 · The twenty-four view surfaces

Grouped by **shared contract**, not by slot. Everything in a group reads the same catalogues,
so porting them together means reading the contract once and getting three or four surfaces
out of it. Porting them apart means reading it three or four times and drifting.

### 3a · Relationships — one record, three views
`peopleVals` 4795 · `convoVals` 5241 · `segVals` 6334

The pack's own words: *People and Conversations are one record seen two ways — open a person
and you open their thread.* Port them as one pass over one contract. `convoVals` is the
largest at 315 lines and it is the right entry point: it unlocks Conversations and gives
`ComposeOutbound` its home in the thread pane foot, so the composer stops being a fragment.

### 3b · Campaigns — the money spine
`campVals` 5100 · `catVals` 5684 · `salesVals` 5789

All three read `P.CAMP_SCHEMA` and `P.CARD_FACTS`; Active's `Sells`/`Booked` is the join
from a campaign to a catalogue row. Sales is **entirely derived** — every figure a sum over
the lines, nothing typed. Port the three together or the join has nothing to join.

Pairs with `schemaVals` and `offerVals` in Layer 4; the inline `Adjust` doors on all three
surfaces open them.

### 3c · Marketplace — the install economy
`storeVals` 9954 · `catalogVals` 9334 · `subsVals` 9508 · `pubsVals` 9440

One vocabulary of five kinds across all four — `marketplaceVocabulary.ts` already exists for
exactly this. Submissions is mounted in Layer 1, so this is the other three plus the
`review` and `listing` slide-overs.

### 3d · Settings — authority and configuration
`setupVals` 8815 + `firstRunVals` 8767 · `platformVals` 8084 · `autoVals` 8484 ·
`alertVals` 7470/8594 · `capsVals` 9845 · `vaultVals` 9755 · `teamVals` 9101 +
`teamFormVals` 8992

Two are pairs sharing a view: Setup shows `firstRunVals` on first arrival and `setupVals`
after; Team shows `teamFormVals` over `teamVals` when inviting or editing. One surface, two
states — not two addresses.

`alertVals` appears twice in the pack at different line ranges. Read both, port the second
(8594) — it is the later authored version and carries the repair model.

### 3e · Fleet and Analytics — the reads
`fleetVals` 8171 · `runsVals` 7526 · `socialVals` 7333

`fleetVals` and Fleet Console are already live; `runsVals` lands at `fleet · History`
beside `FleetHistorySurface`. `socialVals` is Campaigns' but reads the Social contract on
its own, so it ports alone.

**Done, per surface:** it renders at its address, every figure with no read behind it shows
an em-dash, no pack fixture string reaches the output, and it has been driven — both themes,
1600 and 900 — with `npm run dev-loop` against the reference.

---

## Layer 4 · The seven summoned surfaces

`offerVals` · `schemaVals` · `segBuildVals` · `calSetVals` · `studioVals` · `postVals` ·
`buildVals`

These need **the summon host first** — one component that opens over the workspace in the
pack's four geometries (split, slide-over, pop-out, detached) and retires on close.
`SummonedSurface.tsx` exists; wire it to `s.summon` and all seven land in it.

None of these is a place. None takes a route. If a summon appears in the rail or gets a URL,
that is the modelling error that has already happened three times — act-as, agent runs, and
Paige herself.

**Order:** `schemaVals` + `offerVals` first — Layer 3b's three surfaces all have doors into
them, so they are already being called. Then `segBuildVals` (Segments' builder), then the
rest.

**Note on `calSetVals`:** the pack draws four faces — cals, rules, types, hosts — behind a
tab strip at 7007. Earlier transcription covered `rules` only. Port all four.

---

## Layer 5 · The spine's remaining faces and the chrome

`mindVals` 10288 · `codeVals` 10156 · `wireVals` 4545 · `trustVals` 4576 ·
`composerVals` 10501 · `tourVals` 8699 · `chartVals` 6448 · `findingVals` 4762 ·
`stageBuilderVals` 6654 · `dealVals` 6732 · `intPanelVals` 7602 · `listingVals` 9656 ·
`reviewVals` 9576

Chat ships; Memory, Team, Skills and Code are the faces behind it. `wireVals` is the
execution strip — the `think`/`act` states, which is what makes her *run and talk at once*
rather than block. `mindVals` reads the neuroscience substrate in `mind-brain.js`.

A face stays dark until it has content. A tab that opens an empty pane is the blank-surface
failure at face scale.

---

## Layer 6 · Wiring

Only now. Every surface has correct structure and honest em-dashes; this layer replaces
em-dashes with reads, one hook at a time, and **nothing about the surface changes.** If
wiring wants to change a surface, the answer is no — the table changes instead.

Standing constraints, already ruled:

- **RPC wherever one exists.** 52 of 59 operator tables gate on `is_platform_owner()`;
  every `operator_*` RPC resolves `is_platform_admin()`. A table read returns zero rows for a
  platform_admin — indistinguishable from "no data."
- **Attribution is typed columns on `tenant_orders`**, never `metadata jsonb`. A figure is
  only as derivable as the column under it.
- **One canonical click source** named, or `analytics_events` and `referral_clicks`
  reconciled explicitly.
- **Sales is a derived read** over `tenant_orders`. Never a second ledger.
- **Vault gets its own substrate.** Not `business_vendors`.
- Deferred-not-retired, each an ingestion target so Paige can read it: ad spend / MER / CAC,
  uptime and incidents, email engagement. Panels keep their place and their absence copy
  names the source.

---

## The cadence

Every layer ends the same way: **driven, both themes, two widths, frames sent.** A change to
an operator surface is not done until it has been driven — every defect this console was
rejected for passed `tsc`, `eslint` and the suite first.

## What counts as a deviation

So there is no ambiguity about the line:

| Deviation | Not a deviation |
|---|---|
| inventing a control, label, empty state, glyph or size | choosing a variable name, file layout, hook shape |
| changing a layout because the data is awkward | changing the query, the table, the join |
| shipping a proposal and reporting it | sending the proposal and waiting |
| substituting a near-enough token or face | computing which token the pack's own logic implies |
| "simplifying" a surface while porting it | porting it exactly and noting the concern |
| filling an absence with a plausible figure | rendering an em-dash |
| mounting a file that cites a pre-v3 pack | mounting a v3 port |
| adding a seventh slot, or a route for a summon | `ROUTE-MAP.md` §2 |

## Escalation format

When something is genuinely not drawn, send exactly this — nothing else is needed:

```
NOT IN PACK
capability:  what it is, in one line
address:     the slot · view or summon it would belong to
searched:    the terms run, and every hit accounted for
blocking:    which layer stops, or "nothing — continuing"
```

Then **keep going on the rest of the layer.** One absent surface does not stop the other
twenty-three. It gets drawn in v3, the route map regenerates, and it lands in a later pass.

Everything in Layers 1–6 is transcription plus a dispatch line. There is no layer in this
file that requires a decision.
