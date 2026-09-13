# paige-ai-chat runtime-correctness checks

Dedicated §32 checks for three silent runtime defects in `../index.ts`. Nothing else lives here.

## Run

```bash
node --experimental-transform-types \
  --import ./supabase/functions/paige-ai-chat/__checks__/register-edge-stub.mjs \
  supabase/functions/paige-ai-chat/__checks__/runtime-correctness-check.mjs
```

> `--experimental-transform-types` (not `--experimental-strip-types`): the behavioural section
> imports the real `index.ts`, whose transitive `_shared/*` tree now includes a TypeScript
> parameter property (`constructor(public …)`), which strip-only mode cannot parse. `transform-types`
> fully transforms the TS and handles it. The scope section alone (the TS2304 diagnostic) runs under
> either flag, since it parses source rather than importing it.

## Anti-vacuity

A check that also passes against the broken code proves nothing. Point the scope section at a
pre-fix copy of the function and the three defects must reappear:

```bash
git show <pre-fix-sha>:supabase/functions/paige-ai-chat/index.ts > /tmp/prefix-index.ts
PROVE_AGAINST=/tmp/prefix-index.ts node --experimental-transform-types \
  --import ./supabase/functions/paige-ai-chat/__checks__/register-edge-stub.mjs \
  supabase/functions/paige-ai-chat/__checks__/runtime-correctness-check.mjs
```

## Why standalone, not vitest

`vitest.config.ts` includes only `src/**`, so nothing here is picked up by `npm run test` and this
adds no surface to CI — the same posture as the other edge-function smokes under `scripts/`. It is
run by hand, and `package.json` is deliberately left untouched.

## Files

| File | What it is |
| --- | --- |
| `runtime-correctness-check.mjs` | The checks. Scope section (all three defects) + behavioural section (extraction) + the field-catalog contract against `paige-write-back`. |
| `scope-probe.mjs` | Reports every TS2304 ("Cannot find name") in a source string. That diagnostic IS the defect class: an identifier used where nothing declares it, which in an ES module is a runtime `ReferenceError`. |
| `edge-stub-hook.mjs` | Node ESM loader hook so the REAL `index.ts` imports under Node. Redirects the two esm.sh URL imports to the installed packages and stubs Deno's std `serve` so importing the module binds no port. Every `_shared/*` module loads for real. |
| `register-edge-stub.mjs` | Preload that registers the hook. |

`deno check` remains the authoritative type gate; this suite is what can run where Deno is not
installed, and it answers the scope question with the same TypeScript diagnostic.
