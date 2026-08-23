# Shell harness

Renders the operator shell chrome and checks the five things the design is diffed against:
slot order · shell grid tracks · `min-width: 0` on every grid/flex child · no document
scrollbar · AA against `--pg-env`.

## What it proves, and what it does not

It proves **geometry**. Auth and data are mocked, so it can render an auth-gated surface —
but that is exactly why it **cannot** prove the authenticated console renders. §32.c stays
owed to a session that can drive the deployed surface. This harness must never be reported
as having discharged it.

**Mock the provider, never the contract.** The IA is read as shipped. A harness handed a
fixtured slot list could only assert the geometry it was given — it could never catch a
slot-count regression, which is one of the five things it exists to catch.

## The frames do not show most of the defects

Worth stating plainly, because it is counter-intuitive: four of the five fixture frames are
**byte-identical**. A missing `min-width: 0` with no long string to blow out, a sub-AA colour
on small text, and content below the fold all render the same at viewport scale. The harness
catches them by **measurement**, not by eye — so the assertions are the evidence and the frame
is the record. Do not review the frame and conclude the checks passed.

## Labelling

`harness render · not live` is burned into the image, not the filename — metadata is lost the
moment a frame is pasted into a conversation, which is how mislabelled theme frames travelled
once already. The label is injected only AFTER every measurement, so it cannot influence what
was measured, and the harness **refuses to write a frame whose label is not verifiably on
screen** (negative-controlled: a zero-height label is refused).

## Running

    node scripts/live-drive/harness/shell-harness.mjs --url <url> [--slots a,b,c] [--theme dark|light]

Exit 1 if any check fails. Artifacts land in `scripts/live-drive/artifacts/harness/`
(gitignored). `npm run harness:selftest` runs the negative controls.

## The reject-on-sight list (owner, 2026-08-23)

Seven things rejected on sight when frames arrive; everything else is a judgement call to argue
rather than reject. **Four are mechanical and live in the harness** rather than depending on an eye:

| Criterion | Check |
|---|---|
| Rail order must be Fleet · Relationships · Campaigns · Marketplace · Analytics · Settings | `slotsInOrder` |
| Spine never below 340px at any width | `spineFloor` |
| Four type sizes, three faces — a fifth of either is a reject | `typeLadder` |
| Gold fill on a resting element (a selected rail slot is champagne ring + bloom, **not** gold fill) | `goldOnlyOnAct` |
| No document scrollbar, either theme | `noDocumentScrollbar` |

**Three CANNOT be checked mechanically** and are named here so a green harness is never mistaken
for a green taste pass — absence of a failure is absence of evidence, not evidence of absence:

- **Depth from darkening rather than layered elevation.** Needs an eye against the pack.
- **Motion on anything that is not real activity.** Requires knowing what is actually running.
- **The gold *treatment* reading** — `goldOnlyOnAct` catches a gold FILL, but "champagne ring plus
  bloom" versus something merely not-gold-filled is a taste call.

`npm run harness:selftest-reject` runs their negative controls. The grid-collapse-before-the-band
criterion needs a multi-width sweep and is **not yet implemented** — stated rather than implied.
