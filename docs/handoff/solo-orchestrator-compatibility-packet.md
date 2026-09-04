# Solo Orchestrator — compatibility packet

**For:** the in-flight Solo Intake and Lifecycle Orchestrator workstream.
**From:** the Agent Registry design (`../doctrine/paige-agent-registry.md`).
**Drafted:** 2026-09-04 against `origin/main` `a4ef76e`. **Status:** advisory, not blocking.

> **This packet does not ask you to wait for the roster.** It names six things that are cheap now
> and expensive to retrofit, and nothing else. If you build only §2–§7 you will be compatible with
> the registry whenever it lands, and you will not have to rename, re-scope or re-attribute anything.

**Honest note on scope.** A workstream by the name *"Solo Intake and Lifecycle Orchestrator"* has
**no record in this repository** — no doc, no branch, no migration, no edge function, and nothing in
the last 60 commits. Searched: `docs/` for `lifecycle orchestrator` / `intake orchestrator` /
`solo orchestrator`, `docs/delivery/`, `docs/handoff/`, and `git log --oneline -60`. So this packet
is written against **what the platform already provides**, not against that workstream's own design,
which this session has not seen. Where it assumes something about your build, that is flagged.

---

## 1. What already exists — reuse it, do not rebuild it

`supabase/functions/paige-orchestrator/index.ts` (624 lines) is live and already does most of this.

| Capability | How | Line |
|---|---|---|
| Tenant-safe scope resolution | `resolveTenantScope(req, payload)` | L50–88 |
| Agent discovery | `searchSubagents()` / `inspectRoster()` over `paige_subagents` | L120, L231 |
| Dispatch | `invokeLocal()` (edge function) · `dispatchLangGraph()` (bridge) · `invokeSoft()` | L409, L435, L466 |
| Run logging | `logInvocation()` / `updateInvocation()` → `paige_subagent_invocations` | L395–407 |
| Roster health | `rosterHealthMap()` over invocation history | L188 |
| Audit | `paige_audit_log` insert on `set_agent_job_kind` | L377 |
| Prompt leak guard | `system_prompt` stripped before any response leaves | L141 |

**Actions today:** `tool_search` · `tool_invoke` · `list_subagents` · `inspect` · `set_agent_job_kind`.

---

## 2. A generic tenant-owned Orchestrator identity

**Do not name it.** Do not call it ZION, MASON, or anything else. Give it a slug and a generic
display name, and let the registry attach a department and a lead later.

Register it as a `paige_subagents` row:

```
slug         : 'solo-orchestrator'        -- stable, globally unique, already an FK target
name         : 'Orchestrator'             -- generic; the registry may re-label without a migration
tenant_id    : NULL                       -- a platform default that runs FOR each tenant
department   : NULL                       -- deliberately unset; see §7
runtime      : 'local'
edge_function: '<your function name>'
enabled      : true
```

**Why `tenant_id IS NULL` and not one row per tenant.** `paige_subagents` already uses NULL to mean
"platform default, available to every tenant," and RLS policy `paige_subagents_tenant_read` already
enforces that a tenant sees platform defaults plus its own rows. Minting a row per tenant would
create a second scoping model beside the one that ships.

**One rule that costs nothing now and a migration later:** the orchestrator's identity is **the row**,
not a string constant in your function. Everything downstream — attribution, health, the future
department attachment — keys on `slug`.

---

## 3. Rail actor/worker attribution

This is the item most expensive to retrofit, because attribution that was never written cannot be
backfilled.

**Every unit of work records four identities, not one:**

| Field | Meaning | Why |
|---|---|---|
| `actor_agent_slug` | The agent that **performed** it | `solo-orchestrator`, or the worker it dispatched |
| `delegated_by` | Who **asked** — `'PAIGE'`, an agent slug, a schedule, or a user id | An action with no delegator is an unowned actor |
| `on_behalf_of_user` | The human whose authority it ran under | Needed to answer "who authorised this" |
| `tenant_id` | The workspace | See the gap below |

**Three real constraints you will hit. Design around them deliberately rather than discovering them.**

