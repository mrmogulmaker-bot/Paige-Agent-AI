# PAIGE tenant redesign — requirement gap audit

**Audit date:** 2026-08-21  
**Compared against:** “PAIGE Tenant Platform — Capability Recovery and Design Integration Handoff”  
**Evidence base:** current checkout at `8d098ae`, `src/App.tsx`, `src/prototype/*`, mounted routes in `src/pages/Admin.tsx`, `src/pages/admin/*`, `src/components/admin/studio/*`, the recovery matrix, route map, and engineering handoff.

## Executive conclusion

The work currently delivers a **high-fidelity front-end design prototype plus a credible Phase 1 recovery map**. It does **not** yet deliver the complete connected tenant-platform architecture requested by the handoff. The six-destination shell, PAIGE spatial model, symbols, laptop fit, capability map, and deep-link strategy are established. Most operational destinations still link to existing routes instead of mounting the existing connected components inside the new shell. Phase 3 through Phase 5 are therefore substantially owed.

The redundant floating-chat finding was valid. The previous policy missed bare `/agency`, `/business`, and `/solo` roots, `/app`, and trailing-slash variants of the prototype. It also depended on two ad hoc path lists. That logic is now replaced by one boundary-safe, regression-tested policy covering every PAIGE-owned shell.

## Status key

- **Delivered** — implemented and testable in the current prototype or checked-in contract.
- **Partial** — demonstrated or mapped, but missing required depth or production reuse.
- **Owed** — not implemented beyond documentation or a representative placeholder.
- **Production-only** — intentionally cannot be truthful on the public prototype without authenticated data/action seams.

## Requirement-by-requirement comparison

