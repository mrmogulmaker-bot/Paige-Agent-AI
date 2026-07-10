#!/usr/bin/env bash
# Deploy a Supabase edge function via the Management API (Lovable-free, CLI-free).
#
# Why this exists: the Supabase CLI's HTTP client bypasses this environment's
# egress proxy (TransportError), and Lovable was removed from the deploy path.
# curl honors the proxy and reads files straight from disk (exact bytes), so this
# is the reliable way to ship an edge function — including large multi-file ones.
#
# Usage:  SUPABASE_ACCESS_TOKEN=sbp_xxx ./scripts/deploy-function.sh <function-slug> [--no-verify-jwt]
# Example: SUPABASE_ACCESS_TOKEN=sbp_xxx ./scripts/deploy-function.sh paige-ai-chat
#
# It auto-discovers the function's transitive local (_shared) dependencies from
# its index.ts imports and uploads them all with correct relative paths.
set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-xygzykjyynhzqytbqnzu}"
SLUG="${1:?usage: deploy-function.sh <slug> [--no-verify-jwt]}"
VERIFY_JWT=true
[[ "${2:-}" == "--no-verify-jwt" ]] && VERIFY_JWT=false

: "${SUPABASE_ACCESS_TOKEN:?set SUPABASE_ACCESS_TOKEN (supabase.com/dashboard/account/tokens)}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ENTRY="supabase/functions/${SLUG}/index.ts"
[[ -f "$ENTRY" ]] || { echo "no entrypoint at $ENTRY" >&2; exit 1; }

# Collect the entrypoint + its transitive relative deps (repo-relative paths).
mapfile -t FILES < <(python3 - "$ENTRY" <<'PY'
import os, re, sys
seen=[]
def walk(p):
    p=os.path.normpath(p)
    if p in seen or not os.path.exists(p): return
    seen.append(p)
    for m in re.finditer(r'from\s+"([^"]+)"', open(p).read()):
        imp=m.group(1)
        if imp.startswith('.'):
            walk(os.path.join(os.path.dirname(p), imp))
walk(sys.argv[1])
print("\n".join(seen))
PY
)

echo "Deploying '${SLUG}' (${#FILES[@]} files, verify_jwt=${VERIFY_JWT}):"
FORM=(-F "metadata={\"entrypoint_path\":\"${ENTRY}\",\"name\":\"${SLUG}\",\"verify_jwt\":${VERIFY_JWT}};type=application/json")
for f in "${FILES[@]}"; do
  echo "  + $f"
  FORM+=(-F "file=@${f};filename=${f};type=application/typescript")
done

curl -sS -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/deploy?slug=${SLUG}" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  --max-time 240 "${FORM[@]}" \
  -w "\nHTTP_STATUS:%{http_code}\n"
