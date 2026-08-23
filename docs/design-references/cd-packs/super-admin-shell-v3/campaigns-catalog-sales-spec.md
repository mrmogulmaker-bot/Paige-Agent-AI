# Campaigns: Catalog, Sales, and the tenant schema

**From:** Claude Design · **To:** Claude Code · **Date:** 2026-08-23
Companion to `CLAUDE-CODE-HANDOFF.md`. Covers everything added to Campaigns and
Relationships after the six-slot shell was signed off, plus the control chrome
that now applies shell-wide.

Reference implementation: `PAIGE Super Admin Shell v3.dc.html`. Data contract:
`paige-ia.js`. Open the shell beside your build — every figure quoted here is
computed by the shell from the contract, so if your number differs, one of the
two is wrong.

---

## 1. Campaigns is six views

`DEST.campaigns.views = ['Active', 'Catalog', 'Sales', 'Pipeline', 'Social', 'Performance']`

Order matters — Active, then what is sold, then what it earned, then the deal
board, then publishing, then measurement. **View indices moved.** Anything
routing by index needs updating: Pipeline is 3, Social 4, Performance 5.
Prefer routing by name.

### Why Catalog and Sales exist

Campaigns previously had no idea what was being sold. A motion could show
activity — steps delivered, opens, reach — and never money, because nothing on
the platform recorded an offering. Catalog supplies the object; Sales supplies
the lines; Active shows the join.

---

## 2. Catalog

**Object:** `P.CATALOG[]`. Five representative offerings.

| Field | Type | Notes |
|---|---|---|
| `id` | string | `o1`…; tenant-made ones are `ox<timestamp>` |
| `name` | string | |
| `kind` | key of `P.OFFER_KINDS` | product · service · retainer · license |
| `cat` | string | one of the tenant's `OFFER_CATEGORIES` |
| `state` | key of `P.OFFER_STATES` | selling · quiet · draft · retired |
| `price` | number \| null | `null` = quoted. `0` = revenue share |
| `period` | string | one-time · monthly · annual · quoted · revenue share |
| `unit` | string | what the price is per |
| `pitch` | string | one sentence |
| `tiers` | `[name, price, period, what][]` | rendered only when >1 |
| `where` | string[] | channel names — campaigns or `Marketplace storefront` |
| `fulfil` | `[label, value][]` | What · Who · When |

**`OFFER_KINDS`** carry a 16-grid glyph path and a note; the glyph renders at
13px inside a 30px pill with `border-radius: var(--pg-r-pill)` and
`color: var(--pg-gold-deep)`.

**`OFFER_STATES`** carry `label`, `tone`, `note`:
selling `--pg-positive` · quiet `--pg-gold-deep` · draft `--pg-violet` ·
retired `--pg-faint`.

### The state is derived, never chosen

```
no price (and period ≠ quoted)   → draft
priced, where[] empty            → quiet
priced, where[] non-empty        → selling
```

This holds on create **and** on read. The new-offering panel shows the outcome
live ("Will be quiet") as fields change. Do not expose a status picker — a
status that contradicts the record is the defect this rule exists to prevent.

### Card layout

Card: `padding: 17px 0 16px`, `border-bottom: 1px solid var(--pg-line-soft)`.

1. **Head** — `grid-template-columns: auto minmax(0,1fr) auto`, `gap: 12px`,
   `align-items: center`. Kind pill · name (`500 15px` display, `-.008em`) over
   pitch (`11.5px`, `--pg-muted`) · state pill (24px, pill radius, 5px diamond
   dot at 45°).
2. **Price line** — `margin-top: 13px`. Price at `400 20px` display,
   `-.01em`; `Quoted` renders in `--pg-faint`. Terms follow as
   `period · unit` at 11px `--pg-faint`.
3. **Tiers** — only when `tiers.length > 1`. A 1px-gap stack on a
   `--pg-line-soft` background so the gaps read as rules; each row
   `grid-template-columns: minmax(0,.8fr) minmax(0,1.4fr) auto`,
   `padding: 8px 11px`, `background: var(--pg-raised)`. Price column is
   `--pg-font-data`, `monthly → /mo`, `one-time → /once`.
4. **Where it sells / Fulfilment** — two columns at ≥700px canvas, one below.
   Channels are 24px chips that route to Active. Empty `where` prints
   "Nothing sells it right now" in `--pg-warning` — not an empty region.
5. **Facts row** — Booked · Sold · Campaigns, all derived:

```
booked    = Σ SALES where offer === id and state === 'booked'
sold      = count of those lines            → "1 line" / "n lines"
campaigns = count of CAMPAIGNS where offer === id
```

Any zero prints `—` in `--pg-faint`, never `$0`.

6. **Actions** — `Take off sale` / `Put back on sale` writes a local state
   override (`offState[id]`), so the card and the counts move immediately.
   `Sell it in a campaign` routes to Active.

