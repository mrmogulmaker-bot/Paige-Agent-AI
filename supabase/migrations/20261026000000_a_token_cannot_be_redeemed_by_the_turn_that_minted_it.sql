-- THE MODEL MUST NOT BE ABLE TO APPROVE ITSELF.
--
-- WHAT WENT WRONG, PLAINLY. `20261023000000` moved approval onto a TOKEN so that the five chat
-- surfaces without a confirm card could express a yes at all. It worked, and it opened a hole
-- strictly worse than the one it closed.
--
-- The property that used to hold was structural, not instructional. The re-entry test read
-- `approvedConfirmations`, which comes only from the validated REQUEST BODY — and a model cannot
-- write the request body. Self-approval was impossible by construction.
--
-- Returning `confirm_token` in the TOOL RESULT destroyed exactly that. The agentic loop pushes tool
-- results back into the conversation and issues another round with `tool_choice:"auto"`, so the
-- token minted to make approval expressible lands in the model's own context one round before any
-- human sees anything. The model re-emits the same call carrying it, the claim succeeds, and the
-- stored arguments execute. All forty-eight gated tools — role grants, deletes, sends, a permanent
-- workflow delete — became reachable without an operator, one round after being proposed. The card
-- the person eventually sees is then an Approve button for something that already ran.
--
-- Found by an independent adversarial review driving the real handler. Every existing check kept
-- passing, because each one supplies the token the way a SURFACE would and none ever asked whether
-- the MODEL could supply it.
--
-- THE FIX, AND WHY IT IS THIS ONE. Approval has to rest on something the model cannot manufacture.
-- It cannot start a new HTTP request — that takes a person sending another message. So a token is
-- not redeemable by the request that minted it. One round later is now impossible; one message
-- later still works, which is what keeps the five surfaces able to approve at all.
--
-- This deliberately does NOT restore "only a request-body echo counts". That would re-break the
-- five surfaces that cannot echo, which is the outage `20261023000000` existed to end. The echo
-- remains accepted as STRONGER evidence where a surface can supply it; the nonce is the floor
-- under both paths.
--
-- WHAT THIS DOES AND DOES NOT PROVE — said plainly, because the distinction is the whole point and
-- an ambiguous sentence here is how the last hole got written. A new request proves A PERSON SENT
-- ANOTHER MESSAGE. It does NOT prove that message was a yes. On the five surfaces with no confirm
-- card, the yes is still the model reading prose and asserting it — which is exactly the trust
-- level those surfaces have always had, and no worse. What is strictly better than before is
-- everything around it: the arguments are the stored ones so they cannot drift, the claim is
-- single-use so one yes runs one action, and tenant, thread and focused client are re-checked at
-- redemption.
--
-- The only thing that turns "a person replied" into "a person approved THIS" is a surface that
-- renders the summary and echoes back the fingerprint of what it displayed. One surface does that
-- today (`PaigeAIChat`). Building it on the other five is the real close-out, and it is interface
-- work, not backend work — so it is named here rather than quietly implied to be done.

ALTER TABLE public.paige_pending_confirmations
  ADD COLUMN IF NOT EXISTS issued_in_request uuid;

COMMENT ON COLUMN public.paige_pending_confirmations.issued_in_request IS
  'The request that minted this proposal. The claim excludes it, so a model cannot redeem a token it was handed in its own tool-result within the same turn — approval requires a new request, which requires a person. NULL only for rows written before this column existed, and such a row is unredeemable: the claim''s inequality against NULL yields NULL under three-valued logic, so it never matches.';

-- ONE LIVE PROPOSAL PER (PERSON, CALL). Re-proposing the same call is idempotent instead of
-- accumulating rows: the system prompt and the tool schema both still mention the older
-- `confirm:true` contract, so a model that follows them re-emits, fingerprints identically, is
-- refused, and would otherwise mint a duplicate every round. There is no sweep job for this table.
CREATE UNIQUE INDEX IF NOT EXISTS uq_paige_pending_confirmations_live
  ON public.paige_pending_confirmations (user_id, fingerprint)
  WHERE consumed_at IS NULL;
