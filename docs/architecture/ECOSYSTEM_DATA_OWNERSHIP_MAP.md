# Ecosystem Data Ownership Map

**Governing doctrine:** §199 — Ecosystem Boundaries + Data Sovereignty
**Status:** Ratified 2026-07-02 · **Owner:** Antonio Cook
**Purpose:** Single-source reference for **which ecosystem owns which authoritative fact.** Every migration and feature spec must answer *"which ecosystem owns this data?"* before it lands. If the answer isn't in this map, update the map first.

---

## Core principle

> **No two systems store the same authoritative fact.**
> Cross-ecosystem data flows through explicit integration points (webhooks, APIs, scheduled sync, user-mediated federation). **Never** through direct database access or unstructured duplication.

Caching is allowed; **ownership is not.** A cache must carry a staleness indicator and be re-derivable from the owning ecosystem.

---

## Ecosystems in scope

| Ecosystem | Role | Primary rails |
|---|---|---|
| **Paige Agent AI** | B2B multi-tenant platform (this codebase) | Supabase, Deno edge functions, n8n |
| **MMA (Mogul Maker Academy)** | Tenant + coaching business | Skool (community + billing), GHL (CRM + comms), Zapier |
| **LaunchPad** | Future coaching tenant archetype (fictional example) | TBD |
| **MMA OS** | Antonio's internal ops brain | Notion, n8n workflows, cross-project bridges |
| **MCC (Mogul Credit Company)** | Separate lane — credit repair ops | GHL legacy + Cowork brain |

---

## Ownership matrix

### Paige Agent AI **owns** (authoritative)

| Domain | Tables / surfaces | Notes |
|---|---|---|
| Multi-tenant CRM state | `tenants`, `tenant_members`, `tenant_features`, `contacts`, `deals`, `pipeline_stages`, `tasks`, `notifications` | Platform-level; tenant-scoped via RLS |
| Platform billing L1 (Tenant → Paige) | `platform_subscription_plans`, `platform_subscriptions`, `platform_invoices`, `platform_usage_events` | §197 |
| Tenant service billing L2 infra | `tenant_service_subscriptions`, `tenant_service_usage_events`, `tenant_products`, `tenant_prices` | Opt-in capability; not required |
| Pass-through metering L3 | `platform_metered_events`, `platform_metering_reconciliation` | Wholesale cost tracking (credit pulls, etc.) |
| Consumer direct L4 (2027) | `consumer_subscription_plans`, `consumer_subscriptions`, `consumer_invoices`, `consumer_waitlist` | Not yet live |
| Credit monitoring rails | `credit_accounts`, `credit_alerts`, `credit_inquiries`, `credit_report_uploads`, `credit_negative_items` | §194 monitoring-only |
| Funding readiness | `funding_readiness_scores`, `funding_applications`, `funding_matches`, `readiness_proposals` | Paige IP |
| Business credit profiles | `businesses`, `business_credit_reports`, `business_vendors`, `banking_relationships` | Tenant-scoped |
| Automation infrastructure | `stage_automation_rules`, `stage_automation_events`, `paige_workflow_registry`, `paige_subagents`, `paige_skills` | Vendor-neutral naming per §193 |
| Paige agent state | `paige_conversations`, `paige_pending_approvals`, `paige_audit_log`, `client_memory`, `chat_messages` | Compliance-critical audit trail |
| Legal + consent | `communications_consents`, `consent_events`, `legal_acceptances`, `tenant_legal_profile`, `platform_legal_profile` | |
| Support surface | `support_tickets`, `support_ticket_messages`, `feature_requests` | Platform support only |

### Paige **does NOT own** (must not store as authoritative)

| Domain | Owning ecosystem | Correct integration |
|---|---|---|
| MMA subscription tiers (Standard/Premium/VIP) | MMA (Skool) | Webhook in on tier change → cache w/ staleness flag |
| BTF one-off class purchases | MMA (Skool + Stripe) | API pull on demand |
| MMA community membership | MMA (Skool) | Webhook in on join/leave |
| MMA email/SMS comms history | MMA (GHL) | User-mediated (link out) — do not mirror threads |
| LaunchPad billing (hypothetical) | LaunchPad | Not applicable; Paige provides L2 infra if opted-in |
| Consumer credit bureau raw feeds | Data provider (Array, iSoftpull, etc.) | API pull; store only derived monitoring events |
| Individual class curriculum content | MMA Curriculum chat / Google Drive | API pull / user-mediated |

