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

### 4a. Premerge proof said green after saying it proved nothing (2026-08-24)

- **Symptom:** `premerge-migration-proof` reported success after the disposable baseline restore
  failed; the candidate-application step was skipped and the workflow's own comment said the
  migration was not evaluated.
- **Root cause:** the restore shell explicitly converted failure into `exit 0`, and every later step
  depended on a `restore_ok=true` output. GitHub therefore saw a successful job even though no
  candidate application or behavioral proof occurred.
- **Rule:** Migration proof is fail-closed. Restoration, ordered identification of one or more
  candidates, fingerprinted application of every candidate, post-application schema evidence, and
  a changed behavioral SQL proof are all required. An always-run final verdict independently rejects
  missing state, skipped phases, missing/mismatched fingerprints, empty schema evidence, or failed
  proofs. Compatibility helpers belong only in the disposable proof fixture tree, never in
  production migrations.
- **Current status:** draft and blocked. The negative fail-closed path is proven; a genuine successful
  disposable restore, candidate application, and behavioral proof are not yet proven. The vulnerable
  PR workflow is temporarily disabled pending a trusted sanitized baseline and approved credential model.

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
