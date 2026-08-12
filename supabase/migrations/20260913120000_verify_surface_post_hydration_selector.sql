-- Task #126 Slice 2 primitive fix (owner-ruled 2026-08-12) — tighten `verify_deployed_surface` to
-- resolve ONLY against POST-HYDRATION content.
--
-- WHY (§32.c): the original seed (20260912000000, already prod-applied) used
--   waitForSelector: "h1"  +  assertSelector "#root".
-- Both of those ALSO exist in index.html's static no-JS/SEO skeleton, which a `networkidle`
-- headless read resolves against BEFORE React (createRoot) clears #root and renders the live app.
-- That is exactly how Paige's live-drive honestly read STALE landing content (the retired pricing
-- the owner caught): the wait predicate was satisfied by the pre-render skeleton, not the hydrated
-- app. A permissive selector made Slice 2's "GREEN" verdict able to reflect skeleton content.
--
-- THE FIX: wait on `[data-app-ready]` — a marker element rendered by the React root in src/main.tsx
-- that exists ONLY in the React tree and NEVER in the static skeleton. So the browse now resolves
-- against the app AFTER it mounts; the pre-render skeleton can no longer produce a false positive.
-- The steps then assert the marker (proves hydration), the heading, and the brand word, and read the
-- HYDRATED heading — so the verdict reasons over live-app content, not the crawler fallback.
--
-- §18 — this UPDATEs the existing skill row in place; it does NOT edit the already-applied
-- 20260912000000 migration (that one ran on prod; §32 "never edit an applied migration"). idempotent:
-- keyed on slug, re-run-safe. Skill identity/scoping/tiers/lane/risk are UNCHANGED — only the browse
-- step's waitForSelector + observation steps + the two descriptions change.
--
-- §37 producer inventory: the ONLY consumer of `steps` is the skill interpreter
-- (skill-interpreter.ts pickBrowserStep/foldBrowserObservation) which reads step.url,
-- step.waitForSelector, and step.steps[].{kind,selector,text} — all preserved in shape; the values
-- change, the contract does not. paige-browser's ALLOWED_STEP_KINDS (assertSelector/assertText/
-- readText) are unchanged and all still used.
--
-- §32 POST-MERGE (owed): confirm schema_migrations advanced to 20260913120000 on prod + the row's
-- steps JSON shows waitForSelector '[data-app-ready]', after deploy-migrations.yml applies it. §32.c
-- LIVE DRIVE (owed to a capable session): re-drive https://paigeagent.ai and confirm the returned
-- content is the HYDRATED app (current pricing/copy), never the skeleton.

update public.paige_skills
set steps = $j$[
  {
    "id": "observe_surface",
    "tool": "browser",
    "url": "https://paigeagent.ai",
    "waitForSelector": "[data-app-ready]",
    "desc": "Open the deployed public page read-only and wait for the app to finish loading before reading anything. The page is a single-page app that first shows a lightweight placeholder for search engines, then the real app fills in; wait for the app's ready marker so we only read the fully-loaded page, never the placeholder. Then confirm a real heading is present and the expected brand wording is on the loaded page, and read the heading text to reason over.",
    "steps": [
      {"kind": "assertSelector", "selector": "[data-app-ready]"},
      {"kind": "assertSelector", "selector": "h1"},
      {"kind": "assertText", "text": "Paige"},
      {"kind": "readText", "selector": "h1"}
    ]
  },
  {
    "id": "reason_verdict",
    "tool": "anthropic",
    "desc": "Compare what came up against what a correctly-loaded page shows — the app finished loading (its ready marker was present), a real heading, no error, a non-blank title, no error text — name any problem, and report an honest verdict: it loaded correctly (with what was confirmed) or the specific problem found. Never claim a page came up right that was not actually seen."
  }
]$j$::jsonb
where slug = 'verify_deployed_surface';
