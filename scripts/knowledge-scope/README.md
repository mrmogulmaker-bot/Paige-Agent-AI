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
| Voyage embeddings `fetch` | no API key in CI | a fixed 1024-dim vector; every other host throws |

Everything else — the tenant resolution, the RPC call, the telemetry write, the error branch —
is the real code. No check passes on a string match against source text.

## Failing-first

**14 of the 34 checks fail on the pre-fix handler** at base `66ee5a27`, and all 34 pass after it.
They were written and run against the defect before the correction existed.

The decisive ones:

- **8.1** — `match_tenant_knowledge` is called through the caller's JWT client. Fails on base,
  where it goes through service-role and the database guard is exempt by construction.
- **11.1 / 11.2** — the only tenant scope ever queried is the active one. Fails on base: a
  non-active membership's scope *is* queried, so its chunks *do* reach the prompt.
- **2.1 and 3.1** — pre-fix, the **same code** returns a *different* tenant depending only on the
  order the membership rows come back in.

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
