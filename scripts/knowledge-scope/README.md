# knowledge-scope checks

Behavioural checks for **which tenant `paige-ai-chat` searches** when it retrieves tenant
knowledge. Dev/CI tooling only — nothing here is imported by product code or deployed.

```
npm run test:knowledge-scope
```

## The defect these exist for

`paige-ai-chat` picked the tenant it searches with an **unordered** `tenant_members … limit(1)`
that ignored `profiles.active_tenant_id`, then passed it as `p_tenant_id` to
`match_tenant_knowledge`. That names a tenant the caller **is a member of but is not currently
operating as** — every Agency Parent qualifies, because `agency_enter_subaccount()` writes a
membership row.

**This was a confidentiality defect, not a silent failure.** The call went through `supabase`,
the **service-role** client (`index.ts` ~line 510), and the RPC's guard (migration
`20260720224948`) is explicitly exempt when `auth.uid()` IS NULL — exactly the service-role
case. So no database check applied, and the **wrong account's private chunks were retrieved and
placed into Paige's prompt**. §9/§51 (#588 class), §13.

An earlier reading of this pathway called it fail-closed on the strength of the guard. That was
wrong: it did not check *which* of the two `supabase*` bindings made the call. The correction is
recorded here because the mistake is easy to repeat — the two clients differ by one identifier.

The fix reuses the tenant `get_paige_persona_context()` already resolved 150 lines earlier, moves
the RPC onto the **JWT-scoped** `supabaseClient` so the guard genuinely engages, and does no
embedding, retrieval or telemetry at all when scope is unresolved. No second resolver, no helper,
no extra query, no fallback.

## What is actually exercised

The **real shipped handler**, imported through `stub-hook.mjs` and driven with a real `Request`.
Only the module boundary is faked:

| Boundary | Why | Replacement |
|---|---|---|
| Deno std `serve` | Node cannot bind Deno's server | `stub-serve.mjs` captures the handler |
| `@supabase/supabase-js` | no database in CI | `fake-supabase.mjs`, a **recording** client |
| `zod` | the esm.sh URL is unfetchable | the repo's own zod — real body validation |
| Voyage embeddings `fetch` | no API key in CI | a fixed 1024-dim vector |
| Anthropic streaming `fetch` | provider egress must be observable without sending data | deterministic text/tool SSE with captured request bodies; every other host throws |

Everything else — the tenant resolution, the RPC call, the telemetry write, the error branch —
is the real code. No check passes on a string match against source text.

## Failing-first

**14 of the original 34 checks fail on the pre-fix handler** at base `66ee5a27`.
The expanded suite also covers the independently discovered in-flight account-change
race: active account switch, unresolved scope, membership revocation, and a change between
agent-loop rounds all fail closed before another provider call and suppress stale telemetry.
It also proves the actual tool-dispatch boundary and document extraction/sync boundaries stop
before tools, providers, writes, or telemetry when authority changes.

The decisive ones:

- **8.1** — `match_tenant_knowledge` is called through the caller's JWT client. Fails on base,
  where it goes through service-role and the database guard is exempt by construction.
- **11.1 / 11.2** — the only tenant scope ever queried is the active one. Fails on base: a
  non-active membership's scope *is* queried, so its chunks *do* reach the prompt.
- **2.1 and 3.1** — pre-fix, the **same code** returns a *different* tenant depending only on the
  order the membership rows come back in.
- **12 / 13** — after retrieval, every provider/tool boundary re-resolves the active account
  through the same JWT-backed persona contract. A switch, unresolved scope, or revocation
  prevents provider egress, later loop calls, and stale Knowledge telemetry.
- **14** — document post-processing revalidates before extraction and before sync. Valid scope
  preserves the path; switched, unresolved, or revoked scope produces no unauthorized provider
  call, sync, post-processing write, or stale telemetry.