**Filters:** `Everything` plus the tenant's categories, each with a derived
count. Active filter carries `box-shadow: inset 0 -1px 0 var(--pg-gold)`.

**Bottom rail** (see §5) — definition left, `n offerings` or `n of m shown` right.

### New offering

Slide-over summon `offer`. Eleven rows in a
`grid-template-columns: minmax(0,84px) minmax(0,1fr)` label/control grid,
`padding: 9px 0`, `border-bottom: 1px solid var(--pg-line-soft)`:

name (in the header, beside the derived-state badge and Save) · kind picks ·
category picks · pitch · price · period picks · unit · tiers (repeatable
name/price/what with remove) · sells-on multi-picks (every campaign plus
Marketplace storefront) · delivers · by whom · by when.

Save requires a name only. Blanks persist as honest em-dashes
(`— not stated`, "No pitch written yet."), tiers with no name are dropped, and
the offering lands at the top of the Catalog with the view switched to it.

---

## 3. Sales

**Objects:** `P.SALES[]` (lines), `P.SALES_STAGES[]`, `P.CLOSE_REASONS[]`,
`P.SALES_TARGET`, `P.PROCESSOR`.

A line is: `when`, `day` (for ordering), `offer`, `tier`, `amount` (number),
`state` (booked · refunded · pending), `stage` (a `SALES_STAGES` value),
`camp` (attribution), `who`.

### Every figure is a sum

```
booked   = Σ amount where state === 'booked'      → $4,790
refunded = Σ amount where state === 'refunded'    →  −$490
net      = booked − refunded                      → $4,300
pending  = Σ amount where state === 'pending'     → $6,800
pct      = clamp(round(net / target × 100), 0, 100) → 36%
```

Nothing on this surface is typed. Rule 3 of the fidelity contract applies with
full force here — this is the surface most likely to grow a hardcoded total.

**Figures strip:** pinned, `flex: none`, cells at `padding: 11px 13px` with
`box-shadow: inset -1px 0 0 var(--pg-line-soft), inset 0 -1px 0 var(--pg-line-soft)`
so the remainder cell reads as canvas rather than a grey block. Values at
`400 21px` display, `-.012em`, `font-variant-numeric: tabular-nums`.
Columns: 5 at ≥900px canvas, 3 at ≥620px, else 2.

**Target bar:** 7px, pill radius, `--pg-line-soft` track, `--pg-gold-fill`
fill at `pct`, plus a 1px `--pg-line-strong` mark at 100%. The target is a
line on a chart, not a gate — the copy says so.

**Timeline** — lines sorted by `day` descending. 44px date gutter, 7px diamond
dot (booked = filled gold, pending = hollow with a gold-deep ring, refunded =
`--pg-negative`), offering · tier over who · campaign, stage pill, amount
right-aligned in a 62px tabular column. Refunded rows carry a leading `−` and
`opacity: .72`.

