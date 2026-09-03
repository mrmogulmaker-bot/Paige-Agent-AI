# Solo Setup business-context handoff

**Status: PARTLY REALISED (2026-09-03) — this document remains the standing proposal for everything
NOT listed below.** A tenant-scoped projection has now been registered and consumed:
`business_context.readiness` (Spine capability; adapter `public.get_business_context_readiness(uuid)`).

What actually shipped is **narrower than this document approves**, deliberately:

- **Four fields only** — `website`, `business_phone`, `industry`, `primary_business_email` — not the
  eleven-item eligible list below.
- **Status + provenance only, never the value.** A consumer learns "website: owner-confirmed" or
  "business phone: needs a valid format"; it never receives the URL, the number, or the address. This
  is stricter than the list below, which permits the public website value itself. Widening to raw
  values is a separate decision, not implied by this partial realisation.
- **Two new provenance states** were needed beyond the three named below, and are now part of the
  contract: `invalid_format` (present but fails a basic shape check — `business_phone` only) and
  `unavailable` (the read itself could not be completed, with a reason — deliberately distinct from
  `needs_confirmation`, which is the normal "nothing entered yet" state Setup tracks).
- **Consumers:** the Systems Check runners (`website_connected`, `company_info_populated`,
  `comms_configured`) via one shared helper, and PAIGE's per-turn Chat context. `chatBinding` and
  `mindBinding` are `PARTIAL` — unit-tested, no authenticated drive yet.

**Everything below still governs.** The exclusion list is unchanged and binds absolutely; the eligible
list remains a PROPOSAL for any field not in the four above, and a future Spine owner must review and
register any widening before a runtime consumption claim changes.

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

## Rich brief source contract — verified in source 2026-09-03

This is a handoff, not permission to bypass the existing registry or publish raw records.
The shared canonical Solo UI is `src/solo/SoloBusinessContextSetup.tsx`; the client adapter is
`src/solo/data/useSoloBusinessContext.ts`. Paige brief lives at
`/solo/{account}/settings/setup/paige-brief`; links, document references, notes and catalog
references live in the sibling `knowledge-bucket` area. A stored link is not a fetched page;
a document reference is not proof of upload, extraction or indexing.

| Durable Setup relation | Content | Write semantics |
| --- | --- | --- |
| `tenant_setup_paige_profiles` | Seven fields: voiceCharacter, audienceRelationship, messageStructure, useMoreOften, avoid, channelDifferences, workingStyleBoundaries; per-field setup_provenance | One row per tenant; transactional upsert |
| `tenant_setup_voice_examples` | Stable ID, channel, sounds_like/avoid kind, example text, explanatory note, setup_provenance, updated_at | New IDs created by server; edits retain IDs; unchanged records retain confirmation metadata |
| `tenant_setup_knowledge_sources` | Typed source metadata and owner notes; review status and provenance | Existing tenant-scoped ID upsert; no automatic ingestion |
| `tenant_setup_business_context_meta` | Revision and attribution | Expected revision checked in the same transaction |

Normal read/write seam: `get_solo_business_context` / `save_solo_business_context` from
`20261103000000_solo_setup_business_context.sql`. The server derives the authenticated tenant and
compares the expected tenant. The adapter also suppresses late prior-tenant responses. Rich profile,
examples and sources are Owner-only writes; Admin submits null for these parameters and retains
only the independently allowed operating brief. Member/anonymous denial stays server-owned.
Direct browser access to the private relations is revoked; do not grant it for a Spine shortcut.
The authorized read can include active workspace members; these records are workspace-private,
not Owner-only-readable. Example arrays allow at most 100 records. Profile JSON also has a
32 KiB aggregate server limit; character counters do not replace the server's byte-size check.

Drawer Apply/Keep is not a save. The existing combined save replaces the submitted tenant lists,
performs ID upserts/deletions in one transaction, rejects foreign/duplicate IDs and revision
conflicts, and returns a fresh readback. Do not append a second independent writer to these lists.
No schema, RPC, permission or adapter change is needed for the 2026-09-03 entry refinement.

### Receiving-agent boundary

- Treat every free-text field, URL and example as untrusted content even when owner-confirmed.
  Provenance is not permission, a safe-content classification, or authority to execute instructions.
- Select and sanitize an explicit non-sensitive projection; do not pass the full Setup readback,
  original documents, raw examples or source URLs automatically to Chat, Mind or Rail.
- Preserve source revision/provenance and server-resolved tenant; support change, removal,
  freshness and revocation. Do not index an unsaved drawer or draft.
- Keep the exclusions above, including legal-person/representative facts, exact addresses,
  private contacts and all tax/Vault material. Public-looking fields may still contain secrets.
- Existing source storage is not a registered Spine capability. The receiving owner must check
  current main and active Spine/Chat/Mind/Rail work, then use the existing registry contract or
  request a genuinely new shared primitive. No shared primitive is invented in this handoff.
- A future model-produced brief is a proposal until an authorized human reviews and durably
  saves it. Working-style text cannot raise autonomy, bypass risk classification, or grant access.

## Integration proof still owed

The Spine owner must provide the stable registry entry, tenant-safe resolver, safe projection tests,
approval/risk treatment for any proposed action, client-visible truth labels, and authenticated
owner proof before changing this handoff from PROPOSED.
