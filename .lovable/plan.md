
# Tenant Storefront + Email Identity

## What we learned about your invite
Both invites you sent today (`firssterlingcapital@gmail.com`, `tonigivalli@gmail.com`) **were sent successfully**, then **bounced back from Gmail as "invalid mailbox."** The first one almost certainly has a typo (`firss` vs `first`). They're now on the suppression list — once you confirm the right spellings I'll clear them and resend. So nothing was broken in the send path; the addresses themselves don't exist.

That said, the From-address is still hardcoded to MMA's domain, which is the deeper issue you flagged. Fixing that is Part 3 below.

---

## Part 1 — Lock BTF to MMA tenant

1. Add `features jsonb` column to `tenants` (e.g. `{ "btf_enabled": true }`).
2. Backfill MMA tenant with `btf_enabled: true`; everyone else `false`.
3. Add `useTenantFeature('btf_enabled')` hook.
4. Hide BTF nav items, `/onboard`, `/workspace/*`, "Start Onboarding" button, "Resend BTF Invite" button when the active tenant doesn't have the flag.
5. Edge functions (`invite-btf-client`, `paige-mcp` BTF tools) reject calls from tenants without the flag.

## Part 2 — Tenant Offers & Products

### Schema
- `tenant_stripe_accounts` — stripe_account_id, charges_enabled, payouts_enabled, country, onboarded_at
- `tenant_products` — tenant_id, name, slug, description, image_url, type (`one_time` | `recurring` | `productized_service` | `lead_magnet`), status (`draft` | `active` | `archived`), stripe_product_id
- `tenant_prices` — product_id, amount_cents, currency, interval (`null` | `month` | `year`), stripe_price_id, is_default
- `tenant_checkout_sessions` — product_id, stripe_session_id, customer_email, contact_id, status, amount_cents
- All tenant-scoped with `stamp_tenant_id` trigger + restrictive RLS

### Edge functions
- `stripe-connect-onboard` — kicks off Stripe Connect OAuth, returns onboarding link
- `stripe-connect-return` — handles return URL, syncs account status
- `create-checkout-session` — public endpoint, takes `product_slug` + email, creates Stripe session on the tenant's connected account (with optional 2% application fee)
- `stripe-connect-webhook` — listens for `checkout.session.completed`, creates contact + writes order, fires workflow

### UI
- `/admin/products` — list view with Create, Edit, Archive
- New Product wizard:
  - Step 1: Type (one-time / subscription / productized service / lead magnet)
  - Step 2: Details (name, description, image, slug)
  - Step 3: Pricing (amount, currency, interval if recurring) — skipped for lead-magnet
  - Step 4: Workflow trigger (which n8n workflow runs on purchase, e.g. send welcome email, assign coach)
  - Step 5: Publish — generates public checkout link `https://paigeagent.ai/buy/{tenant-slug}/{product-slug}`
- Public `/buy/:tenantSlug/:productSlug` page — tenant-branded, mobile-first, single CTA
- `/admin/settings → Payments tab` — Connect/Disconnect Stripe, account status, last 10 orders

### Lead-magnet flow
- Free products skip Stripe entirely
- Public page collects email → creates contact → fires workflow → shows download/thank-you

## Part 3 — Per-tenant email sender (Lead Connector model)

### Default behavior (zero setup)
- All tenants send from `notify.paigeagent.ai` 
- From-name = tenant's display name (`{tenant.brand.from_name} <notify@paigeagent.ai>`)
- Reply-To = `tenant.brand.support_email` (already on `tenants` table)
- All invite/onboarding/workflow emails route through this

### Custom domain (opt-in upgrade)
- New table `tenant_email_domains` — domain, status (`pending` | `verified` | `failed`), spf_token, dkim_tokens, created_at, verified_at
- `/admin/settings → Email tab`:
  - Step 1: Enter domain (e.g. `mail.acme.com`)
  - Step 2: System generates DNS records via Resend Domains API
  - Step 3: Display copy-to-clipboard DNS records (SPF TXT, DKIM CNAMEs, Return-Path CNAME)
  - Step 4: "Verify" button → calls Resend, polls status
- Once verified, all sends for that tenant switch to the custom domain automatically
- `resolveSenderForTenant(tenantId)` helper in `_shared/` — used by every send function (`paige-mcp` `send_btf_template_email`, `invite-btf-client`, `send-transactional-email`, etc.)

### Audit
- `email_send_log.metadata.tenant_id` and `metadata.sender_account` so we can trace which tenant sent what from where

---

## Build order (4 ship-able chunks)

1. **Part 1 — BTF lockdown** (1 short pass) — unblocks the "this isn't for other tenants" confusion immediately
2. **Part 3a — Per-tenant From-name on shared subdomain** (1 pass) — fixes the email-identity issue for invites today
3. **Part 2 — Offers, Products, Stripe Connect, public checkout** (3 passes — schema, admin UI, public flow)
4. **Part 3b — Custom-domain self-service** (1 pass — depends on Resend Domains API quota; we'll verify before building)

---

## Decisions still needed (only when we get to that step)

- **Application fee %** for Part 2 — default 0% for now (Paige doesn't take a cut), revisit when we onboard non-MMA tenants
- **Stripe Connect country support** — start US-only, add more later
- **Custom domain pricing gate** — free for all tenants v1, or Pro-tier only? Recommend free initially, tier-gate later

---

If this matches what you want, say "ship Part 1" (or "ship 1 and 2") and I'll start with the BTF lockdown + per-tenant From-name in one pass. We can keep Stripe Connect (Part 2) as the next chunk once those are verified.
