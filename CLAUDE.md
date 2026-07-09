# Paige Agent AI — Working Doctrine

Standing rules for how work gets done in this repo. These persist across sessions.

## 1. Always hire a team. Never a single point of failure.

**Directive (owner: Antonio):** Do not do any substantive job alone. For every real
piece of work — research, design, build, review — draft a specialist **team** of
agents, right-sized and relevant to the job, and act as the **conductor/integrator**
rather than the lone builder. This is a non-negotiable standard: *"I have never gotten
successful, rich, or made money without a team."*

- **Team by default.** Anything with real design, judgment, or scope gets a crew
  (e.g. for landing/design work: copy · forms & pop-outs · layout/symmetry ·
  color/design-system · logo/brand-mark).
- **Always include a verifier.** Every crew carries an adversarial **review agent**
  whose only job is to catch what the others missed — off-voice copy, broken forms,
  symmetry/contrast flaws, off-brand color, and any content-rule violations.
- **One integrator.** Specialists produce specs/assets/code in their lane; a single
  integrator (the main thread) assembles them into one coherent result so nothing is
  woven together sloppily.
- **Solo is only for the trivial.** A one-word tweak or a deploy check does not need a
  team — spinning up five agents to flip a boolean is theater. Everything else: team.
- Orchestrate teams via the Workflow tool (parallel specialists → verify → integrate).

## 2. Content rule — client-based service businesses, never consumer finance.

The product and all marketing are for **client-based service businesses** —
coaches, **consultants, agencies, thought leaders, advisors**, and any professional
who manages clients: client management, follow-ups, workflows, onboarding,
scheduling, retainers, outcomes. **Do not hardwire "coaching"** so narrowly that
consultants, agencies, and thought leaders feel excluded — the audience is broad;
prefer inclusive words like *practice · business · clients · work · team* over
"coaching" in shared/platform copy. **Never** mention credit, credit repair, funding,
lending, loans, financing, readiness or funding scores, lender products, or anything
that reads as consumer finance/credit — anywhere on the site, in copy, or in code.
The review agent explicitly checks for both: the finance prohibition AND
over-narrowing to "coaching."

## 3. Voice.

Direct, confident, mogul-founder. Never "AI-powered" → "Paige-run." Never "streamline"
→ "Paige handles it." Never "seamless." Never "empower coaches" → "give coaches back
their time."

## 4. Shipping.

Production ships to the live domain are the owner's call. Build on the working branch,
verify, and merge to `main` to deploy; keep prior designs parked (not woven in) when a
direction is fully replaced.

## 5. Always run a compliance / standards officer.

**Directive (owner: Antonio):** Beyond the bug-hunting verifier, every substantive
shipment also gets a **compliance/standards officer** agent that goes behind the work
and asks a different question than "is it broken?" — it asks *"is this done correctly,
efficiently, and effectively, to the standard of the best-in-class platforms in our
space, and is it fully compliant with our SOPs and quality bar?"*

- **Two distinct passes.** The **verifier** catches defects (broken logic, off-voice
  copy, content-rule violations, contrast/symmetry). The **compliance officer** judges
  *quality and standards*: brand consistency end-to-end (landing → sign-up → app),
  polish vs. top competitors, accessibility, performance, no placeholder/fake content
  shipped, SOP adherence. Both run before a production merge.
- **Take our time.** Speed is for manufacturing; we are *designing*. The compliance
  pass is where we slow down and make sure it's genuinely excellent, not just working.
- **Reports, doesn't rubber-stamp.** It returns concrete gaps ranked by severity; the
  integrator fixes blocking items before shipping and logs the rest.

## 6. Brand consistency is one continuous system.

From the landing page through the sign-up transition and into tenant/app onboarding,
the imagery, quality, copy, voice, palette (gold + indigo), logo (the shared
`PaigeMark`), and CTA style must feel like **one product** — no jarring hand-off. The
compliance officer explicitly checks this continuity on every public-facing change.

