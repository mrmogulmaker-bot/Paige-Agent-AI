# The canonical readiness contract

One meaning for "is this business fact on file", shared by every Spine reader that reports it.

This exists because two readers disagreed about the same two real workspaces, and **neither of them
was right**. The reconciliation is not a choice between their answers; it is the observation that
both were compressing two independent facts into one field.

---

## 1. The contradiction, and why picking a winner would have been wrong

Executed on production as First Sterling Capital's real owner (`7eaf8859`), 2026-09-05 — the same
result as when it was first recorded on 2026-09-03:

| Reader | Fact | Answer | Carries source? | Carries freshness? | Names tenant? |
|---|---|---|---|---|---|
| `get_business_context_readiness` | `website` | `needs_confirmation` | yes (null) | yes (null) | yes |
| `get_business_context_readiness` | `business_phone` | `needs_confirmation` | yes (null) | yes (null) | yes |
| `tenant_comms_readiness` | `has_website` | `true` | **no** | **no** | **no** |
| `tenant_comms_readiness` | `has_phone` | `true` | **no** | **no** | **no** |

Both workspaces hold the value **only** in the legacy `tenants.brand` record, with nothing in Setup
(`tenant_legal_profile`) and therefore no confirmation event.

Two independent facts are in play:

- **A — does a value exist at all?** For these workspaces: **yes**.
- **B — did the owner confirm it in Setup?** For these workspaces: **no**.

`tenant_comms_readiness` answered **A** and dropped **B**. `get_business_context_readiness` answered
**B** and dropped **A**. Each was locally defensible and each was lossy, so "pick the better answer"
would have preserved one true fact by continuing to erase the other. **The canonical state has to
carry both**, and once it does the two readers stop disagreeing without either of them being
overruled.

This also rules out the other two shortcuts by construction: the rule is general, so nothing is
special-cased to these two workspaces, and the distinction lives in the server contract, so nothing
is smoothed over in a UI.

## 2. The canonical fact

Every readiness fact is a row of:

```
fact_key · state · source · as_of · reason · next_action · tenant_id
```

| Question the release must answer | Field |
|---|---|
| What exact source proves it? | `source` |
| Which workspace does it belong to? | `tenant_id` |
| When was it last verified or refreshed? | `as_of` |
| Is it confirmed / needs attention / unavailable / unknown / stale / failed? | `state` |
| What must the owner or Paige do next? | `next_action` |
| Why is it not simply present? | `reason` |

### States

| `state` | Means | `source` | `as_of` |
|---|---|---|---|
| `owner_confirmed` | The owner entered and confirmed it in Setup | `setup` | the confirmation time |
| `connection_sourced` | Present, derived from a connected provider, never owner-confirmed | `connections` | provider provenance time |
| `legacy_sourced` | Present **only** in the legacy `tenants.brand` record, never confirmed | `legacy_brand` | `null` — no confirmation event exists to date |
| `needs_confirmation` | No value in any known source | `null` | `null` |
| `invalid_format` | A value exists but cannot be used as-is | its real source | its real time |
| `unavailable` | The read was refused, or a source could not be read | `null` | `null`, with `reason` |
| `unknown` | Scope could not be resolved, so nothing is asserted | `null` | `null`, with `reason` |
| `stale` | Present, but past the freshness rule its source declares | its real source | its real time |

`legacy_sourced` is the state the contradiction was missing. It is not a new idea: this contract
already distinguished `connection_sourced` from `owner_confirmed` for `primary_business_email` —
"present, not confirmed, and here is where it came from." Legacy brand is the same shape, so this
**extends an existing vocabulary rather than inventing one** (§18).

### `stale` is defined and deliberately never emitted yet

No source in this domain declares a freshness TTL today — measured, not assumed. So `stale` is
part of the vocabulary and reserved for the moment a source declares one. **Choosing a threshold
here would be manufacturing a readiness fact**, which this contract forbids, so `as_of` is reported
and staleness is left unasserted. When a source declares a TTL, it is emitted from that declaration
and from nowhere else.

## 3. What must never be inferred

