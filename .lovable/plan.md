# Growth OS Phase 1 — Pages, Funnels, Forms

Build Paige's own **Pages & Funnels** engine (modeled after the two `vibepreview` BTF pages you shared), with the option for any tenant to use an **external builder** (Webflow / Framer / ClickFunnels / GHL / Vibe) and still pipe leads into Paige.

Then **map the two exact BTF pages** as the seeded Mogul Maker Academy funnel for the BUILD-to-FUND offer.

---

## 1. New navigation surface

Under the "More" menu in `AdminLayout.tsx`, add a **Growth** group:

- `/admin/growth/pages`     → Landing Pages (sales / VSL / about)
- `/admin/growth/funnels`   → Funnels (ordered step sequences)
- `/admin/growth/forms`     → Forms (questionnaires / intake / opt-ins)
- `/admin/growth/submissions` → Unified inbox of every form submission
- `/admin/growth/integrations` → External builders (Webflow, Framer, GHL, ClickFunnels, Typeform, custom webhook)

Communications stays as-is (sends + SMS + email logs). Growth is the **lead capture + conversion** layer that *feeds* Communications + Contacts + Pipeline.

---

## 2. Schema (multi-tenant, RLS-scoped)

```text
growth_pages              (id, tenant_id, slug, title, status, theme_json,
                            blocks_json, seo_json, og_image_url, published_at)
growth_funnels            (id, tenant_id, slug, name, status, goal,
                            entry_page_id, success_page_id)
growth_funnel_steps       (id, funnel_id, order_index, page_id, form_id,
                            step_type: page|form|payment|booking|thankyou)
growth_forms              (id, tenant_id, slug, name, schema_json,
                            success_action_json, notify_user_ids[],
                            auto_create_contact bool, auto_create_deal bool,
                            pipeline_id, stage_id)
growth_form_submissions   (id, form_id, tenant_id, contact_id,
                            payload_json, utm_json, referrer, ip, ua,
                            consent_json, created_at)
growth_external_sources   (id, tenant_id, provider, label, webhook_token,
                            field_map_json, last_seen_at)
```

All tables: `tenant_id` + RLS scoped via existing `current_user_tenant_id()` helper. `GRANT SELECT,INSERT,UPDATE,DELETE … TO authenticated; GRANT ALL … TO service_role`.

Public read on `growth_pages` only for `status='published'` (anon allowed) so the rendered page works without a session.

---

## 3. Renderers (public)

- `/p/:tenantSlug/:pageSlug` — server-rendered landing page from `blocks_json` (Hero, Bullets, Phase Cards, FAQ, Testimonial, CTA, EmbeddedForm).
- `/f/:tenantSlug/:funnelSlug/:stepIndex?` — funnel runner that steps through pages/forms in order, persists `funnel_session_id` cookie, fires UTM + analytics events.
- `/form/:formId` — standalone hosted form (white-labeled per tenant theme).

Block library mirrors the two reference pages: **Hero with overlay**, **Pull quote**, **Phase card row**, **Everything-inside grid**, **Apply CTA**, **3-step progress form**, **Field sections** (Personal / Business / Funding Profile).

---

## 4. Form builder

Two creation paths, no rebuilds in between:

1. **Template library** — seed with: BTF Application (3-step), Discovery Call Intake, Lead Magnet Opt-in, Coach Application, Affiliate Application, Funding Pre-Qual.
2. **Paige-generated** — admin types "Build me a 2-step intake for SaaS founders applying for an MCA" → Paige writes `schema_json` via the AI Gateway → admin reviews → saves.

Schema is a thin JSON spec (sections → fields with `type | label | required | options | validation | maps_to`). `maps_to` lets a field auto-write to `contacts.email`, `businesses.legal_name`, `clients.fico_score`, etc. — same ingestion guardrails as `paige_ingestion_proposals` for sensitive fields (SSN, FICO).

