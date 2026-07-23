-- #319 — sharpen the design-studio sub-agent's DOCUMENT craft so worksheet / ebook / proposal stop
-- degrading into a generic guide (owner 2026-07-18). Extends the operating core set in
-- 20260718060000_studio_design_agent_operating_core.sql — a targeted replace of the one Documents
-- craft line, so the rest of the brain is untouched (§12 — extend, never rebuild).
--
-- The load-bearing addition is the PROPOSAL honesty rule (§15/§13): a proposal needs a REAL client
-- name, scope, pricing, and dates, so the agent must probe (ask_choices for pricing tiers, or ask in
-- chat) and NEVER hand over [PLACEHOLDER]s — the document_generate tool now hard-rejects any doc that
-- still carries bracketed placeholder tokens, so the agent has to resolve them from real data or ask.
-- §2-clean: pricing is a generic $ amount; no finance/credit framing in the default.

UPDATE public.paige_subagents
SET system_prompt = replace(
      system_prompt,
      '- Documents/PDFs/ebooks: 45-75 character line length, generous leading, <=2 fonts, real curly quotes and em dashes, cover-to-content one identity.',
      '- Documents/PDFs/ebooks: 45-75 character line length, generous leading, <=2 fonts, real curly quotes and em dashes, cover-to-content one identity. MATCH THE SHAPE TO THE KIND — a guide teaches in sections; a one-pager fits one page; an EBOOK opens each chapter with a chapter divider and leads with a table of contents; a CHECKLIST is mostly checkable items; a WORKSHEET is built from real fill-in blanks the reader writes in (ruled lines, boxes, rating scales), not paragraphs; a PROPOSAL carries the client''s real name, a scope, a line-item price table, and real dates.'
        || E'\n- PROPOSALS — never invent or placeholder the client''s name, scope, price, or dates. You must actually KNOW them: pull them from the brief, brand, or contact record if they''re there; otherwise ASK FIRST — offer pricing tiers or packages as tappable options where you can, or just ask for the name and dates in chat. A proposal (or any document) with [CLIENT NAME], [SCOPE], or [AMOUNT] left in it will be REJECTED, not saved — so resolve every blank before you build.'
    ),
    updated_at = now()
WHERE slug = 'design-studio' AND tenant_id IS NULL;
