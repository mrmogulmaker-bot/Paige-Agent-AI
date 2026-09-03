# The migration APPLIED, and driven — Supabase preview branch

This is a stronger class of evidence than `multi-workspace-proof.sql`, and the difference is the
point. That file's transcript ends in `ROLLBACK`: it proves the SQL executes and the guards fire,
with the function created inside the transaction that then throws it away. Here the migration is
**genuinely applied** by the platform's own branching pipeline, exactly as a deploy would apply it,
and the guards are driven against that applied schema.

**Where:** the Supabase preview branch for PR #799, project `mkdevsqajkuhgbhizydl`, created and
migrated by Supabase Branching from the pushed head. **Not production** — production is untouched
and the migration is not in its ledger.

## The schema really is applied

```
recent_migrations : ["20261044000000", "20261043000000", "20261042000000"]
remove_solo_team_member present : 1
```

All three versions coexist, which is also the proof that the renumber was correct: main's Rail
migration `20261043000000` and this branch's `20261044000000` both applied, neither skipped.

## The privileges really did change

| privilege on `public.tenant_members` | before (production, measured) | after (this branch, applied) |
|---|---|---|
| `authenticated` DELETE | true | **false** |
| `authenticated` TRUNCATE | true | **false** |
| `anon` TRUNCATE | true | **false** |
| `authenticated` SELECT | true | **true** — deliberately unchanged |
| EXECUTE `remove_solo_team_member` — `authenticated` | — | **true** |
| EXECUTE `remove_solo_team_member` — `anon` | — | **false** |

## Driven as the real caller roles

Fixture: workspaces A and B; `owner_a` and `coowner` own A; `person` is Admin in **both**; `person2`
is Admin in A and Member in B; `person` has a prior authored `audit_logs` row. Each step runs under
`SET LOCAL ROLE` with a JWT subject, so `auth.uid()` and every policy resolve as they would for a
real caller. The fixture is rolled back; the migration under it is not.

| # | scenario | result |
|---|---|---|
| S1 | `anon` direct `DELETE` | `42501 permission denied for table tenant_members` |
| S2 | tenant **Admin** direct `DELETE` of the **owner's** row | `42501 permission denied` |
| S3 | `authenticated` `TRUNCATE` | `42501 permission denied` |
| **S3b** | tenant **Admin** direct `UPDATE` of `status` to end access | `42501 permission denied` |
| S4 | Admin calls the RPC to remove the owner | `42501 only the workspace owner may remove…` |
| S5 | Owner calls the RPC on themselves | `42501 you cannot remove yourself…` |
| S6 | Owner calls the RPC on a co-owner | `42501 an owner cannot be removed…` |
| S7 | Owner passes a different workspace as the token | `42501 your active workspace changed…` |
| S8 | Owner names a user in no workspace of theirs | `P0001 that person is not on this workspace's team` |
| S9 | Owner removes `person` (Admin in A and B) | **succeeds** |
| S10 | Owner removes `person2` (Admin in A, Member in B) | **succeeds** |

**S3b is new here and it matters.** Revoking only `DELETE` and `TRUNCATE` would have left a tenant
Admin able to end somebody's access by writing `status`, since every resolver requires
`status='active'` — the same outcome by a quieter route. `UPDATE` is revoked too, so it is closed.

## The multi-workspace outcome, against the applied schema

| assertion | observed |
|---|---|
| `person` membership in A | `GONE` |
| `person` membership in B | `admin/active` — unchanged |
| `person` global app_roles | `admin` — retained, because B still grants it |
| `person2` global app_roles | `user` — `admin` correctly revoked; they are admin nowhere now |
| `person` identity and profile | `PRESENT, active_tenant_id=NULL` |
| prior authored history | `1 row(s) still keyed to person` |
| removal audit rows | `2` |
| tenant A roster | `owner, owner` |
| tenant B roster size | `2` — untouched |
| re-invite to A possible | `true` |

## Still NOT proven

- **Production is untouched.** This is a preview branch. The persisted-apply confirmation on
  production remains owed and happens on merge, through `deploy-migrations.yml`.
- **No authenticated browser drive.** No session, no UI, no real person. This proves the database
  contract on an applied schema; it says nothing about whether an owner can complete the flow in the
  product. That drive is owed to a capable session.

---

## Renumbering note — 2026-09-03, recorded rather than rewritten

**The transcript above is left exactly as it was observed.** It records `20261044000000` as applied
on the preview branch, and that was true when it was taken.

That version has since been claimed on `main` by a different migration —
`20261044000000_rail_authority_is_decided_in_this_workspace.sql`, merged as
[#813](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/pull/813) (`4ccd65d4`) and since applied to
production, where `supabase_migrations.schema_migrations` now carries the version and
`to_regprocedure('public.remove_solo_team_member(uuid,uuid)')` returns `null`. This branch's
migration was therefore renumbered to **`20261046000000`**. Its SQL is unchanged.

**This is the third collision on this branch** (`20261042000000` → `20261043000000` →
`20261044000000` → `20261046000000`), and the first of the three that `scripts/ci/migration-version-collision-lint.mjs`
could not have caught before it happened: the guard compares against the merge base, and the twin
only appeared on `main` after this branch's head was cut. Had it merged as-numbered, `supabase db
push` would have **skipped the file silently** — CI green, `db-live` advanced, and
`remove_solo_team_member` simply absent from production.

The three-way check was re-run for the new version: not on `main`, not on any remote branch, and not
in production's ledger. The `20261046000000` number leaves `20261045000000` to
[#827](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/pull/827), which releases first.

**What this does NOT re-prove.** The behavioural results above were obtained against the migration
applied under its old version. The SQL is byte-identical, so they remain evidence about this
migration's behaviour — but the applied-schema proof for `20261046000000` under its new number comes
from this PR's own Supabase Preview run, and is not claimed by this note.

---

## Renumbered again, 2026-09-03 — the fourth collision, and the fifth and sixth versions tried

**Appended, not rewritten.** Everything above is left as it was written; this note records what
happened afterwards.

`20261046000000` was itself claimed on `main` while this branch waited, by
`20261046000000_solo_setup_persistence_repair.sql` ([#829](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/pull/829)),
which is applied on production. Merging current `main` into this branch put **two files at the same
version in one tree** — the state in which `supabase db push` skips one of them silently, because the
ledger is keyed on the version alone and does not know a filename.

The migration is therefore now **`20261048000000`**. Its SQL is still unchanged. `20261047000000` went
to [#827](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/pull/827), which released first and is
applied on production.

The three-way check was re-run for `20261048000000` at this head: absent from production's
`schema_migrations` (which carries `…44`, `…45`, `…46`, `…47`), absent from `main`'s tree, and absent
from **every** remote branch — scanned, not assumed.

**The claim in the paragraph above is now stale, and is not carried forward.** No Supabase Preview
run has applied this migration under `20261048000000`, and the earlier preview evidence was taken at
`20261044000000`. Rather than restate a preview claim at a version no preview has seen, the
applied-schema proof for the released version is `supabase/tests/solo_team_removal_authority.sql`,
executed by the `database-contract` job against a schema `supabase db reset` replays from zero — the
same mechanism the sibling invitation release used, and one that does not depend on preview-branch
availability.
