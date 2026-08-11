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
  `PRIMARY_ELEVENLABS_VOICE` **hardcoded** in `supabase/functions/_shared/tts-router.ts` — **now
  `"0S5oIfi8zOZixuSj8K6n"` (Ivanna)** as of #409 (was `"6aDn1KB0hjpdcocrUkmq"` "Warm" pre-#409) — with
  `ELEVENLABS_VOICE_ID` honored **only** by the separate legacy `_shared/elevenlabs.ts` path. Updating
  the agent touches neither.
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

## 8. Re-ruled a settled decision — the §BRAIN.2 miss (Ivanna voice, 2026-08-09)

- **Symptom:** Cowork/CC re-surfaced the **Ivanna voice choice** (`0S5oIfi8zOZixuSj8K6n` as
  `DEFAULT_TTS_VOICE`) as an **open question** — when the owner had already ruled it across multiple
  prior sessions (and it was merged in PR #409). The owner should not have to make the same decision
  twice.
- **Root cause:** The "decision" was pulled from session memory / a blank slate instead of the brain.
  A settled owner ruling that isn't checked against the decision-log gets re-litigated on every reset.
- **Rule (§BRAIN.2):** A decision the owner has **already made** is **relayed, not re-asked.** Before
  surfacing any "which should we do?" question, check `decision-log.md` + `config-registry.md` — if the
  owner already ruled, state the ruling as settled and move on. Re-asking a settled decision is itself
  the violation.

## 9. "Assumed unprovisioned" — treating a live integration as fresh (Twilio, 2026-08-09)

- **Symptom:** A plan defaulted to treating a third-party integration as **fresh/unprovisioned** — e.g.
  framing the operator SMS surface as needing new `TWILIO_OPERATOR_*` secrets the owner must paste, when
  the platform's **master Twilio account already exists and phone calls already work today**. (Twin of
  the voice #24 miss: the app was already using a *different* voice system, yet a session assumed it had
  to stand one up.)
- **Root cause:** Reaching for "set it up from scratch" without first checking whether the platform's
  actual behavior proves the credential already exists. If calls/SMS already work, the Twilio creds are
  already set.
- **Rule (§30 diagnose-first):** Before asking the owner for a credential paste, **check the platform's
  actual behavior** — *is X already working? then the credential exists; find it, don't ask for it.* Only
  a genuinely new value (e.g. the A2P Messaging Service `MG…` SID) is worth a `⚠ verify-whether-already-set`
  — and even that gets verified before an ask, never assumed missing.

## 10. Sub-account treated as an agency — the four-times seam bug (§51)

- **Symptom:** A sub-account owner lands on the `/agency` operator dashboard, or sees the parent's
  aggregate data; the same tenant-tier seam bit four times in a month (#86→#130→#172→#588).
- **Root cause:** Crews build on one tier and verify on one tier, never checking the others. A
  child tenant mis-modeled `account_type='agency'` (or carrying a stray `agency_team_members` row)
  resolves as an agency manager.
- **Rule (§51):** A sub-account is **structurally** never an agency (child ⇒ NOT `agency`/
  `enterprise`), locked at the DB layer (CHECK + trigger + `agency_current_id` guards). Every
  tenant-scoped change runs the **six-tier matrix** (God/Agency/Standalone/Sub-account/Client/
  Anonymous) pre- and post-deploy, and post-deploy-walks a tier you did **not** build on.

## 11. "Migration-only PR can't fail `verify`, so it's flaky" — a misdiagnosed real failure (§13, PR #437)

- **Symptom:** A migration-only PR's `verify` check went `failure` with an **empty** output
  summary. Assuming a migration touches no frontend, the failure was called a "phantom flake" and
  re-triggered with an empty commit — twice — instead of read. The empty check-run `output` (a
  GitHub App quirk) reinforced the wrong "nothing really failed" read.
- **Root cause:** `verify` is ONE job that bundles the **migration** regression-lint (`npm run
  ci:regression`, which scans `supabase/migrations/**`) alongside the frontend steps. A migration
  PR absolutely can fail it. Here the real cause was line-oriented: `scripts/ci/regression-lint.mjs`
  flags any ADDED line with `USING (false)`/`WITH CHECK (false)` that lacks `restrictive` **on that
  same line** — the policy WAS `AS RESTRICTIVE` but spread across 3 lines, so the modifier sat on
  the line above the deny clause and the lint couldn't see it. Fix: collapse so `AS RESTRICTIVE` and
  the `USING/WITH CHECK (false)` share one line (semantically identical, lint-visible).
- **Rule:** **Never label a CI failure "flaky" without reading the failing STEP's logs.** The
  check-run `output` is often empty; the truth is in `get_job_logs` — grep the full log for
  `##[error]` and the step group above it. A red check is real until its own logs prove otherwise;
  an empty summary is not proof. And a multi-line `CREATE POLICY … AS RESTRICTIVE … USING (false)`
  trips the line-oriented regression-lint — keep `AS RESTRICTIVE` on the deny-clause line.

## 12. Availability-by-accident — a tier-universal feature hidden by an empty-book gate (§56, task #99)

- **Symptom:** The tenant Systems Check showed on Mogul Maker Academy but not on several fresh
  sub-accounts. Owner reported it as a tier bug ("Paige thinks it's a solo account still").
- **Root cause:** NOT tier classification. `<SystemsCheckTile scope="tenant" />` was mounted INSIDE
  the non-empty branch of `PracticeOverview.tsx`'s `{emptyBook ? … : …}` conditional (`emptyBook` =
  0 clients + 0 attention + 0 approvals), so every freshly-provisioned tenant — solo OR sub-account —
  rendered only the "blank canvas" and never the check. Academy has clients so it showed. A
  capability meant for *every* tenant was hidden by an incidental empty-state gate; the agency's own
  default landing (`/agency`→`AgencyBoard`) never carried the tile at all.
