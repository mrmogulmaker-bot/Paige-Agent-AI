# Money Spine Lane B — Handoff for Claude Code

**Date:** 2026-07-25
**Owner:** Antonio (mrmogulmaker@gmail.com / admin@paigeagent.ai for operator work)
**Predecessor:** Slice 1c COMPLETE (14 sub-slices delivered, IA restructure 23 → 6-7 top-nav, Marketplace shipped §18-cleanly, pipeline restored + proven across 3 real cases)
**Successor:** TBD (Paige-on-Paige is the queued alternative)
**Autonomy stance:** §4 pre-launch — merge to main = production; verify before merge every time

---

## What this is

Money Spine Lane B is the revenue plumbing that turns the Marketplace we just shipped from a **catalog** into a **business model**. Marketplace-without-Money-Spine is half-shipped — the storefront exists, but nothing moves money when a tenant flips a switch. Lane B closes that gap end-to-end: rev-share, Stripe Connect payouts, IP-protection primitives (Notion-style access-locking + Webflow-style fulfillment links), and the Paige Finance sub-agent that orchestrates it all.

This is a substantial workstream. It ships as **sub-slices**, the same discipline that carried Slice 1c across 14 sub-slices. Each sub-slice grounds → builds → verifies → ships → next sub-slice grounds. **You do not prescribe implementation for anything past Lane B-i (the discovery scout) — grounding shapes the rest.**

## Why now

1. **Marketplace is shipped but not monetized.** Tenants can browse 18+ capabilities, activate one (Funding is the working opt-in example), but there's no revenue plumbing behind activation. Every day we delay this is a day the Marketplace doesn't earn.
2. **§17 $1B Growth Map calls for it explicitly.** L1/L2/L3 billing taxonomy already exists in the schema. Lane B extends what exists — it does NOT rebuild.
3. **Beta launch gates on it.** §4 pre-launch stance flips when we start onboarding real customers. Real customers require billing/rev-share plumbing.
4. **Pipeline is proven.** deploy-migrations.yml just landed a real feature DML seed with §32 dual-layer verification on prod. The infrastructure for shipping billing migrations safely is now battle-tested.

## Read-first (required grounding — none skippable)

**Doctrine (root `CLAUDE.md`):**
- §2 (funding/credit is opt-in Playbook preset, NEVER platform default)
- §4 (pre-launch shipping stance — merge to main = production)
- §7 (Paige is the intelligent portal)
- §9 (tenant isolation — server-derived `tenant_id` every insert, filter every read, RLS every tenant-scoped table)
- §10 (everything Paige-callable — payment actions cannot live only in React handlers)
- §11 (world-class design floor — checkout, subscription mgmt, pricing all held to the Marketplace bar)
- §12 (organize what you create — revenue events belong in a versioned event log, not scattered writes)
- §13 (world-class engineering — Stripe webhook sig verification, idempotency, retries, structured errors, honest reporting)
- §14 (Paige orchestrates a team — Paige Finance sub-agent belongs to the crew)
- §16 (10-department model — Money Spine is Finance department; every action classified with autonomy tier)
- §17 (extend existing L1/L2/L3 primitives, never rebuild — the billing taxonomy is canonical)
- §18 (OS-shaped, not app-shaped — payment primitives must scale to household/portfolio contexts eventually)
- §19 (intuitiveness moat — subscription upgrade should be one-click, not a checkout flow the user learns to navigate)