- **15** — attached-document turns **do** retrieve tenant Knowledge, scoped to the active
  account, and their guard actually fires. A valid document turn queries the active tenant,
  carries the chunk into the provider payload, and writes telemetry; a switched one withholds
  the reply and reports the cancellation.

  **This check previously asserted the exact opposite** — that document turns never query
  Knowledge — and passed green, which is why it is called out here. That was an earlier
  revision's `&& !attachedDocument` gate on retrieval, and it was wrong twice: `main` grounds
  document turns in Knowledge, so excluding them silently removed a shipped capability; and the
  exclusion left `tenantKbScopeTenantId` null on exactly the path the document-side guards
  protect, so every one of them returned `true` without ever calling the resolver. A guard that
  cannot fire is not a guard, and a check that certifies the regression is worse than no check.
- **16** — the tool-dispatch guard is asserted **per tool**, not once per batch. A batch is not
  instantaneous, so a batch-level check authorises the whole round on the scope that held when
  the first tool ran.
- **17** — Knowledge telemetry, the one durable row this mechanism writes, commits only after
  the reply has actually crossed and the scope has been re-asserted a final time.
- **18** — each provider re-entry in the agent loop (continuation, closing call) re-asserts
  scope on its own. Two of these boundaries could previously be deleted with the suite green.
- **19** — a refusal is **sticky**. The helper clears the very state its own early return reads
  as "nothing to protect", so before this was fixed the first call after a switch refused and
  every later one reported success — and on a credit-report turn, which checks scope twice
  around a slow extraction stage, the buffered prior-workspace reply was flushed to the client
  with the whole suite green.
- **20** — safety-first streaming. A turn carrying tenant Knowledge or document-derived evidence
  is **fully buffered** until its final check passes; ordinary chat still streams live. Proven
  CAUSALLY, not by timing: fail the final gate and assert nothing protected survives. Timing is
  unobservable from outside — the handler can fill the stream queue before the test reads a byte,
  which would make a streaming implementation look correctly ordered.
- **21** — the protected sources and frames the first enumeration MISSED. Every one of these was
  found by an independent adversarial read of the pushed diff, not by this suite, and every one
  of them passed 186 green checks first:
  - **21.a** `sessionDocumentContext` — a follow-up question about a document read earlier in the
    session. No attachment, KB may miss, so the turn streamed live **and the revalidation guard
    short-circuited without ever asking the resolver**.
  - **21.b / 21.h** the artifact handoff card (`chatArtifacts`) and its Studio twin
    (`studioLinked`). Adjacent lines, mutually exclusive, so each needs its own case — a guard on
    one line is not a guard on the other, and reverting 21.h's line alone left the suite green.
  - **21.c** `rag_documents`. `match_rag_documents` was never configured in the fake, so
    `ragContext` was empty in **all 186** earlier assertions and deleting it from the latch left
    the suite fully green. One of the three sources the code named as "enumerated rather than
    assumed" had zero coverage.
  - **21.d** a resolver row present but carrying no `tenant_id`. Reads as a null tenant, and for
    the platform operator — whose scope is legitimately null — that compared equal and released
    the protected reply. Same class as the errored lookup, different failure shape.
  - **21.e** the confirm card. Targets `crm_create_contact`, not `document_generate`, because the
    latter's summary is a fixed sentence and a card built from it carries no model text — the
    assertion would have passed for the wrong reason.
  - **21.f** the choice chips. `ask_choices` sets `finalChunks = []` and breaks, so the frame IS
    the whole assistant turn: streamed live, it published the entire answer and then printed a
    refusal underneath it.
  - **21.g** `sync_status`, which carries the three bureau scores read out of the uploaded PDF.

  Group 21 also introduces `nonNeutralFrames` — a **denylist of the safe frames** rather than an
  allowlist of the unsafe ones. Enumerating what to withhold is exactly how these five got out;
  written this way a frame added later is protected by default and has to be argued onto the
  neutral list.
