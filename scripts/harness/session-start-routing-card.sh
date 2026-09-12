#!/bin/bash
# Paige Harness — advisory session-start routing card (§69 / §00 / §BRAIN).
#
# WHAT THIS IS: an OPTIONAL, local convenience. When wired as a Claude Code SessionStart
# hook, its stdout is surfaced as context so an agent is reminded which skills and records
# apply BEFORE it edits. It is SAFE BY CONSTRUCTION — it only prints guidance and always
# exits 0. It never installs, mutates, blocks, or fails a session, and it enforces NOTHING.
#
# WHAT THIS IS NOT: the enforcement. The binding routing lives in committed surfaces that
# already reach every session — AGENTS.md (mandatory routing), CLAUDE.md §69/§00/§BRAIN
# (auto-loaded project instructions), and the versioned .claude/skills/ + .agents/skills/.
# This card only re-states, in one screen, what those already require.
#
# WHY IT IS NOT AUTO-WIRED REPO-WIDE: the repo .gitignore deliberately treats
# .claude/settings.json and .claude/hooks/ as local session state that is NEVER committed
# (see .gitignore and its §64 note). A committed, repo-wide SessionStart hook would reverse
# that documented decision, which is an owner call — not this script's to force. So the hook
# ships here, versioned and runnable, and each operator opts in locally.
#
# HOW TO ENABLE IT LOCALLY (per operator, not committed): add to your own
# .claude/settings.json (which stays gitignored):
#   {
#     "hooks": {
#       "SessionStart": [
#         { "hooks": [ { "type": "command",
#           "command": "$CLAUDE_PROJECT_DIR/scripts/harness/session-start-routing-card.sh" } ] }
#       ]
#     }
#   }
# See .claude/skills/README.md → "Optional: the local session-start routing card".
cat <<'CARD'
── PAIGE HARNESS · routing (advisory — read before editing) ───────────────────
1. Software task?  → Flow-by-Flow skill first; return the pre-edit frame (§69).
2. Visible interface?  → paige-ui-design skill → its FIVE composable modules:
   owner-intent-fidelity · visual-immersive-quality · interaction-geometry-accessibility ·
   protected-behavior-regression · release-acceptance-evidence
   (canonical standard: docs/doctrine/paige-ui-delivery-standard.md).
3. New or materially-changed flow?  → flow-prototype skill before production UI.
4. Every UI PR adds docs/evidence/ui-delivery/<change>.md (TEMPLATE.md). A backend / RPC /
   edge / entitlement / provider change that alters a visible flow: add a
   `Visible-Flow-Impact: yes` commit trailer so CI routes it to the same evidence gate.
5. Read the Second Brain first — docs/brain/README.md; answer "do we have X?" from the
   record, not memory (§BRAIN).
6. Ground in docs/PAIGE-MASTER-PROJECT-REFERENCE.md §4 (SHIPPED) before substantive work (§0).
This card is an advisory reminder. It blocks nothing and decides nothing.
───────────────────────────────────────────────────────────────────────────────
CARD
exit 0
