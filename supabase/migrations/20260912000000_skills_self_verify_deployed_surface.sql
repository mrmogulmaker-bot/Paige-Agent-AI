-- Task #126 Slice 2 (owner Fork 6) — seed the FIRST self-verify skill into paige_skills.
--
-- WHAT: one platform-baseline skill, `verify_deployed_surface`, that drives a DEPLOYED, PUBLIC Paige web
-- surface (read-only), OBSERVES the render, and REASONS an honest verdict about whether it came up
-- correctly. This is the software counterpart of the owner-owed §32.c "live-drive and confirm the render"
-- walk: instead of the owner eyeballing a deployed page, Paige opens it, checks that its key elements
-- loaded, and reports rendered-correctly OR a specific problem — never a hoped-for good render (§13).
--
-- HOW IT FIRES (built to the merged Slice-1b dispatch — skill-interpreter.ts / -core.ts, NOT re-derived):
--   • The interpreter dispatches the browse ONLY when the plan carries a `tool:"browser"` step AND
--     `browser` is in allowed_tools (§37 — allowed_tools is genuinely executed) AND the §16 risk floor
--     resolves to "execute". resolveExecutionMode: lane 'auto' + risk 'read_only' → execute. So this row
--     is autonomy_lane='auto' + risk_level='read_only' BY REQUIREMENT — any other lane/risk would gate the
--     browse ahead of the human and it would never fire. This is a genuine read (no mutation/send), so
--     auto+read_only is also the CORRECT §16 classification, not a shortcut.
--   • The browse URL is the STATIC step url (skill-interpreter.ts:167) — a FIXED public Paige surface,
--     NOT a run input. (url-from-input is a tracked follow-up, not this slice.) A tenant-private/authed URL
--     would belong to Slice 4; Slice 2 targets the PUBLIC marketing landing (https://paigeagent.ai), which
--     is SSRF-safe (paige-browser's own guard blocks private/internal hosts) and stable.
--   • The read-only observation steps are the paige-browser self-verify contract subset
--     (assertSelector | assertText | readText — click/submit/type/download are REJECTED by the service).
--     `#root` (the app shell) + `h1` (the hero heading) + the brand word prove the page actually rendered;
--     readText on the heading gives Paige real text to reason over.
--   • foldBrowserObservation folds the HONEST observation (final_url / http_status / title / excerpt /
--     per-step ok) into the forge context; the forge, steered by THIS row's description + methodology_anchor
--     (the reasoning ask), produces the verdict. No new code — the reasoning discipline rides in the row
--     (§18: solve it in the skill, not a fork of the interpreter/forge).
--
-- §9/§51 SCOPING — platform, JUSTIFIED: self-verifying that a deployed surface renders is a coaching-generic
--   OPERATIONS/quality mechanic (any client-based business wants "is my published page live and rendering?").
--   It is a platform BASELINE capability (§62) every tier receives per the §61 default distribution, and the
--   #135/#481 interpreter fix means a scoping='platform' row RUNS for real tenant callers. The FIXED first
--   target is a Paige-owned public surface (operator dogfooding, §35 — the §32.c killer is operator-oriented),
--   but the COPY carries no operator-only assumption: it describes verifying "a deployed web page", which the
--   url-from-input follow-up will point at a tenant's own published surface. §2 finance-clean (zero
--   credit/funding/lender wording — the proof's finance scan re-verifies 0 hits). §11 — no backend jargon,
--   table/function names, or §-anchors in any visible copy (name/description/methodology_anchor).
--
-- category = 'operations_process' (canonical §15, locked by the CHECK in 20260830000000): verifying that a
--   deployed surface renders is an operations/quality check, not strategy/delivery/marketing. Best fit of the 12.
--
-- §13 REASONING (owner Fork 8) — the skill must make Paige REASON, not echo: compare the observation to what a
--   correctly-rendered page shows (app shell present, a real heading, a 200 status, a non-blank title, no error
--   text), name any discrepancy, and report a HONEST verdict — rendered-correctly vs a specific problem —
--   NEVER claiming a good render she did not observe. That instruction lives in the description + anchor below.
--
-- §1 crew: design/build engineer (this seed) + adversarial verifier (peer-gate §39, reads the pushed diff) +
--   compliance officer (§5 — §2/§9/§11/§16/§18/§50). ON CONFLICT (slug) DO NOTHING → idempotent, re-run-safe.
-- §50 trademark-clean (no pop-culture marks).
-- §32.a ROLLBACK PROOF — RAN against prod (ref xygzykjyynhzqytbqnzu) via a DO block that inserts this row,
--   asserts, and RAISEs to roll back (persisted_rows confirmed 0 after). GREEN result:
--   SLICE2_PROOF new=1 cat_ok=1 browser_ok=1 lane_ok=1 risk_ok=1 scope_ok=1 wait_ok=1 steponly_ok=1 fin=0 jarg=0
--   (row inserts cleanly + passes the category CHECK; 'browser' in allowed_tools; auto+read_only so the browse
--   FIRES per §16; scoping=platform; waitForSelector present; steps are read-only only; §2 finance=0; §11 jargon=0).
-- §32 POST-MERGE (owed): confirm schema_migrations advanced to 20260912000000 + the row exists on prod +
--   git diff db-live..HEAD empty, after deploy-migrations.yml applies it. §32.c LIVE DRIVE (owed to Cowork's
--   paige-mcp run_skill against the live surface) proves Paige actually navigates + returns an honest verdict.

insert into public.paige_skills (
  slug, name, description, category, trigger_phrases, steps, allowed_tools,
  risk_level, autonomy_lane, methodology_anchor, tier_availability, scoping,
  created_by, status, require_admin_confirm_first_n
) values
  (
    $s$verify_deployed_surface$s$, $s$Verify Deployed Surface$s$,
    $s$Opens a deployed, public web page, checks that it actually came up, and reports an honest verdict on whether it loaded correctly. Paige loads the page read-only, confirms its key parts are there — the page's main structure, a real heading, and the expected wording — and reads what actually appeared. She then reasons about it: she compares what she saw against what a correctly-loaded page should show, and calls out any problem — a missing heading, an error, a blank or wrong title, error text on the page. She reports back either "it loaded correctly" with the specifics she confirmed, or names the exact problem she found. She never claims a page came up right when she did not actually see it, and she only looks — she opens no forms, clicks nothing, and changes nothing on the page.$s$,
    $s$operations_process$s$,
    ARRAY[$s$check that our published page is live$s$, $s$verify the site is rendering correctly$s$, $s$is our landing page up$s$, $s$confirm the page loads and looks right$s$, $s$self-verify the deployed page$s$, $s$make sure the page actually rendered$s$]::text[],
    $j$[{"id": "observe_surface", "tool": "browser", "url": "https://paigeagent.ai", "waitForSelector": "h1", "desc": "Open the deployed public page read-only and confirm it came up: wait for the heading to appear (the page is a single-page app that fills in after load), confirm the page's main structure and a real heading are present and the expected brand wording is on the page, then read the heading text to reason over.", "steps": [{"kind": "assertSelector", "selector": "#root"}, {"kind": "assertSelector", "selector": "h1"}, {"kind": "assertText", "text": "Paige"}, {"kind": "readText", "selector": "h1"}]}, {"id": "reason_verdict", "tool": "anthropic", "desc": "Compare what came up against what a correctly-loaded page shows — the page's main structure present, a real heading, no error, a non-blank title, no error text — name any problem, and report an honest verdict: it loaded correctly (with what was confirmed) or the specific problem found. Never claim a page came up right that was not actually seen."}]$j$::jsonb,
    ARRAY[$s$browser$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Drive the deployed page read-only, observe what actually came up — whether the page responded without error, its title, whether its main structure and heading are present, and the actual on-page wording — then reason the observation against what a correctly-loaded page shows and report an honest loaded-correctly-or-specific-problem verdict, never a result not actually observed.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  )
on conflict (slug) do nothing;
