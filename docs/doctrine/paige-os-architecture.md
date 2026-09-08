# Paige OS Architecture

> **Status and authority.** This document is a derived architecture reference. The
> directives in `CLAUDE.md` remain canonical. If this synthesis and `CLAUDE.md`
> differ, `CLAUDE.md` governs. The linked organization and growth-map documents
> remain canonical for their respective details; this document points to them
> rather than duplicating them.
>
> **Current routing override — 2026-09-08:** read the **Paige Runtime Harness** decision in
> `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` before using this synthesis for any model, agent,
> skill, voice, browser, department, or external-tool work. Departments are capability domains
> inside one shared governed Harness. Historical “agent team” language below means optional
> bounded workers in a Paige-led job, never separate Brains, memory, authority, operating logic,
> job systems, cost controls, or disconnected tool access.

## Purpose

Paige is designed as one connected operating system, not a collection of unrelated
AI features. This reference explains how the client portal, bounded specialist work, department
model, action bus, autonomy controls, growth model, and long-range context expansion
fit together. It grounds future work adjacent to `CLAUDE.md` §§7, 8, 14, 16, 17,
35, and 36, and provides an architectural foundation for the future beta investor
pitch without replacing doctrine.

The architecture has a deliberate progression:

1. Paige meets people through an intelligent, tenant-authored portal today (§7).
2. Paige runs substantive work through one Runtime Harness, optionally using bounded specialists (§14).
3. Capability domains coordinate through that Harness and a two-way action bus (§8, §16).
4. Default autonomy lanes inform—but do not grant—the authority that the Spine re-resolves
   for every action at execution time (§16).
5. The same operating primitives support the revenue and governance map (§17).
6. The SMB beachhead can later expand into additional contexts—including
   households, portfolios, and devices—without changing Paige's identity as the
   operating layer (§35).
7. Every surface must remain understandable within five minutes; agent-driven,
   draft-first, one-click interaction is the moat that keeps the system usable as
   its capabilities grow (§36).

## 1. What Paige is

### The product today: an intelligent, two-way portal

Paige's current-scope north star is the client portal that **reasons, suggests,
and acts**, rather than a static place where information is merely stored (§7).
It is one intelligence facing two directions:

- For the client, Paige onboards, answers, probes, nurtures, and acts from the
  client's perspective (§7).
- For the business team, Paige identifies what each client needs, drafts the next
  move, flags risk, and either proposes or executes action according to policy
  (§7).

The portal experience is tenant-authored. Persona, questions, journeys, and
templates come from each tenant's Playbook rather than a hard-coded industry
default (§7). That makes the portal both the immediate product surface and the
first expression of the broader OS: Paige understands a context, coordinates work
inside it, and presents the right next action to the right participant.

### The trajectory: an operating system, not a feature bundle

The long-range north star names Paige as the operating system (§35). The SMB
business is the beachhead, not the architectural ceiling. Later waves may apply
the same context-and-action model to households, portfolios, and device-mediated
experiences (§35).

Those later contexts are **aspirational doctrine, not a statement of shipped
capability**. They should influence boundaries—portable identity, explicit context,
permissions, event-driven actions, and channel-independent interaction—but they do
not justify building speculative household, portfolio, or hardware products ahead
of the current business experience (§35). New contexts arrive as Playbook/context
additions around stable OS primitives, not as competing Paige products (§35).

## 2. How Paige runs work

Paige's operating model has three connected layers: orchestration, organizational
execution, and governed coordination.

### Layer 1: Paige composes registered capabilities through one Harness

Paige is the orchestrator; the Second Brain is her governed, scoped knowledge layer (§14).
For every non-trivial job, the Harness composes eligible registered skills, tools, adapters, and,
when useful, bounded specialist workers; Paige integrates the verified outcome (§14).

Research, internal design, and verification are registered capabilities, with verification on
anything that ships (§14). When no eligible capability fits, Paige may propose a versioned skill
or bounded-worker registration for review and may source patterns, skills, tools, and connectors
for that proposal (§14). Any sourced capability that requires new executable code still follows
the hard approval path; sourcing does not authorize silent code execution (§14).

Orchestration is driven by real signals and performance data, not intuition alone
(§14). Any bounded worker uses the Harness's shared model router to select a cost-appropriate
model for its task, and Paige reports only work the team actually performed (§14). The governing
question is: **Did one Paige use the shared Harness, execution-time Spine authority, canonical
verification, and receipts/Rail?** A bounded worker is optional; bypassing the governed path is not.

### Layer 2: the Harness coordinates ten capability domains

