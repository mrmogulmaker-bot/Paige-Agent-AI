# Paige interface quality gates

## Job and direction

Before implementation, record:

- purpose: the concrete problem the interface solves;
- audience: the actual role and context using it;
- primary action: the most important successful outcome;
- visual direction: how Paige's existing design language supports that outcome;
- evidence boundary: which claims can and cannot be proven in the current environment.

## Complete-state coverage

Cover every applicable state and exit: first use, loading, empty, populated, validation, success, error, retry, permission denied, unavailable capability, cancellation, close, Back, destructive confirmation, and workspace switch. State why a non-applicable state does not belong.

## Forms, funnels, and risky actions

- Give first-time users clear orientation and a next step.
- Use editable controls that look and behave editable.
- Keep visible programmatic labels and understandable field-level validation.
- Preserve recoverable input after retryable failure.
- Never show success until the owning contract confirms success.
- Make Cancel, close, Escape, and Back behavior intentional and testable.
- Explain the exact consequence of a destructive action; keep the default focus/action non-destructive.
- Provide recovery when the domain contract supports it; otherwise refuse honestly.
- Keep keyboard order, names, roles, errors, and status announcements screen-reader safe.

## Visual and interaction quality

Reuse established tokens and components first. Color, hierarchy, hover, focus, motion, and reduced-motion behavior must clarify state or action. Avoid redundant banners, oversized empty areas, filler copy, generic dashboard furniture, and decorative effects with no usability purpose.

Do not use clipping or global overflow rules to disguise a layout failure. Record the intended scroll owner and verify content remains reachable by keyboard, wheel/trackpad where scrolling is allowed, touch-equivalent interaction, and zoom/reflow.

## Solo matrix

For each viewport below, test PAIGE closed and open:

- 1536x770
- 1366x768
- 1024x768
- 900x1000

Use the affected Solo tenant/context and one different known-good tenant/context. Confirm no account name, tenant number, fixture, demo value, or URL value changes shell layout or navigation. Data and permissions may differ only through tenant-safe server-resolved contracts.

## Capability labels

- `LIVE`: the exact claim is backed by a proven, usable contract in the tested environment.
- `PARTIAL`: a proven subset works; name both the working and missing parts.
- `UNAVAILABLE`: a required provider, connection, entitlement, or backend contract is absent.
- `UNVERIFIED`: the claim was not exercised at the stated evidence level.

Never infer capability from visual treatment, static code, fixtures, seeds, mocks, account numbers, or a successful unrelated call.

## Evidence classes

- Automated: focused tests, negative controls, and regression results.
- Static: lint, type checking, build, policy scan, and contract inspection.
- Rendered: actual screenshots or recordings at required geometry/themes.
- Behavioral: real interaction including failures, exits, focus, and recovery.
- Authenticated runtime: tenant-scoped behavior exercised through the real authenticated route and owning server contract.
- `UNVERIFIED`: precise untested behavior and why it remains unverified.

Evidence filenames, URLs, commands, accounts/contexts, timestamps, and observed outcomes must be specific enough for a reviewer to reproduce. Redact secrets and sensitive customer data.
