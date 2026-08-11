# Twin Capabilities — landscape research report

**Date:** 2026-07-26
**Purpose:** back-fill the citations, landscape, and regulatory analysis referenced by
`docs/strategy/owner-trilogy-2026-07-26.md` (Pillar 3, "Twin Capabilities — three directions").
**Scope:** Direction A (browser-agent), Direction B (team-member twin), Direction C (business twin).
**Discipline:** §2 (coach / consultant / agency / thought-leader / advisor generic — never
consumer-finance framed), §13 (honest limits — anything not verified online is called out),
§34 (external commodity vs. Paige-owned moat framing).

---

## Direction A — Browser-agent landscape

### A.1 Browser-fleet infrastructure

#### Browserbase — the reference infra

Verified public pricing on `browserbase.com/pricing` (2026):

| Plan | Price | Concurrent | Included hours | Overage |
|---|---|---|---|---|
| Free | $0 | 3 | 1 hr | — |
| Developer | $20/mo | 25 | 100 hrs | $0.12/hr |
| Startup | $99/mo | 100 | 500 hrs | $0.10/hr |
| Scale | Custom | 250+ | Flexible | Negotiated |

**Correction to Trilogy doc (§13 red flag).** The Trilogy doc frames Browserbase as
"~$0.006 per typical page." That is an accurate *unit-economic* framing at Scale-tier
volumes (a 2-second average page fetch at $0.10/hr amortizes near that), but it is **not**
how Browserbase actually charges — pricing is per browser-hour + per-GB proxy bandwidth,
not per-page. The doc's numeric estimate holds within an order of magnitude for read-heavy
Playwright automation; it does **not** hold for long-lived agent sessions (form-fills, wait
loops, CAPTCHA) where a single "task" can burn 30-90 seconds of browser-hour, moving the
per-task unit cost to $0.001-0.003 in aggregate but with much higher variance. Recommend
the spec author update the number to "~$0.10-0.12/browser-hour, translating to $0.001-0.006
per task depending on task duration" — same order of magnitude, honest to the pricing model.

**Commercial terms.** No per-seat pricing; usage-based, credit-card self-serve up to Scale;
proxy bandwidth billed separately ($10-12/GB) which is a common surprise in real bills for
scraping-heavy workloads. Session persistence, stealth mode, and automatic CAPTCHA routing
are standard on paid plans. All Trilogy-doc infrastructure claims verified.

