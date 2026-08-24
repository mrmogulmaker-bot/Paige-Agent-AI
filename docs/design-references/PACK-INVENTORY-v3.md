# Pack inventory — `super-admin-shell-v3`, 100% grep

**What this is.** A complete, file-by-file, line-accounted read of every file Claude Design
delivered in `docs/design-references/cd-packs/super-admin-shell-v3/`. Owner instruction,
2026-08-23: *"grep everything… let me know once you get to 100%"* · *"don't miss a single
file"* · *"I want all of your findings, every single line of your findings, inside of my
code."*

**What this is NOT.** Not a review. Not a verdict. Not a proposal. Per root `CLAUDE.md` §00,
Claude Code has zero input on design — every line below is either a transcription of what the
pack says, or a measurement of whether our code contains it. Where the pack disagrees with
itself, both sides are quoted and neither is resolved here.

**Why it exists.** Before this pass, no session had read the whole pack. The Paige spine was
scoped as missing when the pack draws it in full; the command palette was about to be scoped
as a design blocker when the pack carries 115 `summon` references. The failure was never
difficulty — it was reporting on parts while never having looked at the whole.

---

## 0. Coverage — measured, not estimated

**21 files.** The original 18 (3,678,312 bytes · 20,978 lines) plus three delivered
2026-08-23 in the roadmap bundle — all read.

| Added 2026-08-23 | Lines | What it is |
|---|---:|---|
| `BUILD-ORDER.md` | 265 | **The layer plan, and the STANDING CONTRACT.** Seven rules, a deviation table, and the escalation format. Layers 0–6, each with a done-condition. |
| `ROUTE-MAP.md` | 164 | **Generated from the pack.** All 45 builders with line ranges and addresses: 24 at a view, 7 summoned, 14 composed. Answers "where does this go" without a round trip. |
| `main-audit-2026-08-23.md` | 166 | The main audit — byte-identical to the one already actioned. |

**Both standing edits are CLOSED as of delivery 9 (2026-08-23).** They were locators for CD's
source, not patches to re-apply, and CD fixed both there: `CLAUDE-CODE-HANDOFF.md` rule 9 now
reads `11 / 13 / 16 / 21` with the stale line named as stale, and
`tenant-redesign-stage2-design-package.md` (renamed from `stage2-design-package.md`) has every
token table removed rather than corrected — including the warning note that had itself repeated
the five bad hexes. Delivery 9's copies are what the repo now carries.


| File | Bytes | Lines | Max line | What it is | Read |
|---|---:|---:|---:|---|---|
| `PAIGE Super Admin Shell v3.dc.html` | 804,434 | 11,358 | 835 | **The shell.** Style block + template + `class Component` | ✅ 100% |
| `PAIGE Platform Operator - standalone.html` | 2,280,302 | 392 | 1,406,647 | Compiled bundle — screenshot target only | ✅ 100% (unpacked + diffed) |
| `paige-ia.js` | 226,301 | 2,651 | 570 | **The data contract.** 96 `P.*` catalogues | ✅ 100% (evaluated) |
| `support.js` | 69,150 | 1,911 | 968 | The `dc-runtime` shim — generated, not design | ✅ 100% (characterised) |
| `mind-brain.js` | 30,186 | 609 | 143 | The Mind substrate renderer | ✅ 100% |
| `PORT-SPEC-palette-and-six-surfaces.md` | 99,111 | 1,392 | 835 | Line-cited port transcription, §§1–5 | ✅ 100% |
| `tenant-redesign-stage2-design-package.md` | 38,766 | 723 | 312 | Stage 1/2 package — **superseded token set** | ✅ 100% |
| `github.md` | 31,632 | 344 | 630 | Provenance + rulings + design rulings | ✅ 100% |
| `INSTALL-PLAN.md` | 18,056 | 243 | 602 | **The 18-round build plan + R1–R7** | ✅ 100% |
| `pack-provenance.md` | 15,827 | 99 | 630 | Screen map + rulings | ✅ 100% |
| `campaigns-catalog-sales-spec.md` | 14,365 | 324 | 112 | Catalog · Sales · schema · segments · chrome | ✅ 100% |
| `design-system-port.md` | 12,746 | 171 | 835 | Tokens · faces · Command Mark · port order | ✅ 100% |
| `corrections-2026-08-23.md` | 10,228 | 210 | 86 | Revs 3→5 corrections | ✅ 100% |
| `CLAUDE-CODE-HANDOFF.md` | 10,208 | 197 | 213 | **The 13-rule fidelity contract** | ✅ 100% |
| `paige-brand-identity.md` | 5,792 | 133 | 135 | Command Mark geometry · motion · palette | ✅ 100% |
| `README.md` | 5,326 | 81 | 143 | Pack index + known disagreements | ✅ 100% |
| `RENDERING.md` | 3,592 | 85 | 166 | Offline render + width-driven layout | ✅ 100% |
| `absence-copy.md` | 2,290 | 55 | 83 | Verbatim absence copy, 2 slots | ✅ 100% |

`support.js` carries zero design content. Its first line: *"GENERATED from dc-runtime/src/*.ts
— do not edit."* It defines the parser/renderer (`parseDcDocument`, `compileTemplate`,
`createRuntime`, `DCLogic`, …). The filename is coincidental — **it is not a support surface**,
a point PORT-SPEC §5 makes at length after searching `inbox`/`ticket`/`triage` and finding 0/0/0.

**`standalone.html` is the same design, not a newer one.** Unpacked its two blobs (a 1.4 MB
gzip+base64 manifest at L378, an 854 KB JSON template at L390) and diffed the template against
the `.dc.html`. Every difference is a bundler artifact: fonts inlined as `@font-face` with UUID
`src`, script `src` rewritten to UUIDs, `onClick`→`sc-camel-on-click`, `viewBox`→
`sc-camel-view-box`, `<input>`→`<input />`. **Zero net-new design content.** Its one authored
element is the boot thumbnail SVG (L23–29) — the Command Mark at 240×240.

---

## 1. The shell — `PAIGE Super Admin Shell v3.dc.html`, all 11,358 lines accounted

| Region | Lines | Contents |
|---|---|---|
| Head + font links | 1–17 | Google Fonts (Schibsted Grotesk · JetBrains Mono · Newsreader) + Fontshare (Gambetta) |
| `<style>` | 18–68 | The complete token system, both themes, scrollbars, focus, 17 keyframes |
| `<x-dc>` template | 69–4,194 | The markup — **183 `sc-if` blocks · 249 distinct `sc-for` collections · 1,733 `{{ }}` interpolations** |
| `class Component extends DCLogic` | 4,196–11,355 | **~90 members. 49 are `*Vals()` / `*Overrides()` surface builders.** `renderVals()` at L10,619 is a 741-line assembler that spreads them all |

### 1.1 The token system — verbatim, both themes (L19–L45)

Read in full. What it defines, exactly:

