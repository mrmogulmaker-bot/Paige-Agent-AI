# The Second Brain — making it live

Handoff note for Claude Code · Paige Agent AI · Super Admin pack
Written 17 Aug 2026 · design side (`platform-brain.js`)

## What the visual is claiming

The Knowledge panel is not decoration. Every element on it asserts something
factual about the platform, and the render is only honest if each assertion is
backed by a real number:

| What you see | What it claims |
|---|---|
| A mote | One indexed document exists |
| Mote clustering | That document belongs to that domain |
| A fibre between two motes | Those two documents are semantically near each other |
| A hub | A knowledge domain, sized by how much it holds |
| A hub's colour | Which domain |
| 13 deep nuclei | 13 specialist sub-agents she can dispatch |
| The gold core | The reasoning tier where every query resolves |
| A spike leaving a mote | A retrieval actually happened against that document |
| The spike's path | mote → hub → core, i.e. document → domain → answer |
| Burst frequency | Query volume in that moment |
| A hub blooming | That domain is being queried hardest right now |
| Refractory blue wake | That path just fired and is cooling |
| Total mass growing | The corpus is growing |

**The design position: none of this should be a loop.** The loop is a stand-in
for a feed that does not exist yet. Once the feed exists, the animation stops
being an animation and becomes a readout.

## The minimum to make it live

Three things, in this order. Each one is independently shippable and each one
replaces a specific piece of fiction.

### 1. Corpus snapshot — replaces the hardcoded domain list

One query, cached, refreshed on a slow interval (60s is plenty). This is what
determines the *shape* of the brain.

```
GET /brain/corpus
{
  "generated_at": "2026-08-17T11:04:02Z",
  "domains": [
    { "id": "doctrine", "name": "Platform doctrine", "docs": 212,
      "chunks": 4180, "last_indexed": "2026-08-17T07:12:00Z", "color": "#E7C97A" },
    ...
  ],
  "specialists": 13,
  "total_docs": 3850,
  "total_chunks": 61200
}
```

Notes for CC:
- `docs` drives hub size and mote allocation. The render divides a mote budget
  across domains proportionally, so this alone makes the mass grow as the
  corpus grows — the thing Antonio asked for.
- `chunks` matters more than `docs` for honesty: a 200-page manual is not one
  unit of knowledge. Consider driving mote count from chunks and label text
  from docs.
- `color` should be assigned server-side and stable per domain, so a domain
  keeps its colour across sessions and across operators.
- `last_indexed` lets the panel show a domain as **stale** rather than green —
  §13 applies here exactly as it does on Systems Check. A domain that has not
  been indexed does not get to look healthy.

### 2. Retrieval events — replaces the random spike generator

This is the one that turns the loop into a readout. Every time she answers
anything, retrieval happened. Emit it.

```
// one event per retrieval hit, not per query
{
  "t": "2026-08-17T11:04:07.412Z",
  "domain_id": "tenant_records",
  "doc_id": "uuid",
  "score": 0.87,
  "query_id": "uuid",
  "specialist": "client_success",   // null if she answered directly
  "tier": "reasoning",
  "tenant_scope": null              // null = platform scope; see §9 note below
}
```

Transport: **Supabase Realtime on a broadcast channel**, not a table read. The
panel does not need history — it needs the last few seconds. A broadcast channel
costs nothing at rest and needs no polling.

```
channel: brain:retrievals
```

Render mapping, so CC knows what the shape has to support:
- One event → one spike spawned at a mote belonging to `domain_id`.
- Several events sharing a `query_id` → one burst. This is what makes frequency
  encode real load rather than looking decorative.
- `specialist` non-null → also pulse that nucleus, so dispatch is visible.
- `score` can drive spike brightness: a weak match is a dim spike. Honest, and
  it makes a badly-tuned index visually obvious.

**Volume guard.** At real scale this could be thousands of events a second. Do
not send them all. Aggregate server-side into a 250ms bucket:

```
{ "t": "...", "window_ms": 250,
  "by_domain": { "tenant_records": 14, "support_corpus": 3 },
  "by_specialist": { "client_success": 2 },
  "queries": 6 }
```

The panel then spawns a representative sample — say up to 12 spikes per bucket —
weighted by the counts. The *proportions* stay true even when the absolute
volume is far beyond what 60fps could draw. That is the honest way to do it:
never claim to draw every event, do claim the mix is real.

### 3. Semantic adjacency — replaces the nearest-neighbour fake

