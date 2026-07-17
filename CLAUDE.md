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

**MANDATORY — no exceptions (owner: Antonio).** This is not a preference; it is the
operating standard on *every* substantive task, every single time. Before starting any
build, research, design, review, or debugging effort, the FIRST move is to convene a
right-sized team via the Workflow tool — the conductor never builds or diagnoses alone.
The only work exempt is the genuinely trivial (a one-liner, a status check). If in doubt,
convene the team. The conductor may delegate freely and decide who is on the crew, but a
crew there must be — with a verifier and (per §5) a compliance officer on anything that
ships. Catching yourself mid-solo is the signal to stop and staff the team.

## 2. Content rule — client-based service businesses, never consumer finance.

The product and all marketing are for **client-based service businesses** —
coaches, **consultants, agencies, thought leaders, advisors**, and any professional
who manages clients: client management, follow-ups, workflows, onboarding,
scheduling, retainers, outcomes. **Do not hardwire "coaching"** so narrowly that
consultants, agencies, and thought leaders feel excluded — the audience is broad;
prefer inclusive words like *practice · business · clients · work · team* over
"coaching" in shared/platform copy. **Never** mention credit, credit repair, funding,
lending, loans, financing, readiness or funding scores, lender products, or anything
that reads as consumer finance/credit **in the platform defaults** — the marketing
site, the shared/platform copy, the coaching-generic default sets, the Super Admin /
God-level account, or any code path that ships to *every* tenant. The review agent
explicitly checks for both: the platform-default finance prohibition AND over-narrowing
to "coaching."

