# Solo Campaigns › Social — the data-point map

**What this is.** Every value the Social Command surface can show, and for each one: where it comes
from, whether a human can change it, whether PAIGE can read it, whether PAIGE can write it, and how
far it reaches into the Spine, the Mind, the Rail and the chat. Written because "make sure all the
data points have upsert and point back to the Spine" is a question that needs a table, not a claim.

**Read with `docs/brain/paige-brain-wiring-standard.md`** (the five-point checklist every capability
must satisfy) and `docs/brain/paige-spine-and-rail-state.md` (what the Spine and Rail actually are
today, and the existence-vs-reachability rule).

**Grounded 2026-09-05** against branch `claude/paige-social-subtab-redesign-kd6hy5`, commit `b2c93c9`.
Nothing below was driven in an authenticated browser; where that matters it is marked.

---

## 1. The map

Legend — **Editable**: a human can change it on this surface. **PAIGE reads / writes**: she can do so
through a callable seam, not by a human clicking. **Chat**: present in her per-turn context without a
tool call.

| # | Data point | Source of truth | Editable here | PAIGE reads | PAIGE writes | Spine | Chat | State |
|---|---|---|---|---|---|---|---|---|
| 1 | **Accounts on record** (per network + handle) | `tenants.features->'social_handles'` | **YES** — the record form, `record_social_handles` | `get_social_accounts` (MCP) + Spine read | **YES** — `record_social_accounts` (MCP, `crm.write`) | **`social.presence`** | **YES**, live per-turn block | **LIVE** |
| 2 | Waiting on you (growth desks) | `paige_actions` `status='filed'` ∧ `autonomy_lane='confirm'` | no — resolved by acting on the action | via existing approval tools | via existing approval tools | — (owned by the action bus) | via existing context | PARTIAL |
| 3 | PAIGE sees (filed growth work) | same as #2 | no | ” | ” | — | ” | PARTIAL |
| 4 | Captured responses | `growth_form_submissions` (tenant-scoped) | no — written by the form | existing Campaigns tools | no | — | no | PARTIAL |
| 5 | Published outputs | `growth_pages` ∪ `growth_funnels` ∪ `growth_forms` | in Vibe Studio, not here | existing Campaigns tools | Studio seams | — | no | PARTIAL |
| 6 | Held for you (approval-gated routing) | `get_pipeline_routing_evidence` | in the form's routing config | ” | ” | — | no | PARTIAL |
| 7 | Needs repair (failed dispatch) | `growth_submission_dispatches` | no — an outcome, not a setting | ” | no | — | no | PARTIAL |
| 8 | Trust Compass lanes | `paige_departments` × `paige_action_kinds` (all `tenant_id IS NULL`) | **no, and deliberately** — these are PLATFORM defaults, identical for every workspace; there is no per-workspace autonomy record anywhere to edit | yes | no | — | no | PARTIAL |
| 9 | Publishing queue | — | — | — | — | — | — | **UNAVAILABLE** |
| 10 | Recorded placements | — | — | — | — | — | — | **UNAVAILABLE** |
| 11 | Scheduled posts | — | — | — | — | — | — | **UNAVAILABLE** |
| 12 | Ideas / Drafting / Repurposing | — | — | — | — | — | — | **UNAVAILABLE** |
| 13 | Active missions (cadence, target, progress) | — | — | — | — | — | — | **UNAVAILABLE** |
| 14 | Per-channel audience / engagement | — | — | — | — | — | — | **UNAVAILABLE** |

**Rows 9–14 are not "not wired yet."** No table anywhere in the platform holds any of them for a
tenant. Each renders an em-dash and the sentence naming the record that would have to exist. The
nearest thing — `paige_social_posts` — has **no `tenant_id` column**, so it cannot be read from a
tenant surface at all (§9).

---

## 2. Why row 1 is the only upsert, and what it took

`tenants.features->'social_handles'` had been **read** since the Systems Check L1 registry shipped
(`social_handles_captured.ts`) and **written by nothing**. The readiness spec records it in its own
words at `docs/product/systems-check-operating-readiness-spec.md:414`: *"NONE EXISTS. Verified: no
route writes tenants.features.social_handles."* So check #3 was structurally unpassable for every
tenant, and the destination registry pointed the owner at this page while admitting the page could
not finish the job.

