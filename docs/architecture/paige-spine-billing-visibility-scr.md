# Communications and Billing Visibility — Spine Change Request

**Status: change request. No capability was registered, no tool was added, no migration was
written, and no handler, Rail, Mind or UI file was edited to produce it.** It is a contract and a
set of routed handoffs; it is not permission to build any part of it.

Grounded against `origin/main` `c23c2150` on 2026-09-02 by reading the shipped source and running
the repository's own guards, not by reading a prior report. Every claim below that says a thing
exists, or does not, names where that was checked.

---

## 0. What this request is for

A workspace owner should eventually be able to ask PAIGE:

- *"What is my workspace's billing status?"*
- *"What billing notices have I personally received?"*
- *"Is our billing-notification setup ready and healthy?"*

This request defines the **narrow governed read contract** for those three questions, and the
**source contracts other workstreams must supply first**. It deliberately does not define a
notification browser, an email or SMS system, a payment-management path, or a Chat shortcut around
the Billing screen.

**PAIGE is another safe reader of Billing's source of truth. She is never a second source.**

---

## 1. What the Spine can carry today, and what actually blocks these three

The migration map's central finding — *"the Spine's evidence contract is an EVENT-SIGNAL contract,
not a data-read contract"* (`paige-spine-tool-migration-map.md` §2, merged as `852f6023`) — is the
right starting point, and this document's first draft **over-read it**. The correction is below and
it changes which workstream is blocked.

Four constraints, each read from the shipped source:

| Constraint | What the code enforces | Verified at |
|---|---|---|
| **C1** | The Rail is per-client at three independent layers. `paige_client_events.contact_id` is `NOT NULL REFERENCES clients(id)`; `record_rail_event` raises `contact not in tenant`; the Chat emitter returns early with no contact. **A workspace-level outcome has nowhere to be recorded.** | `20260712163259_paige_context_rail_step1_foundation.sql:80,176` |
| **C2** | The resolver accepts exactly one subject type and rejects any row where `subject_type !== "client"`. | `_shared/paige-spine/resolveEvidence.ts:40` |
| **C3** | `safe_summary` must be byte-identical to the capability's declared constant, and every fact value must be **one of an enumerated set declared at registration**. | `resolveEvidence.ts:45`, `safeFacts:17-28` |
| **C4** | Spine evidence loads **only inside a client-scoped Chat turn** — `spineEvidenceBlock` is populated within `if (scopedClientId)`, so a question asked with no focused client reaches no Spine evidence at all. | `paige-ai-chat/index.ts:1114-1127` |

### C3 is a SHAPING constraint, not a bar — a correction to this document's own argument

**This section first claimed C3 "cannot express a record, a list, a name, a count, a status string,
or free text", and concluded that no capability could be registered above `UNAVAILABLE` no matter
what Billing supplied. That was wrong**, and it was the load-bearing claim of the whole request.
Measured against the same files it cited:

- `SpineFact = boolean | number | string | null` (`contracts.ts:5`) — numbers and strings **are**
  representable.
- `facts` is `Record<string, SpineFact>` (`contracts.ts:63`) — a bounded record of scalars **is**
  expressible.
- `resolveSpineEvidence` returns `signals: readonly SpineSignal[]` (`resolveEvidence.ts:9`) — a
  **list** is already the shape it returns, so a notice history could be N signals.

What C3 actually forbids is an **unenumerated** value: `safeFacts` admits a fact only when it matches
a value declared in the capability's `factValues` (`resolveEvidence.ts:25`).

| Wanted | Expressible under C3 |
|---|---|
| An access state from a fixed set (`trialing`, `active`, `past_due`) | **Yes** — enumerate it |
| Whether a billing contact is configured | **Yes** — a boolean |
| A notice's category and delivery state, from fixed sets | **Yes** |
| An unresolved-failure count as a **bounded band** | **Yes** — enumerate the bands |
| An **exact** count | No — every value would have to be enumerated |
| A plan **name**, or any label read as free text from a row | No — arbitrary strings. §3.2's topic label is therefore derived from a fixed category set, not from the row |

**So the health capability is largely expressible today and the other two are partly so.** The
correction matters practically, not just for the record: the original claim would have sent the Spine
workstream to build a record/list evidence shape that is not what is missing.

### What actually blocks all three, after the correction

**C2 and C4, both structural, either one sufficient.** Every capability here names a **workspace**,
which `resolveEvidence.ts:40` rejects outright; and even with a workspace subject, C4 means a billing
question asked without a focused client never reaches the resolver.

Plus the plain fact that **the sources do not exist** (§2b) — no billing authority model, no notice
ledger, no delivery-path signal. That is a Billing blocker rather than a Spine one, and it is why all
three stay `UNAVAILABLE` today, now for reasons that are stated correctly.

### 1a. This request raises the three changes the migration map named and nobody raised

The migration map's Wave 0 lists **SCR-1, SCR-2 and SCR-3** as *"not requested, not started"*, and
is explicit that they are shorthand rather than identifiers: *"Whoever raises them gets a real dated
name."* This request raises two of them and depends on the third.

The bare date `SCR-2026-09-02` is already taken by an approved request (the Chat-facing block may
carry the safe `rail:` citation, recorded in `docs/architecture/paige-spine-foundation.md:40`), so
these carry a suffix.

| This request | Migration-map shorthand | What it asks for | Needed by |
|---|---|---|---|
| **SCR-2026-09-02-B** | SCR-2, **C4**, and a **refusal channel** | (a) the resolver accepts a **workspace** subject type alongside `client`, tenancy still derived server-side; (b) the **Chat loading path reaches the resolver on a turn with no focused client**; (c) a way to express an **authority refusal distinct from an outage** — see the note below the table | (a) and (b): all three capabilities. **(c): capabilities 1 and 3 only** — see below |
| **SCR-2026-09-02-C** | *(not SCR-3)* | **Withdrawn as originally scoped.** It asked for a record/list shape the contract already has. What remains, if anything, is per-capability vocabulary work at registration time — enumerating the states and bands each capability may report — which is ordinary capability declaration, not a shared-primitive change | — |
| *(depends on)* | SCR-1 | A workspace-level outcome projection, so a workspace act has somewhere to be recorded | the Rail vocabulary in §6 |

