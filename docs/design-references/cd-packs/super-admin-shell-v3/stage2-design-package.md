# Stage 2 Design Package — Super Admin

> **Status.** Stage 1 output, awaiting Stage 2 owner sign-off. Nothing here is connected to
> platform data. Every surface described is representative until CC wires it in Stage 3.
>
> **Companion artifacts (this project, not yet in-repo):**
> - `PAIGE Stage 1 Design Package.dc.html` — live inspectable token + state reference,
>   both themes, with the motion sequence runnable and contrast ratios computed in-page.
> - `PAIGE Super Admin Shell v3.dc.html` — the working shell on this token set and the
>   six-slot IA. Supersedes v2, which is kept for comparison and shows the earlier
>   seven-item Fleet rail.
> - `paige-ia.js` — the destination, capability and summon data the shell reads.
>
> **Brand:** [`docs/brand/paige-brand-identity.md`](../brand/paige-brand-identity.md)
> (created in this commit — it did not exist on `main`).

## 0. What Stage 1 reconciled

Two visual languages existed. `src/prototype/tenant-redesign.css` shipped a scoped `--tr-*`
system (obsidian/champagne, four system-safe font stacks, 2px radii, clip-path chamfers).
The owner's Command Mark board supplied the mark, the wordmark, the motion sequence and the
champagne/bronze illumination. Stage 1 folded both into one `--pg-*` set that both the
tenant prototype and the operator shell build against.

Naming: `--pg-*`, global. The `--tr-*` set stays scoped to `.tr-app` until Stage 3 migrates
the prototype; the values below are the ones both should converge on.

## 1–3. Tokens, type and radii — REMOVED (owner ruling, 2026-08-23)

**The values that lived here were superseded and are deleted rather than corrected.** Owner,
verbatim: *"a doc that's right about IA and wrong about colour is worse than a doc that's wrong
throughout — nobody distrusts the parts that read correctly."*

What was here: a full Obsidian/Mineral colour table, a system-safe font stack declaring that
*"nothing waits on a webfont"*, a `--pg-d1…--pg-editorial` type scale, a `--pg-s1…s10` space
scale, a five-step elevation table, and a `--pg-r0/-r1/-r2/-chamfer/-facet` edge set. Every one
of them disagreed with the shipped shell — different ink and line values, different gold, a font
stack replaced by Schibsted Grotesk / Gambetta / JetBrains Mono, and radii replaced by
`--pg-r-plate` 13 · `--pg-r-chip` 9 · `--pg-r-seal` 11 · `--pg-r-pill` 999. `--pg-e5`,
`--pg-s1…s10` and the `--pg-t-*` motion tokens do not exist in the shell at all.

**The palette, the faces and the radii are `design-system-port.md`, and behind it the shipped
`PAIGE Super Admin Shell v3.dc.html` L19–L45. Nothing else.**

The rest of this document — the boundary model, component states, the Trust Compass scale,
keyboard, accessibility, IA and the Stage 3 ledger — stands.


## 4. Motion

**Token names removed by owner ruling, 2026-08-23** — the same ruling that deleted §§1–3, extended
here. `--pg-t-instant` · `-quick` · `-base` · `-considered` · `-materialize` · `-execute` ·
`--pg-e-out` · `--pg-e-authority` **do not exist in the shell**, and eight token names that resolve
to nothing are the same defect as the palette block. The timings below are real spec and stand;
the **implementation is the shell's own keyframe set** (`PAIGE Super Admin Shell v3.dc.html`
L46–L67 — `pg-materialize`, `pg-reveal`, `pg-drop`, `pg-roll`, `pg-breathe`, `pg-warm` and the
rest), under the root `prefers-reduced-motion` kill.

| Transition | Timing |
|---|---|
| Rail / surface | 200ms · `cubic-bezier(.22,1,.36,1)`. Colour and background only; no layout easing on the rail |
| Workspace materialize | 340ms · `clip-path inset(0 0 0 100%) → inset(0)`, opacity 0→1, x +18px→0 |
| Authority appear | 280ms · `cubic-bezier(.16,1,.3,1)`, scale .97→1, champagne edge draws last |
| Focus ring | 90ms · linear. Never eased — an animated focus ring reads as lag |

Command Mark sequence: see the brand file.

## 5. The four-level boundary model

