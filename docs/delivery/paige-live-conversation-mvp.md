# Paige Live Conversation MVP — affected-flow, collision, and delivery packet

**Workstream:** dedicated Paige Live Conversation, separate from Skills and Intentful Interview

**Grounded base:** `origin/main` at `2719d7d8` after shipped PR #1054, including #1050/#1051

**Coordination checkpoint (2026-09-08):** the branch was re-grounded again before merge after
PR #1054 advanced `main`. That delivery owns the sole chronological Shipped Delivery Log in Master
Reference Section 4.0 and retires only obsolete public-home routes; Live Conversation must preserve
its log, current routing, and new closeout rule without creating another ledger. The branch was
re-grounded before further implementation.
Current `main` owns the canonical exact transcript-position contract through
`createAnchoredTranscriptScroll`: deliberate owner movement takes control immediately, and the exact
visible message plus pixel offset survives streaming, thread changes, resize, minimize/restore,
dock/pop-out, and client-to-server message rehydration. Live Conversation must compose with that
controller and may not restore the former Boolean near-bottom heuristic, unconditional auto-follow,
responsive remount, or index-based transcript identity. Draft PR #1044 remains a separate paused
Skills/Intentful Interview workstream and must re-ground and rebase after this delivery; none of its
client-scope, interview, or ledger changes are adopted here.

**Product status:** Paige-owned UI and control plane implemented; provider-backed realtime audio
remains `PROOF OWED`; authenticated owner production proof remains `UNVERIFIED` until deployment.

## Locked product boundary

Live Conversation is the spoken mode of the one dedicated, tenant-aware Paige workspace. Its only
entry point is **Talk live with Paige** beside the ordinary composer controls. It is not a Command
Center page, Interview tab, permanent navigation destination, new shell, assistant, memory store,
or action path. Intent follows the shared Spine: server-resolved actor/tenant/context/role → shared
authority → canonical governed tool/RPC → verified readback → detailed receipt and Rail evidence →
truthful transcript/card result. Raw audio, transcript, card text, and casual speech are not durable
Brain, Mind, or Memory facts.

## Delivered surface and control plane

- The exact Paige thread/transcript becomes an immersive full-screen stage. An existing Paige
  pop-out transforms in place; embedded chat can open a user-initiated companion window while the
  platform and unsaved page state remain mounted behind it.
- The responsive Paige Command Mark expresses the stage state without imitating another product.
  The stage shows context, transcript, truthful active work, and one current card.
- Question, choice, plan, evidence/result, governed-action, and recap cards share one presentation
  layer. Cards are derived only from a current conversation frame, artifact, or confirmation; there
  is no persistent card dashboard or card-owned mutation.
- Mute, Hold/Resume, Interrupt, Minimize, and End are visible and keyboard reachable. Unavailable
  audio cannot be muted, held, or interrupted. Escape minimizes, closes the stage, and restores
  focus to the exact composer control.
- Consequential cards reuse the exact existing chat confirmation fingerprints and callbacks. A
  spoken or clicked ordinary choice may become chat input; a casual spoken yes never executes a
  consequential action.
- `paige-live-session` re-resolves the JWT user, active tenant, caller-owned Paige thread, and scope
  epoch. It accepts no tenant, role, tool, provider credential, business mutation, or transcript.
- `paige_live_sessions` is service-only and snapshots the selected profile revision. It stores no
  raw audio or transcript. Workspace switch and end fail closed and clear the visible session.
- The shared `paige-tts` path now rejects request voice overrides and resolves only the active,
  approved service-side Paige Voice Profile. Literal provider voice defaults and tenant playbook
  voice settings are retired. A separately approved fallback is a profile revision, never an
  implicit router attempt.
- Profile, readiness, and independent provider-verification records use dedicated service-only
  relations; browser roles have no table privileges or RLS policy. The platform-owner activation
  endpoint consumes one matching fresh canonical verification record and returns no provider identity.
- Profile resolution and every cost reservation re-read the canonical verification flags. Revoking
  key scope, exact voice authorization, privacy/ZRM approval, quota, or either cost value fails closed
  even if a previously written readiness snapshot still says enabled.
- Provider TTS is preceded by an atomic, service-only calendar-month UTC cost reservation under the
  approved hard account ceiling and conservative per-1,000-character price ceiling. Cache hits do not
  reserve spend; only a typed, provably pre-dispatch missing-key failure releases it; success commits
  it. Ambiguous network/HTTP/body failures and settlement faults remain counted and withhold audio,
  deliberately over-counting rather than exceeding the cap. Cost rows survive actor deletion.
- Operator activation is one transactional service-only RPC: proof locking, readiness, and active
  profile replacement either all commit or all roll back.
- Studio narration's former request-selected provider route now fails closed as `UNAVAILABLE` until
  it is attached to this same profile/readiness resolver.

## Provider boundary and exact enablement gate