| Handoff requirement | Current evidence | Status | Remaining gap / acceptance action |
|---|---|---:|---|
| Preserve six primary destinations | Home, Clients, Work, Studio, Insights, Settings are the only primary prototype nav entries | Delivered | Keep invariant during production extraction |
| Progressive-disclosure shell | Secondary tabs, command drawer, Trust/activity/transcript drawers, Workspace fold/dock/pop-out/focus | Delivered | Saved workspace layouts and richer breadcrumbs remain owed |
| One home per capability | Route map and recovery matrix identify canonical homes and preserve redirects | Delivered as contract | Existing components must be mounted before any legacy route retires |
| PAIGE is primary orchestrator | One shared thread; named agents appear as contributions/direct address | Delivered in prototype | Production orchestrator/session wiring owed |
| Conversation continues during execution | Work strip and agent activity coexist with transcript/composer | Delivered in prototype | Durable background jobs and real progress events owed |
| Trust state on every consequence | Approval example and compact Trust summary exist | Partial | Autonomous, Draft only, Blocked, Failed, and Completed consequences need consistent component coverage |
| Tenant isolation and authorization | Account taxonomy and reset rules documented; prototype performs no data request | Delivered as contract | Server membership, RLS, effective actor, audit, and cache invalidation require production verification |
| Preserve deep links | Capability tabs link to canonical `/admin/*` routes; no operational route removed | Delivered | Redirect tests must run only after connected nested mounts exist |
| Home briefing | Priorities, approval, active work, recommendation, source-health warning, pulse | Partial | Calendar preview, pipeline alerts, client risks, verified integration health, and connected briefing data owed |
| Clients sub-view inventory | All nine required labels are present | Delivered as IA | Most tabs are route-linked representative compositions, not reused live components |
| Real Pipeline reuse | Canonical `PipelineAdmin` is mapped and linked; representative board shown | Partial | Must mount/reuse pipeline selector, config, DnD, statuses, contact association, owner filter, search, history, drawer, new deal, KPIs, won-month, program creation |
| PAIGE-assisted Pipeline | Shared-thread commands and Workspace behavior demonstrated | Partial | Commands do not yet manipulate real filters/deals or open the real drawer/history |
| Work sub-view inventory | All nine required labels are present | Delivered as IA | Projects and unified Scheduled work remain owed per repository audit |
| Durable runs | Representative rows show status, owner, source, elapsed time and approval | Partial | Real result, evidence expansion, retry/recovery, run detail and failure transitions must reuse workflow/action seams |
| Vibe Studio is the existing Studio | Handoff explicitly names reuse; prototype depicts immersive room | Partial | Prototype does not mount `StudioLayout`, `StudioHome`, `StudioShell`, `VibeStudio`, library, sessions, live preview, versions, publish/preflight or learning |
| No second PAIGE inside Studio | Reuse contract states session itself is PAIGE | Delivered as contract | Verify when Studio is actually mounted inside the new shell |
| Insights sub-view inventory | Eight required views exist | Delivered as IA | Marketing, client health, operations aggregation, and recommendation layer remain incomplete/owed |
| Insights source honesty | Connected/incomplete/unverified states are visibly distinguished | Delivered in prototype | Real connected query reuse and reconciliation tests owed |
| Pipeline KPI parity | Contract requires same deal/stage scope | Delivered as contract | No connected shared selector/store exists in redesign yet |
| Settings group inventory | All requested groups are present | Delivered as IA | Most entries link to current route; nested reuse and consistent Trust states owed |
| Tenant context visible | Business scope appears in top context and PAIGE rail | Delivered in prototype | Real name intentionally withheld on public prototype |
| Fast searchable tenant switcher | Representative account-type state lab exists; agency list is disabled honestly | Owed / production-only | Build authenticated searchable overlay using only authorized scopes; recent/favorite/access/health/unread/environment metadata absent |
| Preserve destination on tenant switch | Reset/state contract documented | Partial | No authenticated switch exists; safe-route compatibility algorithm and tests owed |
| Separate operator and tenant context | PAIGE Operator, Fleet scope, Viewing-as and exit patterns exist | Delivered in prototype | Real act-as and two-key flow remain production-only |
| Never blend tenant cached state | Prototype clears local contextual state on account-mode changes | Partial | Query cache, persisted drafts, agent memory, Trust cache and Studio session invalidation require production tests |
| Remove floating yellow chatbot | Central policy now suppresses it on prototype, `/admin`, `/agency`, `/business`, `/solo`, `/operator`, and `/app`, including roots/nested/trailing slash | Delivered | Browser visual verification still required in a browser-capable CI/preview environment |
| Only approved PAIGE entry points | Prototype uses Command Spine and centered mobile PAIGE action | Delivered | Existing authenticated shells must continue owning their rail/edge/mobile entry |
| PAIGE tucked/narrow/split/expanded/pop-out/mobile | Folded, expanded, wide/full and Workspace spatial modes exist | Delivered in prototype | Detachable companion is in-app floating, not an actual browser companion window |
| Text, voice, transcript, attachments | Controls and representative voice/transcript states exist | Partial | Mic consent/capture, transcription, attachment handling, errors and resumption are mocked |
| Result cards/evidence/activity | Work strip, agent drawer and Workspace artifact exist | Partial | Expandable evidence and real provenance records are owed |
| Failure and recovery | Reconnecting/interrupt state language exists | Partial | A clear failed work item, error details, retry, partial-success recovery, and restored result are not fully demonstrated |
| Command palette | `Cmd/Ctrl+K` drawer and destination commands exist | Delivered in prototype | Search results/deep actions are representative only |
| Slide-over/detail/pop-out/focus | Implemented spatial modes and keyboard dismissal | Delivered in prototype | Saved layouts are owed; production focus stack still needed |
| Typography hierarchy | Display, interface, label, metadata, data styles and tabular numerals exist | Delivered in prototype | Uppercase microcopy remains heavier than the new brief recommends; editorial pass owed |
| Governed icon family | Lucide supplies most interface icons; proprietary PAIGE symbols cover three territories | Partial | No checked-in optical/stroke governance spec or normalized custom interface family migration |
| Brand-symbol roles | Command, Sovereign, provisional Artifact API and state semantics exist | Delivered | Artifact legal/similarity screening remains open |
| Complete dark theme | Obsidian/champagne prototype is complete | Delivered | Verify every nested operational component after integration |
| Complete light theme | Symbol lab and customer portal show isolated light surfaces | Owed | No full light tenant shell, toggle, parity pass, or per-user theme persistence in prototype |
| Laptop fit | `100dvh`, independent scroll, height/width queries, compact navigation and composer rules | Delivered in CSS/prototype | Actual screenshot matrix remains unverified in this environment |
| Recovery matrix | Checked-in 12-column matrix with repository seams/classification | Delivered | Must be kept current as Phase 3 integration lands |
| Final IA/route map | Checked in | Delivered | Add connected nested route implementation later |
| High-fidelity all six destinations | Home/Clients are deeper; Work/Studio/Insights/Settings are representative stages | Partial | All destination states and their real component depth remain to be designed/mounted |
| Pipeline board + drawer + flow | Board and PAIGE flow exist; drawer is not the real deal drawer | Partial | Reuse actual drawer/new-deal/history/DnD surfaces |
| Studio home + immersive session | Composition and reuse contract exist | Partial | Actual Studio family not mounted in redesign |
| Tenant switcher states | Account taxonomy lab exists | Partial | Authenticated data, search, metadata, favorites/recent, safe switch behavior owed |
| PAIGE error/recovery coverage | Voice reconnect language and general state taxonomy exist | Partial | Explicit error→retry→recovered connected flow owed |
| Complete theme delivery | Dark only at shell level | Owed | Full light parity and persistence |
| Typography/icon specification | Tokens/symbol semantics documented | Partial | A formal governed icon table and reduced-uppercase audit are owed |
| Implementation reuse plan | Handoff reuse table and matrix exist | Delivered | Execute Phase 3 in required order |
| Evidence-backed verification report | Build/lint/type/test checks documented across work; this gap report exists | Partial | Browser viewport, keyboard, focus, theme parity, real tenant switching, RLS and every matrix acceptance test remain outstanding |

