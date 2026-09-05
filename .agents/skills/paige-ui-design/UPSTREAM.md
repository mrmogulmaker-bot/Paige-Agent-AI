# Upstream provenance and pin

Primary curated source: `https://github.com/PracticalSwan/agent-skills`

- Exact upstream commit: `da1f686c51f64d32395e645eec5e58ba5045c744`
- Upstream skill: `frontend-design`
- Upstream skill version: `2.0`
- Reviewed: 2026-09-05
- License declared upstream: MIT AND Apache-2.0

The vendored `frontend-design` core and its directly routed accessibility reference are preserved under `vendor/frontend-design/`. License and third-party notice files are retained beside them. These files are an immutable snapshot; Paige rules live in the parent skill and must not be written into the vendor copy.

## Vendored file hashes

- `SKILL.md`: `e7c8e7fd0bde8eb8a7d9f024fe20eeab4b6cde3f612e8d253334b806c09ca1ff`
- `references/accessibility-checklist.md`: `de10179e21fa2cf7c098a01dbef5a5e9eed0b262a0526fd9c1b20ad0058e988c`
- `scripts/contrast-checker.py`: `fa5dfa8258ee2de0cd86b42cbd88d6d2f51f1ee9f700085095e2ace4f9c6fcf6`
- `LICENSE.txt`: `5b30a24f635a0e31fff6d399e127b67b7a38e1bcaa439bdae8e4f619b25b06af`
- `LICENSE-APACHE-2.0.txt`: `b87a529a13d5294f97bb847936a82f39e4f8adae2425a3a5fb5f1a7b75d43e6a`
- `LICENSE-GITHUB-MIT.txt`: `2510b446bc1f0cf9702453075d20cd88631e20e5642658edb7325d9c1eb534f7`
- `THIRD_PARTY_NOTICES.md`: `912317539cc833b96d789481668a7227a840c6f44e35bcdb3fcaeb1591e76571`

## Adjacent material reviewed, not blindly imported

The following upstream skills were reviewed at the same commit and informed `references/review-and-testing.md`:

- `web-design-reviewer`
- `accessibility`
- `web-testing`

They are not copied wholesale because they contain generic or host-specific assumptions that are not Paige contracts. Examples include blanket overflow remedies, generic viewport sets, tool-specific credentials, and treating a single automated result as proof. Their source remains attributable at `https://github.com/PracticalSwan/agent-skills/tree/da1f686c51f64d32395e645eec5e58ba5045c744/`.

## Update procedure

No automation follows upstream `main`. To update this bundle:

1. review a new exact commit and its license/notice changes;
2. diff the selected files and adjacent guidance;
3. update the immutable vendor snapshot and hashes;
4. reconcile Paige-specific rules explicitly;
5. run the skill validator and UI-delivery guardrail tests;
6. submit the change through normal review.

An upstream update must therefore produce a visible repository commit and cannot silently change Paige delivery rules.
