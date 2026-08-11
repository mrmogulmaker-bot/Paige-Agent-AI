# Customer Portal — Owner Trilogy Taxonomy Matrix — LOCKED SPEC

**Status:** Approved by Antonio Cook 2026-08-08.
**Owner:** Product (Antonio) with Cowork.
**Build owner:** Claude Code, when Customer Portal MVP work fires.
**Doctrine anchors:** §2, §6, §7, §8, §9, §10, §16, §17, §35, §36, §38 in `CLAUDE.md`.

---

## 1. Purpose

The platform side has an Owner Trilogy — a set of pillars that differentiates Paige from every competitor (Systems Check, Business Vault, Twin Capabilities, Live Comp Analysis, Newswire, Audit-trail). This is the Customer Portal equivalent: the pillars that structure a **client's** experience inside their coach/consultant/agency's Paige-powered portal, and the taxonomy that defines **who owns what** across every stakeholder.

Without this matrix, the seam between operator / agency / tenant / sub-account / client gets muddled, and we ship a portal that leaks control across roles or leaves tenants without the authority they need over their own client experience.

---

## 2. Stakeholders — who is who

| Stakeholder | Definition | Doctrine anchor |
|---|---|---|
| **Client** | End-user of a tenant's practice — the coach's coachee, the consultant's client, the agency's account contact. NOT a paying customer of Paige — they are a customer of the tenant. | §7, §38 |
| **Tenant / Coach** | The business owner using Paige to run their practice. Sole authority over how their portal looks and behaves for their clients. | §7 tenant-authored |
| **Sub-account** | A tenant nested under an agency parent. Same portal authority as any tenant, scoped by parent. | §9 |
| **Agency** | Parent tenant that houses sub-accounts. Curates defaults and marketplace items for its sub-accounts. Cannot override an individual sub-account's tenant-authored portal choices. | §9 |
| **God / Super Admin** | Platform operator (us). Owns platform defaults, safety rails, cross-tenant policy, break-glass access. Never appears in a client's portal experience. | §9, §17 governance |

### 2.1 Platform Team vs Tenant Team (the operator/tenant Team-surface seam)