- **21 (continued)** — a second independent adversarial read of the pushed diff found the
  enumeration was STILL one round behind, in both directions. Nine of its mutations survived the
  suite green; six were undisclosed. What those became:
  - **21.i** an action step's LABEL is not automatically neutral. `describeStep`'s `action_file`
    case title-cased `args.to_department` — a model-authored string — into the label, and action
    steps are the one channel that streams live on a protected turn, justified precisely by "the
    label comes from a fixed vocabulary". It is a closed vocabulary now. Note the marker in that
    fixture is one unbroken token: `describeStep` splits the department on `[_-]`, so a hyphenated
    marker is shredded and the assertion would have passed against the unfixed code.
  - **21.j** a late TOOL retrieval switches the turn. The ruling names this in those words and
    nothing was checking it — and the `const` latch, whose whole justification was that no late
    retrieval exists, cannot see a tool returning evidence into `convo`. `markLateRetrievalProtected`
    covers that, inverted: a tool result is evidence UNLESS it is a write receipt.
  - **21.k** the `[DONE]` sentinel must not overtake the buffer it terminates. On the
    couldn't-finish branch the fallback text was buffered while `[DONE]` went direct, so on a
    protected turn the sentinel arrived first — and four of the seven SSE consumers `break` on it,
    dropping a reply that was still being persisted to the thread.
  - **21.l** `client_memory`, the strongest of the missed sources because it is DURABLE ACROSS
    SESSIONS: the `report_upload` row persists the same bureau scores this handler buffers
    `sync_status` for, into every later turn's prompt.
  - **21.m** the funding tenant's client file — the uploaded PDF's name, the three scores and every
    negative item. Two directions: it must latch on a funding tenant, and it must NOT on any other,
    or the fix buffers the whole platform and breaks live streaming for ordinary chat.
  - **21.n** `approval_queued`. Listed in a commit message as moved AND as mutation-proven;
    reverting it left the suite green because no fixture produced an approval. The seventh check on
    this branch to pass for a reason other than the one it named.
  - **21.o** a resolver returning a row AND an error. Every earlier scenario drove the error case as
    `{ data: null, error }`, where `!!row` is already false — so the `!error` half of the predicate
    was never load-bearing while a comment credited it.
  - **21.p** Studio reference images. The same image as `document` was protected; as `attachments`
    it was not — the §58 asymmetry, reproduced on the adjacent path.
  - **21.q** a failing sync. Honestly scoped: it drives the success emit carrying a failure result,
    NOT the caller's `catch`, which appears unreachable because the helper's own catch-all returns
    rather than rethrows.

  **`nonNeutralFrames` was rewritten**, because the first version was a denylist of KEYS, not of
  frames: any frame containing a neutral key was neutral whatever else was in it. Putting the whole
  tenant-Knowledge block inside a `paige_phase` frame, a `client_scope` frame, or an action step's
  `detail` each streamed the evidence live on a protected turn with 223/223 green. It now checks
  single-key shape, bounded field lengths, and scans every frame for the fixtures' protected markers
  regardless of the key it wears.
