# Two-way smart client portal — repository reconciliation

**Evidence date:** 2026-08-21  
**Scope:** repository implementation and supplied read-only production audit. Production counts are dated evidence, not prototype fixtures, and were not independently queried in this environment.

## Executive decision

The portal is the external half of **Clients**, not another CRM, inbox, or chatbot. Repository code establishes a branded gateway, customer shell, PAIGE chat, action items, portal configuration, invitations, programs, documents, approvals, bookings, and multichannel seams. It does not establish a complete production workflow.

The target is one shared relationship record with two authorized presentations:

```text
Business: Clients / client account ↔ Client: branded portal
relationship, thread, engagement, request, approval, booking, file and activity IDs remain shared
```

## Evidence and honest state

Repository surfaces include `PortalGateway`, `AppShell`, `AppNav`, `PaigeChat`, `ActionItems`, `PortalStudio`, portal-brand/config/contact/action hooks, customer portal and invite Edge Functions, and the public PAIGE chat function.

| Evidence | Supplied rows | Classification |
|---|---:|---|
| `clients` | 4 | Connected CRM records; portal access proof separate |
| `threads` / `messages` | 4 / 8 | General messaging in use; portal convergence unresolved |
| `paige_chat_threads` / `paige_chat_turns` | 34 / 544 | Chat substrate in use; portal tenant workflow proof owed |
| `notifications` / `internal_bookings` | 3 / 3 | Adjacent substrate with activity |
| `client_files`, `client_notes` | 0 / 0 | Schema/seams; production use unproven |
| programs, enrollments, messages, document requests, approvals and phase states | 0 each | Schema/policies; production workflow unproven |
| customer actions/responses and PAIGE bookings | 0 each | Server-mediated substrate; E2E proof owed |

## Portal taxonomy

The default portal remains intentionally smaller than the business system: **Home, Conversation, Plan, Documents, Meetings, Account**. Payments, funding, courses, proposals, and other vertical modules appear only when enabled for that tenant.

PAIGE is the disclosed, tenant-authored relationship concierge. When closed, one restrained branded launcher is appropriate on portal pages. When open, no second launcher appears. Clients never see internal command controls, agent deliberation, private notes, Trust configuration, or platform/agency scope controls.

## Shared-work contract

- A portal message resolves to the canonical Conversations thread or a formal adapter; it is never copied into a permanent second inbox.
- Structured upload, approve, schedule, review, sign, pay, and complete actions appear in conversation and open their full workspace without losing thread state.
- Every composer and message names its audience: `Shared with client`, `Internal team`, or restricted PAIGE evidence. Color is never the only distinction.
- Internal state records autonomous, drafted, human-approved, human-authored, blocked, failed, or escalated. Clients receive only the appropriate simplified disclosure.
- A client account supports dedicated organization memberships and roles. It must not grow repeated `linked_user_id` columns.

## Integrity gates

1. Audit broad `clients` permissive-policy composition, including the `tenant_id is null` path, using authenticated client/staff/agency/operator tests.
2. Review program policies that target `public`, their helper grants/search paths, and unauthenticated behavior; prefer explicit authenticated targeting plus account authorization.
3. Select the canonical conversation model before mounting portal messaging in Clients.
4. Verify server-mediated customer action creation/response before claiming actions are live.
5. Define portal account membership, represented organization, roles, engagement/document restrictions, and immutable actor logging before enterprise expansion.
6. Prove tenant/account switch invalidation for query caches, drafts, threads, signed file URLs, notifications, and portal branding.

## Theme contract

The tenant prototype and portal preview now provide complete light and dark token sets, default to the user’s system preference, expose a labeled keyboard-focusable toggle, and remember the choice locally for the prototype session/browser. Production should store the same preference per user only after an authenticated preference seam is selected. Tenant branding may adjust approved brand accents, but cannot reduce text, focus, audience, Trust, or AI-disclosure contrast.

## Integration order

1. Identity, membership, invitations, RLS and visibility classes.
2. Canonical conversation, channel continuity, PAIGE routing/disclosure and human takeover.
3. Actions, requests, uploads, approvals, bookings, progress and CRM portal preview.
4. Portal-specific knowledge, autonomy, escalation, summaries and reminders.
5. Organization roles, agency portfolio isolation, then later SSO/SCIM/domain controls.

The portal is not complete until clients can securely enter, converse, escalate, upload, approve, track, book and resume while the business sees the same record, controls autonomy, distinguishes audiences, and proves isolation and audit history.
