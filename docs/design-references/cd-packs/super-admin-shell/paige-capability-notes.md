# How Paige calls the platform

A note on the architecture, written for Claude Code. Companion to
`paige-routes.js` and `route-registry-notes.md`.

## The mistake to avoid

A URL addresses a *surface*. It does not describe a *capability*. If Paige only
has the route tree, the only way she can act is to open a page and read it — and
an agent scraping its own UI is the failure mode that makes every "AI assistant"
demo collapse the moment the DOM changes.

So the registry now carries three layers, not one:

| layer | question it answers | who consumes it |
|---|---|---|
| **routes** | where do I send a human | the router, bookmarks, her "open X for me" |
| **data classes** | what can be read here | her retrieval layer |
| **action kinds** | what may be done here, and who approves | the action bus |

All three live on the same record, so resolving one resolves the others.

## How she reads

Every route declares `reads` — named data classes, not table names and not
selectors. `/operator/support` reads `tickets`; `/operator/analytics/forecast`
reads `metrics` and `forecasts`.

```js
PAIGE_ROUTES.capabilityAt("/operator/support")
// → { reads: [{ name: "tickets", describes: "support threads, their tier, age and draft state" }],
//     acts:  [{ name: "draft_reply", lane: "amber", … }] }
```

This matters in both directions:

- **Forward** — she needs `tickets` to answer a support question, so she calls
  the `tickets` query. She never needs to know a support page exists.
- **Backward** — `routesReading("tenants")` returns the 9 surfaces that read
  tenant data. After she writes a tenant record, that list is exactly the cache
  to invalidate and the set of open screens to refresh. Without it, every write
  either over-invalidates or leaves a stale panel.

**Recommendation:** one resolver per data class, tier-scoped at the resolver, not
at the caller. Paige asks for `tickets`; the resolver decides that a God-tier
caller sees every tenant's and an agency caller sees only their book. Then the
same question from any tier is the same call, and §9 isolation lives in one place
instead of 78.

## How she acts

Actions are named kinds carrying a lane, matching Trust Compass exactly:

- **green** — she does it, you find out afterwards (`offer_times`, `prefill_prov`, `index_document`)
- **amber** — she drafts, you approve (`draft_reply`, `repair_seam`, `retry_payment`)
- **red** — human only, she may prepare but never commit (`send_comms`, `approve_prov`, `set_autonomy`, `act_as`)

22 kinds, 8 of them red. She resolves the address from the verb rather than the
other way round:

```js
PAIGE_ROUTES.routeForAction("approve_prov")  // → /operator/provisioning
PAIGE_ROUTES.actionsByLane("red")            // → everything that needs a human, with its surface
```

**This is the important inversion.** She does not navigate and then act. She
decides to act, resolves which surface owns that action, and — if the lane
requires a human — deep-links you to the exact place with the draft already
there. The URL becomes the *handoff mechanism*, which is the only thing a URL is
genuinely good for in an agent system.

**Recommendation:** the lane on the action kind should be the *ceiling*, and the
Trust Compass setting the *actual*. A kind marked amber can never be configured
green by a tenant; a kind marked green can be tightened to amber. That way the
doctrine lives in code and the operator's preference lives in data, and no
misconfiguration can widen her authority past what was designed.

## How the sandbox fits

The sandbox is where an action is rehearsed against its real contract before it
touches anything. Same action kind, same data classes, shadow scope:

```js
PAIGE_ROUTES.dryRun("send_comms", { audience: "every tenant" })
// → { mode: "sandbox", lane: "red", at: "/operator/comms",
//     reads: ["comms_sends"], writes: false,
//     note: "Resolve against the shadow scope, return the diff, land nothing." }
```

Three things this buys, and they are the reason the sandbox is not a toy:

1. **She can answer "what would happen"** without doing it. "If I retry all four
   failed payments, what lands?" is a dry run over `retry_payment`, not a
   simulation she has to imagine.
2. **A red action can be fully prepared before a human sees it.** The operator
   opens the deep link and finds the diff already computed, so approving is
   reading rather than reconstructing.
3. **New automations get tested against the same seam they will run on.** An
   authored rule is a composition of action kinds; the sandbox runs that exact
   composition with `writes: false`. If it dry-runs clean it will run clean.

**Recommendation for the shadow scope:** a copy-on-write tenant, not a mock. She
should dry-run against real shapes and real volumes with a write barrier, because
the bugs that matter are the ones a mock cannot produce — a tenant with 47
sub-accounts, a null payment method, a 14-month-old memory row. Mocks pass; reality
is what fails.

## What to build first

In dependency order, so nothing waits on something unbuilt:

1. **The 33 data-class resolvers**, tier-scoped. Nothing else works without them,
   and they are the same queries the UI needs, so this is not extra work.
2. **The action bus with lane enforcement** — refuse a red action from a
   non-human caller at the bus, not in the UI. The UI must be free to be wrong.
3. **`dryRun` for real** — the same bus path with the write barrier on and a diff
   returned. Cheap once step 2 exists.
4. **Intent resolution** — replace `find()`'s token match with an embedding lookup
   over the same `intent` strings. They were written to be embedded.
5. **Overlay routes** — make the 6 `:id` overlays addressable, so "send me a link
   to that ticket" works. Small, and the highest-value small thing on this list.

## The one thing I would push back on

If the router ends up owning what Paige can do — if authority is derived from
which page she is "on" — the design is inverted and every new surface becomes a
new authority question. Authority belongs to the action kind and the lane.
Routes are addresses for humans. She should be able to do everything she is
allowed to do with no page open at all.
