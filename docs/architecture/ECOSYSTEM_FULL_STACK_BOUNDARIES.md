# Ecosystem Full-Stack Boundaries

**Governing doctrine:** §199 — Ecosystem Boundaries + Data Sovereignty (full-stack)
**Companion:** [`ECOSYSTEM_DATA_OWNERSHIP_MAP.md`](./ECOSYSTEM_DATA_OWNERSHIP_MAP.md) (data-layer)
**Status:** Ratified 2026-07-02 · **Owner:** Antonio Cook

§199 applies at **every layer of the stack**, not just data. This document is the layer-by-layer rulebook. Every PR — migration, edge function, MCP tool, route, component, nav change — must satisfy the rules for its layer before landing.

---

## 1. Database

**Rule:** Tables are named by owning ecosystem. Paige-owned tables use `paige_*` **or** unprefixed platform-primitive names (`contacts`, `deals`, `tenants`, `tenant_*`, `platform_*`, `consumer_*`). MMA/LaunchPad/MCC-owned tables must use their ecosystem prefix (`mma_*`, `launchpad_*`, `mcc_*`) — and generally should not exist in Paige's DB at all; they belong in the owning ecosystem's DB.

**RLS:** Enforces both tenant-scope **and** ecosystem-scope. A `mma_*` table (if it ever existed in Paige for cache reasons) would be readable only via bridge functions, never directly by tenant users.

