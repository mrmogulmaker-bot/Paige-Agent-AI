-- ============================================================================
-- Transactional email — make `idempotencyKey` the control its callers already believe it is.
--
-- THE DEFECT, from the INT-163 review. Four new notification call sites pass an `idempotencyKey`,
-- and several carry comments asserting what it guarantees ("one notice per signer per event — a
-- reloaded page does not re-mail the owner"). `send-transactional-email` accepts the field, assigns
-- it to a local, and NEVER READS IT AGAIN: every log row is keyed on a fresh `message_id`. So the
-- parameter read as a control and was not one. Most callers were saved by their own state guards;
-- the first-view notice was not, and the larger risk is the next caller relying on a promise the
-- system does not keep (§37: a producer written against a contract the consumer does not honour).
--
-- WHY A COLUMN AND NOT A UNIQUE INDEX. The short-circuit below is best-effort by design: two
-- genuinely simultaneous requests can both observe no prior 'sent' row and both send. A unique index
-- would make that case deterministic — and would also turn it into a HARD FAILURE of a legitimate
-- send, on a shared endpoint with many existing callers whose inserts predate this column. A
-- duplicate email under a true race is a far smaller harm than a suppressed one, so the honest
-- guarantee is "a retry does not re-send", not "exactly once", and that is what the callers need.
--
-- ROLLBACK (forward-only production procedure): additive and nullable. Reverse by dropping the
-- column and the index in a forward migration.
-- ============================================================================

ALTER TABLE public.email_send_log
  ADD COLUMN IF NOT EXISTS idempotency_key text;

COMMENT ON COLUMN public.email_send_log.idempotency_key IS
  'Caller-supplied dedupe key. A later send with the same key short-circuits when a row with this key already reached status=sent. Best-effort under true concurrency; never a uniqueness constraint, because a suppressed legitimate send is worse than a duplicate one.';

-- Partial: only the rows that carry a key are worth indexing, and historical rows carry none.
CREATE INDEX IF NOT EXISTS email_send_log_idempotency_key_idx
  ON public.email_send_log (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