**(c) is a gap this document promised past, and it is worth stating on its own.** §3 says a
non-Owner is "refused with a reason that names the missing authority". `SpineEvidenceResult` has
exactly two states — `available` and `unavailable`, the latter carrying `capability_unavailable |
resolver_unavailable | subject_required | scope_changed` (`resolveEvidence.ts:9-10`). **There is no
refusal.** A role-gated RPC's authorization error collapses into `resolver_unavailable`, so an
implementation satisfying every handoff listed here would report *denials as outages* — telling an
Owner the billing read is broken when in fact they are not permitted to make it. An outage invites a
retry; a refusal does not.

**It is NOT a prerequisite for capability 2**, and saying so was over-correction. That capability
exposes **no recipient parameter** and derives the only readable recipient from `auth.uid()`, so a
cross-recipient request cannot be expressed in the first place — the protection there is structural,
not a refusal at all. §3.2's sentence about refusing such an attempt describes a case the contract
makes unreachable. Requiring the channel for it would delay a self-only read for a hazard it does
not have.

**SCR-1 is not raised here.** It belongs to whoever owns the Rail, it is required by 47 of 60
classified Chat actions rather than by billing alone, and raising it inside a billing request would
scope a platform primitive to one domain's needs. It is a dependency, recorded as such.

**Neither B nor C is designed in this document.** Designing the shared resolver's subject model or
its evidence shape inside a billing request is the same error in the other direction. This request
states what billing visibility needs from each, and stops.

---

## 2. Collision and ownership check

Run before writing any of the contract below.

### 2a. What already exists and must not be duplicated (§18)

| Thing | Where | Bearing on this request |
|---|---|---|
| `public.get_tenant_platform_subscription()` | `20260726120000_platform_subscription_paige_seam.sql:17` | **The one existing tenant-side billing read.** `SECURITY DEFINER`, tenant derived from `current_user_tenant_id()`, caller cannot pass a tenant. Returns plan slug/name, status, billing period, period end, cancel-at-period-end, and plan prices. **Carries no Stripe identifier**, so it already satisfies the projection ban on provider ids. It is the natural basis for capability 1 and **must be extended or wrapped, never re-implemented.** |
| `platform_subscriptions` | table | Carries `stripe_customer_id` and `stripe_subscription_id`. Never projectable under §5. |
| `tenants.trial_ends_at`, `tenants.status` | `tenant_status` = `trial \| active \| past_due \| canceled \| suspended` | A real tenant-scoped source for trial-end and access state. |
| `tenant_revenue_classification` | `20260814000000_tenant_revenue_classification.sql:25` | Carries `revenue_class` (`promotional \| paid \| internal_test`), and also `comp_reason` and `notes`. **Operator-internal: `is_platform_owner` RLS, and its own table comment says "tenants never read it."** See the open decision in §9. |
| `is_tenant_admin_as(actor, tenant)` | `20260714235406_marketplace_mcp_actor_seam.sql:42` | Active `tenant_members` row with `role IN ('owner','admin')`. `service_role` grant only. |
| `tenant_role` enum | `owner \| admin \| coach \| member` | The available vocabulary for caller identity. |
| `_assert_billing_admin()` | `20260702023046_…sql:57` | **Not the gate for this request.** It governs L2 tenant→client service billing, and it keys on the *global* `has_role(uid,'admin')`, which carries no tenant — the §59 global-role trap. Named here so nobody adopts it for platform billing. |
| Systems Check registry | `20260816000000_systems_check_layer1.sql` — seed begins `:229`, the two payment checks at `:306` and `:316` (an earlier draft cited `:199-208`, which is RLS policy for the finding table, not the registry) | Registers `payment_processor_connected`/`payment_readiness` and `payment_method_options`/`payment_options` — tenant→client payment readiness under §38's processor-agnostic declared-field rule. **No platform-billing check and no billing-notification check exists.** |
| Solo Settings → Billing | `src/solo/settings.tsx:1457` | Reads `useSoloComms().billing`. Platform subscription `PARTIAL`; invoices, payment method, usage all `UNAVAILABLE`. |
| Solo Settings → Notifications | `src/solo/settings.tsx:1451` | Two cards, `PARTIAL` and `UNAVAILABLE`. The empty destination the UI handoff in §8 names. |
| `PAIGE_SPINE_CAPABILITIES` | `_shared/paige-spine/registry.ts:4` | Exactly one registered capability (`pipeline.deal_stage_evidence`). No billing domain exists. |
| Chat tool surface | `paige-ai-chat/index.ts` | **105** inline tools — the figure the repo's own `lint:chat-tool-registry` guard reports, and the one the migration map uses. An earlier draft said 111, from an unanchored `grep` that counted `name:` occurrences rather than tool declarations. **Zero billing tools**. Adding one is out of scope in THIS phase; when it is in scope, each tool depends on SCR-2026-09-02-B and on **the Billing contracts applicable to that capability** (§3's per-capability maturity rows, not all of §4 — the notice-history read does not wait on B-1, and the status read does not wait on B-4), and on nothing in §6 or §7. An earlier draft pointed this at §7's conditions, which would have kept the Rail/Mind sequencing as a hidden blocker on the reads — the same defect the §7 correction removed, left standing one section away. |

### 2b. What does NOT exist — measured, not assumed

Each of these was searched for before being called absent, because *"it isn't there"* is
indistinguishable from *"I didn't look"* unless the search is stated.

| Absent | How that was established |
|---|---|
| **Any billing contact or billing delegate model** | `grep -rn "billing_contact\|billing_delegate\|billing_email\|billing_admin"` across `supabase/` and `src/` returns only `_assert_billing_admin` / `_log_billing_admin_action` in one 2026-07-02 migration. There is no row, column, or table designating who receives billing notices. |
| **Any billing notice ledger** | No table matching `*notif*` is billing-scoped. `stripe-webhook/index.ts` writes `audit_logs` and `analytics_events` and emits no rail event and no notice record. |
| **A safe general notification store** | `public.notifications` (2025-10-16) is **user-scoped with no `tenant_id`**, carries a free-text `message` — a raw body — and its `notification_type` enum is consumer-finance-flavoured (`dispute_update`, `payment_success`, `credit_report_ready`). It is unusable for capability 2 on three separate grounds: no tenancy, raw content, and a §2 platform-default vocabulary problem. |
| **Any delivery-outcome record for a billing notice** | Nothing writes a delivered/failed/suppressed state for a billing message anywhere. |
| **Any tenant-side billing RPC other than the one above** | `grep -o "get_[a-z_]*billing[a-z_]*"` across all migrations returns nothing. |

### 2c. Active collisions

