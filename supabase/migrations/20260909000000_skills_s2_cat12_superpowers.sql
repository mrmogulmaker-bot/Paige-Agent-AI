-- S2 wave · Category 12 (Superpowers) — seed 5 platform baseline skills into paige_skills.
--
-- Run through the generic S1b interpreter (default dispatch) — NO bespoke handler. category = 'superpowers'
-- (canonical §15, locked by the CHECK in 20260830000000). IP-CLEAN per §14/§62. tier_availability = §61
-- default; scoping = 'platform'. FINAL category of the S2 wave (12/12). Owner-ruled 2026-08-12: "seed thin
-- wrappers".
--
-- WHAT THESE ARE: tenant-facing FILE-ARTIFACT PRODUCTION recipes — they take ALREADY-APPROVED content and
-- produce a polished, downloadable DELIVERABLE (a formatted document, a slide deck, a data workbook, a
-- one-page leave-behind, a combined packet). They wrap Paige's existing render/format fabric; they do NOT
-- author content and do NOT build web assets.
--
-- §18 — the whole difficulty of this category, crew-audited (verdict SHIP, 0 dropped): these are FILE
-- PRODUCTION, explicitly distinct from BOTH neighbors:
--   • vs Cat 2 (Documents): Cat 2 AUTHORS the copy/text/narrative; every Cat 12 skill takes already-approved
--     copy and only imposes STRUCTURE + renders a FILE — it does not write the underlying words.
--   • vs the Vibe Studio: the Studio builds WEB/interactive/image assets (pages/funnels/forms/images); every
--     Cat 12 skill produces a STATIC downloadable file (PDF/document/deck/workbook), never a web/image asset.
--   Each skill states its Cat 2 AND Studio boundary in its own description. produce_one_page_pdf_asset is the
--   tightest Studio boundary — it applies brand fonts/colors as FORMATTING only and generates NO images/web.
--
-- §13 HONESTY (the key gate here): the interpreter renders via pdf_render and otherwise forges formatted
-- CONTENT — it cannot guarantee an editable binary (.docx/.pptx/.xlsx). So every skill renders a PDF
-- DIRECTLY where it can and otherwise hands over the FORMATTED CONTENT for the chosen file type, and NEVER
-- claims a finished editable binary it cannot produce; each carries a 'flag what is missing, do not invent'
-- clause. (The crew rewrote format_document/build_slide_deck off an earlier over-claim of Word/.pptx binaries.)
--
-- §16 INTERPRETER-HONEST: all 5 are DRAFT + CONFIRM (a deliverable producer files a draft for human approval;
-- NONE auto-executes, NONE sends). No external-send call site; pdf_render renders a review artifact, not a send.
--
-- §2 FINANCE-CLEAN + §11 CLEAN: coaching-generic file production, ZERO consumer-finance wording, and ZERO
-- backend table/function/seam identifiers in any tenant-visible field (the §32.a proof re-verifies finance=0
-- AND jargon=0). §3 voice clean. IP-clean (no branded product/framework/repo name; the literal words
-- "superpowers"/"taste"/a repo name never enter a row).
--
-- SOURCING LINEAGE (attribution here in the reference ONLY, never in a row, per §14): Anthropic Skills registry
-- structure + standard document/deck/spreadsheet production mechanics (content-to-file layout, outline-to-slides,
-- figures-to-workbook, copy-to-one-page, multi-piece assembly/pagination) — mechanics only, IP-clean.
--
-- §1 crew: distiller + ruthless §18 dedup-auditor (verdict SHIP, 0 dropped — all 5 are genuine file production,
--   none a Cat 2 content-draft or a Studio web-asset). ON CONFLICT (slug) DO NOTHING makes this idempotent.

