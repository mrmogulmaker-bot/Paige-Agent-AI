# Doctrine §203 — Product Lane Separation Runtime Enforcement

**Status:** Codified 2026-07-02 with Sprint P.0.

## Rule
The **Legal & Compliance Reviewer** sub-agent (`supabase/functions/subagent-compliance`) is the runtime gate for CROA / FCRA / FDCPA / GLBA-adjacent content. Every choke point that composes or dispatches customer-facing content must invoke it and honor its verdict.

**Admin cannot override a `blocked` verdict.** Only doctrine amendment can unblock a pattern.

## Choke Points (must invoke compliance reviewer)

| # | Surface | Action type sent to reviewer | Status |
|---|---|---|---|
| 1 | `subagent-email-composer` | `email` | wired (Sprint P.0) |
| 2 | `send-transactional-email` | `email` | already scans via `assertNoDisputeFields` |
| 3 | `admin_propose_paige_actions` (Ship #3.6) | derived by action type | wired (Sprint P.0) |
| 4 | `paige-mcp` outbound tools (create_contact_note, send_message) | context-derived | wired (Sprint P.0) |
| 5 | `subagent-coach-copilot`, `subagent-content-drafter` | `email`/`other` | wired (Sprint P.0) |
| 6 | `dispatch-stage-automation` outbound | `email` | already gated by rule verdicts |

## Reviewer Contract
Input: `{ contact_id?, action_type, draft_text, channel }`
Output: `{ verdict: 'approved'|'needs_human_approval'|'blocked', findings[], requires_approval }`

## §203 × §202 Interaction
When a contact has a `mcc_client` (CROA lane) or `coreconnect_*` (Disputera lane) relationship, the reviewer treats all outbound content as CROA-scoped by default — even when the composing tenant is Paige/PME/MMA.

## Failure Mode
Reviewer 5xx or timeout > 8s → **fail closed** (return 503 to caller). Loud failures over silent fallthrough (§200).
