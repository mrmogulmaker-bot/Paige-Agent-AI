# Paige UI review and testing

This reference adapts narrowly relevant review, accessibility, and web-testing ideas from PracticalSwan/agent-skills at the commit recorded in `../UPSTREAM.md`. It intentionally does not import host-specific commands, credentials, blanket CSS remedies, or claims that a single automated score proves accessibility.

## Review sequence

1. Compare the result with the approved user job and flow map.
2. Inspect hierarchy, density, legibility, affordances, responsive behavior, and consistency with Paige tokens.
3. Exercise every primary action, alternative path, refusal, retry, cancellation, close, and Back path.
4. Inspect semantic structure, accessible names, field labels, errors, focus order, focus visibility, status announcements, contrast, zoom/reflow, and reduced motion.
5. Verify real contracts and permission boundaries. Attempt negative controls for stale state, wrong role, and wrong workspace when relevant.
6. Re-run the full affected flow after fixes and inspect nearby regressions.

## Browser evidence

Use real browser interaction for rendered and behavioral claims. Wait for specific, observable UI conditions rather than arbitrary delays. Capture the viewport, theme, tenant/context, PAIGE state, route, action, and result. A screenshot proves appearance only; it does not prove persistence, authorization, failure handling, or side effects.

For scrolling surfaces, name the scroll container and prove the last meaningful control is reachable. For form fitting surfaces, prove that permanent page scrolling was not introduced unless explicitly authorized.

## Accessibility evidence

Automated scanners and the vendored contrast helper are diagnostic aids, not conformance certificates. Manual keyboard and screen-reader-oriented inspection remains required where relevant. Do not repeat an upstream rule as a Paige requirement unless it matches the repository contract and the applicable accessibility standard.

## Motion

Motion must communicate relationship, progress, or state. Under reduced motion, remove or replace non-essential spatial movement while preserving necessary feedback. Record both behaviors when motion changes.

## Honest omissions

If credentials, providers, permissions, devices, or environments are unavailable, mark the exact runtime claim `UNVERIFIED` or the product capability `UNAVAILABLE`. Do not substitute fixtures or a local harness and call the live path proven.
