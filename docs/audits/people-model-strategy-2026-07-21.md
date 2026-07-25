# People Model — Strategy Draft

**For:** Antonio · **Date:** 2026-07-21 · **Purpose:** work through the Members & Roles + Contacts model together before compiling the Slice 1c handoff for Claude Code. Grounded in three research passes (`Sales team org research`, `Coaching-industry sales roles research`, `Contact lifecycle stages research` — all cited in the transcript, sources in-line below).

**Frame:** two objects with distinct audiences —
- **Members & Roles** = people who *work FOR* the practice (staff)
- **Contacts** = people the practice *works FOR* (external — leads, clients, partners, alumni)

Pipeline is a third top-level per your D1 revision — a view of Contacts in the sales motion. Not restructured here.

---

## 1. Members & Roles — proposed model

### Team-grouped structure

Six teams (grouped as sections in the UI) with roles per team. Grouped chips instead of the flat 8-role list currently on the platform.

#### **Sales** (revenue-generating)
- **Appointment Setter** *(aka SDR — coaching industry uses "Setter")* — books qualified calls. Runs DM/phone motion on warm inbound. **Comp pattern to track:** per-booked-call ($20–75), per-qualified-show (~$50), sometimes a per-closed-deal spiff (2–5%). Typically 100% commission or low base. Metrics: bookings/day, show rate, qualified rate.
- **Closer** *(aka AE — coaching industry uses "Closer")* — runs the 30–60 min sales Zoom, collects cash on-call. **Comp pattern:** 10–20% of cash collected (10–13% typical). Metrics: close rate on qualified shows, avg deal size, cash-collected.
- **Sales Rep** — generalist seller for orgs that don't split setter/closer (retained as a role for tenants who want a single-seat sales function).
- **Sales Manager** — supervises setter/closer pod. Added when the sales team hits ~5+ people.
- **Sales Director / VP Sales** — leadership tier. Added at 10+ team.

#### **Delivery** (the actual coaching/consulting/agency work)
- **Head Coach / Lead Coach** — curriculum owner, marquee weekly session. Often the founder in early stages.
- **Group Coach / Fulfillment Coach** — weekly group calls, hot-seat coaching. **Comp:** per-session (Tony Robbins model = $30/half-session; BetterUp = ~$39/hr).
- **Success Coach / Account Manager** — post-sale relationship, at-risk intervention, upsell to next tier. This is the direct closer-handoff. **Comp:** base + retention/upsell commission.
- **Content / Curriculum Owner** — modules, SOPs, course platform. Salaried, no commission.

#### **Operations** (keep the business running)
- **Admin** — general workspace admin, user management, settings
- **Ops Manager / Integrator** — scorecards, hiring, systems (EOS Integrator pattern common)
- **Finance / Bookkeeper** — invoicing, payouts, financial ops

#### **Support** (help existing clients)
- **CS Rep / Support Rep** — inbound support tickets, client-facing help
- **Community Manager** — Skool/Circle/FB group ops (for group programs)

#### **Marketing / Growth** (drive top-of-funnel)
- **Media Buyer / Ads Lead** — paid acquisition (Meta/Google/YouTube)
- **Content Lead / Editor** — brand engine (podcast, YouTube, social)

#### **Leadership & Access**
- **Owner** — the founder / primary account holder
- **Viewer** — read-only observer (advisors, contractors with view-only access)

#### **Vertical-specific** (Playbook-gated, NOT shown by default)
- **Broker** — funding-practice only, visible when Funding & Capital-Raising Playbook opted-in (§2)
- *(Other verticals get their own gated roles as Playbooks ship — e.g., real estate broker, insurance producer, etc.)*

### One person, multiple roles
A person can hold multiple roles simultaneously (Antonio today = Owner + Admin + Coach + Client). The role assignments are additive tags, not exclusive. Team grouping is derived from roles ("if any role is in Sales, show under Sales team").

### Total: ~17 roles across 6 teams + vertical gating
Rich enough to model a mature 20-person coaching business. Grouped enough to feel manageable. Matches how mature ops orgs think.

