# Mind Workspace — design pack & review gate

**Pairs with:** `solo-mind-workspace.html` (throwaway, read-only clickable prototype) and
`docs/architecture/mind-memory-knowledge-brain-capability-map.md` (the grounded 5-state status map,
the single source of truth for what is real).

**What this is:** the Phase-3 design of the **Mind Workspace experience** — how a Solo business owner
understands what Paige knows, remembers, and has done, with every item wearing its truthful
provenance and availability. It is a **review gate**, not an implementation. No production code, no
Chat/CRM/Calendar/Harness change, no product PR.

---

## How to open it

Open `docs/design-references/prototypes/solo-mind-workspace.html` in a browser (or `file://` it).
The black bar at the top is the **developer review surface** (not part of the product): switch
**Theme** (Obsidian/Mineral), **Viewport** (1536→Phone), **PAIGE** (closed/open), **State** (all
nine), **Tier** (Solo/Sub-account/Agency), and **Reduced motion**. The **Seam map** button
(bottom-right) opens the screen→seam inspector. Everything is a labelled fixture — no network, no
writes.

---

## The design decision, and the PACK-FIRST search that backs it (§00)

The **visualization** is settled: Solo's Mind hero is the **owner-approved 3D orb** shipped in
Phase 1 (the prototype uses a lightweight Canvas-2D stand-in for it, labelled as such). What did not
exist was a Mind **workspace experience** — the understandable surface around the orb.

Searched the pack (`docs/design-references/cd-packs/super-admin-shell-v3/`) for a Mind Workspace:
`mind`, `brain`, `memory`, `knowledge` → `mind-brain.js` is the **operator-tier bilobed-brain
visualization component only** (a Canvas-2D memory substrate; no workspace IA, no copy, no record
system); `paige-ia.js`, `absence-copy.md`, `PORT-SPEC` carry no Solo Mind-workspace IA. So there is
**no pack surface to port** for this experience. The owner explicitly assigned this design in Phase 3
(with `impeccable` + `flow-prototype`). It is therefore designed in the **established Solo design
language** — the pack `--pg-*` token system (`design-system-port.md`, both themes), Schibsted Grotesk
+ Gambetta, gold spent only on the act, the pack elevation ladder — consistent with the shipped Solo
Mind surface and the Solo prototypes (`solo-systems-check`, `solo-trust-compass`).

---

## Compact brief (flow-prototype)

```
Goal: A Solo owner understands, in under a minute, what Paige knows about their business
      (and where it came from / how fresh), what she remembers (and how to correct or forget),
      and what she has actually done — each item truthfully labelled by how real it is.
Human & feel: A non-technical coach / consultant / agency owner. Feel = a chief of staff's
      open notebook: calm, credible, legible. Never a dev console.
Entry & exit: Command Center → Mind (the shipped orb). Exit → Open PAIGE (the one chat), or back.
System: Solo shell · --pg-* tokens both themes · gold only on the act · the approved orb as hero.
Signature: provenance-first — every card wears its truth-state chip and its source; never a bare figure.
Rejecting: generic KPI-card grids; ANY fabricated figure/activity/citation shown as real.
Variants: desktop 1536/1366/1024 + narrow 900/phone; PAIGE closed & open; Obsidian & Mineral;
      + honest non-Solo tier states.
```

## Information architecture — the owner's six requirements → regions

The workspace is **one orb-anchored surface** (no artifact-type tabs — §18/§21). A **lens filter**
(All · Knowledge · Memory · Current facts · Decisions · Suggestions · Activity) filters one record system; it is a
filter over what exists, never a type-picker the owner must clear first.

| Owner requirement | Where it lives | Honest state shown |
|---|---|---|
| What Paige **knows** + provenance / last-verified | **Knowledge** lens + orb knowledge nodes | LIVE read; provenance = source + date; **`source_url` and `last-verified` honestly flagged as not-surfaced/not-modelled** |
| What Paige **remembers** + correct / forget / not available | **Memory** lens | The sharpest §70 truth: a **"Not available yet"** state — no owner-memory view/correct/forget exists; the seam is built, unwired. Not a fake memory manager. |
| Tenant **documents / URLs / extraction / citations / organization** | Knowledge lens + **Add knowledge** (paste/link/file) + record drawer | ingest SOURCE-BUILT; delete/share LIVE; **metadata-edit + folders UNAVAILABLE**; **citations are in-prose only today** (change request below) |
| **Second-Brain history** — facts vs decisions vs receipts vs suggestions | **Current facts / Decisions / Suggestions / Activity** lenses, each record TYPED | facts PARTIAL; decisions "not available yet" (seam, no UI); suggestions PARTIAL (draft-first §36); receipts SOURCE-BUILT/PROOF OWED; near-empty data shown honestly |
| **All states** | Review-bar **State** control | populated · first-use · loading · empty · **refusal (≠ empty)** · stale · failed+retry · tenant-switch · multi-workspace |
| **Tenant-generic + truthful provenance/availability/authority** | The standing **honesty boundary** banner + per-item truth-state chips + the drawer's "Honesty boundary" section | never another tenant's knowledge, raw prompts, hidden reasoning, or internal build notes |

