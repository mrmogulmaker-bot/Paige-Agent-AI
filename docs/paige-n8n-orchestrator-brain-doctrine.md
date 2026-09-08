# Paige → n8n: Orchestrator-Brain Authoring Doctrine

How Paige architects n8n automations for non-technical operators. Condensed into
the paige-ai-chat system prompt (BUILDING AUTOMATIONS block); full reference here
for the future template-library build (task #118).

## Node types Paige emits (verified live via n8n MCP get_node_types)

| Role | node `type` | `typeVersion` |
|---|---|---|
| Orchestrator node (n8n Agent) | `@n8n/n8n-nodes-langchain.agent` | 3.1 |
| Chat model (historical template snapshot; replaceable configuration) | `@n8n/n8n-nodes-langchain.lmChatAnthropic` | 1.5 (model `claude-sonnet-4-6`) |
| Bounded session/Mind state adapter | `@n8n/n8n-nodes-langchain.memoryBufferWindow` | 1.4 |
| Sub-workflow as tool | `@n8n/n8n-nodes-langchain.toolWorkflow` | 2.2 |
| Sub-agent as tool | `@n8n/n8n-nodes-langchain.agentTool` | 2.2 |
| Trigger — form | `n8n-nodes-base.formTrigger` | 2.6 |
| Trigger — webhook | `n8n-nodes-base.webhook` | 2.1 |
| Trigger — schedule | `n8n-nodes-base.scheduleTrigger` | 1.3 |
| Structured output | `@n8n/n8n-nodes-langchain.outputParserStructured` | 1.3 |
| Act/notify | `gmail` 2.2 · `telegram` 1.2 · `httpRequest` 4.4 · `if` 2.3 · `switch` 3.4 · `executeWorkflow` 1.3 |

## Structural invariants
1. Exactly one trigger → orchestrator Agent node via `type:"main"`.
2. The Agent node always has `ai_languageModel`; `ai_memory` is permitted only as bounded session/Mind state or an adapter to the one governed Memory eligibility contract—never an n8n-owned durable store. Add `ai_outputParser` when the node must route.
3. **AI sub-nodes connect IN REVERSE** — keyed by the sub-node's *name*, connection type `ai_languageModel`/`ai_memory`/`ai_tool`/`ai_outputParser`, pointing INTO the agent. Only trigger→brain→downstream use `main`.
4. Propose→confirm is mandatory for gated work: `needs_human_approval` is a routing signal only. Its branch must invoke the shared Spine/one-approval gate, which re-resolves authority at execution time and owns approval proof; the n8n branch cannot approve locally.
5. Notify + Log are `executeWorkflow` calls to reusable per-tenant bridges (the §10 callable seam, §8 action bus), never hand-rolled.
6. Credentials are placeholders filled from `list_credentials` — never hardcoded.
7. `POST /api/v1/workflows` accepts only `{name, nodes, connections, settings}` — never send `active`/`tags`/`pinData`. Created inactive; name ends `[DRAFT]`; activation is a separate gated step.

## Single-brain vs sub-agents
Default one orchestrator Agent node (give it scoped tools, not more brains). In a generated n8n workflow, an
`agentTool`/`toolWorkflow` is only a bounded worker inside the one Paige Runtime Harness—not a
department Brain, independent memory, authority system, or disconnected tool island. Use one only
when distinct expertise/presentation is needed, two audiences are served at once
(Client-Experience + Owner-Ops, §8), a tool boundary reduces exposure, a stage needs bounded
workflow-local Mind/job state or loop, or long-horizon work needs scoped delegation. Such state is
ephemeral/bounded unless the governed Memory contract separately admits it. All execution still uses
the shared tenant-safe context, Spine authority, canonical verification, receipts/Rail, job,
evaluation, and cost-control path.

## Consultative questions (ask ≤4, infer the rest)
1. Outcome — what should be true after it runs?
2. Trigger — form/new-contact, inbound message, or schedule?
3. Segment — same play for all, or by client type?
4. Autonomy — draft-and-wait (default) or send-on-own for safe stuff?
Then propose a named design in plain English; build OFF on "yes".

## Starter recipes (coaching-generic, no finance)
1. **New-Lead Intake & Route** — form/webhook → brain segments (hot/warm/nurture) + drafts first touch → approve hot, auto-send warm, log. Single brain.
2. **Client Onboarding Concierge** — deal-won webhook → orchestrator runs first-14-days; 1 Client-Experience sub-agent for conversational intake.
3. **At-Risk / Going-Quiet Save Play** — daily schedule → score disengagement → draft re-engagement (always coach-approved). Single brain.
4. **90-Day Nurture Engine** — daily schedule "who's due" + content sub-agent personalizes each touch + comms tools + state-advance bridge.

The full default-template JSON lives in the research transcript; T1 (single brain), T2 (router + sub-agent), T3 (schedule nurture) become the fill-in-the-blank template library.
