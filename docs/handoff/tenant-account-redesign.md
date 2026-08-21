# PAIGE tenant account redesign — engineering handoff

**Status:** interactive, front-end-only prototype at `/tenant-redesign`  
**Audience:** tenant business owners only; this is not an operator, Fleet, or Super Admin surface.  
**Data contract:** every value and event is representative design data. No control calls Supabase, sends a message, mutates a record, or runs an agent.

## Visual preview

![PAIGE tenant Command Spine desktop preview](./tenant-redesign-preview.svg)

The preview above is a text-based, diff-compatible, exportable 1440×900 SVG design asset of the selected Command Spine direction: six-item tenant navigation, the Morning Command Center, and an expanded PAIGE conversation with active representative work. It is provided for immediate visual review; the interactive route remains `/tenant-redesign`.

## 1. Audit and decision

### Preserve

- The recognizable obsidian / near-black-violet environment, mineral-white type, warm spectral champagne PAIGE energy, restrained line icons, and precision borders.
- Deep-linkable structured business surfaces, especially CRM records, tables, timelines, calendar objects, and approvals.
- The shared `PaigeMark`, visible focus behavior, keyboard-command precedent, reduced-motion support, semantic status vocabulary, and honest preview/not-connected states.
- PAIGE's existing right-edge access pattern, developed into a persistent command spine rather than a support widget.

### Consolidate

- Command Center + PAIGE Chat become **Home**. Home is PAIGE's command center; PAIGE is not a competing nav destination.
- Calendar + Automations + Tasks + Projects + Runs + Approvals become **Work**.
- Client Support + conversations + pipeline + directory become **Clients**.
- Growth builders + documents + images + presentations + campaigns become **Studio**.
- Analytics + reporting + revenue intelligence become **Insights**.
- Integrations + Team + Marketplace + setup + billing + Trust Compass detail + knowledge + memory + agents + capabilities become searchable groups in **Settings**.

### Remove from permanent navigation

PAIGE, Trust Compass, Automations, Calendar, Client Support, Growth, Analytics, Billing, Marketplace, Business Vault, Integrations, Team, Setup, and every individual agent/capability tab. Their functionality remains addressable through the six outcome destinations, command search, contextual workspace, or Settings. Legacy deep routes should redirect; do not hard-delete them during implementation.

### Shell directions explored

1. **Command Spine — selected.** Six-item left navigation, business canvas, and persistent PAIGE spine at right. PAIGE expands into a full session; contextual work opens beside the same conversation; activity is disclosed on demand. This best preserves structured CRM trust while making PAIGE feel native to the entire environment.
2. **Conversation Canvas.** PAIGE dominates the center and business views open as sheets. Bold, but makes CRM/calendar browsing feel secondary.
3. **Workspace Dock.** Business canvas dominates and PAIGE expands from a bottom dock. Familiar, but risks reading as a bolted-on chatbot.

## 2. Information architecture

| Destination | Contents |
| --- | --- |
| Home | PAIGE briefing and conversation, priorities, overnight work, approvals, exceptions, recommendations, commitments |
| Clients | Accounts and contacts, conversations, pipeline, opportunities, health, activity, appointments, files, service history |
| Work | Overview, tasks, calendar, projects, workflows, runs, scheduled work, approvals |
| Studio | Artifact library, documents, images, presentations, reports, pages, campaigns, brand assets, projects and versions |
| Insights | Executive overview, revenue, sales, marketing, client health, operations, forecasts, recommendations |
| Settings | Business and brand, integrations, team, workforce, capabilities, playbooks, skills, memory, trust, notifications, models, API/MCP, billing |

### Old → new navigation map

| Old home | New home |
| --- | --- |
| Command Center; PAIGE / Chat | Home |
| Clients; Client Support | Clients |
| Calendar; Automations | Work |
| Growth; generated Documents / Vault assets | Studio |
| Analytics; Billing / Revenue reporting | Insights |
| Marketplace; Integrations; Team; Setup; Trust Compass detail; Knowledge; Sub-agents; Actions; Skills; PAIGE Team | Settings |
| Business Vault obligations / renewals / vendors | Work |
| Business Vault company / legal source records | Settings |
| Global Ask PAIGE and ⌘K | The same persistent PAIGE session, never a second thread |

