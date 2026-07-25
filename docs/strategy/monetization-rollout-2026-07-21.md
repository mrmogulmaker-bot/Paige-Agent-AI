# Paige Agent AI — Monetization Rollout Strategy

**For:** Antonio · **Date:** 2026-07-21 · **Status:** Locked pending owner review of the 6-month Wave 1 free-window number

**Purpose:** the canonical monetization strategy for Paige Agent AI. Covers the 5-phase rollout arc, the Founding-Member Campaign structure, the 6-layer monetization stack, credit ledger primitive design, Marketplace revenue-share mechanics, Vertical Playbook pricing, Enterprise tier, and the investor arc per phase. Reference doc for Money Spine (Lane B) build and for future marketing/investor materials.

**Related doctrine:**
- CLAUDE.md §17 — $1B Growth Map (revenue north star)
- CLAUDE.md §18 — Paige is the operating system (Marketplace as App Store)
- CLAUDE.md §14 — Model router (frontier for judgment, open for volume — the margin lever)

---

## 0. Executive summary

Paige monetizes through **six layered revenue engines** that scale together — not just SaaS subscription. The rollout runs in **5 phases**, each unlocked by proof from the prior. The first 600 customers are recruited via a **3-wave Founding-Member Campaign** with lifetime grandfather pricing — bounded loyalty cohort that becomes the foundation of the investor story. Public GA launches at ~Month 16 with full pricing; price hikes and Enterprise tier follow in Year 2.

**The 6 revenue engines:**
1. Flat SaaS subscription tiers (Solo · Practice · Studio · Enterprise)
2. Included credits per tier (Paige brain · Vibe Studio · Voice)
3. Credit packs (overage + expansion revenue)
4. Rebillable pass-through services (SMS · Email · Voice · BYOK LLM — GHL A+ Services model)
5. Marketplace revenue-share (70/30 split, Salesforce AppExchange standard)
6. Vertical Playbook add-ons ($39-99/mo per Playbook: Funding · Consulting · Agency · Real Estate · Insurance)

**The 5 phases:**
- Phase 0 — Closed Beta (25 hand-picked design partners, 6 months free)
- Phase 1 — Public Beta / Early Access (Founder Waves 2 & 3, discounted GA)
- Phase 2 — General Availability (full pricing, Marketplace monetization opens)
- Phase 3 — Scale / Growth (35% price hike, Enterprise tier formalized)
- Phase 4 — Category Leadership (premium repositioning, international, category-defining)

**Investor arc:** Year 1 → $1-3M ARR proving PMF + first revenue engines. Year 2 → $8-20M ARR proving pricing power + Enterprise + Marketplace. Year 3 → $30-60M ARR proving category leadership + multi-engine compounding. Path to $1B ARR per §17 doctrine.

---

## 1. Design principles — non-negotiable

**1.1 Dual-audience monetization** — pricing serves BOTH the individual coach ($58/mo Solo) AND the enterprise buyer ($5K+/mo). Neither is second-class. Same platform, tier-differentiated features, no forking.

**1.2 Credits protect margin, not gate core value** — flat SaaS covers unlimited use of core functionality (Paige chat · People · Pipeline · Calendar · Command Center). Credits gate high-variable-cost surfaces only (Vibe Studio creative gen · Voice minutes · high-token bulk operations). This preserves the clean sales pitch ("$349/mo unlimited platform + credits for extras").

**1.3 Grandfather as loyalty, not entitlement** — founding-wave grandfathering is bounded to defined windows (~600 customers total across 3 waves). Post-GA customers get 12-month grandfather when tier prices rise, then step-up. Loyalty is rewarded finitely, not indefinitely for everyone.

**1.4 Multiple revenue engines from day one** — build the infrastructure for all 6 engines during Money Spine (Lane B), even if some don't activate until Phase 2 or later. Retrofitting later is painful.

**1.5 Instrument everything from Phase 0** — every credit consumption, Marketplace click, Playbook activation, rebillable service event writes to the ledger from beta forward. Data → pricing calibration → confidence to raise prices.

**1.6 No pricing anxiety at the entry level** — tier defaults comfortably cover typical usage. Credits only matter at extremes. 80%+ of users should never think about credits.

**1.7 Enterprise buyers hate surprise bills** — Enterprise tier offers "unlimited within reasonable use" fair-use policy OR fixed annual credit allowance. Either resolves anxiety.

---

## 2. The 5-phase rollout

