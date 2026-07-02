-- §194 Phase C.5: Remove all credit-repair / dispute artifacts.
DROP TABLE IF EXISTS public.dispute_letters CASCADE;
DROP TABLE IF EXISTS public.dispute_outcomes CASCADE;
DROP TABLE IF EXISTS public.disputes CASCADE;
DROP TABLE IF EXISTS public.letters CASCADE;

DROP FUNCTION IF EXISTS public.create_dispute(uuid, text, text, text, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.advance_dispute_round(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.generate_dispute_letter(uuid) CASCADE;