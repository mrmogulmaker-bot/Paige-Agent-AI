# Cal.com — screenshots to capture (Chrome MCP, interactive session only)

These are **not yet captured**. The rendered-screenshot loop requires the Chrome MCP
(`mcp__claude-in-chrome__*`), which is unavailable in a headless env. Cal.com's marketing
pages and *public* booking pages are reachable — capture ONLY these public pages, never an
authenticated dashboard behind a login. The annotations in `README.md` are the durable
deliverable; screenshots are a supplement for the pixel-level pass.

Public URLs to capture:
- https://cal.com — homepage (clean scheduling positioning, monochrome ground, one accent)
- https://cal.com/pricing — restrained pricing layout
- https://cal.com/product/enterprise — product surface renders
- A public booking page (three-zone card: host · calendar · slots), e.g. a demo/team page
  linked from https://cal.com — capture the date-picked state so the time-slot column and
  tabular time figures are visible.

Capture at 1440px wide (desktop) and 390px wide (mobile) — the three-zone → single-column
reflow of the booking card is the key thing to verify across widths. Capture the booking
card both before and after selecting a date to document the two-pane expansion motion.
Do NOT log into any Cal.com dashboard or capture an authenticated availability view.
