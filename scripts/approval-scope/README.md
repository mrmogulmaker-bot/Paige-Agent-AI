# Approval Attribution — Stage 1 checks

```
node --import ./scripts/approval-scope/register.mjs scripts/approval-scope/stage1-check.mjs
```

24 behavioural checks over the three handlers Stage 1 changes. They import the **real**
shipped functions through an ESM loader hook that replaces only the module boundary
(supabase client, `zod` builders, two `_shared` helpers subagent-forge imports but that
are irrelevant to attribution). Nothing inside a handler is stubbed.

Every refusal case asserts two things, not one: the response the caller gets, **and** that
the request wrote nothing. A refusal that still inserts, claims, or sends is the failure
mode worth catching, and a status code alone would not catch it.

Each block also carries a positive control, because a guard that refuses everything is not
a fix (§37): an attributed proposal must still create its approval, and an own-tenant
approval must still reach the send stage.

**One drafting note worth keeping.** The first version of the subagent-forge case passed
its status assertion while never reaching the code under test — the handler was rejecting
on payload validation, and 422-for-the-wrong-reason looks identical to 422-for-the-right-
reason. The log assertion caught it. That is why these checks assert on error codes and
side effects rather than status alone.

Standalone by design: vitest's include is `src/**`, so this adds no CI surface and
`package.json` is untouched.
