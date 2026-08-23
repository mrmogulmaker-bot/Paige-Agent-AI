# PACK-FIRST — the design pack is CODE. Read it before you ask, guess, or call anything missing.

> **Owner, 2026-08-23:** *"You keep seeming to want to ask Claude Design about specifics when they
> actually gave you the exact code to just simply copy and write in. I think you just keep
> forgetting to keep looping back to that code as the reference point."*

**Binds: anything a human will see, feel, or touch.** Every UI surface, every tier, every shell,
every panel, every control, every piece of on-screen copy. Not just the operator console.

This exists because Claude Code keeps treating a **delivered implementation** as a **specification
to interpret**. It is not. It is markup, tokens, geometry and copy that already exist and can be
copied. Asking about something the pack already answers costs a round trip, and worse, invites an
invention where a transcription was available.

---

## WHERE THE PACK IS — no session ever has to hunt for this

```
docs/design-references/cd-packs/super-admin-shell-v3/          <-- THE pack (operator)
    PAIGE Super Admin Shell v3.dc.html          11,358 lines · the shell itself
    PAIGE Platform Operator - standalone.html   the standalone render
    PORT-SPEC-palette-and-six-surfaces.md       99KB transcription, pack line citations
    design-system-port.md    tokens · the four faces · the Command Mark · port order
    paige-ia.js              the IA
    absence-copy.md          designed absence copy — CHECK HERE before saying copy is owed
    campaigns-catalog-sales-spec.md · mind-brain.js · support.js · github.md
    corrections-2026-08-23.md · paige-brand-identity.md
```

`super-admin-shell/` and `agency-mode-shell/` are **SUPERSEDED**. Do not build from them, diff
against them, or cite them.

---

## THE GATE — before you say ANY of these words, you must have searched

**Trigger phrases.** If you are about to write or think any of the following about a UI thing:

> *"missing" · "not in the pack" · "PACK SILENT" · "owed from CD" · "ask CD" · "a design decision"
> · "a blocker" · "needs designing" · "not specified" · "I'll need guidance on"*

**STOP.** You have not earned that sentence until you have run a real search and can show it.

### What a real search is

1. **Grep the `.dc.html` with AT LEAST FOUR spellings.** One grep is not a search. A capability is
   named differently in markup than in conversation. Wanted a sign-out icon? Try
   `sign`, `logout`, `log out`, `exit`, `leave`, `session`, `account`, and read the rail foot markup
   directly. Wanted a command palette? `palette`, `summon`, `⌘K`, `cmdk`, `command`.
2. **Grep the PORT-SPEC** — it is already a transcription with line citations and may answer it
   outright.
3. **Grep the sibling files** — `absence-copy.md` for copy, `paige-ia.js` for structure,
   `design-system-port.md` for tokens/faces/geometry.
4. **Open the region of markup and READ it.** A grep can miss what an eye on the block finds.

### The evidence standard

Never write *"the pack doesn't have X."* Write:

> *"Searched `PAIGE Super Admin Shell v3.dc.html` for `sign`, `logout`, `exit`, `session`, and read
> the rail foot markup at L4210–L4260. No sign-out glyph. PORT-SPEC and absence-copy.md also
> checked."*

An unfalsifiable claim of absence is worthless — it is indistinguishable from not having looked,
which is what actually happened the first four times.

---

## DERIVE BEFORE YOU ESCALATE — the second half of the gate

Searching is not enough. The pack is a **system with internal logic**, not a list of answers to
look up. Treating it as a lookup table produces a subtler version of the same failure: the search
comes back empty on the literal question, and CC escalates something the pack's own rules already
determine.

**The split, and it decides who answers:**

| | who answers | examples |
|---|---|---|
| **Derivable from the pack** | **CC derives it. No question.** | which token a region takes · geometry · type scale · state transitions · anything computable from values already on disk |
| **A decision that does not exist yet** | **CD's** | copy that was never written · whether a capability is a place · where a control points once its destination is gone |

**The anchoring case, 2026-08-23 — this is the one that named the rule.** CD reported light-mode
depth reading as hairline outlines. CC replied that it could not be fixed without changing token
values, which are pinned to the pack at 44/44 and CI-enforced, and therefore that it was a pack
change and CD's call.

**That was wrong, and nothing needed to change.** The answer was inside the pack's own stated
rule — *elevation is distance from `--pg-env`* — and every value was already on disk. Computing
relative luminance shows `--pg-surface` sits ABOVE canvas in dark (0.0065 vs 0.0025 from env) and
BELOW it in light (0.1045 vs 0.1633). The role **inverts between themes**, so "plates on
`--pg-surface`" is right in dark and backwards in light — a plate asked to recede. The fix was a
spend correction: rising plates take `--pg-raised` in both themes. Zero values moved.

CC had the numbers, had the rule, and escalated anyway.

**The failure is not distrust of the design.** It is treating the pack as a SPECIFICATION that
needs its author present to interpret, rather than as a SYSTEM that can be reasoned from. A spec
has gaps you must ask about; a system you compute against. The cost is identical to distrust — it
makes CD the router for something the repo already answered.

**The test, before any escalation:** *"Is this derivable from what is already on disk — the pack's
stated rules, its values, its markup — or does it require a decision nobody has made yet? If
derivable, I derive it and do not ask."*

