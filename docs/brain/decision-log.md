# Decision Log — chronological one-liners

- **Billing Foundation A — workspace billing identity, Owner-only authority, and DESIGNATED billing recipients (branch `claude/billing-foundation-a`, draft PR, 2026-09-02; NOT MERGED, NOT APPLIED, NO DELIVERY)** — the shipped portal and subscription lookups resolve a Stripe Customer by the signed-in person's **email** (`customer-portal/index.ts:43`, `check-subscription:58`) with no workspace mapping and no owner gate (Gate 1 finding A1, HIGH). Foundation A puts one server-authoritative seam under it: `platform_billing_accounts` (one top-level workspace → one platform Stripe Customer, never by email, sub-account refused by trigger), the strict resolver `billing_active_tenant_id()` (active workspace **iff** the caller holds an active seat there — no agency/operator/oldest-membership fallback, and the proof shows `current_user_tenant_id()` DOES fall back for the same user), the one read `get_workspace_billing_authority()` (never returns a Stripe id; distinguishes `absent` / `ambiguous` / `not_applicable` so nothing can render "no subscription" for a skipped read), a re-runnable `platform_billing_account_reconcile()` that maps only unambiguous LAYER-1 records and RETURNS the ambiguous ones, a default-off `platform-billing-portal` function (`PLATFORM_BILLING_PORTAL_ENABLED`, key chosen by the mapping's account NAME, no fallback), a refusal guard in the legacy `customer-portal` for any platform customer, and the mapping upsert at BOTH webhook write sites. **Same day the owner ruled the billing-notification policy and it was designed in before the first commit:** `platform_billing_recipients` — a workspace names at least one **verified Owner** as `billing_owner` before a paid plan may activate, an Owner may designate current active **Admins** as `billing_delegate`, nothing is inferred from a signed-in email, no Admin receives notices automatically, and **receive / view / manage are three separate permissions** (a delegate gains nothing but the notices); eligibility is a trigger so it binds every writer; designate/revoke are Owner-only RPCs audited in the same transaction; the last `billing_owner` of a subscribed workspace cannot be revoked; `platform_billing_paid_activation_ready(tenant)` is the server gate the LATER activation release must call; `platform_billing_notification_log` is the delivery ledger with the explicit Stripe-backed event catalogue as a CHECK (parity-tested against `_shared/billing-notifications.ts`, whose pure `decideBillingNotice` never sends a payment notice to a Promotional/trial workspace and never sends on an unknown entitlement). **DELIVERY IS NOT WIRED — no sender exists anywhere, and the proof asserts the ledger is empty after every act.** **PROVEN on prod inside `BEGIN … ROLLBACK`: 54/54 properties (P1–P54, real caller roles via `request.jwt.claims` + `SET LOCAL ROLE`), and 5/5 mutants CAUGHT** (resolver swapped for `current_user_tenant_id()` → P15 red; owner predicate keyed on `role='owner'` → P48 red; ambiguity collapsed → P12 red; sub-account trigger dropped → P7 red; recipient guard dropped → P26 red) — `scripts/sql/platform-billing-account-proof.sql` + `-mutants.sql`, nothing persisted (re-probed: 0 tables, 0 functions, 0 fixture rows). **Prod facts read at the same time:** 0 reconcile candidates (all 4 `platform_subscriptions` rows carry a NULL customer id — the comped rows), 0 `tenants.stripe_customer_id`, 7 top-level Solo tenants of which 4 have a verified active Owner and 3 have NO active owner at all — so the migration's backfill inserts **zero** rows on prod and no workspace is paid-activation-ready until an Owner designates. Lessons that cost a run each and are now in the proof file: an `auth.users` insert already creates the profiles shell (`handle_new_user`), `trg_guard_active_tenant` refuses a pointer at a workspace with no seat, `set_config(request.jwt.claims, …, true)` outlives `SET LOCAL ROLE` and must be cleared explicitly, temp tables need grants for the impersonated roles, and a `ROLLBACK TO SAVEPOINT` discards the mutation results written inside it. **UNVERIFIED, stated:** the authenticated owner drive of the deployed portal (headless session; flag stays off until it lands); `deno check` on functions importing supabase-js 2.57.2 (upstream esm.sh 404, not our code). Gate B for this slice asks for merge + migration apply + edge deploy with the flag unset — no Stripe object, no price, no charge, no entitlement, no email.
- **Both phone-number UI lanes now send the price they displayed, and the legacy operator tab asks before charging (#717 `0fb179bb`, MERGED 2026-09-01)** — the agent lane had a quote guard and server re-verification; the two lanes a HUMAN clicks had neither. Both posted `{ phone_number }` only, and `comms-purchase-number` guards its `platform_number_pricing` re-check on `if (agreedMonthlyCents !== null)`, so the check was **skipped entirely** for them — a price that moved between the search and the click was simply charged. The legacy `NumbersTab` was worse: `onClick={() => void buy(n)}`, **no confirmation of any kind**, rendering the price as `—` when the operator had not priced the type, so one click could start a recurring charge at an amount nobody was shown. **FIXED:** Solo passes the `priceCents` its confirm already named (it had the figure on screen and simply never sent it); the legacy tab sends `retail_price.monthly_cents` and asks first, in Solo's existing wording so the two read as one product (§6). Both omit the key when the type is unpriced — there is nothing to hold anyone to — which preserves today's behaviour rather than blocking a working path. **§37 consumer half, which is the part that would have been missed:** sending the amount means these lanes can now RECEIVE `price_changed` / `price_unverifiable`, and **neither surface knew those codes** — the right refusal would have surfaced as *"try another number"*. Copy added to both (`connectError.ts` COMMS_COPY and `purchaseFailureCopy`). **The legacy tab had NO test**, which is how one-click buying survived; `NumbersTab.purchase.test.tsx` is its first, and **5 of its 7 cases fail against the previous version**. The Solo assertion used `toMatchObject` and so passed whether or not the amount was sent — now `toEqual`, and it fails against the old code too. **UNRULED:** an unpriced number is still buyable on both lanes with the confirm saying "an unlisted monthly price". Whether that should be possible is a product question, not a defect. **Landed in two commits, and the second is the lesson:** the first widened `purchase()`'s implementation and call site but left the exported `SoloNumbersData` interface declaring one parameter, so CI's typecheck ratchet failed with `TS2554` on `settings.tsx` — a type-only defect no test could catch, because `settings.numbers.test.tsx` drives the real hook and the runtime path was correct throughout. See `lessons-learned.md`, *"Widening an implementation without widening the interface that declares it"*.
- **⚠ CORRECTED 2026-09-02 (§58 — the entry stays, its runtime claim does not).** The binding
  described in the next bullet SHIPPED and its migration is applied on prod, but `paige-ai-chat` no
  longer executes through it. The merge of the Chat branch replaced the runtime half with
  `paige_pending_confirmations`, which proves everything below AND executes the STORED arguments and
  requires the operator's Approve click — the two things the bullet itself records as unproven.
  Read the 2026-09-02 entry at the foot of this file before relying on anything below about what
  runs. `_shared/toolConfirmation.ts`, its 65 unit tests and `paige_tool_confirmations` remain in
  the tree; the tests still prove that module's logic and no longer prove anything about the gate.
- **Paige's `confirm:true` is no longer worth anything on its own — the flag must SPEND a server-minted proposal that predates the turn (2026-09-01)** — the autonomy gate in `paige-ai-chat` (~5973) refused whenever `gateArgs.confirm !== true`, a real gate against a caller that merely invokes a tool — but `gateArgs` is `JSON.parse(tc.function.arguments)`, **the model's own output**. *Enforced but self-asserted.* And the bypass needed no human turn: the round dedupe keys on the exact argument string, so `{…}` and `{…,"confirm":true}` are different signatures and a model could propose, receive `needs_confirm`, and self-approve **inside one HTTP turn**. **52 tools** reach it, including `member_grant_role`, `n8n_delete_workflow`, `zapier_run_action` and `comms_buy_number`. **FIXED** by `20261021000000` + two service-role-only RPCs: a `confirm:true` executes only by atomically consuming a proposal for this tool, this requester and tenant, unspent, unsuperseded, unexpired, and **`created_at < turn start`** — the clause that kills the same-turn bypass. **THE DESIGN DECISION WORTH NOT RE-LITIGATING: bind on IDENTITY, never on the whole arguments.** The first version hashed the entire argument object and was **BLOCKED by the §39 peer-gate** as a silent livelock — conversation history is rebuilt as `{role, content}` only (`index.ts` ~4005), tool calls and results do NOT cross a turn, and Approve sends just *"Approved — run it."*, so the model regenerates its arguments from prose; for `document_generate`, whose `blocks` argument **is** the authored document, two generations are never byte-equal, so approve → re-author → refuse → re-propose, forever, with nothing executing and no error. (`index.ts` ~5860 already recorded that exact 4×-reask loop as a flaky bug; the hash would have made it structural.) So the identity is only fields the model can genuinely REPRODUCE next turn, in two honest tiers: **tier 1**, values rendered in `describeConfirm` so the operator sees them and the model reads them back out of prose (`comms_buy_number.phone_number`, `member_grant_role.role`, the n8n `workflow_id`, `zapier_run_action.tool_name`); and **tier 2**, a stable database id the summary does NOT name (`user_id`, `contact_id`, `number_id`) which the model must re-derive by looking the subject up again — deterministic in practice, so the worst case is one extra approval, never an impossibility. The distinction that matters is that a looked-up id can be re-derived and AUTHORED CONTENT cannot. Listed in `TOOL_IDENTITY_FIELDS` ; the tier-2 four are pinned anyway because each guards an irreversible or privilege-changing act. **A real §13/§36 gap surfaced while doing this and is filed rather than silently patched: `crm_delete_contact`'s summary reads "Permanently delete the contact…" and `member_grant_role`'s reads "…to a team member" — neither NAMES the subject, so the sentence the operator is agreeing to does not say who.** Everything else binds at TOOL level, which is the safe default, not an oversight. Price is deliberately NOT in the identity — it has its own quote guard plus server re-verification, and pinning it would livelock a legitimate re-quote. **Multi-spend closed too:** minting SUPERSEDES any earlier open proposal for the same requester+tenant+tool, so at most one is claimable and one approval buys exactly one execution — without that, a model emitting the same call with reordered keys accumulated rows (the dedupe keys on the raw string, the hash canonicalises) and could spend them all on a single human turn. **FAILS CLOSED, deliberately:** an earlier revision carried a "guard not deployed yet" escape that restored the exact self-asserted bypass platform-wide; it is gone. A tool that asks twice while the migration lands beats `member_grant_role` running unguarded (§68). **§18 — not a new mechanism:** generalizes `pipeline_archive_confirmations` (#709); that path keeps its stricter client-echoed token on top, relaxed nowhere. **PROVEN 11/11** against prod inside `BEGIN … ROLLBACK` via the COMMITTED `scripts/tool-confirmation-sql-proof.sql` (rollback verified: `to_regclass` null, ledger 0), plus 46 unit tests including explicit livelock regressions. **THE HONEST BOUND (§13):** proves the server proposed first, that a turn intervened, that one approval buys one execution, and — for the listed tools — that the identity shown is the identity that runs. Does **NOT** prove the operator said *yes*, nor, for unlisted tools, that the CONTENT is unchanged. Binding to an authenticated approval CLICK needs per-surface UI work (`useSoloChat.ts:304` drops the confirm frame entirely) and is tracked separately. **`auto` is unchanged and still has no confirmation — the workspace's own choice (§67).** Note also that `STUDIO_AUTO_TOOLS` flips five build tools to `auto` inside a studio thread, so "all 52" is the gate's reach, not this binding's reach on every surface.
- **The §69 half-install was NOT real — the synced skill is self-contained; what was actually missing is OUR addition, which now ships as a repo-local skill (2026-09-01)** — #708 recorded, and this log repeated, that the account-synced install delivers **`SKILL.md` only** and therefore left §69 half-installed on every fresh container. **That is false.** Reading the files (rather than listing them) shows `synced/<bucket>/flow-by-flow/SKILL.md` at **77,739 bytes** and `flow-prototype/SKILL.md` at **14,353**, each carrying a section headed *"Inlined references (self-contained · 2026-08-30)"* under which every `references/*.md` and `templates/foundation-pack.md` appears in full — with its own preamble giving the reason: *"save_skill accepts a single content field per skill and cannot push modular reference/template files … Inlining below makes the persistent skill self-contained across all sessions."* So the modular files genuinely cannot sync, somebody already solved that on 2026-08-30, **a fresh container receives the complete skill, and §69 is not best-effort.** The "a half-install is worse than an absence" analysis rested on nothing. **The mistake:** a `find` listing showed one `SKILL.md` per synced skill and was treated as an inventory of *content*; the 77 KB size sat in the same output the whole time (`lessons-learned.md` — *"A file listing is not a file reading"*). **The real gap, which is narrower and did need fixing:** the synced bundles are a **2026-08-30 snapshot**, and the knowledge-capture close-out step the owner asked for on **2026-09-01** was written only into this container's modular copy — `grep -c` returns **0** for `Gate 6` / `Knowledge capture` / `capture what the work taught` in the synced copy. Containers are ephemeral (§64) and no session here holds a `save_skill`-style capability, so that addition reached **zero** future sessions. **DECIDED, on the owner's instruction — *"make whatever update we can without changing their copyright work. We are adding to it. Nothing more"*:** ship the close-out as **our own** `.claude/skills/knowledge-closeout/SKILL.md` *[renamed `second-brain/` 2026-09-01 when the READ-first half was added at the owner's request — the path in this entry no longer exists]*, in git, loading on every fresh container, adding to flow-by-flow without modifying or redistributing one line of it. Repo-local discovery is **verified, not assumed** — the skill appeared in the session's available-skills list the moment the file was written. It is also the better home: a third-party generic skill cannot know this repo's knowledge lives in `docs/brain/`, nor that §0 (master reference), §BRAIN.3 (brain) and §66 (tier matrix) each bind a **different** file. **UNCHANGED:** the licence blocker and the four ways to unblock it — the bundles ship no `LICENSE`/`NOTICE` and no upstream URL, and an `author` frontmatter field does not establish who holds copyright, so a reconstructed notice invents an ownership statement (a first attempt did exactly that and was correctly rejected). Leaving it unvendored now costs almost nothing, because the synced install is complete and our addition is versioned. **UNVERIFIED:** whether a *fresh* container also materialises the modular `~/.claude/skills/flow-by-flow/references/` tree — this one has it, and that cannot be distinguished from inside it; immaterial either way, and stated rather than assumed.
- **[PREMISE CORRECTED 2026-09-01 — see the entry above. The vendoring decision below STANDS; the "half-install" it rests on was never real.]** ~~`flow-by-flow` NOT vendored — §69 stays best-effort on a fresh container~~, and the licence blocker is now on record (#708, 2026-09-01)** — §69 makes the skill MANDATORY on every software task and says a session that cannot find it must say so plainly rather than improvise. **A half-install is a worse starting position than an absent one**, because of what the state affords rather than what any session will do: the account-synced install delivers **`SKILL.md` only** — no `references/`, no `templates/` — so on a fresh container the index's own first instruction (*read `references/orchestration.md`*) points at a missing file, and because a skill WAS found nothing presents this as the not-found case. A session following §69 will hit the absence and CAN report it; nothing forces it to, and nothing stops it carrying on either — no loader, no check, no failing branch. **No session has been observed doing so; this is the available failure mode, recorded so it is expected rather than rediscovered.** Also §64 — these are ephemeral remote containers, so a container-local install (and the local Gate 6 close-out step added the same night) dies with the container. **The attempted fix, which did NOT ship:** vendor both bundles as a matched pair at 2.0.1 (the skill's own Gate 5 fails if they drift), behind a `!.claude/skills/` negation in `.gitignore` beside the existing `!.claude/commands/`, whose own comment gives the reason — *"so every session (and every teammate) gets them."* **The negation DID ship; the bundles did not. OUTCOME: the vendoring was ABANDONED, and that is the decision.** The bundles ship no `LICENSE`/`NOTICE` and no upstream URL (the Anthropic-authored siblings beside them DO ship `LICENSE.txt`), so the MIT notice could not be fetched. A first attempt reconstructed one from the `license: MIT` + `author` frontmatter; the peer-gate correctly rejected it, because an `author` field does not establish whether the individual, the company, or both hold copyright — reconstructing it **invents an ownership statement**, and a false notice on redistributed copies is worse than none, which no explanatory caveat cures. So the skills are NOT in the repo. What ships instead is `.claude/skills/README.md`: the blocker, the four ways an owner could unblock it (obtain the notice · obtain written permission · accept the risk explicitly · leave it unvendored), and the local close-out step reproduced in full so it survives. §69 therefore remains best-effort on a fresh container, stated rather than papered over. Caught by the §39 peer-gate, which also caught that this PR — about knowledge capture — had itself skipped the §BRAIN.3 same-commit brain update.
- **Solo phone line — search, buy, rename, choose-what-sends; and the money posture that governs it (#695 `94460ee3`, #699 `90a9d067`, 2026-09-01)** — `comms-search-numbers` / `comms-purchase-number` were deployed and had no Solo caller; one workspace had already bought two numbers through a legacy route a Solo tenant never sees. Now wired: `useSoloNumbers.ts` → `PhoneSetupPanel`/`OwnedNumbers`, with `tenant_phone_number_set_primary` / `tenant_phone_number_rename` as the write seams (`20260901010000`) and eight `comms_*` tools so PAIGE can drive the same half (§10). **The decision worth not re-litigating is the money posture (§38) — and it binds the AGENT LANE, which is the scope correction that matters here:** in the `comms_buy_number` lane a purchase requires a whole, positive `monthly_cents`, the guard sits **ahead of** the autonomy gate in `paige-ai-chat` so it binds in every lane including `auto`, the default lane is `confirm` (`resolveToolAutonomy`: *"safe default — never assume autopilot"*) and its confirmation names the amount — but a workspace MAY switch this tool to `auto`, and then a validly-quoted purchase executes with no confirmation. **Stronger still, and the correction that matters most: even at `confirm` the HUMAN confirmation is not enforced — the gate is two layers.** The server genuinely refuses whenever `gateArgs.confirm !== true` (`index.ts` ~5973), which is a real gate against a caller that just invokes the tool and is why `needs_confirm` reaches the operator at all. But the flag is the MODEL's own output: nothing binds it to the preceding `needs_confirm` or to a human's yes, so a model emitting `confirm:true` on its first call executes immediately. It constrains the careless case, not the deliberate one. The platform already has the enforced pattern — outbound sends file a real `approval_id` row and wait (~8251) — and this gate does not use it. **So on this path: the price check and the presence-of-flag check are both enforced, what is prompt-level is the BINDING of that flag to a human's approval, and the only real human gate anyone meets is Solo's client-side `window.confirm`** — and `comms-purchase-number` re-verifies the quote against the operator price table and returns `price_changed` / `price_unverifiable` rather than spending. **The UI lanes are NOT covered by either check** *[REVERSED 2026-09-01 by #717 `0fb179bb` — both lanes now send the amount they displayed, so the server's re-verification runs for them; see the entry above]***.** Solo `PhoneSetupPanel` and legacy `NumbersTab` both post `{ phone_number }` with no agreed amount, and the server's verification is guarded on `if (agreedMonthlyCents !== null)`, so it is skipped for them entirely — they show the price `comms-search-numbers` read and buy without re-reading it, so a change between search and buy is not caught. **And the two UI lanes are not equivalent to each other — the legacy operator tab is the weakest purchase path on the platform:** `NumbersTab.tsx` calls `onClick={() => void buy(n)}` with **no confirmation step at all** *[CLOSED 2026-09-01 — it asks now, and sends the agreed amount; see the entry above]*, and renders `—` when no retail price is published, so one click can start a recurring charge at an amount never shown. Solo at least confirms, but when `platform_number_pricing` has no row its dialog confirms *"an unlisted monthly price"* *[still true after #717 — the unpriced-but-buyable question is UNRULED, not fixed]*. Deliberate and pre-existing (the function comments it: *"the marketplace UI does not … byte-for-byte what it was"*) and recorded as a KNOWN GAP, never as a protection. Every exit where money may already have left — all four, including the one where the provider succeeded and our record write failed — **attempts** an audit row; `writePurchaseAudit` is non-blocking by design, so a failed insert is logged and nothing else changes, and a completed charge with no audit row is reachable. Do not relax any of these to "simplify" the tool schema: a schema's `required` is not runtime validation, and the version without the guard bought a number on a malformed amount. **Invariant landed with it:** `20261020000000` makes `is_primary` on a non-`active` number unreachable via trigger, after a shipped backfill was found to abort `23505` on exactly the state it was written to repair (see `lessons-learned.md`, "A predicate proof is not a write proof"). **Unchanged and still the ceiling:** no tenant can send an SMS (TrustHub/A2P), and a bought number still has no `VoiceUrl`.

- **Solo Campaigns -> Pipeline Gate 1 approved (2026-08-31; draft, not live)** — owner approved the board-first interaction and ruled the immediate refinement: reduce only the page-title word "Pipeline". Locked outcome: multiple tenant-owned pipelines; campaign linkage optional, not exclusive; tenant-owned stage create/name/describe/reorder/archive/restore through a governed contract; contextual customer/deal detail; compact focused-stage behavior; routing/approval/repair secondary; six Campaigns tabs unchanged. Exact-head Gate 2 is required before merge/deploy. Authenticated durable proof remains UNVERIFIED until preview + persisted migration are available.

What was decided/shipped, newest first. Backfilled from what's discoverable (GitHub PRs, dated
CLAUDE.md rulings, doc dates). **No invented dates** — where a date isn't in the source it's omitted.

Sources this pass: GitHub MCP `list_pull_requests` (repo `mrmogulmaker-bot/paige-agent-ai`, PRs
#375–#409, 2026-08-09); `CLAUDE.md` dated ruling headers; `docs/` filenames with dates.

## Recent PRs (#375 → #543)

- **OWNER RULING — Solo Systems Check Operating Signal approved for draft implementation
  (2026-08-29).** Systems Check is PAIGE's compact business-awareness layer, not an isolated BI
  dashboard. The approved draft reads only persisted tenant-scoped evidence, presents truthful
  confirmed/attention/unavailable coverage, uses interruptible read motion with reduced-motion
  parity, opens the one existing PAIGE workspace for a fuller rundown without prefill or execution,
  and keeps the final go-live gate separate. The grounding chain is signal → provenance → impact →
  recommendation → owner decision → durable outcome. Market pulse, capacity/watchpoint expansion,
  and A2P readiness remain unavailable unless canonical contracts later back them; no competing
  phone readiness logic is authorized.

- **OWNER DIRECTIVE — every capability wires back to BOTH brains (2026-08-19)** — verbatim: *"For each
  one of these functions, we always wire back to the second brain… We need to make sure that we always
  wire everything back to Paige Agent AI's primary brain. That way, she can always call on any one of
  the departments or any particular URL that our platform has on a per-tier basis. For the God-level
  tier, she should be able to call on every aspect of the platform that's feeding the brain."* ·
  *"That way, as we grow, Paige becomes more aware of the entire platform."* · *"Basically, there would
  be very few functions that Paige Agent AI's brain is not aware of."* Landed as
  `docs/brain/paige-brain-wiring-standard.md` — the two brains distinguished, a 5-point checklist per
  capability, the four real layers of her runtime brain, and a running coverage ledger. **Systems Check
  is the first tracked gap** (verified: absent from `paige-mcp`, `paige-ai-chat` AND the §52 operator
  briefing — she cannot answer "is the platform healthy?"); the tool spec is written but deliberately
  NOT built inside the Systems Check UI fire (§55).
- **OWNER DIRECTIVE — capture the tier-port pattern for reuse (2026-08-19)** — verbatim: *"We also will
  need to recall this exact same info of how well we perfect this for all of the other tenant tiers…
  Agency is not going to operate like a solo or a sub-account, nor like the enterprise, but they're
  gonna be extremely close in scope."* Landed as `docs/brain/cd-pack-port-playbook.md`.
- **OWNER RULINGS A/B/C — Systems Check sub-tab + operator chrome (2026-08-19).**
  **(A) Slide-out Paige chat:** kill the floating orb; ✦ button top-right; panel slides from the RIGHT
  **over** content (never pushes/shrinks); persistent thread that does **not** fork; applies to ALL
  operator surfaces. Pack-confirmed: the ✦ sits BETWEEN the status pill and the moon (CD 263), the
  panel is `min(430px,100%)` (CD 2285), and CD's own footer states the contract — *"Same brain as the
  Paige tab — one thread, two doors."*
  **(B) "Run full sweep" = Option 3, BOTH halves** from one button — operator scope AND all-tenant
  sweeps. Implemented as a direct edge invoke (operator, returns a real summary) + a new
  `enqueue_fleet_systems_check()` RPC (fleet, fire-and-forget → the UI says "started", never "swept").
  **(C) Keep CD's 13 categories structurally; reconcile the numbers, §13 wins over pack copy.**
  Resolved with live data, and neither offered fix was right: 10 checks DO run — `pass 4 + fail 1 = 5`,
  so **five SKIP every hour**, including `operator_cross_tenant_canary` (**blocking**, never run — an
  unassessed §9 cross-tenant blind spot). KPI now reads "4 of 10" + "5 could not run".

- **OWNER RULING — Stage 2 revised order: Fleet Console → Paige → Trust Compass; Money Spine deferred
  (2026-08-19)** — verbatim: *"All of that money spine stuff, I don't care about none of that right
  now. We don't have any paying tenants. I don't care about the money spine right now. What I care
  about is my platform being able to function in the fashion that it's designed to function first.
  Then we wire in the money spine based on all that functionality. Then we actually invite some live
  people on the platform to actually get paid off of."* Cancels the Revenue slice scoped after PR #548.
  God-tier-only scope (no Agency/Solo) stays in force. First landed slice: the Fleet Console **Tenants**
  sub-tab, rebuilt pack-faithful against `Super Admin Shell.dc.html`'s `isFleet` block (~7826-7877) — a
  real Field/Table toggle, a new `FleetOrbit.tsx` radial visualization (drag-to-rotate SVG, no new
  dependency), the KPI strip (`TENANTS · FLEET MRR · AT RISK · WAITING ON YOU`), and matching table
  columns (`TENANT · TIER · MRR · BENEATH · HEALTH · LAST ACTIVE`). **Money-Spine-in-KPI tension,
  resolved per the existing `moneySpecs.ts` convention:** `FLEET MRR`'s label ports verbatim, its value
  stays an honest `—` (no `platform_subscriptions` read) — structure ships, no billing table touched.
  The orbit's node "weight" swaps CD's literal revenue-sizing for a real, non-financial proxy (seats +
  clients) with an honest caption, rather than inventing a dollar figure. CD's fabricated "Needs you
  today" scenarios (named tenants, invented narratives) and "Her read" paragraph are dropped, not
  ported (§13) — the real "Needs you today" rail uses actual at-risk tenants instead.
- **OWNER RULING — Claude Design is the source of truth; pre-CD conventions are void (2026-08-18)** — verbatim: *"If Claude Design made it, that's how it's supposed to be moving forward. Whatever we had before CD is no longer valid. None of it!"* and, immediately after, *"I only want the backend to now connect to our new front end."* **Consequence #1:** where a CD pack and our prior convention disagree on a CD-designed surface, **CD wins** — an agent may NOT substitute a pre-CD house rule and call it a §11 improvement. The anchoring case is #543's operator console, where a first pass replaced three of CD's calls (gold sub-tab underline → indigo, gold settings-active rail rows → white, CD's warm palette → our cool indigo), flagged them OWNER-OWED, and was reversed by this ruling in the same PR. **The mechanism that made the reversal cheap and safe is worth reusing: a SCOPED token block** (`.operator-console` in index.css, the pattern `.studio-surface` already establishes) — CD's palette lands exactly on the surface CD designed, zero hex at any call site, and **no other surface, including owner-approved §28-frozen ones, is repainted as a side effect.** Verified in the BUILT bundle rather than asserted: `--background` → `rgb(252,250,248)` vs CD's `#FBF9F7`, `--rail` → `rgb(25,18,48)` vs `#191231`, `--cd-gold` → `rgb(200,158,45)` vs `#C8A02E` (within 1–2 per channel — HSL rounding, not a decision). **Two CD values were NOT copied verbatim and were recorded rather than quietly changed (§13/§29):** CD's rail eyebrow measures 4.11:1, and CD's dark block paints the page the SAME colour as the rail so the rail vanishes — artifacts of the pack rather than design intent; each keeps CD's hue and moves only far enough to be seen. CD's gold underline measures 2.35:1: raised once, ruled on, ships as designed. **Consequence #2:** the remaining console slices wire REAL backends **into** the CD surfaces rather than porting CD's look onto the old `/admin/platform/*` screens; the old tree stays redirect-alive (§58) but is no longer the build target.

- **§39 peer-gate on #543 returned ITERATE — two HIGH, both reproduced before fixing (2026-08-18)** — the seat earned its keep on a PR whose own author had already run 6 browser assertions and 325 tests green. **(H1) An open redirect inside the origin, in code written the same session.** The `?next=` allowlist tested `/^\/operator\/[^/\\]/` — which only inspects the character AFTER `/operator/`, and `.` passes it. `/operator/../../book/evil-slug` was accepted, and **react-router NORMALIZES it** to `/book/evil-slug`, landing a freshly-authenticated operator on a tenant-authored page, on the real domain, the instant after they type their password. The module's own docblock asserted this was impossible and the test file's premise was "mostly proving what it refuses" — a reminder that a validator's tests only prove what their author thought to try. Fixed by decomposing the path into segments and rejecting `.`/`..`/empty; 6 regression tests. Bounded honestly: the origin could NOT be escaped (`//evil.example` collapses), so this was same-origin only. **(H2) The `?next=` round-trip was broken for the very tier the guard admits.** `RequireOperator` gates on `is_platform_admin()` (= platform_admin OR super_admin) but the door gated honoring `next` on `is_platform_owner()` (**super_admin ONLY** — deliberately frozen, §53). A platform_admin therefore bounced off a bookmark, signed in, had their destination silently discarded, and fell through `resolveLandingRoute` — which has **no platform_admin branch at all** — to a tenant surface. Verified against BOTH migrations before changing anything. The door now uses the guard's predicate, which also closes the door half of long-standing **#192**. **Three MEDIUM:** 12 of the 78 leaves had no link anywhere (nothing rendered the settings GROUPS — while a comment in the file asserted the back-menu existed, so the code lied about itself; CD's back-menu is now actually built); `/operator//fleet` rendered a **blank page** (the doubled slash still matches the outer splat, so App's NotFound never fires and the inner Routes had no leg — the exact "ships undetected" class the index leg exists to prevent, with the defense never extended to a catch-all); and the anti-loop check was case-sensitive while react-router is not. **Three cheap LOW taken:** the invariant both redirects depend on (default branch must not be owner-only) is now locked by tests; `/operator` added to `CLIENT_FORBIDDEN_PREFIXES` (§37 producer-inventory drift, no leak today); an unknown sub-tab now redirects to canonical instead of rendering a surface its own URL contradicts. **Not taken, with reasons stated rather than silently dropped:** the density observer missing the redirect path (cosmetic), two pre-existing provider behaviours shared with `PlatformStaffOnly`, and an unmeasured bundle regression on the public door.

- **The platform-operator console is MOUNTED at `/operator/*` (#543, 2026-08-18)** — slice 1b, the follow-on to #541's addressing contract. All **78** design addresses are now live and navigable; the "authored ≠ mounted" gap #541 recorded is closed. Three files: `OperatorEntry.tsx` (3-leg dispatcher — index + login + guarded console, peer to `AgencyEntry`/`BusinessEntry`), `RequireOperator.tsx` (**ONE** guard above all 78 routes, not 78 copies), `OperatorApp.tsx` (URL-driven **left-rail** shell); `App.tsx`'s `/operator` exact route became a `/operator/*` splat. **The guard reuses what already resolves:** `isPlatformStaff || isPlatformOwner` from `useTenantContext` — the staff flag is populated from `is_platform_admin()`, semantically identical to §53's `is_platform_operator()`, so no new RPC and no fork of `AgencyLayout`'s four-RPC waterfall (§18). `loading` is gated FIRST and unconditionally, because the "Restricted area" latch bug already shipped once on `/admin/platform/*` and at a subtree root its blast radius is all 78 routes at once. It also reads the session itself (context exposes none) so a signed-OUT operator hitting a bookmark gets the login form, not a "Restricted area" card. **§53 gating is on the ROUTE, not only the nav** — `revenue` + `comms` are owner-only (shipped twins `MoneySpineAdmin`/`PlatformFleetCommunications` are both `<PlatformOwnerOnly>`); a hidden tab whose route stays open is not a gate. The **7 MIXED** branches (fleet · paige · growth · analytics · provisioning · marketplace · settings/governance) carry owner-only tabs INSIDE an operator-level section and their inner gates land WITH their surfaces — gating a placeholder that renders no data is theatre and bakes a guess into the wrong layer. **NEW shared token `--rail`/`--rail-foreground`:** the rail is `--primary` in light, but on dark `--primary` lifts to a vivid 56%-L indigo — a violet slab where the design wants a quiet panel; own token pair per theme, dark value lifted well clear of `--background` (~1.45:1 + an explicit `--border-strong` edge) because **the source design's own rail is the same colour as its dark page and vanishes** — a real source defect we do not reproduce (§29). §11 "add it to the layer," never an inline hex. **Accessibility was AUTHORED, not ported** — the pack's entire chrome is `div + onClick` (zero button, zero link, zero role, zero `aria-current`, zero focus-visible); shipped as real `<Link>`s with `aria-current`, real `<button>`s with `aria-expanded`/`aria-label`, indigo focus rings throughout, and two source AA failures fixed rather than copied (rail eyebrows 4.11:1 · route path 2.84:1). **THREE deliberate departures from the approved design, each named (§11/§28):** the active sub-tab underline is **INDIGO not gold** (nav-active is not an act; shipped `OperatorTabs` already carries the rule in code; the design's gold measures **2.35:1**, under even the 3:1 non-text bar) — **OWNER-OWED if the gold was specifically approved**; selected rail rows + the open-menu ring are neutral/indigo for the same reason (the pack is internally inconsistent — white on its front menu, gold on its settings menu); and the palette is **our cool indigo, not the pack's warm cream**, mapped by ROLE not hex, because there is no warm-neutral family in our tokens and inventing one would fork the platform palette (§23 is an owner ruling, not a porter's call) — this matches the design's STRUCTURE, deliberately not its temperature. **Rail density reproduced as BEHAVIOUR:** the pack drives padding/font/gap from a `ResizeObserver` measuring per-row height; ported as measure→publish-CSS-custom-properties with hysteresis, chosen over a fixed two-tier media query because the fleet group alone is nine rows and the fixed version visibly degrades on a 13" laptop. **Open-redirect-safe deep links:** `RequireOperator` sends a signed-out operator to the door carrying `?next=`, honoured via new `src/lib/auth/operatorTarget.ts` — same-origin, inside `/operator/`, never protocol-relative, never backslash-smuggled, never the door itself; 8 unit tests mostly proving what it REFUSES. **§13 — mounted ≠ built:** the 78 surfaces are NOT implemented; each renders an honest placeholder saying so, and nothing fabricates data (a placeholder never poses as an empty dashboard reading "you have no tenants"). **§58 — ADDITIVE:** the design is a LEFT-RAIL shell, the live God console (`AdminLayout`) is a TOP-BAR shell; `AdminLayout` is untouched and `/admin/platform/*` remains the working surface — standing checklist item answered explicitly, **no previously-shipped capability removed, hidden, or gated off**. **SEQUENCING RED-LINE HELD:** `OperatorLogin`'s `GOD_CONSOLE` and `resolveLandingRoute`'s operator branch still point at `/admin/platform`; flipping before verification 404s both doors (the #538 lockout class) — order is mount → verify → flip. Verified: tsc 0 · **325/325** tests (14 new) · lint:{views,definer-fns,tier-features} clean · eslint 0 · vite build ✓. **§32.c PARTIAL DRIVE RAN — 6/6 in real Chromium against the real `dist/` bundle** (§32.c's deferral is keyed to LACKING browser capability, and this session HAD one — pre-provisioned Chromium + the repo's Playwright — so the unauthenticated half was driven, not deferred): bare `/operator` renders the login door **not blank** (the failure that would have shipped undetected, since nothing in the product links to it) · signed-out `/operator/fleet` settles at `/operator/login?next=%2Foperator%2Ffleet` and the 3-level settings address likewise · **no redirect loop** (3 mainframe navigations in 8s) · `--rail` computes to `rgb(21, 12, 49)`, not transparent · **zero page crashes**, and the guard decided correctly even with Supabase unreachable (it does not hang on `loading`). Shipped as reusable tooling, `scripts/live-drive/operator-console-drive.mjs`, reusing the §18 helper's Chromium resolution — §24, so the next operator slice re-runs it instead of re-deriving it. **Four further assertions added after the CD ruling, because the `.dark .operator-console` block had shipped UNVERIFIED** — the §29 "correct in source, possibly shadowed at runtime, invisible either way" class: the light↔dark flip measures **21.6:1** on the console ground (`rgb(252,250,248)` ↔ `rgb(12,7,18)`, so §23's genuinely-light/genuinely-dark is measured not assumed) · the `.dark` override provably REACHES the palette (a shadowed block would leave `dark.rail === light.rail`, which no source review catches) · rail ink clears AA on the rail in both themes (11.31:1 light, 9.52:1 dark) · the rail reads as a distinct PANEL (17.23:1 light, 1.46:1 dark — modest by nature on a ~5%L ground and leaning on the border edge, but well above CD's own ~1.0 where rail and page are identical; the threshold catches a regression back toward that, it does not claim the dark rail is dramatic). **Recorded but deliberately NOT asserted:** CD's gold measures 2.41:1 on the light ground (11.27:1 dark) — under the 3:1 non-text bar, and owner-ruled to ship as designed, so the script prints a NOTE. A verifier that fails the build over a decision already made is not verifying, it is second-guessing. **STILL OWED:** the authenticated half — the rail RENDER, the 78 placeholders behind the guard, the §25 taste pass — which needs operator credentials this session does not have (the Vercel preview sits behind an SSO wall). **Measuring a token is not the same as seeing a layout**; no claim is made that the rail renders.

- **Operator route tree authored from the Super Admin design pack (#541, 2026-08-18)** — the Claude Design Platform-Operator handoff landed, so `OPERATOR_BRANCHES` (`src/lib/routing/tierBranches.ts`) stops being the §11e 1-item placeholder that explicitly said *"authored when Claude Design's new Super-Admin pack lands."* Now **13 branches / 5 settings groups / 78 addressable tabs**, **GENERATED** by executing the pack's own `paige-routes.js` (it exports via `module.exports`) and emitting TypeScript — 78 routes in, 78 leaves out, no hand-transcription step to get wrong. Mapping: design `section`→`slug`, `view`→`key`, `sub`→subtab `slug`, `tab`→subtab `key`; an empty `sub` is the section default and becomes `subtabs[0]`. **The existing invariant test earned its keep:** the first pass modelled the five settings groups as compound slugs (`"settings/team"`) and *"slugs are unique within each tier and url-safe"* rejected it — correctly, because a branch slug must be ONE url segment or `/operator/:branch` captures only `settings` and never reaches `settings/team` (broken routing, not a style nit). The design's own note says settings nests one level deeper, so the faithful model is a THIRD level: `SubTab` gains an optional `subtabs` used ONLY by the operator `settings` branch (asserted by test that every tenant tier leaves it undefined). Two narrow additive contract changes: `Branch.group` widens to carry the design's `fleet`/`business`/`settings` groups (a `settings` branch is what auto-opens the back menu; nothing in routing switches on it), and `TierTree.accountSegment` (default true) — the operator is TENANT-LESS per the §65 matrix, so `branchPath`/`subtabPath` omit the account for it while tenant tiers are unaffected. Five new tests guard the ADDRESSING CONTRACT: 78 tabs present · every slug url-safe at every level · sibling slugs unique at every level · operator paths carry no account while agency paths still do · only the operator settings branch uses the third level. **§13 CORRECTION on record:** the PR originally claimed a `/operator` path collision (login vs Fleet Console). **That was wrong.** Executing the pack's registry proves `all.some(r => r.path === "/operator")` is FALSE — the shallowest routes are `/operator/fleet`/`/operator/paige`/`/operator/comms`; `/operator` is a PREFIX, not an address (the pack says so: *"Rename `/operator` to whatever prefix the real app uses"*). Login keeps the root as an index leg; no move, no bookmark churn. Repo-wide grep also found **zero** inbound links to `/operator` (no nav, email, edge fn, redirect config) — a typed/bookmarked URL only, which is why it must keep working: nothing would visibly break if it stopped. **§13 — authored ≠ built:** the registry is the addressing contract; most of the 78 tabs are unbuilt and the console is NOT mounted. **Crew findings carried forward:** the §58 map says 50 of 78 design tabs map to shipped surfaces, 28 are genuinely net-new, and ~20 shipped operator surfaces have NO design home (platform sending identities, the invite minter, the whole affiliate program, error tracking, network-KB promotion + doc-promotion queue, admin notifications, data registry/maintenance, the Vibe Studio session shell, and the **#31 revenue-integrity audit** — the §57 source-of-truth enforcement surface) — which is why `/admin/platform/*` gets REDIRECTED, never retired. Latent §53 defect filed (#192): both operator doors gate on `super_admin` only, so a `platform_admin` fails `is_platform_owner()` at `/operator`, falls through `resolveLandingRoute` (no platform_admin branch) and lands on **`/pricing`**; latent only because prod has 0 platform_admin holders today. **Sequencing red-line for the next slice:** mount the console → verify → THEN flip `OperatorLogin`'s `GOD_CONSOLE` and `resolveLandingRoute`'s operator branch. Flipping first sends the operator to a 404 from BOTH doors — the #538 lockout class. Verified: tsc 0 · 311/311 tests (5 new) · lint:{views,definer-fns,tier-features,skeleton} clean · vite build green.


- **R1 role call-site inventory + the workflow-registry platform seam (2026-08-18)** — R1 of the taxonomy doc's 6-slice plan: mechanically classify every role call site, **no behaviour change** in the inventory itself. Deterministic SQL bucketed **all 186 RLS policies** (a 3 · b 3 · **c1 82** · **c2 98**) and **all 118 functions** (a 10 · **c1 31** · c2 69 · d 8), reconciling exactly; **117 of 118 functions are `SECURITY DEFINER`**, so the in-body check is the only guard. **The load-bearing discovery is the amplifier:** `map_tenant_role_to_app_role()` maps tenant `owner` AND `admin` → global `admin`, and the ENABLED trigger `trg_sync_tenant_member_to_user_roles` writes it into the tenant-less `user_roles` — so **"global admin" is approximately "every tenant owner"** (9 holders across 10 of 13 tenants, vs 1 `super_admin`). Every `has_role(uid,'admin')` guard must be read that way. **Shipped alongside (R2a):** the one LIVE escalation — all 23 `paige_workflow_registry` rows are `tenant_id IS NULL`, so the guard `has_role('admin') AND (tenant_id IS NULL OR tenant_id = current_user_tenant_id())` has an always-true second conjunct and collapses to `has_role('admin')` on a PERMISSIVE **cmd=ALL** policy — any tenant owner could rewrite `requires_approval` / `direct_function_name`, i.e. subvert the approval seam. Same collapse on `platform_set_workflow_webhook_url` (repoint any platform n8n webhook) and `admin_get_workflow_webhook_url` (decrypts + returns the secret; was granted **PUBLIC + anon**). Both functions have **ZERO producers** (§37 walked: generated types + migrations only), so hardening them to `is_platform_operator()` breaks nothing. **§58 called out explicitly:** tenant-level admins lose access to PLATFORM-scoped registry rows; tenant-owned rows keep tenant-admin access, so the `admin` role stays meaningful. **The §32.a rollback proof earned its keep** — it refused to recreate `admin_get_workflow_webhook_url(uuid)`, exposing that the overload selects a column `n8n_webhook_url` that **does not exist** (table has `n8n_webhook_url_ct`): already broken on prod, throws 42703 on every call, zero callers → dropped, not repaired. Proof GREEN on 7 assertions, rolled back, prod re-verified unchanged. **§13 corrections on record:** (1) the crew labelled `match_paige_memory` a LIVE breach — it is a real `authenticated`-reachable structural auth bypass (pass `_target_client_id := auth.uid()` and the guard's AND-chain goes false so the RAISE never fires, while the data predicate keys on the attacker-supplied `_target_user_id`), but **both target tables have 0 rows**, so it is **LATENT**; deferred because a correct fix must also scope the data predicate's `client_id` branch and it has a live caller. (2) The taxonomy doc's "latent structural weakness rather than a confirmed live leak" framing was too optimistic — R1 found a live platform-seam escalation. **Known limit (§13):** the corpus keys on `has_role|has_any_role|user_roles` literals, so policies that gate via `is_admin()`/`is_staff()`/`studio_role_ok()`/`check_feature_access()` never enter it — **the true call-site count is higher than 186+118**; closing that is R2b.


- **P0 §58 — the sub-account shell was a ONE-WAY DOOR; owner locked out of his own agency (#538, 2026-08-18)** — owner reported landing in the MMA sub-account with *"cannot switch back."* Not a data bug: a **regression from my own §65 Gate B work**, and it took three independent facts to trap him. (1) `AgencyApp`'s account switcher is gated on `isAgency` (`AgencyApp.tsx:196`), so `/business/{n}` renders **none**. (2) The real `AccountSwitcher` lives **only** in `AgencyLayout`/`AdminLayout` — never inside `AgencyApp`. (3) `/admin` can't rescue you either: `Admin.tsx` **Gate B** redirects a `sub_account` straight back to `/business` *before* `AdminLayout` (which holds the switcher) can render. Net: **no navigable route back to his own agency**; only recovery was hand-typing a URL. Same one-way-door class the peer-gate caught for the *agency* shell in #535 — I fixed it there and never checked the sub-account side. **Fix:** a "Back to agency" control in the sub-account top bar, shown **only** when `ownAgencyTenant` exists (a genuine sub-account-only owner correctly sees nothing — no dead button promising a destination they don't have, §13). Deliberately **not** the full switcher: one honest door back, not a cross-account picker on a surface that must stay scoped to a single book (§9/§51). **A bug I introduced and caught pre-ship, recorded because it's this codebase's signature failure:** the control first went into `TopBar` referencing `ownAgencyTenant`/`navigate`, which live in `AgencyApp` — and because `src/agency/*` is `@ts-nocheck`, **`tsc` would have passed it clean and it would have thrown `ReferenceError` at render** (textbook §32 "compiles but crashes"). Rewritten as a single `onBackToAgency` prop computed at the call site. Related **data** fix already applied to prod and NOT in the diff: `projectmogultrust@gmail.com` had `agency_login_default='last_account'` with MMA active; reset to `'agency'` + PME. The PR fixes the *mechanism* so a preference can never strand anyone again. **§32.c live-drive owed** — no browser credentials in the building session.

- **Role Taxonomy & Matrix — the one home for role scope and authority (#537, 2026-08-18)** — docs-only, produced from the owner's ruling *"we should make sure all of the roles are tenant scoped… Everything about our platform needs a Taxonomy and Matrix."* Establishes that the platform has **three independent role stores**, and that conflating them is the root of the §59 global-role trap: **`user_roles`** (`id, user_id, role` — **NO `tenant_id`**, therefore GLOBAL and tenant-agnostic), **`tenant_members`** (`tenant_id, user_id, role, status, is_owner` — the real tenant-scoped rail; `is_tenant_member()` reads ONLY this, `status='active'`), and **`agency_team_members`** (`agency_tenant_id, user_id, agency_role, scoped_subaccounts` — the agency rail, never consulted by `is_tenant_member`). Classifies every live role A/B/C by scope × authority × who may grant it, records the audited live grant state, sizes the blast radius **empirically** (186 policies / 91 tables / 118 functions referencing role predicates), and lays out a **6-slice R0–R5 migration plan** rather than a big-bang. Chose documentation-first deliberately: a single migration across that surface is exactly the change §32's green-proof-that-proves-nothing warning is about. **No code, no schema change** — this is reference material for the roles/permissions design conversation.

- **§13 truth wave, Solo slice — stop rendering KPI tiles that have no real source (#536, 2026-08-18)** — first scoped slice of the owner-ruled truth wave (*"if it was not entered by an owner or submitted by a real customer then it should get removed"*). Scope was **deliberately narrowed after an owner correction**: an earlier pass deleted the agency Command Center KPI tiles, and the owner corrected it — *"I love all of the elements… if we don't have something for those elements then we can park it for the moment, but we need to create it… you may wanna go menu tab by menu tab. Overhauling the entire surface might be a little bit too much."* Those tiles were **already honest** (em-dash + `PreviewPill`, never a fabricated number); deleting them removed a *design element*, not a lie. **Reverted, and `useAgencyMetrics.ts` is untouched by this PR.** What actually shipped is `src/solo/*` only: `screens.tsx` 98→72 lines (dead `Growth`/`Analytics` exports deleted — superseded by `growth2.tsx`/`analytics2.tsx`, so this was a *deletion*, not a rewire); `_shared.tsx` static `DATA.metrics` (`$23,230`/`112%`/`147`/`89%` + sparklines) and `DATA.convo` deleted, with `DATA.pipeline`/`DATA.campaigns` **deliberately kept** because live `growth2.tsx` renders them; `paigehub.tsx` test-console client picker now honestly reads "No clients yet" instead of fixture names. **Reusable lesson:** check mounted-vs-dead **before** planning a rewire — it turned one slice from a rewire into a safe deletion. **§13 self-correction on record:** I first told the owner those figures were live fabricated metrics; tracing showed they were in **dead code**. Corrected explicitly.


- **R3f — agency managers land on their REAL numeric URL, canary-gated (#535, 2026-08-18)** — closes the §65 gap that made every *other* slice's URL work unreachable at the front door: an agency owner whose `agency_login_default` is `'agency'` — **the default for every newly provisioned owner** — landed on the **legacy board** and never reached the new shell, because `resolveLandingRoute` returned bare `/agency` and `AgencyEntry` routes any non-numeric first segment to `AgencyLayout`. Owners reached the new shell only by accident, via the `'last_account'` preference routing through `/admin` Gate A. **Fixed at the SENDER, not by redirecting `/agency`** — reading the code killed that first instinct: the legacy board links to `/agency` *itself* (Dashboard nav `AgencyLayout.tsx:71`, logo `:229`, catch-all `:302`), so redirecting it would break that board's own navigation and effectively retire it, which is §65's LAST migration step. Migration `20260918000000` extends `agency_switch_context()` with `agency_account_number` **and** `agency_shell_enabled`, both inside the SAME `_is_mgr` gate as `agency_name` (§9 — a non-manager gets NULL). **The canary key is the §39 finding, not a nicety:** `/admin` Gate A gates the URL-driven shell on `agencyShellEnabled`, but `AgencyEntry` has NO such gate (a numeric segment goes straight to `AgencyApp`), so landing on `is_agency_manager` alone would hand EVERY eligible manager the new shell flag-or-not and the two entry points would disagree for the next agency provisioned; the caller cannot read `tenants.features` itself (SELECT policy `is_tenant_member(id) OR is_platform_owner()` — an agency-team manager with no `tenant_members` row fails it and silently degrades forever), so the server must return it. §32.a rollback proof on prod asserted literal jsonb equality `(AFTER - 'agency_account_number') = BEFORE`; a real impersonated non-manager got NULL; per §63 the proof used a purpose-built test agency, never a real owner account. **§39 peer-gate raised a BLOCKING §58 finding that was real and is fixed IN this PR, not deferred:** retargeting login drops owners into `AgencyApp`, and an independent verification pass established that `create_subaccount` has exactly ONE frontend call site (`AgencyBoard.tsx:232`, the legacy board), `set_agency_login_default` exactly one (`AgencyLayout.tsx:101`), `src/agency/*.tsx` contains **zero** `href`/`to=`/`window.location` (the shell has no anchors at all, anywhere), and `/admin` no longer bridges either because Gate A (`Admin.tsx:420-427`) redirects back into the shell BEFORE `Admin.tsx:937-938`'s `/admin/agency → /agency` forward can run. Bare `/agency` itself is NOT broken (verified: no shell-flag gate on that path — it still renders `AgencyLayout` → `AgencyBoard` + `LoginDefaultControl`), so the capability stayed reachable by *typed URL* — what vanished was any way to *navigate* to it. The PR's own earlier body said "the legacy board stays fully intact and reachable," which was true of the URL and **false of navigation**; corrected explicitly per §58. Fix: wire the existing **dead** "+ Add a sub-account" button (it shipped with no `onClick`) to `/agency`, AND add the same CTA to `DirectoryEmpty` — that branch `return`s **early**, so the header button never rendered for an agency with **zero** sub-accounts, i.e. the exact §56 anchoring bug (capability hidden behind an empty-state branch) landing on the one account state that most needs it. The empty-state CTA is the single deliberate addition to the §28/§63 faithful port, documented in-file. **Two more §39 findings folded:** (1) the "MATCH Gate A EXACTLY" comment was **inaccurate** and now says so — the two gates read the flag off DIFFERENT tenants (Gate A reads the ACTIVE tenant, which is the *sub's* while acting-as, plus a `tierKey` requirement; this resolver reads the owner's OWN AGENCY tenant via `agency_current_id()`, which is the correct subject for a login landing where no act-as is in play); (2) the jsonb-string normalization test was near-vacuous — `"1924546"` interpolates byte-identically to `1924546`, so it could only catch removal of the guard, never a raw-field interpolation; added `"1e6"` and `" 1924546"` cases and **proved** them red when the raw field is interpolated instead of the coerced number. New `resolveLandingRoute.test.ts` (13 cases) exists because this bug class is invisible to every other check — returning bare `/agency` type-checks, builds, lints, and renders; it just strands the owner forever. Proven to fail on all four regressions (canary removed · original bug reintroduced · raw-field interpolation) and green on restore. §37 consumer inventory: five runtime consumers, all reading NAMED keys off an opaque `Json` return, zero in edge functions/scripts/CI — additive keys structurally invisible. Verified: tsc 0 · ratchet 18/18 · eslint 0 · vitest 304/304 · build green · lint:{views,definer-fns,tier-features,skeleton} · ci:regression · gold-discipline. **Owed:** §32.a persisted-apply confirmation on merge (`deploy-migrations.yml`), and §32.c live-drive (owner logs in → `/agency/{n}/command-center`; both the populated and empty "+ Add a sub-account" CTAs open the classic board). **A THIRD reachability defect, caught by the Codex reviewer and confirmed against prod (P2, fixed in-PR):** the retarget also broke **rail-only agency-team members**. `is_agency_manager` resolves off the agency RAIL (`agency_current_id` + `agency_team_role`, both reading `agency_team_members`), but `AgencyApp` resolves its identity from an entirely different source — `useTenantContext().tenants`, a plain RLS-gated `SELECT` on `tenants` whose policy is `is_tenant_member(id) OR is_platform_owner()` — and prod `pg_get_functiondef` confirms `is_tenant_member` reads **ONLY** `tenant_members` (`status='active'`), never the rail. So a user who is an agency-team member via the rail with no `tenant_members` row is a real manager to the RPC and **invisible to the shell**: `/agency/{n}/…` renders with no identity, and `AgencyApp`'s own ownership guard cannot save them because it bails on `own == null` (`AgencyApp.tsx:402`); worse, if they happen to own a DIFFERENT agency that guard resolves to it and **silently bounces them off the agency they were invited to**. The agency-team-invitee branch at `:226` already returns bare `/agency` for exactly this reason and its comment says so — but it is **UNREACHABLE** for these users, because the `admin`/`coach` branch at `:173` calls this resolver first and `admin`/`coach` are **GLOBAL** roles (`user_roles` has no `tenant_id`, §59), so anyone running their own tenant carries one. The stated protection was aspirational, not real; the new guard makes it real. **Deliberate design choice:** the guard tests **VISIBILITY** — it asks for the agency row through the same RLS-gated read the shell depends on — rather than re-deriving `is_tenant_member`, which would be a proxy that could silently drift from it. §13: a query ERROR does **not** demote (an outage must never quietly strand every agency owner on the legacy board); only a definitive "row not visible" falls back. **Severity, honestly: LATENT, not live** — a prod query confirmed all 3 active `agency_team_members` rows also have a `tenant_members` row for their agency, so zero users were affected; fixed anyway rather than merged as a known regression. Two tests added, both proven red when the guard is removed. **This is the third time on ONE PR that prose claimed a protection the code did not implement** (the PR body's "fully intact and reachable", the `DirectoryEmpty` early return, and this branch's own comment) — the standing lesson is that a comment asserting a guarantee is not a guarantee, and §39/reviewer passes earn their cost precisely by testing those assertions against the code. **Tracked follow-up:** porting the creation wizard INTO the shell is §65's later step; task #170 (Enterprise lands on `/agency` not `/enterprise`) stays open and unchanged.
- **§13 honesty hotfix — fabricated "147 hours saved" + wrong "Solo plan" label on sub-accounts (merged #534, 2026-08-18)** — owner flagged BOTH on one live-drive screenshot of a sub-account's rail plan card: (a) the card said "Solo plan" on a **sub-account**, which is factually the wrong tier (§51/§60 — a sub-account is never Solo); (b) it claimed "147 hours saved this month," a **fabricated metric** with no backend behind it (§13 — "systems report what actually happened, never a hoped-for outcome"). Owner's ruling on the fix shape: *"Which we may not even want this area to say any of this"* → later confirmed *"Yep I agree"* to **stripping** the claim rather than replacing it with a smaller invented one. **(a)** `AgencyApp.tsx`: hoisted `sub` from ~L583 to ~L340 (beside `acting`) so the parent — not `Rail` — decides the label; `Rail` no longer branches on tier at all. New parent-computed `subPlanLabel = metrics.identity.plan || "Sub-account"` (real plan from the adapter when known, honest generic noun otherwise), `railPlanLine`/`railBookLine`; the account menu's `{sub ? "Solo plan" : planLabel}` became `{sub ? subPlanLabel : planLabel}`. Sub-accounts also drop the agency-only book line (`railBookLine = sub ? null : bookLine`). **(b)** `SoloApp.tsx`: the `147 hours saved` div DELETED outright — not replaced with a fabricated smaller number, not hidden behind a Preview pill (there is no hours-saved backend to preview); the tier-accurate "Solo plan" chip stays with an in-file comment recording why the sibling line was removed. **Deliberately scoped to what the owner saw** — the same fabricated-metric class appears on ~5 more fixture surfaces (`$23,230 MRR`, `112% NRR`, `89%`, more `147 hours`); those are tracked as their own sweep (task #185) rather than silently widened into a hotfix (§18/§30 minimal-diff). Verified: tsc 0 · vitest green · vite build green · lint suite clean. §32.c owner live-drive owed (confirm the sub-account rail no longer says Solo and no longer claims hours saved).
- **R3e-i — Solo sub-tab URLs /solo/{n}/{branch}/{subtab} (merged #533, 2026-08-18)** — completes the 3-level Solo tree, mirroring Option A's agency work (#518) and following R3d-i's branch level (#529). **§13 SCOPING CORRECTION made before building, not after:** the slice was briefed as "sub-account + Solo sub-tabs," but reading the code showed `/business` sub-tabs **already worked** — R3c-i had fixed all 12 agency-screen `useSubtabRoute` call sites to pass `isAgency ? "agency" : "sub_account"`, and `TIER_TREES.sub_account` already points at `AGENCY_BRANCHES` whose sub-tabs shipped in #518. So this narrowed to **Solo-only**, and the PR said so rather than claiming credit for work already merged. Authored **53 sub-tabs across 11 `SOLO_BRANCHES` entries** in the `tierBranches.ts` registry — each one read off the actual screen source first, because Solo's internal `useState` keys are **abbreviated and deliberately differ from Agency's** (`know`/`dir`/`lib`/`ov`/`mkt`/`biz` vs Agency's full words); authoring from the Agency tree by analogy would have produced 53 dead routes. Converted 11 Solo screens 2 lines each (import + declaration) to `useSubtabRoute("solo", …)`; `setup.tsx` additionally validates its `start` prop against the registry before using it as the default. **§39 peer-gate caught that the 8 new registry tests could not fail** — they asserted the registry against itself (tautologies), and all 11 screens are `@ts-nocheck` so `tsc` proved nothing about the key contract. Replaced with a **registry↔SCREEN contract test** that parses each screen's real source (locates its `useSubtabRoute("solo", <branch>)` call, extracts the adjacent `tabs` array's keys via a balanced-bracket scan) and diffs them against the registry — then **PROVEN to fail**: drifting `know`→`knowledge` in the registry reddens the paige case with an exact diff; 36/36 green on restore. Also folded: two DEV-only warnings in `useSubtabRoute.ts` (§32 never fail silently) — one for an unregistered key in `setKey` (whose local-state fallback is never read in URL mode, so the click is a **silent no-op**), one for a typo'd `branchSlug` (which compiles, since the param is typed `string`). **§39 forward-looking warning block added at `TIER_TREES.sub_account`:** all 11 Solo screens hardcode `useSubtabRoute("solo", …)` — safe today because `SoloApp` only ever mounts at `/solo/*`, but the moment `/business` mounts `SoloApp` (the §11c target state), every sub-tab click by a sub-account owner would build a `/solo/{n}/…` path and silently throw them out of the `/business` tree — **53 routes at once**. Documented in-place so the next slice reads it before it fires. Verified: tsc 0 · vitest 271/271 (36 registry) · eslint 0 · vite build green · lint suite clean · ci:tsc ratchet 18/18. §32.c owner live-drive owed.
- **R3d-i — Solo branch-level URL /solo/{n}/{branch} (merged #529, 2026-08-18)** — task #173 (§65 R3) slice R3d-i, owner-sequenced follow-up to R3c-i ("subaccounts first, then Solo"). Converts the `/admin` inline takeover (the Solo gate in `Admin.tsx`) to `/solo/{account_number}/{branch}`, mirroring R3c-i's pattern — simpler here since Solo has no act-as/children concept, so none of `AgencyApp`'s sub-prefix (`isSubPrefixed`/`acting`) machinery applies. **Registry needed NO correction** (unlike `sub_account` before R3c-i) — verified BEFORE building, not assumed: `TIER_TREES.solo` already pointed at `SOLO_BRANCHES`, and `SoloApp.tsx`'s screens map keys match `SOLO_BRANCHES` exactly. `SoloApp.tsx` converted `route`/`go` from local `useState` to URL-driven (mirrors `AgencyApp.tsx`'s R0-slice-2 conversion), added the same top-level account-number ownership guard agency/sub-account already carry (§9 address-not-grant, forward-IDOR pattern from task #171/#526); DUAL-MODE (§58) preserved — no `:account` param falls back to local state, byte-unchanged. New `src/solo/SoloEntry.tsx` — the `/solo/*` dispatcher, single-legged like `BusinessEntry.tsx` (no legacy standalone board to fork against). Registered in `App.tsx` with the same `RequireCompleteSignup`+`RequireSetupComplete` wrapping `/business/*` carries; `Admin.tsx`'s Solo gate now redirects to `/solo/{n}/command-center` once `account_number` resolves. **§39 peer-gate + §5/§13/§63 compliance both returned CLEAN, zero blocking findings** — the peer-gate specifically tried to reproduce R3c-i's sibling CRITICAL (hardcoded `useSubtabRoute("agency", ...)`) by grepping `src/solo/` for `useSubtabRoute` calls and found none: Solo screens don't use that hook, so that bug class structurally cannot recur here. Compliance returned SHIP with two non-blocking nits (an unverifiable editing-history claim; a hardcoded `"command-center"` string matching existing sibling-gate convention). Verified: tsc 0 · eslint 0 (2 pre-existing unrelated warnings) · vitest 271/271 · vite build green · lint:{tier-features,views,definer-fns,skeleton} clean · ci:tsc ratchet unchanged (18/18) · gold-discipline clean. **Out of scope, tracked for a follow-up slice:** 3rd-level sub-tab URLs for `/solo` (mirrors the still-pending `/business` sub-tab slice, task #172's pattern). §32.c owner/Cowork live-drive owed (confirm a real Solo tenant lands on `/solo/{n}/command-center` with every tab a real bookmarkable URL).
- **R3c-i — sub-account branch-level URL /business/{n}/{branch} (merged #526, 2026-08-18)** — task #173 (§65 R3) slice R3c-i. Owner ruled: ship sub-accounts on the CURRENT shell (`AgencyApp mode="subaccount"`) right now, independent of Solo/SoloApp's own URL conversion (a separate, later slice — "focus on the Subaccounts right now then we can knock out the Solo accounts"). Converted the `/admin` inline takeover (Gate B) to `/business/{account_number}/{branch}`, mirroring R0-slice-2's Gate-A pattern for agency (task #171). **Registry correction (§13 honest, found during scoping BEFORE building):** `TIER_TREES.sub_account` pointed at `SOLO_BRANCHES` per the §11c/§60 doctrine ("sub-account inherits the Solo tree"), but `AgencyApp mode="subaccount"` actually renders the `AGENCY_BRANCHES` key set via its `screens` map — not `SoloApp.tsx`'s screens that `SOLO_BRANCHES` was authored against. Repointed `sub_account` at `AGENCY_BRANCHES` (root `/business`) so branch-level URLs resolve to real screens instead of dead routes; the §11c/§60 doctrine stays the TARGET once `/business` mounts `SoloApp` in a later slice — added a dated confirmation addendum to `docs/doctrine/route-and-url-taxonomy.md` §11c closing the loop on its pre-existing "Honest build note" (which had already anticipated this exact interim-state contradiction). `AgencyApp.tsx`: generalized `urlDriven` from agency-only to `!!urlAccount`, threaded a `tier` variable through the branch-resolution helpers; explicitly preserved the §51 invariant — the act-as `sub/{n}` URL prefix stays gated on `isAgency`, so `acting` remains provably null in subaccount mode even against a crafted URL. Added the same top-level account-number ownership guard agency already has. New `src/business/BusinessEntry.tsx` — the `/business/*` dispatcher, single-legged (no legacy board to fork against, unlike `AgencyEntry`). **§39 peer-gate caught a real CRITICAL regression this diff itself introduced:** all 12 screen modules `AgencyApp` mounts (`CommandCenter`, `clients`, `setup`, `analytics`, `automations`, `billing`, `calendar`, `growth`, `marketplace`, `paige`, `team`, `vault`) hardcoded `useSubtabRoute("agency", ...)` regardless of mode. Before this PR that was dead code — subaccount mode never got a real `:account` URL param, so `useSubtabRoute`'s dual-mode degrade always fired. This PR's own change (giving subaccount mode a real `:account` URL) newly exposed it: any sub-tab click from a sub-account owner's `/business/{n}/...` URL would navigate to `/agency/{n}/...` — the Agency shell (switcher, "+ Add a sub-account" wizard, agency branding) — for what is their own sub-account. Verified independently before fixing (read `useSubtabRoute.ts` directly, confirmed it navigates via `subtabPath(tier, ...)` with no other gate; grepped all 12 call sites; confirmed each screen already receives `isAgency` as a prop) then fixed all 12 to pass `isAgency ? "agency" : "sub_account"`. Two more peer-gate findings independently investigated rather than blindly folded: (1) `enterSubaccount` passed unconditionally into `CommandCenter`/`ClientsHub` — verified NOT reachable (`ClientsHub`'s `Directory`, the only consumer, only renders when `crossBook = isAgency && !acting`, always false in subaccount mode); no fix needed. (2) the top-level ownership guard can't distinguish "still loading" from "genuinely has no agency tenant" — verified real but not currently exploitable (no remaining path reaches it post-finding-#1-fix); tracked as non-blocking follow-up (task #180) rather than expanding this PR's scope. §5/§13/§63 compliance came back SHIP with one non-blocking should-fix (the doc addendum, folded). Verified: tsc 0 · eslint 0 (all changed files) · vitest 271/271 · vite build green · lint:{tier-features,views,definer-fns,skeleton} clean · ci:tsc ratchet unchanged (18/18) · gold-discipline clean on the real diff. **Out of scope, tracked for the next slice(s):** 3rd-level sub-tab URLs for `/business` (mirrors Option A/task #172), Solo/SoloApp's own URL conversion (R3d, sequenced next per the owner). §32.c owner/Cowork live-drive owed (confirm a real sub-account lands on `/business/{n}/command-center` with every tab a real bookmarkable URL and sub-tab clicks stay on `/business/...`).
- **R3a-i — sub-account real identity + honest Recent-changes label (merged #524, 2026-08-18)** — first slice of task #173 (§65 R3, sub-account real identity+data wiring). Owner live-drive on a REAL sub-account (logged in directly via legacy `/admin`, not via Agency act-as) found the sidebar showing "Sarah's Coaching Practice" — the decorative `SUBS[0]` fixture — instead of the tenant's real name. **Scoped precisely before building, per §13/§18 (read the adapters first, don't assume the whole screen is fixture):** `useAgencyCommandCenter.ts`/`useAgencyMetrics.ts` were ALREADY real and correctly wired for own-book/sub mode (greeting from the auth session + real tenant name, KPIs from `usePracticeDashboard`, approval queue from `usePendingApprovals`) — this narrowed a feared full-rebuild down to two fixes. **Fix 1:** `AgencyApp.tsx`'s `brand` (consumed only by the sidebar `Rail`) now derives from `useTenantContext().activeTenant` instead of `SUBS[0]`, with a deterministic per-tenant color via the existing `swatchFor()` helper (§18 reuse — no real brand-color backend exists, so never a fabricated color, just a stable decorative one); the agency-acting branches were untouched. **Fix 2 (§13 honesty):** the "Recent changes" audit-log panel on CommandCenter showed decorative fixture entries with no Preview label, unlike its siblings (Trust Compass, Business Vault) — added the missing `<PreviewPill/>` (no real autonomy-lane change-log backend exists yet; that's task #165). **§39 peer-gate caught a real HIGH-severity crash bug this diff newly exposed:** `tmInit()` in `TeamBlock.tsx` (the shared initials helper, used by Rail/TeamBlock across the shell) threw `Cannot read properties of undefined (reading 'toUpperCase')` on any real tenant name with a leading or double space (e.g. "  Mogul Maker Academy") — `split(" ")` produced empty-string tokens, and `/[A-Za-z]/.test(undefined)` on `w[0]` coerces to the literal string `"undefined"` (which contains letters) and incorrectly passed the filter. Never reachable before this diff (sub-account identity was always the curated, whitespace-clean fixture); this is what newly routes real, unmoderated names through it. Independently reproduced the crash pre-fix and verified the fix (trim + split on `\s+` + explicit length guard, degrades to `""` never a crash) against 8 cases via a standalone Node script before trusting the peer-gate's claim (§13 — verify, don't assume). **Out of scope, tracked under task #173 for the next slice(s):** remaining sub-account screens (Clients `OwnBook` still fixture-named contacts, Automations, Calendar, Trust Compass, Support, Growth, Analytics, Billing, Marketplace, Vault, Integrations, Team, Setup) each need their own real-data wiring pass; CommandCenter's "Put Paige to work · 2 of 5"/"Activity · 6" hardcoded fixture numbers still lack a Preview label (flagged, deferred, not fixed here — same screen, smaller gap). §39 peer-gate + §5/§13/§63 compliance crew dispatched in parallel against the real pushed diff (2 commits); the `TopBar`'s pre-existing unused `brand` destructure (predates this diff on both `Rail` and `TopBar`) was left as out-of-scope per §18/§30 minimal-diff discipline. Verified: tsc 0 · eslint 0 (1 pre-existing unrelated warning, confirmed not a regression) · vitest 271/271 · vite build green · lint:{tier-features,views,definer-fns,skeleton} clean · ci:tsc ratchet unchanged (18/18) · gold-discipline-lint clean. §32.c owner/Cowork live-drive owed (confirm a real sub-account, logged in directly, now shows its own real name in the sidebar and initials render without crashing).
- **§65 Option B2 hotfix — switcher roster empty while acting (merged #522, 2026-08-18)** — owner live-drive on #520 reported two symptoms that turned out to be one root cause: (1) once acting-as a sub-account, the account switcher's RECENT list only offered "Agency view" — no way to jump directly between sub-accounts; (2) Mogul Maker Academy appeared "not wired" under Project Mogul Enterprise. Root cause: `useAgencyRoster.ts` gated its two react-query calls (`agency_list_my_subaccounts`/`agency_portfolio_metrics`) on `isAgencyAggregate(ctx) = isAgency && !acting`, so the roster query never fires while acting — the switcher is empty regardless of which sub-account is being viewed. **(2) confirmed NOT a data problem** via direct prod query: MMA is correctly parented (`account_type='sub_account'`, real `parent_tenant_id`), the owner holds `agency_owner` on the parent's team roster, and replaying the exact `agency_list_my_subaccounts()` query for the owner's uid returns MMA alongside all 5 other real siblings — the owner simply never saw it, since every screenshot happened to be mid-act-as. Fix: widened ONLY this hook's own enable-gate from `isAgencyAggregate(ctx)` to `ctx.isAgency` (both RPCs are `SECURITY DEFINER`, self-scope via `auth.uid()` server-side, keyed on `tenant_members`/agency-role membership — never on the caller's current `active_tenant_id` — so safe to call while acting). The exported `isAgencyAggregate` predicate itself is UNCHANGED and still correctly gates the ~7 other adapters (billing/compass/people/contacts/commandCenter/marketplace/metrics) that must keep showing only the acted-as sub's own book; `Directory` (the other `useAgencyRoster` consumer) is unaffected since it only mounts when `crossBook = isAgency && !acting`. The switcher's row-click already called the real `enterSubaccount()` action (shipped in #520), and `agency_enter_subaccount` is stateless w.r.t. the caller's current tenant (verified via `pg_get_functiondef`), so Sub A → Sub B switching works once rows populate — no backend change needed. **§39 peer-gate + §5/§13/§63 compliance both SHIP** on the real pushed diff; one LOW defense-in-depth finding folded pre-merge (gate `subCountReal`/`planLine`/`bookLine` explicitly on `!acting` at the source, not just via `roster.available`, so a future caller reading those values can't accidentally pick up the sibling count during an acting-state render path — not a live leak, since the Rail already gates the actual render behind its own `sub`/`acting` ternary, but removes the trap for a future edit). Verified: tsc 0 · eslint 0 · vitest 271/271 · vite build green · lint:{tier-features,views,definer-fns,skeleton} clean · ci:tsc ratchet clean · gold-discipline clean. §32.c owner/Cowork live-drive owed (confirm the switcher lists real siblings while acting + Sub A → Sub B switching works live).
- **§65 Option B2 — real act-as (merged #520, 2026-08-17)** — completes the §65 Option B lineage: an Agency operator can now actually enter one of their real sub-accounts (server-authorized, session-scoped) and return to the agency view, replacing B1a/B1b's decorative fixture-only `acting` state. Actor-namespaced act-as URL (`/agency/{n}/sub/{childAccountNumber}/{branch}/{subtab}`, owner-ruled 2026-08-17); `acting` is DERIVED from the session (`activeTenant` vs the URL's claimed account number), never a raw `setState` — a stale/spoofed URL can never fake an identity the session hasn't confirmed (§9/§13). Migration `20260917000000`: `agency_list_my_subaccounts()` gains `account_number` (additive-only, §37 zero-dependent DROP+CREATE, §32.a rollback-proof GREEN + persisted-apply confirmed post-merge). `enterSubaccount`/`exitSubaccount` compose the existing SECURITY DEFINER RPCs (`agency_enter_subaccount`/`agency_exit_subaccount`) with the platform's proven tenant-scope-switch primitive (`useTenantContext().switchTenant`); wired into the switcher popover, the acting-banner, and the Clients-hub Directory's "Enter →"/attention-rail buttons. A deep-link resolving effect validates a bookmarked/reloaded `sub/{n}` URL against the caller's real roster before ever calling the act-as RPC (mirrors the existing top-level forward-IDOR guard). **§39 peer-gate ITERATE → folded same-session (2 CRITICAL + 1 MEDIUM, all verified against source before fixing):** (1) `tenants` is only refetched on mount/auth events, never by `switchTenant` — on a FIRST-EVER act-as entry the just-granted child was absent from the cached list, so `activeTenant` resolved to null forever and the shell got permanently stuck on "Switching into that sub-account…"; fixed by calling `refresh()` after `switchTenant()` succeeds. (2) the deep-link resolver effect listed its own `switchBusy` flag as a dependency, making it self-cancelling (`setSwitchBusy(true)` changed a dep → React tore the effect down before the in-flight RPC resolved → `setSwitchBusy(false)` never ran on any path); fixed by removing it from the deps array. (3) CommandCenter's decorative "Needs attention" panel's "Open sub-account" button silently regressed into a dead no-op once wired to the real (defensively-guarded) act-as action — fixed by honestly disabling it (that panel has no real per-sub-account backend yet). §5/§63/§13 compliance came back SHIP (one non-blocking SHOULD-FIX: two hand-rolled URL-concat sites duplicate `branchPath`'s job, tracked not blocking). A second CI-only failure (§60 `lint:tier-features` flagging the new `ownAgencyTenant` account_type compare) was fixed with a documented `tier-feature-exempt` marker (legitimate tier ROUTING, not a feature-availability decision). Verified: tsc 0 · eslint 0 · vitest 271/271 · vite build green · lint:{views,definer-fns,tier-features,skeleton} clean · ci:tsc ratchet clean · gold-discipline clean. §32.c owner/Cowork live-drive owed (auth-gated agency act-as flow, no browser-driving capability this session).
- **§65 Option B / B1b — real sub-account roster in the Clients-hub Directory (owner GO, 2026-08-17)** — wires the "Your sub-accounts" Directory grid (`src/agency/clients.tsx`) from fixtures to the same RLS-safe `useAgencyRoster` adapter B1a proved out. Real now: card name/health/client-count/MRR + REAL tenure (from the child tenant's actual `created_at`); filter-chip counts recomputed from real rows (dropped hardcoded "(7)"/"(3)"/"(2)"); header line drops the non-existent "book average health {number}" for a real derived "{N} active · {M} need attention · {K} healthy". **The core fix:** the "Needs your attention" rail previously showed FABRICATED named accounts with fake dollar-impact figures and fake Paige-drafted narrative ("Approve her renewal draft before Friday… she has never negotiated on price" — entirely invented) — replaced with a list derived from real watch/at-risk roster rows (real name, real health, real MRR-if-known) and a generic "Open sub-account" CTA, never an invented insight (§13). New `src/agency/data/rosterFormat.ts` (§18 one home: health-bucket→dot/label, deterministic per-sub swatch, real tenure-from-created_at, cents→MRR formatting); `AgencyApp.tsx`'s B1a `healthDot`/`swatchFor` deduped onto it. Honest loading/empty states replace the old assume-always-populated render. **§39 peer-gate ITERATE → folded same-session:** (1) `roster.isError` wasn't checked — an RPC failure fell through to a false "No sub-accounts yet"; added a distinct honest error state + Retry. (2) header math silently didn't sum for unscored (health:null) rows — added an explicit "{X} not yet scored" clause. (3) the decorative sparkline sat full-color beside real MRR, risking being read as a real trend — muted to neutral/0.45 opacity. (4) **the crux compliance finding:** Directory (now real, the default tab) sits one click from Pipelines (still 12 fixture-named companies, similar visual grammar) — strengthened the pack's EXISTING `pipesFlag` honesty-tooltip (`fixtures.ts`, single use site) to explicitly disclose the sub-account NAMES are also stand-ins, not just the figures, pointing to the real roster tab. **Deferred, own tracked task (#175), non-blocking today:** `agency_portfolio_metrics()`'s leaderboard `LIMIT 20` can silently drop at-risk sub-accounts beyond the top 20 by MRR from the attention rail once a book exceeds 20 subs — a pre-existing backend limitation needing a §37 producer inventory + migration, not a quick patch. Out of scope (documented in-file): Pipelines/Conversations/own-book stay on fixtures — same one-surface-at-a-time discipline as B1a. Verify: tsc 0 · vitest 271/271 · eslint 0 err · vite build green · both crew passes run against the real diff.
- **§65 Option B / B1a — real agency identity + real sub-account roster in the shell chrome (owner GO, 2026-08-17)** — wires `src/agency/AgencyApp.tsx` from fixtures to the EXISTING RLS-safe adapters (`useAgencyMetrics` / `useAgencyRoster` over `agency_portfolio_metrics` / `agency_list_my_subaccounts` / `agency_my_membership` — session-scoped by `auth.uid()`, never a client-supplied tenant_id, §9/§51). REAL now: rail brand name + plan card (agency name · plan_offer · real sub-account count), TopBar operator (auth-session name) + provider chip (agency name), account-menu (real operator name + real email from auth + real plan), account-switcher RECENT list + "All sub-accounts (N)" (real roster rows — name · real client-count · health-bucket→dot). §13 honesty: no-backend fields stay Preview (per-sub drafts→client-count, hours-saved dropped, brand color→deterministic swatch, count shows "—" until the seam returns). **§39 (task #171) URL ownership guard:** `/agency/{n}` is an address not authority (§9) — redirect a number that isn't the caller's own account_number to their own, canonicalize bare `/agency/{n}`→default branch, acts only once account_number resolves (never bounces mid-load). §28/§63 faithful-port: DATA source swapped only, markup byte-identical. Switcher click routes to Clients hub (honest LISTING) — real per-sub view-as ENTRY is B2. **OUT OF SCOPE (documented):** sub-mode + provisioning/Ask-Paige demo modals keep fixtures; the Clients-hub Directory roster is B1b. Verify: tsc 0 · vite build green · crew (§39 adversarial + §5/§63 compliance) on the real diff. **HONEST GAP surfaced (task #173):** Solo + Sub-account owners still log into a STATE-DRIVEN inline `/admin` takeover — no `/solo/{n}` or `/business/{n}` menu/sub-tab URLs yet (only Agency got the full URL wiring); that's R3, owed before Super Admin.
- **§65 Option A — Agency sub-tab URL wiring (3-level tree, owner GO, 2026-08-17)** — completes the addressable agency tree: every sub-tab is now a real deep-linkable URL segment `/agency/{n}/{branch}/{subtab}` (e.g. `/agency/3855/command-center/systems-check`). New `src/lib/routing/useSubtabRoute.ts` — a drop-in replacement for each screen's local sub-tab `useState` that DERIVES the active sub-tab from URL segment `[1]` (`subtabBySlug` via the `TIER_BRANCHES` registry) and NAVIGATES on set (`subtabByKey`→`subtabPath`). Wired all **12** sub-tabbed agency screens (CommandCenter·paige·automations·clients·calendar·growth·analytics·billing·marketplace·vault·team·setup); Client Support + Integrations have no sub-tabs (unchanged). **DUAL-MODE (§58):** mounted WITHOUT a `:account` param (the sub-account `/admin` inline takeover, whose `/business` tree lands in R3) the hook degrades to plain local `useState` → that path byte-unchanged. §28/§63 faithful-port: each screen's markup untouched, only its sub-tab state-plumbing swapped; var names preserved (anTab/setAnTab, tabKey/setTab). Each default key == its branch's FIRST sub-tab key (bare `/agency/{n}/{branch}` renders the default, §13 honest fallback). Verify: `tierBranches.test.ts` 16/16 (6 sub-tab invariants) · tsc 0 new (baseline 18) · vite build green. **§13 NOT in this slice (A2 follow-up):** the cross-cutting `?scope=` query-param conversion (autos/calendar/marketplace/vault/team scope filter + `trust-compass` scope-as-nav) — those keep existing scope handling; only destination sub-tabs are URL-driven. §32.c owner live-drive owed (login → land on `/agency/{PME-n}/command-center/overview`; click sub-tab → URL updates; refresh/bookmark → resolves) before Option B (#171) fires.
- **§65 R0-slice-2 — Agency shell → deep-linkable URL routes (owner GO, 2026-08-17)** — converts the state-driven `AgencyApp` (15 tabs, zero URLs) to URL-driven routing at `/agency/{account_number}/{branch}`, every tab now a real bookmarkable deep-link. §28/§63 faithful-port preserved — SURGICAL state-plumbing swap only: `route` DERIVES from the URL slug via the `TIER_BRANCHES` registry, `go(k)` NAVIGATES; the Rail/TopBar/screens markup is byte-identical. DUAL-MODE (§58): mounted inline WITHOUT a `:account` param (the sub-account `/admin` takeover, §51 Gate B, whose `/business` tree lands in R3) it falls back to local state → that path byte-unchanged. New `src/agency/AgencyEntry.tsx` dispatches `/agency/*`: numeric first segment → new URL-driven shell; anything else → the legacy `AgencyLayout` board untouched (§58, no route collision — account numbers are always numeric). `Admin.tsx` Gate A now REDIRECTS agency/enterprise to `/agency/{account_number}/command-center` (defensive inline fallback if the number is null). `useTenantContext` exposes `account_number` (select + interface + unknown-cast for the not-yet-regenerated types). Verify: tsc 0 · build green · vitest 10/10 · eslint 0 err. **§13 honest — NOT in this slice (fast-follows):** (a) the actor-namespaced act-as URL (`/agency/{n}/sub/{subN}/…`) + real-roster/`agency_enter_subaccount` wiring — `acting` stays fixture state for now; (b) bare `/agency` + `resolveLandingRoute` → numeric redirect (the owner's `last_account` pref routes through `/admin`→Gate A, so his path IS covered); (c) sub-account `/business/{n}` tree (= Solo tree per §11c, lands with Solo in R3). §32.c owner live-drive owed (auth-gated).
- **§65 R0-substrate — TIER_BRANCHES registry + account_number numbering (owner GO, 2026-08-17)** — TWO owner rulings LOCKED 2026-08-17: (1) `account_number` = offset/scrambled (random unused 7-digit, reveals no count/order), NOT sequential; (2) act-as URLs are actor-namespaced (`/operator/act-as/{n}/{branch}` · `/agency/{n}/sub/{subN}/{branch}`). Built the first R0 slice: `src/lib/routing/tierBranches.ts` — the config-as-data route-tree registry (§10/§18 one home; encodes §11c sub_account-inherits-SOLO-tree + §3/§61 enterprise=agency-superset) + 10-test lock. Migration `20260916000000_tenant_account_number.sql` — `account_number bigint UNIQUE NOT NULL`, `gen_tenant_account_number()` (random 7-digit, bounded-retry, DEFINER, anon-revoked §59), `assign_tenant_account_number` BEFORE INSERT trigger (covers ALL creation paths §37), per-row backfill of the 13 existing tenants. **§32.a proof GREEN + rolled back on prod** (13/13 unique 7-digit, min=1047822 max=8381120 well-scattered, new-tenant assignment valid; column confirmed NOT persisted). tsc 0 · eslint 0 · vitest 10/10. CI deploys the migration on merge (§24/§32.b persisted-apply confirm owed post-merge). This is substrate ONLY — the Agency route-conversion (state→routes) is R0-slice-2, the bigger auth-touching owner-live-drive-gated piece.
- **Route + URL Taxonomy §10–§14 — the branch-tree design (owner GO to execute, 2026-08-17)** — owner reviewed the taxonomy + greenlit the code-rename migration (Agency+sub FIRST → Solo → Operator-after-new-design). Owner ruling: the URL system is the ADDRESSING BACKBONE the orchestration brain routes over ("an address IS a data route"); each account type = a canonical branch tree, cloned per account at signup, rooted at its `account_number`; every tab = a deep-linkable branch (`/agency/{n}/trust-compass`), every branch a §10-governable seam. Three-scout §30 audit established: the NEW tier shells (`AgencyApp`, `SoloApp`) are 100% state-driven (zero URLs — the root cause of no deep-links); the LEGACY `/admin` console is already fully real-route (the proven pattern to convert TO); §37 blast-radius ~404 `/admin` refs + 2 role→path tables (`resolveLandingRoute` + `accept-invite`) + silent-break producers (edge-fn email/Stripe/OAuth deep-links) + `hostRouting` reserved words/tests. Design added to `docs/doctrine/route-and-url-taxonomy.md` §10 (branch-tree model) · §11 (complete per-tier branch map: Agency 15 · Sub 15 · Solo 13 · Operator deferred · Client unchanged) · §12 (audit findings) · §13 (migration engine: declarative `TIER_BRANCHES` registry + URL-driven `<AccountShell>`) · §14 (redirect-safe phased plan R0 substrate → R1 engine → R2 Agency+sub → R3 Solo → R4 Operator+retire). One owner decision blocks R0: `account_number` shape (offset-scrambled recommended vs sequential). Docs-only.
- **Route + URL Taxonomy (§65) — matrix + migration plan, docs-only** (2026-08-17, PR-in-flight on `claude/pai-phase-3-1-task-19-bixryi`) — closes the `/admin` 4-way-overload naming-debt (Solo+Sub+Agency+God all logged in through ONE route, so the agency owner kept landing on "the same page"). Authored `docs/doctrine/route-and-url-taxonomy.md`: the LOCKED 6-row matrix (Operator→`/operator` · Agency→`/agency/{account}` · Enterprise→`/enterprise/{account}` · Solo→`/solo/{account}` · Sub-account→`/business/{account}` · Client→`/portal/:tenantSlug`), per-account unique numeric URL (net-new `account_number` column, address-NOT-grant), shared-shell design (solo+business one shell; agency+enterprise one shell + Enterprise customizations, §60), current-route→target mapping, producer blast-radius (/admin ~353 src+7 edge, /app ~143+9), staged redirect-safe migration (R0 substrate→R1 Operator→R2 Agency+Enterprise[folds `last_account` revert]→R3 Solo+Business→R4 retire redirects). CLAUDE.md **§65** anchor (names map to the user's mental model — routes named for WHO is there, never internal router/DB structure; the name READS, the session-derived scope + `getTierFeatureSet()` still ENFORCE). **Owner-ruled:** revert the `agency_login_default='last_account'` workaround in R2; delete `test-agency-preview` after the owner live-check. **This PR = taxonomy + matrix + migration order + docs ONLY, ZERO code renames** — owner reviews the taxonomy + migration order BEFORE any code-rename slice fires (§58 old routes stay redirect-alive). §65 cross-refs §36/§51/§56/§60/§61/§9/§58/§18.
- **Solo shell activation red-lines FIXED + §57 runtime toggle + FIRST canary** (merged #505, 2026-08-16) — owner "CC fixes it all now." Cleared the three doctrine red-lines that blocked activating the #503 faithful port: **§63** all owner-real-account fixtures anonymized to a fictional identity (Antonio Cook→Jordan Avery; Project Mogul/Mogul Maker→Meridian Advisory; entities→Meridian Advisory/Coaching/Holdings; provider→Northwind Partners); **§2** marketplace hero now coaching-generic, funding survives only as ONE opt-in Playbook card (`state:'get'`), zero finance-default copy; **§57** `Admin.tsx` mount converted from build-time `VITE_SOLO_SHELL_ENABLED` (tier-wide, un-canary-able) to runtime per-tenant `tenants.features.solo_shell_enabled` read via `useTenantContext` (active-tenant-only, §51/§9-safe), strict `tierKey==='solo' && soloStandalone` gate preserved — Super-Admin/God keeps its OWN separate design (owner-ruled 2026-08-16) and can never render this shell. Plus button-in-button fix + real ⌘K keydown. Verified: §39 adversarial diff read + §32.c headless render drive of the anonymized `<SoloApp/>` (14/14 surfaces, 0 pageErrors; home/marketplace/setup visually confirmed) · tsc/build/lint:tier-features/eslint all 0. **Canary (owner order empty → mogul-credit → first-sterling LAST):** `paige-operator-workspace` (d1f0a7e2) ACTIVATED via DB flag. **`mogul-credit-company` + `first-sterling-capital` HELD (§58/§13):** the shell is FIXTURE-ONLY (zero supabase/tenant-data reads in `src/solo`), so activating a real account replaces its owner's dashboard with the fictional mockup — needs explicit owner ack + data-wiring first. §32.c authenticated PROD render owed to an owner/Cowork live-drive (SSO/auth headless limit).
- **Solo shell — Claude Design faithful port (flag-gated, OFF)** (merged #503, 2026-08-16) — byte-faithful port of the Claude Design "Solo workspace" pack into `src/solo/**`: 13 fixture-data screens (Command Center · Paige · Trust Compass · Automations · Clients · **Calendar** incl. webinars · Growth · Analytics · Marketplace · Business Vault · Integrations · Team · Setup) + `SoloApp` (Rail/TopBar/registry) + `solo-tokens.css` (scoped `.paige-solo`) + `_shared` barrel. Mounted in `Admin.tsx` as a flag-gated (`VITE_SOLO_SHELL_ENABLED`, default OFF) early-return takeover for STRICT solo-standalone tenants only (`tierKey==='solo' && soloStandalone` — §51-safe, rejects sub-account/Agency/Enterprise/God), lazy code-split, wrapped in `AdminLoaderBoundary` (§32). Flag OFF ⇒ prod render byte-unchanged (§58). Faithful-port (§63, owner "keep it as is") so retyping/recoloring is forbidden → lint exemptions scoped to `src/solo/**` ONLY: eslint override (`ban-ts-comment`/`prefer-const`/`no-unused-expressions`/`rules-of-hooks`) + gold-discipline skip (2 owner-approved gold-as-background surfaces). Calendar↔Automations "connection" is fixture data (3 calendar-sourced automations shown); firing on real events is next-phase wiring (§13). **Owner-ruled 2026-08-15:** each tier gets its OWN Claude Design pack — the prior "sub-accounts inherit Solo" reading is RETRACTED (see master §10; §60 = feature availability, NOT visual design). Verify: §63 grep CLEAN · zero markup drift · tsc 0 · build 0 · vitest 255/255 · eslint 0 err · gold/regression/tier-features clean · §39 SHIP. **OWED (owner-gated):** activation (flag flip, canary `first-sterling-capital` LAST — it has real data) + §32.c live-drive of the auth-gated shell.
- **Task #126 Slice 3b — `browse_public_url` skill** (merged #502, 2026-08-16) — turns the Slice-3a `/browse-public-url` wildcard endpoint into a real Paige skill + the FIRST writer of the `paige_browser_usage` audit rail. Interpreter routes a `tool:"browser"` step with **`mode:"public"`** (runtime `inputs.url`, §18 url-from-input) to a new PUBLIC-web browse seam (`browsePublicViaHost`: 30s AbortController + 1 retry on 5xx/throw), extracts the research shape (title/meta/h1/body≤500KB/links), and writes ONE tenant-scoped `paige_browser_usage` row per call — allowed OR blocked — via service_role in the CALLER (`tenant_id`=server-resolved `ctx.tenantId`, `created_by`=invoker; the DB-free Fly host writes nothing, §9/§34). `pickBrowserStep` now excludes `mode:"public"` → `verify_deployed_surface` byte-unchanged (§58). Seed `20260914000000` (category `operations_process`, `read_only`+`auto` so the §16 clamp FIRES, `scoping='platform'`, tier §61 default). Trust Compass `tech.browse_public` → Technology/Automation (`20260914010000`, additive). **§18 producer decision:** the ONE audited producer is the existing generic `run_skill` (paige-mcp→skill-runner→interpreter) — reachable + audits with ZERO per-surface code; forking a direct host call into paige-ai-chat/subagents is PROHIBITED (bypasses the audit write §9 + forks the seam §18); exposing skills in the main paige-ai-chat tool loop = broader capability, DEFERRED to its own slice. **§13 corrections:** (1) brief's `category: research` is invalid (not in the 12-value enum) → `operations_process`; (2) the 3-surface producer list resolves to the one audited `run_skill` home. Verified: 35 vitest · tsc 0 · lint:{views,definer-fns,tier-features} clean · §32.a rollback proofs GREEN on prod (skill + Trust Compass + audit-write shape) · §39 peer-gate SHIP on the real diff (M1 audit-fidelity + L1 429-retry fixed same PR). **§32.a persisted-apply CONFIRMED post-merge (2026-08-16):** prod `schema_migrations` has both versions; `browse_public_url` skill + `tech.browse_public` action_kind live; `deploy-edge-functions.yml` @ `74d601c2` success. §32.c live-drive (`run_skill browse_public_url` → confirm the usage row) owed to a paige-mcp/browser-capable session (headless CC has no paige-mcp).
- **Skills Wave S1b interpreter + S1d format-picker** (own PR, 2026-08-11) — `paige_skills` recipes now RUN generically. `_shared/skill-interpreter-core.ts` (pure, 21 vitest) + `_shared/skill-interpreter.ts` (Deno) wired ADDITIVELY into `skill-runner`'s default case: reads the skill ROW → forges via the EXISTING `forge()` seam (§26) → §16 autonomy clamp (auto/confirm→approval/off) **with a structural risk-floor** (external_send/mutating never auto-execute) → §60/§61 tier belt (`resell`=marketplace-only, denied self-run) → §9/§59 server-resolved tenant (contact wins, mismatch=IDOR reject). **§16 GUARANTEE:** NO external-send call site in the interpreter (send only via the later approved-send seam). **§58 by construction:** 4 shipped slugs byte-identical (interpreter runs only non-bespoke; `force_interpreter` = diff-tooling, NOT in MCP schema). S1d: doc skills ask Word/GDoc/PDF/Markdown first. `scripts/skills-s58-harness.mjs` = capture+diff automation. **§1 design-review crew caught 5 MUST-FIX pre-merge** (approvals type/risk CHECK violations, §16 risk-floor gap, `resell` self-run leak, §9 body-trusted tenant). Headless-verified: tsc 0 · vitest 241/241 · tier-lint clean. **Owed to Cowork (has paige-mcp):** §32.c live-drive via `run_skill` + Slice 1/3 MCP baseline/diff. CC headless lacks the paige-mcp connection (honest §13/§32.c).
- **§61 Standing Tier Distribution Default** (2026-08-11, owner-ruled PROPOSED) — the standing DEFAULT answer to "which tier gets this?", so it stops going to the owner per-feature (Cowork miss #12). Owner: *"yet another time you've asked me where things should be placed when we should already have this understanding… lock this in as a complete doctrine, in our brain and the master project."* Every new `getTierFeatureSet()` feature defaults to: **Super Admin (God) = YES** (everything, §57/§35) · **Solo = YES** · **Sub-account = YES** · **Agency = RESELL** (does NOT operator-use it — resells to sub-accounts via Marketplace) · **Enterprise = YES + RESELL** (hybrid). Deviations need an owner ruling + a code comment; matching features ship noting "§61 default: no exception". Preserved exceptions: `customer_portal_invite` (Solo+Sub+Enterprise), `growth`/`studio` (Solo+Sub+God, Agency excluded). Authoritative home `docs/doctrine/tier-matrix.md` §61; CLAUDE.md §61 (PROPOSED). **Anchoring:** `skills` follows the default (God/Solo/Sub=YES, Agency=RESELL, Enterprise=YES+RESELL); vocab = MEDIUM (glossary `skills-vocabulary.md` + comments, NO renames — NOT the earlier "full rename"). Docs-only PR (#463).
- **D7 corporate identity — LLC → Paige Agent AI Inc.** (2026-08-11) — owner ruled Option A · direct C-Corp conversion (standalone Delaware C-Corp, NO holdco). Swept present-tense entity name in `platform-identity.ts` (`legal_entity_name`), `Terms.tsx`/`Privacy.tsx`, `OPERATOR-ACCESS-MODEL.md`, `owner-trilogy`/`practice-blueprints` docs, `supabase/functions/CLAUDE.md`. Corrected the false "subsidiary of CoreConnect holdco" claim in `paige-c-suite-roster.md` (banner-flagged the tri-scope portfolio-mode doctrine for owner review — NOT gutted, §28/§58). Authored `docs/doctrine/paige-corporate-structure.md` (PROPOSED). §13 kept honest: vendor-account records (Twilio Org, config-registry) annotated "pending rename" (still literally named LLC until owner renames); immutable applied legal-template migrations (DPA/FCRA/Broker/Terms/Privacy DB copies) + dated audits left untouched, flagged owner-owed. §37 verify: 0 stray present-tense LLC identity refs remain. Owner-owed follow-up (task): vendor renames (Twilio/Stripe/DocuSign/WHOIS) + binding-legal-doc migration + banking. Own PR (not bundled w/ skills wave or hotfix).
- **Skills Wave Slice 0 — §60 Enterprise HYBRID baseline** (2026-08-11) — closes flag 1 from PR #458. Owner ruled Enterprise = the ONE HYBRID tier (inherits BOTH Solo/Sub "doing" surface AND Agency "managing" surface). `ENTERPRISE_FEATURES = Set([...SOLO_FEATURES, ...AGENCY_FEATURES, ...CREATION_SURFACES])` — net change: enterprise GAINS `customer_portal_invite`. **Both layers in ONE PR (§37 no split-brain):** UI helper (`tierFeatures.ts`) + server RPC (migration `20260824000000` narrows `create_tenant_invite_token` consumer guard `IN('agency','enterprise')` → `='agency'`; byte-faithful superset of `20260823000000`, #227/FIX-1 gates preserved). **§32.a PROVEN on prod** (BEGIN…ROLLBACK super_admin + temp tenants: enterprise_consumer=SUCCESS, solo=SUCCESS, agency_consumer=BLOCKED(42501), agency_team=SUCCESS). §37: all 5 minters route through `hasTierFeature('customer_portal_invite')` → auto-update, no producer breaks. §58: only enterprise gains, no tier loses. §39 headless self-review: no blockers. tsc 0 · vitest 18/18 · lint:tier-features clean. Pure AGENCY still blocked both layers. Flag 2 (god tierKey collapse) still open (YAGNI). Owner §32.c owed (enterprise portal-invite live-drive).
- **#125 §60 tier-lock SERVER enforcement + Growth/Studio tier move** (2026-08-11) — completes §60 end-to-end. (1) migration `20260823000000` adds an `account_type` guard to `create_tenant_invite_token` — `_kind='consumer'` for an agency/enterprise TARGET raises 42501 (all callers); faithful superset of #227 F.1 (byte-diff = the guard only); **§32.a PROVEN on prod** (super_admin BEGIN…ROLLBACK: consumer+agency blocked, consumer+sub allowed, team+agency allowed). (2) `growth`+new `studio` = solo/sub/enterprise/god, NOT agency; god gains them (§35); enterprise = explicit superset (kept growth + gained studio). (3) `RequireFeature` route gate (mirrors FundingRoute, §18) on /admin/campaigns + /admin/studio + `loading` guard (no fail-open flash). §39 SHIP (migration byte-faithful) + §5 SHIP-after-docs-reconcile. tsc 0 · lint clean · vitest 18/18. §13 correction #8: the server gate was NOT deferred on hypothetical-Enterprise risk (0 enterprise customers). Owner-flags for #124: Enterprise should likely also get `customer_portal_invite`; god tierKey collapses super_admin+platform_admin. Owner §32.c owed.
- **#122 getTierFeatureSet structural tier-lock (§60)** (2026-08-11, owner-MANDATORY) — the §60 ONE HOME for tier→feature mapping: `src/lib/tier/tierFeatures.ts` (`TIER_FEATURE_BASELINE` + `resolveTierKey`/`getTierFeatureSet`/`hasFeature`) + `useTierFeatures()` hook + `lint:tier-features` CI guard (sibling of lint:views/lint:definer-fns) + matrix unit test (16 assertions). Owner-locked cell: `customer_portal_invite` = Solo + Sub-account ONLY (Agency + Super Admin excluded). §1 review crew on the real diff: §39 caught a BLOCKER — a **5th ungated consumer minter** (`WorkspaceSettingsPanel` on the UNIVERSAL Setup surface) — now gated (all 5 honor the lock); §25/§5 fixed a blank-Select reset + a dead Resend button; §18 refactored 2 sites to shared `canOwnSubaccounts()`; resolveTierKey now applies the §51 parent-first invariant. §13 honest: lock is UI/build-time (helper+lint); server RPC `create_tenant_invite_token` does NOT yet tier-gate consumer invites (tracked follow-up, not a §9 IDOR) **[CLOSED in #125 — migration 20260823000000, §32.a-proven; now server-enforced]**. tsc 0 · lint clean · vitest 16/16. §60 → CLAUDE.md (PROPOSED). Deferral of the helper was REVERSED by explicit owner ruling (§13 correction #7). Owner §32.c owed (portal-invite hidden on Agency Set›Workspace + present on Solo/Sub).
- **#123 MMA slug swap** (data-fix applied on prod 2026-08-11, docs PR) — owner Agency-dashboard live-drive caught sub-account Mogul Maker Academy (`d8a0a880`) at `/mr-mogul-maker-academy`. §30 DISPROVED the "one free-slug rename" premise: target `mogul-maker-academy` was held by the PARENT agency (`29a7c77f`) under UNIQUE `tenants_slug_key` — a mismatch from the #55 Academy→Agency reversal (slug never followed the rename). Owner ruled **Full swap**: parent→`project-mogul-enterprise`, child→`mogul-maker-academy` (one txn, parent freed first). **§32.a GREEN on prod** (rollback-proof → commit → 0 `mr-` prefixes + 0 dup slugs; §51 invariant intact). §37: slug drives public routes (`/store/:slug`, growth renderers, `peek_tenant_portal_brand`); no live code/DB object keys on either string (historical migration refs are inert one-time DML). Data-only via MCP (no migration file — hardcoded tenant IDs). §39: no other tenant carries an `mr-` prefix (no broader sweep). Owner §32.c owed.
- **#454 / #122 Systems Check load perf** (merged 2026-08-11) — new `systems_check_snapshot(p_scope)` SECURITY DEFINER RPC (migration 20260822000000) collapses the tile's 2-3 serial PostgREST round-trips into one; `useSystemsCheck.ts` + `staleTime:60_000`. §30: not a DB problem (0.24ms query); latency was serial RTTs re-paid on nav. §59-clean (tenant in-body, operator gated, authenticated-only). §32.a parse + §32.b row-match (MMA 10=10) + §39 SHIP. No index/semantics change. Owner §32.c owed.
- **#453 / #121 same-tier feature parity (§16 dept block)** (merged 2026-08-11) — hoisted `PaigeDepartmentStatus` above the `emptyBook` split in PracticeOverview so it renders on every same-tier tenant regardless of book state. §30 DISPROVED the stale-classification hypothesis (real cause = empty-state placement, all 4 PME tenants are `sub_account`); platform sweep found ZERO other feature-gate leaks. Owner then ruled `getTierFeatureSet()` structural helper MANDATORY (own PR). Owner §32.c owed.
- **#451 / D10 tier-taxonomy + "Portfolio" removal** (merged 2026-08-11) — `D10`: owner live-drive found `/agency` rendering a "Portfolio" section (reserved for Enterprise, §57) that duplicated "Your sub-accounts" (§18). Deleted the standalone Portfolio `SectionCard`, folded all 7 capabilities (health chips/meter/ranking/MRR/Health/Clients/Open) into the roster (§58 — nothing lost; metric overlay by `tenant_id`, absent→"—" not 0, §13). New `src/lib/agency/tierLabels.ts` `getTierBookNoun()` = §57 top-down source (People/Sub-accounts/Portfolio-RESERVED/Fleet). Codex caught 2 real fixes (book-noun from agency context when scoped into a child; `portfolioLoading` in table loading) — applied pre-merge. §30 scout + §39/§5 SHIP + §25 design SHIP. Owner §32.c owed. Fast-follow #119: uncapped metric overlay (agency_portfolio_metrics caps at 20) + Fleet/People helper adoption.
- **#450 / doctrine ratification** (merged 2026-08-11) — §57 (Super Admin = source of truth) · §58 (Anti-regression) · §59 (SECURITY DEFINER caller-scope-in-body) flipped PROPOSED → OWNER-LOCKED 2026-08-11. §58 §39-checklist item now binding every PR.
- **#448 / §9 P0 #117 (SECURITY DEFINER fn audit)** (merged 2026-08-11) — `fix(§9)`: audited authenticated `SECURITY DEFINER` functions and closed **20 confirmed cross-tenant leaks** (global-role-bypass + param-IDOR reader patterns + **1 HIGH auth bypass** in `delete_credit_report_upload`, which role-checked a caller-SUPPLIED `_calling_user_id` instead of `auth.uid()`). 2 migrations (`20260821000000` read-hardening + `20260821010000` writer-hardening) + `scripts/ci/definer-fn-lint.mjs` (`lint:definer-fns`) anti-recurrence guard, sibling of `lint:views`. **§32.a/b + §37 producer inventory + §39 peer-gate = SHIP.** Companion to #116 (the VIEW class — same owner-scoped-execution-bypasses-RLS mechanism, different object type). Honest severity: authenticated-only (lower blast radius than #116's anon-reachable PII/FICO), 1 HIGH. Owner §32.c owed. New PROPOSED CLAUDE.md doctrine (DEFINER-fn caller-scope-in-body, companion to #116's view rule).
- **#447 / §9 P0 #116** (merged 2026-08-11) — `fix(§9)`: closed **11 platform-wide `security_invoker=off` VIEW cross-tenant leaks** (anon/cross-tenant reachable — the higher-blast-radius PII/FICO class) + added the `lint:views` CI drift guard. Generalized #55. Companion to #117 (the FUNCTION class).
- **#446 / §9 P0 #55** (merged 2026-08-11) — `fix(§9)`: closed the Command Center cross-tenant approvals leak — `paige_approval_queue_v` had drifted to `security_invoker=off`, bypassing RLS. First case of the class; §10 correction reverses Cowork's "permissive-OR bypass" naming (real cause = view `security_invoker` drift).
- **#444 (hotfix §40/§41/§42)** (merged 2026-08-11, `7f2a9fa3`) — three §32.b runtime bugs from the owner's MMA live-drive; §30 corrected all three handoff premises (live-code/data). **D1 artifact "Preview unavailable"** — NOT the `meta`-vs-`body` field mismatch (`loadDocument` already reads `body`); real cause: the streamed `paige_artifact` frame omitted `tenant_id`, so the card hydrated under the VIEWER's active tenant while the doc is owned by the managed sub-account → `.eq(tenant_id)` miss → null. Fix stamps `personaCtx.tenant_id` on the frame + card reads `a.tenantId ?? activeTenantId`; RLS/loadDocument untouched (§9 — RLS backstops, a frame tenant can only NARROW). **D2 People KPI 2 / list 0** — NOT a SQL over-filter; the client-side "My Queue" view (`scopeMine`, ContactsAdmin.tsx:342) hid contacts assigned to another user while the KPI counted the full array. Fix sources the KPI tiles from `filtered` (auto-escape from an empty My-Queue = §36 fast-follow). **D3 fresh sub-account 0 systems-check runs** — NO creation path fired an onboarding scan on ANY tier (the `systems-check-run-onboarding` runner was orphaned; MMA's runs are all daily-cron). Fix (migration `20260818000000`): a `enqueue_onboarding_systems_check` helper (non-blocking `pg_net`, x-cron-token reused verbatim) wired into `create_subaccount` (sub-accounts) + an AFTER INSERT trigger for top-level tenants (skips operator/system workspace) + an internal-caller gate on the edge fn (`verify_jwt=false`, service/cron OR user-JWT) + a §36 pending state. **§32.a PERSISTED-APPLY PROVEN on prod (2026-08-11):** `schema_migrations` has `20260818000000`; helper + trigger live; `create_subaccount` def contains the enqueue (body verbatim from `20260803120000` + only the 8-line block). §39 peer-gate SHIP; edge-deploy GREEN. Owner §32.c owed (offer letter Opens; fresh sub-account → pending → run row). **D4/D5** (client detail reachability + Paige-send channel picker + comms threading) = separate slice, task #114.
- **#443 (docs §109 close-out)** (merged 2026-08-10) — `docs(brain,§0/§BRAIN.3)`: #442/#109 decision-log + master-doc §10 §30-premise correction (chat was already Anthropic-direct, not Lovable/Gemini) + config-registry `LOVABLE_API_KEY` re-scope (email-trinity only, task #112).
- **#442/#109** (merged 2026-08-10, `b3fb6e44`) — `fix(paige-chat,§34/§30/§37)`: reasoning-tier routing for the #34 approval loop + Lovable dead-code purge. **§30 premise correction (proven with live `paige_llm_trace`): the chat was ALREADY Lovable-free AND Gemini-free** — runs on `claude-haiku-4-5`(classification) + `claude-sonnet-5`(reasoning) + `featherless`; `gatewayCompat` is a direct-Anthropic shim and the `"google/gemini-2.5-*"` strings are legacy labels `tierForLegacyModel` maps to Claude tiers. So the handoff's "swap the chat off Lovable to Gemini" was obsolete — there was nothing to swap. **#34 fix:** a `substantiveTurn` heuristic (regex on the last user message for approval/creation intent — no extra LLM/DB call) upgrades the model label to the reasoning tier (⇒ Sonnet) at all 3 chat call sites, so "approved — run it" reliably emits `document_generate` instead of looping. Reuses the existing legacy-label→tier seam: no new provider, streaming wire-format unchanged (both tiers → `streamAnthropicAsOpenAI`), §17 preserved (trivial lookups stay Haiku). **Lovable purge (SAFE subset):** deleted `parse-business-credit-report` (the one live `api.lovable.app` AI call — orphan, undeployed, §2) + orphan `BuildProgramOutline.tsx`; purged vestigial `LOVABLE_API_KEY="unused"` dead code across 16 edge fns (gatewayCompat ignores it → zero behavior change). §39 peer-gate SHIP; edge-deploy GREEN. **NOT removed (sequenced task #112 — LAUNCH-CRITICAL):** the live email trinity (`auth-email-hook`+`process-email-queue`+`handle-email-suppression`) uses `@lovable.dev` SDKs for HMAC signing + email DELIVERY — ripping out blind silently 401s every signup; needs owner secrets + §32 live-email verify. Owner §32.c live-drive owed (MMA "approved — run it" fires without looping).
- **#441/#29 PaigeArtifactCard** (merged 2026-08-10, `6ca6831b`) — `feat(paige-chat)`: inline "Paige made you a deliverable" handoff card in regular (non-Studio) chat. Backend (`paige-ai-chat`): a `chatArtifacts` collector gated on `!studioSessionId` emits a `paige_artifact` SSE frame per document/image the agent persisted (copy excluded, §19/§21; honest — real `content_id` only, §13); the existing Studio path is byte-identical (§37 producer/consumer inventory — StudioChat only mounts when studioSessionId is set, so the new `artifactType`-bearing frame never reaches its cast). Frontend: new `src/components/paige/chat/PaigeArtifactCard.tsx` REUSES `loadDocument` + `DocumentPreview` (CSS-scaled real thumbnail, §22 — never a glyph-box; §18 no fork), gold ONLY on host-gated Send (§11), reduced-motion guarded, AA both themes. Wired into `PaigeAIChat.tsx` (flagship dashboard chat; `onSend` prefills the composer so Paige drives the send, §10/§16). FloatingChatbot/BrokerPaigeSession = §18 fast-follow (task #111, same card, ~15-line SSE wiring). §1 crew: build + §39 adversarial + §25/§5 design-critic/compliance. Edge-deploy GREEN. Owner §32.c live-drive owed.
- **#440** (merged 2026-08-10, `d77ac546`) — `fix(paige-chat)` #27/#28: tenant-scoped contact dedup guard + FK-audited Tashia cleanup. `crm_create_contact` fuzzy-matches this tenant before insert (pg_trgm `%`-index refined by `similarity()>0.6` OR exact-email; fail-OPEN §33/§5) → `needs_dedup_confirmation` instead of blind-creating (§15/§18 one seam, all tiers). Partial `UNIQUE(tenant_id, lower(email))` TOCTOU backstop. Destructive cleanup migration reparented across all 70 FK cols → 1 survivor, deleted 2 dupes (§9/§51 tenant-guarded, owner-merge-gated). **§32.a PERSISTED-APPLY FULLY PROVEN on prod (2026-08-10):** both migrations (`20260817010000`+`20260817120000`) in `schema_migrations`; `pg_trgm`+`idx_clients_fullname_trgm`+`uq_clients_tenant_email`+`find_duplicate_contacts` live (RPC EXECUTE = `{postgres,service_role}` only, §9/§39 IDOR guard held); exactly 1 Tashia on MMA at `hot_lead`, 2 dupes gone, approval `f279b9c3` linked to survivor; edge-deploy GREEN. Owner §32.c live-drive owed (re-run Tashia flow → no dupes). Follow-up #105 (other blind-insert producers).
- **#434 Codex P1 fast-follow** (2026-08-10) — Codex's independent review caught a §9 leak the crew's own §39/§5 passes rationalized away: the new `AgencyBoard` own-business Systems Check tile trusted `activeTenantId`, which on `/agency` can be a CHILD (Back after `agency_enter_subaccount`) → child's check surfaced/approvable from the agency dashboard. Fixed by gating on the §51 invariant (own top-level tenant). Lesson recorded in `lessons-learned.md #12` (never trust ambient `activeTenantId` on an operator surface). Third-reviewer (Codex/CI) value confirmed.
- **Systems Check tier-availability + §56** (task #99, branch `claude/systems-check-tier-availability`, 2026-08-10) — owner reported the tenant Systems Check missing on fresh sub-accounts. Root cause (§30): the `SystemsCheckTile scope='tenant'` was gated inside the non-empty branch of `PracticeOverview.tsx`'s `{emptyBook ? …}`, so any 0-client tenant (solo OR sub-account) never saw it. Fix hoists it above the empty/non-empty split AND adds it to `AgencyBoard` (`/agency`), matching the operator tile on `OperatorCommandCenter` → uniform across God · Agency · solo · sub-account. New doctrine **§56** (pre-build tier-matrix gate): before ANY build, name which account type(s) it's for + decide per-tier belonging. Crew: engineer + §39 (SHIP) + §5 (ITERATE→AgencyBoard gap closed). ESLint 0 / tsc 18-18. Owner §32.c live-drive owed.
- **#410** (open, DRAFT — owner review) — `docs(brain)`: the Second Brain (`docs/brain/`) + §BRAIN
  doctrine + completeness audit (this PR). Owner-review-gated, NOT auto-merge (doctrine + widespread
  reference impact). *(branch `claude/second-brain`.)*
- **#387** (open) — Harden edge function contracts + producer-inventory doctrine, audits, arch docs.

**Merged (newest first):**
- **#438** (merged 2026-08-10) — `fix(model-router)`: Featherless §34 cheap-tier close-loop. Owner subscribed "Feather Per-Request" DEVELOPER plan ($50/mo, no size cap); open-flexible default 8B→`meta-llama/Llama-3.3-70B-Instruct` + primary env `FEATHERLESS_DEFAULT_MODEL` (§10; alias `FEATHERLESS_CHEAP_MODEL`). §30: the trace `model=null` was a fidelity artifact, not a null-slug bug; root cause was pre-plan reachability. §1/§34 crew SHIP; edge-deploy GREEN on prod. **Owner §32.c owed** (operator Systems Check scan → `operator_llm_failover=pass`, closes #438+#436).
- **#437** (merged 2026-08-10) — `fix(rls)`: RESTRICTIVE service-role-only deny-all on `booking_notifications_sent` + `user_presence` (no-policy tables flagged by operator RLS-coverage check). §9/§51-safe (can only further-restrict); §37 byte-unaffected. **§32.a PERSISTED-APPLY PROVEN** (schema_migrations `20260817000000` + both policies live on prod). Regression-lint gotcha: a multi-line `AS RESTRICTIVE … USING(false)` trips the line-oriented lint — keep `AS RESTRICTIVE` on the deny-clause line (lesson #11).
- **#436** (merged 2026-08-10) — `fix(model-router)` HOTFIX A: `callModel` open-tier cells degrade to the Claude frontier on a genuine provider error (assign-not-throw → flows through §3 voice + §2 finance gates), closing the "88% open-tier error" P0. Edge-deploy GREEN. Complementary to #438.
- **#435** (merged 2026-08-10) — `feat(paige-chat)` #10 Slice A: `offer_letter` + `sales_offer` doc types extend the existing `document_generate` chat tool (NO new Documents tab, §18/§21) + widened `PLACEHOLDER_RE`. §2-clean. Edge-deploy GREEN. D3–D6 = sliced follow-ups; owner §32.c owed (draft an offer letter in chat).
- **#424** (merged 2026-08-10) — `feat(§52/§53)`: Paige operator runtime-context substrate (Phase 1) + operator role tiers. §52 = Super-Admin Paige opens every session already briefed (fix for the 2026-08-09 §36 miss where she asked the founder who he was); `paige_owner_memory` tenant_id→nullable + owner RLS branches + 7 seed rows + `_shared/owner-context.ts` composer + `paige-ai-chat` injection. §53 = `is_platform_operator()` helper + `user_roles` grant-lockdown trigger (super_admin/platform_admin grantable only by an existing super_admin/service; closed a real §9 escalation via `grant_tenant_member_role`). `is_platform_owner()` frozen super_admin-only. **§32.a GREEN on prod.** CLAUDE.md §52+§53. Owner §32.c live-drive owed. Fast-follows: #89 /admin/team tier-leak, #90 taxonomy doc.
- **#423** (merged 2026-08-10) — `feat(#80)`: Systems Check MVP Layer 1 — 4 tables + 10-check registry seed (Owner Trilogy Pillar 1). §32.b + §51 proven; **§32.a GREEN on prod**. Runner/orchestrator/surface = later layers.
- **#415/#421** (merged 2026-08-09/10) — `feat(#31)`: Revenue Integrity Chain (fail-closed trigger + operator audit RPC + always-export CSV). §32.a + live-prod block-test GREEN. Wave 8 launch-gate cleared; prod paid=0 ($0 ARR honest).
- **#411** (merged 2026-08-09, `c40f76d3`) — `feat(wave4-4a.4)`: Interactive Analytics UI primitive
  (`Sparkline`/`DrillContainer`/`MetricEntityCard`/`ExploreChart` in `@/components/ui/page`). **Closes
  Wave 4a.** §32.c live-drive owed (FLIP + recharts geometry + AA both themes).
- **#408** (merged 2026-08-09, `2ee92903`) — `fix(§9,wave-s3)`: operator-scope Super Admin
  Communications + operator Twilio A2P SMS; REUSES master Twilio creds (not new `TWILIO_OPERATOR_*`).
  **§32.a confirmed** — migration `20260812000000` persisted, `operator_conversations`/`operator_messages`
  live on prod. OWED: A2P Messaging Service SID + inbound signing token secrets; operator SMS live-drive.
- **#409** (merged 2026-08-09, `1e726426`) — `fix(voice,§13/§46)`: close ElevenLabs voice leak +
  persist Voice Configuration to CLAUDE.md. **Owner ruled `DEFAULT_TTS_VOICE = 0S5oIfi8zOZixuSj8K6n
  (Ivanna)`** — settled, on record, do not re-ask (§BRAIN.2).
- **#407** (2026-08-09) — Wave4-4a.3: Paige chat compaction + persistence + durable tasking.
- **#406** (2026-08-09) — Wave4-4a.2: L8 Memory Fabric substrate (`paige_owner_memory`).
- **#405** (2026-08-09) — Wave4-4a.1: Agent UI Placement right-rail + ⌘K launcher.
- **#404** (2026-08-09) — signup: reorder to onboarding-before-checkout + compliance staging (#66).
- **#403** (2026-08-09) — signup Slice 1 fast-follows (§37/§39): concurrency-safe entitlements +
  `user_subscriptions` unique (repairs latent stripe-webhook bug).
- **#402** (2026-08-09) — signup Slice 1 (§9/§13/§32/§37/§39): deferred provisioning + restore wiped
  signup trigger + backfill 7 orphan profiles.
- **#401** (2026-08-09) — docs: Multi-Channel Comms spec + Wave 3/4 reorder.
- **#400** (2026-08-08) — #277 Slice 3: per-sub-account Marketplace curation override grain.
- **#399** (2026-08-08) — docs: Cowork doctrine-sync — 4 locked specs + BRD/Architecture/build-order.
- **#398** (2026-08-08) — tooling (§32/§24/§18): Playwright devDep + reusable live-drive helper.
- **#397** (2026-08-08) — brand (§6/§7/§9): resolve tenant brand in 3 client-facing surfaces
  (logo-leak cluster).
- **#396** (2026-08-08) — storage (§9/§32/§37): create `btf-onboarding` bucket for signed-agreement
  PDFs + tenant-isolated read RLS.
- **#395** (2026-08-08) — tier: reverse PLAN tier academy→agency + BRD v2 delta.
- **#394** (2026-08-08) — docs (wave-4 prereq): BRD-MVP + Canonical System Architecture.
- **#393** (2026-08-07) — §51/§9: Antonio Daniel LLC P0s — chat "Invalid input format" +
  **sub-account-never-agency invariant** (DB migration `20260807230000`; see §51 absolute invariant).
- **#392** (2026-08-07) — #277 Slice 2: tenant-side agency-curation visibility branch.
- **#391** (2026-08-07) — #277 Slice 1: agency curation allowlist — table + RLS + trigger + RPC +
  `/agency/marketplace`.
- **#390** (2026-08-06) — Preserve native Clients taxonomy for Fleet Communications.
- **#389** (2026-08-06) — Expose Fleet Contacts and Pipelines entry points.
- **#388** (2026-08-06) — Add Fleet Communications launcher for Paige Operations.
- **#386** (2026-08-07) — paige-tts (§51/§9): operator/Super-Admin TTS playback — resolve platform
  context when no tenant.
- **#385** (2026-08-05) — #272-C: Agency preset visible to Academy+Enterprise only — drop Solo.
- **#384** (2026-08-05) — persona L1 (§3/§7/§18): voice-first default prompt + shared
  `PAIGE_VOICE_BLOCK`.
- **#383** (2026-08-05) — migrations (§13/§24/§32): record applied `202912` test-seed — unblock
  deploy-migrations + Slice 0 persist.
- **#382** (2026-08-05) — #277 Slice 0: `marketplace_items` tier/role/publish substrate —
  Solo/Academy/Enterprise cascade.
- **#381** (2026-08-05) — #277 Slice 4: reconcile middle tier agency→academy (canonical
  Solo/Academy/Enterprise) + kill Practice/Studio tier nouns (§3.b).
- **#380** (2026-08-05) — #277 Slice 3: fix paid-install redirect + confirm-gate destructive uninstall.
- **#379** (2026-08-05) — #271 P0 (§213/§51): restore missing table GRANTs on `marketplace_*`.
- **#378** (2026-08-05) — #269 P0: fix platform-wide marketplace install (null `installed_by_agent`)
  + surface real edge error (§210).
- **#377** (2026-08-05) — #263 (§45): guard n8n Instance-URL against owner-PII autofill.
- **#376** (2026-08-05) — Wave 3 Crew 0 (#164/#184): Blueprints substrate proof + data-drive persona
  scope (kill the funding hardcode).
- **#375** (2026-08-05) — #257/#256 (§18/§43/§213): kill the Setup sub-tab dead-end-redirect pattern.

*Tier-noun history worth noting:* #381 reconciled the middle tier to **academy** (canonical
Solo/Academy/Enterprise, killing "Practice"/"Studio" nouns per §3.b); #395 then **reversed** the PLAN
tier academy→agency. The live Stripe catalog today is **Solo + Agency** (see `config-registry.md`),
and DB plans are solo/agency/enterprise — the public "academy" noun and internal tier labels have
churned; treat the live Stripe + DB state as source of truth over any older doc.

## Dated doctrine rulings (from CLAUDE.md headers)

Each is an owner ruling now living in `CLAUDE.md` (see `glossary.md` for the section map):
- **2026-08-07** — §51 absolute invariant: a sub-account is NEVER an agency, enforced structurally
  (DB CHECK + trigger + `agency_current_id` guards, migration `20260807230000`). Forced by the
  Antonio Daniel LLC mis-route (#393).
- **2026-08-01** — §51 authored + hardened (per-tier availability + gating railing) after the fourth
  sub-account-seam bug (#86→#130→#172→#588).
- **2026-08-08** — §2 "Practice"-ban clarification (recommend *business*/*company* until certs land).
- **2026-07-28** — §32 capability-conditional post-deploy scan for auth-gated surfaces.
- **2026-07-26** — §37 response-consumer inventory addendum; §38 money-boundary authored.
- **2026-07-25** — §37 producer inventory authored (Hotfix-1 readiness-scan case).
- **2026-07-22** — §32 migration "proven-persisted-on-prod" addendum (1c-vi / 1c-viii-a collision).
- **2026-07-19** — §27 facelift, §28 approved-is-frozen, §29 bold-swing, §30 strip-then-rebuild,
  §31 real-assets, §32 green-build-≠-render, §33 design-agent-has-eyes, §34 own-your-intelligence
  all dated this day (a heavy doctrine day).
- **2026-07-18** — §1 hard-gate, §24 operational efficiency, §25 design taste, §26 compound-AI.
- **2026-07-17** — §4 merge-on-verified / ship-live, §5 post-deploy scan, §11 studio "video-game"
  bar, §19/§21/§22 studio unification, RED-LINE index.
- **2026-07-16** — §11 banner rule, §18 redundancy gate (mandatory four questions), §19/§20 studio.
- **2026-08-04** — §39 peer-gate authored (#214).

## Known-unbuilt / spec-only status (§13 honesty — "not built" is a valuable brain answer)

A recorded "not built" prevents the exact false-confidence the brain exists to kill. Verified 2026-08-09:

- **SMS/phone verification in SIGNUP — NOT built** (scoped claim). Signup uses **email verification
  only** (`PublicSignup.tsx`, `showSms={false}`); `input-otp` primitive exists but is unwired for
  signup. **BUT SMS phone-verify DOES exist elsewhere** — `send-sms-verification` + `verify-sms-code`
  edge fns + `sms_verifications` table, wired into `NotificationsSettings.tsx` for notification opt-in.
  So "do we have SMS verify?" = yes for notifications, no for signup. (config-registry → "Signup".)
- **Promo account type — spec LOCKED, NOT implemented.** `docs/product/promo-account-type-spec.md`
  exists; there is **no** `account_type='promo'` value or migration in the schema. Do not read the
  LOCKED spec as "built."
- **Twilio A2P carrier submit — NOT wired.** `createBrand()`/`createCampaign()` are honest
  `needs_config` stubs; the A2P **UI + draft + persistence ARE built** (`A2PTab.tsx`, `comms-a2p-*`).
  The gap is the live TrustHub/carrier submit (Wave 4c.2 prereq). (config-registry → Twilio ISV.)
- **Twilio number-purchase charge leg — NOT wired.** `comms-purchase-number` returns
  `charge_wired:false`; search/buy-into-subaccount works, the billing leg does not yet.
- **Client portal — PARTIALLY built.** Beyond the specs (Owner-Trilogy + Customer-Portal taxonomy),
  real surfaces exist: `PortalGateway.tsx`, `PortalStudio.tsx`, `PortalSection.tsx`, portal-config hooks
  (`useClientPortalConfig`/`useClientPortalBrand`/`usePortalConfig`), `ContactPortalPanel.tsx`. Not
  spec-only.
- **Enterprise Stripe plan — no active price** (see config-registry → Stripe): DB plan `enterprise`
  is `is_active` but has no live Stripe price (sales-led/manual invoicing until wired).

## Wave / build-order notes

- Canonical build order lives in `docs/doctrine/canonical-build-order.md`; Wave 5 sequencing in
  `docs/doctrine/wave5-phase1-phase2-sequencing.md`. Current active work (2026-08-09) is **Wave 4-4a**
  (Agent UI Placement → L8 Memory Fabric → chat compaction/durable tasking, PRs #405–#407).
- Money Spine (Lane B, §38): B-i discovery ✅ → B-iv storefront webhook ✅ (posture verify pending) →
  B-ii marketplace paid install (in flight) → B-Platform → B-Meter → … → B-Connect (deferred). See
  `docs/doctrine/money-spine-architecture.md`.

---

*Append newest at the top of the PR section when a PR merges; add a dated ruling row when CLAUDE.md
gains a dated section (§BRAIN.3).*

- **2026-08-20 · Platform alerting substrate — owner ruled FULL, and ruled it must not stay isolated.**
  Chose the full substrate (own condition language over arbitrary platform signals, multi-channel delivery,
  escalation) over three narrower options. **The §18 survey then changed the design materially:**
  `_shared/channel-adapters.ts` already declares itself the single home for multi-channel delivery, and an
  operator inbox, delivery preferences and action-bus escalation all already exist — so the build is **two
  tables plus an evaluator wired into existing seams**, not the parallel notification stack a from-scratch
  reading would have produced. Two sibling tables were examined and rejected as homes *with reasons*:
  `stage_automation_rules` is FK-bound to pipelines/stages (structurally cannot express a platform-signal
  condition) and `paige_sla_alert_log` is hardcoded to client SLA; both stay untouched (§58).
  Condition language is a **validated JSONB triple**, deliberately not a parser, so Paige can author a rule
  from chat without a schema change (§10). Scope is **operator-only** — `platform_alerting` is a documented
  §61 exception in `getTierFeatureSet()`, same shape as `fleet_console`; tenant-tier alerting is a separate
  decision and assuming it now would be the §56 pre-build failure. **Standing obligation:** six weaves filed
  as tracked slices (#205–#210) BEFORE A1 merged — History, Chat, peek drawer, §16 departments + autonomy
  tier, Trust Compass ceiling-clamp, and Paige's central-brain recall — because a good ruling that is not
  tracked is a good ruling that vanishes. Architecture: `docs/architecture/platform-alerting-substrate.md`.

- **2026-08-20 · Lovable bootstrap files — `IF NOT EXISTS` guards to unblock Supabase Preview (owner-ruled Path A).**
  Added `IF NOT EXISTS` to the two Lovable-origin bootstrap `CREATE TABLE public.profiles` statements
  (`20250908112334_remote_bootstrap.sql:27`, `20251009234919_*.sql:11`). Owner ruled Path A over Path B
  (squash-history), which is deferred as its own slice.
  **Gate answered before editing:** the Supabase migration tracker does NOT hash-verify already-applied
  migrations against file content — proved on prod, not assumed. `supabase_migrations.schema_migrations`
  has no hash/checksum column (`version, statements, name, created_by, idempotency_key, rollback`), and
  more decisively BOTH target rows already diverge from their files: `20250908112334` stores a single
  partial blob for a multi-statement file, and `20251009234919` stores literally
  `-- marked applied out-of-band; live schema verified by drift audit 2026-07-14` (created_by
  `ledger-reconciliation`). `db push` applied A1 cleanly the same day over those rows. If content were
  verified, they would already be breaking every push. Prod `schema_migrations` needs no reconciliation.
  **§13 correction:** the failure was earlier attributed to `20250908112334:27`. The live check-run text
  (`gen_random_uuid()`, `dob_last4`, no `address_line1`) identifies it as **`20251009234919:11`**. Both
  are guarded, so the fix covers it either way, but the earlier diagnosis named the wrong file.
  **Known limitation, filed as #211:** the two files define DIFFERENT `profiles` shapes, and prod's live
  table carries the 20251009 shape. Guarding both means a fresh replay keeps the 20250908 shape and
  diverges from prod, so Preview may fail later on a migration expecting the newer columns. This change
  removes the known blocker; it does not by itself prove Preview goes green.

- **2026-08-20 · A2 evaluator — a fire is a row before it is a message, and one signal was a lie.**
  The sweep (`alerting-evaluate`, `pg_cron` every 5 min) evaluates active rules and **writes firings only**;
  delivery is A3 through `_shared/channel-adapters.ts`. Every firing lands `delivery_status='pending'`,
  which is the literal truth until A3 exists — so "did it fire?" stays answerable even when delivery later
  fails. Three decisions worth keeping: (1) **an unreadable signal evaluates to `undefined`, never `false`**
  — a rule that depends on it is SKIPPED and `last_evaluated_at` is deliberately NOT advanced, so the
  surface keeps saying "never evaluated" rather than implying a clean pass; (2) firing is **edge-triggered
  per episode** via a new `condition_met_since` column — without it a rule re-fires every tick for as long
  as the condition holds, which is how an alerting system teaches its operator to ignore it; (3) if the
  firing INSERT fails, `last_fired_at` is **not** advanced — claiming a fire that did not record would put
  a fabricated event in the evidence table's own bookkeeping.
  **§13 correction:** A1 seeded `llm.failover_rate` as readable and the architecture note claimed L1
  observability already backed it. Verified FALSE against the live schema — `paige_llm_trace` records no
  failover marker (columns: `status`, `error_class`, `provider`, `model`, `tier`). A2 flips that signal to
  `is_readable=false` with the reason and registers `llm.error_rate`, which the schema genuinely supports,
  as its own key. Quietly serving an error rate under a failover name would have been the
  two-numbers-one-label defect the §39 peer gate caught on the Fleet Tenants rail one slice earlier.
  Headless proof: `src/__tests__/alerting-conditions.test.ts` (35 assertions, in the existing vitest run) —
  a wrong evaluation does not throw, it silently fires or silently stays quiet, so the pure decision logic
  is exercised directly. **§18 lesson worth keeping:** this first shipped as a standalone `.mts` script with
  its own npm script and CI step, and broke CI twice — the job pins **Node 20**, which has no type stripping
  and cannot load a `.ts`/`.mts` file at all. (My first fix blamed "Node 24 removed the flag"; the log said
  `Node.js v20.20.2` — only the ACTIONS run on 24.) The repo already had a TS-capable headless runner in CI,
  and three sibling tests already import edge-function `_shared` code the same way. The second path was
  invented, not needed.

- **2026-08-22 · A3 delivery + A4 surface — the alerting substrate is end-to-end, and two things it deliberately will not do.**
  **A3** (`alerting-deliver`, PR #564, `pg_cron` at `2-59/5` so a firing delivers on the same cycle the
  evaluator created it) drains pending firings into `paige_admin_notifications`. §18 correction worth
  keeping: the architecture doc named BOTH `_shared/channel-adapters.ts` and `paige_admin_notifications`,
  and inspecting the actual shapes settled it — channel-adapters is THREAD/CONTACT-shaped
  (`ThreadContext`, `MessageParty`), built for tenant↔client messaging, and an operator alert is
  tenant-less with no thread and no contact. `paige_admin_notifications` is the exact shape and already
  had a live writer precedent (`enforce_subagent_doctrine_116`). channel-adapters becomes relevant only
  for EXTERNAL delivery, a later leg. `delivery_status` moves to `delivered` ONLY after the row really
  inserts; an `autonomy_lane='off'` rule is marked `skipped` with `delivered_at` left NULL, because 🔴
  means human-briefed-only (§16) and auto-delivering it would quietly overrule the lane the operator set.
  **A4** wires the Fleet sub-tab: `useAlerting.ts` (rules + signal catalogue + 6 counts) and
  `describeCondition.ts` (16 tests) — the ONE home for rendering a stored condition, which A5's authoring
  form reads from rather than forking. Every FIRING figure is an exact head-count, never `rows.length`
  over an uncapped select (§199); rule-derived counts come from the fetched list, so the hook fetches
  `RULE_LIMIT+1` and renders "—" instead of a wrong number when that list is incomplete.
  **Two deliberate non-features.** "+ New rule" renders DISABLED and says why — a control that looks live
  and silently discards work is worse than one visibly not ready (§13/§36). External delivery is not built
  for ANY tier including God, because there is no operator address book: "who receives the 3am alert email"
  is an owner-owed decision and must not be quietly hardcoded to the owner's address (§45/§63).
  **A pre-condition that is now a habit, not a lesson:** the `service_role`/`authenticated` grant check ran
  BEFORE any code was written. A rollback proof runs as table OWNER, so a missing grant is invisible to it
  — that blind spot cost us twice (hotfix #94 `paige_systems_check_*`, #563 `tenant_revenue_classification`).
  **The tsc ratchet then caught what neither the proof nor the peer read would have:** A1's three tables were
  never added to the committed `src/integrations/supabase/types.ts`, so every column read was `ResultOne`.
  Layered defences, none sufficient alone (§39).
  §32.a proven on BOTH legs: `schema_migrations` carries `20260927000000`, `cron.job` 9 → 10, and
  `net._http_response` id 135756 @ 17:52:00Z returned a real **200** with
  `{"drained":0,"delivered":0,"failed":0,"skipped":0,"note":"no pending firings"}` — an actual HTTP
  response, not a queued `net.http_post` (the A2 lesson). **No independent §39 peer read on either slice:**
  Codex cannot commit to this repo and the owner authorised proceeding, so both were a single adversarial
  pass by their author. Stated, not hidden.

- **2026-08-22 · A5a authoring seam — one write path, and three things it refuses on purpose.**
  `alerting-rule-write` is the ONLY thing allowed to decide whether an alert rule may be stored.
  It calls the SAME `validateCondition` the evaluator runs (`_shared/alert-conditions.ts`), so a
  rule can never be accepted in a shape the evaluator will later reject — and because that module
  is Deno and cannot be imported by the browser, the authority is necessarily server-side rather
  than duplicated into the form. **§18 seam decided BEFORE code:** A5 and A-Weave-2 (#206) both
  nominally "let Paige author a rule"; grep showed `paige-mcp` has zero alerting tools, so the
  answer is ONE seam with TWO callers — the form now, paige-mcp later — never two write paths.
  **Three refusals, each a §13/§36 call rather than a missing feature:** (1) a condition bound to
  an unreadable signal is rejected, because the evaluator SKIPS such rules and does not advance
  `last_evaluated_at`, so the rule would sit in the list reporting "never evaluated" forever while
  the operator believed something was watching; (2) any channel other than `in_app` is rejected —
  verified that neither the evaluator nor the delivery leg reads `channels` at all, so accepting
  `email` would turn a declaration into a promise, and external delivery is separately blocked on
  the owner-owed address-book decision (§45/§63); (3) deleting a rule with recorded firings is
  refused with a pause offered by name, because a firing is the record that something happened and
  tidying a list is not worth destroying it (§58). Also: an edited condition clears
  `condition_met_since`, or a rule could fire on sustained-for evidence gathered against a
  condition it no longer has.
  **A helper extended rather than changed:** the write needs the caller's uid for `created_by`,
  which the boolean `isOperatorJwt` cannot supply. Added `operatorUserId` alongside it and made
  `isOperatorJwt` a thin wrapper over it — one implementation of the §53 check, no existing
  caller's signature touched (§18/§37).
  **A false green I caught in my own proof (§39, worth keeping).** The first §32.b run asserted
  "a non-operator sees 0 rules" — which passed, but prod has 0 rules anyway, so it was true for the
  wrong reason and proved nothing. Re-ran it with a real row seeded first: owner sees 1,
  non-operator `authenticated` sees 0, `anon` is refused outright. A proof that cannot fail is not
  a proof. Totals: 36 headless assertions on the pure validator + 10 write-path checks + 3
  re-run isolation checks, all against real prod inside a rollback.
  **Owed:** the "+ New rule" button is still disabled — A5b wires the form to this seam. No
  independent §39 peer read (Codex cannot commit here; owner authorised proceeding).

### 2026-08-20 — Operator act-as is real and audited; the capability already existed, the audit did not (Slice 2, task #212)

**What shipped.** `operator_enter_tenant(_tenant uuid)` / `operator_exit_tenant()` — SECURITY DEFINER,
`auth.uid()`-keyed, gated on `is_platform_operator()` (§53), writing a `paige_audit_log` row in the SAME
transaction as the scope change so "entered" and "recorded" cannot disagree. The Fleet Tenants directory's
`Enter` button and the table's `Enter →` now perform that act-as; the directory ROW selects, matching CD's
own descriptor ("Click one to open it. Entering is a separate, logged act.") which the surface had been
rendering while both affordances did the same thing.

**The finding that changed the build (§18).** The §18 survey was expected to confirm operator act-as was
unbuilt. It found the opposite: act-as **already ships** through the header `TenantSwitcher` in
`AdminLayout`, gated `isPlatformStaff`, writing `profiles.active_tenant_id` directly via
`useTenantContext.switchTenant` — **with no audit row of any kind**. So the gap was never the capability;
it was that an operator could enter any tenant on the platform and nothing recorded it, while the Fleet
surface told them every session was recorded in Governance.

Building the planned Fleet-only RPC path would therefore have created **two doors into a tenant with only
one of them logged** — strictly worse than the original gap, because the audit trail would then look
complete. `switchTenant` instead routes platform staff through the RPCs, so every operator act-as is
audited whichever control drives it. Non-staff (the agency `enterSubaccount` path) keeps the direct write.

**Why no membership is granted.** `agency_enter_subaccount` INSERTs a `tenant_members` row; correct for a
parent agency that genuinely holds a seat, a §9 defect for the operator — they would silently join every
tenant they opened, polluting rosters, inflating seat counts, and corrupting the operator's own fleet
metrics (`fleet.tenants_at_risk` grades partly on zero active seats, so merely visiting a seatless tenant
would "fix" its risk grade). Verified enabling fact: `current_user_tenant_id()` already honours
`active_tenant_id` when `is_platform_admin(auth.uid())`, no membership required.

**Naming trap worth remembering:** `is_platform_admin(_actor)` sounds like the delegated tier only, but its
body matches `role IN ('platform_admin','super_admin')` — it is effectively `is_platform_operator()`. Read
the body, not the name.

**Exit restores tenant-less** (`active_tenant_id = NULL`), verified as the operator's real resting state on
prod, deliberately unlike the agency exit which resolves to a primary agency. Known consequence recorded up
front: §52's operator briefing is gated on a tenant-less persona, so it NO-OPs while acting as a tenant and
returns on exit.

**§32.b proof (prod, rolled back, 9/9):** grants (`anon_enter=f`, `authenticated=t`) · enter sets scope AND
`current_user_tenant_id()` resolves to it · `members_before=0 members_after=0 delta=0` · enter audited ·
exit restores NULL + audited · unknown tenant raises `tenant_not_found`/P0002 · a tenant-tier caller raises
`operator_scope_forbidden`/42501 on BOTH functions. Cleanup confirmed: 0 functions, 0 audit rows, 0 scoped
operators left behind. §32.a persisted-apply owed post-merge.


---

## Super Admin v3 install — rulings (owner + Claude Design, 2026-08-23)

**R1 DISSOLVED, not answered.** "Which console survives, `/operator` or `/admin`?" was malformed.
**`admin` is never a URL.** There is ONE operator console; godMode/admin is a **role and scope band
inside it**. Consequence: the divergent landing constants (`resolveLandingRoute.ts` →
`/operator/fleet/tenants` vs `JoinPlatform.tsx` → `/admin/platform/tenants`) are a **bug with two
answers**, not a fork — reconciled in Round 0 by importing the one `GOD_CONSOLE` from
`operatorTarget.ts`. Do not re-open R1 as an unanswered question.

**Design is source of truth at the FUNCTION level.** The 2026-08-18 ruling ("if Claude Design made
it, that's how it's supposed to be") previously read as whole surfaces; it now reads one level down,
to individual functions. Trust Compass is the worked example — same function, but where it lands and
how it reads belong to the design, and the implementation is re-imagined behind that surface.
**A round never begins by asking whether the design can accommodate an existing shape; it begins by
asking what wiring the designed shape requires.**

**Round-boundary rule.** When a round needs a surface a later round draws, do the **model
correction** and wait for the surface. Never build a fragment of the later round's geometry to hang
something on. (Applied twice: the scope band, then the act-as exit control.)

**Act-as is a scope change, not a navigation.** `switchTenant` already IS the mutation — audited RPC
→ `activeTenantId` on the one shared provider → `invalidateQueries`. The `window.location.assign`
on top was redundant and was the one-way door. Its defending comment described **per-instance**
`useTenantContext`, an architecture replaced 2026-07-28; the reload outlived its reason by four weeks
because the comment kept asserting it.

**Slotless capabilities reach the command palette, not a 7th slot.** Sub-tab count is NOT slot
pressure. Every homeless sub-tab is a view, a summoned surface, or a mechanism that was never a place.
Anything without a rail slot is found by **search, not browsing** — several capabilities legitimately
END as permanent palette entries. Unbuilt slots use the pack's **absence treatment**
(`hasAbsence`/`absenceTitle`/`absenceBody`), never an invented empty state.

**Verification posture.** Auth-gated surfaces are checked by `scripts/live-drive/harness/`
(geometry, mocked provider, real IA). **§32.c is NOT discharged by it** — the harness proves
geometry, never that the authenticated console renders. See `cd-pack-port-playbook.md` §5–6.

## 2026-08-30 — Connections/A2P: the Page/Rail/PAIGE/Brain contract, and what it does NOT authorize

**Owner-stated standing architectural contract** (full text:
`docs/doctrine/connections-rail-contract.md`). Recorded here so a later session does not
re-derive it or, worse, build a private copy of a primitive it names as missing.

**The one rule under all four layers:** use the existing Paige foundation. No parallel rail,
action queue, autonomy store, memory store, provider adapter, or PAIGE workspace. A shared
contract that does not exist is a **scoped follow-up**, never a fake implementation.

- **Page** = Settings → Connections, the single human-management surface for provider setup and
  readiness. Conversations consumes only the named canonical readiness result and does not
  reproduce setup logic. Calendar may read notification config but does not own Communications.
  Billing stays its own area; Connections may disclose a phone-related billing prerequisite.
- **Rail** = durable, tenant-scoped, presentation-safe evidence/provenance/decisions/outcomes.
  Six safe Connections event kinds are enumerated in the doc. **Never** raw phone content,
  customer messages, prompts, credentials, provider payloads, secret references, hidden
  reasoning, or full configuration.
- **PAIGE** = one governed interface reading safe server-resolved references. Every write goes
  through the existing Action Bus: tenant/account/capability/source/scope checked, durable,
  attributable, idempotent, recoverable, **fail closed**.
- **Brain** = derives only from proven, scoped records. Not a provider-data or prompt store.

**The prohibition that binds today.** The Trust Compass is **not** yet a proven tenant-and-
capability enforcement clamp — do not claim it authorizes A2P, phone, billing or provider
actions. Until that clamp and the authorized execution contracts exist, Paige must not silently
call Twilio, search/purchase/assign a number, submit an A2P registration, alter credentials,
activate billing, or send a message. Copy promising any of those is a §13 violation even when it
reads as help.

**Four missing shared contracts, named so nobody substitutes for one:** C-1 Rail event kinds for
Connections · C-2 the Trust Compass clamp · C-3 authorized execution contracts for provider
actions · C-4 the safe PAIGE readiness-read seam (blocked behind in-flight PRs on the same file;
forcing a conflicting edit was explicitly refused). Until C-4 lands, Connections copy must not
promise Paige can act on readiness, because she cannot yet see it.

**IA correction on the same day:** Integrations is a **separate top-level Settings item beneath
Connections**, owned by a different lane — not a tab inside Connections. #640 removed the
`PROVIDERS` catalogue rather than relocating it, and a rendered test now asserts Connections
carries no Integrations affordance. The visibility gap until that lane lands is called out on
#640 under §58.

## 2026-08-30 (later) — The platform capability pipeline, and six independent voice grants

Owner-stated taxonomy, folded into `docs/doctrine/connections-rail-contract.md` §0a/§0b rather than
into a second doc. It is a governing taxonomy and grants nothing — naming a stage does not create the
authorization that stage requires.

**Every Paige capability follows:** `Human → Read → Brain → Trust Compass → Write → Rail → Page`.
Human sets goals/policies/approvals and keeps accountability · Read receives only tenant-safe, proven,
scoped evidence · Brain derives understanding only from proven records · **Trust Compass decides, per
tenant AND per capability, whether Paige may observe, prepare, request confirmation, or act, and must
be server-enforced before autonomous action is claimed** · Write is tenant/account/capability/source/
scope authorized, durable, attributable, idempotent, recoverable, fail-closed · Rail is durable safe
evidence/provenance/authority/decisions/outcomes/recovery · Page is where humans understand, govern
and intervene.

**Voice is SIX independent capabilities, not one switch:** answer inbound · make outbound · sales
qualification or booking · record/transcribe · write outcomes into client/lead/calendar/follow-up
records · escalate to a human. A tenant may allow one without another. Recording is separate on
purpose: it creates durable content about a third party who granted Paige nothing, so it is never a
side effect of answering a phone.

**§13 finding recorded in the same pass — the rail's never-list is not currently held.** A read of
every writer of `paige_client_events` (the one rail; one write seam, `record_rail_event`) found FOUR
emitters putting raw message text into `summary`, which is persisted and broadcast to staff:
`handle-inbound-sms` (inbound SMS body), `send-message` (outbound body/subject), `paige-ai-chat` (the
client's chat turn — the model's prompt input), and `customer_respond_to_action` (client free-text,
untruncated). **All four pre-exist on `main`; none is introduced or changed by #640.** Filed as
follow-up C-5; each needs its own §37 consumer inventory because `summary` is rendered to clients.

**Two suspicions REFUTED, recorded so nobody re-derives them:** recordings/transcripts do NOT reach
the rail — `twilio-status-callback` is not a rail writer, and `recording_url`/`transcript` go to
dedicated columns on `messages`/`operator_messages` (the conversation store, different RLS, no
broadcast); and no credential, secret, provider payload or model reasoning reaches the rail. The
"never into PAIGE/Brain context" half IS held: both model-hydration paths project only `event_kind`,
`title` and `occurred_at`. `paige_llm_trace` is the store that deliberately holds prompts/outputs and
is not a rail.

New follow-ups: **C-5** rail summary hygiene · **C-6** per-capability Trust Compass enforcement for
the six voice grants (blocked on C-2, the clamp itself).

---

## 2026-08-30 — PR #665: the prepared A2P registration draft became durable

**The defect.** `comms-a2p-draft` generated a registration draft and returned it in the HTTP
response, performing two reads and **no write** across 309 lines. "Prepare a registration" is the
one write the Communications surface exists to support, and nothing persisted it. Authorization was
already sound; durability was the whole gap.

**No new storage.** `tenant_a2p_registrations` already owned every campaign field a draft holds and
already carried `UNIQUE (tenant_id)`; legal identity is READ from `tenant_legal_profile` and never
copied; provenance goes to `paige_audit_log` carrying **shape only** (a sample count and two
booleans — never draft text, a sample message, a provider payload, a prompt or a credential). No new
table, column, or parallel registration / approval / autonomy / Rail / outcome store.

**The Rail is deliberately unused.** `record_rail_event` is contact-keyed and hard-requires a
`p_contact_id` resolving to a client in the caller's tenant. An A2P registration is tenant-level with
no contact, so filing it there would mean inventing a synthetic contact or a new kind on a client
feed. Recorded so nobody re-derives it.

**Prepared is not submitted, and `submitted_at` is the discriminator.** No shipped path sets it —
`comms-a2p-submit` persists reviewed copy and returns an explicit *prepared, not submitted* refusal;
its carrier stub calls were removed, so `_shared/twilio.ts`'s `createBrand`/`createCampaign` now have
**zero callers** (left in place: removing them touches a shared file and would widen the redeploy to
every function importing it).

### Four lessons this PR paid for, worth more than the feature

1. **A green proof can be measuring something other than what it names.** The negative cases all
   passed an empty sample array, so validation refused them *before* the guard under test ran. Later,
   case 7 ran as `anon` — which holds no EXECUTE grant — so the refusal came from the grant and never
   entered the function (§59 inverted). Both looked like passing authorization tests. Neither was.
2. **A structural pin on function TEXT is defeatable.** An independent review kept the literal the
   pin matched, added a redirect one line later, and scored 13/13 while running a full cross-tenant
   IDOR. Boundaries are now **measured** — every trace a foreign caller could leave, plus the
   **return value**, because a read-only escape writes nothing and is otherwise invisible.
3. **Fixing the backend while leaving the surface lying is a regression, not a partial fix.** The
   durable save wrote exactly the shape A2PTab's banner keyed on, turning "Submitted for review —
   you'll be notified the moment it's approved" from unreachable into the normal result of clicking
   Draft with Paige. Making a system honest includes whatever renders it.
4. **A migration version collision is invisible to every gate.** #666 landed a migration sharing this
   one's `20261004000000` prefix. `schema_migrations` is keyed on the version, so `db push` would have
   **skipped** this migration on prod while CI, the `db-live` tag and every badge stayed green — and
   the edge functions, which do deploy, would have called a function that was never created. The clean
   replay cannot catch it either: it iterates FILES and dedupes only the recorded row. **Check the
   version namespace on every re-ground.** Renamed to `20261004010000`.

**Also recorded:** Supabase preview pushes only NEW migration files, so a migration edited in place
leaves the preview branch holding the pre-fix version while its badge stays green. Measured directly,
not inferred. The from-nothing local replay is the authoritative migration proof.

---

## MET1 — Paige's spend becomes billable usage (2026-09-01, branch `codex/paige-knowledge-active-tenant-isolation-v2`)

**Measured on production before writing anything.** `paige_llm_trace` held 663 rows, 13 tenants,
newest that day. `platform_usage_events` held 91 rows carrying only `tenant_provisioned` and
`tts_char`. **Zero LLM usage records had ever been written.** 15,578,931 tokens had been spent on
tenants' behalf and nothing downstream could see any of it — observable spend, no meter, which is
the exact state §67 names as the cost half of autonomy: at `confirm` the human is the throttle, at
`auto` there is none.

**`meter_llm_usage(p_limit)`** — a service-role-only SECURITY DEFINER drain, not a trigger. A
trigger would run inside the trace insert, so a metering failure would fail the TRACE: breaking
observability to protect billing, which is backwards. A drain is non-blocking, picks up the backlog
without a separate backfill, and is idempotent through a partial unique index on
`(metadata->>'trace_id') WHERE event_type='llm_tokens'` — an index the table had never had, and
without which a re-run double-counts.

**`platform_usage_events`, not `platform_metered_events`.** The wrong table said so itself: its
CHECK admits `layer IN ('L1_platform','L3_tenant_passthrough')`, and Paige's own inference is
neither a platform subscription nor a third-party pass-through. `platform_usage_events` already
carried `tts_char` in the same shape.

### The finding underneath the finding

A proof case asserted every metered row carries a cost, and **failed**. It was right to. Of 228
meterable traces, **197 (86%) carried no cost at all — 15,475,175 of 15,578,931 tokens, 99.3%.**
The 31 priced rows had all come through `_shared/model-router`, which prices every call; the 197
unpriced had all come through the DIRECT `_shared/claude.ts` path, which has the provider's own
`usage` object in hand at its trace site and never priced it. The `$1.38` the platform believed it
had spent was the cost of 0.7% of its tokens.

Fixed at the **writer** rather than at the call sites: `traceLLMCall` now fills the estimate when
the caller supplied none, so every path — including the seventh nobody has found yet — is priced by
construction. Token pricing moved into `_shared/token-pricing.ts`, a dependency-free module, because
`claude.ts` is imported BY the router and cannot import back without a cycle. That cycle is why the
platform had grown **three** copies of the price table; `eval/scorers.ts` carried one whose own
comment apologised for it.

**Priced per MODEL for anthropic, not per provider.** The single "anthropic" rate was the reasoning
tier applied to every Claude call, so 8,535,448 haiku tokens were being valued at roughly 3× list.
An estimate at the wrong model's list price is not coarse, it is wrong — and wrong in the direction
that overstates what a tenant owes. Every pre-existing pairing keeps its exact rate, so the §33
visual-critique cost cap (frontier on `claude-sonnet-5`) computes byte-identically.

**The historical 197 are NOT back-priced.** Deriving a cost for a call whose model pricing at the
time was never recorded would be inventing a figure and stamping it as measured. They meter their
TOKENS — the measured quantity — and carry an explicit null cost.

**Recording usage is not charging for it.** Nothing reads a price book, touches an invoice, or sets
`reconciled_invoice_id`. The cost travels in metadata as a labelled estimate.

### Three lessons this slice paid for

1. **A failing assertion is evidence before it is a defect.** P6 failed, and the reflex was to
   loosen it. Diagnosing it instead surfaced that 99.3% of the platform's token spend had never been
   priced. The proof was more correct than the code.
2. **`->>'key' IS NULL` cannot tell an absent key from an explicit JSON null.** P6b was written to
   catch exactly the `jsonb_strip_nulls` defect and **passed under it** — vacuous against its own
   target. It now compares against `'null'::jsonb`. The distinction is the whole point of the fix:
   a consumer must read "no cost recorded", never infer it from a missing field, and never meet a
   downstream `COALESCE(cost, 0)` that books unpriced spend as free.
3. **A test fixture that omits a method makes a dead code path look healthy.** `traceLLMCall` ends
   `.insert(record).abortSignal(sig)`; the fake had no `abortSignal`, so the chain threw into the
   writer's own swallowing catch — while the row, recorded one link earlier at `.insert()`, still
   satisfied every assertion. Added to the fake, plus a check that the chain reached the end.

**Evidence.** Production rollback proof `scripts/sql/meter-llm-usage-proof.sql`, 12/12 including two
controls measuring the defect first; mutation-tested — the strip mutation drives P6 red (and drove
the P6b correction). `test:token-pricing` 20/20 and `test:trace-wiring` 12/12, both wired into CI,
both mutation-tested at 8 and 6 mutations with every one caught. **Not merged, not deployed, and
the authenticated live drive remains UNVERIFIED** — no browser capability in this session (§32.c).

---

## 2026-08-31 — Solo Settings Team Gate 1 approved; production branch in flight, not live

> **Still accurate for its date; superseded as STATUS.** The work shipped via PR #728 (`76bb3bbca`)
> and is live on production with the capability labelled `PARTIAL`. See the 2026-09-02 entries below
> and `docs/doctrine/surface-cards/team.md`. The entry is kept intact rather than rewritten (§58).

The owner approved the roster-first Team design and authorized production implementation. Growth uses
the Settings page scroll owner plus server search/filter and 25-person Load more pages—never a nested
people scrollbar. Job title/responsibilities are descriptive only; Owner/Admin/Member remain the
enforced permissions. Paige context is derived from the authenticated active tenant, treats authored
work details as untrusted reference data, and stays proposal-only until the owner confirms in Team.
Local structural, test, security-lint, type-ratchet and build evidence is green; authenticated runtime,
migration/function deployment and email delivery remain UNVERIFIED. Gate 2 is still required before
merge or deployment.

- **Client identity contract (green draft, Gate 2 pending, 2026-09-01)** — Preserve existing client UUIDs and references; fail closed if any historical client lacks a tenant; backfill only missing references with nonsequential `CLT-…` values; make UUID, tenant, and reference immutable; route browser creation through `create_contact()`; keep invite acceptance as the only consent linkage path; expose `client_ref`, not raw UUIDs, to Paige. No merge or deployment authorized.

## 2026-09-01 — Setup owns tenant A2P legal identity; implementation draft, Gate 2 pending

Each tenant enters and owner-confirms its legal sender identity once in Setup. The canonical legal
record synchronizes to `tenant_legal_profile`; the full registration number is write-only and stored
in Vault, while the browser can reload only its last four digits. The authorized representative must
be an active, already-confirmed Team representative. PAIGE may help explain or propose ordinary
business facts, but cannot invent a tax number or select the legal representative. Tenant provider
resources belong to that tenant's Twilio subaccount; the platform operator's primary TrustHub profile
remains a separate master-account concern. Customer Profile, Trust Product, Brand, Campaign, and
Messaging Service identifiers stay server-owned. This draft does not submit to Twilio, merge, deploy, or claim authenticated production proof.

## 2026-09-01 — Solo Team scope corrected; cross-domain access profile rejected

The owner explicitly rejected the proposed cross-domain Hidden/View/Manage workstream. The Solo Team assignment remains roster, invitations and lifecycle, existing Owner/Admin/Member roles, informational job title/responsibilities, and truthful PAIGE Team context. The unreleased broad draft was reverted locally and was never pushed, merged, migrated, or deployed.

PAIGE receives the server-resolved active-tenant roster plus Team invitation lifecycle under the existing Team owner/admin visibility boundary. She may identify, draft, recommend, and prepare; she may not silently invite, mutate roles, grant elevated access, or bypass Team authorization. Invitation tokens never enter the context.

The narrow draft requires a new exact-head Gate 2 packet before merge or deployment. Authenticated browser interaction and migration application remain UNVERIFIED until directly exercised.
---

## M3 — a new conversation remembers the last one (2026-09-01)

**Measured on production first.** Within a thread, continuity already worked: 35 threads, 14 long
enough to fold, 6 compacted, the longest 105 messages, and the rolling summary preserves decisions,
queued actions, open approvals and open loops by design. **Across threads it did not exist.** One
tenant holds 18 threads and 277 turns, 8 of them carrying folded summaries, and every new
conversation opened blank. The charter's wording is "a future session must recover authorized
context, current plan, next promised action" — and a person starting a new chat is a future session.

**It EXTENDS `paige_operating_memory` rather than adding a read (§18).** That function already
derives scope the only safe way, already narrows on the focused client, is already called once per
turn on the caller's own client, and its result already renders into both prompt paths. A second
function would duplicate four things and be the one that drifts. The three memory layers the charter
names stay distinct in MEANING without becoming three separate reads.

**The cross-client rule is the load-bearing part.** A thread summary is prose about a conversation,
so carrying the wrong one is a disclosure, not a nuisance. The predicate is the SAME one every other
section uses — client in focus narrows to that client, no client in focus means the operator's own
general workspace — so there is one rule to reason about rather than a special case that can drift
from its neighbours. Isolation beyond that stays RLS's (SECURITY INVOKER retained).

### Two things worth keeping from how it was proven

1. **The proof could not run on production, and the reason is the finding.** `paige_operating_memory`
   and `paige_automations` do not exist on prod — both are created by this branch's unmerged
   migrations. Two attempts failed on exactly that before it was obvious. The proof runs against the
   PREVIEW branch database, which is the only Postgres where the "before" state exists, with the
   identity chain (auth user → tenant → tenant_members) seeded because the preview is data-free.
   **Stated rather than smoothed over: this is a preview proof, not a prod proof.** Prod gets the
   same state after merge, and the §32.a persisted-apply confirmation is where that is checked.
2. **Production has ZERO client-scoped summarised threads**, so the cross-client rule could not be
   exercised on real rows at all and had to be seeded. A rule that cannot be tested against existing
   data is exactly the one that rots quietly; it now has a seeded case and a negative control
   (client Y's own thread MUST appear) so it cannot pass by filtering everything.

**Evidence.** 14/14 on the preview including the seeded cross-client and cross-tenant cases;
authz harness 183/183 with three new checks, each mutation-tested — reverting the render, dropping
the recollection label, dropping the record-wins tiebreak and un-threading the exclusion each drive
exactly the check built for it red. Deno diagnostics on the handler unchanged at 14.

**Not merged, not deployed.** The authenticated live drive remains UNVERIFIED.

## 2026-09-02 — Two branches built the same approval gate. One survives (merge of `origin/main` into `codex/paige-knowledge-active-tenant-isolation-v2`)

**The clash.** The Campaigns/Pipelines branch and the Chat branch independently built "a mutating
call runs only if the operator approved THAT call." Merging them naively would have left both
running, and the weaker one would have been a way round the stronger one.

- **Chat branch (kept):** the server hashes the exact tool call into a **fingerprint**, streams it
  on the confirm card, and requires the browser to echo it back in the request BODY. The gate runs
  the call whose fingerprint arrived, or none. A model cannot produce the body.
- **Pipelines branch (retired):** for one action out of forty-eight, a `confirmedActions` array
  carrying a token, plus a comparison of the operator's last message against the exact string
  `"Approved — run it."`

The prose comparison is the specific thing the fingerprint exists to remove: anything that can
write a message can write that sentence, so a model could approve its own call by quoting the
operator. Retired with it: `supabase/functions/_shared/pipelineArchiveApproval.ts` and
`hasExactPipelineArchiveApproval`, whose only remaining caller was its own test.

**What the Pipelines branch got right, and is kept.** A pipeline archive is bound to a
**server-issued preview of itself** — `pipeline_archive_preview` mints a row in
`pipeline_archive_confirmations` that is single-use, expiring, and scoped to this tenant and this
requester, and the archive refuses unless that row exists AND predates the turn. Minting a preview
and acting on it in one breath is the turn approving itself. The fingerprint does not do this, so
it survives as a **precondition** that runs before the gate — not as a second approval.

**Where the duplicate-name property went.** The retired helper compared a client-supplied token and
a `PPL-` reference, so an approval for one pipeline could not archive its same-named duplicate.
That is now structural instead of compared: the archive reads its target from
`archiveBinding.pipeline_id`, so a name was never the thing being trusted.

**`pipeline_archive_preview` arrived unclassified**, and `lint:action-risk` refused it — correctly:
it persists a row, so the verb backstop read it as a write. Exempted in
`_shared/action-risk.ts` `NON_MUTATING_EXEMPT` with the reason recorded: gating it would demand an
approval to be shown the consequences of a decision not yet made, which is a second approval in
front of one act. Catalogue now: 31 ordinary · 24 high · 2 owner-only · 4 exempt · 0 unclassified.

**The standing order this sets (owner, 2026-09-01/02).** Other agents are building platform
departments that each point at Paige. Where their work and the Chat build disagree about how Paige
is governed, **the Chat build rules and the clashing code is rewritten onto it** — not carried
alongside it. Two correct implementations of one gate are worse than one, because the weaker is a
bypass of the stronger. Call the clash out, rewrite, and record it here.

**Evidence.** tsc 0 · vitest 1673/1673 · 22 CI guards green · vite build clean. Merge commit
`ed3de6f1a`. Not deployed; the authenticated live drive remains UNVERIFIED.

---

## 2026-09-02 — Paige can act on the team, not only describe it (Solo Team seam in Chat)

**What changed.** Five tools — `team_set_work_profile`, `team_set_permission`, `team_invite_member`,
`team_invite_resend`, `team_invite_revoke` — give PAIGE the Team capability inside the canonical Chat
workspace. Owner approved the Team-only Chat interaction direction. Nothing new was built on the
server: they call the same seam the Team screen calls, so the database's authority checks apply to a
sentence exactly as they apply to a form.

**The read had been a description of a locked door.** `get_paige_team_context` has been injecting the
roster, permissions, work details and every invitation for a while, and the Team surface said out
loud that she "cannot send or change access." That sentence was the feature request, and it is now
rewritten rather than left standing (§58 — flagged, not silent).

**The defect a pre-build seam audit caught, before it shipped.** The Team seam resolves its workspace
with `current_user_tenant_id()`; the conversation resolves its own with `get_paige_persona_context`,
which prefers a linked `clients` row. For a speaker who is a member of one workspace and a client
record in another those are DIFFERENT tenants. The read already failed closed on it —
`buildTenantTeamContextBlock` returns null and Paige is shown no roster. The write would not have,
and member ids for the other tenant are still obtainable from `crm_list_team`, which resolves the
same way the seam does. The result would have been an action landing in a workspace whose roster the
conversation was deliberately not shown: **the read failing closed and the write failing open over
the same disagreement.** `teamSeamTenantMismatch` now asks the read's question before all five acts.
The lesson is the one worth keeping: when a read is given a safety check, ask what the matching write
does with the same answer.

**Classification.** Permission change and all three invitation acts are `high` — they move authority
and, for invitations, put an email in a real stranger's inbox, which is the one effect no undo inside
the product reaches. Work details are `ordinary`, because describing a job cannot grant one, and that
is structural: the RPC writes two text columns and cannot reach `permission`. Catalogue now: 32
ordinary · 28 high · 2 owner-only · 5 exempt · 0 unclassified.

**The tool-registry ratchet fired on this work, correctly, and the baseline grew by five.** The Spine
registry the ruling points at does not exist yet, and the ruling's own words put the final bounded
adapter with the Chat workstream — which is what this is. The reason is written into
`scripts/ci/chat-tool-baseline.txt` rather than a commit message, because "the guard fired and I
raised the number" is how a ratchet stops being one. It shrinks by five when the registry lands.

**Honest gap.** `crm_list_team` (`list_team_members`) and the Solo Team functions read the same
`tenant_members` table but disagree in four ways: authorization (global `user_roles` vs tenant
membership), owner labelling, suspended members, and truncation. Two homes for "who is on the team"
is a §18 seam worth closing; it is not closed here and is not made worse here.

**Evidence.** tsc 0 · deno check 14 errors at head and 14 at base (no new) · eslint clean on changed
`src/**` · 6 team test files, 28 tests, 5 assertions mutation-proved · 6 CI guards green · vite build
clean. **Not deployed. The authenticated live drive is UNVERIFIED** — this session holds no browser
that can reach the surface, so §32.c is owed to the next capable session or to the owner.

**The peer-gate found two blockers the author's own tests structurally could not (§39).** Both are
recorded because the shape of the miss matters more than the fix.

1. **The approval card could name a person from another workspace.** The tenant guard was written
   beside the three WRITE branches. The card is built a turn earlier, on the refusal path, and read
   the same roster with no check — so for the mismatched speaker it could render a name and email
   from workspace B inside a conversation scoped to workspace A, and persist that string into
   `paige_pending_confirmations` under A's tenant id. The read had been failed closed for exactly
   that speaker; the card re-opened it one turn before the guard ran. The check now lives inside the
   roster reader, so both paths close from one place. **The test that missed it counted the string
   `await teamSeamTenantMismatch()` and asserted it equalled three — which is exactly the number of
   write branches. A source count cannot notice a fourth reader that has no check at all.**
2. **The card said "Member" while the code granted "Admin".** `describeConfirm` branched on strict
   `permission === "admin"`; both SQL functions `lower()` the value. A model emitting `"Admin"` — the
   capitalisation used in the card text, the Team screen's labels and the tool descriptions
   themselves — produced "Change Riley to Member … they will LOSE the ability to invite people" and
   executed a promotion. The stored-arguments protocol was no defence and the reason is worth
   keeping: the executed call WAS the fingerprinted call. The card and the write agreed on the
   argument and disagreed on its MEANING. Fixed by settling one canonical value above everything
   that reads it, and refusing an unrecognised one rather than coercing it.

Four more, all real: the invitation seam's honest refusal was being discarded (`functions.invoke`
resolves a non-2xx to `{data:null,error}`, so `inv?.error` was always undefined and what surfaced was
the constant "Edge Function returned a non-2xx status code" — while `readInvokeBody`, written in this
same file for precisely that trap, sat in scope uncalled); a `high` card whose subject fell outside
the 100-row roster page was still approvable as "Change that teammate to Admin"; the work-details
card showed a character count for text that is re-injected into Paige's own context every turn; and
an omitted work-details field erased the stored value rather than keeping it.

**And a defect older than this slice, found while adding to it.** The entire risk gate lives inside
`if (autoMode === "confirm")`, and `set_tool_autonomy` accepts auto|confirm|off for any tool key with
no reference to its class. So a tenant admin could put `automation_set_grant` — classified
`owner_only` precisely because it changes how much Paige may do alone — on auto, and Paige could then
raise her own autonomy from a conversation. Every `high` tool had the same shape. The handler now
clamps `auto` to `confirm` for any `high` or `owner_only` action, above the branch, keyed on the
class so it covers all 30 rather than the five added with it. `off` deliberately survives: a brake is
the operator's to pull at any class. **Not fixed, and reported rather than done quietly:**
`set_tool_autonomy` still persists the now-inert `auto`, and the capabilities surface still offers
the choice. The setter is a shipped RPC with its own callers and the surface's wording belongs to
whoever owns it.

**§58 CAPABILITY CHANGE, FLAGGED FOR AN OWNER RULING — `auto` no longer runs a `high` or
`owner_only` action.** The clamp above is not only a bug fix; it removes something a workspace
could previously do. A tenant admin could set any tool to `auto` and Paige would run it unattended,
including the twenty-eight `high` actions and the two `owner_only` ones. After the clamp, `auto` on
those thirty means `confirm` — the operator is still asked. `off` is untouched, and `ordinary`
tools on auto still run on auto.

**The shipped test that had to change, and why that is the whole argument.** `check.mjs` 15.6/15.7
drove `automation_set_grant` at `auto` and asserted it EXECUTED, reporting its resolved posture.
They passed on main. So the platform's own suite was pinning the behaviour in which Paige raises her
own autonomy from a conversation, because the fixture set the mode to auto for convenience and the
gate is inside `if (autoMode === "confirm")`. They are rewritten to assert the refusal. **Coverage
honestly lost:** the §13 property they protected — that a grant the ceiling holds down is reported
as what will actually happen — is no longer reachable through chat for that tool, because the tool
is no longer reachable through chat at all. Its resolved-posture reporting is now dead code on that
path.

The owner may reasonably rule the other way for `high` specifically: an operator's standing "don't
ask me" is a human decision, not the model's word, so `auto` on `crm_delete_contact` is arguable in
a way that `auto` on `automation_set_grant` is not. Both halves are in one place and either can be
narrowed. The `owner_only` half should not be: "Paige may never grant or raise her own autonomy
through Chat regardless of action class or owner wording" is explicit, and a settings toggle is
owner wording.

**The last peer-gate finding, closed: the invite seam told a real owner they were not one.** The
three invitation RPCs read `profiles.active_tenant_id` RAW; `current_user_tenant_id()` — used by the
roster and the other two RPCs — COALESCEs it to the caller's earliest active membership. So a sole
OWNER whose `active_tenant_id` happens to be null reads their own roster, passes the tenant guard,
and is then told *"only an owner or admin may invite team members."* They are the owner. Paige would
have relayed that in her own voice, which is the §13 failure — a true statement about a resolver
rendered as a false statement about a person. The refusal now names the real cause before any email
is attempted. **The RPCs are deliberately unchanged:** they are shared with the Team screen, which
has the identical defect, and correcting a `SECURITY DEFINER` tenant resolver is its own change with
its own producer inventory (§37). Logged as open.

---

## 2026-09-02 — The PAIGE Solo Platform Alignment Standard (owner, standing)

**`main` is the reference template for the Solo tier.** Every active standalone Solo tenant gets the
same shared shell, navigation, enabled surfaces and current-main behaviour. Records, plan,
permissions, integrations, connections and truthful availability may differ; **the product template
must not.** Never build for the tenant visible in a URL or fixture. An account number, fixture,
preview or one observed tenant is not proof that a behaviour is canonical.

**The required build path — the whole standard in one line:**

```
owner can use the page → tenant-safe record exists → safe domain evidence enters the Spine
→ PAIGE/Mind understands the right scoped truth → governed action occurs only when authorized
→ Rail records the outcome → owner can see the truthful result
```

A green unit test, static screen, mock or fixture is not completion. Evidence is reported in five
separated classes: automated · static · rendered structural · authenticated browser runtime ·
UNVERIFIED. A live owner capability is never claimed without authenticated browser proof.

**Department ownership.** Each department owns its UI, tenant records, domain logic and domain
actions, and must NOT invent or modify Chat's central handler, Mind's memory rules,
approval/confirmation mechanisms, Trust Compass enforcement, Rail infrastructure or Systems Check
conclusions. It publishes safe tenant-scoped evidence and action metadata through the Spine
contract; the Chat workstream completes the bounded adapter, approval treatment and owner-visible
capability. A **Spine Change Request** is only for a genuinely new shared primitive, shared schema,
approval mechanism, resolver behaviour or cross-domain contract.

**Surface cards are mandatory** before changing any department — ten fields and a truth label of
LIVE · PARTIAL · UNAVAILABLE · NOT CONNECTED · PROPOSED. Home: `docs/doctrine/surface-cards/`.

### §13 CORRECTION — an absence I asserted without looking

An earlier version of this entry, and of the surface-cards README, stated that **neither** the
"Solo Platform Taxonomy and UI Flow Standard" **nor** the "PAIGE Spine Integration Standard" existed
in the repository. **The Spine half was false.** `docs/architecture/paige-spine-foundation.md`, the
registry at `supabase/functions/_shared/paige-spine/registry.ts`, its CI contract workflow and its
handoff doc had all landed on `main` in #728 at 12:57 UTC; the claim was written at 13:12 UTC — from
a stale local tree, without fetching `main` first.

The rule this breaks is one already written down here: answer from the record, not from memory or a
stale checkout, and never assert an absence without a real search. An unfalsifiable claim of absence
is indistinguishable from not having looked, which is precisely what happened. **Fetch, then
assert.** The Taxonomy half stands — no single document under that name exists, verified against
`origin/main` — and the nearest sources are mapped in the surface-cards README.

### The first surface card: Team is PARTIAL, and the registry agrees

`docs/doctrine/surface-cards/team.md`. Legs 1–5 of the build path pass; 6 and 7 do not.

**A Team action emits no Rail event, and the owner has nowhere to see it happened.**
`emitRailForTool` returns early on `if (!contactId) return` — the Rail is per-client by
construction, and a Team action has no contact. That early return is CORRECT; emitting one anyway
would invent a client involvement. An attribution row IS written to `paige_audit_log`,
tenant-stamped and complete — but **no Solo surface reads `paige_audit_log`**. The Trust Compass
panel and the Team hub's own *"What the team did"* both read `paige_client_events` via
`useSoloActivityFeed`, so a permission change PAIGE makes on a team does not appear in that team's
own activity feed. And because PAIGE is a rail *beside* the page, an owner on Team with her open
sees a stale roster after she acts.

**The Spine registry independently reaches the same verdict.** It declares exactly one capability
today (`PIPELINE_DEAL_STAGE_EVIDENCE`); Team is not declared, and could not be declared complete,
because the registry requires `outcome.railVisibility` and Team has none.

**Filed as a Spine Change Request, deliberately not built.** The foundation doc states in its own
opening that it "does not create a second Rail, event bus, memory store, approval store, or PAIGE
workspace", and requires an approved Change Request identifier for any shared primitive. The
question is narrow: may a Rail event exist without a `contact_id`, or do workspace-level outcomes
get their own projection that `useSoloActivityFeed` unions in? Either answer makes Team declarable
with real Rail visibility. Neither is the Chat workstream's to pick alone.

### Branch note — the Team code was already on main

The Team capability (tools, classifications, tenant-agreement guard, autonomy clamp, catalogue
migration) merged to `main` in #728, not through PR #675. Verified rather than assumed: `main`
carries all 909 of the branch's migrations, all five tool declarations and the clamp, and its
`paige-ai-chat` handler is a strict superset. PR #675's branch was therefore rebuilt on `main`,
leaving only these documents — the alternative was a 110-commit branch whose only real content was
already merged.

---

## 2026-09-02 — Owner decisions on the Solo Team capability, recorded exactly

Ruled alongside Gate 2 on the surface-card documentation. **None of these is implemented by the
documentation that records them**; two describe work that has not happened.

**1. ~~Every PAIGE Team mutation is `owner_only`~~ — CORRECTED SAME DAY, see the entry below.**
The original wording, preserved because §58 does not delete a dated ruling: *invite, resend, revoke,
role/access grant, role/access revocation, permission change; no `high` path is to be introduced for
Team actions.* The owner withdrew this wording once its effect was named — `owner_only` removes an
action from Chat entirely rather than gating it harder. **The paragraphs below describe the
SUPERSEDED ruling and its gap; neither is current.**

*The live code does not match this ruling.* All six are `high` on prod today in
`_shared/action-risk.ts` (`team_invite_member`, `team_invite_resend`, `team_invite_revoke`,
`team_set_permission`, `member_grant_role`, `member_revoke_role`). `owner_only` is not a stronger
gate — it removes an action from Chat entirely, at any approval strength. So this ruling does not
tighten the Team tools, it **withdraws them from PAIGE**, and the confirm-card machinery built for
them becomes unreachable on those six. Closing the gap is product code in its own change.

*Not settled by the ruling:* `team_set_work_profile` is a Team mutation, is not among the six
enumerated, and is `ordinary` today. It writes two text columns and cannot reach `permission`. Left
`ordinary` pending an explicit owner answer rather than swept in by inference.

**2. A Team event is not a client event.** Do not emit a client Rail event with a null
`contact_id`. The repair is a distinct tenant/workspace-level outcome projection carrying safe
actor, action, target member or invitation, approval binding, result, and owner-visible evidence —
proposed as its own Spine Change Request, implemented in its own coordinated workstream. **Not
started.** This settles the open half of the question the Team card raised.

**3. `PARTIAL` is not lifted by documentation.** Team stays `PARTIAL` until the owner can see a
truthful tenant-scoped outcome after PAIGE acts AND the live authenticated flow is proven.

**Also on the record: PR #728's post-merge follow-up is a separate ACTIVE hotfix.** Four P1 and one
P2, not repaired and not made irrelevant by the surface-card work. Two land on surfaces the Team
card describes: `useRailEvents` can merge the previous scope's events into the feed after a
tenant/contact switch, and `useSoloPendingActions` keeps the previous tenant's pending actions on
the Trust Compass after an account switch. The other two P1s are in `paige-apply-extraction` (a
partial sync counted as success; an extraction claim not released when the transport rejects), and
the P2 is a failed Skip leaving a proposal unretryable in `PaigeAIChat`.

Issue #198 (prod migration deploy FAILED) stays **open**, untouched.

---

## 2026-09-02 — CORRECTION: the six Team actions stay in PAIGE at `high`

Supersedes decision 1 of the entry above, on the same day, before any code was written to it. The
prior entry is left standing and marked, not deleted (§58).

**The ruling now.** Invite · resend invitation · revoke invitation · change permission/access ·
grant role · revoke role **remain in PAIGE Chat, classified `high`**. Each requires the canonical,
server-verified owner approval card before execution. PAIGE may propose and explain the action, and
may carry it out only after the owner explicitly approves that exact bounded action. She may never
manufacture approval, raise autonomy, or bypass the domain authorization check.
`team_set_work_profile` remains `ordinary` — it changes only job title and responsibilities, cannot
alter access, still takes the normal compact confirmation, and must never be represented as a
permission change.

**This matches the live code**, so there is no longer a gap to close and no product change is
required. The card's table now records classifications rather than a divergence.

**Why the first wording was wrong, which is the part worth keeping.** `owner_only` is not a
stronger gate. It means *never performed from Chat, at any approval strength, however the operator
words it.* Applying it to the six would not have hardened them — it would have **withdrawn PAIGE's
ability to help an owner run their team**, which is the opposite of the product intent. `high` is
the setting that means "she can do it, and only after you approve this exact call": the approval
fingerprint travels in the request body, which the model cannot author, so the model asserting
consent is refused.

**The lesson, and it generalises past this ruling.** A classification name that sounds like a
severity is not one. `ordinary` → `high` → `owner_only` is not a dial from *softer* to *stricter*;
the last step changes kind, from "gated" to "absent". A ruling phrased as tightening can therefore
delete a capability by accident. When a class name is used in a ruling, state the **effect** —
"stays in Chat behind your approval" or "leaves Chat entirely" — because the effect is what the
reader is actually deciding.

**Unchanged by this correction, and still true:** the workspace-level outcome projection remains a
separate Spine Change Request and is not started; Team's truth label remains `PARTIAL`; the
authenticated live-flow proof is still owed on a capability already serving production; and PR
#728's post-merge P1/P2 findings remain a separate active hotfix, neither repaired nor made
irrelevant.

---

## 2026-09-02 — Master Project File reconciled to live Solo Team, and a closeout rule so it stops drifting

Documentation-only, from fresh `main` `05735f26b`.

### §13 CORRECTION — I reported a gap that was not the gap

At the close of PR #675 I told the owner the Master Project File had **zero** mentions of the Solo
Team capability, on the strength of `grep -ic "solo team"` → 0. **That was wrong.** The file has
carried a Team entry since 2026-08-31, headed *"Solo Settings → Team management"* — a spelling the
search never tried. The Second Brain skill's own sweep rule says it plainly: *vary the spelling; an
absence proven with one spelling is only the absence of that spelling.* I cited that discipline in
the same report I broke it in.

The real defect was worse than a gap, not better: the file **did** describe Solo Team, and described
it as *"local branch, NOT LIVE"* while it was serving production. A missing entry is silence; a
present, confident, wrong entry is what a reader acts on.

### What the Master Project File now says

**§4 (SHIPPED) — new entry, *Solo Team — PAIGE can act on the team (LIVE on production, capability
`PARTIAL`)*.** Owner job; human surface (Solo Settings → Team); PAIGE's capability limited to the
canonical approval route; the risk table (six `high` behind the real owner approval card,
`team_set_work_profile` `ordinary` and never a permission change); the `PARTIAL` label; the live
limitation that owner-visible workspace-level outcome history is missing; authenticated owner
browser proof still owed; the workspace-level outcome projection as an unstarted Spine Change
Request; PR #728's P1/P2 hotfix as separately active; and exact PR/commit/prod evidence.

**Two stale entries corrected in place, marked not deleted (§58):** the §4 PAIGE Chat header still
said *"PR #675, NOT YET MERGED … nothing below is live"*, and the §5 gaps entry still said *"local
branch, NOT LIVE"*. Both now carry their correction beside the original wording.

### The standing closeout rule (owner-ruled 2026-09-02)

Recorded in `.claude/skills/second-brain/SKILL.md` — repo-native by design, because the installed
`flow-by-flow` skill is per-account, cannot see this repository, and must not be silently modified.

A workstream is **not complete** until **both** the relevant Second Brain record **and**
`docs/PAIGE-MASTER-PROJECT-REFERENCE.md` are updated, whenever the work changes product capability,
current platform truth, release status, architecture, owner flow, or a material known limitation.
The only escape is a **collision-safe handoff** naming all four of: the exact Master Project section,
the proposed text, the owner, and the reason it could not be updated in the same PR. The skill's
reporting gate now fails if it reports only the brain.

### Consistency sweep — three more stale claims, each read before judging

- `docs/brain/roles-permissions.md` said `tenant_members` has **no** work-title/responsibilities
  columns. It has both, as live `text` columns on prod. Corrected; the true half — descriptive only,
  never an authorization input, authenticated behaviour still unproven — is kept.
- `docs/brain/config-registry.md` said the Team edge function and RPC family were *in-flight, not
  deployed*. They are deployed. Corrected, with migration apply confirmed and email delivery plus
  authenticated behaviour still marked UNVERIFIED.
- `docs/brain/paige-brain-wiring-standard.md` said *"Gate 2 pending"* and *"she may not send an
  invitation, change a role, grant access"*. Corrected — and the load-bearing half of that sentence
  survives, which is why the correction is safe: **not from context alone.** Every act goes through
  the governed tools and the six access-changing ones require the real approval card.
- `docs/brain/decision-log.md`'s dated 2026-08-31 entry was **true when written** and is preserved
  intact with a forward pointer, not rewritten.

**Nothing added here is a secret, a raw provider payload, private tenant data, or a capability claim
the code does not support.** Team stays `PARTIAL`; no authenticated proof is claimed.

### Landed — Gate 2, merge, and verification on `main`

The owner approved Gate 2 at exact head `7e470f69c8f47dd0fe7112fbe68ab7a0d0813c28`. PR #730 merged to
`main` as **`ed22066e71294099e48f0b52c742e3f379faf23c`** (squash; 7 files, +198/−15 — byte-identical to
the approved diff, since the branch carried a single commit).

Verified on `origin/main` after the merge, by reading it rather than trusting the merge response: the
new §4 entry is present; the §4 PAIGE Chat header and the §5 Team entry both carry their §58
strike-through correction beside the original wording; the both-records closeout rule is in the
repo-local skill. The other `local branch, NOT LIVE` line in §5 belongs to the **multi-membership login
account picker**, a different workstream, and was correctly left untouched.

CI on that exact head, read directly rather than counted: `verify` success, `audit` success, combined
commit status success (both Vercel contexts), `mergeable_state: clean`. `Supabase Preview` skipped and
`migration-lint` absent — both path-filter on `supabase/**`, which this PR does not touch, so their
absence corroborates the documentation-only scope instead of indicating missing coverage.

**Unchanged by the merge, still owed:** authenticated owner browser proof of the Team flow; the
workspace-level outcome projection (an unstarted Spine Change Request); PR #728's P1/P2 hotfix, which
remains a separate active workstream this did not repair. Team remains `PARTIAL`.

### Parked, not fixed — a stale claim this closeout's sweep found

`docs/PAIGE-MASTER-PROJECT-REFERENCE.md` §4 carries MET1 (§34-L1 metering) as a ✅ **SHIPPED** entry
while simultaneously asserting *"branch `codex/paige-knowledge-active-tenant-isolation-v2`, **NOT
MERGED — draft PR, Gate 2 not requested**"* — contradictory on its face, and stale:
`supabase/functions/_shared/token-pricing.ts` and `supabase/migrations/20261038000000_the_meter_actually_runs.sql`
are both on `main`, added by **`76bb3bbca` (PR #728)**, established with `git log --diff-filter=A`. Both
were present at base `05735f26b` too, so this predates PR #730 and was not caused by it.

**It is NOT fixed here.** Under the owner's standing scope-control rule (2026-09-02), a distinct issue
found mid-assignment is parked rather than absorbed: it belongs to the §34 metering workstream, not to
the Solo Team assignment, and the assigned flow works correctly without it. Parked as
**issue #737**. Only the owner may convert that into an implementation assignment.

Recorded honestly: the correction was briefly present in PR #732's diff before the scope-control rule
was issued, and was reverted out of it. Nothing about the entry's behavioural claims was ever
re-verified — whether the meter actually drains on prod is MET2's evidence, not this closeout's.

Three further status claims were read and left alone for the same reason, and are carried in the same
parked issue as **unverified rather than known-wrong**: the multi-membership login account picker,
Solo Campaigns → Pipeline board, and Setup-owned A2P legal identity. All three sit in §5 (gaps), which
is the correct home for in-flight work.
---

## 2026-09-02 — Solo Settings → Setup joins the authorized visible-scroll surfaces (owner ruling)

**The ruling.** *A Settings surface may use a clearly visible, accessible main-content scrollbar
when real configuration content materially exceeds the available viewport.* **Settings → Setup is
explicitly authorized.** Connections (with Calendars) and Integrations remain authorized. Short
Settings surfaces that genuinely fit stay form-fitting. **Command Center, Clients, Campaigns and
Analytics remain form-fitting** unless the owner separately authorizes an exception. Marketplace may
use a visible main-region scrollbar when its content requires it — out of scope here, and its code
was not touched. **This is not a global scrolling rule for the platform.**

**A naming note, recorded so the next reader is not misled.** The ruling was given as *"Shape C:
visible scrolling"*. In the review prototype that shipped the four options, "visible scroll" was
shape **B** and shape **C** was a section rail beside a scrolling region. The ruling's own written
policy is unambiguous — one visible scrollbar on the main Setup content region, and *"do not
redesign the business brief, change its information architecture"* — so the **described behaviour**
is what was implemented and what binds. The letter is recorded only to stop a later reader
implementing the rail on the strength of the letter alone.

### What was wrong, measured before the ruling

Setup rendered 3,973–4,174px of business brief into a 702–934px host at the four supported Solo
viewports — **78–82% below the fold on arrival, with no scrollbar drawn in either lane.** It was the
only one of the eight Settings destinations that overflowed its host; the other seven fit exactly.

**The mechanism, and why every guard stayed green.** `SoloSettings` applies
`.tcs-main--settings-scrollbar-hidden` to the resolved owner for *every* destination, which trips the
`solo-tokens.css:106` exception and gives the host `overflow-y: auto`. It applied the second class —
the one that *draws* the bar — only for `connections` and `integrations`. So Setup could scroll and
could not show that it scrolled. The policy lived in
`const visibleScroll = tab === "connections" || tab === "integrations"`, and the only test of it
asserted that exact source line. **A boolean expression cannot be read as a policy by anything except
the eye that wrote it**, which is why a surface hiding four-fifths of itself passed every check.

### The repair

The destination policy moved out of that expression into
`src/components/tenant-shell/settings-scroll-contract.ts` as
`SETTINGS_VISIBLE_SCROLL_DESTINATIONS` + `settingsDestinationShowsScrollbar()` — a value with its own
tests, in the module that already owns the class name and the focus predicate. `SoloSettings` and
`settings-scroll-drive.mjs` both read it, and a test asserts the two lists match: a drive still
classifying Setup as form-fitting would have asserted *"nothing is clipped"* on a surface the product
now deliberately scrolls, and failed it for the opposite reason. The predicate **fails closed** — an
unrecognised destination stays form-fitting.

**No CSS changed.** The visible-scrollbar rules already existed and were already correct
(`settings.css:221`, `:222`, `:279`); Setup simply never received the class that activates them. That
kept the repair out of `src/solo/settings.css`, which an active PR owns.

**Canonical, not a patch.** One shared shell, one policy value, no tenant/account/URL/fixture branch.
Structurally identical across two synthetic Solo tenant contexts.

### The harness defect this exposed, and its repair

`scripts/live-drive/harness/settings-mount/main.tsx` passed the theme with `forcedTheme`, which
stamps the document attribute but leaves next-themes' `resolvedTheme` alone — and
`TenantCommandCenterShell` stamps its **own** `data-pg` from `resolvedTheme` onto wrappers inside the
document one. So the shell rendered `data-pg="light"` under `<html data-pg="dark">` and
`--pg-canvas` computed `#fbf9f5` in both runs. **Every "both themes" result this harness ever
produced was one palette measured twice.** Now `defaultTheme` + `enableSystem={false}` + a per-theme
`storageKey`, and the drive **scores** the rendered token per environment rather than trusting the
loop. Verified: `--pg-canvas` `#100e14` vs `#fbf9f5`, `.solo-settings` background `rgb(16,14,20)` vs
`rgb(251,249,245)`, shell `data-pg` `["dark","dark"]` vs `["light","light"]`.

Geometry is theme-independent and was byte-identical across the two runs, so the pre-ruling overflow
measurement stands as a geometry fact. Colour was never exercised before this change.

### Evidence status

Rendered structural, at 1536×770 · 1366×768 · 1024×768 · 900×1000 in both palettes: Setup passes the
full visible-scroll battery — bar visible with a stable 10px gutter, wheel · End · PageDown · Space ·
scrollbar drag (3,284/3,284, 100%) all reach the last control, travel reaches the end, focus reaches
the spatially deepest control with a visible ring, keyboard visits every control, focus exits forward
and backward, one scroll owner, no horizontal overflow. Locked surfaces stay `overflow-y: hidden`.

**Authenticated browser runtime on the live platform: `UNVERIFIED`.** No leg has been driven signed
in. This session has no authenticated browser lane; the drive is a reproduced shell with a synthetic
transport, which is structural evidence and never authenticated proof.

### Parked, not fixed here

`docs/doctrine/tier-matrix.md:1082` and the header of `src/solo/settings.scroll-policy.test.tsx` both
claim the Settings/Calendar drives run inside the *"REAL merged `SoloApp`"*. The settings harness
demonstrably reconstructs the chain instead. Parked as **issue #738** for the drive's owner; not
corrected here because it is a claim about drives this repair does not touch.

### Landed — Gate 2, merge, and deployment

The owner approved Gate 2 on exact head `77d94c6643ac4ebdb26b8caef0613aad19469260`, authorizing two
things only: the merge, and the normal frontend deployment that follows it. PR #751 merged to `main`
as **`1d189155350b1769d7b1f4d031e7b144890616a0`**.

Pre-merge, `main` had advanced one commit past the reported base (`f0fcd2dd`, #743) — **documentation
only**, zero source or runtime files, so nothing touched the Setup repair files, the scroll policy,
the Solo shell host or its tests. The single file changed on both sides,
`docs/PAIGE-MASTER-PROJECT-REFERENCE.md`, auto-merged with 0 conflicts.

**No migration, edge function, provider action or production-data mutation was in scope or occurred.**
`Supabase Preview` was correctly **skipped** — there is no `supabase/` diff in this change.

**Still `UNVERIFIED` after shipping: the authenticated owner browser proof.** Merging is not evidence
that a signed-in owner can complete the flow, and this entry does not claim it is. The short steps to
close it are recorded in the Master Project File entry for this surface.

**Records corrected in this closeout**, because they described a state that shipping made false — the
exact drift this log already recorded a lesson about (a doc reading *"local branch, NOT LIVE"* while
serving production): the Master Project File entry's heading, status paragraph and closing gate line
now read as merged and deployed, with the `UNVERIFIED` authenticated proof preserved and restated as
the one thing still owed.

## 2026-09-02 — The Canonical Solo Parity Program opens; Wave 0 baseline published

**Owner-assigned, standing.** Ownership is no longer the one-off Setup scrollbar repair: it is making
every current and future Solo account receive the same canonical Solo product template as `main`.
One active wave at a time; discoveries are parked as durable issues rather than absorbed.

**Wave 0 delivered**, on `main` @ `8eda0e8d`, with no product change:
- PR #774 merged (`8eda0e8d`) — the Setup record now reads as merged and deployed rather than as an
  unmerged draft.
- `docs/doctrine/canonical-solo-parity-matrix.md` — every Solo route, branch, sub-tab, Settings
  destination and PAIGE entry point, marked with the seven program statuses, plus the wave plan.

**The finding that governs the program, and it is not a shell defect.** `src/pages/Admin.tsx:373-393`
mounts the canonical Solo shell only when `features.solo_shell_enabled === true` on that tenant's own
row (`useTenantContext.tsx:512`). Measured on prod: **4 of 7 top-level Solo tenants carry it; 3 do
not** and render the legacy `/admin` shell instead. So every parity repair reaches 4 of 7 Solo
accounts until the owner rules on finishing the rollout. Config-as-data working as designed — and
exactly the gap between "the template is correct" and "every account receives it".

**Three counts corrected against the record.** Prod now has **13 tenants** (2 agency · 7 top-level
Solo · 4 sub-account), not the 11 in this brain's 2026-08-09 snapshot — that snapshot was true when
written and is superseded, not wrong. `SOLO_BRANCHES` is **10 branches / 45 sub-tabs**
(`tierBranches.test.ts:200,215`), while its own docblock says 13/47. And only **6 of 10 branches have
a nav entry** — `paige`, `trust-compass` and `automations` are aliases of Command Center
(`tenantShellRoutes.ts:49`), `calendar` is addressable with no nav home by design.

**Evidence capability — independently re-measured, and it CONFIRMS an existing lesson rather than
discovering anything.** `docs/brain/lessons-learned.md:1233` already recorded on 2026-09-01 that
*"prod is not reachable headless" is the wrong reason — the browser tunnel is*, with the same two
blockers. This session measured the same result from scratch: `curl` 200, Chromium launches,
Playwright navigation dies with `ws_closed_mid_exchange`, and `LIVE_DRIVE_EMAIL`/`LIVE_DRIVE_PASSWORD`
are unset. **Recorded as confirmation, not as a new finding — and as a §BRAIN.1 miss on this
session's part**, which re-derived a documented answer instead of reading the lessons file first.
What this program adds is the tenant half: seven real Solo tenants exist, so the two-tenant
comparison is blocked on capability and credentials, **not** on tenant availability. Every `AUTH-CMP`
row stays `UNVERIFIED` until a scoped test-tenant credential pair exists (never owner PII, §63).

**Parked, not absorbed:** [#779](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/779)
Clients › Delivery renders fabricated client records and an invented PAIGE narrative — the only Solo
surface presenting false tenant data as fact ·
[#780](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/780) Trust Compass numbers and
autonomy dial are fixtures and its primary buttons only close the modal ·
[#781](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/781) `paige:open` prompts authored
by four sites and read by none, plus two listeners with no dispatcher ·
[#782](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/782) Solo documentation parity — 1
of 14 surface cards exist, two `main` docs assert a card that is not on `main`, and the tier-matrix
Solo ledger covers 1 of ~18 surfaces.

**The PAIGE Attention Register standard landed the same day** (`docs/doctrine/paige-attention-register.md`,
#768) and is now the canonical home for this process. Its §7 states the GitHub Project itself has
**not** been created and the register is `UNAVAILABLE` rather than empty; this session holds no
Projects v2 capability either. All four issues were written to the standard's §2 intake schema, so
they enter the seed set unchanged once the board exists. No Markdown substitute was built — §7
forbids it as a competing backlog.

## 2026-09-02 — The canonical Solo shell policy is RULED; Wave 0 baseline released

**Wave 0 released.** Gate 2 approved on head `1b6b44e3`; PR #783 merged to `main` as **`a289d0bc`**.
Documentation only — verified after the merge that no Solo product behaviour, tenant data, feature
flag, migration or deployment configuration changed: the flag split is still 4 true / 3 unset across
7 top-level Solo tenants, 13 tenants total, and the migration ledger is unmoved at 911
(`20261041000000`).

**The ruling (owner, 2026-09-02).** Every **eligible standalone** Solo tenant must receive the
canonical Solo shell and product template represented by `main`. `solo_shell_enabled` is the
**intended canonical end state** for eligible standalone Solo tenants. **No tenant-brand,
account-number, URL, fixture, or special-customer shell fork** is permitted, and **no exceptions are
to be invented** — an exclusion is legitimate only when it follows from real platform eligibility
(not standalone, has a parent, no `account_number`, tier does not resolve to `solo`), never from
customer preference. This supersedes the Wave 0 record's framing of the flag gap as an open owner
question: it is answered.

**What the ruling explicitly does NOT authorize:** a bulk production flag or data mutation inside a
parity baseline or a Settings UI repair. Enablement is routed to one controlled slice —
[#790](https://github.com/mrmogulmaker-bot/Paige-Agent-AI/issues/790) — which must inventory every
candidate and its current flag state, justify every exclusion structurally, publish the exact
proposed enablement set, prove no Agency/parent/other-tier tenant is included (against the §51
absolute invariant), verify canonical route/shell behaviour before and after, and request its **own**
exact-head Gate 2 and **separate** production-data authority.

**Wave 1 is Settings → Team**, authorized to begin on merge of #783. Canonical Solo parity only —
route, shell ownership, layout, availability treatment, responsive behaviour, PAIGE entry, and the
state matrix. **Tenant-owned Team data is never normalized**: members, roles, invitations, names,
responsibilities and existing business records stay the tenant's. Rail, Spine, Mind, Chat, Team
authorization and backend capability work are routed out, not absorbed.

Sequential order after Wave 1 releases: Connections → Integrations → the remaining Settings
destinations in canonical on-screen order. One active implementation wave at a time.
