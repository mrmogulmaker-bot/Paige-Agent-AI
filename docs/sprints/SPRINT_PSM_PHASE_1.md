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

### `_internal_secrets` key inventory (import ALL with `DO UPDATE`)

| Key | Class | Migration-seeded? |
|---|---|---|
| `platform_column_key` | **encryption (§190)** | `gen_random_bytes(32)` + **`DO NOTHING`** ⚠️ (`20260702022450`) — the specific silent-corruption trigger |
| `qb_token_key` | **encryption** (QB OAuth tokens) | runtime (seed / CSV) — must not be clobbered |
| `automation_webhook_key` | **encryption** (webhook URLs) | runtime (seed / CSV) — must not be clobbered |
| `meta_capi_access_token` | service token | `DO UPDATE` ✓ (`20260629000558/000629`) |
| `platform_stage_change_webhook_url` | config URL | `DO UPDATE` ✓ (`20260701174236`) |
| `service_role_key` / `supabase_service_role_key` / `readiness_scan_service_role_key` | service tokens | runtime / CSV |
| `supabase_functions_base_url` | config URL | runtime / CSV |

**Correction to earlier note:** only `platform_column_key` is a
`gen_random_bytes` + `DO NOTHING` seed. The other five `gen_random_bytes` sites in
the migration chain are per-row **column defaults** (`verification_code`, tenant
invite tokens, webhook tokens) — NOT keys, no `DO UPDATE` concern. The
**encryption-critical subset** (silent PII corruption if the wrong value lands) is
`platform_column_key`, `qb_token_key`, `automation_webhook_key`. Verify each of the
above is present in the Phase-2 export and imported with `DO UPDATE`.

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

## Phase-3 BYO destination (§66 ruling — LOCKED)

**Destination: existing project `xygzykjyynhzqytbqnzu`** ("Paige Agent AI", Mogul
Maker Academy org, `us-east-2`). Dormant since Sep 2025 with 12 empty legacy tables.
`create_project` is **skipped** — reuse this project slot.

**Do NOT use `slcqeiqcrhepicqxqjng` ("mma-os").** MMA OS is an independent live
microservice Paige talks to via `MMA_OS_LANGGRAPH_BRIDGE_KEY` / `MMA_OS_BRIDGE_API_KEY`
/ `MMA_OS_BRIDGE_URL`. Merging schemas would collapse the microservice boundary
(contact-centric vs tenant-centric) into a monolith. Keep isolated for blast-radius
separation.

**Deltas (accepted):** region source Europe (Ireland) → dest `us-east-2` (Ohio),
negligible for a US customer base; Postgres `17.6.1.016 → 17.6.1.021` intra-patch,
no compatibility concern.

### Phase-3 step 11 (revised) — pre-wipe then apply
1. Drop the 12 legacy empty tables on `xygzykjyynhzqytbqnzu` via a **wipe migration**
   (§66 fire order required): `public.profiles`, `public.businesses`,
   `public.disputes`, `public.letters`, `public.credit_accounts`,
   `public.vendor_offers`, `public.funding_offers`, `public.tasks`,
   `public.audit_logs`, `public.dispute_letters`, `public.orders`,
   `public.platform_api_keys`. (Verify each is empty at fire time — §208.)
2. Apply all `supabase/migrations/` in filename order.
3. Then Phase-3 Hard Rule #1 governs the `_internal_secrets` import.

## Side finding (discovered during P.S.M — NOT in scope, separate task)

**MMA OS (`slcqeiqcrhepicqxqjng`) has 22 tables with RLS disabled** per Supabase
advisory — including `contacts` (656 real people), `member_outcomes` (124),
`quality_check_runs` (719), `campaign_control`, `member_events`, `system_health`,
`agent_dispatches`, `agent_calls`, `btf_*`. Exposed to anon-key holders.

**Not P.S.M-blocking** — belongs to the MMA OS repo. **Do NOT auto-fix**: enabling
RLS without policies would break the app. Logged as its own task: *"MMA OS RLS enable
+ policy design — 22 tables currently exposed to anon."*

## PHASE-2 HARD RULE — `_internal_secrets` MUST be CSV-exported

> **MUST:** the `_internal_secrets` table **MUST** be included in the Phase-2 CSV
> export from Lovable Cloud, and imported to BYO with
> `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value` (Phase-3 Hard Rule #1).

This is the mechanism that preserves the three **table-resident encryption keys**
(`qb_token_key`, `automation_webhook_key`, `platform_column_key`) — plus every other
`_internal_secrets` key (full list under Hard Rule #1) — **entirely programmatically,
with zero human custody**. The operator never sees or holds any key value. If this
table is missed in the export, QuickBooks/automation decryption and §190 column
decryption break silently on BYO with no import-time error.

## PHASE-3 — `CALENDAR_ENCRYPTION_KEY` automated handoff (no human custody)

`CALENDAR_ENCRYPTION_KEY` is the one **env-only** encryption key (not table-resident),
so it is carried programmatically at Phase-3, never through personal storage:

1. Briefly **redeploy `extract-secret`** on the OLD Cloud project (`bfmyebsjyuoecmjskqhs`).
2. Invoke it with `{ "secret_name": "CALENDAR_ENCRYPTION_KEY", "reveal": true }`.
3. Pipe the returned value **directly** into BYO's secrets (Supabase MCP secret-write
   on `xygzykjyynhzqytbqnzu`) — value never surfaces to the operator or to chat.
4. **Delete `extract-secret` immediately** (same 60-min hard rule).
5. The invocation is logged in `paige_audit_log` on OLD Cloud for the compliance trail.

Whole cycle < 5 minutes, fully automated. Verification-via-1Password is **permanently
retired** — the operator is not a keystore; rotation is a post-revenue tech-hire concern.
