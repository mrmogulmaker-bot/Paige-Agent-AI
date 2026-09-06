# Surface card — Setup (Solo Settings → Setup)

**Truth label: `PARTIAL` until release proof.** The tenant-scoped read is live. Production diagnosis
reproduced SQLSTATE `42804`: the audit-role expression mixed `tenant_role` and `text`, rolling
back every save. Migration `20261046000000_solo_setup_persistence_repair.sql` repairs that failure,
adds the canonical context readback and permission split, and passes always-rolled-back
production-schema Owner/Admin/ownership probes. It is not `LIVE` until the exact migration and
application head are deployed and an authenticated Owner save/reload/account-switch flow passes.

## Owner job and user flow

An authorized Solo owner records the business identity, legal-sender context, representation,
business model, customers, direction, constraints, and operating brief that Setup owns. The owner
enters **Edit Brief**, reviews fact provenance, changes supported fields, resolves any
connection-sourced fact explicitly, and saves. A successful result is shown only after the durable
write returns and the stored revision is read back. Reload, reopen, and account switch must resolve
the same tenant-scoped record without stale data.

The established information architecture remains:

1. Identity
2. Carrier identity / legal sender context
3. Representation
4. Business model and customers
5. Direction and goals
6. Paige brief / owner-confirmed operating context

Setup uses the Settings main-content visible-scroll policy. It does not create a new Settings
taxonomy or another PAIGE workspace. Paige Brief remains an anchored section on this page. Its
**Teach Paige** action opens a guided slide-out and both **Back to Setup** and close return to the
same Setup context; it is not a hidden page or sub-route.

## Tenant data and domain owner

| Record | Owner and boundary |
|---|---|
| Operating brief | Setup; tenant-scoped durable business-context record |
| Legal sender identity | Setup owns owner-confirmed facts; Connections owns provider configuration and submission |
| Business ownership | Setup; legal-person context only, separate from platform access |
| Human representative | Selected from existing active Team people; Team remains the roster authority |
| Workspace access and roles | Team only; never written by Setup |
| Full tax/registration identifiers | Protected Vault-style boundary; write-only from the browser and masked on read |

No account number, route parameter, tenant name, fixture, or browser state is authority. The server
derives the active tenant and applies the role gate in the write body.

## Solo shell placement

`/solo/{account}/settings/setup`, inside the shared canonical Solo Settings shell. The `account`
segment addresses the route only. It cannot select a separate product template or authorize a
different tenant.

## Lifecycle states

| State | Required treatment |
|---|---|
| First use | Existing sections render honest empty values and provenance; Edit Brief is available only to an authorized role |
| Populated / partial | Stored fields render with field-level provenance and a stored revision |
| Edit | A clearly named Edit Brief mode; legal and ownership controls appear only for workspace Owner |
| Guided Paige Brief | Slide-out edits are temporary until applied to the main Setup draft, then remain unsaved until the ordinary durable Save changes action succeeds |
| Validation | Field-level errors plus a focused summary; no write occurs |
| Pending | Save controls are disabled and labelled `Saving…`; no success copy appears |
| Saved | Render only after durable write and stored read-back; include the stored time/revision |
| Failed | Preserve the draft, state that nothing was saved, and provide Retry |
| Conflict | Preserve the draft; offer reload of the newer stored revision or explicit review of the owner's draft |
| Cancel / discard | Clean drafts exit immediately; dirty drafts require explicit discard or return to editing |
| Stale response | Ignore a result from an earlier request, unmounted page, or previous account |
| Account switch | Clear prior tenant data immediately; a dirty draft requires stay or explicit discard-and-switch |
| Read-only | Explain the verified permission; do not expose a save control that the server would refuse |
| Connection conflict | Never overwrite silently; the owner explicitly adopts the connected fact or overrides it with owner-confirmed context |

## Business ownership and representation

Setup may store a business owner whose legal-person type is individual, company/corporation, trust,
or other legal person, together with legal/display name, optional ownership interest, optional
effective date, ownership status, and an optional designated human representative. A percentage is
reported only as the value the owner supplied. Setup never claims the interests total 100% unless
the stored set proves it, and it provides no legal validation or advice.

A designated human representative must be selected from active Team people. The record does not
create a member, send an invitation, grant Admin, grant workspace Owner, change a role, or transfer
legal ownership in Team. Actual workspace authority changes route to the future **Team Ownership &
Authority Lifecycle** workstream.

## Permissions

| Actor | Setup authority |
|---|---|
| Current workspace Owner | Legal identity, formation facts, business ownership, representatives, and all operating context |
| Admin | Non-legal, non-ownership operating brief only, if the existing tenant policy verifies active Admin membership |
| Member | Read-only where current policy permits |
| Anonymous / unresolved tenant | Refused |

The UI derives presentation from the same server result that enforces the write. Client-side hiding
is not authorization.

