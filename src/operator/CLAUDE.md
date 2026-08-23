# The operator console follows the Claude Design pack. Verbatim, until the owner says otherwise.

**Owner-locked 2026-08-19.** Antonio, after finding the Paige chat pane off-design:
*"Why can you not just follow the design pack from CD?"* · *"If Claude Design made it. That's how
it's supposed to be moving forward. Whatever we had before CD. Is not longer valid. None of it!"* ·
*"Give me my entire damn design in its entirety. I mean, mimic it down to the hair, nothing less."*

This file auto-loads for any session working under `src/operator/`. That is deliberate: a rule that
lives in a doc someone has to remember to open is a rule that gets skipped, which is exactly how the
pane below went off-design. Nothing here needs looking up — it is already in your context.

---

## THE LOCK

**Claude Design's pack IS the design.** Every operator surface renders what the pack draws. Not
"inspired by," not "close enough," not "the spirit of." The pack.

**A deviation requires an explicit owner instruction naming the exact thing to change.** Not your
judgment that something would be better. Not a verifier's finding. Not a doctrine section you think
applies. If you believe the pack is wrong somewhere, **raise it and let the owner decide** — do not
quietly improve it. This mirrors §28 (approved design is frozen): the pack is the approved design,
and it is frozen the same way until he unlocks a specific piece of it.

**The pack is the ONLY design reference — a screenshot never is.** Owner-ruled 2026-08-19:
*"The Design Pack should have to be your only reference. I send screenshots to show what's live."*
The pack says what a surface SHOULD be; a screenshot he sends says what it CURRENTLY IS, which is
usually evidence something is wrong. Open the pack, compare, fix the delta — never "match the
screenshot," because a screenshot of a broken surface is a picture of the bug, and building toward it
cements the defect. (CD's own renders under `uploads/`/`screens/` are a fast correctness check, but
where a render and the `.dc.html` disagree, the markup wins.)

**THE PACK IS v3. THE OLDER PACKS ARE DEAD — owner-locked 2026-08-23.**

```
docs/design-references/cd-packs/super-admin-shell-v3/     <-- THE ONLY PACK
    PAIGE Super Admin Shell v3.dc.html    11,358 lines — the shell
    PAIGE Platform Operator - standalone.html            — the standalone render
    design-system-port.md                 the --pg-* system, the faces, the Command Mark
    paige-brand-identity.md · absence-copy.md · campaigns-catalog-sales-spec.md
    paige-ia.js · mind-brain.js · support.js · github.md · corrections-2026-08-23.md
```

Everything in it is IN THE REPO. Nothing about this design has to be invented, inferred,
reconstructed from a screenshot, or reconciled with anything we built before it.

**`super-admin-shell/` (the ~8,300-line pack) and `agency-mode-shell/` are SUPERSEDED.** They are
kept only so a past decision can be traced. Do NOT build from them, do NOT diff against them, do
NOT cite them as authority. Until 2026-08-23 this very section named the old pack as "the pack" —
which is why sessions kept building toward a design the owner had already replaced. That was the
bug in the doctrine, not in the work.

**The owner's ruling, verbatim (2026-08-23):** *"None of the colors, design, logos, or anything
from the previous work that we've done matters. If we have rules in place, we need to change them
to adopt them to what we currently have now that was provided by Claude Design… There's nothing
about our design that needs to go anywhere near the direction of our previous design."*

So the standing posture is **PORT, not design.** Before calling anything on an operator surface
missing, blocked, or undecided, GREP THE v3 PACK FOR IT. It is an 11,358-line file and it contains
far more than any one session has read. Worked example, 2026-08-23: the command palette and six
"unreachable" surfaces were about to be scoped as a design blocker; the pack carries 115 `summon`
references, 24 `palette`, 3 `⌘K`, Calendar ×33, Compose ×52, Integrations ×18. None of it was
missing. All of it was unported. **A capability that is drawn in the pack is never a blocker — it
is a port that has not happened yet.**

---

## JURISDICTION — see root `CLAUDE.md` §00. ZERO input on design.

> **"You own the backend. Claude Design owns the frontend."**
> **"No, my friend, you have no input, ZERO input on the design. You have all of the control
> over our backend."** — Antonio, 2026-08-23

The full rule is root `CLAUDE.md` **§00**, which loads on every run and overrides every section
below it. The short form, because this file loads whenever a session touches `src/operator/`:

- **CC writes the port and owns the backend.** Turning the pack into working code is CC's work.
  Writing it is not deciding it.
- **CC has no design input of any kind** — no verdict, no proposal, no observation, no "worth an
  eye on." A frame is EVIDENCE handed to CD: address, theme, width, measured geometry, faces
  loaded. Nothing else.
