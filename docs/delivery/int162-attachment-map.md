# INT-162 (Agreements UI lane) — attachment map

Filed under the coordinator's single-spine standing rule (2026-09-23). Every claim below was
verified against the tree at `1594a95e`, not recalled. Where a layer is unattached this says so
plainly rather than reasoning its way to "not applicable" — that judgement is the coordinator's.

## Verdict first

**This capability does not route through the spine, and it writes no Rail. That is a defect, and
part of it is mine.** It is reported here rather than justified.

## Layer by layer

### Spine — NOT ATTACHED

- The seam: `supabase/functions/_shared/paige-spine/governedExecution.ts` (`decideGovernedExecution`
  at :464) and the capability registry `.../paige-spine/registry.ts` (`PAIGE_SPINE_CAPABILITIES`
  at :28).
- Every caller of `decideGovernedExecution`: `crm-command`, `_shared/paige-write-back/governed-adapter.ts`,
  `_shared/social-provider/governance.ts`, `_shared/paige-orchestration/approve-executor.ts`,
  `paige-native-event-dispatch`. **No agreements file appears.**
- `supabase/functions/_shared/paige-spine/domains/agreement.ts` does not exist. `registry.ts:24`
  carries a comment describing what *would* register; the registration itself is absent.
- What it routes through instead: its own `SECURITY DEFINER` RPCs, its own triggers, its own
  service-role edge functions, `_shared/agreements/*`.

### Rails / receipts — NOT ATTACHED

- The seam: `record_capability_run` → `public.paige_workspace_events`
  (`supabase/migrations/20261212000000_paige_can_show_her_work.sql`), client helper
  `supabase/functions/_shared/capability-record.ts`, which 29 other edge files import.
- Grepped `record_capability_run|paige_workspace_events|capability-record|record_rail_event|paige_audit_log`
  across all five agreements migrations, all four agreement edge functions and
  `_shared/agreements/**` — **zero hits. No Rail or receipt row exists for any agreement act.**
- What exists instead: `paige_agreement_events`
  (`supabase/migrations/20270401000000_agreements_engine_records.sql:251`), a genuinely append-only
  trail — `enforce_agreement_events_append_only` at :566, BEFORE UPDATE OR DELETE trigger at :580,
  no-truncate trigger at :587, RLS at :620, `seq` identity at :278. It is the feature's OWN trail,
  standing **instead of** a platform Rail write, not beside one.
- Screen 5 reads it at `src/solo/useSoloAgreementSignings.ts:487`.

### Agent access in the harness — NOT ATTACHED, and this is the sharpest one

No agreement capability is invocable by an agent. Measured across every registry that exists:

| Registry | Agreement entries |
|---|---|
| `PAIGE_SPINE_CAPABILITIES` (`paige-spine/registry.ts:28`) | none |
| `RISK` array (`_shared/action-risk.ts`) | none |
| Chat handler (`paige-ai-chat/index.ts`) | none — `case "agreement` → 0 hits |
| `scripts/ci/chat-tool-baseline.txt` | 0 |
| `tenant_tool_autonomy` catalogue | none |
| `paige_action_kinds` | none |
| MCP (`paige-mcp/index.ts`) | only `list_signed_agreements`, which reads the unrelated legacy `paige_signed_agreements` onboarding table |

The cause is recorded in-tree at `_shared/action-risk.ts:249-267`: `capability-kit-lint` reports
`direct-risk-entry` for any new `RISK` symbol and forbids expanding its shrink-only baseline, while
its own stated remedy — `defineCapability()` — throws when the key is absent from that same array.
A new mutating Paige tool can therefore be neither classified nor declared. That blocker is
INT-003's, and it blocks **every** new mutating tool, not only these.

**What is mine in that:** the UI lane shipped five screens whose every act — create, send, retrieve
the sealed copy, attach an offer — is reachable only by a human clicking. §10 requires a callable
seam. I did not flag its absence while building, and an orphaned comment at
`paige-ai-chat/index.ts:7725-7727` still describes an agreement confirm-card that no longer exists.

### Tenant and user resolution — ATTACHED, and verified

- **Reads:** `useTenantContext().activeTenantId` scopes every query; the hook tracks the workspace
  the form was opened in (`useSoloAgreementSignings.ts:288-297`) and refuses on a mid-edit switch.
- **Writes:** `_expected_tenant_id` is passed from the opened-form tenant (`:453`, `:457`) and is
  **refusal-only** server-side — it can abort, never select. Stated at
  `20270401000000_agreements_engine_records.sql:736-739`; enforced in each RPC by
  `_actor := auth.uid()` + `_tenant := current_user_tenant_id()`, then a mismatch raise
  (`save_paige_agreement` :760-775, `paige_agreement_overview` :53-58,
  `issue_agreement_signing_link` :97-110, `add_agreement_signer` :139-150).
- **The anonymous signer:** tenant is derived from the token row, never from a parameter —
  `peek_agreement_signing` (`20270404000000:214`, redefined `20270407000000:51`).
- **`agreement-send`** re-derives per request: caller-JWT client → `auth.getUser()` (:52) →
  `current_user_tenant_id()` (:56) → `is_tenant_admin` (:65), with every later query `.eq("tenant_id", …)`.
- **Backstop:** RLS is `is_platform_owner() OR tenant_id = current_user_tenant_id()` (:632-661), and
  because the writers are service-role, integrity is triggers (`enforce_agreement_tenant_links` :294,
  `enforce_agreement_signer_tenant` :340, `enforce_agreement_event_scope` :371).
- Note for the record: `is_platform_operator()` has **no SQL definition anywhere**; the operator
  predicate actually used is `is_platform_owner()`.

### Mind · second brain · memory · tenant-relative knowledge — UNATTACHED; QUESTION, NOT A RULING

Surfaces that exist and are untouched by this feature (grepped `paige_prompt_memory|paige_owner_memory|client_memory|knowledge_base|embedding|kb_search`
across every agreements migration, edge function and `_shared/agreements/**` — zero hits):
`paige_prompt_memory`, `paige_owner_memory`, `client_memory`, `knowledge_base`,
`chat_message_embeddings`, `kb_*`.

The second brain **docs** do carry the feature (`docs/brain/codebase-map.md:230`,
`docs/brain/decision-log.md:5-9`).

Per the standing rule this lane does not rule these inapplicable. The open questions are in the
next section.

## Questions for the coordinator — brought as questions, not conclusions

1. **Should a signed agreement write the platform Rail** (`record_capability_run` →
   `paige_workspace_events`) in addition to `paige_agreement_events`, or is a feature-owned
   append-only trail the intended shape for a legal record? These are two audit systems for one
   feature, which is what the rule exists to prevent — but collapsing them is not the UI lane's call.
2. **Should a completed agreement become tenant-relative knowledge or memory** — retrievable by
   Paige when she is asked what a client agreed to? Nothing writes there today.
3. **Is the INT-003 capability-kit deadlock being resolved**, and is agreement tool registration
   sequenced behind it? Until it lifts, no agreement act can be agent-invocable, and the UI lane
   cannot fix that from here.
4. **Does the UI lane owe a Spine capability** for the reads it performs, or is a tenant-scoped
   PostgREST read through RLS the accepted pattern for a surface read?

## What this lane can do without a ruling

Remove the orphaned confirm-card comment at `paige-ai-chat/index.ts:7725-7727`, which describes a
capability that is not there. Everything else above needs a decision that is not mine.
