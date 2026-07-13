# PaigeAgent AI — The $1B Growth Map

> **Status: CANONICAL DOCTRINE (owner: Antonio).** The north-star growth + governance
> map for Paige Agent AI: $1B ARR (~$83M MRR) → $5B+ valuation. This is how the
> platform is governed from the top down. It sits alongside — and is served by — the
> $100M Org Blueprint (`100M-org-blueprint.md`, how Paige runs a business) and the
> working doctrine in `/CLAUDE.md` (§1–§17). Read all three together.
>
> **Grounding note (§13, verified against prod schema 2026-07-13):** the map's core
> claim — that the revenue architecture is *already in the schema* — is true. Of the
> tables it names, these EXIST today: `platform_subscription_plans`,
> `platform_subscriptions` (Engine 1 / L1), `platform_usage_events` (Engine 2),
> `tenant_service_subscriptions` · `tenant_products` · `tenant_prices` (Engine 3 / L2),
> `platform_metered_events` (Engine 5 / L3), plus the governance spine
> `paige_action_kinds` · `paige_actions` · `paige_pending_approvals` · `paige_audit_log`
> and `tenants` · `tenant_members`. The **only** referenced table not yet built is
> `consumer_waitlist` (Engine 5 / L4 consumer-direct), which the map itself scopes to
> 2027 — so the one gap is exactly where the map says it is. Every "already in the
> schema" claim below is accurate as of this date; treat any future divergence as a
> doc-drift bug to fix, not a silent assumption.
>
> **How this binds our work (§12 extend-never-rebuild):** every engine rides the
> existing action bus; the governance layer *extends* `autonomy_lane`, `paige_audit_log`,
> RLS isolation, and the §2/§9 tests — it does not reinvent them. When building any
> feature, locate it on this map: which engine does it feed, which governance law binds
> it, and which existing primitive does it extend?

---

## The Thesis

PaigeAgent AI is not competing as "another CRM." Every competitor in the client-based service space — coaching, consulting, agencies, thought leadership, advisory — sells a client portal that is a static filing cabinet. **Paige is the client portal that reasons, suggests, and acts** — one brain facing both sides: working for the client (onboarding, answering, probing, nurturing) and for the owner (surfacing what each client needs, drafting the follow-up, flagging risk, taking the next move). People aren't hiring a chatbot — **they're hiring her entire team**: two coordinated AI departments (Owner Ops · Client Experience) filing work to each other across the action bus.

The platform is its own ecosystem by design. Platform defaults stay generic to every client-based service business; verticals live as tenant-chosen Playbook presets — chosen, never hardcoded. That single discipline is what lets one platform serve every vertical at once, and it's enforced at every layer of the stack: database, edge functions, agent tools, routes, and navigation.

**The architecture that already exists is the growth map:**
- **The account hierarchy:** God/Super Admin → Agency accounts with unlimited sub-accounts → Individual tenant accounts → tenant staff → white-labeled client portals — with tenant isolation enforced architecturally at the database layer, not by policy.
- **The billing taxonomy (four layers):** L1 tenants pay Paige · L2 tenants bill *their* clients through Paige · L3 metered pass-through · L4 consumer direct (2027).
- **The margin engine:** the Model Router — open models carry high-volume work (classification, extraction, first drafts, heartbeat scoring) at pennies; frontier models own reasoning and anything approval-gated. That routing decision is the gross-margin strategy at scale.
- **The marketplace:** Skills, Skins, and the Playbook Exchange — the network-effect layer where the catalog is made of customers.

**The valuation math:** $1B ARR (~$83.3M MRR) at a conservative 5x revenue multiple = **$5B floor**. Public SaaS companies with 120%+ net revenue retention and Rule-of-40 compliance historically command 8–12x — meaning the same $1B ARR supports **$8–12B**. This map is built so the plan works even in a compressed market, with the architecture doing the work of earning the higher multiple.

---

# PART 1 — THE FIVE REVENUE ENGINES

The billing taxonomy already in the schema *is* the revenue map. Each layer is an engine; each engine has a different buyer, a different growth loop, and a different margin profile.

### Engine 1 — L1: Platform Subscriptions (tenant → Paige) · target ~$400M ARR
The core: Individual, Agency, and Enterprise plans on `platform_subscription_plans` / `platform_subscriptions`.