**1. The Rail cannot say WHICH agent acted.** `public.paige_client_events` constrains
`actor_type` to `('owner_staff','client','paige_agent','automation','external')`. Every agent
collapses to the single value `paige_agent`; there is no agent id, no slug, no VP column.
`from_department` and `to_department` *are* real FKs to `paige_departments`, so **department**
attribution works and **agent** attribution does not.

**2. `paige_client_events.contact_id` is `NOT NULL`.** `record_rail_event` raises
`contact not in tenant`, and the Chat emitter returns early without a contact. **Intake and
lifecycle work that is not about one specific client therefore has nowhere to file an outcome
today.** This is the constraint most likely to bite your workstream, because intake frequently
begins before a `clients` row exists. The workspace-level projection is a Spine Change Request
(SCR-1) and is **unstarted**; `resolveEvidence.ts` L40 separately rejects any
`subject_type !== "client"` (SCR-2, unraised). Plan for the Rail write to be **unavailable** for
pre-contact work, and render it as `unavailable` rather than as an empty feed.

**3. `paige_subagent_invocations` has no `tenant_id`, and `paige_audit_log` has neither
`tenant_id` nor an agent actor** (only `actor_user_id`, `actor_role`, `action`, `target_type`,
`target_id`, `payload`).

**What to do meanwhile:** carry `actor_agent_slug`, `delegated_by` and `tenant_id` inside `payload`
with those exact key names, so a later column migration is a copy rather than a re-derivation. The
cheapest real fix, when someone gets to it, is `actor_agent_slug text REFERENCES
paige_subagents(slug)` on `paige_client_events`, beside the two department columns that already
work.

**And do not read an empty feed as nothing happening.** Owner-visible Solo Rail activity is
currently **UNAVAILABLE, not empty** — a distinction the Solo surfaces already make with the
`TruthPill` vocabulary (`live` · `partial` · `unavailable` · `proposed`). Use those four words.

---

## 4. The tenant-safe job envelope

**Copy `resolveTenantScope` rather than re-deriving it.** It encodes two decisions that were each
learned the hard way:

1. **The service path is trusted on an EXACT match to the service-role key** — never on a `role`
   claim decoded from the token. A forged `role:service_role` token cannot enter the trusted branch
   even if gateway config changes.
2. **A user caller's `tenant_id` in the body is never trusted.** It is derived server-side from
   `get_paige_persona_context()`, and on error it degrades to platform defaults — *never* widens.

The envelope to build to:

```jsonc
{
  "action": "…",
  "slug": "solo-orchestrator",
  "input": { /* your job payload */ },
  "context": {
    "user_id": "…",           // the human
    "contact_id": "…",        // optional
    "conversation_id": "…",   // REQUIRED where a result must return to a thread — see §6
    "tenant_id": "…"          // ONLY honoured on the service path, and uuid-validated first
  }
}
```

**Re-resolve scope per turn; never cache it.** The one-approval-gate correction of 2026-09-04 is
explicit: *"Revalidate the authoritative resolver before proposal operations and mutating dispatch;
a changed scope invalidates the turn."* This is not defensive coding — a user who is a linked client
of one workspace and a member of another can otherwise hold a conversation scoped to one while a
read resolves the other.

---

## 5. Action and approval policy hooks

**The entire contract is two steps, and step two is "stop."**

1. **Classify every tool your orchestrator can invoke** in
   `supabase/functions/_shared/action-risk.ts` — `ordinary` · `high` · `owner_only` — with a real
   reason on the same line. An entry with no defensible reason should be `high`.
2. **Stop. Approval is already handled.** Do not add a request field, do not read the owner's prose,
   do not echo a token back through a tool result, do not trust `confirm: true` from model
   arguments. The gate covers your tool the moment it is classified, and
   `scripts/ci/one-approval-gate-lint.mjs` fails the build on all four shapes.

**The one thing that would need review before you build it:** if your workstream needs a *new way to
prove the owner agreed* — a new request field, a new token path — that is a gate change and goes to
the Chat build first. Adding a capability is yours; changing how consent is proven is not.

