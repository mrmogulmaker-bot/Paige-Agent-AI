# Lessons Learned — recurring traps

The failures that have actually cost time/money, written as **symptom → root cause → rule** so the
next session recognizes the trap before repeating it. These are the concrete instances behind the
RED-LINE index and the §-doctrine; this file is the fast-lookup version.

---

## 0a. Ruling-conversion discipline — don't re-open a ruling as options (D7, 2026-08-11)

- **Symptom:** the owner ruled D7 (Option A, direct C-Corp conversion, standalone, no holdco). CC's §37
  producer inventory then surfaced adjacent stale doctrine the ruling hadn't named (the Portfolio-mode
  C-suite architecture; CoreConnect/Disputera refs). Cowork re-presented this to the owner as "Reading 1
  vs Reading 2" options. Owner, frustrated: *"There's no need to keep going back and forth… delete it and
  update it. That's it."*
- **Root cause:** treating a *scope-completeness* question ("the ruling didn't literally name this
  adjacent thing") as a *decision* question ("which way do you want it?"). Adjacent doctrine that
  **contradicts** an owner ruling is dead by implication — it doesn't need a fresh ruling to delete.
- **Rule:** when the owner has ruled, convert the ruling into COMPLETE execution guidance across the full
  scope §37 surfaces — do NOT re-open it as options. §28 protects CURRENT approved designs, not
  superseded doctrine; superseded doctrine gets deleted/updated, not preserved-and-flagged. (Genuinely
  NEW, separate facts a ruling couldn't have known about — e.g. an unrelated brand-licensing entity on
  the public footer — are still flagged, once, tersely; that is not the same as re-litigating the ruling.)

## 0b. Deep-research-not-memory — defer to real research, don't fake structure (2026-08-11)

- **Symptom:** asked to design a domain surface (e.g. "what an investment/portfolio surface looks like")
  with no concrete knowledge, the reflex is to synthesize plausible-sounding structure from memory.
- **Root cause:** guessing reads as authoritative but isn't grounded; it ships wrong shapes that cost a
  rebuild. Owner: *"do some homework, do some deep, deep diving and research."*
- **Rule:** when you lack concrete domain knowledge, DEEP-RESEARCH it against best-in-class references
  when the work fires — GOAT-anchored, the same discipline the skills wave uses — or defer the work until
  that research can happen. Never fabricate plausible structure from memory. (Applies to Cowork planning
  AND to what Cowork directs CC to build; e.g. the #129 Portfolio-feature surface is explicitly deferred
  with a research directive rather than guessed now.)

## 0d. Standing-pattern codification — a rule the owner repeats across sessions IS doctrine, codify on the 2nd occurrence (§61, 2026-08-11)

- **Symptom:** Cowork/CC asked the owner which tiers get the §60 `skills` feature-key — when the answer
  followed a pattern the owner had already stated multiple times across sessions in different framings
  (God has everything · Solo + Sub-account default · Agency resells · Enterprise hybrid). Owner, verbatim:
  *"This is yet another time that you guys have asked me something around the idea of where things should
  be placed when we should actually already have this understanding for the entire platform."*
- **Root cause:** treating each occurrence of a recurring decision as a fresh per-instance question,
  instead of recognizing the consistent implicit pattern underneath and locking it as doctrine. A rule the
  owner has stated across multiple sessions IS doctrine even before it is formally captured — asking again
  is the miss.
- **Rule:** when the owner has ruled the same pattern across sessions, **codify it into doctrine on the
  SECOND occurrence, not the fifth.** Recurring per-feature questions whose answer follows a consistent
  pattern are the signal that the pattern must be doctrine-locked (name it, number it PROPOSED, add it to
  CLAUDE.md + the brain + the master doc). The anchor case is §61 Standing Tier Distribution Default (God
  YES · Solo YES · Sub-account YES · Agency RESELL · Enterprise YES+RESELL). Same class as lesson 0a
  (ruling-conversion discipline — convert a ruling into complete guidance, don't re-open it as questions).

## 0c. A tool error is NOT proof the record is absent — the false-negative→false-knowledge trap (#127, 2026-08-11)

- **Symptom (owner live-drive):** Paige told the operator "there's no contact named Tashia Anderson on
  file" — but the contact existed. Two independent defects wore the same face: (1) the CRM search
  tokenizer matched the WHOLE phrase `"Tashia Anderson"` against EACH single column, so a real row with
  `first_name="Tashia"` + `last_name="Anderson"` (SEPARATE columns) matched 0 rows; (2) an unrelated
  nested tool (content-draft/generate-image) 500'd, and its error was narrated as if the *lookup* had
  failed. Paige collapsed both — an empty result AND an errored call — into the same confident claim:
  "no record."
- **Root cause:** an empty/errored search result was treated as positive evidence of absence. A query
  that returns 0 rows means "this query matched nothing," never "this thing does not exist"; a tool that
  throws means "I could not check," never "the answer is no." Collapsing *found-nothing* and *could-not-
  check* into *does-not-exist* manufactures false knowledge and misleads the operator.
- **Rule:** three outcomes are NEVER collapsed — **found** (real rows), **found-nothing** (a clean query
  that matched zero — say "no match on that search," suggest a narrower/looser retry), and **could-not-
  check** (an error — say the lookup failed, do NOT assert absence). The §18 one-home fix: tokenize the
  search (`_shared/contact-search.ts` — each token ORs across columns, tokens AND-combine via chained
  PostgREST `.or()`), plus a LOOKUP HONESTY prompt block forbidding the collapse. Full-name and
  multi-word queries never live in one column — assume tokenization for any human-name search.

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

## 15. Naming-debt — one internal route overloaded across account types (§65, `/admin`, 2026-08-17)

- **Symptom:** the agency owner kept reporting he "lands on the same landing page" no matter what — and
  a whole night of credits went to chasing routing that "keeps going in the wrong direction." Sub-account
  vs Solo vs Agency vs God all felt indistinguishable at login.
- **Root cause:** ONE internal route — `/admin` — was the login target for FOUR distinct user mental
  models (Solo, Sub-account, Agency, God). Because the URL couldn't say *whose* surface it was, the
  router (and the human) had to infer the account type from session state, and any miss (e.g.
  `resolveAgencyLanding` sending an agency owner to the OLD `/agency` surface unless
  `agency_login_default='last_account'`) read as "same page again." The defect was in the NAME, not the
  auth: `/admin` carried four meanings, so no amount of routing logic could make it self-evident.
- **Rule (§65):** every human-visible name — URL path, tier label, nav word, landing route — maps to
  **how the user thinks about the surface**, one name per mental model, never to the internal router tree
  or DB column. The fix is one route per account type named for WHO is there
  (`docs/doctrine/route-and-url-taxonomy.md` §2a: `/operator` · `/agency/{account}` ·
  `/enterprise/{account}` · `/solo/{account}` · `/business/{account}` · `/portal/:tenantSlug`). The name
  READS; session-derived scope + `getTierFeatureSet()` still ENFORCE (the address is never the grant,
  §9/§51/§60). Migration stays redirect-safe (§58 — old routes never 404) and staged; the taxonomy +
  migration order are owner-reviewed BEFORE any code rename. **The three anchoring naming-debt cases:**
  (a) **Solo vs `standalone`** — marketing "Solo" ≠ internal `account_type='standalone'` (task #67); the
  user never types "standalone." (b) **Enterprise-in-name vs `account_type='agency'`** — "Project Mogul
  Enterprise" is an AGENCY (owner: "PME is NOT an Enterprise account 😂"); the name misled a session into
  reading it as the Enterprise tier. (c) **`/admin` 4-way overload** — this lesson. Ask: *"would a human
  who's never seen our code know from this name whose surface they're on and what they can do — and does
  this name mean exactly ONE thing?"* If it only makes sense from the inside, or it's overloaded, it's
  naming-debt.

---

## 16. State-driven tabs = no addressable branches = Paige can't orchestrate (§65 tree, 2026-08-17)

- **Symptom:** the owner asked why Paige couldn't "find the growth branch on that sub-account" and why
  every tab in the new shells had no URL (refresh always snapped back to Command Center, nothing
  bookmarkable). Deeper: "how are we routing data inside a brain and orchestrating a machine when we don't
  have any actual branches of data?"
- **Root cause:** the new tier shells (`src/agency/AgencyApp.tsx`, `src/solo/SoloApp.tsx`) switch tabs with
  a `useState` (`const [route,setRoute]=useState('command')` + `screens[route]`), importing nothing from
  react-router. Each "tab" is in-memory state, not a URL. So no section is addressable — and an
  interaction surface whose sections aren't addresses gives the §8 action bus, the §16 departments, and
  the §37 producer inventory **nothing to point at**. "Route data inside the brain" has no coordinates.
  (Contrast: the legacy `/admin` console is already real nested routes — the proven pattern.)
- **Rule (§65 tree architecture):** every interaction surface's sections must be **real URL branches**,
  not `useState`. The route tree is the addressing SPINE — an address IS a data route (`/business/{n}/growth`
  is a handle Paige routes to/from, a §10 callable seam, an §8 action-bus target owned by a §16 department,
  a §37 producer address). Design it as a **declarative per-tier registry** (`TIER_BRANCHES`, §18 one home)
  cloned per account at signup, rooted at `account_number`. Convert state→routes, never ship state-tabs on a
  surface Paige must orchestrate. Full design: `docs/doctrine/route-and-url-taxonomy.md` §10–§15.

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
  `customer_portal_invite` — `create_tenant_invite_token` did not gate `_kind='consumer'` on
  `account_type`; corrected in the helper header before ship. **UPDATE #125: the server gate then landed —
  migration `20260823000000`, §32.a-proven — so `customer_portal_invite` IS now server-enforced. The
  lesson stands for the NEXT UI-only lock: state honestly whether the server backs it.**)
- **§13/§0 — ground "customer risk" against CURRENT state before deferring (correction #8, 2026-08-11).**
  Before invoking "we might break a legitimate <tier> customer" to defer a change, VERIFY that customer
  class exists in current state — query the `tenants` table / master §4 SHIPPED / this brain. Hypothetical-
  customer risk is not real risk when the class has zero members. Pre-MVP, **Enterprise has zero customers**,
  so every "we might break Enterprise" deferral was hypothetical drift (it deferred the #125 server gate for
  no real reason; owner reversed it). Real classes today: Solo + Sub-account + Agency + Super-Admin operator.
  Rule: verify customer existence FIRST; defer only on real-customer risk.

- **A shared component's LOCAL state forks the moment a second mount exists (2026-08-19).**
  *Symptom:* the operator console mounts Paige twice (Paige branch + ✦ slide-out) and CD's own footer
  promises *"Same brain as the Paige tab — one thread, two doors."* *Root cause:* `PaigeAIChat` held
  `activeThreadId` in local state, so the second mount's first send called `ensureThread` and inserted
  a **new thread row**. It LOOKED fine because navigating unmounts the tab and it re-resumes the newest
  thread. *Rule:* before mounting a stateful shared component twice, make the shared selection a
  CONTROLLED prop held above both mounts (`undefined` = uncontrolled and byte-identical for legacy
  callers; `null` = no selection — the two must stay distinct). **And move the "already showing this"
  early-return off the selection onto what is actually HYDRATED** — in controlled mode the parent has
  already moved the selection before the load, so an `id === activeThreadId` guard bails and the
  content never arrives. This recurs the instant any other tier gets a second Paige door.

- **Correct code that renders NOTHING, silently (2026-08-19).** *Symptom:* the Fleet Console 3D field
  drew zero nodes in production while `tsc` and `vite` were green; three sessions guessed at it.
  *Root cause (the real one, after a zero-height red herring):* `withAlpha()` turned modern
  space-separated `hsl(H S% L%)` into `hsla(H S% L%, A)` — mixing legacy and modern CSS colour syntax.
  Browsers reject it, so **every** `addColorStop`/`fillStyle` threw or no-oped. Correct form is the
  slash syntax `hsl(H S% L% / A)`. *Why it stayed hidden:* the error boundary rendered `null` with no
  `console.error`. *Rule:* §32 — a green build proves types, never render. Crash-prone runtime logic
  (canvas/WebGL/parsers/samplers) gets LOUD failure (`console.error` **and** a visible message) plus
  event-driven sizing (`ResizeObserver`), never `getBoundingClientRect()` re-measured in a paint loop.
  Making the failure visible turned a multi-session guess into a one-line fix.

- **Two disagreeing numbers usually hide a real defect — don't "fix the copy" (2026-08-19).**
  *Symptom:* Systems Check said *"10 checks"* in one place and *5* in another; both offered remedies
  (wire 5 more / change the wording) were wrong. *Root cause:* ten checks DO run — `pass 4 + fail 1 = 5`,
  so **five SKIP every hour**, including `operator_cross_tenant_canary`, a **blocking** check that has
  never run (an unassessed §9 cross-tenant blind spot). A 4/5 ratio silently drops the skips and
  flatters the surface. *Rule:* when two numbers disagree, **query the rows and find out why** before
  changing either. Render `4 of 10` + *"5 could not run"*, and name each skip and its reason.

- **Don't declare a capability missing off one narrow grep (2026-08-19).** *Symptom:* a first pass
  grepped two edge functions for one keyword and reported Paige's brain as barely built. The owner
  pushed back — *"can we do a search on her brain if you're not seeing it? We spent a little time
  developing some form of a brain for her."* *Root cause:* the brain is FOUR layers under different
  names (`owner-context.ts` §52 context · memory fabric + `paige_prompt_memory` · `paige-context-router`
  for per-contact scope · `paige-mcp` tool registry), and none of them contain the searched keyword.
  *Rule:* search by ARCHITECTURE (migrations, `_shared/`, edge-fn names) before concluding something
  is unbuilt — and see `paige-brain-wiring-standard.md` §2, which now names all four layers so the next
  session doesn't repeat the search. The narrow finding *was* right (Systems Check is unwired); the
  characterisation of the surrounding system was not.

- **The "Supabase Preview" check fails on a PRE-EXISTING bootstrap collision — NOT on your migration
  (2026-08-19).** *Symptom:* any PR touching `supabase/**` gets a red **Supabase Preview** check:
  `ERROR: relation "profiles" already exists (SQLSTATE 42P07) At statement: 7 — CREATE TABLE
  public.profiles`. It reads like the PR's migration broke something. *Root cause:* the preview branch
  replays the ENTIRE migration history from scratch, and **two of the oldest migrations both create
  `public.profiles` unguarded** — `20250908112334_remote_bootstrap.sql:27` (`uuid_generate_v4()`, no UNIQUE) and
  `20251009234919_3d7566f7-…sql:11` (`gen_random_uuid()`, `user_id` UNIQUE) — neither uses
  `IF NOT EXISTS`. The replay builds the table from the first and dies on the second, roughly 200
  migrations BEFORE anything a current PR adds. `At statement: 7` is the ZERO-INDEXED statement
  *within that migration file* (seven `CREATE TYPE`s precede it), not the 7th statement of the run —
  do not read it as "it failed almost immediately". Prod is unaffected because it applied these incrementally against its own `schema_migrations` ledger and
  never replays. *Rule:* when this check goes red, **read the failing statement before assuming it is
  yours.** If the SQL quoted is not in your diff, it is this. Verify with
  `grep -rln -- "-- Create profiles table" supabase/migrations/`. The decisive proof on #554: pushing a
  **markdown-only** commit reproduced the identical failure — a commit that touches no SQL at all cannot
  break a migration. It is invisible on PRs with no `supabase/**` change (the integration skips them),
  which is why it can look new.
  **Standing risk (owner decision owed):** every future migration-carrying PR will show this red, which
  trains everyone to ignore a check — the classic route to missing a real one. The fix is either
  guarding those two bootstrap `CREATE TABLE`s or turning the preview integration off; editing historical
  migrations is not a thing to do casually mid-fire.

- **A CONFLICTED PR silently suppresses every `pull_request` workflow — that is NOT "Actions is broken"
  (2026-08-19).** *Symptom:* PR #554 showed only Vercel + Supabase checks. No `ci`, no `lint`, no
  `verify`, no `prove`. A stale plan note said "GitHub Actions has not run on this repo since
  2026-08-18 21:10 UTC", and that got repeated to the owner **twice** as "an account-level Actions/
  billing setting only you can fix." *Root cause:* GitHub runs `pull_request`-event workflows against
  `refs/pull/<N>/merge`, which **does not exist while the PR has merge conflicts**. #554 was created
  already conflicted (main had moved at 21:03 via the squash-merge of #553), so every commit pushed
  to it produced zero Actions runs. The instant the conflict was resolved, all four jobs fired within
  seconds. Actions had in fact been running all day — `ci.yml` alone had 8 successful runs that
  afternoon (18:12, 18:29, 18:44, 18:56, 19:20, 19:23, 19:33, 21:03). *Rule:* **"no workflow runs on
  this PR" is a symptom with two very different causes — check the PR's mergeability BEFORE concluding
  anything about Actions health.** Verify with `list_workflow_runs` on the repo (does ANY branch have
  recent runs?) rather than inferring repo-wide state from one PR's check list. And never escalate an
  infrastructure claim to the owner off a plan-file note without re-verifying it — a stale "honest
  limit" repeated confidently is indistinguishable from a fresh finding, and it burns the owner's time
  on a non-problem. Related trap: `deploy-migrations.yml` only triggers on pushes to `main` that touch
  `supabase/migrations/**`, so an idle run history for it is normal and is NOT evidence of a broken
  pipeline either.

- **A check that has never failed is an untested branch, not evidence — negative-control every guard
  (2026-08-23).** *Symptom:* the Super Admin design pack's compiled `standalone.html` had been swept for
  §50 marks and format-valid identifiers on every delivery, always clean. *Root cause:* the standalone
  stores its payload as a **gzip+base64 `__bundler/manifest`**, so a plaintext `grep` across the file was
  reading compressed bytes. It could not have found a mark if one were there — the sweep was structurally
  incapable of failing, and its green was pure noise. The same session produced a second instance of the
  identical class: the screenshot tool selected the theme toggle by matching its label, but the label names
  the **current** theme rather than the target, so 64 frames were captured and captioned with inverted
  themes before anyone noticed. Both passed. Both proved nothing. *Rule:* **before trusting a guard's
  green, make it go red on purpose.** Every checker gets a negative control — feed it the thing it is
  supposed to catch and confirm it fails. For anything that inspects a compiled, bundled, minified or
  compressed artifact, **unpack first and assert the unpacked content matches its source**; a substring
  search over an opaque blob is not a check. For anything that sets state before observing (a theme, a
  route, a feature flag), **read the state back and refuse to record a result you cannot confirm** rather
  than assuming the setter worked. `scripts/live-drive/pack-verify.mjs` (`npm run verify:pack`) is the
  worked example: it gunzips the manifest, asserts each bundled asset is byte-identical to its source file,
  then sweeps the decompressed text — and both arms are negative-controlled in the commit that added them.
  *Second-order trap from the same investigation:* plaintext-matching source literals against that opaque
  blob scored 2/40, which nearly became a confident report that the vendor's artifact was not a build of
  our source at all. It was byte-identical once unpacked. **A measurement you do not understand the
  encoding of produces a number, not a finding** — unpack before you accuse.

- **A screenshot is not a test — and a comment is an assertion (2026-08-23).** *Symptom:* three
  separate things read as verified without having been verified — an audit log labelled
  `immutable · Live` when append-only was only a GRANT; screenshot frames captioned with a theme the
  tool never read back; a hard reload defended by a comment that had been false since 2026-07-28.
  *Root cause:* in each case the confidence of the artifact is what stopped anyone re-checking it.
  *Rules:* **derive it or verify it, never assert it** — and a comment justifying a mechanism should
  **name what it depends on**, so the day the dependency changes the comment becomes falsifiable
  rather than merely old. Second half, found while building the design harness: **four of five defect
  fixtures render byte-identical** — a missing `min-width:0` with nothing to provoke it, a sub-AA
  colour on small text, and content below the fold all look the same at viewport scale. So **the
  assertions are the evidence; the frame is only the record.** Never review a clean-looking frame and
  conclude the checks passed. A human eye catches geometry, proportion, rhythm, type and colour
  relationships; it cannot catch an unprovoked min-width defect or 4.3:1 vs 4.5:1.

- **A gitignore matching one spelling of a path protects a coincidence (2026-08-23).** *Symptom:*
  five PNGs committed into a docs-and-tooling branch. *Root cause:* the harness resolved its artifact
  directory from `cwd`, so running its selftest from a subdirectory wrote a nested
  `scripts/live-drive/artifacts/` tree that the ignore rule — which names the real path — did not
  match. *Rule:* **a tool's output location must not depend on where it was invoked from**; resolve
  from `import.meta.dirname`. And read the staged file list before pushing, not after.

- **A bug in its JURISDICTION, not in the mechanism (2026-08-23).** Four instances in one session,
  and none was a broken mechanism — each was a competent mechanism pointed at something it did not
  own. That is why they survive review: they read as correct, because they are, just about the
  wrong subject.

  | Instance | Correct about | Claimed authority over |
  |---|---|---|
  | Audit log labelled `immutable · Live` | that append-only was intended | a DB guarantee that was only a GRANT |
  | Harness asserting slot geometry | the five properties worth checking | an IA it would have been *handed* rather than read |
  | Test requiring absence body length + banning "coming soon" | constraints on a CC draft | how a **design-owned surface** reads |
  | Design screen map: Catalog/Sales have "no repo substrate" | the surfaces and their contract | **the contents of a repo the design side cannot see** |

  The pattern runs in BOTH directions — the fourth is a design artifact reaching into
  implementation, the third an implementation test reaching into design. So the question is not
  ownership-of-role, it is scope-of-claim.

  **The question to ask of any new guard, test, label, or doc claim:** *what does this claim
  authority over, and do we own that?* "Is it correct?" does not catch this class, because the
  answer is usually yes.

- **A one-sided negative control proves agreement, not derivation (2026-08-23).** A contract test
  that reads a source and compares must be falsified from BOTH sides. Editing our copy and watching
  it fail proves only that the two agree today. Editing **the source** and watching it fail is what
  proves the test is reading the source rather than agreeing with itself — a test that had silently
  stopped reading the file would pass the first control forever. Applies to every contract test:
  the IA-vs-pack slots test, the absence-copy test, and any that follow.

---

## A subtab canvas is not a second page shell (2026-08-28)

**Symptom.** A feature-rich subtab design accumulated a route title, status copy, and banner-like
chrome beneath an already complete Clients shell. The extra context looked helpful in isolation but
made the real constrained workspace feel crowded and disconnected from its sibling tabs.

**Rule.** Establish the exact visual ownership rectangle before composing a subtab. For Solo Clients,
the shell owns account context and `People · Conversations · Calendar · Portal`; Conversations owns
only the bounded canvas below it. Keep relationship and provider truth inside the operating workspace,
not in another hero. Protect the boundary with rendered checks and explicit forbidden-copy regressions.

---

*When a new class of mistake costs real time, add it here (symptom → root cause → rule) in the same
commit as the fix — a lesson only helps if the next session can find it.*

## service_role grants are invisible to every pre-merge check we run (2026-08-20, second occurrence)

**The class.** A `BEGIN..ROLLBACK` proof runs as the table OWNER. A headless smoke over pure logic
never touches the database. So a missing `service_role` grant passes every pre-merge gate and only
fails at runtime — where, if the calling code swallows the error, it fails *silently and plausibly*.

**First occurrence:** hotfix #94, the `paige_systems_check_*` family — caught by a §32.c live drive.
**Second occurrence:** A2's alerting evaluator, caught by the §32.a post-merge scan.
`tenant_revenue_classification` had NO service_role grant at all (only `authenticated` and
`postgres`), and `readTenantsAtRisk` destructured the error away — `{ data: revenue }` — so the
permission denial produced an empty classification map, which read as "no tenant is internal", so
the platform's own fixtures counted as at-risk CUSTOMER tenants. A silently inflated number in the
signal whose whole job is to be trusted.

**Why it is worth a lesson and not just a fix.** A2's own module header states the rule it broke:
*a reader that cannot produce a real number returns unreadable, never 0*. The rule was written and
then violated three functions below, because the failure arrived as an empty array rather than a
thrown error. **An exclusion list that failed to load is not an empty exclusion list.**

**Standing checks when adding an edge-function read of a table the function has not read before:**
1. `select has_table_privilege('service_role','public.<table>','SELECT')` on prod — before merge, not after.
2. Destructure and check `error` on EVERY supabase read. A `{ data }`-only destructure is the bug.
3. Ask what the empty/default value MEANS downstream. An empty filter list that silently disables a
   filter is the dangerous shape; a count that silently reads 0 is the same class.

- A UUID default is not a complete identity contract. Every producer must converge on a required immutable tenant binding, and an AI-facing lookup must return a stable human reference while resolving the internal UUID only inside a server-validated tenant boundary. A service-role query with an ID filter is not tenant safety unless the tenant predicate is present in the same query.
## A predicate proof is not a write proof (2026-09-01, #695 → #699)

**Symptom.** A one-time backfill in `20260901010000` chose a primary phone number for any workspace
that had an active number and no *active* primary. Reviewed, proven, merged. It aborts the whole
migration with `23505 duplicate key value violates unique constraint
"uq_tenant_phone_numbers_primary"` — **but only against one specific live state, and being precise
about which one is part of the lesson.** The collision needs BOTH conditions true at once for the
same tenant, at the moment the migration runs: an inactive row still holding `is_primary` (so the
tenant's single primary slot is occupied), AND an active row the backfill's `select distinct on`
picks for it. Either alone is harmless — a tenant whose flag was since cleared, or one with no
active number, produces no collision. History does not matter; the state at run time does.

**Root cause.** The index is `UNIQUE (tenant_id) WHERE is_primary` — **no status predicate**. The
guard `... and p.status = 'active'` was added during review on correct reasoning (a workspace whose
only primary is released has not really chosen anything, so back-fill it). In exactly the state the
new guard was written to catch, the SELECT picks the active row and the UPDATE then collides with
the released row still occupying the tenant's single primary slot.

**What the proof did, and what it therefore could not see.** The review proved the guard
"discriminates" by running the SELECT: with the guard it picks 1 row, without it picks 0. That is a
true statement about a predicate. The defect lives in the *write*, which was never run. **A proof
that exercises the read half of a read-modify-write proves the half that cannot fail.**

**Why the fix is a trigger and not another guard.** `20261020000000` makes the state unreachable:
`is_primary` is cleared whenever a row moves off `active`. A CHECK was rejected deliberately — it
would *refuse* the write that retires a primary number, turning an ordinary act into an error the
caller has to pre-empt. Clear the flag with the transition instead of blocking the transition.

**Standing checks when a migration modifies rows under a partial unique index:**
1. Run the actual `UPDATE`/`INSERT` inside `BEGIN … ROLLBACK`, against the state the guard was
   written for. Never accept the `SELECT` as the proof.
2. Read the index definition, not its name. `uq_..._primary` says nothing about which predicate is
   in the `WHERE`, and the missing `status` is the entire bug.
3. Ask whether the bad state should be *guarded against* or made *unreachable*. Repeated guards
   against a state the schema still permits is the signal that the invariant belongs in the schema.

**Second instance of the same class in one wave.** `comms_buy_number`'s schema marks
`monthly_cents` required — and tool calling is automatic and non-strict, so `required` is not
runtime validation. A malformed amount decayed to `undefined`, `comms-purchase-number` read the
absent amount as the legacy "price shown in the UI" path, skipped verification, and **bought the
number**. A declared contract is not an enforced one; the guard is `isSpendableQuoteCents`, and it
was extracted into `_shared/purchase-quote.ts` precisely because a money-path guard inside a
function with no runtime harness is a guard nobody can prove.

## A default is not a guarantee, and a prompt is not an enforcement (2026-09-01, #707)

**Symptom.** A brain record about the number-purchase path stated: *"Purchase is never autonomous
and is never retried."* Both halves are false, and the record was written by the same session that
had built the path.

**Root cause, in two parts.**

1. **Default mistaken for guarantee.** `resolveToolAutonomy` defaults to `confirm` — its own
   comment says *"safe default — never assume autopilot"* — so the observed behaviour is always a
   confirmation. But `comms_buy_number` is a registered switchable tool, and at `auto` the gate
   comments its own behaviour plainly: *"autoMode === 'auto' … fall through to execute."* A
   validly-quoted purchase then runs with no confirmation. What was observed was the default; what
   was written down was a property.
2. **Prompt mistaken for mechanism.** *"A refusal is final for that number, pick another rather
   than retrying"* and *"do not buy a replacement"* live in the tool **description**. They steer a
   model. Nothing rejects a retry. Enforcement and instruction read identically in a diff, and only
   one of them survives a model that ignores it.

**Why this one is worth a lesson.** It landed **in the close-out record itself** — the document
written to stop exactly this. The sweep half of the close-out step looks for claims the change
*falsified*; it does not look for claims the author *overstated*, and an overstatement about a
safety property is the more dangerous of the two, because the next session quotes it as settled.

**The rule.** When recording anything protective, separate it by strength and say which is which:

| Strength | Means | Example — **note every one names its lane; that is the point** |
|---|---|---|
| **Enforced** | code refuses; no configuration changes it | **in the `comms_buy_number` lane**, no purchase without a whole, positive `monthly_cents`, and the server re-verifies it. The two UI lanes send no amount and skip the check entirely |
| **Configurable** | safe today, a setting away from not being | **in the agent lane**, `confirm` is the default; a workspace may set `auto` and lose the confirmation |
| **Prompt-level** | steers a model; nothing rejects the act | "don't retry this number", "don't buy a replacement" — tool-description text only. **And the rule binding `confirm:true` to a human's yes** — the system prompt and the `needs_confirm` note both said ask first; nothing checked that anyone did. *(FIXED 2026-09-01: the flag must now spend a server-minted proposal created before the turn. The prompt text is still only steering — it is no longer the only thing there.)* |
| **Enforced but self-asserted** | code refuses without an assertion the actor can **MINT ITSELF**, and validates only its value — not who issued it. Real against an actor that omits it, worthless against one that supplies it. **The property is mintability, not who transmits it:** a JWT or capability token is also actor-supplied, and is strong precisely because the actor cannot create one the server will accept | the `confirm` gate: `index.ts` ~5973 genuinely refuses whenever `gateArgs.confirm !== true`, so it stops a model that simply calls the tool. But `gateArgs` is the model's own output, so the flag is self-minted and the gate constrains only the careless case. **Splitting this row out is the correction — calling the whole thing prompt-level was itself an overstatement in the other direction.** *(The EXAMPLE was fixed 2026-09-01 — `confirm:true` must now spend a server-minted proposal predating the turn. The row's vocabulary is the durable part and stands; do not read the example as current state.)* |
| **Best-effort** | attempted, and a failure changes nothing | the `audit_logs` write after a purchase: non-blocking by design, so a charge with no audit row is reachable |

Never write "never" about the bottom three rows. For anything money-, permission-, or
tenant-boundary-shaped, name the lane that removes the protection **in the same sentence** as the
protection — a reader who has to go find the exception will not.

**The examples above are deliberately written the long way.** An earlier version of this table put
*"no purchase without a whole, positive `monthly_cents`; server re-verifies the price"* in the
Enforced row, unqualified — and the review caught that the lesson was handing future authors the
exact unsafe sentence to copy, two paragraphs above the analysis explaining why it was false. **A
rule whose own example violates it teaches the violation**, because the example is what gets
copied and the prose is what gets skimmed.

**How it was caught, honestly:** not by me. The §39 peer-gate caught it — an automated reviewer
reading the actual diff, which is precisely the layer that exists because the author's own proof
cannot see what the author already believes.

**It then happened TWICE MORE, in the fix for it.** The corrected text — written while composing
this very lesson — still carried two overstatements, both caught on the next review round:

1. *"Every money-spent exit writes an audit row"*, filed under **Enforced**. `writePurchaseAudit`
   is non-blocking **by design** — its own comment says a failed audit must not turn a completed
   purchase into a reported failure — so a failed insert is logged and nothing else changes. A
   completed charge with no audit row is reachable. The exit *attempts* the write.
2. *"No purchase without a whole, positive `monthly_cents`"* and *"the server re-verifies"*, both
   stated categorically. They bind the **agent lane only**. Solo `PhoneSetupPanel` and legacy
   `NumbersTab` post `{ phone_number }` with no amount, and the server's check is guarded on
   `if (agreedMonthlyCents !== null)` — skipped entirely for them.

**That recurrence is the actual lesson, and it is worth more than the original.** Knowing the rule
did not prevent breaking it three times in one wave, because the failure is not ignorance — it is
that a protection you built *feels* total from the inside. The author remembers the guard they
wrote and not the branch that skips it. So the rule needs a mechanical form, not a principle:

> Before writing any protective sentence, find the code that makes it true, and then find **every
> caller that does not go through it**. If you have not enumerated the callers, write "in the
> `<lane>` lane" instead of a bare claim — and if you cannot name the lane, you do not yet know
> what you are asserting.

That is §37's producer inventory pointed at prose instead of an endpoint, and it applies for the
same reason: what breaks a categorical claim is always the caller nobody listed.

### And then, one round later, the hardest one — with the over-correction that followed it

Having written that rule, the record still described the agent `confirm` lane as the one carrying
complete authorization: operator sees the amount, confirms, server re-verifies. **The middle step
is not what it looks like.** The gate tests `gateArgs.confirm`, which is
`JSON.parse(tc.function.arguments)` — the model's own output. Nothing ties it to the
`needs_confirm` that preceded it or to anything a human said, so a model emitting `confirm:true`
on its first call executes immediately. The platform already has the enforced pattern — outbound
sends file a real approval row and wait — and this gate does not use it.

> **CLOSED 2026-09-01.** It uses one now. `confirm:true` must spend a server-minted
> `paige_tool_confirmations` row bound to the TOOL — and, for a listed set, an identity subset;
> NOT the whole arguments, which livelocked and was blocked — plus the requester and the tenant,
> unspent, unexpired, and created *before the turn began* — mirroring
> `pipeline_archive_confirmations` (#709) rather than forking a rival seam. The finding above
> stands as written; only its present tense expired. **The bound is still honest: an intervening
> turn is not a human's yes.** That last step needs per-surface UI work and is tracked separately.

**It survived the rule that was written to catch it.** I had just committed *"find the code that
makes it true, then find every caller that does not go through it"*, applied it to the price
check, and never applied it to the confirmation — because the confirmation *looks* like a
mechanism. Two-step handshake, a system prompt, a tool note, and precisely the right behaviour
every time the model complies. **A well-behaved actor is observationally identical to a guard.**
Nothing you can watch distinguishes them; the only test is to find the line that would refuse.

**And then the correction over-shot, which is the last turn of the screw.** The first fix called
the whole thing prompt-level — *"nothing rejects the act"* — and that is also false. Line ~5973
genuinely refuses whenever `gateArgs.confirm !== true`, so the gate is real against an actor that
simply omits the flag; it is worthless only against one that supplies it. Two layers, not one:
an **enforced but self-asserted** gate, and a **prompt-level** rule binding the assertion to a
human. Hence the fifth row in the table above.

**The generalisable part:** when a protection turns out weaker than claimed, the reflex is to
reclassify it to the bottom. Ask instead *what does it still stop?* A gate that constrains the
careless case and not the deliberate one is neither "enforced" nor "nothing" — and if the
vocabulary has no row for it, add one rather than rounding to the nearest existing label.

**And then the new row's own definition was wrong, which is where this entry stops.** It first read
*"code refuses without a token the ACTOR supplies"* — but a JWT is actor-supplied and is strong,
precisely because the actor cannot create one the server will accept. The property is
**mintability**, not who transmits the value: the gate is weak because the model can produce the
accepted assertion itself and the server validates only its value, never its issuer. Getting that
wrong would have classified session tokens as weak protections.

**The last round found three defects, all of them the SAME correction failing to propagate** — the
two-layer distinction had been applied to three places and was needed in six, so a risk cell still
named only `auto` as the unattended path, and a summary sentence still said "every confirmation is
prompt-level". That is this entry's own second rule failing on this entry: *search and assess every
occurrence.* Applying a correction where you were looking is not applying it.

**Why this is where it stops, stated rather than left implicit.** Successive rounds moved from
wrong claims, to wrong verification, to wrong placement, to a wrong definition inside the fix for a
wrong classification. Each was real and each was smaller. The record is now accurate on every point
anyone raised, and the remaining risk is no longer in this text — it is in the two product defects
it documents, which are filed as their own work.


## A verification sweep that filters by content deletes the evidence (2026-09-01, #708)

**Symptom.** A change removed two vendored skill bundles and their assembled `LICENSE`. The
close-out sweep for claims the change falsified was reported clean. Two files still asserted the
redistribution had happened, and pointed readers at the two deleted paths — one of them
`config-registry.md`, the mandatory source for that configuration.

**Root cause — the sweep, not the writing.** The command was:

```
grep -rn "vendored" docs/ | grep -iv "not vendored\|before vendoring\|the vendoring was"
```

Every `-v` term had been added to suppress a line already known to be fine. **Both offending lines
matched one of those exclusions.** The filter written to reduce noise removed exactly the signal.

**Why this is worse than the spelling problem the close-out step already warns about.** Varying the
spelling can only *miss* a hit that was never retrieved. A content filter *deletes* a hit you had
in hand — and it fails **silently**, because the output looks identical whether the sweep found
nothing or hid everything. There is no signal distinguishing "clean" from "blinded".

**The rules, both cheap. Note what each one is about — the property, not the mechanism:**

1. **Every omitted match must stay auditable.** The defect was not `grep -v` as such; it was that
   the excluded set vanished without being seen or counted. A **path** filter hides a stale claim
   just as effectively — narrowing to `docs/brain/` would have missed a `docs/doctrine/` copy — so
   "filter by path, not content" is the wrong invariant. A content filter is fine *when the excluded
   stream is retained and READ*. **Counting it is not enough** — in the anchoring incident the
   excluded stream contained both stale claims, so `wc -l` would have reported "2 omitted",
   satisfied any "reviewed or counted" wording, and revealed neither. A count establishes that
   omissions exist; it says nothing about whether they are false. If a count is all you have, any
   **nonzero** result has to trigger reading them. In practice: sweep unfiltered and read the hits,
   or if volume genuinely forces narrowing, read what the narrowing removed. Output too long to
   read is information about the claim's blast radius, not permission to stop looking.
2. **Search and assess EVERY occurrence; correct each one that is actually false.** Not "fix it
   everywhere" — identical wording can appear in a dated decision-log entry that was true when
   written, in a quotation, in a corrections log that must name what it reversed (§50), or in a
   scope where the claim still holds. Rewriting those corrupts an honest record rather than
   repairing it, and §58 forbids purging legitimate audit entries. The failure being guarded
   against is *not looking* at the other occurrences, which is different from *not changing* them.
   In the anchoring case all three happened to be false and all three were changed — that was the
   finding, not the rule.

**Both rules above were themselves over-stated in their first draft, and that is the sharpest thing
in this entry.** They began as *"narrow by path, never by content"* and *"fix a flagged claim
everywhere"* — a banned mechanism and a universal instruction, written inside a lesson about not
generalising past the evidence. Review caught both: a path filter hides just as well, and blanket
"fix everywhere" would have someone rewrite a dated log entry that was true when written.

The generalisation is the reflex, not the exception. A rule derived from one incident wants to be
stated as a mechanism (*don't use this tool*) because that is concrete and checkable, when what the
incident actually taught is a property (*don't leave omissions unaudited*).

**This is not an argument against mechanism-form rules as such** — and that qualifier is itself a
correction, because the first draft of this paragraph said the mechanism form is simply "wrong".
Where a mechanism genuinely has no permitted safe use, banning it outright is the right control and
is *meant* to be blunt: §50's prohibition on the listed third-party marks is exactly that, and a
meta-rule that reads as "prefer properties to mechanisms" could be used to argue it down. The
failure mode is narrower — a mechanism-form rule that **overgeneralises past its evidence**, so it
forbids safe uses of the named tool while permitting the same failure by other means.

The test, which distinguishes the two cases: state what property was violated, then ask whether the
rule as phrased would catch a version of the failure **using different means**. If it would not, it
describes the incident rather than the lesson. If it would — because the mechanism itself is the
whole hazard — the mechanism form is correct and should stay blunt.

**Recorded here rather than in a sibling PR, and that is part of the lesson too.** These two defects
were found reviewing this change, and the first draft put them in a different PR's branch to avoid
a merge conflict in this file. That defers the capture to another PR's merge and ordering — §BRAIN.3
says *same change*, and "it was more convenient to put it elsewhere" is precisely the reasoning the
rule exists to refuse. Caught on review, in a PR whose own subject is making that capture
enforceable.

## A file listing is not a file reading (2026-09-01, #708 → corrected same day)

**What happened.** A whole doctrine artifact — a `.claude/skills/README.md`, a `.gitignore` comment,
a `config-registry` row, a brain index row and a long dated `decision-log` entry — was written,
reviewed across eight rounds, and merged, asserting that the §69 delivery skill arrives
**half-installed** on every fresh container: *"the account-synced copy is `SKILL.md` and nothing else
— no `references/`, no `templates/`."*

The premise was false. The synced `SKILL.md` is **77,739 bytes** and inlines every `references/*.md`
and the template under a heading that says so in plain words: *"Inlined references (self-contained ·
2026-08-30)."* Somebody had already solved the sync limitation days earlier. A fresh container
receives the complete skill, and §69 was never best-effort.

**The mechanism.** A `find` was run. It printed one `SKILL.md` per synced skill and no `references/`
directory. That listing was treated as an inventory of **content**. It is an inventory of **names**.
The 77 KB size was in the same output, in the same column, the entire time — the evidence that would
have falsified the claim was already on screen and was read past. Opening the file cost one command.

**Why the reviews did not catch it.** They were not asked to. Eight rounds examined whether the
reasoning was sound, whether the claim was over-stated, whether the licence inference was safe,
whether the sweep was honest — and each of those found something real. Not one of them opened the
file the argument was about, because the premise was presented as an observation rather than as a
claim, and observations do not look like the thing to check.

> **A review grades the argument. It does not grade the evidence the argument stands on.**
> An unexamined premise inherits the credibility of everything correct that was built on top of it,
> and the more careful the superstructure, the more solid the foundation appears.

**The rules this leaves.**

- **`find` / `ls` / `wc -l` answer "what is named" and "how big". They never answer "what is in it."**
  Any claim about content is a claim about content, and needs the file opened. A size that looks
  wrong for the claim — 77 KB for a file asserted to be a bare index — is the tell.
- **State a premise as a claim, so it can be checked.** "The synced copy is `SKILL.md` only" reads as
  a finding. "I ran `find` and saw one filename, and did not open it" reads as what it was, and any
  reviewer would have opened it.
- **Sweep your own merged work when a later finding contradicts it.** The correction here touched
  five files; only one was the file the mistake was made in. This is exactly the Gate-6 sweep,
  pointed at yesterday's own commit.
- **The correction is worth more than the conclusion was.** The blocker recorded in #708 (the MIT
  notice cannot be reconstructed) is still entirely true and still stands. What collapsed was the
  urgency around it — and the fix that followed, shipping our close-out as our *own* repo-local
  skill, is better than the vendoring it had been reaching for.

**Related:** *"A predicate proof is not a write proof"* (a proof exercising the wrong statement) and
*"A verification sweep that filters by content deletes the evidence"* (a search that hid its own
answer) — both above, both 2026-09-01. Three variants of one failure in a day: **the check ran, and
it was not a check of the thing.**

## Every gate we run is blind to SQL — third occurrence (2026-09-01, the confirm-binding migration)

**What happened.** The migration adding `paige_tool_confirmations` shipped an INSERT with **five
target columns and four values** — `args_hash`, the column the whole mechanism binds on, was
missing from the `values` list. Every confirm-gated tool call would have raised
`42601 INSERT has more target columns than expressions` at runtime, in the one code path that
decides whether 52 mutating tools may execute.

**What passed anyway, all of it green:**

| Gate | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `vitest run` | 124 files, 1630 tests, all passing |
| `npm run build` | built clean |
| `lint:views` · `lint:definer-fns` · `lint:tier-features` · `lint:shadow-vars` · `lint:tool-catalogue` · `lint:operator-reach` · `smoke:comms-webhook-auth` | all PASS |

Not one of them parses SQL. They cannot: the migration is a text file that no TypeScript
tool-chain reads and no CI job executes. **A green pre-merge run says nothing whatsoever about
whether a migration is valid**, and a defect this crude survived every single check.

The §32 `BEGIN … ROLLBACK` proof caught it on the first attempt, in the first thirty seconds.

**This is the THIRD time this class has cost us.** See *"service_role grants are invisible to every
pre-merge check we run"* (2026-08-20, itself logged as a second occurrence) and *"Migration
merged-but-never-applied — the false-green"* (§32 / #275). Same shape each time: the SQL layer is
outside the reach of everything that reports "green", so confidence from the other gates is
confidence about a different artifact.

**The rules.**

- **Never merge a migration on the strength of tsc/tests/build/lints.** They are evidence about the
  TypeScript. Run the SQL. `BEGIN … ROLLBACK` costs one call.
- **Make the proof BEHAVIOURAL, not just syntactic.** Executing the DDL proves it parses. It does
  not prove the thing works. This proof asserted nine properties against the real database —
  same-turn refusal, cross-action, cross-tool and cross-user refusal, single-use, later-turn
  success, and both RPCs closed to non-`service_role` — and reported `pass=9 fail=0`. A DDL-only
  proof would have caught the missing column but nothing about whether the guard actually guards.
- **Force the rollback structurally.** Ending the block with `raise exception` carrying the results
  aborts the transaction by construction, so the proof cannot half-apply if something later in the
  batch fails. Verify afterwards that `to_regclass` and the migration ledger are still null/0 —
  a rollback you did not check is a rollback you are assuming.
- **A green suite next to a red artifact is worse than a red suite**, because it is read as
  permission to stop looking.

## A proof only tests what crosses its own boundary (2026-09-01, the confirm-binding livelock)

**What happened.** The first version of the confirm-binding hashed the **whole argument object** and
required the confirming call to reproduce it. Against that, the evidence looked overwhelming:

- 11 behavioural assertions against the real database, `pass=N fail=0`
- 28 unit tests on the decision module
- a **negative control** proving those tests reject the old implementation
- `tsc` 0 · 1630 vitest tests · production build · seven CI lint gates
- a CI script that imports and executes the real edge handler: 71 passed

Every one of them passed. The design was **unusable**.

Conversation history is rebuilt as `{ role, content }` only — tool calls and tool results **do not
cross a turn boundary** — and Approve sends the literal words "Approved — run it." So on the
confirming turn the model has to regenerate its arguments from prose. For `document_generate`,
whose `blocks` argument *is* the authored document, two generations are never byte-equal. Approve →
re-author → hash differs → refuse → re-propose. Forever, silently, with nothing executing and no
error surfaced. The same file already carried a comment recording that exact re-ask loop as a flaky
model bug; the hash would have made it structural.

**Why nothing caught it.** Look at where each proof lives:

| Proof | What it crossed | What it could never cross |
|---|---|---|
| SQL `BEGIN…ROLLBACK` | the database boundary | hashes were passed in **as literals** — no arguments were ever generated |
| Unit tests | the function boundary | hand-written 1–2 key objects — nothing re-authored |
| CI handler harness | one HTTP request | **one** turn; it never sends a second |
| tsc / build / lints | the type and syntax boundary | behaviour of any kind |

The defect lived in the gap **between two turns**, and not one instrument reached across it. This
is the sharpest form of a lesson already recorded twice here — *a predicate proof is not a write
proof*, *a sweep that filters by content deletes the evidence*. Same shape again: **the check ran,
and it was not a check of the thing.**

**What actually caught it:** the §39 peer-gate — an independent adversarial read of the pushed diff,
whose brief was explicitly *"find what those assertions structurally could not test."* It traced the
history construction, found `aiMessages.push({ role, content })`, and reasoned about what the model
would have to do on the next turn. No test did that, because no test could.

**The rules.**

- **Before trusting a proof, name its boundary.** Write down what the instrument crosses and what it
  cannot. If the defect class you care about lives outside every boundary you listed, you have no
  coverage, however many assertions are green.
- **Multi-turn behaviour needs a multi-turn instrument, or an adversarial reader.** We have neither
  a two-turn harness nor a reason to build one for this alone — so the peer-gate is the control, and
  it is not optional on anything whose correctness spans turns.
- **Ask what the model must REPRODUCE.** Any cross-turn binding is a demand for regeneration. If the
  thing being bound cannot be regenerated, the binding is a livelock rather than a guard. The design
  rule is *bind only on what the model can reproduce* — a value it can read back out of its own
  prose, or a stable id it can look up again. **Not** "only what the human saw": that was the first
  wording here, and the shipped map already breaks it for three tier-2 ids, so it described an
  intention rather than the code.
- **A second round found a second livelock inside the fix for the first.** The supersede keyed on
  the tool while the claim keyed on tool+identity, so proposing a second subject retired the first
  at birth and a batch ("delete these two contacts") could never execute either. Same silent shape,
  different clause. **When you fix a livelock, check that the fix's own keys agree with each other**
  — and add the assertion that would have caught it, which here was simply *two identities on one
  tool*. The eleven assertions that passed reused a single identity throughout.
- **A silent livelock is worse than an error.** The refusal path logged and re-proposed, so the
  system looked like it was politely asking again. Failure modes that resemble normal operation are
  the ones that survive review.

## Hand-applying a migration ahead of its merge WEDGES the deploy chain (2026-09-01, #711 / issue #198)

**What I was solving.** `deploy-edge-functions.yml` and `deploy-migrations.yml` are two independent
workflows on the same `push: main`, with no ordering between them. #711's gate fails **closed**, so
if the edge bundle landed first, every confirm-lane tool across the platform would silently stall —
a re-ask loop, not an error — until the migration caught up. Real risk, correctly identified.

**What I did.** Applied the migration to prod myself via the Supabase MCP `apply_migration` just
before merging, so the guard would already exist when the code arrived.

**What broke.** `apply_migration` **records its own ledger version from the current timestamp** —
`20260901150312` — which matches no file in `supabase/migrations/`. `supabase db push` then refuses
to do anything at all:

```
Remote migration versions not found in local migrations directory.
supabase migration repair --status reverted 20260901150312
```

The pre-apply meant to avoid a few-minute window instead **wedged the entire migration chain**, and
`deploy-migrations.yml`'s own header says exactly what that costs: *"a wedged chain blocks all later
deploys."* Every subsequent migration merge, by anyone, would have failed until it was cleared.

**The fix** is the CLI's own prescription: delete the orphan ledger row (the OBJECTS are fine — only
the ledger entry was wrong), then re-run. `db push` applied the canonical version idempotently
(`create table if not exists` / `create or replace function`) and recorded it.

**The rules.**

- **Do not hand-apply a migration under a generated version.** If a pre-apply is genuinely needed,
  execute the SQL *and* insert the ledger row under **the repo file's own version string**, so the
  ledger matches `supabase/migrations/` exactly. `apply_migration` will not do that for you.
- **Better: don't pre-apply.** Weigh the actual window. Minutes of a fail-closed guard being absent
  is usually cheaper than a wedged chain that blocks everyone. Reach for deploy ordering, or land
  the migration in an earlier merge, before reaching for a manual apply.
- **A manual apply is not "the same thing CI does."** CI applies *and* records under the repo's
  version. Doing half of that leaves prod in a state the tooling actively rejects.
- **Check the ledger, not just the objects.** The objects existed and were correct the whole time.
  Every schema query I ran said healthy. The damage was in a table I had not thought to look at —
  which is the same shape as the day's other lessons: *the check ran, and it was not a check of the
  thing.*

**Related:** *"Migration merged-but-never-applied — the false-green"* (§32/#275) is the opposite
failure, and this one is what happens when you over-correct for it.

---

## Widening an implementation without widening the interface that declares it (2026-09-01, #717)

**What broke.** `useSoloNumbers` exposes its shape through an exported interface,
`SoloNumbersData`. I widened the *implementation* — `purchase(phoneNumber, agreedMonthlyCents)` —
and the *call site* in `settings.tsx`, and left the interface at one parameter. The consumer is
typed against the interface, so the second argument had nowhere to land:

```
src/solo/settings.tsx: error TS2554: Expected 1 arguments, but got 2.
```

**Why the suite did not catch it.** It could not. `settings.numbers.test.tsx` renders the REAL
component through the REAL hook and mocks only the Supabase client, so it asserted the true thing —
that the request body carries `agreed_monthly_cents: 120` — and passed, correctly. The runtime path
was right the whole time. Only the *declared contract* was stale, and a stale type is invisible to
every test that runs the code. **1680 passing tests are not a typecheck**, in the same way a green
build is not a working render (§32).

**Why I did not catch it either.** I reported "tsc 0" for this branch. That result was real, and it
was for an earlier state of the tree — the final call-site edit came after it, and I never re-ran.
`npm run ci:tsc` uses the same `tsconfig.app.json` as `npm run typecheck`, so there was no
environment difference and nothing subtle: I quoted a gate's verdict from before the last edit.

**The rules.**

- **Re-run the gates AFTER the last edit, not once during the work.** A green result is a statement
  about a tree state. Quoting it for a different tree state is the same class of claim as reporting
  a hoped-for outcome (§13), even when every individual run was honest.
- **When you change a function's signature, grep for every place that DECLARES it, not just every
  place that calls it.** `grep -rn "purchase: ("` would have found the interface in one command.
  An exported interface is a second declaration site that the compiler enforces and no test runs.
- **Read the step list before reading the log.** Four tool calls went into scanning a 9,487-line
  job log whose tail showed everything passing, because the failing step ran early and every later
  step carries `if: !cancelled()`. `actions_get / get_workflow_job` returns a per-step
  conclusion array and named the failing step (#32, "Typecheck (ratchet)") immediately.
- **The local gate set is the CI gate set, not the subset you remember.** `ci.yml` runs ~28 checks
  in `verify`; running seven and calling it green is a partial answer reported as a complete one.