| Account Type | The Buyer | The Growth Atom |
|---|---|---|
| **Individual** ($97–$297/mo) | Solo coach/consultant/advisor who needs Paige + client portals, no sub-accounts | Volume + self-serve |
| **Agency** ($497–$997/mo base + per-sub-account) | Agencies/consultancies running a **book of business** — unlimited sub-accounts, each a full tenant | **The compounding unit.** One agency logo = 10, 50, 500 sub-accounts over time. Expansion revenue is structural, not sold. |
| **Enterprise / White-Label** ($50K–$500K/yr) | Franchises, associations, multi-brand operators on `/workspace/*` under their own skin | Big logos, multi-year contracts, the moat against churn |

**Why the agency account is the whole ballgame:** it converts *sales effort into NRR*. You close the agency once; every client they onboard is a sub-account you never had to acquire. 5,000 agency accounts averaging 20 sub-accounts at blended $60/sub-account/mo ≈ **$72M ARR from expansion alone** — before the agency's own base fee.

### Engine 2 — Usage-Based AI (metered on `platform_usage_events`) · target ~$200M ARR
Action-bus executions, heartbeat monitoring, voice minutes, document/asset generation, Paige-authored automations beyond plan limits.
- **The router is the margin.** Open models (Llama/Qwen/DeepSeek-class) run the always-on tier — heartbeat scoring, classification, first drafts — at pennies; frontier models run reasoning and approval-gated sends. That's how "Paige reasons about every client on every beat" stays 80%+ gross margin instead of burning the P&L.
- Usage grows with *tenant success* — the more Paige's team performs, the more she earns. This is the engine that pushes NRR past 120%.

### Engine 3 — L2: Tenant Service Billing (tenants bill THEIR clients through Paige) · target ~$200M ARR
The quiet giant already scaffolded in `tenant_service_subscriptions` / `tenant_products` / `tenant_prices`: every tenant's retainers, program fees, and payment plans **flow through Paige's rails**.
- Revenue = platform take-rate on tenant GMV (payments margin), plus the **Billing Brain** premium: relationship-aware dunning, retainer rescue, failed-payment recovery. A single saved retainer pays the tenant's subscription many times over — *retained MRR is the number that sells Paige*, and Paige earns a slice of the money she saves.
- At 100K active tenants averaging $8K/mo client billings through the platform = ~$10B GMV/yr; a blended ~2% net take = **$200M**.

### Engine 4 — Marketplace: Skills · Skins · Playbooks · target ~$100M ARR
The Marketplace (already the design reference bar) becomes the network-effect engine:
- **Skills** — third-party and creator-built agent capabilities, sold or subscribed, 20–30% platform take
- **Skins** — white-label themes and portal designs
- **Playbooks** — the crown jewel: tenant-authored vertical operating systems (intake journeys, sequences, personas, department configs) published to the exchange. The **Playbook Exchange** is how verticals scale without the platform ever hardcoding one (§2/§9 clean by design) — the credit/funding preset, the real-estate preset, the fitness-coach preset are all *creator products*, not platform defaults. Creators earn; Paige takes rate; the catalog becomes a moat no competitor can copy because it's made of customers.

### Engine 5 — L3 + L4: Metered Pass-Through + Consumer Direct · target ~$100M ARR
- **L3 (live):** wholesale→retail margin on metered third-party services (`platform_metered_events`) — data pulls, enrichment, comms — reconciled nightly against provider invoices.
- **L4 (2027, reserved in schema as `consumer_waitlist` — the one net-new table on this map):** **consumer direct** — the end-clients sitting in every tenant's portal become Paige's own subscribers for personal-tier features. This is the hidden multiplier: every tenant acquired today seeds a consumer waitlist for tomorrow. 100K tenants × avg 40 portal clients = 4M consumers of distribution *already inside the product* before a dollar of consumer CAC is spent.

### Engine 6 — Commerce GMV & the Creator Economy (the ceiling-raiser) · +$300–500M ARR beyond the base map

The expansion thesis: Paige evolves from the platform tenants *run their business on* into the platform tenants *conduct commerce through* — Shopify's merchant-solutions playbook executed inside the client-relationship platform.

