# Billing Foundation C — the Solo Billing screen

**Status: RELEASED — merged `11997dac` 2026-09-03 (PR #833)**, under the owner's MVP release
cadence: functionally complete, ordinary checks green (`verify` + `audit` success on the exact head,
Vercel deployed, Supabase Preview skipped — the slice carries **no migration**), no merge conflict,
no outstanding security or tenant-isolation defect.

**Release status: `PARTIAL` / `Authenticated Runtime Proof Owed`.** No production write of any kind
was made by this slice: no migration, no Stripe object, no billing-state mutation, no email.
`PLATFORM_BILLING_PORTAL_ENABLED` stays off. The post-release audit backlog is §9.

Consumes: Gate 1 packet (`docs/delivery/platform-billing-gate1-packet.md`, rulings R1–R27) and the
Foundation A seams (`docs/delivery/billing-foundation-a-design.md`, live as `f455d8a5`).

---

## 1. The §69 pre-edit packet

**Mode / depth.** Existing project · new feature + security · **Deep (R3 — payments, permissions)**,
which carries an independent review on the exact final head.

**Grounded on** `main` `03d771f9` (the merge of #830), clean tree, branch
`claude/platform-billing-clarification-l6zqr5` restarted from it.

**Affected actor-goal flows.**

| # | Actor | Goal |
|---|---|---|
| F1 | Solo owner | Learn what this workspace pays the platform, truthfully |
| F2 | Solo owner | Open the provider's page for invoices and the payment method, or learn why not |
| F3 | Solo owner | Name who receives this workspace's billing notices, and change it |
| F5 | Solo admin / member | Understand that billing acts are the owner's |
| F6 | Owner of several workspaces | Switch workspace and see the right billing |
| F7 | Sub-account owner | See that platform billing is not applicable here yet |
| F8 | Solo owner | Not look for client invoices here |

**File and contract ownership, and the collision result.** Everything shipped lives under
`src/solo/**` plus `scripts/live-drive/**` and `docs/**`. **No shared module** under `src/lib`,
`src/hooks`, `src/components` or shared routing/auth was changed, so no scoped exception was needed.
Checked for collision: `settings.tsx` (the Settings shell and its scroll ownership — untouched
except the destination switch and the primitive import), `settings-contract.ts` (the destination
list and its `PARTIAL` truth label — unchanged, and `settings-contract.test.ts:20` still passes),
`team-workspace.tsx` (owns `get_solo_team_workspace`; Billing reads it, never writes through it),
`settings-setup.tsx` / `settings-integrations.tsx` (siblings, untouched), and the Connections
"Billing for messaging" card, which is messaging readiness and a different concern.

**Changed-file boundary.**

| File | What |
|---|---|
| `src/solo/billing-contract.ts` (new) | the presentation contract — a pure resolver |
| `src/solo/billing-contract.test.ts` (new) | its negative properties |
| `src/solo/settings-billing.tsx` (new) | the cards (four, after the client-billing boundary moved to Sales — §10) |
| `src/solo/settings-billing.test.tsx` (new) | the flows, driven |
| `src/solo/settings-primitives.tsx` (new) | `Card` · `Field` · `Status` · `Truth` · `ReadState` · `Outcome` · `NotYours`, moved verbatim out of `settings.tsx` |
| `src/solo/data/useWorkspaceBillingCandidates.ts` (new) | who may be designated, from the existing roster read |
| `src/solo/settings.tsx` | old `BillingView` deleted; primitives imported; destination switched |
| `scripts/live-drive/settings-billing-drive.mjs` (new) | the rendered drive |
| `scripts/live-drive/harness/connections-mount/supabase-stub.ts` | the billing seams added to the SHARED stub (§18) |
| `docs/**` | this doc, the tier matrix, the brain, the master doc, the surface card |

**States covered.** loading · read failed + retry · no workspace · sub-account · agency/enterprise ·
unavailable × 5 causes · no plan · trial · trial ended · promotional · paid active · cancel
scheduled · canceled · portal entry / unavailable / not applicable / role refusal / unreadable ·
contacts empty · designated · ineligible-but-kept · owner-only refusal · unreadable + retry ·
read-only · roster unreadable · roster for the wrong workspace · workspace switch · late answer
dropped · cancelled confirm.

**Regression impact map.** `settings.tsx` (every destination renders through the moved primitives —
covered by the 56-file Solo suite, all green), the Settings destination list and its scroll policy
(untouched, asserted by `settings-contract.test.ts` and `settings.scroll-policy.test.tsx`), the
shared harness stub (`connections-mount`) which the Calendars and Setup drives also use — extended
only by ADDING seams, never by changing an existing answer.

**Failing-first plan.** The contract test was written against the resolver and run before the view
existed; the flow test was written before the view was correct, and it caught the two defects
recorded in §5.

**Gates.** Gate 1 is the approved Billing packet and its 34-state prototype. The **plan** and
**manage-billing** cards are ported from it, with the deviations in §3a.

**THE CONTACTS CARD IS NOT COVERED BY IT, AND THAT IS A GATE THAT WAS SKIPPED (§00/§69).** The
Gate-1 prototype predates the billing-notice rulings by hours; grepping it for `billing contact`,
`delegate` or `designat` returns **zero hits**. Its *function* is owner-ruled in detail (R18–R27)
and most of its copy is dictated by those rulings and by Foundation A's server refusal vocabulary —
but its card states, its two forms and its eligibility wording were composed here, and §00 is
explicit that a surface not in the pack goes back to Claude Design rather than being filled in by
Claude Code. It is built from the existing Settings kit with zero new CSS, which limits the damage;
it does not discharge the gate. **This is named in the Gate B packet as owed to CD / the owner, and
is not claimed as approved.** Gate 2 (merge / deploy) is not requested by this doc.

---

## 2. The rule the slice exists to hold

**A state is reachable only from a record that proves it.** No inference, no fallback, no default.

The shipped tab broke it. It read `get_tenant_platform_subscription()`, joined the row to
**`platform_subscription_plans`** — the price LIST — and rendered:

> Plan **Solo** · Status **active** · Price **$149.00/mo** · Renews **5 Aug 2027**

Prod, queried 2026-09-03 on ref `xygzykjyynhzqytbqnzu`: four `platform_subscriptions` rows, **every
one** with `stripe_customer_id IS NULL` and `stripe_subscription_id IS NULL`; three carry
`metadata.test_seed: true` (`seeded_by: cowork_wave_3_9_verification`, `cleanup_when: Wave 8 Stripe
wire-up`), the fourth `revenue_class: promotional`, `provider_state: not_created`. Nothing there is
a charge, and `current_period_end` is a seeded date, not a renewal.

So the catalogue is **not an input** to this screen. That is asserted, not merely avoided:
`billing-contract.test.ts` walks every state the resolver can reach and fails on any `$` in the
heading, body, note or fields; the drive re-asserts it against the rendered DOM at every viewport,
in both palettes, and again after the writes.

---

## 3. The presentation contract

`src/solo/billing-contract.ts` is pure and directly assertable. Its inputs are the authority read
plus the entitlement projection; its output is one approved state id, its copy, its fields, and —
for an unavailable — its cause.

**Precedence.** loading → failed read → no workspace → sub-account → agency/enterprise → **mapping
truth** (ambiguous, then absent) → **entitlement**. Mapping is checked before the entitlement
because an ambiguous or absent mapping is a fact about the workspace that no later read corrects.

**The five distinct unavailable causes.** `no_billing_account` · `billing_records_need_review` ·
`no_entitlement_source` · `entitlement_conflict` · `unsupported_status`. A bare "unavailable" reads,
to the person, exactly like "you have nothing" — which is a claim about their account that nobody
verified. `unsupported_status` is the honest answer for a real status with no approved wording
(`past_due`): reported with its cause rather than dressed up as a state that was never designed.

**Why `entitlement` is `null` today.** The projection is **Foundation B** — Gate 1 packet §4.3 R11:
*"built in Foundation B, consumed in Foundation C — the Solo UI never invents access state
locally."* The interface here is R11's projection field for field, so B feeds this same resolver and
the paid / trial / promotional branches light up with no rewrite. `null` means *no read can answer
this*, and resolves to `billing-unavailable · no_entitlement_source` — **never** to "no plan".

**R13, held structurally.** Promotional access is reachable only from `source: "promotional_grant"`.
A test enumerates every input this slice can produce and asserts none of them yields `plan-promo`.
"No subscription found, therefore promotional" cannot be written through this resolver.

### 3a. Deviations from the Gate-1 vocabulary, disclosed

| Deviation | What | Why |
|---|---|---|
| **Added** `plan-no-workspace` | no workspace is selected | the prototype had no such state; `plan-none` would have been a claim about an account nobody identified |
| **Added** `portal-not-applicable` | the portal card outside a top-level Solo workspace | the prototype expressed this by hiding the card; a state id makes it assertable |
| **Added** `portal-unreadable` | the authority read failed | rendering `portal-not-applicable` for a failed read states an account fact nobody checked |
| **Added** `mapping_unknown` (a reason, not a state) | the server reported a mapping state this screen does not model | the alternative was a default that fell through into a positive claim — see §5 |
| **Collapsed** `plan-beta` → `plan-current` | an active paid entitlement renders as the current plan | the $74.50 beta price does not exist on the platform; `plan-beta` is unreachable until the provider release. **Foundation B must not assume it exists** — see §7 |
| **Shortened** `plan-none`, `plan-trial-ended` | drop *"the owner can choose a plan once plan selection is available"* | plan selection is not offered anywhere on this surface; the clause would point at a control that is not there |
| **Shortened** `plan-cancel-scheduled` | drops *"The owner can reverse this from the billing portal"* | the portal refuses every caller today |
| **Added** `role-refusal` on the PLAN card | a Solo member who may not view billing | R22 — see §4a. The id itself is approved (packet §9.1, F5); applying it to the plan card is the new part |

---

## 4. What is genuinely interactive

**Billing contacts and notices**, and it is the whole §70.1 claim of the slice.

An owner picks a **primary billing contact** (a current owner) or a **billing delegate** (a current
admin), the write goes to the Owner-only RPC with the structural eligibility trigger behind it, the
list is **re-read from the server** rather than patched locally, and the designation is there on a
fresh mount. Removal asks first, and the last primary contact's confirmation says what the workspace
would lose.

Prod supports this today: four top-level Solo workspaces, each with exactly one verified active
owner, two of them with two verified admins.

### 4a. R22, and the half of it that was missing

Receive, view and manage are three permissions. The surface held **manage** (every act, both forms
and the roster read are gated on `can_manage_billing`) and **receive** (the designation is
rendered) — and consumed `can_view_billing` **nowhere**. That is harmless while no plan data
exists and becomes a leak the moment Foundation B supplies a price and a renewal date, because
`PlanCard` would render them to any member. An independent compliance read caught it.

The plan card now resolves to `role-refusal` for a top-level Solo caller whose server-derived
`can_view_billing` is false, and the resolver asserts that a refused viewer receives **no** field
and no figure even when the entitlement carries one. The tier-matrix row that previously read *"the
plan is not a secret; only the ACTS are Owner-only"* was **wrong** — it recorded a deviation from
R22 that no owner ruling supports — and is corrected.

**The candidate list is the existing roster read** (`get_solo_team_workspace`) — §18, no second
roster query family and no new server seam. It narrows by ROLE only; the real gate is the database
trigger, which also requires a confirmed email and re-checks ownership live. Email verification is
not exposed by the roster read and is therefore **not guessed at**: an unverified person may be
offered, and the server's `billing_contact_email_unverified` is shown verbatim. The roster is read
**only** when the caller could actually designate from it (§9 least privilege).

**Terminology (R27), on the surface itself:** *"These are billing-notice designations only. Naming
someone here does not change who owns this workspace, and it grants no ownership, equity or
co-owner status of any kind."* Receive / view / manage stay three separate permissions.

**Delivery, on the surface itself:** *"Billing notices are not being sent yet — no sender exists on
the platform for them."*

**Foundation A's own terminology was re-checked** as the owner asked: `grep -ri "billing owner"`
across `supabase/`, `src/` and `docs/` returns two hits, both records of the correction itself (the
A design doc noting the label is gone, and the decision-log entry). No repair was needed.

---

## 5. Two defects the driven tests caught before anything shipped

1. **A failed read rendered as a statement about the account.** `authority.authority` is `null` while
   the read is in flight and after it fails. The portal card would have rendered *"not applicable to
   this account type"* and the contacts card *"your access here is read-only"* — two claims nobody
   checked — for a read that merely failed. Both now say the read failed and offer a retry.
2. **"No current workspace owner is available to designate", immediately after the owner was
   designated.** Visible in the rendered frame, not in any assertion that existed at the time.
   *Nobody is left to choose* and *this workspace has nobody eligible* are different facts, and the
   second reads as a claim that the workspace has no owner. They now read differently, and both are
   asserted.

### 5a. Found by the independent reviewers, on the pushed head

| # | Finding | Fix |
|---|---|---|
| A1 | A **failed** roster read rendered as *"this workspace has nobody eligible"* — an empty list from an answer nobody received, printed as a fact about the account | `DesignateForm` takes `rosterUnreadable` and renders nothing; the read failure is stated once, above |
| A2 | A write outcome survived a workspace switch: *"Primary billing contact set for this workspace."* under a workspace where nothing was set, and a portal refusal under a workspace where the portal was never pressed | the two acting cards are keyed on the active workspace, so an outcome cannot outlive the workspace it reports on |
| A3 | An unrecognised `billing_account_state` at Solo scope fell **through** the mapping guards into *"this workspace has a billing account"* **and an enabled "Manage billing" button** — a positive claim and a money act produced by a default | both resolvers now read *"only `mapped` may proceed"*; anything else is unavailable, with `mapping_unknown` for a state this screen does not model |
| A4 | The shared harness stub restores its store verbatim from `sessionStorage`, so a store written before the billing tables existed threw synchronously and pinned the card at "Clearing and resolving…" | the seed is spread underneath the stored store |
| C1 | **§58** — the shipped *"Usage & limits"* card was deleted with no call-out anywhere | **restored**, with its shipped copy unchanged. Removing a shipped card is an owner decision, not a side effect of rewriting the cards either side of it |
| C2 | **§00/§69** — the contacts card has no Gate-1 prototype | disclosed above and in the Gate B packet; **not** claimed as approved |
| C3 | **R22** — `can_view_billing` consumed nowhere | §4a |
| C4–C7 | over-claimed test scope, a wrong producer inventory, an over-claimed vocabulary port, a wrong test split | corrected in this doc, the decision log and the master doc |
| C8 | **§57** — Connections still renders *"Solo plan · LIVE"* from the same catalogue join this slice disqualifies | disclosed in §8 |

Each of A1–A3 was proven non-vacuous: reverting the fix turns the new test red (1, 2 and 6 tests
respectively). A **third** round then verified every fix on the merged head and found one more:

| # | Finding | Fix |
|---|---|---|
| R1 (LOW) | A3 was fixed on the plan card and left **half-fixed** on the portal card. The `!== "mapped"` gate was applied, but its copy kept only two arms — so an unmodelled mapping state still asserted *"this workspace has no billing account linked to it yet"*, a positive claim that contradicted the plan card a few pixels above. Failing closed is not the same as saying something true, and the test asserted only `canOpen`, never the body | third arm added; the test now asserts the body, not just the button |

Round three also independently confirmed, by walking the precedence: **there is no path by which a
price or a renewal reaches a caller with `can_view_billing === false`**; that keying the cards adds
no remount loop, no double-fetch and no lost in-flight act (the portal's `workspace_changed` guard
lives in the un-keyed hook); that the restored Usage card is byte-identical to the shipped one; and
that the harness seed-under-store cannot resurrect a deleted row, because `delete` persists an empty
array and a stored `[]` always wins over the seed.

---

## 9. Post-release audit backlog

Released under the owner's MVP release cadence with these recorded honestly rather than held as
blockers:

| Item | Status |
|---|---|
| Authenticated owner drive on the deployed surface | **Authenticated Runtime Proof Owed.** `curl` reaches prod; the browser cannot (`ERR_CONNECTION_RESET` — the sandbox proxy forwards only tool hosts), and `LIVE_DRIVE_EMAIL`/`LIVE_DRIVE_PASSWORD` are unset. Needs a browser-capable session or the owner's own look |
| Gate-1 pass on the billing-contacts card | **Owed to Claude Design (§00).** The approved prototype has zero hits for `billing contact` / `delegate` / `designat`. Function is owner-ruled (R18–R27); states and wording were composed here |
| §57 — Connections still renders "Solo plan · LIVE" from the catalogue join this slice disqualifies | Pre-existing, outside this boundary. Its own slice |
| `useSoloComms().billing` is now read by nothing | Its three-query fetch still runs on Connections and Setup. Removing it touches two other destinations |
| `plan-beta` collapsed into `plan-current` | Foundation B must distinguish it when the $74.50 price exists (§7) |
| `past_due` has no approved wording | Reported as `unsupported_status`; a state and its copy are a Claude Design decision (§00) |

---

## 6. Evidence, separated by class (§13 / §70.1)

| Class | This slice |
|---|---|
| Automated tests | **71 new — 35 contract + 36 driven flow** (counted, not estimated). Full suite **179 files / 2334 tests passed** on the head with `origin/main` merged in |
| Static / build | `tsc --noEmit` clean on the new files · `ci:tsc` ratchet **unchanged (13 → 13)** · `npm run build` green · `eslint` clean on every changed file · `lint:tier-features`, `lint:skeleton` pass. `lint:gold` fails on `src/components/dashboard/BusinessCreditDashboard.tsx`, verified **pre-existing on `main`** |
| Structural / harness render | `scripts/live-drive/settings-billing-drive.mjs` — **116/116**, 4 viewports × 2 palettes + failed-read + read-only. Frames watermarked `HARNESS RENDER · NOT LIVE` in `scripts/live-drive/artifacts/settings-billing/` (gitignored) |
| Prod reads (grounding, no write) | subscription rows and their metadata · revenue classifications · verified owner/admin counts per top-level workspace · the shipped definitions of `get_workspace_billing_authority`, `get_workspace_billing_contacts`, `get_tenant_platform_subscription`, `get_tenant_revenue_breakdown` and the `tenant_revenue_classification` policy |
| **Authenticated runtime on the deployed surface** | **NOT DRIVEN — OWED.** The harness transport is a stub; a local render is not a deployed one (§32.c). Release status stays `PARTIAL` / `Authenticated Runtime Proof Owed` |
| UNVERIFIED | whether the deployed bundle renders identically; the portal refusal path against the live edge function (the flag is off, so `not_enabled` is expected and untested live) |

---

## 7. The seam with Foundation B, stated so B does not have to guess

B builds the entitlement projection. When it lands it should:

1. return R11's shape, which `WorkspaceBillingEntitlement` mirrors field for field;
2. feed it into `resolveBillingPlanPresentation` — **the only** change needed in `settings-billing.tsx`
   is replacing the literal `entitlement: null`;
3. decide `past_due`. It currently resolves to `billing-unavailable · unsupported_status` because no
   approved wording exists for it; a state and its copy are a Claude Design decision (§00), not one
   this slice may make;
4. keep R13 intact: the projection returns `source: "none"` when it looked and found nothing, and
   something else when it could not look. Collapsing those two is the one change that would make
   this screen lie again.

5. know that **`plan-beta` is collapsed into `plan-current`** (§3a). When the $74.50 beta price is
   created, the resolver needs a branch that distinguishes it, or the paid beta plan will render as
   an ordinary current plan;
6. respect **R22** (§4a): the projection's price and renewal reach only a caller whose
   `can_view_billing` is true. The resolver enforces it; a future surface must not route around it.

`docs/handoff/platform-billing-spine-source-contract.md` §2 gains no field from Foundation C — the
authority read is unchanged. This slice adds a **consumer**, not a contract.

---

## 8. Known divergences, disclosed rather than fixed here

- **§57 — Settings › Connections still says "Solo plan · LIVE".** `billingStep` in
  `src/solo/settings.tsx` renders a plan name with truth `LIVE` from `tenant_comms_readiness`,
  which joins `platform_subscriptions` to `platform_subscription_plans` — the same join this
  slice's whole argument disqualifies. After this merges, Billing says *"the platform could not
  find a billing account linked to this workspace… nothing is being charged"* while Connections,
  two tabs away in the same shell, asserts a plan. It is **not introduced by this PR** and sits
  outside the changed-file boundary, so it is recorded rather than swept in. The design doc's
  collision check dismissed that card as "messaging readiness, a different concern", which is true
  of its framing and not true of its `plan_name` assertion. Owed as its own slice.
- **`useSoloComms().billing` is now consumed by nothing.** Billing was its only reader. Its
  three-query billing fetch still runs on Connections and Setup for a value nobody reads. Removing
  it changes two other destinations, so it is not done here.


---

## 10. Post-release boundary correction (owner, 2026-09-03)

Looking at the released screen, the owner ruled the **"What you charge your clients"** card out of
place and moved it to **Campaigns → Sales**:

> "We don't need this inside of the billing area because this is the tenant billing their customers.
> That will happen inside of sales. Billing is for us, our platform billing the tenant."

Done. The card is removed from `settings-billing.tsx` and renders on `Campaigns › Sales`
(`src/solo/growth2.tsx`, `ClientBillingBoundary`) — client charges run on the tenant's own
processor, Paige is never merchant of record for them (§38 / §197 LAYER 2), and it points back to
Settings → Billing for what the workspace pays the platform. The Billing test that asserted the
card's presence is **inverted** to assert its absence, and the drive gained a per-frame check that
no client-billing wording returns there, because a boundary that only lives in a commit message
drifts back.

**One card was deliberately NOT moved, and it was raised rather than assumed.** The owner's message
grouped *Invoices & payment method* with it. That card is the tenant's invoices **from Paige** and
the payment method they would pay Paige with — **platform billing by the owner's own definition**.
Moving it would have removed the workspace's only route to its own platform invoices (§58) and
contradicted the very rule being applied, so it stays and the distinction is stated here.

Billing now renders four cards: Platform subscription · Billing contacts and notices · Invoices &
payment method · Usage & limits. Drive **124/124**.