**Truth-state as first-class UI** is the signature: every record and region wears a chip —
**Live · Source-built · Partial · Proof owed · Not available yet** — tinted per state, never bare gray.

## State & transition coverage

| State | Rendered as | Recovery / note |
|---|---|---|
| Populated | orb + typed record cards | open drawer per card |
| First use | empty-but-ready + "Add your first knowledge" | primary action present |
| Loading | spinner + "Resolving this account's Mind… not a scan" | — |
| Empty | "Nothing durable is indexed here yet" | distinct from refusal |
| **Refusal** | "This isn't available to you here… not a record of nothing happening" | permission, never conflated with empty |
| Stale | "Showing the last good read (2h ago)" + Try again | nothing invented to fill the gap |
| Failed | "That read didn't go through" + Retry | nothing changed |
| Tenant-switch | "Switching workspace… never mixes two businesses" | — |
| Multi-workspace | "This Mind shows Northwind Advisory only" | each business its own separate Mind |

Interaction containers: record detail is a **drawer** (secondary detail retaining page context, not a
modal); ingest is a drawer; clearing a card is inline + non-destructive with Restore. Motion is one
calm authored moment (the orb breathes/orbits); reduced-motion freezes it; every animation is
motion-safe.

## Screen → seam mapping

Every control maps to a real seam on `main` or an explicit UNAVAILABLE — the prototype's **Seam map**
inspector lists all of them inline, and the authoritative grounding is
`docs/architecture/mind-memory-knowledge-brain-capability-map.md` (Domains 1–6 + the screen→seam
table). Highlights: Knowledge read = LIVE-via-source; ingest/delete/share = SOURCE-BUILT/LIVE-via-source;
current facts = the one governed Spine envelope (PARTIAL); receipts = safe Rail resolvers
(SOURCE-BUILT/PROOF OWED); memory view/correct/forget, KB metadata-edit, folders, Vault upload =
UNAVAILABLE; sub-account Mind = UNAVAILABLE (sequenced, §60).

## Verification evidence (this pack)

