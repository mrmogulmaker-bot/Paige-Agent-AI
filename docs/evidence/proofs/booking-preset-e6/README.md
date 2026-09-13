# E6 — Calendar Security · Proof · Reviews — RELEASE-READY DRAFT (HOLD release)

**Status: RELEASE-READY DRAFT, HELD.** Owner ruling (2026-09-13): *"Keep E6 strictly separate from E5.
… do not fold it into #1220 or release it without its own review, evidence, and release decision."*
This is the ONE Calendar slice where §4/§69 pre-launch merge-on-verified is **overridden by an explicit
owner HOLD** — E6 is a draft PR presented for the owner's release decision, not an auto-merge.

**What E6 is (grounded, §13):** E3 (server seam), E4 (human surface), and E5 (Paige chat adoption) each
already SHIPPED and are LIVE (`edge-live=688613db`, `db-live=5d65a96f`, zero drift). The 11 Calendar
DEFINER functions are already §59-compliant in CODE. **E6 is therefore NOT net-new capability — it is the
consolidation/hardening/proof-and-review pass** that closes the proof-as-CI-gate, security-registry, and
independent-review gaps left by shipping E3/E4/E5 individually, plus fixes the clearly-correct security
findings the review surfaced, and routes the product/write-contract decisions to the owner.

Branch: `claude/calendar-paige-e6` (off `origin/main` @ `cd76d67c`). §00: zero design/UI surface — this
is backend security/proof/correctness, squarely CC's lane.

---

## 1. What this draft SHIPS (implemented + proven here)

