-- S2 wave · Category 1 (Vision & Strategy) — seed 9 platform baseline skills into paige_skills.
--
-- These run through the generic S1b interpreter (default dispatch) — NO bespoke handler code. Each row is
-- IP-CLEAN per §14/§62: methodology_anchor + description + steps are MECHANIC-DESCRIPTIVE only — no anchor
-- person name, no branded framework title, no source-repo name. tier_availability = §61 default; scoping =
-- 'platform'; autonomy_lane per the §16 risk mapping (read_only->auto, draft->confirm; none external_send).
--
-- SOURCING LINEAGE (attribution lives here in the commit/migration reference ONLY, never in a row, per §14):
--   Distilled from the Anthropic Skills registry (local /mnt/skills: learn, doc-coauthoring, morning — for
--   context-transfer / grouped-intake / daily-brief STRUCTURE) + the §14 GOAT strategy MECHANICS
--   (outcome-first/backward planning, delegation-first time-leverage, core-motivation surfacing) — mechanics
--   only, rewritten IP-clean. Community aggregators (VoltAgent/awesome-agent-skills etc.) were available but
--   the local Anthropic skills + §14 mechanics were sufficient for Vision & Strategy.
--
-- §1 crew: distillation engineer + adversarial IP-clean/§16 verifier (0 IP violations; 2 fixes applied:
--   source_lineage never persisted [no such column]; identify_risks reduced to genuinely read_only —
--   dropped the approvals-write step for least-privilege).
-- ON CONFLICT (slug) DO NOTHING makes this idempotent + safe to re-run.

