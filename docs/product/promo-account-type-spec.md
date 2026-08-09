# Promotional Account Type — LOCKED SPEC

**Status:** Approved by Antonio Cook 2026-08-08.
**Owner:** Product (Antonio) with Cowork.
**Build owner:** Claude Code, when promo-issuance work fires.
**Doctrine anchors:** §2, §9, §16, §17, §23 (tier taxonomy), §38 in `CLAUDE.md`.

---

## 1. Purpose

Define the Promotional (Promo) account type — a time-limited, Super-Admin-issued account that gives a prospect or partner full access to a Solo or Agency tier for a defined trial period, without triggering billing and without polluting the platform's real-revenue metrics.

Distinct from a trial (self-serve, credit-card gated, auto-converts). Promo is **operator-issued**, no card required, and requires an explicit owner action to convert.

---

## 2. Scope — what tiers are promo-eligible

**Promo-eligible tiers:** Solo, Agency (only).

**Not promo-eligible:** Enterprise (Enterprise engagements are always custom-contracted; no promo path).

Rationale: Solo and Agency are the two productized tiers with defined feature envelopes. Enterprise is negotiated per-deal, so a "promo Enterprise" is meaningless — it'd just be a contract.

**Who can issue:** Super Admin (God-level operator) only. No agency admin can issue a promo to a sub-account. No tenant can issue a promo to their client.

---

## 3. Lifecycle

```
issued → active → expiring (T-14, T-7, T-3, T-1) → expired  OR  converted
```

**States:**

- **issued** — Super Admin creates the promo. Term (30–60 days) locked at issuance. Notification sent to the recipient with sign-in link and clear "this is a promotional account" language.
- **active** — Recipient signs in and uses the account. Full tier feature access. Zero billing.
- **expiring** — Notification cadence at T-14, T-7, T-3, T-1 days before expiry. Both to the promo holder AND to the issuing operator.
- **expired** — Access downgrades to read-only for a grace window (default 14 days), then archives. Data is retained for 90 days post-archive before purge (aligns with standard tenant deletion policy).
- **converted** — Holder adds payment method and converts to paid Solo or Agency. Promo record retains history; account transitions to normal billing lifecycle.

**Owner-configurable at issuance:**
- Term (30–60 days, discrete choice: 30 / 45 / 60)
- Tier (Solo or Agency)
- Recipient email + optional recipient name
- Optional internal note (why this promo, source, campaign attribution)

---

## 4. Business rules

- **No billing during promo.** No card required at issuance. No invoice generated. Stripe subscription not created until conversion.
- **Feature envelope = matching paid tier.** Promo Solo gets full Solo feature access; promo Agency gets full Agency access. No feature-crippling.
- **Excluded from the 100-sub metric.** Promo accounts don't count in the KPI dashboard's "paying subscribers" number. Kept in a separate "active promos" bucket.
- **Excluded from revenue reporting.** MRR/ARR calculations skip promo accounts entirely. Included in engagement/usage analytics.
- **One active promo per recipient email.** Anti-abuse guard: if the same email already has an active/expired promo in the last 12 months, issuance requires a Super Admin override + logged justification.
- **Conversion prompt.** When holder adds a payment method, the account transitions to the matching paid tier immediately (not at promo expiry). Promo record marks converted-at date.
- **No auto-conversion.** Promo NEVER auto-charges. Recipient must explicitly convert. Expiration downgrades access; it does not silently charge a stored card.
- **Data survives expiration.** Post-expiry read-only period (14 days) lets the recipient export/preserve their work. Encourages conversion.
- **Agency-issued promos cascade rules.** If a promo Agency account creates sub-accounts, those sub-accounts inherit the promo lifecycle — they expire when the parent promo expires (per §9 tenant/agency seam).

---

## 5. Data model impact

New table: **`promo_accounts`**