- **21.r–21.x, 21z, 22** — the rounds after the second review, and what each exists for:
  - **21.r** a tool that is a WRITE and a GENERATOR at once (`draft_marketing_content`). The
    receipt set was borrowed from `MUTATING_TOOLS`, which answers "does this write?" and not "is
    this result free of evidence?" — different questions, and this is where they diverge.
  - **21.s / 21.t** the rolling conversation summary and the request-supplied client file. The
    summary absorbs persisted replies, so it carries forward verbatim exactly what this rule
    buffers — and it is read ~2,000 lines BELOW the latch, which is what forced the general
    `markProtectedLate` setter.
  - **21.u** `knowledge_base` hits, honestly scoped: it proves the source is WIRED and cannot
    prove it independently load-bearing, because the funding client file protects the same turn.
  - **21.v** the live token-forwarding branch. Every gate scenario resolved through the replayed
    `finalChunks`, so the branch an ordinary protected reply actually streams through had no test.
  - **21.w / 21.w2** the below-the-latch evidence sources, asserted **by name**. 21.w covers four
    (CRM who-line, focused client, sender identity, activity rail); the §52 operator briefing
    needed its own case because it is gated on a tenant-less operator and `is_platform_operator`
    was stubbed nowhere — so it was unreachable in every check while two places claimed it was
    covered. With all five wired, deleting any four was green — "the turn is protected" is
    satisfied by any one firing. The handler now logs every call rather than only the first so
    each site is provable alone.
  - **21.ac** the tenth ENTRY-time source: text fetched from a URL this turn. (Listed separately
    because it belongs to the entry latch, not to 21.w's below-the-latch set — a splice had it
    reading as one of that group's five.)
  - **21.x** the revalidation resolver runs on the JWT client. This file's header claimed client
    identity was "proven, not assumed" — true of one call, and not of the one the whole gate
    rests on. Moving it to service-role was green; under service-role `auth.uid()` is NULL, the
    exemption the original defect turned on.
  - **21z** the receipt set asserted on its CONTENTS, read from the handler's source. Only two
    tools drive that set, so adding a read tool to it was free.
  - **22** the classifier itself. Every check in groups 20 and 21 rests on `nonNeutralFrames`, and
    nothing tested it: all six of its branches could be deleted with the suite green.

- **A leak the derived marker list did not catch, and the fix.** Deriving `PROTECTED_MARKERS` from
  this file's source fixed a hand-maintained *token list*; it did not fix hand-maintained
  *coverage*. A reviewer proved that putting an UNMARKED fixture value — the session document's
  filename — into a live `paige_phase` frame passed all 286 checks while the filename sat on the
  wire of a refused turn. **Every value a fixture plants as protected evidence now carries a
  marker**: document filenames and text, RAG and KB titles, the chunk title, the detected bureau.
  If you add a fixture, mark what it plants, or the classifier cannot see it leak.

## A trap worth naming

Two checks were initially written wrong, in ways that looked like product defects:

- **5.3** first asserted `embeds === 0` for unresolved scope. Two *other* embed calls (the
  client-memory pull and the `rag_documents` pull) live in this handler and are outside this
  change's scope, so it failed for a reason the change does not own. It now asserts a **delta**
  — the resolved run makes exactly one more embed than the unresolved run — which is a claim
  about the KB pathway alone.
- **9** conflated two different properties: unknown-key smuggling (zod strips it; retrieval
  proceeds on the server's tenant) and a malformed *known* field (zod rejects it with 400 before
  any work). Bundled together, a validation rejection masqueraded as proof that scope resolution
  was correct. They are now separate assertions.

Both are the same class of error as the harness bug below: a check that fails, or passes, for a
reason other than the one it names.

## Rules for anyone extending this

1. **Never stub the logic under test.** If a check needs new behaviour, widen the fake's
   *recording*, never its *answers*.
2. **Scenario `rpcs` values are the full `{ data, error }` result**, or a function returning one.
   The fake throws on a bare payload. An earlier version wrapped bare values into
   `{ data: { data: … } }`, which the handler read as `null` — a genuine assertion failure that
   looked exactly like a product defect. Being strict here is what stops that recurring (§13).
3. **Unconfigured reads resolve to `{ data: [], error: null }`** — an empty result, never an
   invented row. The handler's own try/catch then degrades exactly as it does in production.
4. **Assert on recorded calls, not on log text**, except where the log *is* the contract
   (check 6, the KB refusal, where being visible is the requirement).

---

## Round 6 — what the fifth independent review changed

100 mutations at `24ce4c96a` and `31f927dc0`. Every attack on the buffering machinery was caught;
nothing here is a leak found in shipped behaviour. What it found was that some of the INSTRUMENT
could not fail for the right reason, and that some of the prose asserted things the code did not do.

- **`21.ad`'s control could not distinguish a refusal from a deleted choke point.** Replacing
  `if (clientScopeDenied)` with `if (false)` removed the §9 early return entirely — full model
  egress on an unauthorized-client turn, the private marker streamed, the safe refusal gone — and
  the group stayed **335 passed, 0 failed**, because the emit that is normally dead becomes live
  and supplies exactly the frame a presence-check looks for. The control now asserts the refusal
  SENTENCE and `providerCalls.length === 0`. Re-driven: that mutation now fails **2** checks.
- **The document path's close decision had no shape pin.** `const scopeHeldAtClose = true` shifted
  every persona-call index; group 19 re-derives its own loop bound, so five checks silently
  vanished and the suite reported **332 passed, 0 failed** — smaller, not redder. `19.0b` pins the
  exact count. Re-driven: that mutation now fails **1** check.
- **Group 19's name asserted a property nothing measured.** Every timing switched away and stayed
  away, and the fake saturates its sequence, so a sticky guard and a forgetful one looked
  identical. `19.7` adds the switch-back. It passes — but driving the same mutation against it and
  against six agentic switch-back timings leaked nothing in any of seven, so the sticky flag is
  **defence in depth and this suite still cannot tell whether it works.** The group is renamed to
  what it measures rather than left claiming the flag is proven.
- **Prose corrections.** The entry-source list ran 8, 10, 9 and carried a stale "weakest of the
  eight" inside a block whose header forbids counting; `21.u`'s stated reason for a non-load-bearing
  source ("the client file covers the same turn") is false when `buildUserContext` returns empty;
  the refusal frame has four emit sites, not three, and eleven dominated branches, not half a dozen.
- **`paige_llm_trace` attribution.** Eight of nine `gatewayCompat` sites passed no trace context, so
  the calls carrying the most evidence wrote untenanted platform rows while a comment asserted they
  were stamped. Fixed in the handler, not in the sentence. Three pre-persona sites remain honestly
  untenanted and say so.

---

## Round 7 — the repairs the independent review of round 6 forced

Round 6's own reviewer ran 39 driven mutations against it. The mechanism held; three of round 6's
claims did not, and one of its new tests was worthless.

- **19.7 was deleted, one commit after it was added.** It claimed to close the switch-back gap.
  A turn TERMINATES AT THE FIRST MISMATCH, so the fourth element of a persona sequence is never
  consumed and `[C,C,A,C]` is byte-identical to loop iteration `n=2`. Confirmed independently here
  by planting a thrower in slot 4 — the fake treats a function as a thrower, and it never threw:
  `back 3 calls/185 bytes · stay 3/185 · n=2 3/185 · identical: true`. Three assertions duplicating
  an existing case are not coverage. **A switch-back is structurally unreachable on this harness,
  on both paths**, and that is now recorded where the test used to be so nobody adds it again.
- **The trace-attribution repair had NO test, including for the hazard its own comment names.**
  Six mutations against it — deleting the tenant stamp, unstamping a site, mislabelling a
  `job_kind`, and reverting `traceFor` to a definition-time snapshot (which re-freezes exactly the
  nulls the fix removed) — all left the suite at 343/0. **Group 23** now asserts the exact multiset
  of `(job_kind, attributed?)` pairs across three provider calls plus a document turn. Re-driven:
  snapshot 341/2, tenant stamp deleted 341/2, chat-close unstamped 342/1, mislabel 342/1,
  read-check falsely stamped 342/1.
- **The instrument could not see the sink.** `paige_llm_trace` rows never reached `rec.inserts`
  after the first drive, because `traceAdmin()` memoizes one client at module scope and the fake
  bound its recorder at CREATION time. That is why an attribution defect AND its repair both went
  unmeasured. `createClient` now hands the client live getters for the active scenario and
  recorder, which models the real lifetime: one long-lived client, whichever scenario is current
  when it is used.
- **Counting, for the ninth time.** "Six attributed, three pre-resolution" was five and four — and
  the same sentence listed four. The `if (clientScopeDenied)` correction replaced a CORRECT number
  ("half a dozen", six literal statements) with a wrong one ("eleven", which is all references
  including the two dead emits). The "other three emits are unreachable" claim is false for the
  summary-mode JSON refusal, which fires and which `client-memory-authz` 9.4 already asserts.
- **Six durable sinks were still missing** from a list that said "all named": two storage-object
  writes (the raw PDF bytes — the heaviest write on the turn), the `credit_report_uploads` INSERT,
  a second `client_memory` writer on the ordinary chat path, the two RAG-feedback updates, and a
  second `record_rail_event` that carries a 140-char preview of the user's message.

**Known gap, named rather than implied:** deleting the Studio `agent_id` stamp still leaves the
suite green, because group 23 drives no Studio turn. The ordering defect behind it — the stamp
sitting AFTER the pre-flight fold, so one Studio turn filed two folds under two agents — is fixed.
The assertion is not written.
