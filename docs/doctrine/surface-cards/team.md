# Surface card — Team (Solo)

**Truth label: `PARTIAL`.** The capability runs correctly and is governed correctly; the owner
cannot see what Paige did. See *Rail outcome* below — that is the whole reason this is not `LIVE`.

Written 2026-09-02 by applying the Alignment Standard's build path to the Team capability. Legs 1–5
pass. Legs 6–7 do not.

**The code this describes is already LIVE ON PRODUCTION**, merged in #728 (`76bb3bbca`) — the
tools, their risk classifications, the tenant-agreement guard, the autonomy clamp and the catalogue
migration. Verified 2026-09-02 against prod (`xygzykjyynhzqytbqnzu`), not inferred from the merge:
`schema_migrations` carries `20261039000000` and `20261040000000`, and `list_tool_autonomy()`
returns all five `team_*` rows under the `Team` category. This card is the department's record of a
shipped capability, not a proposal.

**That is why `PARTIAL` matters rather than being a paperwork nicety.** The capability is running
for tenants now, so the gap below — an owner cannot see what PAIGE did to their team — is running
too.

**Team is NOT declared in the Spine registry.** `supabase/functions/_shared/paige-spine/registry.ts`
declares exactly one capability today (`PIPELINE_DEAL_STAGE_EVIDENCE`). Team should be declared —
and the reason it cannot be declared *complete* is the same reason this card is `PARTIAL`: the
registry requires `outcome.railVisibility`, and Team has none.

## Owner job and user flow

An owner or admin decides who is on their workspace and what each person may do: invite someone,
resend or withdraw an invitation, describe what a teammate owns, and change what a teammate can
access. Two entry points, one seam — the Team screen, and PAIGE in the rail beside it.

## Tenant data / domain owner

| | |
|---|---|
| Membership | `tenant_members` (role, `is_owner`, status, `job_title`, `responsibilities`) |
| Invitations | `tenant_invite_tokens` where `kind = 'team'` |
| Identity | `profiles` (display name), `auth.users` (email, last sign-in) |
| Read | `get_solo_team_workspace(_search,_permission,_limit,_offset)` · `get_paige_team_context()` |
| Write | `set_solo_team_member_work_profile` · `set_solo_team_member_permission` · `create_/resend_/revoke_solo_team_invite` (service-role only, behind the `solo-team-invitations` edge function) |

All are `SECURITY DEFINER` with the authority check **in the body**, so the same refusal applies
whether the request came from the screen or from a sentence.

## Solo shell placement

`/solo/{account}/settings/team` — Settings group, `SoloTeamWorkspace`. PAIGE reaches the same seam
from the expanding rail (`openPaige` → `expandRail`), beside whatever screen is open.

## States

| State | Behaviour |
|---|---|
| Empty (first use) | One member, the owner. "Your workspace starts with you" + invite the first teammate |
| Create | Invite dialog: address, access level, optional title/responsibilities, then a review step naming all four before anything sends |
| Edit | Member editor — work details and permission are separate controls with separate confirmations |
| Save | Reads back the **stored** values, not the submitted ones |
| Cancel | Modal dismiss restores focus to the invoking control |
| Retry | Invitation resend/revoke per row; roster retry on a failed load |
| Denied | "You don't have access to this team" — distinguished from a load failure |

## What PAIGE can read

`get_paige_team_context()` → a sanitised block: roster with `user_id`, name, email, **enforced**
permission, job title, responsibilities; invitations with `invitation_id`, address, proposed
permission and lifecycle status. Control characters stripped, fields length-capped, **the invite
token never included**. Marked `REFERENCE DATA ONLY`; tenant-authored work text explicitly confers
no authority. Suppressed entirely when the block's tenant ≠ the conversation's tenant.

## What PAIGE can propose or perform

| Tool | Seam | Risk |
|---|---|---|
| `team_set_work_profile` | `set_solo_team_member_work_profile` | `ordinary` |
| `team_set_permission` | `set_solo_team_member_permission` | `high` |
| `team_invite_member` | `solo-team-invitations` create | `high` |
| `team_invite_resend` | resend | `high` |
| `team_invite_revoke` | revoke | `high` |