## 3. Region model

There are never more than three contextual regions:

1. **Conversation:** transcript, voice, composer, clarification, contribution, recovery, approval.
2. **Workspace:** optional, dismissible artifact or business record. Opening it never clears the thread.
3. **Activity and approvals:** collapsed by default; opens as a drawer/overlay rather than a fourth column.

On Home, the briefing is the opening state of PAIGE's Command Center. On business surfaces, PAIGE persists as a collapsed or expanded right spine and receives the current route/record context. Agents never create their own rooms.

## 4. Connected prototype flows

1. **Morning Command:** Home → Review with PAIGE → reprioritized response → client or approval continuation.
2. **Campaign Creation:** In-motion campaign → visible KAVYN/ZION/OATHEN dispatch → strategic choice while work continues → proposal workspace.
3. **Client Intelligence:** Clients → Anderson → structured record beside PAIGE → commitment/risk/recommendation → staged follow-up.
4. **Live Voice:** Voice toggle → listening state while proposal/image work remains visible → direction can change without canceling other work.
5. **Trust and Delivery:** reviewed artifact → inline Ask First approval → review workspace → approve once / remember / decline states. Prototype confirmation explicitly says nothing was sent.

## 5. Screen and state inventory

The 55 requested canvases are implemented as reusable modes rather than 55 disconnected pages. `P` means interactive prototype; `S` means a specified reusable state for production wiring.

| # | Screen/state | Coverage |
|---:|---|---|
|1–7|tenant nav; Home; conversation-only; collapsed/expanded rail; full PAIGE; mobile PAIGE|P: shell, rail controls, responsive full-screen mode|
|8–11|new/existing conversation; text; voice|P/S: resumed thread and composer/voice; production empty-thread state uses same components|
|12–16|multiple tasks; dispatch; direct address; waiting; inline approval|P: flow tabs, work strip, @ZION, question choices, approval|
|17–20|success; partial; failure/retry; resumed session|S/P: status rules below; resumed marker is P|
|21–28|document; image; presentation; revision; versions; review; delivered; linked client|P/S: document workspace and review/link metadata are P; image/presentation reuse the artifact renderer per type|
|29–35|client list; record; record + PAIGE; inbox; pipeline; opportunity update; follow-up approval|P/S: list/record/split/approval are P; inbox/pipeline reuse structured workspace specifications|
|36–44|Work; Calendar; project/workflow; Studio; Insights; Trust summary/detail; Settings; Integrations|P/S: destination indices and Trust summary are P; detailed leaves reuse index-to-workspace navigation|
|45–52|empty; disconnected; missing; loading; working; error; permission; mobile approval|P/S: disconnected/working/mobile approval are P; remaining canonical copy and transitions below|
|53–55|tablet; laptop; large screen|P: responsive CSS breakpoints and screenshot targets below|

Before production implementation is accepted, engineering should add a Storybook/state-lab route that directly renders every `S` entry. The prototype does not imply those backend states have occurred.

## 6. Component inventory

- Shell: `TenantNav`, `TopContextBar`, `PaigeRail`, `Workspace`, `ActivityDrawer`, `MobileDock`.
- Conversation: `PaigeHeader`, `ThreadHistory`, `MessageRow`, `RecordReference`, `MemoryRecall`, `ClarifyingQuestion`, `Composer`, `VoiceStrip`.
- Execution: `WorkPlan`, `WorkItem`, `AgentGlyph`, `Contribution`, `HandoffLine`, `RetryAction`.
- Artifact: `ArtifactCard`, `ArtifactHeader`, `PreviewRenderer`, `Editor`, `VersionDrawer`, `ReviewState`, `DeliveryDestination`.
- Trust: `CompassSummary`, `ApprovalCard`, `WhySheet`, `ScopeRule`.
- Business: `ClientTable`, `ClientRecord`, `RelationshipHealth`, `Timeline`, `Commitments`, `OpportunityDiff`, `Inbox`, `Pipeline`, `Calendar`, `Workflow`, `EvidenceView`.
- System: `Skeleton`, `EmptyState`, `MissingData`, `Disconnected`, `PermissionDenied`, `InlineError`, `Toast`.