**Owner flag (Antonio, 2026-08-09; enforced by the #89 fix):** a **Platform Team** surface and a **Tenant Team** surface are DISTINCT and must never commingle. This is the §9/§51 seam expressed at the "Team" surface — the same class of leak the #89 fix closed (an operator-unscoped `admin-list-users` response bleeding non-tenant members into a tenant Team list).

| | Platform Team | Tenant Team |
|---|---|---|
| **Surface** | `/admin/platform/team` | `/admin/team` |
| **Roster** | `super_admin` / `platform_admin` only | the tenant's OWN coaches / staff |
| **Gate** | `is_platform_operator()` (§53) | tenant-scoped (`current_user_tenant_id()`) |
| **Audience (§9)** | operator (us) | tenant |
| **Who it lists** | platform operators (never by email domain — future operators won't carry `@paigeagent.ai`, §53) | tenant-authored members, scoped to the active tenant |

**Rule:** showing tenant-tier admins/coaches/clients on a Platform Team surface — or operators on a Tenant Team surface — is a §9/§53 leak. Filter platform surfaces by `role IN ('super_admin','platform_admin')`, never by identity/email; filter tenant surfaces by the active tenant's membership.

*(Placement note for the integrator: this is a stakeholder-seam clarification, not a client-portal pillar, so it lives here in §2 rather than as a row inside the §4 per-pillar matrix — the 7 pillars are client-experience surfaces and have no "Team" pillar. Fold/cross-reference from §5 cross-pillar rules if a "Team" pillar is ever added.)*

---

## 3. The Customer Portal pillars

Seven pillars structure the client-facing experience. Each pillar has a defined ownership matrix (§4 below).

| # | Pillar | What the client experiences | Why it matters |
|---|---|---|---|
| 1 | **Journey & Progress** | Where the client is in the tenant's program — milestones, next steps, wins, current phase. | Anchor of the client's identity in the portal. The reason they log in. |
| 2 | **Communications** | Messages, notifications, replies. Paige-drafted follow-ups, tenant-sent messages, system nudges. | The two-way channel between client and tenant, mediated by Paige. |
| 3 | **Documents & Deliverables** | Signed agreements, session recaps, resources, coach-produced work, downloadable assets. | The client's private library of what the tenant has delivered. |
| 4 | **Payments & Billing** | Invoices from the tenant, payment history, active subscription/retainer to the tenant. **NOT** Paige billing. | §38 money boundary — tenant is merchant of record for these transactions. |
| 5 | **Sessions & Calendar** | Booked sessions with the tenant, kickoffs, reminders, reschedules. | The transactional heartbeat of a coaching/consulting relationship. |
| 6 | **Profile & Consent** | Client's own PII, communication preferences, data-sharing consents, notification settings. | The client's own account — their data, their controls. |
| 7 | **Support & Help** | How the client reaches the tenant, how they reach Paige, self-service help. | Escape hatch when something's wrong; also the entry point to the Paige chat surface. |

---

## 4. The taxonomy matrix

For each pillar, we define who has which rights. Right categories:

- **OWN** — the source-of-truth data lives here; this stakeholder can modify.
- **CONFIG** — this stakeholder configures behavior/presentation for downstream stakeholders.
- **WRITE** — this stakeholder can write records but does not own the surface's config.
- **READ** — this stakeholder can view.
- **—** — no access / not visible.

### 4.1 Journey & Progress

| | Client | Tenant | Sub-account | Agency | God |
|---|---|---|---|---|---|
| Journey template (stages/phases) | READ | OWN | OWN | CONFIG (default) | CONFIG (platform default) |
| Client's own progress state | READ | WRITE | WRITE | — | READ (break-glass only) |
| Milestone celebrations | READ | WRITE (via Paige) | WRITE (via Paige) | — | — |

**Notes:** Agency can seed a default journey template for sub-accounts, but each sub-account can override for its own clients. God only reads via break-glass with audit-log (§17).

### 4.2 Communications

| | Client | Tenant | Sub-account | Agency | God |
|---|---|---|---|---|---|
| Messages to/from client | OWN (their side) | OWN (their side) | OWN (their side) | — | — |
| Notification templates | READ | CONFIG | CONFIG | CONFIG (default) | CONFIG (platform default) |
| Notification preferences | OWN | READ | READ | — | — |
| System nudges (Paige-generated) | READ | CONFIG (approval rules) | CONFIG (approval rules) | CONFIG (default rules) | CONFIG (safety rails) |

**Notes:** Client owns their own preferences (§36 intuitiveness — they can turn off notifications they don't want). Tenant configures templates + approval rules for Paige-generated nudges (§16 autonomy tiers). Agency sets defaults; sub-accounts override.

### 4.3 Documents & Deliverables

| | Client | Tenant | Sub-account | Agency | God |
|---|---|---|---|---|---|
| Signed agreements | READ (their own) | OWN | OWN | — | — |
| Coach-produced deliverables | READ | OWN | OWN | — | — |
| Client-uploaded documents | OWN | READ | READ | — | — |
| Document folder structure | READ | CONFIG | CONFIG | CONFIG (default) | — |
| Retention policy | READ | CONFIG (within platform limits) | CONFIG (within platform limits) | CONFIG (default) | CONFIG (platform floor) |

**Notes:** Client owns anything they upload (per §7). Tenant owns what they produce for the client. Retention policy is tenant-configurable but has a platform floor (some minimum retention for compliance/audit).

### 4.4 Payments & Billing (§38 CRITICAL)

| | Client | Tenant | Sub-account | Agency | God |
|---|---|---|---|---|---|
| Invoices to client | READ | OWN | OWN | — | — |
| Payment history | READ | READ | READ | — | — |
| Active subscription/retainer to tenant | READ | OWN | OWN | — | — |
| Payment processor (tenant's) | — | OWN (BYO-processor) | OWN (BYO-processor) | — | — |
| Money movement | — | Facilitator only via tenant's Connect account | Facilitator only | — | — |

**§38 CRITICAL:** Money in this pillar is ALWAYS client→tenant, NEVER through Paige's bank as merchant of record. Client's card charges the tenant's OWN Stripe account (direct-charge Connect). Paige may take `application_fee_amount` — that fee is Paige's L2 revenue rail. Everything else stays with the tenant.

If a build ever routes a client→tenant transaction through Paige's bank as merchant of record, it fails §38 and does not ship.

### 4.5 Sessions & Calendar

| | Client | Tenant | Sub-account | Agency | God |
|---|---|---|---|---|---|
| Booked sessions | READ (their own) | OWN | OWN | — | — |
| Availability windows | READ | CONFIG | CONFIG | — | — |
| Session types/durations | READ | CONFIG | CONFIG | CONFIG (default) | — |
| Reschedule authority | WRITE (within policy) | OWN | OWN | — | — |
| Meeting integrations (Zoom etc.) | READ (join link) | CONFIG | CONFIG | CONFIG (default) | — |

**Notes:** Client can reschedule within the tenant's policy (some tenants allow client-side reschedule, some require tenant approval). Agency can set integration defaults but individual sub-accounts override.

### 4.6 Profile & Consent

| | Client | Tenant | Sub-account | Agency | God |
|---|---|---|---|---|---|
| Client PII | OWN | READ (what tenant needs to serve them) | READ | — | READ (break-glass + audit) |
| Communication preferences | OWN | READ | READ | — | — |
| Data-sharing consents | OWN | READ | READ | — | READ |
| Notification settings | OWN | READ | READ | — | — |
| Right to export | INITIATE | FULFILL | FULFILL | — | ENABLE (platform tooling) |
| Right to deletion | INITIATE | FULFILL (subject to legal retention) | FULFILL | — | ENABLE + audit |

**Notes:** Client OWNS their own account — this is the strongest ownership pillar for the client. Tenant reads only what they need to serve the client. Client can initiate export/deletion; tenant fulfills. God provides the platform-level tooling and audit trail. GDPR/CCPA-shaped.

### 4.7 Support & Help

| | Client | Tenant | Sub-account | Agency | God |
|---|---|---|---|---|---|
| Reach the tenant | ACTION | READ (inbound) | READ | — | — |
| Reach Paige (in-portal chat) | ACTION | CONFIG (persona, scope) | CONFIG | CONFIG (default) | CONFIG (safety rails) |
| Reach platform support | ACTION (rare escalation) | — | — | — | READ (support queue) |
| Self-service help docs | READ | CONFIG (tenant-specific FAQ) | CONFIG | CONFIG (default) | CONFIG (platform floor) |

**Notes:** Client's primary "support" is the tenant. Paige is their next line (tenant-configured persona + scope per §7 tenant-authored — client's Paige feels like the tenant's Paige). Platform support is rare escalation; God sees the support queue for those.

---

## 5. Cross-pillar rules

- **§9 seam preservation** — no pillar leaks agency data into a sub-account's client experience, and no sub-account's data leaks up to the agency's clients. Agency configures defaults for its sub-accounts; sub-accounts serve their own clients privately.
- **§7 tenant-authored** — every client-facing surface uses tenant brand (logo, name, colors), not Paige brand. Bug B PR #397 fixed the last known logo leakers; this matrix formalizes the principle across all pillars.
- **§38 money boundary** — tenant→client transactions never route through Paige's bank as merchant of record.
- **§17 governance** — God/Super Admin access to any client PII goes through break-glass with append-only audit log. Two-key rule for destructive/ceiling actions.
- **§36 intuitiveness** — every pillar has a first-5-minutes-of-portal moment for the client. If a non-technical client can't figure out a pillar's basic action within 5 minutes, the pillar's UX fails and gets redesigned.
- **§10 callable seams** — every pillar's read/write/config action has a callable seam so Paige can drive it by voice or text. No pillar's logic lives only inside a React component the human clicks.

---

## 6. What this matrix does NOT decide

- **The visual design of each pillar** — that's design work (Antonio + Figma AI + Claude Code translation).
- **The autonomy tier of each Paige action** — that's decided per-action in `paige_action_kinds` (§16). This matrix defines ownership; §16 tiers define how Paige exercises write rights (auto vs draft vs briefed).
- **Feature-flag gating per tier** — a Solo tenant gets all 7 pillars; an Agency tenant gets them + agency-configuration authority; Enterprise gets whatever's custom-contracted. Feature envelopes are defined in the tier matrix, not here.
- **Onboarding sequencing** — which pillar the client sees first is an onboarding UX decision. This matrix doesn't force an order.

---

## 7. Owed downstream work

1. **RLS audit** — for every pillar's underlying tables, verify RLS policies match the ownership matrix. §32.b SET ROLE repros per row of the matrix. §39 peer-gate on the audit.
2. **Callable-seam inventory** — for every OWN/CONFIG/WRITE cell above, confirm a callable seam exists (RPC, edge function, or MCP tool) that Paige can invoke. §10 test: could Paige do this from chat? File any missing seams as build tasks.
3. **Client-facing default UX per pillar** — design work (Figma AI + Claude Code translation). Not in this spec.
4. **Break-glass workflow for God PII access** — per §17. Explicit acknowledgment + audit-log entry + reason-code required.
5. **Right-to-export flow** — per §6 of matrix (Profile & Consent). Client initiates → tenant fulfills → platform tooling packages the export. GDPR/CCPA shape.
6. **Right-to-deletion flow** — same pattern; subject to legal retention holds where applicable.
7. **Portal-level compliance surface** — where the tenant sees their consent audit, data-sharing status, retention posture across all clients. Distinct from per-client Profile & Consent.

---

## 8. Verification requirements when Customer Portal MVP ships

- **§32.b matrix walkthrough** — SET ROLE authenticated repros for every stakeholder × every pillar. Client sees only what OWN/READ allows; tenant sees only what OWN/READ/WRITE/CONFIG allows; agency sees only what CONFIG cascades permit; God sees only what break-glass + audit allow.
- **§37 producer inventory** on every pillar's read/write endpoints — 8 caller classes each.
- **§38 money-boundary test** — behavioral proof that no client→tenant transaction routes through Paige's bank. Stripe direct-charge posture verified per pillar 4.
- **§7 brand-continuity test** — client-facing surfaces use tenant brand end-to-end. Paige brand appears nowhere in the client's experience unless the tenant explicitly opted in.
- **§32.c post-deploy Playwright drive** — one drive script per pillar, executed as client role + as tenant role + as agency admin, confirming the matrix holds live.

---

## 9. Related doctrine cross-refs

- **§2** — Coaching-generic platform; no finance/credit language in platform defaults for portal pillars.
- **§6** — Brand consistency; portal feels like one continuous experience per tenant.
- **§7** — Paige is the intelligent client portal (two-way); this spec structures the two-way.
- **§8** — Paige runs a team; both departments (Owner Ops + Client Experience) act inside these pillars.
- **§9** — Tenant/operator seam; matrix formalizes it across every pillar.
- **§10** — Paige-governable; every pillar's actions have callable seams.
- **§16** — Autonomy tiers govern how Paige exercises write rights defined here.
- **§17** — $1B governance; God break-glass + audit + two-key rules bind pillar 6.
- **§35** — OS north star; the pillar structure extends cleanly to future contexts (household portal, portfolio portal).
- **§36** — Intuitiveness moat; every pillar has a first-5-minutes UX bar.
- **§38** — Money boundary; pillar 4 is the load-bearing enforcement of this rule.

---

## 10. Extension pattern for future contexts (§35 OS)

This matrix is business-context Customer Portal. Household / portfolio / other Paige-run contexts (§35 OS north star) will need their own analogous matrices — same 7-ish pillar structure adapted to context, same stakeholder ownership taxonomy. When a new context comes online, use this doc as the template.
