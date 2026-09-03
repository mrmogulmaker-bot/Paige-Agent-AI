# Source-to-Spine packet 3 — Connections

**Status: SMALLER THAN IT LOOKS, AND ONE OWNER-FACING FINDING THAT IS BIGGER.** No code written.
Produced 2026-09-03 before any implementation. Grounded by enumerating what functions **read and
return** — not what they are named — and by re-fetching open PRs at the time of writing, both of
which are corrections forced by packets 1 and 2 rather than habits I already had.

The finding first, because it matters more than the integration: **no tenant on this platform can
send an SMS today**, and PAIGE already has the read that says so.

## The finding — measured, per tenant, on production

`tenant_comms_readiness()` resolves a single `blocked_reason` in send-path order. Reproducing that
exact chain against every tenant:

| Blocked at | Tenants | Means |
|---|---|---|
| `messaging_account_missing` | 9 | no Twilio subaccount row at all |
| `no_sms_number` | Antonio Daniel LLC · First Sterling Capital · Project Mogul Enterprise Inc | subaccount with complete credentials, but no active SMS-capable number |
| `registration_absent` | Mogul Maker Academy | subaccount **and** number; needs a 10DLC registration |

**Thirteen of thirteen are blocked.** `tenant_a2p_registrations` holds **zero rows** platform-wide,
so no workspace could clear the registration gate even with a number.

This is not a defect — it is the honest state of an unlaunched messaging capability, and the resolver
reports it correctly. It matters here because it sets what PAIGE can truthfully say about
Connections: for every workspace today the answer is "you cannot text yet, and here is the one next
step", not "here is your connection status".

## Source owner and canonical records, with exact counts

**Connections** owns two quite different things, and conflating them is the trap in this item.

**Comms (real, partly populated):**

| Store | Rows |
|---|---|
| `tenant_twilio_subaccounts` | 4 |
| `tenant_email_identities` | 12 |
| `tenant_phone_numbers` | 2 |
| `tenant_a2p_registrations` | **0** |

**Third-party integrations (essentially unused):**

| Store | Rows |
|---|---|
| `tenant_n8n_connections` | 1 |
| `tenant_mcp_connections` | **0** |
| `paige_mcp_connections` | **0** |
| `quickbooks_connections` | **0** |
| `paige_bank_connections` | **0** |

So "Connections" is one live-ish domain (comms) and one that no tenant has adopted. A capability
promising PAIGE rich knowledge of "connected providers" would be describing an empty set.

## The reads, enumerated by what they READ

A `prosrc` sweep for every function touching a connection store, filtered to those reachable by
`anon` or `authenticated`. **Zero are granted to `anon`.** The secret-bearing reads
(`get_tenant_mcp_secret`, `get_tenant_n8n_secret`) are `service_role`-only, which is correct.

| Read | `anon` | `auth` | `svc` | Returns |
|---|---|---|---|---|
| `tenant_comms_readiness()` | ✗ | ✓ | ✓ | can_send_sms, blocked_reason, subaccount/number/a2p states, consent counts, delivery ledger, billing state. **Already Spine-shaped** |
| `get_tenant_mcp_connections(uuid)` | ✗ | ✓ | ✓ | `configured`, `auth_token_last4`, **`server_url_host` (host only)**, `tool_count`, `pinned_count` — a genuinely safe projection |
| `get_tenant_n8n_connection(uuid)` | ✗ | ✓ | ✓ | `configured`, `api_key_last4`, status, sync — **and the DECRYPTED full `base_url`** |
| `get_tenant_email_identity(uuid)` · `list_tenant_sender_identities()` | ✗ | ✓ | ✓ | sender identity state, no secret material |

### The one distinction that decides the projection

`get_tenant_mcp_connections` returns `server_url_host` — the host, deliberately not the URL.
`get_tenant_n8n_connection` calls `platform_decrypt(base_url_ct)` and returns the whole thing.

Both are defensible **as product reads**: it is the tenant's own configuration, returned to a member
of that tenant, and the n8n surface needs the URL to be operable. Neither is a §9 breach.

