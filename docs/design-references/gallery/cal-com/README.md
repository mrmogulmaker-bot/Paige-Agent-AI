# Cal.com (cal.com) — taste annotations

Reference bar for: clean scheduling UX, booking flows, availability pickers, and
multi-step "pick a slot → confirm" interactions. Directly relevant to Paige's calendar/
scheduling surfaces (§10 "schedule a calendar meeting"), client-facing booking pages, and
any date/time selection UI. This is CODE-LEVEL taste knowledge — steal-able decisions, not
vibes.

> How this doc is used: when Chrome MCP is available the design critic captures the URLs
> in `SCREENSHOTS.md` and annotates the live pixels. In a headless env the critic reads
> our JSX/CSS against the concrete rules below + the CHEESY-TELLS list.

## Typography
- **Quiet, functional UI type.** Body/UI sits at **14–15px**; the whole booking surface
  reads calm and neutral so the *decision* (which slot) is the focus, not the chrome.
- **Weight, not size, marks the step.** The "Select a Date & Time" heading and the host
  name are ~600 weight but close in size to body — hierarchy is a weight + color step, not
  a big jump. Restraint is the brand.
- **Tabular numerals in the time grid.** Time slots (`9:00`, `9:30`, `10:00`) use
  tabular figures so the column of times aligns perfectly — digits never jitter. This is
  the single most important type detail for any time-picker.
- **Native, fast font stack.** Inter/system stack renders instantly — a booking page must
  feel snappy on a cold load from an email link, so no heavy webfont blocking first paint.

## Color
- **Near-monochrome, near-borderless.** The booking card is a clean white/dark surface
  with soft hairline separation between the host panel, the calendar, and the slot list —
  structure from layout, not heavy boxes.
- **One accent on the selected slot + the confirm.** The chosen time and the primary
  "Confirm" button carry the single accent; unselected slots are neutral outlined pills.
  Same discipline as our gold-on-the-act (§11) — the selected slot is *the act*.
- **Available vs unavailable is semantic, quiet.** Bookable dates are subtly emphasized,
  unavailable ones dimmed — the state reads as data (density of ink), never as loud
  red/green splashed across the calendar.
- **Theme-aware and genuinely light or dark** — the booking page respects the host's
  theme and both modes are real (§23), not one hardcoded look.

## Motion
- **Fast, purposeful step transitions.** Picking a date slides the time-slot column in;
  confirming advances to the details form — **~150–200ms ease-out**, enough to show the
  flow is one continuous act, never a jarring full-page reload.
- **Slot selection is instant.** Tapping a time immediately highlights it and reveals the
  next step — optimistic, no spinner between "I picked" and "now confirm."
- **Layout-shift is animated, not snapped.** When the time column appears next to the
  calendar, it eases in rather than popping — the two-pane expansion feels deliberate.
- Reduced-motion collapses transitions to instant; the flow stays fully usable.

## Layout
- **Three-zone booking card: host context · calendar · slot list.** A left panel (who
  you're meeting, duration, location), a month calendar, and a scrollable list of times —
  a clean, learnable spatial model that never makes the user hunt.
- **Progressive disclosure, one decision at a time.** Date first → then times → then
  details form. Each step shows only what's needed now; the multi-step flow never dumps
  every field at once. Steal this for any Paige multi-step intake.
- **No hero banner — the booking card *is* the page.** Opens straight into the decision
  (§11). The host avatar + name is the only "masthead," and it's contextual, not
  decorative.
- **Responsive collapse to a single column** on mobile: host context stacks above the
  calendar, which stacks above the slots — the same three zones, re-flowed, never a
  cramped desktop layout squeezed onto a phone.

## Density
- **Comfortable tap density for the grid.** Time-slot pills are generously tappable
  (~40px targets) — this is a *selection* surface used on phones, so touch density beats
  cramming. Match density to whether the surface is scan-heavy (tight) or tap-heavy (roomy).
- **The slot list scrolls; the calendar doesn't page.** Times overflow into a scroll
  column rather than paginating — you see the shape of the day and scroll, never "next 5
  times."
- **Empty/blocked states are explicit.** A fully-booked day shows a clear "No available
  times, try another day" with the next-available nudge — never a silently empty column.
- **Confirmation is a real crafted state**, not a bare alert — a clean summary card of
  what was booked, with the add-to-calendar action. The end of the flow is designed.

## What to steal for Paige
1. Tabular numerals in every time/slot grid so the column of times aligns — the #1
   time-picker detail.
2. One accent on the selected slot + confirm only (our gold-on-the-act), unselected slots
   are neutral outlined pills.
3. Progressive disclosure: date → time → details, one decision per step — reuse for any
   Paige multi-step intake/scheduling flow.
4. Three-zone spatial model (context · calendar · slots) that re-flows to one column on
   mobile, never a squeezed desktop layout.
5. Roomy tap targets on selection surfaces (match density to the interaction, not a blanket
   number).
6. Crafted confirmation + explicit blocked-day states — never a bare alert or silently
   empty column.

## Cheesy-tells this reference rules out
- Proportional (non-tabular) figures in a time grid so the column of times jitters.
- Loud red/green splashed across the calendar for available/unavailable instead of quiet
  ink-density.
- Dumping every booking field on one screen instead of progressive date→time→details.
- A decorative hero banner above a booking card that should open straight to the decision.
- Cramped desktop time-grid squeezed onto mobile instead of a real single-column reflow.
- A bare browser `alert()` / blank confirmation instead of a crafted booked-summary state.
