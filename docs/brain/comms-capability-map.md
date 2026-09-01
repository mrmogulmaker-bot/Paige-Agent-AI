# Communications capability map — A2P, numbers, voice (v1 archaeology)

**Owner-requested 2026-08-30.** The platform had a fuller communications capability than the
current Solo surface shows. This maps what exists, so resurfacing is a porting exercise rather
than a rediscovery. Written from the repo at `1b12738f`; every claim is grounded in a file or a
commit, and the unverified ones say so.

**Updated 2026-09-01** for the phone-line wave (#695 `94460ee3`, #699 `90a9d067`). The Numbers
section, the stranded-list row for `panel=numbers`, resurfacing items 1 and 6, and the
`paige-mcp send_sms` defect all asserted things that are no longer true. Everything about A2P and
voice is unchanged — **no tenant can send an SMS**, and a bought number still carries no inbound
voice route.

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
  `is_platform_owner() OR (tenant_id = current_user_tenant_id() AND …)`, which is TRUE for an
  operator whatever the column holds — so the tenant_id test can never refuse their write. (That
  is the disjunction's truth value. An earlier revision of this line said the first branch
  "short-circuits before reading the column", which asserts an evaluation order PostgreSQL does
  not guarantee; the conclusion never needed one.) A platform operator over PostgREST runs as
  `authenticated` and is therefore a direct caller by this guard's own definition. A review
  measured an operator both NULLing and reassigning it (the reassign onto a tenant with no
  registration of its own — onto an occupied one a unique constraint refuses it first, so the
  proof pins the refusal HINT, not merely that it was refused). **`20261004060000`** puts `tenant_id`
  in the freeze, so reassigning a carrier-approved registration — and the live
  `messaging_service_sid` that `send-message` resolves by `tenant_id` — is refused. INVOKER is the mechanism, not a detail — a DEFINER trigger reads
  `current_user` as its own owner and would allow everything, which the proof caught.

### Numbers — REACHABLE from Solo since 2026-09-01 (#695, #699)
- `tenant_phone_numbers` (`20260726210000:73-101`, extended `20260727140000`) — status, source,
  capabilities, one primary per tenant, globally unique E.164.
- `comms-search-numbers` and `comms-purchase-number` — both **deployed**, and both now have a Solo
  caller: `useSoloNumbers.ts` → `PhoneSetupPanel` / `OwnedNumbers` in `src/solo/settings.tsx`.
- **What a Solo tenant can do.** Search local or toll-free by area code, state, city, or leading
  digits; see each result's monthly price when one is published; buy it; then list owned numbers,
  rename one, and choose which one sends. **The browser never writes `tenant_phone_numbers`
  directly, but the seams differ by action and the difference matters to anyone inventorying
  mutations:** rename and set-primary go through RPCs (`tenant_phone_number_rename` /
  `tenant_phone_number_set_primary`, `20260901010000`), while **buying goes through the
  `comms-purchase-number` EDGE FUNCTION** (`functions.invoke`) — the recurring-charge seam, and the
  one most easily missed when grepping for RPCs. PAIGE reaches the same seams through eight `comms_*` tools —
  `search_numbers`, `buy_number`, `list_numbers`, `name_number`, `set_primary_number`,
  `connection_summary`, and the two A2P ones (`draft_registration`, `registration_status`),
  which reach only the "prepared" ceiling above.
- **What it still cannot do, and these are the edges that matter.** Nothing here sends an SMS — the
  A2P ceiling at the top of this file governs that and is unchanged. Nothing sets `VoiceUrl`, so a
  number bought this way still has no inbound voice route (see the gap below). The panel still
  renders an honest unavailable — `needs_config` — when the workspace cannot buy yet; that is a
  configured refusal, not the old inert form.
- **What actually protects the money. There are THREE purchase lanes and they are not equally
  protected — do not quote a protection without naming its lane.** The server branches on whether
  the caller sent an agreed amount (`if (agreedMonthlyCents !== null)`), and only one of the three
  does.

  There are **three** callers, not two — the two UI ones behave differently from each other and
  grouping them hides the weakest path.

  | | **Agent** — `comms_buy_number` | **Solo UI** — `PhoneSetupPanel` | **Legacy UI** — `NumbersTab` |
  |---|---|---|---|
  | Sends an agreed price | yes, required | **yes since 2026-09-01** — sends the `priceCents` the confirm named | **yes since 2026-09-01** — sends `retail_price.monthly_cents`. Both omit the key when the type is unpriced, because there is no amount to hold anyone to |
  | Quote guard | **enforced** — refuses without a whole, positive `monthly_cents`, *ahead of* the autonomy gate so it binds at `auto` too | n/a | n/a |
  | Server re-verifies vs `platform_number_pricing` | **yes** — `price_changed` / `price_unverifiable` are 409 refusals checked *before* `purchaseNumber` | **yes since 2026-09-01** — the branch now runs, and both codes have their own copy | **yes since 2026-09-01** — same |
  | Confirmation step | **enforced and server-bound since 2026-09-01** — `confirm:true` no longer decides anything on its own. It must SPEND a server-minted `paige_tool_confirmations` row for this tool, requester and tenant that is unspent, unsuperseded, unexpired, and **was created before the current turn began** — and for `comms_buy_number` the row also pins the PHONE NUMBER the operator was shown (not the price: that has its own quote guard and server re-verification, and pinning it would refuse a legitimate re-quote). A first-call `confirm:true` and a same-turn propose-then-self-approve are both refused; a failed claim re-proposes rather than dead-ending. **Still not proof the human said YES** — it proves a turn intervened, not what was in it. None at `auto` | a real `window.confirm` in the browser — client-side, so real for a human using the UI (what it names is the row below) | **yes since 2026-09-01** — the same `window.confirm`, in the same wording as Solo (§6). Was **NONE**: `onClick={() => void buy(n)}` bought on one click |
  | Amount shown before buying | the amount, at `confirm` | the amount **when one is published**; otherwise the literal words *"an unlisted monthly price"* | the amount when published; otherwise the same words *"an unlisted monthly price"* **since 2026-09-01**. The `—` is still what the search RESULTS ROW renders; it is no longer what the person is asked to agree to |
  | What can go wrong | **one unattended path now, not two** — a workspace on `auto` still buys with no gate at all (chosen, and by design). At `confirm` the first-call/same-turn bypass is closed; what remains is that an intervening human turn is not the same as a human saying yes, so a model could still read a refusal as approval | an unpriced number is bought for an unnamed sum. *A price change between search and buy is now caught — the server re-verifies and refuses* | the same as Solo since 2026-09-01. *Was: all of the above, plus no confirmation at all — a single click started a recurring charge* |

  ### Blocking reasons and their next steps — held by CI as of 2026-09-01

  `tenant_comms_readiness()` returns exactly six `blocked_reason` values
  (`messaging_account_missing`, `messaging_account_inactive`, `no_sms_number`,
  `registration_absent`, `registration_not_approved`, `no_consent_recorded`) plus `null`.
  Connections renders each through `READINESS_COPY` in `src/solo/settings.tsx`, whose entries
  carry a headline **and** a `next` — the one thing the person can do. Measured 2026-09-01:
  **exact parity, no gap in either direction.**

  Where the map has no entry the surface falls back to *"Some setup is still outstanding."* —
  honest, and naming no next step. That is the dead end, and it was reachable only by adding a
  seventh reason to the migration, which is a different file reviewed by different eyes.
  `npm run lint:readiness-copy` (CI step "Blocking reasons carry a next step") now fails on
  either direction, and on an entry that has a headline but no `next`.

  **What the guard does NOT do (§13):** it proves the two vocabularies agree; it does not judge
  the copy (that is Claude Design's, §00), and it reads the migration that defines the resolver,
  not the deployed function — so a resolver changed on prod without a migration is outside what
  it can see, as it is for every other static gate here.

  **CLOSED 2026-09-01.** The paragraph that stood here recorded the UI lanes as a **known gap**,
  never a protection: neither sent an amount, so the server's re-verification — guarded
  `if (agreedMonthlyCents !== null)` — was skipped for both, and the legacy operator tab bought on a
  single click (`onClick={() => void buy(n)}`) while rendering the price as `—` when the type was
  unpriced. It was **the weakest path on the platform for starting a recurring charge**.

  Both lanes now send the amount they displayed, and the legacy tab asks first, in the same words
  Solo already used. `price_changed` and `price_unverifiable` have their own copy on both surfaces —
  without it the right refusal surfaced as *"try another number"*, which sent people in a loop.

  **The legacy tab had no test at all**, which is how one-click buying survived; it has one now
  (`NumbersTab.purchase.test.tsx`), and 5 of its 7 cases fail against the previous version. The Solo
  assertion was loosened enough to miss this (`toMatchObject`) and is now `toEqual`.

  **Still true:** an UNPRICED number is still buyable on both lanes, with the confirm saying *"an
  unlisted monthly price"*. Whether that should be possible at all is a product question, not a
  defect, and it has not been ruled on.

  - **Configurable, and it defaults safe.** `resolveToolAutonomy` defaults to `confirm` — the
    comment reads *"safe default — never assume autopilot"*. But `comms_buy_number` is a
    registered switchable tool: **a workspace that sets it to `auto` gets a validly-quoted
    purchase executed with no confirmation** (`index.ts` ~5977: *"autoMode === 'auto' … fall
    through to execute"*). `off` disables it.
  - **CORRECTED 2026-09-01 — Layer 2 below was the defect, and it is now closed.** The text is kept
    because the *shape* of the failure is the durable lesson; the current state is stated first.
    **Now:** at `confirm` the model's flag only selects a branch. Executing requires consuming a
    server-minted `paige_tool_confirmations` row for this tool, requester and tenant —
    pinned to the phone number shown — unspent, unsuperseded, unexpired, and **created before the
    turn started** — so neither
    a first-call `confirm:true` nor a same-turn propose-and-self-approve can reach an execution.
    Proven against the database: 11/11 via the committed
    `scripts/tool-confirmation-sql-proof.sql` — same-turn refusal, cross-identity, cross-tool and
    cross-user refusal, supersede, one-approval-one-execution, retained audit rows, and both RPCs
    closed to non-`service_role`.
    **What is still NOT proven: that the human said yes.** An intervening turn is a turn, not a
    grant. Binding to an authenticated approval *click* needs per-surface UI work and is tracked
    separately. `auto` remains unconfirmed by design.
    - **Layer 1, genuinely enforced (unchanged):** the server refuses whenever the flag is absent.
      That is a real gate against a caller that simply invokes the tool, and it is why
      `needs_confirm` ever reaches the operator at all.
    - **Layer 2, WAS prompt-level — this was the hole:** the flag was **the model's own output**.
      No pending-proposal row, no token, nothing tying `confirm:true` to the `needs_confirm` that
      preceded it or to anything a human said. The system prompt and the `needs_confirm` note both
      *instruct* the model to ask first — steering, exactly like the no-retry rule below. That
      instruction is still only steering; it is simply no longer the only thing standing there.

    Net: the gate constrains the careless case and not the deliberate one. **The platform already
    has the fully-enforced pattern and this gate does not use it** — outbound sends file a real
    `approval_id` row and wait (`index.ts` ~8251). The price check is enforced in the agent lane;
    the only *human* gate anyone actually meets on this path is Solo's browser `window.confirm`,
    which is real for a person using the UI and client-side.
  - **Prompt-level only — NOT enforced.** "A refusal is final for that number, pick another
    rather than retrying the same one" and "if it was bought but not recorded, do not buy a
    replacement" live in the tool *description*. They steer the model; nothing rejects a retry.
  - **Auditing is BEST-EFFORT, not guaranteed.** Every exit where money may already have left
    *attempts* an `audit_logs` write, and `writePurchaseAudit` is non-blocking **by design** —
    its own comment: *"A failed audit write must not turn a completed purchase into a reported
    failure — the number is bought and the charge has started either way."* A failed insert is
    logged to `console.error` and nothing else changes. **So a completed charge with no audit
    row is reachable**, and reconciliation cannot assume the table is complete.
- **`NumbersTab.tsx` (17 KB)** stays the operator-side surface on the legacy route.
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

## Defects found in passing — one closed, one still open

1. ~~**`paige-mcp` `send_sms` cannot send.**~~ **CLOSED by #700 (`d5db4532`), and not the way this
   entry expected.** The map recorded a broken auth header built from an undeclared `authToken`,
   and proposed a one-line fix. #700 removed the send path instead: `send_sms` is now a deliberate
   fail-closed stub (`index.ts:2379-2402`) that audits the attempt and returns
   `blocked_a2p_governed_sender_required`, because tenant SMS must go through the governed sender
   once that tenant's A2P registration is approved — and per the ceiling at the top of this file,
   none can be. Verified 2026-09-01: zero occurrences of `authToken` or `authHeader` in that file.
   **The lesson is about this map, not that tool** — a "one-line fix" noted in a doc is a claim with
   a shelf life, and the fix that actually landed was an architectural refusal, not the line.
2. **`twilio-inbound-webhook` is dead but still deployed** — superseded by `handle-inbound-sms`,
   hard-requires an absent token so it 403s everything, names a *different* Supabase project ref in
   its header comment, and its HELP reply carries finance wording on a platform-default path (§2).
   Deleting the directory does not un-deploy it; that needs the management-API delete.

## The stranded list — this is the resurfacing backlog

`Admin.tsx:373-382` redirects a flag-enabled solo-standalone tenant away from the **entire**
`/admin` tree. Everything below is complete, working code a Solo tenant cannot reach:

| Legacy address | Component | Solo equivalent |
|---|---|---|
| `…/conversations/settings?panel=numbers` | `NumbersTab` | **ported** — Connections → Business phone (#695/#699) |
| `…?panel=a2p` | `A2PTab` | none — read-only status |
| `…?panel=consent` | `ConsentTab` | none — a count only |
| `…?panel=signatures` | `SignaturesTab` | none |
| `…?panel=notifications` | `NotificationsTab` | placeholder cards |
| `…/snippets`, `…/manual-actions`, `…/trigger-links`, `…/analytics` | four components | none |
| `/admin/communications` | `CommunicationsAdmin` | none |
| in-thread + contact-rail call buttons | `ConversationsCallButton`, `CallButton` | none in Solo |

## Resurfacing order — cheapest real value first

**No owner authorization needed** (pure ports and reads):
1. ~~Owned-numbers table into Connections → Business phone.~~ **DONE 2026-09-01 (#695)** — with
   rename and choose-what-you-send-from, which were not in the original scope.
2. `A2PTab` into Messaging registration — reaches "prepared" with **no backend change**.
3. `ConsentTab` into Messaging registration.
4. Click-to-call in the Solo thread and contact pane (the dialer is already mounted).
5. Render voice rows as call bubbles — the columns are already on prod.

**Owner authorization required** (each is a provider action, and each is a separate Trust Compass
capability per `connections-rail-contract.md` §0b):
6. ~~Live number search, and purchase (a recurring charge).~~ **REACHABLE 2026-09-01 (#695/#699) —
   and NO lane carries the full authorization.** **Updated 2026-09-01:** the agent lane at `confirm`
   re-verifies the price server-side AND its confirmation is now bound to a server-minted proposal
   that must predate the turn — the self-asserted flag no longer executes anything. It still does
   not prove a human said yes, only that one took a turn. The agent lane at `auto` has no
   confirmation at all. Solo has a
   real browser confirmation but no server-side price check. The legacy tab has neither. **Do not
   treat this item as closed:** what shipped is reachability, not the authorization the item
   originally meant. See the lane table above, and the tracked follow-up covering both UI lanes.
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
