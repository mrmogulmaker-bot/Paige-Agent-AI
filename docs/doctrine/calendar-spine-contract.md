# Calendar ↔ Trust Compass integration contract

> **STATUS: RECORDED DIRECTION, NOT SHIPPED.** Owner-issued 2026-08-30 as the post-release
> shared-contract direction for Calendar. Nothing here is implemented by recording it. Any
> implementation belongs in a later isolated, explicitly authorized slice — this document
> exists so the direction survives a context reset (§BRAIN), not to authorize work.
>
> **Explicitly out of scope of this document:** PR #642 (the narrow Calendar correctness
> release) is NOT broadened by it; Settings / A2P / provider configuration are NOT touched;
> the migration-history repair work is NOT overlapped.

Calendar is a Paige Spine surface. The seven clauses below are the contract. Each is followed
by its **grounded** state in the code as of `3af567e6` — verified, not assumed, because a
contract that overstates what exists is worse than none (§13).

---

## 1. Page

Calendar remains under **Clients**. Calendar settings stay **Calendar-owned**: booking policy,
availability, calendar configuration, and notification preferences.

**State: LIVE.** `TenantCanonicalCalendarWorkspace` routes `tier === "solo"` to
`SoloCalendarWorkspace`, mounted inside the Clients workspace. Per-calendar configuration is a
drawer on the calendar itself, opened from the cog beside each calendar; there is no general
settings link out of the surface.

## 2. Rail

Every booking, move, cancellation, reminder configuration/change, notification outcome,
conflict, owner decision, and recovery result needs durable tenant-safe provenance. Use
**canonical booking/client references and observed outcomes — not invented status.**

**State: PARTIAL — and the gap is specific.**

| Rail entry | State | Evidence |
|---|---|---|
| Booking, move, cancellation | **LIVE** | `internal_bookings`, read through the tenant-isolated `list_team_bookings`; status changes go through `admin_set_booking_status`, which refuses truthfully rather than silently no-oping |
| Conflict | **LIVE** | Derived from real `[start, end)` overlap on a shared host; an empty book yields zero conflicts |
| Reminder configuration | **LIVE (read)** | `calendars.notify_config`, parsed and rendered as stored; a row storing nothing reads as nothing |
| **Notification outcome** | **UNAVAILABLE** | `booking_notifications_sent` carries `service_role_only_deny_jwt` with `USING (false)` and grants only to `service_role` (migration `20260817000000`). The delivery record exists and is **unreadable from any tenant surface.** Tracked as task #244 — needs a backend change, not a UI one |
| Owner decision, recovery result | **NOT REPORTED** | No durable record of who decided what, or what recovery followed, exists for Calendar today |

The freshness state shipped in #642 is the honest interim for the read side: when a live
refresh fails, the rows stay and the surface says they may be out of date, with a real
last-confirmed time and a retry — it never presents a stale read as current.

## 3. People

A booking links to the **canonical client/People record**. Do not duplicate client profiles or
manufacture a new identity layer.

**State: SEAM PRESENT, NOT CONSUMED.** `list_team_bookings` already returns `contact_id` in its
`RETURNS TABLE`. The Solo Calendar's `SoloBooking` type **does not carry it** — the surface
discards the canonical link and renders `guest_name` / `guest_email` off the booking row alone.
So the contract's requirement is satisfiable without any new identity layer: the reference is
already in the payload and needs adopting, not inventing. Adopting it is a later slice.

## 4. PAIGE

Paige receives only an **opaque, server-resolved Calendar/booking context reference** scoped to
the active tenant, actor, role, and account epoch. She may read and explain real scheduling
evidence, then prepare a **bounded recommendation** — a move, cancellation, availability
adjustment, or reminder change. Keep **exactly one** Paige workspace. Never paste raw booking
payloads, client messages, prompts, or credentials into chat.

**State: PARTIAL.** The Calendar's handoff is `openPaige?: () => void` — a bare shell callback
carrying **no context of any kind**. It opens the one existing Paige workspace (the single-
workspace requirement holds today by construction, since the surface never creates a second
one), but Paige receives no scheduling context, opaque or otherwise. Tracked as task #245; this
is a shared-shell contract change, not a Calendar-local one.

Because no payload crosses the seam today, the "never paste raw payloads" prohibition is
currently satisfied trivially. It becomes load-bearing the moment a reference is passed — and
the contract's answer is an **opaque server-resolved reference**, never the booking rows.

