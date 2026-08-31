-- S3 repair — the document proposal seam needs a place to record that extracted fields are
-- AWAITING A HUMAN, and `analysis_status` is the wrong place for it.
--
-- WHAT WENT WRONG, recorded because the shape of the mistake is the lesson. The first version
-- wrote `analysis_status = 'awaiting_review'`. That column carries a live CHECK constraint —
-- `IN ('pending','processing','completed','failed')`, from the table's original migration
-- (20260411023125) and confirmed present on production — so every one of those writes failed with
-- 23514. postgrest-js returns its error rather than throwing, and the helper performing the write
-- never read it, so the failure was completely silent: the row stayed `processing`,
-- `analysis_result` was never persisted, and the handler still emitted an approval card whose
-- Approve button could never work, because the record it referenced held nothing. A green build, a
-- green test suite, and a feature that was dead end to end. Found by an independent reviewer
-- driving the real DDL. (The helper now reads the error — that fix ships with this one.)
--
-- WHY A NEW COLUMN RATHER THAN A WIDER CHECK. Widening `analysis_status` was the obvious repair
-- and it is the wrong one, for a reason the constraint was only the first symptom of: EIGHT
-- consumers treat any value other than `completed`/`failed` as work still in flight. Most
-- pointedly `_shared/client-context.ts` reports an upload stuck in a non-terminal state for ten
-- minutes as "⚠️ STUCK UPLOAD … the parser appears stalled" — into Paige's OWN context. A report
-- sitting correctly and indefinitely with a human would have been described to Paige as a broken
-- parse. `ReportUploadTab`, `AllCreditReportsView`, `DataFreshnessIndicator`, `CreditIntelligence`,
-- `DataMaintenancePanel`, `useClientChatContext` and `backfill-credit-extractions` filter on the
-- same axis.
--
-- They are all right, and so is the constraint. THE ANALYSIS GENUINELY COMPLETED — Paige read the
-- document and produced a result. What is pending is whether a person wants those fields APPLIED
-- to the profile, which is a different question about a different thing. Two axes were being
-- collapsed into one column, and the CHECK constraint was the schema saying so.
--
-- So `analysis_status` stays `completed` and keeps meaning what every reader already assumes, and
-- the review lives in its own column. Nothing existing changes behaviour; a NULL review state is
-- every historical row and every non-chat uploader, which is correct — those paths write directly
-- and have no proposal to review.
--
-- §37 CONSUMER INVENTORY for the new column: none. It is net-new, so nothing reads it yet except
-- `paige-apply-extraction`, which ships alongside. Consumers of `analysis_status` are deliberately
-- untouched — that is the point of not widening it.

ALTER TABLE public.credit_report_uploads
  ADD COLUMN IF NOT EXISTS extraction_review_state text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'credit_report_uploads_extraction_review_state_check'
  ) THEN
    ALTER TABLE public.credit_report_uploads
      ADD CONSTRAINT credit_report_uploads_extraction_review_state_check
      CHECK (extraction_review_state IS NULL
             OR extraction_review_state IN ('awaiting_review', 'applied', 'declined'));
  END IF;
END
$$;

COMMENT ON COLUMN public.credit_report_uploads.extraction_review_state IS
  'Whether extracted fields from a CHAT document turn are awaiting a human decision, have been applied, or were declined. NULL for every non-chat uploader and every historical row — those write directly and have no proposal to review. Deliberately SEPARATE from analysis_status, which describes whether the READ succeeded and whose non-terminal values eight consumers treat as a stalled parse.';

-- Partial index: the only query this column serves is "what is still waiting on me", and that is a
-- small slice of a large table.
CREATE INDEX IF NOT EXISTS idx_credit_report_uploads_awaiting_review
  ON public.credit_report_uploads (user_id, created_at DESC)
  WHERE extraction_review_state = 'awaiting_review';

-- §32 PROOF, driven on PRODUCTION Postgres inside BEGIN..ROLLBACK. Nothing persisted.
--
--   NEGATIVE CONTROL — the write the shipped code actually attempted:
--     UPDATE … SET analysis_status = 'awaiting_review'  ->  REFUSED (23514)
--   THE NEW SHAPE:
--     UPDATE … SET analysis_status = 'completed',
--                  extraction_review_state = 'awaiting_review',
--                  analysis_result = '…'                ->  OK
--     analysis_status left at ............................. 'completed'
--     extraction actually persisted ....................... true
--   An unknown review state ............................... REFUSED
--
-- The negative control is the point: it reproduces, on production, the exact silent failure that
-- made the feature dead — and it is the reason the write helper in `paige-ai-chat` now READS the
-- error postgrest-js returns instead of assuming a resolved promise means a written row.
--
-- §32 OWED: this is a rollback proof. It shows the SQL runs. The persisted-apply confirmation —
-- `schema_migrations` advanced past this version AND the column present in `information_schema` —
-- is owed after merge and is not claimed here.
