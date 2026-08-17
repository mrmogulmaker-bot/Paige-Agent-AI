# Route & URL Taxonomy

**Owner-locked 2026-08-17 (Antonio via Cowork).** The canonical map of every user-facing
URL → (tier × capability × user mental model), plus the migration plan that renames the
incoherent routes to intuitive ones **without breaking anything** (§58). Modeled on the
§51 tier matrix (`docs/doctrine/tier-matrix.md`).

This is **PR 1: the taxonomy + matrix + migration plan.** It contains **zero code renames.**
The actual renames are follow-up slices sequenced by the plan below, each owner-gated.

---

## 0. Why this exists (the bug)

Route naming maps to **internal router structure**, not to how a user thinks — a §36
intuitiveness violation. The concrete symptom that forced the ruling:

- **`/admin` is overloaded four ways.** One URL renders the God fleet console (super_admin),
  the Solo tenant shell, the Sub-account shell, and the new Agency shell — chosen at runtime
  by tier + per-tenant flags (`src/pages/Admin.tsx:368–457`). A single URL cannot map to five
  mental models, so the router logic (and every agent maintaining it) keeps guessing and
  re-routing.
- **`/agency` serves the OLD surface.** The canonical-sounding name points at `AgencyBoard`
  (the surface being replaced), while the NEW agency shell hides under `/admin` behind a flag.
  An agency owner lands on `/agency` (old) by default (`resolveLandingRoute.ts:26–41,103–106`)
  and never reaches the new shell — the exact confusion the owner hit 2026-08-17.

