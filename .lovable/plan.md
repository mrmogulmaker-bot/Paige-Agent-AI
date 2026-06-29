## Goal

Two changes landing together:

1. **Offer cleanup** — the CRM only sells BTF and Paige Agent AI. Drop community / Launch Pad slugs from the offer picker.
2. **Multi-tenant pivot** — introduce a real Tenant ↔ Customer distinction across schema, RLS, UI, and signup flow.

The platform stops being "Antonio's single org" and becomes a SaaS where any qualified buyer (coach, agency, etc.) can subscribe to the CRM suite and onboard their own consumers underneath their tenant.

---

## Part 1 — Offer catalog

Single source of truth in `src/lib/contacts.ts`.

**Tenant-facing offers (what a buyer subscribes to — sold by us):**
- `crm_coach` — Coach Workspace, **$97/mo** (1 owner seat + up to 25 customers)
- `crm_agency` — Agency Workspace, **$297/mo** (5 team seats + up to 250 customers)
- `crm_enterprise` — Enterprise (custom, sales-led)

**Customer-facing offers (what a tenant enrolls a consumer in):**
- `btf_pif` — BTF Pay in Full ($4,997)
- `btf_split` — BTF Split ($1,997 down + $1,000 × 3)
- `btf_getstarted` — BTF Get-Started ($997 + $497/mo)
- `paige_free` / `paige_starter` / `paige_growth` / `paige_scale` / `paige_enterprise` — existing Paige plans (kept as-is, re-keyed from current `subscription_plans` slugs)

Legacy values (`btf`, `premium`, `vip`, `accel`, `launch`, etc.) get aliased so old rows still render a label and aren't lost.

---

## Part 2 — Tenant model

### New tables

- **`tenants`** — one row per CRM-suite subscriber org. Fields: `slug` (URL token), `name`, `brand` (logo / colors / from-name for invites), `plan_offer` (one of the `crm_*` slugs), `stripe_customer_id`, `stripe_subscription_id`, `status` (`trial` / `active` / `past_due` / `canceled`), `seat_limit`, `customer_limit`, `owner_user_id`.
- **`tenant_members`** — `(tenant_id, user_id, role, status)` where role is `owner` / `admin` / `coach` / `member`. Determines who in the CRM belongs to which tenant.
- **`tenant_invite_tokens`** — signed tokens for consumer self-signup links (`tenants/:slug/join?t=…`). Records who used it and when.

### Tenancy on existing tables

Add `tenant_id uuid` to: `clients`, `deals`, `pipelines`, `pipeline_stages`, `tasks`, `paige_coach_assignments`, `paige_pending_approvals`, `invitations`, `email_send_log`, `email_templates`, `paige_conversations`, `paige_workflow_runs`, `paige_audit_log`. Backfill all existing rows to `tenant_id = <Antonio's tenant>`.

`businesses` and consumer-owned tables (`credit_*`, `paige_btf_documents`, etc.) stay user-scoped but inherit their tenant via the consumer's `clients.tenant_id`.

### RLS rewrite

Replace ad-hoc "is admin or assigned coach" policies with a layered model:

- **Platform owner** (Antonio) → sees all tenants.
- **Tenant owner / admin** → sees everything where `tenant_id = current_user_tenant_id()`.
- **Tenant coach / member** → sees only contacts they're assigned to within their tenant.
- **Consumer (linked_user_id)** → sees only their own rows, regardless of tenant.

Security-definer helpers: `current_user_tenant_id()`, `is_tenant_admin(_tenant)`, `is_tenant_member(_tenant)`. All policies route through these — no recursive lookups.

---

## Part 3 — Consumer signup under a tenant

1. Tenant admin opens **Settings → Signup Link** → gets `https://<host>/join/<tenant-slug>?t=<token>`.
2. Consumer hits the link → branded landing page (tenant's logo + name) → email/password or Google sign-in.
3. On successful signup, a new row is added to `clients` with `tenant_id` set, `lifecycle_stage='customer'`, `source='tenant_invite'`, `linked_user_id=auth.uid()`.
4. Edge function `accept-tenant-invite` validates the token, enforces `customer_limit`, and dispatches the welcome email using the tenant's branding.
5. Consumer lands in the existing Paige consumer app (`/app/*`) — exactly the experience that exists today.

---

## Part 4 — Admin UI

- **Sidebar split:** "My Tenant" (everything you already have) vs new **"Platform"** section visible only to platform owner — Tenants list, billing, usage, audit.
- **Tenants page** — table of tenants with plan, seat usage, customer usage, MRR, status. Drill into a tenant for member list and impersonation.
- **Tenant switcher** — header dropdown for platform owner to scope the entire CRM view to one tenant.
- **Settings → Workspace** — for tenant admins: brand (logo, color, from-name), invite link, member management, plan/usage card.
- **Contacts page** language — keep calling these "Contacts / Customers". The word "Subscribers" is reserved for tenant-level CRM buyers and only appears in the Platform area.

---

## Part 5 — Billing for CRM suite

- Create three Stripe products: Coach Workspace, Agency Workspace, Enterprise (placeholder).
- New `/get-started` public page (separate from `/signup` consumer flow) — pick a tier → Stripe Checkout → on success, `provision-tenant` edge function creates the `tenants` row, makes the buyer the `owner`, seeds default pipeline + email templates, redirects to the new workspace.
- `stripe-webhook` extended: on `customer.subscription.updated` / `.deleted`, sync `tenants.status`, `seat_limit`, `customer_limit`.
- Existing consumer Stripe handling (Paige plans) is untouched.

---

## Part 6 — Rollout order

1. Offer catalog refactor + legacy aliases (ships immediately, no schema change).
2. `tenants` / `tenant_members` / `tenant_invite_tokens` migration + backfill Antonio's tenant.
3. Add `tenant_id` to in-scope tables + backfill + RLS rewrite behind a feature flag.
4. Tenant switcher + Platform → Tenants page (owner-only).
5. Workspace settings (brand + invite link) + `accept-tenant-invite` edge function.
6. Stripe products + `/get-started` + `provision-tenant` + webhook sync.
7. Flip feature flag, retire legacy "single-org" policies.

---

## Technical notes

- All new tables include `created_at` / `updated_at` triggers and follow `GRANT … TO authenticated/service_role` pattern.
- `current_user_tenant_id()` is `STABLE SECURITY DEFINER`, returns the tenant id of the requesting user from `tenant_members` (or the platform-owner's "active" tenant when impersonating, stored in `profiles.active_tenant_id`).
- Backfill uses Antonio's `auth.users.id` resolved via `app_settings_owner.owner_email`.
- Invite tokens: HMAC-signed (HS256) with `INVITE_TOKEN_SECRET`, 30-day expiry, one-time-use enforced in DB.
- No breaking changes to consumer-facing `/app/*` routes — only the `clients` row they hang off gains a `tenant_id`.
- Edge functions touched: new `provision-tenant`, new `accept-tenant-invite`, extended `stripe-webhook`, extended `invite-btf-client` to stamp `tenant_id`.

---

## Out of scope (call out, don't build)

- Tenant-level custom domains (Phase 2 — would need Vercel/Cloudflare wildcard config).
- Per-tenant Stripe Connect for tenants to bill their own consumers (Phase 3).
- Cross-tenant data export / migration tooling.