insert into public.paige_skills (
  slug, name, description, category, trigger_phrases, steps, allowed_tools,
  risk_level, autonomy_lane, methodology_anchor, tier_availability, scoping,
  created_by, status, require_admin_confirm_first_n
) values
  (
    $s$interpret_vision$s$, $s$Interpret the Vision$s$, $s$Takes the owner's rough, big-picture language about where they want the business to go and restates it as a concrete, specific definition — a clear end-state anyone on the team could act on. No new artifact; it reflects back a sharpened version of what they meant.$s$,
    $s$vision_strategy$s$,
    ARRAY[$s$interpret my vision$s$, $s$what do I actually mean$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the owner's stated words plus known business context (offer, stage, prior stated goals)"}, {"id": "interpret", "tool": "anthropic", "desc": "Restate the vague aspiration as a concrete, specific end-state with a measurable finish line and reflect it back for confirmation"}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Outcome-first sense-making — take vague aspiration language, pull the business context around it, and restate it as a concrete end-state with a measurable finish line, so intent becomes something the team can execute against.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$create_vision$s$, $s$Create the Vision$s$, $s$For owners who can't yet put their goal into words, this walks them through a short set of probing questions and drafts a clear vision statement in their voice — the north-star the rest of the planning skills build from. Produces a draft you approve before it's saved.$s$,
    $s$vision_strategy$s$,
    ARRAY[$s$help me define my vision$s$, $s$I can't put my goal into words$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull business context and any prior fragments of intent to seed the questions"}, {"id": "probe", "tool": "anthropic", "desc": "Ask a short, tight set of probing questions to surface the desired end-state and its underlying motivation"}, {"id": "compose", "tool": "anthropic", "desc": "Draft a concrete vision statement in the owner's voice for approval"}, {"id": "save", "tool": "client_memory", "desc": "On approval, save the vision statement as the north-star record"}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Guided articulation — draw out an owner who can't name what they want through targeted probing questions, then compose a concrete vision statement in their voice that fixes the end-state and the reason it matters.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$vision_to_roadmap$s$, $s$Translate Vision into a Roadmap$s$, $s$Takes an approved vision and works backward into a staged plan — a 12-month target, 90-day milestones, and this week's moves — so the big goal becomes a sequence of concrete steps. Produces a draft roadmap you approve.$s$,
    $s$vision_strategy$s$,
    ARRAY[$s$turn my vision into a roadmap$s$, $s$build my 12-month plan$s$]::text[],
    $j$[{"id": "context", "tool": "context", "desc": "Pull the saved vision, current business stage, and constraints"}, {"id": "reference", "tool": "rag", "desc": "Retrieve relevant playbook/knowledge sections for the owner's stage to inform milestone shape"}, {"id": "decompose", "tool": "anthropic", "desc": "Work backward from the vision into a 12-month / 90-day / weekly milestone ladder"}, {"id": "save", "tool": "client_memory", "desc": "On approval, save the roadmap as the active plan of record"}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Backward planning from the end-state — decompose a fixed vision into a 12-month target, then 90-day milestones, then weekly moves, chaining each layer so every near-term step demonstrably serves the far goal.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$vision_to_daily_actions$s$, $s$Today's Moves Toward the Vision$s$, $s$Surfaces the three highest-leverage things to do today that actually move the vision forward — cutting through the noise of everything that could be done to the few that matter now. Presented in chat, nothing saved.$s$,
    $s$vision_strategy$s$,
    ARRAY[$s$what should I do today$s$, $s$today's top moves$s$]::text[],
    $j$[{"id": "context", "tool": "context", "desc": "Pull the active roadmap, current milestones, and recent activity"}, {"id": "triage", "tool": "anthropic", "desc": "Rank candidate actions by leverage toward the near milestone and surface today's top three"}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Highest-leverage daily triage — from the active roadmap and current state, isolate the three moves today whose payoff toward the goal outweighs everything else on the list, and surface only those.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$business_state_diagnostic$s$, $s$Where-You-Are Diagnostic$s$, $s$A guided intake that captures the real current state of the business — revenue, team size, client count, the core offer, and the obvious gaps — into one clear snapshot. This is the baseline every gap and scaling analysis reads from. Produces a draft snapshot you approve.$s$,
    $s$vision_strategy$s$,
    ARRAY[$s$where is my business now$s$, $s$business state check$s$]::text[],
    $j$[{"id": "context", "tool": "context", "desc": "Pull whatever current-state data already exists to pre-fill the intake"}, {"id": "intake", "tool": "anthropic", "desc": "Ask a grouped set of intake questions across revenue, team, clients, offer, and gaps; fill known fields, ask only the unknowns"}, {"id": "synthesize", "tool": "anthropic", "desc": "Compose a clear current-state snapshot"}, {"id": "save", "tool": "client_memory", "desc": "On approval, save the dated business-state snapshot as the baseline"}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Structured business-state intake — walk the owner through a fixed set of current-state dimensions (revenue, team, client count, offer, visible gaps) and capture the answers as a single dated snapshot that later analyses measure against.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$gap_analysis$s$, $s$Gap Analysis$s$, $s$Lines up where the business is now against where the vision says it should be, then lays out the prioritized deltas — what has to close first, second, third — so effort goes to the gaps that matter most. Produces a draft you approve.$s$,
    $s$vision_strategy$s$,
    ARRAY[$s$what's the gap to my goal$s$, $s$gap analysis$s$]::text[],
    $j$[{"id": "context", "tool": "context", "desc": "Pull the current-state snapshot and the saved vision/roadmap"}, {"id": "compare", "tool": "anthropic", "desc": "Enumerate the deltas between current state and target and rank them by impact and dependency"}, {"id": "save", "tool": "client_memory", "desc": "On approval, save the prioritized gap list to the plan of record"}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Current-versus-target delta ranking — set the captured current state beside the defined end-state, enumerate the differences, and order them by impact and dependency so the highest-leverage gap is addressed first.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$scaling_roadmap$s$, $s$Scaling Roadmap (N to 10x)$s$, $s$Maps the pathway from where the business is now to roughly ten times its current size, with the checkpoints and levers at each stage — what changes in the offer, delivery, team, and acquisition as it grows. Produces a draft roadmap you approve.$s$,
    $s$vision_strategy$s$,
    ARRAY[$s$how do I scale$s$, $s$path to 10x$s$]::text[],
    $j$[{"id": "context", "tool": "context", "desc": "Pull current-state snapshot, offer, and vision"}, {"id": "reference", "tool": "rag", "desc": "Retrieve relevant scaling playbook sections for the owner's stage and model"}, {"id": "research", "tool": "firecrawl", "desc": "Optional fresh research on the niche's growth benchmarks or channels"}, {"id": "compose", "tool": "anthropic", "desc": "Compose the staged N-to-10x path with checkpoints and the levers that change at each stage"}, {"id": "save", "tool": "client_memory", "desc": "On approval, save the scaling roadmap"}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$firecrawl$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Order-of-magnitude scaling path — chart the route from current scale to roughly ten times it as staged checkpoints, naming the offer, delivery, team, and acquisition levers that must change at each stage to sustain recurring growth.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$quarterly_okr_plan$s$, $s$Quarterly Planning (Outcomes + Key Results)$s$, $s$Builds a quarter's plan the accountable way — a small number of outcomes, the measurable key results that prove each one, and the weekly rituals that keep them on track. Produces a draft plan you approve.$s$,
    $s$vision_strategy$s$,
    ARRAY[$s$plan my quarter$s$, $s$set quarterly goals$s$]::text[],
    $j$[{"id": "context", "tool": "context", "desc": "Pull the roadmap, current milestones, and prior-quarter results"}, {"id": "compose", "tool": "anthropic", "desc": "Draft a few quarterly outcomes, measurable key results per outcome, and the weekly review rituals"}, {"id": "save", "tool": "client_memory", "desc": "On approval, save the quarterly plan as the active quarter of record"}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Outcome-and-key-results quarterly planning — set a few ambitious quarterly outcomes, attach measurable key results that objectively verify each, and define the recurring weekly review rituals that keep progress honest.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$identify_risks$s$, $s$Identify What Could Derail the Plan$s$, $s$Pressure-tests the current plan by surfacing what could throw it off — the concentration risks, the fragile dependencies, the assumptions that might not hold — and flags the ones worth watching. Presented in chat, with major risks optionally flagged for follow-up.$s$,
    $s$vision_strategy$s$,
    ARRAY[$s$what could go wrong$s$, $s$surface my risks$s$]::text[],
    $j$[{"id": "context", "tool": "context", "desc": "Pull the active plan, current-state snapshot, and known dependencies"}, {"id": "reference", "tool": "rag", "desc": "Retrieve relevant knowledge on common failure modes for the owner's model/stage"}, {"id": "surface", "tool": "anthropic", "desc": "Enumerate plausible derailers, rank by likelihood and impact, and note a mitigation for each"}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Pre-mortem risk surfacing — assume the plan could fail, work backward to name the concrete threats (concentration, fragile dependencies, untested assumptions), rank them by likelihood and impact, and flag the ones that warrant a mitigation.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  )
on conflict (slug) do nothing;
