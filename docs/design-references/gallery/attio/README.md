# Attio (attio.com) — taste annotations

Reference bar for: modern CRM, contact/record objects, relationship data, list & table
views over people/companies. **The most directly relevant reference to Paige's client
portal (§7)** — Attio is what a beautiful, reasoning-adjacent CRM looks like. CODE-LEVEL
taste knowledge.

> How this doc is used: with Chrome MCP the critic annotates the live `SCREENSHOTS.md`
> URLs; headless, the critic reads our JSX/CSS against the rules below + CHEESY-TELLS.

## Typography
- **Inter, ~13–14px UI**, weight-driven hierarchy (record titles ~590, field labels
  ~500 in muted gray, values 400). Same "tool, not brochure" cut as Linear.
- **Record identity is typographic** — a person/company name renders as the strong
  element of a row/header, with a small avatar/logo; secondary attributes are quieter,
  smaller, muted. Steal this for Paige's client rows.
- Field **labels are small-caps-ish muted** (~12px, letter-spacing slightly open) sitting
  above or left of their value — the classic CRM attribute grid, done cleanly.
- Numerals tabular in any metric/deal-value column.

## Color
- **Neutral ground, one soft accent.** Attio leans light-first with a very restrained
  palette; color is spent on the primary action and on **object/label chips**.
- **Records carry colored labels/tags** — small rounded chips with soft fills, a
  low-saturation swatch per tag. This is the one place Attio lets color bloom, and it
  reads as *data* (a taxonomy), not decoration. Map to our `StatePill`/label system.
- **Avatars/logos are the color** on a contact list — real photos/company favicons give
  the surface life without the designer spraying accent color around.
- Hairline borders, soft elevation; light mode is genuinely light (§23).

## Motion
- **Quick, spreadsheet-fast.** Cell edits commit inline with a tiny confirmation; adding
  a record slides a row in; opening a record slides a **right-side detail panel** over
  the list. ~150ms, ease-out.
- **Drag-to-reorder / kanban** transitions are spring-physical but restrained — the card
  follows the cursor, drop settles with a small spring, no confetti.
- Inline editing is the motion story — click a cell, it becomes an input in place; no
  modal, no page nav. Reduced-motion: panels and rows appear instantly.

## Layout
- **Object-centric.** Everything is a record of a type (Person, Company, Deal) rendered
  as a **row in a customizable table** — columns are attributes the user picks. This is
  the CRM primitive: a configurable table over typed objects.
- **List ⇄ Kanban ⇄ Table views** of the same object set, switchable — but the *data*
  and its home are one; the view is a lens, not a separate surface (echoes our §18/§21:
  one home, views are filters not new silos).
- **Right-side record panel** on click: full attributes, activity timeline, related
  records, and actions — the list stays visible behind it. The single best pattern to
  steal for Paige's client record.
- **Left rail of objects/lists + top toolbar** (search, filter chips, view switch, sort).
- Roomy but information-rich; header chrome is thin so the records lead (§11).

## Density
- **8px grid**, table rows ~40px, comfortable for scanning a book of clients.
- **Attribute grids** in the record panel use a tight label/value two-column rhythm —
  many attributes visible without scrolling, but each on the grid.
- **Empty states are warm + guided** — "Add your first contact" with a clear primary and
  a hint of what the object is for; never a bare blank.
- Avatars, favicons, and small label chips give texture so density never reads as a gray
  wall of text.

## What to steal for Paige
1. **Object = typed record in a configurable table**; views (list/kanban/table) are
   lenses over one home, never separate surfaces (§18/§21) — the core CRM pattern.
2. **Right-side record panel** on row click with attributes + activity timeline +
   related records + actions; list stays in context. Best single steal for the portal.
3. Record identity is typographic + avatar/favicon; secondary attrs quieter/muted.
4. Colored **label/tag chips** as the one place color blooms, read as taxonomy/data.
5. Inline cell editing (click → input in place), optimistic commit, no modal hop.
6. Warm, guided empty states for a first-run book of clients.

## Cheesy-tells this reference rules out
- A rigid, non-configurable table where every CRM needs the same fixed columns.
- Full-page navigation to view/edit a single contact (use the right panel + inline edit).
- Modal dialogs for quick field edits.
- A gray wall of text with no avatars/logos/label chips to give records identity.
- Treating list vs kanban vs table as three separate surfaces instead of views of one
  object home.