**If the owner must have SEEN a specific consequence** (an intake that overwrites records, a
lifecycle step that deletes), mint a **preview binding** as a *precondition, not an approval*:
single-use, expiring, scoped to this tenant **and** this requester, created **before** the current
turn, and the executed target read **from the binding row** — never from a name the model supplied.
`pipeline_archive_preview` is the worked example.

---

## 6. Structured result back to PAIGE

A result that does not reach the conversation is invisible, and the owner will conclude nothing
happened. Return a shape PAIGE can render as a contribution row without re-deriving it:

```jsonc
{
  "ok": true,
  "agent": { "slug": "solo-orchestrator", "name": "Orchestrator" },
  "state": "Done",                    // Ready|Working|Blocked|Holding|Done|Failed — §4.3 of the registry
  "truth": "live",                    // live|partial|unavailable|proposed — the shipped TruthPill words
  "summary": "One sentence in her voice, naming what actually happened.",
  "reads":  ["Setup answers", "Catalogue"],   // provenance the owner can check
  "produced": [{ "kind": "…", "id": "…", "where": "/solo/:account/…" }],
  "needs_owner": null,                // or { reason, reversible: false, proposal_id }
  "blocked_by": null,                 // or { what: "Calendar not connected", fix: "Settings › Integrations" }
  "conversation_id": "…"              // where this returns
}
```

Four rules the prototype demonstrates and this shape enforces:

- **A block names the exact missing connection and the surface that fixes it** — never a spinner.
- **A failure names its provider reason and states its retry policy.** One attempt, then stop and
  hand the owner a real choice; retrying a configuration rejection produces the same rejection.
- **Never report a metric that means nothing yet.** Omit it rather than decorate with it.
- **`needs_owner` routes to the one gate.** It carries the stored `proposal_id`; it never carries an
  approval.

---

## 7. The future department and role attachment point

**Leave `department` NULL and add nothing else.** That is the whole ask.

When the registry lands, your row acquires `department`, `reports_to`, `agent_type` and
`autonomy_lane` (§4.2 of the registry) — all additive columns on a row that already exists, keyed on
a `slug` that never changed. Nothing you build now has to move.

**Do not** invent a department string, and **do not** add a hierarchy field of your own shape. Two
reasons, both concrete:

- `paige_departments` already holds 11 slugs and `vpDepartments.ts` is compile-locked as
  `Record<DeptSlug, VP>` — a slug that is not in that map is a TypeScript error, by design.
- **Today, 13 of 34 seeded agents have `department = NULL`** and none use the nine §16 blueprint
  desks. NULL is the honest current state, not a gap you need to fill.

**Expected attachment when the registry lands:** the Solo Orchestrator is generic technical
execution, so it attaches beneath **ZION** as an Automation-Agent-class worker —
`reports_to = 'zion'`, `agent_type = 'platform_core'`, `department = 'technology_automation'`. Stated
so you can sanity-check the fit, **not** so you can hardcode it now.

---

## 8. Checklist

- [ ] Registered as one `paige_subagents` row, `tenant_id NULL`, generic name, `department NULL`
- [ ] `resolveTenantScope` copied, not re-derived; scope re-resolved per turn
- [ ] Every unit of work carries `actor_agent_slug`, `delegated_by`, `on_behalf_of_user`, `tenant_id`
- [ ] Attribution written into `payload` with those key names while the columns are missing
- [ ] Every invocable tool classified in `action-risk.ts` with a real reason — and nothing else added
- [ ] Results return the §6 shape to a `conversation_id`
- [ ] Unavailable is rendered as `unavailable`, never as empty
- [ ] No department string, no hierarchy field, no second approval channel, no agent name

## 9. One thing to avoid inheriting

`subagent-forge`'s `actionDisable` gates on a **tenant-agnostic** `admin` role and updates
`paige_subagents` by globally-unique `slug` **with no tenant predicate** — so a tenant-level admin
can disable any agent, including a platform default, for everyone. It is filed as its own task.
**Do not model your own stop path on it.** Gate cross-tenant authority on `is_platform_operator()`,
and always carry a tenant predicate on the write.