Right now fibres are drawn between motes that happen to be near each other in
the randomly-generated 3D positions. That is the least honest part of the whole
render, because it looks like it means something and it does not.

The real version: the fibres should reflect **embedding proximity**. You already
have `voyage-3` vectors for every chunk.

```
GET /brain/adjacency?domain=doctrine&limit=400
{ "edges": [ ["doc_a","doc_b",0.91], ["doc_a","doc_c",0.88], ... ] }
```

Cheapest workable approach: precompute per-domain, offline, on a schedule. For
each document take its top 3–4 neighbours above a similarity floor. Store as a
materialised view, refresh nightly or on index change. The panel does not need
it live — adjacency changes slowly.

Then the layout should be driven by the vectors rather than random sampling:
project the embedding space down to 3D (UMAP or PCA — PCA is cheap and
deterministic, which matters because the operator should see the *same* brain
each morning) and constrain the result inside the anatomical envelope the render
already defines. At that point the clusters are real clusters, and two documents
sitting near each other on screen genuinely are near each other in meaning.

That is the thing worth building. It stops being a diagram of a brain and starts
being a picture of what she knows.

## Growth over time — the part Antonio specifically asked for

The corpus snapshot gives growth for free, but only in mass. To make *capability*
growth visible, add a second dimension:

```
"capabilities": [
  { "id": "automations", "docs": 41, "added": "2026-08-14", "state": "live" },
  { "id": "governance",  "docs": 320, "added": "2026-03-02", "state": "live" },
  { "id": "investor",    "docs": 24,  "added": "2026-08-16", "state": "new" }
]
```

Render intent: a newly added capability arrives as a **new region** that grows
into the mass over its first days, rather than appearing at full size. A
`state: "new"` domain can render with a brighter rim for its first week. The
operator then sees the brain visibly gaining a lobe when a surface ships — which
is exactly the feeling Antonio described.

Worth storing a weekly snapshot of `total_chunks` per domain, so the panel can
show a growth curve on demand. Cheap table, one row per domain per week.

## §9 — the isolation problem, stated plainly

This is the part I would not ship without a ruling, because it is the one place
the visual could leak.

The Super Admin brain shows **platform-scope knowledge only**: doctrine, the
skills library, the integration surface, cross-tenant *meta*-patterns, the
support corpus in aggregate. It must never render a mote that represents one
tenant's document.

But retrieval events are the problem. If she answers a question about a tenant,
retrieval hit that tenant's corpus. Two honest options:

1. **Filter at the emitter.** Only emit events where `tenant_scope` is null.
   The panel then shows platform reasoning only, and undercounts real volume.
2. **Emit with scope, render as anonymous.** Tenant-scoped events pulse a
   generic "tenant records" hub with no document identity attached. Volume stays
   true; identity never crosses.

My recommendation is (2), with the constraint that a tenant-scoped event carries
**no `doc_id` and no tenant id** — only the domain and the count. The panel
cannot leak what it was never sent. That is enforceable at the emitter rather
than trusted in the client, which is the right side of that line.

The same brain primitive at tenant scope is a straight scope swap: their
domains, their documents, their retrievals. Nothing about the render changes.

## What this costs

- Corpus snapshot: one cached query per minute. Negligible.
- Aggregated retrieval buckets: 4 broadcast messages a second, each a few
  hundred bytes. Negligible.
- Adjacency: the only real cost, and it is offline and scheduled.
- Client: already written and running at 40fps on an interval clock. It reads
  whatever it is handed; nothing about the render needs to change to go live.

## Honest fallbacks — what the panel does before any of this exists

Stated so nobody has to guess, and so the design never lies while waiting:

- **No corpus feed** → the panel says so, in the layer tiles. It does not
  invent domains.
- **Corpus but no retrieval feed** → the mass renders true and *still*, with
  a caption saying retrieval telemetry is not connected. It does not fake
  traffic. The current loop is explicitly a placeholder and should be labelled
  as one until the feed lands.
- **Retrieval but no adjacency** → fibres render as proximity links with the
  caption naming them as layout, not meaning.

Each of those is a one-line change on the client. The rule is the same as
everywhere else on this shell: it may look inert, it may not look informed when
it is not.

## Suggested order

1. Corpus snapshot — small, unblocks honest shape and growth.
2. Aggregated retrieval broadcast — the one that makes it alive.
3. Weekly growth snapshots — cheap, unlocks the growth curve.
4. Adjacency + PCA layout — the expensive one, and the one that makes it true.

1 and 2 together are probably a day of backend work and would replace every
piece of fiction currently on that panel except the fibre meaning.