## 7. Design tokens

The authoritative refined token specification is in **§18 → Updated typography tokens** and **§18 → Material tokens** below. Production should map these scoped prototype tokens into the platform semantic HSL layer; component call sites must not introduce independent color decisions. The earlier uniform prototype palette and unbundled DM Sans/Manrope references are superseded.

## 8. Responsive behavior

- **≥1440:** 216px navigation, fluid business canvas, 420px PAIGE; workspace overlays/reallocates the canvas. Content max 1100px.
- **1024–1439:** 72px icon navigation, 390–420px PAIGE, fluid workspace; never compress conversation below 360px.
- **768–1023:** one primary pane; Workspace is an edge sheet; PAIGE is a full-height overlay. A split is allowed only when at least 900px wide and the artifact benefits.
- **<768:** 64px bottom navigation; PAIGE and Workspace are full-screen routes. Back returns to the preserved conversation. Approval actions are at least 44px and stack into two columns / one column when needed. Composer respects safe-area and keyboard insets.
- Screenshot acceptance sizes: 375×812, 768×1024, 1280×720, 1440×900, 1920×1080.

## 9. Motion

- Hover/focus 120ms; drawers 180ms; workspace reveal 240ms.
- Motion must describe dispatch, handoff, approval, or completion. No ambient parallax, stars, or ornamental looping glow.
- Listening may use a restrained meter plus explicit text; progress uses deterministic labels, never an indefinite decorative animation.
- `prefers-reduced-motion: reduce` removes traces, pulses, draws, and spatial transforms while preserving state text and announcements.

## 10. State-transition maps

### Work item

`Queued → Working → Ready → Complete`  
Branches: `Working → Waiting for input | Needs approval | Partial | Failed | Blocked | Cancelled`. Retry returns only the failed item to `Working`; completed work remains intact.

### Artifact

`Requested → Producing → Ready → Reviewed → Approved → Delivered`. Revision from Ready/Reviewed/Approved creates a new version and returns it to Producing; the prior version remains available. Failed and Blocked are side states, not lifecycle shortcuts.

### Voice

`Ready → representative Listening → Understanding → PAIGE speaking → Delegating → Working → Waiting for approval → Complete → Interrupted → Reconnecting → Ready`. This is a visual state preview only; production microphone capture must insert explicit recording consent before Listening. Interruption immediately stops speaking and returns to Understanding. Network loss becomes `Connection interrupted` with transcript preservation; recovery becomes `Conversation resumed` in the same thread. Background work is separately labeled and may continue.

### Approval

`Draft → Ask First → Review | Approve once | Approve with scoped memory | Decline`. Approval never means delivered. Delivery transitions independently through Sending → Delivered or Blocked; irreversible effects are explained before approval.

## 11. Major interaction contract

