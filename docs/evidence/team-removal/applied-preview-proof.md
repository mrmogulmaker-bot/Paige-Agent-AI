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
