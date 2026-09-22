# PAIGE — MCP Integrations Catalogue (research reference)

**Status:** research input for the Integrations roadmap — **not a provider registry** (see below).
**Researched:** 2026-09-22 (owner-delivered).
**Scope:** remote MCP over HTTPS / Streamable HTTP (the Connected MCP Gateway); auth: OAuth (incl.
dynamic client registration), bearer, custom header, URL token, none.
**Owner direction:** research input for the Integrations roadmap; the canonical provider registry
governs what is actually built and seeded.

### This document is DERIVED — it is not a provider registry (§18 / AGENTS.md)

- **`docs/integration-registry/integration-capability-registry.json` is THE single authoritative
  provider registry** (its README, "What this is", L12–20). AGENTS.md forbids any *second* provider
  registry as blocking, so this catalogue does **not** compete with it — like the other provider
  docs, it **cites** the canonical registry rather than restating provider governance (README L33–40).
- **This catalogue is planning research only.** It confers **zero** provider-governance, build, or
  runtime authority and **is not a provider registry.** A provider appearing here is not connected,
  available, or governed by that fact.
- **Every provider's governed entry** — its authority lane, limitations, receipts, cost controls, and
  honest delivery status — is authored in the **canonical registry at seeding** (the separately-
  authorized provider-catalogue schema + seed step), **never from this document.** No Integrations
  work seeds a provider from this file; it seeds through the canonical registry's governance. The
  research-confidence notes below only *flag* which rows still need re-verification before step 2
  considers them — they decide nothing.

Sibling: the G1b Integrations UI backend contract at
[`g1a1-connections-contract.md`](./g1a1-connections-contract.md).

---

## Research-confidence notes & scope (2026-09-22) — this document authorizes nothing

**NO provider may be seeded, enabled, or built from this document.** Seeding a provider requires a
canonical entry in `integration-capability-registry.json` authored at step 2 — carrying that entry's
authority lane, limitations, receipts, cost controls, and honest delivery state. **This document
confers zero authority** (§18 / AGENTS.md — see the DERIVED note above). The owner's provider research
tables below are preserved as delivered (§58); the notes here flag research confidence and scope so
step 2 can prioritise — they decide, permit, and gate nothing.

> **STEP 2 DEPENDENCY.** The candidate providers listed here must be recorded as `PROPOSED` /
> `UNVERIFIED` entries in the canonical `integration-capability-registry.json` **before any of them
> is seeded.** Tracked in the register. This catalogue does not create, gate, or authorize those
> entries — the step-2 seeding slice does.

1. **Confidence marker (research only).** Rows marked **"(secondary)"** and every item in section D
   are **medium-confidence** — their auth mode, server URL, and transport came from third-party
   directories and MUST be re-read against current vendor docs at step 2 (§13/§32 — do not claim a
   verified contract that has not been re-read). Rows with a vendor-docs URL read on 2026-09-21/22 are
   **high-confidence research** — still not a seeding decision; step 2's canonical entry and its
   per-provider auth/URL/transport check decide whether anything is seeded.
2. **SSE transport is EXCLUDED for now (coordinator ruling).** The executable loader path is
   Streamable-HTTP-only. **Square** and **Make** (SSE-only / SSE-documented) therefore stay
   **"Not available yet"** in the Integrations screen until/unless SSE transport is added as its own
   slice. They are catalogued below for completeness, not for seeding.
3. **Lane (owner, §2).** PaigeAgent AI serves **small business and commercial funding only.**
   **Consumer credit-repair and dispute tools are OUT OF SCOPE** and are not in this catalogue.
4. **Honest UI states.** A provider that is not seeded, not yet available, or restricted to an
   allowlist renders an honest disabled/"Not available yet" state — never a tile that implies an
   integration Paige cannot actually make (§13/§70).

**Legend.** **[DCR]** = dynamic client registration, plug-and-play. **[PRE-REG]** = Paige must
register its own OAuth app with the vendor first. **[ALLOWLIST]** = vendor only admits approved
clients. **[ADMIN]** = the client's admin or a paid plan is required.
**Confidence.** Rows with a vendor-docs URL were read on 2026-09-21/22 (high confidence). Rows marked
"(secondary)" came from third-party directories (medium confidence; re-verify before building).

