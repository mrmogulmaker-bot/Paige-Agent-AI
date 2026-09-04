# Solo Sales workbench — bounded offer discovery

Status: **IMPLEMENTED IN PR #908**. Exact-head CI, merge and deployed revision are recorded on that PR. Owner approved the compact workbench and production delivery. Branch `codex/solo-sales-workbench`, base `c198d8ae` (released #903).

## Approved scope and collisions

The owner explicitly superseded competing Sales PR #905; its separate Clients completion fix stays with its owner. Historical Pipeline #706 remains draft without release approval. No Pipeline behavior or shared Campaign navigation changes are in scope. Open docs PRs #899/#812/#754 overlap the indexes; merge current main and preserve their entries.

Shared exceptions: `src/solo/useCatalogOffers.ts` gains an optional bounded canonical read because paging must happen at the source rather than over an incomplete client array. Only production callers are Catalog Offers and Sales. No-argument Catalog behavior, write RPCs, model and baseline prices stay unchanged. `src/solo/growth2.tsx` changes only Sales form-activity presentation; its Pipeline exports, conversations caller, Vibe caller, six tabs and detail drawer behavior remain unchanged. Agency, sub-account, Operator and legacy Admin receive no new behavior. No `solo-campaigns.css` edit or component fork.

Expected files: Sales component/styles/tests; canonical offer adapter and adapter tests; Sales harness/drive; this live record, tier matrix, master reference and Brain index. No migrations, provider changes, document storage, signatures or external messages.

## Flow map

| Flow | Contract and failure paths |
|---|---|
| Enter / restore Sales | Commercial terms first; compact offer finder, payment declaration, expandable recent activity. Independent loading/error/refusal remain distinct from empty. |
| Find an offer | Server name search, five rows per page, deterministic order and next-page sentinel. No count claiming a partial page is the inventory. Empty search, empty Catalog, retry and previous page reachable. |
| Select offer for terms | Same bounded canonical adapter, separate exact selected-offer read; changing search/page preserves the selected offer and its plans. No mutation of Catalog baseline. |
| Terms list | Search client name and filter status across explicitly labelled latest 200 loaded records; five per page. Missing client context remains unreadable, never fabricated. This is not an all-history search. |
| Create / edit / abandon | Preserve released owner/admin authority, tenant refusal, validation, optimistic concurrency, dirty discard/continue, Escape/X/Cancel, canonical return paths and local persistence behavior. |
| Workspace switch | Filters/page/selection/dialog/notices reset; late tenant or search responses cannot repaint old results. |
| Form / payment activity | Compact empty copy and deliberate expansion of source-backed recent rows; no automatic capture-to-sale or payment import claims. |

Verification: focused adapter and UI tests; real Chromium interaction at 1536×770, 1366×768, 1024×768, 900×1000, light/dark, keyboard and reduced motion; deterministic catalogs of 1, 80, 80000 (simulated, not production load evidence); ordinary CI and production revision/routes. Authenticated owner persistence and production large-catalog performance remain Proof Owed until actually exercised.

## Verification ledger

- Automated/static PASS: 218 focused Sales/Catalog/agreements/shared Campaign tests; changed-source ESLint; type ratchet (13 baseline / 13 current, zero new); production build; diff whitespace check.
- Rendered/local PASS: existing R1 Chromium drive, all four viewports × both themes, X/Cancel/Escape/discard/continue, focus, tabs, Quick Offer → Catalog → Sales, commercial create/edit/refresh, failure/retry and agreement workspace-switch cleanup. New workbench drive: 32 scenarios covering 1/80/80000 simulated offers, page bounds, remote-result-shaped search, exact selection across search, loading/error/retry, focus and tab fit. This is fixture proof, not live data evidence.
- Independent review PASS with one minor authority-retry finding repaired; no blocker/major reported. Reviewer independently reran 29 adapter tests.
- Production release and revision: recorded in the release PR after CI/deployment. Authenticated owner persistence, large-catalog database performance and full live shell geometry remain **Proof Owed**. No source migration or external action is involved.
- Design retains the canonical directory's existing 250-client bound. Terms search only uses available client names across the latest 200 terms and does not claim all-history coverage; expanding that read belongs in a separately scoped client/source follow-up.

### Owner acceptance map

1. Sales: search for an existing offer, open its details, and use Next/Previous on a larger Catalog.
2. Quick offer: create a draft, continue in Catalog, confirm one draft exists, then Return to Sales.
3. Record terms: select an existing client, search/select an offer, change the search and confirm the selection remains; save, refresh, open detail and edit.
4. Confirm Catalog's original list price did not change. No charge, invoice, signature request or client message is sent.
5. Open each drawer; try X, Cancel and Escape, including a draft requiring Discard/Continue editing. Switch workspace and confirm selections/search/notices clear.
- Final rendered contrast correction: shared dark-theme button specificity initially overrode the Sales color. A Sales-only selector now wins; actual computed primary contrast is 9.02:1 light / 5.31:1 dark. The browser drive asserts >=4.5:1 in all eight viewport/theme runs.
