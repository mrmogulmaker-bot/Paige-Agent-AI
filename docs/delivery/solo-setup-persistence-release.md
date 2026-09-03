# Solo Setup persistence repair — release evidence

## 2026-09-03 continuation — approved business-context replacement

The sections below document the earlier persistence repair, **not proof of the expanded candidate**.
The current candidate is on `codex/solo-setup-business-context-approved`; it is committed and
not deployed at this checkpoint. The owner's approved design is the canonical five-subtab Setup
surface for every top-level Solo tenant: Business profile, People & email, Knowledge bucket,
Direction, and Paige brief. The expanded guided Paige brief replaces only the old brief area.

Candidate work lives in `src/solo/SoloBusinessContextSetup.tsx`, its Solo data adapter/contract,
Solo tests/styles and the approved Setup-owned migrations. `settings.tsx` has only the Setup
import/mount substitution. Existing Team, Billing, provider, PAIGE, Spine, Rail and Mind owners
are not replaced. No direct Team membership/role mutation is added.

The owner's production-MVP release cadence is controlling: ordinary functional/check failures
must be repaired; missing authenticated proof, reviewer outages and non-blocking audit items do
not create new approval gates. A released candidate without owner proof remains `PARTIAL` /
`Authenticated Runtime Proof Owed`.

### Current real scope decision

Managed-email registration cannot be implemented correctly by updating Setup's registry alone.
The shared sender lifecycle rebuilds the actual connector from the tenant slug. A scoped exception
was explicitly approved on 2026-09-03 in `docs/handoff/solo-setup-managed-email-exception.md`.
The forward lifecycle migration now atomically registers the identity and connector for opted-in
top-level Solo tenants. All other tiers retain their existing behavior. The adapter requires a
matching tenant-bound readback before showing registration success; disabled identities fail closed.

### Latest checkpoint (supersedes the earlier candidate counts below)

- Current main `93a21831c1dfeef96e34760c2b0129f188830100` was reconciled in merge `3784c26a`.
  Main's new Billing view stays intact; this branch changes only the Setup import/mount there.
- Automated: 92 focused Setup tests across 11 files pass. Independent managed-email UI/adapter
  verification covers 37 tests, including mismatched responses, readback, retry, account switching,
  first use, duplicate mutation refusal and preservation of dirty brief state.
- Full local suite: 2,371 passed / 3 failed. Two failures are unchanged Windows portability tests
  (`grep` dependency and slash normalization); the unchanged Clients layout test passed its 37-test
  isolated rerun. Hosted Linux CI remains the release gate; these failures are not hidden.
- Build exits 0. Type ratchet passes (13 inherited errors, no new errors). Scoped ESLint,
  migration-version, definer-grant and three-migration lint checks pass. The migration INSERT/SELECT
  warning is reviewed: tenant id/name are guarded and name is coalesced to a non-null fallback.
- Real isolated PostgreSQL: 14 sender/lifecycle/access cases PASS at
  `outputs/solo-setup-db-proof/run-eLT718/proof.json`; the test cluster was stopped. The independent
  harness applies all three new migrations and uses real extracted authorization/resolver/helper
  functions with synthetic dependency tables, not a full production clone or authenticated browser.
- Source review fixed the missing-tenant FOUND check, disabled-identity synchronization, exact
  availability matching and durable registration readback. No Team or provider activation occurs.
- Browser connector fails before initialization with a Windows sandbox ACL error. Authenticated
  runtime proof remains OWED. A structural fallback and additional supplemental persistence proof
  are being attempted; neither is claimed here as completed.
- Nothing is yet merged or deployed. Knowledge/voice storage is not PAIGE/Mind/Spine/Rail ingestion.

### Review repairs and evidence separation

- Automated: 65 focused tests across seven files pass, including ten new adapter tests for safe retry errors, unresolved-session refusal,
  late account-switch reads/writes, expected tenant/revision/email arguments, duplicate save
  refusal, Admin null supplemental contract, guarded registration/dismissal, Member refusal and
  stable empty snapshots that prevent a first-load form-reset loop. This total includes legacy
  regression tests; it is not 65 authenticated flows. The new UI has 13 tests and SQL contract has 13.
- Static: reviewed SQL adds expected-tenant checks before nested writes, profile-row serialization,
  email concurrency/source decisions, server-owned provenance, private snapshot tracking,
  profile allowlisting and bounded source/example collections.
