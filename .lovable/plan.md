
# BTF Client Workspace v1 — Build Plan

Spec read in full (mma-os repo, BTF-CLIENT-WORKSPACE-SPEC.md, 252 lines). Scope is achievable, schema is mostly clean, but there are 5 honest pushbacks before we cut a line of code.

---

## 1. Scope agreement

Agreed on the v1 cut as written, with these adjustments:

- **Pull Funding Outcome (Section G) entirely to v2.** Spec already flags it as deferrable; locking it in v1 buys us ~1 day.
- **Coach Messages in v1 = text + single file attachment only.** No pinning, no read receipts, no typing indicators. Pinning slides to v1.1.
- **Intake Form = single wizard, no mid-flow edit in v1.** Editable later post-submit is v2. Jacqueline submits once, Antonio Daniel edits on her behalf via coach view if needed.
- **"What's next" callout on Dashboard** — driven by simplest rule (first non-complete `btf_phase_items` row assigned to client). No ML, no Paige reasoning.

Everything else in the v1 list stays.

---

## 2. Schema review — fits cleanly with one restructure

The 4 new tables (`btf_workspace_settings`, `btf_phase_items`, `btf_document_requests`, `btf_messages`) fit Paige's existing model. Notes:

**Reuses cleanly:**
- `clients.tier` already exists (Wave 2) → set `tier='btf_dfy'` to gate workspace access via RLS
- `clients.assigned_coach_user_id` already exists → drop `assigned_coach_id` from `btf_workspace_settings` (duplicate field, source-of-truth conflict)
- `clients.ghl_contact_id` + new `mma_os_btf_deal_id` give us the cross-system join
- `paige_audit_log` already exists → use for phase advancement audit trail; no new audit table
- Existing `documents` table has the storage pattern — `btf_document_requests` should reference an entry in `documents` rather than re-storing `file_url/size/type` (avoid drift)

**Schema changes I'd make to the spec:**
- Drop `assigned_coach_id` from `btf_workspace_settings` (use `clients.assigned_coach_user_id`)
- `btf_document_requests` stores request metadata + a nullable `document_id` fk to `documents`; actual file lives in `documents` + storage bucket
- Add `phase` enum (`build|stack|fund|complete`) at DB level, not text
- `btf_phase_items` needs a `sort_order int` for deterministic checklist rendering
- `btf_messages.sender_id` should be `uuid` (auth.users.id), not text — clean role check
- New storage bucket `btf-client-docs` (private, RLS by client_id) — separate from existing `personal-documents` / `business-documents` to keep BTF auditable

**RLS plan:**
- Client role (new): sees only own `btf_*` rows via `client_id = (select id from clients where linked_user_id = auth.uid())`
- Coach role: sees rows where the underlying `clients.assigned_coach_user_id = auth.uid()` (reuses Wave 3 hybrid pattern)
- Admin: full read (existing pattern)

---

## 3. Primitives we reuse vs new builds

| Capability | Status |
|---|---|
| Auth (Supabase) | Reuse |
| `invite_user` action | **New white-label variant** — `invite_btf_client` (different from-address, no Paige copy, branded landing) |
| RLS hybrid pattern | Reuse (Wave 3) |
| Coach assignment + round-robin | Reuse — but seed `paige_assignment_policy` row for `tier='btf_dfy'` set to `manual` for v1 (Antonio assigns, no auto) |
| Document upload component | Reuse `DocumentUpload.tsx`, point at new bucket |
| `paige-bridge` outbound | Reuse pattern; add 4 verbs on **mma-os side** (outside our codebase — Antonio coordinates with MMA Ops chat) |
| `paige_admin_notifications` | Reuse for coach pings ("new client message", "doc uploaded") |
| Realtime subscriptions | Reuse (already wired Phase 1) for live message/checklist updates |
| Brand theme | **New** — white-label theme provider scoped to `/workspace/*` routes (Navy/Gold/Bookman/Calibri), zero Paige strings |
| AdminBridgeBell, AdminLayout | NOT reused — workspace gets its own minimal shell `WorkspaceLayout.tsx` |

---

## 4. White-label — technical concerns

Low risk overall. Concrete must-dos:

