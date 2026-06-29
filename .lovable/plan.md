## Goal
Antonio chose Option A and verified `notify.paigeagent.ai` in the shared Resend account. One API key (`RESEND_API_KEY`) now authenticates sends from both `notify.paigeagent.ai` (Paige scope) and `portal.mogulmakeracademy.com` (BTF/MMA scope). The split-key plumbing shipped yesterday is dead weight — collapse it.

What stays unchanged:
- `auth-email-hook` and `send-transactional-email` Edge Functions (already use single `RESEND_API_KEY` via the queue dispatcher — no edits)
- `SCOPE_SENDERS` / from-address routing by `product_scope` in `paige-mcp` (correct as-is)
- `email_send_log.sender_account` column (kept, but always populated as `mma_os_shared`)

## Changes — `supabase/functions/paige-mcp/index.ts`

1. Remove `RESEND_API_KEY_MMA` env read (line 30).
2. In `send_btf_template_email` (lines ~993–1004):
   - Delete split-key branch (`useMmaAccount`, fallback warning, dynamic `apiKey` selection).
   - Always use `RESEND_API_KEY`.
   - Set `const senderAccount = "mma_os_shared"` as a constant string for audit/log continuity.
3. Keep the `sender_account` field in:
   - Resend tag (line 1021)
   - `email_send_log` insert (lines 1040–1041)
   - `audit()` calls (lines 1028, 1044)
   All three now always log `"mma_os_shared"`.
4. Redeploy `paige-mcp`.

## Secret cleanup
- Delete the `RESEND_API_KEY_MMA` secret from Lovable Cloud (no longer referenced anywhere in code after the edit).

## Out of scope
- No DB migration. The `sender_account` column added yesterday stays; we just narrow its value domain.
- No changes to `auth-email-hook` (`notify.paigeagent.ai` sender), `send-transactional-email`, queue infra, or `process-email-queue`.
- No changes to `SCOPE_SENDERS` mapping or `from_override` parameter behavior.

## Verification
- `rg "RESEND_API_KEY_MMA"` returns zero hits after edit.
- `tsgo` clean.
- After redeploy, MMA OS Claude's smoke test on Paige auth signup confirms `notify.paigeagent.ai` send succeeds end-to-end.
