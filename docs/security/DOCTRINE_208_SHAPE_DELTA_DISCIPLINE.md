# Doctrine §208 — Shape Delta Discipline

**Status:** Active
**Codified:** Sprint P.0.1 Gate 1.2 (alongside Migration A.2)
**Related:** §120 (Canonical Enums), §180 (SECURITY DEFINER Hardening), §206 (Layer Discriminator)

---

## Rule

**Pre-migration state must be verified, not asserted.** Every gate proposal that modifies an existing table MUST include the actual `\d table_name` (or equivalent `information_schema.columns` query) output from the current database — not a reconstructed, remembered, or abstract shape.

## Requirements

Every migration PR that alters an existing table MUST include:

1. **Verified current state.** Actual `\d <table>` output from the live DB, captured within the same working session as the migration proposal. No paraphrasing. No reconstruction from memory or from older migration files.

2. **Explicit delta.** A line-by-line enumeration of what changes:
   - Columns added (with type, nullability, default, FK)
   - Columns dropped
   - Columns renamed (old → new)
   - Constraints added (name + definition)
   - Constraints dropped (name)
   - Indexes added/dropped
   - Triggers added/dropped
   - RLS policies added/dropped/modified
   - Grants added/dropped

3. **Reviewer gate.** Reviewers MUST NOT approve a table-modifying migration without verifying the current-state artifact. If the delta references a column that doesn't exist in the verified state, the proposal is rejected until reconciled.

## Rationale

Silent shape drift is the root pattern behind the C8 and C9 audit findings from `PLATFORM_SEPARATION_AUDIT_2026-07-02.md`:
- **C8** happened because `platform_metered_events.tenant_id` was NOT NULL and nobody noticed until Layer 4 design forced the collision.
- **C9** happened because 17 sites kept writing to `user_subscriptions` after `consumer_subscriptions` was declared canonical — the shape drift was tolerated across ships.

Both are §120-class incidents: three sources of truth (DB, code, mental model) diverged silently. §208 forces the DB truth to lead every migration conversation.

## Enforcement

- **PR template:** the `docs/PULL_REQUEST_TEMPLATE.md` migration checklist requires a "Verified current state" section with `\d` output pasted verbatim.
- **Gate proposals:** every "Gate N shape proposal" message in Sprint P.0.1 and future sprints must include the current-state artifact before the proposed shape.
- **Reviewer challenge:** if a reviewer receives a shape proposal without verified current state, the correct response is: "§208 — paste actual `\d` first."

## Anti-patterns (do not do)

- Proposing a migration based on a `CREATE TABLE` statement from an older migration file. Migrations stack; the file is not the state.
- Referencing "the shape I remember" or "what we shipped in Ship #X."
- Assuming column names/types match what a related table has.
- Skipping the delta because "it's just adding a column" — the delta must still be explicit, even if trivial.

## Precedent case (why we codified this)

Sprint P.0.1 Gate 1 (Migration A) proposal referenced a mental model of `platform_metered_events` that included `unit_amount_cents`, `resource_id`, `invoice_id`, `stripe_usage_record_id`, `idempotency_key UNIQUE`, `updated_at` — none of which existed on that table. Those fields lived on `platform_metered_events_dead_letter`. The mental model was a conflation of two adjacent tables from Ship #2.5.

Gate 1 shipped clean only because the executing agent ran `information_schema.columns` before drafting the migration and worked from the verified shape. Post-ship reconciliation surfaced the drift. §208 institutionalizes what saved that ship.

## Companion doctrines

- **§120** — canonical source-of-truth alignment across DB/MCP/UI.
- **§180** — SECURITY DEFINER catalog is the audit trail for function shape.
- **§206** — layer discriminator adds shape constraints that make future drift fail loudly.
