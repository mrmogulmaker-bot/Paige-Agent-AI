# Analytics & Operating Intelligence lane — register

The durable record for this lane: what was found, what is in scope, what is parked, and what is
blocked. Opened at the close of Phase 0 (2026-09-23), at `origin/main` `7ebdd9fe`, `db-live`
`186a978f`, `edge-live` `7ebdd9fe` — zero drift on both tags.

**Scope ruling (coordinator, 2026-09-23): Solo shell only.** The owner is building the Solo
account. Agency, sub-account and platform-operator analytics are later work.

Every entry states only what was actually observed, and says which kind of observation it was.
This session has **no database access**, so no entry claims a fact about production data unless
it names when that measurement was taken and that it is unconfirmed now.

---

## A. IN SCOPE — Solo

| # | Finding | State |
|---|---|---|
| 2a | Five of six Solo lenses never issue a request | **Open — the direct cause of the blank screens** |
| 3 | `lint:tier-features` cannot see camelCase gates | Open |
| 4 | The browser analytics lane very likely never worked | Open |
| 5 | `paige_referral_code` is read but never written | Open |
| 6 | `analytics_events` has no `tenant_id` | Open — constrains every Phase 1 definition |
| 7 | The browser-direct growth-form write is a third, unpriced capture path | Open |
| 8 | No metric dictionary exists anywhere in the repo | Open — Phase 1 is net-new |
| 9 | Matviews stale since 2026-04-22, summing a client-supplied value | Open — re-measure when DB access lands |
| 10 | The evidence-bundle template exists in the right shape and the wrong home | Open — sets the shape of Phase 1 |

### A-2a — Only the `money` lens ever issues a request *(the owner's blank screens)*

`src/solo/analytics2.tsx:271` — `enabled: accountResolved && lens.route === "money"`.

The six lens route keys are `brief`, `money`, `profit`, `ret`, `mkt`, `dec`
(`analytics2.tsx:32,40,48,56,64,72`). Five of them are inert by construction: they do not fetch,
so they cannot render a number, so the tab reads empty. This is not a data problem and not a
rendering problem — those five lenses never ask.

### A-10 — The Phase 1 template, and why it is not a metric warehouse yet

`supabase/migrations/20261004000000_analytics_evidence_bundle.sql` already produces the exact
payload a metric dictionary needs — definition, formula, version, coverage, exclusions, source
references, truth state — for one metric, `analytics_sales_funnel_evidence_bundle`. The formula
lives inside a plpgsql body pinned by a single-value `CHECK`, so a second metric means editing a
function rather than inserting a row. The file's own header says it is not a metric warehouse. It
is right. Phase 1 lifts that payload into a real definition table and makes the existing bundle
its first row — it does **not** build a second evidence contract beside it.

---

## B. PARKED — not dismissed, not started, and not to be rediscovered

> **Parked by coordinator ruling, 2026-09-23.** These are out of scope while the lane is Solo-only.
> Evidence is preserved verbatim so that whoever picks up agency and sub-account work does not have
> to find any of it again. **Nothing here was changed, branched, or absorbed into any diff.**

### P-1 — The agency / sub-account Analytics surface renders fabricated figures

**Owner ruling on the content:** known placeholder content from when that surface was designed —
fill-in data, not a claim anyone believed. It stays as-is and is revisited when agency and
sub-account work begins.

**The component.** `src/agency/analytics.tsx` (908 lines) makes **zero** database calls:

```
grep -cE "supabase|useQuery|\.rpc\(|from\(" src/agency/analytics.tsx  →  0
```

Everything it shows comes from `anVals()` (`analytics.tsx:462`), a pure function over hardcoded
constants:

- `analytics.tsx:44-45` — invented client businesses with invented owners and MRR:
  `Northwind Dental Group / Priya Raman / 2100`, `Coach James Fitness / James Alarie / 6200`
- `analytics.tsx:76` — `kpi("MRR from sub-accounts", money(44430), "+7.5%")`,
  `"Sub-accounts active", "12"`, `"Team utilization", "87%"`
- `analytics.tsx:150` — `kpi("ARR", money(533160), "+34% YTD")`,
  `"Monthly expenses", money(29800)`, `"Net margin", "33%"`
- `analytics.tsx:108,141` — "Trending up / Trending down" tables of the same fictional names
- `analytics.tsx:74` — Paige narrates it in the first person: *"Today: MRR from sub-accounts sits
  at $44,430, $1,120 of movement since yesterday. One renewal draft is waiting on you…"*

**It carries a stand-in disclosure, and the disclosure is real.** `analytics.tsx:568` sets
`anFlag` in the shared return of `anVals()`, so it renders on **every tab in both modes**:

> *"Cross-book aggregation, cost-to-serve, at-risk classification and market signals have no
> confirmed backend route yet — figures here are stand-ins, not platform figures."*

Rendered at `analytics.tsx:812` as a `title=` attribute on a 26×26px gold `!` badge. So it is
hover-only, has no touch equivalent, and `title` is announced inconsistently by screen readers.
The Read banner where Paige speaks the numbers carries no disclosure of its own.

**Reachability — verified in code, not assumed.** Two live tiers route to this component:

1. `/agency/{n}/analytics` — `src/agency/AgencyEntry.tsx:44-96` resolves authority server-side via
   `supabase.rpc("agency_switch_context")` and mounts `AgencyApp mode="agency"` only after refusing
   every caller for whom `context?.is_agency_manager !== true` (`src/agency/AgencyEntry.tsx:88-96`). `src/agency/AgencyApp.tsx:697` renders
   `<Analytics2 …>` for the `analytics` branch.
2. `/business/{n}/analytics` — `src/business/BusinessEntry.tsx:86-90` mounts the same
   `AgencyApp mode="subaccount"`, which renders the same `Analytics2` at `AgencyApp.tsx:697`.

**In sub-account mode the scope is pinned to the agency dataset.** `analytics.tsx:464`:

```js
const scope = crossBook ? (st.anScope || "agency") : "agency";
```

`crossBook` is `isAgency && !acting` (`analytics.tsx:774`), so for a sub-account it is `false` and
`scope` is hard-pinned to `"agency"`. A sub-account is therefore shown the **agency-scope**
content — *"MRR from sub-accounts sits at $44,430"*, *"Sub-accounts active: 12"* — figures about
sub-accounts that a sub-account does not have. `crossBook` only removes the scope switcher and the
sub-picker; it does not substitute a single-book dataset.

**Whether live accounts of those tiers exist is a DB question this session cannot answer.** What
can be said from the repo: root `CLAUDE.md` §63 names, as the owner's real production accounts,
Project Mogul (agency) and Mogul Maker Academy and Antonio Daniel LLC (sub-accounts). That is an
owner statement recorded in doctrine, not a row this session read. The **route** is open to both
tiers; the **account rows** are unverified here.

### P-2 — The `accountType === "standalone"` gate blocks sub-accounts

`src/solo/analytics2.tsx:266`

```ts
const accountResolved = account.accountName !== "Your workspace" && account.accountType === "standalone";
```

and `:360` returns the `anr-account-blocked` state when it is false.

The account type it tests is itself overridden upstream:
`src/components/tenant-shell/tenantShellRoutes.ts:85-98` forces `? "sub_account"` for
any tenant with a `parentTenantId`, regardless of its stored type — so a sub-account can never
satisfy the gate. The **server has no equivalent restriction**: the evidence RPC is tenant-scoped,
not account-type scoped. Parked with the rest of the sub-account work.

Related and **in scope**: the same line's `lens.route === "money"` clause (A-2a above), and the
fact that this gate is an inline `accountType ===` compare rather than `hasFeature()` (§60), which
`lint:tier-features` cannot see (A-3).

---

## B2. FOUND WHILE EXECUTING D-8 — needs a ruling, not a phase

### F-1 — The same two false labels still ship on the LIVE agency Command Center

`src/agency/data/useAgencyMetrics.ts:139,141` emits `"Revenue this period"` and `"Active clients"`
from the same `practice_dashboard_metrics` own-book values that the Solo adapter was just corrected
for. It is live code, not dead code, and not a test.

**This is a genuine tension between two standing instructions, which is why it is recorded rather
than taken.** The agency tier is explicitly parked (§B). But the D-8 ruling says a false assertion
does not wait for a phase, and §13 does not carve out a tier. The fix is the identical two string
swaps already approved for Solo. Left untouched pending a coordinator ruling; the Solo surface and
the agency surface now disagree about the same numbers, which is itself a state worth ending quickly
either way.

### F-2 — `src/pages/admin/PracticeOverview.tsx` is unreachable

Zero importers; a repo-wide search finds only prose mentions in comments, and
`docs/delivery/solo-completion-matrix.json` classifies it `orphaned_dead_code` — "the unrouted
PracticeOverview page". It carries `label="Active clients"` (`:117`) and `label="Revenue this
period"` (`:129`), and carried the ARPC hint removed under D-8.

Recorded so nobody rediscovers it and mistakes it for a live defect — **as this lane did.** The
Phase 1 proposal named ARPC as a live defect on the strength of finding its render call, without
checking whether anything routes to it. Corrected in the proposal's §2.

---

### F-3 — This lane recorded "no browser" as the reason for eight owed proofs. That was wrong.