| Surface this request would eventually touch | In-flight work | Disposition |
|---|---|---|
| `_shared/paige-spine/resolveEvidence.ts`, `contracts.ts`, `registry.ts` | **PR #792** (governed execution seam) does **not** touch these three files; it adds `governedExecution.ts`. No collision. | clear |
| `supabase/functions/paige-mcp/index.ts` | **PR #789** holds it byte-identical to `6ef1e97f`. This request touches no MCP file. | clear |
| `src/solo/settings.tsx` | Solo Shell owner's surface. **This request edits none of it.** | handed off, §8 |
| `paige-ai-chat/index.ts` | Historically the most contended file in the repository. **This request edits none of it.** | not touched |

**No shared code is edited by this request.** That is what makes it a change request rather than a
change.

---

## 3. The three capabilities

Each is stated as it would eventually be registered, and each is `UNAVAILABLE` today for the
reasons in §1 and §2b. The `key` follows the registry's enforced pattern — `domain.capability`,
snake case, namespace matching `domain` (`registry.ts:6,17`).

### 3.0 How a per-field `UNAVAILABLE` is actually REPRESENTED — read this before the three contracts

Every contract below promises that a field with no proven source "reports `UNAVAILABLE` with its
reason" rather than being guessed. **That promise is not free, and as first written it was not
reachable.** The Spine's own shape decides how it must be built:

- `safeFacts` requires the fact object to carry **exactly** the declared keys, each holding a value
  **enumerated** in `factValues` (`resolveEvidence.ts:17-28`). A key that is simply *omitted* when
  its source is missing makes the whole fact object invalid.
- One invalid signal does not degrade to a partial answer — it collapses the **entire read** to
  `unavailable / resolver_unavailable` (`resolveEvidence.ts:73-74`), which is the reason string for
  an **outage**. So a missing field would have been reported as the resolver being broken.

**The rule, therefore, and it binds every field in §3.1, §3.2 and §3.3:**

1. **A fact key is ALWAYS present.** Never omitted, whatever the source did.
2. **Every optional field's enumeration explicitly includes its unavailability values**, and the
   reason travels *in the value* rather than beside it — because a free-text reason is exactly the
   unenumerated string `safeFacts` rejects. So a field's `factValues` reads, for example:
   `["none", "payment_method_needed", "renewal_upcoming", "trial_ending", "access_at_risk",
   "unavailable_no_source", "unavailable_decision_owed"]`.
3. **"Unavailable" and "the resolver is down" therefore stay distinguishable**, which is the whole
   point: one is a fact about this workspace's configuration, the other is a fact about our
   infrastructure, and reporting the first as the second is the §32 false-green inverted.

**No new primitive is needed for this** — it is the existing enumeration used honestly, which is why
this is stated as a construction rule rather than raised as a fourth Spine change. What it costs is
that **every enumeration in this document must carry its unavailability values from the start**; a
field enumerated without them cannot express its own fallback later without a contract change.

This is the same defect as §1a's refusal channel, one layer down: there, a denial would have been
reported as an outage; here, an absence would have been. Both come from the same habit of promising
a state the contract has no way to carry.

### 3.1 `billing.workspace_billing_status`

*Requested as `workspace_billing_status.read`; rendered in the registry's required namespace form.*

