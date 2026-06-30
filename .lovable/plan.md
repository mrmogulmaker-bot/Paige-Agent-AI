# Reverse-Engineer-Problem Agent

A specialist sub-agent that takes a client's stated problem, picks the right decomposition framework, and returns a structured root-cause map tied to Paige's existing skills/workflows. Paige core auto-delegates when she detects a problem statement.

## 1. The sub-agent: `paige-problem-reverse-engineer`

- **Runtime:** `local` (per Doctrine §124 — needs MCP tool access to look up contact context, journey stage, recent communications, and existing skills).
- **Stored in:** `paige_subagents` table, status `active`, owned by MMA tenant.
- **Model:** `google/gemini-3-flash-preview`.
- **Allowed MCP tools:** `get_contact`, `list_communication_log`, `list_journey_stages`, `list_skills`, `list_workflow_runs`. Read-only. No mutations.
- **stopWhen:** `stepCountIs(50)`.

### Hybrid framework picker (built into system prompt)

Agent classifies the problem first, then applies the matching framework:

| Problem signal | Framework | Why |
|---|---|---|
| Single recurring failure ("X keeps happening") | **5-Whys** | Linear causal chain |
| Multi-factor / "everything is broken" | **Fishbone (Ishikawa)** | Categorizes into People / Process / Tools / Money / Time / External |
| Strategic / opportunity-shaped ("how do I grow X") | **MECE tree** | Mutually exclusive, collectively exhaustive branches |
| Funding/credit blocker | **Fishbone, Money branch first** | Domain-specific lens |
| Unclear / mixed | **Fishbone → escalate** to 5-Whys on the heaviest branch |

### Output contract (structured)

```json
{
  "framework_used": "5-whys | fishbone | mece",
  "problem_restated": "...",
  "root_causes": [{ "cause": "...", "evidence": "...", "confidence": 0.0-1.0 }],
  "recommended_actions": [
    { "action": "...", "paige_skill_or_workflow": "skill_name|null", "owner": "client|coach|paige", "priority": "now|soon|later" }
  ],
  "open_questions": ["..."],
  "escalate_to_human": false
}
```

## 2. Paige core auto-delegation

Add a lightweight intent detector to the main Paige chat edge function (already streams via AI SDK). Two-layer:

1. **Cheap regex pre-filter** on user message: `/\b(problem|stuck|can.?t|won.?t|keeps|broken|failing|why (is|isn.?t|won.?t|can.?t)|help me figure out|not working)\b/i`.
2. **Model-side tool exposure:** register `delegate_to_problem_reverse_engineer` as a tool on Paige core. When the regex matches OR the model decides, it calls the sub-agent and streams the structured result back inline as a collapsible "Root-Cause Analysis" card.

User experience: feels like Paige is thinking more carefully when you describe a problem — no extra clicks.

## 3. Implementation order

1. Migration: insert the sub-agent row into `paige_subagents` (system prompt + allowed_tools + framework rules baked in).
2. Edge function: extend `paige-mcp` with `invoke_problem_reverse_engineer` tool (wraps the sub-agent runtime).
3. Paige core chat function: add regex pre-filter + `delegate_to_problem_reverse_engineer` tool registration.
4. UI: add a `RootCauseCard` component that renders the structured output (framework badge, cause list, action checklist).
5. Audit: every invocation logged to `paige_subagent_invocations` (table already exists).

## 4. Files touched

- `supabase/functions/paige-mcp/index.ts` — add `invoke_problem_reverse_engineer` tool + scope entry.
- `supabase/functions/<paige-chat>/index.ts` — add intent detector + delegation tool. (Will confirm exact filename on implementation.)
- `src/components/chat/RootCauseCard.tsx` — new component.
- One migration — seed the sub-agent row.

## 5. Open question

Should the Root-Cause card be **auto-expanded** in chat (visible immediately, more in-your-face) or **collapsed by default** with a one-line summary the user clicks to expand (cleaner)? Default I'd ship: collapsed with summary line — but tell me which you want.