Submissions flow:
`submit → growth_form_submissions → upsert contact → optional create deal in pipeline → fire notifications → trigger workflow (paige_workflow_registry) if mapped`.

---

## 5. External builder bridge

For tenants that prefer Webflow / Framer / ClickFunnels / GHL / Typeform / Vibe / custom HTML:

- One-click create an `growth_external_sources` row → generates a signed webhook URL `https://…/functions/v1/growth-inbound/<token>`.
- Per-source **field map** UI: drag incoming JSON keys onto Paige fields.
- Same downstream pipeline: contact upsert → deal → notify → workflow.
- Embeddable `<script src="…/embed.js" data-form="…">` for hosting a Paige form *inside* an externally built page.

This is the answer to "tenants want a different platform" — we don't fight it, we ingest it cleanly.

---

## 6. MCP exposure (Paige can build pages by voice)

Add tools to `paige-mcp` (admin.write scope):

- `list_pages`, `get_page`, `create_page_from_template`, `publish_page`
- `list_forms`, `create_form`, `get_form_submissions`
- `list_funnels`, `create_funnel`, `attach_step`
- `register_external_source`

So Claude Desktop / ChatGPT can say *"Paige, spin up a BTF discovery funnel with a 2-step form and route submissions into the BTF pipeline stage 'New Lead'"* and it materializes.

---

## 7. Seed: map the two BTF pages to the MMA tenant

After the engine ships, run a seed migration scoped to the Mogul Maker Academy tenant:

- `growth_pages`: `btf-sales` (mirrors `build-to-fund.vibepreview.com` — Hero, 3 Phase Cards, Package Grid, CTA).
- `growth_forms`: `btf-application` (mirrors the 3-step onboarding form — Personal Info / Business Entity / Funding Profile, with `maps_to` wired to `contacts` + `businesses` + `clients`).
- `growth_funnels`: `btf-program` with steps: `btf-sales` → `btf-application` → success/thank-you → triggers existing `invite-btf-client` edge function on completion.

Public URLs once live:
- `portal.mogulmakeracademy.com/p/mma/btf-sales`
- `portal.mogulmakeracademy.com/f/mma/btf-program`

These can later move to a custom subdomain via the existing tenant-storefront pattern.

---

## 8. Build order (this turn + next)

**This turn** — foundation:
1. Migration: all 6 `growth_*` tables + RLS + grants.
2. `growth-inbound` edge function (token-validated, contact upsert, deal create).
3. Admin shell pages (`/admin/growth/*`) wired into `AdminLayout` "More" menu, with list + empty states + "Create" flows for Forms and Pages.
4. Public renderers `/p/:tenant/:slug` and `/form/:id` reading `blocks_json` / `schema_json`.
5. Seed BTF sales page + BTF 3-step form for the MMA tenant.

**Next turn** — depth:
6. Funnel runner + step orchestration.
7. Paige-generated forms via AI Gateway (`generate_form` action).
8. MCP tools.
9. External source mapper UI + `embed.js`.
10. Submissions inbox + analytics (visits, conversion %).

---

## Notes on pricing

Once Forms + Pages + Funnels + Workflows + Approvals + MCP all ship, the platform is unambiguously above GHL/HubSpot Pro tier in capability. Recommend repricing alongside the next turn:

- **Make It** — keep low (lead-gen for the platform)
- **Manage It** — $197/mo (was $44) — Pages + Forms + Funnels + Pipelines + Workflows
- **Multiply It** — $497/mo (was $29 typo'd tier) — adds MCP, Sub-Agent Factory, multi-tenant white-label, unlimited Paige sub-agents

Pricing change is a separate approval — flagging here, not shipping it in this build.

---

## Out of scope (intentionally)

- A full visual drag-and-drop page editor (v1 uses block JSON + a structured form, plus "duplicate template" — enough to ship; visual editor is a v2 investment).
- A/B testing (v2).
- Server-side analytics dashboards beyond submission counts (v2).
