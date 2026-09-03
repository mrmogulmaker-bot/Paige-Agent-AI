# Billing Foundation A — workspace billing identity, authority, and designated billing contacts (design + security packet, v3.1)

**Status: DESIGN v3.1 — v2 (corrected after the independent adversarial security/architecture
review, BUILD-WITH-CORRECTIONS, 2026-09-02, twelve corrections marked `[Cn]`), plus the owner's
same-day billing-notification ruling (§11, R18–R26) designed in before the first commit, plus the
owner's terminology and non-ownership correction (§11.0, R27) and the findings of the independent
review of the implementation head (both reviewers FIX-THEN-SHIP; every finding integrated and
re-proven — §5 and §8 record where). v3.1 describes the code on the branch; where v3 and the code
disagreed, the code was fixed or this doc was corrected, never left to drift.**
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
| Actor-goal flows | F-A1 Owner opens the hosted billing portal for **this** workspace · F-A2 Admin/Member is refused with a reason · F-A3 a person in two workspaces gets the right one, and switching changes it · F-A4 a workspace with no or ambiguous mapping is refused safely · F-A5 a sub-account/Agency/Enterprise is told billing is not applicable · F-A6 the platform can see who opened what, and every refusal · **F-A7** Owner designates a verified Owner as the workspace's primary billing contact · **F-A8** Owner designates a current active Admin as a notice delegate, and revokes one · **F-A9** Admin/Member/sub-account are refused designation acts and told why · **F-A10** the later paid-activation release asks, server-side, whether a verified primary billing contact exists · **F-A11** the platform audits every designation change and (later) every delivery attempt |
| Slice branch | `claude/billing-foundation-a` off `main` (own PR; #803 stays docs-only) |
| Changed-file boundary | 1 migration (accounts + billing contacts + ledger + seams, defined once) · 1 SQL proof · `_shared/platform-billing.ts` (shared helper + tests) · `_shared/billing-notifications.ts` (pure notice policy + Deno test, §11.5) · new edge function `platform-billing-portal` (+ pure `decide.ts` + Deno test) · one guard in `customer-portal` · two additive calls in `stripe-webhook` · `supabase/config.toml` · Solo data hooks `useWorkspaceBillingAuthority` + `useWorkspaceBillingContacts` + vitest · records. **No Solo screen change** (Foundation C), no webhook classification beyond the mapping upsert, **no Stripe object, no price, no charge, no entitlement record, no delivery.** |
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
| T5 Cross-tenant read of the mapping | n/a | RLS FORCE with the SELECT policy `is_platform_operator()` only (the explicit `authenticated` table grant exists so that policy can apply; a tenant member gets 0 rows — P9, P37, P52); tenants learn state through the RPC, which never returns an id `[C12-S3]` |
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
  (`platform_billing_account_top_level_only`) unless the tenant row exists, `parent_tenant_id IS NULL`
  **and** `account_type <> 'sub_account'` — fails closed on a missing tenant and on a sub-account by
  type alone (review finding). Re-parenting a mapped tenant later is an accepted, recorded residual `[C-D7]`.
- **Grants + RLS (FORCE):** `REVOKE ALL FROM PUBLIC, anon, authenticated` then an explicit
  `GRANT SELECT, INSERT, UPDATE, DELETE TO authenticated` so the policies are the only door;
  SELECT policy `is_platform_operator()`; ALL policy `is_platform_owner()`; service_role bypasses
  (the webhook and the portal function read/write via service role).
- `lint:definer-fns`: no `anon`/`PUBLIC` grant anywhere; no exemption marker.

### 3.2 `public.platform_billing_account_reconcile()` — the backfill as a re-runnable seam `[C10-W1]`

`security definer`; callable only when `auth.uid() IS NULL` (migration, cron, service) or
`is_platform_operator()`. Idempotent. Returns jsonb
`{ candidates, inserted, ambiguous_tenants: [tenant_id…], customer_shared_by_multiple_tenants: [cid…] }`.

```
candidates  := top-level tenants (parent_tenant_id IS NULL AND account_type <> 'sub_account')
               with ≥1 platform_subscriptions row carrying a non-null stripe_customer_id
ids(t)      := platform_billing_layer1_customer_ids(t)  — the ONE definition (§18): distinct non-null
               platform_subscriptions.stripe_customer_id ∪ tenants.stripe_customer_id
ambiguous   := candidates with >1 id — returned, never inserted
shared      := any id recorded against MORE THAN ONE candidate (in any arity), or already mapped to a
               DIFFERENT workspace — returned, never inserted (review finding)
INSERT candidates with exactly ONE id, not in shared
       → (tenant_id, id, 'legacy', 'backfill_subscription') ON CONFLICT DO NOTHING
         (either unique — tenant, or customer-per-account — an existing row wins, never an abort)
```

`stripe_account = 'legacy'` **by construction**, not by a marker: the only producer of platform
customers is `platform-subscription-checkout`, which uses `STRIPE_SECRET_KEY` only
(`index.ts:89, :378`); `platform_subscriptions.metadata` is never written by the webhook `[C-D4]`.
From A onward the webhook stamps the **verified** account (§4.4). The migration calls the function
once. **Prod, read 2026-09-02: all 4 live `platform_subscriptions` rows carry a NULL customer id**
(the comped rows), so there are 0 candidates and the backfill inserts **zero** rows (correct: absent).
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
operator branch, no oldest-membership fallback. `GRANT EXECUTE TO authenticated, service_role`;
`REVOKE FROM PUBLIC, anon`.

### 4.2 `public.get_workspace_billing_authority()` — the ONE read (Paige-callable, §10)

`security definer`, `stable`, no params. One row:

| Field | Meaning |
|---|---|
| `tenant_id` | `billing_active_tenant_id()` or null |
| `scope` | `'none'` · `'sub_account'` (`parent_tenant_id` set) · `'agency'` · `'enterprise'` · `'top_level_solo'` |
| `role` | the caller's `tenant_members.role` there, or null |
| `can_manage_billing` | `is_tenant_owner(auth.uid(), tenant_id) AND scope = 'top_level_solo'` `[C2]` |
| `billing_account_state` | `'not_applicable'` (scope ≠ top-level Solo) · `'mapped'` (row exists and every LAYER-1 id for the tenant equals it) · `'ambiguous'` (no row and >1 distinct id, **or** a row whose id differs from any LAYER-1 id) · `'absent'` (no row and ≤1 id) `[C3]` |

Plus the four §11.4 fields. `billing_account_state` reads the LAYER-1 ids through
`platform_billing_layer1_customer_ids()` — the same definition reconcile uses, so the two can never
disagree (review finding: v3 had the rule written three times).

Never returns a Stripe identifier. `GRANT EXECUTE TO authenticated, service_role`; `REVOKE FROM anon, PUBLIC`.
(Foundation C note: `get_tenant_platform_subscription()` still resolves through
`current_user_tenant_id()`; C must read the plan card through the strict resolver too, or the two
can disagree for a null-`active_tenant_id` user — recorded, not A's change.)

### 4.3 Edge function `platform-billing-portal` (`verify_jwt = true`)

```
1  user := getUser(JWT)                               → 401 { error: "unauthenticated" }   (before the flag: an
                                                         unsigned call never learns whether the route is enabled)
2  auth := userClient.rpc("get_workspace_billing_authority")        (auth.uid()-keyed; no body read)
   read error                                         → authority := null (logged by code only)
3  decidePortalAccess(flag, authority) — PURE (decide.ts), in this order:
   flag ≠ "true"                                      → 403 not_enabled              [C11]
   authority null                                     → 503 authority_unreadable     (unknown is refused, never "no workspace")
   tenant_id null                                     → 403 no_active_workspace
   scope ≠ 'top_level_solo'                           → 403 not_applicable_scope
   not can_manage_billing                             → 403 owner_only
   state absent / ambiguous                           → 409 billing_account_absent / _ambiguous
   state anything but 'mapped'                        → 503 authority_unreadable
   every refusal → audit 'platform_billing_portal_refused' { reason, scope, state } (service role)
4  mapping := admin.from(platform_billing_accounts)   (service role) — absent here is a race → 409 billing_account_absent (audit)
5  key := STRIPE_SECRET_KEY | STRIPE_SECRET_KEY_V2 BY NAME from mapping.stripe_account, NO fallback
   missing                                            → 503 needs_config             (audit)   [C7]
6  return_url := canonicalAppUrl({actor:'account', tier:'solo', account: tenants.account_number, destination:'billing'})
   null (no account_number)                           → 503 needs_config             (audit)   [C7]
7  audit 'platform_billing_portal_requested' via SERVICE ROLE — insert failure → 500 audit_failed, NO Stripe call  [C8]
8  session := stripe.billingPortal.sessions.create({ customer, return_url })
   Stripe error                                       → 409 billing_account_unresolvable (audit; raw message never returned) [C7]
9  audit 'platform_billing_portal_opened' (service role; failure logged at error level, URL not taken back)
   return 200 { url, tenant_id }                      — never stored                   [C9]
```

- **Every refusal is a NON-2xx with `{ error: code }` in the body** (review finding, MAJOR: the
  supabase-js client surfaces a non-2xx as `FunctionsHttpError` with the body on `.context`, so the
  Solo hook reads the code through the repo's one helper `readFunctionErrorBody()`, never from
  `.message`; a test drives the real refusal shape).
- Step 3 is the **pure** `decide.ts` (`decidePortalAccess(flag, authority) → allow | refuse`) with a
  Deno test per row of §6 including the "flag off" row and the null-authority row (a service-role
  bearer: `getUser` → no user → 401 first; even if `auth.uid()` were null the read returns null → refused).
- Refusal audits are non-blocking but logged at error level; the allow-path audit **fails closed** `[C8]`.
- `actor_role` carries the membership role on refusals; payload carries `{ reason, stripe_account? }`
  only — never email, never a customer id.

### 4.4 Shared helper `_shared/platform-billing.ts`

- `upsertBillingAccount(admin, { tenantId, stripeCustomerId, stripeAccount, source, actorUserId? })`
  → `inserted` | `already_mapped` | `conflict` | `error`. Read the existing row, `classifyMapping()`
  (pure, tested): same customer + account → `already_mapped`; a **different** customer → `conflict`,
  audit `platform_billing_account_conflict` with `kind: tenant_already_mapped_to_other_customer`
  (service role; ids stay out of the payload). Otherwise INSERT; on `23505` re-read: a concurrent
  replay of the same event is `already_mapped`, a customer already owned by a **different** workspace
  is audited `kind: customer_shared_across_workspaces` and returned as `error`. Any other refusal (the
  sub-account trigger) returns `error` with the code; the whole body is `try/catch` (`mapping_threw`)
  so the mapping can never throw past the subscription write (review finding). Called from **both**
  `checkout.session.completed` platform write sites — grandfathered (`~:733`) and onboarding
  (`~:928`) — with `verifiedAccount` `[C4]`.
- `isPlatformCustomer(admin, stripeCustomerId)` — true if referenced by `platform_billing_accounts`,
  `platform_subscriptions.stripe_customer_id`, **or** `tenants.stripe_customer_id` `[C1]`; a failed
  read returns `null`, and `decideLegacyPortal(null)` refuses `503 platform_customer_check_failed`
  — an outage never reopens A1.

### 4.5 The legacy `customer-portal` and `check-subscription` (A1's other half)

`customer-portal` keeps its legacy consumer purpose but gains one guard after the email lookup:
`isPlatformCustomer` → `409 platform_customer_use_workspace_billing` + audit (service role; an audit
insert failure is logged at error level); an unreadable check → `503 platform_customer_check_failed`.
The guard has a Deno test on its pure decision. The success log no longer carries the portal URL
(review finding). **Residual, stated:** a platform customer that exists
on Stripe with no row in any of the three sources stays reachable by email; the count on prod is
reported in the Gate B packet. `check-subscription` is **not** read-only `[C12-S2]`: it writes
`user_subscriptions` through the anon client with no forwarded JWT (`:64-71, :114-122, :131-138`), so
those writes are RLS-blocked no-ops (UNVERIFIED), and for a platform owner it finds the platform
customer by email and maps it through `stripe_product_mappings`. Left untouched in A; recorded as
a §198 deprecation item with that description.

### 4.6 Solo data hook `useWorkspaceBillingAuthority` (no screen change in A)

Reads the authority RPC keyed on `activeTenantId` with `createSettingsRequestGate()` (reads only);
resets to `loading` the instant the tenant changes; `openPortal()` captures the tenant id at click,
invokes the function, and opens the URL **only if** `response.tenant_id === captured` **and** the
live tenant ref still equals it — otherwise discards it with a `workspace_changed` refusal `[C9]`.
An act never bumps the read gate's epoch (review finding: it used to, so a click could drop a
legitimate in-flight read). Refusal codes are read from the non-2xx body via
`readFunctionErrorBody()`. Maps every code to owner copy (`not_enabled`, `owner_only`,
`not_applicable_scope`, `no_active_workspace`, `authority_unreadable`, `billing_account_absent`,
`billing_account_ambiguous`, `billing_account_unresolvable`, `needs_config`, `audit_failed`,
`workspace_changed`, network → retry) — copy states what happened, never who else is allowed
("Ask them to open it." / "The attempt was recorded for the platform to review."). Consumes server `scope`, never `account_type ===`
(`lint:tier-features`). Foundation C mounts it. `window.open` after an awaited fetch may be
popup-blocked in some browsers — C's concern, recorded.

## 11. Billing notifications and designated billing contacts (owner rulings 2026-09-02, R18–R27)

**The ruling, as encoded.** The platform bills the workspace, never the signed-in person. Billing
notices are transactional platform notices (R18). Before a paid plan can activate, the workspace
must have at least one **verified Owner designated** as its primary billing contact — never inferred
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

### 11.0 Terminology and authority semantics (owner correction 2026-09-02, R27)

Platform Billing owns this model — its terminology, authority semantics, source records and
lifecycle rules — and does not delegate them (the Spine reads a safe subset:
`docs/handoff/platform-billing-spine-source-contract.md`, PROPOSED/UNMERGED). "Owner" has a broader
platform meaning (legal ownership, co-ownership, corporate or trust ownership, equity, transfer), so
the earlier working label "billing owner" was wrong and is gone from the model, the migration, the
tests, the docs and the copy. The two designations are **functional**:

| Term | Stored value | Eligibility (live, structural) | Confers |
|---|---|---|---|
| **Primary billing contact** | `platform_billing_contacts.designation = 'primary_contact'` | a verified, current, active workspace **Owner** of a top-level Solo workspace | receiving billing notices; satisfying the paid-activation gate |
| **Billing delegate** | `'delegate'` | a verified, current, active **Admin** of the same workspace, selected by an Owner | receiving billing notices |

**Neither designation creates, changes, transfers, implies, or records legal ownership, equity,
corporate ownership, trustee status, or co-owner status.** "Owner" in an eligibility rule is the
workspace's existing membership ownership (`is_tenant_owner()`), read live and never written by a
designation. Receive / view / manage stay **three independently represented and enforced
permissions** (`receives_billing_notices` · `can_view_billing` · `can_manage_billing`); no
designation gains the other two from receiving notices. Plan changes, payment-method actions,
cancellation, paid activation, and adding/removing delegates are **Owner-only**. No default or
backfilled billing contact exists for current workspaces. Promotional and trial workspaces are
explicitly non-chargeable; the ledger is a source record for future real outcomes, not a claim
that anything was sent. The owner copy carries the same sentence where a person could misread it
(`billing_contact_primary_requires_owner`: "…This designation does not change who owns the workspace.").

**What Foundation A ships for it, and what it deliberately does not.** A ships the designation
record, the seams to change and read it, the authority read that carries it, the paid-activation
gate, and the delivery ledger every future send must write to. **A ships no sender.** The
mail-provider contract (provider result → ledger, retry, idempotency, bounce) is its own later
release; today there is nothing to call, by design, and the proof asserts the ledger is empty after
every act (P53).

### 11.1 `public.platform_billing_contacts` (§197 LAYER 1; renamed from `_recipients` before merge under R27)

| Column | Rule |
|---|---|
| `id` uuid PK | |
| `tenant_id` → `tenants` CASCADE | the workspace; top-level Solo only (trigger) |
| `user_id` → `auth.users` CASCADE | an existing member — never an address |
| `designation` CHECK `primary_contact` \| `delegate` | |
| `designated_by`, `designated_at` | the Owner who acted, when |
| `revoked_at`, `revoked_by` | revocation is the only mutation; rows are history |
| UNIQUE `(tenant_id, user_id) WHERE revoked_at IS NULL` | one live designation per person per workspace |

- **Trigger `trg_platform_billing_contact_guard`** (BEFORE INSERT/UPDATE, SECURITY DEFINER only to
  read `auth.users.email_confirmed_at`; every raise is `42501`): top-level Solo only, failing closed on a
  missing tenant, a parent, or `account_type IN ('agency','enterprise','sub_account')` (`billing_contact_top_level_solo_only`) ·
  active membership (`billing_contact_not_member`) · `primary_contact` ⇒ `is_tenant_owner()`
  (`billing_contact_primary_requires_owner`) · `delegate` ⇒ role `admin` (`billing_contact_delegate_requires_admin`) ·
  verified email (`billing_contact_email_unverified`) · a row is never re-pointed, re-typed or
  un-revoked (`billing_contact_immutable`). Structural, so it binds every writer (§51/§59).
- **Grants + RLS (FORCE):** as §3.1 — explicit `authenticated` grant, SELECT policy
  `is_platform_operator()`, ALL policy `is_platform_owner()`; service_role bypasses. The Owner never
  reads the table — only `get_workspace_billing_contacts()` (P37).

### 11.2 `public.platform_billing_notification_log` — the delivery ledger (R25), **no writer in A**

`tenant_id` · `contact_id` (SET NULL) · `recipient_user_id` · `event` CHECK ∈ {`trial_ending`,
`plan_changed`, `invoice_receipt`, `payment_failed`, `payment_action_required`, `cancellation`,
`access_impacting_status`, `promotional_entitlement_change`} · `channel` CHECK `email` · `status`
CHECK ∈ {`skipped_not_relevant`, `skipped_unverified`, `not_configured`, `queued`, `sent`, `failed`} ·
`provider`, `provider_message_id`, `error_code`, `source_event_id`, `idempotency_key` (unique when
set) · `attempted_at`, `outcome_at`. **Never an address, subject or body.** RLS FORCE: operators
read, service writes. A skip is a row, never silence.

### 11.3 Seams (§10 Paige-callable; all `auth.uid()`-keyed through the strict resolver)

| Seam | Who | Does |
|---|---|---|
| `platform_billing_workspace_owner_scope()` (internal, no app-role EXECUTE) | — | the caller's active top-level Solo workspace iff they are its Owner; raises `no_active_workspace` / `billing_not_applicable` / `billing_workspace_owner_only` — never a fallback |
| `platform_billing_contact_designate(p_user_id, p_designation)` | Owner | takes a per-workspace advisory lock (`pg_advisory_xact_lock(hashtext('platform_billing_contacts:'‖tenant))`, review finding: two concurrent designations could both pass the pre-check); `billing_contact_bad_designation` / `billing_contact_bad_user` (`22023`); inserts (trigger validates) + audit `platform_billing_contact_designated` in the same transaction; `billing_contact_already_designated` (`23505`) on a live duplicate, from the pre-check **or** the partial unique index |
| `platform_billing_contact_revoke(p_contact_id)` | Owner | same lock; `billing_contact_not_found` (`P0002`) for an unknown, foreign, or already-revoked id; sets `revoked_at/by` + audit `platform_billing_contact_revoked`; refuses to remove the **last** `primary_contact` while a platform subscription is `active`/`trialing`/`past_due` (`billing_primary_contact_required_while_subscribed`, `42501`) — an unsubscribed workspace may revoke its only primary contact (P58) |
| `get_workspace_billing_contacts()` | Owner (view is Owner-only in A, R22) | live recipients with `role`, `display_name`, `email_verified`, `still_eligible`; **no email column**; raises for anyone else (never an empty set, R8) |
| `platform_billing_paid_activation_ready(p_tenant_id)` | service / operator | R19 gate for the later activation release: ≥1 live `primary_contact` who is still a verified, current Owner of a top-level Solo workspace. Computed live, never cached |
| `platform_billing_verified_primary_contact_count(p_tenant_id)` (internal) | — | the shared predicate behind the gate and the authority read |

### 11.4 `get_workspace_billing_authority()` gains four additive fields

`can_view_billing` (Owner-only in A — a separate field on purpose, R22) · `receives_billing_notices`
(the caller holds a live designation here; confers nothing else) · `billing_contact_state`
(`not_applicable` · `none` · `designated` · `designated_needs_attention` when a designated primary
billing contact is no longer a verified current Owner) · `paid_activation_ready`. The portal `decide.ts` and
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
| T13 Billing contact inferred from whoever signed in | Only an explicit `primary_contact` row satisfies the gate; the gate is `is_tenant_owner()` + verified email, computed live (P47–P49) |
| T14 Every Admin quietly receives billing mail | Receiving is a designation the Owner makes per person (P24: an Admin designating even themself → `billing_workspace_owner_only`; P31) |
| T15 A delegate escalates by being copied | `can_view_billing`/`can_manage_billing` stay false for a delegate; the recipients read and every act raise `billing_workspace_owner_only` (P31, P35, P36) |
| T16 An external address as recipient | `user_id` must hold an active seat (P39); rows carry ids, never addresses; the read has no email column (P33) |
| T17 Unverified delivery | designation refused on an unverified email (P26); the policy skips with `skipped_unverified` |
| T18 A subscribed workspace left with no primary billing contact | revoke of the last `primary_contact` refused while subscribed (P41) |
| T19 Payment notices to a non-charged workspace | `RELEVANT_EVENTS` — Promotional/trial never get invoice/payment events (Deno) |
| T20 Silent delivery / silent skip | the ledger is the contract; A writes nothing to it and proves it (P53) |
| T21 Body-supplied tenant on a designation act | none of the seams read a tenant; the workspace is the caller's, or a raise |

### 11.7 Per-tier answer (§51/§56)

Operator: reads both tables for audit; may call the activation gate; cannot designate for a tenant
(no seat → `no_active_workspace`). Agency/Enterprise: `billing_not_applicable`. Solo Owner: the
only designator/viewer. Solo Admin: designatable as delegate; receives only. Solo Member/coach:
not designatable. Sub-account: `billing_not_applicable`; the trigger refuses a row. Client: an
authenticated seat that is not an Owner takes the same path as Admin/Member — `billing_workspace_owner_only`
on every act, not designatable (`billing_contact_delegate_requires_admin`); a Client with no active seat
here is `no_active_workspace` (not separately fixtured; P24/P25/P39 cover the non-owner paths).
Anonymous: EXECUTE revoked (P54).

### 11.8 Rollback additions

Consolidated in §9.

## 5. Failing-first proof plan

| Layer | Artifact | Cases (red first, then green; mutation-tested) |
|---|---|---|
| SQL | `scripts/sql/platform-billing-account-proof.sql` (BEGIN…ROLLBACK; run via `scripts/sql/run-rollback-proof.mjs`) | **60 properties, numbered as they run: C1, C2, P3–P60** (v3's P1/P2/P5b numbering was replaced by the file's real order). Identity + authority: C1/C2 nothing exists before the migration · P3 reconcile maps the one-id tenant as legacy/backfill · P4 never maps the two-id tenant · P5 idempotent · P6 returns the ambiguous tenant · P7 sub-account row refused · P8 Owner mapped/`can_manage_billing` · P9 table invisible to a member · P10 Admin false · P11 Member false · P12 same user switched to a member seat → refused, `ambiguous` reported as ambiguous · P13 Admin cannot self-grant ownership (outcome asserted) · P14 sub-account owner `not_applicable` · P15 null `active_tenant_id` → null, false · P16 contrast: `current_user_tenant_id()` DOES fall back · P17 act-as (pointer, no seat) → none · P18 absent for a Solo with no customer · P19 tenant refused reconcile · P20 mapped + newer different id → `ambiguous` · P21 anon EXECUTE refused · P22 fixture premise. Billing contacts (P23–P60): owner before designation · P24 Admin designating refused · P25 member not a delegate · P26 unverified refused · P27/P28 designate primary/delegate · P29 duplicate refused · P30/P31 receive-but-not-view/manage · P32/P33 owner read, no email column · P34 audit rows carry no email · P35/P36 delegate refused read + revoke · P37 table invisible · P38 Admin not primary · P39 non-member refused · P40 sub-account owner `billing_not_applicable` · P41 last primary while subscribed protected · P42/P43 revoke + double-revoke · P44 revocation audited · P45 revoked delegate stops receiving · P46/P47 activation gate: tenant refused, service answers · P48/P49 ownership revoked → not ready, `designated_needs_attention` · P50 ledger CHECK · P51 tenant cannot write the ledger · P52 a seeded ledger row is invisible to the tenant (P55 proves it exists, so P52 is not vacuous — review finding) · P53 ledger empty after every act · P54 anon EXECUTE refused on the three seams · P56/P57 Agency owner `not_applicable` everywhere and refused · P58 unsubscribed workspace may revoke its only primary · P59 demoted Admin cannot be re-designated · P60 un-revoking is refused even for the owning role |
| Edge (pure) | `platform-billing-portal/decide.test.ts` | every §6 row + flag off + null authority |
| Edge (pure) | `_shared/platform-billing.test.ts` | legacy guard decision: platform customer refused; legacy customer allowed; upsert conflict detection |
| Edge (pure) | `_shared/billing-notifications.test.ts` | event/status parity with the ledger CHECK · promotional never gets a payment notice · trial gets no invoice/payment event · paid gets all but promotional · unknown gets nothing · unverified recipient skipped · no sender in the module |
| SQL (mutants) | `scripts/sql/platform-billing-account-mutants.sql` | five mutants, each restored or run last so nothing after it depends on the broken object; M0 control proves the restore: M1 resolver → `current_user_tenant_id()` (P15 red) · M2 owner predicate → `role='owner'` (P48 red) · M3 ambiguity collapsed (P12 red) · M4 top-level trigger dropped (P7 red) · M5 contact guard dropped (P26 red). **Result on prod 2026-09-02 (rollback): 60/60 properties ok, 0 failed; 5/5 mutants caught, restore control ok; re-probe after both runs: 0 fixture tenants/users/plans/subscriptions/audit rows, 0 billing tables, 0 billing functions.** |
| Frontend | `src/solo/data/useWorkspaceBillingContacts.test.tsx` | read with eligibility flags · owner-only refusal is a state, not an empty list · switch drops the stale read · designate/revoke call the seams and re-read · refusal codes carried verbatim · an act landing after a switch is `workspace_changed` and reloads nothing |
| Frontend | `src/solo/data/useWorkspaceBillingAuthority.test.tsx` | loading → state; switch mid-flight drops the stale read and never paints the previous workspace; `openPortal` discards a response whose `tenant_id` differs from the captured one; refusal copy per code; retry after error; URL never stored |
| Static | typecheck ratchet, eslint, `lint:definer-fns`, `lint:views`, `lint:managed-schema`, `lint:tier-features`, migration-lint (its one INSERT…SELECT warning is answered inline in the migration), `deno lint`; **`deno check` runs only in CI** (the "Deno ratchet" job, base vs head — it caught 8 real diagnostics on the first head) because the container's proxy returns 404 for `esm.sh` and the local check cannot resolve `@supabase/supabase-js@2.57.2` — stated, not worked around |
| Runtime | authenticated owner drive on preview **owed to a capable session**; stated UNVERIFIED; the flag stays off until it lands |

## 6. Decision table (pinned by tests)

| flag | active_tenant_id | membership | scope | owner | mapping | Result |
|---|---|---|---|---|---|---|
| off | — | — | — | — | — | 403 `not_enabled` |
| on | (authority read failed / null) | — | — | — | — | 503 `authority_unreadable` |
| on | null | — | — | — | — | 403 `no_active_workspace` |
| on | set | none / inactive | — | — | — | 403 `no_active_workspace` |
| on | set | active | sub_account | any | — | 403 `not_applicable_scope` |
| on | set | active | agency / enterprise | yes | any | 403 `not_applicable_scope` |
| on | set | active | top_level_solo | no (admin/member/coach) | any | 403 `owner_only` |
| on | set | active | top_level_solo | yes | absent | 409 `billing_account_absent` |
| on | set | active | top_level_solo | yes | ambiguous | 409 `billing_account_ambiguous` |
| on | set | active | top_level_solo | yes | any other state value | 503 `authority_unreadable` |
| on | set | active | top_level_solo | yes | RPC said mapped, row gone at read | 409 `billing_account_absent` |
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
| Client (authenticated, non-owner seat or no seat) | `owner_only` / `no_active_workspace` — the same non-owner path as Admin/Member; never a portal |
| Anonymous | 401 at `verify_jwt`; EXECUTE on every seam revoked (P21, P54) |

## 8. Residual risks (stated)

- **Delivery is not wired** (by ruling). Until the delivery release lands, a designation is a record
  with no effect on anyone's inbox; the Solo screen (C) must say so in plain words, never imply
  notices are flowing.
- A designated primary billing contact who later loses ownership, or a delegate demoted from Admin, keeps the
  row; the read reports `still_eligible=false` / `designated_needs_attention` and the gate ignores
  them. Automatic revocation on role change is a later decision, recorded here rather than assumed.
- The paid-activation gate is a **server function the activation release must call**; nothing in A
  can force that call — **it has no caller on this branch**, by design. The Gate B packet for that
  release must cite it.
- **Audit-row visibility (pre-existing policy, not A's change, recorded by the review):** the
  `paige_audit_log` policy *"Tenant admins read their own tenant's audit"* lets a person holding the
  global `admin` app_role read their resolved tenant's audit rows — including A's
  `platform_billing_contact_designated/_revoked` and `platform_billing_portal_*` rows (user ids,
  designation, refusal codes; never an email or a Stripe id). That is metadata about billing acts
  reaching a non-Owner. Left as is: narrowing a shared audit policy is a §37 change of its own,
  filed for Foundation B / the delivery release to rule on.
- **Legacy `SubscriptionContext` (app-wide) does not know A's new codes:** on
  `platform_customer_use_workspace_billing` (409) or `platform_customer_check_failed` (503) it shows
  its generic "Failed to open customer portal" toast with the client's message. Correct behaviour
  (a platform customer is refused there) with imprecise copy; Foundation C replaces that lane for
  Solo. Dead consumer codes, not a defect in A.

- Legacy `customer-portal` remains reachable by email for a platform customer with no row in any LAYER-1 source (count reported at Gate B). `check-subscription` untouched (§4.5).
- Re-subscribe mints a new customer (§3.3) until Foundation B.
- A mapped top-level tenant re-parented later keeps its row (no tenants trigger in A).
- Comped/promotional workspaces have no mapping → `billing_account_absent` until B/C and the promotional rollout give them a truthful non-portal state.
- Prod facts UNVERIFIED until read at Gate B: rows with >1 distinct customer id; non-null `tenants.stripe_customer_id` rows; any V2-account platform customer.

## 9. Rollback `[C11-M1]`

Additive migration; nothing existing is altered. Rollback, in order:

1. `DROP TABLE public.platform_billing_notification_log;` (FK → contacts)
2. `DROP TABLE public.platform_billing_contacts;` then `DROP FUNCTION public.platform_billing_contact_guard();`
3. `DROP TABLE public.platform_billing_accounts;` then `DROP FUNCTION public.platform_billing_account_top_level_guard();`
4. `DROP FUNCTION` for the ten seams: `get_workspace_billing_authority()`,
   `platform_billing_account_reconcile()`, `billing_active_tenant_id()`,
   `platform_billing_layer1_customer_ids(uuid)`, `platform_billing_verified_primary_contact_count(uuid)`,
   `platform_billing_workspace_owner_scope()`, `platform_billing_contact_designate(uuid,text)`,
   `platform_billing_contact_revoke(uuid)`, `get_workspace_billing_contacts()`,
   `platform_billing_paid_activation_ready(uuid)`. A later migration that changes
   `get_workspace_billing_authority()`'s return columns must `DROP FUNCTION` before re-creating it
   (Postgres refuses `CREATE OR REPLACE` with a different RETURNS TABLE).
5. Code: remove `platform-billing-portal` (+ its `supabase/config.toml` entry), the two webhook
   `upsertBillingAccount` calls, the `customer-portal` guard, `_shared/platform-billing.ts`,
   `_shared/billing-notifications.ts`, and the two Solo hooks. Nothing else references them.

The flag default-off means the portal route is inert until explicitly enabled.

## 10. Gate B packet (what will be requested — nothing before)

Exact head · migration + rollback-proof transcript · Deno + vitest transcripts · lints/typecheck ·
CI on that head (the Deno ratchet is the only `deno check`) · the independent review of that head ·
per-tier results · **three statements kept separate: what is implemented, what is still
unavailable, and whether any recipient email was delivered (none — no sender exists)** · the
UNVERIFIED list (authenticated owner drive; local `deno check`) · the PROPOSED Spine source
contract · the request: **merge + migration apply + edge deploy for this slice only, with
`PLATFORM_BILLING_PORTAL_ENABLED` unset** — no Stripe object, no price, no charge, no entitlement
record, no flag flip, no email.
