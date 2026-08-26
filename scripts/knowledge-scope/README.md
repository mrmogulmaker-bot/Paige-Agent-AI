# knowledge-scope checks

Behavioural checks for **which tenant `paige-ai-chat` searches** when it retrieves tenant
knowledge. Dev/CI tooling only — nothing here is imported by product code or deployed.

```
npm run test:knowledge-scope
```

## The defect these exist for

`paige-ai-chat` picked the tenant it searches with an **unordered** `tenant_members … limit(1)`
that ignored `profiles.active_tenant_id`, then passed it as `p_tenant_id` to
`match_tenant_knowledge`. That RPC's guard (migration `20260720224948`) compares `p_tenant_id`
against `current_user_tenant_id()`, which **does** honour `active_tenant_id`.

For anyone holding more than one membership — every Agency Parent, because
`agency_enter_subaccount()` writes a membership row — the two disagreed, the RPC raised
`KB_FORBIDDEN`, and the handler swallowed it as a `console.warn`. The user-visible symptom was
not an error: **Paige simply answered with no knowledge, silently.** §9/§51 (#588 class), §13.

The fix reuses the tenant `get_paige_persona_context()` already resolved 150 lines earlier. No
second resolver, no helper, no extra query, no fallback.

## What is actually exercised

The **real shipped handler**, imported through `stub-hook.mjs` and driven with a real `Request`.
Only the module boundary is faked:

| Boundary | Why | Replacement |
|---|---|---|
| Deno std `serve` | Node cannot bind Deno's server | `stub-serve.mjs` captures the handler |
| `@supabase/supabase-js` | no database in CI | `fake-supabase.mjs`, a **recording** client |
| `zod` | the esm.sh URL is unfetchable | the repo's own zod — real body validation |
| Voyage embeddings `fetch` | no API key in CI | a fixed 1024-dim vector; every other host throws |

Everything else — the tenant resolution, the RPC call, the telemetry write, the error branch —
is the real code. No check passes on a string match against source text.

## Failing-first

Checks **1.2, 1.3, 2.1, 3.1, 3.2, 6.2 and 6.3 fail on the pre-fix handler** (7 failed / 9 passed
at base `66ee5a27`) and all 16 pass after it. They were written and run against the defect
before the correction existed.

Checks 2.1 and 3.1 are the sharpest evidence: pre-fix, the handler returned whichever tenant the
unordered membership list happened to yield first, so the *same* code produced a different tenant
for the Agency Parent case than for the acting-as-child case.

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