**6a. The Reseller Marketplace (creator economy, full-throttle)**
The Marketplace opens from "publish" to "sell": any creator — tenant, agency, developer, designer — builds and **resells** skins, playbooks, skills, automations, templates, and full vertical operating systems.
- **Platform take:** 20–30% on every sale and every recurring skill/playbook subscription
- **The strategic payoff is bigger than the revenue:** customers become the product team; every vertical gets built by creators (keeping platform defaults generic forever, by design); and creators who *earn* on the platform never leave — the churn-killer no feature can match
- At maturity: 25K active creators, $500M+ Exchange GMV → **~$125M ARR** in take-rate, plus creator-program fees

**6b. Commerce Rails (platform fees on tenant GMV)**
The L2 billing layer extends into full commerce: products, checkout, order management, subscriptions, invoicing — with Paige's agent teams actually *operating* the store (inventory nudges, cart recovery, dunning, fulfillment follow-ups, customer service).
- **Platform fee:** blended ~2% net take on all GMV processed (payments margin + platform fee)
- The precedent: Shopify earns roughly 3x more from merchant solutions than from subscriptions. Same shape here — subscriptions are the floor, GMV is the ceiling
- At $15–20B tenant GMV: **~$300–400M ARR** in commerce revenue

**6c. Vertical Operator Skins (the operator line)**
Creator-built vertical editions let operators run booking-and-dispatch businesses on Paige — short-term rental management, transport/fleet operations, event services, appointment-heavy practices. Paige takes the SaaS fee, a platform fee on every booking processed, **and** the Exchange take on the skin itself — fees stacked on fees.
- **The governing law — power the operators, never become the marketplace:** Paige provides the operating system to the business that owns the customer relationship. Paige does not aggregate consumer demand, underwrite trust-and-safety, or carry marketplace liability (insurance, local transport/lodging regulation). The operator owns the risk; Paige owns the rails. Any proposal that crosses from *operator tooling* into *consumer marketplace* fails the test and doesn't ship.

**The honest multiple math:** take-rate revenue values lower than SaaS subscriptions (~4–6x vs. 8–12x) because margins are thinner. Engine 6 is therefore modeled as the *ceiling-raiser*, not the core: it can push total revenue to **$1.3–1.5B+** and — on a blended multiple across the mix — supports a **$7–15B valuation range**, while the subscription + usage core keeps the premium multiple intact.

**Total: ~$1B ARR base across five engines (no engine over 40%), with Engine 6 raising the ceiling to $1.3–1.5B+.** Every engine rides the same spine — the action bus — which is why the doctrine's line holds at billion-dollar scale: *the spine is the product; the connections are the proof.*

---

# PART 2 — THE GROWTH STAGES (Tied to the Actual Roadmap)