A boundary is earned, not decorative. A champagne edge always means authority and never
means "card".

| Level | Applies to | Treatment |
|---|---|---|
| **L1 · none** | Shared operating-field content: prose, readings, the brief | No boundary. Grouped by rhythm alone |
| **L2 · spatial** | A region that reads as its own | Alignment, tone shift ≤4% luminance, spacing. No box |
| **L3 · functional** | Selected / editable / draggable / actionable objects | A real 1px line, because the object accepts input. Hover raises the fill, never the line |
| **L4 · security** | Approvals, authorization, consequential acts | `--pg-chamfer` corners, `--pg-line-authority` edge, two-key affordance. Nothing else may borrow it |

## 6. Component states

Full inspectable matrices live in the design-package artifact. Summary:

- **Command bar** (6): rest · focus · listening · understanding · executed · read-only.
  44px minimum. It is the only global invocation — no floating widget on an authenticated
  shell (§46).
- **Tenant-context band** (3): *Platform scope* (`tenant_id IS NULL`, resting) ·
  *Reading* (aggregate read, write affordances drop) · *Acting as* (champagne edge, named
  audit destination, always-present Exit returning `active_tenant_id` to NULL). Persistent
  and shell-wide — the operator is never unsure whose data they are in (§51).
- **Rail item** (5): rest · hover · active · focus · unbuilt. 216px expanded / 72px compact,
  distinct glyph per destination so the compact rail stays legible.
- **Workspace** (6): expanded · collapsed · split · slide-over · pop-out · **detached**. All the
  same session; invocation changes geometry, not conversation.
- **Capability palette** (⌘K): PAIGE's verbs, grouped by intent, each showing its Trust
  Compass grant. Selecting one opens a summoned surface that retires on close, or is kept
  via the pin control.
- **Execution strip**: pinned to the spine above the composer, outside the transcript's
  scroll container. Talking must never scroll running work away.
- **PAIGE-surfaced rail section**: destinations she adds herself, each carrying the reason
  it is there and a control to retire it.
- **Living Operational Field** (10 entity treatments): appointment · meeting · task ·
  protected focus · agent execution · approval gate · milestone · follow-up · artifact ·
  current-time line. Differentiated by treatment rather than colour, so it survives both
  themes and colour-blind reading. The current-time line is the only element allowed to
  move on its own: 1px champagne at 60%, repositioned once a minute, never eased between
  positions.

## 6b. The Trust Compass — a ceiling, not a switch

Authority has one control and one scale. The Trust Compass sets a **ceiling**; every
capability carries its own grant; the grant that actually applies is the more restrictive
of the two.

**The scale** (five levels, ascending):

| Level | Means |
|---|---|
| 0 · Observe | Reads and reports. Acts on nothing. |
| 1 · Draft only | Composes work you review. Never delivers. |
| 2 · Ask first | Prepares fully, then waits for your word at the act. **Default.** |
| 3 · Act and report | Acts within scope, tells you afterwards. Reversible acts only. |
| 4 · Autonomous | Acts, and only raises what needs a decision. |

**Capability grants map onto the same scale** — Autonomous → 4, Ask first → 2,
Draft only → 1 — and the effective grant is `min(capabilityGrant, ceiling)`. Below level 1
a capability renders as **Held**, which is its own state and never reads as a lower grant.

Consequences Stage 3 must implement, not decorate:

- **The default ceiling is Ask first (2).** Three capabilities in §8 below declare an
  `Autonomous` default and are therefore **held at Ask first on first load**. The shipping
  ladder reads `Capabilities 10 · Autonomous 0 · Ask first 7 · Draft only 3`. A row demoted
  by the ceiling says so in its own note rather than silently reading lower.
- **A capability may not be cycled above the ceiling.** The control skips grants the
  ceiling forbids rather than accepting and then overriding them.
- **Lowering the dial lowers everything above the new line**, including per-domain settings
  and work already in flight. Raising it takes effect at the next run.
- **Per-domain settings** (Reach out · Build and connect · Look things up · Act on the
  fleet) may sit at or below the ceiling, never above. The panel states how many sit below.
- **An absence rule** governs unattended time: *hold everything*, *act on reversible
  things*, or *run to the ceiling*. Default is hold. This is what makes the morning brief
  honest — she reports what she held rather than what she decided.