## Floating chatbot correction

The yellow `FloatingChatbot` is now governed by `shouldRenderFloatingChatbot(pathname)` rather than scattered exact/prefix lists. It is suppressed for:

- `/tenant-redesign` and every nested/trailing-slash form;
- `/admin`, `/agency`, `/business`, `/solo`, `/operator`, and `/app` roots and descendants.

Boundary-aware matching prevents accidental suppression of unrelated public paths such as `/administrator-help` or `/business-card-guide`. Public/customer properties such as marketing, booking, and tenant portal paths remain eligible because the brief explicitly reserves a technically separate support widget for those contexts.

## Actual completion by phase

| Phase | Assessment | What is actually complete |
|---|---|---|
| Phase 1 — audit/mapping | Substantially complete | route inventory, capability matrix, classifications, route map, security notes |
| Phase 2 — design foundation | Partial | dark shell, symbols, typography, spatial PAIGE/Workspace, responsive behavior; full light theme, real switcher, icon governance owed |
| Phase 3 — capability integration | Early / mostly owed | canonical deep links and compositions exist, but connected components are not mounted in the redesign |
| Phase 4 — orchestration | Prototype only | shared-thread behavior is demonstrated; no real structured commands, durable jobs, approvals or recovery |
| Phase 5 — migration/verification | Not started | no operational routes retired; connected redirects, isolation, theme parity, viewport/browser and matrix-row verification owed |

## Recommended next implementation order

1. **Close shell invariants:** browser-prove floating-chat suppression, implement full light theme/persistence, and complete explicit error/retry/partial-success states.
2. **Build authenticated tenant switcher:** current tenant, authorized agency subset, audited operator registry; no CRM clients in this control.
3. **Mount Clients first:** reuse Contacts/Account surfaces, Conversations, then full `PipelineAdmin` family inside the new shell.
4. **Mount Work:** Planning, Calendar, workflow definitions/runs, approvals; normalize durable run evidence and recovery.
5. **Mount Studio as an immersive route:** reuse the existing Studio family and suppress the persistent PAIGE rail inside the session.
6. **Connect Insights and Settings:** reuse real data/components, retain source-state honesty, and reconcile Pipeline KPIs.
7. **Run Phase 5:** tenant isolation, RLS, act-as audit, deep links, themes, viewport matrix, keyboard/focus, reduced motion, and every recovery-matrix acceptance test before retiring anything.

## Connected-surface navigation addendum (2026-08-21)

| New decision | Implementation status | Evidence / remaining work |
|---|---|---|
| Remove duplicate legacy bridge buttons | Delivered | All generic `Open current surface`, `Open connected surface`, and duplicate Clients links were removed; `ConnectedFallback` is the only bridge primitive |
| Sub-view opens inside shell Canvas | Delivered for design state | The selected view remains inside the six-destination shell with PAIGE visible; connected production components are still owed |
| Durable URL, refresh, back/forward | Delivered for prototype selection | `destination` and normalized `view` query parameters drive the active destination/view and breadcrumb |
| Preserve tenant, breadcrumb, PAIGE | Delivered in prototype | Selection does not replace the shell or shared thread; authenticated tenant behavior remains production-only |
| Reuse component without legacy chrome | Owed | Current fallback remains until each existing component is adapted/mounted |
| No iframe / nested shell | Delivered | Prototype contains neither |
| Canvas / Split / Focus / Docked panel | Partial | Canvas selection, PAIGE split, Workspace focus and docked modes exist; connected components must opt into the smallest appropriate set |
| Pop-out is optional, not navigation default | Delivered in prototype contract | Only Workspace artifacts/records can be user-popped; destination tabs never create windows |
| Studio never duplicates PAIGE | Delivered as contract | Must be verified when real `StudioLayout`/`VibeStudio` mounts |
| Same-tab fallback with return path | Partial | Fallback is same-tab and singular; legacy destinations still need a consistent return-to-redesign affordance during migration |

## Vibe Studio audit addendum (2026-08-21)

The supplied production evidence upgrades Studio from “design concept” to **connected substrate**, but does not close the integration gap:

- 17 sessions and 4 artifact versions were reported; Library, deliverable, and critique tables were reported at zero rows.
- The real Studio family and numerous generation/publishing/learning seams exist in code.
- Production policy composition reportedly differs from the repository's narrow intended session/version policies and must be reconciled before broad mounting.
- Studio remains **Live but incomplete** in the redesign until authenticated security and all 12 lifecycle gates pass.

Block A integrity now precedes the previously recommended Studio mount. `scripts/audit-studio-rls.sql` is the read-only proof; `vibe-studio-integrity-audit.md` defines actors and expected visibility; the matrix annex defines 20 capability/security/deep-link/acceptance rows. No empty table is treated as proof of a working user lifecycle.