## What PAIGE can read or do

Current truth: the shared Spine registry does not declare Setup. The guided Paige Brief editor is
a manual owner-input surface; voice conversation, transcript extraction, and example indexing are
PROPOSED and do not send content to PAIGE, Mind, Spine, or Rail. No new Setup field is claimed as a
PAIGE, Mind, Spine, or Rail input by this repair. A future handoff may permit only reviewed,
non-sensitive operating context such as public business name, website, regions/service area,
offers, delivery model, ideal customer/segments, priorities, goals, constraints, brand voice,
operating preferences, and do-not-assume guidance.

Legal-owner details, ownership percentages, tax/registration identifiers, exact addresses, and
private contact data are excluded from PAIGE context and Rail by default. PAIGE may not select a
representative, change access, increase autonomy, submit a provider registration, or treat a
proposal as confirmed truth.

## Confirmation, outcome, and follow-up

The human screen save is a direct domain action under Setup's role gate; it does not use PAIGE
approval. Connection-sourced facts require explicit adopt/override treatment before they become
owner-confirmed. PAIGE proposals, if present, remain drafts until an authorized person reviews and
saves them.

The current implementation writes attribution to `paige_audit_log`, not to the client Rail. No
owner-visible Rail outcome is claimed. A safe future Spine/Mind handoff is required before any
runtime consumption claim changes.

## Dependencies, collisions, and required proof

- **Depends on:** canonical Solo shell, Settings scroll owner, tenant resolver, Setup RPC family,
  `tenant_legal_profile`, Team active-person resolver, and protected secret storage.
- **Must not collide with:** Team role/invitation writers, Billing, Connections provider setup,
  central PAIGE Chat handler, shared Mind rules, Trust enforcement, or Rail infrastructure.
- **Repaired in release candidate:** SQLSTATE `42804` transaction abort and incomplete legal
  response payload.
- **Required automated proof:** first use, populated, partial, validation, success, failure/retry,
  cancel/discard, conflict, stale response, account switch, connection conflict, permission matrix,
  active-Team representative, ownership honesty, and protected-field exclusion.
- **Required rendered proof:** 1536×770, 1366×768, 1024×768, and 900×1000, Mineral and Obsidian,
  PAIGE open/folded, one Settings scroll owner, no clipping or horizontal overflow.
- **Required authenticated proof:** a real workspace Owner saves, reloads, reopens, and switches
  away/back; owner/admin/member/anonymous boundaries are exercised. Until then: **Authenticated
  Runtime Proof Owed**.

## Public Presence child — implementation candidate (2026-09-06)

**Home:** `/solo/{account}/settings/setup/public-presence`, second in the Setup child order. The route account segment is not authority. There is no top-level `/settings/presence` or `/admin` route.

**Owner question:** “Can the right people find, recognize, and trust this business online—and what should we do next?” Presence Center, Profiles & Listings, Website & Search, Reviews & Reputation, and Public Facts remain one compact workspace. Business Profile is the canonical edit home. Public Facts is a read-only, focus-contained inspector with Escape and focus restoration.

**Truth floor:** only confirmed canonical provenance may say owner confirmed. Website-on-file never proves discoverability. Every external venue, search, review, response, publish, authority, Rail, Mind/Memory, and PAIGE handoff state is unavailable until an authenticated source-backed contract proves it. Integrations retains connection setup. Unsupported work is shown as a visible explanatory state, not a fake or dead action.

**Scroll and responsive contract:** the existing Settings shell remains the only vertical scroll owner. The internal view switcher may scroll horizontally at narrow widths; panels and venue fold-outs do not create nested vertical scroll regions. Local compiled rendering passed 1536×770, 1366×768, 1024×768, 900×1000, and 390×844 without horizontal page overflow in Mineral and Obsidian. Narrow content uses the page scroll; reduced motion removes button and drawer movement.

**Proof status:** focused tests, changed-file lint, repository ratchets, build, binding-ledger validation, and deterministic responsive geometry are locally proven. Authenticated preview/production state, provider paths, CI, merge, deployment, and exact production SHA remain `PROOF OWED`. The mandatory Integration Capability Registry has no Public Presence entry on refreshed `origin/main`; do not create a competing registry. Notify the Registry Steward and require the canonical capability/scopes/authority/M1/outcome/Rail-Mind-Memory/proof/limitations entry before one complete governed provider lane is designed or enabled.

**Legacy exclusion:** the separately mounted Business Infrastructure Assessment `PublicPresenceSection` and `paige-write-back` `public_presence.*` paths write `business_public_presence`. Their owner-entered URLs, self-check booleans, completion percentage, and local save result are not provider evidence or canonical Public Presence facts and cannot feed this surface, PAIGE, Rail, Mind, or Memory. Retirement/reconciliation belongs to the Business Infrastructure Assessment and `paige-write-back` owners.