**Strategy docs (currently on PR #204 — merge that first if it hasn't landed):**
- `docs/strategy/marketplace-competitive-landscape-2026-07-22.md` — 14-platform rev-share table (Kajabi/Podia/Circle/GoHighLevel/Kartra/Simplero/ClickFunnels/Systeme.io/ThriveCart/Skool/etc.), IP-protection patterns (Notion access-locking, Webflow fulfillment links), GoHighLevel Snapshots deep dive
- `docs/strategy/monetization-rollout-2026-07-21.md` — 5-phase framework, 3-wave founding-member campaign, Money Spine Lane B build implications
- `docs/strategy/client-experience-workstream-2026-07-21.md` — CX workstream that runs alongside/after Money Spine
- `docs/audits/platform-ia-slice-1c-handoff.md` — the IA restructure Slice 1c just completed

**Recent code artifacts (as of 2026-07-25):**
- `supabase/migrations/20260725*_marketplace_verticals*.sql` (the 5-vertical DML seed from 1c-xii)
- `docs/architecture/MARKETPLACE-DATA-MODEL.md` (the install_count trap note — tenant-scoped compute always, never global aggregate for tenant-facing displays)
- `supabase/functions/tenant-stripe-connect/`, `supabase/functions/tenant-checkout-session/`, `supabase/functions/customer-portal/`, `supabase/functions/handle-stripe-webhook/` (existing Stripe primitives)
- `marketplace_catalog_for_tenant` RPC (§9-clean catalog reader)
- `marketplace_items`, `marketplace_installs` tables (verify schema in Phase 1)

**In-flight parallel work (do NOT collide):**
- Codex Phase 2a Edge Function hotfixes on `readiness-scan`, `refresh-fundability-scores-biannual`, `isoftpull-webhook` — merging soon via commit 3766987. Different files from Money Spine surface; no collision expected.
- Codex Phase 2b (134-function config backfill) + Phase 2c (CI drift check) queued after 2a lands.
- iSoftpull integration on hold pending Antonio's outreach to their sales/dev team.

## The canonical §17 billing map (already exists — extend, never rebuild)

Verified in the schema (per §17 canonical documentation):

| Layer | Tables | What it bills |
|---|---|---|
| L1 platform subs | `platform_subscriptions`, `platform_subscription_plans` | Tenants paying Paige for the SaaS platform |
| Engine-2 usage | `platform_usage_events` | Metered platform usage (AI calls, storage, seats) |
| L2 tenant service billing | `tenant_service_subscriptions`, `tenant_products`, `tenant_prices` | Tenants billing their own clients through Paige |
| L3 metered pass-through | `platform_metered_events` | Third-party costs (e.g. Twilio SMS) passed through to tenant |
| L4 consumer-direct | `consumer_waitlist` | Net-new 2027, not in scope for Lane B |

**The Money Spine test:** *"Which of these layers does this feature feed, and what existing primitive does it extend?"* If a build can't place itself on this map, it isn't ready.

## Doctrine anchors — the hard rules for every sub-slice

- **§2:** Money Spine is neutral infrastructure. It handles funding revenue when a tenant activates the Funding preset. It ALSO handles fitness/agency/consulting revenue. Nothing in the shared/platform default configuration mentions funding/credit/lending. The rev-share plumbing itself must not encode vertical assumptions.
- **§9:** Every payment write derives `tenant_id` server-side (from `auth.getUser()` → tenant membership, or from claimed row per §199 patterns). NEVER trust `tenant_id` from request body. Stripe customer IDs and Connect account IDs mapped to tenant server-side. Every read filters by tenant. RLS on every new payment table.
- **§10:** Every subscription change, refund, payout, rev-share adjustment must have a callable RPC or edge function seam. Paige must be able to say "refund order X to customer Y" from chat and have it work without a human clicking through the UI. If a payment action only lives in a React handler, that's a dead end.
- **§11:** Checkout, pricing cards, subscription management, payout dashboards — every payment surface is held to the world-class floor. On the primitive layer. Gold reserved for the act moment ("Confirm subscription", "Approve payout"). No amateur payment forms.
- **§12:** Revenue events go into a versioned event log (`platform_revenue_events` or extend `platform_metered_events`), not scattered writes across a dozen tables. Every rev-share calculation is auditable end-to-end.
- **§13:** Stripe webhook signature verification MANDATORY (existing `handle-stripe-webhook` may already do this — verify in Phase 1). Idempotency keys on every mutation. Retries with exponential backoff. Structured errors, not swallowed generics. Honest reporting — a "checkout initiated" is not a "payment received."
- **§14:** Paige Finance agent is a first-class sub-agent, not just a code library. Belongs to the Finance department (§16). Handles: billing questions, refund drafting, subscription change proposals, rev-share explanations. Escalates payouts and refunds above threshold per autonomy tier.
- **§16:** Every payment action classified in `paige_action_kinds` with a Finance dept from/to routing and an autonomy tier (auto/confirm/off). Small refunds may be auto; large refunds always confirm; policy changes always off (human-only).
- **§17:** Extend L1/L2/L3 primitives. If you find yourself creating a `platform_subscriptions_v2` or `tenant_billing_new`, stop — you're rebuilding what exists. The map is canonical; extend the existing tables.
- **§18:** Every payment primitive OS-shaped. `platform_revenue_events` should work if Paige is powering a business context OR a household context tomorrow. Don't hardwire "coach → client" semantics into schemas that will need to hold "parent → household" or "portfolio → asset" later.
- **§19:** Intuitiveness moat on every payment surface. Subscription upgrade is a button, not a checkout flow. Rev-share payout is proactive ("Paige noticed you're owed $X — payout processed") not reactive ("go find your payout in this settings menu"). Draft-first for anything that mutates money — Paige drafts the refund/payout/adjustment, human approves in one click.

## Sub-slice sequencing (candidate — grounding shapes final scope)

**Lane B-i:** Discovery + gap map (grounding scout, no code)
**Lane B-ii:** Marketplace revenue hook (paid marketplace item checkout, activation → subscription)
**Lane B-iii:** Tenant subscription upgrade/downgrade/cancel with prorate + retention
**Lane B-iv:** Rev-share plumbing (creator identity, calculation, Stripe Connect payouts, payout ledger, author dashboard)
**Lane B-v:** IP-protection primitives (Notion-style access-locking, Webflow-style fulfillment links, license enforcement in catalog RPC)
**Lane B-vi:** Paige Finance department wiring (sub-agent, autonomy tiers, approval queue, draft-first invoice generation)

**Do NOT commit to this sequence past B-i.** Grounding may show that B-ii is already 60% built (per the 1c-xii precedent), or that B-iv needs to come before B-ii because rev-share primitives are load-bearing. Ground first. Let evidence sequence the rest.

---

## Lane B-i: Discovery + gap map (THE ONLY IMMEDIATELY ACTIONABLE SLICE)

**Read-only.** No code changes. Ship as a discovery report, not a PR.

### Phase 1 grounding scout scope

Convene the standard crew: **discovery engineer** + **adversarial verifier** + **compliance officer** + **integrator** (per §1). Full crew, no solo.

**Discovery tasks:**

1. **Inventory the existing billing schema.** For each of these tables, produce: current schema, row count on prod, RLS policies, indexes, current tenant-scoping mechanism:
   - `platform_subscriptions`, `platform_subscription_plans`
   - `platform_usage_events`, `platform_metered_events`
   - `tenant_service_subscriptions`, `tenant_products`, `tenant_prices`
   - `marketplace_items`, `marketplace_installs`
   - Any table matching `%billing%`, `%invoice%`, `%payout%`, `%stripe%`, `%revenue%` (grep the schema)

2. **Inventory existing Stripe integration.** For each Stripe-touching edge function:
   - `tenant-stripe-connect`
   - `tenant-checkout-session`
   - `customer-portal`
   - `create-checkout`
   - `create-payment` (⚠️ NOTE: this is one of the 4 DEPLOYED_MISSING_LOCAL from Codex's audit — deployed to Supabase but not in main. Reconciliation is Codex's Phase 2b decision. Do not touch without checking with Codex.)
   - `handle-stripe-webhook`, `stripe-webhook`
   - `add-business-slot-checkout`, `broker-workspace-checkout` (§2 audit: are these vertical-specific or generic?)
   
   For each: current state, tenant-scoping, signature verification, idempotency handling.

3. **Verify Stripe Connect readiness.** Does `tenant-stripe-connect` support Connect Express accounts for creator payouts? What's the current OAuth flow? Are onboarding requirements met for Connect activation on the Stripe account?

4. **Marketplace revenue-hook readiness check.** In `marketplace_items`:
   - Is there a `pricing_model` column (free/one_time/subscription/rev_share)? If not, needs adding.
   - Is there Stripe product/price mapping? Either as columns or a mapping table (`marketplace_item_stripe_price`).
   - Is `marketplace_installs` capable of carrying billing metadata (price paid, currency, subscription_id, one_time_charge_id)?
   - Does the activation flow currently touch Stripe at all, or does it just flip a features flag?

5. **§9 audit of existing payment surfaces.** For every function/RPC that touches Stripe or billing tables:
   - Is `tenant_id` derived server-side or accepted from body?
   - Is the Stripe customer/account ID mapped to tenant server-side?
   - Are body-supplied `stripe_customer_id`, `subscription_id`, `price_id` validated against the tenant's owned records before use?
   - Any function accepting caller-supplied identifiers for Stripe operations without server-side ownership validation is a §9 finding — flag as HIGH.

6. **§2 audit of existing payment code.** Grep for hardcoded verticals in payment code:
   - `funding`, `credit`, `lender`, `FICO`, `SmartCredit`, `iSoftpull` in payment-adjacent files
   - Anything that reads like "if vertical = funding, use this price" is a §2 violation
   - Everything payment-related must be tenant-authored config, not vertical hardcode

7. **§10 callable-seam audit.** For each payment action currently in the UI:
   - Does the same action have a callable RPC or edge function seam?
   - Can Paige perform this action from chat, or only through the UI?
   - Missing seams are §10 findings — flag as follow-ups for Lane B-vi wiring

8. **Rev-share model discovery.** Search the code for existing rev-share primitives:
   - Any tables matching `%rev_share%`, `%payout%`, `%commission%`, `%affiliate%`
   - Any Stripe Connect transfer logic
   - Any creator/author identity fields on `marketplace_items` (who authored each item?)
   - Do we have a concept of "marketplace author" separate from "platform" for the 13 pre-existing items? (Likely: all currently platform-authored, no rev-share applies yet)

9. **IP-protection primitive discovery.** Search for existing access-locking:
   - Any content/asset tables with `access_gated_by` or similar
   - Any "download once" or "session-limited access" patterns
   - Any expiring signed URL patterns
   - Existing patterns to extend vs. genuinely net-new

10. **§17 map validation.** For every existing billing table found, place it on the L1/L2/L3 map. Flag any table that doesn't fit the map — that's either extension needed on the map or misclassified code.

### Phase 1 deliverables

**One discovery report:** `docs/audits/money-spine-lane-b-discovery-2026-07-XX.md`

Sections:
1. Existing billing schema inventory (with tenant-scoping notes)
2. Existing Stripe integration inventory
3. Existing rev-share primitives (or confirmation none exist)
4. Existing IP-protection primitives (or confirmation none exist)
5. §2 audit findings (any hardcoded vertical in payment code)
6. §9 audit findings (any body-trusted tenant_id or Stripe ID)
7. §10 audit findings (any payment action lacking a callable seam)
8. §17 map placement for each existing primitive
9. Recommended sub-slice sequencing (B-ii through B-vi order, with rationale)
10. First slice proposal for B-ii (specific scope, migration count, deploy pipeline predictions)

**Do NOT ship code in Phase 1.** The report IS the deliverable. Owner reviews + confirms sequencing before Phase 2 dispatches Lane B-ii.

### Phase 1 boundaries

- **NO schema changes.** Read-only inventory.
- **NO edge function changes.** Read code, don't modify.
- **NO Stripe API calls that mutate state.** Read-only enumeration is OK if you can verify it's read-only (list customers, list products, list prices). Don't create/update/delete anything.
- **If DEPLOYED_MISSING_LOCAL from Codex's audit overlaps with your Phase 1 findings (e.g. `create-payment`, `create-checkout`), coordinate with Codex — don't unilaterally decide the disposition.**
- **If you discover something is 80% already built (per 1c-xii precedent), NAME IT LOUDLY.** That's the biggest win Phase 1 can deliver.

### Grounding save patterns to look for

Based on the last two grounding saves this session (#437 invalidated + 1c-xii ~80% already built), the highest-value Phase 1 outcome is often:
- Discovering a primitive that already exists (avoid rebuild)
- Discovering that a proposed table can extend an existing table (avoid schema fragmentation)
- Discovering that the "hard" part is already implemented and the "easy" part is what's actually missing

Bias hard toward extending what exists. §12 organization + §17 canonical map + §18 don't-rebuild all point the same direction.

---

## Cross-workstream coordination

- **Codex Phase 2a hotfix** (readiness-scan, refresh-fundability-scores-biannual, isoftpull-webhook) is landing in parallel. Different files, no collision expected. Verify before starting Phase 1 that his commit has landed.
- **Codex Phase 2b + 2c** (134-function config backfill + CI drift check) queued. Money Spine may add new edge functions — coordinate naming/config so both workstreams' functions get consistent explicit `verify_jwt` classification.
- **iSoftpull integration** on hold pending Antonio's outreach. Do NOT touch `isoftpull-*` functions or plan integration work — separate lane.
- **Paige-on-Paige workstream** deferred until after Money Spine ships. Don't spec Paige-on-Paige surface without owner say-so.
- **PR #204** must merge before Phase 1 grounding starts, so the strategy docs are actually in main for the grounding scout to read. This is the 5th slice hit by unmerged PR #204 — please close this recurring gap.

## Delivery cadence

- **Full crew every slice** (design engineer + adversarial verifier + compliance officer + integrator per §1/§5). No solo builds.
- **Grounding first, code second** (§18) on every sub-slice. Every sub-slice starts with a discovery scout, ends with §32 dual-layer verification on prod.
- **Merge on verified** per §4 pre-launch stance. Verify before merge every time. Payment code is exactly the kind of thing that gets a full verifier pass — a broken rev-share calculation is not a "hotfix in prod" scenario.
- **Report at each ship.** Include: what shipped, what §32 verified, what's queued next, what's parked as follow-up.
- **Honesty on delivery state** (§13). If a commit is local-only, say so. If a Stripe call is against test-mode not live-mode, say so. If a "successful integration" hasn't been end-to-end-verified against a real card, say so.

---

## First move for Claude Code

1. **Confirm PR #204 has merged.** If not, ask owner to merge before proceeding.
2. **Confirm Codex Phase 2a hotfix has landed** on main (commit 3766987 or successor). Different files, but knowing the state avoids merge conflicts.
3. **Convene the crew.** discovery engineer + adversarial verifier + compliance officer + integrator.
4. **Dispatch Phase 1 grounding scout** per the 10-task list above.
5. **Produce the discovery report** at `docs/audits/money-spine-lane-b-discovery-2026-07-XX.md`.
6. **Hold for owner sign-off** on recommended sub-slice sequencing + first slice scope before dispatching Lane B-ii.

**Do not ship code until owner confirms the sub-slice plan.** Lane B-i is discovery only.