- **Depth ladder, 7 steps:** `--pg-env` → `-nav` → `-canvas` → `-spine` → `-workspace` →
  `-surface` → `-raised`. Plus `--pg-artifact` (paper — *not* a surface).
- **4 line weights:** `-line-soft` · `-line` · `-line-strong` · `-line-authority`.
- **4 ink weights:** `-ink` · `-ink-2` · `-muted` · `-faint`. Nothing below `faint`.
- **5 gold tokens:** `-gold-core` · `-gold` · `-gold-deep` · `-gold-fill` · `-gold-bloom`.
- **Elevation:** `-e1`…`-e4` · `--pg-rim` · `--pg-lift-1/2/3` · `--pg-inset`.
- **4 radii, the only four:** `-r-plate` 13px · `-r-chip` 9px · `-r-seal` 11px · `-r-pill` 999px.
- **5 kind colours:** `--k-skill` · `--k-automation` · `--k-integration` · `--k-template` ·
  `--k-agent` — both themes, distinct values.
- **Command Mark states:** `[data-cm]` base + `dormant` (per-theme) · `charged` · `executed`,
  each driving `--cm-slash`, `--cm-orb` and `--cm-pulse` (5.2s / 1.7s / 1.1s).
- **Scrollbars** styled on `[data-pg]` — 10px, `--pg-line-strong` thumb, transparent track.
- **`:focus-visible`** = `2px solid var(--pg-gold-core)` at `outline-offset: 3px`.
- **17 keyframes:** `pg-glow` · `pg-think` · `pg-caret` · `pg-reveal` · `pg-breathe` ·
  `pg-warm` · `pg-streak` · `pg-drop` · `pg-pin` · `pg-materialize` · `pg-roll` · `pg-sweep` ·
  `pg-mark-wait` · `pg-mark-think` · `pg-edge` — plus the `prefers-reduced-motion` root kill.

### 1.2 The 183 render blocks, in document order

Every `sc-if` in the template. This is the definitive block index — the earlier `show*` sweep
found 54 and its substring matching made its port column worthless.

```
  1 scoped            39 ch.isStackBars   77 tmOnInvites     115 dealOnNotes      153 st.hasChips
  2 paletteOpen       40 ch.isFunnel      78 showSetup       116 dealOnPortal     154 sgPickOpen
  3 showStudioDoor    41 ch.isStack       79 stHasCost       117 showPost         155 sgHasMembers
  4 showKpis          42 ch.isNone        80 stHasField      118 poHasMedia       156 showListing
  5 showTape          43 ch.hasNote       81 stHasPick       119 showCalSet       157 lgCapped
  6 showRunStrip      44 showBoard        82 stHasDrop       120 csBack           158 lgIsIn
  7 showBrief         45 cd.blocked       83 si.byHer        121 csTabsOn         159 authorityOpen
  8 sweepStarted      46 st.empty         84 showVault       122 csOnCals         160 spineOpen
  9 segBack           47 showLedger       85 showAlerts      123 ncOpen           161 onMemory
 10 segUnsized        48 showCaps         86 showSubs        124 csOnTypes        162 hasProposed
 11 of.hasTiers       49 showCatalog      87 subsEmpty       125 csOnHosts        163 onTeam
 12 showBack          50 showPubs         88 showAlerts      126 csOnType         164 spinningUp
 13 pIsFields         51 showSocial       89 al.hasAct       127 csOnRules        165 notSpinning
 14 pf.editing        52 ac.dead          90 alOnRules       128 showStudio       166 onSandbox
 15 pf.resting        53 showMind         91 showAuto        129 stPickedOn       167 teachOpen
 16 pf.hasProposal    54 mindNarrow       92 showStore       130 showIntPanel     168 hasTeachSteps
 17 pf.hasSource      55 hasPick          93 heroOn          131 ivOnConn         169 onCode
 18 pIsPanel          56 mindNarrow       94 kc.hasGlyph     132 ivOnScopes       170 readMode
 19 showList          57 mfField          95 co.titled       133 ivOnNumbers      171 editMode
 20 soloBack          58 mfWrite          96 storeEmpty      134 ivOnA2P          172 hasRuns
 21 cf.isAll          59 mfRecall         97 showField       135 ivOnActivity     173 limitsOpen
 22 cf.hasGlyph       60 mfFeatures       98 cell.has        136 showReview       174 onChat
 23 newOpen           61 mfRhythm         99 summonOpen      137 showBuild        175 t.isTrace
 24 showThread        62 mfSources       100 summonDetached  138 bt.isAgent       176 t.traceOpen
 25 callLive          63 mfPolicy        101 detachBlocked   139 bt.hasChips      177 t.hasBody
 26 hasDraft          64 showInts        102 showFinding     140 nd.hasWire       178 t.isAsk
 27 chanOpen          65 it.hasBlock     103 findingHasFix   141 nd.canDrop       179 t.hasAct
 28 snipOpen          66 showPlatform    104 findingApproved 142 bPickerOpen      180 showPresence
 29 showRail          67 tr.open2        105 showTrust       143 showOffer        181 showStrip
 30 soloBack          68 tourOn          106 showCampStep    144 nr.isText        182 pickerOpen
 31 showRuns          69 tourHasBack     107 showStageBuilder145 nr.isPicks       183 hasDirective
 32 showFleet         70 showFirst       108 stageWarn       146 nr.isTiers
 33 fr.isChild        71 tmFormOn        109 showDealInspector 147 showSchema
 34 showCharts        72 tmCanRemove     110 dealOnRecord    148 sr.isText
 35 gp.hasDeep        73 showTeam        111 df.editing      149 sr.isPicks
 36 ch.isLine         74 tmOnPeople      112 df.resting      150 sr.isList
 37 ch.isRing         75 tmOnRoles       113 dealBlocked     151 showSeg
 38 ch.isBars         76 tmOnEnts        114 dealOnActivity  152 st.isAgent
```

### 1.3 The 49 surface builders — pack size vs. what our code contains

Method, its length in the pack, its authored-string count, and how many of those strings
appear verbatim anywhere under `src/operator/`. The measure is deliberately crude in one
direction only: a string found proves the copy is ported; a string missing proves *that
string* is absent, not that the whole surface is. Style/geometry literals are filtered out.

