# Rendering the shell offline

**For:** Claude Code · **Date:** 2026-08-23

CC hit a real blocker screenshotting the pack: `support.js` pulls React and
Babel from a CDN at runtime, and the build sandbox forwards `curl` but not
Chromium's requests. Rather than intercept CDN calls or vendor dependencies
into the pack, use the file below.

## `PAIGE Platform Operator - standalone.html`

One self-contained file, 2.2 MB, in this folder. Everything inlined — React,
the DC runtime, `paige-ia.js`, `mind-brain.js`, both webfont families as
base64. **No network at all.** It renders with `file://`, in a headless
Chromium with no proxy, and in CI.

Point the screenshot tool at this file. Nothing else needs to change.

```
chromium --headless --screenshot=out.png --window-size=1600,1000 \
  "handoff/PAIGE Platform Operator - standalone.html"
```

## Which file is the source of truth

| File | Role |
|---|---|
| `PAIGE Super Admin Shell v3.dc.html` + `paige-ia.js` + `mind-brain.js` + `support.js` | **Source of truth.** Diff against these. Byte-clean through re-deliveries. |
| `PAIGE Platform Operator - standalone.html` | **Screenshot target only.** A compiled artifact — never edit it, never diff against it. |

The standalone is regenerated from the source on request, so it will follow
every revision. If it is ever stale, ask and it will be rebuilt in the same
turn.

## Getting past the boot screen in a headless shot

The shell opens on Fleet with the conversation panel expanded. To capture a
specific surface, drive it before the shot:

```js
// destinations, by rail label
[...document.querySelectorAll('button')]
  .find(b => /Campaigns/.test(b.textContent)).click();

// views, by exact tab label
[...document.querySelectorAll('button')]
  .find(b => b.textContent.trim() === 'Sales').click();

// fold the conversation panel for a wider canvas
[...document.querySelectorAll('button')]
  .find(b => /^Fold/.test(b.getAttribute('aria-label') || '')).click();

// theme: Obsidian ⇄ Mineral
[...document.querySelectorAll('button')]
  .find(b => /Mineral|Obsidian/.test(b.textContent)).click();
```

Allow ~400ms between a click and the capture — surfaces transition on
`grid-template-columns` and the rail animates.

## Worth knowing before you shoot

- **Layout is width-driven, not breakpoint-driven.** Several surfaces read
  `canvasW` and change structure: the Sales figures strip is 5 columns at
  ≥900px, 3 at ≥620px, 2 below; the summon panel's geometry set collapses to a
  single cycling control under 520px; Catalog's two-column detail becomes one
  under 700px. Shoot at 1600×1000 for the intended reading, and at ~900 wide
  to check the folds.
- **The Mind animates continuously** (Settings → Mind). Any two screenshots
  will differ. That is correct — the conduction is driven by real events. Don't
  treat it as nondeterminism to fix.
- **Both themes are first-class.** A surface signed off in Obsidian is not
  signed off. Shoot both; contrast is AA against `--pg-env`, the tightest
  ground.
- **No page scrolls.** If a screenshot shows a document scrollbar, that is a
  defect — every surface fits its viewport and scrolls only inside its own
  regions.

## On doing this in passes

Agreed that this won't land in one. A useful order, largest surface area
first: Fleet · Relationships · Campaigns → Active · Catalog · Sales ·
Settings → Automations · Integrations · Team · Vault · Capabilities ·
Analytics · Marketplace · the Mind last, since it is the least like a normal
surface and the most likely to eat a pass on its own.