---

## THE ANCHORING CASES — all real, all 2026-08-23, all the same shape

| what happened | what was actually there |
|---|---|
| The command palette and six surfaces were about to be scoped as a **design blocker** requiring CD input | **115 × `summon`, 24 × `palette`, 3 × `⌘K`**, Calendar ×33, Compose ×52, Integrations ×18. All drawn, none ported. |
| A sign-out glyph reported as "not in the pack" | **One grep**, one spelling. That is not a search, and the brief that said it also instructed an agent to report it as owed from CD. |
| The whole operator console built against the wrong design for weeks | `src/operator/CLAUDE.md` pointed at the **superseded** pack; v3 was not mentioned in the file. |
| The `--pg-*` system "not installed" | Every token existed. They were **mapped onto shadcn values** instead of installed, so names were right and values were ours. |

**The through-line:** in every case the answer was already in the repo, and the failure was not
looking hard enough before escalating.

---

## PORT, DON'T INTERPRET

- **Structure comes over VERBATIM** — geometry, spacing, radii, tokens, every label, unit, header,
  placeholder, chip, empty-state string, footer line. Copy the markup. Do not paraphrase it, do not
  "clean it up", do not restructure it because a React idiom would be tidier.
- **Values do NOT come over.** The pack's invented figures, tenant names, timestamps and prose are
  FIXTURES. They render from a real read or as an honest absence — never copied (§13, §63).
- **A capability drawn in the pack is never a blocker.** It is a port that has not happened yet.
- **The pack can contradict itself** — it is authored, not compiled. When it does, report BOTH line
  numbers and let CD resolve it. Do not pick a winner.
- **A genuine gap is a QUESTION, not a licence.** If the search really comes up empty, ask CD and
  render nothing meanwhile. Never fill the hole yourself — an invented control, icon, or line of
  copy is worse than an absence, because it renders plausibly and is wrong.

---

## THE TWO ALLOCATION DEFECTS — why a passing check is not a passing surface

Both shipped. Both passed every gate. Both needed an eye.

| | the defect | what was correct |
|---|---|---|
| **the port** | CD's design MAPPED ONTO our shadcn tokens — right names, OUR values | every token name |
| **the spend** | tokens allocated to the wrong ROLE — `--pg-surface` on plates, which rises in dark and RECEDES in light | every token value |

Neither is a content failure. `lint:pg-tokens` verifies values MATCH the pack; it structurally
cannot verify a value is used WHERE the pack uses it. tsc, eslint and the render harness are all
blind to both by construction.

**Consequence for how a slice reports:** frames are STANDING, every slice. Not on request, not when
someone is suspicious. A slice without frames is not finished. What goes with them is evidence only
— address, theme, width, measured geometry, faces loaded — never a reading (§00).

---

## THE LOOP — run it every time, not once per session

Before each UI slice, and again before each report that says something is missing:

1. **Open the pack for THIS surface.** Not memory, not a screenshot, not a previous session's notes.
2. **Search four ways.** Record the spellings.
3. **Port what is there, verbatim.**
4. **Wire values to a real read, or render the designed absence.**
5. **Only then**, if something is genuinely absent, ask CD — and show the search.

**The test, every time:** *"Did I open the pack for this exact thing and search it more than one
way — or am I about to ask a question the pack already answered?"*

---

## Cross-references

`CLAUDE.md` **§00** (jurisdiction — CD decides, CC wires; zero design input) ·
`src/operator/CLAUDE.md` (the operator lock, and "is this thing a place?") · §13 (honest reporting —
an unsearched "not found" is a false report) · §18 (one home) · §58 (never silently drop a shipped
capability).

---

## THE WHOLE PACK IS INVENTORIED — read `PACK-INVENTORY-v3.md` before you claim absence

The word-trigger gate in this file fires on *"missing"*, *"not in the pack"*, *"PACK SILENT"*. It does
**not** fire on **silence** — and silence is how the Paige spine went unported for weeks. Nobody
said it was missing; nobody looked. That hole is closed by a full read, not by a better trigger.

`PACK-INVENTORY-v3.md` is the record of that read: all 18 files, 20,978 lines, the shell's 183
render blocks, its 49 surface builders with measured port coverage, and all 96 `paige-ia.js`
catalogues with exact counts. **A claim of absence that contradicts the inventory is wrong by
construction.** A claim of absence the inventory does not cover means the inventory needs
extending — say so and extend it, rather than asserting the gap.

The measured baseline it establishes, so drift is visible: **442 of 1,774 authored pack strings
present in `src/operator/` — 25%.** That number should only ever go up.

---

## NO DOCUMENT GETS TO ENUMERATE THE PACK (owner ruling, 2026-08-23)

*"PACK-INVENTORY-v3.md is the index because it's generated from the file and lists everything,
including what's unported. Every other doc is a note on a part."*

A partial transcription that advertises completeness is the exact mechanism that hid the Paige
spine: `PORT-SPEC` listed eleven sections, wrote five, and every session that opened it read a
table of contents as a map of the pack. **A doc covering part of the pack says so at the top,
in its first screenful, and never lists what it does not contain.** If you find yourself writing
a Contents that promises sections you are not writing in the same pass, delete the promise
rather than the work.
