# Platform Function Inventory — What's Built, the Bar, What's Next (2026-07-19)

An honest, code-grounded read of where Paige Agent AI stands vs the best-in-class bar in each
domain, and the ranked priorities for the next 30–60 days. Produced by a 4-domain research crew
(CRM/comms · Studio · Paige-orchestration · platform/governance), integrated here. Everything below
is grounded in real files — §13, no hoped-for.

---

## The one-paragraph read

The platform is **deep, not a shell** — the CRM/comms surface is genuinely GHL-adjacent, the Studio
generates real assets from one conversational brief, and Paige's orchestration substrate (action bus,
sub-agent forge, model router, 10-department org, semantic memory) is real and well-governed. The
gap between what we have and best-in-class is **not "build the feature from scratch" — it's "turn on
and connect the machinery we already built."** The three highest-leverage moves are all
*activation/connection* plays, not green-field builds: **the action bus has rails but no locomotive**
(nothing autonomously consumes the queue), **the billing dashboards read near-empty tables** (real
revenue lives in a different store), and **the visual-critique loop just shipped but is switched off.**

---

## Domain-by-domain: what exists · the bar · the top gaps

### 1. CRM · Communications · Outreach — *the most mature domain*
**Exists (real):** Contacts (`clients` + `create_contact`/`update_contact` RPCs, ~25-panel
`ContactDetail`), pipelines/deals, email (Resend via `send-message`/`send-transactional-email`,
`email_templates`, per-tenant sending identities, inbound→`paige_conversations`), SMS (Twilio, STOP
compliance), calendar/booking (deep: `calendars`, `paige_bookings`, public `/book/:slug`, Google +
Cal.com), forms, and automations (`stage_automation_rules` + the n8n workflow bridge).
**Bar (GoHighLevel):** unified omni-channel Conversations inbox · multi-step drip sequences + bulk
broadcasts · a visual workflow builder with dozens of native triggers · per-sub-account telephony
(own number + A2P + calling/IVR/dialer).
**Top gaps:** (a) **No drip/nurture sequence engine or bulk broadcast** — outreach is single-shot
today [high · L]. (b) **No per-tenant telephony** — one shared Twilio number + one global A2P flag;
no calling [high · M–L]. (c) **No unified Conversations inbox**; triggers are pipeline-stage-only [high · L].

