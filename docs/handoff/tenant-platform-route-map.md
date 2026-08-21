# PAIGE tenant platform route and sub-view map

This is the target design architecture over the **existing** operational route graph. Existing routes remain canonical until a connected nested destination reuses the same component and passes its matrix acceptance test.

| Primary destination | Target sub-views | Current canonical implementation homes |
|---|---|---|
| Home | Briefing, priorities, approvals/exceptions, active work, recommendations, calendar preview, pipeline/client/source signals | `/admin`; summaries deep-link to the canonical systems below |
| Clients | Overview, Accounts, Contacts, Conversations, Pipeline, Client journeys, Appointments, Files, Service history | `/admin/clients-hub`, `/admin/clients`, `/admin/contacts/:id`, `/admin/clients-hub/conversations`, `/admin/clients-hub/pipeline`, journey routes, `/admin/clients-hub/delivery` |
| Work | Today, Tasks, Calendar, Projects, Workflows, Automations, Runs, Scheduled, Approvals | `/admin/planning`, delivery calendar, `/admin/setup/automations`, workflow detail/run routes, `/admin/approvals` |
| Studio | Projects, Recent sessions, Starred, Templates, Library; immersive session | `/admin/studio?view=…`, `/admin/studio/library`, `/admin/studio/:sessionId`; reuse `StudioLayout`/`StudioHome`/`StudioShell`/`VibeStudio` |
| Insights | Executive, Sales, Revenue, Marketing, Client health, Operations, Forecasts, Recommendations | `/admin/analytics`, same pipeline deal scope, subscription events; remaining unified views are owed and must label incomplete sources |
| Settings | Business, Brand, Integrations, Team, Workforce, Capabilities, Marketplace, Skills, Playbooks, Knowledge/memory, Trust, Notifications, Models/routing, API/MCP, Billing | existing `/admin/setup/*`, `/admin/team`, `/admin/sub-agents`, `/admin/marketplace`, `/admin/skills`, knowledge, approval/autonomy, notifications and connector routes |

## Navigation contract

1. Six primary destinations remain the only tenant-level destinations.
2. Destination-specific sub-navigation is horizontally scrollable or collapsible; it is not a second permanent sidebar.
3. Every operational object preserves a canonical deep link.
4. PAIGE may reveal that route in a contextual Workspace without replacing the shared thread.
5. Home summarizes; it does not duplicate inbox, pipeline, runs, Studio, or Insights.
6. Studio sessions are PAIGE and therefore never mount the persistent PAIGE rail a second time.
7. The old route may redirect only after the same connected component is mounted at its new home and the recovery-matrix acceptance test passes.
