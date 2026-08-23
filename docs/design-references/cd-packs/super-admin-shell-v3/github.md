repo: mrmogulmaker-bot/Paige-Agent-AI
branch: main

## Last sync
date: 2026-08-23T05:20:00Z
commit: a3bdb7de
pr: #570 (squash-merged to main)
landed: design pack rev 6 · 18-round install plan · screenshot pipeline · manifest-aware pack verifier · one brain entry. Docs, design reference and dev tooling only — no product code, no schema, no edge functions.

### Corrections applied at source (rev 3 → rev 6)
- Rev 3: five honesty labels corrected — Marketplace REP→PART, alert delivery ships, operator communications store credited, Money Spine “deferred”→`$0` (a reading, not an absence), audit log `immutable·Live`→`unenforced·Attention`.
- Rev 4: `P.SWEEP.run` typed twins deleted (timing only); the systems-check brief now composes its prose from findings. **A sentence containing a figure is a figure.**
- Rev 5: the intermittent `sx` TypeError found and guarded — `mind-brain.js` pulse renderer read `proj[path[i0+1]]` on the last hop; identifiers scrubbed.
- Rev 6: both standing edits fixed at source so they stop recurring — the §9a third-party mark rewritten as a described pattern, and the DOB scrubbed on CC's ruling that the class is **format-valid and portable**, not “government identifiers”.
- Standing rule adopted: **any correction CC re-applies after a delivery is a defect in the pack, not a patch in the repo.** Two rounds of re-application is the signal; send a locator and it is fixed at source.

### Owed at merge (recorded, not discharged)
- The adversarial read of #570 was a self-review, not a §39 peer gate.
- §32.c live-drive of our own surfaces is owed at every install round — no surface of the app itself has been rendered on that branch. Task #216.

tree: 1c557a873e8b

