# Flow-by-Flow working checklist — Paige

Applies to every Paige task. Read alongside `flow-by-flow/SKILL.md` and its routed
references; this file carries the repo's own non-negotiable additions.

## Gate: User-Usability (owner-ruled 2026-08-31) — NON-NEGOTIABLE

> A Paige feature is **not** complete because code compiles, a screen renders, fixtures
> display, a prototype is interactive, or automated tests pass.

For every capability presented as supported, prove the owner can personally complete it
**through the real product UI against the real durable contract on their own
authenticated account**:

1. begin from the actual first-use / empty state;
2. create or configure the supported object;
3. edit it and save it;
4. reload or revisit and confirm the **durable** result;
5. exercise permission, failure/retry, abandonment, and account-switch paths;
6. **distinguish actual authenticated proof from preview, fixture, mock, or
   structural-harness evidence.**

**None of these count as delivered:** a mocked save · a seeded record · local-only state ·
a static readiness card · a disabled "coming soon" control · UI that *describes* a
capability without allowing its supported human flow.

**When a contract genuinely does not exist:** mark *that exact capability* honestly
unavailable, with its reason and its recovery path. Keep delivering every supported
usable flow. An unavailable dependency **never** justifies leaving a whole surface static
or read-only — unavailability is a per-ITEM verdict, never a per-SURFACE excuse.

**Release rule.** No PR may be described as feature-complete, or put forward for Gate 2,
until this gate is met — or until its remaining gaps are explicitly reported as
`UNVERIFIED` / `UNAVAILABLE` **and excluded from the claimed deliverable**.

### Evidence classes, reported separately and never merged

| Class | What it proves | What it does NOT prove |
|---|---|---|
| `tsc` / build | it type-checks and bundles | that it runs |
| unit / component tests with mocks | a double behaved as instructed | that a human can finish |
| structural / rendered markup | the markup exists | that the control works |
| **authenticated live drive** | **a human can complete the flow** | — |
| `UNVERIFIED` | nothing — say so plainly | — |

A mocked-save suite is evidence about the code. It is never evidence about the owner.

## Standing companions

- **§70** — never build something the owner cannot USE. The reading is the hypothesis;
  the owner is the measurement. Reproduce before arguing.
- **§32** — a green build is not a working render; smoke-test crash-prone runtime logic.
- **§32.c** — an auth-gated surface owes a browser-driven live check; a session without a
  browser tool names it OWED rather than implying a drive that did not happen.
- **§13** — report what happened, never what was hoped.
- **§58** — a shipped capability is never silently removed; every PR asks whether it did.
