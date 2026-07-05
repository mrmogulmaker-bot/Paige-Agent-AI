# SPRINT P.S.M — Phase 1 (Pre-flight audit + secret verification)

Paige Supabase Migration — Lovable Cloud managed Supabase → BYO Supabase project.
Phase 1 is **safe / read-only**: inventory the source and verify the encryption-key
inventory before any data movement. Nothing here mutates production.

## Artifacts

| Artifact | What it is | How it runs |
|---|---|---|
| `SPRINT_PSM_PHASE_1_pre_migration_audit.sql` | Read-only inventory → one JSON blob | Paste into SOURCE Supabase SQL editor |
| `supabase/functions/extract-secret/index.ts` | Allowlisted, super_admin-only, hash-by-default secret **verifier** | Deploy on explicit §66 fire order; run once; **delete at Phase 1 exit** |

## §208 verification finding — encryption keys are mostly TABLE-resident

The at-rest encryption keys are **not** all Cloud env secrets. Most live as rows in
the `_internal_secrets` table, read by SECURITY DEFINER `pgp_sym_encrypt/decrypt`
functions (e.g. `qb_encrypt_token` reads `_internal_secrets.qb_token_key`;
`_automation_webhook_key()` reads `_internal_secrets.automation_webhook_key`).

**Consequence:** those keys migrate as **table data**. As long as `_internal_secrets`
is included in the Phase 2 export, QuickBooks + automation-webhook decryption works
on BYO with **no env-secret extraction**. The audit script lists its key names
(never values) so this dependency is explicit.

### `extract-secret` allowlist (env-only, at-rest, not table-recoverable)

| Key | Verdict | Reason |
|---|---|---|
| `CALENDAR_ENCRYPTION_KEY` | ✅ included | env-only (`_shared/calendarCrypto.ts`), no table fallback; encrypts Calendar OAuth tokens |
| `QUICKBOOKS_TOKEN_ENCRYPTION_KEY` | ✅ included | operator-confirmed live secret; verify env copy matches records |
| `SSN_ENCRYPTION_KEY` | ❌ excluded | real code ref (`paige-write-back:289`, `?? null`) but not provisioned as a live secret → would 500 |
| `AUTOMATION_WEBHOOK_ENCRYPTION_KEY` | ❌ excluded | runtime reads `_internal_secrets` table, not env → travels with data export |

## Security posture (locked)

- **Gate:** `is_super_admin()` (destructive-op class; mirrors `admin-drop-bucket`).
  NOT the broad `owner/super_admin/admin/developer` set.
- **Hash-by-default:** plaintext only on explicit `reveal:true`.
- **Audit fail-closed:** every invocation writes one `paige_audit_log` row
  (`action='extract_secret'`, `{secret_name, mode}`, no value). If the audit write
  fails, the secret is **not** returned.
- **Single-secret per call**, hard allowlist, missing-env returns `500 "secret not
  configured"` without echoing the name.

## Run procedure (pending §66 fire order + operator confirmations)

1. Deploy `extract-secret` to the source project (explicit fire order only).
2. For each allowlisted key: call in **hash mode**, compare `sha256` against the
   1Password copy.
3. Only if a hash mismatches: re-call with `reveal:true`, then rotate that key
   after cutover (the response warns to do so).
4. **Delete the `extract-secret` function** at Phase 1 exit.

## Open confirmations before run-mode

- [ ] Confirm `CALENDAR_ENCRYPTION_KEY` is present in Cloud → Secrets (code requires
      it as env; absence = calendar decryption already broken).
- [ ] Confirm `_internal_secrets` is on the Phase 2 export table list.
- [ ] Separate integrity check (not blocking): does encrypted SSN ciphertext exist
      that depends on the unset `SSN_ENCRYPTION_KEY`?