- **Static / design-quality:** `impeccable detect` → **0 anti-patterns** (1 advisory: hairline
  border + soft shadow, which is the pack's own elevation system — sanctioned). WCAG-oriented
  craft-floor checks (contrast, ≥11px functional text, themed browser surfaces) pass.
- **Rendered + behavioral:** headless Chromium (Playwright) drive → **21/21 checks, 0 console
  errors**, across both themes, phone→desktop, and every state: orb paints; memory shows the
  UNAVAILABLE state (not fake memories); the Suggestions lens shows a draft awaiting approval;
  **no record card overstates a bare "Live" chip**; refusal ≠ empty; drawer opens with provenance +
  honesty and restores focus on Escape; clearing a card is non-destructive and keeps keyboard focus off
  `<body>`; reduced-motion freezes the orb; **sub-account suppresses the orb + records** (UNAVAILABLE,
  not a working surface) and shows the §60 note; phone stacks to one column. Frames captured
  (Obsidian/Mineral desktop, memory, refusal, first-use, drawer, phone, PAIGE-open).
- **Independent review (§5/§39 peer-gate):** an adversarial verifier + a compliance officer read the
  built artifact. Both returned FIX-FIRST; every BLOCKER and MAJOR was fixed in this pass (the
  campaign card's overstated "Live" chip → PARTIAL; the map's two-way "LIVE" definition reconciled +
  bare-LIVE rows qualified "auth re-confirm PROOF OWED"; the product drawer's backend-name blocks
  marked review-only; a drawer focus-trap + `inert`; lens ARIA corrected to `aria-pressed`; a
  Suggestions lens added). §63 (no real-account leakage) and §2 (no finance default) came back clean.
- **UNVERIFIED / owed:** native screen-reader pass and the four exact Solo geometry captures
  (1536×770 / 1366×768 / 1024×768 / 900×1000, PAIGE open+closed) on the *production* surface are owed
  at implementation time (this is a prototype, not the production surface). The whole vertical's
  authenticated-prod status is PROOF OWED per the capability map.

## Material change-requests to resolve at the §00 round table (backend must change for the design)

These are the only things the design **cannot be wired as drawn** without a backend change — raise
them; do not have CC decide them:

1. **Structured citation contract (new).** The design shows provenance/citation as first-class, but
   today citations are **in-prose only** (`rail:<id>` / `[n]`); no machine-readable citation payload
   reaches the UI. A trustworthy citation UI needs a new structured citation seam.
2. **`last_verified` + surfaced `source_url` on Knowledge (new column + read).** The design shows
   freshness/provenance per document; `source_url` is stored-not-surfaced and there is no
   `last_verified` column.
3. **Owner-memory read/correct/forget surface (SCR — wire the built seam).** `record/get/forget_paige_memory`
   exist and are boundary-proven but have no product caller/UI; a confirmed-only projection is not
   built. The Memory lens is drawn against this future.
4. **SCR-1/2/3 (from the Mind matrix):** workspace-scoped outcome history (C1), non-client subjects in
   the one envelope contract (C2), richer/free-text safe facts (C3). The design's "Current facts"
   and "Activity" lenses assume these mature.
5. **C4 workspace-scoped fact read (new scoped read path).** The "Current facts" lens draws a
   deal-stage fact on the standalone workspace, but the governed Spine envelope loads **only inside a
   client-scoped chat turn** (C4). Shown standalone as drawn, it needs a new scoped read path — until
   then that card is honestly marked change-request-dependent, not shippable.

## Design decisions to resolve before build (§18 one-home — CC does not decide these alone)

- **Who OWNS Knowledge management?** Mind adds a Knowledge lens + Add-knowledge + delete/share, but
  Knowledge already has a home (Solo Paige → Knowledge tab; both read `useSoloKnowledge`). Decide, at
  review, whether the Mind Workspace is the **read/understand** projection (management stays in the
  Paige → Knowledge tab) or the **one home** for knowledge management (and the tab becomes the
  projection). The prototype currently shows management affordances in Mind pending this decision.

## Port-intent notes for the implementation PR (recorded now, not deferred)

- The record drawer's **"Backed by" / "Seam"** blocks (raw table/RPC names) are **review-only and do
  NOT port** to the production coach drawer — they exist so the owner+team can trace the mapping at
  this gate (§11/§36: a coach never sees backend names). They are visually marked "review-only" in the
  prototype.
- The **gold `:focus-visible` ring** and the **gold active-lens underline** are **per the pack**
  (`design-system-port.md:54` and `:91` specify `:focus-visible` as `2px solid var(--pg-gold-core)`;
  the Solo prototypes use a gold tab underline). PACK-FIRST makes the pack authoritative over §11's
  generic "rings are indigo" rule, so these are ported as drawn, not corrected.
- A **Suggestions lens** was added (owner requirement (d) + §36 draft-first "drafts awaiting you");
  the drafted-follow-up record moved from Activity into Suggestions.
- The record drawer's **"Honesty boundary" note copy** is placeholder, de-jargoned for review (no
  §NN anchors, no internal constraint IDs like C4/SCR-N, no process terms like "seam"/"envelope") —
  **Claude Design owns the final coach-facing wording** at implementation (§00). Every string rendered
  outside a `.reviewonly` container must stay free of internal jargon (§11 measurable).
- Truth-state chip **labels** ("Source-built", "Proof owed", …) and the Knowledge read's down-label
  ("Source-built" where the map calls the read "LIVE-via-source") are conservative/honest but lean
  technical — the **owner-facing truth-state vocabulary is CD's call** to confirm at the gate.

## Recommended phased implementation plan — each phase mapped to the EXISTING seams it reuses

