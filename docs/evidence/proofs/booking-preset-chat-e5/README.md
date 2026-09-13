# E5 — Paige governed adoption of the booking-preset action path (proof)

**Branch `claude/calendar-paige-e5` / PR #1220 (DRAFT — held for the owner's separate release
decision).** E5 wires Paige's chat handler to create / revise / publish / pause / duplicate /
archive / restore booking presets through the EXACT canonical RPCs the Settings › Connections ›
Calendars UI drives — never a direct table write, never a parallel Calendar model (owner ruling
2026-09-13; §10). This records what was proven and, honestly (§13/§32), what is owed to a live drive.

## What changed (7 files)

| File | Change |
|---|---|
| `_shared/calendar-preset-tenant-brain.ts` (NEW) | Verified-mutation + list-context helper, mirroring `campaign-brief-tenant-brain.ts`. Read-before → canonical RPC → re-resolve tenant → fresh `get_calendar_presets` readback → per-verb post-condition → `recordRun` (Rail) only on a verified match. |
| `paige-spine/registry.ts` | Registered `CALENDAR_PRESET_CAPABILITIES` (removed the "not yet registered" note). |
| `_shared/action-risk.ts` | 7 `booking_preset_*` rows — publish/revise/archive `high`, create/pause/duplicate/restore `ordinary`. |
| `paige-ai-chat/index.ts` | `...CALENDAR_PRESET_TOOLS` spread + dispatch branch (list read + verified mutation, server-resolved tenant/actor, friendly error mapping) + `TOOL_LABELS` + `toolCallLabel` + `WRITE_TARGET`. |
| `_shared/paige-spine/domains/calendar_preset.ts` | §13 header-comment correction (real migrations `20270301000000`+`20270302000000`, 8 RPCs). |
| `migrations/20270303000000_…autonomy_catalogue.sql` (NEW) | `list_tool_autonomy` re-declared + the 7 mutating keys under `Calendar`. |
| `scripts/ci/action-risk-lint.mjs` | Resolver block for the new `CALENDAR_PRESET_TOOLS` catalog (as every prior domain has). |

## Governed path (per call)

Server-resolved tenant (`get_paige_persona_context`, never a tool arg) + caller uid (JWT) →
action-risk lane clamp (publish/revise/archive → the rendered approval card whose fingerprint travels
in the request body; create/pause/duplicate/restore → the compact confirm) → single-use confirmation
claim (`paige_pending_confirmations`) → canonical RPC via the caller JWT (each RPC enforces its own
§59 in-body caller scope) → tenant re-resolve → durable `get_calendar_presets` readback →
per-verb post-condition → `recordCapabilityRun` (Rail) → truthful result card. No provider connect,
send, external event, meeting link, or booking is reachable.

## Proof (headless — this session has no Deno and no authenticated browser)

- **Adversarial unit suite** `src/__tests__/calendar-preset-tenant-brain.test.ts` — **25/25 pass**
  (Vitest transpiles the `.ts`, so this also typechecks the helper). Covers every owner-required
  case: create/duplicate draft (asserting the UI-matching Mon–Fri + phone defaults — no parallel
  model), revise readback, publish → live, the three publish REFUSALS (`PRESET_NEEDS_HOSTS` /
  `PRESET_NO_HOURS` / `PRESET_NO_METHOD`) reported as the exact reason with NO Rail, pause, archive→
  restore, archived refusal, not-found-before-write, malformed args, slug-taken, thrown write,
  tenant switch AFTER the write, missing/mismatched readback (no false success), Rail retry (same
  runId), and Rail failure (not end-to-end success).
- **Spine** `paige-spine-registry` + `paige-capability-gateway` + `paige-spine-chat-binding` —
  **30/30 pass** (the registry validator accepts the 8 registered capabilities with their LIVE
  chatBinding now that the handler declares + dispatches them).
- **tsc-ratchet** — 0 new type errors (baseline 12, current 12).
- **CI guards green for this change:** `action-risk` (self-test pass; the 7 recognized via the new
  resolver block), `tool-catalogue` (7 covered by the migration), `write-targets`, `binding-ledger`,
  `migration-versions`, `governed-execution`, `definer-fns`, `regression`, `chat-tool-registry`
  (compact-authored tools not counted as hand-wired). See "inherited failures" below.
