# SPRINT P.S.M — Phase 1 (Pre-flight audit + secret verification)

Paige Supabase Migration — Lovable Cloud managed Supabase → BYO Supabase project.
Phase 1 is **safe / read-only**: inventory the source and verify the encryption-key
inventory before any data movement. Nothing here mutates production.

## Artifacts

| Artifact | What it is | How it runs |
|---|---|---|
| `SPRINT_PSM_PHASE_1_pre_migration_audit.sql` | Read-only inventory → one JSON blob | Paste into SOURCE Supabase SQL editor |
| `supabase/functions/extract-secret/index.ts` | Allowlisted, super_admin-only, hash-by-default secret **verifier** | Deploy on explicit §66 fire order; run once; **delete at Phase 1 exit** |

## Mixed encryption architecture (CANONICAL — §208 verified)

Paige has **two distinct at-rest encryption architectures**. This is canonical for
all migration planning:

**Architecture B — table-resident keys (the majority).** Every DB-side
`pgp_sym_encrypt/decrypt` call takes its key from `SELECT value FROM
_internal_secrets`, **never from `Deno.env` at the call site**. Verified sites:

| Key material | Consumed by | Key source |
|---|---|---|
| `qb_token_key` | `qb_encrypt_token` / `qb_decrypt_token` (mig `20260420201025`) | `_internal_secrets` |
| `automation_webhook_key` | `_automation_webhook_key()` (mig `20260701144912`) | `_internal_secrets` |
| `platform_column_key` (§190) | `platform_encrypt` / `platform_decrypt` (mig `20260702022450`) | `_internal_secrets` — **generated in-DB by `gen_random_bytes(32)`; NO env var exists** |

For these, the env vars are **seed/provenance only** and may be rotated freely on
BYO. Decryption depends solely on the `_internal_secrets` **table** migrating intact.
No two-layer KEK exists (table values are stored plaintext, not env-wrapped).

**Architecture "env-direct" — `CALENDAR_ENCRYPTION_KEY` (lone exception).**
`_shared/calendarCrypto.ts` reads `Deno.env.get("CALENDAR_ENCRYPTION_KEY")` directly
→ SHA-256 → AES-GCM (edge-side WebCrypto). No table involved.

> ### ⚠️ `CALENDAR_ENCRYPTION_KEY` IS THE ONLY ENV VAR THAT MUST SURVIVE MIGRATION FOR DATA INTEGRITY.
> Every other extracted env var is **verification-only**. If `CALENDAR_ENCRYPTION_KEY`
> is not carried to BYO, calendar OAuth tokens become permanently undecryptable.
> Do not let this fact get lost.

## PHASE-3 HARD RULE #1 — `_internal_secrets` import MUST use `ON CONFLICT DO UPDATE`

> **MUST:** when importing the `_internal_secrets` table into BYO, the load
> **MUST** be:
> ```sql
> INSERT INTO public._internal_secrets (key, value) VALUES (...)
> ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
> ```
> **NOT `ON CONFLICT DO NOTHING`.**

**Why (cite):** migration `20260702022450` seeds `platform_column_key` with
`INSERT ... gen_random_bytes(32) ... ON CONFLICT DO NOTHING`. On a fresh BYO rebuild
the migrations run **before** the data import and mint a **brand-new random**
`platform_column_key`. If the CSV import then uses `DO NOTHING`, the migration's
random key **wins** and every §190-encrypted column (plus `qb_token_key`,
`automation_webhook_key`) becomes **permanently undecryptable** — a silent PII
decryption failure with no error at import time. `DO UPDATE` forces the source
values to overwrite the migration-generated ones. This applies to all
`_internal_secrets` rows.

### `extract-secret` allowlist (env-only, at-rest, not table-recoverable)

| Key | Verdict | Reason |
|---|---|---|
| `CALENDAR_ENCRYPTION_KEY` | ✅ included | env-only (`_shared/calendarCrypto.ts`), no table fallback; encrypts Calendar OAuth tokens |
| `AUTOMATION_WEBHOOK_ENCRYPTION_KEY` | ✅ included | live secret (Cowork survey); seeds `_internal_secrets.automation_webhook_key` (table-resident at runtime). Verify env copy |
| `QUICKBOOKS_TOKEN_ENCRYPTION_KEY` | ✅ included | live secret; provenance of `_internal_secrets.qb_token_key` (table-resident at runtime). Verify env copy |
| `SSN_ENCRYPTION_KEY` | ❌ excluded | real code ref (`paige-write-back:289`, `?? null`) but not provisioned as a live secret → would 500 |

> The two table-resident keys (`AUTOMATION_WEBHOOK_*`, `QUICKBOOKS_TOKEN_*`) decrypt on BYO via the migrated `_internal_secrets` table, **not** these env vars. The verifier only confirms the operator's saved copies match live.

## Security posture (locked)

- **Gate:** `is_super_admin()` (destructive-op class; mirrors `admin-drop-bucket`).
  NOT the broad `owner/super_admin/admin/developer` set.
- **Hash-by-default:** plaintext only on explicit `reveal:true`.
- **Audit fail-closed:** every invocation writes one `paige_audit_log` row
  (`action='extract_secret'`, `{secret_name, mode}`, no value). If the audit write
  fails, the secret is **not** returned.
- **Single-secret per call**, hard allowlist, missing-env returns `500 "secret not
  configured"` without echoing the name.

## Deploy path — Path B (Lovable), approved

The source project `bfmyebsjyuoecmjskqhs` lives in **Lovable's Supabase org**, not
the operator's personal org, so the Supabase MCP token cannot deploy to it and CLI
(`supabase functions deploy --project-ref`) auth is unconfirmed. **Path B** is the
approved route: deploy `extract-secret` via Lovable (MCP `send_message` / Lovable UI).
Caveat: Lovable deploys from its synced default branch, so this lands `extract-secret`
in `main` (round-tripping to GitHub `main`) **outside PR #1** — accepted for a
one-shot tool that is deleted immediately after run-mode.

> ### 🔴 MANDATORY TEARDOWN — delete `extract-secret` from Lovable Cloud within **60 minutes** of a successful hash-verify.
> A secret-reading endpoint must not linger as an attack surface even for hours.
> Set a timer at deploy; deletion is a Phase-1 exit gate.

## Run procedure (pending §66 fire order + operator confirmations)

1. Deploy `extract-secret` via **Path B** (explicit fire order only).
2. For each allowlisted key: call in **hash mode**, compare `sha256` against the
   1Password copy.
3. Only if a hash mismatches: re-call with `reveal:true`, then rotate that key
   after cutover (the response warns to do so).
4. **Delete the `extract-secret` function within 60 minutes** of successful
   verify — mandatory teardown (see above).

## Open confirmations before run-mode

- [x] `CALENDAR_ENCRYPTION_KEY` confirmed live in Cloud → Secrets (dated 2026-06-30).
- [ ] Confirm `_internal_secrets` is on the Phase 2 export table list (Phase-3 Hard
      Rule #1 governs its import).
- [ ] Separate integrity check (not blocking): does encrypted SSN ciphertext exist
      that depends on the unset `SSN_ENCRYPTION_KEY`?