**The write is `public.record_social_handles(uuid, jsonb)`** — copied from
`declare_client_payment_handling`, which closed the identical gap for the two payment columns:

- **Session-resolved tenant.** A JWT caller's workspace comes from `current_user_tenant_id()`; the
  passed `_expected_tenant_id` is **refusal-only** and can never select a workspace. A form opened
  against workspace A therefore aborts rather than saving into B after a switch.
- **A trusted arm for PAIGE.** When `auth.uid()` is NULL — the service-role path, and the only place
  §59 permits a supplied identity — the passed tenant is honored. That is how `record_social_accounts`
  in `paige-mcp` reaches it. It is guarded on `auth.uid() IS NULL` precisely so it can never be
  reached by a caller who has one.
- **One key, merged server-side.** `features` also carries `playbook_config`, `portal_config`,
  `enabled_skills`, `__feature_flag_owners` (the Blueprint install-ownership registry) and
  `system_workspace` (which gates the managed email sender and suppresses the onboarding scan). A
  tenant admin **can** update `tenants.features` directly under the live RLS policy — which is
  exactly why the write must not be a client-side read-modify-write of the whole object. Proved:
  assertion 2 of the rollback proof watched the sibling keys survive.
- **A flat object of strings, and the shape is load-bearing.** `hasText()` in the runner counts only
  non-empty strings, so the natural rich shape `{instagram:{handle,url}}` counts as **zero** — the
  surface would show accounts while the check reported none. Refused at the boundary; assertion 5.

---

## 3. How far it reaches — the five-point checklist, answered

| Point | Answer |
|---|---|
| ① Second-brain entry | `decision-log.md`, `paige-spine-and-rail-state.md`, `tier-matrix.md`, master doc §4 — all in the same commit |
| ② Callable seam (§10) | Two RPCs. No logic lives only in a React handler; the surface is one caller and PAIGE is another |
| ③a CONTEXT — does she need to KNOW it unprompted? | **Yes.** Spine `social.presence` → `socialPresenceChatEvidence.ts` → a block in every tenant Chat turn. She answers "what's my Instagram?" without a tool call |
| ③b TOOL — does she need to ACT on it? | **Yes.** `get_social_accounts` (`crm.read`) and `record_social_accounts` (`crm.write`) in `paige-mcp`, tenant tier by default |
| ④ Tier availability | Inherits `growth` — God · Solo · Sub-account · Enterprise; Agency excluded (owner-locked §61 exception). **§61 default: no exception**, so this was not put to the owner |
| ⑤ Honest when it cannot answer | A failed read renders "I can't check", never "not set up". A refusal renders **nothing** rather than telling a client their coach's setup is unreadable |

**Deliberately not an inline Chat tool.** `chat-tool-registry-lint` freezes the inline baseline and
lets it only descend; new capability is registered by its domain. The Spine entry declares the READ;
the write is a §10 seam with its own in-body gate, reached through MCP.

**The Mind.** `mindBinding: PARTIAL` — the same level as `business_context.readiness` and
`team.authority`. LIVE requires an authenticated end-to-end drive that no session here can perform.

---

## 4. The Rail — why there is deliberately no signal

`record_rail_event` writes `paige_client_events`, which is **contact-scoped**. A business's own list
of social accounts names no contact, so there is no signal to resolve and nothing for the Rail
resolver to project. This is the documented distinction in
`docs/brain/paige-spine-and-rail-state.md`, not an omission: a capability whose evidence is a live
read over a tenant's own current record sidesteps the Rail's four constraints — and buys none of its
properties either (no history, no citation, no attribution, no freshness boundary; the row is simply
current as of the call).

**What a Rail signal here would require** if it is ever wanted: a workspace-scoped event store, or a
widening of `paige_client_events` to permit a null `contact_id` with a workspace scope. That is a
shared-primitive change and needs a Spine Change Request — it is not a thing this slice could add
quietly.

---

## 4b. The memory substrate — what she retains, and where Social does (and does not) belong