## 5. Trust Compass

**Read access comes before action.** Any write must be policy-checked for the exact
booking/action, actor, customer, and current record state; then require the appropriate
confirmation/autonomy tier. Persist source, scope, actor, authority, outcome, and recovery
path. **No silent reschedules, cancellations, reminders, or provider actions.**

**State: NOT WIRED — and the tables the clause implies do not exist.** A search of every
migration finds **no `autonomy_lanes` and no `capability_lanes`**. The autonomy vocabulary that
does exist is the action bus's `paige_action_kinds.default_autonomy_lane`, constrained to
`('auto','confirm','off')` (migration `20260711024632`) — the §16 tiers. Trust Compass backend
wiring is tracked as task #165.

Consequence to hold onto: **this clause has no enforcement substrate today.** Calendar writes
currently go through `admin_set_booking_status` / `create_internal_booking`, which enforce
tenant scope and refuse truthfully, but neither consults an autonomy tier nor persists
authority/recovery provenance. Any future Paige-initiated Calendar write must not ship before
the clamp it is supposed to pass through actually runs (§68 — a safety loop that does not run
is the failure, not the guard).

## 6. Brain

The Brain may recall **only proven, durable calendar knowledge**: scheduling outcomes,
preferences where legitimately captured, decisions, conflicts, and delivery results with
provenance. It must **not infer facts from unavailable data** or expose private raw content.

**State: NOT REPORTED.** No Calendar knowledge is recalled into any brain surface today.

Note the dependency this creates: "delivery results with provenance" is exactly the rail entry
that is **UNAVAILABLE** (§2 above). Until `booking_notifications_sent` is readable under a
tenant-safe seam, a Brain that claimed to recall delivery results would be inferring from data
it cannot see — the precise failure this clause forbids. **§2's gap blocks §6's delivery-result
recall.**

## 7. Connections / A2P boundary

Calendar may read **its own notification configuration**. It must **not** claim SMS can send, or
manage phone / A2P / provider readiness. When a Calendar reminder requires SMS, hand off to
**Settings → Connections**; that surface owns number, A2P, consent, and delivery readiness.

**State: LIVE, and deliberately narrow.** The config drawer reads `calendars.notify_config` and
renders the stored reminder channels as stored. The Connections handoff appears **only** when
this calendar's own configuration asks for `sms` or `both`, and its copy states plainly that SMS
sending capability is not read here — the surface never infers readiness it cannot see. Calendar
decides what appointment communication should happen and when; Connections decides whether an
SMS-capable channel is available and permitted; Conversations records the actual client
communication; People supplies the canonical client relationship.

---

## Existing Calendar guarantees — these remain

Real data only · class/seat folding · live invalidation · stale-read truth · one Paige
workspace · Mineral / Obsidian · the required responsive frames (1536×770, 1366×768, 1024×768,
900×1000 with PAIGE folded and open) · contained scroll ownership · focus and Escape · reduced
motion.

## What this contract needs before any of it is built

Ordered by dependency, not priority. None is authorized by this document.

1. **Task #244** — a tenant-safe read seam for `booking_notifications_sent`. Blocks the rail's
   outcome entry (§2) and the Brain's delivery-result recall (§6).
2. **Task #245** — the shared-shell contract for an opaque, server-resolved Calendar context
   reference on the PAIGE handoff (§4).
3. **Task #165** — Trust Compass backend. Blocks every write clause in §5; no Paige-initiated
   Calendar write should ship before the clamp runs.
4. **Adopt `contact_id`** on the Calendar's booking type (§3) — the smallest of the four, and
   the only one needing no backend change.

## Cross-references

§7 (Paige is the intelligent portal) · §8 (the action bus this extends rather than forks) ·
§9 (tenant isolation — every read stays server-resolved) · §10 (Paige-callable seams) ·
§13 (honest reporting — the reason every clause above carries a grounded state) ·
§16 (`auto | confirm | off`, the tiers a Calendar grant would be expressed in) ·
§32 (a registered check is not a running one) · §38 (Calendar never claims provider readiness) ·
§67 (autonomy attaches to a repeatable process, not a tool) · §68 (authority decays; a loop that
does not run is the failure) · `docs/doctrine/autonomy-architecture.md` ·
`docs/doctrine/tier-matrix.md`.
