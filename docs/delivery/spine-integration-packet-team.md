# Source-to-Spine packet 2 — Team and notification authority

**Status: NOT BLOCKED. One buildable slice, three things that stay unavailable, one correction to a
doctrine record, and **three** corrections to this packet's own first draft.** No code written yet. Produced 2026-09-03, before any implementation, per the
integration discipline: a packet first, never an invented source model. Every claim below is
grounded on production (`xygzykjyynhzqytbqnzu`) or on an executed check, not on a doc's snapshot.

This packet differs from [packet 1 — Billing](./spine-integration-packet-billing.md) in one
important way: **Billing was blocked on an owner decision; Team is not.** The safe fields exist,
PAIGE already reads a Team block every turn, and the remaining work is bounded.

## Source owner and canonical record

**Team (Solo)** — surface card `docs/doctrine/surface-cards/team.md`, live on production via #728
(`76bb3bbca`). Canonical records:

| Concept | Canonical record |
|---|---|
| Workspace membership and its role | `tenant_members` (`role`, `status`, `job_title`, `responsibilities`) |
| Legal ownership | `tenant_members.is_owner`, read **only** through `public.is_tenant_owner(user, tenant)` |
| Team invitations | `tenant_invite_tokens` where `kind = 'team'` |
| Billing-notice designation | `platform_billing_contacts` — **owned by Platform Billing, not Team** |

Spine owns no copy of any of them and will not create one.

## The reads, enumerated on production

**Enumerated, not looked up by name.** Packet 1 was wrong because it took one handoff doc's "the one
permitted read" at its word and never listed the source owner's actual function surface. So this
began with a `pg_proc` sweep of every `public` function matching team / member / invite / co_owner /
tenant_owner — 51 functions — with `prosecdef` and per-role `EXECUTE` for each. That sweep changed
this packet's conclusion once; see the blocker section.

The three that matter:

| Read | `anon` | `authenticated` | `service_role` | Caller gate, in body |
|---|---|---|---|---|
| `public.get_paige_team_context()` | denied | granted | **denied** | `NULL` unless the caller is an **active member** of the resolved tenant; invitations additionally require owner/admin |
| `public.list_team_members(p_tenant_id uuid)` | denied | granted | **granted** | with a JWT: server-resolved tenant + a global-role check. **With no `auth.uid()`: honours `p_tenant_id` with no further gate** — the trusted service-role pattern |
| `public.get_workspace_billing_authority()` | denied | granted | granted | returns the `none` scope row when no tenant resolves |

Grants read from `pg_proc` on production, not from migration text.

## What the brief asked for, against what exists

| Requested | Available? | Where it actually lives |
|---|---|---|
| Safe role facts | **yes** | `tenant_members.role` via `get_paige_team_context().speaker.permission` and `.members[].permission` |
| Safe authority facts | **yes** | `is_tenant_owner()`, surfaced as `get_workspace_billing_authority().can_manage_billing` / `.can_view_billing` |
| Billing-notice eligibility | **yes, but it is a Billing fact** | `get_workspace_billing_authority().receives_billing_notices` (the caller's own) and `.billing_contact_state` (the workspace's). It belongs to a **Billing** capability, not this one — see the split correction below |
| A roster PAIGE can name people from | **already live**, and **out of scope for a Spine safe summary** | see the PII note below |
| Whether a teammate other than the caller receives notices | **NO** | `get_workspace_billing_contacts()` is Owner-only and returns `display_name` + `user_id` — real contact data, which a Spine read may not carry |

## The "do not conflate" requirement — measured, not assumed

The brief is explicit: *do not conflate Team membership, legal ownership, billing contacts, or
notification preference with one another.* Three of the four sources already enforce that
separation, and `get_workspace_billing_authority()` does it deliberately — its own comment reads
`Ownership is the canonical is_owner predicate, never role = 'owner'`, and it returns `role`
(membership) and `can_manage_billing` (ownership) as **separate fields on purpose**. Likewise
`receives_billing_notices` is computed from a designation row, with the comment
`Receiving is a designation, never a role`.

**There is exactly one place the platform collapses two of them, and it is in the block PAIGE
already reads.** `get_paige_team_context()` computes each person's `permission` as:

```sql
CASE WHEN tm.is_owner OR tm.role = 'owner'::public.tenant_role THEN 'owner' ELSE tm.role::text END
```