---

## A. Build tiers (how to sequence the Integrations screen)

### Tier 1: connect in one click (OAuth; most support DCR)
- **CRM and sales:** HighLevel (v2 OAuth), HubSpot, Close [DCR], Attio, Apollo.io.
- **Marketing and email:** Klaviyo, Resend, Kit.
- **Scheduling and productivity:** Calendly [DCR], Notion [DCR], Linear [DCR], ClickUp, Trello, Todoist, Airtable, Fireflies.
- **Money:** Stripe, Mercury [DCR, read-only].
- **Documents, HR and support:** Gusto [DCR, admin], PandaDoc, Dropbox, Typeform, Intercom.
- **Websites:** Webflow, Wix, WordPress.com [DCR, paid plan].
- **Creative:** Gamma [DCR], ElevenLabs.
- **Social:** Metricool, Hootsuite [paid plan].
- **Automation hub:** Zapier MCP.

### Tier 2: paste a key or token
Buffer (social posting across ~10 networks), Brevo, monday.com, PayPal, Mailchimp Transactional (Mandrill), n8n (instance URL + token), Pipedream / Composio (aggregators).

### Tier 3: Paige must register an OAuth app with the vendor first (one-time platform setup) [PRE-REG]
Slack, Asana, Zoom, Front, Canva, Box, Google Workspace (Gmail/Calendar/Drive; Developer Preview; per-client GCP project), Salesforce (the client's admin creates an External Client App), Microsoft 365 (Entra + Microsoft's paid M365 agent licence).

