# Source-to-Spine packet 1 — Billing

**Status: BLOCKED ON AN OWNER DECISION. No code written, no capability registered.**
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
