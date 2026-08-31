# Communications capability map — A2P, numbers, voice (v1 archaeology)

**Owner-requested 2026-08-30.** The platform had a fuller communications capability than the
current Solo surface shows. This maps what exists, so resurfacing is a porting exercise rather
than a rediscovery. Written from the repo at `1b12738f`; every claim is grounded in a file or a
commit, and the unverified ones say so.

## Read this distinction first — it has cost us time before

| Term | Means |
|---|---|
| **CODE EXISTS** | in the repo |
| **DEPLOYED** | on `main`, at or behind `edge-live` / `db-live` |
| **REACHABLE** | a user can actually get to it from a live route |

A capability can be all three, or any one of them alone. Most of what follows is *deployed but
not reachable*.

## The one fact that governs everything else

**No shipped code path can move an A2P registration to `approved`, and tenant SMS is hard-blocked
until one does.**

- `createBrand` / `createCampaign` in `_shared/twilio.ts:555-597` are `needs_config` stubs. They
  return `{ok:false, needs_config:true}` and issue no HTTP request. The missing dependency is
  Twilio TrustHub business-profile onboarding, which does not exist here.
- The only writer of `tenant_a2p_registrations` is `comms-a2p-submit/index.ts:214`, and its status
  derivation (`:188-194`) keys on a brand SID that is always null. **The ceiling is `pending`** —
  not even `submitted`.
- No A2P status webhook exists, so nothing can advance a row even if one were submitted.
- `send-message/index.ts:325-342` refuses the SMS adapter unless `status === 'approved'`.

So: the pre-send pipeline, suppression, consent, quiet hours, number purchase and webhook stamping
are all built, and **no tenant can send an SMS**. Resurfacing the UI is cheap; making SMS work is
the TrustHub build, and every step of it is an owner-authorized provider action.

## What exists, by area

### A2P — UI complete, backend capped at "prepared"
- `tenant_a2p_registrations` (`20260726210000:126-152`) — full status columns, tenant-derived,
  RLS to tenant admin/coach.
