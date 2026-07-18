#!/usr/bin/env python3
"""
edge-affected.py — given a list of changed files (repo-relative paths, one per
line on stdin), print the set of Supabase edge FUNCTIONS whose deployed bundle
would change, so CI redeploys exactly those and nothing more.

Why this exists: an edge function's bundle is its own directory PLUS every
relative import it pulls in, including files under supabase/functions/_shared/
and the chains between them (model-router.ts imports claude.ts, growth-forms.ts
imports growth-blocks.ts, …). A change to one _shared file therefore affects
every function that transitively imports it — not just the file that changed.
This is the exact dependency chain that, when missed, ships a function running
stale shared code. We resolve it here so the deploy is correct, not guessed.

Contract:
  stdin  — changed repo-relative paths (e.g. "supabase/functions/_shared/claude.ts")
  stdout — affected function names (directory names under supabase/functions/,
           excluding _shared), one per line, sorted, deduped.
  Exit 0 always (an empty result is a valid "nothing to deploy").

Only relative imports (specifiers starting with ".") are followed; remote
(https:, npm:, jsr:, node:) imports are external and never part of the bundle.
"""
import os
import re
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FUNCTIONS_DIR = os.path.join(REPO_ROOT, "supabase", "functions")

# `import ... from "<spec>"`, `export ... from "<spec>"`, and dynamic `import("<spec>")`.
IMPORT_RE = re.compile(
    r"""(?:from|import)\s*\(?\s*["']([^"']+)["']""",
)


def rel(path: str) -> str:
    """Absolute path -> repo-relative, forward slashes."""
    return os.path.relpath(path, REPO_ROOT).replace(os.sep, "/")


def resolve_specifier(importer_abs: str, spec: str) -> str | None:
    """Resolve a relative import specifier to an existing .ts file (absolute path)."""
    if not spec.startswith("."):
        return None  # remote / bare specifier — not part of the bundle
    base = os.path.normpath(os.path.join(os.path.dirname(importer_abs), spec))
    candidates = [base]
    if not base.endswith(".ts"):
        candidates += [base + ".ts", os.path.join(base, "index.ts")]
    for c in candidates:
        if os.path.isfile(c):
            return os.path.abspath(c)
    return None


def imports_of(file_abs: str, _cache: dict) -> list[str]:
    """Resolved absolute paths this .ts file imports (relative imports only)."""
    if file_abs in _cache:
        return _cache[file_abs]
    out: list[str] = []
    try:
        with open(file_abs, "r", encoding="utf-8") as fh:
            src = fh.read()
    except (OSError, UnicodeDecodeError):
        _cache[file_abs] = out
        return out
    for spec in IMPORT_RE.findall(src):
        resolved = resolve_specifier(file_abs, spec)
        if resolved:
            out.append(resolved)
    _cache[file_abs] = out
    return out


def bundle_closure(entry_files: list[str], import_cache: dict) -> set[str]:
    """All files reachable from a function's own files via relative imports."""
    seen: set[str] = set()
    stack = list(entry_files)
    while stack:
        f = stack.pop()
        if f in seen:
            continue
        seen.add(f)
        stack.extend(imports_of(f, import_cache))
    return seen


def function_dirs() -> list[str]:
    """Deployable function directories (children of functions/, excluding _shared)."""
    if not os.path.isdir(FUNCTIONS_DIR):
        return []
    out = []
    for name in os.listdir(FUNCTIONS_DIR):
        if name == "_shared" or name.startswith("_") or name.startswith("."):
            continue
        d = os.path.join(FUNCTIONS_DIR, name)
        if os.path.isdir(d):
            out.append(name)
    return out


def ts_files_under(dir_abs: str) -> list[str]:
    out = []
    for root, _dirs, files in os.walk(dir_abs):
        for fn in files:
            if fn.endswith(".ts"):
                out.append(os.path.abspath(os.path.join(root, fn)))
    return out


def main() -> int:
    changed = {
        line.strip().replace("\\", "/")
        for line in sys.stdin
        if line.strip()
    }
    if not changed:
        return 0

    changed_abs = {os.path.abspath(os.path.join(REPO_ROOT, p)) for p in changed}
    import_cache: dict = {}
    affected: set[str] = set()

    for fn in function_dirs():
        dir_abs = os.path.join(FUNCTIONS_DIR, fn)
        prefix = rel(dir_abs) + "/"

        # (a) any change directly inside the function's own directory
        if any(p.startswith(prefix) for p in changed):
            affected.add(fn)
            continue

        # (b) any changed file that lands inside the function's import closure
        #     (covers _shared/* changes, transitively)
        closure = bundle_closure(ts_files_under(dir_abs), import_cache)
        if closure & changed_abs:
            affected.add(fn)

    for fn in sorted(affected):
        print(fn)
    return 0


if __name__ == "__main__":
    sys.exit(main())
