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
- **(c) Per-tenant email-consent enforcement toggle — OWNER CONFIRMED IN SCOPE (2026-07-27,
  "yes I do want the international/deliverability bar").** A per-tenant toggle in
  `tenant_comms_preferences` (add `email_consent_enforced boolean not null default false`) for
  tenants with international audiences (**EU/CA/UK/AU** where opt-in IS legally required) OR who
  want the higher bar as a deliverability play. Implementation (in the C-2 compliance/surface
  slice, additive — NOT a keystone re-fire):
  1. Migration: add the column to `tenant_comms_preferences`.
  2. Pipeline: `runPreSend` reads the caller-tenant's `email_consent_enforced`; when true, add
     `"email"` to the enforced set **for that tenant only**. The **global default stays SMS-only**
     (US email = CAN-SPAM opt-out, D1); this is per-tenant opt-IN, never a global flip.
  3. UI: the toggle lives in the tenant comms-preferences surface, with copy explaining it
     requires seeded email consent (D1b form checkboxes) or a prior-relationship backfill or the
     tenant will block its own email.
  This pairs with D1(b): the form-builder dual-consent checkboxes are what seed the `granted`
  `paige_consent_events` rows that make enforcement meaningful.

---

## RETIRED DECISION 2 — “Super Admin is a tenant”

**Superseded by the §200 platform-operator workspace architecture.** The God / Super Admin
identity remains tenantless and holds no membership in the operator workspace. Paige Agent AI's
own contacts, Conversations, pipelines, connectors, and imported master number belong to a
separately owned, coaching-generic tenant designated by
`admin_app_settings.platform_operator_tenant_id` (display name: **Paige Operations**).

The operator is authorized to enter that fixed workspace through the **Fleet Communications
transition**, which opens the existing Clients → Conversations home. That
delegation is not tenant ownership, membership, or a browser-selected arbitrary tenant. The
server resolves the designation with no tenant-id input and fails closed when it is unset,
malformed, suspended, or inaccessible. The canonical Conversations and number/A2P components are
still reused (§18); only the identity model below is retired.

The historical notes in this section are retained as decision provenance and MUST NOT be used as
implementation instructions. In particular: do not attach the number to the God identity, do not
provision a God-owned Twilio subaccount, and do not remove reserved-number defenses until the
Paige Operations ownership and master-account credential path are verified end to end.

### Historical provenance

The retired model proposed treating Super Admin as an ordinary tenant, attaching `+1 470 200
3444` to that identity, provisioning a tenant subaccount, removing the reserved-number filter,
and eventually dropping `platform_phone_numbers`. None of those actions remain authorized by
this document. They require a fresh producer/consumer inventory and verification against the
Paige Operations model before any later implementation decision.