- **Rule (§56 — new doctrine):** Before building/placing anything, check `docs/doctrine/tier-matrix.md`:
  (1) name which account type(s) it's for; (2) decide per-tier whether it belongs. A feature meant
  for "every tier" must render on every tier **regardless of empty-book/branch/route accident** — an
  empty account needs a setup check *most*. Fix mounted the tile ABOVE the empty/non-empty split
  (`PracticeOverview`, solo + sub-account) and added it to `AgencyBoard` (agency), matching the
  operator tile on `OperatorCommandCenter` (God).

## 13. `activeTenantId` on an OPERATOR surface can be a CHILD — tenant-scoped tiles leak (§9/§51, Codex P1 on PR #434)

- **Symptom:** the own-business Systems Check tile added to `AgencyBoard` (`/agency`) could show a
  *sub-account's* check as the agency's own, and let the agency approve the child's remediation from
  the agency dashboard.
- **Root cause:** on `/agency` the operator may still be scoped INTO a child (e.g. Back after
  `agency_enter_subaccount`); `AgencyLayout` preserves eligibility, so `useTenantContext().activeTenantId`
  is the CHILD id. A `scope="tenant"` tile trusts that ambient id → cross-tenant surface + action. The
  §39 adversarial verifier and the §5 compliance officer both MISSED it (they reasoned "activeTenantId
  here is the agency parent" from the happy path); Codex's independent read caught it — a live example
  of §39's "peer-gate is one layer, not infallible."
- **Rule:** On any OPERATOR/agency surface, never trust ambient `activeTenantId` for a tenant-scoped
  tile/action — it can be a child. Guard on the §51 invariant (own top-level tenant:
  `parent_tenant_id === null` AND `account_type ∈ {agency,enterprise}`) or resolve the intended tenant
  explicitly. Add "does this surface ever hold a DIFFERENT tenant in context than the one this
  tile/action is FOR?" to the §51 per-tier check. Third independent reviewer (Codex/CI) is worth
  keeping — it catches what the crew's own passes rationalize away.

## 14. SECURITY DEFINER = owner-run = RLS bypass; the grant is never the guard (§9, #117 / PR #448 — twin of the #116 view-drift lesson)

- **Symptom:** an authenticated `SECURITY DEFINER` function returns or mutates another tenant's rows —
  20 such leaks found across the codebase, incl. 1 HIGH total auth bypass.
- **Root cause:** a DEFINER function runs as its OWNER (postgres) and therefore BYPASSES RLS on every
  table it touches. That is safe **only if the function BODY enforces the caller's scope.** The leak
  class: a DEFINER data-returner/writer granted `anon`/broad-`authenticated`, keyed on a caller-supplied
  param, with no self/tenant/role guard. Three sub-patterns:
  - **(1) Global-role bypass** — `user_roles` has no `tenant_id`, so `has_role('admin')` /
    `has_any_role(...)` is TENANT-AGNOSTIC; a tenant-A admin can act on tenant B. Use
    `is_platform_owner()` / `is_platform_operator()` for cross-tenant authority (§53) and
    `is_tenant_admin(current_user_tenant_id())` for tenant scope — never the tenant-level app_role.
  - **(2) Param-IDOR** — never trust a caller-supplied `user_id`/`tenant_id`; gate on `auth.uid()` /
    `current_user_tenant_id()` (or validate the param `== caller` / `is_platform_owner`).
  - **(3) NEVER role-check a caller-SUPPLIED identity param** — `delete_credit_report_upload` role-checked
    a passed `_calling_user_id`, so any caller could pass a known privileged UUID = total auth bypass. The
    auth subject is ALWAYS `auth.uid()`; a passed actor is honored only on a service-role/trusted path
    (where `auth.uid()` is NULL).
- **Rule:** For every DEFINER fn that returns/mutates data, run the A/B/C classification — A=SAFE (body
  enforces scope, keep DEFINER); B=convert to `security_invoker` (DEFINER unnecessary — only touches
  tables the caller already has RLS on); C=fix in place (DEFINER needed but the guard is missing/broken —
  add the exact self/tenant/role predicate + REVOKE `anon` where over-broad). Ask: *"does the BODY
  re-enforce who the caller is (self / tenant / operator role that RAISES), or is it trusting the EXECUTE
  grant, a caller-supplied id param, or a tenant-agnostic global role?"* If the grant is the only guard,
  it isn't §9-safe. **Anti-recurrence:** `lint:definer-fns` CI guard (`scripts/ci/definer-fn-lint.mjs`)
  fails any migration granting a new public DEFINER fn to `anon`/`PUBLIC` without an inline
  `-- definer-anon-exempt: <reason>` escape. Twin of the #116 view-drift lesson (`lint:views`).

---

## Standing bars — owner-locked doctrine (2026-08-11)

Three sections ratified by the owner (drafted PROPOSED overnight in #449, locked morning 2026-08-11). Binding on every future PR.

- **§57 — Super Admin = source of truth (source-of-truth architecture).** Every tenant/agency surface
  DERIVES from what the God-level (Super Admin) record says is real — one record of truth, many
  read-only projections. Two surfaces showing different "truths" for the same tenant is a §57 defect
  (usually a §51 tier bug underneath), not a display quirk. Anchor cases: Fleet Console stale MRR on
  $0-paid tenants; a tenant misclassified `SUB_ACCOUNT` vs God-level topology; operator Analytics
  emptier than a tenant projection. *Test: does this surface derive from the God-level record, or compute
  its own answer that can diverge?*
- **§58 — Anti-regression (anti-regression discipline).** Twin of §28. A shipped, owner-approved
  capability is NEVER silently removed/hidden/gated-off in a later PR. If a change removes/hides one,
  call it out explicitly + get owner sign-off before merge — even on a PR nominally about something
  else. **§39 verifier checklist now carries a standing item: *"Did this PR silently remove any
  previously-shipped capability?"*** — a "yes" with no explicit flag + sign-off blocks the merge.
- **§59 — SECURITY DEFINER caller-scope-in-body (Postgres security posture).** A DEFINER function
  bypasses RLS; safe ONLY if the body re-enforces caller scope (self / `current_user_tenant_id()` /
  operator role that RAISES) — the EXECUTE grant is never the guard. The global-role trap (§53):
  `has_role('admin')` is tenant-agnostic; cross-tenant authority is `is_platform_owner`/
  `is_platform_operator`. Never role-check a caller-SUPPLIED identity param. Enforcement is LIVE:
  `lint:definer-fns` CI guard + `pg_proc` drift advisor (shipped #117/PR #448). See Lesson #14 for the
  full A/B/C classification.

- **§60 — structural tier-lock over text-only doctrine (owner-named drift class).** When an owner has
  re-stated a discipline across sessions and keeps catching drift, the correct response is a STRUCTURAL
  enforcement primitive (§18 one home + CI guard), NOT a text-only rule that relies on humans/agents
  remembering. `getTierFeatureSet()` + `lint:tier-features` is the tier-lock equivalent of #116's
  `security_invoker` + `lint:views` and #117's DEFINER caller-scope + `lint:definer-fns`. **Rule:** if the
  owner has said it 3+ times and it keeps drifting, structurally lock it — don't wait for the next
  violation. Corollary to §18 "don't scaffold": a structural anti-recurrence primitive for an owner-named
  drift class is NOT "scaffolding a non-problem" — it is the fix. (Anchor: task #122; the §18-grounds
  deferral was explicitly reversed by the owner, master §10 correction #7.)
- **§37/§60 — a lock that gates N of N+1 producers is not a lock (enumerate ALL minters).** The #122
  build gated 4 of the 5 surfaces that mint a consumer-portal token and reported the lock closed; the §39
  peer-gate found the 5th (`WorkspaceSettingsPanel`, on the UNIVERSAL Setup surface) still fully
  functional on the excluded tier. **Rule:** when locking a CAPABILITY to a tier, run a §37 producer
  inventory on the underlying seam (here: every caller of `create_tenant_invite_token` with
  `_kind='consumer'`) and gate EVERY producer — "4 senders gated" GREENs the diff while the capability
  is still reachable. The peer-gate (§39) exists to catch exactly this; a build's own self-report doesn't.
- **§13/§60 — don't let a UI gate's comments claim SERVER enforcement.** A build-time/UI tier lock (helper
  + lint) is real, but it is not the server auth boundary (§9). If the server RPC doesn't yet tier-gate,
  the in-code comments must say the lock is UI-only, not "structural / server-enforced." (Anchor: #122
  `customer_portal_invite` — `create_tenant_invite_token` does not gate `_kind='consumer'` on
  `account_type`; corrected in the helper header before ship.)

---

*When a new class of mistake costs real time, add it here (symptom → root cause → rule) in the same
commit as the fix — a lesson only helps if the next session can find it.*
