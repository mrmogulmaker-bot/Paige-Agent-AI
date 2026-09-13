# E7 — Governed Calendar-link sharing — evidence package

**Status: SHIPPED LIVE (2026-09-13, Gate A — owner authorized the release).**
Merged to `main` as squash [`5fbb7c1b`](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/commit/5fbb7c1baeb277b6bbeaaeb04f2ce533df389943) (PR #1252, off `main` `ec59415d`). **Deployed + persisted (§32.a):**
`deploy-migrations` run #269 applied `20270315000000` + `20270316000000` — the pipeline's PERSISTED-verify
step read prod `schema_migrations` and confirmed BOTH versions recorded remotely; `db-live` moved to
`5fbb7c1b`, `db-live..main` on `supabase/migrations` empty (zero migration drift). `deploy-edge-functions`
run #323 redeployed `paige-ai-chat` (it imports the new `_shared` modules); `edge-live` moved to
`5fbb7c1b`, zero edge drift. The owner authorized building E7 end-to-end "through review, required CI,
release-ready evidence, and a separate final release decision," then approved the release; this package
is that record.

## What E7 is (owner-locked scope)

Paige prepares a **published** calendar's public booking link (`/book/{slug}`) and, after the
confirm gate, **sends** it to a tenant contact by **email or SMS** through the ONE canonical comms
seam; enumerates the tenant's **connected social channels** and hands back **copy-ready** post text;
and offers copy-ready text whenever no channel is eligible. It is a **comms-governed send of a
read-only calendar link** — NOT a calendar write, and NOT the FU-2 booking/reschedule/cancel path.

**Social decision (owner ruling 2026-09-13):** the governed social-**post** executor does not exist
(only social **connection** is built), and the owner's "no second social adapter" rule means E7 must
not invent one. So social is **copy-ready only** — E7 enumerates connected accounts and prepares post
text; it **never posts and never claims a post happened**. (Building a real social publisher is the
separate, un-built "Social Ops" workstream — surfaced to the owner as the §00 incompatibility, and
the owner chose copy-ready.)

## The seams E7 REUSES (no second system — §18)

| Need | Canonical seam reused | E7's use |
|---|---|---|
| "Is this calendar publicly shareable in this tenant now?" | **NEW** `public.calendar_link_shareable` — reuses `_assert_can_manage_preset` (§59 caller scope) and mirrors `public-booking` `loadCalendar` (`enabled=true` AND ≥1 host) | the gate before any link is composed |
| Email / SMS send | `send-message` edge fn (channel-adapter registry) | E7 is a NEW consumer; adds NO field to its contract (§37) |
| Consent / DND / suppression / quiet-hours | `runPreSend` (`_shared/pre-send-pipeline.ts`) | eligibility preview; the send re-runs the same pipeline inside send-message (preview can never be more permissive) |
| Recipient identity + cross-tenant refusal | `send-message`'s `clients`→tenant resolution (`forbidden_cross_tenant_contact` / `forbidden_cross_tenant` / `recipient_contact_mismatch`) | the send's §9 gate stays live because E7 forwards the CALLER JWT (never the service-role bearer) |
| Outbound Rail record | `send-message`'s own `record_rail_event("comms.outbound")` on real send | E7 files NO second Rail event or receipt (one home) |
| Connected social channels | `public.social_account_status()` (caller JWT — authenticated-only) | enumerate for copy-ready only |
| Autonomy catalogue (operator can flip/disable) | `public.list_tool_autonomy` | `calendar_link_send` added (HIGH) |
| Confirm gate | the inline `paige-ai-chat` `paige_pending_confirmations` gate, driven by `action-risk` classification | `calendar_link_send` = `high`; the two reads are `read_only` |

## The diff (all additive)

**New**
- `supabase/migrations/20270315000000_calendar_link_shareable.sql` — the shareability gate RPC (SECURITY DEFINER, §59; REVOKE anon, GRANT authenticated+service_role).
- `supabase/migrations/20270316000000_calendar_link_tool_autonomy_catalogue.sql` — CREATE OR REPLACE `list_tool_autonomy`, re-declaring the COMPLETE prior catalogue (from `20270305000000`) + one new row `calendar_link_send` (HIGH). **§58: every prior row preserved.**
- `supabase/functions/_shared/calendar-link-tenant-brain.ts` — the adapter (prepare / send / social_copy; the pure `mapSendOutcome` + `verdictFromPreSend`).
- `supabase/functions/_shared/paige-spine/domains/calendar_link.ts` — 2 READ spine capabilities (`calendar_link.prepare`, `calendar_link.social_copy`) + 3 model tools.
- `supabase/tests/calendar_link_shareable.sql` — 24-assertion pgTAP suite.
- `scripts/calendar-link-share-smoke.mts` — 42-assertion adapter adversarial smoke.

**Modified (additive / union-mergeable vs PR #1234)**
- `_shared/paige-spine/registry.ts` — import + spread the 2 reads.
- `_shared/action-risk.ts` — +1 RISK row `calendar_link_send` = `high`.
- `paige-ai-chat/index.ts` — 6 additive wiring sites (tool spread · TOOL_LABELS · describeConfirm · describeStep chips · dispatch else-if · tool→panel map).
- `scripts/ci/action-risk-lint.mjs` — teach the lint about `calendar_link.ts` (as E5 did for `calendar_preset.ts`).
- `.github/workflows/calendar-preset-seam.yml` — wire the E7 pgTAP + adapter smoke as permanent gates.

## The readback-truth invariant (the §13/§70 heart)

`send-message` returns **HTTP 200 always**, wire `status:"sent"|"failed"`, and the **true**
disposition in `outcome` (`sent` | `failed` | `blocked_*` | `queued_*` | `queued_scheduled`). A
queued or blocked send returns `status:"failed"` with `outcome:queued_*`/`blocked_*`; the scheduled
path can even return wire `status:"sent"` with `outcome:queued_scheduled`. Therefore
`mapSendOutcome` keys **only on `outcome`** and reports `success:true` **only** for
`outcome==="sent"`. Everything else — queued, refused, failed, `needs_config` (e.g. SMS with no
approved A2P), unknown — is reported as itself and **never** as a success. There is no false success.

## Proof (this session, headless)

- **pgTAP — `calendar_link_shareable` — 24/24 PASS** on real Postgres 16 against the REAL
  `_assert_can_manage_preset` + real lifecycle migrations (`20270301000000`/`20270302000000`, each
  applied twice = replay/idempotence): live shareable; draft/paused/archived not-public
  (`CALENDAR_NOT_PUBLIC`); enabled-but-zero-hosts (`CALENDAR_NO_HOST`); cross-tenant service-role
  `42501`; forged/missing `P0002`; non-manager JWT `42501`; platform-admin resolves; anon EXECUTE
  revoked (live `SET ROLE anon` refused); SECURITY DEFINER + pinned search_path.
- **Adapter smoke — 42/42 PASS** (`node --experimental-strip-types scripts/calendar-link-share-smoke.mts`):
  the readback trap (queued/scheduled/blocked/failed/`needs_config`/missing-outcome never reported as
  sent; success only on `outcome==="sent"` + provider id); per-channel eligibility (email default-allow
  vs SMS consent-deny; no-address ineligible; quiet-hours → `will_queue` not ineligible; read-error →
  held); prepare (book_url composed; connected-only social; non-public → NO book_url/copy_ready;
  account-switch → `ACTIVE_ACCOUNT_CHANGED`; forged → `CALENDAR_NOT_FOUND`; non-manager →
  `CALENDAR_FORBIDDEN`); send (sent→success+id; queued→not success; a2p→failed; **every refusal —
  non-public, no-address, account-switch, forged/cross-tenant contact — makes NO provider call**);
  social_copy (`posted:false`/`sent:false`, never claims a post).
- **Lints (Node) — GREEN for E7's additions:** PAIGE Spine registry (37 capabilities, +2 reads),
  `action-risk-lint --self-test`, `action-risk-lint` (calendar_link resolved), `tool-catalogue-lint`
  (calendar_link_send catalogued), `chat-tool-registry-lint` (0 new inline tools), `one-approval-gate`,
  `governed-execution`.

## Independent review (§39 adversarial + §5 compliance/security)

Both ran on the real diff as distinct seats (§5/§39). Core verdict: **the security + honesty core is
SOUND** — no false success, no cross-tenant send, in-body §59 scope, correct confirm-gating, no second
system, honest social, §37 clean, §58 catalogue preserved (0 dropped, +1). **§5 = SHIP** (no BLOCKER/
MAJOR). §39 found **two MAJORs**, both resolved:

- **MAJOR-1 — plus-addressed email silently rejected (FIXED + tested).** The adapter passed
  `to: normalizeAddress(...)`, which folds an email `+tag` (`user+tag@x.com` → `user@x.com`);
  send-message re-derives the contact's raw address and its identity check does NOT `+tag`-fold, so it
  rejected the send as `recipient_contact_mismatch`. Fix: pass the **raw** address (send-message +
  runPreSend normalize internally). New smoke assertion T29a proves the raw `+tag` address is passed.
- **MAJOR-2 — `list_tool_autonomy` full-overwrite merge hazard (RELEASE GATE — CLEARED + PROVEN 2026-09-13).**
  The catalogue migration is a full re-declaration rebased on `20270305000000`; a concurrent catalogue
  migration landing around it could silently revert its rows (§58). Release gate discharged at release:
  fresh `main` was unchanged at `ec59415d` (no concurrent catalogue migration landed — `20270305000000`
  is still the latest prior definer), and the key diff was re-run on **real Postgres 16** — the baseline
  `20270305000000` returns **134 rows**, `20270316000000` returns **135**, with **0 rows dropped or
  overwritten and exactly 1 added** (`calendar_link_send | Send a booking link to a contact | Calendar`),
  every prior row preserved with identical label + category. The `deploy-migrations` PERSISTED-verify then
  confirmed both versions recorded on prod (zero drift).

Also applied: **§5 MINOR-2** (custom-**email** body now composed as escaped HTML with `<br>` + a
clickable `<a>` link, not a run-on plain line — smoke T29b/T29c), the **§39 MINOR** (the `high`
confirm card now NAMES the recipient's channel address, resolved in-tenant under the caller JWT,
fail-safe to "this contact"), and the **§39 TRIVIAL** (`prepare` now guards `!share.slug` like its
siblings). Adapter smoke went 39 → **42** assertions.

## Honest pre-existing baseline (§13 — NOT introduced by E7)

`action-risk-lint` and `tool-catalogue-lint` still report **`nav_pull_business_credit`** and
**`smartcredit_pull_snapshot`** (2 credit-pull tools) as classified/mutating without a declaring
surface / catalogue row. These are **pre-existing on `origin/main`** (confirmed: classified there;
E7's diff does not touch them) and are part of the advisory `ci` baseline. E7 adds **zero** new lint
failures. They are out of E7 scope.

## PROOF — discharged at release vs. still owed (§32.c / §70)

**DISCHARGED at release:**
- **`deno check`** on `paige-ai-chat/index.ts` — the `ci`/`verify` Deno ratchet (affected edge functions),
  typecheck ratchet, and build all passed on the merge head `647b30f6` with **zero new diagnostics** from
  the E7 edits (this was the item owed to CI in the build commit body).
- **Migration persisted on prod** — `deploy-migrations` run #269's PERSISTED-verify step read prod
  `schema_migrations` and confirmed BOTH `20270315000000` and `20270316000000` recorded; `db-live` = merge
  SHA, zero drift.

**STILL OWED — needs a browser/JWT/prod-SQL-capable session (cannot be produced headless here):**
- **Authenticated in-chat live-drive** — a real owner, in a real workspace, in Paige chat: prepare → confirm →
  send a booking link to a real contact by email; observe the true outcome; verify the contact
  receives the `/book` link; verify SMS honestly degrades where A2P isn't approved; verify a
  non-public calendar refuses; verify copy-ready social. Owed to a browser/JWT-capable session.
- **`/book/{slug}` origin confirmation** — E7 composes the link from `PUBLIC_SITE_URL` (the same env
  `send-transactional-email` uses for recipient-facing links). Confirm on the live app that
  `/book/{slug}` renders on that origin (vs an `app.` subdomain). Config item, not a code defect.
- **Direct prod-SQL object read** — the migration versions are confirmed persisted (above); the finer
  object-granularity read — `calendar_link_shareable` exists in `pg_proc` and `list_tool_autonomy` returns
  the `calendar_link_send` row on prod — is owed to a prod-SQL-capable session (MCP prod SQL is
  permission-denied this session).

## Held OUT of E7 (separate, explicitly scoped)

- A real governed **social-post** executor (the un-built Social Ops publisher). E7 is copy-ready only.
- Registering `calendar_link_send` in the **Spine manifest** (needs the `registry.ts` validator's
  edge-executor allowlist — the riskiest #1234 collision line; deferred, no enforcement lost since the
  confirm gate is action-risk-driven).
- The E6-era follow-ups (MED-1 / MED-3 / LOW-2 / LOW-3-B2 / agency direct-write) — untouched.

## Release governance

Internal build identity: this branch's head (to be pinned at release). Deployment effect on release:
`deploy-migrations` applies `20270315000000` + `20270316000000`; `deploy-edge-functions` redeploys
`paige-ai-chat` (it imports the new `_shared` modules). No change to `send-message`, `public-booking`,
or any other function's contract. Classification: internal-only. Customer release: none.
Recovery: the RPCs are additive (a forward migration can `REVOKE`/replace); the chat tools are gated
and can be removed by reverting the additive wiring.