Ids come from the context block only — never a name PAIGE resolved herself. Nobody can be made an
owner; the permission enum is `admin | member` and the database refuses `owner` besides.

## Required confirmation / approval

The four `high` tools require the rendered card's fingerprint, carried in the request **body** — a
channel the model cannot write. `confirm: true` from the model is refused for them. Cards name the
person and the consequence, not the enum, and a `high` card whose subject cannot be named is
refused rather than shown unnamed. A workspace `auto` setting does **not** lower this: as of
2026-09-02 the handler clamps `auto` → `confirm` for any `high` or `owner_only` action.

`team_set_work_profile` is `ordinary` — reversible, in-tenant, and structurally unable to reach
`permission`.

## Rail outcome and follow-up — **THE GAP**

**A Team action emits no Rail event, and the owner has nowhere to see that it happened.**

- `emitRailForTool` returns early on `if (!contactId) return` — the Rail is per-client by
  construction. Team actions have no contact. Emitting one anyway would invent a client
  involvement, so the early return is *correct*; the Rail simply cannot carry a workspace-level
  outcome.
- An attribution row **is** written to `paige_audit_log`: tenant-stamped, naming the tool, the
  target table and id, the outcome, and which authority allowed it. It is durable and correct.
- **No Solo surface reads `paige_audit_log`.** The two owner-facing activity feeds — the Trust
  Compass panel and the Team hub's own *"What the team did"* — both read `paige_client_events`
  through `useSoloActivityFeed`. So **a permission change PAIGE makes on this very team does not
  appear in that team's own activity feed.**
- Because PAIGE is a rail *beside* the page, an owner sitting on Team with PAIGE open sees a stale
  roster after she acts: `useTeamWorkspace` refetches on mount and on its own mutations, and
  nothing signals it from the chat.

**This is a Spine Change Request, not self-service work — and the Spine foundation says so in its
own words.** `docs/architecture/paige-spine-foundation.md` opens by stating the foundation *"does
not create a second Rail, event bus, memory store, approval store, or PAIGE workspace"*, and the
registry requires either `NONE` or an approved Change Request identifier for a shared primitive. A
workspace-level (non-client) rail event is exactly such a primitive. The Chat workstream inventing a
second activity substrate to close its own visibility gap is the duplication the one-approval-gate
rule exists to prevent, in a different costume.

**What the Change Request has to decide** is narrower than "add a rail": whether a Rail event may
exist without a `contact_id`, or whether workspace-level outcomes get their own projection that
`useSoloActivityFeed` unions in. Either answer makes Team declarable in the registry with real
`outcome.railVisibility`; neither is the Chat workstream's to pick alone.

## Dependencies, collisions, and required browser proof

- **Depends on:** the action-risk policy, the confirmation/approval gate, `current_user_tenant_id()`,
  `get_paige_persona_context()`, the `solo-team-invitations` edge function, `send-portal-invite`.
- **Known collision, unresolved:** `crm_list_team` (`list_team_members`) and the Solo Team functions
  read the same `tenant_members` table but disagree on authorization source (global `user_roles` vs
  tenant membership), owner labelling, suspended members, and truncation. Two homes for "who is on
  the team".
- **Known defect, unfixed by design:** the three invitation RPCs resolve their workspace from
  `profiles.active_tenant_id` **raw**, while everything else COALESCEs through
  `current_user_tenant_id()`. A sole owner with a null `active_tenant_id` is told they are not an
  owner. PAIGE now refuses first with an honest reason; **the Team screen still shows the false
  message**, because correcting a `SECURITY DEFINER` resolver is its own change with its own
  producer inventory.
- **Required browser proof, OWED ON A LIVE CAPABILITY — no leg of this has been driven on the live
  authenticated platform, and the code is already serving production.** The order of those two
  facts is the point: this is not proof owed before a release, it is proof owed on something
  already released. Needed: invite a real address from chat and from the screen; resend and revoke;
  change a permission and confirm the roster reflects it; edit work details and confirm the
  omitted field survived; drive the owner-only refusal as an admin; and confirm what the owner sees
  afterwards, which is the gap above.