- **Missing row ⇒ healthy.** Absent evidence is `needs_confirmation` or `unknown`, never `confirmed`.
- **Refused or failed read ⇒ empty.** A refusal returns the full row set as `unavailable` with a
  `reason`; it never returns zero rows, because zero rows are indistinguishable from "nothing to do".
- **A value exists ⇒ the owner confirmed it.** This is exactly the defect above. Existence is `A`;
  confirmation is `B`.
- **The owner confirmed it ⇒ it is still correct.** Confirmation is timestamped, not perpetual.
- **A missing phone number ⇒ the business has none.** It may be unreadable, refused, or unentered,
  and those are different states.
- **One reader's silence ⇒ another reader's answer is wrong.** Readers may expose different facets;
  they may not derive different answers from the same source.

## 4. One resolver, two readers, unchanged gates

The two readers do **not** have the same caller authorization, and that difference is load-bearing:

| Reader | Caller gate |
|---|---|
| `get_business_context_readiness` | `is_tenant_admin(tenant) OR is_platform_owner()` — tenant-scoped |
| `tenant_comms_readiness` | `is_platform_operator() OR has_any_role(uid,['admin','coach'])` — global |

So the reconciliation is **not** "make one reader call the other" — that would impose one reader's
gate on the other's callers and could silently refuse a persona that is served today (§58). Measured
on production: all 9 users who resolve a workspace pass both gates, so the difference is latent, but
a latent difference is not a licence to collapse the two.

Instead both readers derive the identity facts from **one internal resolver**, and each keeps its own
gate, its own tenant resolution, and its own response shape:

```
                     ┌─ get_business_context_readiness (tenant-scoped gate) ─┐
business_identity_   │                                                       ├─ same facts
readiness(tenant) ───┤                                                       │
  (internal only)    └─ tenant_comms_readiness        (global gate)  ────────┘
```

The resolver takes a tenant parameter and is therefore **not reachable by any caller**: `EXECUTE` is
revoked from `anon` and `authenticated`, so only the already-gated `SECURITY DEFINER` parents (owned
by `postgres`) can invoke it. A caller cannot supply a tenant, a role, a source, a state or a
timestamp that bypasses server-resolved scope, because a caller cannot reach the resolver at all and
neither parent accepts any of those from the request.

## 5. What each reader returns after the change

Neither reader's existing shape breaks.

**`get_business_context_readiness`** — unchanged row shape. `website` and `business_phone` gain
`legacy_sourced`/`legacy_brand` where the value exists only in the legacy record, instead of
reporting `needs_confirmation` while a value demonstrably exists.

**`tenant_comms_readiness`** — the `business` block keeps `has_name` / `has_website` / `has_phone`
with their existing meaning (**fact A**: a value exists in some source), so no consumer breaks, and
gains a sibling `business_provenance` block carrying `state` / `source` / `as_of` per fact (**fact
B**). A consumer can now tell "confirmed in Setup" from "inherited from the legacy record" from
"we could not read this" — a distinction the boolean alone could never express, including the case
where a failed read previously became an indistinguishable `false`.

After this, both readers report the same canonical state for the same workspace, from the same
resolver, and the contradiction cannot recur by construction rather than by agreement.

## 6. The second correction, found while reconciling the first

`primary_business_email` reported `connection_sourced` / `connections` whenever `tenants.brand`
carried a `support_email` and no provenance had been recorded — the `coalesce(..., 'connection_sourced')`
default. Measured on production: **all three** workspaces holding a `support_email` are in exactly
that position (two have no `tenant_setup_business_context_meta` row at all; the third has a row whose
`primary_email_provenance` carries no `source` key). So the reader has been naming a connected
account as the proof for a value no connection ever wrote.

That is the same untruth as the one above, wearing the opposite face: the first invented *absence*
from a value that existed, this one invents a *source* from a provenance that does not. It is
corrected in the same change, to the state that is actually true — `legacy_sourced` / `legacy_brand`.
A **recorded** `owner_confirmed` and a **recorded** `connection_sourced` are both preserved exactly;
only the invented default moves.

## 7. What actually changed, measured across all 14 production tenants

