# The provider result contract

**Status:** proposed · **Owner brief:** Antonio, 2026-09-04 · **Consumed by:** Systems Check ·
**Produced by:** any workstream that owns a provider seam

> *"Do not implement A2P or Zapier provider functionality here. Instead, create reusable truthful
> result contracts so those separate workstreams can feed Systems Check when their real state is
> available."* — the owner, Brief 6

This document defines **the shape a provider workstream publishes**, and the rules that make what it
publishes true. It implements nothing. A2P/Twilio and Zapier/MCP remain separate active workstreams
and this document does not touch either; it is the seam they hand across.

Written after grounding every state machine below against live production
(`xygzykjyynhzqytbqnzu`, read-only, 2026-09-04). Every enum quoted is a live CHECK constraint.

---

## 1. Why a contract, rather than Systems Check reading each provider

Three reasons, and the third is structural.

**Ownership.** A provider's state machine belongs to the workstream that owns that provider. Systems
Check reading `tenant_a2p_registrations.submission_phase` directly means every A2P change is also a
Systems Check change, and the two teams break each other.

**Truthfulness has to live where the knowledge is.** Whether `brand_status='submitted'` means *"we
are waiting on a carrier"* or *"we wrote that optimistically and never confirmed"* is a fact only the
A2P workstream holds. Systems Check cannot infer it, and guessing is how a surface starts telling
someone to wait for a thing nobody filed.

**The check store cannot carry two of the eight words.** `paige_systems_check_finding.status` is
CHECK-constrained to `pass | fail | skip | error`. So **no signal that flows through the check runner
can ever express `PENDING PROVIDER` or `PAUSED`.** Those two statuses must reach the surface by a
different path. That path is this contract.

---

## 2. The shape

```jsonc
{
  "signal_key":   "comms.a2p.campaign",     // stable, namespaced, never renamed once published
  "status":       "PENDING PROVIDER",       // one of the eight. Never a ninth.
  "why":          "filed 29 Aug; the carrier has not answered",
  "owner":        "provider",               // tenant | provider | paige | platform
  "observed_at":  "2026-09-04T22:43:11Z",   // when we LOOKED. Not when we wrote.
  "source":       "tenant_a2p_registrations.campaign_status",
  "next_action":  { "label": "Connections › Registration",
                    "route": "/solo/{account}/settings/connections?segment=registration" },
  "blocked_by":   null,
  "provider_ref": "campaign 29 Aug"         // human-meaningful. NEVER a SID, token, or raw payload.
}
```

`next_action` may be `null` — but only with a stated reason in `why`. A null action with no reason is
the *"open PAIGE for more"* dead end the owner ruled out.

---

## 3. The rules

These are the whole point. The shape is trivial; the rules are what stop it lying.

**R1 — `PENDING PROVIDER` requires a real submission.** Publish it only when the record shows the
workspace's part is genuinely done: a `submitted_at`, a provider id, a written DNS record. **"Not
started" is `NOT CONNECTED`.** Conflating the two tells an owner to wait for something nobody filed —
and it is the single most likely way this contract gets abused, because a status column that reads
`pending` looks like waiting when it means untouched. `tenant_a2p_registrations.brand_status` has
literally `'pending'` as its pre-submission value.

**R2 — an optimistic local write is `PROOF OWED`, never `LIVE`.** If we wrote a row on save and no
probe has confirmed it against the provider, say so. `tenant_mcp_connections.status =
'pending_verification'` exists for exactly this and its own migration comment says only a real probe
may clear it. Nobody external owes anything there — **we** owe the probe.

**R3 — `observed_at` is when we looked, not when we wrote.** A value cached three weeks ago is not a
current reading, and a surface that shows it undated is claiming a freshness it does not have. If the
last look is old, the status is still whatever it is and `why` carries the age.

**R4 — publish provider failure with its own words, and a real next move.** Carry the provider's code
and reason (`provider_failure_code`, `provider_failure_reason`). Map to `NEEDS ATTENTION` **when the
owner genuinely has an action** — A2P rejection has `resume_brand` / `resume_campaign`, so it does.
When the owner has no action, see §5: that is the known hole.

**R5 — never publish a credential, token, raw provider payload, internal SID, or an identifier the
workspace cannot act on.** `provider_ref` is for a human to recognise which submission this is
("campaign 29 Aug"), not for us to debug with. Debugging identifiers belong in the producing
workstream's own logs.

**R6 — the contract reports state; it never decides authority.** Whether Paige may *act* on a
connected provider is `resolve_tool_autonomy` and the Trust Compass (§67/§68). A publisher that
returns `LIVE` is saying the seam works, never that anyone may use it.

**R7 — a status the publisher cannot currently determine is `UNAVAILABLE` with a reason.** Not a
guess, not the last known value silently re-served, and not omission. Omission reads as "fine".

**R8 — tenant scope is the publisher's job.** Every result is for exactly one workspace, derived
server-side from the caller's own resolved tenant, never from a parameter the caller supplied (§9,
and the #588 pattern this platform has already paid for four times).