| Vals method | pack lines | strings | in `src/` | % |
|---|---:|---:|---:|---:|
| `renderVals` | 741 | 193 | 50 | 26% |
| `convoVals` | 315 | 84 | 18 | 21% |
| `peopleVals` | 305 | 79 | 12 | 15% |
| `schemaVals` | 247 | 69 | 7 | 10% |
| `dealVals` | 246 | 55 | 9 | 16% |
| `teamVals` | 233 | 47 | 8 | 17% |
| `buildVals` | 219 | 52 | 11 | 21% |
| `mindVals2` | 214 | 48 | 9 | 19% |
| `mindVals` | 213 | 49 | 11 | 22% |
| `calSetVals` | 211 | 53 | 12 | 23% |
| `segBuildVals` | 183 | 43 | 15 | 35% |
| `setupVals` | 177 | 78 | 11 | 14% |
| `chartVals` | 166 | 35 | 5 | 14% |
| `intVals` | 156 | 42 | 29 | **69%** |
| `storeVals` | 144 | 34 | 8 | 24% |
| `campVals` | 141 | 41 | 11 | 27% |
| `socialVals` | 137 | 34 | 13 | 38% |
| `codeVals` | 132 | 31 | 6 | 19% |
| `offerVals` | 128 | 30 | 9 | 30% |
| `composerVals` | 118 | 33 | 10 | 30% |
| `salesVals` | 115 | 33 | 8 | 24% |
| `segVals` | 114 | 30 | 7 | 23% |
| `intPanelVals` | 112 | 26 | 5 | 19% |
| `autoVals` | 110 | 28 | 8 | 29% |
| `teamFormVals` | 109 | 41 | 4 | 10% |
| `capsVals` | 109 | 23 | 5 | 22% |
| `catalogVals` | 106 | 31 | 7 | 23% |
| `catVals` | 105 | 33 | 12 | 36% |
| `alertVals` (settings) | 105 | 36 | 7 | 19% |
| `listingVals` | 99 | 22 | 5 | 23% |
| `systemsOverrides` | 95 | 31 | 5 | 16% |
| `fleetVals` | 94 | 13 | 4 | 31% |
| `trustVals` | 91 | 35 | 15 | 43% |
| `vaultVals` | 90 | 26 | 6 | 23% |
| `platformVals` | 87 | 8 | 5 | 63% |
| `reviewVals` | 80 | 25 | 21 | **84%** |
| `stageBuilderVals` | 78 | 23 | 4 | 17% |
| `runsVals` | 76 | 21 | 7 | 33% |
| `postVals` | 73 | 17 | 6 | 35% |
| `studioVals` | 71 | 18 | 5 | 28% |
| `tourVals` | 68 | 9 | 2 | 22% |
| `pubsVals` | 68 | 15 | 5 | 33% |
| `subsVals` | 68 | 16 | 8 | 50% |
| `storeValsUnused` | 58 | 22 | 7 | 32% |
| `alertVals` (fleet) | 56 | 10 | 2 | 20% |
| `firstRunVals` | 48 | 14 | 1 | 7% |
| `pipelineOverrides` | 40 | 23 | 1 | 4% |
| `findingVals` | 33 | 5 | 2 | 40% |
| `wireVals` | 31 | 10 | 4 | 40% |
| **TOTAL** | **7,160** | **1,774** | **442** | **25%** |

**One in four of the pack's authored strings exists in our console.** The three surfaces above
50% are the three that were ported from the PORT-SPEC line-citations (`intVals`, `reviewVals`,
`subsVals`) — which is the measure working: transcription from a line-cited spec lands the copy;
building from memory does not.

### 1.4 The `renderVals` dispatch table — which surface is gated by what

Extracted verbatim from L10,619–11,354. This is the definitive surface→guard map:

```
L10816  wireVals()                              always
L10919  chartVals(dest==='analytics' ? view)    analytics
L10921  findingVals()                           summon 'finding'
L10922  trustVals()                             summon 'trust'
L10923  stageBuilderVals()                      summon 'stages'
L10924  listingVals()                           summon 'listing'
L10925  reviewVals()                            summon 'review'
L10926  subsVals(marketplace · Submissions)
L10927  catalogVals(marketplace · Catalog)
L10928  pubsVals(marketplace · Publishers)
L10953  storeVals(marketplace · Storefront)
L10954  buildVals(summon 'builder')
L10955  segBuildVals(summon 'segment')
L10956  autoVals(settings · Automations)
L10961  fleetVals(fleet · Directory)
L10962  platformVals(settings · Platform)
L10963  intVals(settings · Integrations)
L10964  intPanelVals()                          summon 'integration'
L10965  runsVals(fleet · History)
L10966  alertVals(settings · Alerts)
L10967  postVals(summon 'post')
L10968  studioVals(summon 'studio')
L10969  calSetVals(summon 'calset')
L11069  mindVals()                              spine face
L11070  composerVals()                          spine composer
L11166  convoVals(relationships · Conversations)
L11167  segVals(relationships · Segments)
L11168  peopleVals(relationships · People)
L11169  campVals(campaigns · Active)
L11170  catVals(campaigns · Catalog)
L11171  salesVals(campaigns · Sales)
L11172  schemaVals(summon 'campschema')
L11173  offerVals(summon 'offer')
L11176  socialVals(campaigns · Social)
L11177  mindVals2(settings · Mind)
L11306  alertVals(settings · Alerts)            [second spread — fidelity rule 5]
L11308  setupVals(settings · Setup && setSeen)
L11309  teamVals(settings · Team)
L11310  teamFormVals(settings · Team && tmForm)
L11311  firstRunVals(settings · Setup && !setSeen)
L11312  tourVals()
L11321  vaultVals(settings · Vault)
L11345  capsVals(settings · Capabilities)
```

Note `showBoard` (Pipeline) has no `*Vals` — it reads `d.board` from `P.DEST` directly, with
`pipelineOverrides()` layered on. `showField` (Calendar) likewise reads `P.FIELD_*`.

---

## 2. The data contract — `paige-ia.js`, all 96 catalogues with exact counts

Evaluated the file rather than reading it, so every count below is computed, not estimated.

