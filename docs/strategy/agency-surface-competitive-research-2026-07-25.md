# Agency Surface — Competitive Research & Feature Proposal

**Date:** 2026-07-25
**Owner:** Antonio
**Context:** The current `/agency` control surface (Agency Board) is under-featured — Dashboard + Team only, thin stat rollup, no differentiating capability. Owner wants to research what agency owners demand, what GoHighLevel and peers do well/poorly, and propose Paige-native features that exploit competitor gaps while respecting §7/§9/§35/§38 doctrine.

## The top agency-first SaaS platforms

**GoHighLevel (HighLevel)** — category king; all-in-one CRM/funnels/SMS/email/AI wrapped in a white-label "SaaS-mode" reseller model with unlimited sub-accounts. ~5,200+ ratings (G2 4.2, Capterra 4.6, Trustpilot 4.6).

**Vendasta** — a *marketplace* rather than a product; agencies white-label a storefront and resell third-party tools (reputation, listings, social, sites). Now positioning as "an operating system for AI agents" (Forrester, 2026) — the most direct strategic competitor to Paige's §35 OS thesis.

**HubSpot Solutions Partner Program** — not true white-label; agencies sell services *on top of* HubSpot Hubs. Best for enterprise-flavored agencies willing to trade white-label for ecosystem depth.

**SuiteDash** — leans hardest into white-label client portals + LMS + CRM; positioned as "GoHighLevel without the marketing bloat" for service agencies.

**Kartra** — funnels/memberships/email-first, popular with course creators and info-marketing agencies; weaker on true multi-tenant sub-account isolation.

**ClickFunnels 2.0** — funnels + membership sites + bolted-on CRM/workflow; agencies use it for lead-gen fulfillment, not full operations.

**DashClicks** — done-for-you white-label *fulfillment* (SEO/ads/social) plus a light CRM — competes on the "we deliver the work" axis, not the tooling axis.

**Dubsado / HoneyBook / Bonsai** — the client-services tier: proposals, contracts, invoicing, questionnaires. Not multi-tenant agency platforms — but they define the JTBD for the *tenants* Paige serves.

## The agency-owner job-to-be-done (ranked by review frequency)

Synthesized from G2/Capterra (GoHighLevel, Vendasta, HubSpot), AgencyAnalytics 2026 report, and r/agency / r/GoHighLevel threads:

1. **Multi-tenant sub-account isolation** — one login, N walled clients (contacts, pipelines, automations, users). Why GHL exists; nothing else at the price point matches.
2. **White-label everything** — domain, email sender, mobile app, source code, invoice-from name. Agencies lose deals when prospects find "highlevel" in built-with (real complaint, GHL ideas board).
3. **Fast, repeatable onboarding via snapshots/templates** — clone a proven playbook to a new sub-account in minutes.
4. **Automated white-label client reporting** — agencies burn 10–15 hrs/week manually; automation saves 30+ hrs/month and $8K/mo on 50-client books (DataStaq, Improvado).
5. **Consolidation ("kill 10 tools with one")** — CRM + email + SMS + funnels + booking + payments in one line item.
6. **Transparent, predictable pricing** — top-3 category complaint; Twilio/Mailgun/AI meter charges make the actual bill unpredictable.
7. **Reliable email deliverability** — Mailgun shared-pool reputation drops burn campaigns; Mailgun's inbox rate fell 27.75% YoY into 2025 (GlockApps).
8. **Reseller-margin economics** — "I charge $297/mo, it costs me $27/mo" as the business model. Any platform whose per-tenant costs scale linearly kills the margin.
9. **Client portal with proof-of-work** — clients want to see what they're paying for; agencies want self-serve surface that reduces support load.
10. **Fast, competent support** — inconsistent support is the #2 GHL complaint, described as "a lottery."

## The GoHighLevel gap list — highest-leverage attack surface

1. **Learning curve is brutal.** "Two to four weeks before it clicks" (Marketing Automation Insider). GHL replaces 10+ tools by *becoming* 10+ tools stacked on one page. Agencies hire GHL specialists just to set it up.
2. **Support is a lottery.** Simple tickets fast; anything engineering-adjacent takes days, quality "hit and miss" (Inflowave). Enterprise-tier agencies pay $497/mo and still hit this.
3. **Cost creep via meters.** Twilio SMS + Mailgun email + GHL AI credits + calling minutes — all metered on top of the sub. Reddit: *"my $297 plan turned into $700 last month."*
4. **Email deliverability on shared Mailgun.** One bad-actor tenant drops inbox placement for everyone. GHL provides no built-in throttling; bulk campaigns fire the queue and hit SMTP hourly limits.
5. **White-label leaks.** "highlevel" strings visible in source, mobile apps, DNS, and Built-With detection — unresolved ideas-board request with hundreds of upvotes.
6. **UI complexity + slowness.** Pages "10–60 seconds to load"; UI depth (nested modals, hidden settings) blamed for the learning curve. Clients "constantly complain about speed."
7. **Weak client-facing polish.** Client portal + reporting UI is functional but visually generic; agencies bolt AgencyAnalytics or Whatagraph on top for reporting they can proudly send.
8. **Feature velocity favors *quantity* over *depth*.** GHL ships a lot; agencies on the highest tier report "very little progress on essential features like accurate translation and better access levels" — breadth without polish.

