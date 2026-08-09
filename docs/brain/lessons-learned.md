# Lessons Learned — recurring traps

The failures that have actually cost time/money, written as **symptom → root cause → rule** so the
next session recognizes the trap before repeating it. These are the concrete instances behind the
RED-LINE index and the §-doctrine; this file is the fast-lookup version.

---

## 1. The voice live-drive trap (ElevenLabs, #24 / #170 / PR #409)

- **Symptom:** "I updated the ElevenLabs agent but I still hear the old voice." Sessions changed a
  ConvAI agent's voice and heard no change.
- **Root cause:** Paige's TTS path does **not** read the ElevenLabs **ConvAI agent** at all. The
  ConvAI stack was removed in #170 / §49 Wave A. The actual voice is set by
  `PRIMARY_ELEVENLABS_VOICE = "6aDn1KB0hjpdcocrUkmq"` **hardcoded** in
  `supabase/functions/_shared/tts-router.ts`, with `ELEVENLABS_VOICE_ID` honored **only** by the
  separate legacy `_shared/elevenlabs.ts` path. Updating the agent touches neither.
- **Rule:** To change Paige's voice, edit `PRIMARY_ELEVENLABS_VOICE` in `tts-router.ts` (and/or set
  `ELEVENLABS_VOICE_ID` for the legacy path) — never the ConvAI agent. Verify by driving the actual
  TTS endpoint, not by trusting the ElevenLabs dashboard. (Being persisted as a "Voice Configuration"
  CLAUDE.md section on PR #409; see `config-registry.md` → Voice.)

## 2. Cross-worktree / cross-branch file leakage (§254 worktree discipline)

- **Symptom:** A session's changes appear on, or collide with, another in-flight branch's work; an
  edit meant for one task lands in another's tree.
- **Root cause:** Multiple agents run in parallel on sibling branches
  (`claude/s3-operator-communications`, `claude/voice-fix-ivanna`, etc.). Editing the shared main
  working tree, or reading one branch's uncommitted state as if it were `main`, leaks work across
  lanes.
- **Rule:** Substantive work runs in an **isolated git worktree** branched from `origin/main`
  (this task did: `.claude/worktrees/second-brain`). Never touch another agent's named branch. Treat
  facts found on an unmerged branch as **in-flight**, not as `main`/prod truth (this is exactly why
  `config-registry.md` marks the operator-Twilio + voice sections as ⚠ in-flight).

## 3. "It compiled" ≠ "it runs" (§32 green-build-is-not-a-render)

- **Symptom:** `tsc`/`vite` pass, PR merges, but the surface renders nothing (or crashes) at runtime;
  the owner catches it live. Worst case a `SceneBoundary` **silently swallowed** the throw, so the
  page just "didn't populate" with zero signal.
- **Root cause:** A passing build proves types, nothing about runtime. Error boundaries that render
  `null` without logging turn every runtime bug into the same invisible symptom.
- **Rule:** Smoke-test crash-prone runtime logic **headless** (Node against real inputs, e.g.
  `scripts/studio-hero-smoke.mjs`); every boundary/degrade path must **log loudly** and degrade to
  something **visible**; when you can't see the render, err **bold + loud**, not silent. For
  auth-gated surfaces, drive the deployed surface if the session has a browser tool
  (`scripts/live-drive/live-drive.mjs`), else explicitly mark the live check **owed** to a capable
  session — never claim a drive that didn't happen (§32 capability-conditional post-deploy).

## 4. Migration merged-but-never-applied — the false-green (§32 / #408-class, #275)

- **Symptom:** A migration "passed" and merged, but prod's schema is behind; the table/column/policy
  it was supposed to create isn't there. (1c-vi `20260722010000` and 1c-viii-a `20260722160000`
  merged while `schema_migrations` stayed two versions behind.)
