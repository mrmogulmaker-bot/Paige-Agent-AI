# Paige Live Conversation MVP — affected-flow, collision, and delivery packet

**Workstream:** dedicated Paige Live Conversation, separate from Skills and Intentful Interview

**Grounded base:** `origin/main` at `3f75ad58822d5e071556cb6d37c4c201612c929f`

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
5. quota plus a Paige hard cost ceiling; and
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
| Skills/Intentful Interview PR touches Paige composer/workspace | Rebased on current main and confined Live Conversation to a dedicated component and narrow composer mount. Interview remains one eligible conversation path, never the purpose or owner. Re-query before merge. |
| Shared `PaigeAIChat.tsx` composer | One adjacent trigger only; existing text, attachment, dictation, permissions, thread, transcript, and confirmation paths retained. |
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
