# Publishing spine (#178) — architecture + build plan

The ONE canonical publishing spine every Vibe Studio artifact type (page · funnel ·
form · image) resolves through. Owner directive (§31): full-scale, backend + frontend +
an owner-visible publish button, "completely done, start to finish." Owner decisions
(2026-08-01): **full spine + Vercel custom-domain attachment**; **keep the uniform
`/p/<slug>/<ref>` URL grammar** on custom domains (no second grammar).

Grounded by a §1 research/design crew (publish-flow cartographer · domain-spine analyst ·
§9 threat-modeler · resolver architect). This doc is the resumable spec so no slice re-
discovers the codebase.

## Behaviors (owner)
1. Tenant's Paige-provided default domain `<slug>.paigeagent.ai` is the fallback.
2. A **verified** custom web domain wins when the tenant activates one.
3. The SAME resolver logic across every artifact type (§18 — one home, never forked).
4. Interchangeable: setting up a custom domain keeps publishing working through it, with
   **zero republish** (host resolved at read time, never baked into the artifact row).

## Slice 1 — backend spine ✅ SHIPPED (commit 4c1a557, migration 20260801180000)
- `tenant_web_domains` registry (distinct from `tenant_email_domains`; web proof ≠ email
  proof). Platform-minted DNS-TXT token, `pending→verified` lifecycle, RLS mirrors the
  email registry. **§9 fix:** a VERIFIED host is globally unique to one tenant (partial
  unique index `uq_tenant_web_domains_verified_host`).
- `resolve_publish_target(p_artifact_type, p_artifact_ref, p_tenant_id DEFAULT NULL)` —
  the ONE resolver. Server-derived tenant (JWT → `current_user_tenant_id()`; only
  service-role may pass `p_tenant_id`). Verified+default custom host wins else
  `<slug>.paigeagent.ai`. Returns `(tenant_id, tenant_slug, host, path, canonical_url,
  is_custom_domain, is_external_asset)`. Image = storage-URL passthrough (`is_external_asset`).
- `web_domain_claim(host)` / `web_domain_mark_verified(host, observed_token)` — SECURITY
  DEFINER, JWT-derived tenant, admin-gated. Reject the platform wildcard; re-claim re-mints.
- `resolve_tenant_web_host` reserved-label drift fix (added `operator/dashboard/setup`) +
  `hostRouting.test.ts` SQL↔TS parity guard.
- §32: full migration + 7 resolver assertions proven in `BEGIN..ROLLBACK` against prod.

## Slice 2 — §9 hardening + web-ownership verification + Vercel attach ✅ SHIPPED (commit a49f4ed)
- **Live IDOR closed:** `deriveCallerTenant` (`_shared/tenant-domain-scope.ts`) server-derives the
  tenant; non-owner forging `body.tenant_id` → 403 + logged; every email by-id op tenant-scoped.
- **Web verbs:** `web_list/web_add/web_verify/web_set_default/web_remove`. `web_add`/`web_verify`
  call the SECURITY DEFINER RPCs with the USER's JWT (tenant re-derived there). `web_verify` does
  the DNS-TXT `_paige-verify.<host>` challenge (loud-log + fail-closed), surfaces 23505 as
  `host_claimed_by_other_workspace`, then Vercel-attaches on genuine verification (env-gated
  `VERCEL_API_TOKEN`/`VERCEL_PROJECT_ID`/`VERCEL_TEAM_ID`; honest degrade to attach-pending).
