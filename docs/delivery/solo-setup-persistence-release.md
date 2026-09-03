# Solo Setup persistence repair — release evidence

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
