# Living Operational Field — repository grounding

**Pass date:** 2026-08-22  
**Route:** `/tenant-redesign`  
**Boundary:** visual and interaction refinement only; no backend or authorization change

## Canonical sources inspected

- `docs/PAIGE-MASTER-PROJECT-REFERENCE.md`: master doctrine, authenticated shell history, PAIGE orchestration, and one-home constraints.
- `docs/handoff/tenant-capability-recovery-matrix.md`: capability route/component/data seams and acceptance evidence.
- `docs/handoff/calendar-conversations-spatial-handoff.md`: Calendar under Work; planning objects remain Calendar/Agenda objects; canonical mount policy.
- `src/pages/admin/CalendarAdmin.tsx`: canonical connected Calendar, booking, realtime, planning overlay, host/filter, and status behavior.
- `src/pages/admin/PlanningAdmin.tsx`, `src/components/admin/planning/PlanningHub.tsx`: canonical planning/task objects and commands.
- `src/pages/admin/ClientsConversations.tsx` and `src/solo/conversations.tsx`: canonical conversation and broader interaction evidence.
- `src/prototype/TenantConnectedSurfaces.tsx`: representative Calendar/Conversations anatomy and lazy canonical mounts.
- `src/prototype/TenantRedesign.tsx`: tenant shell, PAIGE, Trust Compass, approvals, workspace/detach continuity, themes, and navigation modes.

## Truth map

| Area | Truth state | Treatment in this pass |
|---|---|---|
| Calendar and planning | Connected canonical `CalendarAdmin` plus planning hooks/RPCs/realtime | Canonical lazy mount preserved; visual anatomy remains representative |
| Conversations | Connected canonical `ClientsConversations` and send seams | Canonical lazy mount preserved; anatomy remains representative |
| Calendar operational objects | Meetings/bookings/tasks/blocked time exist; richer agent/approval/dependency vocabulary is not a unified live feed here | Every authored example is labeled representative; no production query added |
| PAIGE / Trust / approvals | Existing shell, orchestration, authority, and audit seams | Invocation and visible state preserved; no authority mutation added |
| Detached workspace | Same application route plus shared non-sensitive layout context | Existing session/context behavior preserved; browser channel does not authorize |
| Tenant security | Existing auth, RLS, Trust Compass, and approval behavior | Unchanged; connected components remain responsible for enforcement |

## Taxonomy ruling

Calendar remains the single time-and-commitment home under **Work**. Tasks, reminders, preparation, approvals, automated runs, milestones, and deliverables are temporal objects or Work execution views—not new destinations. Scheduling remains Calendar Availability, Booking Pages, Connections, and Settings. No parallel task, scheduling, Calendar, or Conversations implementation is introduced.
