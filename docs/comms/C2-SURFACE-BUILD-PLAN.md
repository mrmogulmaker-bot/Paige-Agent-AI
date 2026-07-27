# Comms C-2 surface slice — LOCKED build plan (the last piece of the Comms program)

**Owner:** Antonio · **Status:** GREENLIT 2026-07-27. Fires as its own slice(s) the moment the
C-1.5 inbox UI archives + PR #241 merges (per owner sequencing). Folds in both decisions from
`C2-SURFACE-DECISIONS.md`. Since #241 will have merged, C-2 surface starts on a **fresh branch off
`main`** (merged-PR doctrine).

## Build-vs-execute honesty (§13/§32) — READ FIRST
- **Buildable + §32-verifiable headless by me (no live creds):** marketplace UI, A2P wrapper UI,
  compliance layer (List-Unsubscribe headers, `/u/:token` unsub landing, STOP handler, NL opt-out
  classifier, `email_consent_enforced` toggle), DLR webhook fn, `tenant_phone_numbers.source` enum,
  `RESERVED_PLATFORM_NUMBER` removal, `platform_number_pricing` table, `platform_phone_numbers`
  drop migration.
- **Gated on live Twilio master creds seeded as prod edge secrets — the API KEY TRIO
  (`TWILIO_ACCOUNT_SID` + `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET`; the master
  `TWILIO_AUTH_TOKEN` is intentionally ABSENT, Twilio best-practice — owner-confirmed 2026-07-27,
  the SIDs held in prod secrets, not committed here):** the actual 8-tenant backfill RUN (real
  SIDs, #1), the +1 470 200 3444 import (#2 — the real number), the A2P/TCR submit (#4). I build +
  verify the code; the LIVE run + "real SID in Twilio console" proof is an execution step once creds
  are confirmed. Never report provisioned/submitted without the real SID/TCR response.
  - **Master-auth pattern already landed (`2c1bfcb`, on #241):** `_shared/twilio.ts`
    `masterCreds()`/`masterBasicAuthHeader()` build Basic auth from the API Key SID:Secret (username
    = `SK…`, URL path = the Account SID), with a legacy `TWILIO_AUTH_TOKEN` fallback for older envs.
    Guarded headless by `scripts/twilio-master-auth-smoke.mts` (14/14) + an optional
    `TWILIO_LIVE_SMOKE=1` `GET /Accounts/{sid}.json` probe. So the live-execution deliverables above
    will authenticate correctly the moment the trio is present.
  - **§32/§13 CAVEAT for the compliance slice (#6 DLR + #5 STOP webhooks):** Twilio validates INBOUND
    webhook signatures with the account **Auth Token** (HMAC), which has NO API-Key equivalent. The
    legacy inbound validators (`handle-inbound-sms`, `twilio-inbound-webhook`) still read
    `TWILIO_AUTH_TOKEN` — with it absent in prod, `handle-inbound-sms` degrades to "accepting
    unsigned" and `twilio-inbound-webhook` to "rejecting". The C-2 inbound/DLR webhooks must validate
    against the **subaccount's** auth token (in Vault, per number's owning subaccount), or the master
    Auth Token for the +1 470 master number. Resolve this signature-source decision when building the
    STOP handler + `twilio-sms-status-webhook`, not later.

---

## STANDING GREENLIGHT (owner: Antonio, 2026-07-27) — do NOT re-ask between sub-slices

The owner has issued a **standing greenlight** for the ENTIRE C-2 surface program, cued to flow
build-by-build at the crew's pace: **C-2s-A (plumbing) → C-2s-B (surfaces) → C-2s-C (compliance/DLR)**,
each on a fresh branch off `main` (merged-PR doctrine), each through the full crew (§1/§5/§25 —
adversarial verifier + compliance officer + design critic where a UI surface exists) + §32 Layer A+B +
§37 producer/consumer inventory + §9 server-authoritative tenant derivation + §11/§25/§33 taste bar on
any UI + §36 5-min test + §13 honest scope (real SIDs only). No merge-approval question between slices
(§4 merge-on-verified). The ONLY owner-gated step is the LIVE Twilio execution proof (real SID visible
in the Twilio console) for the backfill RUN, the +1 470 import, and the A2P/TCR submit — the API-Key
credential pattern is proven (14/14 headless smoke, shipped `2c1bfcb`), so the CODE Layer-B-verifies
headless and only the "real SID" confirmation waits on the owner. Report per sub-slice in the standard
shape. When all three ship, C-2 is complete and the Comms program is complete.

## The 7 deliverables

### 1. Backfill 8 tenants — provision Twilio subaccount per tenant
`provision-tenant-twilio` (already shipped, idempotent, super-admin-only). Includes Super Admin as
one of the 8 (or tenant #1). Insert `tenant_twilio_subaccounts` row + vault the auth token. Report
provisioned vs skipped-present. §32 Layer B: real subaccount SID visible in Twilio console on ≥1
tenant end-to-end. **Live-creds gated.**

### 2. Super Admin import — +1 470 200 3444
Import into Super Admin's `tenant_phone_numbers` with `source='imported'`. **Number STAYS on the
master account** where A2P is already registered — do NOT move it to his subaccount (would break
A2P). Confirm §9 RLS hides it from other tenants. Then **REMOVE the `RESERVED_PLATFORM_NUMBER`
exclusion filter** in the SMS adapter (`send-message/index.ts`) so he can send from his own number.
- Add `tenant_phone_numbers.source` — recommend **enum `'marketplace' | 'imported' | 'ported'`**.

### 3. Number marketplace UI — `/app/settings/comms/numbers`
Tenant filters by area code + capabilities (voice/SMS/MMS); server calls Twilio **Available Phone
Numbers API** using the tenant's subaccount; shows options at **Paige retail = Twilio wholesale +
markup** from a NEW **`platform_number_pricing`** config table (§7 platform-authored default,
coaching-generic §2). Purchase: server calls Twilio **Incoming Phone Numbers API POST** on the
tenant's subaccount → number lands in the tenant's subaccount → webhook URLs point to Paige edge
fns (inbound `twilio-sms-webhook`, status `twilio-sms-status-webhook`) → insert
`tenant_phone_numbers` row `source='marketplace'`. §38: Paige marks up, tenant pays Paige, Paige
pays Twilio (NOT Connect — this category is a Paige-held rail per money-spine-architecture).

### 4. A2P wrapper UI — `/app/settings/comms/a2p` (Paige-drafted; the beat-GHL surface)
- **(a) Brand:** form (EIN, contact, website); Paige DRAFTS campaign use-case + sample messages
  from the tenant's Playbook + brand voice; tenant reviews/approves; server submits to Twilio A2P
  10DLC on the tenant's subaccount; status polled + surfaced.
- **(b) Campaign:** form (use case + samples + opt-in flow + opt-in message, Paige-drafted from a);
  server submits to TCR via Twilio; status polled; auto-links approved numbers to the approved
  campaign.
- Status stored in `tenant_a2p_registrations` (tenant_id, twilio_brand_sid, twilio_campaign_sid,
  brand_status, campaign_status, submitted_at). §36: coach fills form, Paige drafts regulatory
  copy, coach approves + submits, never opens Twilio. **Live-creds gated (submit).**

### 5. Compliance layer (legal + deliverability — hard gate)
- **(a) Email one-click unsub:** `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click`
  (RFC 8058) on every commercial email; branded `/u/:opaque_token` landing (per-tenant brand §7);
  honor within **2 days** (Gmail/Yahoo Nov-2025 REJECT = hard deliverability gate). Click →
  `paige_suppressions` insert + `paige_consent_events` action='revoked'.
- **(b) STOP handler** (extend `twilio-sms-webhook`): STOP/STOPALL/UNSUBSCRIBE/QUIT/CANCEL/END
  (case-insensitive, trimmed) → suppression + consent revoke + confirmation ("You've been
  unsubscribed. Reply START to resubscribe."). Belt-and-braces over Twilio auto-handling; the
  **audit trail** is the TCPA protection.
- **(c) NL opt-out classifier** (§14 cost-low model): after the literal STOP check, if the body
  doesn't match but the classifier flags opt-out intent → same suppression + revoke + confirmation;
  log classification + confidence.
- **(d) `email_consent_enforced` toggle** in `tenant_comms_preferences` (D1c, now in-scope): a
  one-line pipeline read that adds `'email'` to the enforced set **for that tenant only**. Default
  off (US CAN-SPAM). Prior-relationship backfill is the tenant's responsibility before flipping.

### 6. DLR webhook + delivery timeline — new `twilio-sms-status-webhook`
Receives Twilio DLR via the StatusCallback URL on outbound sends. Updates the `messages` row:
status (`sent` → `delivered` | `failed` | `undelivered`), `meta.delivery_error_code` + a
human-readable mapping ("carrier filtered" / "invalid number" / "rate limited"). **Twilio signature
validated**; tenant derived from the `messages` row's `tenant_id` via `MessageSid` lookup (NEVER
the request body, §9). Timeline in the message detail: queued → sent → delivered/failed w/ reason.

### 7. Final cleanup — drop `platform_phone_numbers`
After verifying end-to-end that Super Admin sends from his `tenant_phone_numbers` row AND re-grep
confirms no live code queries `platform_phone_numbers`, DROP the table + its RLS in a follow-up
migration. §32 Layer B proves no dependent references break. (D2, gated on the end-to-end verify.)

---

## Doctrine gates (every deliverable)
§1/§5/§25/§27/§33 crew **incl. design critic** on the marketplace + A2P UIs · §32 Layer A + Layer B
on every deliverable · §37 producer + response-consumer inventory on every changed contract
(send-message compliance additions, twilio-sms-webhook STOP additions, `tenant_phone_numbers.source`,
`RESERVED_PLATFORM_NUMBER` removal, the DLR status transitions) · §9 server-authoritative tenant
derivation on every endpoint (webhook signature validated, tenant from the To-number/MessageSid
lookup, never the body) · §2 A2P Paige-drafted copy coaching-generic, zero funding/credit · §7
tenant-authored (number markup config, A2P brand/campaign content) · §36 5-min test (coach searches
area codes, buys a number, registers A2P, never knowing what Twilio is) · §38 Paige-held rail
(markup, not Connect) · §13 honest (no fabricated SID/TCR/DLR).

## Suggested sub-slicing (given size — 7 deliverables is an epic, not one slice)
- **C-2s-A (plumbing):** `source` enum + `RESERVED_PLATFORM_NUMBER` removal + Super Admin import +
  backfill run (live-creds gated) + `platform_phone_numbers` drop (gated on end-to-end verify).
- **C-2s-B (surfaces):** number marketplace UI + `platform_number_pricing` + A2P wrapper UI
  (design-critic seat).
- **C-2s-C (compliance + DLR):** List-Unsubscribe + `/u/:token` landing + STOP handler + NL
  classifier + `email_consent_enforced` toggle + `twilio-sms-status-webhook`.
Each ships through the full C-1 gate (crew → §32 Layer A + B → §37 → report).

## C-2s-A (plumbing) — BUILT + VERIFIED (2026-07-27), what shipped vs. what's live-gated

**Shipped headless (this slice, §32 Layer A+B verified):**
- `20260727140000_comms_c2sa_phone_source_and_import.sql` — `tenant_phone_numbers.source` enum
  ('marketplace'|'imported'|'ported', NOT NULL default 'marketplace', backfills existing rows) +
  a nullable `friendly_name` + `subaccount_id` relaxed to NULLABLE (imported/master numbers have no
  subaccount) + the `set_tenant_phone_number_tenant` trigger gains a `new.tenant_id` service-path
  fallback (spoof-safe — mirrors `set_tenant_a2p_registration_tenant`) + the §10 Paige-callable
  `import_tenant_phone_number(...)` RPC (§9 tenant-pinned, E.164-validated, foreign-subaccount → 42501,
  cross-tenant collision → 23505 no-leak, idempotent on the global phone UNIQUE, §200 zero hardcoded
  number/tenant).
- `send-message/index.ts` — `RESERVED_PLATFORM_NUMBER` const + filter REMOVED; the only isolation is
  the `.eq('tenant_id', server-derived tenantId)` from-number query (crew-proven sufficient). §37: the
  from-number path has exactly one producer (`smsOutboundAdapter`); no orphaned callers.
- The `platform_phone_numbers` DROP is **parked at `docs/comms/c2sa-drop-platform-phone-numbers.sql`**
  (OUT of `supabase/migrations/**` so `deploy-migrations.yml` cannot auto-apply it — a comment banner
  is not a gate). It is promoted into `supabase/migrations/` with a fresh timestamp, in its OWN closing
  PR, ONLY after the live pre-conditions below.

**LIVE owner-gated execution runbook (real SID proof, §13 — NOT done by the slice):**
1. **Backfill run** — invoke `provision-tenant-twilio` (super-admin JWT) to mint the 8 tenants' Twilio
   subaccounts incl. Super Admin. Report real ACxx… SIDs.
2. **+1 470 import** — call `import_tenant_phone_number` **via the SERVICE path with an explicit
   `_tenant_id` = Super Admin's tenant UUID** (crew Finding 2: the God/owner JWT may have
   `is_platform_owner()=true` but a NULL `current_user_tenant_id()`, which would 42501 — so drive the
   import service-side with the resolved tenant id, §200-clean). Confirm the real `tenant_phone_numbers`
   row (source='imported', subaccount_id NULL).
3. **Master-creds send mapping (the send-path completion)** — for the +1 470 to actually SEND,
   `resolveTwilioCreds(tenant)` must yield creds that OWN the number (the MASTER account). Decide at
   live-setup: either Super Admin's `tenant_twilio_subaccounts` row maps to the master-account creds, or
   send-message grows a per-number master-creds branch for `source='imported' + subaccount_id IS NULL`.
   This is the one send-path piece C-2s-A does NOT wire (unverifiable headless); resolve it with the
   live import so a real outbound from +1 470 returns a real Twilio SID.
4. **A2P submit** — (C-2s-B/A2P surface) submit brand/campaign on the tenant's account; real TCR SIDs.
5. **THEN promote the drop** — once #2 + a verified live send from +1 470 exist, move the parked drop
   into `supabase/migrations/` (fresh timestamp) and merge as the closing PR.

**Non-blocking follow-ups (crew, logged):** Finding 3 — `import_tenant_phone_number` doesn't set
`is_primary` when the tenant has no primary, and re-import of a released/suspended row doesn't reactivate
`status`; decide when a tenant holds >1 number (fine for the single +1 470 today, which inserts active).

## Report shape: same as C-1.5 UI (shipped / crew verdicts / Layer A / Layer B per-item / design
verdict / honest scope / follow-ups). When all three sub-slices ship, **C-2 is complete and the
Comms program is complete.**
