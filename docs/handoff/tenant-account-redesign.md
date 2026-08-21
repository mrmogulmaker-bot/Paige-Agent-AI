# PAIGE tenant account redesign — engineering handoff

**Status:** interactive, front-end-only prototype at `/tenant-redesign`  
**Audience:** tenant business owners only; this is not an operator, Fleet, or Super Admin surface.  
**Data contract:** every value and event is representative design data. No control calls Supabase, sends a message, mutates a record, or runs an agent.

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

Prototype CSS variables are scoped under `.tr-app`; production should map them into the platform semantic HSL layer rather than copying raw colors into components.

| Role | Prototype value | Use |
|---|---|---|
| Ground | `#0c0a11` | obsidian app environment |
| Panel 1 / 2 | `#131119` / `#191621` | smoked surfaces and raised controls |
| Border 1 / 2 | `#2d2835` / `#3b3444` | hierarchy and interactive edges |
| Mineral ink | `#f5f1e9` | primary text |
| Muted / faint | `#a7a0aa` / `#77717d` | secondary and tertiary content; validate AA by size |
| Champagne | `#e8c98e` | PAIGE presence, primary actions, approval energy |
| Champagne highlight | `#f7e6bd` | focus and spectral highlight |
| Violet | `#8e7de7` | active execution |
| Positive / warning / error | `#86cda7` / `#e8b976` / `#e7978b` | always paired with text/icon |

Typography: system/DM Sans fallback for UI; Manrope/system fallback for architectural headings. Production must use bundled/system faces, not depend on a third-party font request. Scale: 34/27 page title, 22 section lead, 16–18 section/artifact title, 14 body, 12–13 metadata, 11 minimum decorative label. Spacing follows 4px base: 4, 8, 12, 16, 24, 32, 48, 64. Radii: 6 icon, 8 control, 10–12 grouped region; avoid pill shapes except compact filters/status. Borders: 1px neutral, 2px focus/critical emphasis. Shadows only express overlays and document elevation.

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

`Ready → consent → Listening → Understanding → PAIGE speaking → Listening`. Interruption immediately stops speaking and returns to Understanding. Network loss becomes `Connection interrupted` with transcript preservation; recovery becomes `Conversation resumed` in the same thread. Background work is separately labeled and may continue.

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
- Keyboard reachable; visible ≥2px focus; `aria-current`, `aria-expanded`, labels for icon controls; Escape closes the top layer and returns focus.
- AA text contrast, ≥3:1 focus and essential boundaries, non-color status language, ≥44px mobile targets.
- Polite live region for meaningful work transitions; assertive only for recording, connection loss, or action failure. Do not announce every progress tick.
- Recording consent precedes microphone capture. Transcript, work, artifact, record context, and approvals remain visible.
- Reduced motion, no focus stealing during streaming, responsive zoom/reflow, safe-area and virtual-keyboard handling.

## 17. Exportable assets and source files

- Shared PAIGE asset: `src/components/brand/PaigeMark.tsx` (SVG, theme-independent).
- Prototype system and exact rendered copy: `src/prototype/TenantRedesign.tsx`.
- Scoped tokens, layout, motion, focus, and breakpoints: `src/prototype/tenant-redesign.css`.
- This document is the implementation contract; production should extract components and platform tokens rather than connecting backend code directly to the prototype file.

