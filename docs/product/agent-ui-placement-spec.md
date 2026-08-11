# Paige Agent UI Placement — LOCKED SPEC

**Status:** Approved by Antonio Cook 2026-08-08.
**Owner:** Product (Antonio) with Cowork.
**Build owner:** Claude Code, when Paige-surface work fires.
**Doctrine anchors:** §7, §8, §10, §11, §14, §16, §18, §20, §21, §35, §36, §46 in `CLAUDE.md`.

---

## 1. Purpose

Where the Paige agent surface — the chat that dispatches her team, streams her work, and lets the operator/tenant/client talk to her — physically lives across every part of the platform.

This spec settles the "one home per capability" question (§18) for the Paige interaction surface itself, so we never end up with a floating widget AND a sidebar AND a dedicated nav page all fighting each other.

---

## 2. Problem statement

Paige is orchestrated via chat (§20 — team dispatch is a chat act, never a separate surface). But the chat itself needs a physical placement, and it has to work across every context: desktop platform surfaces, the Vibe Studio, the Customer Portal, mobile, and the marketing site. One pattern force-fit everywhere breaks in some context; different patterns without a system feels inconsistent.

The solution is a layered system where the *primary* Paige surface adapts to context, unified by a single universal keyboard shortcut and a single conversational fabric.

---

## 3. Design principles (non-negotiable)

1. **Universal** — reachable from every authenticated surface (§35 OS north star, §36 intuitiveness moat).
2. **Always available** — never more than one keystroke or tap away.
3. **Context-aware** — knows which surface the user is on and can act on it.
4. **Persistent conversation** — chat carries across page navigation; state does not reset (§46 rhythm).
5. **Non-intrusive** — doesn't cover the primary work surface when idle.
6. **One home per context** (§18) — one Paige surface per app-mode, not three competing patterns.
7. **Chat is the control surface** (§20) — team dispatch, task list, approvals, memory recall all live IN the chat, never as separate tabs/panels.

---

## 4. Recommendation summary

**Hybrid — right-rail as primary + command-K launcher + surface-specific overrides.**

Not one pattern. A layered system:
- **Right rail** on platform surfaces (persistent, collapsible, always-there teammate).
- **Studio session IS Paige** (no separate rail — §21 one-session-per-project).
- **Floating avatar → full-screen chat** in the Customer Portal (mobile-first).
- **No chat** on the marketing site.
- **⌘K / Ctrl+K** opens Paige from any authenticated surface.

---

## 5. Surface-by-surface behavior