Sources:
- [Browserbase Pricing (official)](https://www.browserbase.com/pricing)
- [Browserbase Pricing 2026 — TrustRadius](https://www.trustradius.com/products/browserbase/pricing)
- [Browserbase Pricing 2026 — CostBench](https://costbench.com/software/browser-automation/browserbase/)

#### Alternatives worth naming in the spec

- **Browserless** — open-source Docker-based Playwright/Puppeteer host with a managed cloud
  option. Chosen when vendor lock-in is the concern; costs more operator-time, less vendor risk.
- **Bug0 Browsers** — 2026 entrant, per-minute billing (finer-grained than Browserbase's
  per-hour), live session preview. Positioned as a Browserbase alternative for AI agents.
- **Stagehand** — an open-source *SDK* (not infrastructure) owned by Browserbase, natural-language
  layer over Playwright. Sits alongside Browser-Use as an SDK choice.
- **Anthropic Computer Use / OpenAI CUA** — vision-driven screen-control agents. Higher latency
  and cost per action than DOM-based Browserbase + Stagehand/Browser-Use; useful only when the
  DOM is genuinely un-parseable. Not the primary path for Paige.
- **Self-hosted Fly Playwright** — the pattern already shipped in `services/visual-renderer`.
  For low-volume tenant-specific tasks (weekly ClickFunnels export), a per-tenant Fly worker is
  competitive on cost with Browserbase Developer tier and keeps everything inside Paige's
  own infra. Recommend a hybrid pattern: Browserbase for tenant-authored *ad-hoc* tasks,
  self-hosted for the *scheduled recurring* Marketplace-Playbook tasks that dominate volume.

Sources:
- [Best Browserbase Alternatives 2026 — TinyFish](https://www.tinyfish.ai/blog/browserbase-alternatives)
- [Browserbase vs Stagehand — Skyvern](https://www.skyvern.com/blog/browserbase-vs-stagehand-which-is-better/)
- [Headless browsers in 2026 — Hashnode](https://hashnode.com/blog/playwright-vs-puppeteer-vs-selenium-2026)

### A.2 Browser-Use SDK

Verified on `github.com/browser-use/browser-use`:
- **License:** MIT. Free for commercial use, no attribution required.
- **Maturity:** ~79K GitHub stars, active weekly commits, TypeScript port
  (`webllm/browser-use`) exists but Python is the primary SDK.
- **LLM shape:** provider-agnostic — plug Anthropic / OpenAI / Google / Groq / local
  (Ollama) through a unified adapter. Fits §34's model-router pattern cleanly (Paige's
  router picks per-task, Browser-Use is the runtime).
- **Task definition:** natural-language + optional structured "intent" schema. Browser-Use
  handles the click/type/scroll loop; the caller provides "log in to X, export CSV, POST to
  webhook Y."

All Trilogy-doc claims about Browser-Use verified.

Sources:
- [browser-use GitHub](https://github.com/browser-use/browser-use)
- [browser-use PyPI](https://pypi.org/project/browser-use/)
- [Browser Use Open Source docs](https://docs.browser-use.com/open-source/introduction)

### A.3 Auth layer — Anon (and honest alternatives)

**Anon's claim, verified in their public marketing:** zero-trust architecture, does not see
or share user credentials, stores authenticated *sessions* (cookies/tokens) rather than
passwords. Supports OAuth, SSO, 2FA, CAPTCHA-routed flows. Positioning is "agent-friendly
auth for platforms that don't have a real API" — sales automation, RPA, CRMs, ATSes, digital
clones (their listed use cases).

**Honest §13 caveats the Trilogy doc doesn't flag:**

1. "Zero-trust" as marketed is stronger for OAuth/SSO flows (where the tenant authenticates
   in a real browser, Anon captures the resulting session token) than for username/password
   flows into legacy portals — those still require the tenant's credentials to transit *some*
   handling layer, and Anon's model handles this via a browser-side entry flow rather than
   plaintext storage. Anon claims they never see plaintext credentials; **that claim is not
   independently auditable from public materials**, and the Trilogy doc's own §9/§38 posture
   is stricter than what any third-party vault can promise ("credential's home is our
   Supabase Vault"). Recommend the spec treat Anon as one option among several, not the
   default, and hard-block any pattern that lets a third-party auth service *store* tenant
   credentials our own vault could hold.

2. Anon's OAuth-less framing means it handles ecosystems where the tenant has a legitimate
   login but the vendor has no OAuth. It does *not* dissolve ToS liability (see A.5).

**Alternatives Paige should treat as viable:**

- **Custom Supabase-Vault-based session store** — the pattern that best matches §9. Session
  cookies encrypted at rest, decrypted just-in-time into the Browser-Use runner, never
  materialized outside the request. Highest engineering cost, tightest security posture.
- **Nango** — code-first OAuth + credential management infrastructure. Strongest fit if
  Paige wants OAuth for real-API integrations (HubSpot, GA4, Meta) *and* browser-agent
  credential management under the same abstraction. MIT-adjacent, self-hostable.
- **Kombo / Merge / Unified.to / Apideck / Truto / Paragon** — unified API platforms.
  **Not the right shape for Direction A** — these normalize *API responses* (HRIS, ATS, CRM),
  not browser sessions. The Trilogy doc's mention of them as alternatives to Anon is a
  category error; call it out and remove.

Sources:
- [Anon on AI Agent Store](https://aiagentstore.ai/ai-agent/anon)
- [Anon Key Features 2026 — TechShark](https://techshark.io/tools/anon/)
- [Best unified API platforms 2026 — Nango blog](https://nango.dev/blog/best-unified-api/)
- [Merge alternatives 2026 — Composio](https://composio.dev/content/merge-alternatives)

### A.4 What Paige MUST build itself vs. what's commodity

The §34 test resolves cleanly on **infrastructure** (browser fleet, IP rotation, CAPTCHA,
proxies — external commodities where a specialist beats a generalist) but **does not** resolve
cleanly on the four Paige-owned layers the Trilogy doc names. Verified:

1. **Intent-to-browser-task translation.** No third-party owns this shape for coach /
   consultant / agency workflows. Every existing browser-agent product ships a *general* task
   translator; Paige's differentiator is a Playbook-scoped translator tuned per vertical +
   per role, tenant-authored, stored as §10 config-as-data.
2. **Tenant credential vault.** §9 seam requires our own Supabase Vault as canonical; any
   third-party (Anon or otherwise) is at most an execution-time delivery mechanism.
3. **Browser-task Playbook DSL.** Directly extends the existing Playbook / Skill Spec DSL
   (§18 — one home, don't scaffold a new one).
4. **`autonomy_lane` binding.** Every browser action classified against the existing
   `paige_action_kinds` registry (§16), with the §37 producer-inventory checklist covering
   the new browser-driven producers.

No new architectural primitives; all four are compounding on shipped infrastructure. Confirms
the Trilogy doc's build-cost framing.

### A.5 The regulatory landmine — legal exposure of browser agents

**Verified case law — the state of play as of mid-2026:**

- **hiQ Labs v. LinkedIn (9th Cir. 2019 / 2022 remand).** Ninth Circuit narrowed the CFAA:
  automated collection of *publicly accessible* data is not a CFAA violation. However, in
  November 2022 the Northern District of California ruled that hiQ had **breached LinkedIn's
  User Agreement** and a settlement followed. **Takeaway: CFAA safe, contract law not.** A
  logged-in agent operating a tenant's own credentials against a portal that prohibits
  automation in its ToS is exposed to breach-of-contract liability, even if not criminal.
- **Meta Platforms v. Bright Data (N.D. Cal., 2024).** Judge Chen granted summary judgment
  to Bright Data on the ToS-binding question: **terms of service do not bind a scraper that
  operates without logging in.** This is *not* protective for Paige's use case, because
  Paige's browser agent driving a tenant's own login *is* logged-in and *does* trigger the
  ToS the tenant accepted.

**The Paige-specific exposure map:**

| Scenario | Legal posture | Ship? |
|---|---|---|
| Tenant's own vendor portal (Kajabi admin, ClickFunnels analytics, their Twilio console) | Tenant is authorized user; task automates their own workflow; usually permitted by ToS or at worst enforceable only against tenant, not Paige | Yes, with the Playbook DSL asserting tenant authorization |
| Tenant's own social account (their IG DMs, their FB Page) | Same, but platform ToS on some services (Meta) explicitly restrict automated access even by account holders. Real risk of account suspension, not lawsuit | Yes with warning; make suspension risk visible in the Playbook UX |
| Public-facing competitor site with no login | *Meta v. Bright Data* protective — ToS don't bind a non-logged-in agent for scraping publicly-accessible data | Yes, for Pillar 4 competitive intelligence |
| LinkedIn Sales Navigator via tenant's login | Tenant is bound by LinkedIn User Agreement, which prohibits scraping and automated access. §13 red flag — the Trilogy doc lists "LinkedIn Sales Nav weekly enrichment Playbook" as a **seed** browser-task; this is the highest-risk seed on the list and should be re-considered | **Not for a seed Playbook.** Ship as tenant-authored, with an explicit "you are choosing to violate LinkedIn's ToS on your own account" acknowledgment. Do not seed it from Paige's Marketplace defaults |
| Government protected portals (IRS, USPTO logged-in views, state Secretary-of-State portals) | Fine to automate against tenant's own login for their own filings; do *not* automate against another party's protected records | Yes, tenant-own-account only |
| Third-party's account without contractual authorization | Federal CFAA + state anti-hacking exposure. Never | Never |

**The Playbook DSL requirement.** The Trilogy doc calls for a "tenant confirms they own or
are contractually authorized to access this portal" gate. That is necessary but not
sufficient. The DSL should also carry:
- A **ToS-flag** field (yes/no/unknown) that a Marketplace Playbook author explicitly sets
  for every target vendor, with a linked ToS excerpt where "no" is claimed
- A **suspension-risk score** (platform-derived) for platforms like Meta, LinkedIn, Twitter,
  where automated access breaches ToS but the practical enforcement is account termination
- A **seed vs. tenant-authored** distinction — Paige's platform defaults never carry a
  Playbook that requires ToS violation; only tenant-authored Playbooks may

Sources:
- [HiQ Labs v. LinkedIn — Wikipedia](https://en.wikipedia.org/wiki/HiQ_Labs_v._LinkedIn)
- [Data scraping and the LinkedIn-hiQ ruling — IAPP](https://iapp.org/news/a/data-scraping-and-the-implications-of-the-latest-linkedin-hiq-court-ruling)
- [Meta v. Bright Data ruling — Apify blog](https://blog.apify.com/hiq-v-linkedin/)
- [Ninth Circuit hiQ v. LinkedIn — CA Lawyers Association](https://calawyers.org/privacy-law/ninth-circuit-holds-data-scraping-is-legal-in-hiq-v-linkedin/)
- [Web scraping legality 2026 compliance guide](https://cloro.dev/blog/website-scraping-legal/)

---

## Direction B — Team-member twin landscape

### B.1 Writing-style twin — commercial analogs

**Grammarly Business — Personalized Voice Detection.** Verified: launched late 2023 for
enterprise, automatically builds a "voice profile" per user by observing their writing,
lets that user rewrite AI-generated text in their own voice. **The critical positioning
detail the Trilogy doc got right:** the voice profile is *the user's own*, tuned to make
their own writing more consistent. It is not "generate copy in Sarah's voice for the team
to use while Sarah is on vacation" — that pattern does not exist in Grammarly's product.
Grammarly's telling is "your voice, your writing," which is the opposite shape from
Paige's team-member-twin ambition.

No other productized commercial analog was found in the coach / consultant / agency
adjacency. Enterprise LLM platforms (Anthropic, OpenAI, Google) offer per-tenant fine-tuning
with your own data but no productized "clone Sarah for the team" UX. Writer.com's "voice
guidelines" is brand-voice, not per-teammate. **Confirms the Trilogy doc's greenfield claim
for this specific shape.**

Sources:
- [Grammarly Personalized Voice Detection — CMSWire](https://www.cmswire.com/the-wire/grammarly-defies-the-ai-hype-with-significant-business-impact-deepens-ai-support-for-enterprises/)
- [Grammarly personalized voice — Voicebot.ai](https://voicebot.ai/2023/11/03/grammarly-releases-enterprise-generative-ai-tools-that-mimic-your-writing-style/)
- [Grammarly voice detection — NewsBytes](https://www.newsbytesapp.com/news/science/grammarly-s-new-ai-feature-can-learn-your-writing-style/story)

### B.2 Sales-agent AI adjacencies

Verified the Trilogy doc's core claim: **none of the sales-agent players clone an
individual teammate.** They all generate "brand-voice" or "generic on-brand" outbound.

**Regie.ai.** AI-native sales engagement — prospecting agents, contact enrichment,
multi-channel orchestration. Copilot shape: generates content, expects an SDR to drive.
Voice is brand-tuned, not per-individual. No shift toward per-teammate cloning as of 2026.

**Lavender AI.** Email quality copilot — sits inside Gmail/Outlook, coaches on subject
lines and personalization. Same category (assist a human writer, don't clone them).

**11x.ai (Alice).** Full AI-SDR autonomy claim. **§13 red flag worth naming in the Trilogy
doc:** 11x had a public credibility crisis in March 2025 (TechCrunch investigation flagged
inflated customer logos, 70-80% early-cohort churn, personalization-quality complaints).
Alice 2.0 is a rebuild; recovery is real but incomplete. **This actually strengthens Paige's
Direction B thesis** — the AI-SDR category has real buyer demand but is scorched by generic-
voice quality issues. Paige's per-teammate twin (properly consent-gated) is the differentiated
product the burnt category is looking for.

**Salesforce Agentforce, HubSpot Breeze, Outreach, Gong, Cresta, Clay, Mutiny.** All
brand-voice, none per-individual.

**No player is pivoting toward per-teammate voice cloning as of 2026.** Confirms
Trilogy-doc positioning.

Sources:
- [Best AI Sales Agent Platforms 2026 — ZoomInfo](https://pipeline.zoominfo.com/sales/ai-sales-agent-platforms)
- [AI Sales Agents 2026 category guide — Mutiny](https://www.mutinyhq.com/blog/ai-sales-agents-the-2026-category-guide)
- [Best AI Personalization Tools 2026 — Unify](https://www.unifygtm.com/explore/best-ai-personalization-tools-outbound-sales)
- [What the 11x story means — VA Horizon](https://www.vahorizon.site/b2b/blog/what-the-11x-story-means-for-buyers/)
- [11x tear-sheet — Yardstick Research](https://yardstickresearch.app/tear-sheet/11x-ai/)

### B.3 Voice cloning — ElevenLabs

**Verified consent enforcement in ElevenLabs' current ToS (updated March 2026, Service-
Specific Terms updated June 2026):**
- Instant Voice Cloning: user must confirm they have the right and consent to clone
- Professional Voice Cloning: real verification step before training begins
- Paid ownership: paid users own the outputs; free users are restricted to non-commercial
- Public-figure blanket prohibition without consent; accounts have been suspended for
  violations
- **ElevenLabs explicitly notes at least 12 U.S. states now have voice-cloning statutes**
  as of mid-2026 (see B.5 below) and warns users to document consent in writing

The per-teammate consent workflow the Trilogy doc calls for is directly supported by
ElevenLabs' Professional Voice Cloning verification path — recommend the spec use PVC (not
IVC) for team-member twins, so the platform's own verification adds a second layer to
Paige's tenant-side consent artifact.

Sources:
- [ElevenLabs Service-Specific Terms](https://elevenlabs.io/service-specific-terms)
- [ElevenLabs voice cloning restrictions — ElevenLabs Help](https://help.elevenlabs.io/hc/en-us/articles/13313778519057-Are-there-any-restrictions-on-what-voices-I-can-upload-for-voice-cloning)
- [ElevenLabs Voice Cloning Consent Policy 2026 — Terms.Law](https://terms.law/forum/thread/elevenlabs-voice-clone-legal.html)

### B.4 Video cloning — HeyGen vs. Tavus

**HeyGen — broader library claim verified.** 700+ stock avatars on paid plans, "Digital
Twins" feature (launched August 2026) generates custom avatars from a single photo or brief
video, 175+ languages, HD lip-sync, personalized 1:1 CRM-driven video generation. Enterprise
positioning; 50K+ videos per campaign in documented case studies.

**Tavus — purpose-built for 1:1 personalization at scale, verified.** Digital replicas from
one recording, Conversational Video Interface (CVI) with ~1s response latency, API-first,
proprietary rendering models (Phoenix-4 / Raven-1 / Sparrow-1), 30+ language support,
CRM integrations (HubSpot, Salesforce, Zapier, ActiveCampaign). Pricing starts $59/mo.

**The Trilogy doc's split is accurate.** HeyGen is stronger for the "avatar library" pattern
(pick from a menu) and enterprise brand-video use cases; Tavus is stronger for the
programmatic 1:1 "Paige generates a personalized video *for each* client" pattern that fits
Direction B's dispatchable-video-clone-of-Sarah shape. Recommend the spec allow either
partner behind an abstraction, defaulting to Tavus for the programmatic 1:1 path.

**Honest §13 caveat:** HeyGen's Digital Twins launch (Aug 2026) narrows Tavus's technical
moat. Re-evaluate the partner choice at each 6-month checkpoint; the market is moving.

Sources:
- [HeyGen best personalized video platform 2026](https://www.heygen.com/blog/best-ai-video-platform-personalized-video-at-scale)
- [HeyGen Review 2026 — WeShop](https://www.weshop.ai/blog/heygen-review-2026-the-ultimate-ai-video-suite-for-the-avatar-economy/)
- [Tavus AI-Generated Personalized Videos at Scale — Creati.ai](https://creati.ai/ai-tools/tavus/)
- [Tavus review 2026 — Salesforge](https://www.salesforge.ai/directory/sales-tools/tavus)
- [Tavus review 2026 — Toolsforhumans](https://www.toolsforhumans.ai/ai-tools/tavus)

### B.5 Regulatory deep-dive — the ELVIS Act and its cousins

The Trilogy doc names Tennessee's ELVIS Act. That is the tip of an iceberg — as of mid-2026,
**47 states have enacted deepfake/synthetic-media legislation of some kind.** The subset
that binds Direction B specifically:

#### Tennessee — ELVIS Act (Ensuring Likeness Voice and Image Security Act of 2024)

Signed March 21, 2024, effective **July 1, 2024**. Confirmed provisions:
- Extends the state's right-of-publicity to **AI-generated voice AND visual replicas**
- Applies to **any person, not just celebrities** — this is a common misconception; the Act
  explicitly rejects the "must be publicly recognizable" test
- **Reaches upstream to tool providers** whose "primary purpose or function" is to make
  available a person's likeness or voice without authorization. This is the clause the
  Trilogy doc names; verified.
- Standard of consent: written, plain-language, knowing and voluntary
- Criminal: Class A misdemeanor per offense (up to 1 year jail, $2,500 fine)
- Civil: treble damages available; treble damages plus attorney's fees for unauthorized
  replicas of servicemembers

#### California — AB 2602 (2024) + AB 1836 (2024)

**AB 2602** (signed Sept 17, 2024, effective **Jan 1, 2025**, Labor Code §927): a contract
clause allowing creation/use of a digital replica of a worker's voice or likeness is
**unenforceable** unless (a) it includes a reasonably specific description of the intended
uses, AND (b) the individual was represented by counsel or a labor union with express digital-
replica language. Targets employer/performer contracts.

**AB 1836** (2024): expands posthumous right of publicity to explicitly cover AI digital
replicas of deceased personalities in audiovisual works, without consent of the estate.

#### New York — Two December 2025 laws (verified)

Governor Hochul signed both bills **December 11, 2025**:
- **S.8420-A / A.8887 — Synthetic Performer Disclosure Law.** Advertisers must
  "conspicuously disclose" any AI-generated synthetic performer in an ad. Takes effect
  **June 9, 2026** (six-month runway, active now).
- **S.8391 / A.8882 — Digital Replica Right of Publicity Law.** Prior consent required
  from a deceased individual's heirs/executors for commercial use of name/voice/image/
  likeness. Effective immediately upon enactment.

#### Illinois

Right of Publicity Act amended to cover AI-generated voice/likeness. HB2137 (mandating
disclosure of AI-generated imitations and synthetic performers in ads) is on the books;
effective-date variability across sources — verify at build-time. Illinois BIPA is also in
adjacent play for any biometric data captured during twin training.

#### Louisiana

Statute barring non-consensual AI-created depictions; HB178 addressed civil procedure
for authenticity of synthetic evidence. Louisiana joins the "criminal disemmination of
AI-created images of another person" cohort.

#### Others verified with voice-covering right-of-publicity statutes as of mid-2026

California, Indiana, Illinois, Nevada, Tennessee — all have express voice-in-ROP language,
all support suits for unauthorized commercial use of AI-cloned voice/likeness.

#### The overall picture

**47 states have some form of AI-generated media legislation as of June 2026.** The
compliance surface is substantially heavier than the Trilogy doc's "Tennessee ELVIS Act +
some others" framing implies.

#### What this means for Direction B's consent workflow

The Trilogy doc's "per-teammate consent artifact" gate is necessary but the design should
be **calibrated to the strictest applicable regime**, not to the median. Concrete additions
to the spec:

1. **Written + plain-language + knowing-and-voluntary + reasonably-specific-use description**
   — the ELVIS Act baseline. Tenant-side UX must force the teammate to read a plain-English
   description of what their twin will be used for (email drafts only? Voice on calls?
   Video 1:1 to clients?) and sign off on each use category separately. Not one blanket toggle.
2. **Employer-context consent enforceability check (California AB 2602)** — where the
   teammate is a W-2 or contractor of the tenant, the consent artifact should note whether
   the teammate had counsel/union representation. If not, the "reasonably specific use
   description" is the enforceability floor.
3. **Synthetic-performer disclosure (NY, IL)** — when a twin-generated video/audio is used
   in an *ad* (paid distribution), Paige must surface a disclosure suggestion in the
   ad-composer UX. This ties Direction B to Pillar 4's outbound flows.
4. **Deceased-person hard block** — post-mortem uses require estate consent. Paige should
   hard-block a twin of any person whose "life status" is not confirmed alive in the
   consent record.
5. **Tool-provider upstream reach (ELVIS Act)** — Paige *is* the tool provider under the
   Act. If a tenant misuses the twin (e.g. clones a competitor's CEO without consent),
   Paige is exposed unless the tool has genuine "does not knowingly facilitate unauthorized
   replicas" guardrails. The consent record + the teammate email-verification step + the
   Paige-side abuse-monitor are the compliance stack.

**§13 red flag:** the doctrinal call in the Trilogy doc ("no team-member twin ships without
a per-teammate consent artifact") is *right*, but the workflow needs to be materially
stronger than the doc currently implies — a checkbox is not a compliant consent under any
of the state statutes above. The spec should treat the consent flow as the load-bearing
regulatory primitive, not a UX afterthought.

Sources:
- [ELVIS is Alive — ArentFox Schiff](https://www.afslaw.com/perspectives/alerts/elvis-alive-tennessee-first-implement-rights-publicity-protections-against-ai)
- [First-of-Its-Kind AI Law Addresses Deep Fakes and Voice Clones — Holland & Knight](https://www.hklaw.com/en/insights/publications/2024/04/first-of-its-kind-ai-law-addresses-deep-fakes-and-voice-clones)
- [Tennessee ELVIS Act — Davis Wright Tremaine](https://www.dwt.com/blogs/artificial-intelligence-law-advisor/2024/04/tennessee-elvis-act-ai-voice-replica)
- [The ELVIS Act — Latham & Watkins](https://www.lw.com/admin/upload/SiteAttachments/The-ELVIS-Act-Tennessee-Shakes-Up-Its-Right-of-Publicity-Law-and-Takes-On-Generative-AI.pdf)
- [California AB 2602 bill text](https://leginfo.legislature.ca.gov/faces/billNavClient.xhtml?bill_id=202320240AB2602)
- [California Enacts a Suite of New AI and Digital Replica Laws — Manatt](https://www.manatt.com/insights/newsletters/client-alert/california-enacts-a-host-of-new-ai-and-digital-rep)
- [California AB 2602 — Fenwick](https://www.fenwick.com/insights/publications/californias-new-ai-laws-limit-uses-of-digital-likeness)
- [Two Newly Enacted New York Laws — Skadden](https://www.skadden.com/insights/publications/2026/01/two-newly-enacted-new-york-laws-will-regulate)
- [New York State of Mind — Davis Wright Tremaine](https://www.dwt.com/blogs/artificial-intelligence-law-advisor/2026/01/ny-state-consumer-facing-ai-regulation)
- [New York Enacts Landmark AI & Right of Publicity Laws — Debevoise](https://www.debevoisedatablog.com/2025/12/17/new-york-enacts-landmark-ai-right-of-publicity-laws/)
- [Deepfake & AI Voice Cloning Laws by State — Recording Law](https://www.recordinglaw.com/us-laws/deepfake-laws/)
- [Right of Publicity claims will rise — Clark Hill](https://www.clarkhill.com/news-events/news/rop-on-the-rise-right-of-publicity-claims-will-rise-as-states-address-ai-generated-deepfakes-and-voice-cloning/)
- [Synthetic Media & Voice Cloning ROP Risk 2026 — Holon Law](https://holonlaw.com/entertainment-law/synthetic-media-voice-cloning-and-the-new-right-of-publicity-risk-map-for-2026/)
- [Deepfake State Laws Tracker — AI Laws By State](https://www.ailawsbystate.com/topic/deepfakes)

---

## Direction C — Business-twin scenario modeling landscape

### C.1 Enterprise FP&A tools

Verified 2026 pricing bands from independent buyer guides:

| Tool | Positioning | 2026 pricing |
|---|---|---|
| **Anaplan** | Enterprise FP&A, connected planning | $150K-$3M+ |
| **Workday Adaptive Planning** | Enterprise/mid-market FP&A | $20K-$200K+ |
| **Pigment** | Mid-market/enterprise FP&A + AI agents | $300K-$600K typical mid-market |
| **OneStream** | Enterprise CPM | $150K-$3M+ |
| **Planful** | Mid-market/enterprise FP&A | $150K-$3M+ |
| **Vena** | Mid-market Excel-native | $40K-$600K |
| **Drivetrain** | Mid-market SaaS FP&A | $40K-$600K |
| **Abacum** | Mid-market growth-stage FP&A | $40K-$600K |
| **Causal** | SMB/startup FP&A (acquired by Lucanet 2024) | Historically ~$30K-$100K |

All require FP&A literacy (model building, driver definition, scenario configuration).
Confirms Trilogy-doc positioning: these are tools for a finance function, not conversational
assistants for a solo coach.

Sources:
- [Best FP&A Software 2026 — Metapraxis](https://metapraxis.com/best-fpa-software)
- [FP&A Software Pricing Guide 2026 — Limelight](https://www.golimelight.com/financial-planning-analysis-fpa/software-pricing)
- [Top Pigment Competitors 2026 — Cube](https://www.cubesoftware.com/blog/pigment-alternatives)
- [Best Anaplan Alternatives Q3 2026 — Aleph](https://www.getaleph.com/answers/anaplan-alternatives-fpa-software)

### C.2 SMB-friendlier tools

| Tool | Positioning | 2026 pricing |
|---|---|---|
| **Runway Financial** | AI-native FP&A, natural-language copilot, Ambient Intelligence, startup/growth stage | $500-$1.5K/mo ($6K-$18K/yr) |
| **Jirav** | SMB FP&A, driver-based 3-statement modeling, AI forecasting engine | From $10K/yr |
| **Fathom** | Management reporting + KPI + light forecasting | $50-$500/mo |
| **LiveFlow** | Live QuickBooks reporting in Sheets/Excel, "pipes" | From $500/mo |
| **Cube** | Excel-native SMB FP&A | ~$10K-$30K/yr |
| **Datarails** | Excel-native SMB FP&A | ~$10K-$30K/yr |
| **Mosaic** | Growth-stage SaaS FP&A | ~$10K-$30K/yr |
| **Clockwork** | Cash-flow-focused SMB FP&A | Similar band |

**Runway Financial is the closest analog** to what Paige Direction C attempts: AI-native,
natural-language "why did revenue drop in Q3?" copilot, automated variance detection. **But**
Runway is a *finance-team* tool for startups with a finance owner. It requires model setup,
integration of accounting data, and the user asking targeted finance questions. It is not
"a coach asks Paige 'what happens if I raise prices' and gets a modeled answer against
their own client data with confidence intervals in chat."

**Confirms the greenfield claim** for the coach / consultant / agency / thought-leader audience
at conversational-chat, per-tenant-data, non-finance-user shape. Runway is closest but is
selling to a different buyer with a different mental model.

Sources:
- [Best FP&A Software for Small Businesses 2026 — Clockwork](https://www.clockwork.ai/blog/best-fpa-software-small-business)
- [Fathom vs Jirav vs LiveFlow — Eightx](https://eightx.co/blog/fathom-vs-jirav-vs-liveflow-reporting)
- [Runway Financial Review 2026 — Grove](https://grove.financial/profiles/runway-financial)
- [Runway Financial Review — AI Business](https://aibusiness.vc/tools/directory/runway-financial)
- [Runway Guide 2026 — CFO Shortlist](https://www.cfoshortlist.com/vendors/runway)

### C.3 Business-twin / digital-twin-of-organization category

**Adjacent category exists but does not overlap Paige's target market.** Verified:

- Enterprise "Digital Twin of an Organization" (DTO) is a real Gartner-era category (Skan.ai,
  Simio, industrial supply-chain simulators). Selling to Fortune 500 operations teams.
- 2026 marketing content promises "AI Digital Twins for Business Operations" for SMEs
  (mostly manufacturing SMEs, some services). Content-marketing dominant; **no productized,
  self-serve, tenant-authored, natural-language, chat-driven SMB scenario simulator for the
  coach / consultant / agency vertical was identified.**
- The closest emerging shape is Runway Financial's AI Copilot (previous section), which is
  finance-team-flavored not COO-flavored.

**Confirms the Trilogy doc's greenfield claim** — with the honest caveat that (a) the
category is being *talked about* by consultants and analyst-adjacent voices, so someone
will try to build it, and (b) an FP&A vendor pivoting toward "chat with your finances" is
the most likely competitor to arrive next. Timing window is real but likely 6-18 months.

Sources:
- [Digital Twin of an Organization — Skan.ai](https://www.skan.ai/blogs/digital-twin-of-an-organization-dto-model-your-business-in-real-time)
- [AI Digital Twins for Business Operations SME 2026 — ACTGSYS](https://actgsys.com/en/blog/ai-digital-twin-business-operations-sme-2026)
- [Building Your Business's Digital Twin — Bit Binders](https://www.bitbinders.in/building-your-business-s-digital-twin-the-ai-powered-blueprint-for-end-to-end-scalability/)
- [AI Digital Twins Empower SME Supply Chain — CPSCP](https://cpscp.org/ai-digital-twins-empower-sme-supply-chain-risk-simulation/)

### C.4 Reasonable-defaults library for MVP modeling techniques

The Trilogy doc names 5 scenarios: pricing elasticity, funnel conversion, retention/churn,
cohort LTV, ad-spend response curve. Verified defaults suitable for an SMB coach /
consultant / agency Playbook:

**Pricing elasticity**
- Segment elasticity by cohort (new vs. repeat, higher- vs. lower-ACV) rather than
  aggregate — aggregate elasticities hide the variation that matters
- Time-lag matters: if onboarding takes 14+ days, price-rise churn spikes *after* the
  onboarding window, not immediately. Model with a 30-60 day post-change window.
- Account for competitive reaction (elasticities computed from historical price-hold
  periods overstate the safe range if a competitor is also actively adjusting)

**Churn / retention (SMB SaaS benchmarks)**
- SMB monthly churn: **3-5%** typical range
- Mid-market monthly churn: 1.5-3%
- Enterprise monthly churn: 1-2%
- Annual contracts suppress churn by 40-60% vs. monthly billing — a material lever
- Diagnose churn by cohort × contract size × acquisition channel × tenure; a single
  aggregate churn number hides the real signal

**Cohort LTV**
- Cohort-based LTV tracks actual revenue per acquisition cohort over 12-24 months and
  reveals non-linear patterns
- Simple LTV calculations *overstate* value for cohorts under 12 months old and *understate*
  for cohorts above 24 months
- The **shape** of the retention curve drives LTV more than the M12 endpoint — two cohorts
  with identical M12 retention can have radically different LTVs

**LTV:CAC benchmarks by segment**
- Enterprise SaaS ($100K+ ACV): 4.5:1
- Mid-market ($15K-$100K): 3.2:1
- SMB (under $15K): 2.5:1
- SMB median LTV: ~$9,850; mid-market median: ~$43,200 (4.4× SMB)

**Ad-spend response**
- Diminishing returns curve is standard (logarithmic or power form); reasonable default
  is a saturation curve with parameters fit to the tenant's own last 90-180 days of spend
- Attribution-window sensitivity is high — Paige should surface which window (last-click,
  7-day, 28-day) drives the curve and how the answer changes across windows

**Funnel conversion**
- Anomaly detection against tenant's own baseline, not against industry averages (industry
  averages for "coaching funnels" are notoriously unreliable — vertical + price point + audience
  variance drowns the signal)
- Standard stages: traffic → lead → qualified lead → discovery call → close → activation

**§13 honesty on this section:** the numeric defaults above are cited from public SMB SaaS
benchmark aggregators. They are reasonable *starting priors* for a Bayesian-shaped scenario
model — they are **not** the tenant's own truth. The Direction C MVP's core value is running
the tenant's *own* data through these frames and surfacing where the tenant differs from the
prior. Recommend the spec make prior vs. observed a first-class UI concept ("industry SMB
average churn: 4%; your observed churn: 6.2% — here's the delta and what it costs you").

Sources:
- [Cohort Analysis — Reading the Shape — Primores AI wiki](https://primores.org/wiki/glossary/cohort-analysis/)
- [Customer Lifetime Value Benchmarks 2026 — Digital Applied](https://www.digitalapplied.com/blog/customer-lifetime-value-benchmarks-2026-industry-data)
- [LTV:CAC Ratio Benchmarks 2026 — Foundry CRO](https://foundrycro.com/blog/ltv-cac-ratio-benchmarks-2026/)
- [B2B SaaS Churn Rate Benchmarks — Optifai](https://optif.ai/learn/questions/b2b-saas-churn-rate-benchmark/)
- [SaaS Cohort Analysis 2026 — Consult EFC](https://consultefc.com/saas-cohort-analysis-tables/)
- [SaaS Churn Rate 2026 — Vanta Insights](https://vantainsights.com/insights/saas-churn-rate)
- [Churn Rate Benchmarks by Industry 2026 — SubJolt](https://www.subjolt.com/guides/churn-rate-benchmarks/)
- [How to Analyze Revenue Growth Drivers — DCF Analysis](https://dcf-analysis.com/blogs/blog/analyze-drivers-revenue-growth)

---

## Priority ranking rationale — challenging the recommended order

The Trilogy doc recommends **B (weeks 1-8) → A parallel (weeks 4-12) → C (weeks 8-20).**
Evaluating this against leverage-per-week, dependency chains, regulatory-consent readiness,
and MVP-shipability:

### Arguments for the recommended order (defending B first)

- **B extends §26 semantic memory with no third-party dependency** — writing-style twin
  ships from primitives already in the repo. Fastest wow-moment for a signed-up team.
- **Every coach with any team has felt the "clone my style" wish** — the buyer intent is
  already primed, category-native demand.
- **Consent gate maturity** is the load-bearing gate. Getting the per-teammate consent UX
  right *before* ElevenLabs / HeyGen / Tavus integration is right sequencing — Direction B
  Phase 1 (writing-style only) forces the consent primitive to ship without also carrying
  voice/video complexity. Phase 2 (voice/video) then reuses a hardened consent flow.

### Arguments to challenge — I'd sequence differently

**Consider A-first, or A-and-B in parallel from week 1.**

Rationale:
1. **A opens Marketplace inventory fastest.** Browser-task Playbooks are the most obvious
   category-native Marketplace unit — every coach who runs one non-API'd tool wants a Playbook
   for it. Three seed Playbooks + open the author path = compounding inventory. That is a
   §17 L2 revenue flywheel the other two directions can't spin as fast.
2. **A has lower regulatory surface** than B (assuming the ToS-flag DSL from A.5). Ship-
   sooner-with-less-legal-risk usually wins on prioritization.
3. **A is the strongest §36 demo** — a coach watching Paige log into ClickFunnels weekly,
   export the numbers, and drop them into a dashboard *while they watch* is a jaw-drop that
   B's "here's an email in Sarah's voice" doesn't match (people are jaded on generated copy).
4. **B's Phase 1 (writing-style only) is inherently narrow demo value** — the wow moment
   for B is really the voice/video, and voice/video needs the consent gate hardened *and*
   the state-law compliance stack lit up. Realistically B Phase 2 is a Q3+ ship, not
   week 8. B Phase 1 alone won't be the demo-worthy version.

**Business twin (C) — defend last-place.**

- C requires data foundation (§7 tenant-authored) plus enough transaction history to model
  against. New tenants literally don't have enough data for it to work. Building it before
  the tenant base has depth is premature — the tool would embarrass itself on thin data.
- C's greenfield is durable — 12-18 months of runway before the FP&A vendors reach for it.
  No urgent competitive pressure.
- The MVP-3-scenario framing is right; recommend keeping it small and shipping late.

### Recommended re-sequencing

**Weeks 1-6:** A infrastructure (Browserbase + Browser-Use + Playbook DSL + `autonomy_lane`
binding) + 3 seed Playbooks. Marketplace-author docs published. Ship the ClickFunnels /
Kajabi seed Playbooks; **hold** the LinkedIn Sales Nav Playbook as tenant-authored only.

**Weeks 4-10 (overlapping):** B Phase 1 — writing-style twin, consent gate hardened,
Grammarly-Personalized-Voice-equivalent Paige capability. State-law compliance stack lit
up (ELVIS Act + CA AB 2602 + NY synthetic-performer disclosure). §26 memory extension.

**Weeks 10-16:** B Phase 2 — ElevenLabs voice + HeyGen/Tavus video, gated behind the now-
hardened consent workflow. Legal review of consent artifact against state statutes done
BEFORE this phase ships, not after.

**Weeks 16-24:** C MVP — 3 scenarios (pricing change, add tier, hiring/capacity), against
tenants who by now have 3-6+ months of Paige data foundation. Confidence-interval-honest UX.

**Net vs. the doc:** A moves ahead of B in sequencing; total elapsed roughly matches
(24 weeks either way). Trade-off: gain faster Marketplace inventory and demo strength; lose
1-2 weeks on B Phase 1 relative to the doc's plan.

**§13 honesty:** either order is defensible. The recommendation to re-order rests on
Marketplace-inventory being higher-value than fastest-B-ship; if internal analysis of L2
Marketplace economics disagrees, keep the original order.

---

## Red flags the Trilogy doc doesn't yet acknowledge (summary)

1. **Browserbase pricing is not "$0.006/page."** It's $0.10-0.12/browser-hour + proxy
   bandwidth. Same order-of-magnitude at scale, wrong at the pricing-model level. Fix in
   the spec.
2. **Meta v. Bright Data (Jan 2024) — the case-law update Direction A depends on.**
   ToS-binding-on-scrapers turned on whether the scraper logged in. Paige's browser agent
   *does* log in (with tenant credentials) so *Meta* is not protective; *hiQ*'s ToS-breach
   holding *is* the applicable precedent. The Playbook DSL needs the ToS-flag field and
   the seed-vs-tenant-authored distinction.
3. **LinkedIn Sales Nav is a bad seed Playbook choice.** It's the highest-ToS-risk target
   in the Trilogy doc's example list. Recommend removing it from the seed set; tenants may
   author it themselves with an acknowledgment.
4. **ELVIS Act consent workflow needs to be materially stronger than the doc implies.**
   47 states have deepfake legislation as of June 2026. New York's Synthetic Performer
   Disclosure Law goes live June 9, 2026. California's AB 2602 makes contract-clause
   enforceability turn on specific-use-description and legal/union representation of the
   teammate. A checkbox does not clear any of these. The consent artifact is the
   load-bearing regulatory primitive, not a UX afterthought.
5. **11x.ai's 2025 credibility crisis strengthens Paige's position.** The AI-SDR category
   is scorched by generic-voice quality failures; per-teammate twin (properly consent-gated)
   is what the burnt category needs. Worth naming in positioning language.
6. **HeyGen's Digital Twins (Aug 2026) narrows Tavus's technical moat.** The two-partner
   split still works, but re-evaluate the choice at each 6-month checkpoint. Market is
   moving.
7. **Anon's "zero-trust" claim is stronger for OAuth flows than for username/password
   flows,** and is not independently auditable from public materials. §9 already requires
   canonical credential storage in Supabase Vault; Anon should be one execution-time
   delivery option among several, never the default. Also: unified-API platforms (Kombo,
   Merge, Nango, Unified.to) are a *category error* as Anon alternatives — they normalize
   API responses, not browser sessions. Remove that framing from the Trilogy doc.
8. **Business-twin greenfield is real but not durable forever.** Runway Financial's
   AI Copilot is the closest live analog; the shape is different (finance-team tool, not
   COO chat-companion) but an FP&A vendor pivoting into "chat with your finances" is the
   most likely competitor arrival. 12-18 month window; don't dawdle on Direction C past
   week 24.
9. **Direction C priors vs. observed is a first-class UX concept.** SMB benchmarks
   (churn 3-5% monthly, LTV:CAC 2.5:1) are reasonable Bayesian priors; the tenant's *own*
   data is the truth. Modeling should surface both explicitly.
10. **Recommend re-sequencing to A → B → C** (rather than B → A → C) for Marketplace-
    inventory leverage and demo strength, unless internal L2 economics dispute the trade-off.

---

*End of research report. All numeric claims, regulatory citations, and vendor positioning
statements are sourced inline. Anything not verifiable online is flagged with a §13
honesty note.*
