# How Paige UI work gets designed, tested, and released

A short, plain-language guide for the owner. The detailed version is
[`UI-DELIVERY-STANDARD.md`](./UI-DELIVERY-STANDARD.md); this is the "what actually happens" summary.

## The promise

Every time anyone — Claude, Codex, or any other agent — builds or changes something you can **see or
click** in Paige, they follow the same disciplined path, and they cannot claim it works until they
can show it works. No more "it compiled, so it's done."

## What happens, in order

1. **Map the job first.** The agent runs `flow-by-flow` to lay out what the user is actually trying
   to do, every screen and state involved, and where it could go wrong — before touching design.
2. **Load the design playbook.** For anything visible, the agent loads the Paige UI design bundle
   (curated from a vetted open-source catalog, frozen to a specific version) **before** designing or
   building. That playbook carries the rules for real design work: accessibility, complete states,
   reuse the existing look, no decorative filler.
3. **Prototype new flows before building them.** If the change is a real flow — a form, onboarding,
   a funnel, a payment or connection flow, a delete confirmation — the agent prototypes it first so
   you can see the appearance and the steps before it becomes production code.
4. **Design around your real job.** The interface is built around the task you came to do, not
   generic cards and empty chrome.
5. **Prove it, then ship.** Before it's called done, the agent shows two kinds of proof: the screen
   **rendered** at your real window sizes, and the flow **actually driven** end to end. Anything not
   yet proven is labelled honestly rather than hidden.

## The honesty labels you'll see

- **LIVE** — wired to real data and verified working.
- **PARTIAL** — works for some cases; the agent says which and which not.
- **UNAVAILABLE** — the capability doesn't exist yet (e.g. no provider connection). The screen says
  so plainly and doesn't show a button that can't work.
- **UNVERIFIED** — built, but a required proof (usually a live drive on the real site) hasn't been
  done yet; the agent names why and who owes it.

## What "checked at your window sizes" means

For Solo screens the agent checks the rendered result at **1536×770, 1366×768, 1024×768, and
900×1000**, and confirms the page scrolls in one place, nothing is cut off, every control is
reachable, the keyboard works, and the loading / empty / error / success / cancel / account-switch
states all behave.

## The safety net

A change that touches a screen can't quietly merge without its evidence: CI checks that the pull
request carries the rendered + behavioral proof (or an honest "not verified yet, because…"). It's a
**guardrail, not a rubber stamp** — it forces the proof to be written down where you and reviewers
can see it. It never blocks pure backend, database, or documentation work.

## Where things live

| Thing | Path |
|---|---|
| The full standard | `docs/paige-ui-delivery/UI-DELIVERY-STANDARD.md` |
| The evidence template | `docs/paige-ui-delivery/UI-EVIDENCE-TEMPLATE.md` |
| The vetted design bundle (frozen copy) | `docs/paige-ui-delivery/upstream/` |
| Where the bundle came from, exactly | `docs/paige-ui-delivery/upstream/PROVENANCE.md` |
| The skill agents load | `.claude/skills/paige-ui-delivery/SKILL.md` |
| The cross-agent trigger | `AGENTS.md` (root) · `CLAUDE.md` §71 |
| The CI guardrail | `scripts/ci/ui-evidence-lint.mjs` · `.github/workflows/ci.yml` |
| What shipped, and its limits | `docs/paige-ui-delivery/RELEASE-REPORT.md` |

## Who decides how it looks

The standard governs the **process** — which steps run and what proof is required. It does **not**
give any coding agent authority over taste; how it looks stays Claude Design's and your call. The
coding agents' job is to build what's designed, wire it to real data, prove it renders and works, and
tell you the truth about what's verified and what isn't.