### 2. Vibe Studio · Content/Asset Creation — *real depth, aiming at Lovable/Emergent*
**Exists (real):** one conversational entry (`growth-studio-route` classifies the brief, no
type-picker), all generation seams ship (`growth-page-draft`, `growth-form-draft`,
`growth-funnel-draft`, `generate-image` across 4 providers), true one-session-per-project model
(`studio_sessions` + `ProjectNavigator` rail, no artifact-type tabs), the §26 intelligence substrate
(prompt-forge + voyage-3 semantic memory + learn-from-artifact), and a real three.js 50k-particle
hero. The visual-critique loop is **code-complete (shipped today) but gated off.**
**Bar (Lovable/Bolt/v0/Emergent):** streaming live preview of the *running* artifact · click-to-edit ·
one-click deploy · self-correcting agentic loop that sees its own output · a whole *working app*, not
just marketing blocks.
**Top gaps:** (a) **Visual-critique loop is DARK in prod** — built + smoke-tested, but the renderer
isn't fly-deployed and the flag is off [high · **S, ops-only**]. (b) **Funnels are v1 and the campaign
between assets isn't wired in-session** — `tenant-campaigns` (the nurture engine) is a stub, blocking
the §19 "whole campaign in one session" north star [high · M–L]. (c) **App-level build (#293) doesn't
exist** — the headline capability of every named competitor [high · L].

### 3. Paige — the AI Orchestration Brain — *substantial rails, no autonomy yet*
**Exists (real):** `paige-ai-chat` (8,150 lines, ~105 tools, `delegate_to_subagent`), the
`paige-orchestrator` dispatcher over the `paige_subagents` registry (~12 specialists + `subagent-forge`),
the **action bus** (`paige_actions` state machine with `autonomy_lane` auto/confirm/off, governance-by-
construction — "auto-send" is literally unrepresentable), the model router (open models for cheap tiers,
Claude for sensitive — a send can never route to an open model), the 10-department org brain (seeded),
and genuine semantic memory (`client_memory` + voyage-3, server-side recall).
**Bar (LangGraph/CrewAI/Devin-class):** an agent runtime that runs on *its own signal* — a background
loop that claims queued work, decomposes it, invokes the right specialist, and advances to a human
checkpoint only where policy requires; genuinely bidirectional autonomy.
**Top gaps:** (a) **The action bus has rails but no locomotive** — nothing autonomously consumes the
queue; every transition is a human-in-chat tool call, so `draft_subagent_slug` is a wired-but-never-fired
column [high · **M**]. (b) **Client-facing Paige is tool-less** — `paige-public-chat` passes no tools, so
the "two-way" portal is one-way: the client side can't file a `client.at_risk`/intake action [high · M–L].
(c) **The 10-dept org is awareness-only**, not wired into execution/routing [med · M].

### 4. Platform / Operator / Governance — *substantial console, disconnected billing*
**Exists (real):** God/Fleet Console (`PlatformOverview`, `PlatformTenants` with per-tenant health,
`PlatformTeam`), the tenant hierarchy + agency sub-accounts (security-hardened declared-rail authority),
all billing taxonomy *tables*, tenant Stripe Connect Express onboarding, operator metrics RPCs,
marketplace/registry, pervasive RLS + audit + audit-logged impersonation.
**Bar (GHL agency / mature multi-tenant SaaS):** agency SaaS-mode **rebilling** (resell + mark up usage,
keep the spread) · snapshots · one reconciled subscription store continuously synced with Stripe ·
metering→invoice rollup · SOC2-grade governance (immutable audit, dual-control on destructive actions,
never-silent break-glass).
**Top gaps:** (a) **Billing dashboards aren't fed by live Stripe** — `operator_dashboard_metrics` reads
`platform_subscriptions`, but the live webhook writes `user_subscriptions` (3 stores, 2 webhooks); the
God dashboard MRR/ARR reads near-empty tables [high · **M, go-live blocker**]. (b) **No agency
rebilling/metering rollup** — the §17 NRR engine [high · L]. (c) **§17 governance laws unbuilt** —
`paige_audit_log` isn't append-only/hash-chained, no two-key on destructive admin fns, no logged
break-glass [high · M–L].

---

## Ranked priorities — next 30–60 days

Weighted by impact × leverage (how much is already built) × strategic fit (the §7/§8 moat) ×
go-live-readiness. The theme: **connect and activate what's built before adding new surfaces.**

**① Activate the visual-critique loop** — *S effort, this week.* Fly-deploy `services/visual-renderer`,
set 3 secrets, flip `STUDIO_VISUAL_CRITIQUE_ENABLED`, run one live E2E. It's built + smoke-tested; leaving
it off means we paid for the moat and switched it off. **Highest ROI on the board.**

**② Build the action-bus autonomous worker — "the locomotive"** — *M effort.* One cron-gated worker that
claims `paige_actions WHERE status='filed'` (SELECT … FOR UPDATE SKIP LOCKED), invokes the action-kind's
own `draft_subagent_slug`, writes the draft, and advances to `pending_approval`. This is the single line
between the north-star claim "a portal that **acts**" (§7) and "an assistant you prompt step by step." The
rails, the registry, and the autonomy governance already exist — this turns Paige autonomous for the least
code of any high-impact item. (Close companion: give client-facing Paige a **send-free** tool surface so
the Client team can *file* actions — the other half of "two-way," #2b above.)

**③ Reconcile billing to live Stripe** — *M effort, go-live blocker.* Collapse the 3 subscription stores /
2 webhooks into one reconciled ledger and repoint `operator_dashboard_metrics` at it, so the God/agency
dashboards reflect real revenue. Every operator KPI is untrustworthy until this lands — and it's a
prerequisite for selling the agency tier.

**④ Drip/nurture sequence engine + bulk broadcast** — *L effort.* The biggest missing GHL muscle and the
unlock for the §19 "whole campaign in one session" promise (replaces the `tenant-campaigns` stub). New
sequence/enrollment/step tables + a cadence scheduler on the existing `process-email-queue` substrate; the
send rails already exist. Pairs naturally with a **unified Conversations inbox** (#1c) as the staff surface.

**⑤ §17 God-account governance laws** — *M–L effort.* Append-only + hash-chained unified audit ledger,
two-key/dual-control on the destructive admin functions (`admin-delete-user`, `admin-drop-bucket`,
`factory-credit-reset`), and a logged + notified break-glass tenant-access flow. Not urgent for a
pre-launch single operator, but a hard trust/compliance gate before onboarding agencies at scale (§17).

**Deferred but named (roadmap, not 30–60 days):** per-tenant telephony + calling [M–L], app-level "build a
real app" Studio (#293) [L], per-subtask image-model selection (#231) [M], 10-dept execution routing [M].

---

*Grounded 2026-07-19 by a 4-domain research crew. Item numbers reference the live task list where noted.*
