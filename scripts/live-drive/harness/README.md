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

### Serving a real render locally — the dev server DOES work here

Corrected 2026-08-23. An earlier pass concluded local rendering was impossible in this
sandbox because `npx vite` dies with `EAFNOSUPPORT: address family not supported :::8080`.
That diagnosis stopped one step short: the failure is **only** `vite.config.ts` hardcoding
`host: "::"`, and there is no IPv6 stack here. A CLI flag overrides it —

    npx vite --host 127.0.0.1 --port 5199

— and Playwright then loads the app at `http://127.0.0.1:5199/` with a 200 and **zero page
errors** (verified, not assumed). Two notes for whoever picks this up: pass `--noproxy '*'`
to `curl` when probing, since `HTTPS_PROXY` is set and the proxy does not forward loopback;
and the sandbox reaps backgrounded servers, so a server started in one shell will not
survive into the next (exit 144 is that reaping, not a crash).

What this changes: the harness can point at a **real render**, not only fixtures. What it
does NOT change: the console is auth-gated, so a real console render still needs a dev-only
mount entry rather than a login, and **§32.c remains owed** to a session that can drive the
DEPLOYED surface. A local render is not a deployed one.

## The reject-on-sight list (owner, 2026-08-23)

Seven things rejected on sight when frames arrive; everything else is a judgement call to argue
rather than reject. **Four are mechanical and live in the harness** rather than depending on an eye:

| Criterion | Check |
|---|---|
| Rail order must be Fleet · Relationships · Campaigns · Marketplace · Analytics · Settings | `slotsInOrder` |
| Spine never below 340px at any width | `spineFloor` |
| Four type sizes, three faces — a fifth of either is a reject | `typeLadder` |
| Gold on anything but the act (a selected rail slot carries bloom + a ring, **not** an act fill) | `goldOnlyOnAct` |
| No document scrollbar, either theme | `noDocumentScrollbar` |
| Collapse order: spine to 0, *then* the rail 216→72, and the band last — thinning, never gone | `collapseOrder` |

**Three CANNOT be checked mechanically** and are named here so a green harness is never mistaken
for a green taste pass — absence of a failure is absence of evidence, not evidence of absence:

- **Depth from darkening rather than layered elevation.** Needs an eye against the pack.
- **Motion on anything that is not real activity.** Requires knowing what is actually running.
- **The gold *treatment* reading** — `goldOnlyOnAct` proves a resting element does not carry the
  act at act weight. Whether the selection reads as "bloom plus a ring" rather than merely
  not-gold-filled is a taste call.

### Why these two are written against tokens and thresholds, not an eye

Both were corrected by the owner before they ran, for the same reason: *"a check that cries wolf
gets disabled, and then it catches nothing."*

- **`goldOnlyOnAct` resolves the ACT TOKENS from the live document and compares against those** —
  it does not match a hue range. The selection treatment is the SAME hue family as the act; the
  seam between them is **opacity**, not colour (the act is an opaque `--pg-gold-core → --pg-gold →
  --pg-gold-fill` gradient on a `--pg-gold-deep` border; a selected slot is `--pg-gold-bloom` at
  ~.28 alpha plus a ring). A hue-range check fires on every selected slot. Elements that legitimately
  carry the act opt out with `data-act`. If the act tokens cannot be resolved the check returns
  **unverified rather than green** — it never passes vacuously.
  *(Recorded for the design side: there is no `--pg-champagne` token in the pack. The distinction
  asked for is real; that name for it is not.)*
- **`collapseOrder` reads three widths and asserts thresholds**, so the sweep has numbers rather
  than an eye: the band must never disappear, must not change height while the spine is still open,
  and the rail must not compact while the spine is still open.

`npm run harness:selftest-reject` runs seven rows: four fixtures that must turn exactly their own
check red, and **three controls that must stay green**. Two of those controls exist specifically to
prove the checks do not cry wolf — `gold-bloom-selection.html` (a selected slot at bloom weight
beside a marked act button) and `collapse-clean.html` (the correct collapse order). A negative
control only proves a check *can* fail; these prove it does not fire on the legitimate treatment.

Every geometry fixture carries a `[data-scope-band]` so `collapseOrder` is a real arm on every row
rather than a silent skip, and they all share `fixtures/_shell.css` — a fixture that re-typed the
gold tokens would drift from the check it exists to control, and a drifted control proves nothing.
