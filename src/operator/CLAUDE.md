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

### …but the goal is the BEST result, not frozen fidelity (owner, 2026-08-19)

The lock above is about *who decides*, never about *settling*. The owner amended it in his own
words: *"Claude Design's Design Pack, I think, should be one source of truth for sure when it comes
to our design level, but if we can find ways to improve what they've done, I'm all for that. **The
source of truth is reaching the best that we can.** … There are several things Claude Design could
not pull off, but if we can pull it off in code, by all means suggest it to me. I'll run it back
with Cowork, and we can absolutely go for it."*

So the posture is **actively look for improvements and PROPOSE them** — not "never deviate," and
equally not "improve it quietly." Concretely:

- **Propose, don't ship.** Spot the improvement, name it, say what it costs, and let the owner rule.
  A proposal costs a sentence; a silent deviation costs the trust the lock protects.
- **The pack is a static design tool's output.** It cannot reach a database, run an LLM, or hold a
  session. Wherever it draws a *fixture* because that was its only option — invented prose, a
  hardcoded hex, an index-seeded layout — that is a place code can genuinely do better, and saying
  so is the job, not a criticism of CD.
- **The pack can contradict itself.** It is authored, not compiled. (Verified 2026-08-19: the Fleet
  tab registry at L4319 lists five tabs but `P.pipe` defines a fully-designed sixth; and the Tenants
  surface is painted TWICE — `isFleetConsole` at L348 and `P.console` at L6658 both render, because
  the panel guard at L6544 does not exclude `console`.) When the pack disagrees with itself, pick
  ONE home (§18), say which and why, and flag it.
- **An accepted improvement gets written down where it was made** — a header comment naming the
  owner ruling and the date, so a later session does not "restore pack fidelity" by reverting it.
  The R3F field rebuild (`FleetOrbit.tsx` / `FleetOrbitScene.tsx`) is the worked example.

**The pack is the ONLY design reference — a screenshot never is.** Owner-ruled 2026-08-19:
*"The Design Pack should have to be your only reference. I send screenshots to show what's live."*
The pack says what a surface SHOULD be; a screenshot he sends says what it CURRENTLY IS, which is
usually evidence something is wrong. Open the pack, compare, fix the delta — never "match the
screenshot," because a screenshot of a broken surface is a picture of the bug, and building toward it
cements the defect. (CD's own renders under `uploads/`/`screens/` are a fast correctness check, but
where a render and the `.dc.html` disagree, the markup wins.)

**The pack lives in the repo, not in a scratchpad.** `docs/design-references/cd-packs/super-admin-shell/`
· the shell itself is `Super Admin Shell.dc.html` (~8,300 lines), with the pack's own backend notes
(`*-notes.md`), route registry (`paige-routes.js`, `route-registry-notes.md`) and reference renders
(`uploads/*.png`) beside it. It was committed on 2026-08-19 because until then it existed ONLY in an
ephemeral session scratchpad — one container recycle from being lost, with the source of truth gone.
The CRM agency-mode pack (`agency-mode-shell/`, 12,864 lines) covers agency AND sub-account in
one shell and landed the same day; it governs those tiers exactly as this one governs the operator.

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