```
- id (uuid, pk)
- tenant_id (uuid, fk → tenants; the tenant this promo backs)
- tier ('solo' | 'agency')
- term_days (int, one of 30/45/60)
- issued_at (timestamptz)
- expires_at (timestamptz, computed)
- issued_by_operator_id (uuid, fk → operator user)
- recipient_email (text)
- recipient_name (text, nullable)
- internal_note (text, nullable)
- state ('issued' | 'active' | 'expiring' | 'expired' | 'converted')
- activated_at (timestamptz, nullable — first sign-in)
- converted_at (timestamptz, nullable)
- source_campaign (text, nullable — for attribution)
- created_at, updated_at (timestamptz)
```

Extension to **`tenants`** table:

```
- is_promo (bool, default false, indexed)
- promo_account_id (uuid, nullable, fk → promo_accounts)
```

RLS:
- `promo_accounts` — Super Admin read/write only (operator scope, §9). Tenants can NOT read this table directly (their promo status is reflected on `tenants.is_promo`).
- `tenants.is_promo` — readable by the tenant's own users (so UI can render the promo banner). Not writable by tenants (only by operator via promo_accounts triggers).

Metric queries updated:
- MRR / ARR / paying-subscribers KPI queries add `WHERE is_promo = false`.
- Engagement / usage analytics do NOT filter on is_promo (promo users count for engagement, just not revenue).

---

## 6. UI/UX surfaces

### 6.a — Super Admin unified Invites surface (owner-ruled 2026-08-08)

Promo issuance is NOT a dedicated "Promos" page. It lives inside a broader **Invites** surface in the Super Admin console, alongside every other way we invite someone onto the platform. A single Invites tab (or Invites section under Settings) with a **type toggle** switches between invite modes:

**Invite types (all Super Admin only):**

1. **Promo** — full free access for a defined term (this spec). Solo or Agency tier. 30/45/60 days.
2. **Paid — full price** — standard invitation to sign up as a normal paying customer. Sends a signup link that routes through Stripe checkout at list price.
3. **Paid — discounted** — signup link with a Stripe coupon/discount attached (e.g., "50% off first 3 months," "$500 off Agency onboarding"). Discount amount + duration configurable at issuance.
4. *(reserved for future)* — partner / affiliate invites, referral-issued invites, bulk invites once volume justifies.

**Why unified:** every way we bring someone onto the platform is an invitation with different terms. Toggling between promo / paid-full / paid-discounted from ONE surface keeps operator UX simple, lets us track all outbound acquisition in one log, and avoids scattering "who did we invite and how" across three pages.

**Surface behavior:**

- **List view:** all outbound invitations, filterable by type + state + campaign + issuing operator. Columns: recipient, type, tier (for promo), discount (for discounted), state, sent-date, converted-flag.
- **Issue invite form:**
  - Type toggle at top (Promo / Paid — full / Paid — discounted)
  - Type-specific fields render below:
    - Promo → tier (Solo/Agency), term (30/45/60), recipient email + name, campaign tag, internal note
    - Paid — full → tier (Solo/Agency), recipient email + name, campaign tag
    - Paid — discounted → tier (Solo/Agency), Stripe coupon/discount config (amount, duration), recipient email + name, campaign tag
  - Submit → creates row in `platform_invites` (see data model note below) + sends recipient a tailored sign-in/signup email
- **Detail view per invite:** full record + notification history + downstream conversion state + audit trail. Extension controls where applicable (promo extends, discount extends).
- **Anti-abuse warning:** if recipient email has any active/expired invite in the last 12 months, form shows warning + requires Super Admin override checkbox (applies across ALL invite types, not just promo — prevents "give same person a promo, then a discount, then another promo" abuse patterns).

**Data model note:** the `promo_accounts` table in §5 evolves to (or is subsumed by) a broader `platform_invites` table with an `invite_type` discriminator column. Type-specific fields nullable and validated per row. Details of the discounted-paid invite type live in a companion spec (`platform-invites-spec.md`) when/if that type ships beyond promo; for now the promo type is the load-bearing case and the surface is designed to accept the other types without redesign.

### 6.b — Tenant-side promo banner

Persistent banner in the tenant app chrome (not a modal, not a nag) showing:
- Promo status ("Promo account — 42 days remaining")
- Convert-to-paid CTA (opens payment method + tier confirmation modal)
- Never blocks work.

