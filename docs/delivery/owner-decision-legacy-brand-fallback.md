# Owner decision: does a value in the legacy brand record count as "on file"?

**One decision. Two workspaces affected. It needs your call because the platform is currently
answering it *both ways at once*, and one of those answers is mine.**

---

## The situation

Setup (`tenant_legal_profile`) is the canonical place a business confirms its website, phone and
name. An older path wrote the same facts into `tenants.brand` without any confirmation step. Two
real workspaces have values **only** in the legacy record:

| Workspace | In Setup | In legacy brand |
|---|---|---|
| First Sterling Capital | nothing | website, phone |
| Antonio Daniel LLC | nothing | website |

## What is actually happening on production right now

Executed against production as First Sterling Capital's real owner:

| Read | Field | Answer |
|---|---|---|
| `business_context.readiness` | website | `needs_confirmation` |
| `business_context.readiness` | business_phone | `needs_confirmation` |
| `tenant_comms_readiness` | has_website | `true` |
| `tenant_comms_readiness` | has_phone | `true` |

**Same workspace, same underlying data, opposite answers.** One surface says the website is missing;
another says it is on file.

**This is my doing and I am naming it rather than quietly reconciling it.** #864 shipped
business-context as Setup-only. I then shipped `20261160000000`, which added a legacy-brand fallback
to the comms read, to fix three flags that were wrongly reading `false`. That fix was correct in
isolation and I did not check it against the read that had already chosen the opposite rule. The
result is the cross-surface contradiction above — the exact shape §57 exists to prevent.

So the question is no longer "should we add a fallback?" It is **"which of the two answers already
live is the right one?"** — and the inconsistency should not survive this decision either way.

---

## Option A — Setup is the only source

Legacy values do not count. Both reads say `needs_confirmation` until the owner confirms in Setup.

- **User-facing:** both workspaces are told website/phone are not entered — while a value visibly
  exists elsewhere in the product. For First Sterling, `comms_configured`'s phone half and
  `website_connected` flip from pass to fail. Reads as the product forgetting something it was told.
- **Migration/compatibility:** requires reverting the fallback I shipped in `20261160000000`, which
  re-breaks the three comms flags for these two workspaces. Two owners each confirm two fields once,
  and it is permanently clean.
- **Honest:** yes. `needs_confirmation` is exactly true — nobody confirmed these.

## Option B — legacy counts, but says so

Both reads fall back to `tenants.brand`, and a value sourced that way is reported with its **own
provenance** — `source: 'legacy_brand'`, distinct from `'setup'` — never as owner-confirmed.

- **User-facing:** nobody is told a value is missing when one exists. The status is a third state
  ("we have this, you have not confirmed it") rather than a binary.
- **Migration/compatibility:** extends the fallback I already shipped to the business-context read
  and adds the distinct source value. No tenant loses a value they had. The legacy record stays
  readable indefinitely, which is the cost — it keeps a deprecated write path alive as a real source.
- **Honest:** yes, *provided* the distinct provenance ships with it. Without it, Option B silently
  reports unconfirmed data as confirmed, which is worse than either clean answer.

## Option C — backfill once, then Option A

Copy the legacy values into Setup as unconfirmed, then make Setup the only source forever.

- **User-facing:** same end state as A, but nobody is told a value is missing in the meantime.
- **Migration/compatibility:** a one-time data migration touching two rows, then the legacy path is
  genuinely dead. Highest one-off cost, lowest permanent cost.
- **Honest:** yes, if the backfilled rows are marked unconfirmed rather than stamped as confirmed.
  Stamping them confirmed would be the platform asserting an approval that never happened.

---

## Recommendation

**Option C**, with **Option B as the fallback if you want zero migration risk.**

C is the only option that ends with one source of truth *and* never tells a tenant a value is
missing when it is not. It is two rows. The legacy write path stops being load-bearing, which is
what makes the contradiction above impossible to recreate rather than merely fixed once.

I would avoid A on its own: it is the most correct rule paired with the worst experience, and it
asks two real owners to re-enter data the product already holds.

**Whichever you pick, the two reads must agree afterwards.** Fixing the contradiction is not
optional and does not need a separate decision — only the direction does.

---

## What I have not done

I have not changed either read. Picking a source of truth is a product decision about what the
platform asserts, and inventing one unilaterally is the thing that produced the contradiction in the
first place.
