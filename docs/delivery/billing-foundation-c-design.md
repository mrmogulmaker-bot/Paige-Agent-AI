# Billing Foundation C — the Solo Billing screen

**Status: BUILT, NOT MERGED (PR #833).** No production write of any kind: no migration, no Stripe
object, no billing-state mutation, no email. `PLATFORM_BILLING_PORTAL_ENABLED` stays off.

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
| `src/solo/settings-billing.tsx` (new) | the four cards |
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

**Gates.** Gate 1 is the approved Billing packet and its 34-state prototype; the states and copy
here are ported from it. Gate 2 (merge / deploy) is not requested by this doc.

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

---

## 6. Evidence, separated by class (§13 / §70.1)

| Class | This slice |
|---|---|
| Automated tests | 58 new (31 contract + 27 driven flow). Full suite **167 files / 2052 tests passed** |
| Static / build | `tsc --noEmit` clean on the new files · `ci:tsc` ratchet **unchanged (13 → 13)** · `npm run build` green · `eslint` clean on every changed file · `lint:tier-features`, `lint:skeleton` pass. `lint:gold` fails on `src/components/dashboard/BusinessCreditDashboard.tsx`, verified **pre-existing on `main`** |
| Structural / harness render | `scripts/live-drive/settings-billing-drive.mjs` — **108/108**, 4 viewports × 2 palettes + failed-read + read-only. Frames watermarked `HARNESS RENDER · NOT LIVE` in `scripts/live-drive/artifacts/settings-billing/` (gitignored) |
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

`docs/handoff/platform-billing-spine-source-contract.md` §2 gains no field from Foundation C — the
authority read is unchanged. This slice adds a **consumer**, not a contract.
