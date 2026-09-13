# UI delivery evidence: web_fetch hardened tenant-safe routing

Declared via a `Visible-Flow-Impact: yes` commit trailer because this edge-function change turns the
client-portal `web_fetch` tool from inert to functional — a client-facing behavioral change — even
though it adds NO visual surface. Honest boundary (updated 2026-09-13): the authenticated-runtime
paste-link→fenced-answer path is now **owner-proven LIVE on the operator/tenant-owner seat** (see
AUTHENTICATED_RUNTIME); the narrower **client-portal-seat** live-drive remains PROOF OWED (the owner
drove his own operator/tenant-owner account, not a client-portal account).

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: §69 pre-edit frame in PR #1227 (mode/depth/affected-flow/crew/failing-first plan); actor=any Paige seat incl. client, goal="read a public URL and answer from it"
PAIGE_UI_DESIGN: PASS: paige-ui-design router read; §00 confirms no visual direction to port — a backend tool made functional adds no surface/pack/tokens, so there is no visual delivery to design
MATERIAL_FLOW_CHANGE: NO: the chat interface — its surfaces, states, transitions, and exits — is unchanged; the change is backend (an advertised tool now executes), conversational, with no new or altered visual state to prototype
FLOW_PROTOTYPE: NOT_REQUIRED: no visual surface or interface-flow change to prototype (a backend tool made functional); not a convenience skip
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: audience = all authenticated Paige seats incl. the client portal; primary action = the model fetches a public URL the user referenced and answers from it; purpose = make the advertised-but-inert web_fetch work, SSRF-hardened and injection-fenced
VISUAL_DIRECTION: NOT_APPLICABLE: no visual surface changed; no pack, tokens, layout, or motion involved (backend edge seam)
AUTOMATED_EVIDENCE: PASS: scripts/web-fetch-hardening-smoke.mjs 29/29 (SSRF refusals incl. DNS→loopback, anti-vacuity vs the old regex, safeFetch redirect-refusal + bounded read, the injection fence, handler tool-result shape) now a CI gate (Node-22 job); paige-ai-chat/__checks__ 22/22; client-memory-authz 268 pass + knowledge-scope 351 pass (1 pre-existing baseline each, identical on clean main)
STATIC_EVIDENCE: PASS: deno check owed to CI (no local Deno); __checks__ imports the real index.ts + scope-probe clean; git diff --check clean; YAML validated (two CI jobs)
RENDERED_EVIDENCE: NOT_APPLICABLE: no visual surface is rendered; this is a backend edge seam with no component/screen
BEHAVIORAL_EVIDENCE: PASS: headless behavioral proof of the real guard + fence modules and the handler transform via scripts/web-fetch-hardening-smoke.mjs — success (fenced + provenance), SSRF refusal, upstream-status failure, unsupported content-type, no-URL, turn-budget-exhausted, malformed-args; the authenticated browser drive is under AUTHENTICATED_RUNTIME
AUTHENTICATED_RUNTIME: PASS: owner-observed authenticated live proof on the owner's own active Paige session (operator/tenant-owner seat), 2026-09-13 — input https://www.mogulmakeracademy.com/; Paige fetched the real public page and summarized specific content (site thesis, four service pathways, proof points, testimonials), then returned a relevant follow-up rather than claiming an unsupported action; no private/loopback access, no redirect issue, no fabricated success, no injection-driven behavior observed. This proves the authenticated-runtime paste-link→fenced-answer path end to end for an operator/tenant-owner seat. NOT overstated to the client-portal seat: the owner drove his own account, not a client-portal account, so the narrower client-portal-seat live-drive remains owed (see UNVERIFIED).
KEYBOARD_FOCUS: NOT_APPLICABLE: no interactive visual surface changed (backend tool)
ZOOM_REFLOW: NOT_APPLICABLE: no visual surface changed
REDUCED_MOTION: NOT_APPLICABLE: no motion added or changed
STATE_COVERAGE: PASS: the tool-result states are covered headless — success, SSRF refusal, upstream failure, unsupported content-type, no-URL, turn-budget-exhausted, malformed args — each an honest result, never a fabricated page
TRUTHFUL_STATE_LABELS: PASS: every web_fetch result carries an honest success flag and a stable machine reason; a refusal returns no page content; the truncated flag reflects the real byte/char cap; web_fetch stays declared and non-confirm (§58)
SOLO_UI: NO: not a Solo operator interface; a shared backend chat tool for all seats; no src/solo, tenant-shell, growth, or public UI path changed
UNVERIFIED: the authenticated CLIENT-PORTAL-seat web_fetch live-drive (§32.c/§70) — a client-portal user pastes a URL on the live platform and Paige answers from the fenced fetched content — remains owed; the operator/tenant-owner seat is now owner-proven LIVE (see AUTHENTICATED_RUNTIME, 2026-09-13), but the client-portal seat carries the `CLIENT_SEAT_ALLOW` gating + client-scoped resolution as a distinct path and was not the seat the owner drove. All headless behavior is proven; the operator-seat live path is owner-proven; only the client-portal-seat live-drive is outstanding.

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: f3acc3e02bd73f503ae7d6af681f95a57912af64; deployment=none-pre-merge; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(edge-deploy-on-merge-paige-ai-chat-and-fetch-url-content); evidence=PR-1227-and-scripts/web-fetch-hardening-smoke.mjs
RELEASE_CHANNEL: development: docs + code on PR #1227 branch; the edge functions deploy to production on merge via deploy-edge-functions
RELEASE_CLASSIFICATION: internal-only: a backend capability/hardening; the client already saw the advertised tool; no owner-decided customer release
CUSTOMER_RELEASE_IDENTITY: none: internal capability/hardening, no owner-decided customer release
RELEASE_NOTE_REQUIRED: NO: internal correctness/capability hardening with no customer-visible surface change (the tool was already advertised to clients)
RELEASE_TRUTH_BOUNDARY: PARTIAL: web_fetch is functional + SSRF-hardened + injection-fenced, edge-deployed on prod (edge-live=1a5d8020, zero drift), and now owner-proven LIVE on the operator/tenant-owner seat (2026-09-13: real public URL fetched + summarized, no SSRF/redirect/fake-success/injection); the narrower authenticated CLIENT-PORTAL-seat live-drive remains PROOF OWED
RELEASE_RECOVERY: position=revert PR #1227 — the handler returns to inert and fetch-url-content's guard to the prior regex; reference=git revert of the PR merge commit on branch claude/paige-cowork-handoff-rpf6dw

