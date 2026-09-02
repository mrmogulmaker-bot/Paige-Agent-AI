# Solo Settings scroll and release playbook

**Status:** shipped on `main` by PR #683 on 2026-09-01. Read this before changing Solo
Settings reachability, scrolling, the contextual Settings rail, or its release proof.

## The owner outcome

A correctly authenticated Solo owner can use every long **Settings → Connections** surface
(including Calendars) and **Settings → Integrations**, immediately perceive and operate the
vertical scroll affordance, reach the last supported control by pointer, keyboard and focus
navigation, switch destinations or Connections segments without inheriting a stale position, and
fold or open the one PAIGE workspace without clipping, horizontal overflow or a second scroll
owner.

This is a usability contract, not a CSS preference. A hidden-scrollbar rule, a short surface that
fits, a green fixture, or a geometry-only assertion cannot override it.

## Ownership and scope

| Surface | Scroll policy | Product owner |
|---|---|---|
| Connections → Communications | Visible Settings scroll owner when content overflows | Communications identity/readiness |
| Connections → Calendars and other Connections segments | Same visible owner; a segment switch resets to top | Calendar-account/configuration readiness |
| Integrations | Same visible owner for catalogue browsing | External-tool bridges and safe handoffs |
| Other Settings destinations | Preserve established form-fit/paging; do not widen this exception | Existing Settings owners |
| Command Center, Clients, Campaigns/Growth, Compass/Mind, Analytics | Design-locked outside this exception | Existing feature owners |

Connections and Integrations remain separate top-level Settings destinations. Phone, A2P, sending
identity, communications health and calendars do not move into Integrations. Exactly one PAIGE
workspace remains the shell contract.

## The one physical scroll owner

`settingsScrollOwner()` in `src/solo/settings-scroll-owner.ts` resolves:

1. the nearest `[data-solo-screen-host]` in the real Solo shell;
2. otherwise `#tenant-shell-main` for bare unit/drive mounts;
3. otherwise no owner—proof must fail closed rather than silently fall back to the document.

`SoloSettings` applies the shell's shared `SETTINGS_SCROLL_OWNER_CLASS` only for `connections`
or `integrations`. `src/solo/settings.css` names the real screen host plus both Settings
classes, restores `overflow-y: auto`, keeps `overflow-x: hidden`, reserves a stable gutter and
restores the themed WebKit track/thumb. No Settings child creates a nested scrolling region.

Do not re-derive the owner in a segment, card, catalogue or test. The historical failure was two
resolvers agreeing in name while targeting different DOM elements after the shell changed.

## Position and focus are navigation state

The physical owner carries one `scrollTop`, so transitions reset it deliberately:

- top-level Settings destination changes reset after the destination commits;
- Connections URL-segment changes reset;
- internal Connections changes notify `SoloSettings` through `onSegmentChange` and reset after
  React commits the destination;
- the acceptance contract requires focus inside the owner so `PageDown`, `Space`, `Shift+Space`, `Home` and `End` work
  from the ordinary arrival state;
- folding/opening navigation or PAIGE must not steal focus from the owner or a descendant.

Resetting in a disappearing control's click handler is too early: the target has not committed and
focus can fall to `<body>`. Depending only on an optional route segment is also wrong: ordinary
visits may omit it while the internal view still changes.

## Proof ladder — what each class of evidence can say

| Evidence | What it can prove | What it cannot prove |
|---|---|---|
| Static/unit tests | Shared symbol, selector precedence, scoped class toggle, reset callback and drive requirements | Actual overflow, reachability or browser rendering |
| Hand-built fixture | A narrow CSS/interaction hypothesis | The shipped shell chain or real owner |
| Reproduced-shell component drive | Real `SoloSettings` and `TenantCommandCenterShell` behavior inside the harness's manually reconstructed Solo screen host | The actual `SoloApp` wrapper/policy or authenticated production |
| Preview/deployment inspection | Exact artifact, target, READY state, aliases and logs | A signed-in tenant's usable flow |
| Authenticated runtime | The correct tenant/account can execute the human flow | Wrong or ambiguous accounts are `INVALID`, not evidence |

The project-native reachability drive is `scripts/live-drive/settings-scroll-drive.mjs`. It mounts
the real `SoloSettings` and `TenantCommandCenterShell`, but
`scripts/live-drive/harness/settings-mount/main.tsx` manually reconstructs `SoloApp`'s
`.paige-solo` and `[data-solo-screen-host]` wrapper. It is strong structural-rendered evidence,
not actual-`SoloApp` proof.

At **1536×770, 1366×768, 1024×768 and 900×1000**, in Mineral and Obsidian, with navigation and
PAIGE open/folded, the reproduced-shell drive checks:

- computed owner, `scrollHeight`, `clientHeight` and terminal-content reachability;
- visible owner class/gutter;
- wheel/trackpad-equivalent input, PageDown, Space and End;
- sequential focus to the last supported control and a return path;
- route/segment reset, no nested scroll trap, no body/document vertical scroll and no horizontal
  overflow;
- reduced motion and exactly one PAIGE workspace;
- a negative control that removes the overflow grant and must fail.

`connections-calendars-drive.mjs`, `connections-calendars-scroll-drive.mjs` and
`integrations-fit-drive.mjs` are focused supporting drives, not actual-`SoloApp` replacements.

**Current proof gaps:** the actual `SoloApp` wrapper, Shift+Space, and an independent per-surface
Home assertion remain `UNVERIFIED`. The drive's only Home press is followed by PageDown and asserts
only `scrollTop > 0`; a broken Home key can still pass. Connections and Calendars receive no Home
assertion.

`docs/doctrine/tier-matrix.md` currently says this drive mounts the “REAL merged `SoloApp`.”
That claim is stale and is corrected by this record. The tier matrix was not edited here because
active PR #675 owns it; its owner must preserve this correction on rebase.

If automation or the operating system cannot expose a native scrollbar thumb/track, mark that
specific native observation `UNVERIFIED`. Geometry or a simulated drag cannot prove native
appearance.

## Harness reliability is product-proof reliability

A drive that measures the wrong server can report a perfect result for stale code. Every Settings
drive that starts a server must:

- fail if its fixed port is already occupied;
- own the server process/group it starts;
- close pages and browser contexts;
- terminate the process tree on success **and** failure;
- verify the port is released before exiting.

Do not repair a product failure by weakening the drive, substituting a surface-only fixture, or
treating `FITS` as evidence that overflow works. Classify every
destination honestly as `OVERFLOWS` or `FITS`.

## Collision and release discipline

File non-overlap is not enough. Re-ground active PRs for shared route, CSS, shell, selector, test and
behavioral ownership. PR #683 overlapped active drafts in Settings product/CSS files and a harness
stub; the owner explicitly chose immediate release and those drafts remained untouched. A future
rebase preserves both sides' assertions rather than deleting the harder coverage.

Release only an exact reviewed head. After merge, verify independently:

1. PR head, changed-file scope, checks, mergeability and squash commit;
2. current `main` and tree;
3. exact Vercel deployment is `READY`, targets production and lists public aliases;
4. the public entry manifest **and lazy-loaded `SoloApp` JavaScript/CSS chunks** contain the
   behavior—checking only `index.html` or the main bundle can falsely report absence in this
   code-split application;
5. deployment-scoped error logs;
6. the correct authenticated Solo flow, or `UNVERIFIED` with the missing browser/account/input.

Never turn a browser-control failure into a product failure. Never turn a deployment badge, bundle
string, structural drive or owner-supplied login claim into authenticated runtime proof.

## Shipped record — PR #683

- Reviewed head: `a6f75da4e82d19638721863f1b6e5bd867345cd0`
- Squash commit: `8e76f8804d203ff05f469337d0db1ef25c4ad148`
- Squash tree: `9cae1b68b693f5ae256c5a3ceb83f83bac04fba6`
- Scope: 13 files—Settings behavior/CSS/test plus affected live-drive harnesses
- Vercel deployment: `dpl_DZc4TErhkDJb1NSqW7jfsHhmvQtm`
- GitHub deployment record: `6202617795`
- Deployment: `READY`; aliases include `paigeagent.ai` and `app.paigeagent.ai`
- Deployment error-log scan at release: no error entries returned
- Source branch retained: `claude/settings-scroll-reachability`
- Production bundle proof: the lazy Solo chunk contains the Connections/Integrations toggle and
  reset callback; the lazy Solo stylesheet contains the real-host overflow rule, stable gutter and
  themed scrollbar selectors
- **Authenticated First Sterling Capital interaction, actual-`SoloApp` wrapper, Shift+Space, Home-key pathway, and direct native-scrollbar observation:
  `UNVERIFIED` at release.** The desktop browser-control bridge failed at the Windows sandbox
  boundary. No wrong-account or static evidence was promoted to a pass.

No provider, OAuth, credential, billing, Supabase, calendar, communications or tenant/business data
mutation occurred in release verification.

## Before the next Settings scroll change