- **§32:** headless forged-attack smoke `scripts/tenant-domain-scope-smoke.mts` (7/7) proves each
  cross-tenant attempt is refused. **§37:** the only producer, `EmailDomainsPanel`, still passes
  (operates on the caller's active tenant == the derived tenant).
- **Owed:** the live DNS-TXT → verify → Vercel-attach end-to-end (needs a real domain + JWT +
  the Vercel env secrets set) — owed to a capable/Cowork session; smoke covers the decision logic.
- **Env to set for live Vercel attach:** `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID` (+ optional
  `VERCEL_TEAM_ID`) as Supabase edge-function secrets. Registrar DNS: the tenant points their host
  at the Vercel target (CNAME to `cname.vercel-dns.com` or the project's assigned target).

## Slice 2 (original plan, for reference) — §9 hardening + web-ownership verification + Vercel attach
**A live vulnerability to fix first** (`supabase/functions/manage-tenant-domain/index.ts`):
- L60-62: STOP reading `body.tenant_id` for non-owner callers. Pin every admin to
  `current_user_tenant_id()`; allow an explicit target tenant ONLY in the
  `is_platform_owner()` branch. (Today any global-`admin` role can bind/remove a domain
  for a VICTIM tenant.)
- refresh (L109-123), set_default (L128-131), remove (L135-141): resolve the row by
  `body.id` with NO tenant predicate → cross-tenant destructive IDOR. Route writes
  through SECURITY DEFINER RPCs that re-derive tenant from the JWT (or minimally add
  `.eq('tenant_id', tenantId)` to every SELECT/UPDATE/DELETE). The service client at L42
  bypasses RLS, so the RLS re-pin never runs — that's why the fix must be explicit.
- **§37 producer inventory:** the ONLY frontend caller is `EmailDomainsPanel.tsx:38`
  (verbs list/add/refresh/set_default/remove) via `EmailIntegrationConfig.tsx:7`. After
  the tenant-derivation fix it operates on the caller's active tenant (== current), so its
  verbs still pass. No pg_cron/pg_net/Actions/n8n/MCP caller. Owner cross-tenant use (if
  any) must move to the `is_platform_owner` branch.

**New web verbs** (same edge fn): `web_add` (calls `web_domain_claim`, returns the TXT
challenge), `web_verify` (the ONLY network step — `Deno.resolveDns('_paige-verify.'||host,
'TXT')` OR HTTPS GET `https://<host>/.well-known/paige-domain-challenge/<token>`, then
`web_domain_mark_verified`; a 23505 → surface "host already claimed by another
workspace"), `web_set_default`, `web_remove`, `web_list` — all tenant-scoped by the RPC's
derivation. Every crash-prone DNS/HTTP call wrapped to log loudly + fail closed (status
unchanged), never silent (§32).

**Vercel attach** (owner chose full attach): on `web_verify` success, attach `<host>` to
the Vercel project via the Vercel API and store `vercel_domain_id`. Wildcard/registrar DNS
(the CNAME/A target the tenant must point at) is documented in the panel + this doc; the
platform confirms attachment, the tenant owns their registrar record.

## Slice 3 — Studio wiring (the owner-visible publish button)
Publish is FORKED per type today; make every path emit resolver URLs:
- `growth_page_publish` (migration `20260713140004_...:~147`) + `growth_funnel_publish`
  (`20260714091000_...:~448`): replace the inline `'/p/'||slug||'/'||slug` /
  `'/f/'...` string-build with a call to `resolve_publish_target(_tenant, 'page'|'funnel',
  _row.slug)` and return its `canonical_url` as `row.url`. Store only slug (no baked host).
- `studio.ts`: add `resolvePublishTarget(tenantId, type, ref)`; `publishPage` (L1217),
  `publishFunnel` (L1926), `publishFunnelCascade` (L2183, reuses publishPage → free).
  `saveForm` (L1656) additionally returns the form's `canonical_url` so it surfaces in-session.
- **§37 lockstep (critical):** `PublishDialog.tsx:89-91` concatenates
  `window.location.origin + publishedUrl`. Once `url` becomes absolute this emits
  `origin+https://...` garbage — MUST change in the SAME slice (display/copy `row.url`
  verbatim). Also drop the hand-built `/p/${tenantSlug}/${slug}` preview at L172; add a
  "Publishing to `<host>`" line reading `is_custom_domain`; de-page-specific the copy.
- `FunnelFlow.tsx:56-65` render the absolute `canonical_url` (stop relying on current
  origin). `GrowthHub.tsx` L262/267/330/334 replace the five hand-built strings.
  `ProjectNavigator` rail shows each artifact's resolver link (name-based, §21).

## Slice 4 — `WebDomainsPanel` settings surface + taste pass
Mirror `EmailDomainsPanel`: claim host → show DNS-TXT challenge → verify → set-default →
show attachment/serve status. Wire alongside `EmailIntegrationConfig` (or a `DomainsConfig`
host). Built on the `@/components/ui/page` primitive layer (§11); §25 design-critic +
compliance pass; never touch an approved-frozen surface (§28).

## §32 verification owed
- Headless smoke of the resolver logic: SHIPPED (rollback-tx assertions, Slice 1).
- Slice 2/3 edge + RPC: headless smoke the DNS-challenge + resolver-URL emission; edge
  auto-deploys on merge (`deploy-edge-functions.yml`) → prove `edge-live` advanced + zero
  drift.
- **Live end-to-end (owed to a capable/Cowork session):** tenant publishes a page in
  Studio → renders at `<slug>.paigeagent.ai` → activates + verifies a custom domain → the
  SAME page renders at the custom domain with no republish. Auth-gated; headless can't drive.

## Not in scope / parked
- §49 Wave C #167 (voice picker) — owner-directed, do NOT unpark here.
