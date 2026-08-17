# Agency Shell — "Match Accounts" DATA-SOURCE MAP

Research pass (§1/§18) for wiring `src/agency/*` from fixtures → REAL tenant data, mirroring the
proven `src/solo/data/` adapter pattern. Produced 2026-08-17. This is the build plan for the
"match accounts" phase of the owner's install → match → audit sequence.

## The scope spine (read before any adapter) — §51-safe, session-derived ONLY

Three primitives are the ONLY scope source; no adapter takes a client-supplied `tenant_id`:
- **`useTenantContext()`** — `activeTenant` (`account_type`, `parent_tenant_id`, `features`),
  `activeTenantId`, and the wired **`agencyShellEnabled`** flag (§51-safe, own-tenant `features` read).
- **`resolveTierKey()`** (`src/lib/tier/tierFeatures.ts:107`) — parent-first lock: a parented tenant
  is `sub_account`, NEVER a manager tier. Tells each adapter which `mode` it is in.
- **The parentage-gated agency RPCs** — `agency_list_my_subaccounts`, `agency_portfolio_metrics`,
  `agency_list_team`: **`Args: never`** (no caller can inject a target tenant) and **RAISE 42501 for
  a non-agency caller**. That RAISE is the structural #86-leak firewall. **Adapters branch on `mode`
  and NEVER call these in `subaccount` mode** (belt-and-suspenders over the server RAISE).

Rule for EVERY adapter: **agency mode** = own book ∪ children (parentage RPC); **sub-account mode** =
own tenant only (RLS `current_user_tenant_id()` reads — the Solo pattern).

## Adapters (build order = screen fan-out)

| # | Adapter (`src/agency/data/`) | Screens | Real source(s) | Status |
|---|---|---|---|---|
| 1 | **useAgencyRoster** ★first | ~12 | `agency_list_my_subaccounts` + `agency_portfolio_metrics().leaderboard[]` (health/mrr) | REAL; `drafts`/`note`/`tenure` → Preview |
| 2 | **useAgencyMetrics** + operator identity | ~8 | `agency_portfolio_metrics` (subCount/portfolio_mrr), `agency_subaccount_metrics` (drill-in), `activeTenant`, `agency_my_membership` | REAL; NRR/billed-MTD/hoursSaved/utilization → Preview |
| 3 | **useAgencyCommandCenter** (clone of Solo `useCommandCenter`) | Home | `usePendingApprovals({scope:"all"})`, `usePracticeDashboard`, `usePaigeDeptStatus`, `execute-approval` | REAL; pipeline/cross-book Team-Pulse → Preview |
| 4 | **useAgencyPeople** | ~5 | `agency_list_team` + `agency_set_member_role/status/remove` + `useTeamRoster` + `activeTenant.seat_limit` | REAL; utilization/hours/workload → Preview |
| 5 | **useAgencyMarketplace** | 1 | `agency_curation_catalog(_for_subaccount)`, `agency_marketplace_subaccounts`, `set_agency_item_allowlist` | REAL; install counts/earnings/markup → Preview; §38 no money-move |
| 6 | **useAgencyBilling** | 1 | `platform_subscription_plans`, `tenant_service_subscriptions`+`tenant_products`+`tenant_prices` | REAL read, DISPLAY-ONLY; cross-book revenue roll-up → Preview |
| 7 | **useAgencyContacts** | setup/clients | `clients` (RLS own-book), `profiles` (Solo `useSoloOwner` seam) | REAL own-book; some setup fields (signature/banking) → Preview |
| 8 | **useAgencyCompass** (partial) | compass | `usePaigeDeptStatus` + `autonomy_lane`/`paige_action_kinds` (read-only dept OPEN counts) | mostly PREVIEW; cross-tenant sub autonomy read has NO RPC → honest-empty (leak surface) |

## HONEST-PREVIEW cluster — NO backend today; keep the flag, DO NOT fabricate (§13/§32)

Cross-book aggregates with no parentage-gated RPC. Wiring these against the RLS own-book tables
(`clients`/`deals`/`tenant_service_subscriptions`) would be the **#86 leak** — keep Preview:
- Clients › **Pipelines** (`pipesFlag`), **Conversations** console (`convosFlag`/`caFlag`/`csFlag`),
  **Growth** (`gFlag`; also §60 excludes agency tier from `growth`/`studio` entirely),
  **Automations** (`auBanner`), **Calendar** (`calBanner`), **Vault** (`bvBanner`),
  **Analytics** cross-book (`anFlag`), **Paige › Sub-Agents/Skills/Chat-scope**
  (`agentsFlag`/`actsFlag`/`chatFlag`), **Support** cross-book aggregate, **Integrations** per-sub.
- `paige_actions` (Paige › Actions) CAN wire to own-book via the Solo `useSoloActions` seam
  (RLS-scoped); the cross-book action feed stays Preview.

## Two cross-cutting cautions for the build crew

1. **The parentage RPCs are the §51 firewall — never wrap them in a client-scope param.** They take
   `Args: never` on purpose. Sub-account mode gates them OFF at the adapter (they RAISE anyway).
2. **`clients`/`deals`/`tenant_service_subscriptions` are RLS own-book by design** — that is WHY every
   cross-book aggregate is Preview, not a wiring gap. A cross-book read on those = the #86 leak. Those
   aggregates need a NEW parentage-gated RPC (out of scope for this port; keep Preview per §13, do not
   propose schema changes).

## Slice sequence

- **Slice A** (first): adapters 1–3 (roster, metrics, command-center) + wire `CommandCenter.tsx`.
- **Slice B**: adapter 4 (people) + wire `team.tsx` + team surfaces.
- **Slice C**: adapters 5–7 (marketplace, billing, contacts) + wire those screens.
- **Slice D**: adapter 8 (compass, mostly Preview) + confirm the whole Preview cluster renders honest
  banners (no fabrication).
- Every slice: §51/§9 adversarial producer-inventory verify; sub-account mode proven to never reach a
  parent aggregate; honest Preview where flagged.
