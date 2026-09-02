# Surface card — Setup (Solo)

**Truth label: `PARTIAL`.** Setup stores and governs business truth correctly. **The owner cannot
read most of it.** 78–82% of the surface sits below the fold on arrival at every supported laptop
height, and the shell draws no scrollbar there, so nothing signals that six of seven sections exist.
Legs 1, 3 and 6 of the build path fail. See *Owner job and user flow* and *Rail outcome*.

Written 2026-09-02 by applying the Alignment Standard's build path to the Setup capability, against
`origin/main` `05735f26b6cb8c0e915c18c2d152025f43f958c6`.

**The code this describes is LIVE ON PRODUCTION.** So is the defect. This card is a shipped
department's record, not a proposal — and the reason the label matters rather than being paperwork
is that an owner is sitting in front of the hidden 82% right now.

**Setup is NOT declared in the Spine registry.** `supabase/functions/_shared/paige-spine/registry.ts`
declares exactly one capability today (`PIPELINE_DEAL_STAGE_EVIDENCE`). Setup should be declared, and
cannot be declared *complete* for the same reason Team cannot: the registry requires
`outcome.railVisibility`, and Setup has none.

**No repair is authorized by this card.** A design direction is with the owner (below). Writing this
does not move the label, and nothing here has been implemented.

---

## Owner job and user flow

An owner or admin records the business truth PAIGE may reason from: who the business legally is, the
carrier-verifiable sender identity, who represents it, what it sells and to whom, where it is going,
and the boundaries PAIGE must not fill with assumptions. One screen, seven sections, 34 text fields.

**The flow is broken at its first step, and this is measured, not inferred.** Reproduced-shell drive
at `05735f26`, PAIGE folded, both theme settings, 4 viewports — the eight cases the shell contract
requires:

| Viewport | Host | Content | Hidden on arrival | Host `overflow-y` | Scrollbar drawn |
|---|---|---|---|---|---|
| 1536×770 | 704 px | 3,986 px | 3,282 px · **82%** | `auto` | **none, either lane** |
| 1366×768 | 702 px | 3,986 px | 3,284 px · **82%** | `auto` | **none, either lane** |
| 1024×768 | 702 px | 3,973 px | 3,271 px · **82%** | `auto` | **none, either lane** |
| 900×1000 | 934 px | 4,174 px | 3,240 px · **78%** | `auto` | **none, either lane** |

No horizontal overflow at any case. `scripts/live-drive/settings-scroll-drive.mjs` scores this
**1384/1392, with all 8 failures on Setup** — `setup · fits — nothing clipped`, one per
viewport/theme. **Setup is the only one of the eight Settings destinations that overflows its host;
the other seven fit exactly.**

**The defect is not unreachability — it is a missing affordance.** The host computes
`overflow-y: auto`, so wheel and keyboard do reach the last field, and `.focus()` scrolls to it. What
is absent is any signal that there is anywhere to go: Setup carries
`.tcs-main--settings-scrollbar-hidden` without `--shown`, so `scrollbar-width: none` and
`::-webkit-scrollbar { display: none }` both apply. The owner sees a page that looks finished.

### Per-section geometry — why a pager alone does not close it

| Section | Fields | Reading | Editing |
|---|---:|---:|---:|
| Business identity | 9 | 534 px | 690 px |
| **Carrier identity** | 13 | **797–828 px** | **955–986 px** |
| Representation | people + A2P | 558–577 px | 641–660 px |
| Business model | 5 | 497 px | 817 px |
| Direction | 5 | 497 px | 817 px |
| PAIGE brief | 3 | 341 px | 533 px |
| How PAIGE uses it | read-only | 254–337 px | 254–337 px |

Page chrome above the first section is 240–306 px (header 56–72, intro 124–174, legend 40–60, section
nav 49). **Carrier identity alone is taller than the entire 702 px host before any chrome is
subtracted.** In editing mode, five of seven sections exceed what a one-section pager could give them
at 768 px. A pager materially improves orientation; **it cannot by itself make editing form-fit.**

## Tenant data / domain owner