**Anti-patterns:**
- Unprefixed tables holding MMA operational data (e.g. `subscription_plans`, `user_subscriptions` — Ship #2.6 remediation).
- Foreign keys crossing ecosystem boundaries. Use a bridge event log instead.

---

## 2. Edge Functions

**Rule:** Function directory name declares the owning ecosystem.

| Prefix | Meaning | Examples |
|---|---|---|
| `paige-*` | Paige platform-owned | `paige-mcp`, `paige-orchestrator`, `paige-readiness-scan` |
| `mma-*` | MMA-owned (should not exist in Paige repo) | — |
| `launchpad-*` | LaunchPad-owned (future) | — |
| `<ecosystem>-<ecosystem>-bridge` | Explicit cross-ecosystem bridge | `paige-mma-bridge`, `launchpad-mma-bridge` |
| `ship-*` | One-shot ops (deprecations, backfills) | `ship-26-legacy-cleanup` |
| `admin-*`, `send-*`, `google-*`, etc. | Platform infrastructure (Paige-owned by default) | |

**Bridge functions are the ONLY sanctioned cross-ecosystem call site.** They:
- Live at `supabase/functions/<a>-<b>-bridge/`
- Sit behind explicit auth (super-admin or service-token)
- Log every call to `paige_audit_log` with the ecosystems involved
- Never widen their scope beyond the documented integration pattern (webhook / pull / sync / federation)

**Anti-patterns:**
- A `paige-*` function reaching into MMA's Skool or GHL API directly. Route through `paige-mma-bridge`.
- Hardcoded MMA tenant IDs, Skool webhook URLs, or `mrmogulmaker@gmail.com` inside `paige-*` functions.

---

## 3. MCP Tools

**Rule:** Tools registered in `paige-mcp` are grouped by ecosystem in the registry. Tool names use dotted namespacing:

| Namespace | Owner | Notes |
|---|---|---|
| `paige.*` | Paige platform | `paige.contacts.create`, `paige.deals.update` |
| `tenant.*` | Tenant-scoped operations | `tenant.knowledge.search`, `tenant.members.invite` |
| `self.*` | End-user self-service | End-customer MCP tier |
| `admin.*` | Platform super-admin only | `admin.tenants.suspend` |
| `mma.*` | MMA-specific (via bridge) | Only exists if an MMA-bridge tool is registered |
| `bridge.*` | Explicit cross-ecosystem operations | `bridge.mma.sync_tier`, `bridge.mma.pull_community_status` |

**Every tool declares:** owning ecosystem, required role, and whether it reads/writes across the boundary.

**Anti-patterns:**
- A `paige.*` tool that queries MMA-authoritative data. Register it as `bridge.mma.*` instead.
- Tools without namespace prefixes.

---

## 4. Frontend Routes

**Rule:** URL structure reflects ecosystem context.

```
/                           # Paige marketing site
/auth                       # Paige platform auth
/app/*                      # Tenant end-customer workspace (client side)
/admin/*                    # Paige tenant-admin surfaces (per-tenant admin)
/admin/paige/*              # Paige platform super-admin surfaces
/admin/paige/tenants        # Tenant management
/admin/paige/billing        # L1 platform billing
/broker/*                   # Broker workspace
/workspace/*                # Tenant-white-labeled client workspace
```

**Reserved for future ecosystems (not in use today):**
```
/admin/launchpad/*          # If LaunchPad ever runs on Paige
/admin/mma/*                # Would only exist if MMA operated its Skool ops through Paige (it doesn't)
```

**Anti-patterns:**
- MMA-specific routes leaking into `/admin/*` or `/app/*` (e.g. `/admin/mma-btf-clients`).
- Routes that assume a single tenant (no `tenant_id` in scope).
- Route names referencing the tenant's product ("Skool sync", "BTF cohort") in the platform surface.

---

## 5. Component Hierarchy

**Rule:** Directory layout mirrors ownership.

```
src/components/
  landing/       # Paige marketing (tenant-agnostic; may reference tenants as fictional archetypes per §116)
  admin/         # Paige tenant-admin (per-tenant scope)
  app/           # Tenant end-customer UI
  workspace/     # White-labeled tenant workspace
  broker/        # Broker portal
  ui/            # shadcn — shared primitives (Paige-owned)
  shared/        # Cross-domain UI utilities (Paige-owned)
  paige/         # Paige-branded surfaces (only where explicit)
  # RESERVED (must not exist without a shipped ecosystem):
  mma/           # would house MMA-tenant-specific UI IF Paige ever owned it (it doesn't)
  launchpad/     # future
```

**Cross-ecosystem component reuse requires written justification** in a comment at the top of the shared component. Default answer: **don't reuse; duplicate.**

**Anti-patterns:**
- A component in `components/app/` importing an MMA-specific string, brand asset, or hardcoded tenant ID.
- Landing-page components referencing specific tenant products by name (§116 violation).

---

## 6. Navigation

**Rule:** Sidebar and top-nav entries respect ecosystem boundaries and role scope.

| Surface | Nav lives in | Owning ecosystem |
|---|---|---|
| Marketing header | `src/components/landing/Header.tsx` | Paige |
| Client-side app nav | `src/components/app/AppNav.tsx` | Paige (tenant end-customer) |
| Tenant admin sidebar | `src/components/AppSidebar.tsx` | Paige (per-tenant admin) |
| Platform super-admin | Within `/admin/paige/*` layout | Paige (super-admin only) |
| Broker sidebar | `src/components/broker/BrokerSidebar.tsx` | Paige (broker role) |
| Workspace nav | Within `/workspace/*` layout | Tenant-white-labeled |

**Every nav item declares:** the ecosystem it belongs to (implicit via file location) and the role gate. An admin viewing Paige should never see an MMA-branded menu item unless MMA has explicitly opted into a bridge feature.

**Anti-patterns:**
- MMA-specific menu items in `AppSidebar.tsx` or `AppNav.tsx`.
- Nav items showing external ecosystem data without a "→ external" indicator.

---

## 7. External Data Display

**Rule:** Any UI surface showing data owned by another ecosystem **must**:

1. **Label the source.** Small badge/chip: `From Skool`, `From GHL`, `From Array`.
2. **Show staleness.** `Last synced 2h ago` or `As of Oct 3, 09:14`.
3. **Not present as editable in Paige** unless the mutation round-trips to the source via a bridge function.

**Compliant example (pattern):**
```tsx
<Card>
  <Badge variant="outline">From Skool · synced 2h ago</Badge>
  <p>Tier: <span>{cachedTier}</span></p>
  <a href={openInSkoolUrl} target="_blank">Open in Skool ↗</a>
</Card>
```

**Anti-patterns:**
- Rendering `tier` next to authoritative Paige fields with no source label, making it look like Paige owns it.
- Editable form fields for cached external data.

---

## 8. Cross-Ecosystem UI

**Rule:** Prefer **"Open in [external system] ↗"** deep-link buttons over embedded iframes or mirrored views.

**Compliant:**
- Deep-link button that opens the tenant's Skool community page in a new tab.
- Deep-link to a GHL contact record with the contact ID passed through.

**Anti-patterns:**
- Iframed Skool or GHL views embedded in Paige. Increases coupling, hides staleness, and pretends Paige owns the data.
- Recreating Skool's UI inside Paige "so users don't have to leave."

---

## 9. Documentation gate (per-PR checklist)

Every migration, edge function, MCP tool, route, component, and nav change must answer these six questions in the PR description. Reviewers block otherwise.

1. **Which ecosystem owns the underlying fact / capability?**
2. **Which layer(s) does this PR touch?** (DB / Edge / MCP / Route / Component / Nav)
3. **If cross-ecosystem: which of the four sanctioned integration patterns applies?** (webhook / pull / sync / federation)
4. **Is the naming convention respected at every layer touched?** (prefixes, namespaces, directory placement)
5. **If UI: does external data carry a source label + staleness indicator?**
6. **Any anti-patterns from Sections 1–8 present?** If yes, explain why the exception is warranted or refactor.

---

## Related doctrine

- **§116** — No individual customer names in code
- **§188** — Tenant vs Platform Primitives
- **§189** — Tenant Feature Flag Gating
- **§193** — Vendor-Neutral Naming for Platform Primitives
- **§197** — Billing Layer Taxonomy
- **§198** — Legacy Data Deprecation Protocol
- **§199** — Ecosystem Boundaries + Data Sovereignty (data-layer companion: `ECOSYSTEM_DATA_OWNERSHIP_MAP.md`)
