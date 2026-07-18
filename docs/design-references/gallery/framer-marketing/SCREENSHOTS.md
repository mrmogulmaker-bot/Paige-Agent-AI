# Framer marketing — screenshots to capture (Chrome MCP, interactive session only)

These are **not yet captured**. The rendered-screenshot loop requires the Chrome MCP
(`mcp__claude-in-chrome__*`), which is unavailable in a headless env. Framer's marketing
pages are public — capture ONLY these public pages, never any authenticated editor/canvas
behind a login. The annotations in `README.md` are the durable deliverable; screenshots
are a supplement for the pixel-level pass.

Public URLs to capture:
- https://www.framer.com — homepage hero (massive display type, negative tracking, scroll motion)
- https://www.framer.com/features/ — editorial section rhythm + product-shot pairing
- https://www.framer.com/pricing/ — restrained pricing layout on a dark editorial ground
- https://www.framer.com/showcase/ — real product imagery / device-frame treatment
- https://www.framer.com/marketing/ — landing-surface hero patterns

Capture at 1440px wide (desktop) and 390px wide (mobile) — the fluid `clamp()` type scale
is the key thing to verify across widths. Capture the hero both at rest and mid-scroll to
document the reveal motion. Do NOT log into the Framer editor or capture any canvas view.
