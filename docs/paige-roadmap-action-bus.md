# Paige — Feature Roadmap: the Action Bus era

> Saved from the feature-ideation crew (competitive · AI-orchestration · connections · growth
> lenses + synthesis). This is the north-star build order: **everything is built on top of the
> two-department action bus (#1).** Tracked as tasks; this doc is the durable rationale.
> Doctrine-bound: §2 (no finance defaults) · §3 (voice) · §9 (platform/tenant seam) ·
> §10 (Paige-governable) · §11 (world-class).

# Paige — Feature Crew Synthesis Brief

*Integrator's read across all four lenses. Opinionated by design — react to it.*

---

## The through-line

Every idea in the pool, from all four lenses, points at the same unbuilt thing: **Paige is supposed to be a team that reasons about every client on a clock and files work to itself — and right now she's a chatbot with a flat tool list.** The moat isn't any single integration; it's the spine that makes the integrations *coordinate* — a two-department action bus, a cheap always-on reasoning tier under Claude, and a trust dial that lets her act. Build the spine and every connection (ads, billing, inbox, Zoom) becomes a limb that files real work; skip it and each integration is just another button a human has to press. **The spine is the product. The connections are the proof.**

---

## The shortlist

*Deduped and merged across lenses. Ranked by impact-per-effort, best first.*

1. **Two Departments + the Action Bus** — Turn the ~12 flat subagents into two typed registries (Owner Ops · Client Experience) coordinated by a tenant-scoped `paige_actions` table with `file`/`advance` RPCs. · *The moat and the positioning made literal — "they're hiring her whole team." Nothing else on this list works without it; it's the seam every other idea files into.* · **L** · §9: action-kind registry stays coaching-generic, no funding kinds seeded as defaults.

2. **Client Heartbeat / At-Risk Save Play** *(merges competitive #1 + growth "At-Risk Save Play")* — A cron that scores every client's portal + journey state against tenant-authored thresholds and files a drafted save move to the coach's approval lane. · *This is the single clearest thing a static portal structurally cannot copy — Paige shows up between logins with the follow-up already written. It's the heartbeat that proves the spine reasons.* · **L** · §2/§9: risk taxonomy + save copy tenant-authored per Playbook, never a platform default; §3 voice on drafts.

3. **Paige Model Router (Featherless under Claude)** *(merges the three duplicate router ideas)* — Config-as-data `pickModel(job_kind, risk, tokens)`: open models (Llama/Qwen/DeepSeek) carry classify/extract/first-draft/summarize; Claude owns reasoning and anything approval-gated or side-effecting. · *The economic enabler. Per-client heartbeat monitoring and mass drafting are unaffordable on a frontier model alone — this is what lets Paige reason about every client on every beat. Quietly multiplies the ROI of #1, #5, #7.* · **M** · No flag — but hard rule: never route an external-send/approval decision to an open model; keep model names out of tenant copy (§11 no-jargon). Keep a Claude voice-polish pass on client-facing copy an open model drafted.

4. **Autonomy Policy Engine** — Per-tenant, per-action-kind dial: `auto | confirm | off`, with hard guardrail caps (max $ per invoice, daily action ceiling). Settable by voice (§10). · *§8 explicitly says "on approval OR autonomously per policy" — today autonomy is hardcoded to always-ask. This dial is the trust unlock: coaches won't adopt an agent that acts silently, and won't tolerate confirming every draft.* · **M** · §9: ship conservative defaults — external send + money always `confirm`, so no tenant inherits silent autonomy.

5. **Billing Brain — retainer rescue + relationship-aware dunning** *(merges competitive #6 + connections #17 + growth #25)* — Watch Stripe/PayPal for failed/overdue/disputed payments; file a recovery action; draft a warm brand-voiced "quick card update" (not a collections notice) tuned by relationship health from #2. · *Highest-certainty dollars on the platform — money already leaving the building, near-zero false positives. A single saved retainer pays the tenant's subscription many times over. Retained MRR is the number that sells Paige.* · **L** · §2 critical: keep all billing copy generic, no credit/funding framing in defaults; §9 creds tenant-scoped.

6. **Meta Lead-Gen Closed Loop** *(merges competitive "Revenue Loop" + connections #16 + growth win-back audience)* — Paige launches/optimizes a Meta lead-gen campaign, every lead lands as a CRM contact at a Playbook stage and fires intake on the bus; won-deal segments feed back as custom/lookalike audiences so Meta bids toward real closes; reports **cost-per-retained-client**, not cost-per-lead. · *Owning both the ad account and the ongoing relationship is the leapfrog — a static portal literally can't compute retained-revenue attribution because it never sees the relationship.* · **L** (ship the lead-in loop first; audience feedback is phase 2) · §2 ad copy/lead-form questions can't seed finance unless opted in; §9 ad accounts tenant-scoped; §3 voice sweep on creative.

7. **Session-to-Action — two-sided meeting intelligence** *(merges competitive #4 + connections #20)* — On a booked call, spin up Zoom; after, pull the summary and split it into two synchronized lists: client commitments into their portal, coach follow-ups into Owner Ops. Unmet commitments feed #2 as risk signals. · *Every competitor stops at "here's the transcript." One recording becomes a two-way contract Paige nurtures against — the portal acting on the meeting instead of storing a link.* · **L** · §9 recordings tenant-scoped; §3 voice on follow-ups; surface record consent in portal.

8. **Gmail as a two-way intake channel** — Read the coach's inbox, match threads to contacts, classify intent (question / at-risk / buying signal) on the cheap tier, draft a branded reply as a Gmail *draft* in the approval lane. · *Email is where most coach–client contact actually happens. Pulling it onto the bus turns the inbox into a Client Experience intake channel with zero new client behavior.* · **M** · §9 tokens tenant-scoped; drafts only, never autonomous send by default; §3 voice.

9. **Durable client memory + compaction** — When a thread crosses N turns, summarize the tail and extract structured facts (`preference | commitment | open_loop | milestone`) into per-contact memory; context-router loads the summary + top facts instead of raw replay. · *Today `PRIOR_TURN_LIMIT=20` silently drops everything older — Paige re-asks what she was told and can't honor a commitment from two sessions ago. For "feels like the coach's own," memory loss is the credibility killer.* · **M** · §2 fact schema coaching-generic; run existing `redactKeys()` before storing.

10. **Paige-authored automation fabric (n8n)** — Tenant describes an outcome in plain language; Paige authors, validates, and maintains the actual workflow — no node-dragging. Verifier subagent gates every publish. · *Directly serves §10 — no integration is ever a dead end. The tenant owns an automation department, not a builder tool. Also the escape hatch for any service Paige doesn't natively drive.* · **L** · §9 workflows tenant-scoped, never platform defaults; §1/§5 verifier gate mandatory.

*Parked one rung down (real, but not top-10 by leverage): Glass-Box run ledger (superb demo/trust asset, build alongside #1), Google Ads offline-conversion loop, Slack approval control-room, Playbook Exchange network effect, Next-Best-Offer upsell, Referral harvest at the win moment, Self-improving skills loop, Focus spine.*

---

## Connections to light up next

*Each integration mapped to the ONE capability that makes wiring it worth it first.*

| Integration | Wire it for → | Why this one first |
|---|---|---|
| **Featherless (multi-model)** | The Heartbeat (#2) | Makes reasoning-on-every-client affordable — the enabler under everything. Wire first. |
| **Stripe / PayPal** | Retainer Rescue (#5) | Highest-certainty dollars, near-zero false positives. Fastest revenue proof. |
| **Meta Ads / Pipeboard** | Lead-gen closed loop (#6) | Cost-per-retained-client is the attribution no competitor can compute. |
| **Gmail** | Inbox as bus intake (#8) | Turns existing email traffic into at-risk detection with zero new client behavior. |
| **Zoom** | Session-to-Action (#7) | One recording → two-way accountability the coach can't do by hand. |
| **Slack** | Mobile approval lane | Makes propose→confirm one-tap where coaches already live — pairs with the Autonomy dial (#4). |
| **n8n / Zapier** | Automation fabric (#10) | The §10 escape hatch — keeps every future connection from being a dead end. |
| **Google Ads** | Offline-conversion loop | Captures high-intent search; do *after* Meta, same attribution muscle. |

---

## If I were picking three to build next

Sized to the current verified-slice rhythm, and deliberately compounding — each makes the next cheaper and better:

1. **Two Departments + the Action Bus (#1).** The spine. Build this first or everything else is a one-off button. Ship the canonical flow end-to-end: intake-concierge detects a need → files to Owner Ops → email-composer drafts → coach's approval lane. This is the demo that proves "her whole team."

2. **Paige Model Router (#3).** Build it right behind the bus so the heartbeat and mass drafting are affordable from day one. It's invisible to the tenant but it's the difference between reasoning about every client and reasoning about a sampled few.

3. **Client Heartbeat / At-Risk Save Play (#2).** The first thing that rides the spine *and* the router — and the single most convincing proof that Paige is the portal that reasons instead of the filing cabinet that waits. It's also the on-ramp to #5 (billing) and #4 (autonomy), which come next.

That trio stands up the moat, makes it economical, and gives the owner one screenshot — Paige catching a drifting client and showing up with the save already written — that no static competitor can answer. Everything else on the shortlist bolts onto it.