### Phase 0 — Closed Beta (Month 1-3 · 25 hand-picked design partners)

**Pricing:** FREE with commitment for **6 months**, then auto-converts to Founder Wave 1 pricing (see §3).

**Recruitment:** Antonio personally recruits 25 people from his existing network — primarily funding-vertical professionals, plus motivational speakers and thought leaders. Signed commitment: feedback + testimonial + case-study rights.

**Feature scope:**
- All 8-item nav + core surfaces
- Paige brain + chat + all Slice 1c content
- Vibe Studio credits: **generous** (3× expected typical usage — need real burn-pattern data)
- Voice + Communications (if Voice Layer lands by beta open)
- NO Marketplace revenue-share yet (free ecosystem to seed adoption)
- NO rebillable services yet (defer to Phase 2)
- Funding Playbook is FREE add-on for these tenants (Antonio's audience will use it)

**What we're proving:**
- Product-market fit with real users
- Real credit-usage patterns (calibrate Phase 2 tier sizing)
- What "typical usage" actually looks like per tier
- Testimonials + case studies for the marketing engine
- Cohort retention curves
- Onboarding friction points

**Gating condition to next phase:**
- 70%+ of beta tenants active weekly at Month 6
- At least 15 published case studies / testimonials
- Churn < 15% over the 6-month free window
- Data quality sufficient to size Phase 2 tier credits confidently

### Phase 1 — Public Beta / Early Access (Month 4-15 · Founder Waves 2 & 3)

Runs in parallel with Phase 0's tail. Wave 2 opens Month 4; Wave 3 opens Month 10.

**Pricing:**
- **Founder Wave 2 (Month 4-9, target: next 25-100 tenants)** — 50% off GA at signup, **locked for life at signup tier**. Solo $29 · Practice $75 · Studio $175.
- **Founder Wave 3 (Month 10-15, target: next 100-500 tenants)** — 25% off GA at signup, **locked for life at signup tier**. Solo $44 · Practice $112 · Studio $262.

**Feature scope:**
- Vibe Studio credits sized to real Phase 0 usage data (probably Solo 50 · Practice 200 · Studio 1000/mo — validated from actual burn rates)
- Marketplace launches with **free skills only** — building ecosystem inventory before monetizing
- First vertical Playbook (Funding) available as free add-on to demonstrate the mechanism
- Rebillable services still deferred

**What we're proving:**
- Real revenue signal at real dollars
- Churn at real dollars vs. free-beta churn
- Credit-pack purchase behavior (do overage purchases actually happen?)
- Validation of Playbook opt-in mechanic (adoption rate)
- First Net Revenue Retention data

**Gating condition to Phase 2:**
- 500+ paying tenants across Waves 2 & 3
- NRR > 110%
- Credit-pack attach rate > 20% (at least 1-in-5 tenants buy overage credits)
- Funding Playbook adoption rate > 40% among funding-vertical tenants (proves the vertical mechanism)

### Phase 2 — General Availability (Month 16-24 · target: 1,500-3,000 tenants)

**Pricing:** Full GA pricing goes live for everyone joining post-GA. Founder Waves 1-3 stay at their locked pricing forever.
- **Solo $58/mo · Practice $149/mo · Studio $349/mo**

**Feature scope:**
- **Marketplace opens with paid skills** — 70/30 revenue split (builder 70, platform 30) — Salesforce AppExchange / Apple App Store standard
- **Funding Playbook becomes a paid add-on: $49/mo** — unlocks Broker role + funding surfaces + funding-specific skills
- **Rebillable services v1 launches** — SMS + Email initial rollout, cost + 15-20% platform fee
- **Communications workstream** (Conversations + Voice) full ship
- **Enterprise inquiry form live** — custom pricing conversations start; not a formal tier yet

**What we're proving:**
- Tier economics at scale
- Marketplace take-rate as real revenue engine
- Vertical Playbook revenue as a real line item
- Rebillable services adopted at expected margins
- Enterprise pipeline forming (5+ contracts in flight)

**Gating condition to Phase 3:**
- $2M+ ARR
- Marketplace revenue > $30K/mo
- Funding Playbook attach rate > 30% of applicable tenants
- 5+ Enterprise contracts closed at $2K+/mo
- NRR > 120%

### Phase 3 — Scale / Growth (Month 25-36 · target: 5,000-15,000 tenants)

**Pricing:** ~35% price increase for NEW customers only. All Founder Waves + all pre-Phase-3 customers grandfathered per policy (Founder Waves = lifetime lock; Phase 2 customers = 12-month grandfather).
- **Solo $79/mo · Practice $199/mo · Studio $449/mo**
- **Enterprise formalized: custom pricing, average $2,400/mo ACV**

**Feature scope:**
- Additional vertical Playbooks launch (Consulting · Agency · Real Estate) at $39-99/mo each
- Rebillable services full suite (SMS · Email · Voice · BYOK LLM overages)
- **White-label Studio-plus tier launches at $999/mo** — custom domain, remove Paige branding, agency reseller mode
- Marketplace ecosystem hits 100+ paid skills, 30+ Playbooks
- Enterprise onboarding + success partner motion formalized
- Sub-account credit allocation for agency tier (per §17 agency-as-growth-atom doctrine)

**What we're proving:**
- Pricing power (35% hike absorbed with < 5% incremental churn)
- Enterprise ACV
- Expansion revenue via tier upgrades + Marketplace + Playbooks
- Agency channel as real revenue engine

**Gating condition to Phase 4:**
- $15M+ ARR
- Pricing hike absorbed with < 5% incremental churn
- Marketplace revenue > $200K/mo
- Enterprise contracts averaging $28K+ annual
- NRR > 130%

### Phase 4 — Category Leadership (Month 37+ · target: 25K+ tenants + Enterprise book)

**Pricing:** Premium repositioning. New customers pay premium; Founder Waves stay locked; Phase 2/3 customers on standard grandfather.
- **Solo $99/mo · Practice $249/mo · Studio $599/mo**
- **Studio+ (white-label) $1,499/mo**
- **Enterprise avg $5K/mo** ACV
- International + multi-currency
- Annual contracts standard on Studio+/Enterprise (10-15% prepay discount)

**Feature scope:**
- Category-defining features (voice AI depth, industry-specific vertical accelerators, integration partnerships)
- Marketplace at maturity — take-rate meaningful (~15-25% of platform revenue)
- Enterprise expansion motion (dedicated account managers, land-and-expand within organizations)
- Category-creation moves (Paige Certified Consultant program, ecosystem developer program)

**What we're proving:**
- Category leadership pricing sticks
- Enterprise expansion drives ARR growth without proportional headcount
- Marketplace as second/third revenue engine
- International expansion viable

---

## 3. Founding-Member Campaign — the 3-wave structure

The first ~600 customers are recruited via a bounded 3-wave campaign. Each wave has distinct pricing + lifetime grandfather within the campaign window. Creates urgency, scarcity, marketing narrative, and a rock-solid loyalty base for the investor story.

### Wave 1 — Design Partners (25 tenants, hand-picked)

- **Access:** invite-only from Antonio's personal network — funding-vertical professionals, motivational speakers, thought leaders
- **Pricing:** FREE for **6 months** with signed commitment (feedback + testimonial + case-study rights)
- **Conversion (Month 7):** auto-converts to Founder Wave 1 lifetime pricing — 50% off GA at their tier, locked for life
- **Founder Wave 1 pricing:** Solo $29/mo · Practice $75/mo · Studio $175/mo — **locked at signup tier for life**
- **Upgrade rule:** if a Wave 1 tenant upgrades tier later, they pay Wave 1 pricing for the new tier (still 50% off) — grandfather applies at the DISCOUNT PERCENTAGE, not the fixed dollar amount
- **Recognition:** "Founding Partner" badge in-app + on marketing site + in case studies

### Wave 2 — Public Beta (target: next 25-100 tenants)

- **Access:** public beta launch, marketed openly, opens Month 4
- **Pricing:** 50% off GA at entry, **locked for life at signup tier** — Solo $29/mo · Practice $75/mo · Studio $175/mo
- **Same upgrade rule** — 50% discount applies to any tier they upgrade to later, locked
- **Recognition:** "Founding Member" badge

### Wave 3 — Early Access (target: next 100-500 tenants)

- **Access:** early-access launch, opens Month 10
- **Pricing:** 25% off GA at entry, **locked for life at signup tier** — Solo $44/mo · Practice $112/mo · Studio $262/mo
- **Same upgrade rule** — 25% discount applies to future tier upgrades, locked
- **Recognition:** "Early Access Member" badge

### Wave close & post-founder rules

- **Founder campaign closes at GA launch (~Month 16)** — no more founder-tier signups after that date, ever
- Post-GA customers pay full pricing with standard grandfather rules (12 months at their tier price when tier prices rise, then step-up)
- **Bounded cheap cohort:** total founding customers capped at ~625 across all waves (25 + 100 + 500). At $80 avg discount × 600 customers × 5 years = ~$3M in lifetime discount cost. A rounding error against the expansion revenue those loyal cohorts generate.

### Investor story this creates

"We recruited 600 founding customers in the first year. After 24 months, cohort NRR is 140% because they've upgraded to higher tiers, bought credit packs, and activated Marketplace apps. Even our biggest discount cohort proves expansion. Loyalty NPS from founders is +72. They generated 34 case studies and 89 testimonials that power our current marketing engine."

That's a strong Year-2 investor story — proves loyalty, retention, expansion, and word-of-mouth acquisition all at once.

---

## 4. The 6-layer monetization stack (detailed)

### Layer 1 — Flat SaaS subscription tiers

The base entry. Predictable revenue, familiar model, clean sales pitch.

| Tier | GA Price | Wave 1/2 Price | Wave 3 Price | Position |
|---|---|---|---|---|
| Solo | $58/mo | $29/mo (lifetime) | $44/mo (lifetime) | Individual coach/consultant |
| Practice | $149/mo | $75/mo (lifetime) | $112/mo (lifetime) | Small team, most popular |
| Studio | $349/mo | $175/mo (lifetime) | $262/mo (lifetime) | Agency, multi-seat, white-label-ready |
| Studio+ | $999/mo (Phase 3+) | — | — | White-label agency reseller |
| Enterprise | Custom, avg $2.4K-5K/mo | — | — | Annual contract, dedicated support, SLA |

**All tiers include:** full platform access (People · Pipeline · Command Center · Calendar · Paige chat · Marketplace access · Community).

### Layer 2 — Included credits per tier

Three credit categories, each tier-sized to comfortably cover typical usage. Only whales/agencies-at-scale/heavy-Vibe-users hit the ceiling.

**Paige brain credits** (Paige chat + auto-drafts + reasoning + memory ops):
- Solo: 5,000 credits/mo
- Practice: 25,000 credits/mo
- Studio: 100,000 credits/mo
- Enterprise: unlimited within fair-use policy

**Vibe Studio credits** (creative gen — images · pages · forms · video · templates):
- Solo: 50 credits/mo (~10 landing pages worth of typical work)
- Practice: 200 credits/mo
- Studio: 1,000 credits/mo
- Enterprise: 5,000 credits/mo + purchase packs

**Voice credits** (Vapi minutes · TTS · STT — once Voice Layer ships):
- Solo: 60 min/mo
- Practice: 300 min/mo
- Studio: 1,500 min/mo
- Enterprise: custom

**Credit consumption per operation (Vibe Studio example):**
- Simple form generation: 1 credit
- Landing page: 5 credits
- Full campaign asset pack: 20 credits
- Video generation (short): 20 credits
- Video generation (long): 50 credits

**Calibration:** these numbers are placeholders based on assumed API costs. Phase 0 beta data → real calibration → Phase 2 confidence in tier sizing.

### Layer 3 — Credit packs (overage + expansion)

Purchased ad-hoc from Setup → Billing → Credits when tenant approaches or exceeds included allowance.

**Vibe Studio credit packs:**
- 100 credits = $30 ($0.30/credit)
- 500 credits = $125 ($0.25/credit — volume discount)
- 2,500 credits = $500 ($0.20/credit — bulk discount)

**Voice credit packs (post-Voice Layer):**
- 100 min = $25 ($0.25/min)
- 500 min = $100 ($0.20/min)
- 2,500 min = $400 ($0.16/min)

**Paige brain credit packs:**
- 10K credits = $10 ($0.001/credit)
- 50K credits = $40 ($0.0008/credit)
- 250K credits = $150 ($0.0006/credit)

**Overage handling policy (owner picks per tenant preference):**
- **Block** (default for Solo tier) — usage stops at credit exhaustion, prompt to buy more
- **Warn + continue** (default for Practice tier) — soft cap warning at 80%, hard prompt at 100%
- **Auto-purchase-at-threshold** (Studio + Enterprise) — automatically buys next credit pack from card on file at 90% consumption; prevents workflow interruption

**Credits don't expire on Studio tier** — Studio-only perk, sales pitch differentiator.

**This layer is where margin expansion lives.** Base tier covers costs + modest margin; credit packs are pure high-margin revenue.

### Layer 4 — Rebillable pass-through services (GHL A+ Services model)

Tenant uses their own external services routed through Paige, marked up with itemized billing. Ships in Phase 2.

**Services:**
- **SMS** (Twilio) — cost + 15-20% platform fee
- **Email** (SendGrid/similar) — cost + 15-20%
- **Voice** (Vapi calls) — cost + 15-20%
- **Third-party LLM overages** (Claude/GPT-5/Gemini beyond included credits, BYOK) — cost + margin

**Tenant experience:** itemized usage on billing dashboard, monthly invoice for pass-through + margin.

**Same shape GHL has trained the coaching-industry audience on for years** — no education needed.

### Layer 5 — Marketplace revenue-share (per §18 App Store framing)

Marketplace is the App Store for the Paige OS. Ships in Phase 2 (paid skills open) after Phase 0-1 seed the free-only catalog.

**Split:**
- **70/30 revenue split** on paid skills, Playbooks, templates (builder 70, platform 30)
- **Free skills stay free** — ecosystem-first, not paywall-first
- **Standard Salesforce AppExchange / Apple App Store terms**

**What's for sale in Marketplace:**
- **Paid skills** (single capabilities — "Discovery Call Booking Skill" · "Proposal Generator" · "LinkedIn Content Skill" — $9-99/mo per skill)
- **Vertical Playbooks** ($39-99/mo — Funding · Consulting · Agency · Real Estate · Insurance · Healthcare · Legal · Financial Advisory)
- **Whole business templates** (one-time purchase, $500-2000 — "Sam Ovens-style Consulting Practice Template" · "Cole Gordon Sales Team Template" · "Alex Hormozi Acquisition Playbook Template")
- **Integrations** (some free, some paid; premium integrations $19-49/mo)

**At scale, Marketplace = second revenue engine that grows without platform headcount.** OS thesis paying off.

### Layer 6 — Enterprise / white-label / high-touch add-ons

Ships incrementally across Phase 2 → Phase 4.

**Enterprise tier (Phase 2 → formalized Phase 3):**
- Custom pricing (avg $2,400/mo Phase 3, $5,000/mo Phase 4)
- Unlimited credits within fair-use OR fixed annual credit allowance
- Dedicated success partner
- SLA
- Custom Paige personality / voice training
- White-label option
- Annual contract standard

**Studio+ white-label tier (Phase 3):**
- $999/mo base
- Custom domain
- Remove Paige branding
- Agency reseller mode with sub-account credit allocation
- Multi-workspace management for agencies serving multiple clients

**Add-ons available on any tier (Phase 3+):**
- Priority support: $99/mo
- Custom onboarding: $499 one-time
- Dedicated account manager: $499/mo (Enterprise only)

---

## 5. Credit ledger primitive design (for Money Spine / Lane B)

The credit ledger is the load-bearing primitive for Layers 2, 3, 4, and 6. Build it right in Lane B.

### Data model

**`tenant_credit_balances`** — current balance per tenant × credit category
- `tenant_id` (FK)
- `credit_category` (enum: `paige_brain` · `vibe_studio` · `voice` · `platform_addon` · custom)
- `included_monthly` (int — from tier)
- `purchased_balance` (int — from credit packs)
- `consumed_this_period` (int — resets on billing cycle)
- `updated_at`

**`tenant_credit_transactions`** — append-only log of every consumption + purchase + refill
- `id` (PK)
- `tenant_id` (FK)
- `credit_category`
- `transaction_type` (enum: `included_refill` · `pack_purchase` · `consumption` · `refund` · `adjustment`)
- `delta` (int, +/-)
- `balance_after` (int)
- `related_action_id` (nullable — links to `paige_action_kinds` execution)
- `related_stripe_id` (nullable — links to Stripe payment intent for pack purchases)
- `metadata` (jsonb — context per transaction)
- `created_at`

**`credit_pack_products`** — Stripe SKU catalog for credit packs
- `id` (PK)
- `credit_category`
- `credits_included`
- `price_cents`
- `stripe_product_id`
- `stripe_price_id`
- `is_active`

**`tenant_credit_policies`** — per-tenant overage handling preferences
- `tenant_id` (FK)
- `overage_policy` (enum: `block` · `warn_continue` · `auto_purchase`)
- `auto_purchase_threshold` (int — % of consumption that triggers auto-purchase)
- `auto_purchase_pack_id` (FK to `credit_pack_products`)
- `monthly_budget_cap_cents` (nullable — hard ceiling for auto-purchase)

**`paige_action_credit_costs`** — configuration table mapping action kinds to credit consumption
- `action_kind` (FK to `paige_action_kinds`)
- `credit_category`
- `credit_cost` (int)
- `is_active`

### Instrumentation pattern

Every high-cost action (Vibe generation, voice minute, high-token op) fires through a `consume_credits` RPC:

```sql
consume_credits(
  tenant_id,
  credit_category,
  amount,
  related_action_id
) RETURNS { success: bool, remaining_balance: int, policy_action: text }
```

The RPC:
1. Checks current balance
2. If sufficient: decrements + logs transaction + returns success
3. If insufficient: applies tenant's overage policy (block/warn/auto-purchase)
4. On auto-purchase: creates Stripe charge, refills balance, retries consumption
5. Returns policy action for UI to communicate ("Insufficient credits · Buy more?" or "Auto-purchased 500 credits from card on file")

### Sub-account credit allocation (agency tier, Phase 3)

Studio+ / Enterprise agency tenants can allocate their credit pool across sub-accounts:

**`sub_account_credit_allocations`**
- `parent_tenant_id` (FK)
- `sub_account_id` (FK)
- `credit_category`
- `monthly_allocation` (int)
- `spillover_policy` (enum: `hard_cap` · `spillover_to_parent`)

Enables agencies serving multiple client businesses to control credit distribution per client.

### Reporting

- **Tenant view (Setup → Billing → Credits):** balance per category · consumed this period · projected exhaustion · purchase pack CTA · toggle overage policy
- **Manager view (Team → Credits):** allocation per sub-account (agency tier)
- **Analytics surface:** credit burn rate trending · projected next-month usage · cost-per-outcome by department (§16)
- **Operator view (Super Admin):** cost basis per credit category · tenant credit consumption cohort analysis · Marketplace credit spending patterns

### Migration + backfill

- Phase 0 beta tenants: seed with `paige_brain_credits = 999,999` and `vibe_studio_credits = 999,999` so credits are effectively unlimited during beta; instrument consumption to gather usage data without enforcement
- Phase 1 wave 2/3: enforce tier limits at ~3x conservative estimates
- Phase 2 GA: enforce tier limits at calibrated values from Phase 0-1 data

---

## 6. Marketplace revenue-share mechanics (Stripe Connect implications)

**When Marketplace paid skills open in Phase 2, platform payment model changes.** Plain Stripe (charge on behalf of Paige) works for Layers 1-4. Layer 5 (Marketplace revenue-share) requires **Stripe Connect** — platform routes portion of payment to builder's connected Stripe account.

**Stripe Connect setup (Phase 2 launch):**
- Builder onboards via Stripe Express (Connect Express account)
- Platform holds the customer relationship
- On paid skill activation: platform charges customer, holds 30%, transfers 70% to builder's connected account
- Platform handles all customer support / refunds; builder handles skill-level bug support
- Payouts to builders on standard Stripe schedule (2-day rolling)

**Compliance implication:** notify Stripe when Marketplace paid skills open. May require re-underwriting to add Connect. Not a blocker for pre-Phase-2 build.

**Vertical Playbook add-ons ($39-99/mo)** — decide before Phase 2: are Playbooks first-party (Paige builds, revenue is 100% Paige) or third-party (community-built, 70/30 split)?
- **My rec:** first-party for Funding + Consulting + Agency (Antonio's team builds these) = 100% Paige revenue
- **Third-party for later verticals** (Real Estate · Insurance · Healthcare · Legal · Financial Advisory) once ecosystem developers pick them up = 70/30 split
- Flexibility: any Playbook can be either; Marketplace UX just shows Publisher badge

---

## 7. Stripe products spec (for Money Spine build)

Products to create in Stripe by phase:

### Phase 0/1 (Beta)
- Wave 1 lifetime tiers: Solo $29 · Practice $75 · Studio $175 (recurring monthly, no expiration)
- Wave 2 lifetime tiers: same as Wave 1 (separate SKUs for tracking)
- Wave 3 lifetime tiers: Solo $44 · Practice $112 · Studio $262 (recurring monthly)
- Wave 1 free-with-commitment: $0 product with metadata flag `wave1_partner=true` and auto-transition scheduled at Month 7

### Phase 2 (GA)
- Full GA tiers: Solo $58 · Practice $149 · Studio $349 (recurring monthly)
- Credit packs (one-time): 100 Vibe · 500 Vibe · 2500 Vibe · 100 min Voice · 500 min Voice · 2500 min Voice · brain-credit packs
- Funding Playbook add-on: $49/mo (recurring)
- Rebillable services metering (Stripe usage-based billing): SMS · Email · Voice minutes at cost + margin

### Phase 3 (Scale)
- Full Phase 3 tiers: Solo $79 · Practice $199 · Studio $449 (new customers)
- Studio+ white-label: $999/mo
- Enterprise: custom quote-based
- Additional vertical Playbook add-ons ($39-99/mo each)
- Marketplace revenue-share (Stripe Connect Transfer objects)

### Phase 4 (Category Leadership)
- Premium tiers: Solo $99 · Practice $249 · Studio $599
- Enterprise avg $5K/mo
- Multi-currency versions of all products
- Annual prepay variants (10-15% discount)

**Product metadata pattern:** every product carries `phase`, `wave` (if applicable), `grandfather_policy` (`lifetime` · `12_month` · `standard`), and `tier_category` for cohort analysis.

---

## 8. Money Spine (Lane B) scope — revised

Original Lane B scope: Stripe · tiers · usage metering · billing dashboard · dunning. Adding token-based credits + Marketplace revenue-share + Playbook add-ons + rebillable services expands scope meaningfully. Recommended sub-slice breakdown:

**Lane B-i — Stripe primitives + subscription tiers**
- Stripe integration setup
- Subscription products (all tiers, all waves)
- Checkout flow (embedded via Stripe.js)
- Customer portal (self-service billing management)
- Subscription lifecycle webhooks
- Trial handling (for Wave 1 6-month free)
- Basic invoicing + dunning

**Lane B-ii — Credit ledger primitive**
- All 4 credit tables + RPC (`consume_credits`)
- Instrumentation on high-cost surfaces (Vibe · Voice endpoints)
- Tenant credit balance display in Setup → Billing
- Overage policy configuration UI
- Credit pack products in Stripe + purchase flow

**Lane B-iii — Wave transition mechanism**
- Wave 1 auto-conversion at Month 7 (free → founding-wave-1 paid tier)
- Wave metadata on customer records
- Grandfather policy enforcement (price hikes don't apply to grandfathered customers)
- "Founding Member" badge display

**Lane B-iv — Playbook add-on billing (Phase 2)**
- Funding Playbook as recurring add-on subscription
- Playbook activation writes to tenant_playbooks config
- Playbook deactivation cancels the sub-subscription

**Lane B-v — Rebillable services metering (Phase 2)**
- SMS/Email/Voice usage tracking per tenant
- Stripe usage-based billing metered subscriptions
- Cost + margin markup logic
- Itemized billing dashboard

**Lane B-vi — Marketplace revenue-share (Phase 2, requires Stripe Connect)**
- Stripe Connect Express onboarding for builders
- Charge with `application_fee_amount` for the 30% platform take
- Transfer to builder's connected account on 70/30 split
- Marketplace purchase flow
- Builder payout dashboard

**Lane B-vii — Analytics + reporting (Phase 2/3)**
- Revenue analytics per tier / wave / phase
- Credit consumption analytics
- Cohort retention curves (feeds Analytics surface §3.6)
- NRR calculation
- Marketplace take-rate reporting

**Sub-slice sequencing:** B-i → B-ii → B-iii ship for GA launch (Month 16). B-iv/v/vi/vii ship after GA in Phase 2 rollout as each revenue engine activates.

---

## 9. Investor arc — the story at each phase

### End of Year 1 (Phase 0 → Phase 2 partial)
- 500-1,500 paying tenants
- ARR: $1-3M
- **Pitch:** "We proved product-market fit with 25 hand-picked design partners. Public GA launched at $58/149/349. 1,000+ paying tenants across three founder waves plus GA. NRR 115%. Marketplace open with 50+ free skills seeding the ecosystem. Funding Playbook attach rate 40%. Six revenue engines architected, three activated. Ready to raise Series A."

### End of Year 2 (Phase 3 mid)
- 5,000-10,000 tenants + first 30-50 Enterprise contracts
- ARR: $8-20M
- **Pitch:** "We raised prices 35% with zero churn spike — proved pricing power. Enterprise ACV $28K annual. Marketplace revenue $200K/mo. Three vertical Playbooks live at $39-99/mo. Founder cohort NRR 140% (proving even biggest-discount customers expand). Rebillable services $80K/mo. Six revenue engines all activated. Ready for Series B."

### End of Year 3 (Phase 4)
- 25K+ tenants + 200+ Enterprise + international
- ARR: $30-60M
- **Pitch:** "We defined the AI-COO category. Premium repositioning at $99/249/599/1499. Enterprise avg $60K annual. Marketplace $1M+/mo. International in 8 countries. NRR 145%. Six revenue engines compounding at scale. Proven pricing power in a category we own. Rule of 40: 65%. Path to $1B ARR clear via Enterprise expansion + Marketplace + international. Positioned for Series C or strategic acquisition."

### Path to $1B ARR (per §17 doctrine)
- $1B ARR = ~$83M MRR
- Enterprise-heavy composition: $5K avg × 16,600 customers = $80M+/mo from Enterprise alone
- Plus Practice/Studio SMB tail
- Plus Marketplace take-rate
- Plus vertical Playbook subscriptions
- Plus rebillable services margin
- **Multiple revenue engines compounding** — the investor thesis for $5B+ valuation

---

## 10. Locked decisions (owner-answered 2026-07-21)

1. **Wave 1 (design partners) — free for 6 months, then auto-convert to Wave 1 lifetime pricing.** Number confirmable/changeable by owner.
2. **Wave 2 & 3 (public beta / early access) — 50% and 25% off GA respectively, locked lifetime at signup tier.**
3. **Grandfather policy for Founder Waves — lifetime lock at discount percentage** (upgrades preserve discount %, not fixed dollar amount).
4. **Post-GA grandfather policy — 12-month price lock when tier prices rise, then step-up** (standard SaaS pattern).
5. **Founder campaign closes at GA launch (Month 16)** — no more founder-tier signups after that.
6. **Bounded founding cohort — ~625 total customers** across all three waves.
7. **Credits gate high-variable-cost surfaces only** (Vibe · Voice · high-token bulk). Core platform + Paige chat stays uncapped.
8. **6-layer monetization stack** — all engines architected from Money Spine build, activated across Phases 0-4.
9. **Marketplace revenue split — 70/30** (builder / platform) — Salesforce AppExchange standard.
10. **First vertical Playbook (Funding) is first-party** — 100% Paige revenue. Future verticals may be third-party via Marketplace 70/30.

---

## 11. Open questions (to answer as data arrives)

1. **Exact credit sizing per tier** — placeholder numbers now; calibrate from Phase 0 usage data before Phase 2 GA.
2. **Credit-pack pricing** — placeholder numbers; adjust based on real API cost basis + margin target (aim 70-80% gross margin).
3. **Overage policy defaults per tier** — recommend `block` for Solo, `warn_continue` for Practice, `auto_purchase` for Studio+. Confirm during Phase 2 build.
4. **Enterprise fair-use policy specifics** — define concrete "reasonable use" thresholds before first Enterprise contract closes.
5. **Multi-currency + international timing** — Phase 4 default, but may accelerate to Phase 3 if Enterprise pipeline is international-heavy.
6. **Annual prepay discount** — 10% vs 15% vs 20%; test with first Enterprise contracts in Phase 3.
7. **Third-party developer program timing** — Phase 4 default, could accelerate to Phase 3 if Marketplace demand justifies.
8. **Which vertical Playbooks to build in-house vs. leave to community** — Funding + Consulting + Agency first-party locked; Real Estate / Insurance / Healthcare / Legal / Financial Advisory decided as demand signals arrive.

---

## 12. Related workstreams this doc informs

- **Money Spine (Lane B)** — this doc drives Lane B scope, sub-slice breakdown, Stripe products, credit ledger primitives
- **Marketplace ecosystem (§18 doctrine)** — this doc defines the revenue-share model that Marketplace runs on
- **Analytics surface (Slice 1c-x)** — cohort reporting, NRR calculation, credit consumption analytics, Marketplace take-rate reporting all wire in
- **Marketing site** — pricing page, founder-wave campaign copy, Playbook add-on marketing all draw from this doc
- **Investor materials** — investor arc + $1B path per §17 doctrine
- **Onboarding flow** — trial handling, Wave 1 conversion, upgrade path, credit-pack purchase flow all specified here

---

**End of doc. Locked at 2026-07-21. Amendments require owner review + explicit update. Next revision expected post-Phase-0 beta data (~Month 6) to calibrate credit sizing.**
