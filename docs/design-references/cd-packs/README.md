# Claude Design packs — the source of truth for each shell

These are the design packs the shells are built to. They are **not** reference material to consult
when convenient; they are the specification. `src/operator/CLAUDE.md` carries the binding rule and
auto-loads for operator work — read it before touching a surface.

They live in the repo because until 2026-08-19 they did not: the Super Admin pack existed only in an
ephemeral session scratchpad, one container recycle away from taking the source of truth with it.

## What's here

| Pack | Directory | Shell file | Covers |
|---|---|---|---|
| **Super Admin / platform operator** | `super-admin-shell/` | `Super Admin Shell.dc.html` (8,288 lines) | the operator console |
| **CRM agency mode** | `agency-mode-shell/` | `Agency Shell.dc.html` (12,864 lines) | **agency AND sub-account** — one shell, both modes |

The agency pack also ships two component-level designs beside its shell — `Setup Card.dc.html`
and `Team Block.dc.html` — plus `screens/` (CD's named renders: `an1`–`an3`, `compass`–`compass5`)
and `screenshots/dark.png`. Those are part of the pack; build to them the same way.

The agency + sub-account port is tracked as task #161.


## The pack is the ONLY design reference

**Owner-ruled 2026-08-19:** *"The Design Pack should have to be your only reference. I send
screenshots to show what's live."*

Those are two different jobs and they must never be confused:

- **The pack says what a surface SHOULD be.** It is the only source for that. Not a screenshot, not
  memory, not our route registry, not whatever the code already does.
- **A screenshot the owner sends says what the surface CURRENTLY IS.** It is evidence of live state —
  usually evidence something is wrong. It is never a design source, and it is never a target.

So when the owner sends a render, the move is: open the pack for that surface, compare, and fix the
delta. Never "match the screenshot" — a screenshot of a broken surface is a picture of the bug, and
building toward it cements the defect.

The same holds for CD's OWN renders (`uploads/`, `screens/`, `screenshots/`). Those are how the pack
is meant to look, so they are a fast correctness check — especially for a session with no browser —
but the `.dc.html` is the specification. When a render and the markup disagree, the markup wins.

## Adding a pack

Drop the pack's `project/` contents into its directory above, keeping CD's own layout:

```
cd-packs/<name>-shell/
  <Name> Shell.dc.html      ← the shell; this is the design
  *-notes.md                ← CD's backend/capability notes
  *.js                      ← CD's route registry and field/data modules
  uploads/*.png             ← CD's own reference renders — what it should LOOK like
```

Two things to skip: `.thumbnail` (a CD editor artifact, not design content), and anything carrying a
credential. Everything else comes over as-is — do not reformat, prune or "tidy" a pack. A pack that
has been edited is no longer the source of truth, and the edit will be invisible six months from now.

## Versioning

A pack is replaced **wholesale** when CD issues a new one — never patched in place. Commit the
replacement on its own, with the date and what changed in the message, so the previous version stays
recoverable in history. If you are unsure whether the pack in the repo is the latest CD issued, ask
the owner before building to it; building to a stale pack is the same defect as ignoring it.

## Reading a pack

The `.dc.html` is one large file: the markup, a `panel` object per addressable tab, nav registries
(`navFleet` / `navBusiness` / `navSettings`), a glyph map, and fixture data. Search it for the surface
you are building — do not work from a screenshot or from memory, and do not work from our own route
registry when the two disagree. The pack wins. (The registry says `growth`; the pack renders
**Marketing**. That mismatch shipped once already.)

The `uploads/*.png` renders are how CD's own screens look — the fastest way to check whether what we
built matches, especially for a session with no browser.

**The rule the packs are read under:** structure is design, values are data. Geometry, labels, units,
titles, subs, foots, headers, chips, placeholders and footer lines come over verbatim; the pack's
invented figures and tenant names never do. See `src/operator/CLAUDE.md`.
