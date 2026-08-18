# R1 — Role Call-Site Inventory

**Slice R1 of the 6-slice plan in `docs/doctrine/role-taxonomy-and-matrix.md` §6.**
R1 mechanically labels every role call site. **No behaviour change ships in R1** — the labels
are the deliverable; the fixes are R2/R3.

Every number below is a real query result against prod (`xygzykjyynhzqytbqnzu`) on **2026-08-18**.
Nothing here is an estimate (§13).

---

## 1. Method (reproducible)

Corpus: every `public` RLS policy and every `public` function whose predicate/body matches
`has_role | has_any_role | user_roles`. Buckets assigned by deterministic SQL:

| Bucket | Rule |
|---|---|
| **a — operator-intent** | Class-A literal (`'super_admin'`/`'platform_admin'`) or an operator helper, and **no** Class-B literal |
| **b — tenant-filtered** | Class-B literal **AND** a tenant predicate **AND** no `OR` |
| **c1 — defect candidate** | Class-B literal **AND no tenant predicate anywhere** |
| **c2 — review required** | Class-B literal **AND** tenant predicate **AND** an `OR` (composition a token scan cannot resolve) |

Class-B literals are matched **quoted** (`'admin'`), so `'super_admin'` / `'platform_admin'`
never false-match. Class A/B/C definitions come from the taxonomy doc §2.

---

## 2. Counts — every object accounted for

**RLS policies — 186 total**

| Bucket | Policies | Tables |
|---|---:|---:|
| a — operator-intent | 3 | 2 |
| b — tenant-filtered | 3 | 2 |
| **c1 — no tenant predicate** | **82** | **46** |
| **c2 — OR-composition** | **98** | **50** |

**DB functions — 118 total · 117 are `SECURITY DEFINER`**

| Bucket | Functions | of which DEFINER |
|---|---:|---:|
| a — operator-intent | 10 | 9 |
| **c1 — no tenant scope** | **31** | **31** |
| c2 — mixed | 69 | 69 |
| d — other | 8 | 8 |

`SECURITY DEFINER` bypasses RLS, so for 117 of 118 functions the **in-body check is the only
guard** (§59 — the EXECUTE grant is never the guard).

---

## 3. The amplifier — why every Class-B guard matters more than it looks

This is the single most load-bearing fact in the audit, and it is measured, not inferred:

- `map_tenant_role_to_app_role()` maps tenant role **`owner` → `admin`** and **`admin` → `admin`**.
- Trigger **`trg_sync_tenant_member_to_user_roles`** on `tenant_members` is **ENABLED** and writes
  that mapping into `user_roles` — which has **no `tenant_id` column**, so the grant is
  platform-wide by construction.
- Live: **9 `admin` holders spanning 10 of 13 tenants**; 16 active owner/admin `tenant_members`
  rows across 8 distinct users; exactly **1 `super_admin`**.

**Therefore "global admin" is approximately "every tenant owner" — ordinary paying customers,
not a small trusted operator set.** Every `has_role(auth.uid(),'admin')` guard in this corpus
should be read as *"any tenant owner on the platform."*

---

## 4. Confirmed findings (independently verified against prod, not taken from agent output)

Each was re-derived from `pg_policies` / `pg_get_functiondef` / `information_schema` directly.

### 4a. LIVE — `paige_workflow_registry` platform-seam escalation

All **23 registry rows are `tenant_id IS NULL`** (platform-scoped). The guard on the write policy is:

```
has_role(auth.uid(),'admin') AND ((tenant_id IS NULL) OR (tenant_id = current_user_tenant_id()))
```

Because every row has `tenant_id IS NULL`, the second conjunct is **always true**, so the predicate
reduces to `has_role(auth.uid(),'admin')` for the whole table — on a **PERMISSIVE policy with
`cmd=ALL`**. Any of the 9 tenant-owner-admins can INSERT/UPDATE/DELETE every platform workflow row,
including flipping `requires_approval` and repointing `direct_function_name` — i.e. subverting the
approval seam itself.

| Object | Guard | Reach |
|---|---|---|
| policy `Workflow registry admin write` (ALL) | reduces to global `admin` | write all 23 platform rows |
| policy `Workflow registry admin read` (SELECT) | same | read all 23 |
| policy `Workflow registry read scoped safe metadata` | `has_any_role(['admin','super_admin'])` + `current_user_roles()`, same NULL-tenant hole | read |
| `platform_set_workflow_webhook_url(text,text)` — granted `authenticated` | `has_role('admin') OR is_platform_owner()`, no tenant predicate | repoint any platform n8n webhook |
| `admin_get_workflow_webhook_url(text)` — granted **PUBLIC, anon**, authenticated | same | **decrypts and returns** the webhook secret |

`anon` cannot pass the guard (its `auth.uid()` is NULL), so the anon grant is not itself
exploitable — but it is exactly the §59 lint target and is removed.

