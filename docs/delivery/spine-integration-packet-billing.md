# Source-to-Spine packet 1 — Billing

**Status: SUPERSEDED IN PART, 2026-09-03 — see [the correction at the end](#correction-2026-09-03--this-packets-availability-table-was-wrong).**
Two of this packet's findings did not survive contact with evidence I should have gathered before
writing it. The structural blocker below is confirmed and still stands; the availability table is
wrong and the owner decision it asked for is largely moot. **Read the correction first.**

~~**Status: BLOCKED ON AN OWNER DECISION. No code written, no capability registered.**~~
Produced 2026-09-03, before any implementation, per the integration discipline: a packet first, and
never an invented source model. Grounded on production, not on the source doc's own snapshot.

## Source owner and canonical record

**Platform Billing.** Canonical records: `platform_billing_accounts`, `platform_billing_contacts`,
`platform_billing_notification_log`, `platform_subscriptions`. Spine owns no copy of any of them and
will not create one.

The contract Billing already published is
[`docs/handoff/platform-billing-spine-source-contract.md`](../handoff/platform-billing-spine-source-contract.md)
— **SHIPPED** (PR #816, `f455d8a5`, migration `20261045000000`), and it states plainly that a Spine
reader may rely on its §2 fields. That doc is the authority for everything below; where this packet
and that doc disagree, that doc wins and this packet is wrong.

## The one permitted read, verified on production

`public.get_workspace_billing_authority()` — **no arguments**, `SECURITY DEFINER`, `anon` denied,
`authenticated` and `service_role` granted. Everything is derived from `auth.uid()`.

## What the owner asked Spine to read, against what Billing actually exposes

| Requested | Available? | Evidence |
|---|---|---|
| Payment-setup readiness | **yes** | `paid_activation_ready` |
| Safe billing-contact status | **yes** | `billing_contact_state`, `receives_billing_notices` |
| Any owner action needed | **yes**, derivable | the refusal states `billing_account_state ∈ {absent, ambiguous}` and `billing_contact_state ∈ {none, designated_needs_attention}` |
| **Plan / promotional state** | **NO** | the contract exposes no plan field. `scope` names which billing *contract* applies, not the plan. `platform_subscriptions` holds **4 rows** on prod, so the data exists — it is simply not in the safe read |
| **Amount due today** | **NO, and forbidden** | §2: a reader "does not derive … any money figure". §3: the Owner-authorised ledger summary has **no reader in A** |
| **Measured usage** | **NO** | no contract exists, and `platform_metered_events` holds **0 rows** — the meter is empty, consistent with the standing "Paige's spend is traced but never billable" gap |

**Three of six are unavailable, and one of those is explicitly forbidden to a reader.** Under the
operating principle, the honest labels today are: readiness and contact status → could be `LIVE`;
plan, amount due, usage → `NOT CONNECTED`, with `amount due` additionally `UNAVAILABLE BY DESIGN`.

## The structural blocker, measured

`get_workspace_billing_authority()` takes **no tenant argument**. Called with no JWT identity — which
is exactly the Systems Check runner's situation (service role) — production returns:

```
tenant_id: null · scope: none · billing_account_state: not_applicable
billing_contact_state: not_applicable · paid_activation_ready: false
```

It fails closed correctly. But it means **Systems Check cannot consume Billing at all today.** Only a
JWT-scoped caller (PAIGE Chat) can reach it. `business_context.readiness` solved the same problem
with a service-role path honoured only because `auth.uid()` is null there; Billing's read has no such
path, and adding one is **Billing's decision to make, not Spine's to work around** — the source
contract says a gap is reported back, not resolved locally.

## Live caveats that change what PAIGE may say

Measured on prod today, and they differ from the source doc's snapshot in one place:

- `platform_billing_accounts`: **0 rows.** So `billing_account_state` is `absent` for every
  workspace — and the contract is emphatic that `absent` is a **refusal state, never "no
  subscription"**. A capability shipped today would tell every workspace "I can't determine your
  billing mapping". Honest, but close to inert.
- `platform_billing_contacts`: **2 rows** — the source doc says 0; it has moved since. Contact status
  is therefore real data, not a hypothetical.
- `platform_billing_notification_log`: **0 rows**, and Foundation A ships no sender.
  `receives_billing_notices = true` means *designated*, never *delivered to*, and a notice-history
  reader must render **unavailable with its reason** rather than an empty list.

## Authorized readers, freshness, consumers

- **Readers:** PAIGE Chat only, on the caller's own JWT. Systems Check is excluded until Billing
  offers a tenant-addressable path.
- **Freshness:** live read per call; no snapshot, no cache, no stored copy.
- **Rail:** **no** durable event. Foundation A writes nothing to the ledger, so there is no
  source-backed billing event to record. Recording anything now would be inventing history.
- **Mind:** consumes the same safe read; it interprets, it does not become a second source.

## Collisions

None. This packet writes no schema, registers no capability, and touches no file Billing owns. It
does not collide with `business_context.readiness` (different source, different fields).

## The decision I need

Shipping the three available fields is buildable now and bounded. But it would tell every workspace
"billing mapping absent" until `platform_billing_accounts` has rows, and it would reach PAIGE Chat
only. So:

1. **Ship the narrow slice now** — readiness + contact status into PAIGE Chat, explicitly labelling
   plan, amount due and usage as `NOT CONNECTED`. Accepts that the mapping state reads `absent`
   everywhere until Billing populates accounts.
2. **Ask Billing first** for (a) a tenant-addressable path so Systems Check can consume it, and
   (b) a safe plan/promotional field. Then integrate once, against a contract that answers the
   owner's actual question.
3. **Both** — ship (1) now and open (2) with Billing in parallel.

My recommendation is **3**. The three available fields are genuinely useful for the workspaces that
have a designated contact, and the two gaps are real requests that belong to Billing regardless of
what Spine ships this week.


---

## Correction, 2026-09-03 — this packet's availability table was wrong

Written the same day as the packet, before any code was built on it, after grounding **open pull
requests** rather than only `main` and production. The integration brief asks for exactly that
("ground current main and active branch/PR collisions before each implementation slice") and I did
the first half only. Two separate errors follow; the first is mine and the more serious.

### Error 1 — I enumerated one Billing read when production carries two

This packet's table was built against `public.get_workspace_billing_authority()`, because the
shipped handoff doc calls it "the one permitted read". I never enumerated Billing's actual function
surface on production to check whether that framing was still current. It was not.

`public.get_workspace_billing_status()` **was already live on production the entire time**, granted
to `authenticated` **and** `service_role`, and its return shape carries every field this packet
reported as absent:

```
tenant_id, workspace_name, scope, can_view, can_manage, access_state, revenue_class,
plan_slug, plan_name, amount_due_cents, payment_method_required, billed_by, provider_state,
payment_method_connected, payment_method_brand/last4/exp_month/exp_year,
seats_included/used, contacts_included/used, sms_included/used,
ai_tokens_included, ai_credit_token_ratio, paid_addons_count,
primary_contact_count, delegate_count, primary_selection_needed,
notice_delivery_state, trial_ends_at
```

So the corrected table is:

| Requested | This packet said | Actually |
|---|---|---|
| Payment-setup readiness | yes | yes |
| Safe billing-contact status | yes | yes |
| Owner action needed | yes, derivable | yes, and now directly exposed |
| Plan / promotional state | **NO** | **`plan_slug`, `plan_name`, `access_state`** — live on prod |
| Amount due today | **NO, and forbidden** | **`amount_due_cents`** — live on prod |
| Measured usage | **NO** | **seats / contacts / SMS / AI token fields** — live on prod |

**Zero of the six were unavailable** — though that statement over-corrects, and peer-gate finding 7 in [packet 2](./spine-integration-packet-team.md) narrows it: all six are *exposed*, none is *forbidden*, and the money-shaped ones are refused or zero for every workspace on production today. The "amount due is forbidden to a reader" claim was the worst
of it: I read a §2 sentence about what a reader *derives* and reported it as a prohibition on a
field that already existed. A doc's own summary of its surface is not the surface; §BRAIN.2 says to
answer from the source, and one named function is not an enumeration of the source.

### Error 2 — Billing was already shipping the Spine read, in flight

Open PR **#870** (`claude/platform-billing-clarification-l6zqr5`, migration `20261140000000`) adds
`public.get_billing_spine_evidence()` — the Spine-safe billing read, in the same fixed-field
evidence contract as `get_pipeline_spine_evidence()`, built on `get_workspace_billing_status()`
rather than re-deriving anything. Its `facts` carry `plan_slug`, `plan_name`, `access_state`,
`billed_by`, `amount_due_cents`, `payment_setup_state`, `primary_billing_contact_name`
(owner-callers only), seats/contacts/AI usage, and `owner_action_needed` with a reason. Card brand,
last4, expiry, Stripe ids, full invoices and internal cost calculations are all deliberately omitted
— narrower than what the Billing screen itself sees.

~~Verified not yet on production.~~ **WRONG WHEN COMMITTED** — #870 merged as `cdea70ae` about a minute before this text was pushed, and `20261140000000` plus `get_billing_spine_evidence()` are both live on production now. See peer-gate finding 1 in [packet 2](./spine-integration-packet-team.md).

**So the decision this packet put to the owner is moot.** It offered three options; option 2 was "ask
Billing first for a safe plan/promotional field." Billing had already answered, in an open PR, before
the question was asked. No owner decision is required to proceed.

### What survives, and it is the finding that mattered

**The structural blocker is confirmed, and #870 strengthens it.** Measured on production with the JWT
claims cleared, `get_workspace_billing_status()` returns:

```
tenant_id: null · scope: none · can_view: false · access_state: unknown
plan_slug: null · amount_due_cents: null
```

The `service_role` grant is real but useless without an identity: there is no tenant argument, so a
caller with no JWT resolves no workspace. And #870's new read closes the door explicitly —
`revoke all on function public.get_billing_spine_evidence() from public, anon, service_role`.

> **Systems Check still cannot consume Billing.** Only a JWT-scoped caller — PAIGE Chat — can reach
> any of the three reads. That was this packet's real finding and it is unchanged.

### What this changes about how the next packet is grounded

Both errors have the same shape: I treated a curated description as the source. The fix is
mechanical, and it paid immediately: applying step 1 to
[packet 2 — Team](./spine-integration-packet-team.md) falsified **that packet's own draft claim**
before it shipped — a `pg_proc` sweep turned up a service-role-reachable Team read I had asserted
did not exist. The rules:

1. Enumerate the source owner's **actual** function surface from `pg_proc` on production, with
   grants, before reading any handoff doc's summary of it.
2. Enumerate **open pull requests** touching that domain, not just `main`, before declaring anything
   unavailable.
3. "Unavailable" is a claim that needs evidence exactly as much as "available" does. `grep`-ing one
   doc and finding nothing is not evidence of absence — the same standard the pack-first gate
   applies to design.
