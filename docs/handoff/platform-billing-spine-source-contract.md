# Platform Billing → Spine: proposed source contract (Foundation A)

> **STATUS: SHIPPED.** PR #816 merged as **`f455d8a5`** (2026-09-03) under owner Gate B; migration
> **`20261045000000` is applied on prod** and the seams below exist and are callable (verified by
> direct query, not by a green pipeline). A Spine or Rail reader may rely on §2's fields **as a
> contract**, with two live caveats: every billing table currently holds **0 rows** (no workspace has
> a mapping or a designated contact yet), and **no delivery exists** — §6 still governs, so
> `receives_billing_notices` means *designated*, never *delivered to*.
>
> **Who owns what.** Platform Billing owns this model — its terminology, authority semantics,
> source records and lifecycle rules. Spine is a **reader** of the safe subset below. Spine is not
> asked to implement a billing table, infer a missing billing policy, or fill a gap this contract
> leaves open; a gap is reported back to Billing, not resolved locally.

Owner rulings encoded: R1–R3, R8, R13 (Gate 1 packet §4.2), R18–R26 (billing notices, 2026-09-02),
R27 (terminology and non-ownership, 2026-09-02). Design: `docs/delivery/billing-foundation-a-design.md`.

---

## 1. Functional roles and eligibility (final for Foundation A)

Two **functional billing designations** exist. They are records in `platform_billing_contacts`,
made by a workspace Owner. Both confer the right to **receive** billing notices for that workspace
once delivery exists; a live primary billing contact additionally satisfies the paid-activation gate
(`paid_activation_ready`). Nothing else.

| Designation | Stored value | Who may hold it | Who may grant / revoke it |
|---|---|---|---|
| **Primary billing contact** | `designation = 'primary_contact'` | a **verified, current, active workspace Owner** (`is_tenant_owner()` true, active seat, `auth.users.email_confirmed_at` set) of a **top-level Solo** workspace | an Owner of that workspace |
| **Billing delegate** | `designation = 'delegate'` | a **verified, current, active Admin** (`tenant_members.role = 'admin'`, active seat, verified email) of the same workspace | an Owner of that workspace |

Rules that hold structurally (trigger + Owner-only RPCs, proven P23–P64):

- **Neither designation creates, changes, transfers, implies, or records legal ownership, equity,
  corporate or trust ownership, trustee status, or co-owner status.** "Owner" in eligibility means
  the workspace's existing membership ownership, read live; the designation never writes it.
- **Receive, view, manage are three separate permissions.** A designation grants *receive* only.
  `can_view_billing` and `can_manage_billing` stay **Owner-only**; plan changes, payment-method
  actions, cancellation, paid activation, and adding/removing delegates are Owner acts.
- A recipient must already hold an active seat; **no external recipient** exists.
- **No default or backfilled designation.** Existing workspaces start with none; nothing is ever
  inferred from the signed-in email.
- Eligibility is **recomputed live**. A primary contact who loses ownership, or a delegate demoted
  from Admin, keeps the row and is reported as no longer eligible; the paid-activation gate ignores
  them. Automatic revocation on role change is *not* decided.
- Agency, Enterprise, and sub-account workspaces: billing is `not_applicable`; no designation
  can exist there (trigger `billing_contact_top_level_solo_only`).
- **Promotional and trial workspaces are explicitly non-chargeable.** No designation, ledger row,
  or field in this contract makes any workspace chargeable.

## 2. Safe billing-status fields a future reader may receive

The **only** read a non-Billing surface may consume is `public.get_workspace_billing_authority()`
— `auth.uid()`-keyed, workspace derived server-side through the strict resolver, no parameters,
one row. It never returns a Stripe identifier.