That `OR` is **wider** than the canonical predicate. `is_tenant_owner()` keys on `is_owner = true`
alone and ignores `role` entirely. So a row carrying `role = 'owner'` with `is_owner = false` would
be presented to PAIGE as an owner while Billing's own predicate refused that same person — the exact
conflation the brief forbids, sitting in the read PAIGE consumes every turn.

**Honest severity: latent, not manifesting.** Measured on prod today:

| `role` | `is_owner` | rows | `is_tenant_owner()` true |
|---|---|---|---|
| `owner` | `true` | 7 | 7 |
| `admin` | `false` | 6 | 0 |

Zero divergent rows; the two columns agree for every active member. `grant_co_owner()` — the only
sanctioned path — sets both together, and `trg_tenant_members_owner_guard` blocks client DML from
touching either. Divergence is reachable only by a `service_role`/`postgres`/platform-owner write,
which the guard exempts. **So this is a note for the Team owner, not a defect I am fixing:**
`get_paige_team_context()` is Team-owned, and narrowing its `permission` computation is Team's call.
Spine's obligation is not to re-introduce the collapse in its own projection.

## The structural blocker — narrower than packet 1 claimed, and my claim here was wrong first

I drafted this packet asserting that Systems Check cannot reach Team at all, on the strength of
`get_paige_team_context()` denying `service_role`. The enumeration above falsified that before it
shipped. `public.list_team_members(p_tenant_id uuid)` is `SECURITY DEFINER`, **granted to
`service_role`**, and its body reads:

```sql
IF _caller IS NOT NULL THEN
  _tenant := public.current_user_tenant_id();
  IF NOT (public.is_tenant_member(_tenant) AND public.has_any_role(_caller, ARRAY['admin','super_admin','coach']))
  THEN RAISE EXCEPTION 'TEAM_FORBIDDEN' ...
ELSE
  _tenant := p_tenant_id;                       -- service role: honoured, no further gate
```

That is the same dual-path shape `get_business_context_readiness` uses. So the corrected finding is:

| Team fact | Reachable by Systems Check (service role)? |
|---|---|
| Active membership: `user_id`, name, `role`, `status` | **yes**, via `list_team_members(tenant)` |
| Member count | **yes**, derived from the same read |
| Pending team invitations | **no** — only inside `get_paige_team_context()`, which denies `service_role` |
| Billing-notice eligibility / contact state | **no** — `get_workspace_billing_authority()` resolves no tenant without a JWT |

So the blocker is real but **partial**: the membership half is reachable, the authority and
notification halves are not. Packet 1's blanket "Systems Check cannot consume Team or Billing"
overstated it for Team, and the correction appended to that packet keeps the Billing half, which
production still confirms.

**Two source-owner notes fall out of that same function body, and neither is mine to fix.**

1. **`list_team_members` carries the §59 global-role trap.** `has_any_role(_caller, ARRAY['admin',
   'super_admin','coach'])` reads `user_roles`, which has no `tenant_id`. It therefore fails in both
   directions, exactly as documented when the same predicate was rejected for
   `get_business_context_readiness`: it **wrongly admits** a caller who is `admin` by virtue of
   workspace X while resolving workspace Y, and it **wrongly refuses** a freshly provisioned owner,
   who holds only the base `user` role and would be told `TEAM_FORBIDDEN` about their own team. This
   is now the third sighting of that predicate (`get_pipeline_spine_evidence`, the rejected
   readiness draft, and here), which makes it a pattern rather than an oversight.
2. **The service-role path takes an unvalidated tenant id.** That is correct and deliberate for a
   trusted caller — `business_context.readiness` does the same — but it means every service-role
   caller of it must resolve the tenant safely before calling, and it must never be granted to
   `authenticated`.

Routed to the Team owner. Spine changes neither.
## PII boundary — why the existing block is not the Spine summary

`get_paige_team_context()` returns every active member's **name, verified account email, job title
and responsibilities**. That is correct for its purpose: it is Team's hydration seam so PAIGE can
address a real teammate by name, and it is already sanitised (control characters stripped, fields
length-capped, invite token never included, suppressed on tenant mismatch).

It is **not** a Spine safe summary. The Spine rules say a read returns "the smallest useful safe
summary" and must not return "protected contact data". So the Spine capability projects **counts and
authority states**, and deliberately carries no name, no email, and no user id:

| Projected fact | Allowed values |
|---|---|
| `viewer_permission` | `owner`, `admin`, `coach`, `member` — the full `tenant_role` enum, read from `tenant_members.role`, **not** the collapsed field |
| `viewer_is_legal_owner` | `true`, `false` (from `is_tenant_owner()`) |
| `member_count` | integer |
| `pending_invitation_count` | integer, **owner/admin only**; `unavailable` otherwise |

Billing-notice eligibility and billing-contact state were in this table in the first draft and have
been moved out — see the correction immediately below.

The roster block stays exactly as it is. Nothing is removed (§58).

### Correction — this projection originally spanned two source owners, and that was wrong

The first draft of the table above put `viewer_receives_billing_notices` and `billing_contact_state`
in the **same capability** as the Team facts, because the brief names item 2 "Team **and
notification** authority". Registering them together would have meant one capability whose facts
come from `tenant_members` *and* from `platform_billing_contacts` — blurring exactly the ownership
line the brief's own "do not conflate" instruction draws, in the registry entry itself.

**Split, therefore:**

| Capability | Facts | Source owner |
|---|---|---|
| `team.authority` (this slice) | `viewer_permission`, `viewer_is_legal_owner`, `member_count`, `pending_invitation_count` | Team |
| a Billing capability (**not mine to build**) | `receives_billing_notices`, `billing_contact_state` | Platform Billing — and open PR **#870** is already building it, as `get_billing_spine_evidence()` |

Billing-notice eligibility is a *Billing* fact that happens to be *about* a team member. Spine
carrying it under a Team capability would make Spine the place two domains meet, which is the
opposite of what a source-owned contract is for. PAIGE ends up with both, from two honestly-labelled
capabilities, and can state each with its real provenance.

### Correction — a migration IS required, and the first draft said it was not

The registry permits exactly **one** `evidence.adapter` per capability
(`contracts.ts` → `readonly adapter: string`). The obvious candidate,
`public.get_paige_team_context()`, returns every active member's **name and verified account
email**. Registering it as this capability's adapter would declare a Spine evidence surface that
carries contact data — precisely what the Spine rules forbid — and the Chat adapter would receive
that PII into the edge function only to throw it away. **A boundary that discards data after
receiving it is not a boundary.**

So this slice needs a narrow SQL projection of its own —
`public.get_team_authority_readiness(_tenant_id uuid default null)` — mirroring
`get_business_context_readiness` exactly: dual caller path (server-resolved tenant for a JWT caller,
`_tenant_id` honoured only where `auth.uid()` is null), an in-body role gate rather than a grant
(§59), a fixed row set on every call so a refusal is never an empty result (§13), and **no name, no
email, no user id ever selected**. The PII then never leaves Postgres.

The earlier claim that "no migration is required" was true about the *data* — every underlying fact
is already on production — and false about the *object*: projecting it safely needs one. Corrected
below and in the collisions section.

## A correction to `docs/doctrine/surface-cards/team.md`

The card states, at lines 20–23:

> **Team is NOT declared in the Spine registry.** … the reason it cannot be declared *complete* is
> the same reason this card is `PARTIAL`: the registry requires `outcome.railVisibility`, and Team
> has none.

**The first sentence is true; the reason given is wrong.** `outcome` is optional on
`SpineCapability` (`readonly outcome?:`), and `validateSpineRegistry` only checks `railVisibility`
inside an `if (capability.outcome)` guard. Executed against the real validator:

```
outcome-less capability                    → findings: []
outcome present, railVisibility missing    → findings: ["team.authority: outcomes require Rail visibility metadata"]
```

So **Team can be declared in the Spine registry today.** What it cannot claim is a Rail *outcome* —
which is a real gap and genuinely why the card is `PARTIAL` (an owner cannot see what PAIGE did to
their team), but it is not a registry blocker. The card's fix is one paragraph; I have not edited a
Team-owned doctrine record from here, and route it to the Team owner instead.

The card is also stale on a second point: the registry no longer "declares exactly one capability" —
`business_context.readiness` joined `pipeline.deal_stage_evidence` on 2026-09-03 (`7ad98cff`).

## Authorized readers, freshness, provenance

- **Readers:** PAIGE Chat, through the caller's own JWT-scoped client — the same path
  `business_context.readiness` and `get_paige_persona_context()` already use. A service-role reader
  exists for **membership only** (`list_team_members(tenant)`); none exists for the authority or
  notification facts, and Spine will not invent one.
- **Freshness:** live read per turn. There is no cached snapshot and none will be created.
- **Provenance:** each fact names its source system (`team` or `platform_billing`) so PAIGE can never
  present a billing designation as a Team role, or vice versa.