| Field | Contract |
|---|---|
| **Question** | *"What is my workspace's billing status?"* |
| **Caller identity** | The authenticated user, resolved from the verified JWT's `auth.uid()`. **Never from a request body** (§9, and the #588 defect that rule exists for). |
| **Workspace derivation** | Server-side only, from the caller's resolved tenant. The caller supplies no tenant, no account, and no workspace id, on any door. |
| **Allowed roles** | The workspace **Owner**. A Billing delegate **only if** Billing's source contract explicitly grants billing-view authority to that person — see B-2 in §4. Until B-2 exists there is no delegate concept, so the answer is Owner only. |
| **The access state is ENUMERATED and NORMALISED, because the sources already disagree** | `trialing` · `active` · `past_due` · `canceled` · `suspended` · `unsupported_source_value` · `unavailable_no_source`. This is not tidiness: `tenants.status` carries `trial`/`active`/`past_due`/`canceled`/`suspended`, while `platform_subscriptions.status` has **no CHECK constraint at all** and already accepts Stripe's `trialing` (`20260726140000_bplatform_v2_rename_trial_invite.sql:14-18`) — two vocabularies that differ on the very first value. `safeFacts` admits only what is enumerated, so without a governed normalisation each B-1 implementer would invent their own user-visible states. The mapping is B-1's to state and this contract's to bound: `trial` and `trialing` both normalise to `trialing`; **`unpaid` normalises to `past_due`**; the other four map by name; **a value matching nothing normalises to `unsupported_source_value`, never to a guess and never to `active`.** The `unpaid` case is not a courtesy — the webhook persists Stripe's status verbatim (`stripe-webhook/index.ts:1331`), and the shipped revenue and health queries already classify `past_due` and `unpaid` **together** as dunning (`20260814300000_metric_reconciliation_revenue_class.sql:47,54`). Sending it to `unsupported_source_value` would have replaced an existing product definition with "unknown" — the same defect as the trial threshold, one row away, in the commit that fixed the trial threshold. |
| **And the two sources can DISAGREE, so precedence is declared: the MOST RESTRICTIVE state wins** | Normalising each value said how to translate a status and not which status to translate. The two are written by different seams — `operator_set_tenant_status` (`20260804150000_operator_fleet_seam.sql:28`) moves `tenants.status` alone, while `customer.subscription.updated` moves `platform_subscriptions.status` alone — so tenant `suspended` with subscription `active`, and tenant `active` with subscription `unpaid`, are both reachable states. Without a rule, two compliant implementations report **opposite** answers for the same workspace, and the wrong one is `active` for a workspace that is suspended or in dunning. Precedence, most restrictive first: `suspended` › `canceled` › `past_due` › `trialing` › `active`. **This is not my invention either** — the shipped revenue/health query already resolves the same disagreement the same way, flagging dunning when *either* source says so (`20260814300000…:53-54`, an `OR`). The rule here is that one generalised, not a new one. Defaulting an unrecognised billing status to "active" is the failure mode this row exists to prevent. |
| **Safe projection** | plan/access state *(enumerated in the row above)* · promotional-trial-paid classification *(subject to the open decision in §9)* · renewal or trial-end state **where truly available** · a bounded next-action state (see the row below — it has a named producer or it is not projected). |
| **The next-action state is ENUMERATED here and MAPPED by Billing** | The set is `none` · `payment_method_needed` · `renewal_upcoming` · `trial_ending` · `access_at_risk` · `unavailable_no_source` — the last of these per §3.0, because a field whose source has not landed still has to send a value. B-1 as described supplies status, period end and cancellation state and **no next-action fact**, so an implementer meeting every named prerequisite would have had to invent this downstream — the same missing-producer defect as §7's patterns, in a projection rather than a pattern. Enumerating the set here makes it representable (`safeFacts` admits only enumerated values); **deciding which one applies is B-1's obligation**, not an inference the Spine makes from status and dates. If B-1 does not carry it, the field reports `UNAVAILABLE` with that reason rather than being derived. |
| **The trial-end state is a BOUNDED state, and the rule is the one this repository ALREADY SHIPS** | Projected from a fixed set — `active` · `ends_within_declared_window` · `ended` · `not_applicable` · `unavailable_no_source` (§3.0). **The window is 3 DAYS and the arithmetic is `trialDaysLeft`**, both taken from `src/lib/platform/tenantLifecycle.ts`: the tenant-health rule flags a trial as ending soon at `days <= 3` (`:97-100`), and `trialDaysLeft` (`:47-56`) defines the day count as `(end - now) / 86_400_000`, **rounded UP while the trial is in the future and DOWN once lapsed**, so a past date is always strictly negative rather than a deceptive 0. `ended` is `days < 0`; `ends_within_declared_window` is `0 <= days <= 3`; `active` is everything else — **and none of it is evaluated unless the access state is `trialing`.** |
| **The status predicate is part of the rule I reused, and I dropped it** | `tenantLifecycle.ts:97-100` reads the date **only** when `status === "trial"`. I took the threshold and the arithmetic and left that behind, which is worse than not reusing the rule at all: `stripe-webhook/index.ts:786-792` flips a converting tenant to `active` and **does not clear `trial_ends_at`**, so a paying customer keeps a past trial date forever. My version would eventually have told them *"trial access ended"* — a false alarm about losing access, sent to someone who had just started paying. The band is therefore `not_applicable` whenever the access state is anything but `trialing`, and `not_applicable` is in the enumeration (§3.0) rather than being an absence. **Reusing half a rule is not reuse.** |
| **Why 3 and not the 7 an earlier revision declared** | I picked 7 as "a default chosen so the contract is decidable", explicitly not a product ruling — and that was the error, because **this repository already has a product ruling** and 7 would have created a second one. A trial with five days left would then be "ending soon" to PAIGE and "fine" to the tenant-health surface, for the same tenant on the same day. §18's one-home rule settles it without an owner decision: an existing definition beats a new default, and if Billing's B-1 wants different it says so in one place. The boundary semantics are inherited for the same reason — `<` versus `<=`, calendar days versus elapsed hours, and which clock supplies "today" are all decided by reusing the shipped helper rather than restating it. |
| **The raw `trial_ends_at` timestamp is NOT projectable, and that is a Spine constraint** | `safeFacts` admits a fact value only if it is one of the candidates **enumerated** in `factValues` (`Object.is`, `resolveEvidence.ts:17-28`), so an arbitrary date can never be a fact — it cannot be enumerated in advance. `occurred_at` is not an escape either: a signal must satisfy `recorded_at >= occurred_at` (`resolveEvidence.ts:42`), so a FUTURE trial-end date cannot sit there. An earlier revision of this row said the timestamp "may also be projected, since a date is not a banned value class." That confused two different limits: the §5 ban is about privacy, and this one is about representability. **The band survives precisely because it IS enumerable; the date does not.** Recorded because the previous round correctly established that records, counts and enumerated strings *are* expressible, and this document then leaned on that correction one step too far. |
| **Never projected** | payment method data · card or bank details · Stripe customer or subscription identifiers · raw invoices · any other workspace's information · internal provider payloads · plan pricing beyond what the workspace is actually on. |
| **Refusal** | A caller who is neither Owner nor an explicitly granted delegate is refused with a reason that names the missing authority and does not reveal whether the underlying record exists. A refusal is never a degraded read. |
| **`UNAVAILABLE` behaviour** | **Represented per §3.0** — the key is always present and carries an enumerated `unavailable_*` value; it is never omitted. Where a field has no proven source — today: the promotional/trial/paid classification, and any delegate authority — the capability reports that field absent with its reason. **It never substitutes a default, an inference, or a plan name it did not read.** |
| **Freshness** | `staleAfterDays: 1`, `projectionWindowDays: 1`. The registry requires both of every evidence capability (`contracts.ts:18-19`), and an earlier revision supplied them for capability 2 alone — so the two CURRENT-STATE reads would have had their freshness chosen by whoever registered them first, and the same billing status could be stale in one implementation and current in another. Both are 1 here because this is a **current-state** read, not a history: an answer about today's plan that is a week old is not a stale answer, it is a wrong one. |
| **Audit boundary** | The read is recorded as a read: capability key, caller, resolved tenant, outcome (`answered` / `refused` / `unavailable`). **No projected values are written to the audit record**, because an audit row is a second copy of whatever it stores. |
| **Maturity today** | `UNAVAILABLE`. **Blocked as a capability** on SCR-2026-09-02-B (workspace subject, the non-client Chat path, **and the refusal channel**) and on **B-1**. **B-2 and B-3 block individual FIELDS, not the read** — without B-2 the caller set is Owner-only and without B-3 the classification field reports `UNAVAILABLE` with its reason, which is exactly the behaviour this contract already specifies. Listing them as capability blockers would make that fallback unreachable and hold back a useful subscription-status read for no reason. |

### 3.2 `billing.my_billing_notice_history`