- **Root cause:** A `BEGIN..ROLLBACK` proof only proves the **SQL executes** — it proves nothing
  about **persistence**. When no CI applied it (Supabase preview integration failed on #275), the
  migration was never actually run on prod.
- **Rule:** A migration is done only when (a) prod `supabase_migrations.schema_migrations` has
  **advanced** to include the version, and (b) the created object **actually exists** on prod
  (query it). This is now the `deploy-migrations.yml` pipeline (push→`db push`→`migration list`
  verify→move `db-live` tag). Confirm with `git diff db-live..HEAD -- 'supabase/migrations/**'` =
  empty. *(This pass verified 762 applied = 762 repo files = zero drift — the good state.)*

## 5. Producer-inventory misses — a hardening kills a legitimate caller (§37)

- **Symptom:** A security/contract fix ships and silently breaks a legitimate producer — a `pg_cron`
  job stops firing, an admin button 4xxs, an MCP tool errors. (Readiness-scan §9 hardening removed a
  contract still called by a cron migration, an admin "Run manual scan" button, and a `paige-mcp`
  tool — Hotfix-1, 2026-07-25.)
- **Root cause:** Static review confirms "implemented as described" but not "still works for every
  caller." The endpoint had producers across multiple caller classes nobody enumerated.
- **Rule:** Every contract-changing endpoint gets a **producer inventory across all eight caller
  classes** (frontend, sibling edge fns, DB triggers, `pg_cron`/`pg_net`, GitHub Actions, external
  webhooks/OAuth, n8n/Zapier/MCP, tests/scripts) **and names the tier for each** (§51). Half-hardened
  is worse than un-hardened. Template: `docs/doctrine/producer-inventory-template.md`.

## 6. The ⌘K collision — a green compliance + design-critic pass still missed it (§39 peer-gate)

- **Symptom:** A shipped keybind/command collided with an existing one; the pre-ship compliance and
  design-critic passes both returned clean, yet the defect was real. (Cited as an anchoring case for
  the peer-gate.)
- **Root cause:** A §32 proof / compliance pass only tests what its author thought to test. A green
  proof is necessary, never sufficient — it can be a **false green** for a whole class of defect the
  assertions never reached.
- **Rule:** Every §32-verified change also gets an **independent adversarial read of the real pushed
  diff** by a second set of eyes (not the proof's author), hunting the defect the proof couldn't
  cover — **then CI still has the last word.** Peer-gate + §32 proof + CI are layered; none alone is
  sufficient (§39; note §39's own honesty caveat — the peer-gate itself missed a `TS2304` in #350
  that CI caught).

## 7. Doctrine stated in chat evaporates — the §46 persistence miss

- **Symptom:** A "standing rule" the owner stated is forgotten by the next session; the same mistake
  recurs; the owner has to repeat himself ("where's your team, my friend?").
- **Root cause:** A rule that lives only in a chat transcript is gone on context reset. Only what's
  in `CLAUDE.md` (or a doc it points to) reloads every session.
- **Rule (§46 / §BRAIN):** Persist owner rulings into `CLAUDE.md` **in the same commit** as the work,
  and record feature/config/decision state into `docs/brain/`. A ruling not written down is a §13/§46
  drift waiting to happen. This is the entire reason the Second Brain exists — **not writing it down
  is the bug.**

## 8. Sub-account treated as an agency — the four-times seam bug (§51)

- **Symptom:** A sub-account owner lands on the `/agency` operator dashboard, or sees the parent's
  aggregate data; the same tenant-tier seam bit four times in a month (#86→#130→#172→#588).
- **Root cause:** Crews build on one tier and verify on one tier, never checking the others. A
  child tenant mis-modeled `account_type='agency'` (or carrying a stray `agency_team_members` row)
  resolves as an agency manager.
- **Rule (§51):** A sub-account is **structurally** never an agency (child ⇒ NOT `agency`/
  `enterprise`), locked at the DB layer (CHECK + trigger + `agency_current_id` guards). Every
  tenant-scoped change runs the **six-tier matrix** (God/Agency/Standalone/Sub-account/Client/
  Anonymous) pre- and post-deploy, and post-deploy-walks a tier you did **not** build on.

---

*When a new class of mistake costs real time, add it here (symptom → root cause → rule) in the same
commit as the fix — a lesson only helps if the next session can find it.*