- **Migration replay** (local Postgres, in a `BEGIN … ROLLBACK`): `CREATE OR REPLACE` +
  `REVOKE`/`GRANT` apply cleanly under `ON_ERROR_STOP=1`; `list_tool_autonomy(NULL)` returns all 7
  `booking_preset_*` rows under category `Calendar` at `mode=confirm`, `is_default=true` (the safe
  default — no autonomy bypass). Catalogue key-diff vs the prior migration: **7 added, 0 removed**
  (§58 no-regression). NOTE (§32): this proves the SQL applies + executes; the PERSISTED-on-prod
  confirmation is owed to the `deploy-migrations` pipeline on merge (not done — PR is DRAFT).

## Inherited base failures (NOT E5 — present on `origin/main`, absent from this diff, per §13)

- `view-security-invoker-lint`: `public.paige_unclassified_inbound` (migration `20270115000000`).
- `action-risk` + `tool-catalogue`: `nav_pull_business_credit`, `smartcredit_pull_snapshot` orphans
  — open PR #1222 ("funding-gate harness") is actively touching those exact functions, so E5
  deliberately does NOT fold in a fix (owner: don't broaden scope; avoid the collision).
- `chat-tool-registry`: `improvement_*`, `inbox_list`, `integrations_list` baseline.

## Review outcomes (§1/§5/§39 crew on the real pushed diff `b1f02fa8`)

- **§5 compliance officer → SHIP** (for a held draft). Confirmed: exact canonical RPCs / no parallel
  model, UI-matching draft defaults, sound risk classes, no-false-success verification, §58 catalogue
  diff (0 removed / 7 added), honest DRAFT/owed-live-drive labeling. Non-blocking notes NB-1 (tier-
  matrix Agency phrasing), NB-2 (model-facing note strings — pre-existing sibling convention), NB-3
  (master-doc/brain updates owed on merge).
- **§39 adversarial peer-gate → FIX-FIRST**, then fixed. Confirmed clean: §9/§59 tenant scope (caller-
  JWT client, tenant re-resolved never taken from a model arg, cross-tenant presetId rejected twice),
  the confirm-lane clamp (a high verb can NOT be model-self-approved — it needs the body-borne card
  fingerprint), §58 catalogue, tool-name consistency across all 5 surfaces, the lint edit, and the
  actual RPC bodies vs what the tenant-brain composes. Two findings, both fixed in the follow-up commit:
  1. **MEDIUM — `toolCallLabel` mislabeled a verified-but-Rail-failed mutation for 6 of 7 verbs.** On
     `CALENDAR_PRESET_RAIL_WRITE_FAILED` the result is `success:false` but `verified:true` (the mutation
     PERSISTED); only `revise` special-cased it, so a verified **publish** whose Rail write failed would
     render "Could not publish / not live" while the `/book` page is actually live and publicly bookable
     (a §13/§32/§70 false-negative hiding a real exposure). FIXED: all 6 verbs now special-case that code
     with the truthful persisted state (publish → "public /book page IS live · Rail not recorded").
  2. **LOW — the revise success `note` omitted the coarse-projector caveat its docstring promised.**
     FIXED: the revise success note now states that title/type/duration/capacity were confirmed against
     the projection while finer fields (notice/buffers/description) were accepted by the server but not
     independently re-read.
- Also applied compliance **NB-1**: the tier-matrix E5 paragraph now says availability is bounded by the
  RPCs' §59 authority (an agency owner can drive it on its OWN book — own-tenant only), not a false
  tier-gate exclusion. Post-fix: tenant-brain suite 25/25, tsc 0-new, regression clean.
- **Honest bound on the label fix (§13):** `toolCallLabel` is a Deno-only function in the 12k-line
  `paige-ai-chat/index.ts` and cannot be imported into the Vitest harness, so the label fix is a
  mechanical mirror of the already-shipped/proven `revise` + `campaign_brief` cases, verified by
  re-reading the diff — not by a new unit test.

## Owed to a capable session (§32.c) — NOT claimed here

The authenticated, in-app live drive of Paige actually creating/publishing/etc. a booking calendar
through chat on the deployed surface is owed to a browser-capable session or the owner's live
validation. This headless session proved the governed logic and its refusals against a mock caller
port and a local Postgres replay; it did not drive the deployed authenticated Studio chat.
