# Paige Document Production — Phase 2 Plan

> **Status:** PLANNING ONLY. No capability registration, chat-tool registry, worker, UI, or
> production behavior is added by this document. Platform Reach is rebuilding the capability kit;
> the coordinator holds the registry relay until that plan lands.
>
> **Dependency:** `paige_durable_work` is `SUBSTRATE PROVEN`, not a live durability capability.
> Local single-claim concurrency is proven. Disconnect/resume, persisted apply, and authenticated
> owner readback must be proven before document production may ship as durable.

## 1. Corrected current state: extend, do not replace

Document production is not absent. It is synchronous and trapped inside one chat turn:

- `paige-ai-chat` already exposes `document_generate`. The model places the complete document in
  tool arguments as structured design blocks, and the same request validates and saves it.
- `marketing_content` with `kind='document'` is the canonical artifact row. Its body stores
  `{ docType, title, blocks }`; it remains the document home.
- `studio_artifact_versions` is the existing append-only revision lineage for session-bound
  documents. It remains the revision home where a Studio session exists.
- `export-document` renders the saved artifact to PDF, DOCX, PPTX, or Markdown and already emits a
  `document_export` Rail outcome.
- `PaigeArtifactCard` and `DocumentPreview` are the existing open/preview surfaces. They remain the
  renderer and artifact handoff.
- `paige_chat_turns.bundle_ref` is the existing persisted projection for cards reconstructed after
  reload. Live `paige_artifact` frames are not durable today.

The missing capability is therefore: accept a bounded document brief, attach it to one durable
work identity, author outside the interactive request, safely persist or revise the existing
artifact, and project its state back into the originating thread after disconnect.

The observed production `400 Invalid input format` remains undiagnosed until the owner-supplied
response body names the rejected field. This plan does not relabel it as a size or timeout defect.

## 2. Single-Spine attachment map

| Layer | Planned attachment |
|---|---|
| Spine | Proposed capability key `documents.author`; registration and final key require the coordinator-held Platform Reach relay. No lane-local registry edit. |
| Rails | `record_capability_run` on submit, every resumed execution invocation, and terminal/`outcome_unknown` settlement; correlate by durable work id and server idempotency key. Existing `document_export` receipts remain. |
| Harness | `paige_durable_work` plus the existing durable-job mechanism, model router, `save_marketing_content`, Studio versioning, and `export-document`. No second scheduler, lease system, or artifact store. |
| Agent access | Evolve `document_generate` into bounded submit semantics; add status/cancel only through the capability-kit/registry relay. Names and schemas remain provisional until that relay returns. |
| Mind | Completed or blocked safe summary only through existing projections. No document body, source text, prompts, or provider payload becomes Mind state. |
| Memory | No raw document persistence. Existing tenant-relative memory may retain an owner-approved preference only through its current governed path; this capability adds no memory writer. |
| Tenant knowledge | Tenant-resolved templates, brand facts, and approved business facts may ground the brief. All retrieval remains tenant-relative and untrusted content never becomes instruction. |

Tenant and user identity are resolved server-side at acceptance and revalidated at each execution
step. Client-passed tenant, actor, role, approval, or scope data is context only, never authority.

## 3. Owner flow

1. **Ask.** The owner asks Paige for an agreement, proposal, SOP, report, or revision.
2. **Resolve specifics.** Paige uses existing tenant knowledge and asks only for material missing
   facts. She does not submit placeholders such as `[CLIENT NAME]`, `[DATE]`, or `[AMOUNT]`.
3. **Accept once.** The server validates a compact document brief, resolves tenant/user/thread and
   creates or resumes one durable work row from the client intent id. Chat immediately receives a
   persisted work reference rather than waiting for the document body.
4. **Show progress.** A work card reconstructed from `paige_chat_turns.bundle_ref` reads the safe
   status projection. Disconnecting the browser does not cancel or orphan server work.
5. **Claim once.** The existing orchestration runner claims through the canonical transition RPC.
   A competing worker fails closed. No model call begins before claim ownership is established.
6. **Author.** The worker calls the existing model router with the compact brief and bounded tenant
   context. Generated blocks are treated as candidate data and validated by the existing block and
   placeholder guards before persistence.
7. **Persist and verify.** Create or guarded-revise the canonical `marketing_content` document,
   append existing version lineage where applicable, read it back, and only then settle the work as
   `succeeded` with `verified_readback=true` and identifiers—not raw content—in terminal outcome.
8. **Return the artifact.** Persist a safe artifact reference into the originating turn bundle.
   Connected clients may also receive a live frame, but correctness never depends on that frame.
9. **Revise.** A revision is a new work identity targeting the existing document and an expected
   version. It updates the same artifact lineage; it never creates a hidden parallel document.
10. **Export or send.** Export continues through `export-document`. Sending, publishing, signing,
    or sharing is a separate consequential capability and never follows implicitly from authoring.

## 4. Proposed bounded tool contract

The current tool makes the interactive model author every block inside a potentially enormous tool
argument. That is the wrong boundary for durable execution. Preserve the user-facing intent and
artifact format, but move authoring behind the work envelope.

