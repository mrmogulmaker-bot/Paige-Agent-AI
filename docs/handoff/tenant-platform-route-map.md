# PAIGE tenant platform route and sub-view map

This is the target design architecture over the **existing** operational route graph. Existing routes remain canonical until a connected nested destination reuses the same component and passes its matrix acceptance test.

| Primary destination | Target sub-views | Current canonical implementation homes |
|---|---|---|
| Home | Briefing, priorities, approvals/exceptions, active work, recommendations, calendar preview, pipeline/client/source signals | `/admin`; summaries deep-link to the canonical systems below |
| Clients | Overview, Accounts, Contacts, Conversations, Pipeline, Client journeys, Appointments, Files, Service history, Portal | `/admin/clients-hub`, `/admin/clients`, `/admin/contacts/:id`, `/admin/clients-hub/conversations`, `/admin/clients-hub/pipeline`, journey routes, `/admin/clients-hub/delivery` |
| Work | Today, Calendar (Calendar, Agenda, Availability, Booking Pages, Connections, Settings), Projects, Workflows, Automations, Runs, Scheduled, Approvals | `/admin/planning`, delivery calendar, `/admin/setup/automations`, workflow detail/run routes, `/admin/approvals` |
| Studio | Projects, Recent sessions, Starred, Templates, Library; immersive session | `/admin/studio?view=…`, `/admin/studio/library`, `/admin/studio/:sessionId`; reuse `StudioLayout`/`StudioHome`/`StudioShell`/`VibeStudio` |
| Insights | Executive, Sales, Revenue, Marketing, Client health, Operations, Forecasts, Recommendations, Data Health | `/admin/analytics`, same pipeline deal scope, subscription events; remaining unified views are owed and must label incomplete sources |
| Settings | Business, Business Vault, Brand, Integrations, Team, Workforce, Capabilities, Marketplace, Skills, Playbooks, Knowledge/memory, Trust, Notifications, Models/routing, API/MCP, Billing | existing `/admin/setup/*`, `/admin/team`, `/admin/sub-agents`, `/admin/marketplace`, `/admin/skills`, knowledge, approval/autonomy, notifications and connector routes |

## Navigation contract

1. Six primary destinations remain the only tenant-level destinations.
2. Destination-specific sub-navigation is horizontally scrollable or collapsible; it is not a second permanent sidebar.
3. Every operational object preserves a canonical deep link.
4. PAIGE may reveal that route in a contextual Workspace without replacing the shared thread.
5. Home summarizes; it does not duplicate inbox, pipeline, runs, Studio, or Insights.
6. Studio sessions are PAIGE and therefore never mount the persistent PAIGE rail a second time.
7. The old route may redirect only after the same connected component is mounted at its new home and the recovery-matrix acceptance test passes.

## Connected-surface navigation contract

The target URL shape for the design route is `/tenant-redesign?destination=<primary>&view=<sub-view>`. Destination and sub-view selections update browser history, restore through back/forward, and remain visible in the top breadcrumb while PAIGE and tenant context persist.

| State | Behavior |
|---|---|
| Connected component mounted | Render the adapted component in the main Canvas without legacy global chrome; no bridge button |
| Connected component not mounted | Render the designed Canvas state plus exactly one `Migration bridge / temporary` footer linking to `Open connected version` in the same tab |
| Record/detail opened | Use a docked panel or split Workspace when context should remain visible |
| Focus requested | Expand the Canvas; PAIGE folds to its branded edge state |
| Studio session | Enter the immersive Studio route; Studio is PAIGE, so the outer conversation rail does not duplicate |
| Optional pop-out | User-selected only for long-form artifact/preview/comparison/monitoring work; never ordinary destination navigation |

No iframe, nested legacy application shell, automatic browser pop-out, or duplicate bridge control is permitted. A bridge is deleted in the same change that mounts the connected component and passes its recovery-matrix acceptance test.

## Settings lifecycle boundaries

- **Business Vault** is the verified fact/evidence system of record. Its current unified data model and lifecycle are mostly owed; legacy Vault UI and distributed source tables are not connected parity.
- **Marketplace** is acquisition: discover, inspect manifest/permissions/cost, approve, purchase, install, and publisher review.
- **Capabilities** is operation after installation: configure, authorize, monitor, update, disable, and uninstall.
- **Studio** may originate a publisher package but does not own Marketplace review or distribution.


## Client portal boundary

Portal is a Clients sub-view on the business side and a six-item customer workspace (`Home`, `Conversation`, `Plan`, `Documents`, `Meetings`, `Account`) externally. Both presentations resolve the same relationship objects. Portal messaging must converge on canonical Conversations or a formal adapter; it cannot become a permanent second inbox.
