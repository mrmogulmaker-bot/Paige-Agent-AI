# UI delivery evidence: kb-ingest-url SSRF fork → canonical assertPublicHttpUrl

Declared via a `Visible-Flow-Impact: yes` commit trailer because this edge-function change alters a
client-reachable flow (a tenant admin's "Add from link" KB ingest) — it adds NO visual surface, and
the legitimate happy path is unchanged, but a URL that resolves to a private address (an SSRF attack
or misconfiguration) now returns an honest refusal instead of being fetched server-side. Honest
boundary: the authenticated live-drive on the platform is PROOF OWED (no browser-capable session /
authorized test tenant here); the guard is the SAME canonical `assertPublicHttpUrl` already running
in production via `fetch-url-content` (#1227), and all guard behavior is proven headless.

UI_DELIVERY_EVIDENCE_VERSION: 1
FLOW_BY_FLOW: PASS: §69 pre-edit frame stated in the session (mode Bug/Repair — security; depth Deep, R3 SSRF surface; actor = an authenticated tenant admin/coach ingesting a public URL into their KB; goal preserved, attack URLs now refused; crew = integrator + §39 adversarial peer + §5 compliance on the committed diff; failing-first = the headless smoke reproduces the old regex bypass then proves the canonical guard refuses it)
PAIGE_UI_DESIGN: PASS: paige-ui-design router read; §00 confirms no visual direction to port — swapping a backend SSRF guard adds no surface/pack/tokens, so there is no visual delivery to design
MATERIAL_FLOW_CHANGE: NO: the "Add from link" flow — its surfaces, states, transitions, exits, and legitimate happy path — is unchanged; the change is a backend security guard swap so a URL resolving to a private address gets an honest refusal instead of being fetched. No new or altered visual state to prototype
FLOW_PROTOTYPE: NOT_REQUIRED: no visual surface or interface-flow change to prototype (a backend SSRF guard swap); not a convenience skip
PURPOSE_AUDIENCE_PRIMARY_ACTION: PASS: audience = authenticated tenant admins/coaches using TenantKnowledgeAdmin's "Add from link"; primary action unchanged (paste a public URL → server fetches the page → strips to text → hands off to kb-ingest-doc); purpose = close the DNS-rebind / encoded-IP-literal SSRF gap the per-hostname regex could not see, by adopting the canonical `_shared/ssrfGuard.ts assertPublicHttpUrl` (§18 one home) per redirect hop
VISUAL_DIRECTION: NOT_APPLICABLE: no visual surface changed; no pack, tokens, layout, or motion involved (backend edge seam)
AUTOMATED_EVIDENCE: PASS: scripts/kb-ingest-url-ssrf-smoke.mjs 20/20 (the REAL imported assertPublicHttpUrl refuses DNS→private/DNS→RFC1918/non-https/embedded-creds/localhost/link-local/IPv4-mapped-IPv6 and admits a public host; kb's redirect loop re-validates every hop — 302→private refused with url_resolves_to_private_address, 302→another public URL still followed, direct public 200 returned; anti-vacuity: the old regex MISSED rebind.evil.test while the new guard refuses it; the SsrfError→response mapper returns honest 403/400 and never leaks the URL/address) — now a standing CI gate in the Node-22 job; scripts/web-fetch-hardening-smoke.mjs 29/29 unaffected
STATIC_EVIDENCE: PASS: deno check owed to CI (no local Deno); git diff --check clean; ci.yml + package.json validated (YAML + JSON parse); grep confirms no leftover references to the removed unsafeReason / BLOCKED_HOST_PATTERNS; the import matches the repo convention (`../_shared/ssrfGuard.ts`)
RENDERED_EVIDENCE: NOT_APPLICABLE: no visual surface is rendered; this is a backend edge seam with no component/screen
BEHAVIORAL_EVIDENCE: PASS: headless behavioral proof of the real guard + kb's per-hop redirect loop + the honest error mapper via scripts/kb-ingest-url-ssrf-smoke.mjs — DNS-rebind refused, private/link-local/encoded refused, non-https refused, embedded-creds refused, public admitted, redirect-to-private refused at the hop, redirect-to-public followed, direct-200 returned; the authenticated browser drive is under AUTHENTICATED_RUNTIME
AUTHENTICATED_RUNTIME: UNVERIFIED: the authenticated live-drive on the platform (a tenant admin pastes a public link → it indexes; and a URL resolving to a private address → an honest refusal) is owed to a browser-capable session / authorized test tenant unavailable to this headless session; it affects only the runtime confirmation — the guard is the same canonical assertPublicHttpUrl already live in prod via fetch-url-content, and its behavior is proven headless
KEYBOARD_FOCUS: NOT_APPLICABLE: no interactive visual surface changed (backend guard swap)
ZOOM_REFLOW: NOT_APPLICABLE: no visual surface changed
REDUCED_MOTION: NOT_APPLICABLE: no motion added or changed
STATE_COVERAGE: PASS: the ingest outcome states are covered headless — success (public URL fetched), SSRF refusal (private/rebind/encoded), non-https refusal, embedded-creds refusal, redirect-into-private refusal, redirect-to-public follow — each an honest result, never a fabricated or internal-target fetch
TRUTHFUL_STATE_LABELS: PASS: every refusal returns an honest error message + HTTP status (403 for a blocked/private/unresolvable target, 400 for invalid/non-https/credentialed), never a fabricated success and never the resolved private address; no capability label changed; the ingest request/response contract is unchanged (§37 producer TenantKnowledgeAdmin.tsx still works)
SOLO_UI: NO: not a Solo operator interface; a backend edge endpoint (kb-ingest-url) reached by the TenantKnowledgeAdmin admin surface for all authenticated tenant seats; no src/solo, tenant-shell, growth, or public UI path changed
UNVERIFIED: the authenticated live-drive of the "Add from link" ingest flow (legitimate public URL indexes; an attack URL is refused) on the live platform — owed to a browser-capable session / authorized test tenant unavailable to this headless session; all guard behavior is proven headless and the guard is the canonical one already in prod

<!-- RELEASE_GOVERNANCE_POLICY — read docs/doctrine/release-governance-and-customer-update-policy.md -->
INTERNAL_BUILD_IDENTITY: bfce51b5f00a7fc7b616b9fb8193d331194ea160; deployment=none-pre-merge; environment=development; migrations=NOT_APPLICABLE; edge=PROOF_OWED(edge-deploy-on-merge-kb-ingest-url via deploy-edge-functions); evidence=PR + scripts/kb-ingest-url-ssrf-smoke.mjs
RELEASE_CHANNEL: development: code on the PR branch; kb-ingest-url edge-deploys to production on merge via deploy-edge-functions
RELEASE_CLASSIFICATION: internal-only: a backend SSRF hardening (guard dedupe onto the canonical one-home primitive); no customer-visible surface change
CUSTOMER_RELEASE_IDENTITY: none: internal security hardening, no owner-decided customer release
RELEASE_NOTE_REQUIRED: NO: internal correctness/security hardening with no customer-visible surface change (the ingest flow's happy path is unchanged)
RELEASE_TRUTH_BOUNDARY: PARTIAL: the SSRF guard is upgraded to the canonical assertPublicHttpUrl, proven headless (20/20), and edge-deploys on merge; the authenticated live-drive of the ingest flow is PROOF OWED
RELEASE_RECOVERY: position=revert this PR — kb-ingest-url returns to the prior per-hostname regex guard; reference=git revert of the PR merge commit on branch claude/paige-cowork-handoff-rpf6dw

## Scope and collisions

- Classification: backend edge-function change with a declared visible-flow impact; no UI source file changed.
- Affected flows: a tenant admin adds a KB doc from a link (TenantKnowledgeAdmin "Add from link"); the happy path (public URL) is unchanged; a URL resolving to a private address is now refused honestly.
- Neighboring regressions: none — request contract (`{url,title,category,tags,share_to_network,tenant_id}`) and response contract (`{error}` / forwarded kb-ingest-doc success) preserved; redirect-following behavior (up to 5 hops) preserved, only the per-hop validation is upgraded (§37 inventory complete: the sole runtime producer is `src/pages/admin/TenantKnowledgeAdmin.tsx`; no edge/cron/MCP caller).
- Active-owner/file collisions: none — no open PR touches `supabase/functions/kb-ingest-url/index.ts` (verified against the open-PR list; PR #591 edits paige-ai-chat + knowledge-scope scripts, not this file; PR #1234 is the CRM command surface, unrelated).
- Explicit exclusions: the authenticated live-drive (PROOF OWED); the unbounded body-read on kb-ingest-url's own fetch (`res.text()` before the 200 KB slice) is a pre-existing, separate memory-bound concern NOT part of the SSRF-fork migration — noted, not changed here (§31 minimal scope).

## User job and state map

Purpose: a tenant admin ingests a public web page into their private Knowledge Base by URL. Audience: authenticated tenant admins/coaches. Primary action unchanged: paste a URL → kb-ingest-url fetches it server-side (now SSRF-guarded by the canonical `assertPublicHttpUrl` on the initial URL and every redirect hop) → strips to text → hands off to kb-ingest-doc (chunk + embed under the caller's tenant via RLS). States: success / SSRF-refusal (private/rebind/encoded/localhost/link-local) / non-https refusal / embedded-credentials refusal / redirect-into-private refusal / unsupported-content-type / no-readable-text — all honest, never a fabricated or internal-target fetch. No visual surface, no scroll owner.

## Evidence index

- `npm run smoke:kb-ingest-url-ssrf` (Node ≥ 22, `--experimental-transform-types`) → 20 passed, 0 failed.
- `npm run smoke:web-fetch-hardening` → 29 passed, 0 failed (the canonical guard this reuses is fully proven there, incl. DNS→loopback and anti-vacuity vs the identical old regex).
- deno check: owed to CI (no local Deno); the behavioral smoke imports the REAL `_shared/ssrfGuard.ts` and exercises it.
- §39 adversarial peer + §5 compliance: run on the committed diff (findings folded before merge).
- Redacted: no secrets or customer data in this record.

## Review and limitations

The change swaps kb-ingest-url's per-hostname regex blocklist (`BLOCKED_HOST_PATTERNS` / `unsafeReason`) — which matched only the hostname string and never resolved DNS — for the canonical `assertPublicHttpUrl` (resolves the host + validates every resolved IP numerically, https-only, no embedded credentials), called on the initial URL and re-validated on every redirect hop inside kb-ingest-url's existing manual redirect loop. This closes the DNS-rebind / encoded-IP-literal bypass while preserving redirect-following (no redirect-posture product decision — the canonical `safeFetch`'s refuse-redirects behavior is deliberately NOT adopted here, since KB ingest legitimately follows canonicalizing redirects; only the validation is shared). Limitation: the authenticated live-drive is the one outstanding proof (UNVERIFIED above). Separately tracked (not this slice): kb-ingest-url reads the response body with `res.text()` before the 200 KB content slice — an unbounded read that is a pre-existing memory-bound concern independent of the SSRF migration.
