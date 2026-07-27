-- =============================================================================
-- Comms Slice C-2s-A — DROP platform_phone_numbers (D2, owner-confirmed).
--   Build plan: docs/comms/C2-SURFACE-BUILD-PLAN.md (#7 platform_phone_numbers drop).
-- =============================================================================
-- ############################################################################
-- ##  !!!  DO NOT MERGE / APPLY THIS MIGRATION WITH THE C-2s-A SLICE  !!!    ##
-- ##                                                                        ##
-- ##  HOLD THIS FILE OUT of the C-2s-A merge. It is the FINAL, SEPARATE     ##
-- ##  post-live-verify step and MUST NOT run until ALL of the following     ##
-- ##  have actually happened (§13 — real proof, not a hope):                ##
-- ##                                                                        ##
-- ##   1. The live +1 470 200 3444 import has RUN via                       ##
-- ##      public.import_tenant_phone_number(...) — i.e. a tenant_phone_      ##
-- ##      numbers row exists for it with source='imported'. Metadata mapping ##
-- ##      (§13 HONEST): label → friendly_name (carried); purpose is NOT      ##
-- ##      migrated to a column — it is encoded implicitly by source=         ##
-- ##      'imported'; master_account_sid is NULL in the seed so its loss is  ##
-- ##      moot (the master-account creds mapping lives in                    ##
-- ##      tenant_twilio_subaccounts, a LIVE setup step, not this seed row).  ##
-- ##      Dropping the table BEFORE the import runs = loss of the ONLY row   ##
-- ##      that records +1 470 exists as a platform number.                   ##
-- ##   2. End-to-end SEND from the imported +1 470 has been VERIFIED live    ##
-- ##      (real outbound message, real Twilio SID).                         ##
-- ##   3. The RESERVED_PLATFORM_NUMBER const + filter have been removed from ##
-- ##      supabase/functions/send-message and that ships green.             ##
-- ##                                                                        ##
-- ##  Only then does the integrator merge THIS file as the closing step.    ##
-- ############################################################################
--
-- SAFETY / §37 producer inventory (verified on this branch — trust, then confirm):
--   • platform_phone_numbers is created ONLY in the C-2 foundation migration
--     (20260726210000). No other migration references it.
--   • NO live code queries it: send-message (index.ts) and provision-tenant-twilio
--     only MENTION it in comments; paige-mcp does not reference it at all. So the
--     table is code-dependency-safe to drop once its 1 seed row's metadata has been
--     migrated (pre-condition #1 above).
--   • DROP TABLE cascades its own trigger + RLS policies automatically; they are
--     also dropped explicitly below (IF EXISTS) for a clean, re-runnable teardown.
--
--  §200: no tenant_id / phone literal appears here — a pure schema teardown.
-- =============================================================================

-- Explicit teardown of dependents first (all IF EXISTS → idempotent / re-runnable).
drop trigger if exists trg_platform_phone_numbers_updated_at on public.platform_phone_numbers;

drop policy if exists platform_phone_numbers_select      on public.platform_phone_numbers;
drop policy if exists platform_phone_numbers_insert      on public.platform_phone_numbers;
drop policy if exists platform_phone_numbers_update      on public.platform_phone_numbers;
drop policy if exists platform_phone_numbers_service_all on public.platform_phone_numbers;

-- Drop the table (cascades any remaining grants/dependencies).
drop table if exists public.platform_phone_numbers;