| Field | Contract |
|---|---|
| **Question** | *"What billing notices have I personally received?"* |
| **Caller identity** | The **current authenticated recipient only**, from `auth.uid()`. There is no parameter naming a recipient, so there is no parameter to abuse. |
| **Workspace derivation** | Server-side. The read is additionally scoped to the caller's own recipient identity **within** that workspace — being the Owner does not widen it to other people's notices. |
| **Allowed roles** | Any authenticated member, **for their own notices only**. Role does not widen this read; it is the one capability here where the Owner has no privileged view. |
| **Safe projection** | category · a topic label **derived from that category, from a fixed set declared at registration** · occurrence time · delivery state · a safe next-action state — `none` · `action_required` · `unavailable_no_source` (§3.0) — **supplied by B-4** (see below). Bounded list, bounded window — the numbers are below, not left to the implementer. |
| **The list limit is 25 and the window is 365 DAYS** | "Bounded list, bounded window" named two limits and set neither, so one compliant registration could expose 10 notices from 30 days and another 100 from a year while both followed this contract. Leaving them unstated does not mean "unbounded" — the registry REQUIRES a concrete `projectionWindowDays` (`contracts.ts:19`) and the resolver's limit silently defaults to 50 and caps at 100 (`resolveEvidence.ts:69`), so it means "whatever the first implementer typed". `projectionWindowDays: 365`, `staleAfterDays: 90`, list limit **25**. |
| **The three notice vocabularies are ENUMERATED, and NOT borrowed from the messaging tables** | `category`: `payment_failed` · `payment_succeeded` · `plan_changed` · `trial_ending` · `renewal_upcoming` · `account_at_risk` · `unavailable_no_source`. `topic_label`: derived one-to-one from the category, so it adds no vocabulary of its own — that is the whole reason it is category-derived (§3.2). `delivery_state`: `pending` · `delivered` · `failed` · `suppressed` · `unavailable_no_source`. Left unenumerated, `safeFacts` would admit none of them, and a registrant would reach for a vocabulary that already exists — but the ones that exist do not fit: `messages.status` carries seven values including `draft`, `received` and `read` (`20260726190000…:100`), and `operator_messages.status` a smaller set. **Neither is the billing-notice lifecycle**, so borrowing either would import states a billing notice cannot be in. This is the opposite case to `unpaid`: there, an existing definition had to be reused; here, two existing vocabularies had to be deliberately NOT reused, and saying which and why is what stops the next reader from assuming otherwise. |
| **The question is narrowed to "the LATEST 25", because truncation is not representable** | `resolveEvidence` returns an array and nothing else — no total, no cursor, no truncation flag — so an implementation literally cannot say "there are more". Promising "what notices have I received" while silently returning 25 of 60 would be a §32 false-green in the shape of an answer. Two consequences, both binding: the ordering is **deterministic newest-first**, so which 25 is not an implementer's choice; and the capability answers *"your most recent billing notices"*, never *"all of them"*. If a complete history is wanted later, that needs a paging primitive and is a Spine change, not a bigger number here. |
| **Actionability is B-4's to state, never capability 2's to infer** | B-4 as described carries category, occurrence time and delivery state — none of which proves a notice needs the recipient to do anything. An informational notice and an actionable one are indistinguishable in that contract, and `billing.notice_requires_action` is a **future Rail event**, not a source this read may consult. So B-4 must carry a bounded actionability fact, or this field reports `UNAVAILABLE`. This is the same defect as the "*required* notice" adjective §7 had to drop, one section earlier. |
| **Why the label is category-derived, not row-derived** | Withdrawing SCR-2026-09-02-C removed the only route to an arbitrary row-supplied label, and this projection still promised one — a contradiction this document introduced and did not catch. It is narrowed rather than re-opened, because a **row-derived label is also the wrong contract on privacy grounds**: the nearest thing a notice row holds to a "topic" is its subject line, and projecting that would put message content into the read this capability exists to keep content out of. A fixed category-derived label carries the same meaning for a person and cannot carry the content. |
| **Never projected** | another recipient's address, identity, or notices · raw message body or subject · provider payload · payment information · internal metadata · any address or phone number, including the caller's own. |
| **Refusal** | An attempt to read another recipient's history is refused as an authority failure, and is never answered with an empty list — an empty list is a fact about the caller, not a way to hide a refusal. |
| **`UNAVAILABLE` behaviour** | **Represented per §3.0.** **This is the capability's state today and it is total.** No billing notice ledger exists (§2b). It reports `UNAVAILABLE` with that reason. It must **never** fall back to `public.notifications`, which is untenanted and carries raw bodies. |
| **Audit boundary** | Read recorded as above. Never the notice content, never the label, never the recipient's address. |
| **Maturity today** | `UNAVAILABLE`. Blocked on SCR-2026-09-02-B parts **(a) and (b)** — workspace subject and the non-client Chat path — and on **B-4**, the ledger itself. **Not on the refusal channel:** with no recipient parameter, a cross-recipient request cannot be expressed, so there is nothing here to refuse. No other Billing contract gates this read. |

### 3.3 `billing.workspace_billing_notification_health`

