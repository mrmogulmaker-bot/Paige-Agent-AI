# Marketplace Data Model

Reference for anyone touching the tenant-facing Capability Store
(`src/pages/admin/Marketplace.tsx`) or the marketplace registry. It codifies the
one trap that will bite you (`install_count`) and the §9 tenant-scoping guarantee.

## The three tables (+ one view function)

| Object | Grain | What it holds |
| --- | --- | --- |
| `marketplace_items` | one row per product (global) | The shelf entry: `slug`, `item_type`, `name`, `category`, `icon`, `status`, `scope`, `is_finance`, `default_for_new_tenants`, `pricing_model`, `metadata`, `current_version_id`, and the **global** aggregates `install_count`/`rating_avg`. |
| `marketplace_item_versions` | one row per published version | The reviewable payload (`install_manifest`). An item is **installable only when it has a published version** — `marketplace_items.current_version_id` points at it. `current_version_id IS NULL` ⇒ the item is a **roadmap / "coming soon"** card. |
| `marketplace_installs` | one row per (tenant, item) | **The only per-tenant state.** Whether *this* tenant has an item on, and the exact refs install wrote (`seeded_refs`) so uninstall is reversible. |
| `marketplace_catalog_for_tenant(_tenant_id)` RPC | one row per visible item, **for one tenant** | The catalog the UI reads. Joins items + versions + that tenant's installs and returns a per-row `installed` flag and `version` (null ⇒ roadmap). This is the tenant-scoped read; the UI never queries `marketplace_items` directly. |

Skills have a second "on" path the AI gate actually reads: `tenants.features.enabled_skills`
(array) plus a Playbook preset (e.g. `funding`). The card reconciles all three
(`marketplace_catalog_for_tenant.installed` + `enabled_skills` + preset) so it can
never show "Live" while the gate that the chat reads is off (§13).

## THE TRAP: `install_count` is a GLOBAL aggregate — never read it per tenant

`marketplace_items.install_count` is a single integer on the **global** product row:
the total installs across **every** tenant on the platform. It is **not** scoped to
the tenant looking at the page. Reading it to answer "how many capabilities does
*this* tenant have on?" is wrong two ways:

1. **It's the wrong number.** It counts other tenants' installs. A brand-new tenant
   with nothing on could see a large "live" count purely because other tenants
   installed the item — the opposite of the truth.
2. **It leaks cross-tenant signal (§9).** A per-tenant surface must not expose a
   platform-wide aggregate as if it were the tenant's own state.

### The correct compute — always tenant-scoped

The "live now / on" number the UI shows is computed **only** from the tenant's own
catalog rows returned by `marketplace_catalog_for_tenant`:

```
availableFor(r) = r.version != null          // has a published version → installable
// isOnFor branches by item_type:
//   item_type === 'skill' → enabled_skills.includes(r.slug) || preset(r)   (the AI-gate truth)
//   everything else       → r.installed                                     (a marketplace_installs row)
isOnFor(r)      = r.item_type === 'skill'
                   ? (enabled_skills.includes(r.slug) || preset(r))
                   : r.installed
liveCount       = rows.filter(r => availableFor(r) && isOnFor(r)).length   // "{on}"
availableCount  = rows.filter(availableFor).length                        // "{available}"
roadmapCount    = rows.filter(r => !availableFor(r)).length               // "{soon}"
```

**Rule (§2/§9): the "live now" / "on" counter must count the tenant's own
on + available items and must NEVER read `install_count`.** The header counter renders
`{available} available · {on} on · {soon} soon`, all three derived as above — so a
fresh, 0-on tenant still truthfully sees the shelf isn't empty (`{available} > 0`)
without any cross-tenant number entering the surface.

`install_count`/`rating_avg` exist for a future **operator/Super-Admin** analytics
view (platform-wide adoption), which is a different audience (§9). They are also
frozen at insert for non-privileged writers by `marketplace_items_freeze_privileged()`.

## §9 tenant-scoping guarantee

- **RLS on `marketplace_items`** lets an authenticated user read only `status='listed'`
  items visible to them (`scope='public'`, or a `tenant`/`agency` row targeted at
  them). Unlisted/archived items and other tenants' scoped items are invisible.
- **RLS on `marketplace_installs`** (`mp_installs_rw`) lets a tenant admin see/write
  **only their own** tenant's installs (`is_tenant_admin(tenant_id)`); the platform
  owner sees all.
- **The catalog RPC** derives the tenant from its `_tenant_id` argument and joins
  installs for that tenant only, so the per-row `installed`/`version` a caller sees
  is that tenant's truth — never another's.
- **The UI counter** is computed client-side from those tenant-scoped rows (above),
  so no global aggregate ever reaches a tenant surface.

## §2 finance / default rules (enforced in the DB, not just the UI)

- A finance/credit item **may be `listed`** (a tenant can opt in — funding is the
  canonical example) but **may never be `default_for_new_tenants=true`**. The
  `marketplace_item_guard()` BEFORE INSERT/UPDATE trigger raises if a row sets
  `default_for_new_tenants` while carrying finance vocabulary — a hard gate.
- New vertical presets (fitness, business_coach, agency, consulting, life_coach —
  seeded `20260725152540`) are `is_finance=false`, `default_for_new_tenants=false`,
  and carry zero finance vocabulary: coaching-generic, opt-in, never a default.

## Roadmap ("coming soon") pattern

To add a shelf card that is visible but not yet installable: insert a
`marketplace_items` row with `status='listed'` and **no** version
(`current_version_id` stays NULL). It renders as a "Coming soon" / Roadmap card and
feeds the `{soon}` counter. Signal the roadmap intent in `metadata`
(`{"coming_soon":true,"roadmap_note":"…"}`, config-as-data §10) — no new columns.
When the capability ships, publish a version and point `current_version_id` at it;
`availableFor` flips true and the card becomes installable.
