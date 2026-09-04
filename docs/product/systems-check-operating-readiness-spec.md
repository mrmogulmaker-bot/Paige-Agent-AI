# Systems Check — Truthful Operating-Readiness Console

**Status:** SPEC — owner-directed 2026-09-04. Signal grounding in flight; production wiring gated on
owner approval of the interactive prototype (§69 Gate 1).
**Workstream:** AI orchestration / Command Center. **Tier:** Solo + sub-account (NOT operator/God).
**Supersedes:** the radial "Evidence moving through the business" treatment on
`src/solo/SoloSystemsCheckWorkspace.tsx`.

---

## 0. Why this document exists

The owner's brief is long, precise, and load-bearing. A brief that lives only in a chat transcript
evaporates on the next context reset — which is the exact failure §BRAIN and §0 exist to end. This
file is the durable home for it. Where a requirement below is the owner's own words, it is quoted.

## 1. The problem being fixed

> "The current page is visually polished, but it is not yet a useful operating surface for a
> business owner." — owner, 2026-09-04

The shipped surface renders a radial diagram of four nodes around a PAIGE hub, a "10 persisted
findings" count, a 6-confirmed / 3-needs-attention / 1-unavailable tally, and a single
`Last result <timestamp>`. None of it answers the questions the surface exists to answer.

### The five questions Systems Check MUST answer

1. What is genuinely working right now?
2. What is blocked, disconnected, misconfigured, or unavailable?
3. What data is current, stale, missing, or awaiting proof?
4. What can PAIGE and the connected agent team actually do today?
5. What is the most important next action, who owns it, and where does the owner go to complete it?

### Named defects in the shipped surface

| Shipped | Why it fails |
| --- | --- |
| "Data Product", "Payments Ops" | "too internal and unclear for a Solo owner" |
| "10 persisted findings" | "does not tell the owner what matters" |
| "The picture is incomplete" | "honest but too generic; the page should identify exactly which sources are incomplete and what that prevents" |
| "Last result 9/4/2026, 5:00:05 AM" | "should identify the source and freshness, not imply the entire business was checked at one timestamp" |
| "Open PAIGE for the fuller rundown" as the only exit | a generic exit is not a next action |

### The radial is reassigned, not deleted

> "Do not preserve the radial visual merely because it already exists. Reassign that design
> language to Trust Compass, where it can later represent real agent authority, grounding,
> readiness, impact, and accountability."

## 2. The four sub-tabs, and what each one answers

| Sub-tab | Answers |
| --- | --- |
| Business Game Plan *(default landing)* | what should we do? |
| Systems Check | is the operating environment ready? |
| Mind | what does PAIGE know? |
| Trust Compass | can this agent be trusted to act, within this scope, right now? |

All four derive from the shared layers — Spine, Rail, Mind. None of them holds its own data store.
Mind itself is not yet live; bringing it live is tracked separately.

## 3. Required structure

### 3.1 What needs attention now
A short prioritized list of **real** blockers, failed checks, missing setup, expired or stale
evidence, or owner decisions. Every item carries four things, without exception:

- an **owner** — the business owner, a named agent, or an external provider;
- a **source** — the actual record backing the claim;
- a **freshness date** — what was verified, and when;
- a **direct next action** — deep-linked into the real owning surface (Setup, Integrations, Sales,
  Campaigns, Clients, Billing, Command Center). *Not* a generic "open PAIGE for more".

### 3.2 What is ready to operate
Only capabilities with source-backed evidence. Stated plainly, in the owner's own register:

- "Email sending is ready."
- "n8n connection is available but a tenant-safe orchestration round trip is still awaiting proof."
- "Zapier API connection is not yet verified."
- "A2P registration is pending provider integration."

> "Do not claim aggregate health where the underlying picture is incomplete."

### 3.3 Operating areas
Plain business language — **not** abstract department labels. Each area carries: current status ·
what we know · source and last verified time · what PAIGE can do now · what is blocked · owner or
responsible agent · exact next action.

The initial nine areas:

1. Business setup and identity
2. People and CRM
3. Sales and commercial operations
4. Email, phone, and SMS readiness
5. Campaigns, social, and advertising
6. Integrations and automations
7. PAIGE agent team and delegated work
8. Business knowledge and data readiness
9. Security, permissions, and governance

### 3.4 Recent real verification
Only actual source-backed checks, provider outcomes, or attributable completed actions — with
success, failure, retry and freshness where those records exist.

> "Do not use fixtures, stale persisted counts, or fabricated 'confirmed' states."

This section reads the Rail. It is the direct consumer of the agent-attribution uplift: without
per-agent attribution the Rail can only say "PAIGE", which cannot answer "who owns it".

### 3.5 Owner decisions and next actions
Make obvious what the owner must do, what PAIGE can complete autonomously, and what is awaiting an
external provider or platform response.

## 4. Status vocabulary — CLOSED SET

Nothing outside this list may render, ever:

`LIVE` · `PARTIAL` · `NOT CONNECTED` · `NEEDS ATTENTION` · `PENDING PROVIDER` · `UNAVAILABLE` ·
`PROOF OWED` · `PAUSED`

> "Do not use an unexplained health percentage or trust score."

No percentage. No score. No aggregate roll-up over an incomplete picture.

## 5. The Refresh contract

Refresh must be real. It either:

- performs the supported current checks and displays updated source and freshness evidence; **or**
- says plainly that a source cannot currently be checked.

> "It must never refresh a static fixture and represent it as live operating evidence."

A signal that cannot be re-checked on demand says so, and says why. Every re-runnable check must
name its callable seam, and the seam must be invocable by a Solo owner/admin/coach under RLS.

## 6. Scope boundaries

**In scope.** Grounding every signal; the truthful status contract; the Refresh contract; the
prototype; wiring only the proven signals; labelling every unproven source `UNAVAILABLE` or
`PROOF OWED`.

**Out of scope — explicitly.** A2P/Twilio provider functionality and Zapier API/MCP
implementation. Those are separate active workstreams.

> "Instead, create reusable truthful result contracts so those separate workstreams can feed
> Systems Check when their real state is available."

So this workstream defines the **result contract** those workstreams must satisfy, and consumes it
when they publish. It does not implement them.

**Design jurisdiction (§00).** The owner set this direction himself and it is ported as given.
Visual treatment beyond that direction is Claude Design's. Claude Code owns whether each value is
wired to a real backend or an honest absence, whether the next action actually resolves, and
whether the surface renders at all.

**Viewport.** Keep the Command Center form-fitting at the required Solo viewports.

> "Do not make the page a dense monitoring dashboard or introduce broad scrolling as an escape hatch."

## 7. Required sequence

1. Ground every proposed signal in a real source, owner, freshness rule and safe status vocabulary.
2. Produce the interactive prototype across **empty, partial, ready, blocked, provider-pending,
   failure, retry, and workspace-switch** states.
3. Keep the radial/dial concept for the separate Trust Compass sub-tab.
4. Wire only proven signals into the production page.
5. Label every remaining source unavailable or proof owed rather than creating decorative status.

Step 2 is the §69 Gate 1 approval point. No production UI ships before it.

## 8. Grounded signal inventory

*Populated from the signal-grounding crew. Until a row here names a real source, that signal does
not render — it is `UNAVAILABLE` or `PROOF OWED`.*

| Area | Signal | Source | Tenant scope | Freshness rule | Status today | Owner | Next action | Blocked by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| _pending crew grounding_ | | | | | | | | |

## 9. Cross-references

§00 jurisdiction · §9 platform/tenant seam · §11 no internal jargon in visible copy · §13 honest
reporting · §18 one home · §32 a green build is not a working surface · §36 intuitiveness · §37
producer/consumer inventory · §51/§56 tier matrix · §58 anti-regression · §66 same-commit matrix
update · §69 flow-by-flow · §70 the owner must be able to USE it.

Related: `docs/doctrine/tier-matrix.md` · `docs/doctrine/paige-agent-registry.md` ·
`docs/doctrine/solo-agent-placement-map.md` · `docs/doctrine/connections-rail-contract.md` ·
`docs/doctrine/autonomy-architecture.md`.