**Tables** — four, all derived: By offering · By campaign · Deals in flight
(read from `DEST.campaigns.board.deals`, amounts `—` because no verified deal
value exists at operator scope) · Close reasons (the tenant's vocabulary).

### Money movement — the processor seam

**Owner ruling 2026-08-23: processor-agnostic. Stripe is the first adapter, not
the interface.**

`P.PROCESSOR.needs` is the interface — five capabilities a merchant provider
must satisfy: charge once · charge on a period · refund a charge · report a
payout · split a payment. The first four are marked `Adapter`; only *split* is
marked `Stripe Connect`, because only the marketplace splits.

`P.PROCESSOR.adapters` is the implementation register: Stripe is
`Wired at operator scope`; "Any other merchant provider" is `Pluggable`.
Copy states plainly that the provider is expected to change before general
availability.

**Hard rule from the owner:** no tenant sale is ever split. Revenue share
exists in the marketplace and nowhere else. Do not build a split path into
tenant billing.

---

## 4. The tenant schema — what a tenant can change

**`P.CAMP_SCHEMA`** holds platform defaults; overrides live in state and are
read on every render, so a rename lands as it is typed. Server-side this is
per-tenant JSON, not code.

| Key | Effect |
|---|---|
| `definition` | the legend on the Active and Catalog bottom rails |
| `stageWord` | replaces "Step" everywhere a motion position is named |
| `density` | `full` \| `compact` — card padding 17/16 → 12/11, rail margin 16 → 10, step timings hidden |
| `facts` | which of `P.CARD_FACTS` a campaign card carries, in order |
| `kindLabel{}` | per-key rename of `CAMP_KINDS` — glyph and meaning unchanged |
| `stateLabel{}` | per-key rename of `CAMP_STATES` |
| `cats[]` | catalogue categories |
| `stages[]` | sales stages |
| `reasons[]` | close reasons |

**`P.CARD_FACTS`** is six: step · opened · reach · grant · **offer** ·
**booked**. The last two exist only because a campaign can bind to an
offering, and they are off by default. `offer` prints
`— brand, sells nothing` when unbound; `booked` sums SALES by campaign name.

**A schema cannot invent data.** Turning on a fact with no substrate shows an
em-dash. This is the seam where a customization layer usually starts lying.

**Editor:** slide-over summon `campschema`, reachable from an `Adjust` control
on Active, on Catalog, and in the Sales bottom rail. Five groups — How it
reads · What a card shows · Campaign kinds · Campaign states · Your own
vocabulary. `Back to the defaults` clears every override; the footer states
whether the tenant is on defaults or adjusted.

---

## 5. Two patterns that now apply shell-wide

### The bottom rail

A worked surface closes with a rail rather than a clipped scroll region:

- scroll region: `flex: 1; min-height: 0; overflow: auto; scrollbar-gutter: stable;`
  `padding: 2px 12px 22px 0` and
  `mask-image: linear-gradient(180deg,#000 0,#000 calc(100% - 20px),transparent 100%)`
  (plus `-webkit-` prefix). The 20px fade lands on the 22px padding, so content
  dissolves into the rail while scrolling and nothing fades at the end.
- rail: `flex: none; min-height: 30px; border-top: 1px solid var(--pg-line)`,
  one line only — a legend that ellipsizes on the left, a derived tally on the
  right. Never a paragraph: at narrow widths a wrapping rail eats the surface
  it is meant to close.
- long-form footnotes stay **inside** the scroll region, above the rail.

Applied to Campaigns → Active, Catalog and Sales. Roll it out to the other
worked surfaces as they are built.

### The control chrome

Every icon control and small button in the shell now shares one spec:

```
resting  border: 1px solid var(--pg-line)
         border-radius: var(--pg-r-chip)   /* pills keep --pg-r-pill */
         background: var(--pg-raised)
         box-shadow: var(--pg-lift-1)
         color: var(--pg-muted)
         transition: color .16s, border-color .16s, box-shadow .16s, transform .16s

hover    color: var(--pg-gold-deep)
         border-color: var(--pg-line-strong)
         box-shadow: var(--pg-lift-2), inset 0 -2px 0 var(--pg-gold-deep)
         transform: translateY(-1px)

press    color: var(--pg-ink)
         box-shadow: var(--pg-inset)
         transform: translateY(0)
```

Sizes: 30px in panel headers, 34px in the top bar. Icons are 14–15px on a
16-unit grid at `stroke-width: 1.25`, with accents (arrow shafts, chevrons) at
`1.45` so they read at small sizes. Destructive controls hover to
`--pg-negative` instead of champagne. Discrete controls sit 6px apart — a
bonded segmented group reads as one button and was rejected.

Two state signals worth keeping: the detach control carries a 2px
`--pg-gold-fill` bar along its bottom edge while the conversation is detached,
and the selected workspace geometry gets ring + bloom + underline rather than
colour alone.

**Vibe Studio** is the one violet-filled control on the platform, because it is
the one door that leaves it for a sub-app. It also hides whenever a summon or
the authority gate is open — the view-tab row is deliberately raised above
panels (`z-index: 12`) so a panel cannot trap you in a surface, and the Studio
door was inheriting that raise and floating through open panels.

---

## 6. Relationships → Segments: the builder

**Objects:** `P.SEG_FIELDS[]` (clause vocabulary), `P.SEG_PHRASES[]` (what she
listens for), `P.SEGMENTS[]` (saved segments).

A clause is declarative — `{ field, op, value }` — because it has to become a
`WHERE` clause. The predicates that resolve it against the book live in the
shell (`segTest`), deliberately not in the contract.

**12 fields** across Who they are · Activity · Reach · Records. Eight resolve
against `P.PEOPLE` today; four (recent thread, inbound reply, meeting,
outbound) carry `live: false` and a reason.

Two doors, one surface (slide-over summon `segment`):

- **Describe one to her** — a sentence becomes clauses. `segParse` matches
  phrases, then flips polarity when a negation cue (`no|not|never|without|
  missing|lacks|lacking|havent|hasnt|yet`) sits within ~12 characters ahead of
  the match. "Clients I have not spoken to in a month" →
  *is a client, and has no conversation in the last 30 days*.
- **New segment** — the same panel with the clause picker open. Fields, then
  both polarities as explicit rows.

**Sizing is honest.** If every clause is live, the count is resolved against
the book on read and the members are listed. If any clause is dead, the segment
saves **unsized** with the reason — never an estimate. This mirrors the `s4`
fixture, which has been unsized since it was written.

**Copy detail:** the negative verb drops the value's leading article, so
clauses read "has no EIN on file", not "has no an EIN on file". `segPair()`
owns that, and it feeds the clause rows, her reply, and the saved rule line.

---

## 7. Naming

`SUPER ADMIN` → **`PLATFORM OPERATOR`** in the wordmark, and as a tier name in
the Studio tier lock, the Mind's write attribution, and the Team capability
defaults. The string "Super Admin" no longer appears in the shell. Rename it in
the codebase's tier enum too, or record why not.
