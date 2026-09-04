# Solo orchestration and contact import — implementation candidate

This continues the owner-authorized MVP from production A2P repair #916. It does not claim a completed provider round trip or completed CRM migration.

## Implemented path

PAIGE exposes domain-owned tools through the canonical stored-argument approval gate. Activation records the actual claimed approval reference, provisions a tenant-owned Intake and Lifecycle Orchestrator and workflow registry entry, and captures exact fixed inputs, workflow/version, connection generation, agent configuration and run limit. Delegation creates linked Action Bus and workflow-run records with a tenant/process idempotency key.

The existing action worker claims one operational job before normal drafting. It invokes the existing Orchestrator's service-only job action. The n8n adapter derives all provider authority from the persisted run and acquires the existing encrypted connection's credential lease. It checks the pinned workflow version before persisting dispatch intent, executes through the shared OAuth transport, and reconciles a returned execution identity on later ticks. An uncertain dispatch never automatically executes again. Cancellation does not claim to undo an external effect. Version-unproven execution remains unknown.

Legacy dispatch routes exclude these managed runs; database guards also refuse attempts to send a managed registry through legacy producers. Scoped workspace events record durable job outcomes without fabricating a contact. The Integrations surface displays real process and job status, and PAIGE can inspect the same safe projection. Browser workspace switching resets the surface while previously approved background work remains bound to its original tenant.

## Contact import

Solo People opens a file-based import review. The server parses actual CSV, loads only the current tenant's identities and source records, stages provenance and custom fields, and returns mappings/counts/decisions. The owner selects an immutable batch. The public preparation endpoint has no commit operation; PAIGE's canonical approved call performs the atomic import.

Selected create values must match the staged fields. Existing contacts can be retained without overwrite, and batch receipt replay avoids duplicate writes. Source identity includes tenant, source system, source account and external ID. Denials are preserved; historical grants do not override current suppression. New imported contacts have communication holds. Importing does not send, enroll or create a campaign.

The current owner UI handles clean creates and explicit skips. Duplicate merging and lifecycle/owner mapping resolution are incomplete. Related histories and program/custom fields remain sourced provenance until a verified source contract maps them into appropriate records. No real MMA export has been supplied in this task.

## Evidence

- A2P #916 separately merged/deployed at `fc8d92922b6b51911d5c9cb8314266f8f178b384`; read-only production role refusal passed. Carrier registration remains UNAVAILABLE.
- Import parsing, handler boundaries, canonical adapter, UI, n8n transport and job tests pass in targeted local suites.
- Local PostgreSQL import tests cover tenant/role refusal, immutable selection, consent, rollback and concurrent replay.
- Local PostgreSQL orchestration tests cover repeated migration application, tenant fences, exclusive claims, cancellation, ambiguous dispatch, generation revocation and revocation during lock waits. Independent reviewer reran them and passed.
- SQL tests use explicit minimal auth/crypto fixtures. They do not substitute for complete deployed-schema compatibility or provider proof.
- Actual Chromium component rendering was checked at 1536×770, 1366×768, 1024×768 and 900×1000 for import initial/mapping states. This is isolated component evidence, not authenticated Solo production evidence.

## Remaining release/mission proof

Full-schema migration preview, final CI, deployed owner interactions, actual n8n PAIGE round trip, tenant switch/revocation against the real provider, and safe sourced completion in PAIGE remain required. Browser CUA could not initialize on this host; isolated Chromium works but has no authenticated owner session.

Actual Skool/Zapier payloads and owning workflow inventory remain unavailable. No traffic is switched, no legacy workflow is retired, and Dispute Fox remains excluded from MMA. Source-driven background intake enqueue and dynamic approved lifecycle policy are not implemented by the fixed-input job path. Provider A2P filing/status reconciliation remains absent; no SMS readiness claim is made. Email remains owner-proven live, without new delivery claims from this work.

## Next workspace activation

Each workspace supplies its own connection consent, approved workflow/version and effects, confirmed source payload, process limits and owner authority. CRM migration additionally needs a source export and selected batch. Sender identities and consent sources remain workspace-owned. No MMA records, configuration, credentials, workflow permissions or state are inherited.
