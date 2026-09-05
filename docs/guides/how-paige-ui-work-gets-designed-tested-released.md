# How Paige UI work gets designed, tested, and released

Every interface assignment follows the same simple path.

1. **Understand the whole job.** The agent starts with Flow-by-Flow, identifies who is using the interface, what they need to accomplish, and what neighboring flows could be affected.
2. **Apply Paige's UI rules.** Before drawing or coding, the agent reads the pinned Paige UI Design skill. It uses Paige's established design language, real data and permissions, honest states, complete exits, and accessible interaction.
3. **Prototype new flows.** If the work changes steps, choices, confirmations, recovery, or consequences, the agent uses Flow Prototype so the intended experience can be exercised before production implementation.
4. **Build the complete experience.** Loading, empty, failure, retry, permission, success, cancellation, Back, and workspace-switch behavior are included where relevant. A working-looking mock is not treated as working software.
5. **Prove what is true.** Tests, code checks, rendered screenshots, behavioral browser drives, and authenticated tenant proof are reported separately. Anything not actually exercised is labeled `UNVERIFIED`; unsupported capability is `UNAVAILABLE`.
6. **Review and release.** The pull request includes a structured evidence record. CI catches missing attestations for recognized UI source changes, and a reviewer inspects the real flow. Normal Paige release gates still control merge and production.

For Solo work, proof covers four required screen sizes with PAIGE closed and open, plus the affected tenant and another known-good tenant. Reviewers check real scrolling, clipping, reachability, keyboard/focus, zoom, reduced motion, and relevant states.

The automation is intentionally lightweight: it can prove that a required evidence record is present and structurally complete, but it cannot prove an agent was truthful. Human review and reproducible artifacts remain part of release.
