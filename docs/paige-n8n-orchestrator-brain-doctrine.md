# Paige → n8n: Orchestrator-Brain Authoring Doctrine

How Paige architects n8n automations for non-technical operators. Condensed into
the paige-ai-chat system prompt (BUILDING AUTOMATIONS block); full reference here
for the future template-library build (task #118).

## Node types Paige emits (verified live via n8n MCP get_node_types)

| Role | node `type` | `typeVersion` |
|---|---|---|
| Brain | `@n8n/n8n-nodes-langchain.agent` | 3.1 |
| Chat model (default) | `@n8n/n8n-nodes-langchain.lmChatAnthropic` | 1.5 (model `claude-sonnet-4-6`) |
| Memory | `@n8n/n8n-nodes-langchain.memoryBufferWindow` | 1.4 |
| Sub-workflow as tool | `@n8n/n8n-nodes-langchain.toolWorkflow` | 2.2 |
| Sub-agent as tool | `@n8n/n8n-nodes-langchain.agentTool` | 2.2 |
| Trigger — form | `n8n-nodes-base.formTrigger` | 2.6 |
| Trigger — webhook | `n8n-nodes-base.webhook` | 2.1 |
| Trigger — schedule | `n8n-nodes-base.scheduleTrigger` | 1.3 |
| Structured output | `@n8n/n8n-nodes-langchain.outputParserStructured` | 1.3 |
| Act/notify | `gmail` 2.2 · `telegram` 1.2 · `httpRequest` 4.4 · `if` 2.3 · `switch` 3.4 · `executeWorkflow` 1.3 |

## Structural invariants
1. Exactly one trigger → brain via `type:"main"`.
2. Brain = Agent node; always has `ai_languageModel`; add `ai_memory` when per-client/conversational; add `ai_outputParser` when it must route.
3. **AI sub-nodes connect IN REVERSE** — keyed by the sub-node's *name*, connection type `ai_languageModel`/`ai_memory`/`ai_tool`/`ai_outputParser`, pointing INTO the agent. Only trigger→brain→downstream use `main`.
4. Propose→confirm gate is mandatory: brain proposes, an approval branch exists for `needs_human_approval`.
5. Notify + Log are `executeWorkflow` calls to reusable per-tenant bridges (the §10 callable seam, §8 action bus), never hand-rolled.
6. Credentials are placeholders filled from `list_credentials` — never hardcoded.
7. `POST /api/v1/workflows` accepts only `{name, nodes, connections, settings}` — never send `active`/`tags`/`pinData`. Created inactive; name ends `[DRAFT]`; activation is a separate gated step.

## Single-brain vs sub-agents
Default one brain (give it tools, not more brains). Add a sub-agent (`agentTool`/`toolWorkflow`) only when: distinct expertise/persona needed · two audiences at once (Client-Experience + Owner-Ops, §8) · >~6-8 tools on one agent · a stage needs its own memory/loop · long-horizon 90-day (orchestrator decides "who's due today", content sub-agent personalizes each touch).

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
