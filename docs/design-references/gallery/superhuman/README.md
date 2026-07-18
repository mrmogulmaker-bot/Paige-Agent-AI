# Superhuman (superhuman.com) — taste annotations

Reference bar for: speed-as-a-feature, keyboard-first flows, focused single-item reading
views, "delightful but calm" premium feel. Relevant to Paige's chat/inbox surfaces,
command-driven flows, and the felt-quality "fast" bar. CODE-LEVEL taste knowledge.

> How this doc is used: with Chrome MCP the critic annotates the live `SCREENSHOTS.md`
> URLs; headless, the critic reads our JSX/CSS against the rules below + CHEESY-TELLS.

## Typography
- **Clean humanist sans, ~14px UI**, generous line-height in the reading pane (~1.5–1.6)
  so a message body reads like a well-set document, not a cramped table.
- **Sender/subject hierarchy** in the list: sender ~semibold, subject regular, snippet
  muted — three weights/colors in one row establishing scan order without size jumps.
- Marketing uses larger, confident display type but the product reading view stays calm
  and readable — the felt quality is "focused," not "loud."
- Time/meta in a small muted right-aligned slot; tabular where numeric.

## Color
- **Restrained, near-monochrome** with a single brand accent (Superhuman's electric
  blue/violet) spent on the active item, primary action, and the command hints. Same
  one-accent discipline; ours is gold.
- **Signature dark theme** is a true, premium dark — layered near-blacks, not flat #000
  (§22). Light theme is a genuine clean light (§23).
- Status/label color is minimal — a small unread marker, a folder/label dot; the surface
  stays calm so the *content* (the message) is the color.
- Hairline separators between list rows; no heavy boxes.

## Motion
- **Speed is the product** — every action is instantaneous, transitions ~100–150ms.
  Archiving, replying, moving between messages feels like zero latency; the animation
  only confirms, never gates (optimistic).
- **The command palette / shortcut surface** is the motion centerpiece: fast fade+scale,
  results filter live as you type, a visible keyboard-hint teaching layer.
- **Choreographed keyboard flow** — moving through the inbox with j/k, the selection
  marker slides quickly between rows; opening a message is a fast, single crossfade.
- Reduced-motion path collapses everything to instant — which, given the ~100ms baseline,
  barely changes the felt experience (the right way to do motion-safe).

## Layout
- **Split view**: a narrow list rail on the left, a focused single-message reading pane
  on the right — one thing at a time, deeply. The reading pane is the hero.
- **Everything reachable by keyboard**, with an on-demand shortcut cheat-sheet; the UI
  teaches its own shortcuts via quiet keycap hints rather than burying them in a docs page.
- **Minimal chrome** — no persistent heavy toolbar; actions surface contextually (on the
  focused message) or via the command palette. The content owns the viewport (§11).
- Reading pane maxes at a comfortable measure (~65–75 chars) so long emails stay legible.

## Density
- **List is dense** (many messages scannable) but the **reading pane is roomy** — the
  same "match density to the object" lesson: a list wants density, a reading surface
  wants air. Paige's chat transcript vs record list is the same split.
- **8px grid**; list rows tight (~48px with a two-line sender/subject/snippet), reading
  pane generously padded.
- **Empty/zero states are celebratory** — "Inbox Zero" is a designed moment (an image, a
  calm affirmation), turning an empty state into a reward rather than a blank.
- Consistent, quiet — nothing competes with the current message for attention.

## What to steal for Paige
1. Speed as a felt feature: ~100–150ms transitions, optimistic actions, reduced-motion =
   instant — for chat, command flows, and any action Paige takes on the user's behalf.
2. Split "list rail + focused reading/working pane" — dense list, roomy focus pane; match
   density to the object (mirrors Attio's list+panel and our chat+record split).
3. One accent on the active item + primary action + command hints (we use gold, §11).
4. Command-palette / keyboard-first flow with quiet self-teaching keycap hints.
5. Turn empty states into *moments* (the "Inbox Zero" pattern) — a reward, not a blank.
6. True premium dark from layered near-blacks; genuine clean light (§22/§23).

## Cheesy-tells this reference rules out
- Laggy, gated transitions where an optimistic instant action belongs.
- A cramped reading/working pane with no measure control (long text unreadable).
- A blank "nothing here" empty state where a designed moment belongs.
- Flat #000 "dark mode" instead of layered near-blacks.
- Heavy persistent toolbars competing with the content for the viewport.