| Interaction | Trigger | Visual response / state | Destination | Loading | Success | Failure | Mobile |
|---|---|---|---|---|---|---|---|
| Open PAIGE | right spine, PAIGE header, ⌘/Ctrl+J | spine widens; thread never resets | same route, contextual conversation | skeleton after 400ms | composer ready | offline composer with saved draft | full-screen conversation |
| Command search | ⌘/Ctrl+K or top button | command palette with outcomes/records | selected surface or same thread | progressive results | context chip added | retry search; keep query | full-screen palette |
| Dispatch work | send outcome request | acknowledgment + work plan within 100ms | conversation; optional activity | labeled Queued/Working | durable summary | partial results retained + scoped retry | status sheet, composer remains usable |
| Open artifact/record | contribution, row, or PAIGE link | Workspace reveals beside thread | contextual Workspace | typed skeleton | preview/edit available | error inline; close/retry | full-screen sheet + Back to conversation |
| Revise artifact | natural command or editor | active version returns to Producing; artifact stays visible | same Workspace | streaming diff/progress | new numbered version | retain prior version + retry | one pane; switch conversation/workspace |
| Voice | microphone, after consent | explicit Listening/Understanding/Speaking text + transcript | same thread | reconnect label after loss | transcript persists | saved transcript + Resume | full screen; 44px controls |
| Approve action | approval card action | lock target/scope, then execution state | same thread + activity | Sending is distinct | Delivered with destination/time/source | Blocked + Retry/Save draft | bottom sheet or full card |
| Direct agent | `@name` in composer | contribution attributed inside same thread | nowhere else | same work statuses | PAIGE synthesizes | PAIGE explains unavailable specialist | same composer |

## 12. Agent interaction rules

- PAIGE is always the interlocutor and orchestrator. A specialist never becomes a permanent tab or separate chat.
- Agent identity is name + function + restrained glyph + contribution/status, never portrait galleries.
- Direct address changes routing/attribution inside the current thread. PAIGE normally synthesizes the final answer.
- UI copy and data contracts must not depend on provisional specialist names. Only PAIGE and ZION are assumed stable; all other displayed names are provisional aliases supplied by roster configuration.
- Activity shows only machinery useful for confidence: worker, task, state, blocker, review attribution.

## 13. Trust Compass behavior

- Compact summary is persistent: **“Trust Compass · 2 autonomous · 7 ask first · 2 draft only.”** Counts are representative in the prototype.
- Inline cards explain: governing rule, preparer/reviewer, exact affected account/person, exact action after approval, reversibility, and destination.
- **Approve once** authorizes only this action. **Approve and remember** must first open a scope selector (this recipient / this client / this action type); never silently broaden authority. **Decline** keeps the draft and asks whether the user wants a revision.
- Permission denied copy: **“You can review this work, but your role cannot approve delivery.”** Action: **“Request approval.”**
- Trust is sovereignty: neutral, precise, and reversible where the underlying action permits it—never scolding language.

## 14. Canonical system copy

- Data: **“Representative design data — no live business systems are connected.”**
- Partial: **“The proposal is ready, but image 3 could not be produced. Continue with two images or retry the missing image.”**
- Disconnected: **“Email is not connected. Your draft is saved; connect an account before delivery.”**
- Missing: **“There is not enough source data to establish this relationship signal.”**
- Loading: **“PAIGE is locating the source records…”**
- Error: **“The source could not be reached. Nothing was changed.”**
- Permission: **“You can review this work, but your role cannot approve delivery.”**
- Voice consent: **“Microphone on. PAIGE will transcribe this conversation while you speak.”**
- Voice interruption: **“Interruption heard. I’m revising the direction while the other work continues.”**
- Connection loss/recovery: **“Connection interrupted. Your transcript is saved.”** / **“Conversation resumed. Two background items are still working.”**
- Completion: **“Campaign package complete: 5 artifacts reviewed, 1 pipeline update approved, and no external messages sent without approval.”**

## 15. Mocked vs expected functional behavior

| Prototype (mocked locally) | Production seam expected later |
|---|---|
| section/flow/rail/workspace state | router + persisted layout preferences |
| representative thread/work items | PAIGE thread/orchestration event stream |
| voice visual toggle | consent, microphone, transcription, interruption, reconnect |
| document and client previews | versioned artifact service and tenant-scoped CRM reads |
| approval confirmation | Trust Compass policy evaluation + approval/action bus |
| client/integration labels | RLS-scoped records and connection-health service |

No prototype control may be treated as proof that an integration, record mutation, run, review, or delivery exists in production.

## 16. Accessibility requirements

