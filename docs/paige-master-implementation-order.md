# Paige — Master Implementation Order

> One ordered plan across **all** open work — the new Action-Bus roadmap *and* every prior
> pending task. Two tracks run in parallel: **Track S** (security/hygiene gates that must
> close before the first real customer) and the **Main Build** (the product, spine-first).
> Pre-launch (§4) we ship straight to live, so Track S isn't blocking *today* — but it gates
> onboarding. Ordering rule: the **action bus is the foundation**; features ride it, so it
> comes first and connections/plays bolt on after.

---

## Track S — before the first real customer (security & hygiene, parallel)

Not blocking pre-launch ships, but every one of these must be green before real tenants onboard.

1. **#53 — rotate the SSN AES-256 key committed to git + re-encrypt + scrub history** — CRITICAL, do first.
2. **#108 — IDOR sweep**: caller-supplied `p_tenant_id` guard across `create_contact`, `create_pipeline_with_stages`, `create_internal_booking` (pattern the Content Studio review caught).
3. **#4 — MMA OS RLS**: enable + policy-design the 22 tables currently exposed to anon.
4. **§2/§9 finance-default gating** — **#104** (shared admin surfaces) · **#90** (funding sub-agent schema) · **#52** (strip credit/funding email templates) behind the funding preset.
5. **De-brand / exit-readiness** — **#1** (§116 migration comments) · **#2** (Lovable PII) · **#11/#21/#46** (MMA/owner → generic) · **#79** (remove Lovable).

---

## Main Build

### Phase 1 — The Spine (the crew's trio; build in this exact order)
Everything else is built on top of this.
1. **#109 — Two Departments + Action Bus** *(in progress)* — `paige_actions` table + `file`/`advance` RPCs; Owner Ops + Client Experience registries; canonical flow end-to-end.
2. **#110 — Paige Model Router (Featherless under Claude)** — cheap tier for volume, Claude for reasoning/approval. Makes the spine economical.
3. **#111 — Client Heartbeat / At-Risk Save Play** — first play riding the bus + router; the proof Paige reasons instead of waits.

### Phase 2 — Trust + Money on the spine
4. **#112 — Autonomy Policy Engine** (`auto|confirm|off` per action-kind + guardrail caps). *Folds in #92.*
5. **#113 — Billing Brain** (retainer rescue + relationship-aware dunning, Stripe/PayPal).

### Phase 3 — Connections that ride the bus
6. **#114 — Meta Lead-Gen Closed Loop** (campaign → CRM → lookalike feedback).
7. **#115 — Session-to-Action** (Zoom → two-way commitments).
8. **#116 — Gmail two-way intake** (thread match → classify → drafted reply).
9. **#118 — Paige-authored automation fabric (n8n)**. *Folds in #26.*

### Phase 4 — Paige engine depth
10. **#117 / #93 — Durable client memory + compaction** (kills the silent 20-turn drop).
11. **#95 — Agentic-reasoning UX** (visible plan/steps + per-step approve feel).
12. **#91 — Multi-round agentic tool loop** (search→then→act in one turn).
13. **#97 — Focus awareness** (Paige recognizes/auto-focuses the client in context).
14. **#94 — Multiple named chat sessions** + history switcher.
15. **#85 — Multi-model routing per tenant** (extends #110).

### Phase 5 — Platform surfaces to world-class
16. **#103 — Premium design Waves 3+** (whole admin dashboard).
17. **#101 — Your Paige: fully equip with ALL platform actions** (+ **#81** polish, **#82** command center).
18. **#67 — Scroll-wall polish standard** (accordions/tabs/popovers).

### Phase 6 — Calendar / booking completion
19. **#45** reschedule/cancel self-serve · **#47** intake questions + date-overrides + embed · **#37** appointment types + agenda/grid · **#38** host roster + team calendars · **#48** functional round-robin/collective + on-booking action-bus · **#40** live schedule view · **#35** reminders/follow-ups engine · **#34** hardening · **#43** connections sub-tab · **#33** epic close · **#51** preset automation recipes.

### Phase 7 — Communications infrastructure
20. **#63** email deliverability/branding · **#64** per-tenant comms (subdomains, Twilio, numbers) · **#52** send-transactional deploy · **#53(email-authoring)** per-tenant templates/sequences · **#62** post-signup onboarding sequence.

### Phase 8 — CRM / data depth
21. **#42** business-shaped customer profiles · **#54** business settings + custom fields + smart-lists · **#71** custom-field definitions + Paige seam · **#70** multi-tenant client identity.

### Phase 9 — Growth, verticals & new surfaces
22. **#61** landing/public copy broadening · **#49** landing 3D hero · **#66** funding Playbook preset · **#86** vibe-coding campaign studio · **#87** LMS builder · **#88** portal skins · **#60** Paige marketplace/add-ons · **#83** sales & prospecting suite · **#84 / #96 / #98** voice & telephony · **#89** owner↔client Paige memory bridge.

### Phase 10 — Platform / operator roadmap
23. **#25** tier-scoped MCP surfaces · **#27** per-tier BYO merchant · **#28/#29** fleet console depth · **#30** deeper de-credit · **#32** god-tier pipeline · **#36** brand-kit convergence · **#39** settings consolidation.

### Track B — BYO infra cutover (separate, gated workstream)
Runs on its own timeline, independent of the feature phases:
**#6** schema-drift audit (GATE) · **#37(BYO)** bootstrap schema · **#5** OAuth reconfigure · **#16** function-parity (167 fns) · **#17** Resend SMTP · **#12/#47** seeding decisions · **#9/#44** clean-rebuild seed.

---

### The rule that orders all of it
*Build the spine (Phase 1), make it economical (router), prove it (heartbeat) — then every
connection and play in Phases 2-4 bolts onto the same bus instead of being a one-off button.
Phases 5-10 are the surfaces and depth that the spine makes coherent. Track S closes before
onboarding; Track B is its own cutover.*
