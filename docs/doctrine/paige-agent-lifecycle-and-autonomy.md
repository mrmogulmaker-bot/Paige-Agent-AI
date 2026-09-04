# Agent lifecycle and autonomy — how an agent is born, granted, watched, and stopped

**Status:** DESIGN — awaiting owner approval. No production change is proposed.
**Owner:** Antonio Cook. **Drafted:** 2026-09-04 against `origin/main` `a4ef76e`.
**Reads with:** `paige-agent-registry.md` (the record) · `solo-agent-placement-map.md` (where roles appear).
**Composes with, never replaces:** `autonomy-architecture.md` (§67 process autonomy, §68 decay) ·
`one-approval-gate.md` (the single approval channel) · `governed-execution-seam.md` ·
`../brain/paige-brain-wiring-standard.md`.

---

## 0. The sentence this whole document defends

> **"Always on" means continuously useful and accountable. It does not mean unbounded authority.**

An agent that is always on but cannot be stopped, cannot be audited, or holds a grant nobody has
revisited since March is not an asset. It is an unowned actor with a name.

---

## 1. What this design is NOT allowed to invent

Four mechanisms already exist and are authoritative. This design **routes through them**. Anything
below that looks like a new autonomy or approval channel is a defect, not a feature.

| Concern | The one existing mechanism | Where |
|---|---|---|
| Is this action allowed without asking? | The **server action-risk policy** — `ordinary` · `high` · `owner_only` | `supabase/functions/_shared/action-risk.ts` |
| How do we prove the owner said yes? | The **one approval gate** — server-computed fingerprint, echoed in the request body, executing **the call the server stored** | `paige_pending_confirmations` |
| How much may this account ever do? | `trust_effective_rung()` — the platform rung, with §68 decay | migration `20261039000000` |
| What may this one tool ever do? | `resolve_tool_autonomy(uuid, text)` | migration `20261040000000` |

**Adding a gated agent action is a two-step contract and nothing more:** classify the tool in
`action-risk.ts` with a real reason, then **stop**. The gate covers it the moment it is classified,
and CI (`scripts/ci/one-approval-gate-lint.mjs`) fails the build on an unclassified write or on any
of the three forbidden shapes — comparing the owner's message text, a second approval field, or
returning an approval token in a tool result.

**A registry entry is not an approval channel.** An agent's `autonomy_lane` (§4.2 of the registry) is
a *declaration of its floor*. It never proves consent, never substitutes for the gate, and can only
ever make an action **more** restricted.

---

## 2. Activation — how an agent starts existing for a tenant

| Type | Created by | Row | Rule |
|---|---|---|---|
| `platform_core` | Nobody at runtime — a doctrine amendment plus a seed migration | `tenant_id IS NULL` | The nine roles ship to every tenant. A tenant can neither add nor delete one. |
| `tenant_practice` | The tenant, by asking PAIGE in the conversation | `tenant_id = <tenant>` | Born at the floor, reporting to a platform lead, never above its lead's ceiling. |
| `temporary_worker` | PAIGE, for one job | `tenant_id = <tenant>`, `agent_type='temporary_worker'` | Retires when the job closes. |

**Creation is a chat act, never a surface** (§20). There is no "add agent" button anywhere in this
design. A tenant describes what they need; PAIGE composes the agent and files it.

**Every created agent is born clamped.** Three rules, all of which already have precedent:

1. **It starts at its lead's floor or lower — never higher.** The pack states the general form:
   *"an install can never widen what she may do."*
2. **It inherits the ceiling, and cannot see past it.** `effective = min(grant, floor, ceiling)`.
3. **Creating an agent is itself classified.** A tenant practice agent that would hold any `high`
   capability is an `owner_only`-adjacent decision and passes the gate before it exists.

---

## 3. Configuration — the owner's goals and business context

The inputs already exist and must not be re-collected in a new panel.

| Input | Where it lives today | Feeds |
|---|---|---|
| Voice character | `PaigeBriefPanel.tsx` → `brandVoice` | Every drafting agent |
| Working and message style | `operatingPreferences` | NEXUS, MERIT, CURA, Communications Operations |
| **Boundaries — what PAIGE must never invent** | `doNotAssume` | **VERA**, and it is a hard constraint, not a preference |
| Business readiness | `business_context.readiness` (Spine capability, 2026-09-03) — status + provenance for four Setup fields, **never a raw value** | ZION's plan |
| Standing memories | Mind, `Standing` kind — *"you told her, and it holds until you say otherwise"* | Every agent |

