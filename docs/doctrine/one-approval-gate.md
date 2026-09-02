# One approval gate — build to it, never beside it

**Owner-ruled 2026-09-01.** Paige has exactly ONE way to prove the operator approved an action.
Any slice that adds a gated capability **builds to that gate**. No slice invents its own.

This is not a style preference. Three separate slices independently built a second way to prove
approval — #709, #711, #718 — each competent in isolation. A door with three locks is only as
strong as the weakest, and nobody inspects the weak one, because each looks correct on its own
review. Two of those three accepted evidence a model can manufacture.

## Who owns the final call — owner ruling, 2026-09-01

> *"Every agent that creates say a read/write permission needs to only allow that with our Chat
> Agent to make the final dev on it."* — owner

**Any agent may build a capability that needs permission. No agent decides how permission is
proven.** That decision belongs to the Chat build, because the gate lives there and because a
second opinion about what counts as a yes is precisely how a gate acquires a hole.

In practice this costs a feature agent nothing:

- **Adding a gated action** — classify the tool, stop. Self-service, no review needed, no
  approval code written. That is the whole point: the common case does not route through anyone.
- **Changing HOW approval is proven** — a new request field, a new token path, a new way to read
  the operator's intent, a change to the gate itself — goes to the Chat build first. This is rare
  and should stay rare.
- **A preview binding** sits between the two: it is a precondition, not an approval, and the shape
  is given below. Follow it and no review is needed; deviate from it and it is a gate change.

The test: *am I adding something Paige can do, or changing how we know the operator agreed?* The
first is yours. The second is not.

## What is authoritative today (owner amendment, 2026-09-01)

Approval authority is **the server action-risk policy plus the confirmation gate**. Nothing else.

The Solo Trust Compass dial is a **non-authoritative UI control**: an in-memory object that resets
on reload, which no server code reads. The platform rung `trust_effective_rung()` is real and does
clamp.

~~*But its migration is not applied to production yet. Do not write, or build against, a claim that
the Compass evaluates the action contract until it is persisted and enforced server-side.*~~

**CORRECTED 2026-09-02 (§58 — the premise, not the caution).** The migration **is** applied:
`trust_effective_rung()` and `resolve_tool_autonomy(uuid,text)` both exist on production ref
`xygzykjyynhzqytbqnzu` (read-only catalog query; `20261039000000` and `20261040000000` present in
`schema_migrations`). The struck sentence therefore rested on a false premise, and a slice obeying it
would have under-built against a clamp that is in fact deployed.

**The caution survives in a narrower and truer form:** deployment is not enforcement. Do not build
against a claim that the Compass evaluates the action contract **until runtime enforcement is proven**
— existence was verified, reachability was not. Approval authority is unchanged by this correction and
remains the server action-risk policy plus the confirmation gate, nothing else.

## Spine and Rail are not the same thing (vocabulary, so it stops drifting)

Recorded here because the two words were already being used interchangeably, and a shared word
that means two things is how two teams build the same component twice.

- **Rail** — the durable record of what happened: signals, approvals, actions, results,
  follow-ups. PAIGE's receipt and history. It is ONE part of the Spine.
- **Spine** — the whole shared pathway that lets a domain inform Paige safely and lets Paige act
  safely: safe evidence → approval → domain-owned action → Rail outcome.

**The full Spine contract is being grounded against real code by a separate audit and is NOT
written here.** This file owns one segment of it — the approval step — and deliberately stops
there rather than becoming a second, competing description of the whole.

## How approval actually works

The server computes a **fingerprint** of the exact tool call — the tool and its arguments, not
"an action". It streams that fingerprint with the confirmation card. When the operator clicks
Approve, the surface echoes the fingerprint back **in the request body**, which is a place the
model cannot write to. The gate then runs **the call the server stored**, not whatever the model
re-emits on the confirming turn.

Three properties follow, and they are the whole point:

- **The model cannot forge it.** It can write any sentence; it cannot write a request body.
- **The approved call is the executed call.** Arguments are read from the stored proposal, so a
  re-authored amount or a swapped recipient never reaches the write.
- **One approval buys one execution.** The proposal is claimed once, and a proposal minted by a
  request is not redeemable by that same request.

## Adding a gated action — the entire contract

**1. Classify the tool** in `supabase/functions/_shared/action-risk.ts`:

| Class | Means | Use for |
|---|---|---|
| `ordinary` | Reversible, in-tenant, effects stay in the workspace | Most writes |
| `high` | Irreversible, changes who may do what, reaches outside, spends money, or a client sees it | Deletes, role grants, purchases, publishes, sends |
| `owner_only` | Never performed from chat at any approval strength | Anything that changes Paige's own authority |

Give it a real reason in the same line. An entry with no defensible reason should be `high`.

**2. Stop. Approval is already handled.** Do not add a request field, do not read the operator's
prose, do not echo a token back through a tool result. The gate covers your tool the moment it is
classified. CI refuses an unclassified write, so forgetting step 1 fails the build rather than
shipping an ungoverned action.

**3. Only if the operator must have SEEN a specific consequence first** — an archive that empties
a folder, a purchase that names a price — mint a **preview binding** and require it as a
**precondition**, not as an approval:

- single-use, expiring, scoped to this tenant **and** this requester;
- created **before** the current turn (minting and acting in one breath is the turn approving
  itself);
- the executed target is read **from the binding row**, never from a name the model supplied.

That is a different claim from "they said yes", which is why it may coexist with the gate.
`pipeline_archive_preview` and `pipeline_folder_archive_preview` are the worked examples.

## What is forbidden, and why each one shipped once

| Forbidden | Why |
|---|---|
| Comparing the operator's message text (`=== "Approved — run it."`) | Anything that can write a message can write that sentence |
| A second approval field in the request body (`confirmedActions`, `approvalTokens`, …) | `approvedConfirmations` already carries the click for every gated action; a second field is a second lock |
| Returning an approval token in a **tool result** | The agentic loop feeds tool results back to the model, so it replays its own token and approves itself one round later |
| Trusting `confirm: true` from the model's arguments alone | That flag is the model's own JSON. It selects a branch; it proves nothing |

`scripts/ci/one-approval-gate-lint.mjs` fails the build on all three shapes. If you have a genuine
exception, mark the line `// approval-channel-exempt: <reason>` — deliberate and explained, not
silent.

## If you inherit a slice that built its own channel

Rewrite it onto this gate. The pattern, applied twice already:

1. **Keep** the server-issued preview binding as a precondition, with all four properties above.
2. **Keep** anything genuinely better — #718's idempotency replay guard was kept wholesale, and it
   is now the reason an archive retry is answered from the committed result instead of burning a
   second preview.
3. **Drop** the client echo, the prose comparison, and the helper that compared them.
4. **Replace** the tests rather than deleting them: assert the property against the handler, and
   assert the **absence** of the retired channel on the surface. Absence is what stops the fourth
   rebuild.

## Cross-references

`_shared/action-risk.ts` (the classification), `paige-ai-chat/index.ts` (the gate),
`scripts/ci/one-approval-gate-lint.mjs` (the guard), `docs/doctrine/autonomy-architecture.md`
(§67/§68 — what autonomy a process may hold), `docs/doctrine/solo-shell-contract.md` (the Solo
shell equivalent of this rule).
