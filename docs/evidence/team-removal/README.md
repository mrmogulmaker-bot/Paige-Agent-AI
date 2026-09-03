# Team removal — evidence

Every claim here was produced by running SQL against **production** (`xygzykjyynhzqytbqnzu`) inside
`BEGIN … ROLLBACK`. Nothing was persisted. These are **pre-merge** proofs: they establish that the
migration executes and that its guards hold. They are **not** a persisted-apply confirmation and not
authenticated browser proof — both are stated separately and remain owed.

## 1. RLS does not gate TRUNCATE — measured, not assumed

Asked because the table's privileges were being changed and "RLS protects it" would have been a
guess. A scratch table, three rows, a policy permitting nothing, `SELECT/DELETE/TRUNCATE` granted to
`authenticated`:

| step | rows left |
|---|---|
| after `DELETE` as `authenticated` | **3** — RLS blocked every row |
| after `TRUNCATE` as `authenticated` | **0** — RLS did not apply |

Privilege state on the real table before the change (`has_table_privilege`):

| role | SELECT | INSERT | UPDATE | DELETE | TRUNCATE |
|---|---|---|---|---|---|
| `anon` | ✔ | ✔ | ✔ | ✔ | **✔** |
| `authenticated` | ✔ | ✔ | ✔ | ✔ | **✔** |

`relrowsecurity = true`, `relforcerowsecurity = false`. The TRUNCATE grant comes from project-level
default privileges, not from any migration in this repository — so no amount of policy work would
have found it.

## 2. Producer inventory for the revoke

Every function on production whose body writes `public.tenant_members` is `SECURITY DEFINER` owned by
`postgres` — 17 of them, and **zero** `SECURITY INVOKER` writers. `grep` across `src/` and
`supabase/functions/` finds no `.insert/.update/.upsert/.delete` against the table from any client.
So withdrawing the write verbs from the browser roles removes no legitimate path. `SELECT` is left
untouched; about ten browser reads depend on it.

## 3. Multi-workspace proof — `multi-workspace-proof.sql`

Fixture: workspaces **A** and **B**; `owner_a` and `coowner` own A; `person` is **Admin in both**;
`person2` is **Admin in A, Member in B**; `person` has a prior authored `audit_logs` row.

| # | scenario | result |
|---|---|---|
| S1 | `anon` direct `DELETE` | `42501 permission denied for table tenant_members` |
| S2 | tenant **Admin** direct `DELETE` of the **owner's** row | `42501 permission denied for table tenant_members` |
| S3 | `authenticated` `TRUNCATE` | `42501 permission denied for table tenant_members` |
| S4 | Admin calls the RPC to remove the owner | `42501 only the workspace owner may remove someone…` |
| S5 | Owner calls the RPC on themselves | `42501 you cannot remove yourself…` |
| S6 | Owner calls the RPC on a **co-owner** | `42501 an owner cannot be removed…` |
| S7 | Owner passes a **different** workspace as the confirmation token | `42501 your active workspace changed…` |
| S8 | Owner names a user in no workspace of theirs | `P0001 that person is not on this workspace's team` |
| S9 | Owner removes `person` | **succeeds** |
| S10 | Owner removes `person2` | **succeeds** |

S6 is what makes "the sole Owner is never removable" true: every owner is refused, so the last one
is unreachable by construction rather than by a count.

Outcome, which is the part that decides whether hard deletion is the right model:

| assertion | observed |
|---|---|
| `person` membership in **A** | `GONE` |
| `person` membership in **B** | `admin/active` — **unchanged** |
| `person` global app_roles | `admin` — **retained**, because B still grants it |
| `person2` membership in **B** | `member/active` — **unchanged** |
| `person2` global app_roles | `user` — `admin` correctly revoked; they are admin nowhere now |
| `person` platform identity | `PRESENT p-person@example.invalid` |
| `person` profile | `PRESENT active_tenant_id=NULL` |
| prior authored history | `1 row(s) still keyed to person` |
| removal audit rows | `2` |
| tenant **B** roster size | `2` — untouched |
| tenant **A** roster | `owner, owner` |
| re-invite to A possible | `true` |

So removing someone from A ends A and only A: it does not touch their identity, their profile, their
authored history, their membership of B, B's roster, or any role B legitimately grants. The one
global role that was revoked (`person2`'s `admin`) was correct — they held it nowhere else. That
revocation is the existing `trg_sync_tenant_member_to_user_roles`, not this function.

## What is NOT proven here

- **Not persisted.** Every transcript ends in `ROLLBACK`. The migration is not applied to production.
- **No authenticated browser drive.** This session has no reachable browser against the live app, so
  the rendered flow, focus behaviour, roster refresh and both themes at the four required viewports
  are **UNVERIFIED** and owed to a capable session.