`doNotAssume` deserves emphasis: it is already the shipped field where an owner says what must never
be invented. Under this design it becomes **VERA's register**, and every agent inherits it. That is
a wiring decision, not a new field.

---

## 4. Tools and scoped sources — what an agent may reach

An agent's reach is the **intersection** of four things it does not control:

```
reachable = allowed_tools( registry )
          ∩ tenant scope   ( RLS — current_user_tenant_id() )
          ∩ tier features  ( getTierFeatureSet / hasFeature — §60 )
          ∩ data_boundaries( registry, minus doNotAssume )
```

Three rules follow, each with a reason that already cost us something:

- **RLS is the floor, never the registry.** An agent's `allowed_tools` may only *narrow* what RLS
  already permits. A registry entry must never be the thing standing between an agent and another
  tenant's data.
- **Tier gates go through the helper.** Any render or capability decision reads `hasFeature()`;
  an inline `account_type ===` compare is a §60 violation, and `lint:tier-features` catches it.
- **The scope is re-resolved per turn, not cached.** The one-approval-gate correction of 2026-09-04
  is explicit: *"Revalidate the authoritative resolver before proposal operations and mutating
  dispatch; a changed scope invalidates the turn."* Agents inherit that rule unchanged — it exists
  because a user who is a linked client of one workspace and a member of another can otherwise hold
  a conversation scoped to one while a read resolves the other.

---

## 5. Schedules — what "always on" actually means

`schedule` (§4.2 of the registry) is `jsonb` carrying cadence, window, and the grant that permits
unattended running. Four constraints:

1. **A schedule is not a grant.** It says *when*; the grant says *how much*. A scheduled agent whose
   grant is `Draft only` wakes on time and drafts.
2. **A dark trigger is dark, whatever the arithmetic says.** §67: *"a process whose trigger has no
   substrate is dark regardless of the arithmetic."* A scheduled agent whose trigger has no substrate
   must **say so**, not sit silent. The anchoring case is exact — the cross-tenant leak canary was
   registered blocking, had a correct runner, and had **never run**, reporting `canary_never_run` 342
   times into an empty room.
3. **Unattended running is metered or it is not permitted.** See §9.
4. **A schedule expires with its rung.** §68 windows apply to the authority, so a schedule outlives
   its permission only by stepping down with it.

---

## 6. Pause, revoke, archive

**What exists today is one boolean.** `paige_subagents.enabled` plus `auto_disabled_reason` — no
actor, no timestamp, no owner-facing reason. It cannot answer *"who stopped this, when, and why."*

| Control | Effect | Who | Reversible |
|---|---|---|---|
| **Pause** | Stops new work; in-flight work finishes and reports | Owner, or PAIGE on a safety signal | Yes |
| **Revoke a grant** | Agent survives, drops to `Draft only`; everything routes to approval | Owner | Yes |
| **Kill switch** | Stops immediately, in-flight work abandoned and recorded as abandoned | Owner, or the platform on an isolation failure | Yes, but the abandonment is permanent |
| **Archive** | Retired from the roster; history and Rail entries **retained** | Owner (tenant agents only) | No — recreate instead |

Three rules:

- **Every stop records actor, time and reason** — the `paused_at` / `paused_by` / `pause_reason`
  columns in §4.2 exist for this. A stop nobody can attribute is indistinguishable from a bug.
- **A stop is never silent.** It surfaces in the conversation where the agent was working.
- **Stopping is always allowed, and never gated.** A brake needs no ceremony. This mirrors §67's
  posture rule, where lowering is any platform operator and only *raising* is super_admin.

**The shipped precedent to extend, rather than invent.** `paige_automations.state` is already
`CHECK (state IN ('draft','live','paused'))`. An agent lifecycle state should extend that vocabulary,
not create a fourth one beside `enabled`, `auto_disabled_reason` and the automation state.

### 6.1 Two defects at the agent lifecycle boundary, found and verified

**(a) Agent disable is cross-tenant and gated on a tenant-agnostic role — a live §59 trap.**
`supabase/functions/subagent-forge/index.ts` `actionDisable` (L366–376) is gated only on
`caller.isAdmin`, and `getCaller` (L48–58) computes that by reading `user_roles` **with no tenant
filter**:

```ts
if (!caller.isAdmin) return fail("Admin only", 403);
…
await supabase.from("paige_subagents")
  .update({ enabled: false, auto_disabled_reason: … })
  .eq("slug", slug);                      // ← no tenant predicate
```

`slug` is **globally unique**, so a tenant-level `admin` in *any* workspace can disable *any* agent —
including a `tenant_id IS NULL` platform default, which would disable it **for every tenant**. This
is exactly the §59 global-role trap: cross-tenant authority must gate on `is_platform_owner()` /
`is_platform_operator()`, never on the tenant-level `admin` app_role. `actionApprove` and
`actionReject` share the same gate.

**This design does not fix it** — the assignment is planning only, and the fix needs a §37 producer
inventory across all callers. It is recorded here so no lifecycle work is built on top of it, and
filed as its own task.

**(b) There is no chat or RPC seam for pausing or revoking an agent (§10).** The chat baseline
carries `forge_subagent` (`ordinary`), `delegate_to_subagent` (`high`) and the unclassified read
`list_subagents`. **Disable is reachable only by an admin POSTing to the edge function.** So an owner
cannot ask PAIGE to stop one of her own agents — the exact dead end §10 exists to prevent. Any
lifecycle build must add the classified stop action, or "stopping is always allowed" is aspirational.

**Where that stop action belongs, and it already exists (§18).** Do not stand up a new autonomy
surface for it. `forge_subagent` and `delegate_to_subagent` are **already registered tool keys in the
tenant-settable autonomy catalogue** — `list_tool_autonomy` seeds them as
`('delegate_to_subagent', 'Hand work to a specialist', 'Paige''s team')` and
`('forge_subagent', 'Create a new specialist', 'Paige''s team')`
(`supabase/migrations/20261040000000_the_catalogue_carries_the_team_tools.sql` L85–86), with the
per-tenant mode stored in `tenant_tool_autonomy` and written through
`set_tool_autonomy(text, text, uuid)`, which is `GRANT`ed to `authenticated`
(`supabase/migrations/20260711154701_paige_tool_autonomy.sql` L23, L73, L191). So creating an agent
and delegating to one already carry a per-tenant `auto | confirm | off` mode under a group a business
owner can read — *Paige's team*. **Stopping** one is the member missing from that group, and the
catalogue is its home. This also corrects a narrower reading in the research that fed this document:
`delegate_to_subagent` is not an RPC, but it is very much present in the migrations (8 occurrences),
so "the per-tool autonomy floor is keyed by tool and never by agent" is true of the *mechanism* while
understating how close the existing catalogue already sits to the registry's autonomy question.

---

## 7. Rail — how an agent's work is audited

The Rail is the **evidence and attribution** layer. Three honest constraints, all verified:

- **The Spine is PARTIAL — three registered capabilities against 105 hand-wired inline Chat tools.**
  PAIGE reaches departments through the 105 tools, not through the Spine.
- **A Rail resolver exists and nothing calls it yet.** Per `paige-spine-and-rail-state.md`: a safe
  server read now exists, *"and nothing calls it yet."*
- **Owner-visible Solo Rail activity is UNAVAILABLE, not empty.** An empty activity feed must never
  be rendered as "nothing happened."

### 7.1 The Rail table, exactly as it ships

`public.paige_client_events` (migration `20260712190000`) — verified column by column:

```sql
tenant_id       uuid NOT NULL REFERENCES tenants(id)
contact_id      uuid NOT NULL REFERENCES clients(id)      -- NOT NULL. See 7.2.
event_kind      text NOT NULL REFERENCES paige_event_kinds(slug)
surface         text CHECK IN ('your_paige','contact_paige','client_portal','automation','mcp')
actor_type      text CHECK IN ('owner_staff','client','paige_agent','automation','external')
actor_user_id   uuid REFERENCES auth.users(id)            -- nullable
from_department text REFERENCES paige_departments(slug)
to_department   text REFERENCES paige_departments(slug)
audience        text CHECK IN ('owner','client','both')
visibility      text CHECK IN ('owner_internal','client_visible')
```

**Two facts change what this design can claim.**

**A Rail row cannot name which agent did the work.** `actor_type` collapses every agent to the
single value `paige_agent`. There is no agent id, no VP column, no sub-agent slug. So "PAIGE
delegates to accountable specialists and reports back with clear ownership" is, at the Rail layer,
**not currently expressible** — the row can say *an agent* acted, never *which*.