### Stage 0 → $1M ARR: "The Spine" — *current build order, verbatim from the roadmap*
- Ship the trio: **Action Bus (#1) → Model Router (#3) → Client Heartbeat (#2).** The one screenshot that sells everything: *Paige catching a drifting client with the save already written.*
- First tenants: MMA/PME as tenant #1 (dogfood, per doctrine §4 pre-launch stance), then founding cohort of coaches/consultants/agencies from the community.
- Flip the shipping stance the day real customers onboard (preview-first + approval, per §4).
- **Only metrics:** activation, weekly active tenants, heartbeat saves delivered.

### Stage 1 → $10M ARR: "Trust + Money"
- **Autonomy Policy Engine (#4)** ships — the trust dial (auto/confirm/off per action kind, guardrail caps, voice-settable). Adoption unlock: coaches won't tolerate confirming everything, won't accept silent action.
- **Billing Brain (#5)** ships — retainer rescue becomes the revenue proof and opens Engine 3.
- Agency tier launches with sub-account billing. First 100 agencies.
- Gmail (#8), Zoom Session-to-Action (#7), durable client memory (#9) light up — the connections proving the spine.
- SOC 2 Type I. First pricing on usage events.

### Stage 2 → $100M ARR: "The Exchange"
- **Marketplace opens to creators** — skills, skins, and the Playbook Exchange. The first 50 published Playbooks define the verticals (each one §2-clean: chosen, never default).
- Meta lead-gen closed loop (#6) at scale: **cost-per-retained-client** becomes the attribution metric no static competitor can compute — and the centerpiece of Paige's own growth marketing.
- L2 billing GMV ramps; Paige-authored automation fabric (#10) makes every tenant's ops department real.
- International English markets. SOC 2 Type II + ISO 27001. Series B optionality at $500M–$1B valuation — raised for balance-sheet and M&A, not payroll.

### Stage 3 → $400M ARR: "Category Ownership"
- Enterprise/white-label motion at full scale (franchises, associations, networks).
- **Commerce rails launch (Engine 6b):** full product/checkout/order commerce on the L2 layer, with Paige's agents operating the store. Platform-fee revenue begins compounding on GMV.
- **L4 consumer direct launches (2027 per schema):** the 4M+ portal end-users convert into direct subscribers.
- Tuck-in acquisitions: vertical portals and agent-tech migrated onto the spine.
- NRR 120%+, marketplace GMV becomes a moat metric, magic number > 1.0.

### Stage 4 → $1B ARR: "The Operating System"
- Multi-engine platform fully realized: subscriptions + usage + tenant billing rails + marketplace + consumer + commerce GMV.
- **Vertical operator skins (Engine 6c) scale as creator products** — STR management, fleet/transport ops, event services — fees stacked on fees, always on the operator side of the line.
- IPO-readiness or strategic optionality — continuous data room from Stage 2, independent board, audited financials.
- **$5B floor at 5x. $8–12B at best-in-class metrics.** The doctrine already names the multiplier: *the portal is the product; the intelligence is the moat.*

---

# PART 3 — GOD-LEVEL GOVERNANCE (Built on What Exists, Extended for Scale)

The governance layer doesn't get invented — it gets **extended** from primitives already in the schema and doctrine (§12: extend, never rebuild).

## The Account Hierarchy (As Built)

```
LEVEL 0 — GOD / SUPER ADMIN            /admin/paige/*        admin.* MCP namespace
   └─ LEVEL 1 — PLATFORM STAFF          scoped admin roles
        └─ LEVEL 2 — AGENCY ACCOUNTS    unlimited sub-accounts (their book of business)
             └─ LEVEL 3 — TENANT ACCOUNTS   /admin/* · tenant.* namespace · RLS-scoped
                  └─ LEVEL 4 — TENANT STAFF/SEATS   tenant_members
                       └─ LEVEL 5 — CLIENT PORTALS   /app/* · /workspace/* · self.* namespace
                            └─ (PAIGE + HER SUB-AGENT TEAMS — governed at every level)
```

Permissions inherit downward only. Tenant isolation is **architectural** (RLS on tenant-scope + ecosystem-scope), not policy. The MCP namespaces (`admin.*` / `paige.*` / `tenant.*` / `self.*` / `bridge.*`) are the permission boundary for every agent action — the same seam §10 requires for "Paige can run anything by voice."

## The God Account's Standing Laws (from the doctrine, enforced at scale)

1. **§9 — "Who is this for?" asked on every artifact, forever.** The God account stays coaching-generic; no vertical's content ever seeds the defaults. At 100K tenants this single discipline is what keeps the platform sellable to *every* vertical instead of smelling like one founder's business.
2. **§2 — The default test:** *"Is this a default everyone gets, or an option a tenant chose?"* Default → generic. Chosen preset/flag → anything, including funding/credit. This test is the legal and brand firewall as the Playbook Exchange scales to thousands of verticals.
3. **§199 — Data sovereignty:** no two systems store the same authoritative fact; cross-ecosystem flows only through the four sanctioned patterns (webhook / pull / sync / federation) via `*-bridge` functions, every call logged to `paige_audit_log`. At scale this is the anti-entropy law — it's why tenant #40,000's integrations don't rot the platform.
4. **§10 — Paige-governable, always:** every feature keeps a callable seam (RPC/edge function). The end state — one chat where the God account or any tenant runs the entire platform by voice — is only possible if no feature ever ships as a UI dead end.
5. **The Commerce Line — power the operators, never become the marketplace.** Paige monetizes rails (SaaS + platform fees + Exchange take), never demand aggregation. Consumer-marketplace liability (trust-and-safety, insurance, lodging/transport regulation) stays with the operator who owns the customer. Every Engine 6 proposal is tested against this line before it ships.
6. **§14 — Even Paige never works solo:** every substantive job runs through her forged specialist teams with a verifier; every forged agent inherits model-routing config. Governance of the AI is governance of the *teams*, not one monolith.

## The Autonomy Governance Stack (extends `autonomy_lane` — do not reinvent)

The three tiers are already the enum: 🟢 `auto` · 🟡 `confirm` · 🔴 `off`. Governance at scale is **who may move which action kind between lanes**:

| Control | Mechanism (existing → extended) |
|---|---|
| **Platform autonomy ceiling** | God sets the max lane per action *class* platform-wide (e.g., external money movement can never exceed `confirm` regardless of tenant settings). Extends `paige_action_kinds`. |
| **Tenant autonomy dial** | Per-tenant, per-action-kind lane + guardrail caps (max $ per action, daily ceilings) — the Autonomy Policy Engine (#4), voice-settable per §10. Conservative defaults: external send + money always `confirm`. |
| **Model governance** | Router policy is config-as-data: God controls which model tiers may serve which job kinds. Hard rule already in doctrine: **no external-send or approval decision ever routes to an open model.** |
| **Autonomy graduation** | An action kind earns 🟡→🟢 per tenant only on evidence: N consecutive approved drafts with zero edits. Promotion is logged; God can freeze graduations platform-wide (the kill switch for AI autonomy). |
| **The audit spine** | `paige_audit_log` + `paige_pending_approvals` + the Glass-Box run ledger (parked roadmap item — build it; it's the trust asset that closes enterprise). Every agent action attributable: which agent, which model tier, which lane, which approval. |

## Binding the God Account Itself (what makes it $5B-grade)

Absolute capability, absolutely accounted for — these bind Level 0 and are what SOC 2 Type II auditors, enterprise security reviews, and eventual underwriters will demand:

1. **Immutable audit** — every `admin.*` action to append-only storage; no delete path, including for God
2. **Two-key rule** — tenant termination, platform kill switches, bulk data export, autonomy-ceiling changes require a second authorized approver
3. **Break-glass tenant data access** — never silent: time-boxed, reason-coded, logged, tenant-visible (post-launch)
4. **Hardware-key MFA + session recording** on Level 0/1; no shared credentials
5. **Quarterly access review** — every platform credential re-justified in writing
6. **Separation of duties** — code shippers never approve their own production access

## The God-Account Cockpit (the metrics that run the empire)

| Panel | The Numbers |
|---|---|
| **Revenue** | ARR by engine (L1/usage/L2/marketplace/L3+L4/commerce), MRR, NRR, logo + revenue churn, agency sub-account expansion rate, total platform GMV |
| **The Moat** | Action-bus volume, heartbeat saves delivered, **retained MRR rescued** (Billing Brain), cost-per-retained-client, autonomy graduation rate |
| **Marketplace** | Playbook Exchange GMV, active creators, **creator earnings paid out**, skills installed per tenant, top-selling skins/playbooks |
| **Health** | Gross margin by model tier, uptime, approval-queue latency, audit anomalies |
| **Risk** | L2 GMV exposure, dispute rate, per-tenant guardrail breaches, §2/§9 compliance flags from the review agents |

---

## The One-Page Summary

| | Target |
|---|---|
| **Revenue** | $1B ARR base: L1 subs $400M · usage $200M · L2 tenant billing $200M · marketplace $100M · L3/L4 $100M — Engine 6 (creator economy + commerce GMV) raises the ceiling to $1.3–1.5B+ |
| **Valuation** | $5B floor at 5x · $8–12B at NRR 120%+ / Rule of 40 · $7–15B blended range with Engine 6 at scale |
| **The growth atom** | The Agency account — unlimited sub-accounts = structural NRR |
| **The moat** | The two-department action bus + tenant-authored Playbooks + a creator economy where customers build the verticals and earners never churn |
| **The margin engine** | The Model Router — open models for volume, frontier models for judgment |
| **The governance** | Extend what exists: autonomy_lane tiers, paige_audit_log, RLS isolation, §199 boundaries, the §2/§9 tests — plus two-key rule and immutable audit binding the God account itself |
| **The doctrine, proven at scale** | *The spine is the product. The connections are the proof. The portal is the product; the intelligence is the moat.* |

---

*This is how we govern from the top down.*