The requested provider reference exists only in the server-side pending candidate profile and is
inactive/unapproved. The active fallback profile is a separate approved server-side revision. A new
session resolves the then-active revision; an active session keeps its bound snapshot.

Realtime audio is deliberately disabled. This delivery performs no ElevenLabs provider call, token
issuance, microphone capture, audio streaming, secret inspection, hosted-agent creation, webhook, or
provider-side action. An authorized platform operator must independently verify and record all of:

1. a valid backend/service-account key with minimum realtime STT and TTS scopes;
2. realtime STT eligibility, token issuance, and required concurrency for the existing account;
3. exact approved provider voice availability and authorization, never a display name;
4. the account/session retention posture; Zero Retention Mode must be confirmed as applied, and a
   requested-but-not-applied warning fails closed;
5. quota plus both a Paige calendar-month hard cost ceiling and approved maximum price per 1,000
   characters; and
6. whether profile request tuning or provider-dashboard tuning is authoritative.

No provider-backed audio claim may advance until a fresh provider verification receipt supports
those facts and an approved transport-enablement change consumes it.

## Affected-flow matrix

| Flow | Owner-facing result | Verification |
|---|---|---|
| First use | Exact thread is reused or created through the existing thread RPC; stage opens and checks readiness before any microphone request | component + browser |
| Provider/setup unavailable | `PROOF OWED`/`UNAVAILABLE` explanation, retry, and same text conversation | component + browser |
| Mic denied | Dedicated denial copy and retry; nothing recorded | component contract; provider runtime not activated |
| Listening/speaking/waiting | State vocabulary and Command Mark presentation are implemented for the provider-neutral adapter | reducer tests; provider runtime `PROOF OWED` |
| Interruption | Stops presentation state only; cannot cancel already-governed work or create a mutation | reducer/component tests |
| Hold/resume | Same session transition; unavailable audio cannot imply a successful hold | reducer/component tests |
| Minimize/restore | Dialog closes, exact trigger regains focus, underlying composer/page state remains | unit + browser |
| End/cancel | Session transitions to ended and stage clears | reducer/component/control-plane tests |
| Transcript/review | Same Paige transcript; recap points are presentation only | component/card tests |
| Workspace switch | Context epoch change ends the session and clears the stage | component + control-plane tests |
| Disconnect/retry | Honest reconnect/retry vocabulary; new server resolution required | reducer/control-plane tests |
| Denied governed action | Visible authority state and exact scope; no direct voice execution | card/component tests |
| Accessibility | Modal semantics, named controls, focus trap, Escape/focus return, live announcements, forced colors, reduced motion | static + browser |

## Collision register

| Collision | Resolution |
|---|---|
| Shipped PR #1054 owns Master Section 4.0 and retires `/premium`/`/legacy` | Preserve the sole chronological Shipped Delivery Log, canonical public-route redirects/removals, and the closeout-only exception. Live Conversation adds its verified row only after the product merge; it does not restore retired routes or create a parallel log. |
| Skills/Intentful Interview PR #1044 touches Paige composer/workspace | Owner-paused and explicitly separate. This delivery adopts none of its interview, Skills, client-scope, or binding-ledger changes. After Live Conversation lands, #1044 must re-ground and rebase onto the resulting `main`. |
| Shipped PRs #1050/#1051 own transcript position in `PaigeAIChat.tsx` | Current-main `createAnchoredTranscriptScroll`, stable message identity, context switching, exact-bottom ownership, hidden-geometry handling, and pop-out document rebinding are canonical and non-negotiable. Live Conversation is manually composed around them; no old auto-follow/remount/near-bottom behavior may return. |
| Shared `PaigeAIChat.tsx` composer and transcript | Live Conversation adds one adjacent composer trigger and portals the same transcript without replacing the canonical scroll element, controller, message anchors, text/attachment/dictation paths, permissions, history, or confirmations. Minimize/end returns focus to the exact trigger and leaves the transcript controller and underlying page mounted. |
| Legacy literal/request voice selection | Closed in this branch: server profile is the sole Paige speech identity path; request overrides rejected; playbook voice field retired. |
| Existing chat pop-out | Portal renders into the trigger's owner document. Embedded launch can create a user-initiated companion; minimize restores exact chat and unsaved state. |
| Legacy `voice-command-processor` | Not imported or used by Live Conversation. It receives no new authority and remains outside this workstream; Live actions route only through PaigeAIChat/Spine. |
| Surface-context handoff gaps | Not widened. Live Conversation preserves the current server-resolved thread/context; broader raw `clientContext` retirement remains a separate Phase 1 contract. |

## Evidence boundary

Local automated, build, static, security-boundary, and rendered evidence is recorded in
`docs/evidence/ui-delivery/paige-live-conversation-mvp.md`. Synthetic harness data proves geometry
and state rendering only. It is not provider, tenant, canonical-record, receipt, Rail, deployment,
or authenticated-account proof. Final merge/deployment identifiers and remaining proof state belong
in the delivery closeout and release checks.
