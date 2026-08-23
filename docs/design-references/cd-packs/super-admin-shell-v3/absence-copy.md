# Absence copy — Round 1's two unbuilt slots

Authored on the design side. CC's drafts are retired by these; lift verbatim.

Held to §13: an absence states **what is missing and why**. Never "coming soon",
"under construction", or "stay tuned" — those say nothing and promise something.
Voice is the shell's: matter-of-fact, no apology, no anticipation.

---

## Relationships

**absenceTitle** — `Drawn, not wired`

**absenceBody**

> People, Conversations, Segments and Calendar are specified and their contract is
> fixed. None of the four reads live data yet: the surfaces exist, the joins behind
> them do not. Nothing here is waiting on a decision — only on the wiring.

Why this shape: it distinguishes *unwired* from *undecided*. An operator seeing an
empty slot assumes the work is unresolved; this says the design is settled and the
seam is the only gap, so nobody re-opens a closed question.

---

## Campaigns

**absenceTitle** — `Substrate exists · one seam missing`

**absenceBody**

> Catalog and Sales sit on tables that already ship — `tenant_products`,
> `tenant_prices`, `tenant_orders` — so this slot is a wiring job rather than a
> build. One seam is genuinely absent: an order cannot name a campaign.
> `utm_campaign` lives on `analytics_events` and `referral_clicks`, never on the
> order, so send → click → order does not join. Until it does, attribution is
> recorded by hand and Sales reads without it.

Why this shape: naming the tables prevents the slot being rebuilt from scratch —
the fifth under-statement, arriving as an empty state. Naming the missing seam
prevents the opposite error: a wiring round finding `utm_campaign` on
`analytics_events`, assuming the seam exists, and hitting it at the join.

---

## The rule this settles

Absence bodies, empty-state wording, error text and rail labels are **surface**.
Where CC authors any of it to keep a round moving it is a draft pending, never a
default — and copy that ships first must not become settled design by having
shipped first. That is the same accommodation the direction-of-accommodation
ruling forbids, arriving from the other direction. CC caught this on itself and
reported it before it was found, which is why the drafts existed for one round
rather than permanently.
