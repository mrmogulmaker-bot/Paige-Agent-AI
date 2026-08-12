-- S2 wave · Category 8 (Financial Ops) — seed 10 platform baseline skills into paige_skills.
--
-- Run through the generic S1b interpreter (default dispatch) — NO bespoke handler. category = 'financial_ops'
-- (canonical §15, locked by the CHECK in 20260830000000). IP-CLEAN per §14/§62 (mechanic-descriptive only —
-- no anchor-person name, no branded finance-framework title, no source-repo name). tier_availability = §61
-- default; scoping = 'platform'.
--
-- §38 MONEY BOUNDARY (the sharpest gate for Financial Ops): these are OPERATIONAL money mechanics for a tenant
-- billing THEIR OWN clients. Every money skill (invoice_draft, payment_link_generate, payment_plan_draft,
-- subscription_billing_setup_draft) is FACILITATOR-ONLY on the TENANT'S OWN connected processor (direct-charge)
-- — Paige is NEVER merchant of record, never holds/routes funds, never collects. Each DRAFTS the artifact and
-- names the tenant's own downstream seam (generate-invoice / the tenant's processor / compose-email) that
-- executes AFTER a human approves.
--
-- §2 FINANCE-CLEAN (platform default): coaching-generic OPERATIONAL business finance ONLY (invoicing, AR,
-- expenses, budgeting, a client installment PAYMENT PLAN for a service fee) — ZERO consumer-finance wording
-- (credit/funding/lender/loan/financing/FICO). The §1 verifier CAUGHT + SCRUBBED 6 banned-token hits that lived
-- inside the distillers' OWN disclaimers ("never as financing/loan/credit") and reframed them positively
-- ("described strictly as a payment plan"); the shipped corrected set is §2-clean (the §32.a proof's finance
-- scan re-verifies 0 hits). NB: "funds" (§38 "never holds the funds") is boundary language and is NOT the §2
-- banned token "funding" — retained deliberately.
--
-- §13 INTERPRETER-HONEST: 3 read_only+auto (accounts_receivable_review, expense_summary, profitability_review
-- — READ only what the metric/billing layer ALREADY exposes, compute nothing from raw ledgers, persist nothing,
-- explicit "not available" fallback) + 7 DRAFTERS (draft+confirm, file a draft for approval). NONE send, charge,
-- move money, run SQL, or execute a billing change.
--
-- §18 EXCLUSIONS (wrap-don't-duplicate): profitability_review = single-period MARGIN state (distinct from Cat 6
-- revenue_trend_read multi-period trend narrative); financial_summary_draft = the P&L numbers-and-lines
-- STATEMENT document (distinct from Cat 6 monthly_qbr_draft business-review prose); budget_plan_draft = forward
-- OPERATING/spending plan (distinct from Cat 4 revenue_forecast sales projection); subscription_billing_setup_draft
-- = the money SCHEDULE/cadence (distinct from Cat 2 draft_engagement_contract legal agreement);
-- overdue_invoice_followup = AR on ONE named unpaid invoice (distinct from Cat 3 progress_checkin / Cat 4
-- followup_sequence). invoice_draft wraps the existing generate-invoice seam (§18 one home). payment_links skill
-- from the narrowed Task #100 lands here as payment_link_generate.
--
-- SOURCING LINEAGE (attribution here in the reference ONLY, never in a row, per §14): Anthropic Skills registry
-- structure + standard small-business finance-ops mechanics (engagement-grounded invoicing, direct-charge
-- payment request, AR reminder, AR aging read, expense categorization, single-period P&L margin, operating
-- budget, installment schedule, P&L statement assembly, recurring-billing cadence) — mechanics only, IP-clean.
--
-- §1 crew: 2 distillation engineers + adversarial IP/§16/§18/§2/§38/§13 verifier. Verdict FIX_NEEDED because
--   the verifier CAUGHT + SCRUBBED the 6 §2 banned-token hits above (in the distillers' own disclaimers) and
--   re-verified §38 facilitator-only + §16 lanes + §13 read-honesty clean; the corrected set this migration
--   ships is §2/§38-clean (integrator re-scanned: banned tokens = 0). This is the §5/§2 verify pass as designed.
-- ON CONFLICT (slug) DO NOTHING makes this idempotent + safe to re-run.

insert into public.paige_skills (
  slug, name, description, category, trigger_phrases, steps, allowed_tools,
  risk_level, autonomy_lane, methodology_anchor, tier_availability, scoping,
  created_by, status, require_admin_confirm_first_n
) values
  (
    $s$invoice_draft$s$, $s$Client Invoice Drafter$s$, $s$Drafts an invoice for a client engagement — line items, amounts, due date, and payment terms (including a payment-plan/installment schedule where the engagement uses one) — grounded in the specific engagement and the tenant's billing template, and renders it as a document for review. It produces an approval-ready draft; after the human approves, the invoice is issued downstream through the tenant's own generate-invoice billing seam. Paige is a facilitator only and is never merchant of record — it drafts the invoice, it never collects the money.$s$,
    $s$financial_ops$s$,
    ARRAY[$s$draft an invoice for my client$s$, $s$bill this client for the engagement$s$, $s$write up the invoice for this project$s$]::text[],
    $j$[{"id": "read_engagement", "tool": "context", "desc": "Read the client engagement — the offer they bought, the amount owed, billing terms, and the tenant's own business/sending identity and connected payment processor — from the context seam so the invoice reflects this specific engagement rather than a template amount. If a figure isn't present, treat it as not available instead of inventing one."}, {"id": "pull_invoice_template", "tool": "rag", "desc": "Retrieve the tenant's invoice template, line-item structure, payment terms, and any installment / payment-plan conventions so the draft matches how this business bills its own clients."}, {"id": "draft_invoice", "tool": "anthropic", "desc": "Draft the invoice — line items, amounts, due date, and payment terms (including a payment-plan / installment schedule where the engagement uses one, described strictly as a payment plan for paying the fee over time) — in the tenant's voice, grounded in the read engagement. Names the generate-invoice seam as the downstream path that issues the invoice on the tenant's own billing after the human approves; this skill DRAFTS only, and Paige is facilitator only and never merchant of record."}, {"id": "render_invoice", "tool": "pdf_render", "desc": "Render the drafted invoice as a formatted document so the human can review it exactly as the client would receive it — no sending, no external mutation."}, {"id": "save_draft", "tool": "client_memory", "desc": "Save the drafted invoice as an internal record tied to this engagement, filed for the human to review, edit, and approve before it is issued through the billing seam."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$pdf_render$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Engagement-grounded invoice drafting that fills the tenant's billing template with this client's real line items, amounts, due date, and payment terms (including installment schedules described strictly as payment plans), renders it for review, and files an approval-gated draft that issues downstream through the tenant's own generate-invoice seam — Paige facilitates, never collects, and is never merchant of record (§38).$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$payment_link_generate$s$, $s$Client Payment Link Drafter$s$, $s$Prepares a payment / checkout request so a client can pay a service fee on the TENANT'S OWN connected processor via direct-charge — the client's card charges the tenant's account, never Paige's. It drafts the amount, description, and accompanying message for approval; after the human approves, the link is generated on the tenant's connected processor through the downstream seam. Paige never holds the funds, never routes money through Paige's bank, and is never merchant of record (§38).$s$,
    $s$financial_ops$s$,
    ARRAY[$s$create a payment link for my client$s$, $s$generate a checkout link for this fee$s$, $s$get a link so my client can pay$s$]::text[],
    $j$[{"id": "read_fee_context", "tool": "context", "desc": "Read the client, the service fee to be collected, and the tenant's OWN connected payment processor and business identity from the context seam so the checkout is a direct charge on the tenant's account for this specific fee — never a generic amount. If the processor or fee isn't present, note it rather than assuming a figure."}, {"id": "pull_checkout_template", "tool": "rag", "desc": "Retrieve the tenant's checkout / payment-request conventions and any installment / payment-plan option so the request matches how this business collects service fees from its own clients."}, {"id": "draft_payment_request", "tool": "anthropic", "desc": "Draft the payment-link request — the amount, the description of what it's for, and the short accompanying message to the client — in the tenant's voice, describing any installment option strictly as a payment plan. The link itself is generated on the TENANT'S OWN connected processor (direct-charge) through the downstream seam after the human approves; this skill DRAFTS only, Paige never holds or routes the funds, and Paige is never merchant of record."}, {"id": "save_draft", "tool": "client_memory", "desc": "Save the drafted payment request as an internal record tied to this client, filed for the human to review and approve before the link is generated on their processor and sent."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Service-fee payment-request drafting that prepares a direct-charge checkout on the tenant's own connected processor for approval — grounded in the specific fee and client, with any installment option described strictly as a payment plan — filed as an approval-gated draft that generates the link downstream on the tenant's account; Paige is facilitator only, never holds the money, and is never merchant of record (§38).$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$overdue_invoice_followup$s$, $s$Overdue Invoice Reminder Drafter$s$, $s$Drafts a courteous accounts-receivable reminder for a specific overdue invoice — a warm acknowledgement, the outstanding amount and original due date, and a clear, low-friction path to pay — in the tenant's voice. It produces an approval-ready message; after the human approves, the send happens through the compose-email seam. It never sends and never collects. This is AR framed on one named unpaid invoice — distinct from a general progress check-in or a nurture follow-up sequence.$s$,
    $s$financial_ops$s$,
    ARRAY[$s$remind my client about the overdue invoice$s$, $s$draft a payment reminder for the past-due bill$s$, $s$nudge this client on their unpaid invoice$s$]::text[],
    $j$[{"id": "read_overdue_invoice", "tool": "context", "desc": "Read the specific overdue invoice from the billing layer — the amount owed, the original due date, how many days it is past due, and the client — so the reminder is grounded in this real unpaid invoice. If the invoice data isn't present, say so rather than inventing figures."}, {"id": "pull_reminder_tone", "tool": "rag", "desc": "Retrieve the tenant's accounts-receivable reminder conventions and tone so the nudge stays courteous and on-brand for how this business handles late payment."}, {"id": "draft_reminder", "tool": "anthropic", "desc": "Draft a courteous payment reminder for this overdue invoice — a warm acknowledgement, the outstanding amount and due date, and a clear, low-friction way to pay — in the tenant's voice, keyed to the read figures and never inventing an amount. Names the compose-email seam as the downstream send path used after approval; this skill DRAFTS only and never sends or collects."}, {"id": "save_draft", "tool": "client_memory", "desc": "Save the drafted reminder as an internal record tied to this invoice, filed for the human to review, edit, and approve before it is sent."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$rag$s$, $s$anthropic$s$, $s$client_memory$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Accounts-receivable reminder drafting framed on one specific overdue invoice — a courteous nudge stating the outstanding amount, original due date, and how to pay — grounded in the read invoice figures and filed as an approval-gated draft for downstream send. §18 distinct from Cat 3 progress_checkin (delivery-cadence update) and Cat 4 followup_sequence (nurture): this is AR on a named unpaid invoice, and Paige drafts, never sends or collects.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$accounts_receivable_review$s$, $s$Accounts Receivable Review$s$, $s$Reads the outstanding and overdue invoices the billing layer already exposes and surfaces what's owed and its aging — total outstanding, current versus overdue, and the oldest balances — saying so honestly when no receivables data is connected. Read-only: it interprets what's already exposed and reports; it computes no new balances, persists nothing, and sends nothing.$s$,
    $s$financial_ops$s$,
    ARRAY[$s$what's outstanding on my invoices$s$, $s$show me my accounts receivable$s$, $s$who still owes me and how late are they$s$]::text[],
    $j$[{"id": "read_receivables", "tool": "context", "desc": "Read the outstanding and overdue invoices the billing layer already exposes — amounts owed, due dates, and per-invoice age — from the context seam. If no receivables data is connected or present, note that plainly rather than inferring balances or computing them from raw records."}, {"id": "summarize_aging", "tool": "anthropic", "desc": "Interpret the read invoices into a plain summary of what's owed and its aging — total outstanding, what's current versus overdue, and the oldest balances — grounded only in the figures present, returning an explicit 'not available' for anything the billing layer does not expose. Persists nothing and sends nothing."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Read-only accounts-receivable review that surfaces what's outstanding and its aging from the invoices the billing layer already exposes, keying every figure to present data and flagging missing data as 'not available' — an AR/collections read of the billing mechanics, §18 distinct from Cat 6 revenue_trend_read (historical trend narrative). Computes nothing, persists nothing, sends nothing.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$expense_summary$s$, $s$Expense Summary Read$s$, $s$Reads and categorizes the expense data already exposed for a period — grouping spend into plain categories and summarizing the total and largest buckets — and says so honestly when no expense data is connected. Read-only: it interprets what the data layer already exposes, computes no new figures from raw records, persists nothing, and sends nothing.$s$,
    $s$financial_ops$s$,
    ARRAY[$s$summarize my expenses this month$s$, $s$where did my money go this quarter$s$, $s$break down my spending by category$s$]::text[],
    $j$[{"id": "read_expenses", "tool": "context", "desc": "Read the expense data already exposed for the requested period from the context seam — amounts, dates, and any category or vendor labels present. If expense data isn't connected or present for the period, say so rather than fabricating figures."}, {"id": "categorize_and_summarize", "tool": "anthropic", "desc": "Categorize the read expenses into plain spending groups and summarize the period — total spend and the largest categories — grounded only in the data present, returning an explicit 'not available' for any category or figure the data does not support. Persists nothing and sends nothing."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$Read-only expense summary that categorizes and totals the expense data already exposed for a period, keying every figure to present data and returning honest 'not available' where the data is absent — operational P&L reading of the billing/expense mechanics, §18 distinct from Cat 4 revenue_forecast (forward projection) and Cat 6 trend interpretation. Computes nothing, persists nothing, sends nothing.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$profitability_review$s$, $s$Profitability Review$s$, $s$Reads the revenue and expense figures the metric layer already exposes for a period and surfaces gross/net margin and profitability, calling out honestly where a figure is not available. Read-only: reports only what is already exposed, computes no new numbers from raw ledgers, and persists nothing.$s$,
    $s$financial_ops$s$,
    ARRAY[$s$how profitable were we last month$s$, $s$what's my margin this quarter$s$, $s$profitability review$s$, $s$am I making money on this$s$, $s$show me my gross and net margin$s$, $s$how much did we net after expenses$s$, $s$review my profit for the period$s$]::text[],
    $j$[{"id": "gather_revenue", "tool": "context", "desc": "Read the revenue / income figures the metric layer already exposes for the requested period (money in). Do not compute new totals from raw ledger rows; use only what is surfaced."}, {"id": "gather_expenses", "tool": "context", "desc": "Read the expense / cost figures the metric layer already exposes for the same period, by category where available. Use only surfaced figures."}, {"id": "compose_read", "tool": "anthropic", "desc": "Compose a plain-language profitability read for the period: the gross margin and net margin implied by the already-exposed revenue vs. expense figures, the largest cost categories, and one or two observations. Where any input figure is absent, state 'not available' explicitly and never fabricate or estimate a number. Coaching-generic business-finance framing; no consumer-finance wording. Persists nothing and sends nothing."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$]::text[],
    $s$read_only$s$, $s$auto$s$,
    $s$P&L margin mechanic: revenue minus already-categorized costs over a period, expressed as gross- and net-margin percentages, reported strictly from exposed figures. DISTINCT from the Cat 6 revenue-trend narrative — this is the profitability/margin state of a single period, not a historical trend interpretation, and it persists nothing.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$budget_plan_draft$s$, $s$Operating Budget Draft$s$, $s$Drafts a simple operating budget for the business — expected income versus planned spend by category over a period — filed as a draft for owner approval. Uses only exposed income and historical-expense figures as the baseline; proposes no spending and commits nothing until a human approves.$s$,
    $s$financial_ops$s$,
    ARRAY[$s$draft me an operating budget$s$, $s$help me plan my budget for next quarter$s$, $s$build a budget by category$s$, $s$how should I plan my spending$s$, $s$put together an income vs expense budget$s$, $s$draft a monthly operating budget$s$]::text[],
    $j$[{"id": "gather_income_baseline", "tool": "context", "desc": "Read the exposed income / revenue baseline for the business (recent actuals or the metric layer's expected income) to anchor the budget's income side. Use only surfaced figures."}, {"id": "gather_expense_history", "tool": "context", "desc": "Read the exposed historical expense figures by category to inform planned-spend lines. Where categories or figures are absent, note them as blanks for the owner to fill rather than inventing amounts."}, {"id": "compose_budget", "tool": "anthropic", "desc": "Draft a simple operating budget: an income line (or lines) versus planned spend grouped by category, with a resulting planned surplus/deficit. Mark any figure not backed by exposed data as a placeholder for the owner to confirm. Coaching-generic; no consumer-finance wording."}, {"id": "file_draft", "tool": "client_memory", "desc": "File the drafted operating budget as a pending draft for owner review and approval. Paige does not adopt or act on the budget; it awaits the human's yes."}, {"id": "render_document", "tool": "pdf_render", "desc": "Render the drafted budget as a clean, presentable budget document attached to the draft for the owner to review."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Operating-budget mechanic: an income-vs-planned-spend-by-category plan for a period, drafted from exposed income and historical-expense baselines, filed for approval. A forward operating plan for the tenant's own business — DISTINCT from Cat 4 revenue_forecast (a projection of future sales) and from a P&L read of what already happened.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$payment_plan_draft$s$, $s$Client Payment Plan Draft$s$, $s$Drafts installment payment-plan options for a client to pay a service fee over time — schedule, installment amounts, and terms — filed as a draft for owner approval. Strictly a payment plan / installments arrangement on the tenant's own processor; Paige is facilitator only and never collects, charges, or holds funds.$s$,
    $s$financial_ops$s$,
    ARRAY[$s$let this client pay in installments$s$, $s$draft a payment plan for the client$s$, $s$they want to split the fee into payments$s$, $s$set up installments for this engagement$s$, $s$spread the service fee over a few months$s$, $s$draft payment plan options for a client$s$]::text[],
    $j$[{"id": "gather_fee", "tool": "context", "desc": "Read the exposed service fee / engagement amount for this client (the total to be paid over time). Use only the surfaced amount; if absent, mark it for the owner to supply rather than guessing."}, {"id": "gather_client_context", "tool": "client_memory", "desc": "Read the exposed client name and engagement context so the draft is addressed to the real client, not a placeholder. Where a detail is missing, flag it for the owner rather than inventing it."}, {"id": "compose_plan", "tool": "anthropic", "desc": "Draft one or more installment payment-plan options: number of installments, per-installment amount, cadence, and start date, summing to the exposed fee. Frame strictly as a 'payment plan / installments' — a payment-scheduling arrangement for paying a service fee over time. Note that any charge runs on the tenant's own connected processor; Paige does not collect."}, {"id": "file_draft", "tool": "client_memory", "desc": "File the drafted payment-plan options as a pending draft for owner approval. Paige never sends the plan, generates a live charge, or collects a payment on its own — the owner approves and their own processor executes."}, {"id": "render_document", "tool": "pdf_render", "desc": "Render the drafted installment options as a clear, client-ready document (schedule + amounts + terms) attached to the draft for the owner's review."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$client_memory$s$, $s$anthropic$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Installment-schedule mechanic: split a known service fee into a dated series of equal or structured installments with terms, drafted for approval. §38 facilitator-only — any real charge runs on the tenant's OWN processor (direct-charge), never through Paige. §2-critical: 'payment plan / installments' only — a payment-scheduling arrangement for a service fee.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$financial_summary_draft$s$, $s$Financial Statement Summary Draft$s$, $s$Drafts a periodic financial-statement summary — revenue, expenses, net result, and accounts-receivable outstanding — as a P&L-style numbers-and-lines document, filed for owner approval. Assembles only figures the metric layer already exposes and marks anything absent as 'not available'; commits nothing until approved.$s$,
    $s$financial_ops$s$,
    ARRAY[$s$draft my P&L for last month$s$, $s$put together a financial statement summary$s$, $s$give me a profit and loss document$s$, $s$summarize revenue expenses and AR for the period$s$, $s$draft an income statement$s$, $s$prepare a financial summary I can review$s$]::text[],
    $j$[{"id": "gather_revenue", "tool": "context", "desc": "Read the exposed revenue / income figures for the period from the metric layer. Use only surfaced figures."}, {"id": "gather_expenses", "tool": "context", "desc": "Read the exposed expense figures for the period, by category where available."}, {"id": "gather_ar", "tool": "context", "desc": "Read the exposed accounts-receivable / outstanding-invoice figures (money billed but not yet collected). Where absent, mark as 'not available'."}, {"id": "compose_statement", "tool": "anthropic", "desc": "Assemble a P&L-style financial statement summary: revenue lines, expense lines, net result, and an AR outstanding line. Report only exposed figures verbatim; state 'not available' for any missing line and never fabricate a number. Coaching-generic; no consumer-finance wording."}, {"id": "file_draft", "tool": "client_memory", "desc": "File the drafted financial statement summary as a pending draft for owner review and approval."}, {"id": "render_document", "tool": "pdf_render", "desc": "Render the summary as a clean, statement-style document (aligned lines and totals) attached to the draft for the owner."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Financial-statement mechanic: arrange already-exposed revenue, expense, net, and AR figures into a P&L-style numbers-and-lines document. DISTINCT from Cat 6 monthly_qbr_draft (a business-review narrative) — this is the financial statement itself, the assembled figures document, not prose interpretation.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  ),
  (
    $s$subscription_billing_setup_draft$s$, $s$Recurring Billing Setup Draft$s$, $s$Drafts the cadence, amount, and terms structure for a recurring retainer or subscription billing arrangement — the money-schedule that feeds invoicing — filed for owner approval. Defines only the billing schedule from exposed engagement scope; sets up no live billing, and Paige never charges or collects.$s$,
    $s$financial_ops$s$,
    ARRAY[$s$set up a monthly retainer billing schedule$s$, $s$draft recurring billing for this client$s$, $s$structure a subscription billing cadence$s$, $s$how should I bill this retainer each month$s$, $s$draft the terms for recurring payments$s$, $s$put together a recurring billing setup$s$]::text[],
    $j$[{"id": "gather_engagement", "tool": "context", "desc": "Read the exposed engagement / retainer scope and fee for the client so the cadence and amount are anchored to real terms. Where absent, mark for the owner to supply rather than inventing."}, {"id": "gather_processor_config", "tool": "context", "desc": "Read the tenant's DECLARED processor / billing configuration (vendor-agnostic — do not assume a specific processor) so the draft references the owner's own billing rail. If not declared, note it as a setup prerequisite."}, {"id": "compose_schedule", "tool": "anthropic", "desc": "Draft the recurring billing structure: amount per cycle, cadence (e.g. monthly), start date, billing duration or renewal terms, and any proration or cancellation terms. Frame as the billing schedule/cadence only; note that charges run on the tenant's own connected processor and that Paige does not collect."}, {"id": "file_draft", "tool": "client_memory", "desc": "File the drafted recurring-billing structure as a pending draft for owner approval. Paige never activates recurring billing, sends an invoice, or collects — the owner approves and their own processor executes."}, {"id": "render_document", "tool": "pdf_render", "desc": "Render the billing schedule as a clear terms document (cadence + amount + terms) attached to the draft for the owner's review."}]$j$::jsonb,
    ARRAY[$s$context$s$, $s$anthropic$s$, $s$client_memory$s$, $s$pdf_render$s$]::text[],
    $s$draft$s$, $s$confirm$s$,
    $s$Recurring-cadence mechanic: define the amount-per-cycle, cadence, start, and renewal/cancellation terms of a retainer or subscription — the money schedule that feeds invoicing — drafted for approval. §38 facilitator-only on the tenant's OWN processor. DISTINCT from Cat 2 draft_engagement_contract (the legal agreement) — this is the billing schedule, not the contract.$s$,
    $j${"god": "yes", "solo": "yes", "sub_account": "yes", "agency": "resell", "enterprise": "yes+resell"}$j$::jsonb, $s$platform$s$,
    'system', 'active', 0
  )
on conflict (slug) do nothing;