Ten rows move, and no verdict does.

| Fact | Tenants | Before | After |
|---|---|---|---|
| `website` | 2 | `needs_confirmation` | `legacy_sourced` / `legacy_brand` |
| `business_phone` | 1 | `needs_confirmation` | `legacy_sourced` / `legacy_brand` |
| `industry` | 4 | `needs_confirmation` | `legacy_sourced` / `legacy_brand` |
| `primary_business_email` | 3 | `connection_sourced` / `connections` | `legacy_sourced` / `legacy_brand` |

`industry` is the proof the rule is general rather than fitted to the two contradicting workspaces:
it has no second reader to disagree with, and it was wrong in exactly the same way for twice as many
workspaces. Nobody had noticed, because nothing contradicted it.

**No Systems Check verdict moves.** Every runner grades through `isConfirmed()`
(`_business-context-readiness.ts`), which is true only for `owner_confirmed`, so `legacy_sourced`
grades exactly as `needs_confirmation` did. **No comms boolean moves either** — asserted per tenant,
not reasoned about.

One rule difference is deliberate: `tenant_comms_readiness` compared with `nullif(x,'')` while
`get_business_context_readiness` used `nullif(btrim(x),'')`, so a whitespace-only value would have
read as present in one and absent in the other — the same contradiction in miniature. The resolver
btrims. Production holds zero whitespace-only values in any of these columns, so no tenant's answer
moves today.

## 8. A third answer exists, and is deliberately left alone

`get_tenant_a2p_registration_status().profile` echoes `tenant_legal_profile` with **no brand
fallback**, so for these two workspaces it reports a null `website_url` — a third answer to the same
question. It is not changed here, and that is a decision rather than an oversight:

- it is an **echo of raw values for A2P registration**, not a readiness contract — it returns the
  website itself, not a state, so it has no place to put provenance;
- it has **zero callers in this repository** (it is granted to `authenticated` and reachable via
  PostgREST, so it is latent rather than dead);
- **A2P is explicitly outside this release's scope.**

Recorded here so the next session finds it named rather than re-discovering it.

## 9. Workspace switching

The release requires that switching workspace clears prior readiness, loading, errors and pending
results before the next workspace paints. Two consumers read these facts:

- **`src/solo/settings.tsx` (`useCommsReadiness`) — already correct.** It clears to a null-tenant
  loading state before every load, gates late responses through a request token, and discards a
  payload whose `tenant_id` is not the active account.
- **`src/pages/admin/ClientsConversations.tsx` — was not.** On an account switch the effect went
  straight to its async arm without clearing, and never checked the payload's tenant, so the
  previous workspace's readiness fed the channel disclosure until the new RPC returned. Corrected
  in this change to clear first, unconditionally, and to discard a payload naming another
  workspace. Six lines; it cannot alter any rendered state within a single workspace.

## 10. How this was proven

**Pre-merge, in a `BEGIN … ROLLBACK` transaction on production** (2026-09-05), twelve assertions,
all passing — including the failing-first one: the old contradiction was **reproduced** in the same
transaction (3 rows) before the change and measured at **0** after it. Also asserted there: four
rows per tenant always; `isConfirmed()` unchanged for every tenant × field; every status change is
one of the two declared corrections; the comms booleans byte-identical for every tenant; the
no-workspace paths return full row sets rather than empty ones; the resolver not executable by
`anon`, `authenticated` or `service_role` while both readers keep their existing grants; a
caller-supplied foreign tenant ignored in favour of the server-resolved one; and both readers
agreeing, live, for the workspace that started this.

**In CI**, `supabase/tests/business_context_readiness.sql` (pgTAP, `plan(45)`) reproduces the
contradiction synthetically as a third fixture tenant whose values live only in the legacy record,
and states the disagreement directly as an invariant over **both** readers. Before this change that
assertion returns 2 and fails.

**Still owed:** authenticated runtime proof on the deployed surfaces (§32.c) — this session holds no
browser-driving tool, so the live look at Settings → Connections and at PAIGE's business-context
block is owed to the next capable session, and is not claimed here.
