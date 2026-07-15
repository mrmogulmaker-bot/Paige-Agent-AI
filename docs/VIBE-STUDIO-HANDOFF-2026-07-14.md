# Vibe Studio — handoff state (2026-07-14)

For a reviewer picking this up cold. Everything below was **verified against the live database**,
not inferred from code. Where something is unverified, it says so.

---

## ⛔ Read this before you touch anything

1. **NEVER run `supabase db push` / `db reset` in this repo.** Git has **475** migration files; the live
   ledger has **138** rows; the version sets are **almost entirely disjoint** (legacy of the 2026-07-05
   schema-only rebuild). `db push --dry-run` was actually executed: it **aborts** with
   `Remote migration versions not found in local migrations directory`, naming **124 ledger versions
   absent from git`. That abort is the only thing preventing a data-loss event. **Do not run the fix the
   CLI suggests** (`migration repair --status reverted`) — it would set up a replay of 475 migrations
   against prod. The only safe path is hand-applied psql, verify-then-commit.
2. **The Slice-1 build is UNCOMMITTED working-tree state** on `feat/vibe-studio`. Don't edit these files
   until the blocking fixes land, or we clobber each other.
3. **Do NOT apply migration `m4`** (`20260714092500_growth_notify_repoint.sql`). It repoints the form
   submission trigger and **breaks live form submissions** until the `growth-process-submission` edge
   function exists (Phase 4).

**Live DB access:** creds at `~/.paige-deploy.env`.
```bash
set -a; . ~/.paige-deploy.env; set +a
psql -d "$SUPABASE_DB_URL" -qtA -c "SQL"
```
Windows psql does **not** permute options after a positional arg — options first, `-d` for the URL.
Use **ASCII only** in SQL strings (an em-dash throws `invalid byte sequence for encoding UTF8`).
psql emits **CRLF** — pipe through `tr -d '\r'` before comparing values.

---

## Where the Studio actually is

**Goal (owner-locked):** a Lovable/Replit-tier page-generation Studio. Three pillars:
(1) a *designed* generation moment, (2) **canvas == published** (the preview mounts the REAL renderer,
never a lookalike), (3) conversational per-section edit.

### Built (uncommitted, on `feat/vibe-studio`)
- `src/components/admin/studio/` — `StudioShell`, `PromptComposer`, `GenerationExperience`,
  `LivePreview`, `PublishDialog`, `index.ts`
- `src/hooks/useGeneratePage.ts`
- `supabase/functions/growth-block-edit/` — **new**: the missing seam for pillar 3 (turns
  "make the headline punchier" + a block → a revised block). IDOR-safe by construction.
- `supabase/functions/_shared/growth-blocks.ts` — **new**: shared 17-type block contract + validator
  (30 unit assertions pass). `growth-page-draft` still carries a private copy — migrate it.
- `src/pages/admin/GrowthHub.tsx` — §2 de-finance of the default templates (see below)
- `src/pages/public/GrowthFunnelRenderer.tsx` — funnel page step now renders through `GrowthBlocks`
- `supabase/functions/growth-page-draft/index.ts` — generator re-tiered to Sonnet (see below)
- `src/pages/admin/CampaignsHub.tsx` — Studio tab wiring

**Status:** `tsc --noEmit` green. **Adversarial verifier + compliance officer results NOT yet applied.**
Nothing here has been driven end-to-end against a live tenant. Treat as "compiles", not "works".

### Already on `main` (pushed, `ff64bea4`)
- `src/components/growth/GrowthBlocks.tsx` — the shared **17-block renderer**. This is the load-bearing
  component: `<GrowthBlocks blocks theme brandFloor tenantId>`. Both the public page
  (`GrowthPageRenderer`) and the Studio canvas mount **this exact component**. Never fork it.
- `growth-theme.ts` (`resolveGrowthTheme`), `growth-motion.ts`
- The full migration-ledger reconciliation (see `docs/assessments/DRIFT_AUDIT_2026-07-14.md` §4b)

---

## 🚧 THE BLOCKER — the Studio is inert against prod right now

**`growth_validate_blocks` does not exist on the live database.** Verified:
```
growth_validate_blocks           -> MISSING
growth_page_upsert               -> live, but running the LEGACY inline 6-type validator
growth_page_edit_blocks          -> MISSING
```
So **all 11 expansion block types** (`testimonial, pricing, faq, stats, countdown, two_column, gallery,
steps, social_proof, media, image`) are **rejected on save** with `GROWTH_INVALID_BLOCKS`. The Studio's
entire premise — a 17-block generator — dies on the first save.

**Cause:** the Phase-1 migrations are **committed to git but never applied to prod.** Git said the
feature was done; the database says it doesn't exist.

**Fix (reviewed, non-destructive, NOT yet run):** apply via psql, verify-then-commit:
| | file | creates | destructive at apply |
|---|---|---|---|
| m1 | `20260714090000_growth_expansion_blocks_forms_funnels.sql` | `growth_funnel_sessions` table, `growth_form_upsert`, funnel session RPCs, RLS | none |
| m2 | `20260714091000_growth_authoring_seams.sql` | **`growth_validate_blocks`**, authoritative `growth_page_upsert`, `growth_page_edit_blocks` | none¹ |
| m3 | `20260714092000_growth_submission_processor.sql` | automation spine (`file_action`, `advance_action`, submission claim/complete/fail) | none |
| m4 | `20260714092500_growth_notify_repoint.sql` | **DO NOT APPLY** — breaks live form submissions | — |

¹ m2 contains a `DELETE FROM growth_funnel_steps`, but it is **inside a function body**
(`growth_funnel_upsert` full-replaces steps when a caller passes a new step list) — it runs at *call*
time, not *apply* time. m1 and m2 both `CREATE OR REPLACE growth_page_upsert`; **m2 is later and
authoritative.** Apply in order.

Then: `supabase functions deploy growth-page-draft growth-block-edit`.

---

## Findings the design crew surfaced (all verified, several still open)

1. **The publish seam already exists and the legacy path is a trap.** `growth_page_upsert` /
   `growth_page_publish` are live SECURITY DEFINER RPCs implementing a real draft→live model
   (`draft_blocks_json` → `blocks_json`). **`GrowthHub`'s `CreatePageDialog` (line ~347) predates them**
   and writes the LIVE `blocks_json` directly, then publishes with a raw
   `update growth_pages set status='published'`. If the Studio saves drafts via the RPC and publishes via
   that raw update, **the tenant gets a live, publicly-visible BLANK page while we report success.**
   The Studio uses the RPCs. **The old GrowthHub buttons should be migrated to them — still open.**

2. **`growth-page-draft` returns HTTP 200 with `{error}` on internal failure.** Any client checking
   `res.ok` treats a model outage as a successful generation and paints an empty canvas. **Still open in
   that function** (the new `growth-block-edit` returns proper non-2xx).

3. **Cross-tenant IDOR in `growth-page-draft` (LIVE IN PROD).** It authenticates the caller, then takes
   `body.tenant_id` at face value and reads brand with the **service-role key**, with no membership
   check. Any authenticated coach can read any tenant's brand by naming their UUID.
   **Owner approved the fix; not yet applied.** Fix = pin to `current_user_tenant_id()` executed in the
   caller's JWT context (the pattern `growth_page_upsert` already uses, and what `growth-block-edit` does).

4. **The mobile device toggle will LIE if built naively.** `GrowthBlocks` styles with Tailwind `md:`
   breakpoints, which resolve against the **viewport**, not the container — so a 390px frame inside a
   1440px window still renders the DESKTOP layout. Honest options: portal into a same-origin iframe
   (cloning stylesheets into its head), or **remove the toggle**. Do not ship a preview that lies.

5. **`growth_page_publish` hard-refuses unresolved `[ADD_X]` placeholders — and the generator's system
   prompt explicitly instructs the model to emit them.** So the default happy path produces a page that
   cannot publish. `PublishDialog` must preflight the RPC's own guards client-side.

6. **`theme_json` null-clobbers the tenant's brand font.** `resolveGrowthTheme` spreads
   `{...FLOOR, ...brandFloor, ...theme}` and a JS spread does **not** skip nulls; the edge fn always emits
   `font: null` when the tenant hasn't set one. Normalize once, in the hook.

7. **Brand-floor drift is the quiet canvas≠published killer.** `GrowthPageRenderer` builds `brandFloor`
   with a non-obvious mapping (`background` derives from `primary_color`; `text` is ALWAYS the hard floor).
   Use `peek_tenant_portal_brand(_slug)` — **not** `resolve_tenant_brand(_tenant_id)`; they differ in the
   logo COALESCE. Both callers must use ONE extracted builder.

8. **God/platform-staff writes into the WRONG tenant.** `useTenantContext` leaves `activeTenantId = null`
   for platform staff. The Studio must hard-gate on `activeTenantId != null`.

9. **`rich_text` cap mismatch:** `growth-page-draft`'s TS validator caps at **6000**; the SQL gate and its
   own prompt say **20000**. It is silently truncating legitimate copy. Fixed in the shared module; the
   generator still needs migrating to it.

10. **§2 violation (was live):** `GrowthHub`'s `PAGE_TEMPLATES`/`FORM_TEMPLATES` shipped credit/funding as
    **always-visible platform defaults** — "BUILD-to-FUND Sales Page", "BTF 3-Step Application", an
    **`ssn4` (SSN last-4)** form field, `credit_band`, `funding_goal`, MMA branding. Every generic tenant
    saw these. De-financed in this build. **Note the doctrine nuance:** funding is an *allowed opt-in
    offer* (§2 clarification) — it must not be a **default**. Do not "fix" this with a blanket finance
    regex; that would break a legitimate funding-coach tenant editing their own page.

11. **The generator was mis-tiered.** It called `routedChatCompletion("internal_first_draft", …)`, and
    `internal_first_draft` is in `CHEAP_KINDS` → page copy published under a tenant's brand was being
    written by **Llama-3.1-8B** (or Haiku). Re-tiered to `doc_draft` (REASONING → `claude-sonnet-5`).
    Route through the model router (§14) — never hardcode a model string.

---

## What I'd want a reviewer to check hardest

**Diff the two `GrowthBlocks` call sites.** `LivePreview` (Studio) vs `GrowthPageRenderer` (published).
If the props differ — especially `brandFloor` — the canvas **lies** about what will publish, and
canvas==published is the entire product promise. It fails silently and no test catches it.

Second: **is anything gold that isn't the publish/approve action?** (§11 — gold is spent only on the
act/approve moment.)

Third: **does the Studio work, or does it merely compile?** Nothing here has been driven against a live
tenant yet.