| | |
|---|---|
| Business brief | `tenants` (`business_brief` jsonb), staged proposal on the same row |
| Legal identity | `tenant_legal_profile` — see the Master Project File's *Setup-owned A2P legal identity* block |
| Registration number | write-only, vaulted; only `businessRegistrationNumberLast4` returns |
| Representatives | selected from `tenant_members` via `useSoloPeople`; Team owns the roster |
| Read | `get_solo_setup_identity()` · `resolve_tenant_domain_identity()` |
| Write | `save_solo_setup_identity(...)` · `dismiss_solo_business_brief_proposal(_proposal_id)` · `stage_solo_business_brief_proposal` (PAIGE's staging seam) |

Client-side contract and validation: `src/solo/settings-setup-contract.ts` (34 named text fields,
provenance per field, E.164 / EIN / NAICS / SIC / ISO-country validation). Hook:
`src/solo/data/useSoloSetupBrief.ts`.

## Solo shell placement

`/solo/{account}/settings/setup` — Settings group, `SoloSetupView` in `src/solo/settings-setup.tsx`,
mounted by `SoloSettings` (`src/solo/settings.tsx:1588`) as the **default and fallback** destination.
Setup is what a Solo owner lands on when they open Settings with no destination named.

Interaction policy: the blanket clip `.paige-solo main{overflow:hidden!important}`
(`solo-tokens.css:83`) with the single scoped exception at `:106` requiring **both**
`[data-solo-screen-host]` and `.tcs-main--settings-scrollbar-hidden`. `SoloSettings` applies the
hidden class to every Settings destination and `SETTINGS_SCROLL_OWNER_CLASS` (`--shown`) only to
`connections` and `integrations` (`settings.tsx:1552`). **Setup therefore scrolls invisibly by
construction, not by accident.**

## States

| State | Behaviour |
|---|---|
| Loading | `.setup-state` status region; spinner suppressed under `prefers-reduced-motion` |
| Load failed | `.setup-state--error` alert naming the cause, with Retry |
| Read | Every fact carries a provenance badge — owner-confirmed · connection-sourced · needs confirmation |
| Edit | `Edit brief` swaps read values for inputs; Cancel restores the **saved** brief, not the draft |
| Save | Validates first; on failure focus moves to the alert summary and the field is `aria-invalid` |
| Saving | Primary action reads `Saving…` and is disabled |
| Saved | Status banner; `prepareOwnerConfirmedBrief` stamps owner-confirmed provenance on every filled field |
| No edit right | `Edit brief` disabled via `canEdit` from the server read |
| PAIGE proposal pending | `.setup-proposal` aside, explicitly marked *not saved*, with Dismiss / Review in draft |
| Empty (first use) | **Not distinctly designed.** A brand-new tenant sees all 34 fields reading "Not provided" — no first-run guidance. Recorded as a gap, not a default. |

## What PAIGE can read

The business brief is injected into her context and she is instructed to use it rather than re-ask:
identity, offers, customers, direction, goals, constraints, voice, operating preferences,
do-not-assume boundaries, and the confirmed representatives. The prompt binds three boundaries
explicitly — the PAIGE workspace URL is never substituted for the real business website; a
representative is an existing active Team member, never a membership change; and email/provider/
payment configuration belongs to Connections, never the brief.

## What PAIGE can propose or perform

| Tool | Seam | Risk |
|---|---|---|
| `propose_business_brief_update` | `stage_solo_business_brief_proposal` → `tenants` | `ordinary` |
| `update_business_profile` | legacy brand-asset compatibility; identity fields route to the same staged proposal | `ordinary` |

**She cannot write business truth at all.** The tool stages a visible proposal an owner must review
and save in Setup. `applySetupProposal` additionally refuses two fields from any proposal — the full
registration number and the authorized representative — so a staged suggestion can never reach the
vaulted number or choose the legal representative. Representative ids come from `crm_list_team`;
inventing an id or adding a person to Team is prohibited.

## Required confirmation / approval

`ordinary` — the normal propose→confirm pause, admin/coach only, with the domain authorization check
in the `SECURITY DEFINER` body so the same refusal applies from the screen and from a sentence.
`ordinary` is correct here precisely because the tool cannot change truth: **the owner's save in
Setup is the approval**, and it is a human action on a rendered surface, not a model-supplied flag.

## Rail outcome and follow-up — **THE SECOND GAP**

**A Setup action emits no Rail event.** `propose_business_brief_update` is absent from
`RAIL_CRM_TOOLS` and `RAIL_ACTION_TOOLS`, and its `WRITE_TARGET` is `tenants`, not `clients` — so
`emitRailForTool` returns at `if (!isCrm && !isAction) return`, before the per-client
`if (!contactId) return` is even reached. An attribution row **is** written to `paige_audit_log`
with `target_type: "tenants"`, and **no Solo surface reads `paige_audit_log`.**

This is the same structural gap as Team, and **the owner has already ruled on it** (Team card,
decision 2, 2026-09-02): a workspace event is not a client event, a Rail event may not carry a null
`contact_id`, and the repair is a distinct tenant/workspace-level outcome projection proposed as its
own **Spine Change Request**. Setup inherits that ruling; it does not get its own second substrate.

**Setup is partly better off than Team, and the difference is worth stating exactly.** PAIGE's Setup
action produces something the owner *can* see — the staged proposal renders in the surface itself,
above the fold, before the section nav. So leg 7 is not wholly absent here. But it is visible only in
the surface whose first-step defect is recorded above, and only for a *proposal*; a dismissal, and
the attribution of who staged what, are invisible everywhere.

## Dependencies, collisions, and required browser proof

- **Depends on:** the canonical Solo shell and its screen host (`SoloApp.tsx`), the Settings scroll
  owner (`settings-scroll-owner.ts`, `settings-scroll-contract.ts`), `current_user_tenant_id()`,
  `get_paige_persona_context()`, `useSoloPeople` (Team's roster), `resolve_tenant_domain_identity`,
  the action-risk policy and the confirmation gate.
- **Boundary held:** Setup owns business truth; **Team** owns people, invitations, access and roles;
  **Connections** owns email, provider and payment configuration. The surface states this in copy and
  links out rather than duplicating either.
- **Collision, active — `src/solo/settings.tsx`** is contended by open PR #724 *and* open PR #674.
  It is the file that mounts `SoloSetupView` and owns both scroll effects. **`src/solo/settings.css`**
  is contended by #674, whose branch shares no ancestry with `main` (the 2026-08-31 re-root) and
  cannot be merged by git. Any Setup repair must be scoped to the uncontended files —
  `settings-setup.tsx`, `settings-setup.css`, `settings-setup-contract.ts` and their tests — or
  coordinate with those owners first.
- **Known harness defect, blocking proof:** the settings-mount harness sets the theme on `<html>`,
  but `TenantCommandCenterShell` re-stamps `data-pg` from next-themes' `resolvedTheme`, which
  `forcedTheme` never sets. Measured: with `<html data-pg="dark">`, the shell still renders
  `<div data-pg="light">` and `--pg-canvas` computes `#fbf9f5`. **Every "both themes" claim produced
  by this harness — including the eight cases above — is one theme measured twice.** The geometry is
  identical either way, so the overflow finding stands as a geometry fact; **Obsidian rendering is
  `UNVERIFIED` and the harness must be repaired before any Setup repair can be proven.**
- **Required browser proof, OWED ON A LIVE CAPABILITY.** No leg of Setup has been driven on the live
  authenticated platform, and the code is already serving production. Needed: arrive at Setup as a
  real Solo owner and confirm what is reachable without prior knowledge; edit and save a field and
  confirm the stored value reads back; drive the validation, no-edit-right and load-failure paths;
  stage a proposal from chat and confirm the owner sees it; dismiss one and confirm the owner can
  tell it happened. **The last is expected to fail** — that is the Rail gap above.

## The open owner decision

The repair direction is with the owner and **implementation is paused until it is ruled**. Four
shapes were measured and put forward in a review prototype (2026-09-02):

1. **As shipped** — long column, invisible scroll. The defect.
2. **A · section pager** — the seven names already in the surface become a pager. Improves
   orientation; **does not by itself make editing form-fit** (see the per-section table).
3. **B · visible scroll** — Setup joins the visible-scroll contract. **Requires a new explicit owner
   ruling**: the current exception is narrowly scoped to Connections/Calendars and Integrations, and
   `docs/brain/solo-settings-scroll-and-release-playbook.md` binds every other destination to
   established form-fit/paging.
4. **C · rail and region** — section rail beside a region that scrolls inside a form-fitting page.
   This is the pattern the Claude Design pack already states in its own words: *"A form-fitting
   surface owns the viewport: the page stops scrolling and the surface's own regions do it instead."*

**Whatever is chosen is shared-template behaviour for every Solo tenant**, per the Alignment
Standard and `docs/doctrine/solo-shell-contract.md`. Never a per-tenant patch, never a branch on an
account number, name, fixture or URL. Both synthetic tenant contexts measured identically; no
tenant-specific path is involved in the defect or permitted in the fix.

**Pack search recorded so the absence is falsifiable (PACK-FIRST):** searched `business brief`,
`Setup`, `setup`, `section`, `stepper`, `wizard`, `accordion`, `segmented`, `form-fit`, `formfit`,
`paging`, `pager`, `sub-tab`, `subtab` across all three `docs/design-references/cd-packs/` packs
(agency-mode-shell, super-admin-shell, super-admin-shell-v3) and read the form-fit region of the v3
pack. **There is no Solo/tenant Setup surface in the pack** — only the governing principle quoted
above.