### 4b. Broken function found by the proof — `admin_get_workflow_webhook_url(uuid)`

The `(uuid)` overload selects a column **`n8n_webhook_url` that does not exist** (the table stores
`n8n_webhook_url_ct`). Every call raises `42703`. It has **zero producers**. Caught only because the
§32.a rollback proof refused to recreate it. Dropped rather than repaired.

### 4c. LATENT — `match_paige_memory` structural auth bypass (no role required)

Guard:

```
IF auth.uid() IS DISTINCT FROM _target_user_id
   AND auth.uid() IS DISTINCT FROM _target_client_id
   AND NOT has_role(auth.uid(),'admin')
   AND NOT EXISTS (coach_clients ... _target_user_id) THEN RAISE
```

Pass `_target_client_id := auth.uid()` and `_target_user_id := <victim>`. The second conjunct goes
FALSE, so the whole `AND` is FALSE and **the RAISE never fires** — while the data predicate still
keys on the attacker-controlled `_target_user_id`. Reads any user's `client_memory.content` and
`chat_message_embeddings.content_excerpt`. `_match_threshold` is caller-supplied, so `-1` turns the
similarity search into a full dump. Granted to `authenticated`. **`SECURITY DEFINER`, so RLS does
not contain it.**

**Severity is LATENT, not live** — corrected from the crew's "live" label. Both target tables have
**0 rows** today, so nothing is exposed. It arms itself the moment the memory fabric writes its
first row. Not fixed in this slice: a correct fix must also scope the `_target_client_id` branch of
the *data* predicate (authorising as self still lets you pass an arbitrary `client_id`), and it has
a real caller (`paige-ai-chat`) whose two legitimate paths must survive. Tracked separately.

---

## 5. Classifier limits — what this inventory does NOT cover (§13)

- **Wrapper indirection is the big one.** The corpus is selected on the literal tokens
  `has_role|has_any_role|user_roles`. A policy that calls `is_admin()`, `is_staff()`,
  `studio_role_ok()` or `check_feature_access()` reaches `user_roles` **one level down and never
  enters this corpus at all**. The true call-site count is therefore **higher than 186 + 118**.
  Quantifying that closure is the first task of R2.
- **`tenant_id` is matched as a token, not as a scope.** A policy where `tenant_id` appears in an
  unrelated subquery or select-list scores as "tenant-filtered" while its *authority* branch has no
  scoping. This biases toward b/c2 and makes **c1 a conservative floor**, not a ceiling.
- **Boolean structure is unparsed.** c2 (98 policies) is "contains an OR", which regex cannot
  resolve into "the Class-B disjunct lacks tenant scoping". c2 is a review queue, not a verdict.
- **Out of corpus entirely:** views, column-level grants, trigger-resident authority, edge-function
  gates, frontend gates, and tables with RLS disabled or zero policies (no policy = no predicate to
  match, and nothing to leak *through* — it just leaks).
- **c1 ≠ defect.** Pure predicates (`is_admin`, `is_staff`) are tenant-agnostic *by design*, with
  scoping correctly left to callers. c1 is a candidate list.

---

## 6. Coverage statement

- **Classification: 100% mechanical.** All 186 policies and all 118 functions were bucketed by SQL;
  every object lands in exactly one bucket and the bucket totals reconcile to 186 and 118.
- **Verified personally, in full, against prod:** the amplifier chain (§3), the five
  `paige_workflow_registry` objects (§4a), the broken `(uuid)` overload (§4b), and the
  `match_paige_memory` guard and its reachability/row-counts (§4c).
- **Delegated and NOT re-verified object-by-object:** the remaining 26 of the 31 c1 functions and
  the c2 policy bucket were audited by subagents. Their findings are recorded as *candidates* and
  are explicitly **not** promoted to confirmed here. The integrator's full report exceeded what
  could be read in one pass, so this document reflects the verified core plus the summary — it does
  not claim line-by-line review of all 304 objects.
- **No behaviour changed by R1 itself.**

---

## 7. Recommended slice order

1. **R2a — the workflow-registry cluster.** Live, concrete, and zero-producer on the two functions.
   Shipping with this inventory.
2. **R2b — wrapper-closure sweep.** Expand the corpus through `is_admin`/`is_staff`/`studio_role_ok`/
   `check_feature_access` and re-run the classifier. Until this runs, no count here is a ceiling.
3. **R3a — `match_paige_memory`** and the rest of the c1 DEFINER functions, highest severity first.
   Needs a design decision on `_target_client_id` semantics.
4. **R3b — the c2 policy queue**, structurally reviewed per policy.
5. **R4/R5 — backfill, dual-read, then the `user_roles` Class-A-only CHECK.** Unchanged from the
   taxonomy plan. Do not skip to R5.
