
# Paige Skills + Business Verification + Browser Use

Three new capability layers, all wired to the existing sub-agent + MCP + RLS patterns. Autonomous skill creation enabled (per your call), with a kill-switch and full audit log so nothing runs silently.

---

## Layer 1 — Paige Skills Registry

A reusable "skill" = a named recipe Paige (or any sub-agent) can execute. Different from sub-agents: skills are *composable steps*, sub-agents are *roles*.

**New tables**
- `paige_skills` — id, slug, name, description, trigger_phrases[], input_schema (jsonb), steps (jsonb), allowed_tools[], risk_level (`read_only` | `draft` | `mutating` | `external_send`), status (`active` | `draft` | `disabled`), created_by (`system` | `paige` | `<admin_id>`), version, success_rate, run_count
- `paige_skill_runs` — id, skill_id, contact_id?, invoker, inputs, steps_log (jsonb), outputs, status, duration_ms, error
- `paige_skill_proposals` — Paige's self-drafted skills awaiting auto-publish or admin review

**Autonomous self-creation flow**
1. Paige drafts skill → writes to `paige_skill_proposals`
2. Auto-publish rules:
   - `read_only` + `draft` → publish immediately
   - `mutating` + `external_send` → publish immediately *but* first 3 runs require admin one-click confirm (safety rail even in fully autonomous mode — non-negotiable for FCRA/GLBA exposure)
3. Every proposal + run logged to `paige_audit_log`
4. Admin kill-switch at `/admin/skills` → disable any skill instantly

**Seeded skills (v1)**
1. **`draft_and_email_document`** — Generate doc (proposal, summary, action plan) via Lovable AI → render PDF → email via Resend → log to `communication_log`
2. **`verify_business_sos`** — Calls the Verification Agent below
3. **`build_game_plan`** — Pulls client context + KB + recent web research → produces step-by-step roadmap → saves to `client_memory` + offers to email
4. **`research_to_concept_brief`** — Firecrawl topic → synthesize → output structured concept brief (problem / approach / risks / next steps)

**UI**
- `/admin/skills` — list, enable/disable, view runs, review proposals, test-fire
- Surface in Paige chat: `/skills` slash menu + auto-suggest when trigger phrases match
- MCP exposure: `list_skills`, `run_skill`, `get_skill_run` tools added to `paige-mcp`

---

## Layer 2 — Business Verification Agent

New sub-agent `business-verifier`. Auto-runs on client/business creation; also callable as a skill.

**Sources (free, ship today via Firecrawl)**
- 50-state Secretary of State portals (state-by-state URL map)
- OpenCorporates
- SEC EDGAR
- SAM.gov entity registration
- IRS EIN exempt org lookup
- USPTO trademark
- BBB
- Google Business Profile (public page scrape)
- USPS address validation (free tier)
- FDIC BankFind (already integrated)

**Pluggable adapter pattern (paid sources)**
`supabase/functions/_shared/businessVerifyAdapters/` with one file per source:
- `dnb.ts` — D&B Direct+ stub (requires `DNB_API_KEY` + `DNB_API_SECRET`)
- `lexisnexis.ts` — LexisNexis Risk Business InstantID stub (requires `LEXISNEXIS_*` + GLBA permissible-purpose config)
- `transunion.ts` — TU Business stub
- `array.ts` — Array stub

Each adapter exports a uniform `verify(business): Promise<VerificationResult>`. Returns `{ available: false, reason: 'credentials_not_configured' }` until you add the secret — then it auto-activates. Zero code changes when keys land.

**Output**
- `business_verifications` table: per-source results, mismatches, confidence score, raw payloads
- **Verification Score** (0–100) surfaced on `ContactDetail` + `FundingLensHub`
- Mismatch flags (e.g. "SoS principal address differs from client-submitted address") → auto-create approval task

**Trigger**
- Database trigger on `businesses` insert → fires `business-verifier` edge function
- Manual re-run button on contact detail

---

## Layer 3 — Browser Use (Browserbase)

For authenticated portals + JS-heavy pages where Firecrawl alone won't cut it.

**Provider**: Browserbase (cleanest Playwright-compatible API, pay-per-session). You'll need to sign up and I'll request `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` via add_secret.

**New edge function**: `browser-use`
- Accepts: `{ goal, start_url, steps[], credentials_ref? }`
- Spins up Browserbase session → runs Playwright steps → returns screenshots + extracted data + session replay URL
- Credentials never logged; pulled from secrets by name only
- All sessions logged to `browser_use_sessions` with cost tracking

**Initial use cases wired**
- SoS lookups behind CAPTCHAs (CA, NY, TX have them)
- Nav.com business credit pulls (when you add the institutional account)
- SmartCredit.com consumer pulls (when you add the institutional account)
- Bank portal balance verification (future)

**Cost guardrails**
- Per-tenant monthly session cap (default 200) in `paige_config`
- Auto-disable + admin alert when cap hit
- Skill-level cost estimate shown before run for any skill that invokes Browser Use

---

## Files I'll create / change

**Migrations**
- `paige_skills`, `paige_skill_runs`, `paige_skill_proposals`, `business_verifications`, `browser_use_sessions` (with GRANTs + RLS per project doctrine)
- Trigger on `businesses` insert → enqueue verification

**Edge functions**
- `supabase/functions/skill-runner/index.ts`
- `supabase/functions/skill-forge/index.ts` (Paige's self-drafting)
- `supabase/functions/business-verifier/index.ts`
- `supabase/functions/browser-use/index.ts`
- `supabase/functions/_shared/businessVerifyAdapters/{dnb,lexisnexis,transunion,array,sos,opencorporates}.ts`
- Extend `paige-mcp` with 6 new tools

**Frontend**
- `/admin/skills` — `SkillsHub.tsx`, `SkillDetail.tsx`, `SkillProposalReview.tsx`
- `BusinessVerificationCard.tsx` on `ContactDetail`
- Slash-menu integration in existing Paige chat surfaces

**Secrets requested**
- `BROWSERBASE_API_KEY`, `BROWSERBASE_PROJECT_ID` (when you're ready)
- D&B / LexisNexis / TU keys stay un-added; adapters detect absence and stay inert

---

## Out of scope (intentional)
- No real D&B/LexisNexis/TU calls until you have contracts — only adapter scaffolding
- No Computer Use (Anthropic) — Browserbase covers the same ground cheaper for our use cases
- No browser automation against client banking portals beyond Nav/SmartCredit (compliance scope creep)

---

## Order of build (single turn)
1. Migrations (all 5 tables + trigger + GRANTs)
2. Adapter scaffolding + business-verifier edge function
3. skill-runner + skill-forge edge functions
4. browser-use edge function (inert until Browserbase key added)
5. MCP tool additions
6. `/admin/skills` UI + ContactDetail verification card
7. Seed 4 starter skills

Then I'll ask for Browserbase credentials so Layer 3 goes live.
