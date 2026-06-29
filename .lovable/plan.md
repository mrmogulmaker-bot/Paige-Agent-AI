
# Approvals Hub v2

Today `/admin/approvals` is a thin inbox: AI drafts on one tab, field-ingest proposals on the other. The table already supports `assigned_to_user_id`, `visible_to_roles`, `tenant_id`, `contact_id`, `metadata` — those columns are barely used. This plan turns Approvals into the central "human-in-the-loop" surface for the whole platform and exposes it on the MCP so external LLMs (Claude Desktop, ChatGPT, voice) participate in the same review queue.

## Goals
1. Every action that touches compliance, money, contracts, or client data flows through one Approvals queue.
2. Each approval is **always** tied to a client (when one exists), with full context one click away.
3. Reviewers see what's theirs — by role, by assignment, by tenant.
4. MCP exposes approvals so Claude/ChatGPT can list, claim, approve, reject, comment.

---

## 1. Schema additions (single migration)

Add to `paige_pending_approvals`:
- `category` text — one of: `ai_draft`, `field_ingest`, `compliance`, `legal`, `financial`, `dispute_letter`, `campaign`, `contract`, `refund`, `tier_change`, `workflow_action`, `other`
- `priority` smallint default 3 — 1 critical → 5 low; drives sort and SLA color
- `sla_due_at` timestamptz — auto-set by trigger from category (legal 4h, refund 2h, ai_draft 24h, default 48h)
- `risk_level` text — `low | medium | high | blocker`
- `requires_role` app_role — minimum role allowed to approve (e.g. `admin` for refunds, `coach` for drafts)
- `summary` text — one-line human summary, populated by submitter or AI
- `source` text — `paige_ai`, `mcp:<client_name>`, `n8n:<workflow_key>`, `manual`, `system`
- `decision_rationale` text — required on reject/escalate, optional on approve
- Comments table: `paige_approval_comments(id, approval_id, author_id, body, created_at)` for back-and-forth between reviewer and submitter

New view: `paige_approval_queue_v` joining contact name/email/lifecycle, assignee name, tenant name, age, sla status.

GRANT + RLS: authenticated read scoped to tenant + (assigned_to_user_id = auth.uid() OR role in visible_to_roles OR is_admin). Comments inherit approval's tenant scope.

## 2. Approval Policy Engine

New table `paige_approval_policies` (tenant-scoped) defining rules:
- trigger pattern (category + optional filter, e.g. `category=refund AND amount>500`)
- `requires_role`, `auto_assign_to` (role or specific user), `sla_minutes`, `risk_level`
- `auto_approve_if` — JSON predicate (e.g. drafts under 200 chars from trusted workflow)

Seed with sane defaults for Mogul Maker Academy tenant:
- Refunds → admin, 2h SLA, high risk
- Dispute letters → compliance role, 4h SLA, blocker
- Campaign sends >100 recipients → admin, 8h SLA
- AI drafts (CS) → coach, 24h SLA, low
- Field-ingest with confidence <0.7 → coach, 4h SLA

A small edge function `evaluate-approval-policy` runs on insert (DB trigger calls `pg_net` → function, or inline plpgsql for simple rules). Sets `requires_role`, `assigned_to_user_id`, `sla_due_at`, `priority`.

## 3. UI overhaul — `ApprovalsInbox.tsx`

Replace the 2-tab layout with a **categorized hub**:

```text
┌─ KPI Strip ─────────────────────────────────────────┐
│ 7 Open · 2 Overdue · 1 Critical · Avg age 3h        │
└─────────────────────────────────────────────────────┘
┌─ Filters ──────────────────────────────────────────┐
│ [All] [Mine] [My Team] [Unassigned]                │
│ Category ▾  Priority ▾  Risk ▾  Client ▾  Search ▾ │
└─────────────────────────────────────────────────────┘
┌─ Queue (grouped by category, sortable)              │
│  🔴 LEGAL · Dispute letter for Sarah K · 1h overdue │
│  🟡 REFUND · $850 refund — A. Cook to approve       │
│  🟢 AI DRAFT · CS reply to lead #284                │
└─────────────────────────────────────────────────────┘
```

