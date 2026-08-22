# Tenant redesign verification report

**Commit scope:** Illuminated Precision hero pass  
**Route:** `/tenant-redesign`  
**Boundary:** representative front end; no destructive production action

## Automated evidence

| Requirement | Evidence | Result |
|---|---|---|
| Six primary destinations render | `TenantRedesign.test.tsx` clicks Home, Clients, Work, Studio, Insights, Settings and asserts the shell survives | Pass |
| Studio route failure | Test opens Studio and asserts Creation Chamber plus canonical connected-version bridge | Pass |
| Theme switching and persistence | Test selects Light, asserts `data-theme=light`, and checks `paige-tenant-theme` | Pass |
| Undefined route safety | `GenericSurface` falls back to the first declared view and renders an alert state if a capability list is absent | Pass by implementation + typecheck |
| Floating production chatbot | Central visibility tests cover PAIGE-owned shell roots/nesting | Pass |
| Reduced motion | Scoped media query collapses animation and transition durations while retaining textual state | Pass by static inspection |
| Build/type/lint/security | Repository commands listed in the PR verification | Pass locally |

## Responsive implementation inspection

The shell uses `100dvh`, internal scrolling, `min-height:0`, compact navigation at 1280px, overlay navigation at 900px, a mobile dock, height-aware rules at 800/760/730px, and hero-specific reflow at 1100/700px. Home receives an explicit 24px top inset at laptop heights below 800px. Target layout rules exist for 1366×768, 1440×900, 1920×1080, tablet, and mobile.

## Screenshot manifest

Required captures remain **blocked in this execution environment** because the Playwright package is present but no Chromium executable is installed, no system browser exists, and external browser download is unavailable. No hand-authored SVG is represented as a rendered-browser screenshot. Capture these from the deployed preview once the PR branch is pushed:

1. Home / dark — `?destination=home`
2. Home / light — toggle Light
3. Signal Field — `?destination=insights&view=executive`
4. Living Lineage — `?destination=insights&view=data-health`
5. Creation Chamber — `?destination=studio&view=projects`
6. Execution Theater — `?destination=work&view=today`
7. PAIGE full focus — use the Command Spine full-focus control
8. Tenant switcher — open representative account control
9. Mobile Home — 390×844
10. Evidence drawer — Signal Field → Inspect evidence

## Remaining limitations

- Hero data is explicitly representative or unavailable; no production tenant query is introduced.
- Real Studio components remain behind the integrity and lifecycle gates in the recovery matrix.
- Data Health observes a designed lineage contract; it is not connected to live registry records here.
- Browser-level pixel, console, overflow, focus-order, and screenshot proof must run in a browser-capable preview environment.
- No preview deployment URL can be truthfully supplied from this checkout because it has no Git remote or deployment credentials.

## Calendar / Conversations / spatial pass — 2026-08-22

Automated shell coverage now additionally verifies authored Calendar rendering, the canonical `CalendarAdmin` mount affordance, detached Calendar URL creation, Conversations list/thread/relationship rendering, the canonical `ClientsConversations` mount affordance, expanded→compact→canvas rail transitions, visible canvas restore, persisted rail preference, and PAIGE open/close behavior. The targeted prototype plus floating-chat suite contains 27 passing tests.

Static and component checks confirm Calendar day/week/month controls, task visibility, appointment/task inspectors, six Calendar internal views, honest connection states, Conversations draft/approval/conversion controls, and responsive layouts. The connected mounts intentionally defer live-data proof to authenticated RLS-backed execution.

Detached windows share the same route and a generated `workspaceSession` identifier. `BroadcastChannel` synchronizes non-sensitive layout context (theme, destination, view, navigation mode); authenticated records, Trust authority, approvals, sends, and live updates remain server-authorized and are not copied into the channel.

## Final density and material pass — 2026-08-22

The global command bar is now 48px, the expanded rail is 188px, and the compact rail is 58px. Operational surfaces use a compact utility header and viewport-derived internal canvas heights rather than a second banner. The final semantic palette separates blue/aubergine atmosphere, ink-plum navigation, smoked-graphite workspace, cool recessed fields, neutral working surfaces, and warm selected/command material in both dark and mineral-white themes.

The Home **View calendar** control now performs a direct capability transition to `Work / Calendar`; a regression assertion verifies that the Calendar instrument appears and that the Trust Compass drawer does not. The test count in this report must be read from the final command output rather than the earlier 27-test snapshot.

Visual capture remains an explicit environment limitation, not a claimed pass: `npx playwright install chromium` was attempted on 2026-08-22 and every CDN request returned HTTP 403. A browser-capable CI or preview deployment must still capture the manifest above and inspect console, overflow, focus order, and all requested viewports before production acceptance.

## De-boxing pass — 2026-08-22

The composition now treats layout with implied, partial, or material boundaries and reserves a full perimeter for selected events/signals/nodes, the editable Studio artifact, the Conversations composer, approval/security decisions, and other consequential objects. Calendar is a continuous temporal field with independently collapsible context and inspector rails; Conversations uses an open transcript and edge inspector; Studio retains the artifact perimeter while its surrounding rails recede; Insights and Living Lineage use continuous analytical fields; Work uses an open dependency line; Home and Settings use editorial rhythm and row rules rather than card grids; PAIGE and spatial drawers are defined by one illuminated edge rather than a boxed panel.

A static selector audit of the prototype stylesheet shows the de-boxing override replaces full borders on the principal layout containers with `border: 0`, partial rules, and tonal fields. It does not establish a pixel-based 50–60% visual reduction. Before/after screenshot comparison remains unavailable in this checkout because no browser executable is installed and browser download is blocked; visual verification is therefore not claimed.