The 10-department operating model defined in `CLAUDE.md` §16 is a capability and ownership
map inside one Paige Runtime Harness, not a roster of isolated AI products. The full organization
map, department mandates, roles, KPIs, and growth-stage rollout live in
[`docs/doctrine/100M-org-blueprint.md`](./100M-org-blueprint.md); this document does
not restate them.

The department model provides three things (§16):

1. **Awareness — Second Brain organizational context.** Eligible, scoped knowledge gives Paige
   ownership, RACI, KPIs, and escalation paths without creating another Brain.
2. **Execution — shared Harness capability domains.** A domain registers versioned skills,
   adapters, canonical-record access, scoped tools, and optional bounded workers; Paige may
   traverse multiple domains in one continuous job.
3. **Governance — execution-time Spine authority.** Existing `autonomy_lane` values remain
   policy inputs: `auto` for eligible AI-performed work, `confirm` for AI-drafted and
   human-approved work, and `off` for human-only work with AI briefing. The effective lane and
   every other authority constraint are re-resolved for each action when it executes.

The model extends existing primitives rather than creating a parallel department
system (§16). Every task must answer three questions: which capability domains and canonical
records it uses, which registered skills/tools or bounded workers it needs, and how the shared
Spine resolves authority and verification for each consequential action (§16).

### Layer 3: the action bus coordinates both sides of the portal

The two-way portal becomes operational through the action bus (§8). Paige initially
organizes work into two coordinated teams:

- **Owner Ops** works for the business owner on pipeline, follow-up, billing
  operations, campaigns, scheduling, risk triage, and the daily brief (§8).
- **Client Experience** works for each client on onboarding, conversational intake,
  expert probing, answers, nurture, and the personalized portal (§8).

These are coordinated views of the 10-department organization, not a competing org
chart (§8, §16). The 10 departments establish durable ownership and execution; the
two teams describe how work crosses the owner/client boundary.

For example, Client Experience detects a need, creates an action for Owner Ops, and the shared
Harness may use a bounded specialist to draft the move. The Spine then resolves active tenant,
actor, workspace, role, tool scope, provider state, approval rule, budget, lane, and verification
requirements for that action before the result returns to the client-facing context (§8, §16).
In the other direction, Owner Ops establishes a play and Client Experience personalizes it for
the individual client (§8). This remains one Paige-led job with attributable evidence, not an
exchange between autonomous department systems.

### The end-to-end work contract

Taken together, the canonical sections imply one reusable execution path:

```text
goal, signal, or conversation
  → tenant-safe context assembly in the shared Paige Runtime Harness
  → classify one or more capability domains and select registered skills/tools or bounded workers
  → resolve Spine authority separately for every read, tool call, job step, or action
  → execute, request approval, or brief a human through canonical seams
  → verify canonical readback and record attributable receipts/Rail for consequential steps
  → Paige integrates and truthfully reports the actual result
  → eligible reviewed learning may enter the governed improvement path
```

This flow is a synthesis of §§7, 8, 14, and 16. It does not create a new workflow
engine or autonomy model. Builds should extend the existing Harness, action kinds, capability
registrations, approvals, audit records, and Playbook configuration that those sections govern.

## 3. How Paige stays intuitive

Capability alone is not the moat. Paige must make the operating system feel obvious
within the five-minute test established by §36. A user should quickly understand
what Paige knows, what she recommends, what will happen next, and where human choice
is required (§36).

Five mechanical patterns produce this feel (§36 — every user-facing build must use
at least one, ideally several):

1. **Proactive surfacing.** Paige tells the user what needs doing; the user doesn't
   hunt for it. Work lands in a queue the user opens by default, not a menu the
   user learns to find.
2. **Draft-first.** Paige does the work, human approves (`autonomy_lane = "confirm"`
   per §16). The user reviews a completed draft, not a blank prompt.
3. **Domain-expert framing.** Paige speaks the user's business language (per
   Playbook), not agent language — never "I'll invoke the tool" or "let me query
   the database."
4. **One-click approval.** *Approve* is a button, not a prompt reformulation. The
   one-click path handles the 80%; drill-down handles the edge case.
5. **§14 team framing.** The user manages a team, not drives a tool. Affordances
   reinforce that mental model: "Paige drafted this for your approval," "Paige
   noticed X and flagged it," "Paige is working on Y for you."

Intuitiveness therefore depends on architecture, not cosmetic simplification.
Tenant-authored context reduces irrelevant choices (§7); department routing hides
organizational complexity (§16); specialist orchestration hides tool complexity
(§14); the action bus puts work in the correct person's queue (§8); and autonomy
lanes make consequence and approval visible (§16). The five-minute test fails when
the user must reconstruct any of those systems manually (§36). Dev-tool-flavored AI
products — blank prompt windows, requiring the user to know what skill exists
before asking, revealing capability only after the user knows to ask — abandon this
moat by design (§36).