- **A measurement is not an opinion.** Contrast, type sizes, grid tracks, a 404ing control, a
  surface that does not render — those are facts about whether it WORKS and CC reports them.
  What to do about them is CD's.
- **If it is not in the pack, ask CD.** CC never fills a design gap.
- **Every subagent CC dispatches inherits this.** No agent debates UI.

An earlier version of this very section said CC "reports it, with a frame and a measurement, and
lets CD rule." That was still input, and it was corrected the same day. Zero means zero.

---

## "IS THIS THING A PLACE?" — the default answer is NO (Claude Design, 2026-08-23)

**The URL taxonomy (§65) is Claude Code's. Whether a capability IS a place is Claude Design's.**
That seam matters because CC has now modelled the same mistake three times, and each time it
arrived looking like a routing question.

**In this shell, SIX SLOTS ARE PLACES. Almost nothing else is.** A capability that is not one of
the six is, by default, a **state** or a **surface** — something that changes what you are looking
at or what scope you are in — not an address you can navigate to, bookmark, or link.

**The three that turned out not to be places:**

| Modelled as | Actually is |
|---|---|
| `act-as` a tenant | a SCOPE CHANGE — the operator's session enters a tenant; the address does not become the tenant |
| agent runs | a SURFACE — work streams where you already are |
| **Paige** (`/operator/paige`) | **the SPINE.** CD: *"A reference to her is not a route, it's an action that opens the spine and focuses the command bar… she's present in every surface, which is the whole point of the execution strip."* |

**The pack having no address for something is EVIDENCE, not an omission.** CD: *"The pack has no
address for her because there isn't one."* When CC cannot find a route in the pack for a capability
it is porting, the first hypothesis is that the capability is not a place — not that the pack is
incomplete. Ask CD; do not assign it an address.

**The tell, and CC must watch for it in its own work:** *"If a later session finds itself wanting
`/operator/paige`, that's the signal she's been modelled as a place again."* Generalised — **if you
are reaching for a new top-level operator route to reach a capability, stop.** That reach is the
symptom. Take it to CD before writing the route.

**A control to a place that does not exist gets REMOVED, not repointed.** Not disabled, not left
dead, not pointed somewhere plausible. CD, on this exact case: *"A control that opens an empty
spine asserts a capability that isn't there."* Same reasoning as collapsing an empty spine to 0 —
applied to the control instead of the track. When the capability is genuinely wired, it returns as
a control (expand the spine, focus the command bar), never as a URL.

---

## THE ONE RULE THAT DECIDES EVERY CASE

> **Structure is design. Values are data.**

**Comes over VERBATIM** — the pack's geometry, spacing, radii, type scale, tokens; every KPI label
and unit; block titles, subtitles and foots; column headers; group chips; the anchor strip;
placeholder text; button labels; empty-state wording; the closing footer lines. A tile reading
`OVERALL —` above the pack's real 13-category grid **is** the design, waiting for data.

**Does NOT come over** — the pack's invented figures, tenant names (`Meridian`, `Ashford`,
`Harbor & Vine`), fake chat titles, token counts, timestamps, and written-in prose. Those are
fixtures. They render from a real read, or they render as an honest absence (`—`, or a stated gap).
Never a fabricated number or a real-sounding name (§13, §63).

An empty card is **not** the design. A stand-in paragraph where the pack draws a surface is **not**
the design. Both have already been shipped once and rejected.

---

## THE FOUR WAYS THIS HAS ACTUALLY GONE WRONG

Each of these shipped. Each was caught by the owner, not by us. Do not repeat them.

1. **The registry emitted one empty "not connected" card for all 78 tabs.** Everything typechecked,
   every test passed, every tab resolved a spec — and every screen was blank. *Counting keys proves
   the tree is addressed and proves nothing about what anyone sees.* Assert on rendered CONTENT.

2. **Components were imported and never rendered.** Six purpose-built surfaces (`CalendarMonth`,
   `SupportThread`, `ComposeSurface`, `MarketplaceReview`, `CalendarWeek`, `IntegrationsGrid`) were
   imported by `OperatorApp` and referenced nowhere, so those tabs showed the generic stand-in. An
   unused import still typechecks and still lints. `bespokeSlots.test.tsx` now pins the dispatch by
   name and RENDERS each panel — keep it that way.

3. **A picture of a working capability replaced the working capability (§58).** The pack draws a
   chat; the platform HAS a chat (voice, artifacts, thread history, streaming). Shipping the pack's
   static markup gave a beautiful dead surface.

