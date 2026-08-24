# Trusted migration baseline contract

Status: **offline tooling only; not operationally activated**.

This contract defines the public-safe artifact that a future migration-proof consumer may use without contacting production. This PR exercises only synthetic fixtures. It creates no database role, protected environment, secret, production baseline, deployment, or active migration gate.

## Threat model

The baseline consumer runs code supplied by a pull request. Anything available to that job must therefore be treated as public, even when GitHub stores it behind an authenticated artifact endpoint. The artifact must not contain row data, tenant fixtures, account identifiers, credentials, connection details, role definitions or memberships, ACLs, comments, or unreviewed routine bodies.

The adversary may try to:

- place row data in `COPY`, `INSERT`, `UPDATE`, `DELETE`, or `MERGE` statements;
- hide sensitive material in comments, string literals, quoted identifiers, or routine bodies;
- restore roles, grants, passwords, foreign-server credentials, publications, or subscriptions;
- use psql meta-commands to connect elsewhere or include another file;
- substitute a different schema, manifest, PostgreSQL image, source commit, or attestation;
- reuse an expired baseline or a baseline generated before later migrations landed;
- run the consumer while production credentials are present.

The sanitizer and verifier fail closed against each class. Unknown SQL statement classes are rejected. A public baseline is not emitted merely because a dump completed.

## Artifact format

The attested subject is one UTF-8 JSON file:

```text
trusted-migration-baseline.json
```

It contains exactly:

- `manifest`: contract version, generation/expiration timestamps, reviewed `main` commit, migration-tree object ID, approved PostgreSQL engine pin, sanitizer-policy digest, security-tooling object IDs, public-safety assertions, schema size, and schema SHA-256;
- `schema`: sanitized SQL text.

The schema is embedded so a valid attestation cannot be paired with an unrelated extracted file. The schema byte length and SHA-256 are independently recomputed by the consumer.

## Public-safety rules

The artifact asserts all of the following, in a versioned and order-sensitive list:

1. schema only; no row data;
2. no role, user, password, or membership DDL;
3. no grants, revokes, or ACL restoration;
4. no comments;
5. no psql meta-commands;
6. no connection material;
7. no secret-shaped literals;
8. every non-routine string literal has an explicitly reviewed SHA-256;
9. every routine statement, including its body, has an explicitly reviewed SHA-256.

Known-secret pattern checks cannot be overridden by an allowlist fingerprint. Any unrecognized SQL statement fails. The future generator must treat sanitizer rejection as a red result requiring review, never as permission to weaken a rule.

The allowlist policy lives at `.github/migration-baseline/public-safety-policy.json`. The consumer resolves that exact file from both the generating commit and the PR's base-main SHA and requires both canonical policy digests to match the manifest. A changed or substituted allowlist therefore makes the baseline stale.

## Engine contract

The only accepted disposable engine is:

```text
supabase/postgres:17.6.1.021@sha256:80f75ea6bfeaa18ffa0d5ede501b46ecd40f1f7b9c98e1fdc9e5c22cfe25c9b7
```

The manifest also requires `server_version=17.6` and `server_version_num=170006`. A tag without the immutable digest fails verification.

## Source and expiration contract

- Source repository: `mrmogulmaker-bot/Paige-Agent-AI`.
- Source ref: `refs/heads/main`.
- Source commit: full 40-character SHA.
- Maximum lifetime: 14 days.
- The source commit must be an ancestor of the PR's base-main SHA.
- The manifest's `supabase/migrations` tree object ID must match the source commit.
- The same tree object ID must still be present at the PR's base-main SHA.

This permits unrelated reviewed `main` changes while rejecting a baseline made stale by any migration-tree change.

## Security-tooling implementation binding

Policy binding is necessary but not sufficient: a baseline made by old sanitizer code must not remain acceptable merely because the migrations and allowlist did not change. Contract v2 therefore records:

- the tree object ID for `.github/scripts/trusted-baseline` (sanitizer, verifier, and contract code);
- the blob object ID for the future `.github/workflows/generate-trusted-migration-baseline.yml`, or an explicit `null` when absent;
- the tree object ID for the future `.github/scripts/trusted-baseline-generator`, or an explicit `null` when absent.

The consumer resolves every binding at both the generating source commit and the reviewed PR base-main commit. Any changed object ID fails closed. An object recorded as absent must remain absent; adding the future generator invalidates every earlier absent-generator baseline. The generator workflow and implementation do **not** exist in this PR.