## Ranked feature proposal for Paige's /agency surface

Every proposal targets a real agency JTBD, exploits a specific GHL gap, and reuses Paige primitives (Playbook, action bus, 10-dept model, sub-agents, Marketplace, memory). All §9-clean (agency-scoped) and §38-clean (Paige never holds tenant client money).

**1. Snapshot 2.0 — "Playbook clones with AI-tuned per-tenant onboarding."** Extend the existing Playbook system so an agency can define a "master Playbook" (coaching-generic template) and clone it into a new sub-account, where Paige's Client Experience team interviews the new tenant and *auto-tunes* persona, journey, and templates. GHL's snapshots are static; Paige's would be intelligent. Reuses: Playbook + `paige_prompt_template` (§26) + Chief-of-Staff sub-agent.

**2. Agency reporting agent — "Paige writes the client report."** A Marketing/Analytics sub-agent that reads each sub-account's activity, drafts a white-labeled monthly report in the agency's brand voice, and files it for one-click send/approval. Kills the 10–15 hrs/wk that GHL agencies burn manually. Reuses: action bus + `content-draft` seam + department sub-agents (§16).

**3. True white-label including agent identity.** The Paige-branded AI that ships in every sub-account renames per agency ("Ava at Acme Consulting"), speaks in the agency's brand voice, never leaks Paige's origin — closes the white-label gap GHL still hasn't. Reuses: brand tokens (§26) + tenant-authored voice (§3/§7).

**4. Cost-transparent metered billing dashboard.** Every metered event (tokens, SMS, storage) rolls up into a per-sub-account cost view the agency can see AND pass through to their client at markup. Directly kills GHL's #3 complaint. Reuses: existing `platform_metered_events` / `platform_usage_events` tables (§17 L3).

**5. Dedicated deliverability lane per agency.** Not shared Mailgun. Route each agency to their own dedicated SMTP identity (SendGrid/Postmark/Resend) with built-in throttling + reputation monitoring. New build: deliverability router + sending-identity registry. Positioned as *"we solved the GHL email problem."*

**6. Client-portal proof-of-work stream.** Each of a tenant's clients logs into a portal showing *what Paige and the agency did this week* — the drafts, sends, completed actions — in the agency's brand. Kills the "clients wonder what they're paying for" pain and reduces agency support load. Reuses: action-bus log + `paige_audit_log`.

**7. Cross-tenant Play Exchange (Marketplace).** Agencies publish tuned Playbooks/skills/automations for other agencies to install at markup (revenue-share to Paige). Directly attacks Vendasta's "OS for AI agents" positioning with a *builder* marketplace instead of a *reseller* one. Reuses: existing Marketplace surface (§17 L2).

**8. BYO-processor billing facilitator.** A Stripe-Connect (direct-charge) integration so agencies can invoice their own clients through Paige without Paige becoming merchant-of-record. Solves the "recurring retainer billing" gap Dubsado/HoneyBook still make manual. §38-clean by construction.

**9. Agency Command Center (10-department view rolled up across all sub-accounts).** Agency owner sees, across their book: at-risk clients, pending drafts awaiting approval, revenue pacing, team workload — the "$100M Org Blueprint" (§16) applied to the *agency's* portfolio. GHL has nothing comparable.

**10. "Bring your own model" tier for agencies.** Enterprise-tier agencies point Paige at their own Anthropic/OpenAI keys and route their sub-accounts' AI through their own bill. Attacks the cost-creep complaint at the highest tier while preserving Paige's margin on the platform sub. Reuses: the existing model router (§14).

## What NOT to build

