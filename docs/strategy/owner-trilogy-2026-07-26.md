# The Owner Trilogy — an AI COO for coach / consultant / agency operators
**Systems Check · Business Vault · Twin Capabilities · Owner Analytics**
**Date:** 2026-07-26 (revised 2026-08-04)
**Owner:** Antonio Cook
**Status:** Strategy doc — pre-build, pre-spec
**Companion research reports (filed 2026-08-04):**
- `docs/strategy/business-vault-partner-landscape-2026-07-26.md`
- `docs/strategy/twin-capabilities-landscape-2026-07-26.md`
- `docs/strategy/systems-check-and-analytics-landscape-2026-07-26.md`
---
## The frame — an operator's AI COO, not "AI CRM"
Every competitor in the coach / consultant / agency / thought-leader space sells a slice of the operator's job. HubSpot is a filing cabinet with reports. HighLevel is a Zapier for coaches. Kajabi is a course platform. Dubsado is a client portal. Ramp is spend management. QuickBooks is a general ledger with a UI. None of them try to be the operator's whole AI, because "AI-powered CRM" is the ceiling they can see from where they built.
Paige's positioning is not that. Paige's positioning is **an operator's AI COO** — an AI that runs the whole company at the operator's direction, on a tenant-authored doctrine, across every department, with an autonomy dial the operator controls. The pattern-echo most operators already have a mental model for is Iron Man's JARVIS (referenced as an analog for internal clarity — never as the framing of any code, table, feature, or tenant-visible surface). The point is not the reference; the point is the honest description of what Paige's existing doctrine (§8 action bus, §14 Paige-runs-a-team, §16 10-department org, §26 semantic memory, §35 OS north star) actually adds up to when the pillars we're about to build land.
The mapping below is a **pattern-echo reference**, not the frame — the strategic substance lives in the pillars, not the analog. Kept because it reads at a glance for anyone who's seen the archetype in fiction.
| The archetype pattern | Paige does / will do | Where in Paige |
|---|---|---|
| Knew Stark's whole life-context | Semantic memory, tenant-authored Playbook | §7, §26 |
| Ran Stark Industries operations | 10-department orchestration + action bus | §16, §8 |
| Ran diagnostics on the suits | **Systems Check** (Pillar 1) | new — this doc |
| Warned of incoming threats | **Competitive Intelligence** (Pillar 4) | new — this doc |
| Modeled decisions before Stark made them | **Business twin** scenario modeling (Pillar 3, Direction C) | new — this doc |
| Coordinated the whole armor factory | **Browser Agent** capability (Pillar 3, Direction A) | new — this doc |
| Had personality, voice, presence | **Team-member twin** (Pillar 3, Direction B) | new — this doc |
| Tracked every renewal, filing, obligation | **Business Vault** (Pillar 2) | new — this doc |
| Suggested + executed on Stark's approval | Autonomy tiers (green / yellow / red) | §16 (already shipped) |
| Respected Stark's boundaries + private matters | **Integrity Governance** | new — §40 in this doc |
| Adjusted to the mission profile | **Revenue-stage awareness + entity-type awareness** | new — this doc |
| Ran Stark Industries as ONE AI, not seven tools | The OS itself | §35 (already doctrine) |
The mapping is not flattery. It's a checklist. Each row is either shipped, or is one of the pillars in this document. When the pillars land, Paige is measurably operator-AI-COO-shaped in a way no coach-CRM competitor is trying to be. That is the moat. It is also the reason this trilogy has to ship as one strategic wave rather than as unrelated feature additions — the whole point of an operator's AI COO is not a feature list, it's a felt experience of one AI running the whole thing.
---
## The Trilogy is the platform spine (owner-locked 2026-08-04)
The four pillars in this document — Systems Check · Business Vault · Twin Capabilities · Owner Analytics + Competitive Intelligence — are not four features living next to a longer feature list. They are **the spine of the platform.** Every new capability, section, workstream, or feature answers *"which pillar does this serve?"* before it fires. Nothing lives standalone. Standalone features that don't plug into one of the four pillars are the exception, not the default — and the exception must be justified.
- **Every workstream declaration is pillar-mapped.** Before a slice is scoped, spec'd, or handed to a crew, the pillar it feeds is named. A build that can't be placed on the spine is a build that isn't ready to start.
- **Cross-cutting substrate is substrate, not new pillars.** The Unified Comms substrate (§49 Conversations), Voice Layer (§131), Integrations (n8n / Zapier / MCP / OAuth), and L8 Memory Fabric are load-bearing infrastructure every pillar flows through — see the "Cross-cutting substrate" section below. They are not a fifth pillar and they are not standalone; they exist because the pillars need them.
- **Marketplace listings are per-pillar.** Every Playbook / Skill / template / add-on in the Marketplace is filed against the pillar it extends (Systems Check catalog, Vault obligation catalog, browser-task Playbook, persona Playbook, scenario template, competitor watch list). §12 organize-what-you-create binds every listing to a pillar home.
- **The test, every time:** *"Which pillar does this serve, and does it read cleanly as spine-work or spine-adjacent — or is it a standalone that needs a home first?"* If it can't be placed, it isn't ready to build.
This section binds every future workstream declaration on Paige to a pillar mapping. Standalone builds are the exception, not the default.
---
## What's already built (the doctrine substrate that makes this achievable, not aspirational)
Before enumerating the pillars, a §13-honest checkpoint on what already exists — because the operator-AI-COO shape is not a rewrite, it is a compounding on primitives that ship today:
- **§8 Two-way action bus with drainer.** Owner Ops and Client Experience departments file work to each other; the drainer materializes drafts at `autonomy_lane='confirm'`. Every pillar in this doc files onto this bus.
- **§14 / §16 Paige-runs-a-team, 10-department model.** Paige orchestrates a standing team of specialists per department. Every pillar's outputs route to a named department.
- **§26 Semantic memory with prompt-forge.** Tenant-scoped voyage-3 embeddings, per-tenant learned patterns, tenant-authored prompt DNA. Pillar 3 Direction B (team-member twin) is a direct extension; the whole trilogy uses it.
- **§34 Paige owns her intelligence end-to-end.** Model router across Anthropic + OpenAI + Groq + Featherless + Gemini; observability, memory, prompt-engineering, reasoning, talent, learning, transparency — all internal Paige departments. LLM API is the only external commodity.
- **§9 Tenant isolation with server-authoritative tenant derivation.** Nothing in this trilogy weakens this; several pillars extend it (per-tenant boundaries in §40, per-tenant entity profile, per-tenant revenue-stage).
- **§17 $1B growth-map billing taxonomy.** L1 platform subs, L2 marketplace, L3 metered pass-through — the money spine every pillar's monetization slots into.
- **§35 OS north star.** Every pillar is OS-shaped, not app-shaped — designed to work when Paige eventually runs on any surface (voice, wearable, browser extension, third-party API caller), not just today's web app.
- **§36 5-minute test.** Every pillar's first-touch UX is proactive Paige-surfaces-work, draft-first, one-click approve, domain-expert framing — not "here's a menu, learn where features are."
- **§38 Money boundary.** Every monetization path in this doc is Paige-held rails (L1/L2/L3/L4) — never tenant client money routed through Paige.
The trilogy stands on shipped primitives. That is why the estimated build effort is measured in weeks, not quarters — and why the strategic risk is the coach/consultant/agency CRM incumbents (GoHighLevel, Viktor.com — see Competitive Timing below) noticing this frontier before the pillars land, not us failing to execute.
---
## Pillar 1 — Systems Check
**One sentence:** Paige runs an end-to-end diagnostic of every operational system the tenant depends on — from onboarding minute one and continuously thereafter — and drafts the fixes for approval.
### The strategic significance
Every existing tool in this adjacency solves one slice. Uptime monitors (Pingdom, Better Stack) check HTTP 200 for a URL. Marketing analytics (GA4, HubSpot) show performance after traffic arrives. Website audits (Ahrefs, Screaming Frog) run one-shot. Deliverability tools (GlockApps, Postmaster) watch one channel. Pixel monitors (ObservePoint, Trackingplan) are enterprise-priced. Nobody in the coach / consultant / agency space does the full "your form is broken, your Twilio number isn't receiving, your GA4 stopped firing three days ago, your Instagram DMs haven't been answered in a week, your Calendly is booked out but confirmations are bouncing" — with interpretation, not just up/down. This is confirmed greenfield.
The reason Systems Check is the FIRST pillar to ship (before Vault, before Twins, before Analytics) is §36 — it's the perfect first-5-minutes-of-Paige moment. A new tenant signs up, Paige scans their systems in the background, and within 5 minutes the Command Center reads "I checked 27 things, 24 are healthy, 3 need your attention — want to walk through them?" That first impression IS the retention lever, and no competitor makes it.
### The catalog — 30 concrete checks
Categorized by domain, with the Paige twist per check (what makes it different from a generic monitoring tool) and the data source (native to Paige vs. self-hosted worker vs. external commodity):
**Infrastructure (7 checks)**
- Website responds < 3s from three regions — Paige twist: anomaly detection vs. tenant baseline, correlated with recent deploys. Source: self-hosted Fly Playwright ping or UptimeRobot API.
- SSL cert expires > 30 days out — Paige twist: auto-drafts renewal ticket to Fulfillment dept at 30d, escalates at 7d. Source: `tls.connect()` in worker.
- Domain WHOIS not expiring < 60 days — Same. Source: free `whois` package.
- DNS resolves correctly (A, MX, TXT for SPF/DMARC) — Paige twist: flags MX changes tenant didn't authorize. Source: `dns.resolve()`.
- Sitemap.xml + robots.txt valid, submitted to GSC — Paige twist: "your sitemap dropped 12 URLs since last scan — is that intentional?" Source: GSC API + fetch.
- Core Web Vitals in "Good" band (LCP, INP, CLS) — Paige twist: frames impact ("every 0.5s of LCP costs ~7% of conversion"). Source: PageSpeed Insights API (free).
- 404/5xx rate < baseline — Paige twist: groups by URL pattern, flags broken funnels. Source: GSC coverage + PageSpeed.
**Marketing / Tracking (6 checks)**
- GA4 receiving events (session_start, page_view, purchase, lead) — Paige twist: anomaly detection on event volume vs. 7-day baseline per event name. Source: GA4 Data API (free).
- Meta Pixel firing on Lead / Purchase / ViewContent — Paige twist: cross-referenced with Meta Ads spend so "pixel silent + spend running" = max priority. Source: Meta Marketing + Graph API.
- Meta Ads account healthy (no policy issues, disapprovals, spending anomalies) — Paige twist: drafts message to Owner Ops with the specific ad + a rewrite. Source: Meta Ads API.
- Google Ads account healthy (policy, quality score, disapprovals) — Same. Source: Google Ads API.
- Landing pages load AND convert (per-page conversion vs. baseline) — Paige twist: the conversion-quality layer. Source: GA4 + Paige-computed baseline.
- UTM tagging consistent (no typos, no missing utm_medium) — Paige twist: catches attribution leaks nobody else surfaces. Source: GA4 acquisition report.
**Forms & Booking (4 checks)**
- Lead form submits + delivers to CRM + fires pixel + notifies tenant — Paige twist: full-stack check nobody sells. Source: Fly Playwright worker (one script per form).
- Form conversion rate within tenant baseline (± 2σ) — Paige twist: "3 submissions vs. usual 47" anomaly. Source: GA4 form_submit + Paige baseline.
- Calendar booking link (Calendly/native) live + booking → CRM contact created — Paige twist: end-to-end smoke test. Source: Playwright + Calendly API.
- Booking-to-show rate healthy — Paige twist: drafts follow-ups for at-risk bookings. Source: Calendar + native CRM.
**Comms & Deliverability (5 checks)**
- SPF/DKIM/DMARC valid on all sending domains — Paige twist: auto-writes the missing DNS record for tenant to approve. Source: DNS lookups.
- Google Postmaster: domain reputation "high" + spam rate < 0.10% — Paige twist: drafts remediation when reputation dips. Source: Postmaster Tools API (free).
- Twilio SMS number active + A2P registered + toll-free verified — Native. Source: Twilio API.
- Email inbox placement (Gmail/Outlook/Yahoo) — sample-test on send — Opt-in for higher-volume tenants. Source: GlockApps API.
- WhatsApp / IG / FB DM channels connected + responding within SLA — Paige twist: cross-team action (Client Experience flags stalled DMs to Owner Ops). Source: Meta Graph API.
**Payments & Ops (4 checks)**
- Stripe webhooks succeeding (< 5% failure over 24h) — Paige twist: correlates failures with events the tenant depends on (invoice.paid → fulfillment automation). Source: Stripe API.
- Failed-charge rate not spiking — Paige twist: drafts dunning outreach per Finance dept. Source: Stripe API.
- Automation runs (n8n / Zapier / native) not failing — Paige twist: groups failures by workflow, files action to Technology/Automation dept. Source: n8n REST API.
- Scheduled sequences firing at expected cadence — Paige twist: "your welcome sequence has sent 0 in 48h — is it disabled?" Source: Kajabi/ConvertKit/etc APIs.
**Data & Product (4 checks)**
- Client portal reachable + login flow works — Source: Fly Playwright.
- CRM data quality (contacts missing email/phone, stale > 90d) — Paige twist: drafts enrichment task for People/Sales dept. Source: native CRM tables.
- Newly-published pages/forms/sequences smoke-tested at publish time — Paige twist: change-triggered — webhook from Studio → Paige runs full check within 60s. Source: §10 Paige-callable seam.
- Backup + data-integrity checks (Supabase RLS, no orphan tenant rows) — Platform-side (Super Admin / §9 operator scope). Source: direct DB queries.
**Build cost:** 17 of 30 (57%) native to Paige with existing credentials + data. 9 of 30 (30%) self-hosted worker build. 3 of 30 (10%) external commodity vendor (UptimeRobot, PageSpeed, GlockApps — the last only opt-in). Total per-tenant external vendor cost: <$5/month at 100 tenants. The intelligence layer — anomaly detection, drafting the fix, routing to the right §16 department — is 100% Paige across every check. That's the moat, per §34.
### The three flavors
Systems Check runs in three modes, all sharing the same catalog:
1. **Onboarding scan** — first-run diagnostic during signup / first hour. Paige scans everything the tenant told her about (website, Twilio number, Meta pages, calendar, email domain), reports what's live vs. broken, drafts the fixes. The wow moment.
2. **Ongoing scheduled scan** — daily at 6am for solo tenants, hourly for agencies with more surface. Delta-only alerts (new breakage or performance drop below tenant-calibrated threshold). Signal-only, not "everything is fine" spam.
3. **Change-triggered scan** — when the tenant makes a change (new form published, new landing page live, new sequence launched, Twilio number just A2P-approved), Paige immediately smoke-tests it end-to-end. Same-day feedback loop instead of "why did we lose 40 leads last week — oh, the form was broken since Tuesday."
### Playbook extensibility
Vertical Playbook creators extend the catalog by writing a **Check Spec** — a small YAML definition:

