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
