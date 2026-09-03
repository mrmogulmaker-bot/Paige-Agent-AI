# Solo Setup business-context handoff

**Status: PROPOSED.** Setup stores these facts, but this document does not make them available to
PAIGE, Mind, Spine, or Rail. A future Spine owner must review and register a tenant-scoped projection
before any runtime consumption claim changes.

## Eligible non-sensitive fields

- Public business name
- Public website
- Broad regions of operation and service area
- Offers and services
- Delivery model
- Ideal customer and customer segments
- Current priority
- 90-day goals, annual direction, and owner-defined success
- Business constraints
- Brand voice and operating preferences
- Owner-authored do-not-assume guidance

Each projected field must retain its Setup provenance
(`owner_confirmed`, `connection_sourced`, or `needs_confirmation`) and the server-resolved tenant.
Unknown scope fails closed. A connection-sourced value does not become owner-confirmed without an
explicit Setup adopt/override decision.

## Excluded by default

- Legal business-owner names, ownership types, interests/percentages, status, or effective dates
- Designated representative identities
- Tax or government registration numbers, masked fragments, or Vault references
- Exact street/operating addresses
- Private phone numbers or email addresses
- Team membership, invitations, roles, access, or workspace authority
- Provider payloads, credentials, tokens, schemas, and endpoint errors

Setup emits no owner-visible Rail outcome in this release. Existing `paige_audit_log` rows are
internal attribution records and are not a substitute for the Rail contract. PAIGE may not use this
handoff to expand her authority, alter Setup truth, submit a carrier record, or change Team access.
The release does not modify PAIGE's shared persona resolver. It sanitizes the existing shared brand
record so protected legal/contact fields and Team identifiers remain in Setup-owned private
relations. The existing resolver may carry the remaining public/operational subset, but actual
PAIGE/Mind consumption is PARTIAL and requires separate authenticated runtime proof. Any new Spine
projection remains PROPOSED until the shared owner accepts and verifies this handoff.

## Required future proof

The Spine owner must provide the stable registry entry, tenant-safe resolver, safe projection tests,
approval/risk treatment for any proposed action, client-visible truth labels, and authenticated
owner proof before changing this handoff from PROPOSED.
