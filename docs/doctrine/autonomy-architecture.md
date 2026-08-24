# Autonomy is granted to a PROCESS, not to a tool

**Owner ruling, 2026-08-24.** Verbatim:

> *"I think the Trust Compass should be something that Paige can call on and assign to workflows
> and automations not tools by themselves. The users need to be able to first ask for said
> autonomy, automations, workflow, triggers, to be connected with forms, pipelines, contacts,
> products/services, sales, analytics, campaigns and more. Everything must be interwoven. So we
> have to decide once say a campaign or emails checks or conversations or follow ups, or calendar
> slot is booked. The Human user should be able to decide how much of the repeatable task will
> they allow Paige, her other Agents etc to manage on their own."*

This is the authoritative statement of how autonomy is governed on this platform. Everything below
is the backend that has to exist under it.

---

## 1. The finding that shortens the work: Claude Design already drew this

Before proposing anything, the pack was searched. **CD's model and the owner's ruling are the same
model, arrived at independently.**

`paige-ia.js` `P.AUTOMATIONS` (L2017) is not a list of tools. Every entry is a **process**:

```js
{ id:'a1', name:'Follow up on a quiet thread', cat:'convo', state:'live',
  trig:'Thread went quiet', trigNote:'no reply for 4 days',
  conds:['Channel is Email or SMS', 'The record is a prospect'],
  acts:[['Ask her to decide','agent'],['Draft a reply','say'],['Create a follow-up','time']],
  note:'She proposes the next touch and holds it for your word.', real:false }
```

**trigger + conditions + an ordered chain of acts.** And `autoVals` (`v3.dc.html` L8584) already
resolves autonomy at exactly the level the owner asked for:

```js
// Most restrictive wins. An inherited grant resolves at ask-first for now.
const asked = acts.reduce((lo, x) => Math.min(lo, RANK[x.needs] ?? 2), 4);
const eff   = Math.min(asked, ceiling);
// A trigger with no seam blocks an automation exactly as a dead action does —
// "chase a no-show" has four live actions and nothing that can tell it a no-show
// happened, so counting only actions called it running.
const dark  = acts.filter(x => !x.live).concat(t && !t.live ? [t] : []);
```

So the design is not owed from CD. **The gap is entirely mine: there is no table behind it, and the
runtime resolves autonomy per TOOL, not per process.**

---

## 2. Three layers, and each answers a different question

| Layer | Unit | Question it answers | Who sets it |
|---|---|---|---|
| **Ceiling** — Trust Compass | the whole account | *"What is the most Paige may ever do here?"* | the operator, once |
| **Grant** — per process | one repeatable process | *"How much of THIS may she run alone?"* | the human, once per process |
| **Floor** — per capability | one tool | *"What may this action ever do, from any path?"* | rarely touched; a safety net |

**Effective autonomy of a process** — CD's arithmetic, unchanged:

```
effective = min( grant the human gave the process,
                 the most restrictive act's own floor,
                 the Trust Compass ceiling )
```

and a process whose **trigger** has no substrate is `dark` regardless of the arithmetic, because a
process that cannot be told it should run is not running whatever its grant says.

### The floor stays, and this is the part worth arguing

The obvious reading of the ruling is "replace per-tool autonomy with per-process autonomy." That
would open a hole, so the floor stays and is **demoted rather than removed** (§58):

1. **Not every tool call comes from a process.** Paige acts from chat. A skill runs. A sub-agent is
   dispatched. Those paths have no process to carry a grant, and today the per-tool gate is the
   only thing standing between them and a live write. Remove it and the most common path — the
   operator talking to Paige — becomes ungoverned.
2. **The floor is what makes the process grant SAFE to give.** "Run my follow-up sequence on its
   own" is only a sane sentence because no act inside it can exceed its own floor. That is what
   lets a human grant a whole chain in one decision instead of auditing every step — which is the
   owner's actual requirement.
3. **CD already treats it as an input, not a competitor.** `asked = min over acts of its own
   requirement` — the per-act floor is a *term in the process arithmetic*.