- **Route isolation:** all client UI under `/workspace/*`; no shared chrome with `/app` or `/admin`
- **`<title>` + meta tags** per-route via `react-helmet-async` (already installed) — never emit "Paige"
- **Email templates:** new Resend templates, from `antonio@mogulmakeracademy.com`, custom HTML — do NOT reuse existing Paige auth templates (Supabase auth email templates need a separate set OR we send custom invites via edge function and skip Supabase's built-in)
- **Auth flow gotcha:** Supabase's default "magic link" / "confirm signup" emails ARE branded by us in dashboard settings — we have ONE set of templates per project. Recommend: send invite via custom edge function with a signed token → client lands on `/workspace/accept-invite?token=…` → we call `admin.createUser` server-side → set password → sign in. Bypasses Supabase's templated emails entirely.
- **Favicon + OG tags** per workspace route
- **Console/network leak audit** before launch (no "paige" strings in payloads visible to client devtools — rename any user-facing API responses)
- **Domain:** `portal.mogulmakeracademy.com` recommended over `workspace.buildbuyingpower.com` (shorter, owned, easier DNS). Needs a custom domain config; Lovable supports it but adds ~1 day for DNS + cert propagation.

---

## 5. mma-os-bridge integration — blockers

The 4 new verbs (`get_btf_deal_by_id`, `update_btf_phase`, `record_btf_payment`, `get_btf_workspace_summary`) are **outside this codebase** — they ship on the mma-os Edge Function. Our side just calls them via the existing bridge client pattern.

**Blockers / dependencies:**
- Antonio needs to confirm with MMA Ops chat that those 4 verbs will be live before our Week 2 integration testing. Otherwise we stub them locally and swap in Week 3.
- `mma-os.btf_deals` schema needs to be shared so we type the bridge responses correctly. Request: paste the table definition in the next turn.
- Bridge auth key rotation just happened — workspace edge functions must use the current `MMA_OS_BRIDGE_API_KEY` secret. Already set.
- Payment data is **read-only from mma-os** in v1 — Paige never writes payment state. `record_btf_payment` is a coach action that delegates to mma-os. Confirm that's the intent.

No technical blockers on our side. Coordination risk only.

---

## 6. Build order (smallest meaningful slice first)

**Week 1**

1. **Day 1-2 — Foundation**
   - Migration: 4 new tables, enums, storage bucket, RLS, seed phase-item templates for `build` phase
   - White-label theme tokens + `WorkspaceLayout.tsx` shell
   - Route scaffolding under `/workspace/*`

2. **Day 3 — Auth + invite**
   - `invite-btf-client` edge function (custom signed-token flow, MMA-branded email via Resend)
   - `/workspace/accept-invite` page
   - Client role + RLS verified end-to-end with a test account

3. **Day 4-5 — Client-facing minimum loop**
   - `/workspace` Dashboard (welcome, phase indicator, coach card, payment mini-card, what's next)
   - `/workspace/intake` wizard (single submit, writes `btf_workspace_settings.intake_data`)
   - `/workspace/phases` Phase Tracker (Phase 1 functional checklist, 2 & 3 locked tiles)

**Week 2**

4. **Day 6-7 — Documents + messaging**
   - `/workspace/documents` (drop zone, requested-docs list, reuses `DocumentUpload`)
   - `/workspace/messages` (basic thread, realtime, single attachment, email notify coach on new client msg)

5. **Day 8 — Payment status (read-only)**
   - `/workspace/payments` reads from mma-os via bridge `get_btf_workspace_summary`

6. **Day 9 — Coach view**
   - `/admin/btf` coach dashboard (client list + status)
   - `/admin/btf/:clientId` per-client view (all client sections + mark-complete, advance-phase, request-doc, private notes, message)

7. **Day 10 — Wire mma-os-bridge calls**
   - `update_btf_phase` on advance
   - `record_btf_payment` on coach log-payment
   - `get_btf_deal_by_id` for dashboard hydration
   - Fallback to local cache if bridge 5xx (already a pattern via outbox)

8. **Day 11-12 — Hardening**
   - White-label audit (grep for "paige" / "Paige" in `/workspace/*` bundle)
   - RLS test matrix (client cannot see other client; coach cannot see unassigned clients; admin can)
   - Send invite to test account, full happy-path walkthrough
   - Antonio + a coach UAT

9. **Day 13 — Production invite to Jacqueline**

That's 13 working days. Tight but doable if mma-os verbs are live by Day 8.

---

## 7. Pushback for Antonio

1. **"Manual handling" payment flag** — spec doesn't say where it lives. Recommend: column on `mma-os.btf_deals`, surfaced via bridge. We don't replicate it in Paige.
2. **Phase-item templates** — spec lists items but not who seeds them per new BTF client. Recommend: on workspace creation, an edge function clones a template row set from a new `btf_phase_item_templates` table. Otherwise every new client requires manual checklist creation.
3. **"Share your win" social graphic** (v2) — flagging now that this needs design assets before Phase 3 clients exist. Not blocking v1.
4. **Coach availability of Antonio Daniel + Tony Robinson** — they need accounts + the new `coach` role assigned + walkthrough. Recommend Antonio loops them in on Day 9 for UAT, not Day 13.
5. **One-client-one-deal in v1** is fine, but `btf_workspace_settings` should have a `unique(client_id, mma_os_btf_deal_id)` constraint so we don't accidentally double-provision when Jacqueline starts business #2.
6. **Realtime in messages** — pleasant but if mma-os-bridge slips, we ship messages with polling first (5s interval) and upgrade to realtime in v1.1. Keeps Day 13 honest.

---

## 8. Timeline verdict

- **v1 in 10–13 working days: realistic** if (a) mma-os 4 new verbs ship by our Day 8, (b) custom domain DNS is started Day 1, (c) Antonio Daniel + Tony Robinson are reachable for UAT Day 9.
- **Slip risk:** mma-os verb readiness is the single biggest external dependency. Mitigation: stub the bridge responses Week 1 so all Paige-side dev proceeds in parallel.
- **No technical blockers** on white-label, schema, or RLS.

Awaiting greenlight + the `mma-os.btf_deals` schema before I move to build mode.