| # | Change | Proof |
|---|---|---|
| B | **Repeatable pgTAP CI gate for the E3 server seam** — `supabase/tests/calendar_booking_preset_seam.sql` (112 assertions) + `.github/workflows/calendar-preset-seam.yml`. Converts the one-off `docs/evidence/proofs/booking-preset-lifecycle/` transcript into a permanent gate (§32/§24). | **112/112 green, exit 0** — re-run independently by the integrator against a disposable Postgres 16 (not just the builder's claim). Covers draft-by-default, the §59 in-body 42501 on every cross-tenant/non-member verb, the three tagged publish refusals, archived-FROZEN, anon-REVOKED + a live `SET ROLE anon` refusal, service-role tenant-scoping, duplicate/archive/restore, and the migration replay (each migration applied twice, in order). |
| MED-2 | **Anon host-email PII leak — FIXED.** `resolveHostNames` (`supabase/functions/public-booking/index.ts`) no longer falls back to the host's auth email; it uses `full_name` only and OMITS a nameless host. The per-host `auth.admin.getUserById` loop is removed entirely (leak becomes structurally impossible + drops N auth calls). The guest-confirmation "With:" line (which reused the same helper) is fixed by the same change; the legitimate server-side host-notification path (host emails as email recipients, staff-facing) is untouched. | Structural removal (no email is fetched anywhere in the host-name path) + build/inspection. `grep` confirms zero `email` reference remains in `resolveHostNames`/`withHosts`. **OWED:** a dedicated resolver Deno invariant test (item C below) + authenticated runtime (§32.c). |
| A/B1 | **§124 SECURITY_DEFINER catalog registration** of the calendar seam — `docs/security/SECURITY_DEFINER_CATALOG.md` gains a Calendar section (8 preset RPCs + `_assert_can_manage_preset` + `_calendar_preset_block_reason` internal-only + the RLS predicates + the guest-booking write RPCs + `update_internal_booking`), each with its §59 in-body auth-check location and grants. The stale-since-2026-07-02 gap is closed for this seam (the global review date is deliberately NOT bumped — §13, no full re-review was done). | Every entry classified against its live body; grants proven by the pgTAP G1–G12 assertions. |
| B3 | **Doctrine currency** — `docs/doctrine/calendar-capability-contract.md` FU-2/FU-3 reconciled from "DRAFT/pre-merge/not-deployed/descriptor carries five" to shipped reality (E5 live, descriptor registers all eight). | Diff. |
| N4 | **Spine descriptor comment** `calendar_preset.ts` "these five RPCs" → "these eight RPCs". | Diff. |
| B4/§66 | **Tier matrix honesty** — `update_internal_booking` (Edit-details, PR #1176) kept "pending persisted-apply", not presented LIVE; the E6 pgTAP proof recorded against the seam. | Diff. |

Nothing in this draft changes an RPC contract, an rendered surface, or agency/provisioning behavior.

---

## 2. Independent review record (§39 adversarial peer-gate + §5 compliance)

Two independent passes read the shipped E3 seam + the anon `/book` resolver from scratch. Full findings
in the crew records; the integrator independently VERIFIED each §39 finding against source before acting.

### §39 adversarial verdict: anon boundary is SOLID; no HIGH
**Checked CLEAN (evidence-cited):** guest write path never takes `tenant_id`/host/calendar from client
input; the `enabled=true` gate is enforced on EVERY resolver path (first-class + legacy `loadHost`), and
Draft/Paused/Archived all collapse to one generic 404 (no draft-vs-nonexistent oracle); no internal-column
leak in responses (create returns `{id,start_at,end_at,title}` only); `redirect_url` is never
server-fetched (no SSRF) and the client gates `^https?://` (no scheme open-redirect); class capacity is
race-safe (`FOR UPDATE` + count) and collective double-book is blocked by a per-host EXCLUDE constraint; no
§53 global-role trap in the preset seam; every preset RPC's §59 in-body scope RAISES; the `_patch` column
allowlist blocks smuggling `enabled`/`published_at`/`tenant_id`/`slug`/`created_by`; the E5 tenant-brain
never launders authority and verifies every mutation against a fresh projection.

### Findings (all verified against source by the integrator)
| ID | Sev | Finding | Disposition |
|---|---|---|---|
| MED-2 | MED | Anon availability response leaked host auth emails (`resolveHostNames` fallback). Pre-launch blast radius ≈ 0 (no external users; hosts = owner's own team). | **FIXED in this draft** (§1). |
| MED-1 | MED | Lifecycle gates bypassable by a direct `UPDATE public.calendars SET enabled=true` — `authenticated` holds full UPDATE (`20260708215724:29` + `20260708230000:17`) and the `manage calendars` RLS policy is `FOR ALL` with NO column restriction (`20260708210000:79-90`). A tenant admin can publish/un-archive skipping the RPC bar. **INTRA-TENANT only** (WITH CHECK binds tenant_id + manage authority) — not a cross-tenant/anon breach. The `20270301000000` header's claim *"cannot be bypassed by a direct table write"* is FALSE. | **OWNER DECISION** (§3.1) — changes the write contract + entangled with born-live minters + needs authenticated verify this session lacks. |
| MED-3 | MED | round_robin/collective host-floor + team honesty not re-enforced when a host is removed via the `calendar_hosts` RLS path (not through `update_calendar_preset`) → a live 2-host round-robin silently books 1:1; removing the last host 404s a "live" page. | **OWNER DECISION** (§3.2) — behavior change (auto-pause trigger); bundle with MED-1 governance. |
| LOW-1 | LOW | `create_class_booking` is DEFINER keyed entirely on params with no in-body assert (host∈calendar / tenant match). Safe today (service-role only; resolver passes server-derived values); latent cross-tenant-write hazard for a future caller. | **OWNER DECISION / recommended additive guard** (§3.3) — exact patch below. |
| LOW-2 | LOW | Per-IP create throttle fails OPEN on limiter error (`rateLimit.ts:52,54`). Residual per-host/per-class count caps still bound per-target volume. | **OWNER DECISION** (§3.4) — small; propose `failClosed` for the create-IP bucket. |
| LOW-3/B2 | — | Two born-live minters (`components/admin/calendar/CalendarsPanel.tsx` INSERT `enabled:true`; `provision_tenant_default_calendar`) mint bookable calendars bypassing draft-by-default. NOT a security boundary (own-tenant; hostless-until-host-insert; `loadCalendar` refuses hostless). §37 anchor: "a lock that gates 4 of 5 minters is not a lock." | **OWNER DECISION** (§3.5) — reconcile to draft-by-default vs. accept-with-signed-exception; changes agency/provisioning behavior. |

### §5 compliance blocking items — status
- **B1** (catalog registration) → **closed in this draft** (§1 A/B1).
- **B2** (born-live minters) → **routed to owner** (§3.5) — the package addresses it (documents + proposes + exact options); the FIX is an owner product decision.
- **B3** (stale contract doc) → **closed in this draft** (§1 B3).
- **B4** (Edit not persisted, don't present LIVE) → **kept honest** (§1 B4/§66).

---

## 3. OWNER-DECISION items (exact patches; NOT applied — product/write-contract/behavior)

These are ready-to-apply but held for the owner because each changes shipped behavior, the write
contract, or a product default (§58/§69 material-decision — not lifted pre-launch), and each needs
authenticated verification this headless session cannot perform (§32/§70). They are bundled because
MED-1 + MED-3 + LOW-3/B2 are the same "one publish bar is the only door to `enabled=true`" question.

### 3.1 MED-1 — make the RPC publish-bar the ONLY path to `enabled`/`published_at`/`archived_at`
Preferred fix (no INSERT breakage, so the born-live INSERT minters keep working until 3.5 is decided):
a `BEFORE UPDATE` trigger that rejects a direct change to those three columns unless a session GUC set by
the RPCs is present:
```sql
-- The eight RPCs each add:  PERFORM set_config('calendar.lifecycle_write','1', true);  before their UPDATE.
CREATE OR REPLACE FUNCTION public._guard_calendar_lifecycle_cols() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.enabled IS DISTINCT FROM OLD.enabled
      OR NEW.published_at IS DISTINCT FROM OLD.published_at
      OR NEW.archived_at IS DISTINCT FROM OLD.archived_at)
     AND coalesce(current_setting('calendar.lifecycle_write', true), '') <> '1' THEN
    RAISE EXCEPTION 'calendar lifecycle columns (enabled/published_at/archived_at) may only change through the publish/pause/archive/restore RPCs'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_calendar_lifecycle BEFORE UPDATE ON public.calendars
  FOR EACH ROW EXECUTE FUNCTION public._guard_calendar_lifecycle_cols();
```
Alternative: `REVOKE UPDATE (enabled, published_at, archived_at) ON public.calendars FROM authenticated`
(column-level) — simpler, but requires a §37 sweep confirming NO legitimate authenticated producer writes
those columns directly (the E4 Settings UI uses the RPCs; verify no other client path). **Also correct the
false "direct-write-proof" claim in the `20270301000000` header** — done in DOCS here (the applied
migration file is immutable; the corrected statement lives in this package + the catalog entry). **§37
producer inventory + an authenticated verify (a tenant admin's Settings save still works) are prerequisites
before this ships.**

### 3.2 MED-3 — auto-pause a live team calendar when a host removal drops it below the bar
```sql
CREATE OR REPLACE FUNCTION public._calendar_hosts_revalidate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _cal uuid := coalesce(NEW.calendar_id, OLD.calendar_id);
BEGIN
  IF EXISTS (SELECT 1 FROM public.calendars c WHERE c.id=_cal AND c.enabled=true)
     AND public._calendar_preset_block_reason(_cal) IS NOT NULL THEN
    UPDATE public.calendars SET enabled=false WHERE id=_cal;  -- keeps published_at → reads as Paused
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_calendar_hosts_revalidate
  AFTER INSERT OR DELETE ON public.calendar_hosts
  FOR EACH ROW EXECUTE FUNCTION public._calendar_hosts_revalidate();
```
(If 3.1's GUC trigger ships, this function must set the GUC before its UPDATE.) Behavior change: a team
calendar that loses a host auto-pauses instead of silently mis-booking — surface to the owner.

### 3.3 LOW-1 — additive in-body scope assert in `create_class_booking`
```sql
-- near the top of the body, after resolving _session/_calendar:
IF NOT EXISTS (SELECT 1 FROM public.calendar_hosts h WHERE h.calendar_id=_calendar_id AND h.user_id=_host_user_id)
   OR _tenant_id IS DISTINCT FROM (SELECT tenant_id FROM public.calendars WHERE id=_calendar_id) THEN
  RAISE EXCEPTION 'create_class_booking: host/tenant not consistent with calendar' USING ERRCODE='42501';
END IF;
```
Zero regression (the sole caller — the resolver — already passes consistent server-derived values); pure
defense-in-depth for any future service-role caller. Recommended to include on owner approval; would ride
its own pgTAP assertion once the harness gains a `class_sessions`/`internal_bookings` fixture.

### 3.4 LOW-2 — fail-closed (or degraded static cap) on the create-IP throttle
Pass `failClosed=true` to the per-IP create bucket at `public-booking/index.ts:879`, or apply a degraded
static cap when the limiter RPC errors, so the primary anti-distributed-spray defense doesn't evaporate
under DB pressure. Weigh against "never block a real booking" (the current deliberate posture).

### 3.5 LOW-3/B2 — born-live minter reconciliation (product decision)
Either (a) bring `CalendarsPanel` (agency) + `provision_tenant_default_calendar` onto draft-by-default so
`publish_calendar_preset` is the ONLY door to a public page — which **changes agency + provisioning
behavior** (an agency-created calendar would start private; the default calendar would start unbookable
until published), or (b) accept the current born-live behavior with an explicit owner-signed §58/§57
exception naming both minters. **This is a product-default decision, not CC's to make.**

### 3.6 §53 review of `cancel_/reschedule_internal_booking` (adjacent seam)
These pre-E3 RPCs (`20260711340000_paige_planning.sql`) branch on `has_any_role(auth.uid(),
['admin','super_admin','coach'])` — a tenant-agnostic global-role check (§53 trap surface) — alongside
`owner/created_by = auth.uid()`. A focused §53/§59 body review is owed before they are catalog-classified;
E6 does not rubber-stamp them (recorded as a named follow-up in the §124 catalog).

---

## 4. §37 per-tier producer/consumer inventory (N1) — the preset + booking RPCs

| RPC / surface | Producers (tier) | Notes |
|---|---|---|
| 8 preset RPCs | Settings › Connections › Calendars UI via `useCalendarConnections` (Solo/Sub-account/Enterprise owner); Paige chat via `_shared/calendar-preset-tenant-brain.ts` (same tiers); `duplicate/archive/restore` also from `CalendarAdmin` (agency operator surface). All authenticated → §59 membership path. | No anon producer. Operator (God) has no tenant → tools no-op "tenant not resolved". Client/Anonymous refused by RPC scope. |
| `get_calendar_presets` | Settings hook (read), chat tenant-brain readback, `CalendarAdmin`. | Tenant-scoped; cross-tenant read RAISEs (T17). |
| `create_internal_booking` / `create_class_booking` | `public-booking` edge resolver (service-role, server-derived tenant/host); `create_internal_booking` also authenticated staff. | Guest write path; tenant_id from resolved calendar, never client input (§39 CLEAN). |
| `update_internal_booking` | `public-booking` + staff surfaces (authenticated + service_role). | NOT persisted on prod (PR #1176) — B4. |
| Direct `calendars` UPDATE (lifecycle cols) | **Any authenticated tenant admin/creator** (MED-1) + the two born-live INSERT minters (LOW-3). | The §37 gap that surfaces MED-1/B2 — the "5th minter" the lock doesn't gate. |

Consumers: the `/book/:slug` resolver reads `enabled` (the gate); the E5 tenant-brain reads
`get_calendar_presets` for verified readback; the Settings UI + `CalendarAdmin` render the lifecycle.

---

## 5. Best-in-class scheduling gap register (N2)
| Gap | In-E6? | Note |
|---|---|---|
| Reminder OUTCOME unreadable from any tenant surface (task #244) | Deferred + named | Touches the §70 owner-USE bar; fix or record as known limitation w/ recovery path. |
| Guest-facing timezone conversion at `/book` not evidenced | Deferred | Add a resolver test when item C lands. |
| External-calendar two-way busy/conflict sync (Apple honestly "not built") | Deferred | Roadmap. |
| No Paige-initiated booking/reschedule/cancel/reminder write path | Deferred | Broader FU-2 (distinct from the preset seam). |
| Recurrence editing | Excluded | Explicit scope exclusion. |

---

## 6. OWED to a capable session (§13/§32.c/§70 — NOT claimed here)
- **Prod-SQL persisted confirmation** of E3 migrations `20270301000000`/`20270302000000` (`schema_migrations` row + object existence) — MCP prod SQL is permission-denied to this headless session (the pipeline verify + `db-live` zero drift is the CI proof).
- **E4 authenticated live-drive** (New preset / New appointment persisted readback) + the 8 Solo-viewport captures.
- **E5 authenticated in-chat live-drive** (Paige create→publish→archive→restore on deployed Studio) + a finer direct prod-SQL read of the 7 `booking_preset_*` catalogue rows.
- **Item C — resolver Deno invariant tests:** extract `supabase/functions/public-booking/resolve.ts` (pure `isPubliclyBookable(cal)`, `bookingTenantId(resolvedCal)`, host-name projector) + `resolve.test.ts` in the `decide.test.ts` idiom, wired into the CI Deno step — the proper proof of the MED-2 fix + the `enabled=true` gate. Its own edge-function §37/review sub-item (not scaffolded blind here).

## 7. Named deferrals (owner-scope; NOT silently absorbed)
FU-1 per-capability Trust-Compass autonomy clamp (depends on §67/§68; interim: 7 tools catalogued at
`confirm` default + server §59 — NOT presented as delivered). FU-3 richer `record_rail_event` emission +
#244. Born-live-minter reconciliation (§3.5). The `cancel_/reschedule_internal_booking` §53 review (§3.6).

---

## 8. Release governance (per `docs/doctrine/release-governance-and-customer-update-policy.md`)
- **Internal build identity:** branch `claude/calendar-paige-e6` (draft; head SHA stamped at PR time). Ships (on owner release) the pgTAP gate + workflow + the MED-2 resolver fix + the §124/contract/spine/tier-matrix doc reconciliations. The owner-decision migrations (§3) are NOT in the draft — they apply only on owner approval.
- **Release channel:** production, via CI on the owner-authorized merge (the MED-2 resolver change deploys via `deploy-edge-functions`; no migration in the base draft unless §3 items are approved).
- **Classification:** internal-only (pre-launch; no live customers).
- **Truth boundary:** PARTIAL — the pgTAP gate is proven (112 green, re-run); the MED-2 fix is proven structurally + by build/inspection with the resolver Deno test + authenticated runtime OWED; the owner-decision items are proposed, not applied.
- **Release note required:** no (internal pre-launch).
- **Recovery:** `git revert` — additive (a new test + workflow + a doc-heavy diff + one resolver function simplified); the edge bundle redeploys the prior version.

**HELD:** do not merge/release without the owner's review + explicit release decision (owner ruling 2026-09-13).