| Surface | Primary Paige placement | Rationale |
|---|---|---|
| **Desktop platform** (Command Center, Marketplace, Fleet, Analytics, Setup) | Persistent right rail — docked, collapsible. Chat + task list + Paige's live status. | Operator is orchestrating; Paige is a visible teammate, not a hidden tool. Mirrors Linear/Cursor. |
| **Vibe Studio** | The Studio session IS Paige (§21). No separate rail. The session composer + streaming artifacts + project rail ARE the chat. | §21 explicitly bans a Paige rail inside Studio — Studio's whole UI is her chat. |
| **Customer Portal** (tenant's clients, mobile-first per BRD) | Floating avatar bottom-right → tap opens full-screen chat (ChatGPT/Claude mobile pattern). | Clients aren't managing a platform; they're talking to their coach's AI. Full-screen is the mobile default. Fallback to Home/Chat/Profile nav pattern if floating doesn't feel right in usability testing. |
| **Landing / marketing site** | No persistent chat. | §11 primary content leads. A chat widget on a landing hurts conversion. |
| **Setup / onboarding wizard** | Guided embedded chat — Paige leads the tenant through setup as a conversation (Systems Check MVP onboarding surface). | Onboarding IS the introduction to Paige. She drives it. |
| **Every authenticated surface** | ⌘K / Ctrl+K opens Paige from anywhere. Focused input over current surface, dismisses when done. Expands to full session on demand. | Power-user pattern (Superhuman/Linear/Raycast). Auth-gated only — marketing stays clean. |

---

## 5a. Account-type variations

The surface-by-surface placement above is the DEFAULT for a Solo tenant with a single operator. Account type modifies the primary Paige surface as follows.

### Solo tenant (default)

Right rail as spec'd in §5. Full Paige capability. No context switcher — Paige always operates in the single business's scope. Baseline everything else layers on top of.

### Sub-account (nested under an agency parent)

Right rail placement identical to Solo — the operator running a sub-account should feel like they're running their own business. Paige knows the account is under an agency parent internally (uses agency-cascaded defaults + templates + marketplace curation per §9 and the Wave 3.9 work), but the word "agency" doesn't intrude on the sub-account operator's daily UX unless it's relevant (e.g., "your agency curated this marketplace item").

§9 boundary is absolute: the sub-account's Paige never sees sibling sub-accounts' data. Cross-sub-account reads always blocked at the RLS layer.

### Agency (parent tenant with sub-accounts)

Right rail present, PLUS an **agency-context scope switcher** in the chat header. The switcher shows:

- `Agency view` (default) — cross-sub-account queries, agency-level directives
- `[Sub-account X]` — narrows Paige to that sub-account
- `[Sub-account Y]` — narrows Paige to that sub-account
- ...one row per sub-account, searchable when the list gets long

**Agency-view capabilities:**
- Cross-sub-account queries ("show me all sub-accounts with clients trending at-risk this week")
- Agency-level directives (curate marketplace items, set defaults, cascade branding)
- Agency KPI rollups (aggregate MRR, active clients, at-risk count)
- Cannot write to individual sub-account records at this scope (that would violate §9 — must switch scope to write per-sub-account)

**Sub-account scope (from agency view):** switching to a sub-account narrows Paige to that sub-account's data + capabilities. The agency admin operates AS that sub-account, with a persistent "Viewing as [sub-account name]" banner and every action logged with BOTH identities per §17.

### Super Admin / God (platform operator — us)

Right rail present, but with a distinct Paige identity: **"Paige Operator"** — a separate agent persona (its own system prompt, tool scope, and avatar treatment) that operates at platform scope. Terser voice, less warm than a tenant's Paige, fleet-focused framing.

**Operator-only affordances in the chat surface:**
- Fleet queries ("which tenants have at-risk billing this month? which tenants haven't onboarded a first client after 14 days?")
- Cross-tenant break-glass access — §17 two-key rule enforced IN-CHAT. Paige Operator asks for the second key + reason code before returning any cross-tenant PII. Every break-glass action lands in append-only audit.
- Tenant provisioning surfaces (create new tenant, upgrade tier, issue invites — see Promo/Invites spec)
- Audit-log recall ("show me all issuances of Solo promos in the last 30 days")
- Cost/health telemetry ("what's Paige's model-router spend across the fleet today?")

**Visual differentiation:** the Super Admin Paige surface uses a distinctly different avatar/color hint so the operator always knows they're in Paige Operator mode, not accidentally acting as a tenant's Paige. Never confused with the tenant experience.

**⌘K weight:** operators are query-heavy — the ⌘K launcher is used more here than anywhere else in the platform. Fast fleet-wide questions without context-switching pages.

### Client (Customer Portal)

Floating avatar → full-screen chat as spec'd in §5. The Paige here is the **tenant's Paige** — §7 tenant-authored persona, tenant brand, tenant voice. The client never sees Paige Operator or an agency-level Paige — they only ever see their coach's / consultant's / agency's Paige as configured by that tenant.

## 5b. Cross-account switching UX (impersonation + scope switching)

When a Super Admin operates AS a tenant (for support), or an agency admin operates AS a sub-account (via the scope switcher):

- **Persistent banner** in the chat surface + top of app: `Viewing as [account name] · All actions logged · Exit`
- **Paige persona shifts** to the impersonated account's persona (tenant-authored per §7). The operator sees what the tenant would see.
- **Every action logged with both actor identities** — the real actor (Super Admin / agency admin) AND the impersonated account. Append-only per §17.
- **Exit control always visible** — one-click return to the operator's own scope. No wandering around forgetting you're impersonating.
- **Write-action confirmation** — writes made during impersonation require an extra confirm ("You're about to send this message AS [account]. Confirm?") — belt-and-suspenders against operator confusion.

---

## 6. What lives inside Paige's chat (never as separate tabs/panels)

Per §20 — the chat is the control surface, not a wrapper around one:

- **Team dispatch** — spawning sub-agents happens by asking; their status streams back in the transcript.
- **Task tracker** — Paige's current work + approvals owed live in the chat, not a separate task tab.
- **Draft-then-approve moments** (§16 🟡 autonomy tier) — inline decision cards in the conversation.
- **Memory / recall** — Paige surfaces "I remember when you..." inline, not in a separate memory tab.
- **Cross-department handoffs** (§8/§16) — visible in the transcript as messages between named sub-agents.

---

## 7. What was explicitly rejected

- **Single floating widget everywhere** — reads as a chatbot toy, undersells "hiring her team" per §14. Reserved for Customer Portal only.
- **Dedicated "Paige" nav item that opens a full page** — breaks §46 always-available rhythm (user has to navigate away from work).
- **Only command-K launcher** — hides the ongoing conversation, breaks "visible teammate" per §14.
- **Agent-team management panel** — §20 explicitly bans this. Team is orchestrated in chat.
- **Artifact-type tabs inside Studio session** (Page / Copy / Form / etc.) — §21 explicitly bans this.

---

## 8. Answered questions (owner-approved 2026-08-08)

1. **Right-rail collapse default** → Start docked OPEN for first 3 sessions per user, then remember collapsed state after. Onboarding + intuitiveness both matter (§36).
2. **Customer Portal — floating avatar vs Home/Chat/Profile nav** → Floating avatar. Client's Paige should feel like a person, not a menu item. If usability testing shows the floating pattern doesn't land, fall back to Home/Chat/Profile nav.
3. **⌘K scope** → Auth-gated only. Marketing site stays clean.
4. **Studio's chat visual language** → Same underlying primitives, Studio adds the cinematic layer on top (§22). One system, two skins.

---

## 9. Owed downstream work (file as tasks when build fires)

1. **Right-rail primitive** — new shared component in `@/components/ui/paige/`. Docked right, collapsible, remembers state per-user. Wraps the existing Paige chat surface. Session-count persistence in profile prefs.
2. **⌘K universal launcher** — global keyboard handler mounted at the auth-gated app root. Opens a focused Paige input modal over the current surface. Escape dismisses. Expand button hands off to the right-rail (desktop) or full-screen chat (mobile/portal).
3. **Customer Portal floating avatar** — new component in `@/components/portal/`. Renders bottom-right on portal surfaces only. Tap opens full-screen chat. Uses portal-brand resolver, not Paige mark (§7 tenant-authored — see also the Bug B fix on `FloatingChatbot.tsx` for the pattern).
4. **Studio chat consistency pass** — audit existing Studio session composer against the shared Paige chat primitives. Confirm the "same primitives, cinematic layer" contract holds. Filed as a design-critic follow-up (§25/§27).
5. **Marketing-site exclusion** — ensure the landing page and any public marketing surfaces do NOT mount the right-rail, floating avatar, or ⌘K handler. Auth-gate check on the layout wrapper.
6. **Right-rail collapse state persistence** — `paige_rail_collapsed` in the user profile prefs table (bool + session-count int). Ships with the right-rail primitive.
7. **Agency scope switcher** — new component embedded in the right-rail chat header, only rendered for agency-parent tenants. Lists sub-accounts, active scope selector, agency-view default. Wires into RLS-scoped queries so Paige's context follows the switcher.
8. **Paige Operator persona** — separate agent identity for Super Admin. Own system prompt, own tool scope (fleet queries + break-glass + provisioning), own visual differentiation (distinct avatar/color hint). Uses the same right-rail primitive but with the operator persona swapped in.
9. **Break-glass two-key gate in-chat** — when Paige Operator is asked for cross-tenant PII, chat surface prompts for second-key + reason-code inline. Every break-glass action lands in `paige_audit_log` per §17.
10. **Impersonation banner + exit control** — persistent banner shown whenever an operator or agency admin is viewing-as another account. Exit control always visible. Extra confirm on writes during impersonation.
11. **Dual-identity audit logging** — every action taken during impersonation logs both real actor + impersonated actor. Append-only per §17.

---

## 10. Verification requirements when this ships

- **§32 dual-leg** — fidelity + behavioral (drive the actual flows).
- **§32.b SET ROLE authenticated repros** — verify ⌘K + right-rail work as EACH account type (Solo tenant, sub-account operator, agency admin at agency scope, agency admin scoped into a sub-account, Super Admin, client); verify floating avatar only appears on Customer Portal surfaces; verify marketing-site exclusion holds; verify break-glass second-key gate blocks unauth reads.
- **§37 producer inventory** on the right-rail, ⌘K, agency scope switcher, and Paige Operator persona components — enumerate every surface that mounts them.
- **§39 peer-gate** independent of author on the layout wrappers, agency scope switcher, and impersonation logging (all touch auth-gating logic — deserve independent read).
- **§32.c post-deploy** live-drive via the Playwright helper — one script per surface class × per account type (5+ combinations) confirming the expected placement holds AND the correct Paige persona renders for that account type.
- **Impersonation audit test** — write action during impersonation → verify `paige_audit_log` row includes both real_actor_id and impersonated_actor_id.

---

## 11. Non-goals of this spec

- **This spec does not design the chat UI itself** — that lives in the shared Paige chat component. This spec is about PLACEMENT, not the chat's internal design.
- **This spec does not define motion / cinematic treatment** — Studio's cinematic layer is defined in §22 doctrine, not here.
- **This spec does not include the Systems Check MVP build** — that's a separate feature that USES this placement (embedded chat in setup wizard) but is defined elsewhere.

---

## 12. Related doctrine cross-refs

- **§7** — Paige is the intelligent client portal (two-way).
- **§8** — Paige runs a team, orchestrated via chat.
- **§10** — Everything must stay Paige-governable via callable seams.
- **§11** — World-class UI floor; no amateur tells.
- **§14** — Paige never works solo; user is hiring her team.
- **§16** — Autonomy tiers 🟢 auto / 🟡 confirm / 🔴 briefed.
- **§18** — One home per capability; grep-first four-question gate.
- **§20** — Team dispatch is a chat act, never a separate surface.
- **§21** — One session per Studio project; no artifact-type tabs.
- **§22** — Studio's cinematic bar; earned motion.
- **§35** — OS north star; Paige addressable from any surface.
- **§36** — Intuitiveness moat; 5-minute usability for non-technical users.
- **§46** — Cowork operating rhythm; state persistence across sessions.