## 4. Where Paige is going

### Growth runs on the same operating primitives

The $1B Growth Map is the canonical revenue and top-down governance reference
(`CLAUDE.md` §17). Its full engine, stage, and governance detail lives in
[`docs/doctrine/1B-growth-map.md`](./1B-growth-map.md); this document does not
duplicate it.

Architecturally, growth is not a separate application layered beside Paige. Revenue
features must locate themselves within the existing billing taxonomy; agency
expansion uses the account model; model routing protects margin; and scaled
governance extends autonomy lanes, audit, RLS, sovereignty patterns, two-key
controls, and explicit break-glass access (§17).

The Commerce Line remains hard: Paige powers operators and monetizes operating
rails, but does not become the consumer marketplace or aggregate demand away from
the operator who owns the customer (§17). Every revenue build must identify its
engine, governing law, and existing primitive before it is ready (§17).

### Context expansion preserves the same Paige

Section 35 extends the destination beyond the SMB beachhead to later household,
portfolio, and device contexts. The reusable asset is not a particular dashboard;
it is the pattern already established in the present product:

- explicit context and ownership (§7, §35);
- a standing orchestrated team (§14);
- department-aware work routing (§16);
- actions that travel between the people and agents responsible for them (§8);
- governed autonomy and auditable execution (§16, §17); and
- an interaction model that passes the five-minute test (§36).

Expansion should happen only when a new context can reuse those primitives without
weakening tenant isolation, owner control, governance, or the Commerce Line (§17,
§35). Device presence is therefore a future channel for Paige's operating model,
not permission to couple the core architecture to speculative proprietary hardware
today (§35).

## 5. Design implications for every build

Any build adjacent to this architecture must satisfy the following traceability
questions.

**Product and context**

- Whose context is this, and how is it authored? The current portal is
  tenant-authored; do not hard-code a vertical or a tenant's Playbook into the
  platform (§7).
- Is this current scope or a later-wave context? Household, portfolio, and
  device contexts are directional unless separately approved and implemented
  (§35).

**Work and organization**

- Which registered skills/tools or bounded workers perform the substantive work inside the
  shared Harness? Paige must orchestrate rather than solo non-trivial execution (§14).
- Which capability domain owns it? Route it through the 10-department model instead of
  inventing an unowned feature silo (§16).
- How does it cross the owner/client boundary? Use the action bus when work moves
  between Owner Ops and Client Experience (§8).
- Which execution-time authority decision governs each action? Treat `auto`, `confirm`, and
  `off` as policy inputs, re-resolve the full authority context through the Spine, and do not
  create a competing approval vocabulary (§16).

**Experience**

- Can a new user understand the value and next action within five minutes? If
  not, simplify around agent-driven, draft-first, one-click interaction (§36).
- Does the interface reveal consequence and approval clearly? One-click does
  not mean ungoverned; it means the safe next step is obvious (§16, §36).

**Growth and governance**

- Which revenue engine does it support? Use the canonical billing and revenue
  map rather than creating an unclassified money flow (§17).
- Which governance law binds it? Tenant isolation, audit, autonomy, model
  routing, two-key controls, and break-glass rules scale with the system (§17).
- Does it cross the Commerce Line? Paige may power the operator's marketplace
  activity but must not become the consumer marketplace (§17).
- Which existing primitive does it extend? Architecture grows by extending the
  portal, Playbooks, Harness registrations, action bus, departments, autonomy lanes, audit, and
  billing rails—not by creating duplicate homes (§8, §16, §17).

## Canonical references

- `CLAUDE.md` §7 — intelligent, tenant-authored, two-way client portal.
- `CLAUDE.md` §8 — Owner Ops, Client Experience, and the action bus.
- `CLAUDE.md` §14 — Paige's standing specialist team and orchestration rule.
- `CLAUDE.md` §16 — the 10-department model and autonomy layers.
- [`docs/doctrine/100M-org-blueprint.md`](./100M-org-blueprint.md) — canonical
  organization blueprint; consult it for the full department map, roles, KPIs, and
  rollout.
- `CLAUDE.md` §17 — revenue engines, scaled governance, and the Commerce Line.
- [`docs/doctrine/1B-growth-map.md`](./1B-growth-map.md) — canonical growth map;
  consult it for the full engine, stage, and governance model.
- `CLAUDE.md` §35 — Paige OS north star and later-wave context expansion.
- `CLAUDE.md` §36 — intuitiveness moat and five-minute test.

This reference should be updated only when its canonical sources change. Proposed
product ideas belong in plans or owner-review documents until they become doctrine;
they must not be presented here as shipped capability or canonical direction.

---

Co-authored-by: Codex <codex@openai.com>
