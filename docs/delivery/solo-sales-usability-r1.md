# Solo Sales usability repair — Release 1

Status: **IMPLEMENTED IN PR #903**. Local checks and the browser drive passed; exact-head CI, merge and deployment evidence are recorded on PR #903. Owner feedback remains authoritative: Sales is not complete merely because PR #895 corrected recurring-date display.

## Outcome and boundaries

A Solo owner can use Sales to define a canonical offer draft, declare how their business accepts payment, and create or edit a client's commercial terms. The visible name is **Commercial terms and retainers**. This is a commercial record, not a generated, stored, sent or signed legal agreement.

Base: current main `12e495a`. Branch: `codex/solo-sales-usability-r1`. The owner cleared the historical #706 collision: that PR remains draft and has no new release approval; merged #718 is already on main and no Pipeline edits are active. Approved shared exceptions are limited to the Sales wrapper/return paths and shared detail cleanup in `growth2.tsx`, plus a Solo-only Clients return affordance. Pipeline implementation and the six Campaigns tabs remain unchanged.

## Changed flows

| Flow | Implemented behavior | Verification boundary |
|---|---|---|
| Enter Sales or restore a session | Source-backed readiness for offers, commercial terms, payment handling and commercial activity; explicit loading, unavailable and retry states | Authenticated owner entry remains Proof Owed |
| Open and leave any Sales editor | Editors are portaled outside their inert background; X, Cancel, Escape and navigation use the same dirty-draft discard/continue decision; focus returns to a connected launcher | Real interaction and reduced-motion drive in progress |
| Quick Offer → Catalog → Sales | Quick creation saves one canonical Catalog draft; full setup continues in Catalog; same-account return route is explicit | Local persistent fixtures prove only local behavior, never production persistence |
| Missing client or offer | Direct path to canonical Clients or Catalog with a return to the terms flow; no rival Sales client or offer store | Creation depends on that source's real permissions and availability |
| Record or edit commercial terms | Existing detail exposes Edit commercial terms; validation and save errors remain actionable; the existing Catalog snapshot and unexposed terms are preserved | Owner/admin authority and server tenant checks remain required |
| Payment handling | A declaration of how the workspace accepts client payments; it does not connect a processor or collect money | Platform Billing remains Settings → Billing; no Stripe, invoice or external-send action added |
| Workspace switch / delayed response | Old lists, drawer selections, notices and pending results are hidden or discarded; writes retain the workspace in which the form opened | Adapter and shared-detail regressions are automated proof, not live authorization proof |

The oversized lower “Billing your own clients” banner is removed. Its boundary is stated beside payment-handling configuration. Violet actions, editable form controls, focus/selection feedback and compact source-return paths replace ambiguous pale controls. No decorative metrics or revenue claims are introduced.

## Proof ledger

- **Automated/static — PARTIAL:** focused shared Campaigns/Pipeline/Clients tests pass, including same-account return and shared detail/focus regressions. Sales surface/adapter checks and ordinary release checks are being completed in the release workstream. Record their final results on the release PR.
- **Rendered/local — PASS for exercised flows:** real Chromium interaction at 1536×770, 1366×768, 1024×768 and 900×1000, both themes; keyboard, reduced motion, close/discard, create/edit, failures/retry, no-data/loading/refusal and workspace switching are the required matrix. Screenshots alone do not prove those actions.
- **Local persistence — fixture only:** the review harness stores deterministic commercial records in browser storage. It never contacts a payment or signature provider and is not production evidence.
- **Production persistence — Proof Owed:** offer creation → Catalog, terms save/edit → refresh, unchanged Catalog list price and payment declaration persistence under an authenticated Solo owner.
- **Authenticated Solo-owner acceptance — Proof Owed:** no owner result is inferred from fixtures, a successful build or a public route response.
- **Release — PR #903:** merge/deployment revision and check outcomes are recorded on the release PR under the owner's MVP cadence. Non-blocking proof gaps remain explicitly owed.

## Owner acceptance map

1. Create a named Quick Offer. Continue to Catalog, confirm the same draft exists, then return to Sales.
2. Open payment handling, choose the real method used by the business, save and refresh. Confirm the declaration persists without claiming a processor connection.
3. Record terms for an existing client and Catalog offer. If either source is empty, follow its creation path and return.
4. Open the saved record, edit commercial terms, save and refresh. Confirm those terms persist and the Catalog baseline price stays unchanged.
5. Exercise X, Cancel and Escape in every drawer; dirty edits must offer discard or continue editing. Change workspace while loading/saving and confirm prior-workspace content does not reappear.
6. Confirm no charge, invoice, Stripe action, client message, legal document or signature request occurred.

## Safe source handoff

The governing contract is [sales-agreements-source-contract.md](sales-agreements-source-contract.md). This repair registers no Spine capability and does not change the source schema or authorization policy. A future server-resolved owner/admin summary may expose only permitted readiness, suppressed count/status bands, source-backed action needed and quantized freshness. It must prevent small-population disclosure and differencing; a denied or partial read must never become an empty or complete aggregate. No parent-Agency aggregation is authorized.

Never send negotiated or Catalog amounts, currency, price-basis paths, client/offer/record identifiers, private client fields, contract terms/text/dates, provider/payment/invoice data, uploaded documents or signatures into PAIGE, Spine, Rail, Mind or generic notifications. No revenue or campaign-attribution claims may be inferred.

## Release 2 gate

After this usability release, create a complete rendered interactive **Client Agreements** prototype for owner approval. Prioritize tenant-uploaded, attorney-approved templates and one-off documents; represent the future PAIGE template library honestly as future. Cover library/version/ownership, client and offer selection, approved merge fields, review, explicit per-send confirmation, signature states, failure/retry, audit/download, tenant/privacy boundaries and abandonment.

Inventory existing sign-on/signature/provider code before proposing reuse. An Integration card is not a connected provider contract. Document storage, external signature requests and signing implementation remain blocked until the owner approves the rendered end-to-end design; any shared/provider expansion requires its scoped exception. This R1 release does not satisfy that gate or close the broader Sales program.
### Completed local verification

- Sales UI/navigation: 52 tests passed; Sales adapters: 39 passed; shared Campaigns/Pipeline/Clients suites passed. Typecheck ratchet passed (13 existing, no new errors); production build passed. Exact-head CI is required before merge.
- Real Chromium: all four requested viewports in both themes passed X/Cancel/Escape, dirty discard/continue, keyboard, drawer bounds and six-tab reachability with reduced motion emulated. Quick Offer -> Catalog -> Sales passed. Commercial terms create -> reload -> edit -> reload, failed-save retry and fixture workspace draft/record cleanup passed.
- Reproduction: start the Sales-mount Vite harness on port 5213, then run `node scripts/live-drive/sales-usability-drive.mjs`. Output: `scripts/live-drive/artifacts/sales-usability/evidence.json` and eight screenshots. Sources persist only in local fixture storage.
- Independent static review found snapshot/quote/navigation edge cases; repaired with focused regressions. Screen-reader testing, full authenticated client creation, provider-side no-action audit, and authenticated production persistence remain Proof Owed.