## Credential environment boundary

The verifier refuses these groups:

- deploy/API tokens: `SUPABASE_ACCESS_TOKEN`, `SUPABASE_TOKEN`, `SUPA_TOKEN`, `SUPA_ACCESS_TOKEN`, `SB_ACCESS_TOKEN`, and `SUPABASE_PAT` (the latter five are fallbacks in `scripts/deploy-function.sh`);
- privileged data keys: `SUPABASE_SERVICE_ROLE_KEY` (used by repository harnesses and Edge Functions), `SUPABASE_SECRET_KEY` (the requested singular alias), and `SUPABASE_SECRET_KEYS` (the current hosted Edge Functions JSON key map);
- database credentials and URLs: `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`, `SUPABASE_DATABASE_URL`, `SUPABASE_POOLER_URL`, `SUPABASE_CONNECTION_STRING`, `DATABASE_URL`, `DIRECT_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL`, and `POSTGRES_URL_NON_POOLING`;
- production target selectors: `SUPABASE_PROJECT_ID` and `SUPABASE_PROJECT_REF`.

The governed names live in `PRODUCTION_CREDENTIAL_ENV_NAMES`. The focused test asserts the exact list before proving that every individual name stops verification, so removing a name cannot make the loop pass vacuously.

Disposable connectivity uses a separate contract. `PAIGE_DISPOSABLE_DATABASE_URL`, or the narrowly listed `PG*`/`POSTGRES_PASSWORD` variables, are accepted only when their host is `localhost`, `127.0.0.1`, or `::1`. A remote `PGHOST` or disposable URL fails. Public Supabase URL, anon key, and publishable-key names are not treated as privileged credentials.

## Offline workflow supply-chain pins

The only external actions permitted in `.github/workflows/trusted-baseline-tooling.yml` are:

- `actions/checkout` v4.4.0 at `11d5960a326750d5838078e36cf38b85af677262`;
- `actions/setup-node` v4.4.0 at `49933ea5288caeca8642d1e84afbd3f7d6820020`.

Their v4.4.0 tag resolutions were verified directly against the official Git repositories on 2026-08-24. The runtime is exactly Node.js `24.19.0`, the 24.x LTS release published in the official Node.js distribution index on 2026-08-03. Focused anti-vacuity tests replace each pin with a floating or unapproved value and require rejection.

## Provenance contract

The consumer must cryptographically verify the artifact with GitHub CLI and require:

- repository `mrmogulmaker-bot/Paige-Agent-AI`;
- signer workflow `mrmogulmaker-bot/Paige-Agent-AI/.github/workflows/generate-trusted-migration-baseline.yml`;
- source ref `refs/heads/main`;
- source digest equal to the manifest source commit;
- predicate `https://slsa.dev/provenance/v1`;
- GitHub-hosted runner provenance (`--deny-self-hosted-runners`);
- at least one verified attestation.

The generator workflow named above does **not** exist in this PR. It is deliberately deferred until the owner separately approves the protected environment and schema-inspection credential model.

## Consumer order

The future PR proof must execute these phases in order and stop red on any failure:

1. assert that production credential environment variables are absent;
2. parse the artifact and enforce its exact shape;
3. verify timestamps, engine, public-safety assertions, schema bytes, and SHA-256;
4. prove source ancestry plus unchanged migration, sanitizer-tooling, and generator object IDs against the PR's base `main`;
5. verify GitHub attestation identity and SLSA provenance;
6. only then restore the embedded schema into the approved disposable engine;
7. identify, fingerprint, order, and apply every PR candidate exactly once;
8. run the registered behavioral proof;
9. issue an independent final verdict that fails if any prior evidence is absent.

The verifier in this PR implements phases 1–5. It does not contact production or restore a database.

## Operational activation still requires owner action

Before any generator exists or any migration-proof workflow is re-enabled, the owner must separately approve and complete:

- token-owner and credential-consumer identification;
- inventory of internal users, test tenants, scheduled work, integrations, and deployment dependencies;
- protected GitHub environments with reviewer and branch restrictions;
- project-scoped deployment identities and a least-privilege schema-inspection identity/exporter;
- staged replacement credentials and non-destructive connectivity/deployment checks;
- a controlled maintenance window for password rotation and old-token revocation;
- rejected-use and unexpected-consumer monitoring;
- generation, human review, and attestation of the first public-safe baseline;
- a separate update to the frozen migration-proof workstream.

No absence of paid users weakens these requirements or makes production disposable.