Same naming-debt class as: **Solo** (marketing word) vs `standalone` (account_type); and
**Enterprise** (in a tenant's *name*) vs `agency` (its *tier*). All three: the naming layer is
inconsistent with the user's mental model. This doc + the §65 anchor close the class.

---

## 1. Naming principles

1. **URL + chrome label match the user's mental model, never the router or DB structure**
   (§36, §65). "As a *[tier]* who wants to *[do X]*, what URL do I land at?" answers in one row,
   unambiguously. "I see URL *[X]* — who is it for, what does it render?" answers in one row.
2. **One home per capability (§18).** A tier has exactly one front door. `/admin` as a shared
   entrance is the anti-pattern; it retires to a smart-redirect (§4), then dies.
3. **Shared shell code where §60 says the feature set is identical** — different route prefix +
   chrome label, unified code underneath. No mental-model drift, no code drift (see §3).
4. **Every account is uniquely addressable** — a per-account number in the URL (see §2b), so no
   two accounts share a link and each is individually trackable.
5. **Old routes stay redirect-alive ≥1 release cycle (§58)** before deprecation, then removal.

---

## 2. The locked route matrix

### 2a. Tier → label → URL

| Tier / persona | User-facing label | Canonical URL | "I think of this as…" | Today (retiring) |
|---|---|---|---|---|
| Super Admin / God | **Operator** | `/operator` | "the platform / my fleet" | `/admin` (godMode) |
| Agency | **Agency** | `/agency/{account}` | "my agency" | `/agency` = OLD board |
| Enterprise | **Enterprise** | `/enterprise/{account}` | "my company" | `/admin` |
| Solo (standalone) | **Solo** | `/solo/{account}` | "my business" | `/admin` |
| Sub-account | **Business** | `/business/{account}` | "my business" (agency-billed) | `/admin` |
| Client / consumer | **Portal** | `/portal/:tenantSlug` | "my coach's portal" | `/app` · unchanged |
| Anonymous | — | `/` and marketing routes | "the website" | unchanged |

`/admin` **retires**: for one release cycle it becomes a **smart-redirect** that resolves the
session's tier and 301s to the correct home above (§58 clean); then it is removed.
`/agency` **reclaims** its name for the NEW shell — the old `AgencyBoard` retires behind the
same smart-redirect discipline.

### 2b. Per-account unique URL segment (`{account}`)

Owner ruling 2026-08-17 (refined same day): **numeric at creation, then account-holder editable
to a vanity name.** Every tenant-tier account is BORN with a unique numeric segment —
`/business/3855`, `/solo/1234`, `/agency/42`, `/enterprise/7` — because at creation we must NOT
assume how the owner will spell, modify, or brand their name. The account holder can then CHANGE
the URL segment to their own name / company name from inside their account. Owner's framing:
*"initially we set it up like [a number], but then we allow them to modify the URL to their own
name or company name. We should have that feature built into the platform anyway."*

- **Net-new column.** Today a tenant has `slug` (name-based) + `account_number_prefix` (initials
  only, e.g. `ADL`/`MMM` — a code, but name-derived and not a stable unique number). The taxonomy
  adds a stable, unique **`account_number`** per tenant, assigned at creation — the PERMANENT
  address that never changes or gets reused (it is what deep-links, audit trails, and support
  reference).
- **Vanity URL is a first-class, self-serve feature (§10-governable).** The account holder edits
  a `url_segment` (their name / company) from Setup; the route resolver accepts EITHER the numeric
  `account_number` OR the current `url_segment` and resolves both to the same account. Requirements
  for the implementation slice: (1) uniqueness across the tenant-tier segment space (a claimed
  vanity can't collide with another account's number OR vanity); (2) a reserved-word denylist
  (`operator`, `admin`, `portal`, `api`, `new`, tier prefixes, etc. — never claimable); (3)
  format validation (lowercase, url-safe, length bounds, no leading digits so it can't shadow a
  number); (4) on change, the OLD segment 301-redirects to the new for a grace window (§58 — a
  shared/bookmarked link never dead-ends); (5) the permanent numeric address ALWAYS still resolves
  even after a vanity is set (never breaks). Config-as-data + a callable seam so Paige can rename
  it by voice/text too (§10), not a React-only control.
- **Address, not an access grant (§9).** The route stays auth-gated (session + RLS via
  `current_user_tenant_id()` / the §51 firewall) whether the segment is numeric or vanity. A
  guessed number/name never exposes another account's data — it only fails the auth/scope check.
  The segment is for *addressing + tracking*, never authorization.
- **Number shape at creation — OPEN SUB-CHOICE for owner (default = recommended):**
  - **(recommended) offset/scrambled numeric** — short number feel (e.g. `3855`), but not a raw
    `1,2,3…` sequence, so the URL space doesn't broadcast the exact account count.
  - pure sequential `3855, 3856…` — simplest, but enumerable/count-leaking.
  Either is a *number*, per owner intent; pick before the implementation slice.
- **Scope:** applies to the four tenant tiers (agency / enterprise / solo / business).
  `/operator` is singular (us) — no number, no vanity. `/portal/:tenantSlug` (clients) keeps the
  tenant slug it already uses (unchanged per ruling).

---

## 3. Shared-shell design (owner-approved 2026-08-17)

Two route prefixes can mount the **same** shell code — the URL + chrome label differ (mental
model, §36), the code stays unified (§60/§18). Enforced by the existing tier-feature resolver.

1. **`/solo` + `/business` = same shell.** Per §60 Solo ≡ Sub-account except billing. One
   shell, two prefixes; chrome label "Solo" vs "Business"; underneath, unified code. Same
   principle at Setup, Systems Check, and every §60-identical surface.
2. **`/agency` + `/enterprise` = same shell + Enterprise customizations.** Per §60/§61
   Enterprise = Agency baseline + per-tenant customization. Same shell mounts at both prefixes;
   Enterprise-tier tenants get their negotiated customizations rendered on top via the existing
   `getTierFeatureSet()` / tier-feature resolution; Agency tenants don't see them. Labels + URLs
   differ; code stays unified.

Design intent, restated: **URL + label per mental model; shell code unified where the feature
set is identical.** Best of both — no mental-model drift, no code drift.

---

## 4. Current-route inventory → target mapping

Every route from the §30 inventory is accounted for. Sources: `src/App.tsx` `<Routes>`,
`src/pages/Admin.tsx` (nested `/admin/*`), `src/components/admin/AgencyLayout.tsx` (`/agency/*`),
`src/lib/auth/resolveLandingRoute.ts` (landing), `src/lib/hostRouting.ts` (reserved-prefix list).

### 4a. Tier front doors (rename targets)

| Current | Serves today | Target | Notes |
|---|---|---|---|
| `/admin` (godMode index) | Super Admin fleet console | `/operator` | God only; `super_admin`→ here |
| `/admin` (AgencyApp Gate A) | Agency / Enterprise (flag) | `/agency/{n}` · `/enterprise/{n}` | new shell; split agency vs enterprise prefix |
| `/admin` (AgencyApp Gate B) | Sub-account (flag) | `/business/{n}` | sub-account shell |
| `/admin` (SoloApp / AdminLayout) | Solo / standalone | `/solo/{n}` | solo shell |
| `/agency` (`AgencyBoard`) | Agency (OLD surface) | retire → smart-redirect to `/agency/{n}` new shell | old board removed after window |
| `/app` (+ children) | Client / consumer | keep `/app` **or** consolidate to `/portal` | see §4c open item |

### 4b. Routes that DON'T move (already coherent)

`/` `/premium` `/legacy` `/legal/*` `/terms` `/privacy` `/about` `/pricing` `/blog` `/affiliates`
(marketing/anonymous); `/auth` `/login` `/operator`(login) `/join-platform` `/reset-password`
`/accept-invite` `/join/:token` `/mcp/authorize` `/auth/*/callback` (auth/OAuth); `/portal/:tenantSlug`
`/book/:slug` `/booking/manage` `/store/:slug` `/p/:tenantSlug/:pageSlug` `/f/:tenantSlug/:funnelSlug`
`/form/:id` (public tenant surfaces); `/broker` `/brokers` `/broker/accept-invite` `/broker/app/*`
(broker — already tier-coherent); `/onboard/*` (magic-link onboarding); `/welcome` `/get-started`
`/signup` `/signup/coach-qualify` `/unsubscribe` `/u/:token` `*`(NotFound).

### 4c. Open items to resolve during the plan
- **Client home: `/app` vs `/portal`.** The matrix labels the client tier "Portal." Today the
  authenticated client home is `/app` and `/portal/:tenantSlug` is the tenant-branded *entry*.
  Decide in the plan whether to consolidate the client home under `/portal` or keep `/app` (it is
  the highest-blast-radius consumer route — see §5). Ruling: **keep `/portal/:tenantSlug` unchanged
  this round**; a full `/app`→`/portal` consolidation is a *separate, later* slice given its blast
  radius, not bundled with the tier front-door renames.
- **`/admin/*` deep paths.** The ~90 `/admin/*` sub-routes (`/admin/clients`, `/admin/campaigns`,
  `/admin/platform/*`, …) move under their tier root as the shell for that tier already owns them
  internally (SoloApp/AgencyApp are stateful shells — their internal screens are `useState` routes,
  not URLs, so most `/admin/*` deep paths only exist in the legacy `AdminLayout` path and retire with it).

---

## 5. Producer inventory / blast-radius (§37)

Route renames touch far more than React code — **sent emails, Stripe/OAuth callbacks, MCP
responses, and external dashboards** embed these paths, and a stale one breaks *silently*.

| Route | src refs | edge fns | Highest-risk silent-breakers |
|---|---|---|---|
| `/admin` | ~353 | 7 | approval/team **emails**, Stripe billing+marketplace **return URLs**, **MCP** deep-links returned to external agents, Zoom/security callbacks |
| `/app` | ~143 | 9 | welcome/payment **emails**, **push** payloads, QuickBooks/Zoom **OAuth returns**, Stripe slot **checkout return** |
| `/agency` | ~28 | 4 | landing logic; `/admin/agency`→`/agency` bridge |
| `/broker/app` | ~22 | 3 | `accept-invite`, broker-admin emails |
| `/workspace` | ~5 | 4 | **LIVE in Stripe Connect return URLs** despite looking dead (redirects to `/app`) |
| `/onboard` | ~39 | 7 | `accept-invite` `redirectTo`, landing |

**Choke points (edit these first, per rename):**
- `src/lib/auth/resolveLandingRoute.ts` — the landing authority; emits every tier path.
- `src/lib/hostRouting.ts` (+ `hostRouting.test.ts`) — reserved-prefix list for subdomain
  fail-closed routing; a rename here mis-pins subdomain visitors if missed.
- `supabase/functions/accept-invite/index.ts:46–61` — the ROLE→PATH table centralizing
  `/admin`, `/broker/app`, `/app`.
- Edge functions building email/Stripe/OAuth/MCP URLs (enumerated per slice below).

**Update order for ANY rename slice:**
`resolveLandingRoute.ts` → `hostRouting.ts` (+ test) → `App.tsx`/`Admin.tsx` router → all
`navigate()`/`<Link>` callsites → edge functions (emails/Stripe/OAuth/MCP) → **external
dashboards** (Supabase auth redirect allowlist, Google/Zoom/QuickBooks OAuth consoles, Stripe
return-URL config — *not in the repo, highest silent-break risk*) → docs.

---

## 6. Migration plan (ordered slices, §58 anti-regression)

Each slice: old route **stays redirect-alive ≥1 release cycle**, then deprecate-with-warning,
then remove. Each slice ships its **own** §37 producer inventory + §32 verification. Every slice
is **owner-gated** before it ships.

**Slice R0 — smart-redirect scaffold + `account_number` substrate (foundation, no rename yet).**
Add the `account_number` column (unique; number-shape per §2b owner choice). **Backfill is UNIFORM
across the ENTIRE platform — every existing account is treated as a BRAND-NEW account (owner ruling
2026-08-17, §7.4):** every tenant-tier account already on the platform is assigned a fresh
`account_number` by the same rule a new signup gets, with **zero grandfathering of any current
slug / vanity URL**. We do NOT special-case, preserve, or migrate whoever happens to hold a
name-based URL today — the numbering system + taxonomy apply identically to all. (Existing `slug`
values stay in the DB untouched as data — clients still use `/portal/:tenantSlug`, §4b — but they
are NOT the new tier-route segment and get no special routing treatment.) Add a tier-resolving
redirect helper (reuse `resolveLandingRoute`) that maps a session → its canonical home. No
user-visible route change yet; this unblocks every later slice.

**Slice R1 — Operator (`/admin` godMode → `/operator`).** Lowest tenant-facing risk (operator-only).
Point super_admin landing + the God console to `/operator`; `/admin` godMode → redirect. Update the
God-only edge/MCP links.

**Slice R2 — Agency + Enterprise (`/agency` reclaim + `/enterprise`).** Mount the new AgencyApp shell
at `/agency/{n}` (+ `/enterprise/{n}` with Enterprise customizations, §3). Retire the old
`AgencyBoard` behind the smart-redirect. **Fold in the revert of the `agency_login_default='last_account'`
workaround** (see §7) — once `/agency` is the correct default landing, the workaround is redundant drift.
Update `resolveLandingRoute` + `resolveAgencyLanding`.

**Slice R3 — Solo + Business (`/admin` tenant → `/solo/{n}` · `/business/{n}`).** Shared shell, two
prefixes (§3). Highest care: `/admin`'s huge blast radius (emails/Stripe/MCP) — sweep every edge-fn
URL string in this slice. `/admin` becomes the smart-redirect after.

**Slice R4 — retire `/admin` + `/agency`(old) redirects.** After ≥1 release with redirects live and
zero traffic on the old paths (verify via logs), remove the redirects.

**Deferred (separate later slices, NOT bundled):**
- `/app` → `/portal` client-home consolidation (highest consumer blast radius; §4c).
- **DB naming-debt: `account_type='standalone'` → `'solo'` normalization** — a URL rename + DB rename
  bundled would be a §37 producer-inventory monster. **URLs first, DB naming second.** Logged as a
  follow-up task.

---

## 7. Owner rulings folded in (2026-08-17)

1. **Revert the `agency_login_default='last_account'` workaround** — it was an honest symptom-fix
   (the DB lever that currently routes the agency owner to `/admin`→new-shell). Once Slice R2 makes
   `/agency` the correct default landing for agency owners, the workaround is redundant and becomes
   drift. **Revert it as an explicit step inside Slice R2.**
2. **Delete the `test-agency-preview` throwaway agency** (tenant `2de8ca80…` + its auth user) — but
   **only after** Antonio's real-agency live-check succeeds on the migrated routes **and** he confirms
   no further §32.c drive he wants on the throwaway. **Milestone-gated cleanup task**, not urgent.
3. **URL segment: numeric at creation, then self-serve editable to a vanity name (§2b).** Don't assume
   the owner's name spelling/branding at creation → born numeric (`account_number`, permanent). Ship a
   first-class **vanity-URL editor** inside the account (edit `url_segment` to name/company) with
   uniqueness + reserved-word denylist + format validation + old→new 301 grace redirect (§58) + the
   permanent number always still resolving, exposed as a §10-callable seam (Paige can rename it too).
   Part of the `account_number` implementation slice.
4. **Treat EVERY existing account as brand-new — uniform numbering, NO grandfathering of current vanity
   URLs (owner ruling 2026-08-17).** Owner: *"I really don't care who has a current vanity URL. I want
   us to just get our complete numbering system and taxonomy in place, and treat every single account on
   the platform as if they are a brand new account."* The R0 backfill assigns a fresh `account_number` to
   every account on the platform by the exact rule a new signup uses; no current name-based URL is
   preserved, special-cased, or migrated into the new tier-route segment. Anyone who wants a vanity URL
   sets one via the §2b/§7.3 editor AFTER the numbering system is live — the same path a new account
   would take. This removes any "grandfather the existing slugs" complexity from the migration entirely.

---

## 8. Verification (§32.c / §13)

- Every current route in the §30 inventory is accounted for in §4 (no orphans, no fabricated rows).
- Each migration slice names the tier + surface it affects and its backward-compat window.
- Every §-cross-ref in this doc resolves (§9, §18, §36, §51, §58, §60, §61, §65).
- **Owner reviews this doc + the migration order BEFORE any code-rename PR fires.** Execution slices
  are owner-gated.

---

## 9. Cross-references

§36 (intuitiveness moat — URLs are the entry) · §65 (naming-consistency rule — the anchor this doc
operationalizes) · §18 (one home per capability) · §60/§61 (same-tier parity + Enterprise
customization — the shared-shell basis) · §51/§56 (tier matrix — the pattern this mirrors;
`docs/doctrine/tier-matrix.md`) · §37 (producer inventory) · §58 (anti-regression — redirect-alive) ·
§9 (auth-gated routes — the account number is an address, not a grant) · §13 (honest reporting).

---

## 10. The branch-tree model — one canonical tree per account type, cloned per account (owner ruling 2026-08-17)

**Owner's framing (verbatim):** *"Each account type should have their own series of URL routing. Each
account almost becomes like a tree with a lot of different branches. We should be able to clone that
every single time somebody sets up… That way it'll make it a lot easier to find a specific branch to
fix, or to route data from."* And the deeper point: *"How are we routing data inside of a brain and
orchestrating an entire machine when we don't even have any actual branches of data?"*

The URL system is not navigation chrome — it is the **addressing backbone** the orchestration brain
(§7/§8/§16/§52) routes over. An address **is** a data route: `/agency/3855/clients` is a stable handle
Paige can route *to* and pull data *from*, not just "where the UI is." Without addressable branches,
"route data inside the brain" has nowhere concrete to point. Three governing principles:

1. **One canonical tree per account type.** Each tier (Agency · Sub-account · Solo · Operator · Client)
   has a **declarative branch registry** — its tab set defined ONCE (§18 one home), not hand-wired per
   account. `TIER_BRANCHES['agency']` is the template.
2. **Cloned per account at signup.** Every new account of a tier is instantiated as the SAME branch set,
   rooted at its own `account_number`. `/agency/3855/trust-compass` and `/agency/4012/trust-compass` are
   the *same branch* on two different account trees. A new agency signs up → the whole branch set exists
   for them day one, identical shape, their number at the root. ("Clone" = the same declarative tree
   rendered under each account's root — not copied data.)
3. **Every branch is an addressable seam (§10-governable).** Each branch resolves to a stable URL Paige
   can drive by voice/text, not only a human clicking. When the owner says "the growth branch on that
   sub-account," the address is `/business/{n}/growth` — the code, the data, and the §16 department that
   owns it are all pinned by that one handle.

---

## 11. The complete per-tier branch map (deep-linkable tabs)

Every tab is its own route segment under the account root. Internal component keys differ from URL slugs
(the slug is the human-readable address; the registry maps slug ↔ key ↔ component).

### 11a. Agency — `/agency/{account}/…` (15 branches; shell = `src/agency/AgencyApp.tsx`, mode="agency")
| URL slug | Tab label | key | component |
|---|---|---|---|
| `command-center` (default) | Command Center | `command` | `CommandCenter` |
| `paige` | Paige | `paige` | `PaigeHub` |
| `trust-compass` | Trust Compass | `compass` | `TrustCompass` |
| `automations` | Automations | `autos` | `AutomationsHub` |
| `clients` | Clients | `fleet` | `ClientsHub` |
| `calendar` | Calendar | `calendar` | `CalendarHub` |
| `client-support` | Client Support | `support` | `ClientSupport` |
| `growth` | Growth | `growth` | `GrowthHub` |
| `analytics` | Analytics | `analytics` | `Analytics2` |
| `billing` | Billing | `billing` | `Billing` |
| `marketplace` | Marketplace | `market` | `AgencyMarketplace` |
| `business-vault` | Business Vault | `vault` | `VaultHub` |
| `integrations` | Integrations | `integrations` | `IntegrationsHub` |
| `team` | Team | `team` | `TeamScreen` |
| `setup` | Setup | `setup` | `SetupScreen` |

`/agency/{account}` (no branch) → redirect to `/agency/{account}/command-center`.

**"Settings" (§13 honest):** the owner listed a 16th "Settings" tab; there is no separate Settings tab —
it is folded into **Setup** today. Decision for the build: keep one `setup` branch (recommended, matches
the shell), OR add a dedicated `/agency/{account}/settings` branch. Micro-decision, flagged for owner.

### 11b. Agency → sub-account context switch (owner req 2026-08-17)
The agency, while in agency mode, flips INTO a sub-account and views it **with the URL reflecting which
sub**, staying in agency chrome. Proposed address:
`/agency/{agencyAccount}/sub/{subAccount}/{branch}` — the acted-upon sub is a URL segment under the
agency root, so the agency operator's chrome + "return to agency" affordance persist and the view is
bookmarkable. This REPLACES the current in-memory `acting` fixture state (`AgencyApp.tsx:241`, fed by
`SUBS` fixtures) and must wire the **real** roster (`agency_list_my_subaccounts`) + the **real** act-as
RPC (`agency_enter_subaccount`) — both exist (`src/agency/data/useAgencyRoster.ts`) but are not wired to
the shell switcher today. §51: viewing a sub is a server-gated act-as, the URL segment is an address not
a grant.

### 11c. Sub-account — `/business/{account}/…` (same 15 branches; same `AgencyApp` shell, mode="subaccount")
Identical branch set to Agency (§60 Solo≡Sub-account except billing; the shell already renders both modes
from one codebase). A sub-account has **no** act-as switcher (§51 invariant — a child never manages).

### 11d. Solo — `/solo/{account}/…` (13 branches; shell = `src/solo/SoloApp.tsx`)
| URL slug | Tab label | key | component |
|---|---|---|---|
| `command-center` (default) | Command Center | `home` | `CommandHub` |
| `paige` | Paige | `paige` | `PaigeHub` |
| `trust-compass` | Trust Compass | `compass` | `TrustCompass` |
| `automations` | Automations | `auto` | `AutomationsHub` |
| `clients` | Clients | `clients` | `ClientsHub` |
| `calendar` | Calendar | `cal` | `CalendarHub` |
| `growth` | Growth | `growth` | `GrowthHub` |
| `analytics` | Analytics | `analytics` | `Analytics2` |
| `marketplace` | Marketplace | `market` | `Marketplace` |
| `business-vault` | Business Vault | `vault` | `VaultView` |
| `integrations` | Integrations | `integrations` | `Integrations` |
| `team` | Team | `team` | `TeamHub` |
| `setup` | Setup | `setup` | `Setup` |

**§13 honest gaps vs the agency set:** Solo has **no top-level Client Support, Billing, or Settings tab** —
Billing + Settings live inside the state-driven `Setup` surface's sub-tabs (`src/solo/setup.tsx`). Bringing
Solo to full parity (adding Client Support + surfacing Billing) is a §60 parity question flagged for the
Solo slice, not silently assumed.

### 11e. Operator — `/operator/…` (DEFERRED)
Mapped after the new Super-Admin design uploads (owner sequencing). Today the operator (God) console is the
real-route `/admin/platform/*` tree (fully deep-linkable already). The branch map is authored when the new
design lands.

### 11f. Client — `/portal/:tenantSlug` (UNCHANGED)
Clients keep the tenant slug they already use (owner ruling §2b). Not part of this migration.

---

## 12. Current-state audit findings (the §30 diagnostic, 2026-08-17)

The three-scout audit (agency shell · solo/tenant console · shared routing) established:

- **The new tier shells are state-driven, ZERO URLs.** `AgencyApp.tsx` (`route` useState `:232`, `go=setRoute`
  `:233`, `screens[route]` registry `:318`) and `SoloApp.tsx` (`route` useState `:103`, `screens[route]` `:120`)
  import nothing from react-router. Every tab shares one `/admin` URL; refresh resets to the default tab.
- **TWO agency surfaces exist.** The real `/agency` route today renders the OLD 4-tab `AgencyBoard`
  (`src/components/admin/AgencyLayout.tsx`, real nested routes); the owner's 15-tab shell (`AgencyApp`) renders
  as a takeover INSIDE `/admin` (`Admin.tsx:405-434`, gated on `agency_shell_enabled` + `resolveTierKey`).
  The migration unifies these: `/agency` reclaims to the NEW shell; the old board retires behind the redirect.
- **The legacy `/admin` console is already fully real-route** (`Admin.tsx:439-989` — `/admin/clients-hub`,
  `/admin/setup/billing`, `/admin/campaigns`, `/admin/platform/*`, …). This is the proven in-repo pattern the
  new shells convert TO (§18/§30 — reference the working part).
- **§37 producer blast-radius:** ~404 `/admin` refs, ~146 `/app`, ~29 `/agency` in `src/`. Two authoritative
  role→path tables — `src/lib/auth/resolveLandingRoute.ts` and `supabase/functions/accept-invite/index.ts`
  (`ROLE_DASHBOARD`). Nav authority hotspot: `AdminLayout.tsx` (120 refs). **Silent-break producers** (render
  outside frontend routing): edge-function deep links in emails (`notify-team-event`, `notify-approval-event`,
  `sla-watcher`, `security-canary-probe`, `bridge-auth-watcher`, `paige-mcp`), Stripe success/cancel URLs
  (`broker-workspace-checkout`, `create-trial-checkout`, `add-business-slot-checkout`, platform/marketplace
  checkout), and `zoom-oauth-callback:77` (`/admin/settings`). `hostRouting.ts` carries a reserved-subdomain
  set + `APP_PREFIXES` + literal `/admin` test assertions that a rename must update.
- **No tier-specific landing today:** `resolveLandingRoute` sends solo AND sub_account AND agency operators all
  to `/admin`; the shell they see is decided inside `Admin.tsx` by tier gates. Post-migration, landing resolves
  to the tier root + account (`/agency/{n}`, `/solo/{n}`, `/business/{n}`).

---

## 13. The migration engine — declarative branch registry + URL-driven shell

The reusable primitive both shells adopt (§18 one home), so we convert state→routes ONCE:

1. **`TIER_BRANCHES` registry** (`src/lib/routing/tierBranches.ts`, net-new) — the §10 template: per tier, an
   ordered list of `{ slug, key, label, icon, component, badge? }`. This is the single source both the nav rail
   and the router read. Adding a capability (§21) = add a branch row here, never a new tab strip.
2. **`<AccountShell>` wrapper** — reads `useParams()` `{account}` + `{branch}`; resolves the account_number →
   tenant and **verifies the session may access it (§9/§51 — the number is an address, RLS/act-as still gate)**;
   looks up the branch in the registry; renders its component. The nav rail emits `<Link to={/{root}/{account}/{slug}}>`;
   active state from `useLocation().pathname`. Default branch when `{branch}` absent.
3. **Shell refactor** — `AgencyApp`/`SoloApp` change from `const [route,setRoute]=useState('command')` to
   `const branch = useParams().branch ?? DEFAULT`; `go(k)` becomes `navigate(/{root}/{account}/{slug})`. The
   `screens[route]` registry is replaced by the shared registry lookup. Minimal surface change — the screens
   themselves are untouched (§28 approved designs preserved).
4. **Mount** — `App.tsx`: `<Route path="/agency/:account/:branch?/*" .../>`, `/business/:account/:branch?/*`,
   `/solo/:account/:branch?/*`. The `/admin` takeover in `Admin.tsx` is replaced by a **smart-redirect** to the
   session's tier root + account + default branch.

---

## 14. Revised phased plan (redirect-safe, §58; supersedes §6's R-slices where they conflict)

Each slice: §1 crew + §39 peer-gate + §32.c owner live-drive; old paths stay redirect-alive ≥1 release.

- **R0 — substrate (needs owner number-shape ruling).** `account_number` column + uniform backfill (§2b/§7.4) +
  the `TIER_BRANCHES` registry + `resolveAccountRoute(session)` helper. No visible change. **BLOCKED on the owner's
  number-shape choice** (offset/scrambled recommended vs sequential).
- **R1 — URL-driven shell engine.** Build `<AccountShell>`; refactor `AgencyApp` + `SoloApp` to read branch from
  URL (behind the EXISTING shell flags — no new exposure). Mount the `:account/:branch` routes. `/admin` + old
  `/agency` become smart-redirects. Keep every `/admin/*` deep-link (emails/Stripe/OAuth) redirecting to the new
  branch URL — the §12 producer list is the checklist.
- **R2 — Agency + sub-account LIVE.** Flip agency/sub to `/agency/{n}/…` + `/business/{n}/…`; wire the
  context-switch to `/agency/{n}/sub/{subN}/…` + the real `agency_enter_subaccount` act-as (replace the `SUBS`
  fixtures). Retire the old `AgencyBoard`. §32.c owner drive.
- **R3 — Solo LIVE.** Same for `/solo/{n}/…`; resolve the Solo parity gaps (§11d).
- **R4 — Operator + retire redirects.** After the new operator design; author `/operator/…`; then remove the
  `/admin`/`/agency` redirect shims once logs show zero old-path traffic + all external allowlists (§12) updated.

**Sequencing note (§13 honest):** the `{account}` segment depends on R0's `account_number`. The prefix rename
(`/admin`→`/agency`) COULD ship without the number first, but the owner's model roots every tree at the number, so
R0 leads. The one genuinely-owner decision blocking R0 is the number shape.