- Semantic `nav`, `main`, `aside`/dialog, headings, lists/tables, and buttons; one page-level `h1`.
- Keyboard reachable; visible ≥2px focus; `aria-current`, `aria-expanded`, labels for icon controls; Escape closes the top layer. Production integration must restore focus to the invoking control; the prototype preserves browser focus but does not implement a full dialog focus trap.
- AA text contrast, ≥3:1 focus and essential boundaries, non-color status language, ≥44px mobile targets.
- Polite live region for meaningful work transitions; assertive only for recording, connection loss, or action failure. Do not announce every progress tick.
- Recording consent precedes microphone capture. Transcript, work, artifact, record context, and approvals remain visible.
- Reduced motion, no focus stealing during streaming, responsive zoom/reflow, safe-area and virtual-keyboard handling.

## 17. Exportable assets and source files

- Shared PAIGE asset: `src/components/brand/PaigeMark.tsx` (SVG, theme-independent).
- Prototype system and exact rendered copy: `src/prototype/TenantRedesign.tsx`.
- Scoped tokens, layout, motion, focus, and breakpoints: `src/prototype/tenant-redesign.css`.
- This document is the implementation contract; production should extract components and platform tokens rather than connecting backend code directly to the prototype file.

## 18. Visual elevation pass — PR #560 refinement

The approved six-destination architecture and five prototype flows are unchanged. This pass integrates PAIGE's brand more deeply into the existing shell.

### Before and after

| Before | Refined direction |
|---|---|
| Uniform system typography | Architectural display hierarchy, sustained-use interface text, editorial artifact typography, and tabular operational data |
| Nearly flat dark rectangles | Eight functional material levels: environment, navigation, canvas, conversation, Workspace, artifact/record, authority, and elevated intelligence |
| Conventional right chat panel | Command Spine with intelligence aperture, environmental edge trace, context, active work, authority, and collapsed/full states |
| Initial-letter worker badges | Configurable geometric agent glyphs, `by PAIGE` naming, functional role, contribution, and handoff trace |
| Warning-style approval card | Sovereign authority frame with governing mode, scope, destination, actor/reviewer, reversibility, and distinct approval actions |
| Generic drawer | Workspace materialization edge, precision object header, provenance, version, review status, connected record, and mobile return to conversation |
| One voice toggle | A shared intelligence-state grammar with explicit state language and user-controlled representative voice-state preview |

### Updated typography tokens

No external font request is made. The prototype uses system-safe stacks already available on supported operating systems:

- Display: `Segoe UI Variable Display`, `SF Pro Display`, `Helvetica Neue`, Arial.
- Interface: `Segoe UI Variable Text`, `SF Pro Text`, system UI.
- Artifact/editorial: `Iowan Old Style`, Baskerville, `Times New Roman`.
- Data: system monospace with tabular numeric forms.

Major page statements use fluid 36–55px display type with a controlled editorial accent. Conversation is 14px/1.65 with a 58-character measure. Operational content is 10–14px by role; uppercase micro-labels are reserved for nonessential classification and never carry a state alone.

### Material tokens

| Layer | Token | Purpose |
|---|---|---|
| Obsidian environment | `--env: #08070b` | deepest operating environment |
| Navigation plane | `--nav: #0d0b11` | stable location and account identity |
| Business canvas | `--canvas: #100e14` | structured business work |
| Conversation plane | `--conversation: #121017` | persistent PAIGE intelligence |
| Workspace | `--workspace: #16131a` | materialized work instrument |
| Raised control | `--surface-raised: #211d27` | deliberate interactive elevation only |
| Artifact | `--artifact: #e9e4da` | produced mineral-white object |
| Sovereign authority | `#181510` + champagne metal rules | consequential permission layer |

Champagne is a restrained spectral trio (`#c7a978`, `#ead5aa`, `#fff0cf`) reserved for PAIGE presence, focus, authority, and execution edges. Violet metal indicates active execution, never generic AI decoration.

### PAIGE intelligence-state grammar