### Submit (`document_generate`, evolved through the relay)

Inputs are a bounded brief: client intent id, document type, title or goal, audience, purpose,
required facts, tenant-approved source references, optional existing `content_id` plus expected
version for revision, optional export format, and originating thread. It does **not** accept the
full generated block array from chat.

Returns immediately: work id, `claimed`/`blocked` safe state, whether an existing intent resumed,
and a safe summary. It does not return the document body.

### Status (provisional name `document_work_status`)

Observe-only. Reads the allowlisted durable-work projection plus an artifact reference only after
verified persistence. It never exposes authority context, idempotency key, prompt, raw model output,
or cross-tenant existence.

### Cancel (provisional name `document_work_cancel`)

Server-authorized internal state transition. It can prevent undispatched work or request cooperative
cancellation of a claimed authoring step. It cannot claim that an already-dispatched provider call
was stopped; an ambiguous interrupted effect becomes `outcome_unknown` and reconciles.

Final capability keys, tool names, risk class, schemas, and registration files are owned by the
Platform Reach relay. This lane will adapt this contract to that kit instead of pre-building a
parallel runtime.

## 5. Artifact and revision rules

- `marketing_content` remains the canonical document store; no `paige_documents` table is added.
- Raw blocks never live in `paige_durable_work`, Mind, Rail payloads, or chat status summaries.
- A terminal work outcome may hold only identifiers, hashes, counts, format, and
  `verified_readback=true`.
- Revision must use an expected-version compare-and-set or equivalent row lock. Two simultaneous
  revisions cannot silently overwrite each other; one wins and the other becomes `blocked` with a
  named version conflict requiring owner resolution.
- Existing `studio_artifact_versions` remains the version home for Studio-bound documents. The
  implementation must decide, with evidence, how non-Studio chat documents receive equivalent
  lineage without creating a competing universal artifact store.
- Export failure does not erase a successfully authored document. Authoring may succeed while an
  optional export records its own failed or `outcome_unknown` receipt.

## 6. Approval and legal-content boundary

Authoring a private in-workspace draft is reversible internal work. It does not authorize sending,
publishing, signing, filing, or presenting the document as legal advice. Each later consequential
step redeems its own current exact-call approval immediately before dispatch.

If such approval expires before dispatch, the same work becomes nonterminal `blocked` with
`approval_expired`. The stored authority snapshot is audit evidence, never permission. If dispatch
already occurred and the result is ambiguous, the state is `outcome_unknown`, followed by
reconciliation before retry.

For legal agreements, governing-law language is not evidence that the document is legally adequate.
Until governed research is available, Paige may use an owner-approved template or create an
explicit attorney-review draft from owner-provided facts. She must not invent current statutory
requirements or imply counsel reviewed it.

## 7. Failure and resume semantics

| Condition | State and owner-visible meaning |
|---|---|
| Required fact missing | `blocked`; names the missing owner input |
| Approval required but expired before dispatch | `blocked / approval_expired`; fresh approval resumes the same work id |
| Worker loses lease before provider dispatch | `expired`; reconcile claim state, then safely reclaim |
| Provider may have produced output but receipt/persistence is uncertain | `outcome_unknown`; reconcile by work id/hash before retry |
| Deterministic validation/provider failure within ceiling | retry same work id while attempts remain; terminal `failed` only at the declared ceiling |
| Artifact persisted and exact tenant-scoped readback matches | `succeeded`; return the existing artifact card |
| Owner cancels before effect | `cancelled`; no artifact-success claim |

Retry from the chat UI always carries the original client intent id. It resumes or reports the same
work; it never silently submits four new generations for one owner intent.

## 8. Acceptance evidence before shipping

1. Capability-kit and registry relay accepted; no parallel registration path.
2. Full migration replay and persisted `db-live` evidence for the envelope and document additions.
3. Two-worker claim proof remains green in CI/local evidence.
4. Disconnect browser after acceptance; worker completes; reload reconstructs the same work and
   artifact card from persisted thread/work state.
5. Four retries with one intent produce one work id, one provider dispatch, one artifact lineage,
   and one terminal receipt.
6. Concurrent revision race produces one committed revision and one visible version conflict—no
   lost update.
7. Cross-tenant work, thread, artifact, revision, status, and export reads fail closed.
8. Every invocation emits `record_capability_run`; terminal success is impossible without verified
   artifact readback.
9. Authenticated owner proof covers create, progress, disconnect, resume, revise, export, cancel,
   retry, abandonment, account switch, and unavailable/error states.
10. The captured production `400` field is diagnosed and regression-tested directly; no telemetry
    work is added unless that evidence remains insufficient.

## 9. Deliberately deferred pending Platform Reach

- Spine registration and final capability key.
- Chat-tool registry edits and capability-kit adapter shape.
- Worker entrypoint/dispatch attachment to the existing orchestration runner.
- Final tool names, risk classes, and cancellation semantics exposed to Paige.

Those are coordination dependencies, not permission to invent a second runtime. Planning can
continue; implementation of these surfaces waits for the coordinator relay.
