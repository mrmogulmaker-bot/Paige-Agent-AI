# Trust Compass — how the knobs reach the backend

Handoff note for Claude Code · Paige Agent AI · Super Admin pack
Written 17 Aug 2026 · design side (`Super Admin Shell.dc.html`, `isCompass` branch)

## What a knob actually is

Ten departments, three lanes each. The lane is not a preference — it is a
**gate that every one of her actions passes through before it runs**.

| Lane | She may | Operator sees |
|---|---|---|
| Draft only | Compose and hold. Nothing leaves. | A draft awaiting them |
| Ask first | Compose, then execute on approval | An approval request |
| Draft and send | Execute, then report | A record of what she did |

The platform-scope compass is the **ceiling**. A tenant may lower their own
department below the platform lane; they may never raise it above. That clamp is
the whole reason this surface exists.

## The data shape

```
autonomy_lanes
  id                uuid
  scope             'platform' | 'tenant'
  tenant_id         uuid null        -- null when scope = 'platform'
  department        text             -- one of the ten, enum
  lane              smallint         -- 0 draft, 1 ask, 2 send
  set_by            uuid             -- operator seat
  set_at            timestamptz
  reason            text null        -- why, captured on commit
  previous_lane     smallint null    -- so the audit reads as a movement
```

Two rules that belong in the database, not the client:

1. **The clamp is a constraint, not a UI check.** A tenant row whose `lane`
   exceeds the platform row for the same department must be rejected at write
   time. If it can only be violated by a bug, make the bug impossible.
2. **Every write is an audit event.** `previous_lane` plus `reason` means the
   Governance log can render "Finance raised from ask-first to draft-and-send by
   Antonio, because provisioning was pre-filling 94 requests and he had edited
   three" — which is the sentence that matters six months later.

## The gate at execution time

This is the part worth getting exactly right, because it is where the knob stops
being a setting and becomes behaviour.

Every action she takes already flows through the action bus. Before dispatch:

```
resolve_lane(department, tenant_id) -> 0 | 1 | 2
  platform = lane where scope='platform' and department=$1
  tenant   = lane where scope='tenant' and tenant_id=$2 and department=$1
  return min(platform, coalesce(tenant, platform))
```

Then:

- lane 0 → write the draft, emit `action.drafted`, stop.
- lane 1 → write the draft, emit `action.awaiting_approval`, stop. Execution
  happens on a separate approval call that re-resolves the lane (because it may
  have changed since the draft was written — that matters).
- lane 2 → execute, emit `action.executed` with the full payload retained.

**Re-resolve on approval, never trust the lane captured at draft time.** If the
operator lowers a lane while a draft is sitting, the draft must not execute under
the old lane. That is a real failure mode and it is cheap to prevent.

## The class of action Antonio described

He named the case precisely: she searches the web, then builds something in the
sandbox, then spins up an agent. Those are three *different* risk profiles and
the ten-department model does not separate them, because they are all
"Operations" or all "Product". Department alone is too coarse.

My recommendation: **department × capability class**, where the effective lane is
the minimum of the two.

```
capability_lanes
  scope, tenant_id, capability, lane, set_by, set_at, reason
```

Suggested capability classes, each of which reads differently to an operator:

| Capability | Why it needs its own lane |
|---|---|
| `read_external` | Fetch a URL, run a search. Cheap, reversible, low risk. |
| `write_tenant_data` | Change something inside a tenant's book. |
| `send_outbound` | Anything a third party receives. Irreversible. |
| `spend` | Anything that costs money or moves it. |
| `build_sandbox` | Write code and run it in an isolated environment. |
| `promote_release` | Move a build toward production. |
| `spawn_agent` | Create a new specialist, or widen an existing one's scope. |
| `alter_autonomy` | Change a lane. |

```
effective_lane(department, capability, tenant_id)
  = min(department_lane, capability_lane)
```

Two consequences worth stating plainly:

- `spawn_agent` and `alter_autonomy` should be **hard-pinned at lane 0 or 1** and
  the constraint enforced in the database. An agent that can widen its own
  autonomy, or create an agent that can, is the one failure mode with no
  recovery. This is not a preference to expose on a dial.
- `build_sandbox` at lane 2 is genuinely safe *provided* sandbox isolation is
  real — which is exactly what the Sandbox surface exists to prove. Lane 2 there
  buys enormous velocity at almost no risk, and it is the setting I would
  recommend to him.

That pairing is why the design shows the Sandbox inside her tab rather than as
its own destination: the lane and the evidence that the lane is safe belong next
to each other.

## What the UI does today, and what it needs from you

Working now, client-side only:

- Click a dial cycles draft → ask → send.
- Arrow keys lower and raise; `1` `2` `3` jump to a lane directly.
- Scroll over a dial adjusts it.
- Each dial carries three lane stops you can click straight to.
- A moved dial is marked and names what it moved *from*.
- Nothing applies until **Commit**; **Revert** restores the set.
- A visible shortcut legend sits under the console.

What it needs:

```
GET  /autonomy/lanes?scope=platform
PUT  /autonomy/lanes            { department, lane, reason }
GET  /autonomy/lanes/effective?tenant=…    -- for the clamp display
GET  /autonomy/pending          -- counts per department, for the badge
```

`PUT` should accept a **batch**, because the operator commits a set, not one
dial. One commit, one audit entry with several movements inside it, so the log
reads as a decision rather than as five unrelated twiddles.

## Escalations and dependencies — the other two tabs

**Escalations** is the readout of lane 1 in action: everything she held, and why
she stopped. That table already exists as `paige_actions` with a status; the tab
only needs the query and the reason string. The valuable field is **why she
stopped** — "policy boundary, she cannot rule on this" reads very differently
from "amount over threshold", and the operator's next move differs too.

**Dependencies** is the honest map of what a lane actually rests on. A lane 2 on
Payments means nothing if the payments bridge is down. Worth joining the lane
table to Systems Check category health, so a department on draft-and-send whose
underlying seam is red renders as **degraded** rather than green. That is a
one-join change and it closes a real honesty gap: full autonomy over a broken
dependency is not autonomy.

## On a separate operator-facing keys page

Antonio raised whether shortcuts want their own page. My view: the legend on the
console is the right primary — discoverable exactly where the controls are — and
a global `?` overlay listing every shortcut on the shell is the right secondary.
A separate documentation page is a third copy that will drift out of date. If it
must exist, generate it from the same shortcut registry the overlay reads, so
there is one source and no divergence.

Worth building the registry as data now rather than later:

```
shortcuts: [ { scope: 'compass', keys: ['←','→'], does: 'lower · raise the lane' }, … ]
```

Then the console legend, the `?` overlay and any future docs page are three
renderings of one list.

## Order I would build in

1. `autonomy_lanes` + the clamp constraint + batch `PUT`. Unblocks the whole
   surface and is small.
2. The execution gate, with re-resolution on approval.
3. `capability_lanes` and the `min()` rule — this is the one that answers what
   he actually asked for.
4. Hard-pin `spawn_agent` and `alter_autonomy` in the database.
5. Join Dependencies to Systems Check health so a lane over a red seam reads
   degraded.

1 through 3 are what make the dials mean something. 4 is the one I would not
ship without.