But the integration brief forbids a Spine read from disclosing "private configuration" or
"connection internals", so **a Spine capability may consume the MCP shape and must not consume the
n8n one**. This is the same boundary `team.authority` drew when it declined to route Team's roster
through a Spine adapter: the existing product read is correct for its own surface and is not
automatically a safe summary.

## What PAIGE already knows, and what she does not

**Already live**, through two hand-wired tools in `paige-ai-chat`, both reading
`tenant_comms_readiness()`:

- `comms_connection_summary` → `can_send_sms`, `blocked_reason`, number state, and the permitted
  Comms actions from `list_tool_autonomy()`.
- `comms_registration_status` → registration state, plus the explicit
  `filing_with_a_carrier_is_not_built: true`.

Both take only the safe top-level fields. Neither surfaces the resolver's `business` block — I
checked, and there are **zero** references to it in that file. (I asserted the opposite earlier in
the session from a grep of the RPC name; that was wrong, and the correction is recorded here because
it is exactly the "a name is not the behaviour" error this packet's method exists to prevent.)

**Not known to PAIGE at all:** any MCP, n8n, QuickBooks or bank connection state. Since four of those
five stores are empty, wiring them would mostly teach her to say "nothing is connected".

## Collision — an open PR owns this surface, and is deliberately held

**#674** (`claude/communications-control-room`, head `6ad1e37a`) makes two already-shipped backend
capabilities reachable from Connections: A2P registration drafting, and sender-domain management.
It is **Communications UI only — zero migrations, zero edge functions** — and its own status line is
explicit: *"NOT approved for release. No Gate 2 authorization. It stays draft, unmerged and
undeployed."*

That is a deliberate hold, not a stall. **Nothing in this packet touches it**, and a Spine capability
here must not pre-empt it: #674 is the path by which Mogul Maker Academy would clear
`registration_absent`, which is the single most consequential state on the table above.

Its base is `e8a43a96`, well behind `main`, so it will need a merge before it can land — a fact for
whoever picks it up, not a task I am claiming.

## Does this need a durable Rail event?

**No.** Connection state is current-state, and `tenant_comms_readiness()` is already a live read with
an honest `resolved_at`. There is no history worth citing, and inventing a signal row would repeat
exactly what `business_context.readiness` and `team.authority` correctly declined to do.

## What remains unavailable or proof owed

| Item | Label | Why |
|---|---|---|
| Carrier submission | **UNAVAILABLE** | `comms-a2p-submit`'s brand/campaign creation are `needs_config` stubs |
| Number search / assignment | **UNAVAILABLE** | contacts the provider and spends money |
| MCP / n8n / QuickBooks / bank state in PAIGE | **NOT CONNECTED, and near-empty** | four of five stores hold zero rows |
| n8n `base_url` in a Spine read | **EXCLUDED BY DESIGN** | private configuration |
| The Connections surface's own gaps | **HELD IN #674** | not this packet's to take |
| Authenticated UI drive | **PROOF OWED** | `LIVE_DRIVE_EMAIL` / `LIVE_DRIVE_PASSWORD` unset |

## The honest recommendation

**Do not build a `connections.*` Spine capability yet, and the reason is evidence rather than
effort.** PAIGE already reads the only Connections fact that is both populated and decision-relevant,
through two tools that predate the Spine. A new capability would either duplicate them — the drift
§18 exists to prevent, and the mistake `team.authority` avoided by shipping two facts instead of six
— or project four empty stores.

What would genuinely raise what PAIGE knows here is **#674 landing**, because it changes the *world*
rather than the reporting: it is what lets a tenant clear `registration_absent`. That is an owner
decision (its Gate 2), not a Spine slice.

**If a Connections capability is wanted anyway**, the honest minimum is: declare the existing
`tenant_comms_readiness()` read as a Spine capability so it is governed and registered rather than
reached through two hand-wired tools — a registration exercise, not new behaviour, and worth roughly
what it costs.

**One thing to route to the source owner** (not fixed here): `tenant_comms_readiness()` gates on
`has_any_role(auth.uid(), array['admin','coach'])`, the tenant-agnostic predicate — the same §59 trap
already routed for `list_team_members`. It admits a caller who is `admin` by virtue of another
workspace, and refuses a freshly provisioned owner holding only the base `user` role.
