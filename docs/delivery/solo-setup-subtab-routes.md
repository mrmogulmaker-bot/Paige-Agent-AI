# Solo Setup addressable subtabs

## Design direction and flow map — 2026-09-03

- Owner job: open, share, revisit and edit a specific Setup area in any Solo workspace.
- Preserve the five approved labels, visual treatment, fields and single Settings scroll owner.
- Separate child URLs under `/solo/{account}/settings/setup/`; render only the selected area.
- Existing Setup/index links select Business profile; invalid child links show recovery, not another area's content.
- Keep one tenant-scoped draft while moving between Setup areas; navigation never means saved.
- Explicit save retains the existing transactional adapter, permission policy and provenance.
- Drawers retain their parent URL and return focus; no new hidden page or provider/Team action.
- No animation/haptics required for route changes; honor reduced motion and keyboard navigation.

Flow: index/direct link → matching area → edit → sibling URL (draft retained) → save → stored result.
Back/Forward inside Setup selects the matching area and retains the in-memory draft. Refresh warns
about unsaved changes and loads durable data. Leaving Setup, drawer abandonment and account switch
retain the established confirmation/refusal policy. A save failure leaves the draft retryable;
validation navigates to the area containing the field. Account changes discard old workspace state.

Prototype scope is navigation, not a second data implementation. Deterministic mock controls cover
read-only, pending, failure/retry, discard and invalid-link states. Existing field-level source
conflicts, legal constraints, protected storage and upserts remain governed by their existing contracts.
The owner's explicit request and standing preapproved gates authorize this navigation direction.

## Classification and collision boundary

Shared Solo template/navigation; tenant data contracts unchanged. No database migration.
Branch: `codex/solo-setup-subtab-routes`, grounded on `ba22614bab7a9653adacc5393388568142c37682`.
Reconciled current main `197a10e2` before final review; inherited Billing/Team releases stay intact.
Active PR scan: #724 and #674 own `src/solo/settings.tsx`; #731 owns the Setup surface card and
scroll playbook; #754 owns the brain/master records. Leave these files untouched. Existing wildcard
routes already reach Setup, so no shared routing/authentication module needs a scoped exception.
Changes are confined to Solo Setup route/component/style/tests and isolated proof/delivery files.

## Evidence

- Automated: 113 focused Setup/route/adapter/scroll tests pass across six files; four shell invariant
  tests pass separately. The unchanged shell test needs Git's existing grep on Windows PATH;
  its first Windows run could not find that executable. No test was removed or weakened.
- Failing-first: a direct Knowledge URL selected Business profile before the repair.
- Flow Prototype: isolated mock navigation passed eight viewport/theme combinations. The local
  throwaway HTML is outside the production import graph and is not part of the release.
- Review: independent reviewer ran 65 focused tests and cleared the route/draft/snapshot lifecycle.
  Findings repaired: drawer origin return, duplicate same-tab history entries and pending link clicks.
- Browser: initial traversal caught native autofill lost before a late history listener; the final
  implementation uses React's pre-DOM-mutation snapshot lifecycle, restricted to the same tenant.
  Full final rendered matrix and hosted checks are pending at this pre-push record.
- Existing transactional data adapter, RLS/permissions and protected identifier contracts unchanged.
  No new schema or production data write is required for this navigation release.
- Authenticated owner navigation/save/reload proof remains OWED. Structural browser data is synthetic.

## Navigation truth and audit boundary

Sibling URLs share only the existing in-memory tenant draft, not visible content. Clicking the
active tab is a no-op. Index redirects replace history; unknown child URLs show a recoverable
not-found state. Drawers retain their draft during sibling history traversal and explicitly return
to their originating area when closed/applied. Account switching clears prior context.

The pre-existing general SPA history/programmatic exit guard gap is parked with the routing owner;
the new subtab work does not silently replace BrowserRouter or claim universal navigation blocking.
No model, provider, Team, billing, Rail, Spine or Mind capability is added by an addressable URL.

## Collision-safe documentation handoff

After release, the owner of #731 should update `docs/doctrine/surface-cards/setup.md` navigation:
“Setup has five URL-addressed child areas: Business profile, People & email, Knowledge bucket,
Direction and Paige brief. Sibling navigation preserves the tenant-scoped unsaved draft; only
the existing durable save confirms changes. Drawers return to the originating child area.”
Reason: that active PR owns the surface card.
The owner of #754 should add the same capability and exact release/proof status to
`docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §4 Solo Settings/Setup and the relevant Second Brain
Setup record. Do not mark this shipped until this document contains release evidence.
