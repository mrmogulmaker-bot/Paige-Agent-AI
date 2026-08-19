# The agency and sub-account shells follow the Claude Design pack. Verbatim, until the owner says otherwise.

**Owner-locked 2026-08-19.** The same lock that governs the operator console governs this shell. The
full statement of it — the rule, the "structure is design, values are data" test, and the four ways
this has actually gone wrong — lives in **`src/operator/CLAUDE.md`**. Read it; everything there
applies here unchanged. This file records only what is specific to these two tiers.

## Which pack

**`docs/design-references/cd-packs/agency-mode-shell/`** — CD's CRM agency-mode pack.

- `Agency Shell.dc.html` (12,864 lines) is the shell, and it covers **BOTH agency and sub-account**
  in one file — 211 sub-account references — which matches how `AgencyApp` already models the two
  (`mode="subaccount"`). Do not go looking for a separate sub-account pack; there isn't one, and the
  two tiers are meant to share a shell (§60: Solo ≡ Sub-account except billing).
- `Setup Card.dc.html` (215 lines) and `Team Block.dc.html` (514 lines) are component-level designs
  shipped beside the shell. They are part of the pack — build the Setup card and the Team block to
  them, not to whatever those surfaces currently do.
- `screens/` holds CD's named renders (`an1`–`an3`, `compass`–`compass5`), `screenshots/dark.png` its
  dark-theme render, `uploads/` the rest. Those are how it should LOOK — a fast correctness check for
  a session with no browser. Where a render and the `.dc.html` disagree, the markup wins.
- `paige-brain.js` and `support.js` are the pack's own data/behaviour notes for those surfaces.

## The screenshot rule (owner-ruled 2026-08-19)

> *"The Design Pack should have to be your only reference. I send screenshots to show what's live."*

The pack says what a surface SHOULD be. A screenshot the owner sends says what it CURRENTLY IS —
normally because something is wrong with it. Open the pack, compare, fix the delta. Never build
toward a screenshot: a screenshot of a broken surface is a picture of the bug.

## Specific to these tiers

- **One shell, two modes.** Anything you add must answer for both. A change that only holds for the
  agency parent, or only for a sub-account child, is a §51/§60 defect — that seam has bitten this
  platform four separate times. Check the tier matrix before you build (§56), not after.
- **The pack shows an agency-scoped view.** What a sub-account may actually READ is still decided by
  the server (§9/§51). The design never widens scope.
- **§58 applies hardest here.** These shells already ship working surfaces. The pack's drawing of a
  capability is the SKIN over the real thing, never a replacement for it — and when you re-skin,
  strip the old wrapper rather than nesting it inside the new one (§30). Nesting is exactly how the
  operator's Paige pane ended up with two "New chat" buttons and two chat lists.

**The test, every time:** *"Did I open `Agency Shell.dc.html` for this surface and render what it
draws — structure verbatim, values real, correct in BOTH agency and sub-account mode — or did I build
from a screenshot, from memory, or from what was already there?"*