- **Refusal:** a caller who is not an active member gets `NULL` from the Team read today. The Spine
  projection must render that as an explicit `unavailable` with a reason, never as silence, and never
  as `member_count: 0` — "may not" and "none" are different answers (§13).

## Existing consumers

| Consumer | Reads | Status |
|---|---|---|
| `paige-ai-chat/index.ts` (~L4115) | `get_paige_team_context()` → `buildTenantTeamContextBlock` | LIVE; fail-closed no-op on any error |
| `SoloTeamWorkspace` | `get_solo_team_workspace(...)` | LIVE |
| Systems Check runners | `list_team_members(tenant)` is reachable but **no runner calls it today** | membership reachable; invitations and billing-notice facts are not |

A Spine `team.authority` capability adds a second, narrower block to the Chat path. It does not
replace `tenantTeamContext` and does not touch the Team surface.

## Does this need a durable Rail event?

**No, for the read.** These are current-state facts with no history worth citing; a live read is the
honest shape, exactly as for `business_context.readiness`.

**Yes, for the Team *actions* — and that is Team's gap, not Spine's.** The five `team_*` tools
already mutate membership and invitations with owner approval, and produce no Rail outcome, which is
the documented reason Team is `PARTIAL`. Spine reading authority facts neither closes that gap nor
depends on it.

## Collisions and shared-contract impact

Grounded against `main` at `2fdb8391` and every open branch:

- **`supabase/functions/_shared/paige-spine/registry.ts`** — a shared contract. Adding
  `TEAM_AUTHORITY` appends one entry; the same file was last touched by #864. No other open branch
  edits it.
- **`paige-ai-chat/index.ts`** — shared, and heavily contended historically. The insertion point is
  the block sequence next to `businessContextReadinessBlock`; it is additive.
- **One migration is required** — `public.get_team_authority_readiness`, the narrow projection
  (see the correction above). The underlying facts all exist on production already; the projection
  object does not. Version it above `20261140000000`, which open PR **#870** already claims.
- **Team-owned files are not touched.** `get_paige_team_context()`, `SoloTeamWorkspace`, the five
  `team_*` tools and the surface card all stay as they are.

## What remains unavailable or proof owed

| Item | Label | Why |
|---|---|---|
| Per-teammate notice eligibility | **UNAVAILABLE** | needs Owner-only contact data a Spine read may not carry |
| The caller's own notice eligibility | **DEFERRED TO BILLING** | a Billing fact; open PR #870 is building `get_billing_spine_evidence()`. Not folded into `team.authority` — that would blur the ownership line the brief draws |
| Team **authority / notice** facts in Systems Check | **NOT CONNECTED** | no service-role path on `get_paige_team_context()` or `get_workspace_billing_authority()`; reported to the source owners. Membership itself **is** reachable via `list_team_members(tenant)` |
| Rail visibility of Team actions | **NOT CONNECTED** | Team's own documented `PARTIAL` gap |
| The `permission` collapse in the Team block | **routed to Team** | latent, zero divergent rows on prod, Team-owned to fix |
| The global-role predicate in `list_team_members` | **routed to Team** | §59 trap, wrong in both directions; third sighting of the same predicate |
| Authenticated UI drive | **PROOF OWED** | `LIVE_DRIVE_EMAIL` / `LIVE_DRIVE_PASSWORD` unset, as with `business_context.readiness`. Bindings stay `PARTIAL` until a capable session drives it |

## The proposed slice

One capability, `team.authority`, declared in the Spine registry, projecting **four** Team-owned
safe facts into PAIGE's Chat context beside the readiness block, with an explicit refusal state.

One new migration — `public.get_team_authority_readiness`, the narrow projection that keeps member
names and emails inside Postgres. **No new table**, no change to any Team surface, tool, or existing
read, and no second roster. The Chat adapter mirrors `businessContextChatEvidence.ts` (a live
stateless read, deliberately not routed through the Rail-signal resolver) rather than forking a
third pattern.

One repair to carry with it: `.github/workflows/paige-spine-contract.yml`'s vitest step does not
list `paige-spine-business-context-readiness.test.ts`, so that proof runs only in the repo-wide
`verify` job and not in the Spine contract workflow whose path filter matches it. Both files get
added to that line.

Two things I am **not** doing without the source owner: narrowing `get_paige_team_context()`'s
`permission` computation, and adding a service-role path to either read.