```yaml
check_id: medspa_hipaa_notice_present
domain: vertical_custom
data_source: fetch_url
target: "{{tenant.intake_form_url}}"
assertion:
  type: nl_predicate
  prompt: "Does this page contain a HIPAA Notice of Privacy Practices or a link to one? Look for headings, footer links, or modal triggers."
severity: blocking
remediation_prompt: "Draft a HIPAA notice for {{tenant.business_name}} that meets 45 CFR 164.520 and propose adding it as a linked footer to the intake page."
department: legal_compliance
```

The Playbook creator sells this spec on the Paige Marketplace (§35 App Store). Tenants who install the Medspa Playbook get the check enabled per §9 tenant-scoped feature flag. Zero platform default drift. §2 preserved.
### Command Center integration
Systems Check surfaces as a Command Center tile with lean §11 chrome (`variant="plain"` header, no gradient masthead eating a third of the viewport):
- Header: "Systems Check • Last scan 8 min ago • 27 checks passed, 3 need action"
- Body: `StatRow` — status pill per domain (Infra green, Marketing amber, Comms green, Payments green, Data green)
- Below: 3-item actionable list, each a `SectionCard` with a drafted fix and `Button variant="gold"` "Approve fix" (§16 confirm autonomy tier — only gold-on-the-act per §11)
- Empty state (all green): "All 30 systems healthy. Next scan in 22 minutes." Don't hide the tile — keep the confidence signal.
### Naming
Original working name was "Check Comms." I recommend **"Systems Check"** — the scope is broader than comms (infra, marketing, forms, payments, data), and the ops-department framing (§16) is more accurate than the comms-department framing. Final call is Antonio's; the doc uses Systems Check throughout.
---
## Pillar 2 — Business Vault
**One sentence:** Paige tracks every renewal, filing, contract, subscription, and obligation a business owner is supposed to maintain and usually doesn't — from insurance policies to LLC filings to domain renewals to trademark maintenance to vendor contracts to estimated tax dates — and shows up 60 / 30 / 7 days out with a drafted action instead of the tenant discovering the lapse three days late.
### The strategic significance
The current "AI COO" positioning is aspirational until Paige can point at the owner's own business obligations, not just the owner's client work. Every existing coach/consultant CRM (GoHighLevel, HubSpot, Dubsado, Paperbell, Kajabi) manages the tenant's CLIENT relationships. Zero manage the tenant's OWN business obligations. And the adjacent categories don't cover this shape either — Ramp/Brex are enterprise spend management, Vendr/Zylo are enterprise SaaS management, LegalZoom/Northwest Registered Agent are service providers for one narrow slice, QuickBooks is finance-only. Nobody assembles insurance + formation + RA + domain + SSL + trademark + tax + accounting + licenses + SaaS renewals into one obligation-tracker for the coach/consultant/agency audience.
This isn't a nice-to-have addition — it's the surface that structurally completes the "AI COO" claim.
### Four layers — L1 + L2 are current-scope, L3 + L4 are future (post-launch)
**Scope discipline (owner: Antonio, 2026-08-04).** *"L3 and L4 are a future move. We can have fulfillment partners in an aggregator marketplace, but that is not something that we can do right now before we launch. That is something that we will do in the future — after SOC 2, after investors getting involved, after a whole lot of shit."* Current-scope Vault is **L1 (tracking + document extraction + reminders) + L2 (Marketplace Playbooks)**. L3 fulfillment-partner integrations and L4 aggregator/marketplace connectivity stay in this document as **future phases** — described because they are the correct end state of the money model, but explicitly gated behind: **(a) post-launch, (b) post-SOC 2, (c) post-investor.** Do not scope, negotiate, or build L3/L4 integrations before those three unlocks land.
**L1 — Vault tracking (Paige-native, no partners required)**
The foundation. Detection + document extraction + reminder engine. Reuses:
- §26 semantic memory (learns the tenant's obligation ecosystem over time)
- Existing document-extraction pipeline (already reads uploaded PDFs, images)
- §8 action bus (60/30/7 day reminders file as `paige_action` at `autonomy_lane='confirm'`)
- §16 department attribution (Legal/Compliance owns insurance policies; Finance owns tax obligations; Operations owns registered agent + registered filings)
Data model — `tenant_obligation` table (tenant-scoped, RLS'd):
- `category` (enum: insurance / formation / registered_agent / domain_ssl / trademark / tax / accounting / license / saas_subscription / cert / other)
- `expiry_date` / `renewal_date`
- `notice_window_days` (default 60/30/7 per category)
- `source_document_ref` (Supabase Storage — the tenant-uploaded policy/contract PDF)
- `extracted_terms` (jsonb — coverage limits, cancellation notice window, cost, renewal terms)
- `status` (active / renewed / lapsed / cancelled)
- `audit_trail` (append-only history of every reminder fired, action drafted, tenant response)
Upload flow: tenant drops a PDF or image into the Vault chat — Paige extracts the renewal date, terms, cancellation window, and files the row. Command Center integration: "N obligations due in next 60 days" tile.
This layer ships FIRST, without any partner integrations. It has to — nobody will route a real insurance quote through Paige until she proves she can catch the renewal date first. L1 is the trust foundation.
**L2 — Vault Playbooks on the Paige Marketplace**
Vertical Playbook creators package "here's every renewal a fitness studio owner needs to track" or "here's every filing a medspa needs" as a sellable Playbook. Reuses existing Marketplace infrastructure + the L2 rev-share model already researched. Creators earn per-install; tenants get a pre-configured Vault catalog for their vertical.
**L3 — Real companies as fulfillment partners (FUTURE PHASE — post-launch / post-SOC 2 / post-investor)**
Paige detects the moment ("your general liability policy renews in 45 days"), routes the qualified moment to a real fulfillment partner (an insurance MGA, a registered-agent service, a domain registrar), earns a referral or commission. §38-clean: money flows partner → Paige as Paige's own revenue for a Paige-held rail (L2 marketplace / lead-referral revenue), NOT tenant client money routed through Paige. **Deferred to the future phase — the partner negotiations, legal review per category, and money-flow plumbing are not pre-launch work.** The 5-partner stack described below is preserved in this document as the target end-state architecture, not the current build queue.
**L4 — Aggregator / marketplace connectivity (FUTURE PHASE — post-launch / post-SOC 2 / post-investor)**
Where L3 requires 1-off partner integrations, L4 plugs into existing comparison marketplaces (insurance comparison engines, business-formation marketplaces) — Paige becomes the "when" layer, the aggregator is the "who" layer. Same "fulfillment link" pattern the Marketplace already uses for outbound. **Also deferred to the future phase.**
### The 3-partnership MVP stack for L3 (FUTURE PHASE — target end-state, not current build)
Research (2026-07-26 partner-landscape scan, filed as `docs/strategy/business-vault-partner-landscape-2026-07-26.md`) confirmed 3 partnerships would let Paige ship a credible L3 MVP without lighting a regulatory fire — **when the future phase opens.** Preserved here as the target architecture so a later phase inherits the reasoning, not to schedule the work now.
**Pilot 1 — Northwest Registered Agent** (RA + formation). Published affiliate economics **~$60 net per order (RA OR formation)** — verified on Northwest's affiliate page and third-party aggregators (Awin, Sovrn/Commerce). The earlier $100/$150 figure is not corroborated; do not model on it. Wholesale/API tier terms are not public and require direct outreach. Zero regulatory friction. Hits at tenant onboarding — highest-value moment. Ships first when L3 phase opens because the friction is genuinely zero.
**Pilot 2 — Harbor Compliance** (annual filings + licenses + RA overlap). Developer API, HCA partner program. Covers three Vault categories in one integration. **⚠ Strategic red flag for future negotiation:** Harbor Compliance acquired Firstbase in December 2025, so a pilot partner now owns a formation + operations platform that competes for the tenant relationship. Partnership terms must be negotiated with that conflict on the table — Paige is an equal, not a downstream affiliate. Harbor's "white-label" availability is unverified from public materials; clarify at negotiation (a Harbor-branded step may be required, which is a §6 brand-consistency question).
**Pilot 3 — QuickBooks + 1-800Accountant** (accounting + tax). **For a SaaS platform like Paige, the QuickBooks integration path is the App Store developer program** (Intuit Developer), NOT the ProPartner Accountants program — ProPartner is designed for accounting firms managing multiple clients. Any direct Intuit rev-share is a separately-negotiated partnership, not an off-the-shelf surface. 1-800Accountant's affiliate program runs on **ShareASale** (not PartnerStack), base payout ~$100/lead, 90-day cookie, negotiable at volume. LegalZoom + 1-800Accountant (Dec 2024 partnership) is the pattern to study. Hits at quarter-end / year-end reminder moments.
**Deferred — Insurance.** Highest regulatory friction of any category. Recommendation when L4 stub opens: launch as CoverWallet affiliate ($30/completed quote flat via FlexOffers, licensed party = CoverWallet, no producer license required for Paige), then negotiate the Coterie or Coverdash embedded API deal as the L3 upgrade with real counsel per partner type. Do NOT try to become a licensed producer as a first move. Coterie (NPN 16944666, all 50 states, API-first) and Coverdash (all 50 states, single-line-of-code embed, Vyde + Collective partnership precedents) are both viable L3 embed candidates.
**Add-when-cheap — Namecheap** (domain/SSL). 20% commission on domains, 35% on SSL/hosting via direct affiliate; tiered 25-38% via Impact/CJ/ShareASale, 120-day cookie. Trivial to add; hits any tenant with a website.
**Build in-house, no partner — SaaS subscription tracking.** Every credible SMB-shaped player (Cledara, SpendHound) has weak or no partner economics, but the tracking itself is trivial to build (read tenant Stripe/Plaid data, fuzzy-match against a growing SaaS vendor dictionary, §26 memory learns the tenant's specific set over time). L1 territory, current-scope — no future-phase gating for this piece.
### One doctrine-critical note: BOI reporting (federal + STATE-level)
FinCEN removed Beneficial Ownership Information reporting requirements for U.S. companies and U.S. persons in March 2025 (interim final rule, published Federal Register March 26, 2025). Only foreign entities registered to do business in the U.S. must still file federally. Any BOI-tracking feature in the Vault MUST respect this — do NOT default to "you owe FinCEN a BOI report" for a U.S. tenant. Foreign-owned tenants are the remaining audience for the *federal* check.
**But state-level BOI is emerging and Vault must handle it.** New York's LLC Transparency Act is effective **January 1, 2026** (deferred implementation) and revives the beneficial-ownership requirement at the state level for NY-formed LLCs. California and other states are debating parallel legislation. **Vault must key BOI-adjacent reminders on `entity_profile.jurisdiction_state`, not only `jurisdiction_country`,** to avoid a false-safe default for NY-formed entities. The federal March 2025 relief does not extend to state-level obligations. Source: `business-vault-partner-landscape-2026-07-26.md` §2 regulatory picture + §6 red flag 8.
### One doctrine-critical note: Insurance referral fees
Every L3/L4 partnership needs a jurisdictional check. Insurance referral fees are governed by 50 different state anti-rebate statutes and producer-licensing rules. Recent example: **North Carolina** (NCGS 58-33-82(f)) caps consideration paid to an unlicensed person for referral of insurance business at **$50 per referral**, with fines up to **$2,000 per violation**; **SL 2025-45 extended this to personal lines effective October 1, 2025.** (An earlier draft of this doc misattributed the $50/$2,000 rule to Connecticut — Connecticut has its own anti-rebate framework under CGS § 38a-825 / § 38a-414 with different mechanics, not the $50/$2,000 pattern. Corrected 2026-08-04 per `business-vault-partner-landscape-2026-07-26.md` §2.) The compliant pattern is either (a) L3 embed via an MGA that holds the license (Coterie, Coverdash — they are the licensed party, Paige is the technology surface), or (b) L4 flat lead fee under state caps, referrer never discusses coverage or premium. Real counsel per partner type before any monetization. This is not a reason to avoid the category — it's a reason to design it the way §2 already designs everything: never a platform default, opt-in Playbook per vertical, with legal-vetted partner agreements per category.
---
## Pillar 3 — Twin Capabilities (three directions)
**One sentence per direction:** Paige can drive external tools that don't have APIs (Direction A), create AI twins of specific team members that can draft in their voice (Direction B), and simulate business changes before the operator makes them (Direction C).
### Direction A — Browser-agent capability
**Strategic significance:** Paige today can call any API. Paige tomorrow needs to drive any TOOL — including the vendor SaaS portals, insurance carrier logins, LMS admin panels, and internal-app dashboards that never got API'd. Without this, there's a whole class of tenant workflow ("every Monday I log into ClickFunnels and export the numbers") that Paige can't touch.
**Partner stack (research-verified):**
- **Browserbase** as the browser-fleet infrastructure — usage-based at **~$0.10-0.12 per browser-hour** + proxy bandwidth billed separately ($10-12/GB), translating to ~$0.001-0.006 per task depending on task duration. No per-seat pricing. Handles session persistence, stealth mode, captcha routing, proxy fleet. (Earlier draft framed this as "$0.006/page" — corrected 2026-08-04 per `twin-capabilities-landscape-2026-07-26.md` §A.1; per-hour is the actual pricing model.)
- **Browser-Use library** (MIT-licensed) as the SDK layer for defining browser tasks. LLM-driven; Paige-owned code lives here.
- **Anon** (or a self-built equivalent) for the authentication story — handles OAuth-less integrations. **Caveat (§13):** Anon's "zero-trust" claim is stronger for OAuth flows than for username/password flows and is not independently auditable from public materials. §9 requires the canonical credential home to be our Supabase Vault; Anon at most is an execution-time delivery mechanism, never the storage layer.
**What Paige NEVER builds:** browser fleet infra, headless-Chrome IP rotation, captcha-solving pipelines, residential proxy networks. These are true commodities where a specialist beats a generalist. This is §34 in action — "external commodity" test resolves cleanly on browser infrastructure.
**What Paige MUST build itself:**
1. **Intent-to-browser-task translation layer** — the thing that takes "log into ClickFunnels weekly, export funnel stats, drop into the Playbook's analytics table" and produces the browser script. Lives as tenant-scoped Playbook rows (§10 config-as-data).
2. **Tenant credential vaulting.** §38 money doctrine's cousin: we NEVER store tenant vendor-portal credentials in a third-party auth service without a vault we control. Even with Anon's "zero-trust" claim, the §9 seam requires the credential's home be our Supabase Vault, tenant-scoped, with just-in-time delivery to the session.
3. **Browser-task Playbook DSL** — a definition format tenants and Marketplace authors use to describe "log in → click X → export Y → post to webhook Z" that Paige can execute autonomously OR draft-for-approval per the §16 autonomy tiers.
4. **The `autonomy_lane` binding for browser actions.** Any browser action that touches money, sends a message, or fires a legally binding submit defaults to `confirm` (draft-for-approval), never `auto`. §37 producer inventory + §32 runtime verify binds every one.
**Regulatory landmine:** driving a browser against a vendor portal the tenant has legitimate access to is legally fine. Driving one against a portal the tenant does NOT have permission to scrape (competitor sites, LinkedIn without T&Cs allowing it, protected government portals) is a real risk. The Playbook DSL needs an explicit "tenant confirms they own or are contractually authorized to access this portal" gate.
**Marketplace opportunity:** browser-task Playbooks are genuinely category-native. "The ClickFunnels reporting Playbook," "The Kajabi bulk-message Playbook," "The Calendly-to-CRM sync Playbook" — each is a deployable browser-task template on top of Paige's infra. Strong Marketplace primitive. (Note: LinkedIn Sales Nav and similar high-ToS-risk targets are tenant-authored-only per the regulatory landmine section below — never seed Playbooks from Paige.)
### Direction B — Digital twin of a team member
**Strategic significance:** Every coach with any team (a VA, an SDR, a second coach) has felt "I wish that person would draft the way I do." Existing sales-agent AI (Regie, Lavender, 11x) generates on-brand generic outbound; nobody clones an INDIVIDUAL's voice. Grammarly Business's Personalized Voice Detection is the closest commercial analog, and it's designed for the person themselves — not "clone Sarah for the team." Paige extends §26 semantic memory to model per-teammate style + decision patterns, and this becomes a first-class primitive.
**What a "team-member twin" is actually made of:**
1. **Writing-style profile** — captured voice fingerprint (tone, vocabulary, cadence, quirks) via semantic-memory + style embedding + a rewrite prompt.
2. **Decision-pattern encoding** — "how would Sarah triage this inbound?" A rules-plus-examples encoding of the teammate's judgment, derived from their history.
3. **Domain/process knowledge** — what this specific person knows and how they do their part.
4. **Voice/likeness** (optional) — actual audio/video cloning, only needed if the twin has to speak or appear on video.
Paige has (1), (2), (3) as extensions of what already ships (§26 semantic memory, §34 L3 prompt-forge, §16 department sub-agents). Paige needs a partner for (4).
**Partner stack for voice/video only:**
- **ElevenLabs** for voice cloning — industry leader, per-teammate consent enforcement is baked into their ToS
- **HeyGen or Tavus** for video — HeyGen has the broader library, Tavus is purpose-built for personalized 1:1 video at scale
**Regulatory landmine — scoped narrowly to voice/video clones of individual real people (owner: Antonio, 2026-08-04).** The ELVIS Act (Tennessee, effective July 2024) and the ~47-state deepfake/synthetic-media legislation cohort — California AB 2602 / AB 1836, New York's December 2025 Synthetic Performer Disclosure + Digital Replica Right of Publicity laws, Illinois HB2137, Louisiana HB178, and the rest — apply specifically to **the narrow slice of Direction B that clones the voice or video of an individual real person** (an ElevenLabs voice clone of Sarah, a HeyGen/Tavus video avatar of Sarah). *"Twin AI creates it, writes code, creates agents, and develops things as it needs to. It creates connections. The deepfake has to do with impersonating humans."*
These laws do **NOT** apply to Direction A (browser-agent capability), Direction C (business-twin scenario modeling), or the broader Twin AI vision of agent creation, code writing, and connection building. Do not inflate the scope of the deepfake regime into places it does not reach.
**This is the §-doctrine gate for the narrow slice only:** any Direction B feature that generates a voice or video replica of a specific real individual (a teammate, a client, anyone) requires **a per-person consent artifact stored on the tenant record** — written, plain-language, knowing-and-voluntary, with a reasonably-specific description of the intended uses. The consent UX must force a real step — not a checkbox — with the person confirming in-app (via email verification link or similar), calibrated to the strictest applicable regime (ELVIS Act baseline + California AB 2602 specific-use-and-representation clause + NY synthetic-performer disclosure at distribution time). Post-mortem uses require estate consent — hard-block any twin whose "life status" is not confirmed alive.
Writing-style profiles (voice fingerprint, cadence, quirks) and decision-pattern encodings do NOT require the deepfake-regime consent artifact; they are §26 semantic memory extensions, tenant-scoped by construction, and governed by §40 integrity + per-tenant scope. The regulatory bar rises specifically when the output is a synthetic voice or video representation of an identifiable real person.
Source: `twin-capabilities-landscape-2026-07-26.md` §B.5 for the full 47-state landscape; owner directive 2026-08-04 for the narrow scoping.
**Marketplace opportunity:** "Persona Playbooks" — a template that captures a specific role's decision patterns + style ("the friendly-but-firm collections VA Playbook," "the funnel-coach onboarding-sequence Playbook"). Tenants apply the Playbook to their own teammate and Paige personalizes from there. Medium-strength Marketplace unit.
### Direction C — Digital twin of the business itself
**Strategic significance:** THIS is the biggest positioning bet of the three. There is no productized "chat with a digital twin of your business" offering for the coach/consultant/agency SMB audience. Verified through the research crew: enterprise FP&A tools (Causal, Runway Financial, Adaptive Planning, Anaplan, Pigment) exist but require FP&A literacy. SMB-friendlier tools (Jirav, Fathom, LiveFlow) are still spreadsheet-model-heavy. Nobody has built "ask a natural-language what-if question in chat and get a modeled answer against the tenant's own data with confidence intervals and open questions."
A real COO's job is telling the founder what a decision will cost before they make it. Adding "Paige can model what will happen before you do it" is the felt COO capability nobody has for SMBs. This is the row of the archetype mapping table that most differentiates Paige from anything competitor.
**What a "business twin" actually is for Paige:**
Not full FP&A. Not enterprise MMM. It's this: **a scenario modeling engine that runs against the tenant's own historical Paige data + reasonable inferred assumptions, and answers a natural-language "what if?" in the transcript with a modeled answer + confidence intervals + open questions.**
Concretely: tenant asks Paige "what would happen if I raised prices 30% and added a $47/mo tier?" — Paige:
1. Pulls historical client acquisition cost, churn, retention, LTV from the tenant's own Paige data
2. Runs the scenario against a simple elasticity model with clear assumptions surfaced
3. Returns a modeled range ("your MRR would likely land between $X and $Y over 12 months, assuming Z% price-sensitivity — here are the two variables that most affect the outcome"), plus the open questions ("we don't have data on your churn beyond 6 months — that's the biggest source of uncertainty")
4. Offers to run the scenario at auto / draft / human tiers (§16): draft the pricing-change plan, or just save it as a scenario
**Build, don't partner.** §34 test resolves cleanly: this is Paige's moat (tenant intelligence, applied to tenant data, delivered in the Paige chat surface). No partner is the right shape — every existing player asks the user to use their tool rather than ask Paige.
**Tech stack:**
1. **Data foundation** — requires tenant's Paige data to be clean and queryable (already true via Supabase + §9 tenant-scoped)
2. **A small library of well-tested scenario models** — pricing elasticity, funnel conversion, retention/churn, cohort LTV, ad-spend response curve. Start with 5-7, all coaching/consulting/agency-shaped
3. **The Paige chat seam** — the `paige-ai-chat` engine already routes; add a `scenario_model` tool the reasoning engine (§34 L4) can call. Result streams into the same conversation as any other Paige answer (§20/§21 — no separate "simulator tab")
4. **Confidence intervals + open questions surfaced honestly (§13)** — if the model has thin data, Paige says so and lists what's missing. Never a false-precision number
**MVP scope:** 3 scenarios, coaching-generic (§2 platform-default clean):
1. Pricing change on an existing offer
2. Adding a new tier / offer
3. Capacity / hiring change ("if I add a VA, what does my throughput look like")
**Regulatory landmine:** any scenario modeling that touches revenue projections risks brushing against financial-advice framing. §2 already prohibits consumer-finance framing in defaults; for business-twin the disclaimer bar is different (this is operator tooling, not consumer advice) but the copy has to be clear these are models over the tenant's own data, not investment advice. A lawyer review before shipping is warranted.
**Marketplace opportunity:** "Scenario templates" — pre-built what-if models for common decisions ("agency capacity planning," "coach pricing tier launch"). Interesting but requires the scenario engine to ship first. Not day-one Marketplace inventory.
### Priority ranking across the three Twin directions
Ranked by leverage for the coach/consultant/agency audience:
1. **Direction B (team-member twin)** — highest leverage first (extends §26; low risk; immediate demo value; every coach with any team wants this)
2. **Direction C (business twin)** — biggest positioning unlock (category-of-one for SMBs; the "model before deciding" row from the archetype mapping)
3. **Direction A (browser agent)** — fastest Marketplace primitive (partner with Browserbase, ship 3 seed Playbooks, open marketplace author path)
Recommended build order: **B (weeks 1-8) → A in parallel (weeks 4-12) → C (weeks 8-20).**
---
## Pillar 4 — Owner Analytics + Competitive Intelligence
**One sentence:** Paige aggregates the tenant's own performance data across every connected system AND monitors competitor changes weekly — with interpretation, not dashboards.
### The strategic significance
Every existing tool in this space is a dashboard. Databox, Whatagraph, Klipfolio, DashThis, Cyfe — they all show numbers, none of them DO anything with them. SimilarWeb, Ahrefs, Semrush give raw competitive intelligence but require the tenant to interpret. Kompyte / Crayon / Klue offer AI-driven competitive intelligence but at $12K-$47K/year — enterprise-only.
Paige's differentiator is not the data — it's the interpretation + the drafted action + the routing to the right §16 department. Data + interpretation + action = the felt "AI COO" moment; data alone is a dashboard.
### The tech stack
**First-party aggregation (the tenant's own data, all free APIs the tenant already granted):**
- GA4 Data API
- Google Search Console API
- Meta Marketing + Graph API
- YouTube Analytics API
- Stripe API
- HubSpot API
- Mailchimp / Klaviyo / ConvertKit / ActiveCampaign APIs
- Kajabi API
**Competitive intelligence — §34 build-our-own via browser agents (owner: Antonio, 2026-08-04).** *"If there's a way that we can pull this off by just simply developing code like the rest of these companies do — actual code that can get it done — why can't we just write our own code so we can go have those same capabilities for Paige Agent AI?"* An earlier version of this section defaulted to enumerating third-party vendors (a SimilarWeb-alt stack: DataForSEO, SparkToro, Meta Ad Library third-party APIs, Wappalyzer) — that defaults into being a vendor customer, exactly what §34 exists to stop. **Paige owns her intelligence end-to-end. LLM API is the ONLY external commodity.**
The right stack is **our own browser-agent infrastructure** — the same infrastructure scoped in Pillar 3 Direction A (Browserbase + Browser-Use + Playwright + Anon, with tenant credential vaulting in our Supabase Vault) — driving scrapes + LLM interpretation:
- **Meta ads** — scraped via web / Meta Ad Library UI, and via our own Paige Agent AI Meta app once it's live. (Meta Ad Library's **free** developer API is scoped to political and social-issue ads ONLY; commercial competitor ads for coach/consultant surveillance require either browser scrape or a paid third-party — we build the scrape ourselves.)
- **YouTube ads** — scraped via YouTube surfaces and the tenant's own YouTube data connections.
- **TikTok ads** — TikTok Creative Center UI + free-with-account TikTok Business account, scraped by our browser agent.
- **Google Ads** — Google Ads Transparency Center (free web UI, no public API), scraped by our browser agent.
- **Competitor websites** — Playwright-diff against prior snapshots (the same self-hosted Fly infrastructure already shipped in `services/visual-renderer`).
- **Tech-stack detection** — self-hosted, using the open-source Wappalyzer patterns library as a Paige worker. (Wappalyzer moved API access to the **$995/mo Team plan** in 2026 — self-hosting the open-source patterns library is the §34-clean answer regardless and keeps cost at $0 external.)
- **SEO / SERP / backlink signals** — extended by our own scrapers where achievable; a paid API stays out of the platform default and becomes a tenant-choice add-on if a specific tenant wants deeper SEO data than our own crawl provides.
- **Audience-overlap intelligence** — modeled from data we can crawl ourselves + LLM interpretation, rather than paying a third-party for their crawl of the same public surface.
**Cost:** **$0 external, we own the code.** The intelligence layer (LLM interpretation, anomaly detection, briefing synthesis) is Paige-native per §34; the browser-fleet infrastructure is the same commodity infra we already pay for in Pillar 3 Direction A. This is a pure extension of Direction A, not a separate stack.
**Sequencing implication.** Pillar 4 Competitive Intelligence now has an implicit dependency on **Pillar 3 Direction A shipping first** — or at least the browser-agent infrastructure being live. Direction A's build order (Browserbase + Browser-Use + Playbook DSL + `autonomy_lane` binding) is a prerequisite for the competitive-intelligence weekly brief. Reflected in the phased build order below.
**Regulatory posture (§13 honest).** Browser-scraping public competitor pages that don't require login is protected under *Meta v. Bright Data* (N.D. Cal. 2024 — ToS don't bind a scraper that operates without logging in). Browser-scraping a portal the tenant is logged into against ToS carries real breach-of-contract exposure and needs the Playbook DSL's ToS-flag + tenant-authorization gate (per Direction A regulatory landmine section). Meta's ToS specifically constrain automated access; a browser-scrape of Meta Ad Library UI operates in a real legal-gray zone that needs counsel review before it becomes a default Marketplace Playbook — ship tenant-authored initially, seed-Playbook only after legal sign-off.
### The Paige interpretation layer — the twist
Every existing tool in this space is a dashboard. Paige is a weekly brief drafter:
- **Monday-morning competitor brief** — "Here's what your top 5 competitors changed this week. Coach Sarah dropped her mid-tier package. Coach James added a new lead magnet titled 'X.' TrackingCoachGroup.com published 4 new blog posts targeting your top-3 keywords."
- **Anomaly-driven briefs** — "Your competitor DidHer.com just started running Meta ads for the first time in 6 months — they spent an estimated $1,200 last week. Here's the creative."
- **Draft-first responses** — "Coach Sarah dropped her mid-tier price. You could match, hold, or reframe. Here's the reframe copy Paige drafted for your Wednesday email."
- **Overlap intelligence** — "Your audience overlaps 47% with @CoachJames — his three biggest inbound sources are X, Y, Z. You show up in none of them. Here's a 3-week test plan."
Per §16 the Marketing department sub-agent owns the weekly brief. Per §11 it renders as a compact `PageHeader variant="plain"` above a `StatRow` of the deltas + a `DataTableShell` of the actionable items — no gradient masthead eating a third of the viewport.
### The Paige-native competitor intelligence pattern (Direction A reuse)
Direct extension of Pillar 3 Direction A (browser agents). Concretely:
1. Tenant lists 3-5 competitor URLs during Playbook setup or later via chat (§20 conversational)
2. Weekly Paige worker (n8n or edge cron):
   - Fetches each URL via Playwright (Fly service — already exists as `services/visual-renderer`) and via the shared Browserbase + Browser-Use infrastructure from Direction A for authenticated / ToS-cleared portals
   - Extracts structured signals: pricing displayed, headlines, CTAs, testimonials count, lead magnets offered, blog post titles
   - Diffs against prior week's snapshot
   - Scrapes Meta Ad Library UI, Google Ads Transparency Center, TikTok Creative Center for competitor active-ad presence (per §34 own-code approach above)
   - Runs the open-source Wappalyzer patterns library against the competitor site for tech-stack changes
3. LLM (Claude via `callModel("competitor-brief", "frontier")` per §17 tier routing) synthesizes the brief
4. §33 visual-critique loop if the brief includes generated visuals
5. Delivers into Command Center as an actionable tile
Tech stack: 100% already in the repo (Playwright/Fly, Browserbase + Browser-Use once Direction A ships, n8n cron, `callModel`, memory layer per §26). Zero new external dependencies; zero external vendor spend for the CI data itself.
### Honest limits (§13)
Data that is genuinely unavailable:
- Competitor's actual CRM data, deal pipeline, private analytics — impossible, and rightly so
- Competitor's true traffic (only estimates) — SimilarWeb is estimates too; we're just estimating cheaper
- Competitor's real email lists / open rates / send volume — not gettable
- Competitor's actual ad spend precise amounts — Meta only gives ranges
- Private social DMs / engagement rates on private accounts — impossible
- Competitor's internal churn / retention — impossible
Accept and communicate honestly: "estimated" is the right word in every UI element that shows competitor volume/spend numbers.
---
## §40 — Integrity Governance (new doctrine section)
**Directive (owner: Antonio, 2026-07-26):** Paige respects the tenant's boundaries — around IP, privacy, and topics the tenant has decided are out of scope for AI involvement — by construction, not by policy. Every sub-agent, every Paige-forged specialist, every §8 action-bus draft, and every future Playbook creator's extension checks the tenant's integrity boundaries as a hard block before touching a restricted topic.
**Concrete mechanisms:**
1. **Per-tenant off-limits register.** Tenant tells Paige "don't touch [X]" — internal salary decisions, a legal matter under NDA, personal family info, a competitor's IP, a topic they've decided is beyond Paige's role. Paige "docks it" = persists the boundary in a `tenant_integrity_boundaries` table (§9 tenant-scoped, RLS'd, append-only audit). Boundaries survive session reset, tenant churn (soft-preserved on reactivate), and Paige model upgrades.
2. **IP respect made explicit and auditable.** §9 already ensures tenant data doesn't cross tenants. §40 extends it with an explicit contract: "your methods, Playbooks, learned patterns, and competitive strategies are yours — they never feed the platform's default learning, never surface to other tenants, never become platform defaults." §26 semantic memory is per-tenant by construction; §40 makes the promise explicit.
3. **Privacy defaults inverted.** By default, Paige uses tenant data ONLY for that tenant's own work. Any cross-tenant learning (aggregated benchmarks, market intelligence, best-practice discovery) is opt-in per tenant, per category — never opt-out, never platform-default.
4. **Sub-agent inheritance.** Every §16 department sub-agent + every Paige-forged specialist (§14) inherits the boundaries. A boundary set in the tenant's chat is instantly honored by the sales agent, the marketing agent, the browser agent, the voice-cloned team-member twin — everywhere. This is a §37 producer-inventory addition to every sub-agent's dispatch contract.
5. **The test, every action:** Before any sub-agent or draft touches a topic, resolve `check_integrity_boundary(tenant_id, topic) → allow | block`. Block is silent to the requester (no leak of what's restricted); the tenant's audit trail records the block for their review.
6. **The competitive gap.** Nobody else in the coach/consultant/agency space builds this because they're not this deep in the operator's business. When Paige runs the whole operation, integrity isn't a nice-to-have — it's how the operator trusts handing over the keys. §40 is a moat by itself.
---
## Revenue-Stage Awareness (first-class tenant profile primitive)
**Directive (owner: Antonio, 2026-07-26):** Paige knows what revenue stage the tenant is at and calibrates every suggestion, every action, every departmental strategy accordingly. Strategy that makes sense at $3M is nonsense at $50K, and vice versa. Paige without stage awareness sounds like an MBA who hasn't met the business. Paige with it sounds like a coach who's been there.
**The five stages, per Antonio's model:**
| Stage | Range | Bottleneck focus |
|---|---|---|
| 1 | $0 → $100K | Offer clarity · lead generation · pricing · first customers |
| 2 | $100K → $1M | Repeatability · systems · first hires · capacity |
| 3 | $1M → $3M | Team ops · delegation · process · retention |
| 4 | $3M → $10M | Org structure · systems maturity · second product/pillar |
| 5 | $10M → $100M | Multi-brand · category leadership · exit prep |
**Data source — HONESTLY confirmed transactions only, never projections:**
- Stripe (native, already connected)
- Paige-issued invoices (native)
- Tenant-confirmed manual entries (audit-trailed — tenant explicitly confirms "yes, this $47K deposit was for coaching services rendered this quarter")
- Later: per-tenant Stripe Connect subaccount rollups (§38-clean pattern when C-2 Connect lane lands)
Never counted: pipeline value, projected revenue, hoped-for close, tenant-typed number without transaction backup.
**Rolling 12-month gross** is the canonical stage-computation metric. Updated in real-time as transactions land. Paige's stage assessment includes a confidence indicator ("we've observed $67K over the last 8 months; extrapolating, you're tracking toward stage 2 in 3-5 months at current pace").
**Every §16 department calibrates to stage:**
- Marketing dept's stage-1 advice ("start posting on ONE channel consistently for 90 days") differs from stage-4 advice ("your bottleneck is your VP of Sales' capacity; let's model 2 SDR hires")
- Sales dept's stage-1 advice ("your first 10 sales come from your network, not funnels") differs from stage-4 advice ("time to build a real sales-ops team")
- Finance dept's stage-1 advice ("track revenue vs. cost, that's it") differs from stage-4 advice ("time for a real controller + monthly close")
- Ops dept's stage-1 advice ("write your first SOP") differs from stage-4 advice ("hire an operator; you should be doing the CEO job, not the fulfillment job")
**Command Center integration:** stage + trajectory displayed prominently. "You're at $47K trailing 12-month, tracking to cross $100K in 4-6 months if current pace holds. Here's what stage-1 → stage-2 companies typically bottleneck on next: [drafted 3-item priority list]." Not a vanity number — a strategic frame the tenant reads once a day.
**Super Admin platform-level view:** distribution of tenants across stages + movement over time. "This month, 23 tenants crossed $100K, 4 crossed $1M, 1 crossed $10M." Also the strongest investor metric — "our tenants graduate stages measurably faster than industry benchmarks." Also the strongest health metric of the whole platform (§35 OS north star — a real OS is measured by what its users achieve, not by what its users log in to).
**Marketplace opportunity:** stage-specific Playbooks. "The Stage-2 → Stage-3 Bottleneck Playbook — by [name]." A whole vertical of Marketplace inventory calibrated to stage transitions, not just industries. Vertical PLUS stage = every Marketplace listing has two axes of specificity.
---
## Entity / Organization Type Awareness (first-class tenant profile primitive)
**Directive (owner: Antonio, 2026-07-26):** Paige captures the tenant's legal entity type + jurisdiction at signup and adapts her mindset to the tenant's structure. Not legal advice — statutory awareness so Paige doesn't suggest wrong things. Entity type determines: which obligations exist, which Playbooks apply, which voice/framing fits, which warnings to flag.
**Entity types supported (US day-one, foreign later):**
- Sole Proprietor
- Single-Member LLC
- Multi-Member LLC
- Series LLC
- PLLC (Professional Limited Liability Company — for licensed professionals: attorneys, doctors, therapists, etc.)
- C-Corp
- S-Corp
- General Partnership (GP)
- Limited Partnership (LP)
- Limited Liability Partnership (LLP)
- Business Trust
- Non-profit 501(c)(3) — general
- Faith-based / religious 501(c)(3) — with sub-tags for church / ministry / religious school
- B-Corp
- Cooperative
Plus jurisdiction: US state + country. US-day-one; capture country so foreign entities work later (per Antonio's framing — foreign persons WILL sign up, capture the shape now to avoid discrepancies).
**Where captured:**
- Required in the signup wizard (B-Platform-v2 already ships the signup surface; this is a small addition to it)
- Editable at `/app/settings/business/entity`
- Persists in a `tenant_entity_profile` table (tenant-scoped, RLS'd, versioned so entity changes over time are auditable)
- Includes: entity_type, jurisdiction_state (US) or jurisdiction_country (non-US), formation_date, ein (nullable — captured only if tenant chooses), tax_year_end, fiscal_year_convention
**What Paige adapts:**
1. **Business Vault obligation catalog** keys off entity_profile:
   - LLC → annual report (per state), registered agent renewal, franchise tax where applicable
   - C-Corp → same + minutes + 10-K if public
   - S-Corp → same + Form 2553 compliance + reasonable-salary rules
   - Non-profit 501(c)(3) → Form 990 filing, state charity registration, unrelated-business-income rules
   - Faith-based 501(c)(3) → automatic exemption nuances (no 990 required for churches meeting integrated-auxiliary criteria), religious-corporation state filings
   - Business Trust → Form 1041 or specific state trust filings depending on structure
   - PLLC → licensing board reporting in addition to entity filings
2. **Voice and framing shift** — a faith-based ministry tenant's Paige speaks in ministry-appropriate voice (mission-driven, community-focused). A tech-agency tenant's Paige is direct and metric-heavy. §3 house voice (mogul-founder, direct, confident) stays but tone-adapts per entity. Never assume for-profit patterns apply to a non-profit; never assume commercial patterns apply to a ministry.
3. **Playbook availability filters** — an "S-Corp Election Tax-Savings Playbook" doesn't show for a non-profit; a "501(c)(3) Compliance Playbook" doesn't show for an LLC. Marketplace listings carry entity-type tags; the tenant sees only what's actually applicable to their entity.
4. **Warnings and flags calibrated** — Paige never suggests an S-election to a non-profit, never suggests private-inurement-risky patterns to a 501(c)(3), never suggests unrelated-business-income traps to a faith-based org, never suggests something a business trust structure prohibits.
5. **Statutory awareness, not legal advice.** Every entity-specific suggestion carries the same framing: "your entity type is [X]; here's the general pattern; consult counsel for your specific situation." Paige is mindful, not attorneys. §2 alignment: never assume expertise Paige doesn't have.
6. **Foreign persons on the platform.** For non-US tenants, Paige surfaces a bright banner: "Paige's default guidance is US-calibrated. For your jurisdiction we can point at general patterns but always recommend local counsel." Foreign-entity Playbooks become a Marketplace opportunity later (a UK-Ltd Playbook creator, a Canadian-Corp specialist, an Australian-Pty-Ltd guide, etc.).
**Doctrine fit:** §2 (never assume domain expertise), §7 (tenant-authored — entity is authored by the tenant, not inferred), §9 (tenant-scoped), §16 (Legal/Compliance dept sub-agent owns entity-aware suggestions), §40 (integrity — respect the tenant's legal reality, don't overreach).
---
## Doctrine cross-mapping — where each pillar rests
Every pillar in this trilogy rests on primitives that already ship. This is why the estimated build effort is measured in weeks, not quarters — and why the strategic risk is competitive timing (someone else copying the framing), not execution.
| Pillar | Rests on |
|---|---|
| Systems Check | §8 action bus · §16 departments · §26 memory (tenant baseline) · §36 5-min test · §11 primitive layer · §10 Paige-callable |
| Business Vault L1 | §8 action bus · §16 departments · §26 memory · §7 tenant-authored · document-extraction pipeline (already exists) |
| Business Vault L2-L4 | §17 billing taxonomy · §35 Marketplace-as-App-Store · §38 money boundary |
| Twin Direction A | §10 Paige-callable · §37 producer inventory · §16 autonomy tiers · §9 credential vault |
| Twin Direction B | §26 semantic memory (extension) · §16 sub-agent inheritance · §9 per-tenant scope |
| Twin Direction C | §34 L4 reasoning · §7 tenant-authored data · §13 honest confidence intervals · §16 department integration |
| Owner Analytics | §16 Marketing dept · §26 memory (baselines) · §11 primitive layer · §36 5-min test |
| Competitive Intelligence | Same + §33 visual critique for generated visuals |
| §40 Integrity Governance | §9 tenant isolation (extends) · §26 memory (per-tenant boundaries) · §37 producer inventory (every sub-agent inherits) |
| Revenue-Stage Awareness | §16 departments (calibrate output) · §26 memory (per-tenant transaction history) · §35 OS north-star metric |
| Entity Type Awareness | §2 no-assumed-expertise · §7 tenant-authored · §16 Legal/Compliance dept · signup wizard (B-Platform-v2, ships) |
Zero new fundamental primitives required. Every pillar is a compounding on shipped infrastructure.
---
## Cross-cutting substrate — Conversations + Voice + Integrations + Memory
**Not new pillars — substrate.** Four capabilities cut across every pillar in the Trilogy. They are first-class infrastructure every pillar flows through, and they are how the four pillars feel like one product to the tenant. They are named separately here because they are load-bearing, not because they are competing with the pillars for a fifth slot on the spine.
- **Conversations (Unified Comms Substrate per §49) — SHIPPED.** Every pillar's outputs land in Conversations: Systems Check alerts arrive as a Conversation thread; Vault renewal reminders arrive as a Conversation thread; Twin drafts arrive for approval as a Conversation thread; Owner Analytics briefs arrive as a Conversation thread. Conversations is how Paige talks to the operator and how clients talk back. Already shipped per tasks #70, #78, #89, #112, #121-146.
- **Voice Layer (per §131, tasks #140, #168, #170) — PARTIALLY SHIPPED.** Inbound and outbound calls, Paige-as-live-co-pilot during calls, TTS/STT via Deepgram + ElevenLabs, per-tenant configurable voice. Every pillar can trigger a call: Vault renewal → outbound reminder call; Systems Check outage → operator escalation call; Twin-drafted conversation → phone touchpoint if the tenant approves. Every call becomes a Conversations thread row per §49 wiring. MVP + slices shipped; remainder in flight.
- **Integrations (n8n + Zapier + MCP + OAuth) — FUTURE (Phase 2 first slice per owner sequencing lock).** The external-tool connectivity layer that lets Paige's departments (§16) drive third-party APIs, receive webhooks, and act as an MCP client/server. Prerequisite before Paige can be truly proactive across the tenant's stack.
- **L8 Memory Fabric — FUTURE (parallel to or after Trilogy Phase A per owner sequencing).** The persistent semantic memory substrate the whole Trilogy runs on. §26 already ships tenant-scoped voyage-3 embeddings + prompt-forge; L8 formalizes and expands that substrate so every pillar (Systems Check baselines, Vault learned obligations, Twin writing-style profiles, Analytics interpretations) reads from and writes to one memory fabric with a consistent shape.
**Marketplace listings map to substrate too, not just pillars.** A Conversation template, a Voice persona, an n8n workflow, a memory-shaped Skill — these are §12-organized against the substrate layer that hosts them and the pillar they serve. A Voice persona is authored per-tenant (§9) and lands in the Voice substrate; the Vault pillar can trigger it. Substrate ≠ standalone; it is what every pillar rides on.
**The test, every substrate build:** *"Does this serve one or more pillars, and is it structurally shared across them — or is it actually a pillar-scoped feature masquerading as substrate?"* If it's pillar-scoped, file it against that pillar and don't inflate the substrate layer.
---
## Phased build order
Sequencing rationale explained per phase, with the pillar dependencies:
**Phase A — Trust foundation (weeks 1-6)**
- Systems Check MVP (30-check catalog, onboarding + scheduled flavors, Command Center tile)
- Business Vault L1 (tracking + document-extraction + reminder engine, no partners)
- §40 Integrity Governance doctrine + `tenant_integrity_boundaries` table + sub-agent enforcement
- Revenue-Stage Awareness data pipeline + Command Center display
- Entity Type Awareness signup capture + tenant profile primitive + Vault obligation-catalog keying
*Why first:* these are the trust primitives. Systems Check proves Paige can catch what's broken. Vault L1 proves she can track what matters. §40 proves she respects boundaries. Revenue-stage proves she understands the tenant. Entity-type proves she understands the legal reality. Only after these ship should Paige build higher-order intelligence (Twin-C, Competitive Intelligence). L3/L4 partner integrations wait for the post-launch future phase per the Vault scope discipline above.
**Phase B — Marketplace + Twin-B writing-style + Direction A infrastructure (weeks 4-10, parallel with Phase A)**
- Vault L2 (Playbook creator surface for Vault catalogs — Marketplace extension)
- Systems Check Playbook extensibility (YAML Check Spec DSL — Marketplace)
- Twin Direction B Phase 1 MVP (writing-style profile per teammate — §26 extension; NO voice/video yet, no deepfake consent gate needed for writing-style per §11-doctrine narrow scoping)
- **Twin Direction A infrastructure MOVED EARLIER:** Browserbase + Browser-Use + Playbook DSL + `autonomy_lane` binding + tenant credential vault (Supabase Vault). This is a prerequisite for Pillar 4 Competitive Intelligence per the §34 own-code correction — CI needs the browser infrastructure to scrape competitor ads / sites / tech stacks without third-party vendors.
- 3 seed browser-task Playbooks (ClickFunnels reporting, Kajabi bulk-message; **NOT LinkedIn Sales Nav as a seed** — its ToS profile makes it tenant-authored-only)
*Why parallel:* these extend the trust primitives with Marketplace inventory + the first Twin capability + the Direction A infrastructure that CI depends on. B Phase 1 (writing-style) ships from §26 with no vendor dependency. Direction A infrastructure earlier means Pillar 4 CI can ship without a third-party ads/SEO/tech-stack vendor.
**Phase C — Higher-order intelligence (weeks 8-16)**
- Twin Direction C MVP: business scenario modeling (3 scenarios — pricing change, add tier/offer, hiring/capacity), gated on tenants having enough Paige data foundation to model against
- Competitive Intelligence MVP: **our own browser-agent scrapes** of Meta Ad Library UI, Google Ads Transparency Center, TikTok Creative Center, competitor sites (Playwright + Fly diff), self-hosted Wappalyzer patterns for tech-stack detection — synthesized into a weekly brief via the Marketing department sub-agent. Depends on Phase B Direction A infrastructure being live. $0 external vendor spend for the CI data itself.
- Owner Analytics first-party aggregation MVP (GA4 + GSC + Stripe + Meta + YouTube feed into Marketing dept weekly brief)
- Owner Analytics stage-2: cross-integration insights ("your Meta CPA is down 12% but your GA4 conversion is flat — the issue is post-click, not pre-click")
*Why here:* by this point Paige has enough data foundation (Phase A trust + Phase B Marketplace + Direction A infra) to run scenario modeling and our-own-code competitive intelligence with real signal. Twin-C (business twin) is the biggest positioning bet — save it for when the substrate can support it credibly.
**Phase D — Twin Direction A depth (weeks 12-20)**
- Twin Direction A depth: 10-20 more browser-task Playbooks (Marketplace-seeded + tenant-authored). LinkedIn Sales Nav and similar high-ToS-risk targets remain tenant-authored-only with the consent+risk acknowledgment gate.
- Voice Layer expansion per §131 (already partially shipped; continue slices)
*Why here:* Direction A becomes a Marketplace flywheel once the infrastructure is proven in production for Phase B seed Playbooks and Phase C CI use.
### Future Phase (post-launch / post-SOC 2 / post-investor) — Vault L3 + L4, Twin-B voice/video
**Gated behind three unlocks (owner-directed, 2026-08-04):** platform is live to paying tenants, SOC 2 is complete, investors are engaged. Do NOT scope, negotiate, or build these before those three land.
- **Vault L3 Pilot 1:** Northwest Registered Agent integration (RA + formation, $60 net per order affiliate).
- **Vault L3 Pilot 2:** Harbor Compliance integration (annual filings + licenses), negotiated as an equal not a downstream affiliate given the Firstbase acquisition (see Vault L3 stack).
- **Vault L3 Pilot 3:** QuickBooks App Store developer program + 1-800Accountant ShareASale affiliate.
- **Vault L4 stub:** CoverWallet insurance affiliate ($30/completed quote via FlexOffers, licensed party is CoverWallet).
- **Vault L3 depth:** negotiate Coterie or Coverdash embedded insurance API with real counsel per partner type.
- **Vault add-when-cheap:** Namecheap domain + SSL affiliate.
- **Twin Direction B Phase 2:** ElevenLabs voice cloning + HeyGen/Tavus video partner integrations, gated behind a hardened per-person consent workflow calibrated to the strictest applicable state regime (ELVIS Act + CA AB 2602 + NY Synthetic Performer Disclosure + Digital Replica ROP). This is the narrow slice of Twin work that triggers the deepfake regulatory regime — see Direction B regulatory landmine section for scope.
*Why future:* L3/L4 partner negotiations, legal review per category, and money-flow plumbing are not pre-launch work. Twin-B voice/video legal review of consent artifact against state statutes must be done BEFORE this phase ships, not after — hard-block until the compliance stack lights up.
**Total elapsed for current-scope (Phase A through D):** roughly 20 weeks with parallel crews per §14; longer if legal reviews on Direction A ToS-flag DSL take extended counsel time. Future phase is post-launch and does not have a fixed week-count in this document.
---
## Marketplace-listing shape per pillar (the L2 rev-share dimension)
Every pillar becomes Marketplace inventory. Playbook creators build; tenants install; §17 L2 revenue splits per the rev-share model researched earlier.
| Pillar | Marketplace listing type | Example |
|---|---|---|
| Systems Check | Vertical Check Catalogs | "Medspa Systems Check — 30 defaults + 7 HIPAA-specific checks" |
| Business Vault L2 | Vertical Obligation Playbooks | "Fitness Studio Renewals — every filing, insurance, and license a fitness studio needs to track" |
| Twin Direction A | Browser-task Playbooks | "The ClickFunnels Weekly Report Playbook — Paige logs in every Monday, exports funnel stats, drops into your dashboard" |
| Twin Direction B | Persona Playbooks | "The Friendly-But-Firm Collections VA Playbook — writing-style + decision-pattern template your VA gets personalized against" |
| Twin Direction C | Scenario Templates | "Agency Capacity Planning Scenario — what happens when you add an account manager" |
| Owner Analytics | Vertical KPI Dashboards | "Course Creator KPI Dashboard — completion rate, refund rate, testimonial capture, community engagement" |
| Competitive Intelligence | Competitor Watch Lists | "The Top 10 SEO Agencies Watch List — curated by [SEO thought leader]" |
| Revenue-Stage | Stage-Transition Playbooks | "The Stage 2 → Stage 3 Bottleneck Playbook — by [name] — for the $500K-$1.5M practice" |
| Entity-Type | Entity Compliance Playbooks | "The Faith-Based 501(c)(3) Playbook — every filing, every voice consideration, every trap to avoid" |
Combined: a 2-axis Marketplace (vertical × stage, or vertical × entity, or persona × role) with meaningfully more inventory density than any single-axis competitor marketplace.
---
## Competitive timing — GoHighLevel + Viktor.com are the actual direct competitors
**Owner correction 2026-08-04:** *"GoHighLevel and Viktor.com are more of our direct competitors than Doola would be any day. I've never even heard anybody talk about Doola."* The direct-competitor framing anchors on the coach / consultant / agency CRM incumbents — the tools these operators actually use today — not on the formation-first players in adjacent categories. Doola and Firstbase are demoted to reference footnotes below.
**GoHighLevel** — the strongest direct competitor. Coach / consultant / agency CRM incumbent with the largest install base in the audience Paige is built for. Currently a fragmented tool-shed of separately-activated features (CRM, funnel builder, email, calendars, pipelines). Most likely to bolt on Systems-Check-adjacent monitoring since they already partial-ship email deliverability reporting. Architecturally can't do the Twin pillars in the shape Paige plans (their platform is CRUD + workflows, not agent-driven with tenant-authored department sub-agents). Vault-shape is possible but they'd need to build it against a coaching/consulting audience they treat as one vertical among many.
**GoHighLevel's "Summer of AI 2026" (June-August).** GHL is bundling 5 AI tools free + 2 more in trial — Ask AI, AI Studio, Workflows AI, Funnel AI, Email AI + trial access to Conversation AI and Voice AI. This is *directionally* AI-forward but structurally reinforces the fragmented-vs-unified distinction Paige wins on: **7 separately-configured task-level AI tools the tenant has to activate and steer** versus **one Paige orchestrating a standing team of department sub-agents (§16)**. Their framing is task-level ("respond faster, save time, launch campaigns"); Paige's framing is COO-level (runs the whole company at operator direction). The unbundling of features into 7 named "AI tools" is exactly the architecture pattern §16 exists to replace. The launch itself is a signal buyer intent for AI has hit the coaching-CRM adjacency; the answer to it is not more task-level AI tiles.
**Viktor.com** — the second direct competitor named by the owner. Coach / consultant / agency management tool with a real presence in the audience Paige builds for. Similar competitive shape considerations: adjacent to Paige's positioning but not agent-driven end-to-end in the way §14/§16 already deliver.
The timing window on this vector is a function of **how fast the coaching-CRM incumbents move to genuinely unified AI orchestration** (not more task-tile AI features). GoHighLevel's Summer of AI shape suggests they are not there yet — the answer to Paige's positioning is a structurally different platform, not a bigger AI toolbox. Ship the Trilogy pillars with the Direction A + B + C integration that GHL cannot replicate quickly, and the moat is architectural, not marketing.
**Other players in adjacent categories (reference footnotes only — not urgent direct-competitor timing):**
- **Doola** — LLC formation for non-US founders, sells a "Total Compliance" $1,999/yr plan that bundles some Vault-shaped obligation tracking. Different audience (non-resident and international founders); not directly named by the owner as a competitor. May eventually enter this space.
- **Firstbase** — international-founder formation; acquired by Harbor Compliance December 2025. Same demotion as Doola.
- **Harbor Compliance** — enterprise-cadence compliance platform. Owns Firstbase post-acquisition; more relevant as a future L3 partner (see Vault L3 future-phase stack) than as a direct competitor.
- **HubSpot** — could do Owner Analytics but architecturally can't do Vault or Twin-C (their platform is CRUD + reports, not agent-driven). Very slow to ship anything.
- **Kajabi / Kartra / ClickFunnels** — course-platform-shaped, not going to enter this space.
- **The SMB Tool** (thesmbtool.com) — Vault-shaped feature set at L1, currently beta, geo-limited (WA/OR/ID/CA + federal). Watch, don't engineer around.
---
## Open questions (the honest ones we haven't resolved)
1. **Business Vault L1 UX for document upload** — chat-first (drop the PDF into Paige chat) OR a dedicated `/app/vault` surface (a real filing cabinet)? Recommend chat-first for onboarding + a dedicated deep-view for browsing. Verify with Systems Check spec design.
2. **Entity change history** — if a tenant re-elects entity (LLC → S-Corp election, for example), does the historical entity profile get preserved for the years it was accurate? Recommend yes, versioned.
3. **Revenue-stage backfill** — for existing tenants with pre-Paige transactions, how far back do we compute? Recommend rolling 12 months from first Paige transaction date; tenant can manually confirm earlier revenue if they choose to backfill.
4. **§40 boundary override UX** — if a boundary conflicts with a legitimate need (tenant said "don't discuss salary" but a payroll tax filing requires knowing salary), how does Paige surface the conflict? Recommend a "boundary conflict — proceed / redefine / cancel" prompt to the tenant; never a silent override.
5. **Twin-C confidence framing** — how much statistical rigor is enough? A Bayesian posterior with credible intervals is technically right but reads as jargon to a coach. Recommend a "confidence: high / medium / low + here's why" framing plus the numeric range, per §36.
6. **Playbook creator revenue share for Vault Playbooks** — same L2 rev-share as skill Playbooks, or a different band since Vault Playbooks include statutory/regulatory content? Verify with the marketplace-competitive-landscape doc's rev-share benchmarks.
7. **Foreign-tenant defaults** — beyond the "US-calibrated by default, get local counsel" banner, does Paige offer any actual foreign-entity Playbooks day-one? Recommend NO — signal the surface exists, don't half-ship inaccurate guidance.
8. **Systems Check false-positive fatigue** — the "3 submissions vs. usual 47" anomaly is only useful if the baseline is right. How does Paige learn a tenant's true baseline vs. seasonal fluctuation? Recommend rolling 30-day + day-of-week normalization; explicit "vacation mode" tenant can toggle to suppress alerts.
9. **Insurance L3 legal timeline** — the Coterie/Coverdash embedded-API deal is going to take 3-6 months of legal review + partner negotiation. Do we hold Vault L3 until it lands, or ship the L4 CoverWallet stub first? Recommend ship the L4 stub first; the L3 upgrade is transparent to the tenant.
10. **Paige-on-Paige internal build** — should Paige Agent AI LLC itself run on Paige (§45 "Paige on Paige" workstream)? Ties to the demand for a working proof of the whole trilogy. Recommend yes — the strongest investor artifact and the highest-fidelity dogfood.
---
## Next moves
Following this strategy doc, three deliverables (in order):
1. **Systems Check spec (v0)** — task #80. The 30-check catalog + YAML Check Spec DSL + Command Center tile + Playbook-extensibility contract + onboarding "first 5 minutes" flow. Ready to hand to Claude Code as the next slice after C-1.5 + C-2 land. This is the fastest wow-moment ship.
2. **Business Vault L1 spec (v0)** — task #81. The tracking + document-extraction pipeline + obligation-item schema + entity-type-keyed obligation catalog + Command Center integration. Establishes the trust foundation for later L2-L4 partner work.
3. **§40 doctrine amendment to CLAUDE.md** — file the Integrity Governance section as its own § in the doctrine. Also file the Revenue-Stage Awareness + Entity-Type Awareness as first-class tenant profile primitives (either their own § sections or as concrete additions to §7 tenant-authored).
Following those three deliverables, Claude Code has enough to build Phase A end-to-end. Twin capabilities (Phase B/C/D/E) and Vault L3/L4 partnerships (Phase C/D/E) become their own subsequent handoffs once Phase A ships.
---
## Sources
- **`docs/strategy/business-vault-partner-landscape-2026-07-26.md`** (filed 2026-08-04) — 10 categories, 5 pilot recommendations, regulatory-friction ranking, corrected citations (NC not CT anti-rebate, Northwest $60/order not $100/$150, QuickBooks App Store not ProPartner, Harbor Compliance acquired Firstbase Dec 2025), state-level BOI (NY LLC Transparency Act Jan 2026), competitive-timing thesis update.
- **`docs/strategy/twin-capabilities-landscape-2026-07-26.md`** (filed 2026-08-04) — Directions A/B/C player-by-player, partner stack recommendations, full 47-state deepfake landscape (ELVIS Act + CA AB 2602 + NY Dec 2025 laws + Illinois + Louisiana), Meta v. Bright Data implications for Direction A, Browserbase pricing model correction.
- **`docs/strategy/systems-check-and-analytics-landscape-2026-07-26.md`** (filed 2026-08-04) — 30-check catalog validation, per-vendor API terms, greenfield confirmation vs. dashboard incumbents (Databox / Whatagraph / Klipfolio / DashThis / Cyfe) and enterprise CI incumbents (Crayon / Klue / Kompyte), Meta Ad Library free-API political-only scope, Wappalyzer $995/mo Team plan for API access.
- Earlier Cowork/Claude Code strategy artifacts: marketplace-competitive-landscape doc, client-experience-workstream doc, monetization-rollout-strategy doc, money-spine-architecture doc.
Doctrine references (all `CLAUDE.md`):
§1, §2, §3, §7, §8, §9, §10, §11, §12, §13, §14, §16, §17, §18, §25, §26, §27, §32, §33, §34, §35, §36, §37, §38, §40 (new), §45, §49
---
*End of strategy doc.*