| State | Visual signature | Persistent meaning |
|---|---|---|
| Ready | static faceted intelligence aperture | available and context-aware |
| Listening | three-segment inward voice meter | microphone preview is listening |
| Understanding | controlled inward meter and state label | interpreting the latest command |
| Speaking | outward meter and state label | PAIGE is responding |
| Delegating | branching edge trace + worker handoff | specialists are being assigned |
| Working | deterministic edge trace + textual work count | execution continues in background |
| Waiting for approval | stationary Sovereign champagne bracket | action is held at the authority boundary |
| Completing | trace converges toward positive endpoint | results are being assembled |
| Interrupted | hard-stop edge break in the trace | a direction change was understood |
| Reconnecting | segmented trace joining across the edge | conversation context is being restored |

The five flows set meaningful baseline states. The representative voice-state control cycles through all ten visual states—Ready, Listening, Understanding, Speaking, Delegating, Working, Waiting for approval, Complete, Interrupted, and Reconnecting—without accessing the microphone. Flow, work, and approval surfaces use the same `.state-*` grammar. All state meaning remains textual when motion is reduced.

### Configurable agent identity

`AgentGlyph` receives an agent record rather than deriving visual identity from a hard-coded portrait. Each contribution contains display name, `by PAIGE`, configurable function, provisional-name disclosure, glyph variant, task, and status. PAIGE and ZION can remain locked while the other display names change without changing component geometry. Handoffs use a common precision trace rather than independent project-management colors.

### Workspace materialization

Opening work activates a single 300ms physically directed reveal: a champagne-to-cool-metal edge resolves from conversation into the Workspace, then the object surface settles. Artifact and CRM record treatments remain distinct. The artifact uses editorial mineral material, version/review state, provenance, connected account, and attribution; the record retains structured fields and an explicit representative-data basis. On mobile, **Conversation** is a visible return action and destination changes dismiss both Workspace and PAIGE overlays.

### Motion specification

- UI response: 120ms ease.
- Command Spine: 260ms `cubic-bezier(.22,1,.36,1)`.
- Workspace materialization: 300ms using opacity, translate, and clip reveal.
- Agent handoff: 180–320ms directional trace; no unrelated motion.
- Authority: 220ms edge ingress; it remains stationary while waiting.
- Completion: 360ms convergence, then stillness.
- Listening/working are the only repeating state motion and stop when the state changes.
- Reduced motion collapses every animation/transition to 0.01ms and one iteration while preserving state labels and geometry.

### Responsive refinement

- 1280×720: compact 72px navigation, 390px Command Spine, reduced vertical rhythm without shrinking primary type below the intended hierarchy.
- 1440×900: 216px navigation, proportional canvas, fluid 30vw Command Spine.
- 1920×1080: 232px navigation, 448px Command Spine, business content capped at 1240px.
- 2560×1440: 240px navigation, 480px Command Spine, business content capped at 1440px with 96px editorial gutters.
- Tablet/mobile: one primary layer; destination selection closes Workspace, closes navigation, and dismisses the full PAIGE overlay. PAIGE and Workspace use full-screen layers above the persistent five-action dock.

### PR #560 review findings resolved

1. `/tenant-redesign` is now an exact member of `CHATBOT_HIDDEN_ROUTES`, so the global production chatbot cannot create a second PAIGE surface in the prototype.
2. All desktop and mobile destination controls use the same transition: update destination, close mobile navigation, close Workspace, and collapse PAIGE on mobile. Opening a flow deliberately restores the correct full or expanded conversation state.

### Remaining mocked functionality

The prototype remains intentionally front-end-only. It does **not** record audio, transcribe speech, run orchestration, create or persist artifacts or versions, remember approval policies, send messages, mutate CRM records, connect sources, verify revenue, persist activity, or execute agent handoffs. Intelligence, work, record, Trust Compass, and delivery states are representative UI states. Controls that describe future scope selection or delivery remain visual contract surfaces until their production seams are connected.
