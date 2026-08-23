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
