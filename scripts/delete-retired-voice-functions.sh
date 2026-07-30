#!/usr/bin/env bash
# §49 Wave A #170 housekeeping: delete the retired ElevenLabs Convai edge functions from prod.
#
# VERIFIED 2026-07-30: after #170 rips the dead ElevenLabs Convai voice-chat stub, these five
# functions have ZERO callers anywhere in the repo -- no frontend (src/**), no sibling edge
# function (supabase/**), no scripts, no local function directory. Their source dirs and
# config.toml entries are gone in this PR, but a directory-delete does NOT un-deploy: CI
# (deploy-edge-functions.yml) only enumerates directories that still exist and runs
# `supabase functions deploy`, so a function whose local dir is gone stays LIVE on prod
# (same mechanism documented in scripts/delete-create-payment.sh). This one-shot Management
# API DELETE removes the deployed copies so no ElevenLabs-branded endpoint lingers (§45).
#
# Requires: SUPABASE_ACCESS_TOKEN (a personal/service access token with project access) --
# the same repo secret CI uses. Run once from an authorized environment; it is idempotent
# (a 404 for an already-removed function is treated as success).

set -euo pipefail

PROJECT_REF="xygzykjyynhzqytbqnzu"
FUNCTION_SLUGS=(
  "paige-voice-chat"
  "paige-voice-greeting"
  "paige-voice-summary"
  "elevenlabs-conversation-token"
  "elevenlabs-signed-url"
)

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "ERROR: SUPABASE_ACCESS_TOKEN is not set." >&2
  exit 1
fi

fail=0
for SLUG in "${FUNCTION_SLUGS[@]}"; do
  echo "Deleting edge function '${SLUG}' from project ${PROJECT_REF}..."
  HTTP_CODE=$(curl -sS -o "/tmp/delete-${SLUG}-resp.json" -w "%{http_code}" \
    -X DELETE "https://api.supabase.com/v1/projects/${PROJECT_REF}/functions/${SLUG}" \
    -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}")
  cat "/tmp/delete-${SLUG}-resp.json" 2>/dev/null || true
  echo
  if [ "${HTTP_CODE}" = "200" ] || [ "${HTTP_CODE}" = "204" ]; then
    echo "OK: '${SLUG}' deleted (HTTP ${HTTP_CODE})."
  elif [ "${HTTP_CODE}" = "404" ]; then
    echo "Already gone: '${SLUG}' not found (HTTP 404) -- nothing to do."
  else
    echo "ERROR: unexpected HTTP ${HTTP_CODE} deleting '${SLUG}'." >&2
    fail=1
  fi
done

exit "${fail}"
