# Retool — screenshots to capture (Chrome MCP, interactive session only)

These are **not yet captured**. The rendered-screenshot loop requires the Chrome MCP
(`mcp__claude-in-chrome__*`), which is unavailable in a headless env, and Retool's actual
app builder is auth-gated. Capture ONLY the public marketing/product pages below (which
show real product screenshots of the data-tool surfaces) — never anything behind a login.
The annotations in `README.md` are the durable deliverable; screenshots are a supplement
for the pixel-level pass.

Public URLs to capture:
- https://retool.com — homepage (data-tool product shots: dense grids, status pills, neutral chrome)
- https://retool.com/products/apps — app/table builder surface renders (data-grid density)
- https://retool.com/products/database — table/record UI (hairlines, banding, tabular figures)
- https://retool.com/templates — gallery of internal-tool layouts (master-detail patterns)
- https://retool.com/customers — restrained case-study layout

Capture at 1440px wide (desktop) and 390px wide (mobile) where layout shifts. The key
things to verify are the data-grid density, tabular-number alignment, and neutral chrome vs
status-pill color rationing in the product screenshots. Do NOT log into the Retool builder
or capture any authenticated app/canvas view.
