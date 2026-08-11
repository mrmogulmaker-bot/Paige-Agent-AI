# Paige Multi-Channel Comms & Deliverable Workflow — LOCKED SPEC
**Status:** Approved by Antonio Cook 2026-08-08.
**Owner:** Product (Antonio) with Cowork.
**Build owner:** Claude Code, when Customer Portal MVP work fires.
**Doctrine anchors:** §7, §8, §9, §10, §14, §15, §16, §18, §20, §21, §36, §38 in `CLAUDE.md`.
**Companion spec:** `docs/product/customer-portal-owner-trilogy-taxonomy-matrix.md` (this spec references its Pillar 2 Communications and Pillar 3 Documents & Deliverables — does not duplicate them; extends the *workflow* that spans them).

---

## 1. Purpose

The Owner Trilogy matrix locks WHO owns what across the client portal. This spec locks HOW Paige actually operates as the tenant's **unified conversation operator** across every channel a real service business uses — email, SMS, portal, social DMs, and voice — AND how she authors and delivers client-facing artifacts (proposals, offer letters, contracts, statements) into that same conversation fabric.

Two capability sets, one substrate:

- **A. Client-Facing Deliverable Workflow** — Paige-in-chat authors a client-specific document via her team (§14), presents delivery-channel choice, sends via the picked channel, tracks receipt/sign, loops acceptance back into Paige's context.
- **B. Omnichannel Conversation Layer** — Paige receives, drafts, and (per §16 autonomy tier) auto-answers or hands to the tenant across email, SMS, portal chat, social DMs, and voice (inbound + outbound calls).

Both capabilities are **MVP** — not Phase 2. That's the owner ruling underneath this spec.

---

## 2. Scope — what's in and what's out

### In scope for MVP:
- **Channels:** email · SMS · in-portal chat · voice (inbound + outbound) · social DMs (Instagram + Facebook Messenger + one of {LinkedIn, Twitter/X} — pick per install)
- **Deliverable artifacts:** proposals · offer letters · contracts / agreements · statements of work · session recaps · custom documents authored in Paige chat
- **Delivery options presented by Paige:** SMS link · Email link · In-portal notification · (voice: reminder / voicemail as a follow-up) — Paige asks; tenant picks
- **Conversation takeover:** Paige can draft OR auto-respond (per §16 tier) on any inbound message across any channel, with tenant configurable per-channel autonomy
- **Outbound calls:** appointment reminders · re-engagement calls · payment-due nudges · custom outbound Paige-voice calls approved by tenant