**Department attribution, by contrast, already exists.** `from_department` and `to_department` are
real FKs to `paige_departments`. So the cheapest honest first step is not a new attribution model:
it is `actor_agent_slug text REFERENCES paige_subagents(slug)` on this table, sitting beside the two
department columns that already work.

### 7.2 An agent whose work is not about one client has nowhere to file it

`contact_id` is `NOT NULL`. `record_rail_event` raises `contact not in tenant`, and the Chat emitter
returns early when there is no contact. The owner ruled on 2026-09-02 that a Rail event may **not**
carry a null `contact_id`; the repair is a distinct tenant/workspace-level outcome projection, filed
as a Spine Change Request (SCR-1) and **unstarted**. `resolveEvidence.ts` L40 independently rejects
any `subject_type !== "client"` (SCR-2, unraised).

**This lands directly on the Business Game Plan.** The plan is a *workspace-level* artifact — ZION
sequencing the owner's own business is about no single client. Under today's Rail, that work
**cannot be filed as an outcome at all**. It is not a gap this design can route around, and it is why
the prototype renders Rail-backed activity honestly as `unavailable` rather than as an empty feed.

### 7.3 What every agent action must write, once a workspace-level Rail write exists

The acting agent's `slug`, the delegator, the tenant, the capability invoked, the inputs' provenance,
the outcome, and — for a gated action — the proposal id it was executed under.

**`paige_subagent_invocations` also has no `tenant_id`**, so run history cannot be tenant-scoped
today either. That is a §9 gap in its own right and should be filed separately rather than bundled
into this design.

---

## 8. Mind — what an agent may contribute

Mind has four lobes, and the pack's event shape is `{lobe, text, by, tier}` — `by` is already agent
attribution.

| Lobe | Holds | May write |
|---|---|---|
| `knowledge` — *what is true* | Standing memories, documents, entity facts, brand identity | **SCRIBE** primarily; any agent may *propose* |
| `skills` — *what she can do* | Primitives, taught skills, installed marketplace skills | PAIGE only |
| `identity` — *who people are* | People, companies, the links between them | **CURA**, **SCRIBE** |
| `judgment` — *what you have ruled* | Preferences, corrections, refusals, **the ceiling itself** | **The owner only.** No agent writes judgment. |

Two rules that are not negotiable:

- **`judgment` is owner-written.** It holds the ceiling. An agent that could write judgment could
  widen its own authority, which is the definition of an ungoverned actor.
- **An agent proposes; the owner rules.** The pack already ships this shape —
  `P.MEMORY_PROPOSED`: *"She does not write to memory on her own at ask-first. She proposes, and
  you rule."* The registry's `mind_contribution` array declares which lobes an agent may propose
  into; it never grants a direct write.

---

## 9. The limits when an action really matters

The brief names seven categories. Each maps to an existing classification, not a new one.

| Category | Class in `action-risk.ts` | Extra requirement |
|---|---|---|
| **Money** | `high` | Amount read from the stored proposal, never re-authored |
| **Publishing** | `high` | A client or the public sees it |
| **External communication** | `high` | Irreversible — email cannot be recalled, and the decision card must say so *before* the button |
| **Contracts / agreements** | `high` | Preview binding: the owner must have seen the specific terms |
| **Access / permissions** | `high`, and `owner_only` where it changes Paige's own authority | Never performed from chat at any approval strength |
| **Deletion** | `high` | Preview binding — the owner must have seen what empties |
| **Sensitive data** | `high` | Plus `data_boundaries` and `doNotAssume` |

**Autonomy is a cost decision as well as a trust one — and this is measured, not estimated.** §67
records it: 639 LLM calls traced, $1.38 estimated, and **zero rows ever written to
`platform_metered_events`**. Paige's spend is observable and not billable, and no plan carries an AI
allowance. At `confirm` the human is the throttle; at `auto` there is none.

**So the rule this design adds is one sentence:** *no agent may be granted unattended authority over
a metered capability until its spend is metered.* Carrying the trace into the meter is the
prerequisite (§8.4 of the autonomy architecture), and it is not this design's to build — but it is
this design's to refuse to run ahead of.

**A near miss worth naming:** `paige_subagents` already carries `daily_invocation_cap` and
`monthly_token_cap` **as columns with defaults — and nothing enforces either.** They read as a budget
and are not one. Any design that cites them as a spend control would be citing a column, not a limit.

### 9.1 Three classification gaps this design must not paper over