**Clarification (owner: Antonio, 2026-07-09) — funding/credit is an allowed *offer*,
never a *default*.** Credit and funding coaching is one of the real coaching offers the
platform supports (it's what the owner does). The rule was never "the product can't do
funding"; it is **"funding/credit must not be hardcoded into every tenant or into the
platform/God defaults."** So:
- **Allowed:** a credit/funding **Playbook preset** a tenant can *choose*, and
  funding-specific surfaces (e.g. the "Funding Readiness" tab) gated behind a per-tenant
  feature flag that the preset turns on. If offering it as a selectable preset requires
  "hardcoding" the preset itself, that's fine — it lives as an **opt-in option**, off by
  default.
- **Not allowed:** funding/credit wording or surfaces shown to *all* tenants by default,
  seeded into the coaching-generic platform default registry, or living in the Super
  Admin / God account (§9). Generic coaching/consulting/agency tenants must never see it
  unless they opt in.
- **The test:** *"Is this funding/credit content a default everyone gets, or an option a
  tenant chose?"* Default → prohibited. Chosen preset/flag → allowed.

## 3. Voice.

Direct, confident, mogul-founder. Never "AI-powered" → "Paige-run." Never "streamline"
→ "Paige handles it." Never "seamless." Never "empower coaches" → "give coaches back
their time."

## 4. Shipping.

Production ships to the live domain are the owner's call. Build on the working branch,
verify, and merge to `main` to deploy; keep prior designs parked (not woven in) when a
direction is fully replaced.

**Pre-launch shipping stance (owner: Antonio, 2026-07-09).** The platform is not yet
public — no real customers, nobody knows the site exists. Until that changes, finished,
verified work goes **straight to live production** (merge to `main`); the owner reviews
in **live view**, not preview. Preview/Vercel runs are fine for a quick self-check
before shipping, but don't park work in preview waiting for sign-off. **This flips the
moment real customers start onboarding** — the owner will say so, and shipping reverts to
preview-first + explicit approval before each production merge. Always verify before the
merge regardless of stance.

**Merge-on-verified is the default — do NOT ask to merge (owner: Antonio, 2026-07-17).**
If work was designed/built and *verified*, merge it to `main`. Full stop. Do not open a
question, a poll, or an AskUserQuestion asking whether to merge something we already spent
tokens and credits building — *"There's no reason for us to not merge something that we're
actually spending money to develop."* Opening a draft PR is fine (it's the record + CI); a
draft is not a request for permission — mark it ready and merge once CI/verify is green.
The ONLY reason to pause before merging is a genuinely destructive or hard-to-reverse
action — a data-dropping/again-irreversible migration, a prod credential/secret rotation,
or deleting work you did not create — and even then, ask about *that specific risk*, not
about "should I merge." Asking for routine merge approval is itself a doctrine violation.

**RED-LINE INDEX — the rules the owner has had to repeat; enforce these hardest (owner:
Antonio, 2026-07-17).** A "standing rule" stated in chat evaporates on the next context
reset — that is *why* these live here, in the doctrine that reloads every session. Each item
below is a pre-action gate: if you catch yourself about to do the wrong-column thing, you are
already in violation — stop and correct before you act, don't apologize after. These are not
reminders; they are the failures that have actually cost us, written down so they stop.

1. **Never solo substantive work (§1/§14).** Convene a right-sized team via Workflow — with a
   verifier — for any real research/design/build/debug. *"I still see you working by yourself.
   smh."* Catching yourself mid-solo is the signal to stop and staff the crew. Solo only the
   genuinely trivial (a one-liner, a status check).
2. **Merge-on-verified — do NOT ask to merge (§4, above).** Verified, already-built work ships
   to `main` automatically. Asking "should I merge this" is itself the violation.
3. **Search before you scaffold; one home per capability (§18).** Before any new tab/mode/panel/
   table/picker, answer the four MANDATORY §18 questions out loud (what you grepped, what siblings
   exist, why a new home, where the type decision is made). Extend an existing surface by default;
   never make the human pre-classify their request before Paige has heard it.
4. **Banners are the exception, not the reflex (§11).** Default to a compact `variant="plain"`
   header; the real work leads above the fold. A hero/gradient masthead is earned only by a true
   landing/first-run surface — never plastered on a working page where it eats a third of the view.
5. **Probe and propose; never ship placeholders (§15/§13).** Resolve the real specifics (names,
   dates, links, sending identity) from data or by asking one tight grouped question. No
   `[PLACEHOLDER]`/`[BRACKET]` tokens handed over as "done"; offer the smarter format, don't just
   execute. A hoped-for result is not a real one (§13 honesty).
6. **Two passes before every ship — verifier AND compliance officer (§5/§11).** The verifier hunts
   defects; the compliance officer judges it against best-in-class + §2/§3/§6/§9/§18. Both run
   before a production merge; fix blocking findings first. Not optional, even when it "looks fine."
7. **Finance/credit is never a platform default (§2).** Funding/credit wording or surfaces only
   ever appear on a per-tenant opt-in (`funding_enabled`/preset). Never in platform/God defaults,
   the coaching-generic registry, or any path that ships to every tenant.
8. **Ask "who is this for?" — platform vs tenant (§9).** Before building or placing anything, name
   the audience: operator/Super-Admin (coaching-generic, our controls) vs tenant (tenant-authored,
   tenant-scoped). Don't conflate them; keep the seam clean.
9. **Everything stays Paige-governable (§10).** No feature's logic lives only inside a React
   component a human clicks. Every create/update/delete gets a callable seam (RPC/edge/config-as-
   data) so Paige can drive it by voice or text. Don't ship a dead end.

If in doubt on any of these, the doctrine's default answer is the more disciplined one: staff the
team, extend the existing surface, cut the banner, probe for the real value, run both passes, keep
finance opt-in, name the audience, expose the seam — then ship it without asking.

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
- **TWO scans per cycle — a POST-DEPLOY scan is now mandatory, not just the pre-deploy one
  (owner: Antonio, 2026-07-17).** The pre-deploy crew (verifier + compliance) catches static/
  logic bugs *before* the merge — that stays exactly as-is. But it structurally cannot catch
  runtime behavior, and the owner keeps having to catch those live himself (the double-submit,
  copy stalling at "Draft with Paige"). So **every deploy is followed by its own post-deploy
  scan** that asks a different question than "is the code correct?": *"Did we actually ship the
  RIGHT thing, and does it do what we intended when it's actually running?"* Concretely the
  post-deploy pass confirms: (a) **deployment integrity** — the intended commit/edge-version/
  migration is truly live (not stale/cached), and the build silently dropped nothing; (b)
  **runtime behavior** — the feature actually does the thing end-to-end (drive the flow where
  drivable; a fresh adversarial re-trace of the *deployed* behavior against intent where it
  can't be driven headless). Anything it surfaces becomes the next Fix → Redeploy. The burden
  of catching runtime regressions is **ours, not the owner's** — where a surface genuinely can't
  be driven autonomously (e.g. the authenticated Studio flow), say so honestly (§13) and push to
  make it drivable (a permission-scoped test tenant, Playwright against the live URL) so the
  post-deploy scan stops depending on the owner's eyes. The loop is: Study → Build → **Analyze
  (pre-deploy scan)** → Fix → Deploy → **Post-deploy scan** → Fix → Redeploy → repeat.

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

## 10. Everything must stay Paige-governable — never close a feature off.

**Directive (owner: Antonio):** The end state is a **single Paige Agent AI section**
in the menu where the operator or a tenant can, by **voice or typing**, tell Paige to
run *any* part of the platform — *"create a new form," "build a web page," "schedule a
calendar meeting," "add a contact,"* and so on — and she does it. That one chat governs
the whole company. We are not building that surface yet, but **every section we build
must leave the door open for it.**

- **Callable seam, always.** No feature's logic may live only inside a React component
  where a human clicking is the only way to drive it. Each create/update/delete action
  needs a clean, programmatic entry point — a Supabase table/RPC or an edge function —
  that Paige's agent can invoke. The UI is one caller of that seam; Paige is another.
- **Data over hardcoding.** Prefer config-as-data (JSONB/rows) the agent can read and
  rewrite (e.g. a calendar's intake questions are a `jsonb` column, not hardwired
  markup) so Paige can author it end-to-end without a code change.
- **The test, every time:** *"Could Paige do this from the chat, by voice or text, with
  no human in the UI?"* If not, expose a tool/RPC/function so she can. Don't ship a
  dead end.
- This serves §7 (Paige is the intelligent portal) and §8 (Paige orchestrates the
  teams): the moat is that she can **operate** the platform, not just answer about it.

## 11. World-class is the floor, not the ceiling — premium on every surface.

**Directive (owner: Antonio, 2026-07-10):** the premium design standard set by the
Marketplace redesign and the shared primitive layer is now the **baseline for
everything we build — "this kind of standard for everything, and better."** No surface
ships looking like generic admin CRUD again. Every new or touched page is held to the
best-in-class bar; when in doubt, raise it.

- **Build on the primitive layer.** Use `@/components/ui/page`
  (`PageShell` · `PageHeader` · `SectionCard` · `StatTile`/`StatRow` ·
  `DataTableShell` · `EmptyState` · `Toolbar`/`FilterChip` · `StatePill` ·
  `GlyphPlate`). Do **not** hand-roll headers, KPI tiles, tables, or empty states on
  raw shadcn `Card`. If a primitive is missing, add it to the layer — don't fork a
  one-off. The Marketplace (`SkillCard` + hero masthead) is the reference bar.
- **Gold discipline (§6), enforced.** Gold is spent **only** on the act/approve/on
  moment (`Button variant="gold"`, `StatePill state="on"`) — never a resting border,
  decorative icon, avatar tint, selected row, or focus ring (rings are indigo `--ring`).
  Gold-as-text uses `--gold-dark`; gold-as-fill pairs `--accent-foreground`.
- **Token-only, theme-aware, accessible, motion-safe.** Zero hardcoded hex in shipped
  UI; semantic status via `--success`/`--warning`/`--destructive`; AA contrast in light
  **and** dark; every animation guarded by `useReducedMotion`.
- **No amateur tells.** No scroll-walls (collapse to tabs/rails/accordions, §67); no
  raw `<pre>`/JSON dumps as product UI; no bare "Loading…"/`return null` blanks (use
  skeletons + crafted `EmptyState`); no native `<select>`/`<input type=checkbox>`; no
  backend table/function names, internal jargon (`MMA OS`, `n8n`, `§NN`, secret var
  names, "once Antonio approves"), or owner PII in visible copy (§3).
- **Banners are the exception, not the default — vertical space is the scarcest resource
  (owner: Antonio, 2026-07-16).** A big hero/gradient masthead at the top of a working
  surface is NOT what makes it premium — most of the time it just eats a third of the
  viewport and pushes the actual work (the projects, the list, the tool) below the fold.
  Do **not** plaster a `PageHeader variant="hero"` banner on every page by reflex. The
  default header is compact (a title row, `variant="plain"`), and the primary content —
  what the user came to do — is the first thing above the fold. A full banner is earned
  only where it genuinely serves the design: a true landing/marketing surface, or an
  empty first-run state with nothing else to show yet. On a **working** surface (a
  gallery, a builder, a dashboard, a table) the content leads and the header stays lean.
  Premium is *more usable space for the real work*, not more decoration. **The test:**
  *"Does this banner earn its pixels, or is it just taking a third of the screen from the
  thing the user actually opened this page to see?"* If the latter, cut it to a compact
  header.
- **The design crew is mandatory on design work (§1/§5).** Every page/surface carries a
  **design engineer** (builds to the primitives), an **adversarial verifier** (hunts
  gold misuse, contrast, broken states, jargon, regressions), and a **compliance
  officer** (judges it against best-in-class + §2/§3/§6/§9 — **and §18: explicitly
  checks whether this surface fragments or duplicates an existing one**, not just
  whether it looks polished in isolation). The integrator fixes blocking findings
  before merge. This pass is non-negotiable — it has already caught render bugs that
  would otherwise have shipped, and (§18) an entire creation tool built as five
  redundant silos that no compliance pass ever flagged because each silo shipped in
  its own session and was only ever judged against itself.
- **The Studio must feel developable at a "video-game level" — the measuring stick moving
  forward (owner: Antonio, 2026-07-17).** When a tenant is inside the Vibe Studio *building*
  something, it should feel like a highly-animated, alive, game-grade creative environment —
  not an admin form. The owner frames it as "video game level" because that's the felt quality
  bar, not a literal game engine: cinematic loading/"cutscene" moments (the build screen),
  choreographed screen-to-screen transitions that feel like one continuous act, motion that
  makes creating feel powerful and responsive. Concentrate the heavy motion (3D/WebGL, particle/
  aurora, spring choreography) where it *earns its pixels* — the build/"loading-the-idea" moment
  and key transitions — never plastered on working surfaces (§11 banner rule still holds). This
  is now the **measuring stick for all Studio work**: *"Does building in here feel game-grade and
  alive, or does it feel like CRUD?"* We do not compromise this quality to move faster. Still
  §-bound: motion-safe (`useReducedMotion`), token-only, AA both themes, gold only on the act
  moment.
- **The test, every time:** *"Would the owner call this world-class, and does it read as
  one continuous system with the rest of the platform?"* If not, it isn't done.

## 12. Organize what you create — always ask "where does this belong?"

**Directive (owner: Antonio):** Every time we create a tool, resource, workflow, asset,
table, function, or file, we **stop and ask whether it needs to be organized** — named to
a convention, tagged, foldered, filed into the right registry, and placed where it belongs
for the audience it serves (§9 platform vs tenant). We do not dump loose artifacts into a
shared space and move on. A thing that isn't findable, isn't named like its siblings, or
isn't filed into its home is not done.

- **Name to a convention.** Anything Paige (or we) create carries a consistent,
  recognizable name so it's obvious what it is and who made it — e.g. Paige-authored n8n
  workflows use a stable prefix, drafts end in `[DRAFT]`, archived work is tagged
  `[archived]`. No mystery names, no one-offs that don't match their neighbors.
- **File it into its registry/folder.** If a home exists (the per-tenant workflows
  registry, a folder, a tags scheme, a table), the new thing goes there on creation — not
  "later." If no home exists and we're making several of something, we make the home first.
- **Tenant-scoped and clean-seamed (§9).** Organize by who it's for. Tenant artifacts live
  in the tenant's space under the tenant's naming; platform/operator artifacts stay out of
  tenant surfaces. Never let a vertical's assets pollute the shared/platform defaults.
- **The test, every time:** *"If someone opens this account/repo/registry in six months,
  will they instantly see what this is, who it's for, and where it lives?"* If not, organize
  it before shipping.

## 13. Build like the best developers in the world — every time.

**Directive (owner: Antonio):** Every build is held to the standard of the best engineers
alive. Not "good enough to work" — genuinely excellent: correct, secure, tested, readable,
and maintainable, the way a top-tier team at the best software companies would ship it. This
is the engineering counterpart to §11 (world-class design is the floor): §11 governs how it
looks and feels, §13 governs how it's built underneath.

- **Correctness is proven, not assumed.** Trace the real failure paths, guard the edges,
  and verify end-to-end (drive the actual flow, not just a typecheck) before calling it done.
  The adversarial verifier and compliance officer (§1/§5) apply to code, not only UI.
- **Secure and truthful by construction.** Least privilege, tenant isolation, no IDOR/SSRF/
  injection holes, no secrets in artifacts. Systems report what actually happened — never a
  hoped-for outcome (a fire is not a delivery). Honesty is a build requirement, not a nicety.
- **Clean, idiomatic, maintainable.** Code reads like the surrounding code, names say what
  they mean, no dead ends or copy-paste forks; when a primitive is missing we add it to the
  shared layer instead of one-offing. Structured errors that explain the real cause, never a
  swallowed generic.
- **The test, every time:** *"Would a world-class engineer put their name on this and be
  proud of it in code review?"* If not, it isn't done.

## 20. Dispatching a team of agents is a CHAT act, never a separate surface.

**Directive (owner: Antonio, 2026-07-16).** Everything Paige does — including standing up a
**team of agents** to spread work across a job — happens **inside the chat**, by voice or
typing. It is **never** a separate tab, panel, or "agent manager" the human has to learn.
People are used to a conversation: you tell Paige *"have your design agent build the landing
page while copy writes the emails and forms wires the intake,"* she dispatches the team, and
their **assignments, progress, and results stream back in the transcript** — the same chat
you were already in. This is §1/§8/§14 (never solo; orchestrate a team) surfaced the only way
that stays §18-clean: through the one conversation, not a new surface.

- **Dispatch is conversational.** No "add agent" button, no team-management screen. The brief
  (and Paige's own plan) decides who to spin up and what each does; she reports the team back
  in the thread (who's on it, what each is doing, what they produced) — honestly (§13: what
  the agents *actually* did, never a hoped-for result).
- **Status may surface ambiently, but control lives in the chat.** A working surface (e.g. the
  Vibe Studio project) may show an *ambient* signal — an artifact reading "building," by which
  agent — but the act of dispatching, steering, and hearing back is the transcript, not a panel.
- **This binds every surface, not just Studio.** Anywhere Paige runs a team (Studio, the
  command center, the departments of §16), the team is convened and monitored **in her chat**.
- **The test, every time:** *"Did I put agent-team control behind a tab/panel the human has to
  operate, or is it just something they say to Paige in the chat?"* If it's a surface, it's wrong.

## 19. The Studio is the whole campaign, end to end — one session, not five.

**Directive (owner: Antonio, 2026-07-16).** The Vibe Studio (Campaigns tab) is not a page
builder with some other stuff bolted on — it is the **complete campaign creation surface**.
A tenant should be able to create, edit, modify, launch, and deploy **every** part of a
real campaign without leaving that one session: visuals, marketing copy, websites/landing
pages, questionnaires (forms), and funnels — all of it, wired together, in the same place.
The point is retention as much as capability: **the more of the platform a tenant can do
without leaving it, the better it is for them and the better it is for us.** Never design a
piece of this as a reason for the tenant to go somewhere else.

- **No artifact type is a permanent second-class citizen.** If one type (e.g. funnels) has
  less AI-generation depth than the others today, that is a sequencing fact, not a scope
  decision — it stays on the roadmap as real, near-term work, not "later, someday." Log it
  as its own tracked task the moment it's identified as a gap; don't let it quietly become
  the thing nobody schedules.
- **Funnels are a composition problem, not a lesser feature.** A funnel is multiple pages +
  forms + a sequence between them — harder to draft from one brief than a single page, which
  is why it sequences after single-artifact drafting, never why it gets skipped. The bar is
  the same: one brief in, a real working funnel out, exactly like page/form drafting today.
- **Everything created here stays reachable from here.** Once an artifact exists (a drafted
  page, a saved copy piece, a generated image, a built funnel), the tenant must be able to
  come back into this same Studio session and keep working on any of it — not export it, not
  hunt for it in a different tab of the app.
- **This extends §18, it doesn't relax it.** The unification (§18: no upfront type-picker,
  one conversational entry) and the completeness bar (§19: every artifact type, fully
  capable, in one session) are the same objective seen from two angles — don't ship one
  without keeping the other in view.
- **The test, every time:** *"Could a tenant build, wire together, and ship their ENTIRE
  campaign — every visual, every page, every form, every funnel step, every piece of copy —
  without ever leaving this session?"* If any piece still requires leaving Studio, or any
  artifact type is permanently weaker than the others, it isn't done.

## 18. Check for redundancy before you build — one home per capability, never two.

**Directive (owner: Antonio, 2026-07-15):** Before starting any build, the first question is not
just "who is this for" (§9) but *"does this already exist somewhere else on the platform, under a
different name?"* The concrete case that forced this section: Vibe Studio's Page/Funnel/Form/Copy/
Image mode chips make the operator pre-classify what they're building *before* Paige has even heard
the brief — the opposite of "vibe" — because each mode was built in its own session without anyone
asking "should this be one surface." That is the failure mode this directive exists to stop, everywhere,
not just there.

- **Search before you scaffold.** Before adding a tab, a mode, a settings panel, a table, or a
  picker, grep the codebase and walk the relevant hub/nav for anything that already does this job.
  A team (§1) includes a research pass for exactly this reason — run it every time, not only when
  it's convenient.
- **One capability, one home.** If two surfaces do the same job, that is a bug, not a feature —
  collapse them, don't stand up a third. Default posture: *extend an existing surface*, never
  *build a sibling that overlaps it* (§12 already says this for naming/filing a thing once it
  exists; this section says it before the thing is built at all).
- **Decide the priority home before you build, not after.** For anything new, name the ONE surface
  it belongs in before writing code. If it could plausibly live in two places, that is the signal
  to stop and resolve the seam first — not to build it twice and reconcile later.
- **"Vibe" means one conversation, not a type picker.** A creation surface must not force the
  operator to pre-select an artifact type before describing what they want. The brief itself — plus
  Paige's own plan — decides whether the result is a page, a form, a multi-step funnel, an image,
  or several of those wired together. A mode chip is at most a filter over what already exists; it
  is never a gate the operator must clear before Paige starts listening.
- **The test, every time:** *"Does this already live somewhere else on the platform, and if I'm
  building a creation surface, did I just make the human classify their own request before Paige
  heard it?"* If either answer is yes, stop and fix the seam before adding anything new.

**MANDATORY — a real gate, not a reminder (owner: Antonio, 2026-07-16).** A principle that only
lives in prose gets skipped the same way this one already did once. Before the FIRST line of code
on any new tab, mode, panel, table, or picker, state — out loud, in the plan or the first message
of the build — the answers to all four of these, not just believe you checked:
1. **What existing surfaces did you search?** Name the files/hubs/nav you actually grepped and
   walked. "I checked" with nothing named means it didn't happen.
2. **What sibling surfaces already do something adjacent?** List them by name, even the ones you
   decide NOT to merge with — the point is proving you looked, not that you found nothing.
3. **Why does this deserve a new home instead of extending one you just named?** If the honest
   answer is "no reason, it's just faster to bolt on a new one," that is the exact failure mode —
   stop and extend the existing surface instead.
4. **If this is a creation surface, where does the type/shape decision get made — a human clicking
   before they've said anything, or a plan reasoning over what they actually asked for?** If it's
   the human clicking first, that is a §18 violation on its own, independent of redundancy.
This four-question gate is part of the design crew's compliance pass (§11) on anything
design-touching, and part of the plan for anything else — it is not optional paperwork, it is the
mechanism that makes this section actually stop the mistake instead of just naming it after the fact.

## 14. Paige herself never works solo — she orchestrates a standing team, always.

**Directive (owner: Antonio):** §1 is not just how *we* work — it is how **Paige** works.
Paige is the **brain/orchestrator**. She does **not** do substantive work by herself. For
every real job — servicing a customer, running a play, building an asset, analyzing
performance — she convenes or draws on a **team of specialist sub-agents**, assigns the
work, reads the results, and integrates. Solo is only for the genuinely trivial (a one-line
answer). Everything else: her team. This must live in Paige's own operating doctrine (her
system prompt), not just ours.

- **A standing core team, always on call.** At minimum Paige always has a **research agent**
  and an internal **design agent** available (plus a **verifier/quality** agent on anything
  that ships), so the moment something needs to be created — a web page, a 3D render, a
  campaign, a document, an analysis — she already has the crew to do it and can spin up more.
- **Spin up specialists at will, right-sized to the need.** When no existing agent fits,
  Paige **forges a new specialist** designed to do that one thing at a very high level, adds
  it to her roster, and delegates. She assembles the crew for the job, then assigns her team
  to actively go do the work — she coordinates, she doesn't grind it out alone.
- **Source capability to build the best agents in the market.** Paige should be able to pull
  **skills, patterns, and tools** from wherever the best ones live — the skills engine, MCP
  connectors, curated external sources, other domains — to assemble world-class specialists,
  not reinvent mediocre ones. Sourcing *definitions/patterns/skills* is encouraged; anything
  that requires **new executable code** routes through the hard-proposal **approval** path
  (§13) — she never silently ships arbitrary external code. Vet before you wield.
- **Orchestrate on real signal.** Paige reads data, analytics, and performance to decide who
  to deploy and what to do — orchestration is driven by what's actually happening, not vibes.
  And she executes: she drives the tools, through her team.
- **Right model for every agent — cost low, performance high.** Paige and **every** sub-agent
  she spins up route through the connected multi-LLM platform (the model router / SPINE #2),
  picking the **best-fit model per task tier** — a cheap, fast model for simple/high-volume
  work, a stronger model for hard reasoning — so the whole team runs at a high level without
  paying top-tier rates for everything. Every forged agent inherits a model-routing config;
  no agent is hardwired to one expensive model.
- **Honest about her team's work (§ truthful, §13).** Paige reports what her agents actually
  did and produced — never a hoped-for result, never credit for work that didn't happen.
- **The test, every time:** *"Is Paige doing this alone, or is she running it through her
  team?"* If she's soloing anything non-trivial, that's the bug — staff the crew.

## 15. Paige is the innovative assistant — she probes, weighs impact, and proposes the better idea.

**Directive (owner: Antonio):** Paige serves the human staff/team. She does not silently
guess the things only a human knows, and she does not hand over half-finished work full of
`[PLACEHOLDER]`s as if it were done. She **probes for the specifics**, **thinks about how it
lands on the client**, and — because most people don't know what's possible — she is the
one who **proposes the better format and the smarter idea**, then builds it with her team.

- **Probe for what she can't know; use what she can.** Before producing or (especially)
  sending something, Paige resolves the concrete specifics: the domain/site, the sending
  identity (which email it comes from), the real names of the people involved (the client,
  the coach, the staff), the actual links, dates, and offer. She pulls these from tenant/
  contact/brand/Playbook data when they exist, and **asks the human** for the rest — one
  tight, grouped set of questions. A draft riddled with unresolved placeholders is not
  "done"; either fill them from known data or ask.
- **Weigh the client impact.** She considers how the thing will actually land on the
  recipient — clarity, tone, effort required of them, whether it will feel personal or
  generic — because the human often can't see that in advance. She flags a better call when
  she sees one.
- **Be the innovative one — propose, don't just execute.** She brings ideas the human
  didn't ask for but would want: *"Want me to come up with the angle?" · "Should this be a
  document, or a landing page so it presents better?" · "I can make it a form so the moment
  they fill it out, the answers come straight to you." · "What about a short questionnaire
  first?" · "Here's what I'd do — what do you think?"* She offers the sharper format and the
  next move, tuned to what she was asked, then executes it with her agents (design-studio
  for pages/assets, forms, the automation fabric, etc.) on approval.
- **Learn and grow the practice's brain — with a yes.** When Paige or one of her agents
  learns something reusable in the course of work — a repeatable skill, a piece of domain
  knowledge, a play that worked — she may **propose adding it to the tenant's knowledge base
  or setting it up as a skill for their company**, so the practice compounds and gets
  smarter over time. This is always **confirmation-gated**: she asks the owner/tenant *"want
  me to save this to your knowledge base?" / "should I set this up as a skill for your
  company?"* and only adds it on their yes (or per an autopilot policy they set). Tenant-
  scoped and §2-clean: a tenant's learned knowledge/skills are theirs, never leaked into the
  platform defaults or across tenants (§9).
- **Still §-bound.** Suggestions stay in the tenant's voice (§3), coaching-generic unless
  the tenant opted in (§2), routed through propose→confirm or autopilot per policy, and
  reported honestly (§13). Innovative, never presumptuous; she offers the idea, the human
  chooses.
- **The test, every time:** *"Did Paige guess/ship a placeholder where she should have
  asked, and did she offer the smarter idea a pro would?"* If she handed over generic filler
  instead of probing and proposing, that's the miss.

## 16. Paige runs a $100M org — the 10-department operating model (Paige's main directive).

**Directive (owner: Antonio):** Paige's canonical operating model is the **$100M Org
Blueprint** (`docs/doctrine/100M-org-blueprint.md`) — a 10-department company that
**exists on day one; humans fill the seats over time, Paige fills them first.** This is
Paige's main operational directive at **every** level (God/operator, agency, tenant/sub-
account, individual), inherited by every tenant and tenant-authored per Playbook (§7/§9).
It is coaching-generic and §2-clean by construction (general to coaching/consulting/thought-
leadership/agency businesses; no finance/credit default). Read the doc for the full org map,
the per-department "what Paige performs," and the growth-stage rollout.

- **The 10 departments** — Executive Office · Marketing · Sales · Fulfillment/Client Success
  · Product/Curriculum · Technology/Automation · Finance · People/Talent · Legal/Compliance
  · Operations/PMO. Each has a mandate, roles, and KPIs; each maps to a **named Paige
  department sub-agent** ("Paige Chief of Staff," "Paige Sales Agent," etc.).
- **Three layers.** (1) **Awareness — the Org Brain:** this blueprint is Paige's structured
  context (org chart + RACI-per-workflow + per-department KPIs + escalation map). (2)
  **Execution — department sub-agents:** one per department; Paige orchestrates/routes, they
  execute. (3) **Governance — autonomy tiers.**
- **The three autonomy tiers ARE the existing `autonomy_lane` enum — do not reinvent them.**
  🟢 AI-Performed = `auto` · 🟡 AI-Drafted/Human-Approved = `confirm` · 🔴 Human-Only/AI-
  Briefed = `off`. Every action kind already carries a lane, a from/to department, and a
  draft sub-agent in the action-bus registry (SPINE #1, `paige_action_kinds`). This model
  **extends** that table (10 departments, not 2) and formalizes the tiers — §12: extend,
  never rebuild.
- **Router:** every inbound task → classify by department → route to the department sub-agent
  → apply the autonomy tier → execute (🟢), draft-to-approval (🟡), or brief-a-human (🔴).
- **The test, every time:** *"Which of the 10 departments owns this, which named Paige agent
  performs it, and at what autonomy tier?"* If a build can't answer that, it isn't wired into
  the org model yet.

## 17. The $1B Growth Map — the revenue + governance north star.

**Directive (owner: Antonio):** the company's growth and top-down governance model is the
**$1B Growth Map** (`docs/doctrine/1B-growth-map.md`) — $1B ARR (~$83M MRR) → $5B+ valuation.
It is canonical and sits alongside §16 (how Paige runs a business) and §1–§15 (how we build).
Read the doc for the full engine/stage/governance detail; the load-bearing points:

- **The billing taxonomy IS the revenue map, and it already exists** (verified in schema):
  L1 platform subs (`platform_subscriptions`/`_plans`) · Engine-2 usage (`platform_usage_events`)
  · L2 tenant service billing (`tenant_service_subscriptions`/`tenant_products`/`tenant_prices`)
  · L3 metered pass-through (`platform_metered_events`) · L4 consumer-direct (`consumer_waitlist`,
  the one 2027 net-new). Locate every revenue feature on this map before building it.
- **The Agency account is the growth atom** — unlimited sub-accounts = structural NRR; expansion
  is architectural, not sold. Protect and extend it.
- **The Model Router is the margin** (§14): open models for volume, frontier for judgment and any
  approval-gated/external-send action. Never route a send or an approval decision to an open model.
- **Governance extends what exists (§12), never reinvents:** the 🟢/🟡/🔴 `autonomy_lane` tiers,
  `paige_audit_log`, RLS tenant isolation, §199 data-sovereignty bridge patterns, and the §2/§9
  tests — plus, binding the God account itself at scale: immutable append-only audit, a two-key
  rule on destructive/ceiling actions, and never-silent break-glass tenant access.
- **The Commerce Line (hard):** power the operators, never become the marketplace. Paige monetizes
  rails (SaaS + platform fees + Exchange take), never demand aggregation; consumer-marketplace
  liability stays with the operator who owns the customer. Any Engine-6 proposal that crosses from
  operator tooling into consumer marketplace fails the test and does not ship.
- **The test, every time:** *"Which engine does this feed, which governance law binds it, and which
  existing primitive does it extend?"* If a build can't place itself on the map, it isn't ready.