So `settings · Capabilities` (shipped 2026-08-24) is correct and stays. What changes is its
**billing**: it is the advanced view of the floor, not the front door to autonomy. The front door
is the process list, and that is what a human is asked to reason about.

---

## 3. The weave — what actually connects, measured

The owner's requirement is that a process can start anywhere and reach anywhere: *forms,
pipelines, contacts, products/services, sales, analytics, campaigns, calendar*. CD's `P.TRIGGERS`
is that surface, and it is bigger than any one domain: **80 declared triggers, 51 with a live seam
and 29 dark**, each dark one carrying the reason it cannot fire yet.

| Domain | live | dark | proven end-to-end |
|---|---:|---:|---:|
| Records / contacts | 6 | 7 | 0 |
| Pipeline / deals | 5 | 4 | 1 |
| Conversations | 2 | 7 | 0 |
| Calendar | 6 | 1 | 0 |
| Campaigns | 6 | 2 | 0 |
| Marketplace | 2 | 2 | 0 |
| Analytics | 2 | 1 | 0 |
| Fleet | 5 | 1 | 2 |
| External / integrations | 5 | 3 | 1 |
| Schedule | 3 | 0 | 0 |
| PAIGE herself | 7 | 1 | 2 |
| Manual | 2 | 0 | 0 |

**"Proven end-to-end" is CD's `real:true`, and there are only six.** The honest headline: one
process in the entire catalogue has substrate from trigger to act — `Stage changed → POST to a
webhook`, which runs through `stage_automation_events` and `pg_net`. CD says so in its own note.

### The 29 dark triggers, and what each is waiting on

Grouped by what unblocks them, because several share one missing thing:

- **The lifecycle field** unblocks 3 — *Lifecycle moved · A record enters a segment · A record
  leaves a segment*.
- **Stage-change history** unblocks 2 — *Deal stalled · A deal passes its stage target*.
- **A loss-reason field** unblocks 2 — *Deal lost* (both declarations).
- **Voice substrate** unblocks 4 — *Call ended · Missed call · An outbound call ends · A call is
  transcribed*.
- **A social seam** unblocks 4 — *DM received · A social DM arrives · A post publishes · An ad
  flight opens or closes*.
- **One-offs**: record merge · no-show attendance · git-read for drift · integration events (6 of
  42 connected) · D&B verification · e-signature · vision · Google Business Profile · marketplace
  install ledger · publisher accounts · the alert lens · subscription billing · client-side portal
  session · the Mind read seam.

Three of those are cheap and unblock five triggers between them (lifecycle field, stage history,
loss reason). That is the highest-leverage backend work on this page.

---

## 4. What exists today: seven islands, no join

Every piece the ruling needs exists. **None of them are connected to each other**, which is exactly
the owner's *"everything must be interwoven"*:

| Island | What it is | What it lacks |
|---|---|---|
| `paige_action_kinds` + `paige_actions` | the action bus — 10 kinds, each with `executor`, `requires_approval`, `default_autonomy_lane`, from/to department | it governs a *kind of act*, not a process; nothing chains kinds together |
| `tenant_tool_autonomy` + `resolve_tool_autonomy` | the per-tool floor | tool-level only; 23 of 46 governed tools are not even in its catalogue (task #217) |
| `stage_automation_rules` + `stage_automation_events` | the one real trigger→dispatch path | hardwired to pipeline stage changes and email intent; not a general process |
| `paige_workflow_registry` + `paige_workflow_runs` + `tenant_workflows` | the n8n mirror | external workflows; no grant, no trigger catalogue of ours |
| `growth_form_automations` + `growth_automation_targets` | forms → something | its own vocabulary; does not reach the action bus |
| `paige_journey_stages` + `tenant_journey_stages` | journeys | no trigger emission |
| the alerting substrate (#204) | rules that fire | fires notifications, not processes |

**`paige_action_kinds` is the closest thing to the right shape and should be extended, not
replaced** (§18). It already carries the two structural rules that make autonomy safe, as database
CHECKs rather than convention:

```sql
CHECK (executor <> 'send_via_approval' OR requires_approval = true)   -- auto-send is unrepresentable
CHECK (default_autonomy_lane <> 'auto' OR executor IN ('record_only','workflow'))
```

Those are the same two rules CD states in `capsVals`'s foot. They are already law here.

---

## 5. The build sequence

Each slice is independently shippable and verifiable. Nothing later is required for anything
earlier to be true.

- **A · The process record.** `paige_automations` (tenant-scoped: name, category, trigger key,
  trigger config, conditions, state) + `paige_automation_acts` (ordered, each naming an
  `action_kind` or a tool key) + `granted_lane` on the process. Extends the action bus; does not
  fork it.
- **B · The resolver.** `resolve_automation_autonomy(automation_id)` returning
  `{granted, asked, ceiling, effective, capped, dark[]}` — CD's arithmetic, in SQL, as the ONE
  home. The runtime clamp calls it; the surface renders it; Paige reads it before she acts.
- **C · The trigger catalogue as data.** The 80 triggers as rows with their `live` flag and their
  `why`, so the builder can only offer a trigger that can actually fire, and a dark one says why
  rather than silently never running.
- **D · Emission.** Make live triggers actually emit onto one bus. `stage_automation_events` is the
  proven pattern; generalise it rather than inventing a second.
- **E · The three cheap unblocks** — lifecycle field, stage-change history, loss reason. Five dark
  triggers light up for very little.
- **F · Paige builds them.** The owner's *"users need to be able to first ask"*: `automation_draft`
  / `automation_activate` tools so a tenant describes the process in chat and Paige composes it —
  born at the floor, never above her own ceiling, exactly as `spinGrantNote` already states for
  sub-agents.
- **G · The surfaces.** `settings · Automations` (`autoVals`) becomes the front door; Capabilities
  is relabelled as the floor beneath it.

**A and B are the substrate.** Until they exist, every other item has nowhere to land.

---

## 6. What this changes about work already shipped

- **Nothing is removed.** `settings · Capabilities` and the per-tool gate keep working exactly as
  they do (§58). Capabilities is re-framed as the floor, not re-scoped.
- **Task #217 gets more important, not less.** A process grant is only trustworthy if every act
  inside it has a real floor. 23 governed tools with no catalogue row are 23 acts whose floor
  cannot be seen or set — so completing the catalogue is now a *prerequisite* of the process layer,
  not a tidy-up.
- **§16's `autonomy_lane` is the right enum and does not change.** `auto | confirm | off` is what a
  process grant is expressed in, so the tiers, the audit log and the approvals path all carry over.

---

## 7. Owed, and by whom

**From CD (design):** how the process list, the builder and the grant control look. `autoVals` and
`buildVals` already draw them; nothing is blocked on this.

**From the owner (rulings), when convenient — none of these block slice A or B:**
1. Should a tenant be able to raise a process's grant above the *account* ceiling for one process?
   (Recommendation: **no** — the ceiling is a ceiling, and CD's arithmetic already assumes it.)
2. When a process is edited after being granted, does the grant survive? (Recommendation:
   **it drops to ask-first on any change to its acts**, since the human granted a specific chain.)
3. Sub-accounts: does an agency set process grants for its children, or only a ceiling?
   (Recommendation: **ceiling only** — §51, delegation divides authority, it never widens it.)

**A pack finding recorded while grounding this (#12):** `P.TRIGGERS` is declared once but in two
differently-shaped halves — a lowercase-`cat` block and a capitalised-`cat` block introduced by a
comment about tags — and the halves overlap (*Deal won* / *A deal is won*, *Booking made* / *A
booking is made*, *Deal lost* / *A deal is lost*, *Campaign halted* / *A campaign is halted*). The
80 count above is the raw row count and is therefore an upper bound on distinct triggers. Reported;
not reconciled here (§00 — CD rules on its own catalogue).
