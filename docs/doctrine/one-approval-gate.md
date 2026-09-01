# One approval gate — build to it, never beside it

**Owner-ruled 2026-09-01.** Paige has exactly ONE way to prove the operator approved an action.
Any slice that adds a gated capability **builds to that gate**. No slice invents its own.

This is not a style preference. Three separate slices independently built a second way to prove
approval — #709, #711, #718 — each competent in isolation. A door with three locks is only as
strong as the weakest, and nobody inspects the weak one, because each looks correct on its own
review. Two of those three accepted evidence a model can manufacture.

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