### Out of scope for MVP (parked, not forgotten):
- WhatsApp Business (deferred until it's a proven acquisition channel)
- TikTok DMs (deferred — no first-party API today)
- Group SMS / group email threads with more than one client (single-thread MVP)
- Multi-party voice conference (single-caller MVP)
- Video calls (Paige joins Zoom/Google Meet as observer) — future capability, not MVP
- Fax (deliberately never)

### 2.3 Tier availability — WHO gets these features (owner-ruled 2026-08-08)

Every capability in this spec is a **client-facing operational capability**, and only tiers that actually have direct clients get it. Agencies-as-parents do NOT directly operate on clients — architecturally, agencies that need direct client-facing operations create their own sub-account under themselves and run their practice from there. So the agency-parent layer stays a management/configuration/curation surface (per §9 seam + Owner Trilogy matrix), and the client-facing operational capabilities in this spec live at the tiers that have direct clients.

| Feature set | Super Admin (God) | Solo | Sub-account | Agency (parent) |
|---|---|---|---|---|
| Client-facing deliverable workflow (Capability A) | ✅ **FIRST — dogfood** | ✅ MVP | ✅ MVP | ❌ (agency uses own sub-account) |
| Omnichannel comms — SMS · email · portal · social · voice (Capability B) | ✅ **FIRST — dogfood** | ✅ MVP | ✅ MVP | ❌ |
| Voice inbound/outbound | ✅ **FIRST — dogfood** | ✅ MVP | ✅ MVP | ❌ |
| Unified inbox surface | ✅ **FIRST — dogfood** | ✅ MVP | ✅ MVP | ❌ |
| Take-over flows | ✅ **FIRST — dogfood** | ✅ MVP | ✅ MVP | ❌ |
| Autonomy-tier configuration | ✅ | ✅ | ✅ | ✅ (as CONFIG default for sub-accounts, per Owner Trilogy §4.2) |
| Per-channel connector setup (Twilio, Meta OAuth, LinkedIn/X) | ✅ | ✅ | ✅ | ✅ (as CONFIG default for sub-accounts to inherit) |

**Build sequence — non-negotiable order:**
1. **Super Admin (God account) first — dogfood.** Antonio's own operator account gets the full stack first. The Super Admin is the proving ground — real messages, real calls, real deliverables, real tenants and clients on the receiving end (agencies + solo owners we onboard). Bugs surface with the highest-signal user (Antonio) before any external tenant is exposed. This is not a token pilot — it's the primary user for however long it takes to shake out.
2. **Solo tenants + sub-accounts second — MVP.** Once the Super Admin loop is proven, Solo + sub-account tiers get the same capabilities. They inherit the shaken-out flows.
3. **Agency-parent — NEVER (by design).** The agency-parent layer stays management/configuration/curation only. If an agency operator wants to run direct client work, they create a sub-account under themselves — that's the pattern this spec assumes and depends on. This is not a deferral; it's an architectural decision.

**Why this order:** Antonio explicitly rules it. Also: dogfooding on the Super Admin surfaces cross-channel bugs (voice-to-SMS handoff misses, unified-inbox stitching misses, autonomy-tier drift) at 10x the rate of tester-tenant loops — the person building it is the person feeling the pain. Only after Antonio's own daily use produces a clean loop does it ship to Solo + sub-account.

**Cross-refs to Owner Trilogy matrix:**
- Pillar 2 Communications: matches — tenants/sub-accounts OWN their side of client comms; agency configures defaults, doesn't own comms directly.
- Pillar 3 Documents: matches — tenants/sub-accounts OWN client deliverables; agency doesn't produce direct client deliverables.
- Agency-as-CONFIG-only: consistent with matrix §4.2/§4.3 where Agency column is "CONFIG (default)" — not OWN or WRITE — for tenant-scoped operations.

---

## 3. Capability A — Client-Facing Deliverable Workflow

### 3.1 The pipeline
```
Paige-in-chat (§20/§21)              →  authors artifact
    ↓ tenant reviews / edits
Delivery-choice prompt (§15)          →  "SMS · Email · Portal · Voice reminder"
    ↓ tenant picks 1+ channels
Send via picked channel(s) (§10)      →  Communications pillar seams
    ↓ client receives + views + signs
Acceptance loops back (§7 two-way)    →  Documents pillar record updated;
                                          Paige's context refreshed with the win;
                                          next-move draft proposed
```

### 3.2 Authoring (in-chat, multitasking)
- Paige authors the artifact inside the **one Studio session per project** (§21 — no separate tab, no artifact-type picker). Client-facing deliverables are Studio artifact types; they appear in the ProjectNavigator rail alongside pages/funnels/forms/images.
- **Multitasking in chat is required.** While Paige's document specialist is authoring a proposal, the tenant can keep talking in the same thread about other work; the artifact streams in the rail; Paige orchestrates. No blocking modal.
- Copy embedded in the deliverable follows the direct-response bar (§19 clarification). Voice per §3 doctrine (mogul-founder), tenant-authored persona overrides (§7).
- Cancel option on the artifact card — extends the existing `signup-cancel`-style pattern per §18 (one home for cancel; don't fork).

### 3.3 Delivery-choice prompt (the concrete UX Antonio described)
When the artifact is ready to send, Paige surfaces this prompt in the chat:

> *"Ready to send. How do you want them to get it?*
> *· SMS link — quickest, best if they respond fast on text*
> *· Email — best for anything with signature or attachments*
> *· Client portal notification — they'll see it next login*
> *· Voice reminder call — I can call them and mention it lands in their portal*
> *Or pick more than one."*

Tenant can select 1+ channels. Paige recommends a default per artifact type (a signable contract defaults to Email; a session recap defaults to Portal; a payment-due reminder defaults to SMS+Portal). Recommendations are per-tenant-learnable (§26 semantic memory).

### 3.4 Client-side receipt experience per channel
| Channel | Client experience |
|---|---|
| **SMS link** | Short tenant-branded SMS with a one-tap link to a signable landing page hosted under the tenant's domain (§7 brand) |
| **Email link** | Tenant-branded transactional email (existing `send-transactional-email` seam per §18) with the same landing page linked |
| **In-portal notification** | Client's Customer Portal shows the deliverable in the Documents pillar (Owner Trilogy §4.3), Communications pillar shows the "you have a new document" nudge |
| **Voice reminder** | Outbound call — Paige voice (ElevenLabs ConvAI, already wired) — "Hi [name], [tenant] just sent you a proposal — check your portal or your email — anything I can answer while you're on?" |

All landing pages are tenant-branded (§7). Landing page is generated once, all channels link to the same URL.

### 3.5 Acceptance loop-back
- Signature or acceptance click fires a webhook back into Paige's action bus (§8)
- Documents pillar record updates: `signed_at`, `signed_by`, `via_channel`
- Paige's next-turn context reflects the win — she draws it into her plan for the tenant ("The Smith proposal is signed — want me to kick off onboarding?")
- Bounce/decline/no-response after N days also loops back — Paige drafts the follow-up

### 3.6 Which artifact types are "client-facing sendable"
An artifact is sendable to a client only if the tenant marks it as such (or Paige authored it with client-recipient context). Prevents accidental send of internal-only drafts.
- **Sendable:** proposals, offer letters, contracts, statements of work, session recaps, invoices (from Payments pillar), forms/questionnaires requiring client input, custom deliverables tagged "for client"
- **Not sendable by default:** scratch drafts, internal notes, meeting prep documents, competitive research, Paige's own working files

---

## 4. Capability B — Omnichannel Conversation Layer

### 4.1 The unified inbox concept
Every inbound message across every channel appears in **one** unified inbox for the tenant, in the Paige Chat surface (per §20 — the one chat is where Paige operates). Each thread carries the channel badge (SMS / Email / Portal / IG DM / FB Messenger / Voice-transcript / etc.), the client identity, and the full history stitched together across channels for that client.

Paige treats every inbound as an event on her action bus (§8), classifies by department (§16 10-department model — most route to Client Experience), and per the autonomy tier per action:
- **🟢 auto** — Paige answers directly (e.g., "what time is our session tomorrow?" → she reads the calendar and replies)
- **🟡 draft-for-approval** — Paige drafts, tenant approves before send (default for anything money/scheduling/commitment)
- **🔴 human-only** — Paige surfaces the message, drafts context, but the tenant writes the reply (default for sensitive/high-stakes)

Tenant configures the default tier per channel + per client + per topic in their Playbook. Overrides live per-message.

### 4.2 Per-channel behavior
| Channel | Inbound | Outbound | Notes |
|---|---|---|---|
| **Email** | Full thread ingestion (via existing IMAP or a per-tenant reply-to address routed through us) | `send-transactional-email` seam (§18) | Attachments preserved; Paige can read attached PDFs into context |
| **SMS** | Twilio Programmable Messaging inbound webhook → action bus | Twilio SMS outbound with tenant's number (or a rented per-tenant number) | Uses Twilio Messaging Services best practices (skill: `twilio-messaging-services`) |
| **In-portal chat** | Client uses Customer Portal's Paige chat → routes to same inbox | Same channel back to the client | Native — no third party |
| **Instagram DM** | Meta Graph API webhook (Instagram Business account required) | Meta Graph API send | Requires per-tenant Meta business auth; deferred connector work |
| **Facebook Messenger** | Meta Graph API webhook | Meta Graph API send | Same auth path as IG DMs |
| **LinkedIn / X DM** | LinkedIn or X API webhook (per install choice) | Same API send | Only one of the two in MVP; tenant picks in Playbook |
| **Voice — inbound** | Twilio Voice inbound → ConversationRelay (Paige voice AI, already wired for portal chat) → transcript to action bus | Twilio Voice outbound with ConversationRelay | Uses `twilio-voice-conversation-relay` skill; ElevenLabs ConvAI agent (`agent_1601k7zn6bs7e72bt6485bp99v4a`, Ivanna voice, Turbo v2.5 model — as fixed 2026-08-08) |
| **Voice — outbound** | N/A | Same as above; Paige initiates the call, greets, executes the intent (reminder, follow-up, confirmation), transcript loops back | Recording per `twilio-call-recordings` skill; consent handling per US state law |

### 4.2.a Email management — Paige's granular action set (per verb, per tier)
Email is the deepest channel — Paige needs a full Gmail/Outlook-class action set, not just "read + reply." Each verb has an autonomy tier and the tenant can promote/demote per rule. All verbs are tenant-scoped: Paige NEVER touches an email that isn't the tenant's, and per §9 seam Paige never surfaces one tenant's email under another tenant.

| Email verb | Default tier | Notes |
|---|---|---|
| **Read + summarize** (inbound thread) | 🟢 auto | Always safe; feeds the unified inbox + Paige's context |
| **Classify + label/tag** (by client, topic, urgency, sender) | 🟢 auto | Automatic categorization by tenant's Playbook rules |
| **Archive** (remove from inbox, keep in All Mail) | 🟢 auto | Reversible; no data loss |
| **Mark read/unread** | 🟢 auto | Cosmetic; used to surface real unread count |
| **Snooze** (hide until a specified time) | 🟢 auto | Used for "not urgent, resurface Monday" |
| **Flag / star / mark important** | 🟢 auto | Tenant reviews flagged items in unified inbox |
| **Draft reply** (queued for tenant approval) | 🟢 auto | Never sends without tenant click; appears in draft folder AND unified inbox |
| **Send reply** (outbound) | 🟡 draft | Tenant approves first per client; can promote to 🟢 per client per topic |
| **Forward** (with or without note) | 🟡 draft | Tenant approves recipient + note before send |
| **Move to folder** | 🟢 auto | Reversible; used for Playbook-configured folder rules |
| **Mark as spam** | 🟡 draft | Tenant approves first — false positives hurt future deliverability |
| **Unsubscribe** (from marketing lists) | 🟢 auto | Only from lists tenant has categorized as "unwanted"; never from client comms |
| **Delete** (permanent — trash then hard-delete) | 🔴 off | Tenant must explicitly authorize per rule (e.g. "auto-delete unread promotional mail older than 30 days from these senders"); never unbounded delete |
| **Create/modify filter or auto-rule** | 🔴 off | Structural change; tenant explicitly authorizes each rule |
| **Change signature or auto-responder** | 🔴 off | Impersonation risk; tenant explicitly authorizes |
| **Bulk operations** (act on N messages at once) | 🟡 draft | Tenant approves the query + preview count before execution, always |

**Authorization capture pattern:** any 🔴 verb the tenant wants to promote to 🟢 must be captured as an explicit **scoped rule** in the tenant's Playbook — e.g. `{ verb: "delete", scope: "sender_in ['promotions@*']", condition: "unread AND older_than 30d", authorized_at: <ts>, authorized_by: <user_id> }`. Rules are per-tenant, per-verb, per-scope. Paige can PROPOSE a rule ("want me to auto-delete unread promos from these 12 senders older than 30 days?") — she never authorizes herself. Rule creation itself is a 🔴 action.

**Impersonation guard:** even when Paige sends autonomously, the recipient sees clear "sent by Paige on behalf of [tenant]" attribution — never impersonation (§13/§7). Tenant may opt in to invisible-Paige mode per client, but the platform default is attributed.

### 4.3 The takeover flows Antonio specified
- **"Take over SMS chatting"** — tenant is mid-SMS with a client, hands the thread to Paige from the chat surface ("Paige, take this over — she's asking about the pricing"). Paige inherits the full thread context, drafts or auto-responds per the client's tier, tenant can un-take-over at any time.
- **"Take over social media chatting"** — same pattern for IG/FB/LinkedIn DMs. Client-side sees the same account; Paige's voice matches the tenant's per §7.
- **"Take over receiving phone calls"** — when the tenant's phone (routed through their tenant Twilio number, or their own number forwarded) rings and they don't pick up, Paige picks up as the tenant's assistant, greets, handles what she can, escalates back to the tenant via SMS+Portal notification for anything she can't.
- **"Make phone calls"** — outbound Paige-initiated calls approved by the tenant (either tier-🟡 draft-and-approve or tier-🟢 for repeat tasks like "call the 5 people who booked but haven't confirmed").

### 4.4 Cross-channel continuity
- A conversation that starts on IG DM and moves to SMS to voice is ONE thread in Paige's inbox — she sees the whole history and can reference it ("You mentioned on Instagram last week you wanted…")
- Client identity resolution: match on phone, email, social handle, portal login — one client record, many channels (Owner Trilogy Pillar 6 owns the identity).
- Handoff between channels is transparent to the client — no "please re-tell me your issue" moments.

### 4.5 Reminders vs follow-ups — two distinct loops
Paige runs TWO different loop types, often confused but structurally different. Both live in the unified conversation fabric; each has its own trigger, audience, and autonomy behavior.

| | **Reminders** | **Follow-ups** |
|---|---|---|
| **Audience** | The **tenant** (Paige's operator) | The **client** (the tenant's customer) |
| **Trigger** | Time-based (Monday morning, 24h before session, 3d before renewal) OR state-based (retainer due, agreement expiring, task overdue) | No-response detection (N days since Paige sent, no reply) OR bounce/decline OR partial-completion |
| **Purpose** | *"Hey — you have 3 things to look at this morning"* — surfaces work the tenant owes | *"Following up on the proposal I sent Tuesday"* — nudges the client to act |
| **Channel** | Where the tenant is: portal notification + optional SMS + optional email | Where the client is: same channel as the original send, or channel-hop if unresponsive |
| **Default tier** | 🟢 auto (reminders are safe; the tenant can dismiss) | 🟡 draft (the client sees this; tenant approves tone/timing) |
| **Cadence config** | Per tenant Playbook — daily digest, morning + evening, weekly review, etc. | Per artifact type + per tenant rule — "proposals: nudge on day 3 and day 7; then Paige asks tenant whether to escalate to voice call" |
| **Silencing** | Tenant mutes reminders per topic ("stop reminding me about X for a week") | Client's own Pillar-6 preferences honored (opt-out = no follow-up on that channel) |

**Reminders are cheap and near-continuous** — think of them as Paige's ambient signal to the tenant that keeps them on top of their business. Follow-ups are rarer, always client-facing, and always respect the client's consent + preferences.

**Cross-refs:** Reminders live in Owner Trilogy Pillar 7 Support/Help + Pillar 2 Communications (tenant side). Follow-ups live in Pillar 2 Communications (client side) + Pillar 3 Documents (for deliverable-tied nudges).

---

## 5. §16 autonomy-tier matrix (per action × channel)
Every action needs a default tier, configurable per tenant + per client. This is the load-bearing governance layer.

| Action class | Default tier | Notes |
|---|---|---|
| Read inbound + summarize | 🟢 auto | Always safe |
| Draft outbound reply for tenant review | 🟢 auto | Never sends without tenant click |
| Send outbound message (any channel) | 🟡 draft | Tenant must approve first send per client; can promote to 🟢 |
| Take over live conversation | 🟡 draft | Tenant explicitly hands over; can pause anytime |
| Auto-answer inbound (any channel) | 🔴 off | Tenant opts in per client + per topic; then becomes 🟢 |
| Outbound reminder call | 🟡 draft | Tenant approves the call script + call list |
| Outbound cold call / re-engagement | 🔴 off | High-stakes; tenant explicitly opts in |
| Send deliverable via any channel | 🟡 draft | Tenant approves the deliverable AND the channel choice |
| Financial-adjacent commitment (payment, contract) | 🔴 off | Never auto — always tenant-approved (§13 honest reporting, §38 money boundary hygiene) |
| Email — read/label/archive/snooze/mark-read | 🟢 auto | Safe cosmetic + organizational actions; see §4.2.a for full email verb matrix |
| Email — draft reply | 🟢 auto | Queued for tenant approval; never sends |
| Email — send / forward / mark-as-spam | 🟡 draft | Tenant approves first send per client; promotable per rule |
| Email — delete / modify filter / change signature | 🔴 off | Requires explicit Playbook rule with scope + condition; never unbounded (§4.2.a) |
| Reminder to tenant (daily digest, task nudge, deadline flag) | 🟢 auto | Tenant can mute per topic or globally; ambient by design |
| Follow-up to client (no-response detected) | 🟡 draft | Client-facing; tenant approves tone + timing; respects client Pillar-6 preferences |

Tenant can promote any 🔴 → 🟡 → 🟢 per client per topic in their Playbook. Any demotion is instant (a tenant can pull authority back mid-conversation).

---

## 6. Infrastructure dependencies (all EXTEND existing seams per §18)
- **Twilio Programmable Messaging** (SMS) — existing skills: `twilio-send-message`, `twilio-messaging-services`, `twilio-sms-send-message`, `twilio-sms-isv-setup` for per-tenant number provisioning
- **Twilio Voice + ConversationRelay** — existing skills: `twilio-voice-outbound-calls`, `twilio-voice-conversation-relay`, `twilio-voice-twiml`, `twilio-conference-calls`, `twilio-call-recordings`
- **Twilio compliance** — `twilio-compliance-onboarding` (A2P 10DLC for US SMS, STIR/SHAKEN for voice) — per-tenant, non-negotiable regulatory work
- **ElevenLabs ConvAI** — already wired (`agent_1601k7zn6bs7e72bt6485bp99v4a`, Ivanna voice, Turbo v2.5 as of 2026-08-08 hotfix)
- **Email — outbound transactional** — existing `send-transactional-email` edge function (per Bug B PR #397); tenant-brand-threaded renderer already lands per-tenant
- **Email — inbound + full management (read/label/archive/draft/reply/delete/etc. per §4.2.a)** — per-tenant Gmail API OAuth (Google Workspace + personal Gmail) AND per-tenant Microsoft Graph OAuth (Outlook 365 + Exchange). Each is per-user consent, scoped to the specific verbs the tenant authorizes. IMAP fallback for tenants on other providers (basic verbs only — labels/folders vary). Never a shared inbox; every tenant's mailbox is auth-scoped to that tenant.
- **Email — rule engine** — new tenant Playbook surface where authorization for 🔴-tier email verbs (delete, filter modify, signature change) is captured as scoped rules (verb + scope + condition + authorized_at + authorized_by). Rules are per-tenant, versioned, revocable instantly.
- **Reminders engine** — new (or extend existing `paige_scheduled_tasks` if it exists) — time-based + state-based triggers evaluated on a cron cadence, feed into the unified inbox as tenant-facing reminders. Distinct from follow-ups (client-facing, per §4.5).
- **Follow-up loop** — extends the bounce/no-response detector (§9 item 12) into the full follow-up cadence rule engine per §4.5.
- **Meta Graph API** — new connector (Instagram + Facebook Messenger); per-tenant OAuth for each tenant's business account
- **LinkedIn / X API** — new connector; per-tenant OAuth; only one of the two in MVP per install
- **Unified inbox storage** — new table `paige_conversations` (or extend existing `communications_log`) with `channel`, `client_id`, `tenant_id`, `thread_id`, `direction`, `status`, `autonomy_tier_applied`
- **Client identity resolver** — new service resolving phone/email/social-handle/portal-user → one `client_id` per tenant

Nothing is a fork; every piece extends an existing seam (§18) or adds a new connector under the existing MCP/connector pattern.

---

## 7. Client-side experience guarantees (§7, §36)
- **Tenant brand end-to-end** — every SMS, every email, every voice greeting, every landing page carries the tenant's brand, not Paige brand. Paige is invisible to the client unless the tenant explicitly opts in to "Paige-branded assistant" mode.
- **First-5-minute test (§36)** — a client who receives a Paige-authored proposal via SMS link should be able to view + sign it within 5 minutes with no help. If not, the delivery UX fails.
- **Consent honored** — a client who opted out of SMS never receives a Paige SMS (Owner Trilogy Pillar 6, Communication preferences OWN'd by client)
- **Recording disclosure** — voice calls disclose recording per US state law (two-party states get "this call may be recorded" upfront)
- **Data-sharing consent** — the client sees clearly WHO is on the other side ("This is Paige, [tenant]'s assistant") when Paige takes over — never impersonation

---

## 8. Cross-refs to Owner Trilogy matrix
This spec extends the workflow spanning three pillars:
- **Pillar 2 — Communications (§4.2 of matrix)** — this spec adds every non-portal channel (SMS, social, voice) and the takeover flows
- **Pillar 3 — Documents & Deliverables (§4.3 of matrix)** — this spec adds the authoring-in-chat + delivery-choice + acceptance-loop workflow
- **Pillar 5 — Sessions & Calendar (§4.5 of matrix)** — outbound reminder calls fire from session/appointment triggers

Ownership taxonomy stays as-is in the matrix. This spec is the WORKFLOW that operates within that ownership.

---

## 9. Owed downstream work
1. **Twilio per-tenant provisioning** — each tenant gets their own Twilio subaccount + phone number(s) + A2P 10DLC registration flow. Per `twilio-sms-isv-setup` and `twilio-organizations-setup` skills. Compliance is table-stakes; must ship with capability.
2. **Meta OAuth per tenant** — Instagram Business + Facebook Page connect flow in tenant settings; token refresh handling; scoped to messaging permissions.
3. **LinkedIn / X OAuth per tenant** — same pattern.
4. **Unified inbox surface in tenant app** — new page (or extension of existing chat surface per §20 "one chat is where Paige operates"). Thread list, channel filter, autonomy-tier badges, takeover controls.
5. **Client identity resolver service** — dedupe/merge across phone/email/social/portal for a single client record per tenant.
6. **Delivery-choice prompt component** — Paige's chat UI that presents the SMS/Email/Portal/Voice picker with defaults + reasons.
7. **Signable landing page template** — tenant-branded, one URL per artifact, works for signature capture + view-only.
8. **Autonomy tier config surface** — tenant Playbook UI where they set default tier per channel per client per topic. Tier promotion/demotion is a client-level control.
9. **Consent + preferences enforcement** — every send checks the client's Pillar-6 preferences before firing; a violation is a §32 defect, not a warning.
10. **Recording + disclosure infra** — voice call recording per `twilio-call-recordings`; jurisdiction-aware disclosure prompts.
11. **Cross-channel history stitcher** — service that assembles the unified conversation view from per-channel logs.
12. **Bounce / no-response follow-up loop** — Paige detects N-days-no-response and drafts a follow-up per tenant's cadence rules.
13. **Gmail + Outlook OAuth per tenant** — per-user consent flows (Gmail API + Microsoft Graph); IMAP fallback for other providers; scoped tokens with refresh handling; consent revocation instantly kills Paige's access.
14. **Email rule-engine surface (Playbook UI)** — where the tenant captures 🔴-tier email verb authorizations as scoped rules (verb + scope + condition). Rule creation is itself 🔴 (Paige proposes, tenant clicks). Rules versioned + revocable. Audit trail per rule execution.
15. **Reminders engine** — cron-driven evaluator over time-based + state-based tenant reminder rules; feeds unified inbox as ambient tenant-facing signal (per §4.5).
16. **Full email verb infra** — 15+ email verbs (§4.2.a) implemented against Gmail API + Microsoft Graph, each verb wrapped in the autonomy-tier check + audit log. Bulk operations gated behind explicit preview + tenant confirmation.

---

## 10. Verification requirements when this ships
- **§32 dual-leg** per channel — fidelity + behavioral. Behavioral covers: inbound arrives → surfaces in unified inbox → Paige drafts per tier → tenant approves → send → client receives → response comes back on same or different channel → thread stitches.
- **§32.b SET ROLE authenticated repros** — cross-tenant + cross-client isolation for the inbox. Tenant A never sees Tenant B's threads. Client A's SMS never surfaces under Client B.
- **§37 producer inventory** — every send path across every channel × every autonomy tier. Confirm no code path bypasses the tier check.
- **§39 peer-gate** on RLS + tier-check + consent-enforcement changes.
- **§32.c post-deploy Playwright drive** — one drive per channel: inbound → surfaces → draft → approve → send → verify receipt. Live-drive tests where I (Cowork) or Antonio hand a real message/call to prove the loop.
- **§7 brand test** — a client on every channel sees tenant brand, never Paige brand.
- **§38 money-boundary test** — any payment/subscription/invoice communication routes to the tenant's own processor; no client→tenant money ever through Paige's bank.
- **Compliance tests** — A2P 10DLC (US SMS) registered per tenant; STIR/SHAKEN (US voice) posture verified; recording disclosure fires per US state law; GDPR consent respected for EU clients.

---

## 11. Related doctrine cross-refs
- **§7** — Paige is the intelligent portal (two-way) — this spec makes it two-way across ALL channels, not just portal
- **§8** — Paige runs a team (Owner Ops + Client Experience departments) — the omnichannel layer is where Client Experience actually operates
- **§9** — Tenant/operator seam — every channel is tenant-scoped; God/Super Admin never appears in a client conversation
- **§10** — Paige-governable — every channel has callable seams for Paige to act on
- **§14** — Paige never works solo — the omnichannel layer runs specialists per channel (SMS agent, voice agent, social agent, deliverable-author agent)
- **§15** — Paige is the innovative one — she proposes the delivery channel, she proposes the next move on a stalled thread
- **§16** — Autonomy tiers — the load-bearing governance for who does what across the omnichannel surface
- **§18** — One home per capability — extends existing seams (Twilio, ElevenLabs, send-transactional-email), doesn't fork
- **§20** — Team dispatch is a chat act — the tenant tells Paige to "take over" in the chat, not through a separate surface
- **§21** — One Studio session per project — client deliverables are Studio artifacts, in the same session as the rest of the project
- **§36** — Intuitiveness moat — every channel's UX passes the 5-minute test
- **§38** — Money boundary — any payment communication respects the money boundary

---

## 12. Open items intentionally deferred (not MVP)
- WhatsApp Business (until proven acquisition channel)
- Group / multi-party threads (single-thread MVP)
- Video call join (Zoom/Meet observer)
- Voicemail-drop cold calling (deliberately conservative; TCPA territory)
- Predictive dialer / high-volume outbound (not the Paige positioning)
- Multi-language voice AI (English-only for MVP voice; text supports Playbook language)
- Fax (deliberately never)

## 13. Explicitly NOT deferred — architecturally out of scope
- **Agency-parent direct client-facing operations** — never. Agencies that need direct client operations run through their own sub-account (§2.3). The agency-parent layer is management/configuration/curation only, per §9 seam and Owner Trilogy matrix. This is not "we'll add it later" — it's a design decision that keeps the seam clean and prevents the agency parent from becoming a fake-tenant surface competing with sub-accounts.
