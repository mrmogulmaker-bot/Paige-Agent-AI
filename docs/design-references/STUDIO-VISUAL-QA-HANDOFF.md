# Vibe Studio — Visual QA Handoff (for Claude-in-Chrome)

**Purpose:** the coding session that builds the Studio has **no browser** — it reasons from source, not
pixels. This is the standing handoff for a **Chrome-MCP-enabled Claude** (or a human with DevTools) to
be its eyes: log into the live Studio, capture the screenshots + DOM/computed-style facts below, and
paste them back so the coding session can fix from *observed* behavior instead of guessing.

**Target:** `https://paigeagent.ai/admin/studio` (logged in). **Latest deployed commit at handoff time:**
`0304028` (check the deploy is current before testing; if not, wait for Vercel).

**How to report:** for every check, paste the screenshot(s) **and** the requested DOM/computed facts.
The DOM facts are what actually diagnose the bugs — screenshots alone aren't enough.

---

## ⚠️ CHECK A — THE DARK-MODE FLIP (top priority, active bug)

**Symptom the owner reports:** in **dark mode**, on login the hero renders a correct deep-dark
planetarium for a moment, then **flips to a washed, pale, light-looking field with a WHITE composer
card.** A white composer in dark mode = the *light* theme tokens are winning.

**Do this:**
1. Ensure the Studio theme is **Dark** (rail footer toggle should read "Light mode", i.e. currently dark).
2. Hard-reload `/admin/studio`. **Screenshot immediately**, then **screenshot again after ~5 seconds.**
   (We're trying to catch the flip: deep-dark → washed.)
3. **DevTools DOM inspection — this is the load-bearing part:**
   - In Elements, search the DOM for `studio-surface`. **How many elements have class `studio-surface`?**
     (Expect exactly 1 on the home. More than 1 is a likely root cause.)
   - Select the `.studio-surface` element. **Paste its full `class` attribute.** Does it include `dark`?
   - Also paste the `class` of `<html>` and `<body>` (is a global `dark` present or absent?).
   - Select the composer card (the "What do you want to build?" input box). **Computed style →** paste
     its `background-color`. Then paste the computed value of `--studio-glass-bg` on it
     (DevTools → Computed → filter "studio-glass").
   - Select the hero `<section class="studio-hero">`. Paste computed `--studio-nebula-gold`,
     `--studio-star`, and `background-image`.

**GOOD:** one `.studio-surface` with `dark` in its class list; composer `background-color` is a dark
indigo; hero reads deep navy/near-black.
**BROKEN (what we're hunting):** `.studio-surface` is missing `dark` (or there are two, and the inner
one lacks it); composer `background-color` is near-white; tokens resolve to the light values.

---

## CHECK B — the mouse-follow parallax (owner does NOT want it)

Move the mouse slowly across the hero field. **Does the starfield/nebula shift/follow the cursor?**
Record yes/no (and how strong). *This should be REMOVED once the current fix ships — confirm it's gone
after the next deploy.*

---

## CHECK C — Light mode

Toggle to **Light**. Screenshot. Report:
- Is it **genuinely light** (bright, premium) — or gray/washed/too-close-to-dark?
- Is there a **soft focal "black hole" shade behind the saturn mark** (a faint cool-violet well that
  makes the gold mark pop)? *This is a LIGHT-ONLY feature — it should NOT appear in dark.*
- Is the composer/chat-box text and border **readable** (not low-contrast)?

---

## CHECK D — the comet (motion quality)

Watch the comet orbit the hero for ~15s (dark mode shows it best). Capture a mid-orbit screenshot.
- **Motion:** is the orbit **smooth and continuous**, or does it make **rigid/jerky direction-changes**
  when it swings around?
- **Flame:** does it have a **real burning trail with live flicker + sparks streaming off the head**, or
  is it a **static gradient blob** that just slides?
- Report both, honestly.

---

## CHECK E — rail stardust

Look at the **left rail** in **both** themes. Are the falling stars **visible and alive** (dark:
star-tinted; light: gold pulses) — or invisible/dead specks? Screenshot each.

---

## CHECK F — chat-box / composer contrast (both themes)

Zoom into the composer in **each** theme. Report readability (AA) of: the placeholder text
("e.g. a registration page…"), the "Try" suggestion chips, the dock border, the send button. Flag any
element that's hard to read.

---

## CHECK G — build cutscene (optional, if quick)

Start a new project (type a brief, hit send). While it builds, screenshot the **right-hand "forming"
panel**. Is it **alive** (assembly scan, materializing lines, breathing mark) or a boring static glowing
box?

---

## Report template (paste back)

```
DEPLOY COMMIT SEEN: <git sha in footer / or "unknown">
A) DARK FLIP: <did it flip? screenshots attached>
   - # of .studio-surface elements: <n>
   - .studio-surface class list: "<...>"
   - <html>/<body> class: "<...>"
   - composer background-color: <rgb/hsl>  | --studio-glass-bg: <hsl>
   - hero --studio-nebula-gold: <hsl> | --studio-star: <hsl>
B) MOUSE PARALLAX present?: <yes/no, strength>
C) LIGHT MODE: <genuinely light? black-hole behind mark? composer readable?>
D) COMET: motion <smooth/rigid?> | flame <real/static?>
E) RAIL STARDUST: dark <visible?> | light <visible?>
F) COMPOSER CONTRAST: <per-element readability, both themes>
G) BUILD CUTSCENE: <alive/static?>
```
