# Portfolio Scope Briefing (SUPERSEDED 2026-08-11 — no longer authoritative for Paige's corporate structure)

> **⚠ SUPERSEDED 2026-08-11 (owner ruling, D7).** The corporate structure described below — in which
> **Paige Agent AI was a subsidiary of a Givalli Heritage Holdings Inc. holding company / Aedis Brands
> LLC IP-licensing structure**, one of 9 operating LLCs — is **NO LONGER AUTHORITATIVE for Paige.** The
> owner ruled 2026-08-11: **Paige Agent AI Inc. is a STANDALONE Delaware C-Corp — no parent holdco, not
> a subsidiary of any entity.** The authoritative corporate-structure doctrine is now
> **`docs/doctrine/paige-corporate-structure.md`**. This file is retained for historical reference and
> because it also records details of the owner's *other, separate* businesses (PME, MMA, MCC, Disputera,
> etc.) — those are the owner's own concern, NOT Paige doctrine, and were not touched. **Do not use this
> file as a source of truth for Paige's entity, parent, or "portfolio mode."**
>
> **⚠ OWNER-OWED FLAG (§13, D7):** the public site Footer (`src/components/landing/Footer.tsx`) still
> states Paige "operates under license from Aedis Brands LLC, a wholly-owned subsidiary of Givalli
> Heritage Holdings Inc." That brand/IP-licensing line was PRESERVED (a standalone C-Corp *can* license
> its marks), but it reflects this superseded holdco structure and was **not** part of the CoreConnect
> ruling. The owner should confirm whether the Aedis/Givalli brand-license survives the C-Corp
> conversion or should be removed for a fully-clean standalone statement (tracked, task #128).

**Committed:** 2026-07-02 as authoritative reference for all future architectural decisions.
**Custodian:** mma-os workspace + Paige repo.
**Status:** SUPERSEDED for Paige corporate structure (see banner above); historical/other-business reference only.

## Corporate Structure

**Parent:** Givalli Heritage Holdings Inc. (Delaware C-Corp)
**IP Holder:** Aedis Brands LLC (Wyoming) — licenses marks and technology to operating subs.

### Platform Entity
- **PaigeAgent AI LLC** (Wyoming) — operates the Paige Agent AI platform. Data controller for platform users.

### 9 Operating Subsidiaries (Wyoming LLCs)
| # | Entity | Lane | Notes |
|---|---|---|---|
| 1 | PaigeAgent AI LLC | Paige | Platform |
| 2 | Project Mogul Enterprise LLC | PME | Runs BTF $4,997 flagship |
| 3 | Mogul Maker Academy LLC | MMA | Education only |
| 4 | Mogul Credit Consulting LLC | MCC | **CROA regulated — LANE SEPARATED** |
| 5 | Treasury Media Group LLC | TMG | — |
| 6 | Givalli Capital LLC | Givalli Cap | — |
| 7 | Mr. Mogul Maker LLC | MMM | — |
| 8 | Mogul Funding Solutions LLC | MFS | — |
| 9 | CoreConnect Technologies LLC | CoreConnect | **Runs Disputera — LANE SEPARATED** |

**Sunset:** CoreConnect Technologies Inc. (Wyoming aged corp, liquidity vehicle). Distinct from CoreConnect Technologies LLC — do not conflate.

## Product Positioning (Paige)

Paige is a **CRM platform**, not a customer of any tenant. Tenants and consumers are billed by Paige across four layers (§197):

- **Layer 1 — Tenants → Paige.** Platform license. Solo $149 / Agency $397 / Enterprise custom.
- **Layer 2 — End customers → Tenants.** Tenant-sovereign pricing (BTF $4,997, LaunchPad $199/mo, etc.).
- **Layer 3 — Metered pass-through.** Wholesale credit pulls, SMS, voice. Tenant is billed regardless of markup.
- **Layer 4 — Consumers → Paige.** Individual business owners. Founder $27 / Growth $67 / Scale $297.

## Consumer Direct Rollout (Sprint P.0)

- **Cohort:** Individual entrepreneurs — coffee shop owners, barbers, truckers, salon owners, credit professionals, sales reps, educators. Consumer = individual natural person per FCRA §603.
- **Onboarding:** Antonio to seed MMA members as Layer 4 consumers in parallel with BTF program engagement (they are separate relationships per §202).
- **Feature deltas (locked 2026-07-02, subject to unit-economics refinement against Array + iSoftpull):**
  - **Founder $27:** 1 business profile, 5 credit pulls/mo, unlimited Paige chat, Email Composer sub-agent only, no MCP, monthly funding recs, 48h email support.
  - **Growth $67:** 3 business profiles, 20 credit pulls/mo, all sub-agents, read-only MCP, weekly funding recs, 1 CFO coaching hr/mo, 24h email support.
  - **Scale $297:** unlimited business profiles, 100 credit pulls/mo, priority chat, all sub-agents, full MCP, on-demand funding recs, 4 CFO coaching hrs/mo, priority chat support.
- **Stripe:** test mode only until Antonio verifies 5 flows (signup, upgrade, downgrade, cancel with grace, refund). Live promotion is a manual step.

## Doctrines Introduced with This Briefing
- **§201** Public-Facing Language Discipline
- **§202** Multi-Entity Contact Relationship Model
- **§203** Product Lane Separation Runtime Enforcement

## Non-Blocking Queue
- Sprint C.4: `track-event` CORS wildcard + credentials fix
- Sprint P.1: shadcn `DialogContent` a11y warnings
- Ship #2.6 Phase 1 (Antonio side)
- Ship #3 (Credit Monitoring — Array + iSoftpull contracts)
