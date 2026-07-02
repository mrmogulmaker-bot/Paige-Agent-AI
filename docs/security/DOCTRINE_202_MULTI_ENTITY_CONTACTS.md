# Doctrine §202 — Multi-Entity Contact Relationship Model

**Status:** Codified 2026-07-02 with Sprint P.0.

## Rule
A single natural person (contact) may hold **multiple simultaneous relationships** across portfolio entities — e.g. Mogul Maker Academy member **and** PME BTF client **and** Layer 4 consumer of Paige **and** MFS referral source.

**Never duplicate contact records** to represent multiple entity relationships. One `clients` row. Many `tenant_entity_relationships` rows.

## Schema
```
public.corporate_entity_registry
  slug, legal_name, role (parent|ip_holder|platform|operating|sunset), lane, lane_separated

public.tenant_entity_relationships (§202 table)
  contact_id → clients.id
  entity_id → corporate_entity_registry.id
  relationship_type text  -- 'mma_member' | 'pme_btf_client' | 'l4_consumer' | 'mfs_referral' | 'mcc_client' | ...
  status, started_at, ended_at, metadata, tenant_id
  UNIQUE (contact_id, entity_id, relationship_type)
```

## Enforcement
- Merge tools (`admin-merge-contacts`, MCP `merge_contacts`) must preserve **all** relationship rows from both sides.
- Import pipelines that discover an existing email/phone must **add a relationship**, not create a new contact.
- Portfolio dashboards join `clients → tenant_entity_relationships → corporate_entity_registry` for lifetime value roll-ups.

## Lane Separation
Adding a relationship of type `mcc_client` (Mogul Credit Consulting — CROA regulated) or any `coreconnect_*` relationship activates §203 runtime enforcement on that contact's outbound content and MCP actions.