- Each row links to client profile (if `contact_id`), shows assignee avatar, SLA badge (green/amber/red), bulk select.
- Right-rail drawer for quick approve/reject without leaving the list.

Update `ApprovalDetail.tsx`:
- Add **Client context card** (lifecycle stage, FICO snapshot, last touch) when `contact_id` set, pulled from existing `contact_readiness_rollup` + `paige_conversations`.
- Add **Comments thread** (uses new `paige_approval_comments`).
- Add **Policy chip** ("Routed to you because: refund > $500").
- Add **Assign** dropdown (reassign to another teammate).
- Keep existing send/skip/escalate, add **Request changes** (sends back to submitter with comment, status `changes_requested`).

## 4. Cross-platform wiring (the "hardwire to rest of platform")

Replace ad-hoc approval creation with one helper `createApproval()` in `src/lib/approvals.ts` and `_shared/createApproval.ts` (edge). Migrate these existing flows to use it:
- `dispute-letter-generator` edge fn → submits as `dispute_letter`
- Campaign send in `CampaignsAdmin` >100 recipients → `campaign`
- Stripe refund flow → `refund`
- Tier change writes to `tier_state` from non-admin → `tier_change`
- BTF document acceptance for legal docs → `contract`
- Manual coach-initiated dispute → `compliance`

Add an **"Approvals" badge in `AdminLayout`** sidebar with live count via existing `usePendingApprovals` hook (extend to count by role).

Add an "Approvals" tile on each client profile (`ContactDetail.tsx`) showing open approvals tied to that client — closes the loop the user called out.

## 5. MCP exposure (new tools in `paige-mcp`)

Add 6 reversible tools, role-gated, tenant-scoped:
- `list_approvals(status?, category?, mine_only?, contact_id?)`
- `get_approval(id)` — returns approval + comments + client snapshot
- `claim_approval(id)` — sets `assigned_to_user_id = caller`
- `approve_approval(id, rationale?)` — only if caller has `requires_role`
- `reject_approval(id, rationale)` — rationale required
- `comment_on_approval(id, body)`

Tool registration honors the existing `requires_role` / tenant filter pattern in `paige-mcp`. Update `tools/list` filter so non-admins don't see `approve_approval` for refund category etc. (handled at execution time via policy check, advertised in description).

This lets Antonio say in Claude Desktop: *"Show me my open approvals over 4 hours old"*, then *"Approve the Sarah K dispute letter with note: 'cleared with compliance'."* All gets audited.

## 6. Improvement ideas worth flagging (for follow-up turns)
- **Approval templates** — pre-canned rationales ("Approved — within policy" / "Rejected — out of scope") to speed review.
- **Slack/Telegram bridge** — push critical approvals to Antonio's Telegram via existing bot, with inline approve/reject buttons.
- **Auto-summarize on submit** — call AI Gateway to write `summary` field when submitter leaves blank.
- **Learning loop** — track approve/reject rates per workflow; auto-promote consistently-approved patterns to `auto_approve_if`.
- **Voice approvals** — pipe approve/reject into the existing VoiceSessionModal so Antonio can clear the queue hands-free.
- **Weekly digest** — Monday email to each tenant admin: "12 approved, 3 rejected, 1 still open from last week."

## 7. Build order
1. Schema + policy engine + seed defaults (1 migration)
2. `createApproval()` shared helper + migrate dispute/campaign/refund/tier flows
3. New `ApprovalsInbox.tsx` with KPI strip, filters, grouped queue
4. Enhanced `ApprovalDetail.tsx` with client card + comments + assign
5. Client profile "Open approvals" tile
6. MCP tools (6) + redeploy `paige-mcp`
7. Sidebar badge + Telegram bridge stub (optional)

## 8. Questions before I build
- **Roles & SLA defaults** — confirm: refunds=admin/2h, dispute letters=coach+compliance/4h, campaign sends=admin/8h, AI drafts=coach/24h. OK as starting policy, or different?
- **Comments visibility** — should comments be visible to the original submitter (e.g. n8n workflow → no human submitter, fine), or strictly internal among reviewers?
- **MCP scope** — start with the 6 reversible tools above, or also expose `bulk_approve` / `set_policy` from day one?
- **Telegram inline approve** — build now as part of this pass, or queue for a follow-up?