**Where it appears.** Three places, one state: a persistent level readout in the spine
header; an inline control in the conversation (bar dial, level name, five borderless level
chips); and the full panel as a slide-over from either the brief or the inline control,
carrying the absence rule and per-domain rows.

## 6c. Systems check — the landing surface

Fleet's first tab, and where an operator lands on login: `Systems check · Directory ·
History`.

Layered the same way as Pipeline — the surface, a slide-over for configuration, a slide-over
for a single record:

- **The brief.** What ran overnight, in one sentence, with the ladder beneath it:
  `Checks passed · Held for you · Unreadable · Acted alone`. *Unreadable* is its own axis and
  is never counted as a pass; *Acted alone* is what makes the absence rule legible.
- **The findings ledger.** Passes, the findings she held for you, and anything she could not
  read — labelled as unreadable rather than resolved.
- **The dial**, opening the Trust Compass panel described above.

Backend note: the sweep itself is live (§10). The **schedule** — run time, and what she may
do when the owner is absent — is Stage 3, and is the record the absence rule writes to.

## 7. Interaction and keyboard

| Key | Does |
|---|---|
| `⌘K` | Focus the command bar from anywhere |
| `⌘⇧V` | Hold-to-talk; release commits |
| `⌘\` | Collapse or expand the command spine |
| `⌘⌥\` | Collapse or expand the left rail |
| `⌘⇧O` | Pop the workspace out; again re-docks it |
| `⌘⇧T` | Open the tenant-scope switcher |
| `⌘⇧X` | Exit the current tenant scope |
| `⌘.` | Interrupt the running act; she reports what she preserved |
| `⌘⇧D` | Detach the focused surface to its own window |
| `Esc` | Close the topmost slide-over; never the session |
| `⌘⇧L` | Toggle Obsidian / Mineral |
| `1 – 5` | Jump to a rail destination when the rail holds focus |
| `?` | Open the shortcut sheet |

Behavioural rules:

- Invocation changes geometry, not conversation. Closing a geometry never ends the session.
- Entering a tenant scope is an act: it writes an audit row, repaints the band, and drops
  every write affordance until the scope resolves.
- Read-only scope **degrades, never hides** — same surface, actions disabled and labelled.
- Focus is never trapped outside L4. Slide-overs and the spine use `aria-modal="false"`.
- Honest absence over invented value: any read with no substrate renders an em dash and the
  reason. No skeleton that resolves to nothing.

## 8. Accessibility

Theme default: **follow OS**, with a manual override that persists.

Contrast is computed from the token hex values rather than asserted. Measured at Stage 1
(4.5:1 AA threshold for text, 3:1 for non-text):

| Pair | Obsidian | Mineral |
|---|---|---|
| `--pg-ink` / `--pg-canvas` | 17.18:1 AAA | 15.71:1 AAA |
| `--pg-ink-2` / `--pg-canvas` | 12.52:1 AAA | 10.74:1 AAA |
| `--pg-muted` / `--pg-canvas` | 7.88:1 AAA | 5.71:1 AA |
| `--pg-faint` / `--pg-canvas` | 5.94:1 AA | 4.64:1 AA |
| `--pg-gold-core` / `--pg-surface` | 15.85:1 AAA | 6.14:1 AA |
| `--pg-ink` / `--pg-nav` (active rail label) | AAA | AAA |
| `--pg-gold` / `--pg-nav` (active tab + glyph, non-text) | 13.60:1 | 4.13:1 — clears 3:1 |

**Owner ruling, 2026-08-22.** Champagne on nav reaches only 4.13:1 in Mineral, so the active
rail **label** is `--pg-ink` in both themes and the champagne moves to the 24px tab and the
glyph. Both are non-text and clear the 3:1 threshold, and gold stays where it earns its
pixels.

Other notes:

- **Focus ring.** 2px `--pg-gold-core` at 3px offset, plus a 5px ground-coloured halo so the
  ring survives on both champagne and graphite grounds.
- **State is never colour alone.** Every status carries a rotated 7px square glyph and a
  text label.
- **Motion safety.** `prefers-reduced-motion` suppresses streaks, bloom, materialize and the
  spine pulse. Executed resolves as an instant fill change.
- **Live regions.** Scope changes, act completion and interruption announce through one
  polite live region. The command bar is `aria-live="off"`.
- **Hit targets.** 44px minimum on every interactive row at every viewport, including the
  72px compact rail and the collapsed spine.

## 9. Information architecture — owner-ruled 2026-08-22

**The rule.** A rail slot is a **body of work** with its own objects and its own
performance. A verb is a **capability** PAIGE calls from the command bar. A knob is a
**setting**. A list of past events is a **history tab** inside whatever produced it. Nothing
earns a permanent slot for being frequently used — only for being a place.

The owner's framing: *"I don't think we need a button or a menu tab for absolutely
everything… I think a good deal of this needs to be tools that she can call upon."*

### The six slots

Same six at every tier; only the contents change (owner ruling: one spine across tiers).

| Slot | Super Admin | Tenant tiers | Contains |
|---|---|---|---|
| **Fleet** / Clients | Live tenants under management | The client book | **Systems check** · Directory · History |
| **Relationships** | Prospective tenants, partners, resellers | Leads and prospects | People · Follow-ups · Segments |
| **Campaigns** | Platform outbound | Tenant outbound | Active · **Pipeline** · Sequences · Performance |
| **Marketplace** | Operator work and time | Same | Week · Approvals · Runs |
| **Analytics** | Cross-book reads + **platform health** | Cross-book reads | Fleet · Relationships · Campaigns · Autonomy · Platform health |
| **Settings** | Configuration and authority | Same | **Capabilities** · Governance · Team |

Counts on the Settings ladder and the Trust Compass line are tallied from the capability set
at render and move when a grant changes. No capability count is written as a literal — an
asserted figure nothing read is the §13 error, and this package is what Stage 3 builds
against.

**Two books, by ruling.** Fleet holds live tenants; Relationships holds who we are working
toward. They are different objects — conversion moves a record into Fleet and leaves its
relationship history behind. This was ruled against the one-book alternative, which makes
the spine six slots rather than five.

**Pipeline is a view inside Campaigns**, not its own slot. It first sat in Fleet on the
reasoning that a deal belongs to a tenant record; the owner moved it 2026-08-22 because a
deal belongs to the outbound motion that produced it, and most deals now originate in
Relationships rather than on a tenant that already exists.

**Deal foreign key — ruled 2026-08-22.** A deal points at the **relationship** (customer or
prospect), and carries `tenant_id` on the row for §9 RLS — direct-RLS, not reachable only
by join. This is what makes per-relationship pipelines work: a deal originating in
Relationships has somewhere to live before the party is a tenant, and conversion does not
re-parent it.

### Analytics renders as charts, not ledgers

Owner ruling 2026-08-22: every Analytics lens is graphs and charts, with typed rows kept to
the minimum. Four charts per lens; only Platform health retains a ledger, because its rows
are findings you act on rather than figures you read.

| Lens | Charts |
|---|---|
| Fleet | Live tenants (area line, 12w) · Seats per tenant (bars) · Risk grade (proportional stack) · Fleet MRR (**no series**) |
| Relationships | Lifecycle (funnel) · Follow-ups owed (bars, 8w) · Time to first contact (**no series**) · Source mix (**no series**) |
| Campaigns | Sends (area line, 12w) · Sequence step completion (bars) · Reply rate (**no series**) · Attribution (**no series**) |
| Autonomy | Grants by level (stack, **computed live** from the effective grants) · Ceiling over time (step line) · Acts held (bars) · Acts taken unattended (figure) |
| Platform health | Sweep outcome (stacked bars, 12 runs) · Checks that could not run (bars) · LLM error rate (line, 12w) · Time to acknowledge (**no series**) |

**A chart with no substrate draws no line.** It renders its plot area hatched with the reason
printed on it — "Money Spine deferred by owner ruling", "No model ties a send to a converted
relationship". Stage 3 must preserve this: a plausible curve on an unread series is the same
§13 failure as a fabricated figure, and harder to catch because a chart reads as measured.

**Grants by level is the one live chart.** It tallies the effective autonomy of all ten
capabilities after the ceiling clamp, so lowering the Trust Compass repaints it immediately.
Build it from the same tally that feeds the Settings ladder — never a second count.

**Analytics is both** — a slot that reads across the books, and a per-book performance view
for depth.

### What left the rail, and where it went

| Was a rail item | Now | Why |
|---|---|---|
| Run history | History tab inside Fleet | A list of past events belongs to what produced it |
| Systems check | Fleet's first tab, with the *readings* as an Analytics lens | The surface is where you act on findings; the trend is a reading |
| Alert rules | Settings → Governance | A rule is a knob |
| Alert firings | Analytics → Platform health | The firing is the reading; the rule is the knob |
| Team pulse | Settings → Team | A roster is configuration |
| Sandbox, web search, browser | Capabilities (⌘K) | Verbs, not places |

### Capabilities — the ten verbs

Reached from ⌘K. Each opens a surface that retires on close. Autonomy is the Trust Compass
grant, not a feature switch: **Draft only** composes but never delivers; **Ask first** opens
an L4 authority gate at the moment of the act; **Autonomous** acts and reports.

The **Default** column is the capability's own declared grant. The **Effective** column is
what ships, after the default Trust Compass ceiling of *Ask first* is applied (§6b) — build
against Effective; a capability declaring Autonomous is held until the operator raises the
ceiling.

| Capability | Scope | Default | Effective at ship | Substrate |
|---|---|---|---|---|
| Send an email | Current scope | Ask first | Ask first | Live |
| Run a sequence | Campaigns | Ask first | Ask first | Live |
| Write and run code (sandbox) | Sandbox only | Draft only | Draft only | **No substrate** |
| Connect a tool (MCP / API) | Platform | Ask first | Ask first | **Stage 3** |
| Search the web | Read-only | Autonomous | **Ask first** — held | **No substrate** |
| Open a page (browser) | Read-only | Draft only | Draft only | **No substrate** |
| Query the platform | Current scope | Autonomous | **Ask first** — held | Live |
| Run a systems sweep | Platform | Autonomous | **Ask first** — held | Live |
| Enter a tenant scope | Two-key | Ask first | Ask first | Live |
| Draft an alert rule | Platform | Draft only | Draft only | **Stage 3** |

Configuration has two doors that write the same record: Settings → Capabilities, and an
inline control in the conversation. Neither is a copy of the other.

### Stage 3 gating

`docs/doctrine/tier-matrix.md` enumerates tiers, resolvers and the five Fleet Console
sub-tabs but carries **no rail item list**. Each of the six slots needs its own §60
declaration in `src/lib/tier/tierFeatures.ts` before Stage 3 opens — a rail item without a
declared feature flag is the §56 pre-build miss. Capabilities need their own flag axis,
separate from slots, because a tier can hold a slot without holding every verb inside it.

### Icons

The 6 rail glyphs and 10 capability glyphs in the design artifact are hand-authored SVG
paths, because `lucide-react` — the icon system `src/prototype/TenantRedesign.tsx` actually
ships — cannot load in a bundler-less design page. **Stage 3 uses lucide, not these paths.**
Intended mapping so nobody re-invents seventeen glyphs:

| Slot / capability | lucide |
|---|---|
| Fleet | `Orbit` |
| Relationships | `Users` |
| Campaigns | `Megaphone` |
| Field | `LayoutGrid` |
| Analytics | `BarChart3` |
| Settings | `Settings` |
| Send an email | `Mail` |
| Run a sequence | `ListOrdered` |
| Write and run code | `Code2` |
| Connect a tool | `Plug` |
| Search the web | `Globe` |
| Open a page | `AppWindow` |
| Query the platform | `Search` |
| Run a systems sweep | `ShieldCheck` |
| Enter a tenant scope | `KeyRound` |
| Draft an alert rule | `BellRing` |

## 9a. Simultaneity — run and talk at once

Owner reference: the fictional operator-AI archetype — *"she runs things and talks
simultaneously"* — now the canonical
reference sentence for the execution strip, unprompted interjections and detached windows.
The requirement is not a personality, it is that **conversation and
execution are separate channels**.

- **Talking never blocks running.** The execution strip is pinned to the spine above the
  composer, outside the transcript's scroll container. Asking a question while a sweep runs
  never scrolls the sweep out of view.
- **She speaks unprompted.** Interjections arrive in the same thread and the same voice —
  not as notifications in a corner — ranked by whether they need an answer, and carrying the
  act that resolves them.
- **You can talk over her.** `⌘.` interrupts mid-act. She then reports what she *preserved*
  and what she dropped, rather than starting over or pretending it completed.
- **Nothing is modal except authority.** Every other surface materializes beside the work.

## 9b. Multi-monitor — the detached window

Every surface is already an independent geometry of one session, so detaching moves the
boundary rather than changing the model: the surface becomes an addressable route that
renders standalone, and session state travels between windows over a broadcast channel.
Conversation on one monitor, agents on another, the field on a third.

Three rules this forces, and they are design requirements rather than implementation detail:

1. **The tenant band repeats in every window.** Scope is per-session, not per-window. One
   monitor scoped into a tenant while another is not is how an operator acts on the wrong
   data. Switching scope anywhere repaints every window, and the band carries a window count
   when more than one is open.
2. **An authority gate surfaces in the window that raised it and locks the others.** A
   two-key gate on monitor two cannot be silently answered on monitor one.
3. **A window that loses its channel goes read-only and says so.** Never stale figures
   presented as current.

## 10. What Stage 3 must build

Grounded in the surface ledger in `docs/doctrine/tier-matrix.md`. A working backend is not
the same as a working tab.

| Surface | Route | What the design assumes | Substrate |
|---|---|---|---|
| Systems check | `/operator/fleet/systems-check` | Category drill-in, per-check evidence, full-sweep trigger | **Live** |
| Tenants · orbital field | `/operator/fleet/tenants` | Hash-seeded placement, weight-encoded gravity, audited act-as via `operator_enter_tenant` | **Live** |
| Tenants · morning brief counts | `/operator/fleet/tenants` | Amber and provisioning counts on the brief | **Stage 3** |
| Run history | `/operator/fleet/history` | Newest-first feed; an incomplete run reads "still running" | **Live** |
| Alert rules | `/operator/fleet/alert-rules` | Surface wiring (A4). Schema + evaluator ship; every KPI still reads null | **Stage 3** |
| Alert delivery | `/operator/fleet/alert-rules` | A3 via `_shared/channel-adapters.ts`. Every firing sits at `delivery_status='pending'` | **No substrate** |
| Team pulse · roster | `/operator/fleet/team-pulse` | `list_platform_staff()` and seat count | **Live** |
| Team pulse · utilisation | `/operator/fleet/team-pulse` | Operator activity tracking | **No substrate** |
| Fleet MRR | `/operator/fleet/*` | Money Spine — deferred by owner ruling; an intentional honest absence | **Deferred** |
| Command bar · voice | shell-wide | Speech capture and an operator-scope intent endpoint. No callable exists — `owner-context.ts` is a system-prompt composer, not an endpoint | **No substrate** |
| Command bar · narrative reads | shell-wide | Templated over real figures until an operator-scope narrative endpoint exists. Frame authored, every number read | **Templated** |


## Conversations — what was carried and what was cut

Relationships → Conversations is built from the shipped console (`src/agency/conversations.tsx`,
fixtures `CHANNELS` / `THREADS` / `CONV_CHANNEL_PERF`). People and Conversations are one record
seen two ways: the person rail is the object the People tab lists, not a summary of the thread.

**Carried:** the thread list, the thread, the channel picker on the composer, her draft held in
the composer, and the call / video / voice-note actions.

**Deliberately not carried into operator scope:** the five sibling sections in
`src/components/clients/ConversationsSubTabs.tsx` — Manual Actions, Snippets, Trigger Links,
Analytics, Settings. These are tenant-scope sales tooling; an operator works threads with
tenants and partners, not campaign furniture. Snippets and Analytics are the two most likely
to be wanted back, and both have a home already (Snippets under Settings → Automations,
channel performance under Analytics → Campaigns). **Open for Stage 2 sign-off** — if operator
scope needs any of the five, they return as sections of Conversations rather than rail slots.

**Substrate.** Email and SMS route through the existing send seam, so a send is real. WhatsApp
is Stage 3. **Voice has no substrate at all** — the call bar, timer, mute/hold/hand-to-PAIGE and
the live-call strip row are design only, and nothing dials.

## Automations — a behaviour, not a place

Follow-ups was a Relationships subtab and is not one. A follow-up is something she does, and the
record it keeps belongs to the automation that produced it. Settings → Automations holds eight:
follow-ups, pipeline hygiene, outbound calls, inbound triage, sequence stepping, provisioning
watch, sweep schedule, quiet-hours guard.

**The binding rule: an automation is not a new authority.** Each declares the capability id it
runs under, and its grant resolves through `effAutonomy(capId)` — the same path the Capabilities
tab uses. So the Trust Compass ceiling clamps automations identically: at the Observe ceiling
every automation reads **Held** and does not fire; at the shipping default ceiling (Ask first)
the ones declaring Autonomous read **Ask first**. An automation whose capability has no substrate
reads **No substrate** rather than any autonomy at all.

Stage 3 must not store an autonomy on the automation row. Store the capability id; resolve the
grant at read time.

## 11. Rulings — owner, 2026-08-22 evening

Locked. Stage 3 builds against these.

| Item | Ruling |
|---|---|
| Rail slot count | **Six, intended.** Fleet · Relationships · Campaigns · Marketplace · Analytics · Settings. Not five, not seven |
| Capability count | **Ten is canonical.** No eleventh verb. 3 autonomous · 4 ask first · 3 draft only, and every count derives from the capability set at read time |
| Deal foreign key | **Relationship** (customer or prospect), with `tenant_id` carried on the row for §9 RLS. A deal belongs to the party you are working with, not to your own tenant record. The carried `tenant_id` is direct-RLS, not reachable-by-join — same shape as `paige_systems_check_finding.tenant_id` |
| Identity marks | Locked as designed. Shape carries kind, rim carries lifecycle, uploaded asset or derived monogram — never a generated face or invented logo |
| Editing + provenance | Locked. `source` and `actor` per field; her edits are proposals through the grant |
| Facial recognition | **Out of scope for Stage 3.** See below |

### Facial recognition is not a Stage 3 detail

Brand-mark similarity matching on an asset a tenant uploaded is fine — the tenant owns the
asset and there are no consent implications. **Individual facial recognition is a different
product**: biometric consent, Illinois BIPA (a faceprint requires written consent),
retention limits, per-state jurisdictional gating.

Binding consequence for the asset store: **it must not be designed around faceprints at
MVP.** The identity mark is logo-file or monogram only. No face-upload path, no faceprint
storage, no recognise-this-person capability. A headshot arriving later from HR or a CRM is
an ordinary image asset and must not become a biometric record by default.

### Still open

1. **Brand file.** `docs/brand/paige-brand-identity.md` did not exist on `main`; it is
   created here from the owner-supplied board and is held for reconciliation with Cowork's
   doctrine layer (§18 one home). Cowork's push is blocked on GitHub MCP auth.
2. **Command Mark vs. §28.** Replacing what `PaigeSymbol territory="command"` renders
   changes the mark on every surface already rendering it, including the approved-frozen
   landing page. Confirm whether the freeze holds the orb there.
3. **Super Admin nav declaration.** The rail needs its own §60 entry in `tierFeatures.ts`.
4. **Missing input.** `docs/cowork-notes/paige-tenant-experience-synthesis.md` is cited in
   the Stage 1 brief and does not exist on `main`.


## 13. Delta since the last sync — People, the console, the wire, editing

Recorded here per owner instruction so Stage 3 has one authoritative read while Cowork's
push to `docs/cowork-notes/paige-tenant-experience-synthesis.md` §4 and §10 is blocked on
GitHub MCP auth.

### People is the database, not a list of leads

One book holds every party. A row is a **company or a person** — a type column, one shared
detail. Lifecycle, not location, decides what someone is: becoming a client moves them into
Fleet **without leaving this log**, so the running record of everyone survives conversion.

Segments across the top with live counts: All · Clients · Prospects · People · Companies.
Dense table on the left, detail on the right; below 720px the pane folds to one-at-a-time
with a back step rather than disappearing.

**Ten detail tabs.** Identity · Business · Documents · Billing render as field lists.
Vault · Portal · Conversations · Deals · Notes · Activity are panels with their own shape.

### PII: masked is a display state, absent is a fact

Owner ruling: masked values reveal on click with no gate, audited silently.

Two states that must never collapse into one:

- `•••-••-••••` — **we hold this value and are hiding it.**
- `— not on file` — **we do not have it.**

A record that renders a mask over nothing is claiming to hold an EIN it never received.
The digits live on the record; masking is presentation. A reveal is therefore stable and
shows what is on file — never a plausible number generated at render time.

### Identity marks

Shape carries kind: a rounded plate is a company, a disc is a person. The rim carries
lifecycle tone. An uploaded logo or photo fills the mark; with nothing on file, a monogram
derived from the record's own name. **No generated face, no invented logo** — a mark that
looks real when nothing was uploaded is the same class of error as a fabricated figure.

Asset upload has no substrate. Stage 3 owns the store and the per-record asset reference.

### The Vault is shared, so attribution is the design

Owner ruling: the operator reads and writes the Vault on the client's behalf. That makes
**who last wrote each item** the load-bearing fact, and every item carries it — ours or
theirs. Shared access without per-item attribution cannot ship: without it, neither side can
tell what the other changed.

### The portal is where smart and static differ

A static portal shows records. A **smart portal gives the client their own PAIGE**, acting
inside their portal under the autonomy we grant.

The significant Stage 3 consequence: **the Trust Compass currently governs one actor.** A
smart portal needs it to govern a second — a client-side grant, bounded by the operator's
ceiling, with its own audit destination. Portal configuration stays in Settings; invite,
impersonate and last-seen live on the record.

### Editing — manual and proposed, both with provenance

Any field can be corrected in place. A masked field reveals when edited, because a value
cannot be corrected while hidden.

**Every field carries where its value came from**, and the distinction is the point:

| Provenance | Means |
|---|---|
| `From their form submission · 12 Feb` | The client's own typing, unverified |
| `Confirmed on a call · 3 Mar` | A human checked it |
| `Corrected by you · just now` | Edited here, with your name on it |

This is what makes the bad-submission case legible: a client mistypes a phone number on a
form, we follow up, and the field shows both that it was wrong and who fixed it.

**PAIGE's edit is an act under her grant, not a write.** Ask first lands it as a proposal
with the reason attached and Accept / Reject on an authority-edged row. Autonomous lands it
and reports. Draft only composes and waits. Same field, same mechanism — the grant decides.
Rejection carries the reason back to her, so a refusal is information rather than silence.

**Two data-model consequences, both binding:**

1. **`source` and `actor` belong on every field, not just a value.** A record that stores
   only the current value cannot answer who claimed it or whether anyone checked.
2. **A proposal is its own object with a lifecycle.** A proposal she made that nobody
   answered is a different state from one that was refused, and collapsing them loses the
   fact that a person declined.

### The status wire

The chip beside a surface title reports what is happening **on that surface**. One grammar,
six vocabularies.

| State | Motion | Means |
|---|---|---|
| Live / Partial / Representative | none | Substrate. Resting |
| Thinking / Listening | diamond rotates, violet | She is composing |
| Working | diamond fills, champagne sweep along the rail | An act is in flight |
| Waiting on you | diamond breathes, gold | Held for your word |
| Held | hollow, muted, still | The ceiling is at Observe |

Substrate rests underneath and always returns. The wire cycles only when it has more than
one thing to say.

**Two rules keep it from becoming a notification bar.** A wire reports only its own surface
— a sequence running in Campaigns does not appear in Fleet. And only Fleet may speak for the
platform. Where else to look is the **rail's** job: a gold diamond marks a book with
something genuinely waiting; a muted mark means it is waiting on representative data.

**Text describes, motion claims.** A representative surface reads its vocabulary in the
resting treatment and never animates as though work were happening — otherwise the most
reassuring animation in the shell would be running over data nobody connected.

### Layout constraint Stage 3 will hit

Three separate defects in this build had one cause: **grid and flex children default to
`min-width: auto` / `min-height: auto`**, so content sizes the track instead of the
container — silently clipped wherever overflow is hidden. It hit the shell columns, the
console panes, and the rail. Every grid or flex child in this shell needs an explicit
`min-width: 0` / `min-height: 0`.

Related: **an empty `src` is still a network request**, and an unresolved `src` hole
becomes a literal URL the browser fetches. Image-bearing marks carry their asset as a
background on the style object, so a record with nothing on file fetches nothing.

## 12. Sequence

1. **Stage 1** — design refinement. Delivered.
2. **Stage 2** — shared design system approval. Owner + Cowork sign off on tokens,
   components and nav rules. ← *here*
3. **Stage 3** — Codex frontend implementation on `stage3-super-admin-redesign`, cut from
   `main` (Task #11).
4. **Stage 4** — CC integrates connected backend, surface by surface.
5. **Stage 5** — Cowork joint verification per surface before it replaces the live version.
