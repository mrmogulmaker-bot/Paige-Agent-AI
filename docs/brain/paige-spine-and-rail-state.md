# PAIGE Spine & Rail — verified current state

**Read this before claiming any department is "connected to PAIGE," before adding a Spine capability,
and before reading anything into an empty Solo activity feed.**

Grounded 2026-09-02 against `origin/main` `ed22066e71294099e48f0b52c742e3f379faf23c`, with the code
and schema claims established at `76bb3bbca` (#728) and re-checked unchanged at `05735f26b` and
`ed22066e7` — the commits between them are documentation only.

## The rule this file exists to enforce: existence ≠ reachability

Three different things get called "verified," and collapsing them is how this repository has twice
recorded something as working that a person could not use:

| Class | What it proves | What it does NOT prove |
|---|---|---|
| **Production catalog / schema** | an object is DEPLOYED — a function exists, a grant is present or absent, a migration is applied | that any code path calls it, or what it returns |
| **Automated test** | the assertions written down pass | that the assertions cover the failure |
| **Authenticated runtime** | a real person completed the flow on the real platform | — |

Everything below states which class it belongs to. **Nothing here was driven in a browser.**

## The Spine is PARTIAL — one capability, not a connected platform

**Do not read the Spine's existence as departments being wired to PAIGE.** Measured by running the
repo's own guards on 2026-09-02:

| Measure | Value | How |
|---|---|---|
| Registered Spine capabilities | **1** | `node --experimental-strip-types scripts/ci/paige-spine-registry-lint.mjs` → `PASS (1 capability)` |
| Inline Chat tools | **105** | `node scripts/ci/chat-tool-registry-lint.mjs` → `105 tool(s) inline, none added (baseline 105)` |
| Classified actions | **62** — 32 `ordinary`, 28 `high`, 2 `owner_only`, 5 exempt, 0 unclassified writes | `npm run lint:action-risk` |

The one capability is `pipeline.deal_stage_evidence` — read-only, `chatBinding: PARTIAL`,
`mindBinding: UNAVAILABLE`. **PAIGE reaches departments today through the 105 hand-wired tools, not
through the Spine.** The Spine is the governed path with one department crossed over.

**No department other than Pipeline is declared in the registry.** The Team and Setup surface cards
(`../doctrine/surface-cards/`) each say the same of themselves, independently.

### Why most departments cannot simply be added

Four properties of the shipped code decide eligibility. They are constraints, not preferences:

1. **The Rail is per-client, at three independent layers** — `paige_client_events.contact_id` is
   `NOT NULL REFERENCES clients(id)`; `record_rail_event` raises `contact not in tenant`; and the Chat
   emitter returns early at `if (!contactId) return`. A workspace-level outcome has nowhere to go.
2. **The resolver accepts `subject_type = "client"` and nothing else** (`resolveEvidence.ts`).
3. **Spine evidence loads only inside a client-scoped Chat turn** (`paige-ai-chat/index.ts`,
   `if (scopedClientId)`), so there is no Spine evidence in a general business question.
4. **The safe summary is a CONSTANT** — the adapter returns a fixed sentence plus enumerated scalars.
   A department whose value lives in free text cannot express it under this contract.

Consequence: **Team · Settings · Connections · Marketplace · Billing · Analytics · Social are
workspace-level and cannot reach `LIVE` without a shared-primitive change.** The owner ruled
2026-09-02 (Team card, decision 2) that a Rail event may not carry a null `contact_id`; the repair is
a distinct tenant/workspace-level outcome projection, and it is a **Spine Change Request**, unstarted.

### The reference implementation any new capability must copy

`public.get_pipeline_spine_evidence(text,integer)` — `SECURITY DEFINER` with pinned `search_path`,
requires `auth.uid()`, resolves the tenant server-side via `current_user_tenant_id()` (the caller may
not pass one), gates on a staff role, addresses the subject by the public-safe `clients.account_number`
rather than an internal UUID, and returns a fixed 19-column contract with no title, summary, payload,
user id, deal id or stage text.

**Production-verified grants (catalog class):** `authenticated` may EXECUTE it; `anon` may not.

## Owner-visible Solo Rail activity is UNAVAILABLE — not empty, not healthy

**This is the single most consequential current-state fact in this file, and it must not be read as
"there is no activity."**

`src/solo/data/useSoloActivityFeed.ts` reads `paige_client_events` directly over PostgREST as
`authenticated`, relying on the RLS policy `pce_staff_read`.

**Production says `authenticated` has NO SELECT privilege on that table** (catalog class, verified
2026-09-02). The grant was revoked by `20260712200000_paige_context_rail_step2_realtime.sql:25` and
never re-granted — four grant/revoke statements exist across 910 migrations and the revoke sorts last.
**RLS never gets consulted; the table grant is checked first.**

**Truthful status — use this wording, not a paraphrase:**

> `UNAVAILABLE — production Rail history cannot be read, and the current owner-facing consumer
> treatment is not reliable enough to distinguish denied history from empty history.`

**Do not call this healthy, empty, honest, repaired, or production-executable.**

**CORRECTED 2026-09-02 (§13 — this file's first version overstated the failure mode).** It said the
hook "honestly renders an error rather than an empty feed" and called this "a dead capability, not a
lying one." That generalised from ONE hook's internal branch to the platform's behaviour, and the
consumers were never checked. Issue **#746** established the rest, and it was re-verified here rather
than relayed:

| Path | Consumer | Distinguishes denied from empty? |
|---|---|---|
| `useRailEvents` (Context Rail) | `src/components/paige/PaigeRailFeed.tsx:108` · `src/components/app/ClientActivityFeed.tsx:144` — both destructure only `{ events, connected }` | **NO.** `grep` for `historyError\|historyLoaded` outside the hook and its tests returns **no matches**, so a refused read renders exactly like an empty feed |
| `useSoloActivityFeed` (Solo Trust Compass) | `src/solo/compass.tsx:377` computes a distinct `'error'` state and renders *"Recent activity could not be loaded, so this is not a record of nothing happening"* with `role="alert"` and a retry | **Yes** — this one is the model treatment |

So the platform-level statement is *not reliable enough*: two shipped consumers cannot distinguish,
one can. **An operator who opens the Command Center a minute after PAIGE acts can be told she has done
nothing** (#746). That is the failure mode — not a visible error.

Two things follow:

- **Leg 7 of the platform goal chain — *owner can see the result* — is broken for every department
  that emits to the Rail**, not only for the ones that emit nothing.
- `paige_audit_log`, the other durable attribution store, **has no Solo reader at all**. Both paths to
  "what did PAIGE just do" are closed.

**Never record this as an empty feed or a healthy one.** If a future session sees no activity in Solo,
the first hypothesis is this grant, not an idle workspace.

**Rail Recovery is tracked as issue #746 (RELEASE-BLOCKING), and #729 is BLOCKED from Gate 2 by it.**
#746 is the required separate Rail Recovery prerequisite for #729's first owner flow to become
production-executable. It is not assigned to #729, and not to this documentation record.

**Existing work, not authorized as a release path:** PR **#644** (`codex/mind-safe-rail-contract`) adds
`public.get_solo_mind_rail_events()`, a guarded `SECURITY DEFINER` resolver over the same table that
returns structural fields and no producer content, and which *re-asserts* the browser revoke. It
exists because the direct read does not work. The owner ruled 2026-09-02 that it must be freshly
grounded on current `main`, checked against the canonical Spine contract, reviewed for
internal-identifier exposure (it returns `contact_id`, where the Spine lens deliberately uses the
public-safe `account_number`), and proven mergeable **before** it becomes a recovery recommendation.
Two review notes recorded so they are not re-derived: it resolves the workspace from
`profiles.active_tenant_id` **raw** rather than coalescing through `current_user_tenant_id()` — the
pattern behind the §51 #588 anchoring bug and the known Team invitation defect — though it does
correctly key on `profiles.user_id`. #746 adds a third: #644's resolver returns eight structural
fields and **no `title`/`summary`**, which the rail renders — so it is not a drop-in, and the
grant-versus-RPC seam decision must be made *with* #644 rather than around it.

## Pipeline governance — three findings, recorded as follow-up, NOT as capability

**Tracked as issue #755** (grouped, owner priority 3 — required before any Chat Pipeline write bridge).
The issue carries the owner decision, dependencies and sequencing; this file records only the state.
Governed follow-up work, not shipped behaviour:

1. **The Spine's Pipeline evidence is a silent subset.** It reads only Rail rows written by
   `configure_tenant_pipeline` with `policy_result='allowed'`. `deal_move_stage` (PAIGE's own Chat
   tool) writes `public.deals` directly with the service-role client and emits **no** Rail event;
   `pipeline_attach` in `growth-process-submission` does the same. **PAIGE can move a deal and not see
   her own move in her own evidence.**
2. **`deal_move_stage` never consults `move_policy`**, so an approval-required stage stops the board
   and `pipeline_configure`, and does not stop PAIGE's tool.
3. **`pipeline_move_approvals` is write-only.** The table appears in exactly one file — the migration
   that creates and inserts into it. Its `status` enum permits `approved|rejected|cancelled` and a
   `resolved_at` column exists; **no code path anywhere sets them.** A held request is unresolvable,
   and each one permanently increments the dependency count blocking archive of that stage or pipeline.

## What decides whether PAIGE may act (Trust Compass precision)

**The authoritative statement, and it does not change with the catalog finding above:**

> The server action-risk policy plus the canonical confirmation/approval gate decide whether PAIGE
> may act. The Solo Compass dial remains a non-authoritative UI control. Runtime reachability of the
> deployed Trust functions remains `UNVERIFIED`.

The production catalog proves only that `trust_effective_rung()` and `resolve_tool_autonomy(uuid,text)`
**exist**. It does **not** prove — and nothing here should be read to imply — that the Solo browser
Compass dial is authoritative, that the Compass currently governs action execution, that runtime calls
into those functions occur, or that effective autonomy enforcement is proven. `20261019001000:41-48`
separately records that the compass clamps **at render only**.

## The owner-approved priority order (2026-09-02)

Later items do not start ahead of earlier ones. Implementation is assigned by the owner, never
inferred from this file.

| # | Work | State |
|---|---|---|
| 1 | PR **#729** — cross-account Rail/Compass hotfix on #728 | **BLOCKED from Gate 2 by #746** |
| 2 | **Rail recovery + owner-visible outcome reading** — issue **#746**, RELEASE-BLOCKING | the required prerequisite for #729's first owner flow to become production-executable |
| 3 | **Pipeline governance repair** — issue **#755** — before any Pipeline Chat write bridge | parked, owner decision required |
| 4 | Stale doctrine correction | done for the Trust Compass claims (PR #743) |
| 5 | Calendar as the next bounded read-only Spine capability | not started, not authorized |

**#746 is not assigned to #729, and not to this record.** It is a separate Rail Recovery workstream.

**This file is a state record, not a backlog.** Every distinct finding lives as a linked GitHub issue
— #739, #740, #741, #742, #746, #755 — and is added to the PAIGE Attention Register when that project
becomes available. Do not grow a parallel list here.

## Where the truth for each question lives

| Question | Answer from |
|---|---|
| Is department X connected to PAIGE? | the registry — `supabase/functions/_shared/paige-spine/registry.ts`. It fails closed at import and in CI, and it is the authority a surface card must agree with |
| What may PAIGE perform, and how is it approved? | `supabase/functions/_shared/action-risk.ts` (the one classifier) + `../doctrine/one-approval-gate.md` |
| What does a department actually do today? | its card in `../doctrine/surface-cards/` |
| Can the owner see what PAIGE did? | this file — today, in Solo, largely **no** |
