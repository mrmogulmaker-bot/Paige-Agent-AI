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

Owner ruling 2026-08-17: **every tenant-tier account gets a unique numeric account number in
its URL** — `/business/3855`, `/solo/1234`, `/agency/42`, `/enterprise/7`. The account's *name*
stays **out** of the URL (it lives in chrome/branding).

- **Net-new.** Today a tenant has `slug` (name-based) + `account_number_prefix` (initials only,
  e.g. `ADL`/`MMM` — a code, but name-derived and not a stable unique number). The taxonomy
  adds a stable, unique **`account_number`** per tenant, assigned at creation.
- **Address, not an access grant (§9).** The route stays auth-gated (session + RLS via
  `current_user_tenant_id()` / the §51 firewall). A guessed number never exposes another
  account's data — it only fails the auth/scope check. The number is for *addressing +
  tracking*, not authorization.
- **Number shape — OPEN SUB-CHOICE for owner (default = recommended):**
  - **(recommended) offset/scrambled numeric** — short number feel (e.g. `3855`), but not a raw
    `1,2,3…` sequence, so the URL space doesn't broadcast the exact account count.
  - pure sequential `3855, 3856…` — simplest, but enumerable/count-leaking.
  Either is a *number*, per owner intent; pick before the implementation slice.
- **Scope:** applies to the four tenant tiers (agency / enterprise / solo / business).
  `/operator` is singular (us) — no number. `/portal/:tenantSlug` (clients) keeps the tenant
  slug it already uses (unchanged per ruling).

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
Add the `account_number` column (unique, assigned at creation; number-shape per §2b owner
choice) + backfill existing tenants. Add a tier-resolving redirect helper (reuse
`resolveLandingRoute`) that maps a session → its canonical home. No user-visible route change yet;
this unblocks every later slice.

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
