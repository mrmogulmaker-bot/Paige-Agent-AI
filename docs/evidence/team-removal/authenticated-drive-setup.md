# The authenticated Owner drive — what to provision, and how to hand it over

The Solo Team removal slice owes exactly one evidence class: a real signed-in Owner removing a real
teammate. `scripts/live-drive/team-removal-authed-drive.mjs` performs it end to end. This page is
what someone needs in order to make that drive possible, written so nothing has to be worked out
while it runs.

Nothing here asks for a password to be put in the repository, a pull request, an issue, a log, or a
document. The preferred handover is a browser session file, and with it the drive process never sees
a credential at all.

## What the drive needs to exist

A **dedicated test Solo workspace** — not a production tenant, and not a workspace holding any real
customer or team-member data. Inside and around it:

| # | what | why the drive needs it |
|---|---|---|
| 1 | **Workspace A** — a test Solo workspace | the removal happens here |
| 2 | **an Owner of A** | the only role permitted to remove; the drive signs in as them |
| 3 | **a removable Admin or Member of A** | the person removed. A test identity, never a colleague |
| 4 | **Workspace B**, with that same person as a member | proves removal ends A *and only A* |
| 5 | optionally, an **Admin of A** who is not the Owner | proves an Admin is offered nothing |

Item 4 is the one most easily forgotten and the one that carries the most weight. Without a second
workspace there is no way to show that removal is scoped rather than global, and that claim is the
central promise of the whole slice.

## Handing over the session — preferred, no password anywhere

Export a Playwright storage state from a browser already signed in as the Owner:

```bash
npx playwright open --save-storage=owner-session.json https://<host>/auth
# sign in as the test Owner in the window that opens, then close it
```

The file holds cookies and local storage for that session. It is a credential in its own right —
keep it out of the repository, hand it over out of band, and delete it when the drive is done. The
repository already ignores `scripts/live-drive/artifacts/`; put session files somewhere outside the
working tree entirely.

Do the same for the removed person and the Admin if their proofs are wanted:

```bash
npx playwright open --save-storage=removed-person-session.json https://<host>/auth
npx playwright open --save-storage=admin-session.json https://<host>/auth
```

The fallback is `LIVE_DRIVE_EMAIL` + `LIVE_DRIVE_PASSWORD` for the Owner, read from the environment
only. The helper fills them with Playwright's `page.fill`, which does not echo, and blanks the inputs
before any screenshot. It is still the weaker option: it puts a password in an environment this
process can read.

## Running it

```bash
export LIVE_DRIVE_URL=https://<host>
export TEAM_OWNER_ACCOUNT=<workspace A account number>
export TEAM_SECOND_ACCOUNT=<workspace B account number>
export TEAM_TARGET_EMAIL=<the removable person's email>
export LIVE_DRIVE_STORAGE_STATE=/path/outside/the/repo/owner-session.json

# Read-only first. Proves who is offered the control and every protection needing no write.
node scripts/live-drive/team-removal-authed-drive.mjs

# Then the real thing, once the read-only pass looks right.
export TEAM_DRIVE_CONFIRM_TEST_WORKSPACE=true
export TEAM_ALLOW_REMOVAL=true
export TEAM_REMOVED_STORAGE_STATE=/path/outside/the/repo/removed-person-session.json
export TEAM_ADMIN_STORAGE_STATE=/path/outside/the/repo/admin-session.json
node scripts/live-drive/team-removal-authed-drive.mjs
```

Two guards stand in front of the write, deliberately. `TEAM_DRIVE_CONFIRM_TEST_WORKSPACE=true` is a
declaration that this is a test workspace with no real data; `TEAM_ALLOW_REMOVAL=true` is a separate
declaration that the run may actually remove somebody. Neither is set by default, and without both
the script does not write.

## What it will report

Eight rows, each with its own verdict. `UNPROVEN` is a real outcome and never rolls up into a pass.

| id | proof | needs |
|---|---|---|
| P1 | Owner opens Solo Settings → Team | Owner session |
| P2 | Owner removes the Admin/Member and confirms | `TEAM_ALLOW_REMOVAL=true` |
| P3a | the person disappears from this workspace's roster | as P2 |
| P3b | the person can no longer use that workspace | **the removed person's session** |
| P4 | their identity and authored history remain intact | **the removed person's session** |
| P5 | their second workspace membership and access remain intact | **the removed person's session** |
| P6 | owner · co-owner · self · admin · member · wrong-workspace · unknown · cancel · retry · account-switch | partly Owner session, Admin row needs the Admin session |
| P7 | the test state is restored via the invitation flow | as P2 |

**P3b, P4 and P5 cannot be established from the Owner's browser, and the script will not pretend
otherwise.** You cannot prove somebody lost access by looking at someone else's screen. Without that
person's session those three rows report `UNPROVEN`, and the Owner-side roster is never allowed to
stand in for them.

## What no browser drive can do, and where those proofs actually live

Three items in P6 are not drivable through the product and are not claimed to be:

- **an unknown target** — the interface offers no way to name somebody who is not on the roster.
- **a retry after a transport failure** — reaching it means breaking the network mid-request.
- **a wrong-workspace write** — the screen sends the workspace it is looking at, by construction.

All three are proven at the database boundary instead, against an applied schema, in
`applied-preview-proof.md` (S7 wrong-workspace, S8 unknown target) and in the harness renders
(`state-failure-retry.png`). That is a different and weaker class than an authenticated drive, and it
is labelled as such wherever it appears.

## Afterwards

P7 re-invites the removed person through the normal invitation flow and confirms the invitation is
pending. **Accepting it is manual** — the token only ever reaches the recipient's email, so no drive
can complete that half. Finish the restore by accepting the invitation as that person, or leave the
workspace in its post-removal state if the test identity is disposable.

Then delete the session files.
