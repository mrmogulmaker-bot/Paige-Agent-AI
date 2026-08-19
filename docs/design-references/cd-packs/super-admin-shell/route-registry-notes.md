# Route registry — handoff note

`paige-routes.js` is the canonical route tree for the Platform Operator shell,
authored from the shipped design rather than derived after the fact. It is loaded
by `Super Admin Shell.dc.html` and exposed as `window.PAIGE_ROUTES`.

## What it contains

**78 routes**, one per addressable surface — audited against the shell's own tab
map, so the count matches exactly: every `view:tab` pair the shell can render has
a route, and no route points at a tab that does not exist.

Each entry carries:

| field | purpose |
|---|---|
| `path` | canonical URL, e.g. `/operator/analytics/forecast` |
| `section` | first path segment, for grouping |
| `label` / `subLabel` / `title` | display strings, already written |
| `view` / `tab` | the shell's internal state keys — the URL-to-component contract |
| `group` | `fleet`, `business` or `settings` (settings routes auto-open the back menu) |
| `intent` | plain-language description Paige matches against |

Plus **6 overlay routes** with `:id` params — side chat, one listing, one tenant,
act-as, one support thread, one outbound send.

## Path convention

`/operator/<section>/<subsection>` — lowercase, hyphenated, no trailing slash.
A section's default tab has no subsection: `/operator/analytics` is the Brief,
`/operator/analytics/revenue` is the Revenue lens. Settings nests one level
deeper: `/operator/settings/setup/brand-kit`.

Rename `/operator` to whatever prefix the real app uses; nothing else depends on it.

## How the shell uses it now

- **Read** — on load and on `hashchange`, the shell resolves `location.hash`
  through `byPath()` and sets `view` / `tab`. A settings route also opens the
  back menu, so `#/operator/settings/governance/audit-log` lands correctly.
- **Write** — after every state change, `byState(view, tab)` resolves the path
  and `history.replaceState` stamps it, and the document title becomes
  `Fleet Console · Tenants · Paige Agent AI`.
- **Show** — the canonical path renders in the header beside the breadcrumb, so
  an operator can read and share the exact address of what they are looking at.

Hash routing is deliberate: it works from a static file. Swap `replaceState("#" + path)`
for real history routing and the registry is unchanged.

## How Paige uses it

```js
PAIGE_ROUTES.byPath("/operator/provisioning/history")
PAIGE_ROUTES.byState("analytics", "fc")          // → the Forecast lens
PAIGE_ROUTES.find("where do I approve a tier change")  // → governance/approvals
PAIGE_ROUTES.all()                                // → the whole tree
PAIGE_ROUTES.sections()                           // → 17 sections
```

`find()` is a deliberately simple token-overlap match against `title + intent + path`.
It is good enough for "open the marketplace submissions queue" and it should be
replaced with an embedding lookup over the same `intent` strings once her retrieval
layer exists — the strings are written to be embedded, which is why each one names
the nouns an operator would actually use.

## What Claude Code needs to decide

1. **Prefix** — `/operator` vs `/god` vs `/admin`. One find-and-replace.
2. **Auth boundary** — every route here is God-tier. Nothing in this file is
   reachable by a tenant, and the guard belongs above the router, not per route.
3. **Overlay routing** — the six `:id` overlays are currently shell state, not
   URL state. Making them addressable is a small change on our side and worth
   doing, because "send me the link to that ticket" is a real operator need.
4. **Act-as** — `/operator/fleet/act-as/:id` changes what every *other* route
   returns. Suggest carrying tenant context as a session concern rather than a
   path segment, so the same route renders scoped data without duplicating the tree.

## Divergence check

If the tree Claude Code has already built differs, the reconciliation is one
question per row: same surface, different path → take theirs, update `path` here.
Different surface → tell me, because it means the design and the router disagree
about what exists, and that is worth resolving in the design first.
