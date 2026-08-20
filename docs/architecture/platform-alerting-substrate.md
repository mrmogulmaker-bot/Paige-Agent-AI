# Platform Alerting Substrate — architecture

**Owner ruling 2026-08-20:** build the **full alerting substrate** — its own condition language over
arbitrary platform signals, not just Systems Check findings, with multi-channel delivery and
escalation. This document is the grounding and the slice plan; no schema ships until it is read.

Surface: `/operator/fleet/alert-rules` (Fleet Console sub-tab 4), the one Fleet sub-tab with no
backend. The pack's structure already ships through the generic panel with every KPI `null` and the
Rules block stating "No alert rule is being read from the platform yet."

---

## §18 gate — answered against the code, not from memory

Four questions, mandatory before the first line of a new table or surface.

### 1. What did I actually search?

- `supabase/migrations/**` for every `CREATE TABLE` matching alert / notification / rule /
  subscription.
- `supabase/functions/` for `notif|alert|digest|brief|remind`.
- `supabase/functions/_shared/` for delivery helpers.
- `src/operator/surfaces/specs/fleetSpecs.ts` and `panelSpecs.ts` for the shipped Alert-rules spec.

### 2. What sibling machinery already exists?

| Primitive | What it is | Verdict |
|---|---|---|
| `_shared/channel-adapters.ts` | **The** multi-channel delivery contract — email · sms · whatsapp · instagram · facebook · voice, normalising every provider into one `NormalizedMessage`. Its own header declares it "the single home for the channel abstraction." Outbound dispatcher is `send-message`. | **EXTEND. Non-negotiable.** The substrate's delivery leg routes through this. A second delivery path would be the §18 violation this file exists to prevent. |
| `paige_admin_notifications` | Operator notification inbox — `severity`/`title`/`body`/`link_to`/`read_at`. | **EXTEND** for the in-app channel. An alert that fires writes here; it does not get a private inbox. |
| `stage_automation_rules` | A rule table — but FK-bound to `pipelines` and `pipeline_stages`, tenant-scoped, and its "condition" is only a stage transition. | **Adjacent, NOT a home.** It structurally cannot express "migration drift > 0" — there is no pipeline to hang it on. Do not widen it; a platform-signal rule is a different entity. |
| `paige_sla_alert_log` | A firing log — but hardcoded to client SLA (`client_id`, `hours_unassigned`). | **Adjacent, NOT a home.** Useful precedent for "record what fired"; too narrow to generalise. Leave it alone (§58). |
| `notification_preferences`, `push_notification_preferences`, `push_subscriptions` | Per-user delivery preference + web-push registration. | **EXTEND** when per-operator delivery preference lands. Not slice 1. |
| `paige_action_kinds` + the action bus (§16) | Department routing with `autonomy_lane` (🟢 auto / 🟡 confirm / 🔴 off). | **EXTEND** for escalation-to-a-human. An alert that needs a decision files an action; it does not invent a second approval path. |
| `send-notification`, `send-push-notification` | Existing senders. | Callers of the channel layer; the substrate reaches delivery through `send-message`, not by calling these directly. |

### 3. Why does this deserve a new home?

Only the **rule** and the **firing record** are genuinely net-new. Nothing above can express a
condition over a platform signal: `stage_automation_rules` is pipeline-bound, `paige_sla_alert_log`
is client-bound, and neither has a concept of an operator-scoped signal.

Everything else is reuse. The honest shape is therefore **three new tables plus an evaluator** — the
rule, the firing record, and the signal catalogue that makes both config-as-data (§10) — wired
into three existing seams (channel-adapters for delivery, `paige_admin_notifications` for the
in-app channel, the action bus for escalation) — not a parallel notification stack.

### 4. Is this a creation surface that pre-classifies the human's intent?

No. Authoring a rule is a form over a condition, not an artifact-type picker (§18/§21 do not bite).

---

## Shape

### Signals — what a rule can watch

A **signal** is a named, operator-scoped, numerically-or-categorically evaluable fact about the
platform. Slice 1 registers signals as data (§10 — config-as-data, so Paige can author a rule by
voice without a code change), each declaring its own reader.

Seed signals. Three are backed by reads that already exist; two are **honestly unreadable** and say so
in the catalogue itself (`is_readable = false`), because a signal with no reader must report "never
evaluated", never a pass:

| Signal | Source | Already shipped? |
|---|---|---|
| `systems_check.failing_count` | `paige_systems_check_finding` at `tenant_id IS NULL` | ✓ (Systems Check L1–L3) |
| `systems_check.blocking_present` | same | ✓ |
| `fleet.tenants_at_risk` | `useFleet`'s health derivation, server-side twin | ✓ (the read exists; the twin is slice 2) |
| `migrations.drift` | `db-live..HEAD` — **cannot be read from an edge function** (§32.a records this for the git-tag checks) | ✗ — honest gap, needs CI to publish drift as a row |
| ~~`llm.failover_rate`~~ | ~~`paige_llm_trace`~~ | ✗ — **this row was WRONG; corrected in A2, see below** |
| `llm.error_rate` | `paige_llm_trace` (`status='error'` over the trailing hour) | ✓ (A2) |

**§13 note:** `migrations.drift` is listed to be explicit that it does **not** work yet, for the same
reason the two Wave-S3 git-tag checks are honestly DEFERRED — an edge function cannot read git. It
ships as a registered signal with no reader until CI publishes drift, and a rule bound to it reports
"never evaluated", never a false green.