---

## 2. Contacts — proposed model (two-axis)

Every Contact has TWO independent classification fields, plus supporting metadata.

### Axis 1 — Lifecycle Stage (funnel progression; forward-only by default)

Progression through the buyer's journey. Follows HubSpot's clean model, condensed for coaching:

| Stage | Definition | Typical entry trigger |
|---|---|---|
| **Subscriber** | Opted in for content (newsletter, follow). Not a lead. | Newsletter form fill, social follow. |
| **Lead** | Showed interest, not yet qualified. | Ebook/webinar/discovery form fill, DM inbound. |
| **Qualified Lead** | Passed qualification (setter or self-qualification). Sales-ready. | Setter marks qualified, or explicit intent + fit signals cross threshold. |
| **Prospect** | In active sales conversation. Deal record exists. | Closer takes the call; deal moves past initial pipeline stage. |
| **Client** | Closed deal, active engagement. | Deal → Closed Won. Automatic. |
| **Alumni** | Completed engagement, no longer active. Not churned — graduated. | Program end + no re-enrollment. |
| **Not a fit** | Explicit disqualification. Distinct from Cold — this is a "no." | Manual or automatic (failed qualification bar). |
| **Evangelist / Referral Partner** | Active advocate — refers others. May be current or past client. | Manual (based on referrals) or automatic (NPS + referral activity). |