**Seven stores get called "memory" in this codebase and they are not the same thing.** Mapped
2026-09-05, with each one's real state rather than its intent.

| Store | What it retains | Scope | State |
|---|---|---|---|
| **Per-thread continuity** (turns + rolling summary, `maybeRefreshSummary`) | What was said in THIS conversation, compacted when it grows | `(tenant_id, user_id)` | **LIVE** — slice 4a.3 |
| **Durable tasking** (`tasks.source_thread_id`) | The conversation a chat-created task came from | tenant | **LIVE** |
| **`paige_owner_memory`** (L8 fabric, `20260810120000`) | Durable cross-session facts, preferences, summaries about the owner — voyage-3 @ 1024 | `(tenant_id, user_id)`, IDOR-guarded | **SUBSTRATE LIVE, CHAT RECALL NOT WIRED.** The table and `match_paige_owner_memory` exist; `paige-ai-chat` explicitly does **not** call them — deferred to slice 4b, which is tier-gated and monetizable. It IS read by `owner-context.ts` for the §52 operator briefing |
| **`paige_prompt_memory`** (§26 compound loop) | A prompt + the artifact it genuinely produced, so the next forge retrieves what worked | tenant | **LIVE**, Studio generation only |
| **`client_memory`** (+ `match_paige_memory`) | The §8 CLIENT-side store — milestones, session summaries, coach notes | `client_user_id` | LIVE |
| **`studio_session_scratchpad`** (`session-memory.ts`) | Working memory inside ONE Studio session: goal, tried, worked, failed, next step | session | LIVE, best-effort, never load-bearing |
| **`paige_llm_trace`** | Observability, not memory — what was called, what it cost | tenant | LIVE |

**Where Social belongs, and the recommendation is deliberately NOT "write it to memory."**

The accounts on record are a **RECORD, not a memory**. They live in `tenants.features`, and PAIGE
re-reads them live on every single turn through the `social.presence` block — so what she knows is
always current, by construction. Copying them into `paige_owner_memory` would create a **second,
staler copy of the same fact**: the moment someone edits the record, the memory row is wrong, and a
vector search would surface a handle the business no longer uses. That is the §18 two-homes problem
with a §13 failure mode attached, and it is worth stating plainly rather than adding a memory write
to look thorough.

**What genuinely belongs in `paige_owner_memory` for this domain** is the conversational half a
record cannot hold: the tone the owner likes, the cadence they've agreed to, an offer they said not
to lead with, an audience they've told her about. Those are durable preferences, not fields — which
is precisely what the L8 fabric was built for. They will become recallable when **slice 4b** wires
`match_paige_owner_memory` into the chat; nothing about this Social slice blocks or advances that,
and no shortcut around it is proposed here.

**The one thing worth flagging for 4b's crew:** its write side has to decide what counts as a
durable fact. "Their Instagram is @acme" must NOT become one, because the record already answers it
better and would then disagree with the memory. A rule like *"never store a fact a live read already
returns"* would keep the two layers from drifting, and this capability is a clean first test of it.

## 5. Live provider connections — the honest position, and the owner decision

**Not shipped, not started, and nothing on this surface implies otherwise.**

What exists today:

| Function | What it actually does | Why it cannot serve a tenant |
|---|---|---|
| `meta-schedule-post` | Publishes/schedules to Facebook + Instagram via Graph API | Reads **one platform-wide** `META_PAGE_ACCESS_TOKEN` / `META_DEFAULT_PAGE_ID` / `META_IG_BUSINESS_ID` from the environment, and writes `paige_social_posts` — **a table with no `tenant_id`**. Every workspace would post to the same page |
| `meta-get-insights`, `meta-list-comments` | Reads page insights and comments | Same single-token problem |
| `channel_connectors` | Tenant-scoped connector table; its CHECK already admits `instagram`, `facebook` | The **only** writers are `gmail-oauth-callback` and `smtp-connect` — both email. Nothing creates a social connector |

So the substrate is roughly half there: a tenant-scoped connector table that already names the right
channel types, and working Graph API calls that are wired to the wrong identity.