insert into public.paige_skills (
  slug, name, description, category, trigger_phrases, steps, allowed_tools,
  risk_level, autonomy_lane, methodology_anchor, tier_availability, scoping,
  created_by, status, require_admin_confirm_first_n
) values
  (
    $s$format_document_deliverable$s$, $s$Formatted Document Deliverable Producer$s$, $s$Takes content you have already approved and lays it out as a polished, structured document — cover, ordered headings, sections, and clean page flow — formatted for the file type you want. It renders a PDF directly and prepares the formatted content ready to drop into your document tool; it does not write the underlying copy, and where a true editable file cannot be produced it hands over the formatted content for review instead of claiming a finished binary. Produces the deliverable as a draft to review before it is treated as final, and flags anything missing rather than inventing it.$s$,
    $s$superpowers$s$,
    ARRAY[$s$turn this into a formatted document$s$, $s$make this a polished downloadable doc$s$, $s$format this into a clean file$s$, $s$produce a finished document file from this content$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the approved content, the intended reader, and any title or section structure from the request and existing records."}, {"id": "brand", "tool": "rag", "desc": "Reference the tenant's brand material so headings, styling, and tone match how the business presents itself."}, {"id": "format", "tool": "anthropic", "desc": "Lay the approved content into a document structure — title, ordered headings and sections, and a clean reading flow — formatted for the chosen file type, flagging any gap rather than filling it."}, {"id": "render", "tool": "pdf_render", "desc": "Render the formatted content into a downloadable PDF deliverable draft, or hand over the formatted content when the chosen file type cannot be produced directly."}, {"id": "save", "tool": "client_memory", "desc": "Save the formatted document deliverable as a record for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$pdf_render$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$content-to-file layout mechanic: impose a document structure — title, ordered headings, sections, and page flow — over approved copy, render a PDF directly and format the content for the chosen file type, delivered review-first with missing pieces flagged and no claimed binary it cannot produce$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$build_slide_deck_deliverable$s$, $s$Slide Deck Deliverable Builder$s$, $s$Takes an approved outline or set of points and lays it out slide by slide as a presentation — a title slide, one core idea per slide with supporting points, and a closing slide. It renders the deck to PDF directly and prepares the formatted slide content ready to load into your presentation tool; it structures already-approved material and does not author the underlying narrative. Produces the slides as a draft to review, flagging any gap rather than inventing content, and hands over the formatted slide content when a live slide file cannot be produced directly.$s$,
    $s$superpowers$s$,
    ARRAY[$s$lay this outline into slides$s$, $s$build a deck from these points$s$, $s$format this into a slide presentation$s$, $s$turn my outline into a deck file$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the approved outline or points, the audience, and the desired number of slides or length from the request and existing records."}, {"id": "brand", "tool": "rag", "desc": "Reference the tenant's brand material so slide styling and tone match how the business presents."}, {"id": "format", "tool": "anthropic", "desc": "Lay the approved material out slide by slide — a title slide, one core idea per slide with supporting points, and a closing slide — flagging any gap rather than filling it."}, {"id": "render", "tool": "pdf_render", "desc": "Render the slides into a downloadable PDF deliverable draft, or hand over the formatted slide content when a live slide file cannot be produced directly."}, {"id": "save", "tool": "client_memory", "desc": "Save the formatted deck deliverable as a record for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$pdf_render$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$outline-to-slides layout mechanic: partition approved material into a title slide, one-idea-per-slide body, and a close, render to PDF and format for a presentation file as a review-first deliverable, with gaps flagged and no claimed slide binary it cannot produce$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$produce_data_workbook$s$, $s$Data Workbook Producer$s$, $s$Takes a set of figures or records and lays them into a structured workbook — labeled columns, grouped sections, and summary rows — prepared to load into your spreadsheet tool. It formats supplied data into a workbook structure; it does not source or estimate the numbers, and it produces the structured content for review rather than a finished binary spreadsheet. Flags any missing value rather than guessing it.$s$,
    $s$superpowers$s$,
    ARRAY[$s$put these numbers into a spreadsheet$s$, $s$build a workbook from this data$s$, $s$format these figures into a data sheet$s$, $s$make a structured spreadsheet from this$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the figures or records, the columns they map to, and any grouping or totals wanted from the request and existing records."}, {"id": "format", "tool": "anthropic", "desc": "Lay the data into labeled columns and logical groups with summary rows, flagging any value that is missing rather than filling it."}, {"id": "save", "tool": "client_memory", "desc": "Save the structured workbook deliverable as a record for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$figures-to-workbook layout mechanic: map supplied records into labeled columns and grouped sections with summary rows, missing values flagged, structured as review-first workbook content prepared for a spreadsheet tool rather than a claimed finished binary$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$produce_one_page_pdf_asset$s$, $s$One-Page PDF Leave-Behind Producer$s$, $s$Takes approved copy and lays it into a clean, print-ready single-page PDF leave-behind, applying your brand fonts and colors as formatting. It formats approved words into a one-page file layout; it does not write the copy and does not generate images or build web pages. Produces the print-ready page as a draft to review, flagging anything missing rather than inventing it.$s$,
    $s$superpowers$s$,
    ARRAY[$s$make this into a one-page PDF$s$, $s$format this into a print-ready leave-behind$s$, $s$produce a clean one-page handout file$s$, $s$lay this copy into a one-pager PDF$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the approved copy, the audience, and the single call to action from the request and existing records."}, {"id": "brand", "tool": "rag", "desc": "Reference the tenant's brand fonts and colors so the page formatting matches how the business presents itself."}, {"id": "format", "tool": "anthropic", "desc": "Lay the approved copy into a single-page structure — headline, core value, supporting points, and one call to action — sized and styled to fit one printable page, flagging anything missing rather than inventing it."}, {"id": "render", "tool": "pdf_render", "desc": "Render the formatted page into a print-ready PDF file as a downloadable deliverable draft."}, {"id": "save", "tool": "client_memory", "desc": "Save the one-page PDF deliverable as a record for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$pdf_render$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$copy-to-single-page layout mechanic: fit approved copy into a one-page hierarchy — headline, value, proof, one action — with brand fonts and colors applied as formatting only (no image generation, no web build), rendered print-ready as a review-first deliverable$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$assemble_pdf_packet$s$, $s$Combined PDF Packet Assembler$s$, $s$Takes several pieces of already-approved content and assembles them into one ordered, paginated document — a cover, a table of contents, and each piece as a section in sequence — rendered to a combined PDF. It orders and paginates approved pieces into a single file; it does not author their content, and where source pieces cannot be merged directly it assembles the combined content for review. Produces the packet as a draft to review, flagging any missing piece rather than fabricating it.$s$,
    $s$superpowers$s$,
    ARRAY[$s$combine these into one packet$s$, $s$assemble these documents into a single file$s$, $s$bundle these pieces into one PDF$s$, $s$put these together as a paginated packet$s$]::text[],
    $j$[{"id": "gather", "tool": "context", "desc": "Pull the approved pieces to include, the order they should appear in, and the packet title from the request and existing records."}, {"id": "brand", "tool": "rag", "desc": "Reference the tenant's brand material so the cover and section styling match how the business presents itself."}, {"id": "format", "tool": "anthropic", "desc": "Assemble a cover, a table of contents, and each approved piece as an ordered section with consistent pagination, flagging any piece that is missing rather than fabricating it."}, {"id": "render", "tool": "pdf_render", "desc": "Render the ordered sections into a combined downloadable PDF deliverable draft, or assemble the combined content for review when source pieces cannot be merged directly."}, {"id": "save", "tool": "client_memory", "desc": "Save the combined packet deliverable as a record for review and approval."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$pdf_render$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$multi-piece assembly-and-pagination mechanic: sequence approved pieces behind a cover and table of contents with consistent pagination into one combined PDF as a review-first deliverable, missing pieces flagged and no fabricated content$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  )
on conflict (slug) do nothing;
