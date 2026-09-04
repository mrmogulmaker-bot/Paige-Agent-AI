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

---

## 7. Rail — how an agent's work is audited

The Rail is the **evidence and attribution** layer. Three honest constraints, all verified:

- **The Spine is PARTIAL — three registered capabilities against 105 hand-wired inline Chat tools.**
  PAIGE reaches departments through the 105 tools, not through the Spine.
- **A Rail resolver exists and nothing calls it yet.** Per `paige-spine-and-rail-state.md`: a safe
  server read now exists, *"and nothing calls it yet."*
- **Owner-visible Solo Rail activity is UNAVAILABLE, not empty.** An empty activity feed must never
  be rendered as "nothing happened."

**What every agent action must write, once a Rail write exists:** the acting agent's `slug`, the
delegator, the tenant, the capability invoked, the inputs' provenance, the outcome, and — for a
gated action — the proposal id it was executed under. **`paige_subagent_invocations` has no
`tenant_id`**, so run history cannot be tenant-scoped today. That is a §9 gap in its own right and
should be filed separately rather than bundled into this design.

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
| Rail records agent attribution | **Resolver exists; nothing calls it** |
| Agent spend is metered | **No.** Zero rows in `platform_metered_events`, ever |
| Solo activity feed is empty because nothing happened | **False** — it is UNAVAILABLE, not empty |
