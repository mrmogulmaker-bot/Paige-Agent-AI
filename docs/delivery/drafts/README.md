# Drafts — worked starting points, never applied

Nothing in this directory is executed, applied, deployed or linted.

It exists because `supabase/migrations/` is not a scratch space:
`.github/workflows/deploy-migrations.yml` fires on `supabase/migrations/**` and runs
`supabase db push`, which applies **every** pending file there to production on merge. A drafted
resolver that has not been executed, proven, or adversarially reviewed therefore cannot sit in that
directory even temporarily. It lives here instead, with a header saying why it must not go back.

**No CI lint reaches this directory.** `scripts/ci/definer-fn-lint.mjs` and
`lint:migration-versions` both scan `supabase/migrations/` only. That is the intent — an unapplied
draft should not consume a migration version or trip a guard written for shipping code — but it
means every file here is **unverified by construction**. Read them as hypotheses, never as evidence.

A file leaves this directory only by being rewritten into `supabase/migrations/` by the workstream
that owns its placement, with its own version check, its own proof, and its own review.
