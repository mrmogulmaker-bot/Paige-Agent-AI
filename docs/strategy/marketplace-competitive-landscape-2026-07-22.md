# Paige Agent AI — Marketplace Competitive Landscape

**For:** Antonio · **Date:** 2026-07-22 · **Status:** locked as reference doc for Money Spine Lane B-vi (Marketplace revenue-share infrastructure) + CX-5 (client-side blocks catalog)

**Purpose:** capture verified competitive data on peer-to-peer marketplaces in the coach/consultant/agency/business-ops space so Paige's Marketplace (§17 Layer 5) ships with informed pricing, IP-protection, curation, and creator-payout decisions — not vibes. Includes a debunk of two Google-AI claims we were briefly working from.

**Related doctrine + docs:**
- CLAUDE.md §17 — $1B Growth Map (Marketplace = Layer 5 revenue engine)
- CLAUDE.md §7/§8/§14 — Playbooks ship as *living orchestration*, not dead configuration (the core differentiator vs. Snapshots)
- CLAUDE.md §9 — tenant isolation (mandatory for anything Marketplace-installed)
- CLAUDE.md §11 — world-class floor (curation, review, verified-creator badge)
- `docs/strategy/monetization-rollout-2026-07-21.md` — Layer 5 rev-share model, Money Spine Lane B-vi
- `docs/strategy/client-experience-workstream-2026-07-21.md` — CX-5 client-side blocks catalog + block architecture

---

## 0. Executive summary

Coaches, consultants, and agencies today buy either **integration marketplaces** (HubSpot, Salesforce, Zapier — vendor-to-customer) or **backend-configuration marketplaces** (GoHighLevel Snapshots — peer-to-peer). GoHighLevel dominates the peer-resell category in our space; every "template" competitor is either a curated small catalog (HoneyBook) or has no marketplace at all (Dubsado, Paperbell, Delenta, Practice, CoachAccountable, Coaches Console).

**What matters for Paige:**

1. **Our planned 70/30 rev-share is at the aggressive end of the market.** Real B2B/CRM marketplace rev-share clusters at **0–15%** for the platform. Only ClickFunnels (70/30) and Bubble (75/25) sit near us; everyone else is more creator-favorable. Defensible ONLY with MoR + tax + IP protection + Paige-native execution — otherwise consider a **tiered model** (15% for tenant-authored skills, 30% for higher-service-tier).
2. **The "whole backend build" whitespace is real and defensible.** Snapshots proved coaches will pay $500–$5K for a business-in-a-box. But Snapshots ship as *dead configuration*. Paige's differentiator: Playbooks ship as *living orchestration* — Paige and her team actually execute them. Position: **"buy a running team, not a template library."**
3. **Two IP-protection patterns to copy:** Notion's **access-locking** (prevents redistribution outside buyer's workspace) + Webflow's **fulfillment links** (creators sell on own site with auto-install into buyer's tenant).
4. **CX-5 (client-side blocks) is category-original.** Every competitor sells operator-side configuration. Nobody sells client-portal experiences. Higher creator take (80/20 or 90/10) may be right to seed this catalog.
5. **Two Google AI claims to correct:** HoneyBook DOES have a peer marketplace (Template Partner Program). And "70/30 is the AppExchange standard" is a myth — that's consumer app-store norm, not B2B/CRM norm.

---

## 1. Verified rev-share table (published terms only)

