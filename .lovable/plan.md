## Goal
Align `complete-signup` → `handle_new_lead` bridge payload with the MMA OS sales_dept v4 contract so routing/tagging fires cleanly on first real public signup. Additive-only — no schema changes, no UI changes.

## Scope (one file)
`supabase/functions/complete-signup/index.ts` — adjust the `fireAndForgetBridge("handle_new_lead", { … })` payload only. Wizard UI, classification logic, route decision, and `clients` row write all stay untouched.

## Field changes

| Field | Today | After |
|---|---|---|
| `funding_goal_cents` | not sent | **add** — integer, `Math.round((funding_goal_usd ?? 0) * 100)` |
| `funding_goal_usd` | sent (number) | keep (back-compat, harmless extra) |
| `has_entity` | not sent (nested in `entity.status`) | **add** top-level boolean — `entity_status === "have_entity"` |
| `persona` | `credit_rebuilder` / `entrepreneur_funding` / `entrepreneur_building` | **remap** to MMA OS vocabulary: `credit` / `funding` / `business` (drop `auto` — we never default to it; persona is always classified) |
| `source` | `"self_signup_public"` | **rename** to `"paige_public_signup"` |
| `wait` | implicit fire-and-forget | already correct — no change |

Also mirror the `source` rename in the `clients` row write (`source` column) so analytics on both sides match.

## What stays exactly the same
- Wizard fields, validation, routing logic (`/workspace` vs `/signup/coach-qualify`)
- `BridgeVerb` type (`handle_new_lead` already present)
- Denylist sanitization in `mmaOsBridge.ts`
- Every other key in the payload (entity block, business block, attribution, etc.)

## Verification
- `tsgo` clean
- Manual check: log the outgoing payload shape in a comment so future eyes match it against `docs/PAIGE-MMA-OS-BRIDGE-CONTRACT.md`

## Out of scope (acknowledged from MMA OS note, no work needed)
- BTF Stall Detector (lives on MMA OS)
- Doctrine §104 positioning (strategy doc, not code)
- Day 7 (Owner Home + white-label sweep + offers schema) — next ticket
- Day 8 (`/admin/offers` UI) — after Day 7

## Estimate
~5-minute change. Ready to ship as soon as you greenlight.