### Updated in this project
- **Campaigns is six views** — Active · Catalog · Sales · Pipeline · Social · Performance. Campaigns recorded activity but never money, because nothing on the platform recorded an offering. `P.CATALOG` supplies the object (kind, price, period, unit, tiers, channels, fulfilment), `P.SALES` supplies the lines, and a campaign's optional `offer` binding is the join that lets Active show `Sells` and `Booked`.
- **Sales is entirely derived** — booked $4,790, refunded −$490, net $4,300, in flight $6,800, 36% of a $12,000 target, all summed from six lines. Tables by offering, by campaign, deals in flight read off `DEST.campaigns.board.deals`, and the tenant's close reasons.
- **Processor seam is agnostic per owner ruling** — `P.PROCESSOR` declares five needs a merchant provider must satisfy; Stripe is the first adapter (wired at operator scope), any other provider is pluggable. `Split a payment` is the only need marked Stripe Connect, because no tenant sale is ever split.
- **A tenant schema** (`P.CAMP_SCHEMA`, `P.CARD_FACTS`) — definition line, the word for a step, card density, which six facts a card carries, renames for all four campaign kinds and five states, and the tenant's own categories, sales stages and close reasons. Read on every render; inline `Adjust` doors on Active, Catalog and the Sales rail open one editor. A fact with no substrate still shows an em-dash.
- **Relationships → Segments builds segments** — `P.SEG_FIELDS` (12 fields, 8 live) and `P.SEG_PHRASES` let a sentence become clauses with negation cues flipping polarity; a segment with a dead clause saves unsized rather than estimated, matching the `s4` fixture.
- **New offering** creates one for real, with the state derived rather than picked: no price is a draft, priced with no channel is quiet, priced with a channel is selling.
- Two patterns now shell-wide: the **bottom rail** (masked scroll tail into a one-line `flex:none` rail carrying a legend and a derived tally) and the **control chrome** (raised fill, `--pg-lift-1` rim, champagne hover underline with a 1px rise, `--pg-inset` press). Vibe Studio is the one violet-filled control and now stands down while a summon is open — the view-tab row's deliberate `z-index: 12` was floating it through panels.
- `SUPER ADMIN` → **`PLATFORM OPERATOR`** in the wordmark and as a tier name in the Studio lock, the Mind's write attribution and the Team defaults.
- Settings → **Capabilities rebuilt from the shipped autonomy substrate** — `tenant_tool_autonomy` + `resolve_tool_autonomy` + `list_tool_autonomy` (migrations 20260711200000, 20260711220000, 20260716171236). 27 tools in 10 categories on the real three modes (auto | confirm | off), not an invented scale; the five-level Trust Compass now reads as a ceiling over those three.
- Surfaced the schema guardrails as UI: `send_via_approval ⇒ requires_approval` and `auto ⇒ executor IN (record_only, workflow)` make **auto-send unrepresentable**, so autopilot is struck through on the three tools that reach a person.
- Settings gained **Vault** — the Business Vault (owner-locked Pillar 2), built from `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §2 and the §65 back-menu spec that names Platform Vault. 20 obligations in 6 groups, each carrying who it is owed to, its clock, its evidence, and an L1–L4 tier deciding whether she may handle it or a professional must.
- Settings → Automations rebuilt as a builder rather than a ledger: 42 triggers across 10 categories, 29 actions across 7, 6 guards, 12 automations shown as trigger → action chains on category shelves, with a four-figure decision strip (running / held by the ceiling / blocked / never run).
- Grounded in `supabase/migrations/20260701144912_*.sql`: `stage_automation_rules`, `stage_automation_events`, `trg_deals_stage_automation`, and pg_net dispatch to `functions/v1/dispatch-stage-automation` against `tenants.automation_webhook_url_encrypted`. That is the one automation real end to end — stage change → webhook.
- **Integrations rebuilt** as 42 named vendors across 8 shelves with per-vendor panels (Connection · Scopes/Tools/Workflows · Numbers · A2P · Activity). State grounded in `supabase/functions`: Resend, Gmail, Twilio SMS, Anthropic and `paige-mcp` read live; Twilio Voice, Apple CalDAV, D&B and n8n read half-wired; the rest are named with nothing behind them.
- Twilio carries **Numbers** and **A2P** as their own layers, with the owner's split recorded: buying a number is account setup (Settings), calling and texting are work (Conversations).
- Tier palette corrected — the invented tokens were replaced with CD's shipped `TIER_INK` hexes read from `FleetOrbitScene.tsx` (Agency #7C6CE0 · Solo #3F7F5C · Sub-account #2F6B8F · Enterprise #B5822A). Tiers never rendered on that field show an outline instead of an invented colour.
- Settings → Platform gained the **account matrix**: the canonical six tiers with one shared palette (also driving Fleet's composition bar), each tier's identity and resolver path, plus a 6×6 capability grid of the owner-locked feature cells. Grounded in `docs/doctrine/tier-matrix.md` — live population 1 agency + 3 standalone + 4 sub-accounts matches the Fleet tree exactly.
- Campaigns gained **Social** (a publishing spine: channel lanes, week axis, ad flights as spans) and a **Vibe Studio door** grounded in the shipped sub-app at `/admin/studio/*` — `StudioLayout` + persistent rail, `StudioHome`, `StudioNew`, `StudioLibrary`, `VibeStudio` at `:sessionId`. The door hands off rather than hosting the Studio in a panel, since the Studio is immersive by design.
- Sequences folded into Active: a campaign's motion is its step rail, so a separate sequence tab drew the same graphic with fewer steps. A reusable motion is a Marketplace Template.
- Calendar moved from the retired Field slot into Relationships, beside Conversations.
- Stage 1 design package: reconciled `--pg-*` token set (Obsidian + Mineral) from `src/prototype/tenant-redesign.css` and the owner's Command Mark board, with contrast computed rather than asserted.
- Stage 3 client-side build: six-slot rail, ⌘K capability palette, pinned execution strip with ⌘. interrupt, PAIGE-surfaced pins, six workspace geometries incl. BroadcastChannel detach.
- Trust Compass as a ceiling: effective grant is `min(capability, ceiling)`; every count on screen derives from that tally.
- Systems check rebuilt to the real registry — ten checks, seven domains, four statuses; skips and errors reported as their own axis, never as passes.
- Analytics rebuilt as charts per owner ruling: four per lens, ledger only on Platform health, no line drawn on an unread series.
- Relationships gained a Conversations console (People · Conversations · Segments) built from the shipped console in `src/agency/conversations.tsx` + `src/agency/fixtures.ts`: channel filters, thread list, thread, and a person rail that is the same record People lists.
- Follow-ups demoted from a subtab to an automation; Settings gained an Automations view holding eight automations, each running under an existing capability grant.

### Corrected from CC's grounding pass (2026-08-23)
- **Marketplace REP → PART.** Seven first-party authoring RPCs ship on prod over six tables, with an operator-gated catalog RPC carrying per-item revenue rollups and a paid-install money leg. Stripe Connect blocks payout, not authoring — so `marketplace/build` stays.
- **Alert delivery ships** (`alerting-deliver` + `20260927000000_alerting_deliver.sql`, five-minute cron, A4/A5a behind it). Finding `f5` moved fail → pass and the Fleet counts followed it (5 passing, 0 failing) because they derive. What is open is acknowledgement, not delivery.
- **Operator communications store credited** — `20260812000000`, `20260816190000`, `20260816191000` plus `paige-operator-sms-inbound` / `paige-operator-sms-send`. SMS reads and sends at operator scope; voice does not. The console's layout came from a `@ts-nocheck` fixture file, which is why the substrate went unnamed.
- **"Money Spine deferred" → `$0`.** L1 ships; `operator_dashboard_metrics()` reads MRR, ARR, dunning and ARPA. The answer is zero because no tenant pays yet — a reading, not an absence. An em-dash meant "cannot read"; using it for "reads zero" was §13 backwards.
- **Audit log corrected the other way** — the pack said `immutable · Live`; it is append-only by GRANT only, no constraint or trigger, and the read policy is inverted (tenant admins see operator rows, `platform_admin` mostly cannot). Named on the row as `unenforced · Attention`. CC task #218.

## Screen map
| Screen | Built from |
|---|---|
| PAIGE Super Admin Shell v3.dc.html | `src/prototype/TenantRedesign.tsx`, `src/prototype/tenant-redesign.css`, `docs/doctrine/tier-matrix.md` |
| — Command Mark | `uploads/paige-03-the-command-mark.png`, `src/components/brand/PaigeSymbol.tsx`, `paige-symbol.css` |
| — Fleet · Systems check | operator systems-check registry (Cowork spec paste) |
| — Campaigns · Pipeline | `PAIGE Pipeline.dc.html` (spec artifact; retains multi-pipeline, not yet folded in) |
| — Analytics | `docs/doctrine/tier-matrix.md` surface ledger |
| — Settings · Automations | `supabase/migrations/20260701144912_324f9be7-bac9-4eee-b1cb-724cb74d451d.sql` (rules, events, deal trigger, pg_net dispatch), `supabase/functions/dispatch-stage-automation` |
| — Settings · Integrations | `supabase/functions/CLAUDE.md` (Twilio operator config, A2P messaging service), `_shared/twilio.ts`, `_shared/channel-adapters.ts` (Resend vs Gmail dispatch), `_shared/claude.ts` (Anthropic), `_shared/calendarCrypto.ts` (Google OAuth + CalDAV), `_shared/businessVerifyAdapters/dnb.ts`, `_shared/actorTier.ts` (n8n action kinds) |
| — Settings · Platform | `docs/doctrine/tier-matrix.md` §§56/60/61 (canonical six, standing default, owner-locked cells), `src/lib/tier/tierFeatures.ts` (TIER_FEATURE_BASELINE) |
| — Campaigns · Vibe Studio door | `docs/architecture/CANONICAL-SYSTEM-ARCHITECTURE-2026-08-08.md` (Studio route map), `docs/doctrine/tier-matrix.md` §61 (studio tier lock), `docs/DONE.md` #408 (Growth hub absorbing Campaigns + Studio) |
| — Relationships · Conversations | `src/agency/conversations.tsx`, `src/agency/fixtures.ts` (CHANNELS, THREADS, CONV_CHANNEL_PERF), `src/components/clients/ConversationsSubTabs.tsx` |
| — Campaigns · Catalog + Sales | **Corrected 2026-08-23:** not design-led. CC found real substrate — `tenant_products`, `tenant_prices`, `tenant_orders`, plus the platform subscription tables. Contract shapes in `paige-ia.js` (`CATALOG`, `OFFER_KINDS`, `OFFER_STATES`, `SALES`, `SALES_STAGES`, `CLOSE_REASONS`, `SALES_TARGET`, `PROCESSOR`) are the surface model; the tables are the record |
| — Campaigns · Adjust (tenant schema) | design-led; `CAMP_SCHEMA` + `CARD_FACTS` in `paige-ia.js` — per-tenant JSON server-side |
| — Relationships · Segments builder | `SEG_FIELDS` + `SEG_PHRASES` in `paige-ia.js`; predicates in the shell, since a predicate does not survive becoming SQL |
| docs/handoff/campaigns-catalog-sales-spec.md | this turn's surfaces, written for CC |
| docs/handoff/tenant-redesign-stage2-design-package.md | the above, kept in sync each build turn |
| docs/brand/paige-brand-identity.md | owner-supplied board; **held** for reconciliation with Cowork's doctrine layer (§18 one home) |

## Notes
- No write access from this project: the `stage3-super-admin-redesign` branch has not been cut and nothing is committed. Files are ready to land.
- `docs/brand/paige-brand-identity.md` and `docs/cowork-notes/paige-tenant-experience-synthesis.md` do not exist on `main`.
- `commit:` omitted deliberately — `1db535564fa5` is a tree hash from `github_get_tree`, not a commit sha.

## Rulings (locked 2026-08-22)

- Six rail slots, intended. Fleet · Relationships · Campaigns · Field · Analytics · Settings.
- Ten capabilities is canonical; no eleventh verb.
- A deal points at the relationship, carrying `tenant_id` for direct RLS.
- Facial recognition is out of scope for Stage 3 — the asset store must not be built around
  faceprints. Logo-file or monogram only.

## Read on main 2026-08-23T23:02Z (no write)
Read `mrmogulmaker-bot/Paige-Agent-AI@main`, tree `534e2860`, to audit what shipped against
the pack. No files copied in; findings written to `docs/handoff/main-audit-2026-08-23.md`.

**Root cause found:** `viewSources.ts` maps the six-slot IA onto the retired console's 78 old
addresses, and `SlotSurfaceBody.tsx` renders those through `OperatorPanel` + `panelSpecs` —
so the shell is correct and **the content inside it is the dead console's panels.** ~370 KB of
pack-ported surface reachable from nothing (tests, or `legacy/OperatorLegacyApp.tsx` only).
CC's correction: 232 KB of that cites the pre-v3 pack and must be **stripped, not mounted**.
General rule adopted: **check which pack a file cites before mounting it.**

Delivered in response: `ROUTE-MAP.md` (generated from the pack — 46 builders, 24 views,
8 summons, 14 chrome), `BUILD-ORDER.md` (Layers 0–6 with a 7-rule standing contract, a
deviation table and an escalation format), and a standalone self-contained render of the pack
so Playwright can drive the reference offline.

### Owner ruling — Paige writes code (drawn in v3 this turn)
All four repo kinds · Trust Compass per repo · Studio stays local · watched in all three
places · provider-agnostic. `P.GIT` mirrors `P.PROCESSOR`: five needs, GitHub the first
adapter. The fifth need is the design — **merge is never hers at any ceiling**, the same
shape as auto-send being unrepresentable in the schema. `P.REPOS` gives four repos descending
ceilings (Draft only on the platform repo → Act and report on hers). New builder
`codeworkVals` + summon `codework`. Integrations gained a **Code and repositories** shelf;
**integrations and connections are the same thing** — no Connections subtab.

## Owner ruling 2026-08-23 (restated, strengthened) — direction of accommodation

**CC is designing the backend to the frontend design, not the other way around.** Nothing
that was designed changes to accommodate what ships. Every accommodation is made on the
implementation side. Not open for debate, and not subject to being re-negotiated one
surface at a time.

The practical test, applied before accepting any correction from CC:

- A correction about **what holds the record** — which table, which column, which join — is
  legitimate and welcome. It is CC's domain and invisible to the surface.
- A correction that would **change what the surface looks like, where a capability lives,
  or how something reads** is not a correction. It is a request to redesign, and the answer
  is no. If a table cannot serve the design, **the table changes.**

Audit of this session against that test: the substrate corrections accepted — tiers as
`tenant_prices` rows rather than a nested array, Sales as a derived read over
`tenant_orders` rather than its own store — changed **nothing visible**. The tier stack
renders a collection either way; every Sales figure still derives from lines and reads
exactly as drawn. Both were corrections to the record beneath the surface, which is the
permitted direction. No geometry, copy, placement or treatment was conceded, and none will
be.

## Owner ruling 2026-08-23 — R1 dissolved

**Admin is never a URL. Admin is a role only.** There are not two live consoles, so
there is nothing to choose between: there is one operator console, and `godMode` /
admin is a **role and scope band inside it**, never a separate route. The `/admin`
survey is moot; R1 no longer gates the 18 rounds.

**The design is the source of truth, and function is wired behind it.** Where a
capability landed in the pack is where it works. The Trust Compass is the worked
example: its function is unchanged, but its design and its placement are the
design's to own, so the existing implementation is re-imagined behind the surface
rather than the surface being reshaped to fit the implementation. This is not open
for debate — it restates the 2026-08-18 ruling (§65 R4 slice 1b) at the level of
individual functions rather than whole surfaces.

Consequence for CC: no round begins by asking whether the design can accommodate
an existing shape. It begins by asking what wiring the designed shape requires.

### R3's figure is stale — re-derive it, do not carry it
CC corrected its own count: `/operator` is **13 branches / 83 sub-tabs** on current
main (Settings alone carries 23), not the 17 / 78 the plan was written against. The
§58 gap is therefore larger than the pack's R3 row states. `/admin` godMode is 4 hubs
/ 20 tabs, 7 marked Soon — now context for what the one console contains, not
evidence for a choice.

**What that changes for the design, and what it does not.** The six slots and 32
views hold: the count of shipped sub-tabs is a measure of what must find a home, not
an argument for more slots. A sub-tab with no home under the new IA is one of three
things — a view inside a slot, a summoned surface, or a mechanism that was never a
place. R3 should classify all 83 into those three, and the residue after that is the
only real gap. Sub-tab count is not slot pressure.

## The Round 0 / Round 1 boundary (design ruling, 2026-08-23)

### Act-as is a scope change, not a navigation
`FleetConsole.tsx:135` does `window.location.assign("/admin")` with no exit anywhere
in `src/operator/`. The missing exit is a symptom, not the defect: **admin is no longer
a URL, so act-as is not a route at all.** It is the value of `active_tenant_id`, and the
band above the shell reports it. Same class as the landing divergence — a mis-modelled
thing, not a missing one.

The pack already draws it. `P.SCOPES` carries three states:

| Scope | Band reads |
|---|---|
| rest | `Platform scope · No tenant · operator surface · tenant_id IS NULL` |
| read | aggregate read · no write |
| act | `Acting as · AUTHORIZED TENANT · 0f3a · paige_audit_log · session open` |

`cycleScope` and `exitScope` are `setState` mutations; neither navigates. `pushScope`
broadcasts, so scope changes in every window — which is why detach works: **scope is
broadcast, not routed.** `exitScope` announces `active_tenant_id returned to NULL`, and
scope 0 is `tenant_id IS NULL`. The band is the exit.

### The boundary, and why it is drawn here
- **Round 0** — remove the one-way door. Act-as stops being `window.location.assign`
  and becomes a scope mutation with no route change. A model correction: no pixel,
  fully testable, which keeps Round 0 what it has been.
- **Round 1** — the band lands with the shell, and the exit affordance lands with the
  band, drawn from the pack.

Building an exit control in Round 0 would mean **inventing** one that Round 1 then
discards — the §30 layering failure in miniature, and the same call CC already made
correctly when it moved the scope band out of Round 0. **Draw it once, from the pack.**

General form: when a round needs a surface that a later round draws, the round does the
model correction and waits for the surface. It does not build a fragment of the later
round's geometry to hang something on.

### A comment is an assertion (2026-08-23)
Round 0's redundant `window.location.assign` survived four weeks because the comment
defending it was stale: it said every per-instance `useTenantContext` had to re-read from
scratch, but `useTenantContext` became a real provider on 2026-07-28. **The reload
outlived its reason because a confident comment kept asserting it and nobody re-checked
the claim.**

Third instance of one failure class, now stated as a rule: *derive it or verify it, never
assert it* — and **a comment is an assertion.** The first two were the audit log reading
`immutable · Live` when append-only was a GRANT, and `pack-shoot` captioning frames with
a theme it never read back.

A comment that justifies a mechanism should name what it depends on, so the day the
dependency changes the comment is falsifiable rather than merely old.

### The interim act-as toast, and what retires it
Removing the navigate made act-as silent — `stashSwitchNotice` writes to sessionStorage
and is only read after a reload. CC added a transient success toast, marked interim in
source with an instruction not to grow it into a bespoke exit. Correct handling.

Its retirement condition, precisely, so Round 1 does not keep both: the toast is replaced
by **the band's own tone change to `act` plus its `Acting as` line**, and by the shell's
existing `aria-live` announcement region — which is what `exitScope` and `cycleScope`
already write to (`Scope changed in every window`). The successor is not another toast.
When the band lands, the toast goes; nothing about it should survive as a component.

### Render harness: build it (design ruling, 2026-08-23)
The operator console is auth-gated, this session holds no credentials, and Vite pins
`host: "::"` in a sandbox with no IPv6. No amount of building Round 1 changes that, and
CC surfacing the constraint before burning the round is the right order.

**Build the harness.** All five diff criteria are properties of the chrome, not of data:
slot order reads from the IA, the grid is computed style, `min-width: 0` is DOM-walkable,
the scrollbar assertion already exists in pack-shoot, and AA contrast computes from
resolved tokens. A harness makes every remaining round verifiable here rather than only at
the end — the difference between catching a geometry defect in Round 1 and finding it in
Round 12.

Three conditions, each from a rule this collaboration already earned:

1. **Mock the provider, never the contract.** Auth and data are mocked; `paige-ia.js` is
   read as shipped. A harness that fixtures the IA cannot catch a slot-count regression —
   it would assert the geometry it was handed.
2. **Negative-control the harness itself.** Plant a five-slot rail, a child missing
   `min-width: 0`, a document scrollbar, and a sub-AA pair. Each must turn it red. An
   unfalsified harness is a surface asserting something it has not verified — the class
   already hit three times (audit log, pack-shoot themes, the stale comment).
3. **Label the frame, not the filename.** Burn “harness render · not live” into the image
   itself. A filename is metadata and metadata is lost the moment the frame is pasted into
   a conversation — which is precisely how pack-shoot's mislabelled themes travelled.

§32.c stays owed. The harness proves geometry; it cannot prove the authenticated thing
renders, and it must never be allowed to read as though it had.

### The nine orphans are a palette problem, not a regression (2026-08-23)
CC declared an interim cost: between Round 1 and R3, nine old branches stay reachable by
URL but absent from the six-slot rail. Declaring it was right. Accepting it is not
necessary — **the pack already draws the answer.**

The command palette (⌘K) is the shell's designed route to anything without a rail slot:
*“A capability opens its own surface and retires when you close it. None holds a place in
the rail.”* Register the nine there and the interim stops being a discoverability
regression and becomes the intended behaviour: **what has no slot is found by search, not
by browsing.** No new UI — the palette exists, grouped, with per-row notes for stating
that a destination is pre-R3.

R3's triage then decides, per branch, whether each becomes a view in a slot, a summoned
surface, or a mechanism that was never a place. Several will legitimately end as palette
entries permanently, which is the pack's model rather than a compromise.

**The two unbuilt slots** — campaigns and relationships have no destination yet. Use the
pack's own absence treatment (`hasAbsence` / `absenceTitle` / `absenceBody`), not an
invented empty state. Absence is already designed, and §13 governs its copy: what is
missing, and why.

### A screenshot is not a test (2026-08-23)
Four of the harness's five defect fixtures render **byte-identical** frames: a missing
`min-width: 0` with no long string to blow out, a sub-AA colour on small text, and content
below the fold all look correct at viewport scale. The assertions are the evidence; the
frame is only the record. A clean-looking frame proves nothing about the checks — which is
why the harness burns its label in after measuring, and refuses to write a frame whose
label is not verifiably on screen.

Corollary recorded with it: **a tool's output path must not depend on where it was invoked
from**, and a gitignore matching one spelling of a path protects a coincidence, not an
artifact.

### Catalog and Sales have substrate — a fifth under-statement (2026-08-23)
The screen map said *“design-led; no repo substrate exists yet.”* CC found
`tenant_products`, `tenant_prices`, `tenant_orders` and the platform subscription tables.
Corrected. **Fifth instance of the design under-stating shipped work** — the failure class
that invites rebuilding what exists, and one only CC can see.

Two consequences for the design, both in CC's favour:

1. **Tiers are rows, not a nested array.** `P.CATALOG[].tiers` is drawn as
   `[name, price, period, what][]` inside an offering. Against `tenant_prices`, a tier is
   a price row pointing at a product. The relational shape is the better one and the
   surface does not change — the tier stack renders a collection either way. Build from
   the tables; the array was a fixture convenience, never a model claim.
2. **Sales is a derived read, not a second ledger.** CC is right, and it sharpens the rule
   already on that surface: every figure is a sum over the lines, and now **the lines
   themselves are `tenant_orders`**, not a parallel `P.SALES` record. A second ledger
   beside the revenue-integrity chain would be rule 3 at table scale — a figure that
   appears twice, computed once. `P.SALES` is the fixture that proves the arithmetic; it
   is not the store.

So Campaigns is a wiring round, not a build round — which is what the absence copy now
says. The one thing the tables cannot supply is attribution: `camp` on a line is recorded
by hand in the fixture and needs send-to-conversion history, the same missing join that
dims two Analytics charts.

### Attribution: fragments on the wrong tables (2026-08-23)
Verified against `information_schema`, not summarised. `analytics_events` and
`referral_clicks` both carry `utm_campaign` / `utm_source`; `email_send_log` carries
`message_id` + `template_name`; `tenant_orders` carries a full order and **no campaign
reference at all** — only a free-form `metadata jsonb`. No join runs send → click → order.

**Fragments are worse than absence.** A wiring round finds `utm_campaign` on
`analytics_events`, assumes the seam exists, and only discovers at the join that an order
cannot name a campaign. Now in the Campaigns absence copy, which is what absence copy is
for.

Two design constraints this settles:

1. **Attribution must not live in `metadata jsonb`.** It is the obvious shortcut and it
   creates an untyped de-facto schema: a jsonb key cannot be constrained, cannot be
   foreign-keyed, and a figure derived from one cannot be trusted the way the
   revenue-integrity chain is trusted. Campaign attribution needs a real reference on the
   order. This is rule 3's sibling — a figure is only as derivable as the column under it.
2. **Two candidate click sources.** `analytics_events` and `referral_clicks` both carry
   utm. The join must name one as canonical or reconcile them explicitly; picking
   whichever is convenient at wiring time is how two revenue numbers get born.

**Open ruling now specified rather than open:** the Sales attribution question is no longer
“needs research” — it needs a campaign reference on `tenant_orders` and one canonical click
source. That is a schema ruling with a known shape.

### WITHDRAWN — superseded by owner ruling (2026-08-23)
**There is no legacy.** The current design is the legacy: palette, direction, functionality.
The old console's *interface* is dead — not preserved, not addressable, not a migration
target. What survives is **features, not surfaces**: every shipped capability is placed in
the six-slot IA, and where its destination is unwired the absence copy names it. No agent
debates UI; the pack is the only UI authority. CC abides by its own URL taxonomy and
surfaces every feature. The ruling below is kept only as the record of what it replaced.

### Legacy stays addressable — do not go dark (design ruling, 2026-08-23)
Round 1 takes `/operator/*`, and `fleet` / `marketplace` are both slot ids and legacy
branch ids, so the two consoles cannot share the prefix. **Keep legacy reachable. Nothing
goes dark for a round.**

This is the nine-orphans ruling again, at console scale, and the answer is the same
mechanism: **what has no slot is reachable but not browsable.** Move the legacy console to
its own prefix — `/operator/legacy/*` — which dissolves the id collision entirely, since
the ambiguity only exists at a shared prefix. Register its entry points (Fleet Console,
Systems Check, Trust Compass, Knowledge, the panel-spec tabs) in the command palette as
pre-R3 destinations. §65's migration rule is satisfied and no operator loses a working
surface mid-migration.

Going dark would be the one regression this project cannot afford: a working console
withdrawn to make a migration tidier. The migration accommodates the operator, not the
reverse.

### Round 1 verify findings — design rulings

**The type ladder is three faces, and that is correct.** Bricolage Grotesque display,
Inter body, JetBrains Mono for paths and figures. The builder's claim of two faces is the
error; the measured three is the spec. The reject-list bar was *four sizes* and *no fifth
face* — so the only real hit is the fifth size. Measured `[10, 11, 13, 16, 21]`: **drop the
10.** It is below the readable floor regardless, and the ladder is 11 / 13 / 16 / 21.

**The scope band must never assert.** Stating `tenant_id IS NULL` unconditionally, in the
one strip whose entire job is to say whose data is being touched, while act-as is shipped
and DB-persisted, is the assertion-mistaken-for-verification pattern landing in the worst
possible place — and it fails in the dangerous direction. The band was drawn to **report**
`active_tenant_id`, never to declare it. Wire it to the real value: a reloaded act-as
session shows `act` tone and its `Acting as` line on load. Not a redesign; the band doing
what it was specified to do.

**Focus rings are a token gap, not a treatment question.** `--ring` validated against white
and never redefined for the console gives 2.33:1 light / 1.78:1 dark against a 3:1 floor,
on every interactive control in columns 1 and 2. Define `--ring` per theme against
`--pg-env`; `--pg-gold-deep` already clears 3:1 in both and is the family the pack uses for
the act border.

**Gold text at 2.35:1 is a reject.** Gold is spent on the act. Not on text, not on borders
outside the act, not as emphasis. Three new spends outside the budget come out.

**Four slots rendering header + tab row + empty section is not acceptable.** An empty
section is the "every test passed and every screen was blank" failure. Any slot whose views
are not yet wired uses the absence treatment with honest copy — the same rule as Campaigns
and Relationships, not a special case for slots that were expected to have destinations.
Copy for those four is owed from the design side; ask and it is written.

**Two harness gaps, both real:** `aaAgainstEnv` measures text only and cannot see a focus
ring; `goldOnlyOnAct` inspects backgrounds only and cannot see gold text or borders. Found
by reading rather than measuring, which is the peer gate earning its place.

**And the green-over-untracked lesson:** a typecheck, test run and build that pass over an
untracked file say nothing about the tree that was pushed. `git ls-tree HEAD` found it; no
check did. Same class as the gitignore protecting one spelling of a path — a green result
whose scope was narrower than it appeared.

### The four gaps — destinations ruled (2026-08-23)
CC placed 78 addressable leaves into 32 views and named four capabilities with nowhere to
live. Rulings, no new slots:

**Twilio numbers → Settings, its own view.** Not Integrations — that is a connection
surface, and a number inventory with assignment and billing is not a connection. Settings
is where **platform-owned inventory** lives: Vault holds obligations, Team holds seats,
Numbers holds provisioned numbers. An eleventh view inside a slot, which is a view
decision, not an IA change.

**Paige operating the platform → Analytics · Autonomy for the record, a summoned surface
for the live run.** Watching her run her team is not a place. The pack already models it:
*a capability opens its own surface and retires when you close it*, and the execution strip
plus a detachable window is how she runs and talks at once. Autonomy holds the standing
read — what she has been allowed to do, what she did, what she escalated. The live run is
summoned, never a slot. Settings · Capabilities stays what it is: the grant, not the
watching.

**Relationships · People and Segments → absence, as shipped.** No operator-scope substrate
exists and the old console never had the branch. The honest absence is correct and needs no
change.

**Campaign attribution → already named** in the IA's own absence copy. Schema obligation,
not a destination.

### Surface debt — split by severity (2026-08-23)
Ported feature surfaces measure 10 type sizes and carry sub-AA pairs (1.06:1 dark,
1.52:1 / 2.75:1 light). The shell chrome is clean; the debt predates the ladder and
contrast rulings.

- **Contrast does not wait for its slice.** 1.06:1 is unreadable, not untidy. Fix on sight,
  in the nearest commit.
- **The ladder pays down per slice**, as CC proposed — each slice holds its surfaces to
  11 / 13 / 16 / 21 as it lands, which avoids a separate sweep that would touch every file
  at once.

**Slice order agreed:** Fleet (3) → Settings (10) → Analytics (5) → Marketplace (4) →
Campaigns (6) → Relationships (4). Fleet first is right: its bespoke surfaces already read
live data, so it is the shortest path to one fully-real tab.

### Two port gaps found by the broken contrast check (2026-08-23)
CC's `aaAgainstEnv` fell through to a phantom white because `--pg-env` does not resolve in
the operator console. The check was broken; the token is not. **Both are real gaps, and the
check finding them is the most useful accident of the round.**

**1. `--pg-env` exists in the pack and was never ported.** Dark `#08070b`, light
`#e8e5df`, painted on `body` and on the shell root. It is the **bottom of the depth
ladder**: env → nav → canvas → spine → workspace → surface → raised. Depth in this design
comes from layered elevation, not from darkening — and with env missing, the stack has no
ground to sit on. Its absence is not a measurement inconvenience; it means the elevation
model is not ported. Define the full ladder, both themes, and measure against env because
env is what the shell is actually painted on.

**2. The typeface set is wrong, and this correction is mine.** I accepted CC's measured
three faces as the spec. They are not. The pack loads **Schibsted Grotesk** (display *and*
UI — one face doing both), **JetBrains Mono** (paths, figures), and a serif for editorial
moments (Newsreader / Gambetta). The console measures **Bricolage Grotesque + Inter +
JetBrains Mono**. Bricolage and Inter appear nowhere in the pack, and Inter is explicitly
on the avoid list.

So the earlier ruling — *“three faces is correct”* — was me validating a measurement
instead of the specification, which is the direction-of-accommodation rule broken by its
own author. Corrected: **Schibsted Grotesk replaces both Bricolage Grotesque and Inter.**
Typography is the most visible surface of the design and the least acceptable place to
diverge.

### A control that supplies the thing under test is not a control (2026-08-23)
The contrast fixture defined `--pg-env` itself, so the negative control went green and
proved only that the check works on a page built to satisfy it. Fifth instance of the
assertion family, and the sharpest statement of it yet. Corollary CC applied: when no
opaque ground resolves, return **unverified** rather than substituting something arbitrary.

### Frame reading — rulings (2026-08-23)
Ordered by severity, not by ease.

**1. Six bespoke surfaces gone dark, and no command palette. Both are blockers.**
`bespokeSlots()` reachable only from the retired console means Calendar month, Platform
hours, Marketplace submissions, Support inbox, Compose and the Integrations grid render a
"not connected" plate — working surfaces withdrawn, which is the one regression already
ruled out twice. And the six-slot IA **justified itself on the palette**: nine orphan
branches were ruled into it, the legacy console's entry points were ruled into it, and
capabilities are specified to summon from it. Without it the IA is not implemented, it is
merely narrower. These outrank the ladder.

**2. Depth does not read — the tokens are present and not spent.** 44/44 correct and about
two visible steps. Elevation is not decoration; it is how this design separates regions
without drawing boxes. Each region sits on its named token, not on a near neighbour:

```
ground/body   --pg-env        rail/nav      --pg-nav
main canvas   --pg-canvas     spine         --pg-spine
work area     --pg-workspace  cards/plates  --pg-surface
raised/menus  --pg-raised     documents     --pg-artifact
```

Plus `--pg-rim` to seat a plate, `--pg-lift-1/2/3` to raise one, `--pg-inset` on press.
A card on `--pg-canvas` with no rim and no lift is the flat reading — the values are
right and nothing is spending them.

**3. The spine is 416px of nothing — collapse it until she is in it.** The spine is Paige:
conversation, execution strip, detach. With no Paige it is a quarter of the screen
reserved for absence, which is the blank-section failure at the largest scale in the shell.
Collapse to `0` until she is wired. A collapsed spine is honest; an empty one asserts a
capability that is not there.

**4. The shell does not collapse. Implement it:** spine → `0` first, then rail
`216px → 72px`, band last (it thins, never disappears). At 640px, 556px of chrome around a
sliver of workspace is not a layout.

**5. The gold act routes to a 404.** `/operator/provisioning` is not a slot. The act is the
one gold fill on the surface and it must land — provisioning a tenant belongs in **Fleet**.
Point it at the slot, or remove the act until it lands. A gold affordance that 404s spends
the design's scarcest signal on nothing.

**6. Ladder judgement calls, both settled toward the data.** On a surface whose subject is
figures, **the figures are the largest thing**: KPI figures take 21, and the surface title
drops to 16. Titles do not need to be biggest — hierarchy comes from position and weight.
And 13.5 → 13 distinguished by weight is correct; the pack separates block headers by
weight and tracking, never by size. Ladder stays 11 / 13 / 16 / 21.

**7. Systems Check at 9 sizes is out of Fleet's scope** — correct call, and it lands in the
Settings slice with attribution. The grey orbit disc is a harness artifact
(`canvas=false`); not a defect until it renders with canvas on.

### Instances seven and eight — and the worst one yet (2026-08-23)
`collapseOrder` asserted the *order* of a collapse it never confirmed happened. A shell
that never collapses satisfies it vacuously — **a check named after the thing it does not
verify.** `typeLadder` counted text inside `<script>`, `<style>` and `<title>`, reporting
Inter, a withdrawn face, so its false positive was indistinguishable from the real
regression it exists to catch.

And frame 6: a hardcoded caption — `COLLAPSE: SPINE 0, RAIL 72` — burned into a render
that visibly showed the opposite. That is the worst form found so far, because **a false
caption on an image is indistinguishable from a measured one and the image is the
evidence.** Deriving labels from `getComputedStyle` at capture time is the only safe shape.

### Owner correction: three of the five are deferred, not retired (2026-08-23)
**These attributes are to live inside the platform.** Fed from the outlets, landed in our
own tables — not read through a vendor dashboard. The reason is Paige: she can only reason
over what is in her knowledge base, so data sitting in Meta's or a provider's console is
invisible to her and cannot be translated for a tenant owner. That makes each of these an
**ingestion target**, not a chart feature. The panel is downstream of the ingestion, never
the reason for it.

Revised dispositions:

| Panel | Was | Now |
|---|---|---|
| Ad spend · MER · CAC · LTV:CAC · channel table | retire | **deferred** — ingest from ad-platform integrations into platform tables; panel returns with the feed |
| Uptime / incidents | retire gauge | **deferred** — ingest probe and incident records; the gauge returns when the source lands |
| Email engagement (opens, acknowledgements) | reduce to delivery | **deferred** — ingest provider webhooks; ships as delivery health now, grows when engagement arrives |
| Vault | absence | **unchanged** — own substrate, never a borrowed same-named table |
| `platform_support` | drop the row | **unchanged** — the role does not exist; do not invent an enum value to match a drawing |

The near-term build does not change: nothing renders a figure it cannot derive today, and the
absence copy names what is missing. What changes is the **record** — these are roadmap with a
named source, not designs withdrawn. Deferred and retired look identical in a shipped build
and are opposite in intent, and a later session reading "retire" would delete the panel
rather than wait for its feed.

Design consequence: each deferred panel keeps its place in the IA and states its own source
in absence copy — *what is missing, why, and where it will come from.* Naming the outlet is
what makes the absence a plan instead of a hole.

### Five §00 incompatibilities — ruled (2026-08-23)
Panels drawn with no data that can fill them. One rule decides all five: **the honest form
of a missing destination is nothing.** A panel that cannot be filled comes out; it does not
get a placeholder, a borrowed table, or an invented column.

**1. Ad spend / MER / CAC / LTV:CAC / the six-column channel table — retire the panel.**
No ad-spend table exists because ad spend is not platform data; it lives in Meta and Google.
Nothing is derivable, so nothing is shown. Integrations already maps 42 vendors — when an ad
platform connects, the panel returns with a real source. Until then it is not a gap in the
backend, it is a panel I drew for data we do not have.

**2. The 99.0% uptime gauge — retire the gauge, keep the surface.** No probe or incident
table, and uptime cannot be inferred from application logs without lying. But Health has
real substance that *does* derive: error rates, job failures, edge-function errors. Analytics
· Health keeps what derives and drops the gauge.

**3. `email_send_log` → the panels report delivery, not engagement.** `failed / pending /
sent` is a real metric and a smaller one than I drew. Rewrite the three panels to delivery
health. Open and acknowledgement tracking is a provider capability; when it exists the panel
grows. This is a genuine reduction in ambition and it is the honest one.

**4. Vault → absence. Do not wire `business_vendors`.** It is the funding vertical's credit
tracker and shares only a name. Borrowing a same-named table from another vertical is the
worst version of this failure class: it would render plausibly and be wrong, which is
undetectable from the surface. Vault is twenty legal obligations across six categories, it
has no substrate, and it renders the absence.

**5. `platform_support` — drop the row.** It is in the design taxonomy and not in the
`app_role` enum, so the row is structurally always empty. Adding an enum value to satisfy a
panel would be inventing an organisation to match a drawing. Team ships the roles that
exist.

### RPC wherever one exists (2026-08-23)
52 of 59 operator tables gate on `is_platform_owner()` (super_admin only) while every
`operator_*` RPC resolves `is_platform_admin()` (platform_admin OR super_admin). The same
view wired through a table read returns **zero rows, indistinguishable from "no data"** for a
platform_admin. That is the assertion pattern in the data layer — an empty surface asserting
emptiness it never verified. RPC wherever one exists, and the permission test as either tier
is owed before the tier reach is trusted.

### Attribution — worse than recorded, and closable
`utm_campaign` exists on `analytics_events` and `referral_clicks` only; no order, invoice or
subscription carries a campaign, utm or referral code; and `analytics_events` has no
`tenant_id`, so the click side is not tenant-resolvable either. CC's close — attribution on
`tenant_orders` written at checkout plus tenant/session continuity on `analytics_events` —
is accepted. One correction: it must be **typed columns, not a jsonb blob**, per the earlier
ruling. A figure is only as derivable as the column under it.

## Rulings closed 2026-08-23
- **Payment processor: agnostic.** The interface is the five needs; Stripe is the first adapter. Build the boundary now, expect the provider to change before GA.
- **No tenant sale is ever split.** Revenue share exists in the marketplace and nowhere else.
- **A campaign's offering binding is optional.** Brand campaigns exist and read as `— brand, sells nothing`.
- **Tenant-adjustable schema, both inline and in one editor** — and it may rename, reorder and hide, but never invent a figure.

## Open rulings
- **Sales attribution** is recorded on the line by hand. A real one needs send-to-conversion history — the same missing join that dims two Analytics charts.
- **Sales target** is a hand-set number per period with nothing enforcing it. Confirm whether it becomes an object (per period, per person, per offering).
- Six rail slots, not five (the two-books ruling created the sixth).
- What a deal points at now Pipeline sits under Campaigns: tenant, relationship, or a nullable pair.
- Sandbox / web search / browser have no substrate at all — palette stubs per owner ruling.
- Detached-window transport: client half shipped, server token + cross-window gate locking is CC's Stage 4.
- Ten capabilities, not eleven. Name the eleventh if one was intended.
- **Live defect found while grounding Capabilities:** migration 20260716171236 (Studio) re-declared `list_tool_autonomy` from a body copied out of 20260711200000, which predates the n8n additions in 20260711220000. Four tools — `n8n_create_workflow`, `n8n_update_workflow`, `n8n_activate_workflow`, `n8n_deactivate_workflow` — are still gated at runtime (unlisted defaults to `confirm`) but no longer appear in the settings catalogue, so an operator cannot see or change them. That is precisely the visibility gap the Studio migration's own header says it exists to close. Stage 3 should re-declare the catalogue as the union.
- Automation substrate: 32 of 42 triggers and 24 of 29 actions have a seam. The ten dead triggers cluster on voice (2), social DM (1), attendance (1), lifecycle (1), loss reason (1), stage history (1), merge (1), drift (1) and integration events (1).
- An automation's effective grant is the most restrictive among its actions, then clamped by the Trust Compass — same rule as composed skills and marketplace installs. Stage 3 must resolve it server-side, not in the client.
- **Number resale vs bring-your-own is two products.** Ours resold: we hold the Twilio account, the tenant rents the number, we can revoke. Theirs: they hold the account, we hold a grant only — no revoke, no visibility on their bill. Confirm this is the intended split before Stage 3 builds provisioning.
- A2P registration has two carrier-side steps we cannot drive. A number can be Active and still undeliverable, which is why A2P is its own layer rather than a field on the number.
- The Studio is tier-locked to Solo · Sub-account · Enterprise · Super Admin, **Agency excluded with no resell** (§61 owner-locked). The shell shows the door because it is Super Admin; other tiers must gate it via `RequireFeature`.
- §21 forbids artifact-type tabs in the Studio. The door therefore offers the three real routes (gallery, new, library), not per-artifact create actions.
- Voice has no substrate at all. Email and SMS route through the existing send seam; WhatsApp is Stage 3. The call surface is design only — nothing dials.
- The shipped console's other five sub-tabs (Manual Actions · Snippets · Trigger Links · Analytics · Settings) are not carried into the operator console yet — confirm whether operator scope needs them.
