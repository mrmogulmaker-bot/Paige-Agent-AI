# UI delivery evidence: replace-with-change-name

Copy this file to `docs/evidence/ui-delivery/<change-name>.md`. Replace every placeholder. CI rejects missing fields and placeholder status values; reviewers must still inspect the evidence.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: REPLACE_ME with a link or concise flow packet reference
PAIGE_UI_DESIGN: PASS: REPLACE_ME with the project-skill reading evidence
MATERIAL_FLOW_CHANGE: YES: REPLACE_ME with the changed goal, state, transition, exit, or consequence
FLOW_PROTOTYPE: PASS: REPLACE_ME with the artifact and owner-intent approval reference
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: REPLACE_ME with a concise statement or design brief link
VISUAL_DIRECTION: PASS: REPLACE_ME with the approved pack/tokens and rationale
AUTOMATED_EVIDENCE: PASS: REPLACE_ME with exact checks and results
STATIC_EVIDENCE: PASS: REPLACE_ME with lint, types, build, and contract inspection
RENDERED_EVIDENCE: PASS: REPLACE_ME with screenshot/recording paths, viewport, and theme
BEHAVIORAL_EVIDENCE: PASS: REPLACE_ME with browser drive, states, exits, and outcomes
AUTHENTICATED_RUNTIME: UNVERIFIED: REPLACE_ME with the exact reason and affected claims
KEYBOARD_FOCUS: PASS: REPLACE_ME with the keyboard route and focus observations
ZOOM_REFLOW: PASS: REPLACE_ME with the zoom/reflow level and result
REDUCED_MOTION: PASS: REPLACE_ME with the preference and observed behavior
STATE_COVERAGE: PASS: REPLACE_ME with applicable states and exits
TRUTHFUL_STATE_LABELS: PASS: REPLACE_ME with checked capability labels and contracts
SOLO_UI: NO: REPLACE_ME with why this is not a Solo interface
UNVERIFIED: REPLACE_ME with remaining behavior and reason, or state none with the completed proof boundary

For a non-material flow change, use `MATERIAL_FLOW_CHANGE: NO: reason` and `FLOW_PROTOTYPE: NOT_REQUIRED: reason`. Do not use `NOT_REQUIRED` merely because a prototype was inconvenient.

For Solo work, set `SOLO_UI: YES: affected canonical surface` and include all eight records:

SOLO_1536X770_PAIGE_CLOSED: PASS: artifact and observations
SOLO_1536X770_PAIGE_OPEN: PASS: artifact and observations
SOLO_1366X768_PAIGE_CLOSED: PASS: artifact and observations
SOLO_1366X768_PAIGE_OPEN: PASS: artifact and observations
SOLO_1024X768_PAIGE_CLOSED: PASS: artifact and observations
SOLO_1024X768_PAIGE_OPEN: PASS: artifact and observations
SOLO_900X1000_PAIGE_CLOSED: PASS: artifact and observations
SOLO_900X1000_PAIGE_OPEN: PASS: artifact and observations

## Scope and collisions

- Classification:
- Affected flows:
- Neighboring regressions:
- Active-owner/file collisions:
- Explicit exclusions:

## User job and state map

Record purpose, audience, primary action, visual direction, complete states, exits, side effects, and the intended scroll owner.

## Evidence index

List exact artifacts, commands, routes, tenant contexts, roles, themes, timestamps, and results. Redact secrets and customer-sensitive data.

## Review and limitations

Record independent review findings, fixes, remaining limitations, and every `UNVERIFIED` item.