1. Read this file; treat the tier-matrix “REAL SoloApp” sentence as stale until its owner corrects it.
2. Name the affected actor flow and intended usable outcome.
3. Re-ground current `main`, the actual shell owner and active PR collisions.
4. Add a failing-first assertion that detects the first incorrect state.
5. Add actual-`SoloApp`, Shift+Space and independent Home assertions, then run all four viewports.
6. Review source coverage, cross-flow reset/focus, tenant/account evidence, accessibility, scroll
   ownership, cleanup and assertion quality—in that order.
7. Keep authenticated, native-input and production claims `UNVERIFIED` until directly exercised.
8. Update this record and sweep the complete knowledge home for claims the change falsifies.

## Canonical sources

**Shell-wide questions go to `docs/doctrine/solo-shell-contract.md`** (added 2026-09-02) — the one
door to the canonical Solo shell: one shell for every tenant, address-vs-authority, the CSS-clip
interaction policy, the four-viewport proof bar, and which test or drive enforces each rule. This
playbook stays the Settings-scoped record; it is not the shell contract.


- `src/solo/settings.tsx`
- `src/solo/settings.css`
- `src/solo/settings-scroll-owner.ts`
- `src/components/tenant-shell/settings-scroll-contract.ts`
- `src/solo/settings.scroll-policy.test.tsx`
- `scripts/live-drive/settings-scroll-drive.mjs`
- `scripts/live-drive/connections-calendars-drive.mjs`
- `scripts/live-drive/connections-calendars-scroll-drive.mjs`
- `scripts/live-drive/integrations-fit-drive.mjs`
- `docs/doctrine/tier-matrix.md` — Connections/Calendars proof and honesty boundary

---

## Setup is the one destination this contract does not yet cover (2026-09-02)

The table at the top of this playbook binds every Settings destination other than Connections and
Integrations to *"preserve established form-fit/paging"*. **Setup does not form-fit, and never has.**
Measured at `origin/main` `05735f26b6cb8c0e915c18c2d152025f43f958c6`, reproduced-shell drive with
PAIGE folded:

| Viewport | Host | Setup content | Below the fold | Scrollbar |
|---|---|---|---|---|
| 1536×770 | 704 px | 3,986 px | 3,282 px · 82% | none, either lane |
| 1366×768 | 702 px | 3,986 px | 3,284 px · 82% | none, either lane |
| 1024×768 | 702 px | 3,973 px | 3,271 px · 82% | none, either lane |
| 900×1000 | 934 px | 4,174 px | 3,240 px · 78% | none, either lane |

`settings-scroll-drive.mjs` scores **1384/1392**, and **all 8 failures are Setup** —
`setup · fits — nothing clipped`, one per viewport/theme. Every other destination fits its host
exactly. This is not a regression introduced by #683; it is what #683's narrow, correct scoping left
behind, now measured.

**The mechanism, so nobody re-derives it.** `SoloSettings` applies
`.tcs-main--settings-scrollbar-hidden` to the resolved owner for *every* destination, which trips the
`solo-tokens.css:106` exception and gives the host `overflow-y: auto`. It applies
`SETTINGS_SCROLL_OWNER_CLASS` (`--shown`) only for `connections` and `integrations`. So Setup **can**
scroll and **cannot** show that it scrolls: `scrollbar-width: none` and
`::-webkit-scrollbar { display: none }` both apply. Wheel and keyboard reach the last field; a human
arriving on the page has no way to know there is a last field.

**Do not classify this as a reachability bug.** It is a missing affordance on a surface that is
five to six times its own host, and the fix is a design decision, not a CSS repair. Four shapes were
measured and put to the owner on 2026-09-02: as-shipped, a section pager, granting Setup the visible
scroll, and a rail-plus-scrolling-region inside a form-fitting page.

**Two findings that constrain any fix:**

- **A one-section pager does not close it alone.** Carrier identity is 797–828 px reading and
  955–986 px editing — taller than the whole 702 px host before page chrome (240–306 px) is
  subtracted. In editing mode five of seven sections exceed what a pager could give them at 768 px.
- **Granting Setup a visible scrollbar needs a new explicit owner ruling.** The exception in the
  table above is deliberately narrow. Widening it is a product decision, not an implementation
  detail, and no session may take it on its own.

**And the proof bar has a hole in it.** The harness that produced these eight cases does not actually
apply the theme to the rendered shell — see *"A green drive proved geometry twice, not two themes"*
in `lessons-learned.md`. The geometry above is sound because it is theme-independent and was
byte-identical across both runs; **Obsidian rendering is `UNVERIFIED`**, and repairing the harness is
a prerequisite for proving any Setup change, not an optional extra.

Full department record, including the PAIGE seam, the Rail gap and the open owner decision:
**`docs/doctrine/surface-cards/setup.md`**.
