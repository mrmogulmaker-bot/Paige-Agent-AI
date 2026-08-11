# Business Vault — Partner Landscape & Regulatory Research Report

**Date:** 2026-07-26 (filed 2026-08-04)
**Purpose:** Research backing for *Pillar 2 — Business Vault* in `docs/strategy/owner-trilogy-2026-07-26.md`.
**Scope:** 10 obligation categories, 5 pilot partner recommendations, regulatory friction ranking, competitive-timing thesis, §38 money-boundary check per pilot.
**Audience alignment:** coach / consultant / agency / thought-leader / advisor SMB tenants (never finance-vertical by default per §2).
**Honesty stance (§13):** anything not verifiable via public documentation is labeled *estimated* or *unverified*. Private partner terms are only knowable after direct outreach; the report says so where relevant instead of inventing numbers.

---

## Executive summary

The Business Vault opportunity is real, structurally underserved, and time-boxed. Nine of the ten obligation categories have viable partner economics or trivial in-house builds; only insurance carries genuine regulatory friction that must shape the entry pattern (facilitator, not licensee). The 5-pilot L3 stack in the Trilogy doc holds up in shape but needs three material corrections before an integration is scoped:

1. **The Connecticut anti-rebate reference in the Trilogy doc is factually wrong.** The $50 referral cap / $2,000 fine is **North Carolina** law (NCGS 58-33-82(f), 2023, extended to personal lines Oct 1, 2025 under SL 2025-45) — not Connecticut. Connecticut has its own anti-rebate statutes with different mechanics (§ 38a-825 / § 38a-414; the CID's public guidance uses a $15 de minimis gift threshold, not $50). The compliance principle the doc is arguing for is correct; the specific citation is not.
2. **Harbor Compliance acquired Firstbase in December 2025** — one of the two "fast-follow" competitors the Trilogy doc names is now inside one of the pilot partners it recommends. This is a strategic red flag: the same Pilot 2 vendor whose API Paige plans to plug into now owns a formation + operations platform that competes directly for the tenant relationship. Partnership terms must be negotiated with this conflict on the table, not around it.
3. **Northwest Registered Agent's published affiliate payout is $60 net per order, not $100 (RA) / $150 (formation).** The higher numbers in the Trilogy doc are inconsistent with what Northwest publishes on their affiliate page. Wholesale/API tier economics are not public and require direct outreach — do not model on the higher figure.

The 6-12 month competitive-timing window claim in the Trilogy doc is **broadly defensible but tighter than stated on the Doola side.** Doola already sells a $1,999/yr "Total Compliance" plan that bundles BOI, state compliance, bookkeeping, tax, and sales-tax registration — the horizontal-Vault shape is already partially built there. The window to differentiate on obligation-tracker positioning is closer to **3-9 months** on the Doola vector; the 6-12 month framing is more defensible against Firstbase (now Harbor Compliance) which will move at enterprise cadence.

Every pilot in the 5-partner stack passes the §38 money-boundary test: money flows partner → Paige as Paige-held affiliate/referral revenue (an L2 Marketplace-style rail), and no tenant client money routes through Paige's bank in any of the recommended patterns.

---

## Section 1 — The 10 Vault categories mapped

Each category shows obligation shape, representative vendors, typical price/economics, and regulatory friction color (green = free to refer, yellow = jurisdictional check needed, red = licensed-party model required).

### 1. Business insurance (GL, PL, WC, Cyber, BOP) — RED

- **Obligation shape:** annual/semi-annual renewal, coverage limits & endorsements, cancellation-notice windows (typically 30-60 days), claims history, certificates of insurance (COI) issuance for clients.
- **Sample vendors (embedded/API-first):** Coterie Insurance (NPN 16944666, licensed in all 50 states, docs.coterieinsurance.com, backed by Allianz X Series C), Coverdash (licensed 50 states, single-line-of-code embed, $13.5M Series A 2024), Thimble (on-demand SMB commercial, $30/lead affiliate), Embroker (~$250/company signup, focus on startups/tech/law), Colony (160+ profession SMB, general/professional/E&O/BOP), Simply Business (10% commission on 1,000+ profession catalog).
- **Sample vendors (broker/affiliate stub):** CoverWallet (Aon's SMB brand, $30/completed quote via FlexOffers, 30-day cookie).
- **Economics:** SMB average GL policy ~$45/mo, BOP ~$83/mo (Insureon 2026 benchmarks). Affiliate stub: **~$24-30 per completed quote (verified — FlexOffers listings)**. Embedded API commission: **not publicly disclosed** — Coterie/Coverdash economics require direct partnership discussion (*estimated single-digit % to low-teens % of premium as commission split; do not model without confirmation*).
- **Regulatory friction:** RED. Every state has an anti-rebate/anti-inducement statute AND a producer-licensing regime; interaction between the two governs whether an unlicensed technology platform can accept a referral fee for insurance. Two safe patterns exist: (a) affiliate stub via a licensed party (CoverWallet/FlexOffers pays fixed lead fee, no premium % → generally allowed as a fixed advertising fee below state caps, though several states still require a licensed intermediary), or (b) embedded API where the partner IS the licensed producer and Paige is only the technology surface (Coterie / Coverdash pattern). Never a percentage of premium routed through Paige unless Paige holds producer licenses.

### 2. Business formation (LLC, C-Corp, S-Corp, PLLC, non-profit) — GREEN

- **Obligation shape:** one-time filing at formation, entity-type-appropriate ongoing filings (see Category 4).
- **Sample vendors:** Northwest Registered Agent ($39 + state fees, affiliate + Wholesale API), Doola ($297-$1,999/yr tiers, offers affiliate + iFrame + white-label partnerships), Firstbase (now owned by Harbor Compliance as of Dec 2025), LegalZoom (multi-year partnership with 1-800Accountant since Dec 2024), ZenBusiness, Stripe Atlas, Clerky (attorney-built), Bizee (formerly Incfile).
- **Economics:** Northwest publishes $60 net per formation OR RA order via affiliate program (verified on their affiliate page and third-party aggregators; note the Trilogy doc's $100/$150 split is not corroborated). Doola partner terms are not publicly published; **direct outreach required**.
- **Regulatory friction:** GREEN. Formation-service referrals are a mature affiliate category with no producer-license overlay. Standard commercial disclosure.

### 3. Registered agent service — GREEN

- **Obligation shape:** annual renewal, state-by-state requirement, must be a physical address in each state of registration.
- **Sample vendors:** Northwest Registered Agent ($125/yr, best-in-class privacy), Harbor Compliance (RA included in filing bundles), LegalZoom, Bizee, Rocket Lawyer, Stripe Atlas (delegated to Middesk historically).
- **Economics:** Northwest $60 net per RA order via affiliate. Harbor Compliance HCA partner program economics not publicly disclosed; **direct outreach required**.
- **Regulatory friction:** GREEN. Referrals fully legal in all 50 states.

### 4. Annual filings, state charter, franchise tax, per-state licenses — GREEN

- **Obligation shape:** annual/biennial report per state of registration, franchise tax where applicable (DE, CA, TX, and others), business licenses per state and often per city, DBA renewals, foreign-qualification filings when doing business across state lines.
- **Sample vendors:** Harbor Compliance (~$199/state annual filing + government fees; HCA partner program with API at developers.harborcompliance.com), CorpNet, LegalZoom, Middesk, Northwest, FileForms.
- **Economics:** Harbor's HCA partner economics not publicly disclosed; API access is public and documented. Bundle pricing typical (e.g., all-50-state monitoring subscriptions).
- **Regulatory friction:** GREEN. Filing-service referrals are unregulated. Note: Harbor Compliance publicly markets no "white-label" product (per FileForms comparison marketing) — the Trilogy doc's "white-label option" claim needs to be verified in partner discussion, not assumed.

### 5. Domain registration & SSL — GREEN

- **Obligation shape:** annual domain renewal, SSL/TLS certificate expiration (typically 12 months for public CA-issued certificates), DNS record maintenance.
- **Sample vendors:** Namecheap (20% commission on domain registrations, 35% on SSL/hosting via direct affiliate, tiered up to 25-38% on Impact/CJ/ShareASale, 120-day cookie), GoDaddy, Cloudflare Registrar, Google Domains (transferred to Squarespace), Porkbun.
- **Economics:** Namecheap verified 20% domains / 35% SSL/hosting baseline via direct affiliate. Volume tiers 25-38% via major networks.
- **Regulatory friction:** GREEN. No regulatory friction. Trivial to add.

### 6. Trademark registration & maintenance — GREEN with caveats

- **Obligation shape:** USPTO application filing (Sections 1(a)/1(b)/44/66), Statement of Use at 6 months, first maintenance filing at years 5-6, renewal at years 9-10 and every 10 years thereafter, monitoring against confusingly-similar filings.
- **Sample vendors:** LegalZoom ($899 + USPTO fees, includes attorney), Trademark Engine, LegalZoom IP, direct-to-USPTO via TEAS, boutique IP firms.
- **Economics:** LegalZoom does not publish a trademark-specific affiliate rate; general LegalZoom affiliate rates (~$18-50 per order historically) apply. Direct-to-USPTO can't be affiliated. **Direct outreach required for LZ trademark-specific partner rates.**
- **Regulatory friction:** GREEN for referrals. YELLOW for anything approaching legal advice — Paige stays clear per §2 (not attorneys), routes to a licensed IP attorney partner or LegalZoom for filing. The obligation-tracking layer (upcoming Section 8/9 deadlines, upcoming renewals) is 100% safe.

### 7. Tax obligations (federal, state, quarterly estimates, sales tax, payroll tax) — GREEN

- **Obligation shape:** federal 1040/1120/1120-S/1065 annual, quarterly 1040-ES estimates, state income tax where applicable, state sales tax (varies dramatically by state and nexus rules post-Wayfair), payroll tax (941 quarterly + 940 annual + state equivalents), 1099-NEC issuance to contractors by January 31.
- **Sample vendors:** 1-800Accountant ($100/lead via ShareASale affiliate, 90-day cookie, LegalZoom multi-year partnership since Dec 2024), Bench (acquired by Employer.com Jan 2025, uncertain partner status), Pilot, TaxJar (sales tax), Avalara, Anrok.
- **Economics:** 1-800Accountant verified $100/lead via ShareASale, negotiable at volume. TaxJar/Avalara partner economics not publicly disclosed for SMB SaaS embeds.
- **Regulatory friction:** GREEN for referrals. Tax preparation itself is a licensed activity (EA, CPA) but referring TO a licensed preparer is unregulated.

### 8. Accounting / bookkeeping — GREEN

- **Obligation shape:** monthly close, chart of accounts maintenance, expense categorization, monthly reconciliations, year-end financials, 1099 issuance.
- **Sample vendors:** QuickBooks Online (Intuit ProAdvisor / new ProPartner Accountants program launching, revenue share up to 25% net billings on QBO/Workforce for top-tier firms, 30/15/15% Y1/Y2/Y3 for Enterprise Suite), Xero, FreshBooks, Wave, Bench (see above), 1-800Accountant.
- **Economics:** Intuit's ProPartner program is designed for accounting firms managing multiple clients, not directly for SaaS platforms; **the appropriate integration path for Paige is via QuickBooks App Store (developer program) rather than ProPartner**, and QuickBooks App Store apps monetize through the customer directly, not a rev-share with Intuit. Confirm at scoping.
- **Regulatory friction:** GREEN. No licensing required for referrals or app-store integrations.

### 9. General/industry licenses (per-state, per-city, per-profession) — YELLOW

- **Obligation shape:** state professional licenses (contractor, cosmetologist, real-estate broker, etc.), city business license, county permits, industry-specific bonds, food handler / liquor / firearms / childcare / massage / medical spa licenses. Highly variable across ~50 states × 1,000+ cities × 100+ trades.
- **Sample vendors:** Harbor Compliance (broadest state-licensing coverage, HCA API), CorpNet, LicenseLogix (acquired by Harbor Compliance), The SMB Tool (limited to WA/OR/ID/CA, beta only), niche per-vertical services.
- **Economics:** Same as Category 4 — Harbor Compliance is the practical partner for the horizontal coverage; niche verticals typically have no partner program.
- **Regulatory friction:** YELLOW. Referrals themselves are green, but Paige must be careful never to *practice* license consulting — surface the deadline, route to a partner or state portal, avoid any statement that reads as legal or licensure advice per §2.

### 10. SaaS subscription tracking — GREEN (build in-house)

- **Obligation shape:** SaaS renewal calendar, seat counts, unused/orphaned licenses, contract auto-renewal cutoff windows, price-increase surveillance, vendor-security posture.
- **Sample vendors:** Cledara (SaaS management + virtual-card issuance, SMB-friendly pricing), SpendHound (free SaaS visibility for SMB), Vendr and Zylo (enterprise, out-of-scope), Ramp/Brex (spend management with SaaS overlay).
- **Economics:** Cledara / SpendHound do not publish partner programs targeting downstream SaaS platforms. Trilogy doc's assessment "weak or no partner economics" is confirmed.
- **Regulatory friction:** GREEN. Nothing regulatory. Trivially buildable in-house: read tenant credit card / bank / payroll data via existing feeds (Stripe, Plaid), fuzzy-match line items against a growing dictionary of SaaS vendors, extract renewal cadence, done. **Build, don't partner.** L1-native.

---

## Section 2 — Regulatory friction ranking across all 10 categories

| # | Category | Friction | Compliance pattern |
|---|---|---|---|
| 2 | Formation | GREEN | Standard affiliate |
| 3 | Registered Agent | GREEN | Standard affiliate |
| 4 | Annual filings / state licenses (horizontal) | GREEN | Standard affiliate / API |
| 5 | Domain / SSL | GREEN | Standard affiliate |
| 6 | Trademark (referral only) | GREEN | Standard affiliate; §2 no legal-advice framing |
| 7 | Tax | GREEN | Standard affiliate |
| 8 | Accounting | GREEN | App-store integration model, not ProPartner |
| 10 | SaaS subscription | GREEN | Build in-house (no partner path) |
| 9 | Vertical / city licenses | YELLOW | Referral OK; §2 discipline on advice framing |
| 1 | Insurance | RED | Licensed-party model (embed) OR fixed lead-fee stub under state caps |

### The insurance regulatory picture — corrected

The Trilogy doc's cited fact is wrong; the underlying principle is right.

- **The $50/$2,000 referral-fee cap is North Carolina, not Connecticut.** NCGS 58-33-82(f) caps consideration paid to an unlicensed person for referral of insurance business at $50, with fines up to $2,000 per violation. Session Law 2024-11 (2023 session) established the framework; **SL 2025-45 extended it to personal-lines referrals effective October 1, 2025**. This is what the Trilogy doc appears to be trying to cite.
- **Connecticut** has its own anti-rebate regime under CGS § 38a-825 and (for title insurance) § 38a-414. Connecticut's Insurance Department has issued advisory guidance stating that de minimis gifts up to **$15 aggregate per year** to a client are permissible; general anti-rebate discipline applies otherwise. Connecticut does not have the $50/$2,000 cap the Trilogy doc attributes to it.
- **The 50-state anti-rebate landscape is a spectrum.** Roughly 48 states have anti-rebate statutes on the books. Modernized-value-added-services rules (per NAIC's 2020 Unfair Trade Practices Act amendment) have been adopted in ~20+ states (including Florida). California largely permits commission rebating post-Prop 103 (1988), with niche exceptions (title, mortgage guaranty, financial guaranty). Texas, New York, and most traditional markets retain strict anti-rebate rules — inducement tied to insurance purchase is prohibited.
- **The unlicensed-referral rule pattern.** Most states allow a licensed producer to pay an unlicensed person for referring a lead, provided the unlicensed person does not discuss coverage, price, or terms. The NAIC Producer Licensing Model Act (2000) sanctions this arrangement subject to anti-rebating limits. State-specific dollar caps and disclosure obligations vary; several states are silent on dollar amount but require the arrangement to be filed with the department of insurance.

**Compliant patterns for Paige:**

- **(a) L4 affiliate stub via a licensed intermediary.** Route qualified leads to CoverWallet (an Aon company, a licensed producer nationwide) via FlexOffers at their published $30/completed-quote flat fee. This is a fixed lead payment made to Paige as an advertiser, not a percentage of premium — falls under standard affiliate patterns in most states, though a handful still require the fee to be paid by a licensed party and to remain below caps. Ship this first as an L4 stub.
- **(b) L3 embedded API via a licensed carrier/agency partner.** Coterie (NPN 16944666, all 50 states) and Coverdash (licensed all 50 states, single-line-of-code embed) both operate the licensed-party-carries-the-license model. Their published pattern is: partner integrates the widget, Paige never touches the transaction financially, Coterie/Coverdash pays a partnership rate (undisclosed publicly) as marketing/distribution partnership revenue. This is §38-clean and the recommended L3 upgrade.
- **Never a percentage of premium routed through Paige.** Any pattern that would put premium dollars through a Paige-controlled bank account is disqualifying unless Paige holds producer licenses. That is a multi-year, capital-heavy path — not first-partnership shape.

### The FinCEN BOI status — verified current

- **Interim final rule March 21, 2025** (published Federal Register March 26, 2025) removed the BOI reporting requirement for U.S. companies and U.S. persons under the Corporate Transparency Act.
- **Domestic reporting companies exempt.** All entities created in the U.S. and all U.S. persons who are beneficial owners are exempt from BOI reporting.
- **Foreign entities registered to do business in a U.S. state or tribal jurisdiction remain required to file.** Entities registered before March 26, 2025 had a filing deadline of April 25, 2025. Entities registered on or after March 26, 2025 have 30 days from effective registration.
- **Doctrine impact for Vault:** any BOI reminder logic must key off `entity_profile.jurisdiction_country ≠ 'US'`. A U.S.-formed LLC/Corp should never see a BOI reminder from Paige. This is a §2 default-safety issue as well as a factual one — a BOI reminder to a U.S. tenant is not just wrong, it is confidence-eroding on the whole product.

### Other 2025-2026 regulatory landmines worth naming

- **Wayfair sales-tax nexus continues to expand.** Every year more states enforce economic-nexus thresholds. A tenant crossing a state's sales threshold (typically $100K-$500K) triggers a registration obligation. Vault should surface this proactively when Stripe data suggests a nexus is being crossed. GREEN for referrals to TaxJar/Avalara.
- **State privacy laws (CCPA, CPRA, VCDPA, CPA, CTDPA, UCPA, MCDPA and expanding).** SMB thresholds vary; most small coaches/consultants are under thresholds. Vault should track state privacy-law thresholds if data volume rises (surface as "you may be crossing the threshold" rather than "you must comply now").
- **Beneficial-ownership at the state level.** New York's LLC Transparency Act (effective Jan 1, 2026, deferred implementation) mirrors the federal CTA at the state level for New York-formed LLCs. Similar bills in California and other states. **Track by tenant's `jurisdiction_state`; do not extrapolate the federal March 2025 relief to state-level obligations.** This is a category-specific compliance item Vault should own.

---

## Section 3 — Five pilot partner recommendations

### Pilot 1 — Northwest Registered Agent (formation + RA)

- **Positioning:** best-in-class privacy defaults, longstanding trusted brand, "corporate guides" service model, straightforward pricing ($39 + state fees for formation, $125/yr for RA).
- **Affiliate program (verified):** publicly published $60 net per formation OR RA order via their affiliate page and multiple third-party affiliate aggregators (Awin, Sovrn/Commerce, LinkClicky, LinkMyDeals). Conversion rates reported by affiliates in the 9-25% range.
- **Wholesale / API tier:** Northwest publishes a "Wholesale Registered Agent Services" page suggesting a bulk-volume or reseller path exists; specific API access terms, minimum volume commitments, and per-unit economics are **not published publicly** and require direct outreach.
- **Regulatory friction:** GREEN.
- **§38 money-boundary check:** ✅ CLEAN. Money flow is tenant → Northwest (Northwest's Stripe/bank), Northwest → Paige (affiliate payout to Paige-held revenue). No tenant client money routes through Paige.
- **Trilogy doc discrepancy:** the Trilogy doc's "$100/RA, $150/formation" claim is not supported by Northwest's published affiliate terms ($60 net per order). Do not model on the higher number. The higher figure may be an unverified estimate of what the Wholesale/API tier could yield at volume — that is not the affiliate program.
- **Ship priority:** Ship first. Highest tenant-onboarding value moment; genuinely zero regulatory friction; affiliate can activate in days.

### Pilot 2 — Harbor Compliance (annual filings + state licenses + RA overlap)

- **Positioning:** enterprise-grade compliance platform, strongest horizontal coverage of state annual reports, state licenses (via LicenseLogix acquisition), and RA services in a single API.
- **Partner program (verified):** Harbor Compliance Alliance (HCA) partner program is real and published (landing.harborcompliance.com/partner-program), with an accompanying partner directory. Positioned at law firms, accounting firms, consulting firms, and technology partners.
- **API (verified):** developer site published at developers.harborcompliance.com; annual report service documented; standard REST API. Sandbox environment available.
- **White-label:** the Trilogy doc claims a "white-label option" — public marketing (including FileForms competitor comparisons) suggests Harbor Compliance does NOT ship a white-label offering off the shelf. This is worth clarifying in partner discussion; the tenant experience may need to include a Harbor-branded step, which is a §6 brand-consistency question if so.
- **Regulatory friction:** GREEN.
- **§38 money-boundary check:** ✅ CLEAN. Money flow is tenant → Harbor (Harbor's Stripe/bank), Harbor → Paige (partnership/referral revenue to Paige-held revenue). Under the standard HCA model no tenant client money touches Paige.
- **⚠️ MATERIAL STRATEGIC RED FLAG — Harbor Compliance acquired Firstbase in December 2025.** Firstbase is one of the two "fast-follow" competitors the Trilogy doc names as most likely to build the horizontal Vault. Harbor now owns that competitive vector. Partnership with Harbor Compliance is still recommended — the API and horizontal coverage are genuinely best-in-class — but the negotiation must acknowledge the structural conflict: Paige will be sending Harbor's now-owned front-end platform (Firstbase) qualified operator leads it could otherwise convert directly. Partnership terms and data-sharing boundaries need to be scoped with that fact on the table, not around it. This is not a reason to skip Pilot 2; it is a reason to negotiate it as an equal, not a downstream affiliate.
- **Ship priority:** Ship second. Covers three Vault categories in one integration (annual filings + state licenses + RA overlap). Do the negotiation right; don't ship on default affiliate terms.

### Pilot 3 — QuickBooks + 1-800Accountant (accounting + tax)

- **Positioning:** owns the SMB accounting-software category (QBO) plus the SMB accounting-service category (1-800Accountant, now in a multi-year strategic partnership with LegalZoom since December 2024).
- **QuickBooks partner program (verified):**
  - Intuit is **sunsetting the ProAdvisor Program and launching ProPartner Accountants** as its next-generation replacement. Existing ProAdvisor discounts and revenue share are grandfathered for subscriptions set up before the ProPartner launch.
  - ProPartner top-tier firms earn **up to 25% of net billings on QuickBooks Online and QuickBooks Workforce** for up to three years (extended from 12 months). Intuit Enterprise Suite clients: 30% Y1, 15% Y2, 15% Y3.
  - **Important:** ProPartner is designed for accounting firms that manage multiple clients, not for consumer-facing SaaS platforms. **The correct integration path for Paige is the QuickBooks App Store developer program** (Intuit Developer), which monetizes via the customer directly and does not share revenue back to Intuit. If Paige wants Intuit to pay Paige for driving new QBO subscriptions, that is a **separate partnership discussion** that requires direct outreach and is not the ProPartner surface.
  - The Trilogy doc's claim that "PartnerStack infrastructure means Paige can plug in fast" for QuickBooks does not match Intuit's current program surface — PartnerStack is a common affiliate infrastructure but does not power Intuit's direct partner program. Verify at scoping.
- **1-800Accountant partner program (verified):**
  - Affiliate program via **ShareASale** (NOT PartnerStack as the Trilogy doc suggests). Verified via Awin merchant profile and 1-800Accountant's own affiliate landing page.
  - Base payout: **up to $100 per lead**, 90-day cookie, negotiable at volume for high-quality traffic.
  - **LegalZoom + 1-800Accountant partnership** announced December 2024, launched January 2025, bundles 1-800Accountant's year-round bookkeeping and tax service into LegalZoom's post-formation customer flow. This confirms the "1-800Accountant does platform deals" premise in the Trilogy doc, and establishes a viable pattern for Paige to replicate.
- **Regulatory friction:** GREEN for both.
- **§38 money-boundary check:** ✅ CLEAN for both. QBO subscription flow: tenant → Intuit (Intuit's rails), Intuit → Paige (via App Store or a directly-negotiated referral arrangement). 1-800Accountant service flow: tenant → 1-800Accountant (their rails), 1-800Accountant → Paige (affiliate payout). No tenant client money touches Paige.
- **Trilogy doc discrepancies to correct:**
  1. 1-800Accountant is ShareASale, not PartnerStack.
  2. QuickBooks path for a SaaS platform like Paige is the App Store developer program + a directly-negotiated partnership, not ProPartner (which is for accounting firms).
- **Ship priority:** Ship third. Hits at quarter-end and year-end reminder moments in the Vault reminder engine.

### Deferred — Insurance (CoverWallet L4 stub → Coterie / Coverdash L3 embed)

- **L4 stub — CoverWallet (verified):** Aon's SMB brand, licensed producer nationwide, affiliate via FlexOffers at **$30 per completed quote**, 30-day cookie, marketing landing pages for 300+ industries provided to affiliates.
- **L3 embed candidates:**
  - **Coterie Insurance (verified):** NPN 16944666, licensed in all 50 states, API-first (docs.coterieinsurance.com), instant bindable quotes, Ask Kodiak classification integration, backed by Allianz X Series C (2025), passed $200M direct written premium in 2025. Small business focus (GL, PL, WC, BOP). API-partner path published at coterieinsurance.com/partners.
  - **Coverdash (verified):** licensed in all 50 states, single-line-of-code embed pattern, $13.5M Series A (2024), Vyde partnership (tax/bookkeeping) and Collective partnership (self-employed financial back office) proven precedents. Multi-carrier quotes across GL / WC / PL / cyber.
- **Regulatory friction:** RED overall.
  - L4 (CoverWallet stub) fits the "unlicensed platform can accept a fixed lead fee for advertising" pattern in most states. A handful of strict states may require the lead fee to be paid by a licensed party — CoverWallet meets that requirement as an Aon-licensed producer. Compliant in most jurisdictions on a fixed flat fee; do not layer a % of premium.
  - L3 (Coterie/Coverdash embed) fits the "licensed party carries the license" pattern — the licensed partner is the producer of record, Paige is the technology surface, partnership revenue is not tied to premium in a way that would constitute rebating.
- **§38 money-boundary check:** ✅ CLEAN for both patterns. Tenant premium always flows to the licensed party; Paige is paid a fixed lead fee (L4) or a partnership rate (L3) — never a slice of the tenant's premium.
- **Ship priority:** L4 stub with CoverWallet ships when Vault L1 hits scale (rough threshold: ~50 tenants generating a reminder-a-week, so lead volume justifies partner activation). L3 embed (Coterie or Coverdash) is a 3-6 month negotiation with real counsel per partner type — do not shortcut. The L4→L3 transition is transparent to the tenant if the design is done well.

### Add-when-cheap — Namecheap (domain + SSL)

- **Positioning:** most SMB-friendly domain/SSL pricing, best-in-class privacy defaults (WhoisGuard included at no cost, unlike GoDaddy), long-running affiliate program (since 2009).
- **Affiliate program (verified):**
  - Direct affiliate: **20% commission on domain registrations, 35% on SSL certificates and hosting**, 120-day cookie.
  - Via Impact Radius / Commission Junction / ShareASale: tiered 25-38% based on monthly volume.
- **Regulatory friction:** GREEN.
- **§38 money-boundary check:** ✅ CLEAN. Standard affiliate payout.
- **Ship priority:** Ship any time. Trivial to add; hits every tenant with a website.

### Build in-house — SaaS subscription tracking

- Confirmed: no meaningful partner-economic path from downstream SaaS-management vendors (Cledara, SpendHound). SpendHound offers a free tier for SMBs — competing on downstream referral revenue is not the shape.
- **Build in L1:** Vault reads tenant's Stripe / Plaid / payroll data, fuzzy-matches line items against a growing dictionary of SaaS vendor names, extracts renewal cadence, files reminders. §26 semantic memory learns the tenant's specific vendor set over time. This is a §10-Paige-callable native capability; no external partner is warranted.

---

## Section 4 — Competitive timing thesis (updated)

### The 6-12 month window claim — mostly holds, tighter on the Doola side

**Doola (verified 2026):**
- Positioning: LLC formation for non-US and US founders, EIN registration, RA, US business address, banking via Mercury partnership.
- **Already ships a horizontal Vault-shaped product.** The "Total Compliance" plan at $1,999/yr bundles bookkeeping, tax filing, Form 5472, BOI, state compliance, and sales tax registration into a single subscription with an automation dashboard advertised as "annual reports, BOI filing, and state compliance are tracked automatically so you never miss a deadline." That language is the Vault shape.
- **Also offers a partner program with affiliate, iFrame, AND white-label options** — meaning Doola is architecturally set up to appear as a downstream partner in someone else's stack, not just a direct consumer product.
- **Timing implication:** The Trilogy doc's 6-12 month window is optimistic on the Doola vector. Doola's obligation-tracking claim is already public marketing; what's missing is the *cross-vertical, non-formation-first* Vault positioning aimed at coach/consultant/agency tenants. The differentiation window against Doola is closer to **3-9 months** — enough to ship Phase A + start on B, but not enough to sit on Vault L1 planning.

**Firstbase (verified 2026):**
- **Acquired by Harbor Compliance in December 2025.** No longer an independent operator in the competitive-timing sense; the strategic question is now whether Harbor Compliance uses Firstbase's brand to push into the SMB obligation-tracker space directly. Given the enterprise cadence Harbor operates at (law firms, accounting firms, established SMB compliance), the answer is probably YES but slowly. The Trilogy doc's 6-12 month window is defensible against this vector.

**The SMB Tool (thesmbtool.com — verified via direct site fetch):**
- Currently in beta, waitlist-only, launched with West Coast focus (WA, OR, ID, CA + federal).
- Tracks 19,491+ obligations across 1,121+ cities. Feature list is significantly broader than the Trilogy doc's "tax-and-compliance-only" characterization: includes compliance calendar, document storage, license/permit tracking, compliance health scores, contractor/1099 flow, **insurance & bond tracking**, annual compliance reports with peer benchmarking, scenario planner, business formation wizard with 54-step checklists, multi-business support, regulatory alerts. Pricing $14.99/mo single business, $29.99/mo multi-business, custom tier for accountants managing clients.
- **This is a legitimate Vault-shaped competitor at the L1 layer**, currently pre-launch and geo-limited. Not a threat by scale today, but the architecture and feature scope are recognizably similar to what the Trilogy doc plans for L1. Worth watching for their post-beta expansion; not worth engineering around.

**Other names to add to the watch list:**
- **Stripe Atlas** — controls a large share of the tech-startup formation surface. Not architected for the coach/consultant/agency audience, but could adjacent-move.
- **Clemta** — AI copilot for bookkeeping and compliance, positioned as an emerging Doola/Firstbase alternative. Small today.
- **ZenBusiness** — formation-first, has expanded into ongoing compliance and worry-free-compliance plans; owns real SMB customer volume.
- **Every** — emerging formation + finance-ops platform.

**Bottom-line updated competitive posture:**

The Trilogy doc's competitive-timing thesis holds directionally but understates the Doola vector (which already has the horizontal claim on paper) and now must contend with the Harbor Compliance / Firstbase merger. The window to establish the coach/consultant/agency-native positioning ahead of a serious cross-vertical push from any of these players is **best modeled as 6 months on the aggressive end, 12 months on the conservative end** — same as the Trilogy doc, but with pressure sharper on the earlier end than the doc reads.

---

## Section 5 — §38 money-boundary compliance summary

Every recommended pilot passes the doctrine test. For each: money flows *partner → Paige* as Paige-held revenue on a Paige rail (L2 Marketplace-style referral/affiliate/partnership revenue, per §17 taxonomy). No pilot puts tenant client money through Paige's bank.

| Pilot | Money leg 1 (tenant → partner) | Money leg 2 (partner → Paige) | §38 verdict |
|---|---|---|---|
| Northwest Registered Agent | tenant → Northwest bank (Northwest merchant of record) | Northwest → Paige (affiliate, ~$60/order) | ✅ CLEAN |
| Harbor Compliance | tenant → Harbor bank (Harbor MoR) | Harbor → Paige (partnership rate, TBD) | ✅ CLEAN |
| QuickBooks (App Store or direct) | tenant → Intuit bank (Intuit MoR) | Intuit → Paige (via App Store commission OR direct partnership) | ✅ CLEAN |
| 1-800Accountant | tenant → 1-800Accountant bank (they are MoR) | 1-800Accountant → Paige (~$100/lead via ShareASale) | ✅ CLEAN |
| CoverWallet (L4 stub) | tenant → CoverWallet-bound insurer (CoverWallet as licensed producer handles premium) | CoverWallet → Paige ($30/completed quote via FlexOffers) | ✅ CLEAN |
| Coterie / Coverdash (L3 embed) | tenant → Coterie/Coverdash-bound insurer (licensed party handles premium) | Coterie/Coverdash → Paige (partnership rate, not % of premium) | ✅ CLEAN if not structured as % of premium |
| Namecheap | tenant → Namecheap bank | Namecheap → Paige (20-38%) | ✅ CLEAN |

**Structural note:** the L3 insurance embed must explicitly avoid a % of premium structure. A fixed-fee or engagement-based partnership rate is §38-clean; a percentage of premium routed through Paige becomes premium-flow-through-a-non-licensed-party and is a compounding regulatory + doctrine problem. Negotiate the partnership rate as a fixed placement fee, a monthly retainer, or a tiered lead volume payment — never as a slice of the customer's premium.

---

## Section 6 — Red flags the current Trilogy doc does not yet acknowledge

Filed for the doc owner. Each is either factually correctable or a strategic delta that changes how Phase C should be scoped.

1. **The Connecticut anti-rebate citation is factually wrong.** The $50/$2,000 rule is North Carolina (NCGS 58-33-82(f), extended to personal lines Oct 1, 2025 by SL 2025-45). Connecticut has different rules ($15 de minimis gifts, general anti-rebate under CGS § 38a-825 / § 38a-414). The compliance principle in the Trilogy doc is correct; the specific citation needs to be corrected in the next doc revision.
2. **Harbor Compliance acquired Firstbase in December 2025.** One of the two "fast-follow" competitors the Trilogy doc names is now owned by one of the pilot partners the doc recommends. Pilot 2 negotiation posture must acknowledge this — Paige is not just an affiliate downstream, Paige is sending Harbor's now-owned Firstbase front-end platform qualified operator leads that Harbor could otherwise convert directly. Negotiate as a peer, not a default affiliate.
3. **Northwest Registered Agent's published affiliate payout is $60/order, not $100/$150.** Do not model Vault L3 economics on the higher figure. The Wholesale/API path may support better economics at volume, but that requires direct outreach and is not the affiliate program.
4. **Doola already ships the horizontal Vault claim.** Their "Total Compliance" $1,999/yr plan bundles the exact obligation shape the Vault L1 spec describes. The differentiation is not "Paige tracks obligations, Doola doesn't" — it's "Paige is a full AI COO for the coach/consultant/agency audience, Doola is a compliance product for non-US-founder LLC operators." The competitive-timing window is closer to 3-9 months on the Doola vector than 6-12 months, particularly if Doola's tenant persona quietly widens.
5. **1-800Accountant uses ShareASale, not PartnerStack.** The Trilogy doc's PartnerStack claim is incorrect. Base payout $100/lead, 90-day cookie, negotiable at volume. The LegalZoom + 1-800Accountant partnership (Dec 2024 → Jan 2025 launch) is the pattern to study and replicate.
6. **QuickBooks integration for Paige is the App Store developer program, not ProPartner.** ProPartner is designed for accounting firms managing multiple clients, not for consumer-facing SaaS platforms. A direct Intuit partnership discussion is a separate path and requires outreach; do not model Phase C revenue on ProPartner rev-share numbers.
7. **Harbor Compliance's "white-label option" mentioned in the Trilogy doc is not corroborated by their public marketing.** Their competitors (FileForms among them) publicly market against Harbor on this dimension, suggesting no off-the-shelf white-label surface. Clarify at negotiation; the tenant flow may need to include a visible Harbor-branded step, which is a §6 brand-consistency question the Trilogy doc does not yet plan for.
8. **State-level BOI is emerging.** The federal March 2025 relief removed U.S. entities from FinCEN filings, but New York's LLC Transparency Act (effective Jan 2026, deferred implementation) revives the requirement at the state level for NY-formed LLCs. California and others are debating parallel legislation. Vault must key BOI-adjacent reminders on `jurisdiction_state`, not only `jurisdiction_country`, to avoid a false-safe default for NY-formed entities.
9. **Wayfair sales-tax nexus is the underappreciated recurring obligation.** Every year more tenants cross new state nexus thresholds. Vault should surface nexus-threshold crossings from Stripe revenue data proactively as a category unto itself — this is a fifth category of "annual filings + licenses" that the Trilogy doc's 10-category map arguably folds under Tax but deserves standalone treatment because the trigger is data-driven (revenue crossing a state threshold), not calendar-driven.
10. **CoverWallet's affiliate flow through FlexOffers introduces a third party into the money-boundary chain.** FlexOffers is the affiliate-network intermediary — not a functional concern (standard for affiliate marketing) but worth naming: Paige signs up with FlexOffers, FlexOffers signs up with CoverWallet, tenant flow is tenant → CoverWallet-licensed-flow, payout is CoverWallet → FlexOffers → Paige. Adds a small delay to payouts and a minor cut to FlexOffers; still §38-clean because tenant premium never touches either Paige or FlexOffers.

---

## Section 7 — Recommended Phase C scoping adjustments

Not a rewrite of the Trilogy phasing — just three concrete adjustments the research supports:

1. **Ship Pilot 1 (Northwest) via straight affiliate first**, with a parallel outreach to Northwest's Wholesale/API program. Model L3 economics on $60/order for Phase C planning; treat any Wholesale uplift as bonus, not required.
2. **Negotiate Pilot 2 (Harbor Compliance) as an equal, not a downstream affiliate.** Given the Firstbase acquisition, Paige has genuine leverage: Paige's coach/consultant/agency tenant base is upstream of every Vault obligation Harbor sells, and Paige's referral quality (tenants already onboarded, entity-typed, revenue-staged) is materially better than random inbound. Negotiate for API-first integration terms, transparent data-sharing boundaries, and — if Harbor still resists — a fair partnership economics tier that reflects the lead quality.
3. **Ship L4 CoverWallet stub the moment Vault L1 reaches ~50 active tenants generating a weekly reminder cadence.** Do not wait for L3 (Coterie/Coverdash) legal negotiation to finish. The transparent L4→L3 upgrade is a fine-grained UX problem, not a strategic one.

---

## Sources

**Partner economics + programs**
- Northwest Registered Agent affiliate: https://www.northwestregisteredagent.com/affiliate-program · Wholesale: https://www.northwestregisteredagent.com/wholesale · third-party corroboration: Awin, Sovrn/Commerce, LinkClicky
- Harbor Compliance HCA partner: https://landing.harborcompliance.com/partner-program · Directory: https://landing.harborcompliance.com/partner-directory · Developer: https://developers.harborcompliance.com/
- Harbor Compliance acquires Firstbase (Dec 2025): https://www.harborcompliance.com/blog/harbor-compliance-acquires-firstbase-helping-entrepreneurs-launch-and-grow-with-confidence/
- Doola pricing + partnerships: https://www.doola.com/pricing/ · https://www.doola.com/blog/category/partnerships/
- LegalZoom + 1-800Accountant partnership (Dec 2024): https://investors.legalzoom.com/news-releases/news-release-details/legalzoom-and-1-800accountant-join-forces-deliver-full-service · https://1800accountant.com/blog/legalzoom-and-1-800accountant-partner-announcement
- 1-800Accountant affiliate: https://1800accountant.com/affiliate · https://ui.awin.com/merchant-profile/81243
- Intuit ProPartner (successor to ProAdvisor): https://quickbooks.intuit.com/accountants/propartner-program/ · https://www.accountingtoday.com/news/intuit-to-sunset-proadvisor-program-launch-new-propartner-accountants-program · https://quickbooks.intuit.com/accountants/products-solutions/pricing-promotions/papp/revenue-share/
- CoverWallet affiliate: https://www.flexoffers.com/affiliate-programs/coverwallet-us-affiliate-program/ · https://www.affpaying.com/coverwallet
- Coterie API + partners: https://docs.coterieinsurance.com/ · https://coterieinsurance.com/partners/ · https://explore.coterieinsurance.com/partner-faqs
- Coverdash: https://www.coverdash.com/ · https://www.coverdash.com/blog/coverdash-leading-embedded-business-insurance-agency-for-startups-and-smbs-announces-13-5m-in-series-a-funding · https://coverdash-blog.ghost.io/coverdash-and-vyde-launch-embedded-insurance-partnership-to-support-smbs/
- Namecheap affiliate: https://affylist.com/products/namecheap · https://getlasso.co/affiliate/namecheap/ · https://hostadvice.com/blog/monetization/affiliate-marketing/namecheap-affiliate-program-review/
- Cledara / SpendHound: https://www.cledara.com/pricing · https://www.spendhound.com/blog/best-saas-management-platforms
- Thimble, Embroker, Colony, Simply Business insurance affiliates: https://www.blockchain-ads.com/post/insurance-affiliate-programs · https://algo-affiliates.com/insurance-affiliate-programs/

**Regulatory citations**
- NCGS 58-33-82(f) referral fee cap: https://www.ncleg.net/enactedlegislation/statutes/html/bysection/chapter_58/gs_58-33-82.html · https://www.ncdoi.gov/documents/agent-services/referral-fees-faqs
- 2025 NC law extending referral cap to personal lines (SL 2025-45): https://www.ncleg.gov/EnactedLegislation/SessionLaws/PDF/2025-2026/SL2025-45.pdf · https://www.iianc.com/issues-of-interest/hb-737-update
- Connecticut anti-rebate framework (CGS § 38a-825, § 38a-414): https://www.lexology.com/library/detail.aspx?g=76405c26-987f-4955-9caa-081922f917fe · https://law.justia.com/codes/connecticut/2022/title-38a/chapter-700a/section-38a-414/ · https://www.cga.ct.gov/2025/rpt/pdf/2025-R-0103.pdf
- NAIC anti-rebate model: https://content.naic.org/sites/default/files/jir-za-36-07-el-dust-off-anti-rebate.pdf
- 50-state overview (2020 CIAB): https://www.ciab.com/wp-content/uploads/2020/06/Rebating-Chart-2020-c2_060120.pdf
- Referral-fee multi-state: https://www.insurancejournal.com/magazines/mag-features/2024/02/19/761025.htm
- FinCEN BOI removal for U.S. companies (Mar 2025): https://www.fincen.gov/news/news-releases/fincen-removes-beneficial-ownership-reporting-requirements-us-companies-and-us · https://www.foley.com/insights/publications/2025/03/fincen-removes-beneficial-ownership-reporting-requirements-us-companies/ · https://www.morganlewis.com/pubs/2025/03/fincen-removes-boi-reporting-requirements-for-us-companies-and-us-persons · https://www.federalregister.gov/documents/2025/03/26/2025-05199/beneficial-ownership-information-reporting-requirement-revision-and-deadline-extension

**Competitor landscape**
- The SMB Tool (thesmbtool.com — direct fetch, beta positioning verified)
- Doola vs Firstbase 2026 comparison: https://ecommerceparadise.com/doola-vs-firstbase/
- Doola alternatives: https://www.smbguide.com/doola-alternatives/ · https://www.producthunt.com/products/doola/alternatives
- Firstbase alternatives: https://www.smbguide.com/firstbase-alternatives/

---

*End of research report.*
