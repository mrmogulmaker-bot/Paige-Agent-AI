# Voice/Chat-Driven CRM Ingestion via MCP

Goal: any teammate (coach, broker, sales, admin) connects their own LLM (Claude Desktop, ChatGPT, voice client) to Paige MCP and **dictates or uploads client data** — credit scores, bureau pulls, banking, income, notes — and Paige writes it into the correct client record with **verification, hallucination guards, and full audit**. Every tenant gets these capabilities (except master-only tools already gated by §118).

## 1. New MCP tools (Batch #3 — "Field Ops Ingestion")

All tenant-scoped, all reversible, all logged to `paige_audit_log`. All require `actor_role IN ('coach','broker','sales','admin','owner')` and `can_access_contact(actor, client_id)`.

| Tool | Purpose |
|---|---|
| `propose_client_update` | Stage a write (any field on `clients`, `businesses`, `client_memory`). Returns a `proposal_id` + diff. **Does NOT write yet.** |
| `confirm_client_update` | Commit a staged proposal after the actor (or Paige) re-reads it back. |
| `ingest_credit_scores` | Structured: `{ client_id, bureau, score, source, pulled_on }`. Validates 300–850, bureau ∈ {TU,EX,EQ}, source ∈ {soft_pull, hard_pull, client_self_reported, report_upload, monitoring_service}. Confidence flag required. |
| `ingest_bureau_report` | Accepts a parsed JSON payload (from external LLM that read a PDF) + a hash of the original file. Stages into `credit_report_uploads` with `extraction_source='external_llm'` and `requires_review=true`. |
| `ingest_banking_snapshot` | Balance, avg daily balance, NSFs, deposits — staged into `manual_banking_entries`. |
| `ingest_income_or_revenue` | Personal income or business revenue with period + source. |
| `append_client_note` | Free-form coach note → `client_memory` with `category` + `confidence`. |
| `attach_client_document` | Client-supplied doc metadata (url or base64) → `documents` table, scoped to tenant storage. |
| `search_clients_fuzzy` | Voice-friendly: "the client named Marcus from Atlanta" → ranked matches with disambiguation prompt. |

## 2. Hallucination & accuracy guards

Built into every ingestion tool:

1. **Two-phase commit** — `propose_*` returns a structured diff; `confirm_*` commits. Paige (or the connected LLM) is system-prompted to read back the diff verbatim to the human before confirming.
2. **Schema validation** — Zod on the edge function. Bureau scores 300–850, dates ISO, enums locked, currency numeric.
3. **Source provenance** — every write stamps `source` (`voice`, `chat`, `external_llm`, `pdf_upload`), `actor_id`, `actor_role`, `confidence` (`high|medium|low`), and `external_llm_model` when applicable.
4. **Conflict detection** — if a new score contradicts a stored score from the last 30 days by >40 points, the proposal is marked `needs_review` and routed to `paige_pending_approvals` instead of auto-committing.
5. **Fuzzy contact match guard** — if `search_clients_fuzzy` returns >1 match above threshold, ingestion tools refuse to commit and force disambiguation.
6. **PDF/report cross-check** — for `ingest_bureau_report`, the staged payload is re-validated against required fields (bureau, pull date, score, at least one tradeline). Missing fields → rejected with a checklist back to the LLM.
7. **Audit trail** — every proposal + confirmation logged to `paige_audit_log` with the raw tool args and the resulting row IDs. Coaches can see "who said what" forever.

## 3. Multi-tenant enforcement

- All new tools resolve `tenant_id` from the API key → `platform_api_keys` (already in place).
- `clients.tenant_id` filter applied to every read/write.
- Role-filtering in `tools/list`: master-only ingestion variants (e.g. cross-tenant merges) stay hidden from non-MMA tenants per §118.
- Storage uploads land in tenant-scoped buckets (`tenant-<id>/clients/<client_id>/...`).
- Rate limit per actor per tenant via `api_rate_limits` (default 60 writes/min).

## 4. Pending Approvals inbox surface

`/admin/approvals` already exists. We extend it with a new tab **"Field Ingestion"** that lists every proposal marked `needs_review` (large-delta scores, low-confidence PDF extractions, duplicate-match risk). Admin can approve, edit, or reject — rejection writes back to the audit log and notifies the originating coach.

## 5. Voice-first UX nudges (system-prompt level)

We ship a short **"Paige Field Agent" system prompt** in the MCP `prompts/list` capability that any connected LLM (Claude Desktop, ChatGPT custom GPT, voice client) loads automatically. It enforces:
- Always call `search_clients_fuzzy` before any ingestion tool
- Always read the proposed diff back to the human before calling `confirm_*`
- Always ask for the bureau + pull source when a score is dictated
- Never invent tradelines from a PDF — only extract what's literally on the page
- Stamp `confidence='low'` on any verbal "I think it was around…" input

## 6. Schema additions (one migration)

```sql
CREATE TABLE public.paige_ingestion_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  actor_role text NOT NULL,
  client_id uuid,
  tool_name text NOT NULL,
  payload jsonb NOT NULL,
  diff jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','rejected','expired','needs_review')),
  confidence text CHECK (confidence IN ('high','medium','low')),
  source text NOT NULL,
  external_llm_model text,
  review_reason text,
  created_at timestamptz DEFAULT now(),
  decided_at timestamptz,
  decided_by uuid,
  expires_at timestamptz DEFAULT now() + interval '30 minutes'
);
-- + GRANTs, RLS scoped to tenant + actor, has_role admin override.
```

Plus columns added to `client_memory` and `credit_report_uploads`: `ingestion_proposal_id`, `external_llm_model`, `confidence`.

## 7. Build order

1. Migration: `paige_ingestion_proposals` + GRANTs + RLS + new columns.
2. `_shared/ingestion-guards.ts` (validation, conflict detection, fuzzy match).
3. `paige-mcp`: register 9 new tools, all going through proposal → confirm flow.
4. Redeploy `paige-mcp` (per stale-bundle doctrine).
5. Approvals UI: add **Field Ingestion** tab to `/admin/approvals`.
6. Publish `paige-field-agent` system prompt via MCP `prompts/list`.
7. Smoke test: from Claude Desktop, dictate "Marcus's TransUnion is 520 from a soft pull today" → confirm → row lands in `client_memory` + `credit_factor_scores` snapshot.

## 8. Out of scope this round (flagged for next)

- Direct PDF-to-Paige extraction (we accept LLM-parsed JSON for now; native parser is a separate workstream).
- Voice transcription hosting (we rely on the user's existing voice client → LLM → MCP).
- Cross-tenant merges / consolidations (master-only, separate spec).

## Timeline

~1 working session for the migration + tools + UI tab + redeploy + smoke test.
