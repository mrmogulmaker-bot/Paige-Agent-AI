# Surface card — Billing (Solo Settings → Billing)

**Truth label: `PARTIAL`.** The owner can read a plan name, status, price and renewal from a
tenant-scoped seam. Nothing else on the surface is real: no invoice, no payment method, no usage,
no allowance, no action, no Rail outcome. The label is not lifted by this card or by the Gate 1
packet; it moves only when an owner can complete a billing act on the live platform and see the
result hold (§70).

Written 2026-09-02 against `main` `1fb7928` for the Platform Billing Phase 1 packet
(`docs/delivery/platform-billing-gate1-packet.md`). **Describes the department as it is.**

## Owner job and user flow

A Solo owner opens Settings → Billing to learn what their **workspace** pays the platform, when it
renews, how much of the included allowance is used, which paid add-ons are active, and to update a
card or download an invoice. Today the flow ends at the first step: they can read plan · status ·
price · renewal and nothing else.

**Not this surface's job:** what the owner charges their own customers. That is Sales (client
billing, §197 LAYER 2, tenant's own processor per §38).

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

Settings → Billing, eighth of eight Settings destinations (`src/solo/settings.tsx:1464`). Icon
`CircleDollarSign`. Form-fitting (not on the visible-scroll list; `src/components/tenant-shell/settings-scroll-contract.ts`).
Rendered by `BillingView` (`settings.tsx:1457-1459`), fed by `useSoloComms` (`:259-270, :333`).

## States

| State | Today |
|---|---|
| create | N/A — a workspace does not create its subscription here; the CREATE leg is `platform-subscription-checkout` from onboarding |
| edit | none |
| save | none |
| cancel | none |
| retry | `ReadState` retry on a failed read — real |
| empty | "No current Solo subscription record was returned." — **true for a solo with no plan, false for a sub-account** (`useSoloComms.ts:333` skips the read by design; `BillingView` never reads `isSubAccount`) |
| loading | "Clearing and resolving this account…" — real |
| permission | `canManage` is computed (`is_current_user_tenant_admin`) and consumed by nothing on this view |

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
  platform reads the correct plan for the correct workspace, switches workspace and sees it change,
  a non-admin member sees the refusal, a sub-account owner sees "billed by your agency". None of
  this has been driven.
