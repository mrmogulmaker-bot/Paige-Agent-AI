# Exact requirements: a dedicated least-privilege Solo test tenant and test user

**Why this exists.** Every release packet I have written this session ends the same way — an
`UNVERIFIED` row for authenticated runtime, because no session here holds credentials for a live
authenticated surface. That is an honest degrade, and it is also a standing hole: it means the
owner's own eyes are the only thing converting `PARTIAL` into proven, on every surface, forever.

This specifies the account that closes it. **It does not ask for, and must never be satisfied by,
the owner's personal credentials.** A test account is not a convenience — using a real owner login
would make every drive indistinguishable from the owner acting, put real customer data behind an
automated browser, and give a CI secret the authority of the founder.

---

## 1. The tenant

| Property | Required value | Why |
|---|---|---|
| `account_type` | `'standalone'` | Solo tier is the one with the most unproven surfaces. |
| `parent_tenant_id` | `NULL` | Solo, not a sub-account (§51 invariant: a child is never a manager). |
| Name | Something unmistakably synthetic, e.g. `Paige QA — Solo Verification` | Nobody should ever wonder whether it is a real customer. |
| Isolation | Its own `tenant_id`, no membership in any other workspace | It must be impossible for a drive to reach real customer data by resolving the wrong tenant. |
| Data | Seeded fixtures only — synthetic contacts, no real people | See §4. |

**It must not be an existing real workspace.** Not Project Mogul, not Mogul Maker Academy, not
Antonio Daniel LLC, not First Sterling Capital (§63). Those are revenue-bearing production accounts;
pointing an automated browser at one is how a test run becomes a customer incident.

## 2. The user

| Property | Required value |
|---|---|
| Email | A dedicated address on a domain you control, never a personal inbox |
| `tenant_members` | Exactly one row: this tenant, `role='owner'`, `status='active'` |
| `user_roles` | **The base role only.** No `admin`, and categorically no `super_admin` / `platform_admin` |
| Password | Generated, stored only as a CI/environment secret, rotatable without touching code |

### Why `owner` in `tenant_members` but not `admin` in `user_roles`

This is the whole point of the account, and it is worth being exact about.

`tenant_members.role = 'owner'` is **tenant-scoped** authority — it is what a real Solo owner has,
and it is what `is_tenant_admin()` reads. `user_roles.role = 'admin'` is **global and
tenant-agnostic** (§59) — it is not something a real freshly provisioned Solo owner holds at all,
because `record_signup_acceptance` / `provision_tenant` grant only the base `'user'` role.

So an account carrying global `admin` would be **unrepresentative of the tier it exists to test**,
and would quietly pass gates a real Solo owner fails. That is not hypothetical: it is exactly the
"wrongly refuses" defect in `get_tenant_people()` (PR #885) — invisible from the surface, and
invisible to any drive performed by an account that happens to hold the global role.

**Least privilege here means: the least authority a real Solo owner would have, and not one grant
more.** Not "enough to make the tests pass".

## 3. Credentials

- Supplied to CI as `LIVE_DRIVE_EMAIL` / `LIVE_DRIVE_PASSWORD` — the names
  `scripts/live-drive/live-drive.mjs` already reads. No new mechanism.
- **Environment only.** Never hardcoded, never logged, never in a screenshot, never in a commit,
  never pasted into a PR body or an issue.
- Rotatable by changing the secret alone, with no code change.
- If the account is ever used to reach anything real, it is burned and replaced, not repaired.

## 4. Seed data

Synthetic and self-evidently so — `qa-contact-01@example.com`, not a plausible name. Enough to
exercise a populated state, and the account must **also** be resettable to genuinely empty, because
first-use from an empty state is the flow most often broken and least often tested (§70.1).

Two states worth having: **empty** (fresh provision, nothing configured) and **populated** (a few
contacts, a Setup profile). Most of the defects I have found this session live in exactly one of
those two and are invisible from the other.

## 5. What it must never be able to do

Stated as hard boundaries, because a test account that can spend money or message a person is worse
than no test account:

- **Never send.** No verified sending domain, no assigned phone number, no A2P registration. If the
  tier requires proving a send path, it is proven against a provider sandbox — never a real carrier.
- **Never spend.** No payment method, no Stripe customer, no number-purchase authority.
- **Never operator.** No `super_admin`, no `platform_admin`, no Fleet Console reach, no act-as.
- **Never cross-tenant.** One membership, one workspace.

## 6. What it buys

With this account, the `UNVERIFIED` row becomes a real one for: Solo Settings save-and-reload,
Setup persistence and provenance, the Systems Check tile actually rendering on an empty book,
Connections readiness reporting honestly, the roster surface distinguishing *refused* from *empty*,
and every future Spine binding currently reported `PARTIAL` for want of an authenticated caller.

**Honest limit (§13):** this converts *tenant-tier* claims. It cannot prove anything about operator
surfaces or about Act-as — those need operator authority, which this account must never hold, and
which stays owner-verified by design.

## 7. What I need, and what I will never ask for

**Needed:** confirmation the tenant and user exist as specified, and the two secret **names** set in
the CI environment.

**Never needed, and never to be sent to me:** the password value, the owner's personal credentials,
or any real customer's data. If a future session asks for any of those, that request is itself the
defect.