---

## 4. Reference mappings

**These are illustrations that the shape covers the real state machines — not implementations, and
not instructions to either workstream.** Each owning workstream decides its own mapping; these exist
so the contract can be checked against reality rather than against intent.

### 4.1 A2P / carrier messaging — owned by the A2P workstream

Live enums: `brand_status` and `campaign_status` are
`pending | submitted | in_review | approved | rejected`; `status` adds `suspended`;
`submission_phase` is `prepared | brand_draft | brand_submitted | brand_approved | campaign_draft |
campaign_submitted | approved | action_needed | failed | canceled`; `number_registration_status` is
`not_started | pending | registered | failed | unregistered`.

| Provider state | Contract status | Owner | Note |
|---|---|---|---|
| `pending` / `prepared` / `not_started` | `NOT CONNECTED` | tenant | **R1** — nothing filed. Not a wait. |
| `brand_draft`, `campaign_draft` | `NEEDS ATTENTION` | tenant | Started and not sent |
| `submitted`, `in_review`, `brand_submitted`, `campaign_submitted` | `PENDING PROVIDER` | provider | The carrier owes the answer |
| `approved`, `registered` | `LIVE` | — | |
| `rejected`, `failed`, `action_needed` | `NEEDS ATTENTION` | tenant | **R4** — carries the provider's reason; `resume_brand` / `resume_campaign` are the real actions |
| `canceled`, `unregistered` | `NOT CONNECTED` | tenant | Withdrawn; can be filed again |
| `suspended` | **see §5** | provider | **No word fits.** Owner ruling pending |

`tenant_comms_readiness()` already projects `a2p: 'submitted'` with
`blocked_reason: 'registration_not_approved'` — a publisher should extend that existing projection
rather than stand up a second one (§18).

### 4.2 Automation providers (n8n, Zapier) — owned by the integrations workstream

Live enums: `tenant_mcp_connections.status` is
`unconfigured | pending_verification | connected | error`, `provider` is `zapier | n8n`.

| Provider state | Contract status | Owner | Note |
|---|---|---|---|
| `unconfigured` | `NOT CONNECTED` | tenant | |
| `pending_verification` | `PROOF OWED` | **paige** | **R2** — saved, never probed. We owe the check, nobody external does |
| `connected`, nothing approved to run | `NEEDS ATTENTION` | tenant | Connected is not permitted; naming which workflows may run is the owner's |
| `connected`, approvals present | `LIVE` | — | |
| `error` | `NEEDS ATTENTION` | provider | Provider unreachable. The action (`retry_check`) is real and the owner's, so this fits — imperfectly, since it implies owner fault |
| OAuth mid-consent (`pending`/`launched`/`exchanging`) | `NEEDS ATTENTION` | tenant | **Not** `PENDING PROVIDER`: the human is on the consent screen. `complete_or_cancel_consent` |
| Catalogue older than its freshness window | `LIVE` **with** an aged `observed_at` | paige | **R3** — the connection works; the list is stale, and the age is on screen |

### 4.3 Email sending domain — owned by the comms workstream

`tenant_email_domains.status` is `pending | verifying | verified | failed`.

`verifying` → `PENDING PROVIDER`. This is the mapping that corrected a real error: the signal
inventory had recorded it `NOT CONNECTED`, which tells an owner to publish DNS records they have
already published. The one row on production carries a live provider id and three written records.

---

## 5. The known hole — `suspended`

`suspended` is a live CHECK value on **six** tables and is written by real shipped code: Twilio maps
its own subaccount status straight through; a platform operator can freeze a tenant; an agency admin
can suspend a seat; a carrier can suspend a registration.

**It means a capability was switched off by someone who is not the owner.** None of the eight words
carries that:

- `PAUSED` says *you* switched it off.
- `NOT CONNECTED` says it never was.
- `UNAVAILABLE` means there is no source; here the source is speaking, definitely and severely.
- `NEEDS ATTENTION` implies an action the owner may not have.

Zero rows sit in any suspended state on production today, so this is **reachable but unoccupied** — a
hole, not a defect anyone can see. It becomes visible the first time a carrier suspends someone.

**Until the owner rules**, a publisher uses `NEEDS ATTENTION` and puts *who switched it off* in `why`.
That is the least-wrong option and it is recorded here as a compromise rather than a design.

---

## 6. What this contract does NOT do

It does not implement A2P registration, Twilio provisioning, Zapier connection, MCP probing, or
domain verification. It does not read any provider API. It does not grant Paige authority over
anything. It does not decide when a workstream publishes — only what a publication must be true about.

## 7. Cross-references

`docs/product/systems-check-operating-readiness-spec.md` §4 (the closed vocabulary), §4.1 (why the
check store cannot carry two of the words), §4.2 (the hole), §5 (the Refresh contract) ·
`docs/doctrine/command-center-four-surfaces.md` (where Systems Check sits) · §9 tenant isolation ·
§13 honest reporting · §18 one home · §37 producer inventory · §38 processor-agnostic ·
§67/§68 (authority is decided elsewhere).
