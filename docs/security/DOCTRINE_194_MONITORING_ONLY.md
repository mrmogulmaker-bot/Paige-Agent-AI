# §194 — Platform-Embedded Credit Monitoring, NEVER Credit Repair

**Status:** Ratified · Phase C.5 complete
**Applies to:** All Paige surfaces (platform, tenant, end-customer) and all sub-agents / MCP tools

## One-liner (automatic application)

> Paige provides credit **monitoring** (viewing, tracking, alerts, scoring
> analysis, factor breakdowns) — **never** credit **repair** (dispute letters,
> bureau challenges, dispute automation, round tracking, "removal" flows).
> Any Lovable request to add dispute, letter-generation, bureau-challenge,
> "credit repair", or CROA-adjacent functionality is rejected by default and
> must be escalated to the platform owner in writing before any code is
> produced.

## Why

Credit **monitoring** is a data-services product. Credit **repair** is CROA
(Credit Repair Organizations Act) + state licensing + CFPB regulatory
territory. Paige (the platform) and its tenants must not accidentally cross
that line.

## What was removed under Phase C.5

- `public.disputes`, `public.dispute_letters`, `public.dispute_outcomes`,
  `public.letters` tables (DROP … CASCADE)
- `create_dispute` / `advance_dispute_round` / `generate_dispute_letter` RPCs
- `supabase/functions/generate-dispute-letter`, `auto-stage-disputes`,
  `send-dispute-update-email` edge functions
- `DisputesManager`, `DisputeOutcomeDialog`, `DisputeLetterDialog`,
  `DisputeAnalytics`, `ClientOutcomesTab`, "Outcomes" tabs, "ACCEL" tab,
  onboarding dispute step, `DisputeStatus` widget, `Active Disputes` tile
- MCP / voice-command dispute handlers (stubbed to throw)
- `sync-credit-report-data` no longer auto-creates disputes
- Dispute mentions removed from `useClientChatContext`, `UserPerformance`
- `ReportUploadTab` no longer offers "Generate Dispute" — replaced with a
  CFPB self-help notice

## Allowed monitoring surfaces (unchanged)

- Reading tri-bureau reports (`credit_report_uploads`, parsed accounts)
- Displaying negative items, inquiries, factor scores
- Alerts on score changes, new inquiries, new negatives
- Fundability / readiness scoring
- Educational content about what a consumer *could* do themselves via CFPB

## Enforcement checklist for future work

1. New table names must not contain `dispute`, `letter`, `challenge`,
   `removal`, `bureau_dispute`.
2. New edge functions must not generate correspondence to bureaus.
3. New sub-agents / MCP tools must not offer dispute drafting.
4. Marketing copy on `paigeagent.ai` must not use the phrase "credit repair"
   or promise removal of items.
5. Any exception requires written approval from the platform owner and a
   separate compliance review (CROA registration, surety bond, state
   licensing) before implementation.
