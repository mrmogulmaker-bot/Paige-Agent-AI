# Doctrine §198 Addendum — Deprecation Requires Cutover

> Parent doctrine: §198 (Legacy Deprecation).
> Companion doctrine: §208 (Shape Delta Discipline — Pre-Migration State Must Be Verified, Not Asserted).

---

## Part 1 — Deprecation Requires Cutover (original addendum)

A legacy table may not be dropped, renamed, or marked deprecated until:

1. Every write path is verifiably repointed at the canonical replacement, **or**
2. The legacy table has been reclassified in place with a new canonical role registered in `table_layer_registry` (§207).

A code-drift signal alone (grep count, C-series audit finding) is necessary but **not sufficient** to select a deprecation path.

---

## Part 2 — Deprecation Requires Row-Level Layer Classification (extension, this PR)

### Rule

A legacy table cannot be declared any layer based on **table name** or **code-drift signal** alone.
Row-level classification per the §206 discriminator (`layer`, `subject_type`, `subject_id`) is **required BEFORE** any deprecation path is chosen.

### Enforcement

Any deprecation ship (rename, drop, cutover, write-freeze) MUST include a **Section 0 — Row-Level Layer Classification** in its shape proposal. Section 0 predates §208's verified-state discipline: §208 verifies the *shape* of the current table; §198-Addendum verifies the *layer identity* of the current rows.

Section 0 must produce, at minimum:

- Per-row classification against the §206 discriminator enum: `L1_platform_infra`, `L2_tenant_service`, `L3_tenant_passthrough`, `L4_direct_consumer`, plus operational statuses `pre_signup`, `orphaned`, `unclassifiable`.
- Per-row linkage evidence: tenant membership, tenant-scoped end-customer records (`clients`, `deals`, etc.), Stripe subscription artifacts, auth activity.
- Per-code-site write-intent classification: `L{n}_correct`, `L{n}_misrouted`, `ambiguous`.
- A path recommendation (Rename-in-place, Split, or Copy-and-drop) grounded in the classification data, not the table name.

### Motivating Case Study (2026-07-02)

`public.user_subscriptions` was flagged as "legacy L4" by C-series audit finding **C9** on the strength of a code-drift signal (17 code-site references still writing to it after `consumer_subscriptions` shipped as the L4 canonical target).

Path 2 (Copy-and-drop to `consumer_subscriptions`) was initially proposed. §208 discipline caught the first fault (FK misalignment on `plan_slug='free'`). §198-Addendum row-level classification then caught the deeper fault:

- **All 19 live rows** were `plan_slug='free'`, `status='trial'`, `stripe_subscription_id IS NULL`.
- **16 of 19** were tenant-scoped end customers of MMA (`clients.linked_user_id`), **4** were tenant staff (`tenant_members`), **0** were orphaned, **0** had any `consumer_subscriptions` counterpart.
- The rows were **not L4** at all — they were **L3 tenant-passthrough trial state** produced by an on-signup trigger.
- The code-drift signal was real but described **future write intent** in the `stripe-webhook` and `check-subscription` paths, not the actual layer identity of existing rows.

Had we executed a Copy-and-drop under the L4 assumption, we would have:

1. Deleted the tenant's live trial gate for 16 real customers.
2. Landed 16 rows in `consumer_subscriptions` under a synthesized `free` plan that pollutes the L4 catalog and breaks §202 lane separation.
3. Created a silent §200 violation by mixing L3 tenant state into an L4 consumer-only table.

Row-level classification is now mandatory Section 0 of every deprecation shape proposal.

### Non-Negotiables

- Row-level classification is a **read-only preflight**. It may never mutate the legacy table.
- Classification counts must be reproducible by re-running the preflight query verbatim; include the query in the shape proposal.
- If any row classifies as `ambiguous` or `unclassifiable`, the deprecation ship halts until manual review resolves the row. No default-to-most-common bucket.
- If any code site classifies as `ambiguous`, the deprecation ship halts until the human reviewer resolves the intent. No agent guessing.