## Scope and collisions

- Classification: backend edge-function change with a declared visible-flow impact; no UI source file changed.
- Affected flows: a Paige seat (incl. client portal) asks Paige to read a public URL; Paige fetches it (SSRF-guarded), fences the content, answers.
- Neighboring regressions: none — fetch-url-content's response contract (`{success,url,content}`) is preserved for the auto-fetch path and paige-deep-research (§37 inventory complete).
- Active-owner/file collisions: none — #576 (the prior index.ts slice) merged; #1221 (docs) merged; this PR owns the current index.ts changes.
- Explicit exclusions: the authenticated client-seat live-drive (PROOF OWED); the kb-ingest-url SSRF fork migration (tracked §18 follow-up).

## User job and state map

Purpose: a user (or client) references a public URL in chat and Paige reads it and answers from it.
Audience: all authenticated Paige seats, including the client portal (owner ruled do-NOT-retire; build for the client). Primary action: `web_fetch` routes to the hardened `fetch-url-content` (safeFetch: public HTTPS only, no private/redirecting/credentialed targets, bounded time+bytes), the fetched page body is fenced (`RETRIEVED_KNOWLEDGE_UNTRUSTED_NOTICE` + `sanitizeUntrustedText`) before re-entering the model, and the result carries provenance `{url,title,fetched_at,truncated}`. No visual surface. States: success / SSRF-refusal / upstream-failure / unsupported-content-type / no-URL / turn-budget-exhausted / malformed-args — all honest, never a fabricated page. No scroll owner (no UI).

## Evidence index

- `node scripts/web-fetch-hardening-smoke.mjs` (via `npm run smoke:web-fetch-hardening`, Node ≥22.7) → 29 passed, 0 failed.
- `paige-ai-chat/__checks__/runtime-correctness-check.mjs` → 22 passed, 0 failed (imports the real index.ts).
- `npm run test:client-memory-authz` → 268 pass (1 pre-existing baseline fail); `npm run test:knowledge-scope` → 351 pass (1 pre-existing baseline fail).
- §39 adversarial peer: SOUND (no P1/P2); §5 compliance: SHIP. Findings folded in PR #1227.
- Redacted: no secrets or customer data in this record.

## Review and limitations

§39 peer-gate (no P1/P2 — SSRF guard fires unconditionally incl. the service-role path; no identity from tool args; content always fenced; contract preserved) and §5 compliance (SHIP; mutation-tested the smoke as non-vacuous) reviewed the committed diff; their P3s were folded (failure-branch reason/error fenced; fetch-url-content 500 contract cosmetics; the smoke wired into a Node-22 CI job; turn-budget bound on each fetch). Limitation (updated 2026-09-13): the operator/tenant-owner seat is now owner-proven LIVE (owner-observed on his own active Paige session — input https://www.mogulmakeracademy.com/, correct public-content summary, honest follow-up, no SSRF/redirect/fake-success/injection); the one outstanding proof is the narrower authenticated CLIENT-PORTAL-seat live-drive (UNVERIFIED above), not overstated because the owner drove his own account, not a client-portal account. Known design limitation (disclosed, not a regression): safeFetch refuses redirects, so a client pasting a link-shortener / www-canonicalizing URL gets an honest refusal — the canonical SSRF posture; a bounded single re-validated hop is a future owner/product call.