| Field | Values | Meaning for a reader |
|---|---|---|
| `tenant_id` | uuid · null | the caller's active workspace **iff** they hold an active seat there; null otherwise (no fallback) |
| `scope` | `none` · `sub_account` · `agency` · `enterprise` · `top_level_solo` | which billing contract applies; only `top_level_solo` has one in A |
| `role` | the caller's active `tenant_members.role` · null | informational |
| `can_manage_billing` | bool | Owner of a top-level Solo workspace |
| `can_view_billing` | bool | Owner-only in A; a separate field on purpose |
| `receives_billing_notices` | bool | the **caller** holds a live designation here |
| `billing_account_state` | `not_applicable` · `mapped` · `ambiguous` · `absent` | mapping truth; `absent`/`ambiguous` are refusal states, never "no subscription" |
| `billing_contact_state` | `not_applicable` · `none` · `designated` · `designated_needs_attention` | whether a verified current Owner is designated primary billing contact |
| `paid_activation_ready` | bool | ≥1 live primary contact who is still a verified, current Owner |

A reader renders these words truthfully. It does **not** derive "no subscription", "unpaid",
"Owner", or any money figure from them.

## 3. Two different questions: recipient-specific notice history vs workspace billing health

| Question | Whose | Source (future) | Rule |
|---|---|---|---|
| "What billing notices were sent to **me**?" | the designated recipient | `platform_billing_notification_log` rows where `recipient_user_id = auth.uid()` — **no reader exists in A** | recipient-specific; never shows another person's rows |
| "Is **this workspace's** billing healthy?" | the workspace Owner | the authority read (§2) plus, later, an Owner-authorised summary of the ledger — **no reader exists in A** | Owner-authorised; a delegate does not get it (`can_view_billing=false`) |

The two must never be merged into one feed. A Rail that shows "billing" activity to a workspace
shows the Owner-authorised health view; a notice history is per recipient.

## 4. Event vocabulary future Rail work may record

The ledger's `event` CHECK is the whole vocabulary; nothing outside it may be recorded:

`trial_ending` · `plan_changed` · `invoice_receipt` · `payment_failed` · `payment_action_required` ·
`cancellation` · `access_impacting_status` · `promotional_entitlement_change`

Delivery outcomes (`status`): `skipped_not_relevant` · `skipped_unverified` · `not_configured` ·
`queued` · `sent` · `failed`. Channel: `email` only.

Relevance per entitlement is decided by Billing's pure policy (`_shared/billing-notifications.ts`):
Promotional and trial workspaces never receive an invoice or payment event; an unknown entitlement
receives nothing. A Rail records what the ledger says happened — it does not decide relevance.

## 5. What must never leave the Billing source

- Stripe customer ids, Stripe account names per workspace, subscription ids, price ids, keys.
- Any email address, notice subject, or body (the ledger stores none by design).
- The `platform_billing_accounts`, `platform_billing_contacts`, and
  `platform_billing_notification_log` tables themselves — RLS FORCE, operator-read only; a
  tenant-side reader uses the RPCs, never the tables.
- The Owner-only reads and acts: `get_workspace_billing_contacts()`,
  `platform_billing_contact_designate()`, `platform_billing_contact_revoke()`.
- The service/operator gate `platform_billing_paid_activation_ready(tenant)` and the reconcile seam.
- Audit payloads (`paige_audit_log` actions `platform_billing_contact_designated` /
  `_revoked`, `platform_billing_portal_*`, `platform_billing_account_conflict`) — they carry user
  ids and codes, never addresses; they are not a Rail feed.

## 6. Behaviour while no sender or delivery history exists

Foundation A ships **no sender**. Nothing writes to the ledger; the proof asserts it is empty after
every act (P53). Therefore, until the delivery release lands:

- A designation is a record with no effect on anyone's inbox. Any surface that names it says so
  in plain words ("notices are not being sent yet"), never implying delivery.
- `receives_billing_notices = true` means *designated*, not *delivered to*.
- A notice-history reader has nothing to read and must render **unavailable with its reason**, not
  an empty list and not "no notices".
- No claim of live notification delivery is made anywhere without authenticated, owner-visible
  proof of an actual delivered message.

## 7. Source of truth

**Billing is the source of truth for everything above; Spine is not.** Spine reads the safe fields
in §2 through the one RPC, records only the vocabulary in §4 when a ledger exists, and reports any
gap back to Billing. It does not cache, re-derive, or extend these semantics.

---

*Refresh rule:* when the slice merges, replace the STATUS block with the shipped commit and the
migration version, re-verify §2 against the live function signature, and note any field added or
removed by Foundation B/C.
