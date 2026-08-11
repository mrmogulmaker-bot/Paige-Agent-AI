# Skills Wave S1 — §58 baseline fixtures

Automated §58 (anti-regression) proof substrate for the Skills interpreter, per the owner's
Skills Sub-Wave brief. Each shipped skill has an `input.json` (a controlled fixture input); the
harness fires it against the **deployed** `skill-runner` and writes `output.json` (the captured
baseline). This replaces the browser-agent as the self-verify substrate — no owner burden.

## Slice 1 — capture the baselines
```
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/skills-s58-harness.mjs --capture
```
Writes `<slug>/output.json` for every fixture with an `input.json`. Commit them as the baseline.

## Slice 3 — bespoke-vs-interpreter parity diff
```
SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/skills-s58-harness.mjs --diff
```
Fires each shipped skill both ways — bespoke handler (`force_interpreter:false`) vs the generic
interpreter (`force_interpreter:true`) — and reports byte-identical / DIFFERS per skill. A diff is
**expected** for `draft_and_email_document` (external_send): the bespoke handler emails; the
interpreter files an approval instead (§16 clamp). Byte-identical parity is required before the
interpreter may replace a bespoke handler for a given skill — until then the bespoke handler stays
(Fork-2 doctrine: additive, not forced replacement).

## Seeding real ids
`research_to_concept_brief` is self-contained (a topic string) and runs as-is. The other three need
real ids from a test tenant — replace the `REPLACE_WITH_…` placeholders in their `input.json` before
running (`build_game_plan`/`draft_and_email_document` need a real `contact_id` + `tenant_id`;
`draft_and_email_document`'s contact must have an email; `verify_business_sos` needs a real
`business_id`). Use a scoped test tenant, never owner PII (§13).

## Who runs this
A session/CI that holds `SUPABASE_SERVICE_ROLE_KEY` — Cowork (connected to the Paige MCP / with the
key), a CI job, or the owner. A headless remote Claude Code session does **not** hold the key and
cannot run it; it ships this harness turnkey and the connected session fires it (§32.c
capability-conditional).
