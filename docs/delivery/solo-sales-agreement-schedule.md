# Solo Sales agreement schedule clarity

Status: implemented in PR #895; authenticated production proof owed. Deployment evidence is recorded on that PR.

## Intended outcome and scope

A Solo owner opens an existing agreement and reads its recorded start, renewal and end dates on the correct calendar day. Recurring agreements without a renewal date say Not stated; other arrangements say Not applicable. Dates describe recorded commercial terms, not automatic renewal, billing or payment execution.

Base: 37cb1bc50804211bce143caf78b8d0715ca5f041. Branch: codex/solo-sales-agreement-dates.
Only Sales detail rendering and its contract tests change. No data writer, migration, Catalog model, shared drawer, navigation, role or other tier code changes.

## Flow and evidence

- Existing agreement -> detail drawer -> recorded schedule -> close: same entry/exit and shared drawer behavior.
- First entry, loading, empty clients/offers/agreements, refusal, errors/retry and workspace switching retain existing behavior; this slice adds no state or requests.
- Save, cancellation, persistence, tenant and role enforcement retain existing contracts; their authenticated proof is owed, not newly established here.
- Automated: 70 existing Sales surface/adapter tests passed before edits; three new date tests reproduced the prior-day defect, then 73 passed after the fix. Tests exercise recurring renewal present/absent, non-recurring absence, and no write on opening detail.
- Rendered/local: jsdom contract execution only; no browser geometry claim.
- Browser initialization failed twice with sandbox apply-deny-read ACL errors. Authenticated Solo-owner proof, production persistence, all four requested viewport sizes in both themes, keyboard/reduced-motion browser proof: Proof Owed.
- Open-PR file collision check: no Sales-local file overlap across 27 open PRs. #706 owns growth2.tsx and solo-campaigns.css; neither is edited. Documentation files overlap other PRs, so append isolated entries and recheck merge conflicts before release.

## Owner acceptance

1. Create a quick offer in Sales; confirm the same offer appears in Catalog.
2. If available, record payment handling; refresh and confirm it persists. A declaration is not a provider connection.
3. Record an agreement for an existing client and Catalog offer; use a negotiated amount distinct from list price.
4. Refresh, open the agreement and compare recorded start/renewal/end dates.
5. Confirm the Catalog list price remains unchanged.
6. Confirm no provider action, charge, invoice, client message or payment collection occurred. Opening this detail invokes no write.

## Sales-to-Spine handoff

Proposed owner: Spine source-contracts owner, issue #890. Source: existing tenant_client_agreements, governed by sales-agreements-source-contract.md. Outcome: truthful workspace readiness without exposing private commercial terms.
Required safe shape: server-resolved tenant, authorized readiness/refusal, suppressed count/status bands, source-backed action needed, quantized freshness. The existing contract requires a named suppression threshold and protection against differencing; raw counts are not authorized by this packet.
Prohibited: agreement/client/offer identifiers, negotiated or list-price paths, currencies, terms/text/dates, provider/payment/invoice data, revenue claims, per-client evidence registration. Owner/admin authority must be checked on the resolved tenant; no child-workspace aggregation.
No capability registered or resolver deployed. Current source contract and placement decision stay intact. Live database state was not reverified in this slice.

Validation update: changed-file ESLint and git diff checks passed; TypeScript ratchet passed (13 baseline errors, 13 current, none new). Independent static review found no actionable defects; the reviewer did not run tests or browser proof. Production build and CI results are tracked in the associated release PR.
