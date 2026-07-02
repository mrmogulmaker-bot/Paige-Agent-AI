# Doctrine §210 — L2 / L3 Scope Boundaries (Subscription State vs Metering Events)

**Status:** Codified 2026-07-02 alongside Migration B.0.
**Motivating case:** B.0 audit reclassified 15 rows in `user_subscriptions` from `L3_tenant_passthrough_trial` (proposed) to `L2 subject_role='end_customer'` (final). §210 exists so this boundary is never ambiguous again.

## The Rule

> **LAYER 2 is subscription/billing STATE. LAYER 3 is metering EVENTS.**
> A row that describes *"this party is subscribed / on trial / entitled"* is L2.
> A row that describes *"this party consumed one unit of a platform service"* is L3.

Both can exist for the same party simultaneously. They never share a table.

## Decision Table

| Row semantics | Layer | Example table |
|---|---|---|
| Tenant → Paige entitlement / plan / trial | **L1** | `platform_subscriptions` |
| End Customer → Tenant entitlement / plan / trial | **L2** | `tenant_service_subscriptions`, `tenant_customer_trials` |
| End Customer *usage event* of a platform-metered service delivered via Tenant | **L3** | `platform_metered_events` |
| Consumer → Paige entitlement / plan / trial | **L4** | `consumer_subscriptions` |
| Consumer *usage event* of a direct-consumer metered service | **L4** (unified — no separate metering table today) | `consumer_subscriptions` + future `consumer_metered_events` |

**Key clarifying test:** If the row disappears when the subscription is cancelled but no meter has ticked, it is L2. If the row persists as an immutable usage record after cancellation, it is L3.

## Consequences for Migration B

Under §210 the 19 rows in `user_subscriptions` are unambiguously L2:
- 15 rows `subject_role='end_customer'` (customer→MMA trial state)
- 4 rows `subject_role='tenant_member'` (staff internal-use trial state)

The mistaken B.0 draft called the end-customer cluster L3 because the *tenant* is a passthrough for a *Paige-hosted* trial gate. §210 makes clear that passthrough of *delivery* does not change the *layer* of the *state* — only the layer of the *events* the state later authorizes.

## `subject_role` Discriminator (canonical values)

```sql
subject_role TEXT NOT NULL CHECK (subject_role IN (
  'end_customer',    -- L2 party paying/trialling against a tenant offering
  'tenant_member',   -- L2 tenant staff on internal-use trial
  'consumer_user',   -- L4 direct-to-Paige consumer
  'platform_admin'   -- Paige internal, non-billable
));
```

Any L2/L4 subscription table added after 2026-07-02 must carry this column.

## Enforcement

- Every new billing/subscription table `COMMENT ON TABLE` must state the §197 layer *and* cite §210 when the L2/L3 boundary is non-obvious.
- Every metering table must include the SQL comment `-- §210: EVENTS ONLY; subscription state lives in L{1,2,4} tables`.
- CI (future): a table registered in `table_layer_registry` as `L3` must not contain columns matching `/^(plan|status|trial|renews|cancel)/` — those are state signals and belong in L1/L2/L4.
