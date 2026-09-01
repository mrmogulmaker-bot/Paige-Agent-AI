# Solo People contact upsert — ownership, flow, and release contract

**Status (2026-09-01):** PR #716 shipped the tenant-safe contact mutation and its owner/PAIGE callers. A retrospective policy audit found one unresolved Clients interaction violation: `PeopleContactEditor.tsx` used a vertically scrolling modal. The owner approved the canonical three-step in-page editor prototype for production implementation. The corrective implementation is a draft pending exact-head Gate 2; no corrective merge or deployment is authorized.

## Classification and canonical ownership

This capability is **tenant-owned domain behavior** inside Clients / People, with a governed PAIGE handoff. It is not a shared-shell variant.

- Canonical Solo shell: `SoloApp.tsx` -> `TenantCommandCenterShell.tsx`. Account numbers, names, fixture values, and URL segments never select another shell, layout, navigation system, page host, or PAIGE workspace.
- People page owner: `TenantRelationshipsClientsWorkspace.tsx`.
- Contact editor owner: `PeopleContactEditor.tsx`.
- Human mutation adapter: `contactUpsert.ts`.
- Server-owned mutation contract: `upsert_contact`, introduced by `20260901035325_solo_people_contact_upsert_hotfix.sql`.
- Governed PAIGE seam: `paige-ai-chat/index.ts` plus the exact-subject / exact-patch confirmation helpers in `_shared/toolConfirmation.ts`.

Tenant identity, roles, assignable members, capability truth, and contact records must come from server-resolved tenant context and authorization. None may fork shell geometry.

## Complete affected flow

1. An authorized Solo member enters Clients -> People and opens an existing tenant contact or starts a new one.
2. The editor exposes owner-editable identity, business context, relationship context, assignment, lifecycle, source, tags, notes, and do-not-contact fields.
3. Validation fails without mutation and preserves the draft.
4. Save calls the tenant-pinned server contract. Permission denial, tenant mismatch, stale or invalid assignment, offline state, and server error fail closed and preserve an understandable recovery path.
5. Success reloads/selects the exact durable record and returns to People.
6. Cancel, close, Escape, interruption, and abandonment return to the originating People context without a mutation.
7. In PAIGE Chat, a contact update must resolve an exact tenant-owned contact, display the proposed subject and field patch, require the governed confirmation contract, execute through the same server-owned mutation boundary, and return an attributable result.

## Clients form-fit guardrail

Clients is form-fitting and design-locked. The People editor must not introduce a visible page, pane, modal, drawer, or nested vertical scroll owner unless the product owner explicitly approves that exception.

The shipped long scrolling modal is not the durable interaction precedent. The approved durable interaction is a three-step editor hosted inside the canonical Clients / People page: Identity, Business context, and Relationship & consent. It preserves one local draft, presents validation and retry in place, returns to the exact originating action on cancel, selects the exact durable record after save, and does not create a page, pane, modal, drawer, or nested vertical scroll owner.

For every Clients / People UI repair, exercise both the affected Solo tenant context and one known-good different Solo tenant context at:

- 1536x770
- 1366x768
- 1024x768
- 900x1000

At each viewport, test PAIGE closed and open. Record actual rendered width, horizontal and vertical overflow, control reachability, keyboard order, focus entry/restoration, Escape/cancel behavior, wheel behavior, and the actual scroll owner. A structural or mock harness is not authenticated runtime proof.

## Truth and security boundaries

- Never fabricate tenant identity, permission, assignable-member, provider, activity, analytics, provenance, or contact data.
- Tenant, linked-account, financial, consent, activity, and system-provenance fields remain governed by their owning workflows.
- A create request never silently overwrites an email match. An update identifies the exact contact.
- The server contract must remain tenant-pinned, permission-gated, assignment-safe, audited, and fail closed.
- PAIGE must not bypass the human mutation contract or execute an unconfirmed patch.

## Evidence ladder

Report evidence separately:

- **Automated:** unit, component, contract, SQL smoke, and regression results.
- **Static:** exact diff, tenant-branch search, route/owner inspection, and migration/function review.
- **Rendered:** measured browser geometry and interactions at every required viewport/context/PAIGE state.
- **Authenticated runtime:** real signed-in read/edit/save/reload plus PAIGE propose/confirm/update and permission/error paths.
- **UNVERIFIED:** every required proof not actually exercised.

A rendered mock is not a delivered capability. Production acceptance requires authenticated evidence on the exact head and deployed artifact being claimed.

## Collision and release discipline

Before editing, inspect open work for collisions in the People owner, canonical shell, PAIGE chat, confirmation helpers, migration ordering, and brain/doctrine files. As of this audit, open PRs #675 and #718 own overlapping PAIGE surfaces; a People UI correction must not absorb or overwrite them.

Prepare a green draft first. Immediately before any ready-for-review transition, merge, or deployment, re-ground the exact head and request a separate Gate 2 approval naming that head. Earlier approval for PR #716 does not authorize a later corrective release.