Backward moves allowed with a documented reason ("Client → Prospect" because engagement lapsed and they're being re-sold on next tier). Default is forward-only to protect funnel reporting.

### Axis 2 — Temperature (engagement heat; changes freely; auto-classified)

Independent of Lifecycle Stage. A Client can be Hot (actively engaged) or Cold (stagnant, at-risk). A Lead can be Hot (just booked a call) or Cold (form fill 90 days ago, nothing since).

| Temperature | Definition | Auto-classification signals |
|---|---|---|
| **Hot** | Recent explicit engagement + intent | Booked call, pricing/checkout visit, reply within 7 days, active conversation |
| **Warm** | Engaged in last 14–30 days, no immediate intent signal | Opens + clicks emails, portal logins, DM replies |
| **Cold** | No engagement in 30+ days, or never contacted | Time-decay from Warm, or entered as Cold |

Manual override always allowed. Temperature updates fire in real-time on engagement events.

### Independent supporting fields (multi-select, not axis)

- **Contact Type** (multi-select) — allows one person to hold multiple relationships: Client · Lead · Vendor · Partner · Referral Source · Employee (staff who is also a client) · Former Employee. This is the "strategic partner" flag you mentioned — someone can be both a Client AND a Partner without shoehorning it into Lifecycle.
- **Source** (Original Source) — where they came from: Organic, Paid Ads, Partner Referral, Event, Direct, Inbound DM, etc. Captured on entry; never changes.
- **Owner** — assigned staff member from Members & Roles.
- **Tags** (freeform) — for tenant-authored categorization (e.g., "VIP", "Interested in Level 2", "Prefers WhatsApp").

---

## 3. Auto-classification rules (behavioral segmentation)

Paige runs these automatically per §14 (Paige orchestrates, doesn't wait for humans). Every rule is override-able.

### Temperature transitions (auto-fire)

- **→ Hot:** booked call · pricing page visit · checkout started · reply to any outreach within 7d · explicit intent form ("I want to talk")
- **→ Warm:** email open + click (not just open) · portal login · DM reply · content download · re-engaged after 30d silence
- **→ Cold:** no engagement in 30d (Warm → Cold) · form fill without follow-up in 60d · bounce/unsubscribe

### Lifecycle transitions (auto-fire, gated by explicit signals)

- **Subscriber → Lead:** any form fill beyond newsletter (webinar/ebook/discovery)
- **Lead → Qualified Lead:** setter marks qualified · OR intent + fit score crosses threshold · OR books discovery call
- **Qualified Lead → Prospect:** deal record created (closer takes the call, deal moves to first pipeline stage)
- **Prospect → Client:** deal → Closed Won (automatic on payment)
- **Client → Alumni:** program end + no re-enrollment in 30d
- **Any stage → Not a fit:** manual only (explicit disqualification with reason)
- **Client → Evangelist:** manual, or high NPS + referral activity

### Downgrade rules (with notification)

- **Client at Cold temp for 30d:** auto-flag "At Risk" (feeds "Needs You Today" on Dashboard); notify Owner + Success Coach
- **Client at Cold temp for 60d + no meeting scheduled:** flag "High Churn Risk"
- **Lead at Cold temp for 90d:** archive to "Dormant Leads" view (still accessible, out of default filters)

---

## 4. Role ↔ Stage interaction map

Which team members work which contact stages:

| Stage | Primary owner | Secondary |
|---|---|---|
| Subscriber | Marketing (Content Lead) | — |
| Lead | Appointment Setter | Ops / Media Buyer |
| Qualified Lead | Appointment Setter → Closer handoff | Success Coach observes |
| Prospect | Closer | Success Coach observes |
| Client | Success Coach / Account Manager | Head Coach + Group Coach on delivery |
| Alumni | Success Coach (retention outreach) | Community Manager (alumni community) |
| Evangelist | Success Coach | Marketing (case study, referral incentive) |

Everyone in Ops / Admin / Owner sees the whole board. Viewer role sees read-only.

This map drives the default views on the Contacts surface:
- **Setter view** = Lead + Qualified Lead, sorted by Temperature (work Hot first)
- **Closer view** = Prospect, sorted by deal age
- **Success Coach view** = Client, sorted by At-Risk / Cold flag
- **Owner view** = the whole thing

---

## 5. §2 hygiene — universal vs. Playbook-gated

**Universal defaults (all tenants):**
- All 6 team categories (Sales · Delivery · Operations · Support · Marketing · Leadership)
- All roles except Broker
- All Lifecycle stages
- All Temperature values
- All Contact Types

**Playbook-gated (opted-in only):**
- **Broker** role → visible only if Funding & Capital-Raising Playbook opted-in
- **"Funding Goal"** field on Contact record → same gate
- Any future vertical adds the same way — new roles/fields/pipeline stages ship as opt-in Playbook additions, never as platform defaults

---

## 6. What Paige does with this model

Once the two-axis model is live, Paige (per §14 crew doctrine) can:
- Surface "Needs you today" on Dashboard by scanning at-risk Clients + Hot Qualified Leads + stale Prospects
- Draft outreach in the right voice per stage + temperature (a Cold Lead gets different copy than a Warm Client at risk)
- Route booked calls to the right Closer per assignment logic
- Move contacts between stages based on activity + notify the right owner
- Feed Success Coaches a daily at-risk digest
- Give Sales Managers a setter/closer performance rollup (bookings/day, close rate, cash collected) — this is the comp-tracking data
- Give Owner a "who's about to churn" scan every morning

Paige's team (per §16 10-department model) maps roughly:
- **Owner Ops team** = the human Ops + Sales Manager + Owner surfaces
- **Client Experience team** = the human Success Coach + Group Coach + Community Manager surfaces
- Paige's departments do the drafting/scoring/routing; humans do the delivery + close

---

## 7. Discussion questions for us to walk through

Before I compile the Slice 1c handoff, these are the choices worth talking through explicitly:

**Q-A. Vocabulary primary — coaching or SaaS?**
Setter/Closer/Success Coach as primary (coaching-industry) OR SDR/AE/CSM as primary (SaaS-industry)? I recommend **coaching-industry primary** since it matches your audience's daily vocabulary, with SaaS terms as aliases in tooltips/settings for users who prefer them.

**Q-B. Do we ship comp tracking now, or defer?**
The setter/closer comp model is a real product surface (per-booked-call payouts, per-cash-collected commissions). Do we ship comp tracking with the People model, or defer to a "Sales Operations" slice later? I recommend **defer** — People model + Contact lifecycle is already substantial; comp tracking is its own product with its own edge cases (disputes, clawbacks, payout timing).

**Q-C. Group Coach + Head Coach separation — do we need it in v1?**
The distinction is real (curriculum owner vs. session-runner), but small tenants (<$1M) collapse them. Do we ship both roles now, or just "Coach" and let the distinction emerge? I recommend **ship both** — the industry distinction is well-known, adding "Head" vs. "Group" as role variants is cheap, and it prevents renaming later.

**Q-D. "Not a fit" as a Lifecycle stage — or a Contact Type?**
Currently proposed as a Lifecycle stage. Alternative: keep it as a Type/tag + a "Disqualified" boolean, so their Lifecycle history stays intact ("this person was a Qualified Lead who we disqualified" is richer than "this person is at Not-a-fit"). I recommend **make it a Disqualified flag + reason**, keep Lifecycle stage as the last real progression. Aligns with Salesforce Lead → Closed - Not Converted pattern.

**Q-E. Do we ship a native Lead Score in v1, or defer?**
Auto-classification rules can run on either explicit signals ("booked call → Hot") OR a numeric score ("engagement points cross 40 → Warm; cross 80 → Hot"). Explicit signals are simpler to ship and reason about. I recommend **explicit signals in v1**, add scoring in v2 once we have real behavioral data to calibrate against.

**Q-F. Where does the Sales Team see "who's next to call"?**
Setters/Closers live in a call queue view — "here's the next 10 people you should reach out to right now." That's a distinct UX from a Contacts grid. Ships as a Contacts view mode (e.g., "Call Queue") OR as a distinct top-nav (e.g., "Today's Queue"). I recommend **Contacts view mode** — same object, different view, matches Pipedrive/Close's opinionated call-list pattern.

**Q-G. Do we auto-restrict what each role can DO, or just what they can SEE?**
Permissions layer — a Setter probably shouldn't be able to close a deal or view refund history. Two options: **(a) view-only role differences in v1** (everyone can do everything but sees only their own view), or **(b) full permission matrix per role in v1** (Setter can only advance to Qualified Lead, Closer can only advance to Client, etc.). I recommend **(a) for v1, (b) for v2** — permissions are hard to get right and easy to over-engineer; ship the views first, add hard permissions after user feedback.

**Q-H. Anything from GHL / Pipedrive / HubSpot I'm missing?**
Things I considered but didn't include: Deal Products (line items on a deal — useful for tenants selling multiple packages), Custom Objects (extensible schema for vertical needs), MEDDIC/BANT structured qualification fields, Approval Workflows, Deal Rooms. All are real features some CRMs have. I don't think any are v1 essential, but flag if you disagree.

---

## 8. What's OUT of scope for this design

Explicitly:
- **Compensation tracking** (Q-B — defer)
- **Full permission matrix** (Q-G — defer, ship view-only in v1)
- **Real Communications inbox** — already scoped as separate workstream (audit §7.6 + Voice Layer)
- **Deal Rooms / stakeholder collaboration** — future consideration
- **Predictive scoring / AI lead scoring** — v2 once we have data
- **Custom objects / extensible schema** — future consideration; ship the coaching-vertical-optimized schema first
- **Territory management / lead routing rules beyond round-robin** — future consideration
- **Integrations with external CRMs (HubSpot/Salesforce sync)** — separate integration workstream

---

## 9. Recommended next steps

1. **Work through Q-A through Q-H together** — your answers shape the final model
2. **Once locked, I compile the Slice 1c handoff** — nav restructure + People model (Members & Roles refactor + Contacts two-axis + auto-classification rules)
3. **Handoff to Claude Code** — same crew discipline (§18 grounding + §1 crew + adversarial verifier + compliance officer + integrator)
4. **Post-1c queue** unchanged: Communications workstream (Conversations + Voice), Slice 1d (Legal + Affiliates + Usage Analytics + Cmd-K), follow-on audits (client portal, mobile, Coach lens, Super Admin)

**Scope reality check:** with People model added, Slice 1c is genuinely bigger. It may naturally split into two PRs during Claude Code's execution (nav restructure first, then People model refactor). That's fine — let Claude Code make the tactical scope call, we just design it right.
