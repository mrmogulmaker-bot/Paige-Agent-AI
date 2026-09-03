# Surface card — Billing (Solo Settings → Billing)

**Truth label: `PARTIAL`.** It stays `PARTIAL`, and what it means CHANGED with Foundation C
(PR #833, **released** `11997dac` 2026-09-03).

*Before C (what WAS deployed until 2026-09-03):* the owner read a plan name, status, **price and renewal** from
a tenant-scoped seam — and those last two were fabricated. The price came from the plan CATALOGUE
and the renewal from a seeded `current_period_end`; every live `platform_subscriptions` row carries
a NULL Stripe customer and subscription id. See `docs/delivery/billing-foundation-c-design.md` §2.

*After C — what is deployed now:* no plan, price, renewal, invoice or payment method is stated at all, because no record
proves one — every current workspace resolves to an explained `billing-unavailable`. What becomes
real instead is **billing contacts and notices**: an owner can designate the workspace's primary
billing contact, add and remove a billing delegate, and see it hold across a reload. That is a
billing act an owner can complete, so the surface is no longer read-only — but the label does not
move to `LIVE` until an authenticated owner drives it on the deployed platform (§70/§32.c).

Written 2026-09-02 against `main` `1fb7928` for the Platform Billing Phase 1 packet
(`docs/delivery/platform-billing-gate1-packet.md`); **updated 2026-09-03 for the Foundation C
release** (`11997dac`). **Describes the department as it is.** Where a column or clause below
describes the pre-C surface it says so explicitly — an independent review caught three places
where it still read as current, which on this card is exactly the wrong answer to give a
maintainer.

## Owner job and user flow

A Solo owner opens Settings → Billing to learn what their **workspace** pays the platform, when it
renews, how much of the included allowance is used, which paid add-ons are active, and to update a
card or download an invoice.

**Before Foundation C** the flow ended at the first step, and that step was not true: the plan,
price and renewal were read from the plan CATALOGUE, not from anything the workspace is charged.

**As deployed now,** the owner learns the truthful state of their billing setup — for every current
workspace that is *"no billing account linked · nothing is being charged"*, stated with its cause —
and can complete exactly one billing act: **naming who receives this workspace's billing notices**
(a primary billing contact, and an optional delegate). Plan, price, renewal, invoices, payment
method, allowance and add-ons are all still unavailable, each saying why.

**Not this surface's job:** what the owner charges their own customers. That is **Campaigns →
Sales** (client billing, §197 LAYER 2, tenant's own processor per §38). Foundation C originally
carried a "What you charge your clients" pointer card here; the owner moved it to Sales on
2026-09-03, because Billing is one direction of money only — the platform billing this workspace —
and a card about the other direction sitting on this surface invited exactly the confusion the
boundary exists to prevent. It renders on `Campaigns › Sales` as the `ClientBillingBoundary` block.

## Tenant data / domain owner

| Truth | Owner |
|---|---|
| Plan catalogue | `platform_subscription_plans` (rows exist only via migration; `solo` $149/mo, `agency` $397/mo, `enterprise` custom) |
| Workspace subscription | `platform_subscriptions` — sole writer is `stripe-webhook` (service role, signed `platform_plan_slug` metadata) |
| Read seam | `get_tenant_platform_subscription()` (tenant derived server-side) |
| Role gate | `is_current_user_tenant_admin()` |
| Invoices | `platform_invoices` — **no writer anywhere**; Stripe holds the truth |
| Usage | `platform_usage_events` (`llm_tokens`, `tts_char`, `tenant_provisioned`); no allowance model |
| Add-ons | `marketplace_items` / `marketplace_installs` / `marketplace_install_ledger` |

## Solo shell placement

Settings → Billing, eighth of eight Settings destinations. Icon `CircleDollarSign`. Form-fitting
(not on the visible-scroll list; `src/components/tenant-shell/settings-scroll-contract.ts`).

*Deployed now (Foundation C, `11997dac`):* rendered by `SoloBillingView` in `src/solo/settings-billing.tsx`,
whose states come from the pure `src/solo/billing-contract.ts` and whose data comes from
`useWorkspaceBillingAuthority` + `useWorkspaceBillingContacts` + `useWorkspaceBillingCandidates`.
**Billing no longer reads `get_tenant_platform_subscription()` or the plan catalogue at all.**

*Before Foundation C:* rendered by `BillingView` inside `settings.tsx`, fed by `useSoloComms` —
**removed**, not still present.

## States

| State | Before Foundation C (removed) | **Deployed now** (Foundation C, `11997dac`) |
|---|---|---|
| create | N/A — the CREATE leg is `platform-subscription-checkout` from onboarding | unchanged; plan selection is still not offered here |
| edit | none | **real** — designate the primary billing contact, add a billing delegate |
| save | none | **real** — the Owner-only RPC, then a server re-read; it holds across a reload |
| cancel | none | **real** — revoke a designation, behind a confirm that says what is lost |
| retry | `ReadState` retry on a failed read | real, on the authority read AND the contacts read, each with its own cause |
| empty | "No current Solo subscription record was returned." — **true for a solo with no plan, false for a sub-account** | that sentence is gone. An unmapped workspace says *"could not find a billing account linked to this workspace … nothing is being charged"*; a sub-account says *"not because there is no plan"*; "Choose a plan" needs a successful read that found none |
| loading | "Clearing and resolving this account…" | unchanged |
| permission | `canManage` computed and consumed by nothing | `can_manage_billing` gates every act, both designate forms and the roster read; `can_view_billing` (R22, Owner-only in A) refuses the plan card to a Solo member — it was consumed by nothing until a compliance read caught it |
| usage | "Usage & limits" card, `UNAVAILABLE` | **unchanged and still present.** Foundation C deleted it and the removal was caught as a §58 regression and reverted; packet §9 flow F3 keeps its only presence on this surface |

## What PAIGE can read

`get_tenant_platform_subscription()` is `GRANT EXECUTE … TO authenticated` and tenant-pinned, so
PAIGE can answer "what plan is this workspace on" from chat (§10). She cannot read invoices, usage
totals, allowance, or add-on entitlement as a billing fact — no seam exposes them.

## What PAIGE can propose or perform

Nothing on this surface. No `billing_*` tool exists in `paige-ai-chat`. (A `subscription_billing_setup_draft`
skill exists in `paige_skills` Cat 8 — that is **client** billing on the tenant's own processor,
not platform billing, and must not be confused with this card.)

## Required confirmation / approval

Not applicable today (no act). When an act exists — subscribe, buy an add-on, cancel — it is a
`high` act built to the one approval gate (`docs/doctrine/one-approval-gate.md`). Phase 1 proposes
no new proof of approval.

## Rail outcome and follow-up

None. No billing act exists to record. A future billing act is a **workspace-level** outcome with
no `contact_id`, so it falls under the same unbuilt workspace-level projection that Team is waiting
on (Team surface card, decision 2). Not a Billing slice to invent.

## Dependencies, collisions, and required browser proof

- **Metering workstream** (MET1 shipped, MET2 evidence owed, parked #737) — Billing reads from it;
  never writes to it.
- **Marketplace owner** — entitlement floor at `src/solo/marketplace.tsx:79`; paid add-on flow via
  `docs/handoff/platform-billing-marketplace-addon-handoff.md`.
- **Chat build** — approval gate.
- **Known defects (not fixed in Phase 1):** A1 email-keyed `customer-portal` / `check-subscription`;
  A2 ungated paid install in `install_marketplace_item`; A3 undiscriminated `invoice.*` webhook
  arms; A4 sub-account misreport; A5 (corrected — the `credit_pulls_per_month` seed is already stripped on
  `main` by `20260726140000`; prod state UNVERIFIED). Full table: packet §3.
- **Authority (owner-ruled 2026-09-02, R2):** MVP billing acts are **Owner-only**; Admin and Member fail closed with an explanation. `is_current_user_tenant_admin()` (owner OR admin) is therefore NOT the gate for portal/payment/subscription acts — Foundation A introduces an owner-only check.
- **Beta access offers (owner, 2026-09-02, R10/R11):** paid beta plan · 30-day $0 trial · operator-granted promotional access, behind ONE server-owned entitlement projection that names its source and resolves overlaps by the documented precedence rule (packet §4.3). None of the three exists as a backend contract today; all are prototype/design truth. Solo is the canonical billing experience (R9); the Operator billing screens are control-plane only.
- **Current-account policy (owner, 2026-09-02, R12–R15):** eligible top-level workspaces go onto Promotional Beta Access via an explicit, attributable entitlement record in a dedicated, reversible, separately Gate-B'd rollout after Foundation C — never as a fallback for a missing subscription, never counted as revenue. Not part of #803.
- **Tier posture (R8):** sub-account, Agency and Enterprise show NOT APPLICABLE / NOT AVAILABLE, never "no subscription" and never an inherited plan.
- **Required browser proof before any label moves:** an authenticated Solo owner on the real
  platform sees the correct state for the correct workspace, switches workspace and sees it change,
  designates a primary billing contact and finds it held after a reload, an Admin and a Member each
  see the refusal (R2), a sub-account owner sees the NOT APPLICABLE state and never "billed by your
  agency" (R8). **None of this has been driven authenticated.** Foundation C drives all of it in the
  harness (108/108, four viewports × both palettes — `scripts/live-drive/settings-billing-drive.mjs`),
  which is a rendered proof against a stub transport, not the live one (§32.c).
