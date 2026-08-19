# What is in this project

Two tiers of the same platform, kept apart so an export is never ambiguous.

## Ship this — Platform Operator (God tier)

Everything at the project root belongs to the Super Admin shell:

| file | what it is |
|---|---|
| `Super Admin Shell.dc.html` | the whole operator shell — every surface, 17 sections, 78 tabs |
| `paige-routes.js` | canonical route tree + data classes + action kinds (loaded by the shell) |
| `platform-brain.js` | her second brain, the depth-sorted neural field on Paige › Knowledge |
| `fleet-field.js` | the tenant constellation on Fleet Console |
| `support.js` | the DC runtime — written by the tooling, never edit |

### Handoff notes, in reading order

1. `route-registry-notes.md` — the route tree, the path convention, four decisions to make
2. `paige-capability-notes.md` — how she reads, acts and uses the sandbox; build order
3. `brain-backend-notes.md` — the three feeds behind the knowledge graph
4. `trust-compass-backend-notes.md` — autonomy lanes and how a knob persists
5. `billing-backend-notes.md` — hybrid base + metered + credits, Stripe limits
6. `analytics-research-notes.md` — benchmarks per tier, and where predictive belongs

## Agency tier — not in this project

The Agency shell is **no longer here**. It lives in the project this one was
cloned from, which is where it should be maintained: it is a different product
surface with different doctrine — tenant-scoped, no fleet, no governance queue,
no act-as.

Nothing at this root references it. The export is operator-only by construction.

## The one thing that would cause confusion

Both shells have a Paige tab, a Trust Compass, a Marketplace and a Calendar, and
they are **not the same surfaces**. The operator's Trust Compass sets lanes
*across every tenant*; the agency's sets them *within one book*. Same visual
language, different authority. If a route or a query is built from the wrong
shell, the tier boundary breaks quietly rather than loudly — which is the worst
way for it to break.
