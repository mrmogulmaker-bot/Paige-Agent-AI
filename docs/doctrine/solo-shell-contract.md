# The canonical Solo shell contract

This file owns shared routing, hosting, geometry, scrolling and responsive behavior. The canonical
human-job taxonomy, actual department/subtab map, surface cards and full-flow build method live in
[`docs/brain/solo-platform-taxonomy-and-ui-flow-standard.md`](../brain/solo-platform-taxonomy-and-ui-flow-standard.md).
Neither document creates an account-specific Solo fork.

**Owner-ruled 2026-09-02.** One canonical Solo shell serves every current and future Solo
tenant. This file is the single door to that contract. It does **not** restate the rules that
already have executable homes — it names them, so a future agent finds enforcement rather than
prose, and so nothing here can drift out of step with the code it describes.

## The rule

> A Solo tenant may differ in business identity and data, members, roles, permissions,
> entitlements, proven provider connections, and everything they own. Those differences arrive
> through tenant-safe, server-resolved data and authorization contracts. **They never produce a
> different application shell, layout, navigation system, responsive behaviour, page host, or
> PAIGE workspace.**

Classify before changing anything:

| Class | What it covers | Where the change goes |
|---|---|---|
| **1 — Shared Solo shell** | Routing, navigation, page host, shell geometry, responsive layout, Settings container, PAIGE rail/workspace, shared UI behaviour | The canonical owner, so every Solo tenant receives it |
| **2 — Tenant context** | Identity, plan, member permissions, capability truth, business data | Server-proven data and permission gates. Never a shell fork |
| **3 — Tenant-owned domain behaviour** | Setup, Team, Connections, Integrations, Clients, Campaigns, Pipeline, Billing, PAIGE behaviour | Inside its owning domain contract, canonical shell preserved |

**Never** branch on a tenant/account number, tenant name, fixture, demo state, or URL value to
alter shell or layout behaviour. **Never** patch only the account where a bug was observed when
the defect belongs to the shared shell.

## Where the shell actually is

| Thing | File | Note |
|---|---|---|
| The Solo shell | `src/solo/SoloApp.tsx` | The one route host and screen composition |
| The shared chrome | `src/components/tenant-shell/TenantCommandCenterShell.tsx` | PAIGE rail, brand home, contextual navigation |
| The one screen host | `<main data-solo-screen-host>` in `SoloApp.tsx` | Exactly one, and only `SoloApp` renders it |
| Route → label | `src/lib/routing/tierBranches.ts` | Solo `growth` is labelled **Campaigns** |

### Address is not authority

`account_number` is an **address**: the URL segment and the brand-home link. Authority is
`activeTenant` from `useTenantContext()`, and every read is gated server-side (§9). `SoloApp`
redirects a URL naming an account that is not the caller's own back to theirs — the URL is
never trusted, it is corrected. An `account_number` in a `navigate()` and one in a style
ternary read almost identically in a diff, and only the second forks the product.

## Interaction policy — enforced by CSS, not by the route list

The form-fitting rule is **not** the `full` const in `SoloApp.tsx`. Enforcement is the blanket
clip `.paige-solo main{overflow:hidden!important}` in `src/solo/solo-tokens.css`, plus exactly
one scoped exception that must carry **both** `[data-solo-screen-host]` and
`.tcs-main--settings-scrollbar-hidden`. Anything that re-opens the host without both qualifiers
un-clips Clients, Campaigns and Compass too — which is precisely how it broke once before.

| Surface | Policy |
|---|---|
| Settings, Connections, Integrations | Visible scrolling where needed |
| Command Center, Clients, Campaigns/Growth, Compass, Mind, Analytics | Form-fitting, design-locked. Owner authorization required to change |

## What already enforces this — do not build a second home

| Rule | Enforced by |
|---|---|
| Locked surfaces stay form-fitting; the Settings exception cannot widen | `src/solo/settings.scroll-policy.test.tsx` |
| One shell, one screen host, no tenant identity in layout | `src/solo/soloShell.contract.test.tsx` |
| Shell owns one PAIGE surface, brand home, Settings focus restore | `src/components/tenant-shell/TenantCommandCenterShell.ownership.test.tsx` |
| Rendered geometry on locked surfaces, four viewports | `scripts/live-drive/solo-locked-surfaces-drive.mjs` |
| Settings reachability and scroll behaviour | `scripts/live-drive/settings-scroll-drive.mjs` |
| Settings release discipline and proof ladder | `docs/brain/solo-settings-scroll-and-release-playbook.md` |
| Route naming and per-tier URL shape | `docs/doctrine/route-and-url-taxonomy.md` |

## Proof required for any Solo UI repair or feature

Test the affected Solo tenant **and at least one known-good, different Solo tenant**, at
1536×770, 1366×768, 1024×768 and 900×1000, with PAIGE both closed and open. Verify real
rendered width, overflow, reachability, keyboard/wheel behaviour where scrolling is allowed,
and that no tenant-specific shell path remains.

Separate the evidence classes every time — automated test · static/build · structural or
harness render · authenticated runtime on the real platform · `UNVERIFIED` with its reason. A
harness drive against a reproduced shell is the third class and is never the fourth.

## Known coverage gaps (§13 — stated, not papered over)

- `solo-locked-surfaces-drive.mjs` drives `clients`, `growth` and `compass`. **Command Center
  (`home`), Analytics and Mind are named by the policy but are not in that drive's surface
  list.** Their form-fitting behaviour rests on the CSS clip and its source-contract test, not
  on a rendered-geometry drive.
- The actual `SoloApp` wrapper, Shift+Space and independent per-surface Home-key pathways
  remain unproven — see the Settings playbook's proof-ladder section.
- No authenticated production drive of any Solo surface has been run from this environment.

## How a future agent encounters this

`docs/brain/README.md` indexes it, so the mandatory second-brain read reaches it. The Settings
playbook links here for shell-wide questions. `soloShell.contract.test.tsx` names this file in
its header, so anyone who breaks the guard is pointed at the contract they broke.