### Historical violations of §199 (to be resolved)

| Violation | Status | Resolution |
|---|---|---|
| `subscription_plans` (MMA-specific plans in Paige) | **Ship #2.6 queued** | Export → Freeze → Drop per §198 |
| `user_subscriptions` (MMA-specific member subs in Paige) | **Ship #2.6 queued** | Export → Freeze → Drop per §198 |

---

## Sanctioned integration patterns

Every cross-ecosystem link **must** use one of these four patterns. Anything else is a §199 violation.

### 1. Event-driven (webhooks) — preferred for state changes
- **When:** State transitions in the source ecosystem that Paige must react to (tier change, purchase, community join).
- **Direction:** Source ecosystem → Paige HTTPS endpoint.
- **Paige side:** `webhook_event_log`, `outbound_webhook_configs`, HMAC verification, idempotency key.
- **Example:** MMA Zapier → `n8n paige-tier-sync` → Paige `tenant_members.metadata.tier` (cached, marked with `synced_at`).

### 2. API pull (on-demand)
- **When:** Paige needs fresh data at read-time and staleness matters more than event ordering.
- **Direction:** Paige → source ecosystem REST/GraphQL API.
- **Paige side:** Edge function with connector/gateway credentials, cache with TTL.
- **Example:** Paige pulls Google Drive folder contents on-demand for MMA-Legacy-Archive audit.

### 3. Scheduled sync (reconciliation)
- **When:** Both ecosystems hold overlapping derived state and need to reconcile drift.
- **Direction:** Bidirectional or one-way batch.
- **Paige side:** `pg_cron` job → edge function → source API → diff → write cache.
- **Example:** Nightly reconciliation of Paige `platform_metered_events` against provider invoice records.

### 4. User-mediated (federation)
- **When:** The user themselves is the bridge (link out, deep link, OAuth handoff).
- **Direction:** Browser navigates from Paige to owning ecosystem.
- **Paige side:** Deep-link URL builder; no data stored.
- **Example:** "View comms history in GHL" opens GHL contact page in new tab. Paige never mirrors the thread.

---

## Anti-patterns (forbidden)

1. **Direct database access to another ecosystem's DB.** No shared Supabase credentials. No cross-project reads. No FDW.
2. **Unstructured duplication.** CSV dumps that get imported and then re-edited in Paige. If you can't point to the owning ecosystem, you own it — and if that ownership is wrong, fix the boundary before writing the row.
3. **"Just this once" mirror tables.** Legacy leakage always starts here. Ship #2.6 exists because of this.
4. **Authoritative writes to cached fields.** Cached fields are read-only in Paige. Mutations round-trip to the owning ecosystem.
5. **Skipping the ownership question in a migration description.** Every new table description must state which ecosystem owns the fact. Reviewers block otherwise.

---

## Migration checklist (§199 compliance gate)

Before any migration that adds a table or column, the description must answer:

1. **Which ecosystem owns this fact?**
2. **If Paige owns it:** Which of the domains above does it fall under? If none, propose adding a new row to the ownership matrix in the same PR.
3. **If another ecosystem owns it:** Which of the four sanctioned integration patterns applies? Where is the cache staleness indicator?
4. **Is there any existing table in Paige holding the same fact authoritatively?** If yes, this is a §199 conflict — resolve before landing.

Failing any of these = the migration doesn't land.

---

## Related doctrine

- **§116** — No individual customer names in code (archetype phrasing)
- **§188** — Tenant vs Platform Primitives
- **§189** — Tenant Feature Flag Gating
- **§193** — Vendor-Neutral Naming for Platform Primitives
- **§194** — Platform-Embedded Credit Monitoring, Never Credit Repair
- **§197** — Billing Layer Taxonomy (L1–L4)
- **§198** — Legacy Data Deprecation Protocol (Export → Check → Freeze → Drop)
- **§199** *(this document)* — Ecosystem Boundaries + Data Sovereignty
