# Paige Agent AI — Corporate Structure Doctrine

> **PROPOSED — owner RULED the substance 2026-08-11 (Option A · direct C-Corp conversion); exact
> wording ratified in a later pass (same pattern as §57–§60). This is a LIVING doc — no date suffix;
> update it in place as entity facts are confirmed.**

**Directive (owner: Antonio, 2026-08-11).** The company is **Paige Agent AI Inc.** — a **standalone
Delaware C-Corp**, formed by **direct conversion** from Paige Agent AI LLC (the owner's "Option A").
This doc is the single source of truth for the legal-entity identity every other surface derives from
(§57). If an entity fact changes, update it HERE and sweep the derived surfaces in the same PR (§37).

## 1. The entity

- **Legal name:** Paige Agent AI Inc.
- **Type:** C-Corporation.
- **Jurisdiction:** Delaware (the default startup jurisdiction — chosen for institutional-capital
  readiness and QSBS eligibility, superseding the earlier "Wyoming / TBD" option that was tied to the
  now-void holdco plan).
- **Founder / CEO:** Antonio Cook.
- **Formation path:** **direct conversion** from Paige Agent AI LLC → Paige Agent AI Inc. (not a
  new-co drop-down, not a merger into a parent). The conversion is what preserves a clean §1202
  (QSBS) holding-period posture on the founder/early-holder stock.

## 2. Standalone — no holdco, no parent, no subsidiaries

- Paige Agent AI Inc. has **NO parent holding company** and is **NOT a wholly-owned subsidiary** of any
  entity. It **stands on its own.**
- This **corrects** prior doctrine (`docs/doctrine/paige-c-suite-roster.md`, authored 2026-07-27) that
  recorded Paige Agent AI LLC as a *wholly-owned subsidiary of CoreConnect Technologies, Inc.* — that
  parent-subsidiary structure is **incorrect** per the owner's 2026-08-11 ruling and has been flagged
  in that doc pending its fuller revision.
- **Relationship to CoreConnect / other owner companies (clarification, not a corporate link):**
  Antonio owns other companies (per `docs/portfolio/PORTFOLIO_SCOPE_BRIEFING.md`, e.g. CoreConnect
  Technologies LLC, which runs Disputera). Those are related to Paige Agent AI Inc. **only by common
  ownership** — Antonio is a shareholder of each — **NOT** by any corporate parent/subsidiary
  relationship. Paige Agent AI Inc. is not under CoreConnect and CoreConnect is not under it. Whether a
  common-ownership "portfolio mode" concept survives in Paige's C-suite architecture is a separate
  owner decision, tracked as a follow-up.

## 3. QSBS posture (§1202)

- The direct-conversion-to-C-Corp path is chosen partly to establish **Qualified Small Business Stock**
  (§1202) treatment on founder + early-holder shares — the standard institutional-readiness move.
- Doctrine note only — **not tax advice.** The actual §1202 qualification (gross-asset test at
  issuance, active-business test, holding period from the conversion date) is confirmed by counsel;
  Paige tracks it as an owner-owed legal item, never asserts it as settled fact (§13).

## 4. Domicile + registered agent (owner-owed — fill in when confirmed)

- **Registered agent:** _owner-supplied — pending._
- **Principal office / domicile:** _owner-supplied — pending._
- **EIN / entity IDs:** _owner-supplied — pending; never commit a tax ID or secret to the repo (§34)._

These are intentionally left as explicit "pending" placeholders (§15 — no fabricated
`[PLACEHOLDER]` shipped as done; a pending fact is named as pending, not invented).

## 5. Where the entity identity is used (the §37 derived-surface map)

Every present-tense use of the legal entity name derives from this doctrine. On any future entity
change, sweep all of these in the same PR:

- **Code constant:** `supabase/functions/_shared/platform-identity.ts` → `legal_entity_name`
  (the platform-invoice/receipt issuer, §38 L1). Its frontend twin `src/lib/platform/identity.ts`
  carries only the product name "Paige Agent AI" (no legal-entity field).
- **Public legal pages:** `src/pages/Terms.tsx`, `src/pages/Privacy.tsx` (the "operated by / provided
  by" entity line + SMS-consent identity).
- **Doctrine + master doc + brain:** this file, `docs/doctrine/paige-c-suite-roster.md`,
  `docs/PAIGE-MASTER-PROJECT-REFERENCE.md`, `docs/brain/config-registry.md`, `CLAUDE.md`-tree.

## 6. What is NOT swept by code (owner-owed, tracked follow-up)

These are the legal entity's real-world identity in third-party systems and binding instruments — they
change by **owner action** at each vendor / by counsel, never by a repo edit:

- **Vendor account names** (still literally "Paige Agent AI LLC" until renamed): Twilio Organization,
  Stripe entity + tax ID, DocuSign account, domain WHOIS registrant. The repo RECORDS these as
  vendor-account names with a "pending rename" annotation (§13 — the account IS still named LLC until
  the owner renames it); it does not pretend they already read "Inc."
- **Binding legal templates** stored in already-applied migrations / DB `legal_documents` rows
  (Terms/Privacy DB copies, DPA, FCRA authorization, Broker Producer Agreement): these are immutable
  historical migration files + legally-operative text — updating the live entity name in those requires
  an owner-reviewed migration, not an automated sweep. Flagged, not touched (this PR).
- **Banking + executed contracts:** owner/counsel action.

## 7. The test, every time

*"Does this surface name the company's legal entity, and does it derive that name from this doctrine —
Paige Agent AI Inc., standalone Delaware C-Corp, no holdco? Is any 'subsidiary of CoreConnect' framing
present (it's wrong), and is any vendor-account record honestly marked as pending-rename rather than
silently flipped?"* If a surface asserts the old structure, or a vendor record claims "Inc." before the
owner renamed it, it isn't corporate-structure-clean.

**Cross-references:** §57 (source of truth — one entity record, many derived surfaces), §37 (producer
inventory on an entity-name change), §13 (honest reporting — vendor records + QSBS as pending, not
asserted), §34 (no tax IDs/secrets in the repo), §28/§58 (the c-suite-roster's portfolio-mode doctrine
is flagged for owner review, not gutted on inference).
