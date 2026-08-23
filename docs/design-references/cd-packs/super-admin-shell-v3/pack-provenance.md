repo: mrmogulmaker-bot/Paige-Agent-AI
branch: main

## Last sync
date: 2026-08-23T02:10:30Z
tree: 1c557a873e8b

### Updated in this project
- Settings → **Capabilities rebuilt from the shipped autonomy substrate** — `tenant_tool_autonomy` + `resolve_tool_autonomy` + `list_tool_autonomy` (migrations 20260711200000, 20260711220000, 20260716171236). 27 tools in 10 categories on the real three modes (auto | confirm | off), not an invented scale; the five-level Trust Compass now reads as a ceiling over those three.
- Surfaced the schema guardrails as UI: `send_via_approval ⇒ requires_approval` and `auto ⇒ executor IN (record_only, workflow)` make **auto-send unrepresentable**, so autopilot is struck through on the three tools that reach a person.
- Settings gained **Vault** — the Business Vault (owner-locked Pillar 2), built from `docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §2 and the §65 back-menu spec that names Platform Vault. 20 obligations in 6 groups, each carrying who it is owed to, its clock, its evidence, and an L1–L4 tier deciding whether she may handle it or a professional must.
- Settings → Automations rebuilt as a builder rather than a ledger: 42 triggers across 10 categories, 29 actions across 7, 6 guards, 12 automations shown as trigger → action chains on category shelves, with a four-figure decision strip (running / held by the ceiling / blocked / never run).
- Grounded in `supabase/migrations/20260701144912_*.sql`: `stage_automation_rules`, `stage_automation_events`, `trg_deals_stage_automation`, and pg_net dispatch to `functions/v1/dispatch-stage-automation` against `tenants.automation_webhook_url_encrypted`. That is the one automation real end to end — stage change → webhook.
- **Integrations rebuilt** as 42 named vendors across 8 shelves with per-vendor panels (Connection · Scopes/Tools/Workflows · Numbers · A2P · Activity). State grounded in `supabase/functions`: Resend, Gmail, Twilio SMS, Anthropic and `paige-mcp` read live; Twilio Voice, Apple CalDAV, D&B and n8n read half-wired; the rest are named with nothing behind them.
- Twilio carries **Numbers** and **A2P** as their own layers, with the owner's split recorded: buying a number is account setup (Settings), calling and texting are work (Conversations).
- Tier palette corrected — the invented tokens were replaced with CD's shipped `TIER_INK` hexes read from `FleetOrbitScene.tsx` (Agency #7C6CE0 · Solo #3F7F5C · Sub-account #2F6B8F · Enterprise #B5822A). Tiers never rendered on that field show an outline instead of an invented colour.
- Settings → Platform gained the **account matrix**: the canonical six tiers with one shared palette (also driving Fleet's composition bar), each tier's identity and resolver path, plus a 6×6 capability grid of the owner-locked feature cells. Grounded in `docs/doctrine/tier-matrix.md` — live population 1 agency + 3 standalone + 4 sub-accounts matches the Fleet tree exactly.
- Campaigns gained **Social** (a publishing spine: channel lanes, week axis, ad flights as spans) and a **Vibe Studio door** grounded in the shipped sub-app at `/admin/studio/*` — `StudioLayout` + persistent rail, `StudioHome`, `StudioNew`, `StudioLibrary`, `VibeStudio` at `:sessionId`. The door hands off rather than hosting the Studio in a panel, since the Studio is immersive by design.
- Sequences folded into Active: a campaign's motion is its step rail, so a separate sequence tab drew the same graphic with fewer steps. A reusable motion is a Marketplace Template.
- Calendar moved from the retired Field slot into Relationships, beside Conversations.
- Stage 1 design package: reconciled `--pg-*` token set (Obsidian + Mineral) from `src/prototype/tenant-redesign.css` and the owner's Command Mark board, with contrast computed rather than asserted.
- Stage 3 client-side build: six-slot rail, ⌘K capability palette, pinned execution strip with ⌘. interrupt, PAIGE-surfaced pins, six workspace geometries incl. BroadcastChannel detach.
- Trust Compass as a ceiling: effective grant is `min(capability, ceiling)`; every count on screen derives from that tally.
- Systems check rebuilt to the real registry — ten checks, seven domains, four statuses; skips and errors reported as their own axis, never as passes.
- Analytics rebuilt as charts per owner ruling: four per lens, ledger only on Platform health, no line drawn on an unread series.
- Relationships gained a Conversations console (People · Conversations · Segments) built from the shipped console in `src/agency/conversations.tsx` + `src/agency/fixtures.ts`: channel filters, thread list, thread, and a person rail that is the same record People lists.
- Follow-ups demoted from a subtab to an automation; Settings gained an Automations view holding eight automations, each running under an existing capability grant.

## Screen map
| Screen | Built from |
|---|---|
| PAIGE Super Admin Shell v3.dc.html | `src/prototype/TenantRedesign.tsx`, `src/prototype/tenant-redesign.css`, `docs/doctrine/tier-matrix.md` |
| — Command Mark | `uploads/paige-03-the-command-mark.png`, `src/components/brand/PaigeSymbol.tsx`, `paige-symbol.css` |
| — Fleet · Systems check | operator systems-check registry (Cowork spec paste) |
| — Campaigns · Pipeline | `PAIGE Pipeline.dc.html` (spec artifact; retains multi-pipeline, not yet folded in) |
| — Analytics | `docs/doctrine/tier-matrix.md` surface ledger |
| — Settings · Automations | `supabase/migrations/20260701144912_324f9be7-bac9-4eee-b1cb-724cb74d451d.sql` (rules, events, deal trigger, pg_net dispatch), `supabase/functions/dispatch-stage-automation` |
| — Settings · Integrations | `supabase/functions/CLAUDE.md` (Twilio operator config, A2P messaging service), `_shared/twilio.ts`, `_shared/channel-adapters.ts` (Resend vs Gmail dispatch), `_shared/claude.ts` (Anthropic), `_shared/calendarCrypto.ts` (Google OAuth + CalDAV), `_shared/businessVerifyAdapters/dnb.ts`, `_shared/actorTier.ts` (n8n action kinds) |
| — Settings · Platform | `docs/doctrine/tier-matrix.md` §§56/60/61 (canonical six, standing default, owner-locked cells), `src/lib/tier/tierFeatures.ts` (TIER_FEATURE_BASELINE) |
| — Campaigns · Vibe Studio door | `docs/architecture/CANONICAL-SYSTEM-ARCHITECTURE-2026-08-08.md` (Studio route map), `docs/doctrine/tier-matrix.md` §61 (studio tier lock), `docs/DONE.md` #408 (Growth hub absorbing Campaigns + Studio) |
| — Relationships · Conversations | `src/agency/conversations.tsx`, `src/agency/fixtures.ts` (CHANNELS, THREADS, CONV_CHANNEL_PERF), `src/components/clients/ConversationsSubTabs.tsx` |
| docs/handoff/tenant-redesign-stage2-design-package.md | the above, kept in sync each build turn |
| docs/brand/paige-brand-identity.md | owner-supplied board; **held** for reconciliation with Cowork's doctrine layer (§18 one home) |

## Notes
- No write access from this project: the `stage3-super-admin-redesign` branch has not been cut and nothing is committed. Files are ready to land.
- `docs/brand/paige-brand-identity.md` and `docs/cowork-notes/paige-tenant-experience-synthesis.md` do not exist on `main`.
- `commit:` omitted deliberately — `1db535564fa5` is a tree hash from `github_get_tree`, not a commit sha.

## Rulings (locked 2026-08-22)

- Six rail slots, intended. Fleet · Relationships · Campaigns · Field · Analytics · Settings.
- Ten capabilities is canonical; no eleventh verb.
- A deal points at the relationship, carrying `tenant_id` for direct RLS.
- Facial recognition is out of scope for Stage 3 — the asset store must not be built around
  faceprints. Logo-file or monogram only.

## Open rulings
- Six rail slots, not five (the two-books ruling created the sixth).
- What a deal points at now Pipeline sits under Campaigns: tenant, relationship, or a nullable pair.
- Sandbox / web search / browser have no substrate at all — palette stubs per owner ruling.
- Detached-window transport: client half shipped, server token + cross-window gate locking is CC's Stage 4.
- Ten capabilities, not eleven. Name the eleventh if one was intended.
- **Live defect found while grounding Capabilities:** migration 20260716171236 (Studio) re-declared `list_tool_autonomy` from a body copied out of 20260711200000, which predates the n8n additions in 20260711220000. Four tools — `n8n_create_workflow`, `n8n_update_workflow`, `n8n_activate_workflow`, `n8n_deactivate_workflow` — are still gated at runtime (unlisted defaults to `confirm`) but no longer appear in the settings catalogue, so an operator cannot see or change them. That is precisely the visibility gap the Studio migration's own header says it exists to close. Stage 3 should re-declare the catalogue as the union.
- Automation substrate: 32 of 42 triggers and 24 of 29 actions have a seam. The ten dead triggers cluster on voice (2), social DM (1), attendance (1), lifecycle (1), loss reason (1), stage history (1), merge (1), drift (1) and integration events (1).
- An automation's effective grant is the most restrictive among its actions, then clamped by the Trust Compass — same rule as composed skills and marketplace installs. Stage 3 must resolve it server-side, not in the client.
- **Number resale vs bring-your-own is two products.** Ours resold: we hold the Twilio account, the tenant rents the number, we can revoke. Theirs: they hold the account, we hold a grant only — no revoke, no visibility on their bill. Confirm this is the intended split before Stage 3 builds provisioning.
- A2P registration has two carrier-side steps we cannot drive. A number can be Active and still undeliverable, which is why A2P is its own layer rather than a field on the number.
- The Studio is tier-locked to Solo · Sub-account · Enterprise · Super Admin, **Agency excluded with no resell** (§61 owner-locked). The shell shows the door because it is Super Admin; other tiers must gate it via `RequireFeature`.
- §21 forbids artifact-type tabs in the Studio. The door therefore offers the three real routes (gallery, new, library), not per-artifact create actions.
- Voice has no substrate at all. Email and SMS route through the existing send seam; WhatsApp is Stage 3. The call surface is design only — nothing dials.
- The shipped console's other five sub-tabs (Manual Actions · Snippets · Trigger Links · Analytics · Settings) are not carried into the operator console yet — confirm whether operator scope needs them.