**§13 CORRECTION (2026-08-20, A2) — this table shipped one claim that was not true.** `llm.failover_rate`
was listed as already backed by L1 observability. It is not: `paige_llm_trace` records no failover marker
(its columns are `status`, `error_class`, `provider`, `model`, `tier`), verified against the live schema
rather than assumed. A1 had already seeded the signal `is_readable = true` on the strength of this row, so
the error reached prod. A2 flips it to unreadable with the reason in its `notes` and registers
`llm.error_rate`, which the schema genuinely supports, as its own key.

The correction is recorded rather than quietly patched **because the tempting fix was the wrong one**:
pointing the existing `failover_rate` key at an error rate would have shipped a number whose name says one
thing and whose value means another — the same two-numbers-one-label defect the §39 peer gate caught on
the Fleet Tenants rail one slice earlier. `llm.failover_rate` becomes readable only if the model router
starts recording a fallback marker on the trace.

### Condition language

Deliberately **not** a general expression parser. A condition is a JSONB triple:

```
{ "signal": "systems_check.failing_count", "op": "gte", "value": 1 }
```

with `op ∈ {gte, gt, lte, lt, eq, neq}` and an optional `for_minutes`
(sustained-for, so a flap does not page).

**§13 — three ops in the original list were NOT built (A2), and rules using them are REJECTED rather
than accepted-and-ignored.** `changed` needs the PREVIOUS reading per signal, which this substrate
does not keep. `present` and `absent` need a signal that can legitimately have no reading — and none
exists: a reader either produces a value or is recorded unreadable, and a rule depending on an
unreadable signal is skipped before it is ever evaluated, so `present` would be trivially true for
every readable signal and `absent` could never be true at all.

All three are dropped from the language rather than stubbed. An op that validates at authoring time
but can only ever produce a rule that silently never fires is worse than a missing feature: the
operator sees a saved rule and reasonably believes it is watching something. They return the day a
genuinely nullable signal (or a reading history) does, together with it. Composition is `all_of` / `any_of` over triples — enough
for real rules, small enough to validate, and serialisable so Paige can author one from chat (§10).

A parser is what turns this into a maintenance problem; a validated triple is what makes it
Paige-drivable. If a rule genuinely needs arbitrary logic later, that is a signal — a *new signal*
with its own reader — not a bigger language.

### Delivery + escalation

`fire → record → deliver → (escalate)`.

- **Record** always, first. A firing is a row before it is a message, so "did it fire?" is answerable
  even when delivery fails (§13 — a fire is not a delivery; the SLA log's own precedent).
- **Deliver** through `send-message` over `channel-adapters`, plus a `paige_admin_notifications` row
  for the in-app channel.
- **Escalate** by filing an action on the bus at the rule's `autonomy_lane` (§16), so a rule needing
  a human decision uses the approval path that already exists.

### §9 / §51 / §53 posture

Platform-operator scope only. Rules live at `tenant_id IS NULL`; RLS grants read/write to
`is_platform_operator()` (§53 — the delegated operator tier, **not** the frozen
`is_platform_owner()`). No tenant tier sees this surface; Client and Anonymous are 403 at
`RequireOperator`.

Per §59: any `SECURITY DEFINER` function added here enforces caller scope **in its body**, never by
the EXECUTE grant, and is never granted to `anon`.

---

## Slices

| Slice | Contents | Gates |
|---|---|---|
| **A1** ✅ SHIPPED 2026-08-20 | `paige_alert_signal` + `paige_alert_rule` + `paige_alert_firing` tables, RLS, signal registry seeded, `getTierFeatureSet` entry | §32.a persisted-apply ✅ · §32.b `BEGIN..ROLLBACK` incl. a tenant-tier denial ✅ · §39 peer-gate ✅ · §66 ledger ✅ |
| **A2** ✅ SHIPPED 2026-08-20 | Evaluator edge function (`alerting-evaluate`) + `pg_cron` `*/5` schedule + `condition_met_since` episode column; writes firings; **no delivery yet** | §32.b ✅ · headless smoke on the decision logic ✅ (`smoke:alerting-conditions`, in CI) · honest "evaluated, not delivered" state ✅ |
| **A3** | Delivery leg through `send-message`/`channel-adapters` + `paige_admin_notifications` row | §37 producer inventory on the dispatcher · §32.c live send |
| **A4** | Surface wiring — the pack's KPIs and Rules block off real rows, replacing the honest-absence spec | §11/§25 design pass · §66 |
| **A5** | Authoring: `+ New rule` write path, and the Paige-callable seam so a rule can be authored from chat (§10) | §39 · §32.c |
| **A6** | Escalation onto the action bus at the rule's autonomy lane (§16) | §37 · §39 |

**A1 and A2 are the schema-touching slices, and both are additive.** A1 adds three new tables; A2 adds
one nullable column (`paige_alert_rule.condition_met_since`), two catalogue corrections and a cron
job. Neither ALTERs anything previously shipped and neither migrates data, so both are reversible and
fall under §4 merge-on-verified rather than the irreversible-migration pause. (This line originally
read "A1 is the only slice that touches schema … two new tables" — wrong on both counts, corrected
when A2 shipped rather than left to mislead the next reader, §13.)

## What this deliberately does NOT do

- No second delivery stack. If delivery needs a capability `channel-adapters` lacks, that capability
  gets added **there** (§18).
- No widening of `stage_automation_rules` or `paige_sla_alert_log` — both are adjacent and staying
  (§58).
- No expression parser.
- No tenant-tier alerting. That is a separate decision with its own §51 matrix and §60 tier entry;
  this substrate is operator-scoped, and pretending otherwise would bake a tier assumption in.