- UI regression repairs: stale conflict draft replacement, pending-input freeze, preservation of
  legacy facts and representative controls, explicit provenance decisions, isolated drawer drafts,
  focus/return/cancel behavior and pending-proposal review. Combined focused verification passes.
- Build/static: production build exits 0; scoped ESLint passes; migration versions and definer
  grants lint pass. The repository type ratchet passes with 13 baseline / 13 current errors;
  unrestricted typecheck is not clean because those inherited shared-module errors remain.
- Independent review: the database reviewer rechecked the repaired adapter and SQL argument
  alignment and reported no material adapter findings; SQL execution remains separately unverified.
- SQL runtime: UNVERIFIED for the new migrations. A local PostgreSQL service exists but no
  disposable database identity was verified; no credentials or unknown database were used.
- Rendered structural / authenticated runtime: proof for this expanded candidate remains owed.
  The local HTML prototype is design evidence only, not durable save evidence.

Current main was fetched to `3b666d4e98c528458555e21673a8bc72ea02d420`; integration and exact final
head checks remain before release. Do not reuse the older `bfc5a8e` approval SHA as evidence for
this changed candidate.

### Documentation collision handoff

Open PR #731 owns `docs/doctrine/surface-cards/setup.md` and the Setup scroll playbook. Those files
are left untouched in this continuation. Its owner must reconcile the approved five-subtab design,
the existing Settings scroll owner, the guided brief return path and the expanded persistence
states with the old six-section surface card. No scroll-policy redesign is implied. PRs #724 and
#674 also touch `settings.tsx`; the Setup-only import/mount must be reconciled without absorbing
their unrelated routing or provider changes.

### Future integration handoff

Setup source records and structured voice examples remain tenant-owned and unconnected to model
runtime. Source URLs are stored, not fetched; documents/catalog entries are references, not an
upload/import pipeline. The existing `solo-setup-business-context-spine-handoff.md` exclusions
continue to apply. Future consumption may consider owner-reviewed voice character, audience
relationship, message structure, preferred/avoided language, channel differences and working
boundaries, but must separately establish safe projection and authorization. Freeform source or
example content is not automatically safe for PAIGE, Mind, Spine or Rail.

## Scope

Shared canonical Solo Settings → Setup template. The existing six-section information architecture,
language, visual treatment, and Settings visible-scroll policy remain. The release repairs durable
editing and adds business ownership inside Representation without creating a second Team roster.

## Reproduced defect and repair

- **Production diagnosis:** SQLSTATE `42804` in `save_solo_business_brief()` mixed the
  `tenant_role` enum with text while deriving the audit role. Because it occurred inside the save
  transaction, every preceding write rolled back.
- **Repair:** migration `20261046000000_solo_setup_persistence_repair.sql` casts the role to text,
  adds a canonical transactional read/write context, and returns the stored tenant record.
- **Response repair:** the saved response now includes the legal overlay and masked registration
  last four instead of replacing the UI with the incomplete general-brief payload.

## Evidence by class

- **Automated:** focused Setup contract, carrier, hook, UI, account-switch guard, and migration tests;
  migration-version and SECURITY DEFINER guards.
- **Static:** protected-field exclusions, Team non-mutation, RPC grants, direct legal-table denial,
  canonical shared Solo route, safe audit payload, and PAIGE/Rail boundary assertions.
- **Rendered structural:** Flow Prototype covers first use, populated, partial, edit, validation,
  saving, saved, failed/retry, conflict, cancel/discard, stale response, account switch,
  connection-source decision, and read-only treatment across the supported viewport/theme matrix.
- **Real database schema, rolled back:** the exact migration plus the checked-in full permission and
  privacy probe passed. It covers Owner/Admin/Member/anonymous, stale and missing revisions,
  cross-tenant refusal, non-U.S. Vault preservation, protected-payload exclusion, safe shared-brand
  projection, browser-role legal-table denial, and post-rollback absence. See
  `docs/evidence/solo-setup-persistence-rollback-proof.md`.
- **Authenticated browser runtime:** OWED until a signed-in Owner completes save → reload → reopen →
  switch away/back on the deployed exact head.

## Truth boundaries

Setup persistence may be called LIVE only after migration, exact-head application deployment, and
authenticated Owner save/reload proof. The existing shared brand resolver can carry only the
sanitized public/operational subset; end-to-end PAIGE/Mind use remains PARTIAL and unverified.
New Spine consumption remains PROPOSED; Rail remains UNAVAILABLE. Internal audit records are not
Rail. Provider configuration and submission remain in Connections; workspace ownership/access
changes remain in Team.
