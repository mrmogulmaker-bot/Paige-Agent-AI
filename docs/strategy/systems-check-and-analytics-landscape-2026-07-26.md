# Systems Check + Owner Analytics + Competitive Intelligence — Landscape Research

**Date:** 2026-07-26
**Status:** Companion research to `docs/strategy/owner-trilogy-2026-07-26.md`
**Scope:** Provides the vendor pricing, API terms, competitive-shape, and prior-art
verifications the Trilogy strategy doc references for Pillar 1 (Systems Check) and
Pillar 4 (Owner Analytics + Competitive Intelligence).
**Discipline:** §13 honest limits — where pricing or API terms could not be verified
first-hand, that is noted inline. Estimated economics are labeled "estimated." §2
coaching/consulting/agency-generic throughout; no finance-vertical assumptions.

---

## 1. Systems Check — competitive greenfield confirmation

### 1a. Uptime monitors — single-URL HTTP checks, not cross-domain systems posture

**Pingdom.** Basic Uptime Check pings a URL and verifies the response code (200 =
healthy; 4xx/5xx/timeout = down). An optional "Check for string" feature can flag
a page that returns 200 but is missing an expected body string. Scope is
single-URL HTTP(S), ping, TCP port, DNS, and transaction checks — not cross-tool
signal integration. [Pingdom uptime product](https://www.pingdom.com/product/uptime-monitoring/) ·
[Pingdom HTTP check best practice](https://www.pingdom.com/blog/make-the-most-of-your-http-check-best-practice-for-optional-settings/) ·
[Pingdom HTTP Custom Check docs](https://help.pingdom.com/hc/en-us/articles/115000431709-HTTP-Custom-Check).

**Better Stack (formerly Better Uptime).** Modular observability suite — uptime
monitoring, status pages, on-call, incidents, log management, OTel tracing, RUM,
error tracking, session replay, AI-assisted incident response. Monitors websites,
servers, DBs, and APIs. Priced per responder ($29/license/mo annual) plus telemetry
bundles ($25–$420/mo). Free tier: 10 monitors, 1 status page, Slack/email alerts.
[Better Stack pricing (StackScored)](https://www.stackscored.com/pricing/uptime-monitoring/better-stack/) ·
[Better Stack review (CubeAPM)](https://cubeapm.com/blog/betterstack-pricing-review/).

**UptimeRobot.** 50 monitors free (personal/non-commercial) at 5-min checks;
paid Solo $7/mo, Team $29/mo, Enterprise $54/mo. HTTP(S), keyword, ping, port,
heartbeat monitors. Explicitly a URL-level uptime tool, not a cross-tool
diagnostic. [UptimeRobot pricing 2026](https://apistatuscheck.com/pricing/uptimerobot/) ·
[UptimeRobot capabilities](https://uptimerobot.com/knowledge-hub/monitoring/ultimate-guide-to-uptime-monitoring-types/).

**Verified:** All three tools verify HTTP-response health of a URL (with
per-domain add-ons like keyword-in-body, cert expiry, DNS). **None** check the
horizontal set the Trilogy doc calls out: whether the tenant's form submits +
delivers to CRM + fires pixel + notifies the tenant, whether their Twilio number
is A2P-registered and receiving, whether GA4 stopped firing three days ago,
whether the Instagram DMs are being answered inside SLA, whether the confirmation
emails to Calendly bookings are bouncing. Confirmed greenfield in Trilogy §66.

### 1b. Marketing analytics — performance after arrival, not "are the systems alive"

**GA4.** Performance analytics for traffic that already arrived: sessions,
conversions, funnel drop-off, retention, cohorts. Free with 10M events/mo before
sampling; Data API free with a 25k daily-token, 1,250-per-hour quota; concurrency
capped at 10 requests per property. [GA4 API quota
docs summary](https://whatagraph.com/blog/articles/google-analytics-4-api-limits) ·
[GA4 free tier limits](https://analytify.io/google-analytics-limits/). GA4 has no
concept of *"the form isn't submitting"* — it tells you conversions dropped, not
which of the 7 upstream systems broke.

**HubSpot.** Reports on activities and outcomes (calls made, emails sent, deals
closed, pipeline value) plus cohort/attribution/conversion-path analysis on data
inside HubSpot. Not a diagnostic layer; it's the CRM's own reporting. Even
HubSpot's own guidance calls the trap out: *"tracking calls made or emails sent
measures effort, not results — build reports that connect activity to pipeline
created, deals closed, revenue generated."* [HubSpot reporting product](https://www.hubspot.com/products/reporting-dashboards) ·
[HubSpot reporting patterns](https://smithdigital.io/blog/hubspot-dashboard-guide).

**Verified:** These are performance-after-arrival tools, not systems-are-alive
tools. They cannot answer "is your tracking still firing at the source" — that
requires an out-of-band pixel monitor (Trackingplan/ObservePoint). Confirmed
consistent with Trilogy §66.

### 1c. Website audits — one-shot vs. continuous, no cross-domain interpretation

**Screaming Frog.** Desktop crawler for on-demand technical SEO audits.
One-time license fee; scheduled scans possible but the tool is fundamentally
manual-crawl. [Screaming Frog product](https://www.screamingfrog.co.uk/seo-spider/) ·
[Screaming Frog vs Ahrefs](https://aeoengine.ai/blog/screaming-frog-vs-ahrefs).

**Ahrefs.** Continuous site audit + rank tracking + backlink monitoring + keyword
research. Lite starts $129/mo; API access approximately $999/mo on top of
subscription. [Ahrefs pricing 2026](https://clarorank.com/ahrefs-pricing/) ·
[Ahrefs API/Semrush comparison](https://thatmarketingbuddy.com/blog/semrush-api-pricing).
Ahrefs and its analog Semrush are continuous *SEO* monitors — they will not tell
the tenant that their Meta Pixel stopped firing, that their Twilio number lost
A2P registration, or that their Stripe webhooks are failing. Scope is SEO/content.

**Verified:** Consistent with Trilogy §66. One-shot vs continuous, both narrow
to SEO/content, neither does the cross-domain full-stack systems-check shape.

### 1d. Deliverability — single-channel, no cross-comms

**GlockApps.** Inbox placement testing (send-and-measure across seed inboxes at
Gmail/Outlook/Yahoo), DMARC monitoring, blocklist checks. Free (2 spam-test
credits); Essential $59/mo (360 credits); Growth $99/mo (1,080 credits); Enterprise
$129/mo (1,800 credits). Public API/programmatic access confirmed in product
descriptions. [GlockApps pricing 2026 (usebouncer)](https://www.usebouncer.com/glockapps/) ·
[GlockApps features](https://emailwarmup.com/blog/email-deliverability-tools/glockapps-review/).

**Google Postmaster Tools.** Web-UI-native reputation + spam-rate + delivery-
error monitoring for domains that send meaningful volume to Gmail. Free.
Programmatic access via the Postmaster Tools API is available; **v1 is being
retired in favor of v2** with schema changes coming through 2026. [Postmaster Tools
overview 2026](https://smtpedia.com/google-postmaster-tools/) ·
[Postmaster Tools API reference](https://developers.google.com/workspace/gmail/postmaster/reference/rest).

**Verified:** Both are single-channel (email only) with no cross-channel signal.
Neither watches Twilio SMS, WhatsApp, IG DMs, FB DMs, or answers "your
confirmations are bouncing on Wednesday afternoons only." Trilogy claim
confirmed.

**⚠ Follow-up flag for Trilogy §101:** the Google Postmaster Tools API is in a
**v1 → v2 migration window through 2026** — implementations that assume v1
should be built with the v2 cutover in mind. This is not a blocker for the
30-check catalog, but should be tracked when the check ships.

### 1e. Pixel monitors — enterprise-priced, wrong shape for coach/consultant SMB

**ObservePoint.** Enterprise tag-governance platform (~15 years old). Published
pricing: Essentials $599/mo (up to 4,000 page scans); Professional $2,400/mo
(20,000 scans); Enterprise custom. Reported average contract value: **~$72,000/yr**.
[ObservePoint pricing](https://www.observepoint.com/pricing/) ·
[ObservePoint pricing summary](https://www.blastanalytics.com/blog/increase-enterprise-data-quality-with-observepoint).
Wrong price point for coach/consultant/agency SMBs.

**Trackingplan.** Automated observability for web + app analytics/pixels.
Pay-as-you-grow starts at $0/mo up to 10,000 MAUs; free version monitors 3
trackers and 25k monthly visitors; Enterprise starts at **$1,500/mo** billed
annually. AI-assisted debugging + real-time alerts on tracking errors.
[Trackingplan pricing (TrustRadius)](https://www.trustradius.com/products/trackingplan/pricing) ·
[Trackingplan changelog](https://www.trackingplan.com/changelog).

**Verified:** ObservePoint is enterprise-only. Trackingplan has a free tier and
a hard jump to $1,500/mo Enterprise — the SMB tier is real but the fully
monitored version is enterprise-priced. Neither integrates tracking-health with
the cross-domain systems posture the Trilogy proposes. Consistent with §66.

### 1f. Greenfield conclusion — the full 30-check shape

**No player in the coach / consultant / agency SMB space ships the full 30-check
horizontal catalog with anomaly-detection interpretation + drafted fixes routed
to a §16 department.**

- Uptime, deliverability, pixel-monitoring, and site-audit tools each solve ONE
  vertical slice.
- GoHighLevel (the strongest coach-vertical CRM incumbent per multiple 2026
  round-ups — [AI tools for coaches 2026 (Storyflow)](https://storyflow.so/blog/best-ai-tools-coaches-consultants-2026),
  [GHL deliverability guide](https://www.thestackinsiders.com/blog/gohighlevel-email-deliverability))
  offers basic email deliverability reporting (delivery/open/bounce rate) and
  suggests **external** tools (Google Postmaster, MXToolbox) for real
  monitoring. It does not ship pixel health, form-to-CRM smoke tests, Twilio
  A2P health, Stripe webhook health, or automation-run monitoring as an
  integrated diagnostic. It absorbs some monitoring; it does not do the
  horizontal check.
- HubSpot ships CRM-scoped analytics; the systems-check shape is not a HubSpot
  product.
- Kajabi, ClickFunnels, Kartra, Dubsado, Paperbell — none ship anything in this
  shape.

**Threat vector to monitor.** GoHighLevel is the most likely coach-vertical
incumbent to bolt on deliverability-adjacent monitoring since they already
partial-ship email health. They would be limited by (a) SMTP-vendor swap-ins are
their existing pattern, not diagnostics, and (b) they do not have the §26
memory or §16 department attribution to route drafted fixes intelligently. A
narrower "email health" competitor tile is more likely than a full-shape one.

---

## 2. 30-check catalog validation

### 2a. Free / native / self-hosted checks — cost and API terms confirmed

| Check (Trilogy §74–115) | Data source | Access terms verified |
|---|---|---|
| Website responds < 3s (multi-region) | Self-hosted Playwright ping or UptimeRobot | UptimeRobot free 50 monitors non-commercial; Solo $7/mo commercial. [pricing](https://apistatuscheck.com/pricing/uptimerobot/) |
| SSL cert expires > 30 days | `tls.connect()` in worker | Free/native Node standard lib |
| Domain WHOIS not expiring < 60 days | `whois` npm package | Free/native |
| DNS resolves (A/MX/TXT SPF/DMARC) | `dns.resolve()` | Free/native Node standard lib |
| Sitemap.xml + robots.txt in GSC | GSC API + fetch | GSC API free; standard Google API quota |
| Core Web Vitals in "Good" band | PageSpeed Insights API | Free at **25,000 queries/day** with 400-per-100s rate limit per API key. [PSI API rate limits](https://groups.google.com/g/pagespeed-insights-discuss/c/dB7hWmGAGsw) · [PSI API docs](https://openpanel.com/docs/articles/websites/google-pagespeed-insights-api-key/) |
| 404/5xx rate < baseline | GSC coverage + PSI | Free/GSC free |
| GA4 events firing (per event name) | GA4 Data API | Free with **25k daily tokens · 1,250 per hour · 10 concurrent** per property. [GA4 API quotas](https://whatagraph.com/blog/articles/google-analytics-4-api-limits) |
| Meta Pixel firing (Lead/Purchase/VC) | Meta Marketing + Graph API | Development-tier free (60 pts / 300s window); Standard Access requires App Review. [Meta Marketing API limits](https://admanage.ai/blog/meta-marketing-api-challenges-and-fix) |
| Meta Ads account healthy | Meta Ads API | Same access model as above |
| Google Ads account healthy | Google Ads API | Explorer tier now grants **instant production access** with an MCC; 2,880 ops/day. [Google Ads Explorer tier](https://ppc.io/blog/google-ads-api) |
| Landing pages load AND convert | GA4 + Paige baseline | GA4 free |
| UTM tagging consistent | GA4 acquisition report | GA4 free |
| Lead form submits end-to-end | Fly Playwright | Self-hosted infra cost |
| Form conversion within baseline | GA4 + Paige baseline | GA4 free |
| Calendar booking → CRM contact | Playwright + Calendly API | Calendly Free / Standard $12/user/mo; API on paid tiers. [Calendly pricing](https://costbench.com/software/scheduling/calendly/) |
| Booking-to-show rate | Calendar + native CRM | Native |
| SPF/DKIM/DMARC valid | DNS lookups | Free/native |
| Postmaster reputation "high" + spam < 0.10% | Postmaster Tools API | Free web UI; **API in v1 → v2 migration through 2026**. [Postmaster Tools API](https://developers.google.com/workspace/gmail/postmaster/reference/rest) · [PMT 2026 overview](https://smtpedia.com/google-postmaster-tools/) |
| Twilio SMS number active + A2P registered | Twilio API | Free API auth; pay-per-event ($0.0083/US SMS, $0.05/Verify OTP). [Twilio pricing](https://www.twilio.com/en-us/pricing) |
| Email inbox placement sample | GlockApps API | **Opt-in only per Trilogy §101** — $59/mo Essential up. [GlockApps pricing](https://www.usebouncer.com/glockapps/) |
| WhatsApp / IG / FB DM connected + SLA | Meta Graph API | Free auth; same quota model as Meta Marketing |
| Stripe webhooks succeeding | Stripe API | Free API auth; 2.9% + $0.30/transaction on charges (unrelated to check). [Stripe pricing](https://checkthat.ai/brands/stripe/pricing) |
| Failed-charge rate not spiking | Stripe API | Same |
| Automation runs (n8n) not failing | n8n REST API | Native to self-hosted n8n; `GET /executions` supports status/workflow/project filters. [n8n API reference](https://docs.n8n.io/connect/n8n-api/api-reference) |
| Scheduled sequences firing | Kajabi/CK/etc APIs | Vendor-specific; most free-with-account |
| Client portal reachable + login | Fly Playwright | Self-hosted |
| CRM data quality | Native CRM tables | Native |
| Newly-published-thing smoke tested | §10 Paige-callable | Native |
| Backup + tenant-row integrity | Direct DB queries | Native |

### 2b. Economics — the "<$5/mo per tenant at 100 tenants" claim

**Verifiable per-tenant external vendor floor** (assuming 100 tenants, opt-ins
where noted):

| Vendor | Purpose | 100-tenant cost model | Per-tenant/mo |
|---|---|---|---|
| UptimeRobot | External ping validation (Solo) | 1× Solo $7/mo covers 10 monitors — need ~4 accounts for 100 tenants @ 1 monitor each ≈ $28/mo total, OR self-host Playwright ping | ~$0.28 |
| PageSpeed Insights API | Core Web Vitals | Free (25k/day is 250 checks/tenant/day) | $0.00 |
| GSC API | Sitemap / coverage | Free | $0.00 |
| GA4 Data API | Event health | Free (quota is per-property, tenants use their own) | $0.00 |
| Meta Marketing API | Pixel / ads health | Free-tier development access; per-tenant OAuth on their own ad account | $0.00 |
| Google Ads API | Google Ads health | Free with Explorer tier + MCC | $0.00 |
| Twilio API | A2P / number health | Free auth (no read charge); usage separate | $0.00 |
| Calendly API | Booking flow | Free on Standard+ (tenant-side) | $0.00 |
| Stripe API | Webhook / charge health | Free auth; usage is on tenant's charges | $0.00 |
| n8n REST API | Workflow health | Self-hosted, native | $0.00 |
| Postmaster Tools API | Deliverability | **Free web UI · API v1→v2 in flight; assume free-tier metering for now** | ~$0.00 (est) |
| GlockApps (**opt-in**) | Inbox placement | Essential $59/mo = 360 credits ÷ 100 tenants ≈ 3.6 credits/tenant/mo | ~$0.59 (opt-in only) |

**Verified:** the **<$5/tenant/mo external vendor floor** claim (Trilogy §116)
is comfortably achievable — most checks are free-vendor with tenant-side OAuth,
and the only bounded-cost line is opt-in inbox placement testing. Even
including the Fly-hosted Playwright worker (a shared cost, ~$50–$100/mo for a
warm-browser pool per current `services/visual-renderer` precedent, amortized
across all tenants), per-tenant amortized cost lands well under $5/mo.

### 2c. Changes since July 2026 that warrant a follow-up

1. **DataForSEO (Competitive Intelligence stack, not Systems Check) removed the
   $100/mo Backlinks API commitment** effective July 1, 2026 — moved to pure
   PAYG. Slight ~20% price rebalancing on other endpoints. [DataForSEO 2026
   pricing update](https://dataforseo.com/update/pricing-update-in-dataforseo-apis).
2. **Google Postmaster Tools API v1 → v2 migration in-flight through 2026.**
   Build against v2 where possible; v1 retires when v2 launches. [Postmaster
   Tools v2 note](https://smtpedia.com/google-postmaster-tools/).
3. **Meta Marketing API "Ads Management Standard Access" barrier lowered** —
   minimum-API-call threshold dropped from 1,500 to 500 calls in 15 days, so
   getting Standard Access is meaningfully easier than during earlier planning.
   [Meta blog on Ads Management update](https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/).
4. **Google Ads API "Explorer" access tier** removed the application process for
   MCC-holders — instant production access, 2,880 ops/day. [PPC.io Explorer
   tier](https://ppc.io/blog/google-ads-api).
5. **Meta Ad Library API is scoped to political + social-issue ads only via the
   free developer API.** Commercial competitor ads require Meta Content Library
   (CASD, researcher-gated) or third-party scraping services. **This is a
   material scope caveat for Trilogy §348** — see §3b below.

---

## 3. SimilarWeb-alt stack economics (Competitive Intelligence)

### 3a. Per-tool verified terms

**DataForSEO.** Pay-as-you-go SEO data API. SERP API $0.0006/query (Standard
Queue) → $0.002/query (Live Mode). Backlinks API $0.05 per 1K backlinks. Minimum
$50 deposit; monthly commitments removed 2026-07-01. Rough ratio: for
comparable backlink data, ~90–200× cheaper than Ahrefs API ($999/mo add-on) or
Semrush API (~$500–$2,000/mo at usage). [DataForSEO 2026 pricing
update](https://dataforseo.com/update/pricing-update-in-dataforseo-apis) ·
[DataForSEO 2026 guide](https://nextgrowth.ai/dataforseo-api-guide/) ·
[Ahrefs API pricing](https://checkthat.ai/brands/ahrefs/pricing).

**Estimated platform-wide cost** at 100 tenants monitoring 5 competitors each
(weekly SERP checks on ~50 keywords/tenant + weekly backlink deltas): $100–$200/mo
is a defensible order-of-magnitude estimate consistent with the Trilogy §346 claim.
Actual cost will depend on Live vs Standard Queue usage; recommend Standard Queue
for weekly briefs.

**SparkToro Business.** Confirmed **$150/mo** for 25 reports/mo, 10 users, all
data types + Take Action. Business is the mid tier; Personal $50/mo is
single-user with 4 reports/mo; Agency $300/mo is 100 users with 250 reports/mo.
[SparkToro pricing (fetched)](https://sparktoro.com/pricing). Data uniqueness
verified: audience-following data (which podcasts / social accounts / sites /
subreddits / press / YouTube channels the audience follows) is genuinely
differentiated — SparkToro crawls billions of social/web profiles for
audience-intersection data no SEO tool exposes. SparkToro also now offers an
official [MCP server](https://sparktoro.com/mcp/docs) — a bonus for a Paige
integration.

**Meta Ad Library.** Free web UI at facebook.com/ads/library — anyone can see
active competitor ads. **API access is free after identity verification** but
scoped to **political and social-issue ads only.** Commercial-brand ads require
either (a) web scraping (against Meta ToS in many patterns), (b) Meta Content
Library (CASD, researcher/academic-gated), or (c) a third-party service like
SerpApi/AdMapix that scrapes and republishes.
[Meta Ad Library API 2026 (adlibrary.com)](https://adlibrary.com/posts/meta-ad-library-free-api-2026) ·
[Meta Ads Library API 2026 (admapix)](https://www.admapix.com/blog/ad-intelligence/meta-ads-library-api-developers).

**⚠ RED FLAG for Trilogy §348** — the doc lists Meta Ad Library as "free —
active competitor ads across FB/IG" but the free API path only returns
political/issue ads. For coach/consultant competitor watch (commercial ads),
practical options are: (i) a Paige-hosted headless browser scrape (Direction A
territory — legally cleanest when the tenant confirms authorized research, and
against Meta ToS to a degree that requires legal review), (ii) a paid third-party
API layer (SerpApi/similar, ~$50–$150/mo), or (iii) the web-UI-only path exposed
in the Command Center as a "review this ad library" link. **Recommend the
Trilogy doc call this out and choose (ii) or (iii) as the practical stub, with
(i) as a Direction-A future-work.**

**Google Ads Transparency Center.** Free web UI. No formal public API. Same
options as Meta Ad Library apply for programmatic access (scrape / third-party
API / UI-only). Confirmed via [TikTok Creative Center review](https://adlibrary.com/adtools/tiktok-creative-center)
which contrasts it with Google's TC ("Creative Center does not let you search
by brand name — the key limitation for direct competitor research — the way
you can in Google Ads Transparency Center").

**TikTok Creative Center.** Free with any TikTok account. Full features (CTR,
CVR, save/bookmark, full commercial music library) require a **free TikTok
Business account** — no paid tier. Public web UI only; no formal API.
[TikTok Creative Center 2026 walkthrough](https://www.shuttergen.com/resources/tiktok-creative-center) ·
[TikTok Creative Center review](https://adlibrary.com/adtools/tiktok-creative-center).

**Visualping (change detection).** Free tier available (limited checks/mo, no
CC required). Paid starts at $14/mo for individual use; business tier requires
custom pricing. Now includes AI-summarized "Reports" launched March 2026.
[Visualping pricing (Capterra)](https://www.capterra.com/p/211816/Visualping/) ·
[Visualping pricing explained](https://visualping.io/blog/visualping-pricing-explained) ·
[Visualping AI Reports launch](https://www.barchart.com/story/news/727683/new-ai-feature-turns-hundreds-of-website-alerts-into-one-briefing).
**Recommendation:** at 100 tenants × 5 competitors = 500 pages under
weekly check, self-hosted Playwright + diff is the sensible path — Visualping
is a viable stub/backup but the Fly-hosted Playwright approach the Trilogy already
cites (`services/visual-renderer` in-repo) is cheaper and gives Paige control of
the diff signal.

**Wappalyzer.** **⚠ Pricing has moved substantially since July 2026.** Free
web/extension tier still exists (up to 50 monthly lookups). **API access
requires Team plan at $995/mo minimum;** older tiers Pro/Business at $250/$450/mo
do NOT include API access at meaningful volume. Enterprise $850/mo+ per one
source, but a separate 2026 source names $995/mo as the API-access threshold.
[Wappalyzer 2026 pricing (Prospeo)](https://prospeo.io/s/wappalyzer-pricing-reviews-pros-and-cons) ·
[Wappalyzer 2026 review (Coldiq)](https://coldiq.com/tools/wappalyzer).

**⚠ RED FLAG for Trilogy §353** — the doc lists Wappalyzer at "$0-250/mo"
which is only true for the free extension or the base non-API Pro plan.
Programmatic tech-stack detection at platform scale would require the $995/mo
tier. **Recommend the Trilogy doc either (i) self-host a pattern-library
tech-stack detector (Wappalyzer's core patterns library is open-source and can
be run in a Paige worker — this is the more §34-clean answer anyway) or (ii)
budget for $995/mo Team plan and re-check the SimilarWeb-alt total.** With
self-host (the recommended path), the $0–$50/mo range for this line stays true.

### 3b. Total platform-wide estimate

**Estimated** monthly external-vendor spend at 100-tenant / 5-competitors-each
scale, following the Trilogy §345 stack with the two corrections above:

| Tool | Est. cost /mo | Notes |
|---|---|---|
| DataForSEO | $100–$200 | PAYG, depends on query volume |
| SparkToro Business | $150 | Fixed |
| Meta Ad Library | $0 | Web-UI link-out OR $50–$150 for third-party API stub |
| Google Ads Transparency Center | $0 | Web-UI link-out |
| TikTok Creative Center | $0 | Web-UI link-out |
| Visualping OR self-host | $0–$50 | Recommend self-host via existing Playwright infra |
| Wappalyzer (self-host recommended) | $0–$50 | Self-host patterns → $0; Team plan $995/mo if bought |

**Estimated total: $250–$400/mo platform-wide** using the self-host + web-UI
patterns; up to ~$1,200/mo if the paid Wappalyzer + third-party ad API paths are
taken. Amortized to <$5/tenant/mo at 100 tenants remains defensible in the
recommended path; the Trilogy §346 claim holds **conditional on the two
recommended substitutions.**

---

## 4. Owner Analytics — dashboard competitor analysis

### 4a. The dashboard incumbents — verified as dashboard-only

**Databox.** SMB reporting/analytics with 100+ integrations. Starts $135–$159/mo
in 2026 (**free plan eliminated in 2026**); $3/source above included limits.
Databox is built for monitoring — a marketing manager wants to check their
phone and see if they're hitting monthly goals. It visualizes; it does not
recommend or draft actions. [Databox pricing 2026](https://checkthat.ai/brands/databox/pricing) ·
[Databox use case framing (Whatagraph comparison)](https://www.spotsaas.com/compare/whatagraph-vs-databox).

**Whatagraph.** Multi-page reporting for agencies to prove value to clients.
Starts $119/mo. Positioning explicitly reporting/artifact, not interpretation:
*"Whatagraph is built for reporting — beautiful, multi-page documents that
prove an agency's value to a client."*
[Whatagraph vs Databox](https://www.spotsaas.com/compare/whatagraph-vs-databox).

**Klipfolio.** BI-style dashboard builder (Klips) + metrics management
(PowerMetrics). Best for mid-size data teams; steepest learning curve; deep
custom-metric modeling. Fundamentally a dashboard/metric-modeling tool, not an
action-drafter. [Klipfolio alternatives 2026 (Whatagraph)](https://whatagraph.com/blog/articles/klipfolio-alternatives-and-competitors).

**DashThis.** Small-agency/freelancer reporting — fast, affordable client
reports, no steep learning curve. Explicitly reporting-only.
[DashThis alternatives (Whatagraph)](https://whatagraph.com/blog/articles/dashthis-alternatives-and-competitors).

**Cyfe.** 100+ integrations, business dashboard. **In maintenance mode as of
2026** — recommended only if you're on a tight budget and don't need active
product development.
[Cyfe alternatives (Whatagraph)](https://whatagraph.com/blog/articles/cyfe-alternatives-and-competitors).

### 4b. Interpretation-and-action differentiator confirmed

**Verified:** every player in the SMB reporting/dashboard space shows numbers
and lets the user configure widgets/filters. **None** of them:

- pull a signal, interpret it against a tenant baseline, decide it needs a fix
- draft that fix in the tenant's voice
- route the drafted fix to a named §16 department for approval
- close the loop into a two-way action bus (§8) with autonomy tiering (§16)

The Paige differentiator is the interpretation + drafted action + routing,
NOT the data. Trilogy §327 claim confirmed. HubSpot's own reporting guidance
(§1b above) reinforces the point — even the incumbent CRM admits that activity
metrics without outcomes are noise, but HubSpot itself only reports; it does
not draft the fix.

**⚠ Follow-up flag for Trilogy §329:** the doc names the space as "dashboards"
without noting that Databox eliminated its free plan and Cyfe is in
maintenance mode as of 2026. These are competitive-shape signals — Databox is
tightening monetization (an SMB entrant with lower-price tiers has room), and
Cyfe is essentially exiting. Neither changes Paige's positioning, but the doc
could mention the shape shift.

---

## 5. Competitive Intelligence — enterprise-competitor analysis

### 5a. Enterprise pricing verified

**Crayon.** Confirmed **$25,000–$60,000/yr typical**, entry deals near
$15,000–$16,000, top of range $100,000+. Custom, sales-led; no public
self-serve tier; no free trial. Three internal tiers (Essentials / Professional /
Enterprise). [Crayon pricing 2026 (Parano.ai)](https://parano.ai/blog/crayon-pricing) ·
[Crayon pricing (ClientCues)](https://www.clientcues.com/company/blog/posts/crayon-pricing-is-it-worth-30k-per-year/) ·
[Klue vs Crayon 2026](https://parano.ai/blog/klue-vs-crayon).

**Klue.** Confirmed **$30,000–$100,000/yr**, entry deals ~$15,000–$16,000.
Premium, sales-first, battlecard-heavy, native win-loss. [Klue vs Crayon 2026 pricing](https://parano.ai/blog/klue-vs-crayon).

**Kompyte** (owned by Semrush). Custom pricing; combines competitive monitoring
with SEO/digital-marketing intelligence. One directory source lists a *"from
$300/year"* number [Autobound 2026 CI tools list](https://www.autobound.ai/blog/top-15-competitive-intelligence-tools-2026) —
this is likely a starter or listing-directory artifact, as [Kompyte's actual
positioning (Klue's own comparison)](https://klue.com/topics/competitive-intelligence-tools-b2b-software)
places it as "mid-market automated tracking" and Semrush-owned tools are
consistently in the multi-thousand-per-year range. **Est: mid-market
$4,000–$12,000/yr range** based on Semrush parent-company pricing patterns. §13
honest limit — could not verify a single official Kompyte price list.

### 5b. SMB tier greenfield confirmed

**Verified:** No player in this space ships AI-driven competitor briefs at
$47/mo self-serve for the coach/consultant/agency market. Options for that
audience today:
- Roll your own with a dashboard (Databox/Whatagraph) + manual competitor research
- Pay $12K+/yr for Crayon/Klue/Kompyte (enterprise-shaped for enterprise buyers)
- Manual weekly research via free tools (Meta Ad Library UI, Google Ads TC UI,
  TikTok Creative Center)

Trilogy §329's greenfield claim at the SMB tier is confirmed. Follow-up
watchlist competitor: **Kompyte's Semrush parent** could ship a lower-tier
Kompyte offering targeting SMB agencies; monitor.

---

## 6. Playbook extensibility feasibility (YAML Check Spec DSL)

### 6a. Prior-art review

The Trilogy §127–141 proposes a YAML "Check Spec" DSL so Playbook creators can
extend the 30-check catalog. This is a well-attested primitive pattern; three
strong precedents:

**Zapier Developer Platform (Zapier CLI + Platform v3).** Zapier ships a full
TypeScript/Node CLI + JSON-schema-shaped app definition (`zapier-platform-cli`).
Creators define **Triggers** (read), **Creates** (write), and **Searches**
(find records) in a Node module; the CLI validates, tests, and deploys. Third-
party developers author against a schema, ship a package, and the app appears
in the Zapier catalog. [Zapier Platform CLI docs](https://docs.zapier.com/) ·
[Zapier CLI announcement](https://zapier.com/engineering/zapier-command-line-interface/) ·
[Zapier Platform CLI on GitHub](https://github.com/zapier/zapier-platform-cli).

Directly relevant to Systems Check: the same **"external system + assertion +
remediation prompt"** shape the Trilogy proposes maps 1:1 onto Zapier's
"Trigger + Action" shape, with the additional Paige-native piece being the
`nl_predicate` (a Claude-evaluable natural-language assertion) — richer than
Zapier's response-parsing but structurally the same DX.

**n8n community nodes.** Node development is TypeScript-based via an official
`n8n-node` CLI. A node consists of a `.credentials.ts` (auth) file and a
`.node.ts` (behavior) file. Package name convention `n8n-nodes-*` +
`n8n-community-node-package` keyword for discovery. Verified nodes go through
a linter and community-node review. [n8n creating nodes overview](https://docs.n8n.io/integrations/creating-nodes/overview/) ·
[n8n community nodes building guide](https://docs.n8n.io/integrations/community-nodes/building-community-nodes) ·
[n8n nodes starter template](https://github.com/n8n-io/n8n-nodes-starter). This
is a strong reference for a Paige Check Spec author path — file a `paige-checks-*`
NPM/OCI package with a linter-validated YAML manifest + optional TS remediation
logic, discoverable in the Marketplace.

**Datadog integrations (Agent-based / Marketplace).** Three-tier extensibility:
(1) **Custom Checks** — drop-in Python check files, lowest friction; (2)
**Agent-based Integrations** via `ddev create` scaffolding for approved
Technology Partners; (3) **Marketplace Integrations** — the same shape but
in a private `DataDog/Marketplace` repo for paid distribution. [Datadog custom
checks](https://docs.datadoghq.com/developers/custom_checks/write_agent_check/) ·
[Datadog agent-based integration guide](https://docs.datadoghq.com/developers/integrations/agent_integration/) ·
[Datadog Marketplace guide (Medium)](https://hector-lopez-scadadog.medium.com/building-an-integration-for-the-datadog-marketplace-164838f41566).
The three-tier structure (self-hosted custom → community-verified →
marketplace-paid) is a very strong analog for the Playbook Check Spec — Paige
should mirror it (tenant-local custom checks → verified community checks in
Marketplace → paid vertical Check Catalog packages).

### 6b. Feasibility assessment

**The YAML Check Spec DSL is a reasonable primitive.** Three well-attested
precedents (Zapier, n8n, Datadog) each ship a variant of the same
shape — declarative-manifest + typed-code hooks + registry/marketplace discovery.
The Paige twist that makes the YAML shape *cleaner* than the JS/Python
scaffolding those three ship is the `nl_predicate` — a Claude-native assertion
type that lets a non-technical Playbook creator write *"look for a HIPAA notice
in the footer"* instead of a DOM selector regex. That's a legitimate DX advance
enabled by the model layer Paige already ships via §34's callModel router.

**Recommended shape** (matches the Trilogy §130–141 spec closely; three
refinements suggested):

1. **Two data_source types day-one:** `fetch_url` (plain HTTP GET + optional
   post-body) and `api_call` (typed OAuth/OpenAPI-style call against a
   registered tenant integration). Third and fourth (`worker_script` for
   custom JS/Deno logic, `native_check` for the built-in 30) added in phase 2
   — mirrors Datadog's "low-effort custom check → agent integration → marketplace"
   ladder.
2. **`assertion.type` enum:** `nl_predicate` (Claude-eval), `regex_match`,
   `json_path_expected`, `status_code_range`, `time_under_ms`, `tenant_baseline_delta`
   (baseline anomaly gate — reuses §26 memory). Same DX simplicity as Zapier
   filter conditions.
3. **Marketplace-side hygiene**: mirror n8n's linter + package-name convention
   (`paige-checks-*` package, `paige-check-spec` keyword, YAML schema
   validation on submit). Verified checks earn a badge; tenants can install
   unverified checks with an explicit "unverified" warning per §39 integrity
   pattern.

No net-new fundamental primitives needed beyond what §26/§33/§34/§10 already
ship. The DSL is a config-as-data manifest (§10-clean by construction) and the
remediation prompt runs through the standard `callModel` seam (§34 L3).

---

## 7. Summary of key findings + red flags for the Trilogy doc

**Confirmed by research:**
- The full 30-check horizontal + interpretation + drafted-fix + §16 routing
  shape is **genuine greenfield** in the coach/consultant/agency SMB space.
- The <$5/tenant/mo external-vendor economics for Systems Check hold — most
  data sources are free-vendor with tenant-side OAuth, and the only bounded-cost
  line is opt-in inbox placement testing.
- SparkToro Business at $150/mo (confirmed via fetch of pricing page),
  DataForSEO PAYG at $100–$200/mo effective, and the SimilarWeb-alt stack
  economics hold at <$500/mo platform-wide **with the corrections below**.
- Dashboard incumbents (Databox / Whatagraph / Klipfolio / DashThis / Cyfe) are
  all confirmed as show-numbers-only; the interpretation+action differentiator
  is real.
- Crayon $15K–$100K/yr and Klue $30K–$100K/yr enterprise pricing confirmed. SMB
  tier for AI-driven competitor briefs at $47/mo self-serve = genuine greenfield.
- YAML Check Spec DSL is a well-attested primitive shape with three strong
  prior-art precedents (Zapier, n8n, Datadog); the Paige `nl_predicate` twist
  is a legitimate DX advance over those three.

**Red flags surfaced for the Trilogy doc:**

1. **Meta Ad Library free API is scoped to political + social-issue ads only.**
   The doc lists it as "free — active competitor ads across FB/IG" (§348), but
   commercial competitor ads require a third-party API (~$50–$150/mo), a
   Paige-hosted headless scrape (Direction A + legal review), or a
   web-UI-only link-out. **Recommend the doc call this out.**

2. **Wappalyzer pricing has moved.** API access at meaningful volume now
   requires the $995/mo Team plan (2026 pricing), not the $0–$250 range the
   doc cites (§353). **Recommend the doc pivot to self-hosting the
   open-source Wappalyzer patterns library in a Paige worker** — cleaner §34
   answer anyway, and keeps the <$5/tenant economics intact.

3. **Google Postmaster Tools API is in a v1 → v2 migration window through
   2026.** The check still ships against a free API, but the Paige
   implementation should be built with the v2 cutover in mind rather than
   hard-coded to v1 (Trilogy §101 does not currently mention this).

4. **Databox eliminated its free plan and Cyfe is in maintenance mode as of
   2026.** Doesn't change positioning, but the doc's competitive framing
   (§329) reads as if these are all still healthy independent players. The
   dashboard space is quietly consolidating.

5. **Direction-A implication in Competitive Intelligence is already load-bearing
   in the current shape** — because Meta Ad Library commercial ads only reach
   the tenant via a browser scrape or a paid third-party API, the
   Competitive Intelligence Pillar 4 shipment depends on either accepting the
   third-party API cost OR the Direction-A browser-agent infrastructure (Pillar
   3A). The Trilogy doc lists Direction A as a Phase C build (weeks 8–16); if
   Competitive Intelligence is expected earlier, the Meta-Ad-Library gap needs
   an interim answer.

None of these change the Trilogy's structural thesis — the operator-AI-COO
shape holds, and every pillar rests on shipped primitives as the doc claims.
The corrections are tactical, pre-build, and cheap to address in the spec.

---

## Sources

**Systems Check — competitor scope**
- [Pingdom uptime monitoring product](https://www.pingdom.com/product/uptime-monitoring/)
- [Pingdom HTTP check best practice](https://www.pingdom.com/blog/make-the-most-of-your-http-check-best-practice-for-optional-settings/)
- [Pingdom HTTP Custom Check docs](https://help.pingdom.com/hc/en-us/articles/115000431709-HTTP-Custom-Check)
- [UptimeRobot pricing 2026 (apistatuscheck)](https://apistatuscheck.com/pricing/uptimerobot/)
- [UptimeRobot pricing 2026 (StackScored)](https://www.stackscored.com/pricing/uptime-monitoring/uptimerobot/)
- [Uptime monitoring types (UptimeRobot knowledge hub)](https://uptimerobot.com/knowledge-hub/monitoring/ultimate-guide-to-uptime-monitoring-types/)
- [Better Stack pricing 2026 (StackScored)](https://www.stackscored.com/pricing/uptime-monitoring/better-stack/)
- [Better Stack review 2026 (CubeAPM)](https://cubeapm.com/blog/betterstack-pricing-review/)
- [Better Stack overview (Capterra)](https://www.capterra.com/p/202150/Better-Stack/)
- [GlockApps 2026 review (usebouncer)](https://www.usebouncer.com/glockapps/)
- [GlockApps 2026 review (emailwarmup)](https://emailwarmup.com/blog/email-deliverability-tools/glockapps-review/)
- [ObservePoint pricing](https://www.observepoint.com/pricing/)
- [ObservePoint tag governance overview (Blast Analytics)](https://www.blastanalytics.com/blog/increase-enterprise-data-quality-with-observepoint)
- [Trackingplan pricing (TrustRadius)](https://www.trustradius.com/products/trackingplan/pricing)
- [Trackingplan changelog](https://www.trackingplan.com/changelog)
- [Screaming Frog product](https://www.screamingfrog.co.uk/seo-spider/)
- [Screaming Frog vs Ahrefs 2026 (AEO Engine)](https://aeoengine.ai/blog/screaming-frog-vs-ahrefs)
- [Ahrefs pricing 2026 (ClaroRank)](https://clarorank.com/ahrefs-pricing/)
- [Ahrefs vs Semrush API pricing (thatmarketingbuddy)](https://thatmarketingbuddy.com/blog/semrush-api-pricing)
- [Best AI tools for coaches 2026 (Storyflow)](https://storyflow.so/blog/best-ai-tools-coaches-consultants-2026)
- [GoHighLevel email deliverability (thestackinsiders)](https://www.thestackinsiders.com/blog/gohighlevel-email-deliverability)
- [GoHighLevel deliverability (Mailflow Authority)](https://mailflowauthority.com/gohighlevel-email)
- [HubSpot reporting product](https://www.hubspot.com/products/reporting-dashboards)
- [HubSpot dashboard guide (Smith Digital)](https://smithdigital.io/blog/hubspot-dashboard-guide)

**30-check catalog validation**
- [PageSpeed Insights API rate limits (Google groups)](https://groups.google.com/g/pagespeed-insights-discuss/c/dB7hWmGAGsw)
- [PageSpeed Insights API guide (OpenPanel)](https://openpanel.com/docs/articles/websites/google-pagespeed-insights-api-key/)
- [GA4 API quotas (Whatagraph)](https://whatagraph.com/blog/articles/google-analytics-4-api-limits)
- [GA4 API limits (Analytify)](https://analytify.io/google-analytics-limits/)
- [Meta Marketing API 2026 tiers (AdManage)](https://admanage.ai/blog/meta-marketing-api-challenges-and-fix)
- [Meta Ads Management access update (Meta developer blog)](https://developers.meta.com/blog/updates-to-ads-management-standard-access-feature/)
- [Google Ads API Explorer tier (PPC.io)](https://ppc.io/blog/google-ads-api)
- [Postmaster Tools API reference (Google)](https://developers.google.com/workspace/gmail/postmaster/reference/rest)
- [Postmaster Tools 2026 v2 overview (SMTPedia)](https://smtpedia.com/google-postmaster-tools/)
- [Twilio pricing](https://www.twilio.com/en-us/pricing)
- [Calendly pricing 2026 (CostBench)](https://costbench.com/software/scheduling/calendly/)
- [Stripe pricing 2026 (CheckThat.ai)](https://checkthat.ai/brands/stripe/pricing)
- [n8n API reference](https://docs.n8n.io/connect/n8n-api/api-reference)
- [n8n public REST API (DeepWiki)](https://deepwiki.com/n8n-io/n8n-docs/6.1-public-rest-api)

**SimilarWeb-alt stack**
- [DataForSEO 2026 pricing update](https://dataforseo.com/update/pricing-update-in-dataforseo-apis)
- [DataForSEO 2026 API guide (NextGrowth)](https://nextgrowth.ai/dataforseo-api-guide/)
- [DataForSEO SERP pricing](https://dataforseo.com/pricing/serp)
- [SparkToro pricing (fetched)](https://sparktoro.com/pricing)
- [SparkToro MCP server docs](https://sparktoro.com/mcp/docs)
- [Meta Ad Library free API 2026 (adlibrary)](https://adlibrary.com/posts/meta-ad-library-free-api-2026)
- [Meta Ads Library API 2026 (admapix)](https://www.admapix.com/blog/ad-intelligence/meta-ads-library-api-developers)
- [Facebook Ads Library API 2026 (AdManage)](https://admanage.ai/blog/facebook-ads-library-api)
- [TikTok Creative Center 2026 walkthrough (ShutterGen)](https://www.shuttergen.com/resources/tiktok-creative-center)
- [TikTok Creative Center vs Google TC (adlibrary)](https://adlibrary.com/adtools/tiktok-creative-center)
- [Visualping pricing (Capterra)](https://www.capterra.com/p/211816/Visualping/)
- [Visualping pricing explained](https://visualping.io/blog/visualping-pricing-explained)
- [Visualping AI Reports launch (Barchart)](https://www.barchart.com/story/news/727683/new-ai-feature-turns-hundreds-of-website-alerts-into-one-briefing)
- [Wappalyzer 2026 pricing (Prospeo)](https://prospeo.io/s/wappalyzer-pricing-reviews-pros-and-cons)
- [Wappalyzer 2026 review (Coldiq)](https://coldiq.com/tools/wappalyzer)

**Owner Analytics — dashboard incumbents**
- [Databox pricing 2026 (CheckThat.ai)](https://checkthat.ai/brands/databox/pricing)
- [Databox vs Whatagraph (SpotSaaS)](https://www.spotsaas.com/compare/whatagraph-vs-databox)
- [Databox alternatives 2026 (Whatagraph)](https://whatagraph.com/blog/articles/databox-alternatives-and-competitors)
- [Klipfolio alternatives 2026 (Whatagraph)](https://whatagraph.com/blog/articles/klipfolio-alternatives-and-competitors)
- [DashThis alternatives 2026 (Whatagraph)](https://whatagraph.com/blog/articles/dashthis-alternatives-and-competitors)
- [Cyfe alternatives 2026 (Whatagraph)](https://whatagraph.com/blog/articles/cyfe-alternatives-and-competitors)
- [Best dashboard reporting tools 2026 (Whatagraph)](https://whatagraph.com/blog/articles/best-dashboard-reporting-tools)

**Competitive Intelligence — enterprise incumbents**
- [Crayon pricing 2026 (Parano.ai)](https://parano.ai/blog/crayon-pricing)
- [Crayon pricing (ClientCues)](https://www.clientcues.com/company/blog/posts/crayon-pricing-is-it-worth-30k-per-year/)
- [Klue vs Crayon 2026 (Parano.ai)](https://parano.ai/blog/klue-vs-crayon)
- [CI tools B2B 2026 (Klue)](https://klue.com/topics/competitive-intelligence-tools-b2b-software)
- [Kompyte listing (Autobound CI tools 2026)](https://www.autobound.ai/blog/top-15-competitive-intelligence-tools-2026)
- [CI pricing breakdown (userintuition)](https://www.userintuition.ai/posts/competitive-intelligence-pricing/)

**Playbook extensibility — prior art**
- [Zapier Developer Documentation](https://docs.zapier.com/)
- [Zapier Platform CLI (GitHub)](https://github.com/zapier/zapier-platform-cli)
- [Zapier CLI announcement](https://zapier.com/engineering/zapier-command-line-interface/)
- [n8n creating nodes overview](https://docs.n8n.io/integrations/creating-nodes/overview/)
- [n8n community nodes building guide](https://docs.n8n.io/integrations/community-nodes/building-community-nodes)
- [n8n nodes starter template (GitHub)](https://github.com/n8n-io/n8n-nodes-starter)
- [Datadog custom Agent checks](https://docs.datadoghq.com/developers/custom_checks/write_agent_check/)
- [Datadog Agent-based integration guide](https://docs.datadoghq.com/developers/integrations/agent_integration/)
- [Datadog Marketplace integration guide (Hector Lopez, Medium)](https://hector-lopez-scadadog.medium.com/building-an-integration-for-the-datadog-marketplace-164838f41566)
- [Datadog Extend docs index](https://docs.datadoghq.com/developers/)

---

*End of landscape research report.*
