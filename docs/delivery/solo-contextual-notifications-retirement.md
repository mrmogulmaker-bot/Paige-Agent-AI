# Solo contextual notifications — retirement release

## Approved outcome and scope

Notifications are not a standalone department. Remove the Solo Settings menu and placeholder page; retain source-owned capabilities. No new inbox, preferences, recipients, notification table, sender, or external delivery. Branch: `codex/solo-notifications-retirement`, based on released backend repair `fafcdcba` (#896).

The earlier #883 release removed the Solo platform bell and protected the retained operator bell/legacy admin route. #896 is merged and production-verified through catalog and deployed-source metadata: restrictive operator policy, no anonymous grants, authenticated SELECT plus column-only read-state UPDATE, no realtime publication, and active MCP version 553 containing both operator-only tools and the pre-dispatch gate. Production migration and edge workflows succeeded. No production notification records were read or mutated as proof.

## Flow and source ownership

| Entry / source | Result |
| --- | --- |
| Old Solo Settings Notifications URL | Same account Setup at its existing canonical Business profile subpage, history replace, no inherited query/hash, no retired child mount or extra index redirect |
| Setup after redirect | One plain status acknowledgement; consume history marker to prevent replay on reload or Back/Forward |
| Normal Setup / workspace switch | No carried acknowledgement; no notification read |
| Billing | Existing contact/delegate designation controls remain; badge says “Designated for billing notices.” Existing no-sender and no-ownership disclosures remain |
| Team | Invitation, resend/revoke, access and role outcomes remain Team-owned and unchanged |
| Connections / Integrations | Existing connection health, provider consent/readiness and repair states unchanged; Calendar notification rules remain in Calendars |
| Sales | Existing source-proven commercial states unchanged; no invented notices |
| Security & data / Client Portal | Existing surfaces retained; no security event history or client preference capability invented |
| Platform Operator | Existing operator alerts/delivery controls stay separate; never reused by Solo |
| Spine / Rail / Mind | No new aggregate or delivery events; no notification records forwarded |

## Collision and change boundary

Five product files: Solo Settings, destination contract, SoloApp icon map, Solo route registry, and one Billing badge. Add a tiny compatibility boundary and regression tests. No domain model or mutation change. Checked all 28 open PRs against current main `25f0b8aa` before implementation. #674 Connections changes do not overlap. #724 has an exact metadata overlap on the obsolete Notifications destination: remove that row, preserve metadata for surviving destinations on its future rebase. No competing active retirement or Billing-badge change found.

## State / proof map

- Automated route tests: direct and trailing-slash bookmarks, stale query/hash, no retired source mount, Back/Forward, workspace switch, ordinary Setup arrival, remaining source routes and nested Calendar notification route.
- Actual Settings mount test verifies Setup heading and acknowledgement, without retired placeholder content.
- Existing Billing rendered tests cover designation, no sender, refusal, retry, cancellation, null and workspace-switch behavior. This release changes copy only.
- Existing Settings provider, integration, Team, scroll and routing tests remain regression coverage; no new source adapter is created.
- Acknowledgement uses existing note typography and `role=status`; adds no animation or focus-stealing control. Existing Settings focus/scroll owner remains unchanged.
- Signed-in owner walkthrough, native rendered reload/focus, four supported widths (1536×770, 1366×768, 1024×768, 900×1000), themes and reduced-motion proof remain **Proof Owed** until actually driven. Automated DOM tests do not establish rendered geometry or authenticated tenant isolation.

## Owner confirmation

Open an old Notifications bookmark while signed in: it should land in Setup with the short acknowledgement and no Notifications menu or Solo platform bell. Navigate to Billing: existing designations remain, the badge says designated, and the page still explicitly says nothing is being sent. Back should not trap you on the retired URL.

## Separate follow-up, not implemented here

After both releases, prepare the requested tenant-scoped source-driven transactional-notification planning packet. Do not use the operator notification table or operator tools. Previously recorded sender authorization findings remain a separate source-owner security follow-up; these two releases do not claim to repair every producer.
