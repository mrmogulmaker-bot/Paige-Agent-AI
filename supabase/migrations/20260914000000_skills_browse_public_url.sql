-- Task #126 Slice 3b — seed the `browse_public_url` platform-baseline skill into paige_skills.
--
-- WHAT: one platform-baseline skill that opens an ARBITRARY public web page the tenant points Paige at
-- (read-only), extracts the structured research shape (title / meta description / h1 headings / capped
-- body text / bounded links inventory), and reports honestly what actually loaded. This turns the
-- Slice 3a paige-browser `/browse-public-url` wildcard endpoint into a real Paige capability tenants
-- reach from chat. It is the FIRST producer of that endpoint (§37) and the FIRST writer of the
-- paige_browser_usage audit rail (the write lives in the CALLER — skill-interpreter — via service_role;
-- the DB-free Fly host writes nothing, §9/§34).
--
-- HOW IT FIRES (built to the merged S1b/S3b dispatch — skill-interpreter.ts / -core.ts, NOT re-derived):
--   • The interpreter routes a `tool:"browser"` step with `mode:"public"` to the PUBLIC-web browse seam
--     (paige-browser /browse-public-url), distinct from the mode-less self-verify path — so
--     `verify_deployed_surface` (Slice 2) stays byte-unchanged (§58).
--   • Dispatch requires `browser` in allowed_tools (§37) AND the §16 risk floor resolves to "execute".
--     resolveExecutionMode: lane 'auto' + risk 'read_only' → execute. So this row is autonomy_lane='auto'
--     + risk_level='read_only' BY REQUIREMENT (any other lane/risk gates the browse ahead of the human and
--     it never fires) — AND that is the CORRECT §16 classification: reading a public page mutates nothing
--     and sends nothing.
--   • The URL is RUNTIME INPUT (inputs.url) — there is deliberately NO static step `url`. This is the §18
--     "url-from-input" shape (the tenant says "browse example.com"; Paige browses what they asked). If no
--     valid http(s) URL is provided, the interpreter degrades honestly to needs_config
--     (browse_url_missing) — never a fabricated page (§13).
--   • On every call (allowed OR blocked) the interpreter writes EXACTLY ONE row to paige_browser_usage
--     (tenant_id EXPLICIT from the server-resolved tenant, §9/§51) — the §17 Engine-2 metered/audit rail.
--   • foldPublicBrowse folds the HONEST observation (or the honest block/failure reason) into the forge
--     context; the forge, steered by THIS row's description + methodology_anchor, summarizes only what
--     actually loaded. No new code — the reasoning discipline rides in the row (§18).
--
-- §9/§51/§62 SCOPING — platform, JUSTIFIED: reading a public web page to gather information is a
--   coaching-generic OPERATIONS mechanic every client-based business wants ("read this page / pull the
--   info off this site"). It is a platform BASELINE capability (§62) every tier receives per the §61
--   default distribution (god yes · solo yes · sub_account yes · agency resell · enterprise yes+resell),
--   and the #135/#481 interpreter fix means a scoping='platform' row RUNS for real tenant callers.
--   §2 finance-clean (zero credit/funding/lender wording — the proof's finance scan re-verifies 0 hits).
--   §11 — no backend jargon, table/function names, or §-anchors in any visible copy.
--
-- category = 'operations_process' (canonical §15, locked by the CHECK in 20260830000000). NOTE (§10/§13
--   correction): the Slice 3b brief said category 'research' — that value does NOT exist in the 12-value
--   canonical enum. Reading a public page is an operations/quality mechanic; 'operations_process' is the
--   correct best fit (same bin as verify_deployed_surface). Logged as a §13 correction in master §10.
--
-- §1 crew: design/build engineer (this seed) + adversarial verifier (peer-gate §39, reads the pushed
--   diff) + compliance officer (§5 — §2/§9/§11/§16/§18/§50). ON CONFLICT (slug) DO NOTHING → idempotent,
--   re-run-safe. §50 trademark-clean (no pop-culture marks).
-- §32.a ROLLBACK PROOF — RAN against prod (ref xygzykjyynhzqytbqnzu) via a DO block that inserts this
--   row, asserts, and RAISEs to roll back (persisted_rows re-queried = 0 after). GREEN result (verbatim):
--   SLICE3B_PROOF new=1 cat=operations_process browser=t mode=t lane=auto risk=read_only scope=platform nourl=t fin=0 jarg=0
--   (row inserts cleanly past all CHECKs; category canonical; 'browser' granted; the browse step carries
--   mode='public' so it routes to /browse-public-url; auto+read_only so the browse FIRES per §16; scoping
--   platform; NO static step url — url is runtime input; §2 finance=0; §11 jargon=0.)
-- §32.b AUDIT-WRITE SHAPE PROOF — the interpreter's exact paige_browser_usage INSERT (both an allowed row
--   and a blocked row) proven against the real table (rolled back): SLICE3B_AUDIT_PROOF inserted_id_ok=t rows=2.
-- §32 POST-MERGE (owed): confirm schema_migrations advanced to 20260914000000 + the row exists on prod +
--   git diff db-live..HEAD empty, after deploy-migrations.yml applies it. §32.c LIVE DRIVE (owed to
--   Cowork's paige-mcp run_skill against a real public URL) proves Paige navigates, writes the audit row,
--   and returns an honest observation.

insert into public.paige_skills (
  slug, name, description, category, trigger_phrases, steps, allowed_tools,
  risk_level, autonomy_lane, methodology_anchor, tier_availability, scoping,
  created_by, status, require_admin_confirm_first_n
) values
  (
    $s$browse_public_url$s$, $s$Browse a Public Web Page$s$,
    $s$Opens a public web page you point her at (read-only), reads what is actually on it — the title, the short description, the headings, the main text, and the links — and reports back what she found. She only looks: she opens no forms, clicks nothing, signs into nothing, and changes nothing on the page. If the page cannot be reached or is blocked, she says so plainly and names the reason, instead of guessing what might be on it. Give her a web address and, if you like, what you want to know, and she will pull the details and summarize them honestly.$s$,
    $s$operations_process$s$,
    ARRAY[$s$browse this website for me$s$, $s$read this page and tell me what it says$s$, $s$look up this url$s$, $s$pull the details off this link$s$, $s$what is on this web page$s$, $s$check out this site and summarize it$s$, $s$open this page and read it$s$]::text[],
    $j$[{"id": "fetch_page", "tool": "browser", "mode": "public", "desc": "Open the public web page the user provided (read-only), wait for it to load, and read its title, short description, headings, main text, and links so Paige can report what is actually on it. Never open forms, click, sign in, or change anything — this is look-only."}, {"id": "summarize", "tool": "anthropic", "desc": "Summarize only what actually loaded — the page title, what the page is about, its main points, and any notable links — grounded strictly in the observed content. If the page was blocked or failed to load, state the specific reason and do not invent page content that was not seen."}]$j$::jsonb,
    ARRAY[$s$browser$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Open the public page the user names read-only, extract only what actually loaded — the title, short description, headings, capped main text, and a bounded list of links — and summarize it honestly; if the fetch is blocked or fails, state the specific reason and never fabricate page content that was not observed.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  )
on conflict (slug) do nothing;
