# Billing Foundation A — workspace billing identity, authority, and designated billing recipients (design + security packet, v3)

**Status: DESIGN v3 — v2 (corrected after the independent adversarial security/architecture review,
BUILD-WITH-CORRECTIONS, 2026-09-02, twelve corrections marked `[Cn]`) plus the owner's same-day
billing-notification ruling (§11 below, R18–R26), designed into the foundation before anything is
committed rather than bolted on after billing is live.**
Written against `main` `1fb7928` under Gate 1 (packet §4.2–§4.4: R1, R2, R3, R8, R13). The
implementation head gets its own independent review before Gate B. **Nothing here is merged,
deployed, applied to production, or touches a Stripe object.**

**Why first:** finding A1 is a HIGH access flaw — the shipped portal and subscription lookups
resolve a Stripe Customer by the signed-in person's email, with no workspace mapping and no owner
gate. Nothing owner-facing may be built on top of that.

## 1. The frame (§69)

| Field | Value |
|---|---|
| Mode / depth | Existing Project · New Feature + Security · **Deep, R3** (payments, permissions) · independent review before (done) and after |
| Actor-goal flows | F-A1 Owner opens the hosted billing portal for **this** workspace · F-A2 Admin/Member is refused with a reason · F-A3 a person in two workspaces gets the right one, and switching changes it · F-A4 a workspace with no or ambiguous mapping is refused safely · F-A5 a sub-account/Agency/Enterprise is told billing is not applicable · F-A6 the platform can see who opened what, and every refusal · **F-A7** Owner designates a verified Owner as the workspace's billing owner/contact · **F-A8** Owner designates a current active Admin as a notice delegate, and revokes one · **F-A9** Admin/Member/sub-account are refused designation acts and told why · **F-A10** the later paid-activation release asks, server-side, whether a verified billing owner exists · **F-A11** the platform audits every designation change and (later) every delivery attempt |
| Slice branch | `claude/billing-foundation-a` off `main` (own PR; #803 stays docs-only) |
| Changed-file boundary | 1 migration (accounts + recipients + ledger + seams, defined once) · 1 SQL proof · `_shared/platform-billing.ts` (shared helper + tests) · `_shared/billing-notifications.ts` (pure notice policy + Deno test, §11.5) · new edge function `platform-billing-portal` (+ pure `decide.ts` + Deno test) · one guard in `customer-portal` · two additive calls in `stripe-webhook` · `supabase/config.toml` · Solo data hooks `useWorkspaceBillingAuthority` + `useWorkspaceBillingRecipients` + vitest · records. **No Solo screen change** (Foundation C), no webhook classification beyond the mapping upsert, **no Stripe object, no price, no charge, no entitlement record, no delivery.** |
| Collisions | Open PRs re-read 2026-09-02: none touch `customer-portal`, `stripe-webhook`'s platform arm, `platform_subscriptions`, or `src/solo/settings.tsx` BillingView. Re-checked at the implementation head. |
| Baseline (worktree, `main` `1fb7928`, before any edit) | `npm run typecheck`: 13 pre-existing errors, all in the committed `tsc-baseline` ratchet · vitest: 156 files / 1888 tests passed |
| Regression impact map | `SubscriptionContext` (app-wide; calls `check-subscription` + `customer-portal` for the legacy consumer lane) — unchanged for non-platform customers, refused for platform customers · `platform-subscription-checkout` untouched · `stripe-webhook` platform arm gains one helper call at each of its **two** write sites · `platform_subscriptions` RLS untouched · `useSoloComms` untouched |
| Gates | flow-prototype: not required (A ships no owner-facing UI; C carries the approved prototype). Gate B: exact head, after the independent review of that head. |

## 2. Threat model (security pass 1, corrected)

| Threat | Today | After A |
|---|---|---|
| T1 Wrong customer (two-workspace person; owner whose email also holds a legacy consumer customer) | **Open** (`customer-portal/index.ts:43` email lookup) | Portal resolves **only** via `platform_billing_accounts.tenant_id = billing_active_tenant_id()`; the legacy lane refuses any email-found customer referenced by **any** LAYER-1 source `[C1]` |
| T2 Non-owner manages money | **Open** | `is_tenant_owner(auth.uid(), tenant)` — the canonical `is_owner` predicate, never `role='owner'` `[C2]`; Admin/Member/coach refused server-side, audited |
| T3 Body-supplied tenant | n/a | The function reads **no** body; operator act-as refused in A |
| T4 Reusable portal URL | short-lived by Stripe | URL returned once with the `tenant_id` it was minted for; never persisted; the hook opens it only if the workspace is still the same `[C9]` |
| T5 Cross-tenant read of the mapping | n/a | RLS FORCE; **no `authenticated` SELECT at all** (`is_platform_operator()` only); tenants learn state through the RPC, which never returns an id `[C12-S3]` |
| T6 Sub-account mapped as a Solo | n/a | Trigger: only a top-level tenant may own a mapping; Agency/Enterprise refused at the function (`not_applicable_scope`, R8) |
| T7 Ambiguous legacy data | silent | Computed **live** from `platform_subscriptions` ∪ `tenants.stripe_customer_id`; refused `billing_account_ambiguous`, never guessed `[C3]` |
| T8 Fallback to "some" workspace | `current_user_tenant_id()` falls back to the oldest membership and honours agency/operator branches | One strict resolver `billing_active_tenant_id()` for **both** the read and the owner check; `current_user_tenant_id()` is never called in the money path `[C2]` |
| T9 Stale paint / stale open after account switch | `SubscriptionContext` keeps state | Hook keys on `activeTenantId`, request gate drops late reads, and `openPortal` opens only when the returned `tenant_id` equals the captured one `[C9]` |
| T10 A live portal route before proof | — | `PLATFORM_BILLING_PORTAL_ENABLED` (name only) defaults to refuse `not_enabled`, audited; flipped only after the authenticated drive lands `[C11]` |
| T11 Wrong Stripe account key | webhook falls back V2→legacy | Key chosen **by name** from the mapping's `stripe_account`; missing key → `needs_config`, never a fallback `[C7]` |
| T12 Identifiers in docs/logs | — | No secret values; customer ids only in DB rows and audit payloads; `logStep` never logs email or customer id; raw Stripe errors never returned `[C7]` |

## 3. Data

### 3.1 `public.platform_billing_accounts` (§197 LAYER 1 — `COMMENT ON TABLE … 'LAYER 1 (Platform Subscriptions Tenant->Paige) per Doctrine §197'`)

| Column | Type | Rule |
|---|---|---|
| `tenant_id` | uuid PK → `tenants(id) ON DELETE CASCADE` | one row per workspace |
| `stripe_customer_id` | text NOT NULL | |
| `stripe_account` | text NOT NULL CHECK IN (`'legacy'`,`'v2'`) | which Stripe account holds the customer |
| `source` | text NOT NULL CHECK IN (`'backfill_subscription'`,`'checkout'`,`'operator'`) | provenance |
| `created_by` | uuid null | actor for `operator`; null for system |
| `created_at`, `updated_at` | timestamptz | `update_updated_at_column()` (existing helper, §18) |
| **UNIQUE** | `(stripe_account, stripe_customer_id)` | one workspace per customer **per account** `[C-D5]` |

- **`status`/`suspended` removed from A** `[C10]` — nobody could write it; recorded as Foundation B scope with an operator RPC.
- **Trigger `trg_platform_billing_account_top_level`** (BEFORE INSERT/UPDATE): raise `42501`
  unless `tenants.parent_tenant_id IS NULL`. Re-parenting a mapped tenant later is an accepted,
  recorded residual `[C-D7]`.
- **RLS (FORCE):** SELECT `is_platform_operator()`; INSERT/UPDATE/DELETE `is_platform_owner()`;
  service_role bypasses (the webhook and the portal function read/write via service role).
- `lint:definer-fns`: no `anon`/`PUBLIC` grant anywhere; no exemption marker.

### 3.2 `public.platform_billing_account_reconcile()` — the backfill as a re-runnable seam `[C10-W1]`

`security definer`; callable only when `auth.uid() IS NULL` (migration, cron, service) or
`is_platform_operator()`. Idempotent. Returns jsonb `{ inserted, ambiguous: [tenant_id…], candidates }`.

```
candidates  := top-level tenants with ≥1 platform_subscriptions row carrying a non-null stripe_customer_id
ids(t)      := distinct non-null stripe_customer_id across t's platform_subscriptions rows ∪ tenants.stripe_customer_id
unambiguous := candidates with exactly ONE id
INSERT unambiguous → (tenant_id, id, 'legacy', 'backfill_subscription') ON CONFLICT (tenant_id) DO NOTHING
ambiguous   := candidates with >1 id — returned, never inserted
```

`stripe_account = 'legacy'` **by construction**, not by a marker: the only producer of platform
customers is `platform-subscription-checkout`, which uses `STRIPE_SECRET_KEY` only
(`index.ts:89, :378`); `platform_subscriptions.metadata` is never written by the webhook `[C-D4]`.
From A onward the webhook stamps the **verified** account (§4.4). The migration calls the function
once. **The 3 live comped rows** carry NULL customer ids and are not candidates (correct: absent).
**`tenants.stripe_customer_id` has no writer on `main`** (only a read at `paige-mcp/index.ts:3757`);
the Gate B packet lists any prod rows where it is non-null rather than silently including or
excluding them `[C-D8]`.

### 3.3 Known consequence recorded now, fixed in B `[C5]`

`platform-subscription-checkout` passes `customer_email` and no `customer:` (`index.ts:463`), so
**every checkout session mints a new Stripe Customer**. A tenant that cancels and re-subscribes
therefore has two distinct ids → `ambiguous` (refused until an operator resolves it) or, if
already mapped, a `platform_billing_account_conflict` audit row with the mapping left on the old
customer. **Foundation B fix:** checkout passes `customer: mapping.stripe_customer_id` when a
mapping exists. The Gate B packet for A states the prod count of tenants with >1 distinct id.

## 4. Seams

### 4.1 `public.billing_active_tenant_id()` — the ONE strict resolver `[C2]`

`security definer`, `stable`, no params. Returns `profiles.active_tenant_id` for `auth.uid()` **iff**
an active `tenant_members` row exists for that user and tenant; else NULL. No agency branch, no
operator branch, no oldest-membership fallback. `GRANT EXECUTE TO authenticated` only.

### 4.2 `public.get_workspace_billing_authority()` — the ONE read (Paige-callable, §10)

`security definer`, `stable`, no params. One row:

| Field | Meaning |
|---|---|
| `tenant_id` | `billing_active_tenant_id()` or null |
| `scope` | `'none'` · `'sub_account'` (`parent_tenant_id` set) · `'agency'` · `'enterprise'` · `'top_level_solo'` |
| `role` | the caller's `tenant_members.role` there, or null |
| `can_manage_billing` | `is_tenant_owner(auth.uid(), tenant_id) AND scope = 'top_level_solo'` `[C2]` |
| `billing_account_state` | `'not_applicable'` (scope ≠ top-level Solo) · `'mapped'` (row exists and every LAYER-1 id for the tenant equals it) · `'ambiguous'` (no row and >1 distinct id, **or** a row whose id differs from any LAYER-1 id) · `'absent'` (no row and ≤1 id) `[C3]` |

Never returns a Stripe identifier. `GRANT EXECUTE TO authenticated`; `REVOKE FROM anon, PUBLIC`.
(Foundation C note: `get_tenant_platform_subscription()` still resolves through
`current_user_tenant_id()`; C must read the plan card through the strict resolver too, or the two
can disagree for a null-`active_tenant_id` user — recorded, not A's change.)

### 4.3 Edge function `platform-billing-portal` (`verify_jwt = true`)

```
0  if PLATFORM_BILLING_PORTAL_ENABLED !== "true"      → 403 not_enabled              (audit)   [C11]
1  user := getUser(JWT)                               → 401 unauthenticated
2  auth := userClient.rpc("get_workspace_billing_authority")        (auth.uid()-keyed; no body read)
3  auth.tenant_id null                                → 403 no_active_workspace       (audit)
4  auth.scope ≠ 'top_level_solo'                      → 403 not_applicable_scope      (audit)
5  not auth.can_manage_billing                        → 403 owner_only                (audit)
6  state absent / ambiguous                           → 409 billing_account_absent / _ambiguous (audit)
7  mapping := admin.from(platform_billing_accounts)   (service role)
   key := STRIPE_SECRET_KEY or STRIPE_SECRET_KEY_V2 by mapping.stripe_account, NO fallback
   key missing                                        → 503 needs_config             (audit)   [C7]
8  return_url := canonicalAppUrl({actor:'account', tier:'solo', account: tenants.account_number, destination:'billing'})
   null (no account_number)                           → 503 needs_config             (audit)   [C7]
9  audit 'platform_billing_portal_requested' via SERVICE ROLE — insert failure → 500 audit_failed, NO Stripe call  [C8]
10 session := stripe.billingPortal.sessions.create({ customer, return_url })
   Stripe error                                       → 409 billing_account_unresolvable (audit; raw message never returned) [C7]
11 audit 'platform_billing_portal_opened' (service role; failure logged at error level)
12 return { url: session.url, tenant_id }             — never stored                   [C9]
```

- Steps 0 and 3–6 are a **pure** `decide.ts` (`decidePortalAccess(flag, authority) → allow | refuse`)
  with a Deno test per row of §6 including the "flag off" row and a null-authority row (service-role
  bearer: `getUser` → no user → 401; even if `auth.uid()` were null the read returns null → refused).
- Refusal audits are non-blocking but logged at error level; the allow-path audit **fails closed** `[C8]`.
- `actor_role` carries the membership role on refusals; payload carries `{ reason, stripe_account? }`
  only — never email, never a customer id.

### 4.4 Shared helper `_shared/platform-billing.ts`

- `upsertBillingAccount(admin, { tenantId, stripeCustomerId, stripeAccount, source })` — insert
  `ON CONFLICT (tenant_id) DO NOTHING`; if an existing row carries a **different** id, write audit
  `platform_billing_account_conflict` (service role) and log at error level; a trigger raise is
  returned as an error object, logged, and never breaks the subscription write. Called from **both**
  `checkout.session.completed` platform write sites — grandfathered (`~:733`) and onboarding
  (`~:928`) — with `verifiedAccount` `[C4]`.
- `isPlatformCustomer(admin, { stripeCustomerId })` — true if referenced by `platform_billing_accounts`,
  `platform_subscriptions.stripe_customer_id`, **or** `tenants.stripe_customer_id` `[C1]`.

### 4.5 The legacy `customer-portal` and `check-subscription` (A1's other half)

`customer-portal` keeps its legacy consumer purpose but gains one guard after the email lookup:
`isPlatformCustomer` → `409 platform_customer_use_workspace_billing` + audit (service role). The
guard has a Deno test on its pure decision. **Residual, stated:** a platform customer that exists
on Stripe with no row in any of the three sources stays reachable by email; the count on prod is
reported in the Gate B packet. `check-subscription` is **not** read-only `[C12-S2]`: it writes
`user_subscriptions` through the anon client with no forwarded JWT (`:64-71, :114-122, :131-138`), so
those writes are RLS-blocked no-ops (UNVERIFIED), and for a platform owner it finds the platform
customer by email and maps it through `stripe_product_mappings`. Left untouched in A; recorded as
a §198 deprecation item with that description.

### 4.6 Solo data hook `useWorkspaceBillingAuthority` (no screen change in A)

Reads the authority RPC keyed on `activeTenantId` with `createSettingsRequestGate()`; resets to
`loading` the instant the tenant changes; `openPortal()` captures the tenant id at click, invokes
the function, and opens the URL **only if** `response.tenant_id === captured` and the gate epoch is
current — otherwise discards it with a `workspace_changed` refusal `[C9]`. Maps every code to owner
copy (`not_enabled`, `owner_only`, `not_applicable_scope`, `no_active_workspace`,
`billing_account_absent`, `billing_account_ambiguous`, `billing_account_unresolvable`,
`needs_config`, `audit_failed`, network → retry). Consumes server `scope`, never `account_type ===`
(`lint:tier-features`). Foundation C mounts it. `window.open` after an awaited fetch may be
popup-blocked in some browsers — C's concern, recorded.

## 11. Billing notifications and designated recipients (owner ruling 2026-09-02, R18–R26)

**The ruling, as encoded.** The platform bills the workspace, never the signed-in person. Billing
notices are transactional platform notices (R18). Before a paid plan can activate, the workspace
must have at least one **verified Owner designated** as its billing owner/contact — never inferred
from a signed-in email (R19). An Owner may designate one or more **current, active Admins** as
notice delegates; a delegate must already be an active member, so no external recipients exist in
this slice (R20). No Admin receives notices automatically (R21). **Receive / view / manage are three
separate permissions**; a delegate gains no plan, payment-method, cancellation or ownership authority
by being copied, and billing changes stay Owner-only (R22). Verified email delivery only; no SMS,
no marketing automation, no notifications centre (R23). The event list is explicit and
Stripe/webhook-backed; a Promotional or trial workspace with no charge never gets a payment notice
(R24). Every designation change and every delivery attempt/outcome is durably, tenant-scopedly
audited inside the existing billing/audit boundary (R25). No workspace becomes chargeable because
this model exists; Promotional access stays an explicit non-revenue entitlement whose only notices
are about that entitlement (R26).

**What Foundation A ships for it, and what it deliberately does not.** A ships the designation
record, the seams to change and read it, the authority read that carries it, the paid-activation
gate, and the delivery ledger every future send must write to. **A ships no sender.** The
mail-provider contract (provider result → ledger, retry, idempotency, bounce) is its own later
release; today there is nothing to call, by design, and the proof asserts the ledger is empty after
every act (P53).

### 11.1 `public.platform_billing_recipients` (§197 LAYER 1)

| Column | Rule |
|---|---|
| `id` uuid PK | |
| `tenant_id` → `tenants` CASCADE | the workspace; top-level Solo only (trigger) |
| `user_id` → `auth.users` CASCADE | an existing member — never an address |
| `designation` CHECK `billing_owner` \| `billing_delegate` | |
| `designated_by`, `designated_at` | the Owner who acted, when |
| `revoked_at`, `revoked_by` | revocation is the only mutation; rows are history |
| UNIQUE `(tenant_id, user_id) WHERE revoked_at IS NULL` | one live designation per person per workspace |

- **Trigger `trg_platform_billing_recipient_guard`** (BEFORE INSERT/UPDATE, SECURITY DEFINER only to
  read `auth.users.email_confirmed_at`): top-level Solo only (`billing_recipient_top_level_solo_only`) ·
  active membership (`billing_recipient_not_member`) · `billing_owner` ⇒ `is_tenant_owner()`
  (`billing_recipient_not_owner`) · `billing_delegate` ⇒ role `admin` (`billing_recipient_not_admin`) ·
  verified email (`billing_recipient_email_unverified`) · a row is never re-pointed, re-typed or
  un-revoked (`billing_recipient_immutable`). Structural, so it binds every writer (§51/§59).
- **RLS (FORCE):** SELECT `is_platform_operator()`; writes `is_platform_owner()`; service_role
  bypasses. The Owner never reads the table — only `get_workspace_billing_recipients()`.

### 11.2 `public.platform_billing_notification_log` — the delivery ledger (R25), **no writer in A**

`tenant_id` · `recipient_id` (SET NULL) · `recipient_user_id` · `event` CHECK ∈ {`trial_ending`,
`plan_changed`, `invoice_receipt`, `payment_failed`, `payment_action_required`, `cancellation`,
`access_impacting_status`, `promotional_entitlement_change`} · `channel` CHECK `email` · `status`
CHECK ∈ {`skipped_not_relevant`, `skipped_unverified`, `not_configured`, `queued`, `sent`, `failed`} ·
`provider`, `provider_message_id`, `error_code`, `source_event_id`, `idempotency_key` (unique when
set) · `attempted_at`, `outcome_at`. **Never an address, subject or body.** RLS FORCE: operators
read, service writes. A skip is a row, never silence.

### 11.3 Seams (§10 Paige-callable; all `auth.uid()`-keyed through the strict resolver)

| Seam | Who | Does |
|---|---|---|
| `platform_billing_owner_workspace()` (internal, no app-role EXECUTE) | — | the caller's active top-level Solo workspace iff they are its Owner; raises `no_active_workspace` / `billing_not_applicable` / `billing_owner_only` — never a fallback |
| `platform_billing_recipient_designate(p_user_id, p_designation)` | Owner | inserts (trigger validates) + audit `platform_billing_recipient_designated` in the same transaction; `billing_recipient_already_designated` on a live duplicate |
| `platform_billing_recipient_revoke(p_recipient_id)` | Owner | sets `revoked_at/by` + audit `platform_billing_recipient_revoked`; refuses to remove the **last** `billing_owner` while a platform subscription is `active`/`trialing`/`past_due` (`billing_owner_required_while_subscribed`) |
| `get_workspace_billing_recipients()` | Owner (view is Owner-only in A, R22) | live recipients with `role`, `display_name`, `email_verified`, `still_eligible`; **no email column**; raises for anyone else (never an empty set, R8) |
| `platform_billing_paid_activation_ready(p_tenant_id)` | service / operator | R19 gate for the later activation release: ≥1 live `billing_owner` who is still a verified, current Owner of a top-level Solo workspace. Computed live, never cached |
| `platform_billing_verified_owner_count(p_tenant_id)` (internal) | — | the shared predicate behind the gate and the authority read |

### 11.4 `get_workspace_billing_authority()` gains four additive fields

`can_view_billing` (Owner-only in A — a separate field on purpose, R22) · `receives_billing_notices`
(the caller holds a live designation here; confers nothing else) · `billing_contact_state`
(`not_applicable` · `none` · `designated` · `designated_needs_attention` when a designated billing
owner is no longer a verified current Owner) · `paid_activation_ready`. The portal `decide.ts` and
the hooks read known fields only; nothing shipped breaks.

### 11.5 `_shared/billing-notifications.ts` — the policy, pure and tested; no sender

`BILLING_NOTICE_EVENTS` / `BILLING_NOTICE_STATUSES` (parity-tested against the ledger's CHECK
lists by reading the migration) · `RELEVANT_EVENTS` per entitlement (`paid`: all but the promotional
event · `trial`: `trial_ending`, `plan_changed`, `cancellation`, `access_impacting_status` ·
`promotional`: `promotional_entitlement_change`, `access_impacting_status` · `none`:
`access_impacting_status` · `unknown`: nothing) · `decideBillingNotice()` → deliver, or a named skip
status (`skipped_not_relevant`, `skipped_unverified`). A test asserts the module contains no
`fetch`/provider call.

### 11.6 Threats added

| Threat | After A |
|---|---|
| T13 Billing contact inferred from whoever signed in | Only an explicit `billing_owner` row satisfies the gate; the gate is `is_tenant_owner()` + verified email, computed live (P47–P49) |
| T14 Every Admin quietly receives billing mail | Receiving is a designation the Owner makes per person (P21 → `billing_owner_only`; P31) |
| T15 A delegate escalates by being copied | `can_view_billing`/`can_manage_billing` stay false for a delegate; the recipients read and every act raise `billing_owner_only` (P31, P35, P36) |
| T16 An external address as recipient | `user_id` must hold an active seat (P39); rows carry ids, never addresses; the read has no email column (P33) |
| T17 Unverified delivery | designation refused on an unverified email (P26); the policy skips with `skipped_unverified` |
| T18 A subscribed workspace left with no billing owner | revoke of the last `billing_owner` refused while subscribed (P41) |
| T19 Payment notices to a non-charged workspace | `RELEVANT_EVENTS` — Promotional/trial never get invoice/payment events (Deno) |
| T20 Silent delivery / silent skip | the ledger is the contract; A writes nothing to it and proves it (P53) |
| T21 Body-supplied tenant on a designation act | none of the seams read a tenant; the workspace is the caller's, or a raise |

### 11.7 Per-tier answer (§51/§56)

Operator: reads both tables for audit; may call the activation gate; cannot designate for a tenant
(no seat → `no_active_workspace`). Agency/Enterprise: `billing_not_applicable`. Solo Owner: the
only designator/viewer. Solo Admin: designatable as delegate; receives only. Solo Member/coach:
not designatable. Sub-account: `billing_not_applicable`; the trigger refuses a row. Client/Anonymous:
EXECUTE revoked (P54).

### 11.8 Rollback additions

Drop `platform_billing_notification_log`, `platform_billing_recipients` (+ guard trigger/function),
the five seams of §11.3, and re-create `get_workspace_billing_authority()` without the four fields;
remove the two hooks and the policy module. Nothing else references them.

## 5. Failing-first proof plan

| Layer | Artifact | Cases (red first, then green; mutation-tested) |
|---|---|---|
| SQL | `scripts/sql/platform-billing-account-proof.sql` (BEGIN…ROLLBACK) | C1 table absent · C2 functions absent · P1 owner (via `grant_co_owner`, never a raw `role='owner'` insert) → `can_manage_billing=true`, `mapped` · P2 admin → false · P3 member → false · P4 absent · P5 ambiguous (two ids, unmapped) → not inserted, `ambiguous` · P5b mapped + later different id → `ambiguous` · P6 same user in two workspaces follows `active_tenant_id`; switching flips it · P7 sub-account → `not_applicable`; trigger rejects its mapping · P8 `SET LOCAL ROLE anon` → EXECUTE refused · P9 `SET LOCAL ROLE authenticated` → 0 rows from the table · P10 `active_tenant_id` null while owning an older tenant → `tenant_id` null **and** `can_manage_billing=false` (mutation: swap in `current_user_tenant_id()` → red) · P11 operator act-as (`active_tenant_id` pointed with no membership) → `no_active_workspace` · P12 reconcile is idempotent (second call inserts 0) |
| Edge (pure) | `platform-billing-portal/decide.test.ts` | every §6 row + flag off + null authority |
| Edge (pure) | `_shared/platform-billing.test.ts` | legacy guard decision: platform customer refused; legacy customer allowed; upsert conflict detection |
| Edge (pure) | `_shared/billing-notifications.test.ts` | event/status parity with the ledger CHECK · promotional never gets a payment notice · trial gets no invoice/payment event · paid gets all but promotional · unknown gets nothing · unverified recipient skipped · no sender in the module |
| SQL (recipients) | same proof file, P23–P54 | owner-only designation · member/unverified/non-owner/non-member refusals by name · duplicate refused · delegate receives-but-cannot-view/manage · owner read has no email column · both acts audited tenant-scoped · sub-account not applicable · last-owner-while-subscribed protected · revoked delegate stops receiving · activation gate refuses tenants and answers live (ownership revoked → not ready, `designated_needs_attention`) · ledger CHECK, RLS, and emptiness · anon EXECUTE refused |
| Frontend | `src/solo/data/useWorkspaceBillingRecipients.test.tsx` | read with eligibility flags · owner-only refusal is a state, not an empty list · switch drops the stale read · designate/revoke call the seams and re-read · refusal codes carried verbatim · an act landing after a switch is `workspace_changed` and reloads nothing |
| Frontend | `src/solo/data/useWorkspaceBillingAuthority.test.tsx` | loading → state; switch mid-flight drops the stale read and never paints the previous workspace; `openPortal` discards a response whose `tenant_id` differs from the captured one; refusal copy per code; retry after error; URL never stored |
| Static | typecheck ratchet, `lint:definer-fns`, `lint:views`, `lint:managed-schema`, `lint:tier-features`, migration-lint, `deno check` on every touched function |
| Runtime | authenticated owner drive on preview **owed to a capable session**; stated UNVERIFIED; the flag stays off until it lands |

## 6. Decision table (pinned by tests)

| flag | active_tenant_id | membership | scope | owner | mapping | Result |
|---|---|---|---|---|---|---|
| off | — | — | — | — | — | 403 `not_enabled` |
| on | null | — | — | — | — | 403 `no_active_workspace` |
| on | set | none / inactive | — | — | — | 403 `no_active_workspace` |
| on | set | active | sub_account | any | — | 403 `not_applicable_scope` |
| on | set | active | agency / enterprise | yes | any | 403 `not_applicable_scope` |
| on | set | active | top_level_solo | no (admin/member/coach) | any | 403 `owner_only` |
| on | set | active | top_level_solo | yes | absent | 409 `billing_account_absent` |
| on | set | active | top_level_solo | yes | ambiguous | 409 `billing_account_ambiguous` |
| on | set | active | top_level_solo | yes | mapped, key missing | 503 `needs_config` |
| on | set | active | top_level_solo | yes | mapped, no account_number | 503 `needs_config` |
| on | set | active | top_level_solo | yes | mapped, audit insert fails | 500 `audit_failed` (no Stripe call) |
| on | set | active | top_level_solo | yes | mapped, Stripe error | 409 `billing_account_unresolvable` |
| on | set | active | top_level_solo | yes | mapped | **200 `{ url, tenant_id }`** + two audit rows |

## 7. Per-tier answer (§51/§56)

| Tier | A's behaviour |
|---|---|
| God / operator | `no_active_workspace` (act-as points `active_tenant_id` with no membership — the strict resolver returns null); operators read mapping rows via RLS for audit and may call `reconcile()` |
| Agency / Enterprise | `not_applicable_scope` until a supported contract exists (R8) |
| Solo owner | the only allowed caller |
| Solo admin / member / coach | `owner_only` |
| Sub-account | `not_applicable_scope`; trigger forbids a mapping row |
| Client / Anonymous | 401 / EXECUTE revoked |

## 8. Residual risks (stated)

- **Delivery is not wired** (by ruling). Until the delivery release lands, a designation is a record
  with no effect on anyone's inbox; the Solo screen (C) must say so in plain words, never imply
  notices are flowing.
- A designated billing owner who later loses ownership, or a delegate demoted from Admin, keeps the
  row; the read reports `still_eligible=false` / `designated_needs_attention` and the gate ignores
  them. Automatic revocation on role change is a later decision, recorded here rather than assumed.
- The paid-activation gate is a **server function the activation release must call**; nothing in A
  can force that call. The Gate B packet for that release must cite it.

- Legacy `customer-portal` remains reachable by email for a platform customer with no row in any LAYER-1 source (count reported at Gate B). `check-subscription` untouched (§4.5).
- Re-subscribe mints a new customer (§3.3) until Foundation B.
- A mapped top-level tenant re-parented later keeps its row (no tenants trigger in A).
- Comped/promotional workspaces have no mapping → `billing_account_absent` until B/C and the promotional rollout give them a truthful non-portal state.
- Prod facts UNVERIFIED until read at Gate B: rows with >1 distinct customer id; non-null `tenants.stripe_customer_id` rows; any V2-account platform customer.

## 9. Rollback `[C11-M1]`

Additive migration. Rollback = drop table (+ trigger + its function), drop the three functions,
remove the config entry, **and revert the `customer-portal` guard and the two webhook calls** (they
reference the table). The flag default-off means the portal route is inert until explicitly enabled.

## 10. Gate B packet (what will be requested — nothing before)

Exact head · migration + rollback-proof transcript · Deno + vitest transcripts · lints/typecheck ·
the independent review of that head · per-tier results · the UNVERIFIED list · the request:
**merge + migration apply + edge deploy for this slice only, with `PLATFORM_BILLING_PORTAL_ENABLED`
unset** — no Stripe object, no price, no charge, no entitlement record, no flag flip.