| Platform | Creator take | Platform take | Listing/review fee | Payout cadence | Notes |
|---|---|---|---|---|---|
| **GoHighLevel Snapshots + Apps** | 100% | 0% (through 12/31/2026) | None | Monthly via Tipalti | Waived commission may end 2027 |
| **HubSpot App Marketplace** | 100% | 0% | Free listing + free cert | Direct — dev bills customer | Platform monetizes via CRM subscriptions |
| **Zoho Marketplace** | ~100% | Not publicly stated | Not published | Monthly on 1st | |
| **Skool Marketplace (classifieds)** | 100% | 0% | None | Direct seller-to-buyer | Different from Skool community payment fees |
| **Webflow Templates** | **95%** | **5%** | Application-gated | Stripe | Fulfillment links let sellers sell anywhere |
| **Notion Marketplace** | ~92% (minus $0.40/txn) | **8% + $0.40/txn** | Waitlist review, free | Biweekly Thursdays, $20 min, 14-day hold | Access locking + webhooks + coupons |
| **Salesforce AppExchange (ISVforce)** | **85%** (90% at scale) | **15%** (10% at scale) | **$999** security review | Salesforce checkout | Gold standard enterprise model |
| **Salesforce AppExchange (OEM)** | **75%** (85% >$20M) | **25%** (15% >$20M) | $999 | Salesforce | |
| **Bubble Marketplace** | **75%** | **25%** | None published | Monthly on 5th (Stripe/PayPal) | |
| **ClickFunnels Marketplace** | **70%** | **30%** | Quality review | Immediate to Stripe | Plus recurring CF affiliate if buyer signs up |
| **HoneyBook Template Partner Program** | Not published | Not published | Curated 2-round review, min $29 | Not published | Peer-authored, curated |
| **Kartra Campaign Marketplace** | Not published | Not published | Compliance review | Kartra handles pmt/delivery | |
| **Kajabi Theme Marketplace** | Not published | Not published | Application + samples required | Not published | Single-license, not resellable |
| **Airtable / Make / n8n / Zapier** | N/A native | N/A native | N/A | N/A | Creators sell externally (Gumroad, Etsy) |
| **PAIGE (planned, per current monetization doc)** | 70% | **30%** | TBD | TBD | Under review; see §5 recommendation |

---

## 2. Category A — Coach/consultant-native CRMs

### 2.1 GoHighLevel — Snapshots + App Marketplace (the deep dive; our primary reference)

**What gets sold.** Snapshots package an entire sub-account configuration: pipelines, workflows/automations, funnels & websites, email/SMS templates, calendars, forms, surveys, triggers, and custom values. It is genuinely "here is a fully-built business-in-a-box for [niche]." Apps (via the separate developer marketplace) are third-party integrations to the platform.

**Pricing models.** Snapshot sellers can list free, one-time paid, monthly recurring, or annual recurring. Real-world listing prices span $97–$997 one-time, with premium niche snapshots (medspa, roofing, insurance) reportedly grossing $10K–$30K each.

**Rev share.** HighLevel currently deducts **no commission** from developer/snapshot marketplace revenue through at least Dec 31, 2026 — creators receive the full payment. Payouts run monthly via Tipalti on the 15th. This is an ecosystem-seeding move; commission likely returns in 2027.

**IP protection.** Snapshots load into a sub-account; the buyer can inspect and modify. There is no native "locked" mode — this is a known weakness. Sellers work around it with SaaS-mode entitlements (charge per sub-account per month) and versioned re-loads. **This is exactly the leakage disease we should design AWAY from from day one.**

**Ecosystem maturity.** Hundreds of snapshot sellers, dedicated marketplace domain (marketplace.gohighlevel.com), active resale/agency community, healthy third-party guide ecosystem. No published GMV or seller-earnings numbers.

