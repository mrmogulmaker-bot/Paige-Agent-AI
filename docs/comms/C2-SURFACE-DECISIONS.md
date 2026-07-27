# Comms C-2 surface slice — locked owner decisions (fold in when the surface work fires)

**Owner:** Antonio · **Status:** LOCKED, additive scope clarifications for the C-2 **surface**
work (number marketplace + A2P surface + tenant backfill + compliance layer). **No re-fire of
the C-2a backend keystone** — the pipeline/adapter/provisioning code already shipped
(`c1b6584`) is correct as-is; these fold into the surface slices that build on it.

---

## DECISION 1 — Email consent: DO NOT enforce by default (keystone is already correct)

Owner-researched: **CAN-SPAM is opt-OUT for US email** — no prior consent is legally required
to send. The C-2a pipeline's `CONSENT_ENFORCED_CHANNELS = ["sms"]` is **correct as-is; no
pipeline code change.** (SMS default-deny stays — TCPA requires prior express consent.)

Three follow-ups:

- **(a) Compliance layer — IN SCOPE for the C-2 compliance slice (already scoped).** Every
  commercial email must carry **`List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`**
  (RFC 8058 one-click), a **branded unsubscribe landing page**, and **honor an unsub within 2
  days** (tighter than CAN-SPAM's 10 business days). Rationale: Gmail/Yahoo bulk-sender
  enforcement moved from *delay* to **REJECT in November 2025** — this is now a **deliverability
  hard-gate**, not just best practice. The unsub write files a `paige_suppressions` row (channel
  `email`, reason `unsubscribe_link`) — which the C-2a pipeline step 2 already honors for email.
- **(b) Form builder — fold into the form-builder slice (later).** Separate consent checkboxes
  for **"receive email updates"** and **"receive SMS updates"**; each writes an audit-trailed
  `paige_consent_events` row (`action='granted'`, the right `channel`, `source='form'`) for the
  recipient **at the moment of intent** (form submission), not via a retroactive flow. This is
  how a tenant seeds email consent if/when they opt into enforcement (see c).
- **(c) Future enhancement — file as follow-up, NOT day-one.** A per-tenant toggle in
  `tenant_comms_preferences` for **email-consent enforcement**, for tenants with international
  audiences (**EU/CA/UK/AU** where opt-in IS legally required) OR who want the higher bar as a
  deliverability play. Implementation = read the toggle in the pipeline and add `"email"` to the
  enforced set for that tenant; a one-line flip after the tenant has seeded a prior-relationship
  backfill. Not a blocker.

---

## DECISION 2 — Super Admin IS a tenant (with elevated permissions), not a separate concept

Architectural correction — **simpler** than the original reserved-number scope.

- **`+1 470 200 3444` lives in `tenant_phone_numbers` under the Super Admin's tenant record**,
  imported/grandfathered from the master Twilio account — **NOT** in `platform_phone_numbers`.
- Super Admin uses the **SAME** number-marketplace UI and the **SAME** A2P-wrapper UI as any
  other tenant (buy more numbers, register more A2P brands, etc.).
- **Tenant isolation via §9 RLS inherently handles the "reserved" concern** — no other tenant
  can see Super Admin's numbers, so no special-casing is needed.
- **`platform_phone_numbers` is now REDUNDANT.** Grep (2026-07-27) confirms **no live code
  queries it** — it appears only in the foundation migration (its own CREATE + seed), in
  `send-message` **comments** + the `RESERVED_PLATFORM_NUMBER` constant/filter, and in a
  `provision-tenant-twilio` **comment**. → **Drop it** (owner-recommended option a) in the C-2
  surface slice. (Since the foundation migration is still unmerged on PR #241, the surface slice
  may either amend the foundation to not-create it, or add a drop follow-up migration — pick the
  smaller diff at build time. Re-grep before dropping.)

### Required code delta in the C-2 surface slice (because the reserved number becomes a real tenant number)

The C-2a SMS adapter currently **defensively excludes** `RESERVED_PLATFORM_NUMBER` from the
tenant's from-number candidates (`send-message/index.ts`, `RESERVED_PLATFORM_NUMBER` const +
the `r.phone_number !== RESERVED_PLATFORM_NUMBER` filter). Under Decision 2 that number is a
**legitimate Super-Admin tenant number**, so the exclusion would wrongly block Super Admin from
sending from his own number. **The surface slice must REMOVE the `RESERVED_PLATFORM_NUMBER`
constant + filter** (the §9 RLS + the number living under his tenant is the only isolation
needed). This is the one keystone-adjacent edit, done as part of the surface slice, not now.

### Implementation (folds into C-2 surface backfill + marketplace slices)

1. **Super Admin gets a Twilio subaccount** provisioned via `provision-tenant-twilio` as part of
   the tenant backfill (he's presumably one of the 8; if not, add him to the target set).
2. **`+1 470 200 3444`**: either MOVE it from master to Super Admin's subaccount (Twilio API), OR
   import it as a `tenant_phone_numbers` row with a **`source='imported'`** flag (vs
   `source='marketplace'` for numbers bought through Paige). **Smallest diff wins — owner
   recommends the source-flag approach** so the number stays on master where its A2P is already
   registered. (Adds a `source` column to `tenant_phone_numbers` if not present.)
3. **Super Admin surface** shows his numbers + A2P registrations using the **SAME components** as
   the tenant surface (§18 one home per capability). "Pulled to the front" of Super Admin = route
   the tenant-facing number-list + A2P-list components into a Super-Admin view of **his own
   tenant's** data.

---

## What changes NOW vs. later
- **NOW (this note):** decisions recorded; grep-verified `platform_phone_numbers` is drop-safe.
  **No keystone code change** (owner: no re-fire).
- **C-2 surface slice (when it fires):** compliance layer (List-Unsubscribe one-click + branded
  landing + 2-day honor), drop `platform_phone_numbers`, remove the `RESERVED_PLATFORM_NUMBER`
  filter, provision Super Admin's subaccount + import his number with `source='imported'`, and
  route the tenant number/A2P components into his own-tenant Super-Admin view.
- **Later slices:** form-builder dual consent checkboxes (1b); per-tenant email-consent toggle (1c).