- `comms-a2p-draft` / `comms-a2p-submit` — both **deployed**. The draft does a real model call.
- **UPDATED 2026-08-30 (PR #665): the draft now PERSISTS.** Until then `comms-a2p-draft` did two
  reads and no write, so the prepared draft died with the response. It now saves through
  `tenant_a2p_registration_save_draft` (`20261004010000`, extended to eight arguments by
  `20261004020000`, which also DROPS the five-argument signature so no caller can reach the
  version that silently loses three fields) — SECURITY DEFINER, caller scope enforced
  in-body (§59), tenant from `current_user_tenant_id()` and never the body, stable refusal hints.
  `comms-a2p-submit` no longer calls a carrier stub at all: it persists the reviewed copy through the
  same seam and returns an explicit *prepared, not submitted* refusal, so
  `_shared/twilio.ts::createBrand`/`createCampaign` now have **zero callers**.
- **Preparing requires `tenant_legal_profile.legal_business_name`** (carriers register a legal
  entity). On prod today **0 of 13 tenants** have that record, so refusal — not success — is the
  first-use path for every tenant; the surface routes an admin to Setup › Legal › Templates and tells
  a coach who to ask, since that route is `AdminOnly` while the A2P surface is not gated.
- **`A2PTab.tsx` (24 KB) is complete** and mounted only at
  `/admin/clients-hub/conversations/settings?panel=a2p` — behind the Solo redirect (below).
- Solo Connections shows the state read-only and says "prepared, not submitted", which is correct.
- **UPDATED 2026-08-30 (PR #672): the draft keeps all SEVEN reviewed fields and can be
  REOPENED.** #665 persisted four; `optin_message`/`optout_message`/`help_message` had no
  column, so A2PTab folded them into `optin_flow` behind labels — text kept, structure
  destroyed, unreadable back. They now have their own columns and the fold is deleted.
  `loadReg` also rehydrates the editor (`a2pDraftResume.ts`) AND the legal business name,
  because restoring copy the owner cannot save is not resuming the flow. Absent preserves a
  field; an empty string clears it, so a wrong STOP/HELP reply can actually be removed. ONE exception: `campaign_description` preserves on empty rather than clearing.
- **`submitted_at` is the only honest discriminator.** No shipped path sets it. A2PTab's banner and
  pills key on it rather than on "a row exists with no SID" — that older test matched exactly what a
  durable draft save writes, and would have rendered "Submitted for review" over a registration
  nobody had filed.
- **AND IT IS NOW ENFORCED WHERE THE DATA LIVES (`20261004030000`, PR #672, owner-approved).**
  "No shipped path sets it" was a statement about today's code, not a property of the system:
  the RLS UPDATE **and INSERT** policies are row-scoped with no column restriction, so a tenant
  admin could set `submitted_at` and a brand SID straight through PostgREST. A SECURITY INVOKER
  `BEFORE INSERT OR UPDATE` trigger now fails closed for every direct caller on the eight
  submission-owned columns — `submitted_at`, `approved_at`, `status`, `brand_status`,
  `campaign_status`, `brand_sid`, `campaign_sid`, `messaging_service_sid`. Only server-side
  authority (a DEFINER seam running as the table owner, or `service_role`) may move them.
  **`20261004040000`** then froze the seven DRAFT columns too, once
  `a2p_registration_is_immutable(old)` — the same predicate the save RPC enforces — so a
  carrier-filed registration's copy of record cannot diverge from what was actually filed.
  A registration still **pending** stays freely editable; one past preparation does not.
  **`20261004050000`** froze `id` and `created_at` for a direct caller at ALL stages (a review
  proved both rewritable, which orphaned the audit link on the very row the guard calls
  unalterable). `updated_at` is written by its own BEFORE trigger, which fires
  after the guard, so it is not restated. **`tenant_id` WAS delegated to the update policy's
  `WITH CHECK` on the same reasoning, and that reasoning was wrong** — the policy is
  `is_platform_owner() OR (tenant_id = current_user_tenant_id() AND …)`, whose first branch
  short-circuits before reading the column, and a platform operator over PostgREST runs as
  `authenticated` and is therefore a direct caller by this guard's own definition. A review
  measured an operator both NULLing and reassigning it. **`20261004060000`** puts `tenant_id`
  in the freeze, so reassigning a carrier-approved registration — and the live
  `messaging_service_sid` that `send-message` resolves by `tenant_id` — is refused. INVOKER is the mechanism, not a detail — a DEFINER trigger reads
  `current_user` as its own owner and would allow everything, which the proof caught.

### Numbers — search and purchase work, and are unreachable from Solo
- `tenant_phone_numbers` (`20260726210000:73-101`, extended `20260727140000`) — status, source,
  capabilities, one primary per tenant, globally unique E.164.
- `comms-search-numbers` and `comms-purchase-number` — both **deployed**.
- **`NumbersTab.tsx` (17 KB) is complete**, same stranded route.
- Solo Connections renders an inert search panel that honestly says nothing ran.
- `import_tenant_phone_number` — a correct, tenant-pinned RPC with **zero callers anywhere**.
- `provision-tenant-twilio` — deployed, operator-gated, **zero callers**, and carries an `adopt`
  mode for reconciling console-created subaccounts.

### Voice — far more shipped than the Solo surface suggests
- **A call is a message row**, not a separate table (`20260816191000:5-18`): `channel_type='voice'`
  plus `call_duration_seconds`, `recording_url`, `transcript` on both `messages` and
  `operator_messages`. **Applied to prod.**
- `voice-twiml` (827 lines) and `voice-access-token` — both **deployed**. Operator voice was
  live-driven 2026-08-10 (master doc :579).
- **The browser dialer is already mounted in the Solo shell** (`SoloApp.tsx:242-244`) with the
  trigger in the shared header. What Solo lacks is click-to-call *inside* a conversation and on
  the contact rail — both exist for non-Solo.
- `paige-stt` live-call co-pilot: deployed, default OFF, and now additionally gated on request
  authentication. **Whether it was ever activated on prod cannot be determined from the repo.**
- Tenant call-completion callbacks are dormant: `voice-twiml` emits no `statusCallback` on an
  unverified request, and the master auth token is intentionally absent. The named remedy is
  per-subaccount signature validation, binding the signing subaccount to the tenant in `From`.

### A gap that blocks tenant inbound voice entirely
`purchaseNumber` (`_shared/twilio.ts:470-504`) sets `SmsUrl` and `StatusCallback` and **never sets
`VoiceUrl` or `VoiceApplicationSid`**. A marketplace-purchased number therefore has no inbound
voice route unless someone sets it by hand in the console.

## What was removed, and why

- **ConvAI voice chat** (`84489025`, 2026-07-30, #170) — five edge functions and the frontend dock
  deleted. It was **live-broken on prod** (a worklet load failure leaking a vendor error onto a
  tenant surface) and was replaced by `paige-dictate` on our own STT router. A broken thing
  removed, not a working capability lost. The ElevenLabs agent still exists but has **zero repo
  wiring** — ConversationRelay is spec-only, tracked as Wave 4.
- **GoHighLevel comms** (`45efea53`) — predates the Twilio build; not a resurfacing candidate.

## Two live defects found in passing

1. **`paige-mcp` `send_sms` cannot send.** `index.ts:2343` builds its auth header from `authToken`,
   which is **declared nowhere** in the file — verified: one occurrence, zero declarations. The
   correctly-computed `authHeader` sits two lines above, used in the guard and then ignored. It
   broke in the rename sweep `7161ee1e` (2026-08-25), which renamed the declaration and the guard
   and missed the use. On `main`, deployed. One-line fix, **not** made here.
2. **`twilio-inbound-webhook` is dead but still deployed** — superseded by `handle-inbound-sms`,
   hard-requires an absent token so it 403s everything, names a *different* Supabase project ref in
   its header comment, and its HELP reply carries finance wording on a platform-default path (§2).
   Deleting the directory does not un-deploy it; that needs the management-API delete.

## The stranded list — this is the resurfacing backlog

`Admin.tsx:373-382` redirects a flag-enabled solo-standalone tenant away from the **entire**
`/admin` tree. Everything below is complete, working code a Solo tenant cannot reach:

| Legacy address | Component | Solo equivalent |
|---|---|---|
| `…/conversations/settings?panel=numbers` | `NumbersTab` | none — inert form |
| `…?panel=a2p` | `A2PTab` | none — read-only status |
| `…?panel=consent` | `ConsentTab` | none — a count only |
| `…?panel=signatures` | `SignaturesTab` | none |
| `…?panel=notifications` | `NotificationsTab` | placeholder cards |
| `…/snippets`, `…/manual-actions`, `…/trigger-links`, `…/analytics` | four components | none |
| `/admin/communications` | `CommunicationsAdmin` | none |
| in-thread + contact-rail call buttons | `ConversationsCallButton`, `CallButton` | none in Solo |

## Resurfacing order — cheapest real value first

**No owner authorization needed** (pure ports and reads):
1. Owned-numbers table into Connections → Business phone.
2. `A2PTab` into Messaging registration — reaches "prepared" with **no backend change**.
3. `ConsentTab` into Messaging registration.
4. Click-to-call in the Solo thread and contact pane (the dialer is already mounted).
5. Render voice rows as call bubbles — the columns are already on prod.

**Owner authorization required** (each is a provider action, and each is a separate Trust Compass
capability per `connections-rail-contract.md` §0b):
6. Live number search, and purchase (a recurring charge).
7. Re-stamping webhook URLs on already-purchased numbers.
8. Setting `VoiceUrl` on numbers — without it tenant inbound calling cannot work.
9. Recording/transcription and the live co-pilot — grants #4 and #5, and it spends per call.
10. The TrustHub → Brand → Messaging Service → Campaign → approval-ingest build. **Until this
    lands, no tenant can send an SMS.**

Items 6–10 are the same work `connections-rail-contract.md` already tracks as **C-3** (authorized
execution contracts) and **C-6** (per-capability voice enforcement). Extend that table rather than
re-planning them.

## Honest limits of this map

- Read from the repo. **No SQL was run** for it; live row counts and provider state are not
  verified here.
- Whether the STT co-pilot was ever activated on prod, and whether the retired ConvAI functions
  were actually un-deployed, **cannot be determined from the repo** — both need an owner or an
  operator query.
- The claim that two tenant numbers are live at the provider comes from `docs/brain/config-registry.md`
  (dated 2026-08-09). Treat it as a dated secondary source, not a fresh reading.