**What per-tenant live publishing needs, in order:**

1. **A provider app per network, and app review.** Meta requires `pages_manage_posts` +
   `instagram_content_publish` with App Review and a Business Verification; LinkedIn requires
   `w_organization_social` via its Marketing Developer Platform; X and TikTok each have their own.
   These are **applications with review queues**, not configuration.
2. **Credentials and legal acceptance.** Client ID/secret per network, redirect URIs, and acceptance
   of each platform's developer terms. Both are §69 stop conditions — I cannot self-provision a
   credential or accept a licence on your behalf.
3. **Per-tenant OAuth start/callback functions**, storing a per-tenant token on `channel_connectors`
   (the pattern `gmail-oauth-start`/`gmail-oauth-callback` already establishes).
4. **A `tenant_id` on `paige_social_posts`** plus RLS, before any tenant surface may read or write it.
5. **Token refresh and revocation handling**, which is where these integrations actually rot.

**OWNER RULING, 2026-09-05 — the connections live in Settings › Integrations, and Social reads
them.** *"As far as the actual backend connection or integration with social media, we have an
integration section that is inside of our settings on the menu tab. I would add: Facebook,
Instagram, LinkedIn, TikTok, YouTube. I would add all of those on the backend there. You don't have
to do that right now… That's how it's going to ultimately wire and connect perfectly inside of
social."*

So the seam is settled, and it is the right one — it matches where every other provider connection
already lives (`src/solo/settings-integrations.tsx`, `/solo/{account}/settings/integrations`) and
the pattern `gmail-oauth-start` / `gmail-oauth-callback` already establishes. **Social does not grow
its own connect button.** It stays the surface that shows what is on record and what a connection
would unlock, and reads connection state from the connector rows Integrations owns — one home per
capability (§18).

Five networks, owner-named: **Facebook · Instagram · LinkedIn · TikTok · YouTube**. Note that
`channel_connectors`' CHECK currently admits only `email, sms, whatsapp, instagram, facebook, voice`
— LinkedIn, TikTok and YouTube need that constraint widened, which is a one-line migration and
should happen in the same slice that adds them rather than being discovered by a failing insert.

**Deliberately NOT built in this slice, at the owner's instruction** ("you don't have to do that
right now"). When it is built, the declared handles this slice records become the natural
pre-fill and the reconciliation target: a connected account whose handle disagrees with the record
is a real finding the surface should show, and it is only expressible because the record exists first.

**Sequencing note for whoever picks it up.** The effort is per-network and mostly gated on the
provider's review queue rather than on our code. Meta (Facebook + Instagram) is the cheapest first
step because the Graph API calls already exist in `meta-schedule-post` / `meta-get-insights` and
only their identity is wrong — they read one platform-wide token where they need a per-tenant one.

**What this slice deliberately did NOT do**, so it is on the record: it did not point the surface at
the existing Meta functions. Doing so would have made the tiles fill with numbers immediately and
would have published every workspace's post to one shared page — a §9 breach wearing the costume of
a working feature.

---

## 6. Proof, by class (§13)

| Class | What was proven |
|---|---|
| **Automated test** | 53 new assertions; full suite 227 files / 3303 tests passing. Includes a fabrication guard asserting on rendered copy — a tile may be NAMED "Scheduled" but may never carry a figure |
| **Static / build** | `ci:tsc` (no new errors), `build`, `eslint`, and 11 CI lints incl. `definer-fns`, `tier-features`, `action-risk`, `tool-catalogue`, Spine registry `PASS (17)`, chat-tool baseline unmoved |
| **Database** | `BEGIN..ROLLBACK` on production `xygzykjyynhzqytbqnzu`, 10 assertions, rollback confirmed clean. **Caught a real defect**: the read's role gate was unguarded on `auth.uid()` and would have refused PAIGE's own service-role caller |
| **Authenticated runtime** | **NONE.** No session here holds a browser that reaches the authenticated surface |
| **UNVERIFIED / owed** | Migration applied and persisted on production (CI on merge, §32.a) · authenticated live drive of the record form (§32.c) · the non-master-tenant 5-minute smoke test the PR template asks for |