| Field | Contract |
|---|---|
| **Question** | *"Is our billing-notification setup ready and healthy?"* |
| **Caller identity** | `auth.uid()`, server-derived. |
| **Workspace derivation** | Server-side, caller's own tenant. |
| **Allowed roles** | **Owner.** Any delegated access must be explicitly granted by Billing's source contract (B-2), not inferred from tenant-admin status. |
| **Safe projection** | whether a billing owner/contact is configured · whether eligible delegates exist · whether the delivery path is available · a bounded **band** for **unresolved** delivery failures (enumerated below). |
| **The failure band is enumerated, and it is ALWAYS a band** | `none` · `single` · `few` (2–5) · `many` (6 or more) · `suppressed_small_cohort` · `unavailable_no_source`. §3.0 makes a scalar's *unavailability* representable but says nothing about what that scalar's other values are, and `safeFacts` accepts only what `factValues` literally lists — so an unenumerated count is not merely imprecise, it is **unrepresentable**, and two implementations could pick incompatible bands while both claiming compliance. **And it is a band in every case, not only where an exact figure would identify someone** — the row below originally banded conditionally, which asks the runtime to re-decide re-identification on every read. **But banding alone does NOT remove that judgement, and claiming it did was wrong:** in a workspace with one billing recipient, `single` names that person's delivery outcome exactly, and `few` identifies everyone in a two-person set. A band over a small cohort is still a fact about an individual. So the enumeration carries `suppressed_small_cohort`, and **below a minimum cohort of 5 the band is suppressed rather than reported.** |
| **The band DEPENDS ON B-2, and my attempt to avoid that dependency was wrong** | I first wrote "5 eligible recipients", then — to keep the band answerable from B-4 alone — recast it as the distinct recipients in the ledger window, calling that a conservative LOWER bound that could only be raised by B-2. **That claim is false, and false in the unsafe direction.** A ledger window also OVER-counts: recipients who were removed or became ineligible after receiving a notice are still distinct rows in it. Four former recipients plus one current one satisfy a threshold of 5, and the band then reports `single` — exposing the one current recipient's delivery failure, which is exactly the re-identification the suppression exists to prevent. B-2 could therefore LOWER the count, not only raise it. **Suppression needs a CURRENT eligible cohort, which only B-2 can supply, so the band is `unavailable_no_source` until B-2 lands.** The dependency I was trying to argue away is real; the honest fix is to carry it, and to correct §3.3's maturity row rather than let it claim B-4 alone suffices for this sub-fact. |
| **The boolean sub-facts are NOT booleans — they are three-valued** | "Is a contact configured?" has three answers here, not two: yes, no, and *nobody has built the thing that would know*. A plain `true`/`false` cannot carry the third, and §3.0 forbids omitting the key, so each of these enumerates as `[true, false, "unavailable_no_source"]` — a mixed array, which `SpineFact` (`boolean \| number \| string \| null`) and `safeFacts`' `Object.is` comparison both accept. This is the sharpest form of the §32 point in the row below: **a health check whose "no source" and its "no, and I checked" are the same value is a false-green with extra steps.** |
| **Never projected** | raw addresses · phone numbers · provider secrets · message contents · **a person-by-person private notification history** — health is an aggregate, and an aggregate that resolves to one person is not an aggregate. **No exact figure is projected at all** — see the band row above, which replaced this row's earlier "band it where it would identify someone" with "always a band". |
| **Refusal** | Non-Owner without explicit grant is refused by authority, not by empty aggregate. |
| **Freshness** | `staleAfterDays: 1`, `projectionWindowDays: 1` — same reasoning as §3.1: health is a current-state read, and week-old health is not stale, it is wrong. |
| **`UNAVAILABLE` behaviour** | **Represented per §3.0** — each sub-fact carries its own enumerated `unavailable_*` value, which is what makes a PARTIAL health answer expressible at all rather than collapsing the read. Today every input is absent: no contact model, no delegate model, no delivery ledger. It reports `UNAVAILABLE` per sub-fact with its reason. **A health surface that reports "healthy" because it found nothing to report is the exact false-green this contract exists to prevent** (§32), so absence of evidence is rendered as absence, never as health. |
| **Audit boundary** | Read recorded as above. |
| **Maturity today** | `UNAVAILABLE`. Blocked **as a capability** on SCR-2026-09-02-B (all three parts — this read is role-gated, so it needs the refusal channel). Every Billing contract here maps to **sub-facts**, and the per-sub-fact `UNAVAILABLE` behaviour above means a partial answer is useful rather than blocked: **B-2** supplies *both* "a billing contact is configured" and "eligible delegates exist"; **B-4** supplies the unresolved-failure outcomes — but the BAND over them additionally needs **B-2**, because suppressing a small cohort requires knowing the current eligible cohort and a ledger cannot (see §3.3's band row); until B-2 lands the band is `unavailable_no_source` even with B-4 present; **B-5** supplies delivery-path availability. An earlier draft blocked the whole capability on B-4/B-5 while crediting B-2 with delegates alone — overstating two and understating one. An earlier revision then replaced that with a NEW blanket gate — "the genuine minimum is B-2" — which is the same defect a third time, introduced by the commit that swept the previous two. It is wrong on its own terms: **Owner authority already exists independently of any delegate model** (§53 resolves the Owner without B-2), so if B-5 lands first the delivery-path fact is answerable, and if B-4 lands first the failure facts are. **B-2 is scoped to its two fields** — "a billing contact is configured" and "eligible delegates exist" — exactly like the others. The only capability-wide prerequisite is SCR-2026-09-02-B; there is no Billing minimum. |

### 3.4 What none of them may become

No capability here writes. **PAIGE must not add or remove a billing delegate, change a plan, open a
payment portal, change a payment method, cancel service, send an SMS, or send a marketing message.**
Each of those is a governed write with its own source authority, its own approval path, and its own
final Gate B approval, and none is requested here.

The read capabilities are declared `classification: "read"`, which the registry already binds to
`riskPolicyKey: "read_only"` and `approvalAuthority: "none"` (`registry.ts:41-43`). A read that
claimed approval authority would fail the registry's own validation, which is the correct place for
that to be impossible.

---

## 4. Source contracts Billing must supply first

Each capability in §3 waits on **the contracts its own maturity row names**, not on all of these —
B-1 does not gate the notice-history read, and B-4 does not gate the status read. They are stated as
requirements on Billing, not as designs for Billing.

| # | Contract | Why it is required | State today |
|---|---|---|---|
| **B-1** | A **role-scoped** workspace billing status read. `get_tenant_platform_subscription()` is granted to `authenticated` with no role gate, so today any member — `coach`, `member` — can read the workspace's plan, status and renewal. That may be a deliberate product decision; it is **wider than this request's Owner-only requirement**, and the seam cannot narrow what the source hands out to every member. Billing decides: gate the existing function, or supply a gated variant. | capability 1 | **exists but ungated by role** |
| **B-2** | A **billing authority model** — who is the workspace's billing contact, who are its delegates, and what a delegate may see. Without it, "Billing delegate" has no referent and the capabilities fall back to Owner only. | capabilities 1 and 3 | **does not exist** |
| **B-3** | A **stated position on revenue classification visibility.** See §9 — this is the one true shared-contract decision in this request. | capability 1 | **decision owed** |
| **B-4** | A **billing notice ledger**: tenant-scoped, per-recipient, carrying category, occurrence time, delivery state, a **bounded actionability fact**, and a **resolution rule** (below). The owner-visible topic label is **derived from the category** by the capability, so the ledger must not store a free-text label — and it must not carry message bodies, addresses, or provider payloads. | capabilities 2 and 3 | **does not exist** |
| | **Two additions to B-4, each because a capability promised something the ledger as first described could not produce.** (a) **Actionability**: category, time and delivery state cannot distinguish an informational notice from one the recipient must act on, so capability 2's next-action state had no producer. (b) **Resolution**: an append-only ledger of delivery *outcomes* satisfies every other clause and still cannot tell an old failure that was later delivered from one that is genuinely unresolved — so capability 3's "unresolved" counts had no producer either. B-4 must therefore carry a current lifecycle/resolution state per notice, **or** a correlation key plus a stated rule for when a later outcome resolves an earlier failure. Without one of those, "unresolved" is a word with no definition and the count reports `UNAVAILABLE`. | 2 and 3 | **owed** |
| **B-5** | A **delivery-path availability signal** — whether billing notices can be delivered at all — distinct from whether any individual notice succeeded. | capability 3 | **does not exist** |

**Sub-accounts are part of B-1, not a footnote to it.** `useSoloComms` skips the billing read
entirely for a sub-account, because a sub-account's billing is the parent agency's (§38/§217). So
`billing.workspace_billing_status` must state, in Billing's contract, what a sub-account Owner is
told: their own absence of a subscription, or a bounded fact about the parent's arrangement, or a
refusal. **It must never resolve to reading the parent tenant's row** — that is the §51 invariant
and the #86 leak in one move. This request does not decide it; Billing does, and states it.

---

## 5. The projection ban, stated once and applying everywhere

No capability, Rail event, Mind record, audit row, log line, error message, or refusal reason may
carry:

> a payment instrument · card or bank details · a Stripe customer, subscription, invoice or payment
> identifier · a raw invoice · a provider payload of any kind · a raw email address or phone number
> · a message body or subject · a provider secret or credential · another workspace's data · another
> recipient's data · internal billing metadata not explicitly listed as projectable.

This list is a ban on **classes of value**, not on field names, because the next field name is
always outside a name list. When a new field appears in a source, the question is which class it
falls in — not whether it was enumerated here.

**One carve-out, and it is narrow.** "another recipient's data" bans *that recipient's* data — an
address, an identity, a notice, a per-person outcome. It does **not** ban a **non-identifying
bounded aggregate computed over other recipients' outcomes**, which is exactly what capability 3's
unresolved-failure counts are. Without this sentence the ban and §3.3 contradict each other, and an
implementer reading a value-class ban cannot infer that aggregation is exempt — so it is said rather
than assumed. The carve-out carries §3.3's own limit with it: **an aggregate that resolves to one
person is not an aggregate**, and where a count would identify an individual it is reported as a
bounded band, not an exact figure. Nothing else is exempt: an aggregate may not carry a name, an
address, a body, or a per-recipient breakdown, and no other capability in §3 has an aggregate to
compute.

---

## 6. Rail event vocabulary — for the Rail owner to implement

**The Rail cannot carry any of these today**, and the reason is structural rather than a matter of
registering kinds: `record_rail_event` requires a `p_contact_id` that is a client of the tenant and
raises `contact not in tenant` otherwise. Every event below is workspace-level and has no contact.
**Anchoring a billing event to an arbitrary client to satisfy that constraint would be a fabricated
subject, and is refused here explicitly** so that nobody implements it as a workaround. This
vocabulary is therefore blocked on SCR-1 (workspace-level outcome projection), which is the Rail
owner's to raise.

| Event | Records |
|---|---|
| `billing.contact_configured` | a billing contact or delegate was designated |
| `billing.contact_changed` | a designation changed |
| `billing.contact_removed` | a designation was removed |
| `billing.status_changed` | billing status or access state changed |
| `billing.trial_status_changed` | trial or promotional status changed |
| `billing.notice_issued` | a billing notice was issued |
| `billing.notice_delivered` | a notice was confirmed delivered |
| `billing.notice_failed` | delivery failed |
| `billing.notice_suppressed` | delivery was suppressed |
| `billing.notice_requires_action` | a notice needs the workspace to act |

Every event must be:

- **tenant-derived** — the tenant comes from the server's resolution, never a caller's field;
- **bounded** — enumerated kind, enumerated facts, no free text;
- **idempotent** — a retry records once; a redelivery is not a second issuance;
- **content-free** — no raw email or phone value, no message body, no payment instrument, no
  provider payload, no sensitive billing metadata.

**The Rail is provenance and health evidence. It is not the billing source of truth**, and a
disagreement between the Rail and Billing is resolved in Billing's favour, always.

One caution for whoever implements this, from the shipped rail's own record: `connections-rail-contract.md` §2a
documents four existing emitters that put raw message text into `paige_client_events.summary`, which
is persisted and broadcast to staff browsers. **Billing events must not become the fifth.**

---

## 7. Safe evidence Mind may consume — and not before

Mind may **later** surface only grounded patterns. An earlier draft required every one to be
traceable to a **Rail event**, and then listed three patterns of which only one has an event that
could produce it — the same failure as the refusal channel in §1a, one section along.

**A pattern is grounded in an EVENT or in a governed READ, and the distinction is which.** Both are
proven records; neither is inference. What is forbidden is a pattern with no producer at all.

| Pattern | Grounded in | Producer |
|---|---|---|
| *"A billing notice could not be delivered."* | a Rail **event** | `billing.notice_failed` (§6) |
| *"A billing contact is missing."* | a governed **read** | capability 3's `contact_configured` sub-fact. **No event proves it**: `contact_configured`/`_changed`/`_removed` all require someone to have acted, and a workspace that never configured one emits nothing. Absence is a state, and the state is what capability 3 reads |
| *"Trial access ends soon."* | a governed **read** | capability 1's **declared trial-end band** (§3.1), whose window is a governed constant. Not a Mind comparison against `trial_ends_at`: a timestamp does not itself prove "soon", and an unstated threshold is two implementations disagreeing about the same date. `billing.trial_status_changed` cannot supply it either — it fires on a **change of status**, not on time crossing a threshold, so no event will ever announce "soon" |

**Why "required" came out of the first pattern.** It said *"a **required** billing notice could not
be delivered"*, and `billing.notice_failed` records one thing — that delivery failed. Requiredness is
a **separate** event in §6, `billing.notice_requires_action`. A failed optional notice and a failed
required one produce the identical record, so the word was a fact the producer never established:
the same defect as the two patterns above it, in a single adjective rather than a missing event.
**A "required notice failed" pattern is possible but not yet specified**, and what it would take is
stated here rather than left to be improvised: either a bounded requiredness fact carried on
`billing.notice_failed` itself, or a **bounded notice reference shared across the notice events** so
a failure and a requires-action record can be correlated as the same notice. §6 declares neither
today. That is the Rail owner's design call (#820), not this request's — the pattern stays narrowed
until one of them exists.

Mind may **not**: infer financial intent; expose message content; report payment credentials; or
claim delivery or health without proven runtime evidence. A pattern with no record behind it is a
conclusion, not evidence — and the Brain's rule is that what it concludes is a conclusion
(`connections-rail-contract.md` §4).

**Sequencing binds MIND ONLY, and now binds it per pattern.** The delivery-failure pattern waits on
the Rail contract in §6 existing *and* carrying real evidence — a Mind projection built against an
empty Rail would report health it has never observed, which is §32's false-green wearing a different
hat. The two read-grounded patterns wait on their capabilities instead, and on nothing in §6.

**It does not gate the reads.** An earlier draft's wording made the Chat capabilities wait on the
Rail and Mind work; that was wrong and would have made an unrelated workstream a hidden blocker. The
three read capabilities depend on SCR-2026-09-02-B and on **the Billing contracts their own maturity
rows name** (§3, not all of §4 — the notice-history read does not wait on B-1, the status read does
not wait on B-4), and on nothing in §6 or §7. If Billing and the Spine subject/routing work land first, the reads may proceed with the
Rail vocabulary still unbuilt.

`PIPELINE_MIND_CAPABILITY` is explicit that its shape is one domain's bounded view and that
generalising it for a second domain *"changes Mind-wide retrieval semantics… that needs a Spine
Change Request, not an import"* (`mindEvidence.ts:9-16`). **This request does not generalise it.** A
billing Mind projection is a separate later request, raised when there is evidence to project.

---

## 8. UI ownership — handed off, not absorbed

| Surface | Owns | Does not own |
|---|---|---|
| **Billing screen** | billing contacts and delegates; platform-billing notices; all management of both | notification delivery mechanics; client consent |
| **Systems Check** | *reporting* billing and notification readiness as a check finding | **managing** any of those settings. It reports; it does not configure |
| **Client Portal** *(later)* | each client's own consent and delivery preferences | the business's platform-billing contacts — a client's preference and a workspace's billing contact are different objects with different owners, and conflating them is a §9 seam break |
| **Solo Shell** | the eventual navigation or redirect cleanup of Solo Settings → Notifications, which today is an empty destination (`settings.tsx:1451`) | this contract. The cleanup is the Shell owner's, sequenced separately |

**PAIGE is not a substitute for any of these.** She answers the three questions in §3 by reading the
same source those surfaces manage. If a question can only be answered by managing something, it is
not one of these capabilities.

---

## 9. The one open decision — for the owner and Billing, not for this request

**Can a workspace Owner see their own revenue classification, and in what words?**

Capability 1's requested projection includes a *"promotional/trial/paid classification."* Two of the
three have a tenant-readable source: `tenants.status` carries `trial`, and a live
`platform_subscriptions` row establishes paid. The third does not.

`tenant_revenue_classification` is where `promotional` actually lives, and it is **operator-internal
by construction**: `is_platform_owner` RLS, and its own table comment states *"tenants never read
it."* It also carries `comp_reason` — the migration's own examples are *"founder friend"*, *"beta
cohort"*, *"vertical seed"* — and a free-text `notes` column.

So there are three possible answers and this request does not choose between them:

1. **The Owner sees a derived access state only** — trialing, active, past due — and no comp
   reasoning ever crosses the operator seam. Nothing new is needed.
2. **The Owner sees that their workspace is promotional**, as a bare enumerated fact, with
   `comp_reason` and `notes` never projected. This requires Billing to expose a narrow derived
   field; it does **not** mean widening the table's RLS.
3. **The classification stays entirely operator-internal**, and capability 1 reports that field
   `UNAVAILABLE` to the Owner permanently.

**This is a §9 operator/tenant seam decision with a §57 source-of-truth dimension, and the seam is
exactly the kind that rots when an engineer picks the convenient answer.** Option 2 is the one that
best matches the assignment's wording; option 1 is the one that requires no seam change at all. The
decision is the owner's with Billing, and until it is made, capability 1 declares that field
`UNAVAILABLE` with this reason rather than guessing.

---

## 10. Evidence classes for this request

Labelled separately, because a request that blurred them would be arguing for its own conclusion.

| Class | What was produced |
|---|---|
| **Source evidence** | Every claim in §2a and §2b, each citing the file and line where it was read on `c23c2150`. |
| **Static evidence** | None claimed. No code was added, so no lint or typecheck result is relevant to it. |
| **Test evidence** | None claimed. There is nothing to test — this document adds no behaviour. |
| **Rendered evidence** | None. No UI was changed. |
| **Authenticated-runtime evidence** | **None, and none is possible yet.** No capability exists to drive. |
| **Production evidence** | None. Nothing is deployed by this request. |
| **`UNVERIFIED`** | The behaviour of `get_tenant_platform_subscription()` for a **sub-account** caller is read from source and from `useSoloComms`'s comment, not exercised against a live sub-account. It is stated as a question for Billing in §4 rather than as a finding. |

**No capability here may be called `LIVE` until a real authenticated Owner has exercised both the
direct Billing UI and the PAIGE read against a safe real workspace.** Source reading, a passing
lint, and a registry entry are all evidence about code; none is evidence that a person got an
answer (§70).

---

## 11. What happens next, and what must not

**Blocked until the named owner supplies the named contract:**

- no PAIGE tool
- no Spine capability registration
- no migration
- no Chat handler change
- no Rail change
- no Mind change
- no UI change

**The routed handoffs**, each to the workstream that owns it, none absorbed into this request:

| Handoff | Owner | Issue | Carries |
|---|---|---|---|
| B-1 … B-5 source contracts | Billing | **#819** | §4 |
| SCR-1 (workspace-level outcome projection) | Rail / Spine foundation | **#820** | §1a, §6 |
| The billing Rail vocabulary | Rail | **#820** | §6, gated on SCR-1 |
| The billing Mind projection | Mind | **#821** | §7, gated **per pattern**: the delivery-failure pattern on the Rail carrying real evidence, the missing-contact and trial patterns on their capabilities alone |
| A platform-billing and notification-readiness check | Systems Check | **#822** | §8 |
| Solo Settings → Notifications cleanup | Solo Shell | **#822** | §8 |
| Client consent and delivery preferences | Client Portal | **#823** | §8 |
| The revenue-classification visibility decision | Owner, with Billing | **#819** (B-3) | §9 |

Each is filed against the workstream that owns it, with the exact contract it owes and the reason
it is blocked. None of them is work this request does on their behalf.

**And the two this request raises for the Spine itself:** SCR-2026-09-02-B (a workspace subject
type, the non-client Chat loading path that makes it reachable, and a refusal channel so a denial is
not reported as an outage). **SCR-2026-09-02-C is withdrawn
as originally scoped** — it asked for a record/list evidence shape the contract already has, on a
reading of C3 that this document got wrong and has corrected in §1. B is a shared-primitive change,
needs acceptance before any billing capability can be specified further, and is not designed here.