Banner escalates styling as expiry approaches:
- >14 days out: neutral tone
- 14–7 days: warning tone (soft, no red)
- <7 days: prominent, still non-blocking

### 6.c — Notification cadence

Email + in-app notification at:
- T-14 days: "Your promo is active for 14 more days"
- T-7 days: "Convert to keep your work — 7 days left"
- T-3 days: "Last chance — 3 days left"
- T-1 day: "Tomorrow: your account moves to read-only unless you convert"
- On expiry: "Read-only mode — 14 days to convert or export"
- End of grace: "Archived — data retained 90 days; contact support to restore"

Also: internal notification to issuing operator at T-3 (chance to reach out).

---

## 7. Audit trail (§17)

Every promo action goes to `paige_audit_log`:
- issued, activated, converted, expired, extended, deleted
- Every state transition timestamped with actor (operator or system)
- Extensions require operator + justification captured in `paige_audit_log.metadata`

God-account changes get the two-key rule per §17 doctrine (destructive/ceiling actions require confirm).

---

## 8. Related doctrine cross-refs

- **§2** — Coaching-generic; promo accounts get platform-default coaching experience unless the tenant configures a specialty (funding, etc.) themselves.
- **§9** — Tenant/operator seam; promo issuance is operator-scoped, promo status is tenant-visible.
- **§16** — Autonomy tier for issuance = 🔴 human-only (Super Admin explicit action). Auto-cancellation at expiry = 🟢 auto.
- **§17** — $1B governance; promo revenue never counted, MRR/ARR queries filter, audit log binds.
- **§23** — Tier taxonomy is Solo / Agency / Enterprise. Promo tiers must be Solo or Agency (never Enterprise, never a made-up tier).
- **§38** — Money boundary; no charge during promo, conversion path goes through Paige's own Stripe rails (L1 platform subscription).

---

## 9. Owed downstream work

1. **Migration** — create `promo_accounts` table + `tenants.is_promo` / `tenants.promo_account_id` columns + RLS. §47 commit-same-beat rule binds.
2. **Metric-query update** — audit every MRR/ARR/paying-subscriber query in the codebase; add `WHERE is_promo = false` clause. §37 producer inventory.
3. **Super Admin Promos page** — new surface per §6.a.
4. **Tenant-side promo banner** — new component per §6.b, extends existing app chrome primitive.
5. **Notification pipeline** — extend transactional email templates (uses the new tenant-brand-threaded renderer from Bug B PR #397 — but promo emails stay Paige-branded, not tenant-branded, since it's a Paige-to-recipient communication).
6. **Expiry cron** — `pg_cron` job (or edge function) that runs daily, moves accounts through expiring → expired → archived states, fires notifications.
7. **Conversion flow** — hook into existing Stripe subscription flow; promo → paid transition preserves data + history.
8. **Anti-abuse guard** — 12-month lookback on recipient_email before allowing new promo without override.

---

## 10. Verification requirements when this ships

- **§32 dual-leg** — fidelity + behavioral. Behavioral must cover: issue → sign-in → use features → approach expiry → notification → convert (or expire → read-only → archive → purge).
- **§32.b SET ROLE authenticated repros** — verify Super Admin can issue but tenant/agency admin cannot; verify tenant can see their own is_promo but cannot modify; verify cross-tenant reads blocked.
- **§37 producer inventory** — every metric query that touches subscription/tenant counts (dashboard, admin analytics, MRR calc, KPI board).
- **§39 peer-gate** on RLS + metric-query changes.
- **Post-deploy Playwright drive** on the Super Admin issuance flow + tenant-side promo banner rendering.

---

## 11. Open items intentionally deferred

- **Bulk promo issuance** (e.g. mass-issue promos to a conference attendee list) — not in v1. Manual one-at-a-time issuance only. Bulk added when the volume justifies it.
- **Promo-specific onboarding flow** — v1 uses standard onboarding. If we see promos convert poorly, revisit with a promo-tuned onboarding experience.
- **Referral-issued promos** (tenant refers a friend, gets to issue a promo) — not in v1. Super Admin only for now.