4. **…so the next pass mounted the old component inside the pack's shell — and never stripped its
   wrapper (§30).** That is where the duplicate "New chat" button, the "Your Paige" hero card and the
   nested chat list came from. Nothing designed those; they are leftovers from a wrapper that should
   have been removed. The tell is exactly what §30 says: the surface *"feels like it's laying on top
   of the old design."*

**(3) and (4) are the same false choice made twice, in opposite directions.** The job is never
*the pack's design OR the working engine.* It is **the pack's design RENDERED BY the working
engine** — take the pack's markup apart, rebuild it as components, and drive it from real state.
That is more work than either shortcut. It is the work.

---

## THE PACK HAS BEEN READ IN FULL — `docs/design-references/PACK-INVENTORY-v3.md`

**Owner instruction, 2026-08-23:** *"grep everything… let me know once you get to 100%"* ·
*"don't miss a single file"* · *"I want all of your findings, every single line of your
findings, inside of my code."*

All 18 pack files (3,678,312 bytes / 20,978 lines) are now read and inventoried in
`docs/design-references/PACK-INVENTORY-v3.md`. **Before claiming anything about this pack —
what it contains, what it omits, what is ported — read that file.** It carries:

- every one of the shell's **183 render blocks** and **249 `sc-for` collections**, in order;
- all **49 surface builders** with pack line counts and a measured port percentage
  (**442 of 1,774 authored strings present in `src/operator/` — 25%**);
- the full `renderVals` dispatch table, so every surface's guard is known;
- all **96 `paige-ia.js` catalogues** with exact item counts (evaluated, not estimated);
- the **13-rule fidelity contract**, CD's **18-round install plan**, and rulings **R1–R7**;
- **seven pack self-contradictions**, recorded and deliberately unresolved (§00 — CD rules);
- **seven items owed from CD**, and the standing edits that must survive a re-delivery.

Two facts from it that change how a session starts:

1. **`stage2-design-package.md` carries a SUPERSEDED token set.** Its colour tables, type
   stacks and radii differ from the shipped `.dc.html`. Port tokens from
   `design-system-port.md` or the shell itself — never from that file.
2. **`PAIGE Platform Operator - standalone.html` is the same design, compiled.** Proven by
   unpacking its blobs and diffing. Screenshot target only; never a source.

---

## PACK-FIRST — `docs/design-references/PACK-FIRST.md`

Before any UI work here, and again before any report that says something is missing: **the pack is
CODE, not a spec.** Search it at least four ways and show the spellings. `PORT-SPEC-palette-and-six-
surfaces.md` (99KB, line-cited) may answer it outright. Full rule in root `CLAUDE.md` §00.

---

## BEFORE YOU TOUCH AN OPERATOR SURFACE

1. **Open the pack's block for that exact surface.** Not memory, not a screenshot, not the route
   registry — the pack. (The nav says `growth`; the pack renders **Marketing**. The pack won, and
   reading the registry instead is how that shipped wrong.)
2. **Port the structure verbatim.** Labels, units, titles, subs, foots, headers, chips, placeholders,
   geometry, tokens.
3. **Wire the values to a real read** — or render the honest absence. Never a fixture.
4. **If a capability already exists, the pack's drawing of it is the SKIN, never the replacement.**
   Strip the old wrapper (§30) rather than nesting it; compose the pack's shell around the real
   engine.
5. **No duplicate chrome.** One "New chat", one chat list, one home per capability (§18/§21). If the
   pack's rail owns the list, the pane does not also draw one.
6. **Every control is real or honestly inert.** A control that silently does nothing is a defect —
   either wire it or have it say what it needs. (A `<span>` styled as an avatar with no menu behind
   it is how the operator ended up unable to sign out.)

## STILL BINDING ON TOP OF THE PACK

The pack governs what it draws. It does not waive the platform's own rules, and these are not
"deviations" — the pack was authored to them:

- **§13 honesty** — no invented figure or name, ever, including ones the pack itself contains.
- **§11 gold discipline** — gold is spent on the primary act only; never a resting border or tint.
- **§23 light AND dark** — token-only, AA in both. The owner runs light mode; check it there too.
- **§9/§51/§53** — what a surface may READ is decided by the server, never by the design. The pack
  shows a God-tier view; a scoped `platform_admin` still only sees what RLS permits.
- **§58** — never silently drop a shipped capability to make a surface match a drawing.

**The test, every time:** *"Did I open the pack for this surface and render what it draws — structure
verbatim, values real — or did I build from memory, from a screenshot, or from what was already
there?"* If the owner can put his render beside ours and see a difference he did not ask for, it
isn't done.