**Ground rules (owner's mission):** *turn the fragmented foundations into one coherent workspace —
NOT invent a parallel brain, memory store, knowledge base, or audit system.* So every phase **reuses
a seam that already ships** (§18 one-home, §14 compose don't fork, §30 reuse-don't-rebuild). Each
phase is independently shippable, Solo-first, and leaves an honest UNAVAILABLE for what it does not
yet wire (§70). Each ships with the full gate: failing-first tests + headless smoke + the
authenticated §32.c live-drive on a real Solo tenant + the §70 usability gate (a human completes the
flow) + the §5/§39 two passes + the §51 per-tier check. Nothing is called LIVE without an
authenticated drive.

| Phase | Goal (what a Solo owner can DO) | EXISTING seams it reuses (all already deployed) | New backend? | Honest state move |
|---|---|---|---|---|
| **1 — The understandable read workspace** | Open Mind; understand what Paige knows, where it came from, how sure she is; every item truthfully labelled; honest "not available yet" for the rest | `src/solo/SoloMindWorkspace.tsx` + `mind-orb/engine.ts` (the shipped, §28-frozen orb) · `useSoloKnowledge` → `tenant_knowledge_docs` (RLS, LIVE read) · `useN8nSpineReadiness` → `get_n8n_spine_readiness` · `useCommandCenter` → pending-approvals · `KnowledgePanel` delete/share · `mindOrbitPreference.ts` (localStorage prefs) | **NONE** — UI only (lenses, truth-state chips, provenance drawer, honesty banner, 9 states) | SOURCE-BUILT reads → a LIVE, understandable workspace once driven on a real tenant |
| **2 — Knowledge provenance completeness** | Each doc shows its origin link + a real "last-verified", not just type+date | `tenant_knowledge_docs` (existing table — `source_url` ALREADY stored) · `kb-ingest-*` · `useSoloKnowledge` (add the field to the select) | **Small, additive** (CR2): surface stored `source_url`; add + populate a `last_verified` column. One additive migration, no new table | provenance PARTIAL → complete |
| **3 — Owner-memory: view · correct · forget** | See the durable decisions/preferences Paige holds about the business; correct one; ask her to forget one | **The governed seam already ships, boundary-proven, with ZERO product callers:** `record_/get_/forget_paige_memory` (migration `20261223000000`, SECURITY DEFINER, §59 in-body scope) · `paige_owner_memory` · `match_paige_owner_memory` | **NONE new** — wire the deployed seam to a UI caller + the confirmed-only projection the memory contract already defines | Memory lens: UNAVAILABLE → LIVE. **Highest value-per-effort: no new backend contract, closes the map's sharpest §70 gap** |
| **4 — Second-Brain history (receipts · decisions · suggestions)** | See what Paige has done, decided, and proposed — each typed and truthfully labelled | `get_solo_rail_activity` / `get_client_rail` (safe SECURITY DEFINER resolvers) · `record_capability_run` (receipt writer, 20+ adopters) · Phase-3 owner-memory `decision`/`agent_outcome` reads · `paige_pending_confirmations` (propose→confirm queue, for Suggestions) | **NONE** for the read (data grows as capabilities emit receipts; near-empty today, shown honestly) | receipts/decisions SOURCE-BUILT/PARTIAL → surfaced, honest |
| **5 — Structured citations + workspace-scoped facts** | Click a cited claim → see its source; "current facts" render on the workspace, not only inside a client chat | `mindEvidence.ts` `rail:<uuid>` producer · `resolveEvidence.ts` envelope · deep-research `[n]` producer | **YES — the genuinely new backend (§00 round-table):** a structured `citations[]` payload/SSE + resolve endpoint (CR1); a scoped read path so a governed fact loads outside a client-scoped turn (C4/CR5); optionally SCR-2 (non-client subjects) + SCR-3 (richer safe facts) | citations PARTIAL/in-prose → verifiable; "current facts" PROOF-OWED → real |

**Cross-cutting dependency (NOT a Mind phase):** §60 Solo ≡ Sub-account. The workspace is built ON
the Solo shell, so it reaches sub-accounts **automatically** the moment the owner-sequenced routing
slice mounts `SoloApp` at `/business` (documented at `src/lib/routing/tierBranches.ts:624-648`). No
Mind-specific work — it inherits.

**Why this order:** Phase 1 delivers the whole understandable experience with zero backend risk;
Phases 2–4 each *wire a seam that already exists* (the §14/§18 win — the hard backend is built,
it just has no UI); Phase 5 is deliberately last because it is the only genuinely net-new backend and
needs the §00 round table. Value lands early and honestly; the one big backend change is isolated.

## THE FIRST DECISION I need before any production build begins

Everything above is verified and ready; Phase 1 needs **no** backend. The one call that gates Phase 1
— because it decides whether we build two knowledge homes or one (§18) — is:

> **Should the Mind Workspace BECOME the single home for tenant-knowledge (understand **and** manage —
> add / delete / share / organize), with the separate Solo Paige → Knowledge tab collapsed and
> redirected into it? Or should Mind be the read/understand projection only, with management staying
> in the Paige → Knowledge tab (Mind links to it)?**

- **My recommendation (an architecture/seam call — CC's domain, not a visual verdict): consolidate —
  Mind is the one knowledge home.** Reasons: (a) your assignment scope explicitly lists editing /
  organizing / deletion as Mind responsibilities; (b) §18 forbids two homes for one capability, and
  both surfaces already read the same `useSoloKnowledge` seam today; (c) it serves §7's one
  intelligent surface. The old tab collapses redirect-safe (§58 — no 404).
- **The lighter alternative:** Mind read-only, management stays in the tab. Smaller Phase 1, but
  leaves two knowledge surfaces — a standing §18 smell we'd carry forward.

Tell me **consolidate** or **read-only**, and I start Phase 1 (no new backend, so it moves fast). The
five change-requests only gate Phases 2–5, so they do not block the start — but if you already know
you want the owner-memory surface (Phase 3, no new backend either) or the citation contract (Phase 5,
the one real backend change) prioritized, say so and I'll sequence to it.

On approval, CC owns implementation end-to-end through the canonical Solo seams, wiring every value to
a real read or an honest absence, with the §70 usability gate and §51 per-tier proof — and this
throwaway prototype is deleted, never left in production.