**Positioning takeaway for Paige:** GoHighLevel proved the demand and the price points. But Snapshots are dead configuration. Our thesis (Playbook = living orchestration executed by Paige's own AI team) is a category-differentiator, not an incremental improvement. Sell "buy a running team," not "buy a template."

### 2.2 HoneyBook — Template Partner Program

Peer creators sign a creator agreement, submit templates through a curated review (up to 2 rounds), and get published in the HoneyBook template gallery. Minimum pricing enforced (one-page templates start at $29). Creators also earn referral commissions (up to $200) when buyers sign up for HoneyBook via a template link.

Rev-share percentage not publicly disclosed. Small catalog compared to GoHighLevel. **This is what Google AI missed** — HoneyBook is NOT marketplace-free.

### 2.3 The "no marketplace" group

**Dubsado · Paperbell · Practice.do · CoachAccountable · Coaches Console.** Extensive search turned up **no native peer-to-peer resell marketplace** on any of these. All ship built-in template libraries (contracts, questionnaires, workflows) and support template sharing with clients, but no creator-monetized exchange. Google AI's claim verified for these five.

**17hats · Bloom.io · smaller SMB CRMs.** No marketplaces found.

---

## 3. Category B — Agency platforms (reseller model, not peer-to-peer)

### 3.1 Vendasta

White-label agency platform where partners resell (a) Vendasta-owned products, (b) curated third-party marketplace apps, and (c) their own products/services added to the storefront. Agencies set retail prices and markups above wholesale.

**This is a reseller/aggregator model, not a peer-to-peer creator marketplace** — an agency isn't selling its configuration to another agency; it's reselling apps to local-business end clients. Different economic layer from Snapshots.

### 3.2 GoHighLevel white-label (SaaS Mode)

In parallel to snapshots, HighLevel agencies white-label the entire platform and resell to sub-accounts (SaaS mode). Combined with snapshots, this creates a **two-tier economy**: creators sell snapshots to agencies; agencies resell the whole configured platform to small businesses.

**This is the model closest to what Paige is planning** (§9 tenant-scoped white-label + Marketplace resale of Playbooks). Both layers monetize.

---

## 4. Category C — Funnel/course/community platforms

### 4.1 ClickFunnels Marketplace

Native marketplace for funnels/templates. **70/30 (creator/platform)**, paid immediately to Stripe. Sellers also earn CF's recurring affiliate commission when buyer signs up for ClickFunnels through the funnel.

**Closest published analog to Paige's planned 70/30.** Worth watching how ClickFunnels defends their take — largely via distribution + brand + attached affiliate commission economics.

### 4.2 ClickFunnels Share Funnels

Separate free-sharing mechanic (still active in CF Classic and CF 2.0). A share link clones the entire funnel into another user's account. Not monetized — used for lead gen and CF affiliate acquisition. Historically bundled with the $19/mo Share Funnel Plan (discontinued 2019).

### 4.3 Kartra Campaign Marketplace

Sellers package a campaign (funnels, pages, emails, automations) and list in marketplace free or paid. Buyers install via share code. Requires quality/compliance review. Rev-share not published — worth pinging their partner team.

### 4.4 Kajabi Theme Marketplace

Curated theme marketplace (designer application + samples required). Templates $22–$897. Purchase licenses typically single-site — templates **cannot be resold** by the buyer. No peer-to-peer resell of course/coaching configurations. Funnel templates built-in, not a creator marketplace.

### 4.5 Circle.so

Creators sell courses, memberships, coaching, and communities *to end users*. No peer-to-peer marketplace for reselling Circle configurations or templates.

### 4.6 Skool Marketplace

"Skool Marketplace" is a **classifieds** where creators sell digital products, physical goods, and services peer-to-peer with **0% platform fee** (sellers keep 100%). Skool's own payment-processing fees (2.9%+$0.30 Pro / 10%+$0.30 Hobby) apply separately when creators sell community access.

Note: this is community classifieds, not a Skool-configuration exchange. Different from a real creator marketplace.

### 4.7 Systeme.io

Users can "showcase offers" on Systeme's marketplace and share full funnels with one click. Third-party template shops exist around Systeme (funnelvibe, systemeiotemplates.com). No formal published creator rev-share for a native paid marketplace.

---

## 5. Category D — Horizontal SaaS marketplaces (context for what "mature" looks like)

These aren't in our direct competitive set, but they set the market norms for pricing, IP protection, and creator experience.

### 5.1 Salesforce AppExchange

**ISVforce 15%** of net revenue (drops to 10% at scale); **OEM 25%** (drops to 15% over $20M). Plus **$999 security review** per submission. Credit-card checkouts add $0.30 per transaction. Gold standard for enterprise B2B marketplaces.

### 5.2 HubSpot App Marketplace

**0% revenue share.** Free listing, free certification, developer bills customer directly (own Stripe/HubSpot Payments). HubSpot monetizes via CRM subscriptions; marketplace exists to make HubSpot stickier. **Fastest way to seed a marketplace, but only works if the CRM subscription is the primary revenue engine.**

### 5.3 Notion Marketplace (best-in-class creator experience)

**8% fee + $0.40 per transaction** (creator keeps ~92%). Notion is merchant of record, handles VAT/sales tax, uses Stripe. Biweekly payouts on Thursdays, 14-day fund hold, $20 minimum payout.

**Access locking prevents buyers from re-duplicating templates to other workspaces** — best-in-class IP protection. Also ships webhooks and coupons for creators. Applications gated by waitlist review.

**Copy this whole stack for Paige.**

### 5.4 Webflow Templates

**95% creator / 5% Webflow** (as of Oct 2025). **Fulfillment links** let creators sell templates *outside* Webflow (own site, Etsy, etc.) with auto-install into buyer's Webflow workspace. Most creator-favorable model in the market.

**Copy the fulfillment-link pattern.**

### 5.5 Bubble Marketplace

**75/25 (creator/platform)** for templates and plugins. Monthly Stripe/PayPal payouts on the 5th. License enforcement handled at template/plugin instance level.

### 5.6 Zapier, Zoho, Make, n8n, Airtable Universe

Zapier Shared Zaps deprecated → replaced with curated "guided templates" (partner-acquisition, not monetized). Zoho pays ~100% (no published fee). Make + n8n have public template galleries with no native monetization (creators sell externally on Gumroad). Airtable Universe is a community showcase; creators monetize externally (Getly takes 20%).

**Takeaway:** every automation platform failed to build a real creator monetization layer. Space is open.

---

## 6. Strategic implications for Paige — 8 concrete calls

### 6.1 Tier the rev-share, don't apply 30% flat

Our currently-planned 70/30 is at the aggressive end of the market. Only Bubble (75/25) and ClickFunnels (70/30) are near us. Defensible only if we deliver MoR + tax + IP protection + Paige-native execution.

**Recommendation for Money Spine Lane B-vi design:**

| Marketplace tier | Creator take | Platform take | What buyer gets | What platform provides |
|---|---|---|---|---|
| **Community skills** (tenant-authored, uncurated) | 90% | 10% | Bare skill package, no support | Distribution + billing |
| **Verified skills** (curated, review-approved) | 85% | 15% | Support + review + verified badge | Distribution + billing + review + MoR + tax |
| **Paige-executed Playbooks** (whole business-in-a-box) | 70% | 30% | Playbook + Paige's team executes it + support + IP protection | Full stack: MoR + tax + IP protection + Paige-native execution + support + review + refunds + fraud + distribution |
| **CX-5 client-side blocks** (net-new category) | 80% | 20% | Client-portal component + tenant support | Distribution + billing + MoR + review + block-SDK + docs (higher creator take to seed catalog) |

This range brings us from "aggressive-only" to "competitive across the spectrum" — cheap community tier competes with GoHighLevel and Zoho; premium tier justifies its take with real service.

### 6.2 Own the "whole running business" category

GoHighLevel Snapshots proved the demand + price points ($500–$5K, some $10K–$30K). Snapshots are dead configuration; Paige Playbooks are living orchestration executed by Paige's own AI team (§7/§8/§14).

**Pitch:** *"Every competitor sells you templates. Paige sells you a team that already knows how to run them."*

### 6.3 Copy Notion's access-locking model verbatim

Skills, Playbooks, and CX-5 blocks tenant-scoped, cryptographically bound, non-exportable by default, with seller-controlled update propagation. This solves the Snapshot-leakage disease that GoHighLevel sellers complain about publicly. Bake it in at CX-5 schema design + Money Spine Lane B-vi.

### 6.4 Copy Webflow's fulfillment-link pattern

Let creators sell Paige skills/Playbooks on their own sites, Gumroad, Etsy, Substack, etc., with auto-install links that provision the asset into the buyer's Paige tenant. **Every creator's audience becomes a Paige acquisition channel.** Massive distribution multiplier at zero platform-side marketing cost.

### 6.5 Merchant-of-record + tax handling is table stakes for 30% take

Notion charges only 8%+$0.40 and still handles VAT/sales tax, Stripe, refunds, chargebacks, fraud. If Paige is taking 30%, minimum bar to match: MoR status, global tax, dispute handling, refund windows, seller webhooks, coupons/discounting, biweekly-or-better payouts through Stripe Connect.

### 6.6 Curated review beats open floodgates for our audience

HoneyBook, Kajabi, ClickFunnels, and Notion all curate. GoHighLevel is more open and has quality-signal problems (well-documented in reviews). Paige should ship a **verified creator tier** with review + branded badge from day one (§11 world-class), and let uncurated tenant-authored skills exist in a lower-visibility "community" lane. Matches the tiered rev-share structure in §6.1.

### 6.7 Design for the two-tier economy from day one

GoHighLevel's real genius is stacking (a) snapshot creators → (b) agencies → (c) end-clients. Paige should explicitly design for this: Playbook creators sell to agencies; agencies re-brand under §9 white-label and resell the whole configured platform (with Playbook baked in) to their tenants.

Marketplace pricing accommodates both single-purchase and per-sub-account recurring — HighLevel supports both, maps directly to Paige's L2 tenant-service-billing table. This is already in the Money Spine data model.

### 6.8 CX-5 (client-side blocks) is category-original inventory

Every marketplace surveyed sells operator-side configuration. **No competitor sells client-portal experience components.** Unique to Paige's §7 two-way positioning. Higher creator take (80/20 or 90/10) may be right to seed the catalog since it's net-new inventory nobody else can list. Once established, this is a moat competitors can't quickly replicate.

---

## 7. Two Google AI claims to correct (for future record)

Google AI told the owner:

**Claim 1:** *"GoHighLevel is the only CRM in the coach/consultant space with a native marketplace for reselling."*
**Correct:** HoneyBook has the Template Partner Program — peer-authored, curated, monetized. It's just smaller and less visible than HighLevel's. GoHighLevel is dominant, not the only.

**Claim 2:** *"70/30 is standard AppExchange terms."*
**Correct:** 70/30 is Apple/Google consumer app-store norm, not B2B/CRM norm. Salesforce AppExchange is 15% (ISVforce); HubSpot is 0%; Notion is 8%; Webflow is 5%. The 70/30 framing is a myth in the enterprise context.

Preserve this section so we don't get talked back into the wrong benchmarks later.

---

## 8. Roadmap fit — where this doc lives

**Ships now (post-Slice-1c):** doc as reference; no build action.

**Ships when Money Spine Lane B-vi (Marketplace revenue-share infrastructure) is scoped:**
- Use §1 (rev-share table) + §6.1 (tiered take recommendation) as inputs to pricing decisions
- Use §6.3 (Notion access-locking) as IP-protection requirement
- Use §6.4 (Webflow fulfillment links) as distribution requirement
- Use §6.5 (MoR + tax + Stripe Connect) as billing infrastructure requirement
- Use §6.6 (verified creator tier) as review-workflow requirement

**Ships when CX-5 (Marketplace client-side blocks) is scoped:**
- Use §6.8 (higher creator take for CX-5) as pricing decision input
- Use §6.3 (access-locking) at block schema design

**Related doc trigger:** if we change our planned 70/30 rev-share, update `docs/strategy/monetization-rollout-2026-07-21.md` §Layer 5 to match.

---

## 9. Open questions (to answer as Marketplace design progresses)

1. **Solo tier Marketplace access** — do Solo tenants have limited installs, or unlimited? Practice + Studio + Enterprise = more permissive.
2. **Enterprise white-label of Marketplace** — do Enterprise tenants get their OWN Marketplace surface where their sub-accounts install? Vendasta model applies.
3. **Third-party developer program timing** — Phase 4 default; could accelerate if strong Marketplace demand from Wave 1 partners.
4. **Payout minimum threshold** — Notion is $20. Ours? Higher may reduce Stripe transaction costs; lower is more creator-friendly.
5. **Refund window** — Notion is 14 days. Fair for buyers, protects creators. Match?
6. **Featured placement / promoted listings** — is this a revenue stream beyond rev-share? Salesforce charges for premium placement.
7. **Bundle pricing** — Playbook that includes 5 blocks — how does rev-share split across creators when the bundle is one purchase?
8. **Non-US creator payouts** — Tipalti (HighLevel's choice) vs Stripe Connect Express — which handles international creators better?

---

## 10. Sources cited

- GoHighLevel: [Snapshots overview](https://help.gohighlevel.com/support/solutions/articles/48000982513-how-to-share-snapshots) · [Marketplace App Pricing](https://help.gohighlevel.com/support/solutions/articles/155000001217-set-up-your-marketplacapp-pricing) · [Selling with SaaS Plans](https://help.gohighlevel.com/support/solutions/articles/155000004187-selling-marketplace-snapshots-with-saas-plans) · [netpartners.marketing overview](https://netpartners.marketing/gohighlevel-snapshots/)
- HoneyBook: [Template Partner Program FAQs](https://help.honeybook.com/en/articles/9792684-template-partner-program-faqs) · [Selling Digital Products](https://www.honeybook.com/blog/how-to-sell-digital-products)
- Salesforce AppExchange: [Revenue Sharing docs](https://developer.salesforce.com/docs/atlas.en-us.packagingGuide.meta/packagingGuide/appexchange_checkout_rev_share.htm) · [Pricing model summary](https://magicfuse.co/blog/appexchange-pricing-and-monetisation)
- HubSpot: [Listing your app](https://developers.hubspot.com/docs/apps/developer-platform/list-apps/listing-your-app/listing-your-app) · [Third-party app billing](https://product.hubspot.com/blog/bid/83323/how-do-we-handle-billing-for-third-party-apps-in-our-marketplace)
- Notion: [Selling on Marketplace](https://www.notion.com/help/selling-on-marketplace)
- Webflow: [Template Creator Program updates 2025](https://webflow.com/updates/template-creator-enhancements)
- Bubble: [Selling on Marketplace](https://manual.bubble.io/account-and-marketplace/account-and-billing/selling-on-the-marketplace)
- ClickFunnels: [Marketplace pre-launch](https://www.clickfunnels.com/blog/clickfunnels-marketplace-prelaunch/) · [Share and clone a funnel](https://support.myclickfunnels.com/docs/how-to-share-and-clone-a-funnel)
- Kartra: [Campaign Marketplace listing](https://support.kartra.com/support/solutions/articles/153000174653-create-a-campaign-marketplace-listing) · [Share a campaign](https://support.kartra.com/support/solutions/articles/153000176140-share-a-campaign)
- Kajabi: [Theme Marketplace overview](https://supplygem.com/kajabi-theme-marketplace/)
- Skool: [Marketplace/Classifieds](https://www.skool.com/classifieds/skool-marketplace) · [Fees breakdown](https://www.skool.com/educate/skool-fees-29-03-per-transaction)
- Vendasta: [Marketplace overview](https://www.vendasta.com/marketplace/) · [Vendor Center docs](https://docs.vendasta.com/vendor-center/)
- Zoho: [Marketplace payments docs](https://www.zoho.com/developer/help/marketplace/payments.html)
- Zapier: [Share a template of your Zap](https://help.zapier.com/hc/en-us/articles/8496292155405-Share-a-template-of-your-Zap)

---

**End of doc. Locked at 2026-07-22 as reference for Money Spine Lane B-vi + CX-5. Amendments require owner review + explicit update. Feed to Claude Code when Money Spine Lane B-vi is scoped — not before.**