| Gap | Consequence |
|---|---|
| **No e-signature or contract action is classified.** Searched `_shared/action-risk.ts` and the chat baseline for `esign`, `docusign`, `signature_request`, `send_for_signature` — no matches. The nearest is `crm_file_document` (`high`). | An agent that executes agreements has **no risk row**, so MERIT's "agreements" remit has no gate behind it. It must be classified before that remit is built. |
| **There is no `sensitive` risk class.** `action-risk.ts` has exactly three classes and none is about data sensitivity; the closest treatments are inline (e.g. `update_client_data`'s confirm summary names *fields*, never values). | "Sensitive data" from the brief maps onto `high` plus `data_boundaries`, not onto a class that exists. Stated so nobody looks for a class that isn't there. |
| **There is no tier feature key for agents.** The `Feature` union has 18 members and none is agents / subagents / registry. `TierKey` has five values and no `client` or `anonymous` — those two tiers are denied by the server, never by a feature key. | The registry's `tier_availability` needs a **new** `Feature` member before `hasFeature()` can gate anything agent-shaped (§60). |

**And the governed seam is not yet load-bearing.** `_shared/paige-spine/governedExecution.ts` is
door-blind across six doors with 13 fail-closed refusal codes — and its **only importer in the whole
repository is its own test**. Nothing is required to use it. Passing its lint does not mean anything
is governed.

---

## 10. The §68 decay law, applied to agents

An agent's authority is held only while **both** conditions hold — a human re-affirmed it recently
enough, **and** the isolation checks are passing on their latest run.

| Rung | Window | Required proof |
|---|---|---|
| 0 Observe · 1 Draft | never expires | none — nothing acts unread |
| 2 Act on the small things | 30 days | cross-tenant leak canary |
| 3 Act and report | 14 days | canary + RLS coverage |
| 4 Full auto | 7 days | canary + RLS coverage |

Four properties carry over to agents unchanged:

- **`pass` is the only affirmative state.** Failed, skipped, errored, or never-ran has proven
  nothing. Absence of proof is not proof.
- **Step down, never collapse.** Proof for rung 2 but not rung 3 grants rung 2. It never falls below
  1 — Observe would strand work silently.
- **Gate on isolation, never performance.** A slow agent is an alert. Revoking authority over a
  latency number trains an operator to ignore the mechanism.
- **Publish `requested`, `effective` and `capped_by` together.** A clamp nobody can see is
  indistinguishable from a bug.

**And the obligation the anchoring case creates:** conditioning an agent's authority on a safety loop
obliges you to make that loop real in the same change. A registered check that never runs is worse
than no check, because it reports honestly into an empty room while authority stands on it.

---

## 11. Honest status

Nothing in this document is built. Specifically, and stated so nobody reads it as shipped:

| Claim | Status |
|---|---|
| The one approval gate exists and enforces | **Live** — `paige_pending_confirmations`, CI-linted |
| `trust_effective_rung()` / `resolve_tool_autonomy()` exist on prod | **Deployed**, verified by catalog query. **Whether either is reached at runtime is UNVERIFIED.** |
| The Solo Trust Compass dial enforces anything | **No** — in-memory, resets on reload, no server code reads it |
| Agents carry `reports_to`, `agent_type`, `autonomy_lane`, `schedule`, pause metadata | **None exist.** All are §4.2 proposals |
| Rail records **which** agent acted | **No.** `paige_client_events.actor_type` collapses every agent to `paige_agent`; department attribution exists, agent attribution does not |
| An agent can file a workspace-level outcome | **No.** `contact_id` is `NOT NULL`; SCR-1 unstarted |
| Autonomy can be resolved for an *agent* | **No.** `tenant_tool_autonomy` is keyed `(tenant_id, tool_key)`; `paige_automations.granted_lane` is per-process; `paige_action_kinds.default_autonomy_lane` is per action kind. Nothing resolves per agent. |
| An owner can stop an agent from chat | **No.** Disable is an admin POST to `subagent-forge`, and that path is cross-tenant (§6.1a) |
| Agent spend is metered | **No.** Zero rows in `platform_metered_events`, ever. Cap columns exist and are unenforced |
| Per-agent or per-tenant §68 decay | **No.** The decay law governs the platform ceiling only; whether tenant grants decay is an open owner ruling |
| Solo activity feed is empty because nothing happened | **False** — it is UNAVAILABLE, not empty |
