# Multi-Tenant Knowledge Base + Central Telemetry

Three-tier RAG architecture: each tenant owns a private KB, inherits the Mogul global canon, and can optionally contribute docs back. Central telemetry collects **metadata only** — never document content — so MMA gets product intelligence without becoming the data custodian for tenant-private material.

## Tiers

```text
┌─────────────────────────────────────────────┐
│  Tier 1: GLOBAL CANON (Mogul-authored)      │  ← existing knowledge_base table
│  Inherited by every tenant, read-only       │
└─────────────────────────────────────────────┘
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌──────────────────┐   ┌──────────────────┐
│ Tier 2: TENANT A │   │ Tier 2: TENANT B │   ← new tenant_knowledge_docs
│  Private KB      │   │  Private KB      │     (RLS tenant-scoped)
│  RLS isolated    │   │  RLS isolated    │
└──────────────────┘   └──────────────────┘
        │                       │
        │ (opt-in "Contribute   │
        │  to Network" flag)    │
        ▼                       ▼
┌─────────────────────────────────────────────┐
│  Tier 3: NETWORK CANDIDATES                 │  ← review queue, admin promotes
│  Shared docs awaiting Mogul review          │     into Tier 1
└─────────────────────────────────────────────┘

        ── parallel, metadata-only ──
┌─────────────────────────────────────────────┐
│  CENTRAL TELEMETRY (kb_telemetry_*)         │  ← MMA-only, zero doc content
│  Query patterns, gaps, coverage, feedback   │
└─────────────────────────────────────────────┘
```

## What changes

### 1. New tables (migration)

- **`tenant_knowledge_docs`** — per-tenant source docs
  - `tenant_id`, `title`, `content`, `summary`, `category`, `tags[]`
  - `source` (upload | url | paste | sync)
  - `share_to_network` boolean (opt-in contribution flag)
  - `network_review_status` (none | pending | approved | rejected)
  - `created_by`, timestamps
- **`tenant_knowledge_chunks`** — embedded chunks (RAG retrieval)
  - `tenant_id`, `doc_id`, `chunk_index`, `content`, `embedding vector(3072)`, `token_count`
  - HNSW index on embedding (cosine)
- **`kb_query_telemetry`** — every Paige KB retrieval, metadata only
  - `tenant_id`, `query_hash` (sha256, not raw text), `query_intent_tags[]`, `result_count`, `top_similarity`, `had_global_match`, `had_tenant_match`, `feedback` (helpful | not_helpful | null), `created_at`
- **`kb_coverage_signal`** — daily roll-up per tenant
  - `tenant_id`, `topic_cluster`, `doc_count`, `query_count`, `unanswered_count`, `date`

All four scoped with RLS: tenants see only their own rows; platform owner sees aggregate views.

### 2. Embedding pipeline (edge function)

- `kb-ingest-doc` — chunks doc (~1000 chars, 150 overlap), embeds via `google/gemini-embedding-001` (3072-dim), inserts chunks scoped to `tenant_id`.
- `kb-search` — embeds query, retrieves top-K from **(global_canon ∪ tenant_chunks)**, logs metadata-only telemetry row, returns merged ranked results to Paige.
- `kb-promote-to-network` — admin-only; moves an approved tenant doc into `knowledge_base` (global canon) with attribution.

### 3. UI

- **Tenant admin → Knowledge Base** (new page under `/admin/knowledge`): upload, paste URL/text, manage own docs, toggle "Contribute to Network" per doc, see retrieval stats for their own corpus.
- **Platform owner → Network Insights** (new page under `/admin/network-kb`): aggregate dashboards — top queries across tenants, coverage gaps, pending contributions queue, promote/reject controls.

### 4. Paige integration

- `paige-ai-chat` retrieval call switches from current single-source RAG to merged tenant+global lookup. Telemetry write is fire-and-forget.

## Compliance posture

- Tenant doc content **never** leaves the tenant boundary unless `share_to_network=true` AND admin approval.
- Telemetry stores `query_hash` + intent tags only — no raw queries, no doc text, no PII.
- Updates `@security-memory` documenting the boundary.

## Out of scope this pass

- Per-doc ACLs inside a tenant (everyone in the tenant sees all tenant docs for v1).
- File uploads beyond text/markdown/PDF (image OCR comes later).
- Re-embedding existing `rag_documents` (different table, different purpose — left as-is).
- Tenant-to-tenant sharing (always routes through Tier 3 review).

## Build order

1. Migration: 4 tables + RLS + GRANTs + indexes.
2. Edge functions: `kb-ingest-doc`, `kb-search`, `kb-promote-to-network`.
3. Tenant KB admin UI.
4. Wire `paige-ai-chat` to merged retrieval.
5. Network Insights dashboard for platform owner.
6. Security memory update.