### Tier 4: not available to Paige yet (route via Zapier/Pipedream or wait)
- **Vendor-hosted but restricted to Claude/ChatGPT or an allowlist:** QuickBooks hosted, Shopify admin, Adobe, Figma.
- **Local only:** Xero.
- **SSE-only (excluded per coordinator ruling — see note #2):** Square, Make.
- **No official server:** organic Facebook/Instagram, LinkedIn, TikTok, YouTube. Use Buffer, Metricool or Hootsuite instead.

### Gateway capability gaps this list exposes (for the MCP agent)
1. **OAuth with DCR** plus **pre-registered client credentials per provider** (G1a-3). Both are needed.
2. **Multiple custom headers** on one connection. Pipedream needs 4 headers, HighLevel legacy needs a `locationId` header, Close needs `Close-API-Key` + `Close-Scope`, Stripe Connect needs a `Stripe-Account` header. Today the gateway's `header` auth supports a single header.
3. **Per-account or regional server URLs** (Descript, Zoho, n8n, Make, Intercom EU, ElevenLabs EU, PandaDoc EU, WooCommerce).
4. **SSE transport** (Square, Make), if those are wanted — currently **excluded** (note #2).
5. **Human-confirmation hooks** (Stripe refunds, Gusto writes): map them onto Paige's approval + Trust Compass flow.

---

## B. Full catalogue by category

### 1. Social media & content publishing
| Platform | MCP status | Server / docs | Auth | Key capabilities | Source |
|---|---|---|---|---|---|
| Meta Ads (FB/IG paid) | Official remote, open beta (Apr 2026) | `https://mcp.facebook.com/ads` | Meta Business OAuth | Ads reporting; create/edit/pause campaigns, ad sets, ads. **No organic posting or DMs** | developers.facebook.com (Ads MCP overview) |
| Facebook / Instagram organic | No official server | — | — | Use Buffer, Metricool, Hootsuite or Zapier | usecarly.com (secondary) |
| WhatsApp Business | Official "Business Tools MCP" launched 2026-09-15; URL and auth not confirmed | — | — | Account setup, templates, webhooks (developer-focused, not an inbox) | techcrunch.com 2026-09-15 |
| X (Twitter) | Official remote | `https://api.x.com/mcp` | App bearer (reads); user writes need X's local bridge | Search, trends, bookmarks, Articles; pay-per-use API | docs.x.com/tools/mcp |
| LinkedIn / TikTok / YouTube | Not confirmed | — | — | Via Buffer, Metricool, Hootsuite or aggregators | secondary |
| Pinterest Ads / Microsoft Ads | Official, read-only, partner pilots only | — | — | Campaign analytics | secondary |
| **Buffer** | Official remote | `https://mcp.buffer.com/mcp` | Bearer API key | Create/schedule/edit posts, drafts, analytics across IG, FB, X, LinkedIn, Pinterest, YouTube, TikTok, Threads, Bluesky, Mastodon | developers.buffer.com |
| **Hootsuite** | Official remote (Jun 2026) | `mcp.hootsuite.com/perch` (publish/analytics), `/nest` (inbox), `/lumen` (listening) | OAuth [ADMIN paid plan] | Draft, schedule, analytics, inbox, listening | hootsuite.com/integrations/mcp |
| **Metricool** | Official remote | `https://ai.metricool.com/mcp` | OAuth or header token | Multi-brand posting, analytics, inbox, ads; free plan works | help.metricool.com |
| Sprout Social | Reported analytics-only; URL not confirmed | — | — | — | secondary |
| Postiz / Zernio / PlugKit | Official (smaller vendors) | `mcp.postiz.com/mcp`, `mcp.zernio.com/mcp`, `api.plugkit.co/mcp` | Bearer / OAuth | Multi-network publishing | secondary |

### 2. CRM & sales
| Platform | MCP status | Server / docs | Auth | Key capabilities | Source |
|---|---|---|---|---|---|
| **HighLevel / LeadConnector** | Official remote | v2: `https://services.leadconnectorhq.com/mcp/anthropic/v2`; legacy: `https://services.leadconnectorhq.com/mcp/` | v2 OAuth; legacy PIT bearer + `locationId` header | 550+ ops: contacts, conversations (**send SMS/email**), opportunities, calendars, invoices/payments, workflows, social planner, blogs | marketplace.gohighlevel.com/docs/other/mcp |
| **HubSpot** | Official remote, GA | `https://mcp.hubspot.com` | OAuth 2.1 PKCE | CRM records, activities, marketing emails, pipelines (some features Pro/Enterprise) | developers.hubspot.com |
| Salesforce | Official hosted, GA (Apr 2026) | `https://api.salesforce.com/platform/mcp/v1/<server>` | OAuth PKCE [PRE-REG by the client's admin] | Record CRUD, Flows, Apex actions | developer.salesforce.com |
| **Pipedrive** | Official, GA 2026-06-30 | URL not published on the pages read | OAuth | Deals, contacts, leads, activities | pipedrive.com/en/features/mcp-server |
| **Close** | Official remote | `https://mcp.close.com/mcp` | OAuth [DCR] or `Close-API-Key` + `Close-Scope` headers | Read/write/destructive scopes | help.close.com/docs/mcp-server |
| **Attio** | Official remote | `https://mcp.attio.com/mcp` | OAuth | Records, lists, notes, tasks, call/email search | docs.attio.com/mcp |
| Zoho CRM | Official hosted (per-user URL) | Zoho MCP portal | OAuth | Record CRUD, workflows | zoho.com/crm/developer/docs/mcp |
| ActiveCampaign | Official remote (URL not captured) | — | Not confirmed | Contacts, automations | developers.activecampaign.com/page/mcp |
| **Apollo.io** | Official remote | `https://mcp.apollo.io/mcp` | OAuth or API key | People/company search, enrichment (credits), sequences; not on free accounts | docs.apollo.io |
| Keap | Not confirmed | — | — | Via Zapier/Pipedream | — |

### 3. Marketing & email
| Platform | MCP status | Server / docs | Auth | Key capabilities | Source |
|---|---|---|---|---|---|
| **Klaviyo** | Official remote | `https://mcp.klaviyo.com/mcp` | OAuth or private key | Campaign/flow analytics, segments, create campaigns | developers.klaviyo.com |
| **Brevo** | Official remote | `https://mcp.brevo.com/v1/brevo/mcp` | Bearer MCP token | Contacts, email/SMS campaigns, light CRM, templates | developers.brevo.com |
| **Resend** | Official remote | `https://mcp.resend.com/mcp` | OAuth or API key | Send email, templates, contacts, broadcasts, domains | resend.com/docs/mcp-server |
| **Kit (ConvertKit)** | Official remote | `https://app.kit.com/mcp` | OAuth [ADMIN Creator plan+] | Subscribers, tags, broadcasts, landing pages | help.kit.com |
| Mailchimp Marketing | Conflicting reports; not confirmed | — | — | — | secondary |
| Mailchimp Transactional | Official remote | `https://mandrillapp.com/mcp` | Bearer API key | Templates, send diagnostics | mailchimp.com/developer |
| SendGrid / Twilio | Hosted server is docs-search only | `https://mcp.twilio.com/docs` | None | No sending | twilio.com/docs/ai/mcp |
| Google Ads | Official server is local, read-only | — | OAuth + dev token | Reporting | secondary |

### 4. Creative tools
| Platform | MCP status | Server / docs | Auth | Key capabilities | Source |
|---|---|---|---|---|---|
| Canva | Official remote | `https://mcp.canva.com/mcp` | OAuth [PRE-REG]; secretless path [ALLOWLIST] | Generate/edit designs, export PDF/PNG/MP4 | canva.dev/docs/apps/mcp |
| Figma | Official remote | `https://mcp.figma.com/mcp` | OAuth [ALLOWLIST: Figma MCP Catalog] | Canvas read/write | developers.figma.com |
| Adobe for creativity | Official, Claude-only | `adobe-creativity.adobe.io/mcp` | Adobe sign-in | Photoshop/Firefly/Express edits | developer.adobe.com |
| **Gamma** | Official remote | `https://mcp.gamma.app/mcp` | OAuth [DCR] | Generate decks/docs/sites, export | developers.gamma.app |
| **ElevenLabs** | Official remote | `https://api.elevenlabs.io/v1/mcp` (+EU/IN/SG) | OAuth | Voice agents, TTS, image, video, music | elevenlabs.io/docs |
| Descript | Official remote (per-account URL) | Settings → Descript MCP | OAuth | Import, edit, publish, transcripts | help.descript.com |
| CapCut / Midjourney | Not confirmed | — | — | — | — |

### 5. Productivity & collaboration
| Platform | MCP status | Server / docs | Auth | Key capabilities | Source |
|---|---|---|---|---|---|
| **Notion** | Official remote | `https://mcp.notion.com/mcp` | OAuth PKCE [DCR] | Search, create/update pages and databases | developers.notion.com |
| Google Workspace | Official remote, Developer Preview | `https://{gmail,drive,docs,sheets,slides,calendar,chat}mcp.googleapis.com/mcp/v1` | OAuth [PRE-REG per-client GCP project][ADMIN] | Gmail, Calendar, Drive, etc. | developers.google.com/workspace |
| Microsoft 365 (Work IQ) | Official remote, preview | `agent365.svc.cloud.microsoft/.../servers/mcp_MailTools` etc. | Entra [PRE-REG][ADMIN + paid M365 agent licence] | Mail, Calendar, Teams, SharePoint | learn.microsoft.com |
| Slack | Official remote | `https://mcp.slack.com/mcp` | OAuth, no DCR [PRE-REG][ADMIN] | Search/read/send messages, files | docs.slack.dev |
| Asana | Official remote (V2) | `https://mcp.asana.com/v2/mcp` | [PRE-REG] | Tasks, projects | developers.asana.com |
| **ClickUp** | Official remote | `https://mcp.clickup.com/mcp` | OAuth 2.1 PKCE | Tasks, docs, time tracking (free plan capped) | developer.clickup.com |
| **monday.com** | Official remote | `https://mcp.monday.com/mcp` | API token or OAuth | 60+ read/write tools | developer.monday.com |
| **Linear** | Official remote | `https://mcp.linear.app/mcp` | OAuth [DCR] or key | Issues, projects | linear.app/docs/mcp |
| **Trello** | Official remote | `https://mcp.trello.com/v1` | OAuth | Boards, cards, checklists | support.atlassian.com |
| **Todoist** | Official remote | `https://ai.todoist.net/mcp` | OAuth | Tasks, projects | github.com/Doist/todoist-mcp |
| **Airtable** | Official remote | `https://mcp.airtable.com/mcp` | OAuth or PAT | Records CRUD, bases, automations | support.airtable.com |
| Zoom | Official remote (per product) | see docs | [PRE-REG] | Meetings, recordings, notes | developers.zoom.us |
| **Calendly** | Official remote | `https://mcp.calendly.com` | OAuth 2.1 PKCE [DCR] | Availability, event types, booking | developer.calendly.com |
| Miro | Official remote | `https://mcp.miro.com/` (verify) | OAuth 2.1 | Boards, diagrams | developers.miro.com |
| **Fireflies** | Official remote | `https://api.fireflies.ai/mcp` | OAuth or API key | Transcripts, summaries | guide.fireflies.ai |
| Fathom | Remote (directory-listed) | `https://api.fathom.ai/mcp` | Not confirmed | Meeting summaries | secondary |

### 6. Financial & payments (business finance only)
| Platform | MCP status | Server / docs | Auth | Key capabilities | Source |
|---|---|---|---|---|---|
| **Stripe** | Official remote | `https://mcp.stripe.com` | OAuth or restricted key (+ `Stripe-Account` header) | Customers, invoices, payment links, subscriptions, refunds (human confirm) | docs.stripe.com/mcp |
| PayPal | Official remote | `https://mcp.paypal.com` | Bearer (client credentials) | Invoices, payments | developer.paypal.com |
| Square | Official remote, beta, SSE URL | `https://mcp.squareup.com/sse` | OAuth | Payments, customers, catalog, orders (**SSE — excluded, see note #2; verify Streamable HTTP**) | secondary / github square |
| QuickBooks | Hosted, Claude/ChatGPT only; OSS server is local | `ai-inc.quickbooks.intuit.com/v1/mcp` | OAuth | Invoices, customers, payments, reports | secondary |
| Xero | Official local only | `@xeroapi/xero-mcp-server` | OAuth | Accounting CRUD | github.com/xeroapi |
| **Mercury** | Official remote, read-only | `https://mcp.mercury.com/mcp` | OAuth [DCR] | Balances, transactions | docs.mercury.com |
| Ramp | Official remote | `https://ramp-mcp-remote.ramp.com/mcp` | OAuth | Spend/expense analysis | secondary |
| Brex | Official remote | `https://api.brex.com/mcp` | OAuth or admin key [ADMIN] | Expenses, receipts | developer.brex.com |
| Plaid | Developer dashboard only | `https://api.dashboard.plaid.com/mcp/` | Client credentials | No end-user bank data | plaid.com/docs |
| FreshBooks / Wave / Bill.com | Not confirmed | — | — | Via Zapier/Pipedream | — |

### 7. Admin / operations / legal / HR
| Platform | MCP status | Server / docs | Auth | Key capabilities | Source |
|---|---|---|---|---|---|
| DocuSign | Official remote, beta | `https://mcp.docusign.com/mcp` | OAuth (details TBC) | Envelopes, signing status | developers.docusign.com |
| **PandaDoc** | Official remote | `https://mcp.pandadoc.com/v1/mcp` (EU `.eu`) | OAuth | Documents from templates, send, track | developers.pandadoc.com |
| **Gusto** | Official remote | `https://mcp.api.gusto.com` | OAuth [DCR][ADMIN] | Payroll/employee data, time, onboarding | gusto.com |
| Box | Official remote, GA | `https://mcp.box.com` | OAuth [ADMIN][PRE-REG] | File search/read, AI extraction | developer.box.com |
| **Dropbox** | Official remote, beta | `https://mcp.dropbox.com/mcp` | OAuth | Files CRUD, search, shared links | help.dropbox.com |
| **Typeform** | Official remote | `https://api.typeform.com/mcp` | OAuth | Forms, responses, automations | typeform.com/developers/mcp |
| Jotform | Official remote (URL not captured) | — | OAuth | Forms, submissions | jotform.com/developers/mcp |
| Dropbox Sign / Rippling / BambooHR | Not confirmed | — | — | Aggregators | — |

### 8. Automation hubs & aggregators
| Platform | MCP status | Server / docs | Auth | Key capabilities | Source |
|---|---|---|---|---|---|
| **Zapier MCP** | Official remote | `mcp.zapier.com` | OAuth or token | 8,000+ app actions (2 Zapier tasks per call) | docs.zapier.com/mcp |
| **n8n** | Official, per instance | `<instance>/mcp-server/http` | OAuth or token | Search/run/create workflows | docs.n8n.io |
| Make | Official cloud (SSE documented) | `https://<zone>/mcp/api/v1/u/<TOKEN>/sse` | URL token or bearer | On-demand scenarios (**SSE — excluded, see note #2; verify transport**) | developers.make.com |
| Pipedream | Official remote | `https://remote.mcp.pipedream.net/v3` | Bearer + 4 `x-pd-*` headers | 3,000+ APIs with managed auth | pipedream.com/docs |
| Composio | Official remote | `https://backend.composio.dev/v3/mcp/<id>` | `x-api-key` header | Per-toolkit servers | docs.composio.dev |

### 9. Customer support & communications
| Platform | MCP status | Server / docs | Auth | Key capabilities | Source |
|---|---|---|---|---|---|
| **Intercom** | Official remote (US/EU) | `https://mcp.intercom.com/mcp` | OAuth or token | Users, conversations, notes, Help Center | developers.intercom.com |
| Front | Official remote, beta | `https://mcp.frontapp.com/mcp` | OAuth 2.1 [PRE-REG] | Conversations, drafts, tags, contacts | dev.frontapp.com |
| Help Scout | Official, read-only | see docs | User login | Search conversations/customers | helpscout.com |
| Zendesk | Conflicting; not confirmed | — | — | Aggregators | secondary |
| Twilio (SMS) | No sending server (docs only) | — | — | Use HighLevel/Brevo for SMS | twilio.com |

### 10. E-commerce & websites
| Platform | MCP status | Server / docs | Auth | Key capabilities | Source |
|---|---|---|---|---|---|
| Shopify admin | Claude/ChatGPT-only connector | — | — | Orders, products, inventory | shopify.dev / secondary |
| WooCommerce | Official, developer preview (on-store) | `https://<store>/wp-json/mcp/mcp-adapter-default-server` | WP Application Password | Products, orders | developer.woocommerce.com |
| **WordPress.com** | Official remote | `https://public-api.wordpress.com/wpcom/v2/mcp/v1` | OAuth 2.1 [DCR][ADMIN paid plan] | Sites, posts | developer.wordpress.com |
| **Wix** | Official remote | `https://mcp.wix.com/mcp` | OAuth | Products, orders, bookings, blog | wix.com |
| **Webflow** | Official remote | `https://mcp.webflow.com/mcp` | OAuth | Sites, CMS, pages | developers.webflow.com |
| Squarespace | Official remote, domains only | `https://mcp.squarespace.com/mcp` | None | Domain search | developers-preview.squarespace.com |

### 11. Gaps important for service businesses
- **Field service:** no official server for Jobber, Housecall Pro or ServiceTitan.
- **Scheduling:** no official server for Acuity, Vagaro or Mindbody. Calendly is the option.
- **Reviews:** no official server for Google Business Profile or Yelp.
- **Accounting:** QuickBooks is the owners' #1 tool but is blocked for third-party clients. Bridge via Zapier/Pipedream.

---

## C. Recommended first 20 (small service business)
1. HighLevel
2. Google Workspace (bridge via Zapier until the preview matures)
3. Stripe
4. HubSpot
5. Calendly
6. Zapier MCP
7. Notion
8. QuickBooks (blocked; bridge)
9. Buffer
10. Metricool
11. Canva
12. Klaviyo or Brevo
13. Pipedrive, Close or Attio
14. Meta Ads
15. PandaDoc
16. Airtable
17. Trello, ClickUp or monday
18. Gusto
19. Fireflies
20. Resend

## D. Re-verify before building
Mailchimp Marketing, Zendesk, Sprout Social, BambooHR, Fathom auth, Ramp, ActiveCampaign URL, Jotform URL, Pipedrive URL, WhatsApp Business Tools MCP, Miro URL, Square and Make transport.

> **Section D is the medium-confidence re-verify list (note #1).** No item here is even a step-2
> seeding candidate until its auth mode, server URL, and transport have been re-read against current
> vendor docs and recorded in the canonical registry. Square and Make additionally carry the SSE
> exclusion (note #2). This list authorizes nothing.
