# PAIGE Spine & Rail — verified current state

**Read this before claiming any department is "connected to PAIGE," before adding a Spine capability,
and before reading anything into an empty Solo activity feed.**

Grounded 2026-09-02 against `origin/main` `ed22066e71294099e48f0b52c742e3f379faf23c`, with the code
and schema claims established at `76bb3bbca` (#728) and re-checked unchanged at `05735f26b` and
`ed22066e7` — the commits between them are documentation only.

**Re-grounded 2026-09-02 at `1fb7928862b312245dc16927eb4a52c9463206ca`** after the Rail resolver
foundation merged and deployed (#785, then the #794 remediation in #795). The consumer-side claims
below were re-checked at that commit and are **unchanged** — which is the point of the new section
that follows: a safe server read now exists, and *nothing calls it yet*.

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
`mindBinding: PARTIAL` (raised from `UNAVAILABLE` by PR **#747** on 2026-09-02 — a `PARTIAL` binding,
not a `LIVE` one; the capability count is unchanged at one). **PAIGE reaches departments today
through the 105 hand-wired tools, not
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

## A safe server-side Rail reader EXISTS and is deployed — and no consumer calls it

**Deployed 2026-09-02. Read this next to the section below, never instead of it.** The two facts are
not in tension: the server can now answer safely, and no owner-facing screen asks it.

`public.get_solo_rail_activity(p_limit integer)` — `SECURITY DEFINER`, `stable`,
`set search_path to 'public'` — returns tenant-scoped Rail history **without granting the browser any
access to `paige_client_events`**. Production catalog class, read 2026-09-02 at project
`xygzykjyynhzqytbqnzu`:

| Property | Verified value |
|---|---|
| Migrations applied | `20261042000000` (#785) and `20261043000000` (#795), both present in `supabase_migrations.schema_migrations` |
| Overloads | exactly **1** — no stale signature left behind |
| Signature | takes `p_limit` only; **no tenant parameter** — the workspace is server-resolved, never caller-supplied |
| Projection | 11 reviewed display fields (`id, event_kind, surface, actor_type, audience, visibility, from_department, to_department, title, summary, occurred_at`). **Omits** `tenant_id`, `payload`, `ref_table`, `ref_id`, `actor_user_id`, `contact_id`. It **does** return `e.id`, the event row's own UUID primary key — so "no internal identifiers" would be false; the accurate claim is that it exposes no tenant, client, actor or source-record identifier, and no producer payload |
| On refusal | **raises `42501 RAIL_FORBIDDEN`** — it does not `RETURN;` an empty set |
| EXECUTE | `authenticated` ✔ · `service_role` ✔ (inert — `auth.uid()` is NULL there, so it raises) · `anon` ✘ |
| `paige_client_events` SELECT | still **denied** to `authenticated` and `anon` |

**Two properties are load-bearing and must survive any future change.**

1. **It refuses rather than returning empty.** A reader that answers a denied caller with zero rows
   reproduces, one layer down, the exact lie this whole file exists to name. `42501` is the contract.
2. **The direct-table revoke is the containment, and it stays.** `pce_staff_read` — the RLS policy on
   `paige_client_events` — carries the same tenant-agnostic role flaw described in #794 below. It is
   harmless *only* because the table privilege refuses before RLS is ever consulted. **Re-granting
   browser SELECT would make that defective policy reachable.** Do not "fix" the Rail by adding a
   grant. The resolver is the path.

### #794 — the defect this foundation shipped with, and the lesson that outlives it

Slice A (#785) reproduced `pce_staff_read` faithfully, **and reproducing it was the defect.** The
function gated on two clauses that answer questions about *different* tenants:

```sql
row filter :  WHERE e.tenant_id = v_tenant,  v_tenant := public.current_user_tenant_id()
role gate  :  public.has_any_role(v_uid, ARRAY['admin','super_admin','coach'])
```

`current_user_tenant_id()` honours `profiles.active_tenant_id` for **any** active `tenant_members`
row, at **any** role — a plain `member` qualifies. `has_any_role()` reads `public.user_roles`, whose
columns are `(id, user_id, role, created_at)`: **no `tenant_id`.** It is a global question — §59's
global-role trap. So a global `coach`/`admin`/`super_admin` role earned in tenant A, held by someone
who is merely a member of tenant B, satisfied the gate **on the role from A** and returned all of
tenant B's Rail, including the `audience='owner'` / `visibility='owner_internal'` rows that
`record_rail_event` narrows away from everyone but the owner.

Remediated by `20261043000000` (#795): the role is read from an active `tenant_members` row for the
**same** `v_tenant` the rows come from, so the two clauses now agree about which workspace they mean.
Verified on production — the deployed body no longer contains `has_any_role`.

**Measured exposure, stated honestly:** 3 users hold a global staff role across multiple tenants;
**0** currently sit at a non-staff seat. Structurally live, never reached. That was not a reason to
downgrade the repair — the path opens the moment any global-role holder is invited as a plain member
elsewhere, which is ordinary.

**Three lessons, recorded here because `docs/brain/lessons-learned.md` has three open PRs contending
for its tail (#729, #731, #754 all append at 1276–1279) and a fourth append would conflict with all
of them.** They belong in that file when the contention clears.

1. **Fidelity to a defective policy resurrects the defect.** Slice A's tests asserted the function
   *matched* `pce_staff_read`. Matching it was the bug, so those assertions could not see it. A test
   that encodes "behaves like the thing we are replacing" is not a safety net.
2. **A revoked grant can be the only thing containing a flaw — so re-exposing the semantics through a
   different object type re-opens it.** The policy was unreachable; an EXECUTE-granted `SECURITY
   DEFINER` function with the same body is very reachable. Object type changed, guard did not.
3. **The review-timing gap is preserved as fact, not tidied away.** Slice A merged ~12 seconds after a
   Codex review began; that review never completed before production deployment, and this remediation
   is the direct consequence. #795 did receive a completed Codex review on its exact final head. Every
   Rail PR now requires one before Gate B. **Do not rewrite the #785 history as though it had one.**

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
| `useSoloActivityFeed` (Solo Trust Compass **and** Team activity) | **Both** consumers distinguish. `src/solo/compass.tsx:377` and `src/solo/team.tsx:235` each compute `loading ? … : error ? 'error' : …` and render `role="alert"` with a retry — *"Recent activity could not be loaded, so this is not a record of nothing happening"* and *"This timeline could not be loaded, so it is not a record of nothing happening"* | **Yes** — these are the model treatment. **Corrected 2026-09-02:** an earlier version of this row named only `compass.tsx`; `team.tsx` gained the same treatment and was not credited here |

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

**This verdict SURVIVED the resolver shipping, and the reason matters (2026-09-02).** A safe server
reader is now deployed — see the section above — but `useRailEvents.ts:198` and
`useSoloActivityFeed.ts:171` still read `paige_client_events` **directly**, and the browser still has
no SELECT on it. Re-measured on production at `1fb79288`, after both migrations:
`has_table_privilege('authenticated','public.paige_client_events','SELECT')` is **still `false`** — by
design, since that revoke is what keeps the defective `pce_staff_read` policy unreachable. So the
owner-facing behaviour is **byte-for-byte what it was**, and that means exactly what the consumer
matrix above says — no more:

- **The two `useRailEvents` consumers still collapse a refusal into an empty feed.** `PaigeRailFeed.tsx`
  and `ClientActivityFeed.tsx` destructure only `{ events, connected }`, so a denied read still renders
  as "nothing yet". **This is the remaining failure mode.**
- **The two `useSoloActivityFeed` consumers do NOT.** Both `compass.tsx:377` and `team.tsx:235` compute
  `activity.loading ? 'loading' : activity.error ? 'error' : …` and render an explicit `role="alert"`
  message with a retry control — *"Recent activity could not be loaded, so this is not a record of
  nothing happening"* and *"This timeline could not be loaded, so it is not a record of nothing
  happening"*. **Do not describe these as showing "nothing yet".** They are the model treatment Slice B
  extends rather than replaces.

That split is why the platform status is *not reliable enough* rather than *never* — and why the
verdict is about the platform, not about every consumer equally.

The status line is therefore unchanged, and the honest shape of the remaining gap has changed:

> **Before:** no safe path existed.
> **Now:** a safe path exists and no owner-facing consumer uses it.

Do not read "the resolver is deployed" as "the Rail is readable by the owner." Those are the two
classes this file's opening table exists to keep apart — **production catalog** proves the object is
deployed; it proves nothing about whether any code path calls it.

**Rail Recovery is tracked as issue #746 (RELEASE-BLOCKING), and #729 is BLOCKED from Gate 2 by it.**
#746 is the required separate Rail Recovery prerequisite for #729's first owner flow to become
production-executable. It is not assigned to #729, and not to this documentation record. **The
resolver landing did not lift that block** — #729's repair #1 operates on the direct-table read, which
is still refused. What changed is that the unblock is now a consumer change rather than a missing
capability.

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

**Updated 2026-09-02** after the Rail resolver foundation merged and deployed. Prior states are
corrected in place rather than deleted; what each row *was* is recoverable from this file's history.
The Attention Register standard (`docs/doctrine/paige-attention-register.md` §8) names this exact
table as a live list that obliges an edit when #746 or #755 resolves — that is a known, accepted
overlap, not an oversight, and it is why the register exists.

| # | Work | State |
|---|---|---|
| 1 | PR **#729** — cross-account Rail/Compass hotfix on #728 | **still BLOCKED from Gate 2 by #746.** Its repair #1 reads the direct table, which remains refused. Its `useRailEvents` scope guard is a real dependency for Rail Slice B, not an inconvenience |
| 2 | **Rail recovery + owner-visible outcome reading** — issue **#746**, RELEASE-BLOCKING | **OPEN — foundation only.** The safe resolver is deployed (#785 + the #794 remediation in #795); **no consumer has been moved onto it**, so no owner-facing screen is repaired. Closing #746 additionally requires authenticated owner runtime proof |
| 3 | **Pipeline governance repair** — issue **#755** — before any Pipeline Chat write bridge | parked, owner decision required |
| 4 | Stale doctrine correction | done for the Trust Compass claims (PR #743) |
| 5 | Calendar as the next bounded read-only Spine capability | not started, not authorized |

**Two open PRs already hold Rail consumer work and must not be duplicated (measured 2026-09-02).**
PR **#776** (`318f1dbd`) carries the now-merged `20261042000000` migration **plus** consumer changes to
`ClientActivityFeed.tsx`, `PaigeRailFeed.tsx`, `useRailEvents.ts` and `useSoloActivityFeed.ts` — that
is Slice B's surface. PR **#729** (`5fd08d2c`) owns the `useRailEvents.ts` scope guard covering a
painted-frame leak that a request-token approach alone does not catch: React commits a frame of the
previous scope's data before any passive effect can clear it. **Slice B adopts both rather than
rewriting them.** Neither may be merged except under its own owner's exact-head authority.

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