- **NO merchant-of-record billing for tenant → client transactions.** Payment collection for the tenant must route through the tenant's own Stripe Connect (or eventually Square/PayPal via BYO-processor). Anything that puts tenant client money through Paige's bank violates §38 and blows up regulatorily at scale. GHL flirts with this via Stripe Connect direct-charge, which is the right pattern — copy that, not destination-charge.
- **NO consumer marketplace where end-clients discover agencies.** Vendasta's model of reselling third-party tools *to agencies* is fine to compete with (Play Exchange, #7). A client-facing marketplace where consumers shop for coaches/agencies violates §35 Commerce Line — Paige powers operators, doesn't aggregate their demand.
- **NO hardcoded vertical Playbook in the /agency default.** No credit/funding snapshots, no real-estate templates, no fitness-coach journeys shipped as defaults. Everything vertical lives as an opt-in Marketplace preset (§2).
- **NO clone of GoHighLevel's "SaaS-mode" wizard.** GHL lets an agency rebrand and resell HighLevel-the-product. Paige's positioning is *"you're reselling an AI COO, not an app"* — a wizard reducing the offering to "rebranded CRM" dilutes §7 and §36.
- **NO manual reporting builder.** Agencies don't want another drag-drop dashboard tool (Whatagraph exists, AgencyAnalytics exists). They want the report *written and drafted for them.* Feature #2 (reporting agent) is the right shape; a manual builder would be scope creep.
- **NO generic AI features ("AI copywriter," "AI chatbot") disconnected from the department/action-bus model.** Every AI capability lands in a §16 department with a §16 autonomy tier or it's tool-drawer noise (§36 dev-tool leak).

## §13 honest caveats

- Direct quotes from private r/agency threads are approximate; Reddit's API changes limit deep-crawl freshness.
- GoHighLevel-specific pain patterns cited are corroborated across 3+ independent 2026 review-aggregator sources (Inflowave, Marketing Automation Insider, Mailflow Authority) + GHL's own ideas board.
- Vendasta's "OS for AI agents" positioning is confirmed via Forrester's blog + Vendasta's own AI-agent-infrastructure post; the *depth* of shipping capability vs. marketing claims was not verified via hands-on trial.

## Recommended next steps

1. **Owner review** — pick 2-3 features from the ranked proposal to sequence into a build slice. Recommend starting with #2 (Reporting Agent) + #6 (Client-portal Proof-of-Work) as MVP — both reuse existing action-bus + audit-log substrate, both directly answer #4 and #9 on the JTBD list, both are visible/felt by the tenant's clients (dogfoodable for MMA).
2. **Facelift the /agency surface** — apply §27 checklist to the Agency Board (space reclaim, contrast, definition, motion, real content over placeholder banner). Kill the hero banner (§11 violation flagged 2026-07-25). This becomes prerequisite for showcasing any new features.
3. **File selected features as tracked slices** — each becomes its own Money Spine or /agency lane with owner + doctrine gates + §32 verification.

## Sources

- [GoHighLevel Reviews 2026 (5,200+ Ratings) — G2/Capterra/Trustpilot](https://www.highlevel.ai/gohighlevel-reviews.html)
- [GoHighLevel Complaints — Honest Review](https://docs.superhuman.com/@gohigh-level/gohighlevel-guides/gohighlevel-complaints-honest-review-before-you-sign-up-99)
- [GoHighLevel Review 2026 — Marketing Automation Insider](https://marketingautomationinsider.com/gohighlevel/)
- [GoHighLevel Support Problems — Inflowave](https://inflowave.io/resources/gohighlevel-customer-support-problems)
- [GoHighLevel Email Deliverability Problems — Mailflow Authority](https://mailflowauthority.com/gohighlevel-email/gohighlevel-deliverability-problems)
- [GHL Ideas — "We need a true white label SaaS"](https://ideas.gohighlevel.com/saas/p/we-need-a-true-white-label-saas)
- [Vendasta Shows Why Platforms Become Operating Systems For AI Agents — Forrester](https://www.forrester.com/blogs/vendasta-shows-why-platforms-become-operating-systems-for-ai-agents/embed/)
- [Vendasta — AI Agents as a Service](https://www.vendasta.com/blog/ai-agents-as-a-service/)
- [Best Agency Client Management Software — AgencyAnalytics 2026](https://agencyanalytics.com/blog/agency-client-management-software)
- [HighLevel Sub-Account Guide 2026 — Netpartners](https://netpartners.marketing/highlevel-sub-account-guide-setup-transfer-optimization-for-agencies/)
- [White Label Client Reporting for Agencies — ALM Corp 2026](https://almcorp.com/blog/white-label-client-reporting-agencies/)
- [How Marketing Agencies Are Automating Client Reporting — DataStaq](https://datastaqai.com/blog/agency-client-reporting-automation)
- [GoHighLevel Alternatives 2026 — SuiteDash](https://suitedash.com/gohighlevel-alternative-white-label/)
- [8 Best GoHighLevel Alternatives 2026 — Net Partners](https://netpartners.marketing/gohighlevel-alternatives/)
