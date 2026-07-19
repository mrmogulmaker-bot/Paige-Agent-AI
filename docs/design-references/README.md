# Design References — the source of visual truth

**Owner: Antonio · 2026-07-18 · binds every Paige UI surface (see CLAUDE.md §25).**

This library is where we keep the **taste knowledge** that no lint rule can encode: what makes a
best-in-class UI read as expensive, deliberate, and alive — and how that maps onto *our* system
(the primitive layer `@/components/ui/page`, gold-on-the-act, the indigo ground, tokens only). It is
the reference the **design critic** (§25) compares against during design and during critique, and the
counterweight to the enumerated anti-patterns in [`CHEESY-TELLS.md`](./CHEESY-TELLS.md). The positive
craft layer — the modern CSS techniques that make a surface read as expensive, and how to reach for them
inside our token system — lives in [`CSS-EFFECTS.md`](./CSS-EFFECTS.md). Gold discipline is a hard gate:
its rule is in [`DESIGN-CRITIC-PROMPT.md`](./DESIGN-CRITIC-PROMPT.md) and its automated linter is
`scripts/gold-discipline-lint.mjs` (`npm run lint:gold` / `lint:gold:test`).

It is **platform-wide.** Landing, sign-up, admin, tenant onboarding, Studio, marketplace, growth hub,
Super Admin, tenant portal — every Paige surface is held to this bar, not just the Vibe Studio.

---

## How the library is used

### During design (before you build)
1. Pick the reference apps closest to the surface you're building (a table-heavy admin view → Linear
   / Stripe Dashboard; a first-run/empty state → Vercel / Linear; a marketing/landing surface →
   Framer / Stripe marketing; a dense command surface → Superhuman / Linear; a CRM/record surface →
   Attio; a data-grid → Retool).
2. Read that app's annotation `README.md` in its folder here. It tells you *what specifically* makes
   the reference good — hierarchy, spacing rhythm, how it spends its single accent, how it handles
   empty/loading, the typographic scale.
3. Build to it **on top of our primitives** (§11/§12) — never fork a one-off. Our gold is the accent
   Linear spends on blue and Stripe spends on purple; our indigo is the calm ground. Translate the
   *principle*, not the literal color.

### During critique (before you ship)
1. The design critic (see [`DESIGN-CRITIC-PROMPT.md`](./DESIGN-CRITIC-PROMPT.md)) renders the surface
   where the **Chrome MCP** (`mcp__claude-in-chrome__*`) is available, captures a screenshot, and holds
   it frame-to-frame against the relevant reference(s).
2. Where Chrome MCP is **not** available (this is common — our app is auth-gated and many environments
   are headless), the critic degrades honestly to a **code-level taste review**: it reads the JSX/CSS
   /tokens against `CHEESY-TELLS.md` and the primitive layer and judges taste from the source. This is
   a real pass, but it is a fallback — the doc/critique must never claim a screenshot was captured when
   it wasn't (§13 honesty). Public/marketing surfaces are renderable and should get the full loop in an
   interactive Chrome-MCP session.
3. The critic returns a **SHIP / ITERATE / BLOCK** verdict with references-compared, blockers,
   should-fix, nits, and the cheesy-tell hits by name. It never rubber-stamps.

### The one test
> *"Would a screenshot of this surface stand next to Linear, Stripe, and Vercel without embarrassment?"*

If you can't answer because you never rendered it (and Chrome MCP was available), you're not done. If
it would look flat, generic, or cheesy beside them, it isn't done either.

---

## The reference app list

Each app has a folder here with an annotation `README.md` (the durable taste knowledge) and a
`SCREENSHOTS.md` stub naming the exact public URLs to capture via Chrome MCP in an interactive session.
**We do not commit fabricated screenshots** — the annotations are the deliverable; the pixels are
captured live where the tooling exists.

This table matches the folders in `gallery/` exactly — every row has an annotation folder and vice
versa (§12: no phantom references, no unlisted folders).

| App (`gallery/` folder) | Why it's a reference | Closest Paige surfaces |
|-----|----------------------|------------------------|
| **Linear** (`linear`) | Hierarchy from type weight + spacing, not chrome; one accent; keyboard-grade density; empty states that guide. | Admin lists, tables, the daily brief, growth hub, any dense working surface. |
| **Stripe** (`stripe-dashboard`) | Restraint + trust; a single spent accent; immaculate spacing rhythm; data-dense without noise; marketing → dashboard continuity. | Dashboards, billing/§17 money tables, KPI/stat surfaces, marketing → app hand-off (§6). |
| **Vercel** (`vercel-dashboard`) | Depth from elevation + hairline borders (never gray fills); crafted empty/first-run states; monochrome ground + one accent. | First-run/onboarding, empty states, Super Admin fleet, the Studio project grid. |
| **Attio** (`attio`) | CRM done beautifully — right-side record panel + configurable typed-object tables. **The most directly relevant reference** for Paige's §7 client portal. | Client portal, contact/record detail, CRM-adjacent tenant surfaces. |
| **Superhuman** (`superhuman`) | Keyboard-first, instant, tactile; every pixel deliberate; speed as a feeling. | Chat/command surfaces, Paige's one-chat governance surface (§10), pickers/palettes. |
| **Notion** (`notion`) | Restrained monochrome canvas + one warm accent; block-as-primitive (reinforces §21). | Document/editor surfaces, the Studio session canvas, content-authoring. |
| **Framer** (`framer-marketing`) | Motion that earns its pixels; alive-but-not-busy; display type as hero; earned heroes (proves the §11 banner rule). | Landing/marketing, the Studio build cutscene + hero (§22), first-run heroes. |
| **Cal.com** (`cal-com`) | Three-zone booking card, tabular time figures, progressive disclosure. | Scheduling/booking, calendar surfaces, any step-wise flow. |
| **Retool** (`retool`) | Dense data-grids that don't read as admin CRUD — tabular nums, rationed status-pill color, master-detail side-sheet. | Data-heavy tables (§16 department surfaces), our StatePill + Toolbar/FilterChip patterns. |

> Add a reference to this table **and** give it a folder only when it earns its place (below).

---

## When to add a reference (§12: earn its place)

A reference library rots the moment it becomes a screenshot dump. Add a new reference app **only** when:

- It demonstrates a taste principle **not already covered** by an app in the list (redundancy is the
  §18 failure — don't add a fourth "clean dashboard" when Linear/Stripe/Vercel already carry it).
- You can write **specific, transferable annotations** — *what* it does and *how it maps onto our
  system* — not "it looks nice." A reference with no annotation is noise.
- It's a surface we actually build toward. We are a coaching/consulting/agency platform (§2); a
  reference from an unrelated product only earns a seat if the *principle* transfers cleanly.

When you add one: create `docs/design-references/<app>/README.md` (annotations) + `SCREENSHOTS.md`
(URLs to capture), add the row to the table above, and name the Paige surfaces it serves. Keep it
curated — prune references that stop teaching us anything.

---

## Honesty note on the rendered loop (§13)

The full screenshot-capture-and-compare loop runs **where the Chrome MCP is available**. In headless
or auth-gated environments it does not, and the critic runs the **code-level taste review** instead.
Neither this README nor any critique output may present a code-level pass as if pixels were seen, or
commit a fabricated screenshot as if it were captured. Say which mode ran, every time.
