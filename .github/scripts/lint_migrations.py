#!/usr/bin/env python3
"""
SPRINT P.S.M / Task #32 — migration clean-rebuild lint.

Scans the migration files passed as CLI args (intended: the files ADDED or
MODIFIED in a pull request) for the failure classes that break a fresh
`supabase db push` / apply_migration against an EMPTY database — the exact thing
Phase-3 BYO provisioning does. Existing already-applied migrations are not
re-linted; this is a forward guard on new/changed migrations.

  PATTERN 1 (FAIL): a seed INSERT carrying a hard-coded auth-user UUID with no
      `EXISTS (SELECT 1 FROM auth.users …)` guard. On a fresh rebuild auth.users
      is empty, so the FK raises 23503. Fix: rewrite as
      `INSERT … SELECT … WHERE EXISTS (SELECT 1 FROM auth.users …)`.

  PATTERN 3 (FAIL): `gen_random_bytes(...)` seeded into `_internal_secrets` with
      `ON CONFLICT … DO NOTHING`. A fresh rebuild mints a brand-new random key
      that the Phase-2 data import cannot overwrite, silently breaking at-rest
      decryption. Fix: `ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`.

  PATTERN 2 (WARN): `INSERT INTO <t> (...) … SELECT …`. If a NOT NULL target
      column maps from a nullable source, a fresh rebuild can 23502. Whether it
      actually fails depends on whether the source table is itself seeded, which
      can't be proven statically — so this is a human-review warning, not a hard
      fail.

Escape hatch: a line `-- migration-lint-ignore: pattern-N` anywhere in a file
suppresses that pattern for that file (use sparingly, with justification).

Exit status: non-zero if any PATTERN 1 or PATTERN 3 hit remains.
"""
import re
import sys

UUID = re.compile(
    r"'[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}'"
)
AUTH_USERS_GUARD = re.compile(
    r"EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+auth\.users", re.IGNORECASE
)
INSERT_STMT = re.compile(r"INSERT\s+INTO\s+(?:public\.)?[a-z_]+", re.IGNORECASE)
GEN_BYTES = re.compile(r"gen_random_bytes", re.IGNORECASE)
INTERNAL_SECRETS = re.compile(r"_internal_secrets", re.IGNORECASE)
DO_NOTHING = re.compile(r"ON\s+CONFLICT[^;]*DO\s+NOTHING", re.IGNORECASE | re.DOTALL)
INSERT_SELECT = re.compile(r"INSERT\s+INTO\s+[^;]*?\bSELECT\b", re.IGNORECASE | re.DOTALL)


def _ignored(sql, pattern):
    return re.search(rf"--\s*migration-lint-ignore:\s*pattern-{pattern}\b", sql, re.IGNORECASE)


def lint(path):
    fails, warns = [], []
    try:
        with open(path, "r", encoding="utf-8") as fh:
            sql = fh.read()
    except OSError as exc:
        return [f"{path}: cannot read ({exc})"], []

    guarded = bool(AUTH_USERS_GUARD.search(sql))

    if (
        not _ignored(sql, 1)
        and INSERT_STMT.search(sql)
        and UUID.search(sql)
        and not guarded
    ):
        fails.append(
            f"{path}: PATTERN-1 — INSERT with a hard-coded UUID and no "
            "`EXISTS (SELECT 1 FROM auth.users …)` guard; FK to auth.users will 23503 "
            "on a fresh rebuild. Rewrite as INSERT … SELECT … WHERE EXISTS(…)."
        )

    if (
        not _ignored(sql, 3)
        and GEN_BYTES.search(sql)
        and INTERNAL_SECRETS.search(sql)
        and DO_NOTHING.search(sql)
    ):
        fails.append(
            f"{path}: PATTERN-3 — gen_random_bytes seeded into _internal_secrets with "
            "ON CONFLICT DO NOTHING; a fresh rebuild mints a random key the data import "
            "cannot overwrite. Use ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value."
        )

    if not _ignored(sql, 2) and INSERT_SELECT.search(sql):
        warns.append(
            f"{path}: PATTERN-2 (warn) — INSERT … SELECT present; verify no NOT NULL target "
            "column maps from a nullable source (23502 on fresh rebuild). Guard the source "
            "or COALESCE to a non-null fallback."
        )

    return fails, warns


def main(argv):
    files = [a for a in argv[1:] if a.endswith(".sql")]
    all_fails, all_warns = [], []
    for path in files:
        fails, warns = lint(path)
        all_fails.extend(fails)
        all_warns.extend(warns)

    # GitHub Actions annotation format (::warning / ::error) surfaces inline on the PR.
    for w in all_warns:
        print(f"::warning ::{w}")
    for e in all_fails:
        print(f"::error ::{e}")

    if all_fails:
        print(f"\nMigration lint FAILED: {len(all_fails)} blocking issue(s) "
              f"across {len(files)} changed migration(s).")
        return 1
    print(f"Migration lint passed: {len(files)} changed migration(s) checked, "
          f"{len(all_warns)} warning(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
