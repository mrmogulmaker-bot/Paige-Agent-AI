# The Command Center is four surfaces, not four names for one dashboard

**Status:** CONTRACT — owner-ruled 2026-09-04. Binding on all four Solo Command Center sub-tabs.
**Workstream:** AI orchestration / Command Center. **Tier:** Solo + sub-account.

---

## 1. Why this document exists

The four sub-tabs had been overlapping in everyone's head, the owner's included:

> "I think I even was personally colluding with both or all of them together, like they were all
> overlapping. Now I think they are very separate things that make up a single big machine, and
> they are all very necessary. Especially if we're talking about PAIGE being an actual AI COO,
> then she really needs those four standalone operational tabs for the solo platform users."
> — owner, 2026-09-04

They are four distinct parts of one operating machine. Each answers a different question, and a
surface that answers someone else's question is the bug this contract exists to prevent.

## 2. The four surfaces

| Sub-tab | Its job | The owner's question |
|---|---|---|
| **Business Game Plan** *(default landing)* | Strategy, priorities, goals, decisions, and the work PAIGE recommends next. | *"What should we do?"* |
| **Systems Check** | Practical operating readiness: connections, data, workflows, senders, setup, blockers, and next fixes. | *"Can the business systems do it?"* |
| **Trust Compass** | Agent authority and governance: what PAIGE or an agent can do, what needs approval, and why. | *"Can I trust this agent to do it?"* |
| **Mind** | Durable, sourced business knowledge PAIGE uses to understand the company over time. | *"What does PAIGE know about us?"* |

## 3. The loop

```
Mind gives PAIGE context
  → Business Game Plan sets priorities
    → Systems Check confirms readiness
      → Trust Compass governs delegation
        → PAIGE and the agent team act
          → results return through Rail, Spine, Mind
            → and into the next Game Plan
```

The owner's framing of why this is the foundation of an actual AI COO, and not a reporting screen:

> "Not just telling the owner what is happening, but knowing the business, choosing priorities,
> confirming the environment is ready, acting within trust boundaries, and learning from results."

**The loop is the acceptance test.** A surface that cannot receive from its predecessor or hand to
its successor is not finished, however complete it looks alone.

## 4. Trust Compass — recorded status, accurately

The owner's explicit instruction is that this be recorded accurately rather than described as
either finished or absent:

| | |
|---|---|
| **Existing technical foundation** | **Present on `main`.** `src/solo/compass.tsx` (572 lines), a live `useTrustDepartments` hook, and a top-level Solo nav entry (`SoloApp.tsx:36`, third in `NAV`). Backend: `admin_app_settings['paige_trust_compass']`, `trust_effective_rung()`, `resolve_tool_autonomy()`, `list_tool_autonomy()`, `attest_platform_trust()`. |
| **Active Solo UI entry point** | **Absent** as a Command Center tab. |
| **User-facing functional capability** | **Partial** until the new UI, current evidence wiring, and real owner interactions are released and proven. |

**The existing implementation is the foundation to modernise and organise — not a duplicate to
create, and not a foundation to dismantle.** Build from the UI downward while preserving and
reconciling the existing backend and contracts rather than standing up competing sources of truth.

**The legacy route stays compatible.** It may redirect or deep-link into the canonical Command
Center experience after release. Old links do not break (§58).

### 4.1 What the owner must be able to DO

1. See the PAIGE team, tenant agents, and connected workers relevant to their workspace.
2. Understand each agent's present operating posture: **Delegate · Monitor · Ask First · Not Ready · Paused**.
3. See **why** that posture applies — authority; business grounding; connection and system
   readiness; impact and risk; recent accountable outcomes.
4. Open the exact supporting evidence and owning surface.
5. Pause or resume an agent where the owner has authority.
6. Adjust approved tenant-level autonomy or tool permissions **only where the platform actually
   enforces those settings**.
7. Review pending approvals and consequential actions.
8. See failures, retries, stale evidence, and missing setup without deciphering internal terminology.
9. Go directly to the relevant Setup, Integrations, Communications, Sales, Campaigns, or Systems
   Check location to resolve a blocker.

> "Do not present a fake dial, fabricated score, or implied agent capability. Every visual state
> must be grounded in enforced authority and real evidence."

### 4.2 A constraint that would otherwise be got wrong

`trust_effective_rung()` is revoked from **every** role — including `service_role` — and reachable
only from other `SECURITY DEFINER` functions. Its own comment states the rule:

> *"a tenant never learns the platform posture, only its effect on their own tool."*

So a Solo owner sees the **effect** on their own agents and processes, plus an honest "further
limited by platform policy". They never see the platform ceiling, the posture, the attestation
window, or the cap reason. A Solo reader must therefore be a **new tenant-scoped projection** —
never a widened grant on `get_platform_trust_compass()`, which is operator-only by design (§53:
add, don't widen in place).

### 4.3 The Rail dependency, stated honestly

Of the five things the detail view must explain, **Accountability resolves to the Rail** — and the
Rail could not say which agent acted. That is why the schema uplift sequences first (PR #925).

> "Rail's current limitation remains a real architecture requirement: named-agent attribution and
> workspace-level events are needed before Trust Compass can show full accountable agent activity.
> Until then, represent that truthfully as incomplete rather than simulating it."

**A column is capacity, not behaviour.** PR #925 makes attribution possible; it does not make it
true. Nothing writes an agent slug yet, and the Rail holds nine rows across three tenants. Full
accountable activity additionally needs **producers**. Until they land, this surface says
*incomplete* — it does not simulate.

## 5. Required prototype states

Covering, for Trust Compass and reused as the pattern for the other three:

first-time / empty workspace · partially configured workspace · active delegated agent · agent
needing owner approval · paused agent · connection or provider failure · stale or missing evidence ·
workspace switching · desktop and mobile layouts.

## 6. Scope boundary

This work stays in the AI orchestration and Command Center workstream. **A2P/Twilio and Zapier
implementation are not absorbed** — those workstreams later feed their verified status in. This
workstream defines the truthful result contract they publish into.

## 7. Cross-references

§00 jurisdiction · §9 platform/tenant seam · §11 no internal jargon in visible copy · §13 honest
reporting · §18 one home · §32 a green build is not a working surface · §36 intuitiveness ·
§51/§56 tier matrix · §53 operator tiers · §58 anti-regression · §65 names map to the user's mental
model · §67 autonomy attaches to a process · §68 no authority is permanent · §70 the owner must be
able to USE it.

Related: `systems-check-operating-readiness-spec.md` · `autonomy-architecture.md` ·
`tier-matrix.md` · `paige-agent-registry.md` · `solo-agent-placement-map.md`.