| Line | Catalogue | Size |
|---:|---|---|
| 8 | `P.PLACES` | 6 items — the six rail slots with SVG paths |
| 29 | `P.CAPS` | 4 groups (Reach out · Build and connect · Look things up · Act on the fleet) |
| 50 | `P.AUTONOMY` | 3 — Autonomous · Ask first · Draft only |
| 56 | `P.SUMMONS` | **28 summoned surfaces** |
| 128 | `P.DEST` | 6 destinations · **32 views** · kpis · kpisByView · ledgerByView · rows |
| 405 | `P.SWEEP` | 3 — run · domains · findings |
| 441 | `P.CHARTS` | 6 lenses (incl. `CampaignPerf`) |
| 515 | `P.CHANNELS` | 5 |
| 525 | `P.DM_NETWORKS` | 4 — LinkedIn · Instagram · X · Facebook |
| 532 | `P.THREADS` | 6 |
| 574 | `P.CONV_PERF` | 5 |
| 592 | `P.PEOPLE` | 7 |
| 637 | `P.PERSON_TABS` | 10 — Identity · Business · Documents · Vault · Portal · Conversations · Deals · Billing · Notes · Activity |
| 641 | `P.WIRE_COUNTS` | 6 (one per destination) |
| 656 | `P.SEG_FIELDS` | **12 clause fields** (8 live, 4 `live:false`) |
| 689 | `P.SEG_PHRASES` | **39 phrases** she listens for |
| 731 | `P.SEGMENTS` | 4 saved |
| 768 | `P.CAMP_KINDS` | 4 — outbound · lifecycle · recurring · seo |
| 777 | `P.CAMP_STATES` | 5 — running · holding · scheduled · halted · done |
| 788 | `P.OFFER_KINDS` | 4 — product · service · retainer · license |
| 794 | `P.OFFER_CATEGORIES` | 3 — Platform · Enablement · Advisory |
| 795 | `P.OFFER_STATES` | 4 — selling · quiet · draft · retired |
| 801 | `P.CATALOG` | 5 offerings |
| 841 | `P.SALES_STAGES` | 5 — Quoted · Verbal · Signed · Invoiced · Paid |
| 842 | `P.CLOSE_REASONS` | 5 — Won · Price · Timing · No decision · Lost to in-house |
| 843 | `P.SALES_TARGET` | period · target 12000 · note |
| 844 | `P.SALES` | 6 lines |
| 856 | `P.PROCESSOR` | deck · **needs (5)** · adapters · foot |
| 875 | `P.CARD_FACTS` | 6 — step · opened · reach · grant · offer · booked |
| 883 | `P.CAMP_SCHEMA` | definition · facts · density · stageWord |
| 890 | `P.CAMPAIGNS` | 6 |
| 946 | `P.DEAL_RECORDS` | 5 — d1…d5 |
| 987 | `P.PORTAL_STATES` | 3 — none · invited · active |
| 997 | `P.MEMORY` | 5 |
| 1006 | `P.MEMORY_PROPOSED` | 1 |
| 1010 | `P.AGENTS` | 5 |
| 1023 | `P.SKILLS` | 7 |
| 1042 | `P.MARKET` | kinds · classes · featured · featuredKicker · listings · collections |
| 1135 | `P.SUBMISSIONS` | 3 |
| 1183 | `P.OUTSIDE_KINDS` | 5 — Template ✓ · Skill ✓ · Automation 'review' · Integration ✗ · Agent ✗ |
| 1190 | `P.SOCIAL` | days · accounts · marks |
| 1243 | `P.POSTS` | 4 keyed posts |
| 1282 | `P.STUDIO` | route · doors · sessions |
| 1323 | `P.CAL_TYPES` | 5 |
| 1346 | `P.ALERT_SCOPES` | 5 |
| 1354 | `P.ALERT_RULES` | 12 *(redeclared at 2177 — the second wins)* |
| 1380 | `P.SEATS` | 4 |
| 1387 | `P.ALERT_CHANNELS` | 4 |
| 1402 | `P.RUNS` | **36** (generated — the five-minute evaluator's cadence) |
| 1424 | `P.PLATFORM` | legal · tenant · region · since · swatches · scales · domains · inherit · owed |
| 1464 | `P.INT_KINDS` | 6 — OAuth · Key · Webhook · MCP · SMTP · CalDAV |
| 1473 | `P.INTEGRATIONS` | 8 shelves (**42 named vendors**) |
| 1537 | `P.INT_DETAIL` | 6 — Twilio SMS · Twilio Voice · Gmail · n8n · PAIGE MCP server · Anthropic |
| 1590 | `P.PHONE_NUMBERS` | 4 |
| 1597 | `P.A2P_STEPS` | 5 |
| 1605 | `P.TIERS` | 6 |
| 1634 | `P.TIER_FEATURES` | 6 (the 6×6 capability grid) |
| 1649 | `P.FLEET` | 4 |
| 1662 | `P.FLEET_INTERNAL` | 4 |
| 1683 | `P.FEATURES` | 8 |
| 1702 | `P.NEUROTRANSMITTERS` | 6 |
| 1713 | `P.BANDS` | 5 |
| 1721 | `P.MIND_INPUTS` | **30** |
| 1754 | `P.LOBES` | 5 |
| 1773 | `P.MIND_EVENTS` | 8 |
| 1785 | `P.MIND_FACES` | 7 |
| 1795 | `P.MIND_SOURCES` | 8 |
| 1806 | `P.MIND_POLICY` | 5 |
| 1821 | `P.TRIG_CATS` | 10 |
| 1834 | `P.TRIGGERS` | **80** |
| 1919 | `P.ACT_CATS` | 7 |
| 1929 | `P.ACTIONS` | **61** |
| 1995 | `P.GUARDS` | 6 |
| 2005 | `P.AUTOMATIONS` | 12 |
| 2073 | `P.FAULTS` | 8 |
| 2101 | `P.WATCH` | 7 |
| 2122 | `P.ALERTS` | 9 |
| 2177 | `P.ALERT_RULES` | 12 |
| 2195 | `P.RULE_SCOPES` | 4 |
| 2211 | `P.TOUR` | 8 steps |
| 2230 | `P.SETUP_FIRST` | from · read · did · cannot |
| 2252 | `P.SETUP` | 7 groups |
| 2337 | `P.VAULT_TIERS` | 4 — L1…L4 |
| 2343 | `P.VAULT_GROUPS` | 6 |
| 2351 | `P.VAULT` | **20 obligations** |
| 2373 | `P.VAULT_PARTNERS` | 5 |
| 2381 | `P.ENTITIES` | 5 |
| 2394 | `P.ROLES` | 11 |
| 2452 | `P.TEAM` | 15 |
| 2470 | `P.INVITES` | 3 |
| 2487 | `P.TOOLS` | **27 tools** (the real `list_tool_autonomy` catalogue) |
| 2519 | `P.TOOL_MODES` | 3 — auto · confirm · off |
| 2525 | `P.TOOL_CATS` | 10 |
| 2527 | `P.CALENDARS` | 4 |
| 2534 | `P.BOOK_STRATEGY` | 5 |
| 2542 | `P.BOOKTYPES` | 6 |
| 2577 | `P.HOSTS` | 6 |
| 2586 | `P.CALSET` | 8 |
| 2597 | `P.SANDBOX` | files · runs · limits |
| 2621 | `P.SCOPES` | **3 — rest · read · act** (the scope band's three states) |
| 2627 | `P.FIELD_HOURS` | 6 |
| 2628 | `P.FIELD_PLAN` | 6 |
| 2636 | `P.FIELD_KINDS` | **10 Living Operational Field entity treatments** |

Exports as `window.PAIGE_IA` and fires `paige-ia-ready` (L2649–2650).

### 2.1 The IA, definitively — 6 slots · 32 views

```
fleet          Systems check · Directory · History                                     (3)
relationships  People · Conversations · Calendar · Segments                            (4)
campaigns      Active · Catalog · Sales · Pipeline · Social · Performance              (6)
marketplace    Storefront · Catalog · Submissions · Publishers                         (4)
analytics      Fleet · Relationships · Campaigns · Autonomy · Platform health          (5)
settings       Setup · Platform · Integrations · Mind · Automations · Alerts ·
               Capabilities · Vault · Governance · Team                                (10)
```

**Our `src/operator/ia/operatorIA.ts` matches all six slots and all 32 view names**, plus an
eleventh Settings view (`Numbers`) added by owner ruling 2026-08-23. ✅

### 2.2 The 28 summons vs. our command palette

```
PACK (28):  browse builder calset campschema campstep connect deal email enter finding
            integration listing offer owed pipehealth post query review rule sandbox
            segment sequence social stages studio sweep trust web

OURS (10):  browse connect email enter query rule sandbox sequence sweep web
```

Our ten are exactly the ten **capability verbs** — which is correct: PORT-SPEC §1.9 titles them
*"The ten palette capabilities' summoned bodies."* The other **18 are contextual summons**,
opened from a surface control rather than from ⌘K:

`builder · calset · campschema · campstep · deal · finding · integration · listing · offer ·
owed · pipehealth · post · review · segment · social · stages · studio · trust`

Of those 18, `review` has a ported surface (`MarketplaceSubmissionsSurface`) and `trust` has a
partial (`SpineHeader`). **Sixteen are unported.**

---

## 3. `mind-brain.js` — the Mind substrate, 609 lines

A `<mind-brain>` custom element (registered L608). Canvas 2D on a 33ms `setInterval` — *"animation
frames are suspended in embedded frames, so rAF cannot be relied on here."*

Public API the shell drives: `setModel(m)` · `setTheme(t)` · `setFocus(lobeId)` · `select(i)` ·
`say(lobeIndex, text, src)` · `grow(lobeIndex, text, src)` · `feature(regions, n)` ·
`fire(lobeIndex, tone)`. Internals: `mulberry(seed)` deterministic PRNG · `envelopePoint(rng)` ·
`hullRings()` · `_project` / `_proj3` · `_pick(e, commit)` · `_frame()`.

Motion-safe by construction: `prefers-reduced-motion` freezes rotation and draws a firing as a
static mark. **`mind-brain.js:384` hardcodes `const light = false`** — INSTALL-PLAN round 17
names authoring light mode as that round's work.

The shell feeds it after render rather than through props (`syncBrain()`, L4249) — *"the model
once, then a firing whenever something real happens."*

---

## 4. The fidelity contract — `CLAUDE-CODE-HANDOFF.md`, all 13 rules verbatim

The header says "Ten rules"; **thirteen are enumerated** (README: *"Three fidelity rules were
added (11, 12, 13)"*).

1. **Six rail slots. Not seven.** Ruled three times. No slot without an owner ruling.
2. **The Trust Compass clamps everything, computed once.** `min(own grant, ceiling)`. One scale.
   *"Stage 3: resolve server-side. The client display is not the enforcement."*
3. **A figure that appears twice is computed once.** Hit **7×** in design. *"Never type a count
   beside a list."* Extended in rev 4: **a sentence containing a figure is a figure.**
4. **Every grid and flex child needs explicit `min-width: 0` / `min-height: 0`.** Hit **6×**.
5. **A surface override must be the last word.** Every `off`-return re-asserts shared defaults.
   Hit **4×**.
6. **Every catalogue read needs a fallback.** One bad key **blanks the entire shell**.
7. **Representative vs connected must stay labelled.** `— not on file` and `•••-••-••••` are
   different states.
8. **Nothing pulses that is not really running.**
9. **Four type sizes. 21 · 16 · 13 · 11.** *(Corrected at source in delivery 9; the earlier
   `21/17/12.5/11` is stale — neither 17 nor 12.5 exists anywhere in v3.)* On a surface whose
   subject is figures, the figures take 21 and the surface title drops to 16. Analytics is the
   only reading surface at 30px. Three faces: Schibsted Grotesk (display *and* UI) · Gambetta ·
   JetBrains Mono (*"machine values only — never labels"*). Bricolage Grotesque and Inter are
   not in this design.
10. **Both themes are first-class.** Verify AA against `--pg-env`, not `--pg-canvas`.
11. **A state that can be derived is never chosen.** *"Do not ship a status picker beside the
    fields that determine the status."*
12. **A worked surface closes with a rail, not a clipped scroll region.** `scrollbar-gutter:
    stable`, 20px bottom mask onto 22px padding, one-line `flex: none` rail.
13. **Customization may not invent data.** An enabled fact with no substrate shows an em-dash.

---

## 5. `INSTALL-PLAN.md` — CD's own 18-round build plan

**Contract stated as: 6 slots / 32 views / 28 summons / 13 net-new catalogues.**

### Foundation (strictly sequential)
| # | Round | Gate |
|---|---|---|
| 0 | One operator door — landing constants reconciled, act-as gains a real exit | — |
| 1 | Shell geometry — 3-col grid + scope band + command-bar row, scoped `--pg-*`, self-hosted fonts, `useReducedMotion`, `IA.DEST` guarded, unknown section 404s, old spec registries **deleted** (§30) | 0 |
| 2 | The two shell-wide primitives — bottom rail + control chrome, **before** any surface uses them | 1 |
| 3 | Fleet (3 views) — proves the shell and both primitives against real data | 2 |

### Backends (parallel after 3)
| # | Round | Gate |
|---|---|---|
| 4 | Operator commerce read-model — Catalog over `platform_subscription_plans`; Sales a derived read over `platform_subscriptions` + `tenant_revenue_classification` | **R6** |
| 5 | Processor adapter boundary — five needs as a `_shared` seam; fixes the `event.account` gap in `stripe-webhook` | 4 |
| 6 | Tenant customization schema — `CAMP_SCHEMA` + `CARD_FACTS` as config-as-data behind a Paige-callable atomic jsonb merge RPC (§10) | 1 |

### Surfaces (7–13 mutually independent)
| # | Round | Gate |
|---|---|---|
| 7 | Settings (10 views) — the largest slot; re-establishes the §53 owner/staff split | R2 |
| 8 | Campaigns shell + Active · Social · Performance — routed **by name** | 2, 6 |
| 9 | Campaigns → Catalog | 4, 8 |
| 10 | Campaigns → Sales | 4, 8 |
| 11 | Campaigns → Pipeline — over `pipelines`/`pipeline_stages`/`deals` | 8 |
| 12 | Analytics (5 lenses) — a chart with no substrate draws no line | 2 |
| 13 | Marketplace (4 views) — **Build survives** (§58) | 2 |
| 14 | Relationships → People · Conversations · Calendar | R2 |
| 15 | Relationships → Segments — triple compiled server-side against an allowlist, never string-concatenated; a saved segment **stores the triple, not prose**; must carry and re-assert its scope for the service-role sender | 14, R2 |

### Tail
| # | Round | Gate |
|---|---|---|
| 16 | Capabilities + Trust Compass | 7, **R4**, #165 |
| 17 | The Mind — light mode authored | 7 |
| 18 | Detach / multi-window — only after a server-issued session token | 1, #215 |

### The seven rulings
| # | Question | CD's recommendation |
|---|---|---|
| R1 | Two consoles? | **DISSOLVED** — admin is never a URL; one console, admin is a role + scope band inside it |
| R2 | §60 collision — v3 gives the operator People/Pipeline/Conversations, `tierFeatures.ts:236-247` denies God | **New operator-scoped Features**, not the tenant bits |
| R3 | Which shipped sub-tabs have no home | Classify all 83 into view / summon / mechanism; rule only on the residue |
| R4 | Trust Compass — 5-level ceiling vs our 3-value enum | Build the real substrate (#165); until then render read-only **with the reason** |
| R5 | `PLATFORM OPERATOR` rename | **Rename the label, not the role.** Record the why-not |
| R6 | Sales: derived read or hand-kept ledger | **Derived read** — a typed ledger beside the revenue-integrity chain is a second truth |
| R7 | Operator one-time-services catalog | Ship L1-only first |

### The finding that changes the design — Sales cannot be a ledger
CD's provenance said Catalog/Sales were *"design-led; no repo substrate exists yet."* **Three
commerce layers already ship:** L1 `platform_subscription_plans` + `platform_subscriptions`
(3 plans seeded); L2 `tenant_products`/`_prices`/`_orders`/`_service_subscriptions` + a mounted
775-line `StorefrontPanel` (0 rows, complete); L3 `marketplace_items.take_rate_bps` +
`marketplace-checkout-session`. And `20260815120000_revenue_integrity_chain.sql` enforces via
CONSTRAINT TRIGGER that a tenant may only rest at `revenue_class='paid'` when three gates hold.

---

## 6. Pack self-contradictions — three RULED by the owner 2026-08-23, nine open

Rulings 1, 2 and 5 below are closed and applied to the pack files in the same commit as this
line. **Because CD regenerates the pack wholesale, all three are standing edits** in the sense
of `corrections-2026-08-23.md` rev 6: if any of them comes back on the next delivery, that is a
defect at CD's source, not a patch to re-apply here. Send the locator, do not re-edit.

1. ~~**The type ladder disagrees with itself.**~~ **RULED 2026-08-23 — ladder is
   `11 / 13 / 16 / 21`.** Owner: *"Handoff rule 9's 21/17/12.5/11 is from an earlier draft;
   12.5 and 17 exist nowhere in v3. What ships wins, and what ships is what I ruled."*
   `CLAUDE-CODE-HANDOFF.md` rule 9 corrected in place, with the superseded values quoted so
   the correction is legible rather than silent. Matches `design-system-port.md` §2 and our
   `src/index.css`.

2. ~~**`tenant-redesign-stage2-design-package.md` carries a SUPERSEDED token set.**~~ **RULED 2026-08-23 —
   DELETED.** Owner: *"a doc that's right about IA and wrong about colour is worse than a doc
   that's wrong throughout — nobody distrusts the parts that read correctly."* Its §§1–3 (the
   colour tables, the system-safe font stack, the `--pg-d1…-editorial` scale, the `--pg-s1…s10`
   space scale, the five-step elevation table and the `--pg-r0/-r1/-r2/-chamfer/-facet` edge
   set) are removed and replaced by one pointer at `design-system-port.md`. What they said, for
   the record: `--pg-ink-2` dark `#d4cfd7` vs the shell's `#d6d0c9`; `--pg-muted` dark `#aaa4ae`
   vs `#aca69d`; `--pg-gold-deep` light `#9b7848` vs `#7a5c2e`; every `--pg-line-*` alpha; and
   `--pg-e5` / `--pg-s1…s10` / `--pg-t-*` / `--pg-e-out` / `--pg-e-authority`, none of which
   exist in the shell.
   **NOT cut, and flagged rather than second-guessed:** §4 Motion still names `--pg-t-instant`,
   `--pg-t-quick`, `--pg-t-base`, `--pg-t-considered`, `--pg-t-materialize`, `--pg-t-execute`,
   `--pg-e-out` and `--pg-e-authority` — **none of which exist in the shell either.** The ruling
   named the token block, the type stacks and the radii; it did not name motion, and its
   behavioural table (rail 200ms · workspace materialize 340ms clip-path · authority appear
   280ms · focus ring 90ms never eased) is real spec that maps onto the shell's keyframes.
   Left standing, owner's call.

3. **README says the `.dc.html` is 10,022 lines.** It is 11,358.

4. **README calls the pack "rev 2"; `github.md` records corrections through "rev 6".**

5. ~~**`PORT-SPEC` promises 11 sections; 5 exist.**~~ **RULED 2026-08-23 — Contents struck,
   §§6–11 will NOT be written.** Owner: *"The pack is the source; a partial transcription that
   advertises completeness is the exact mechanism that hid the spine."* The phantom six are cut
   from its Contents and a scope line added at the top: this covers the palette and six surfaces
   only — everything else, read the pack.

   **The general rule this establishes:** *no document gets to enumerate the pack.*
   `PACK-INVENTORY-v3.md` is the index because it is generated from the files and lists
   everything, including what is unported. **Every other doc is a note on a part**, and must say
   so at the top.

6. **Two surfaces are marked PACK SILENT by the PORT-SPEC itself:** §3 Platform hours and §5
   Support inbox. For Support the spec searched `inbox`/`ticket`/`triage` across all four
   source files and found 0/0/0 product surfaces. **Both owed from CD.**

7. **`pack-provenance.md` still names the retired `Field` slot** and the stage2 icon table maps
   `Field → LayoutGrid`. `CLAUDE-CODE-HANDOFF.md` records Field became **Marketplace**.

8. **The grant-vs-ceiling scale disagrees with itself between two surface groups.** *(Found
   2026-08-24 porting Layer 3c; not previously recorded.)* Both the Marketplace and Campaigns
   compare a requested grant against `ceiling()` — a rung index 0–4, L4517 — and they map a grant
   NAME onto that scale two different ways:

   |             | Observe | Draft only | Ask first | Act and report | Autonomous |
   |---|---|---|---|---|---|
   | Marketplace | 0 | 1 | 2 | 3 | 4 | ← `RANK` index (L10057, L9437)
   | Campaigns   | 1 | 1 | 2 | 2 | 4 | ← `clampGrant` weight (L5295)

   Consequence at the default ceiling of 2: a listing needing **"Act and report"** reads **above
   the ceiling** in the Marketplace, while a campaign with the same grant reads **at** it and
   runs. "Observe" differs too (rung 0 vs weight 1), though nothing is below a ceiling of 0 in
   practice. Both are internally consistent and both wire as drawn, so this is not a §00
   incompatibility — it is the same class as 3/4/6/7 above.

   **Ported verbatim per surface, deliberately not reconciled.** `listingContract.aboveCeiling`
   keeps the RANK; `campaignContract.clampGrant` keeps the WEIGHT. Each cites the other in a
   comment so a later session cannot "fix" one into the other without meeting this entry. **Owed
   from CD:** which scale is the platform's, or whether the two genuinely mean different things.

9. **The Storefront's empty state is bound but never supplied.** *(Found 2026-08-24, same pass.)*
   The markup renders `{{ emptyLine }}` inside `<sc-if value="{{ storeEmpty }}">` at L2541–L2543.
   Grepping all 11,358 lines for `emptyLine` and `storeEmpty` returns **exactly those two markup
   references and nothing else** — neither `storeVals` (L10054) nor `storeValsUnused` (L10198)
   produces either key. A search that matches nothing is the commonest state a storefront is in,
   so the surface has no authored copy for its most frequent empty case. **Owed from CD.** No
   copy was invented for it in the port (§00); the result line counts honestly and the authored
   `storeFoot` says what does not exist.

10. **Two `mindVals` keys are computed and rendered nowhere.** *(Found 2026-08-24, porting
    `codeVals`.)* `scratchBody` (L10583, both ceiling arms authored in full) and `sandboxActs`
    (L10589, three buttons including a gold `Teach her a skill`) are built in `mindVals` and have
    **exactly one hit each across all 11,358 lines — their own assignment.** No `sc-for`, no
    `sc-if`, no interpolation consumes either. Compare `codeActs` and `codeLimits`, computed in
    the same return and both rendered at L4100/L4109.
    **Why this cost us something rather than being trivia:** Layer 5 drew `scratchBody` on the
    Code face because it reads like code and sits beside the code keys — and the pack draws a
    tokenized editor there instead. So an unrendered key became a shipped surface for one
    afternoon. The constants stay exported in `spineFaceContract.ts` (they are CD's words), and
    nothing renders them. **Owed from CD:** whether these are cut keys, or a Skills-face block
    that lost its markup. Not resolved here (§00).

11. **`componentDidUpdate` is declared TWICE on the same class, so the first one never runs.**
    *(Found 2026-08-24 by `npm run pack:keys`, which reports duplicate declarations.)* L4301 sticks
    the transcript to its newest turn when the chat signature changes (`stickChat()`); L4343 is
    `componentDidUpdate() { this.syncBrain(); }`. In JavaScript the second class member wins
    outright, so **`stickChat()` is dead code in the shipped artifact** and the standalone render
    does not auto-scroll the conversation.
    **This is a behaviour fact, not a design opinion (§00), and it changes what "port the pack"
    means here:** the pack's INTENT is explicit in its own markup comment — *"the newest turn must
    own the scroll bottom"* — and its artifact does not do it. Our `SpineConversation` already
    implements the intent (`el.scrollTop = el.scrollHeight`, with the live-turn offset case), so
    the port is correct and the reference is the thing that is wrong. Reported to CD; nothing
    changed here. **Do not "fix" our chat face to match the artifact's behaviour.**


12. **`P.TRIGGERS` is one array declared in two differently-shaped halves, and they overlap.**
    *(Found 2026-08-24 while grounding the owner's autonomy ruling.)* The first half uses lowercase
    `cat` values (`record`, `pipeline`, `convo`, `calendar`, `campaign`, `fleet`, `schedule`,
    `agent`, `external`, `manual`); the second, introduced by a comment about tags being "the
    connective tissue", uses capitalised ones (`Records`, `Pipeline`, `Conversations`, …) and grew
    well past tags. Several triggers appear in both: *Deal won* / *A deal is won*, *Deal lost* /
    *A deal is lost*, *Booking made* / *A booking is made*, *Campaign halted* / *A campaign is
    halted*. The raw row count is **80 (51 live, 29 dark)**, which is therefore an UPPER BOUND on
    distinct triggers rather than a count of them.
    Recorded, not reconciled (§00). It matters to the port because slice C of
    `docs/doctrine/autonomy-architecture.md` turns this catalogue into rows, and a duplicate
    trigger would become two rows a tenant could pick between with no way to tell them apart.

---

## 7. What the pack says about our repo — CD's own findings against our code

Transcribed, not re-verified in this pass.

- **`list_tool_autonomy` lost four tools.** Migration `20260716171236` re-declared the function
  from a body copied out of `20260711200000`, which predates the n8n additions in
  `20260711220000`. `n8n_create_workflow` · `n8n_update_workflow` · `n8n_activate_workflow` ·
  `n8n_deactivate_workflow` are gated at runtime but absent from the settings catalogue.
  *(Our task #217.)*
- **The audit log is not immutable.** Append-only **by GRANT only** — no constraint, no trigger
  — and the read policy algebra is inverted: any tenant-level admin can read every operator
  audit row while a `platform_admin` can read almost none. *(Our task #218.)*
- **§38 was being contradicted by the UI.** Setup showed a single "payout account" implying we
  process on a tenant's behalf. Corrected to three relationships.
- **`tenant_orders` cannot hold a Sales line** — one policy, `SELECT`-only; no stage, tier,
  campaign, counterparty or close-reason column.
- **Attribution fragments sit on the wrong tables.** `analytics_events` and `referral_clicks`
  carry `utm_campaign`/`utm_source`; `email_send_log` carries `message_id` + `template_name`;
  `tenant_orders` carries **no campaign reference at all**, only free-form `metadata jsonb`.
  *"Fragments are worse than absence."* Two constraints CD states: attribution must not live in
  `metadata jsonb`, and the join must name one canonical click source.
- **`FleetConsole.tsx:135`** did `window.location.assign("/admin")` with no exit anywhere in
  `src/operator/`.
- **`resolveLandingRoute.ts:208`** sends `super_admin` to `/operator/fleet/tenants` while
  **`JoinPlatform.tsx:23`** sends the same role to `/admin/platform/tenants`. *"A bug, not a
  decision."*
- **`/operator` is 13 branches / 83 sub-tabs** on current main (Settings alone carries 23) — not
  the 17/78 an earlier pass asserted.
- **The detach transport's session token is `Math.random()` from a URL param, broadcast in
  cleartext.**
- **`mind-brain.js:384` hardcodes `const light = false`.**

---

## 8. Standing rules the pack states that are not in our doctrine

- **Layout is width-driven, not breakpoint-driven** (`RENDERING.md`). Surfaces read `canvasW`:
  Sales figures strip = 5 columns at ≥900px, 3 at ≥620px, 2 below; the summon panel's geometry
  set collapses to one cycling control under 520px; Catalog's two-column detail becomes one
  under 700px.
- **No page scrolls.** *"If a screenshot shows a document scrollbar, that is a defect — every
  surface fits its viewport and scrolls only inside its own regions."*
- **Theme names are Obsidian (dark) and Mineral (light).**
- **The control chrome, one spec shell-wide** (`campaigns-catalog-sales-spec.md` §5): resting
  `1px solid var(--pg-line)` + `--pg-r-chip` + `--pg-raised` + `--pg-lift-1` + `--pg-muted`;
  hover `--pg-gold-deep` + `--pg-line-strong` + `--pg-lift-2, inset 0 -2px 0 var(--pg-gold-deep)`
  + `translateY(-1px)`; press `--pg-ink` + `--pg-inset` + `translateY(0)`. Sizes 30px in panel
  headers, 34px in the top bar. Icons 14–15px on a 16-unit grid at `stroke-width: 1.25`, accents
  at `1.45`. Destructive hovers to `--pg-negative`. Discrete controls sit 6px apart — *"a bonded
  segmented group reads as one button and was rejected."*
- **Vibe Studio is the one violet-filled control on the platform**, and hides whenever a summon
  or the authority gate is open.
- **The bottom rail, one spec shell-wide:** scroll region `flex:1; min-height:0; overflow:auto;
  scrollbar-gutter:stable; padding: 2px 12px 22px 0` + `mask-image: linear-gradient(180deg,#000
  0,#000 calc(100% - 20px),transparent 100%)`; rail `flex:none; min-height:30px; border-top:1px
  solid var(--pg-line)`, one line only.
- **Keyboard map** (`tenant-redesign-stage2-design-package.md` §7): `⌘K` command bar · `⌘⇧V` hold-to-talk ·
  `⌘\` spine · `⌘⌥\` rail · `⌘⇧O` pop out · `⌘⇧T` scope switcher · `⌘⇧X` exit scope · `⌘.`
  interrupt · `⌘⇧D` detach · `Esc` topmost slide-over · `⌘⇧L` Obsidian/Mineral · `1–5` rail
  destination · `?` shortcut sheet.
- **`P.SCOPES` — three band states:** rest (`Platform scope · No tenant · operator surface ·
  tenant_id IS NULL`) · read (aggregate read · no write) · act (`Acting as · AUTHORIZED TENANT ·
  0f3a · paige_audit_log · session open`). `cycleScope`/`exitScope` are `setState`; `pushScope`
  broadcasts. **Scope is broadcast, not routed.**
- **Absence copy is authored** (`absence-copy.md`) for Relationships (`Drawn, not wired`) and
  Campaigns (`Substrate exists · one seam missing`), verbatim, to be lifted not drafted.
- **`PLATFORM OPERATOR`, not `SUPER ADMIN`** — in the wordmark and as a tier name. *"The string
  'Super Admin' no longer appears in the shell."*

---

## 9. Standing edits that must be re-applied on every CD re-delivery

`INSTALL-PLAN.md` §0 and `corrections-2026-08-23.md` rev 6 both record these. Rev 6 says they
are now fixed at CD's source, so they should stop recurring — **verify on the next delivery
rather than assuming**:

1. The §50 pop-culture mark in `tenant-redesign-stage2-design-package.md` §9a (now *"the fictional operator-AI
   archetype"*).
2. Real-format identifiers in `paige-ia.js` — SSN `412-88-0396` → `000-00-0000`, both EINs →
   `00-0000000`, DOB `04/18/1979` → `00/00/0000`. Six values. The rule CD adopted: *"The class
   is **format-valid and portable**, not 'government identifiers.'"*

**The standing-edit rule, verbatim:** *"Any correction CC has to re-apply after a delivery is a
defect in the pack, not a patch in the repo. Two rounds of re-application is the signal. Send it
as a locator and it gets fixed at the source it regenerates from."*

---

## 10. Owed from CD — consolidated

**All seven are closed as of 2026-08-23. Nothing waits on the owner.**

| # | Owed | Outcome |
|---|---|---|
| 1 | PORT-SPEC §§6–11 | **RULED: will not be written.** Contents struck, scope line added |
| 2 | Platform hours | **RULED: does not exist.** Withdrawn — never drawn |
| 3 | Support inbox | **RULED: does not exist.** Withdrawn — no ticketing model in this design |
| 4 | Which type ladder binds | **RULED: 11 / 13 / 16 / 21.** Handoff rule 9 corrected |
| 5 | stage2's token tables | **RULED: deleted**, and extended to §4's motion token names |
| 6 | Fleet "Needs you today" absence copy | **WITHDRAWN BY CC — the gap did not exist.** Fleet is the one slot live end to end; its "Needs you today" is `P.SUMMONS.owed`, which ships four authored rows plus its own deck and foot. There is no absence to write |
| 7 | A sign-out glyph | **RULED: draw it.** The one case where the pack's silence is an omission rather than an answer — see below |

### The two that were never gaps, and why they read as gaps

**Platform hours and Support inbox both came off the OLD console's branch list** — a console
ruled dead 2026-08-22. Owner: *"They're features of a console I ruled dead, and the mapping
exercise should have retired them rather than carrying them forward as owed."*

That is a reusable test, and it is the inverse of the one PACK-FIRST already teaches. PACK-FIRST
stops you calling something missing when it is in the pack. This stops the opposite error:
**a branch that exists only in a replaced design is not a hole in the new one.** Before recording
anything as owed, ask which design it is a feature of. If the answer is the dead one, retire it.

### Ruling on #7 — sign-out is a place in the rail foot

Owner, verbatim, 2026-08-23:

> *"I'm ruling it a place in the rail foot, so draw it. You're right that the pack has no glyph
> and that exitScope is a different act. But an operator with no way out of the console is a real
> hole, and this is the one case where the pack's silence is an omission rather than an answer:
> the shell was drawn as an always-open surface and never modelled a session ending."*
>
> *"So: rail foot, third control below Collapse rail, same treatment as its siblings —
> `--pg-muted` label, no gold, no accent. Glyph is a door with an arrow leaving it, drawn to
> match the rail's existing stroke weight. Not a summon, not a confirm dialog. It signs out."*

This is the **only** net-new design element in the console that did not come from the pack, and
it is owner-drawn, not CC-drawn. It is recorded here so a later session reading the pack and
finding no sign-out control knows it is looking at an omission the owner closed — not at a
control someone invented.

Open **owner** rulings the pack lists (CD's, not ours to answer): Stripe Connect vs
first-party-only marketplace · sub-account credit wallet parentage · whether an eleventh
capability was intended · Sales attribution recording · whether the sales target becomes an
object · number resale vs bring-your-own · what a deal points at now Pipeline sits under
Campaigns · whether operator scope needs the five cut Conversations sub-tabs.

---

## 11. Honest limits of this pass

- **This is a transcription and a measurement, not a port.** Nothing here changes a pixel.
- **The 25% figure measures authored strings, not surfaces.** A surface can be structurally
  present with different copy, or copy-complete with no wiring. It is a floor on the gap, not a
  precise completion number.
- **`renderVals`'s 741 lines were read for its dispatch table**, not line-by-line for every
  style object it spreads. The dispatch table is complete; the inline geometry inside it is
  indexed by method, not transcribed.
- **`support.js` was characterised, not read line-by-line** — 1,911 lines of generated runtime
  with zero design content, confirmed by its own header and by PORT-SPEC §5's independent search.
- **No surface of our own app has been rendered in this pass.** §32.c live-drive stays owed.

---

*Recorded 2026-08-23 under root `CLAUDE.md` §00 and `docs/design-references/PACK-FIRST.md`.*