**Correcting my own claim (§13), not reporting someone else's defect.** The D-8 evidence record
(`docs/evidence/ui-delivery/solo-stop-false-figures-d8.md`) stated eight Solo viewport records and
the whole rendered/interactive/keyboard/zoom class were UNVERIFIED because "this session has no
browser-driving capability (no Playwright, Chrome MCP or in-app browser)". Probed rather than
assumed on 2026-09-24, that is false. The record is corrected in place; the owed set is unchanged.

What is actually true, in order:

1. **Browser capability: PRESENT.** `chromium.launch()` returns OK. `node_modules/playwright` is
   installed and `/opt/pw-browsers` carries chromium-1194. The repo's pinned Playwright expects
   build 1234, so an `executablePath` override is required — `scripts/live-drive/live-drive.mjs`
   `resolveExecutablePath()` already supplies exactly that, and resolves correctly here
   (`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` exists).
2. **Prod reachable by a system-CA-trusting client: YES.** `curl https://paigeagent.ai` → `200`.
3. **Chromium → prod: FAILS `ERR_CERT_AUTHORITY_INVALID`.** The agent proxy CA is in the system
   store (proxy status: `hasSystemCa: true`, `bundleCoversEveryHost: true`) but not in the browser
   NSS store — `~/.pki/nssdb` held no CA and was created empty by Chromium on first launch; no
   `certutil` is installed. **TLS verification was not disabled to work around this**, so this
   remains unresolved rather than bypassed.
4. **Credentials: UNSET.** `LIVE_DRIVE_EMAIL` and `LIVE_DRIVE_PASSWORD` are both absent. This is
   the **binding** blocker: all eight owed records sit on auth-gated Solo routes, so fixing (3)
   alone would still drive nothing. No credential was invented, and none may be.

**Why this matters beyond accuracy:** "no browser" reads as *needs a different class of session*.
The real remedy is **two environment variables** — a scoped test-tenant account, never owner PII —
plus the browser-trust fix in (3). That is a request the coordinator or owner can actually grant,
and it would let a session like this one discharge the whole owed set itself, which is what §32
asks for.

### F-4 — PARKED, not mine to fix: the live-drive README's reachability claim is stale here

`scripts/live-drive/README.md:65-71` carries a standing claim that live prod was **not** reachable
headless from this sandbox "even through the agent proxy (the proxy forwards tool/MCP hosts, not
arbitrary web egress)". In this session that is not the case: proxy status reports
`selective: false`, `toolScoped: false`, `bundleCoversEveryHost: true`, and curl to
`https://paigeagent.ai` returns `200`. The claim was honest when written and is environment-
dependent by its own admission — but left as-is it will keep telling capable sessions not to try.

**Not fixed here.** It is another lane's file and outside this lane's scope under the park-and-route
rule; the fix is also a judgement about that lane's standing guidance, not a defect in my own new
code. Recorded so the next session that hits it does not re-derive the same probe.

## C. BLOCKED — and who owes it

1. **Read-only database access.** Supabase MCP returns permission denied on `list_edge_functions`
   and `execute_sql`. Unverifiable from this session: row counts, recency, `has_table_privilege`,
   the deployed `verify_jwt` posture of `track-event`, and whether the data that exists is
   trustworthy. Two numbers in this register were measured earlier, when access existed, and are
   **not confirmed current**: 19 rows in `analytics_events` (2026-08-23) and the single matview
   refresh (2026-04-22). *Owner's to resolve.*
2. **Capability-kit admission.** `defineCapability()` has zero production call sites; admitting a
   new governed READ would mean growing `scripts/ci/capability-kit-bypass-baseline.json`.
   Coordinator ruling: the baseline stays shrink-only; the machinery belongs to the Platform Reach
   Lane. Phases 0–3 do not depend on it. **Phase 4 does.** *Platform Reach Lane's to resolve.*

3. **Live-drive credentials for the auth-gated Solo routes.** `LIVE_DRIVE_EMAIL` and
   `LIVE_DRIVE_PASSWORD` are unset, which is the binding blocker on all eight owed Solo viewport
   records and the whole rendered/interactive/keyboard/zoom class (F-3). The browser itself is
   present and prod answers; only the credentials and the browser-trust fix are missing. Needs a
   **scoped test-tenant account — never owner PII, never a pasted value in any artifact, ticket,
   log or PR** — supplied as server-side environment variables. *Owner's to resolve; it would let
   this lane discharge its own §32 proof instead of owing it onward.*

## D. STANDING REQUIREMENT

**A newly created Solo account must have working analytics from the moment it is populated** —
no manual setup, no configuration step, nothing that only starts working after someone seeds it.
Owner requirement, 2026-09-23. Everything designed in Phase 1 and built in Phase 2 has to be true
for an account created five minutes ago, by design rather than by retrofit.