## 7. North star — Paige is the intelligent client portal (two-way).

**Directive (owner: Antonio):** Every competitor sells a client portal; they are static
filing cabinets. **Paige is the client portal that reasons, suggests, and acts.** She
operates from the client/consumer standpoint — a **hyper-personalized assistant that
feels like the coach's own**, under the coach's brand — while running **two directions
at once**:

- **For the client:** onboards, answers, probes like a domain expert, nurtures, and
  acts on their behalf.
- **For the staff/coach:** surfaces what each client needs, drafts the follow-up, flags
  at-risk, proposes and (on approval or autonomously per policy) takes the next move.

Two-way communication, two-way intelligence — **one brain facing both sides.** The
portal is the product; the intelligence is the moat. It must be **tenant-authored** so
each coach's Paige is native to *their* practice — persona, probing questions, journey,
and templates configured per tenant (the "Playbook" model), never a hardcoded vertical.
Every build decision serves this.

## 8. Paige runs a team — AI orchestration of two coordinated departments.

**Directive (owner: Antonio):** Paige is not a single agent; she is an **orchestrator**
of her own AI team. The build requires real AI orchestration on her behalf, organized
as **two coordinated teams**:

- **Owner Ops team** — works for the business owner (coach / consultant / agency):
  pipeline, follow-ups, retainers/dunning, content, campaigns, scheduling, at-risk
  triage, the daily brief.
- **Client Experience team** — works for each client: onboarding &amp; conversational
  intake, domain-expert probing, answers, nurture, and the hyper-personalized portal.

The two teams **communicate with one another and create actions amongst each other**
(the "action bus"): the Client team detects a need → files an action to the Owner team →
drafts the move → routes to the coach's approval; the Owner team sets a play → the Client
team personalizes it per client. **That cross-team coordination is the product.**

**Positioning:** people are not hiring a chatbot — *"they're hiring her entire team."*
The substrate already exists (sub-agent forge, `delegate_to_subagent`, ~12 sub-agents,
skills engine, approvals / propose→confirm); the work is formalizing it into two
departments + the action bus under Paige's orchestration, tenant-authored per Playbook.

## 9. Always separate platform (Super Admin) from tenant. Ask "who is this for?"

**Directive (owner: Antonio):** Before building or placing *anything*, answer one
question first: **is this for the primary Super Admin (the platform operator — us),
or for the tenants who run their businesses on the platform?** They are different
audiences with different needs, and conflating them is how a platform rots. This
question is non-negotiable and gets asked *every* time.

- **Platform / Super Admin (top-down, "us"):** the operator's own controls — fleet
  management, tenant provisioning, platform billing, the master brand (Paige Agent
  AI), and the clean **default sets** that ship to everyone. This layer stays
  coaching-generic; it is **never** seeded with one vertical's content (e.g. no
  credit/funding email templates in the platform default registry, no
  vertical-specific copy in the super-admin account).
- **Tenant (every coach / agency / sub-account):** each tenant authors their **own** —
  brand, voice, Playbook, email templates & sequences, automations, journeys —
  native to *their* practice, tenant-scoped, and available **platform-wide to all
  tenants**. A vertical-specific product (e.g. **Mogul Maker Academy / Project Mogul
  Enterprise**) lives as a *tenant's* configuration and may reuse archived assets as
  **its** templates — never as a platform default.
- **The test, every time:** *"Does this belong to the operator, or to a tenant?"* If
  tenant-facing, it must be tenant-authored and tenant-scoped (per Playbook), not
  hardcoded into the Super Admin. If operator-only, keep it out of tenant surfaces.
- **Keep the seam clean:** no mix-ups about who a feature, asset, or template is for.
  Archive vertical content for reuse by the tenant it belongs to; keep the platform
  default coaching-generic. This reinforces §7 (tenant-authored portal) and §8
  (per-tenant Playbook).
