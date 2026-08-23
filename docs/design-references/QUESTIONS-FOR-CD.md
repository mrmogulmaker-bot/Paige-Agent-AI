# Open questions for Claude Design — operator console

**Standing file.** Questions accumulate here as porting finds them; each is struck when CD
answers. Owner hands these off — CC does not design the answer.

**The bar for being on this list.** A question earns a place only if the pack genuinely does not
draw it. *"I haven't ported it yet"* is not a question — it is CC's work, and 75% of the pack is
in that bucket. Every entry below carries the search that establishes absence (§PACK-FIRST: at
least four spellings, plus the region read), so a claim of silence is falsifiable.

**Struck before it was asked, and worth stating as the pattern:** the Mind's light mode looked
like a design gap and is not one. `mind-brain.js:384` hardcodes `const light = false`, so the
Mind renders dark under both themes — but every lobe in `P.LOBES` already carries a `hueLight`
(`recall #8a6420` · `knowledge #5540b4` · `skills #146b55` …), the renderer already reads
`m.lobes[li].hueLight`, and there is already a light background stop at `mind-brain.js:396`.
**CD authored the light palette; CC never wired the theme through.** That is a bug on this side,
not a question for that one.

---

## 1. A read that FAILS — is that a surface state at all, or is it hers?

**The gap.** The pack draws honest ABSENCE thoroughly — `hasAbsence` / `absenceTitle` /
`absenceBody`, the em-dash rule, `absence-copy.md`'s two authored bodies, and the standing
distinction between `— not on file` and `•••-••-••••`. All of that answers *"there is no
substrate."*

Nothing answers *"there IS substrate, the surface asked for it, and the query broke."*

**The search.** `could not load` 0 · `couldn't read` 0 · `unavailable` 1 · `went wrong` 1 ·
`try again` 1 · `failed` 13 · `error` 33 · `retry` 6 — across the shell, `paige-ia.js` and
`absence-copy.md`. **Every one of the hits is a domain object that failed, not a surface that
failed:** a systems check that errored, an automation whose step failed, a send that failed, a
delivery that failed four runs straight, `llm.error_rate` as a metric, `P.FAULTS`' retry-and-
back-off policy.

**The one hit that is closest is the most interesting.** `v3.dc.html` L10704, inside the spine
transcript: Paige raises an unreadable read *as a question in the conversation* —

> *"Before I go further — b204 has drift I cannot read. How do you want that handled?"*
> `Report it and stop` · `Retry the read once` · `Skip it this run`

So the pack's instinct may be that a failed read is **something she tells you**, not something a
panel displays. If that is the intent, there is nothing to draw and the answer is a wiring rule.

**Why it matters now.** Rounds 4–15 are all wiring rounds. Every one turns a placeholder into a
real read, and a real read can fail. Today a failure would fall through to the absence
treatment — which would be a lie: it would say *"no substrate"* when the truth is *"the query
broke."* That is the same class of defect as a fabricated figure, arriving from the other side.

**The question:** does a failed read render on the surface, or does it surface in the spine as
hers to raise? If on the surface — what does it look like, and is a retry affordance part of it?

---

## 2. Governance — CD deferred it to CC. What is the shape of the handoff back?

**Not a gap; a deliberate hold.** `CLAUDE-CODE-HANDOFF.md`, under *"What is deliberately
unfinished"*: *"**Governance.** Four ledger rows naming what belongs there — Trust Compass, audit
log, break-glass, alert rules. Owner ruling 2026-08-23: **CC defines this surface.** The design
follows the enforcement here rather than leading it."*

The contract's `ledgerFoot` says the same: *"The governance laws are meant to bind here rather
than in RLS: immutable audit, two-key on destructive operations, never-silent break-glass. One of
the three does not hold yet… CC owns this surface; it is named here rather than drawn as done."*

**What CC can supply.** The enforcement is a backend question and it is mine. Two of the three
laws have known state already: the audit log is append-only **by GRANT only** — no constraint, no
trigger — and its read policy is inverted, so tenant admins read operator rows and
`platform_admin` mostly cannot (task #218). Break-glass has no model at all. Two-key exists on
`operator_enter_tenant`.

**The question:** when CC hands over the enforcement model — what each law actually binds, where,
and what it can prove — does CD then draw Governance as a real surface, or does it stay the
four-row ledger the pack already renders? Put differently: **is the ledger the design, or a
placeholder waiting on the enforcement?**

---

## 3. Is "Numbers" a place?

**The divergence.** The pack's `P.DEST.settings.views` is **ten**: Setup · Platform ·
Integrations · Mind · Automations · Alerts · Capabilities · Vault · Governance · Team. Our IA
ships **eleven** — a `Numbers` view added by owner ruling 2026-08-23 when the Twilio work landed.

**Where the pack puts numbers instead.** Not as a view. As **two tabs inside the Twilio vendor
panel**: `P.INT_DETAIL['Twilio SMS'].tabs = ['Connection', 'Numbers', 'A2P', 'Activity']`, with
`P.PHONE_NUMBERS` (4) and `P.A2P_STEPS` (5) behind them. The contract's own comment at
`paige-ia.js:1588` records the owner's split: *"buying is account setup, using is work."*

**Why this is CD's and not mine.** `src/operator/CLAUDE.md`: *"The URL taxonomy is Claude Code's.
Whether a capability IS a place is Claude Design's."* CC has now modelled the same mistake three
times — act-as, agent runs, and Paige herself all turned out to be states rather than addresses.
An eleventh Settings view is exactly the shape of that reach, so it goes to CD rather than being
defended here.

**The question:** does Numbers earn a Settings view, or does it stay the vendor-panel layer the
pack draws? If it earns one, the six-slot / 32-view contract moves and the tier matrix moves with
it.

---

## 4. The sign-out glyph

**Already ruled a place** — owner, 2026-08-23: *"rail foot, third control below Collapse rail,
same treatment as its siblings — `--pg-muted` label, no gold, no accent… Not a summon, not a
confirm dialog. It signs out."* Recorded in `PACK-INVENTORY-v3.md` §10.

**Still owed: the glyph itself.** The pack draws no sign-out control — searched `sign`, `logout`,
`log out`, `exit`, `leave`, `session`, `account`, `Sign out`, `identity`, `avatar`, `profile`,
and read the rail markup at L88–L124: the foot holds exactly two buttons, the theme toggle and
Collapse rail. (`exit` hits only the band's `Exit ⌘⇧X`, which exits a TENANT, not the session.)

**Why it can't wait long.** CD's own finding 5, 2026-08-23: *"At 900 and 640 the rail's bottom two
controls both render as `>` — Collapse rail and Sign out sharing a glyph."* They are the same
rotated-border primitive, and at compact width the glyph is all there is. The owner described the
shape he wants — a door with an arrow leaving it — but **CD draws it**, on the rail's 16-unit
grid at its existing stroke weight (`strokeWidth 1.3`, `strokeLinecap="square"`), so it sits with
the six `P.PLACES` glyphs rather than beside them.

**One measurement to hand over with it, not a preference:** the ruling names `--pg-muted` for the
label, and the foot's two existing controls currently render `--pg-faint` (`--rail-muted` in
`src/index.css`). Those are different tokens. Whichever CD rules, all three should match — the
ruling's own words were *"same treatment as its siblings."*

---

*Every answer lands back in `PACK-INVENTORY-v3.md`; this file only holds what is still open.*
