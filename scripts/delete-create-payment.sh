#!/usr/bin/env bash
# B-ii-b housekeeping: delete the orphaned `create-payment` edge function from prod.
#
# VERIFIED 2026-07-26: `create-payment` is deployed on prod (xygzykjyynhzqytbqnzu) but has
# ZERO callers anywhere in the repo -- no frontend (src/**), no sibling edge function
# (supabase/**), no scripts, no local function directory. It is superseded by
# tenant-checkout-session / add-business-slot-checkout / (new) marketplace-checkout-session.
# Removing the deployed artifact closes an unused, un-referenced payment surface.
#
# The Supabase repo has no local create-payment/ dir, so CI (deploy-edge-functions.yml)
# will not touch it -- this one-shot Management API DELETE removes the deployed copy.
#
# Requires: SUPABASE_ACCESS_TOKEN (a personal/service access token with project access).
set -euo pipefail

PROJECT_REF="xygzykjyynhzqytbqnzu"
FUNCTION_SLUG="create-payment"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN is not set." >&2
  exit 1
fi

echo "Deleting edge function '${FUNCTION_SLUG}' from project ${PROJECT_REF}..."
HTTP_CODE=$(curl -sS -o /tmp/delete-create-payment-resp.json -w "%{http_code}" \
  -X DELETE "https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${FUNCTION_SLUG}" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")

cat /tmp/delete-create-payment-resp.json 2>/dev/null || true
echo
if [ "${HTTP_CODE}" = "200" ] || [ "${HTTP_CODE}" = "204" ]; then
  echo "OK: '${FUNCTION_SLUG}' deleted (HTTP ${HTTP_CODE})."
elif [ "${HTTP_CODE}" = "404" ]; then
  echo "Already gone: '${FUNCTION_SLUG}' not found (HTTP 404) -- nothing to do."
else
  echo "ERROR: unexpected HTTP ${HTTP_CODE} deleting '${FUNCTION_SLUG}'." >&2
  exit 1
fi
