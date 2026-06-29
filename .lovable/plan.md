## Goal
Stop sending BTF customer emails from `hello@notify.paigeagent.ai`. Route them through the verified MMA-branded sender `alerts@portal.mogulmakeracademy.com`, and make the from-address per-product_scope so LaunchPad and future scopes follow the same pattern.

## File to change
`supabase/functions/paige-mcp/index.ts` — `send_btf_template_email` tool (~lines 923–1004).

## Changes

### 1. Scope → sender map (module-level const)
```ts
const SCOPE_SENDERS: Record<string, { from: string; name: string; reply_to: string }> = {
  btf: {
    from: "alerts@portal.mogulmakeracademy.com",
    name: "Mogul Maker Academy",
    reply_to: "coach@mogulmakeracademy.com",
  },
  mma: {
    from: "alerts@portal.mogulmakeracademy.com",
    name: "Mogul Maker Academy",
    reply_to: "coach@mogulmakeracademy.com",
  },
  // launchpad: filled in when that subdomain is verified
  paige: {
    from: "hello@notify.paigeagent.ai",
    name: "Paige",
    reply_to: "support@paigeagent.ai",
  },
};
const DEFAULT_SCOPE_SENDER = SCOPE_SENDERS.btf;
```

### 2. New optional input
Add `from_override` to the Zod schema:
```ts
from_override: z.string().email().optional()
  .describe("Full from address (e.g. 'alerts@portal.mogulmakeracademy.com'). Must be a domain verified in Resend. Overrides product_scope default."),
```
Update `description` to: "Look up an email_templates row by template_key, render {{vars}}, and send via Resend. From-address is auto-selected by the template's product_scope (BTF/MMA → portal.mogulmakeracademy.com; Paige internal → notify.paigeagent.ai). Override with `from_override` for one-off sends."

### 3. Resolve from-address inside handler
Replace the current `fromName` / `fromAddr` block:
```ts
const scopeCfg = SCOPE_SENDERS[tpl.product_scope] ?? DEFAULT_SCOPE_SENDER;
const fromName = args.from_name ?? scopeCfg.name;
const fromEmail = args.from_override ?? scopeCfg.from;
const fromAddr = `${fromName} <${fromEmail}>`;
const replyTo = args.reply_to ?? scopeCfg.reply_to;
```
Use `replyTo` in the Resend body instead of the hardcoded value.

### 4. Audit + log enrichment
Include `from: fromEmail` in both the success and failure `audit(...)` calls and in `email_send_log.metadata`, so we can see per-product routing in the audit trail.

## Out of scope
- No DB migration. `email_templates.product_scope` already exists.
- No Option A. We are not verifying `notify.paigeagent.ai` in MMA's Resend account; Paige-internal scope keeps using its own verified sender as today.
- No changes to other MCP tools or the standalone `send-transactional-email` edge function.

## Deploy
After the edit, redeploy only `paige-mcp`.

## Verification
1. `list_email_templates` → pick a `btf_education_*` key.
2. `send_btf_template_email` to mrmogulmaker@gmail.com with no `from_override` → Resend accepts, message arrives From "Mogul Maker Academy &lt;alerts@portal.mogulmakeracademy.com&gt;".
3. Repeat with `from_override: "hello@notify.paigeagent.ai"` and a Paige-scope template → arrives from Paige sender.
4. Check `paige_audit_log` row contains `from` field.
