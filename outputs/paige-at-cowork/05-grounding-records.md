# Grounding Report 05 — Records discipline / Rail substrate (F05 + F06)

**Program:** PAIGE-at-Cowork-Level · **Phase:** 1 · **Flows:** F05 (named-agent + non-contact-tied Rail
attribution), F06 (Mind cites Rail as provenance) · **Date:** 2026-09-05 · **Base:** `b0af098`.
Repo citations = Explore scout; prod facts = **CC-verified** (Supabase MCP).

---

## Headline (reframes the handoff — and corrects the brain)
The repo did **NOT** widen `actor_type`. Specialist attribution was added as **separate columns**
(`actor_agent_slug`/`actor_agent_label`, PR #925) plus a **separate non-contact table** (`paige_workspace_events`,
PR #912/#939). **CC-verified: that entire schema is LIVE on prod** — which **overturns the brain's
`paige-spine-and-rail-state.md` claim that #925 was "not yet applied to production" (STALE — §BRAIN.3 drift to
fix).** But **0 rows use it**: 0 `capability_run` rows, 0 rows carrying `actor_agent_slug` on either table. The
gap is **wiring, not schema.**

## EXISTS
- **`paige_client_events` `actor_type` CHECK — 5 values, NEVER widened** (`20260712190000_…:57`):
  `('owner_staff','client','paige_agent','automation','external')`. `contact_id` is **NOT NULL** (`:54`) — by
  design; owner ruled 2026-09-02 no null-contact Rail event.
- **Specialist identity beside it** (`20261201000800_…`, #925): `actor_agent_slug`/`actor_agent_label` (no FK —
  write-time snapshot, no read-time join, because the DEFINER reader bypasses `paige_subagents` RLS and
  `paige_subagents.name` isn't tenant-safe). `record_rail_event` gained `p_actor_agent_slug DEFAULT NULL`.
  **CC-verified: column present on prod.**
- **`paige_workspace_events`** (non-contact-tied; #912 base + #925/#939 uplift): `tenant_id`, `source_kind`,
  `source_id`, `outcome`, `capability_key` (#939), RLS FORCE + service_role-only. `record_capability_run(uuid,
  uuid,text,text,uuid,text)` — **CC-verified live.** This is the home for work belonging to no client.
- **Read = DEFINER lenses only.** Direct SELECT on `paige_client_events` REVOKED from `authenticated`
  (**CC-verified: `has_table_privilege('authenticated',…,'SELECT')` = false**; #746 open). Lenses:
  `get_solo_rail_activity(int)` (unions both tables, 12-col contract incl. `actor_agent`),
  `get_client_rail(...)`, `get_platform_rail(...)` (operator, zero product callers),
  `get_pipeline_spine_evidence(...)` (the Mind's Rail lens).

## RAIL WRITERS TODAY
- **Correct (workspace-level `record_capability_run`):** n8n executor (`_shared/n8n-management.ts:145`), Zapier
  executor (`_shared/mcp-outcome.ts:851`). Connection families also write correctly.
- **Correct (contact-scoped `record_rail_event`) but NONE passes an agent slug (the F05 gap):**
  `mcp-outcome.ts:907`, `railAutomation.ts:103` (+5 callers), `growth-process-submission:519`,
  `handle-inbound-sms:434`, `paige-mcp:5397`, `send-message:1374`, `paige-ai-chat:895` & `:11315`.
- **SILENT (act but write no Rail row):** `deal_move_stage` (PAIGE's own pipeline tool) + `pipeline_attach`;
  **~47 of 62 classified actions** write only `paige_audit_log`, which no Solo surface reads.

## MIND (F06)
- **There is NO Mind store/table** (grep: no `paige_mind`/`mind_claim`/`rail_provenance`). Mind = a read-only
  projection with two disjoint faces:
  - (a) **chat-grounding** `_shared/paige-spine/mindEvidence.ts` — projects `pipeline.deal_stage_evidence`; the
    ONLY Mind path that cites the Rail (`citation = rail:<uuid>`). Only 1 of ~5 spine domains is Rail-backed.
  - (b) **UI** `src/solo/SoloMindWorkspace.tsx` — composes from 4 live hooks (knowledge/systems-check/command-
    center/n8n-readiness); **does NOT read the Rail**; provenance is free-text prose; truth enum
    `LIVE SOURCE|PARTIAL|UNAVAILABLE|PROPOSED`. No `rail_provenance_refs` anywhere.
- Abandoned prior attempt: PR #644 `get_solo_mind_rail_events()` — owner ruled it must be re-grounded first.

## BLOCKED-ON — the F05 owner ruling (narrower than the handoff framed it)
The code already implemented a **third option** for both halves, so the ruling is *ratify or override*:
- **Specialist naming:** widen `actor_type` (handoff's Option A) **contradicts the recorded rationale**
  (`20261201000800_…:12-36`: append-only Rail, DEFINER bypass, non-tenant-safe names). The merged design keeps
  5 values + `actor_agent_slug`. **Recommend: ratify the merged design.**
- **Non-contact events:** `contact_id` stays NOT NULL (owner-ruled); the sibling `paige_workspace_events`
  already exists. **Recommend: ratify.**
So the real owner decision: **ratify the merged design, or override toward a widened `actor_type`** (which
overrides the recorded reasoning).

## NEEDS-BUILDING (delta)
**F05:** (1) pass `p_actor_agent_slug`/`_agent_slug` on the writes — params exist, every caller omits them; each
executor must know which specialist acted (couples to F03). (2) Non-contact coverage per §37 producer inventory:
wire the ~47 silent actions + `deal_move_stage` + `pipeline_attach` to `record_capability_run`, each with its
`capability_key`.
**F06:** (1) Mind→Rail read contract — add a Rail-sourced records category to `SoloMindWorkspace` reading
`get_solo_rail_activity` (the chat-side spine Mind is the template). (2) `rail_provenance_refs` array on the Mind
claim shape (the spine projection proves the one-citation pattern). (3) an "unsourced" flag distinguishing
Rail-cited from prose-provenance claims (§13 honesty).

## OWNER / PROD QUESTIONS
1. **actor_type ruling:** ratify the merged design (5 values + `actor_agent_slug` + `paige_workspace_events`), or
   override to widen `actor_type` (overrides `20261201000800`'s rationale)? **Recommend ratify.**
2. **RESOLVED by CC prod check:** #925 + #939 are applied on prod (brain said #925 not applied — stale).

## PROD VERIFICATION LEDGER (CC-run, §13)
- `paige_client_events`: 9 rows; `actor_type` ∈ {`owner_staff`,`paige_agent`} only; `actor_agent_slug`
  populated = **0**; `authenticated` SELECT = **false** (#746 open).
- `paige_workspace_events`: 11 rows; `source_kind` ∈ {`mcp_connection`,`oauth_attempt`,`zapier_mcp_connection`}
  (all connection-family); `capability_run` rows = **0**; `actor_agent_slug` populated = **0**.
- Migrations `20261201000800` (#925), `20261212000000` (#939) **applied on prod**. `record_capability_run(uuid,
  uuid,text,text,uuid,text)` live. (Supabase MCP, 2026-09-05.)
- §BRAIN.3 FIX OWED: `docs/brain/paige-spine-and-rail-state.md` still says #925 "not yet applied to production" —
  correct it (it IS applied). Do this on the first program PR that touches the brain (same-commit, §BRAIN.3).
- OWED: §32.c live-drive that a named-agent action lands a Rail row with `actor_agent_slug` once wired.
