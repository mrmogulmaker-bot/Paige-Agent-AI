// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DURABLE_JOB_DEFAULTS,
  TERMINAL_STATES,
  capabilityOutcomeFor,
  completedForIntent,
  idempotencyKey,
  isTerminal,
  leaseExpired,
  needsReconciliation,
  weeklyIntentBucket,
} from '../../supabase/functions/_shared/durable-job/mod.ts';

describe('durable-job contract canonical states', () => {
  it('treats exactly succeeded/failed/cancelled as terminal', () => {
    expect(TERMINAL_STATES).toEqual(['succeeded', 'failed', 'cancelled']);
    expect(isTerminal('succeeded')).toBe(true);
    expect(isTerminal('failed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('claimed')).toBe(false);
    expect(isTerminal('blocked')).toBe(false);
    expect(isTerminal('expired')).toBe(false);
    expect(isTerminal('outcome_unknown')).toBe(false);
  });

  it('routes expired and outcome_unknown to reconciliation, never blind retry', () => {
    expect(needsReconciliation('expired')).toBe(true);
    expect(needsReconciliation('outcome_unknown')).toBe(true);
    expect(needsReconciliation('claimed')).toBe(false);
    expect(needsReconciliation('failed')).toBe(false);
  });
});

describe('idempotency keys and intent windows', () => {
  it('builds deterministic keys: same unit of work, same key', () => {
    expect(idempotencyKey('weekly-summary', 'u1', '2026-09-07')).toBe('weekly-summary:u1:2026-09-07');
    expect(idempotencyKey('weekly-summary', 'u1', '2026-09-07')).toBe(
      idempotencyKey('weekly-summary', 'u1', '2026-09-07'),
    );
    expect(idempotencyKey('weekly-summary', 'u1', '2026-09-07')).not.toBe(
      idempotencyKey('weekly-summary', 'u2', '2026-09-07'),
    );
  });

  it('counts a completion inside the intent window as covered', () => {
    const monday = new Date('2026-09-07T00:00:00Z');
    // Sent mid-week: this week's intent is covered — no re-send.
    expect(completedForIntent('2026-09-09T12:00:00Z', monday)).toBe(true);
    // Sent exactly at the window open: covered.
    expect(completedForIntent(monday.toISOString(), monday)).toBe(true);
    // Sent last week: not covered for this intent.
    expect(completedForIntent('2026-08-31T12:00:00Z', monday)).toBe(false);
    // Never sent: not covered.
    expect(completedForIntent(null, monday)).toBe(false);
    expect(completedForIntent(undefined, monday)).toBe(false);
    // Garbage timestamp is honestly not-covered, not silently covered.
    expect(completedForIntent('not-a-date', monday)).toBe(false);
  });
});

describe('lease expiry', () => {
  const now = new Date('2026-09-07T08:00:00Z');
  const ttl = DURABLE_JOB_DEFAULTS.leaseTtlMs;

  it('a live lease is not expired', () => {
    expect(leaseExpired('2026-09-07T07:58:00Z', now, ttl)).toBe(false);
  });

  it('a lease at or past its TTL is expired and routes to reconciliation', () => {
    expect(leaseExpired('2026-09-07T07:55:00Z', now, ttl)).toBe(true);
    expect(leaseExpired('2026-09-07T07:00:00Z', now, ttl)).toBe(true);
    expect(needsReconciliation('expired')).toBe(true);
  });

  it('a missing or garbage claim stamp fails open to expired, never to claimable-blind', () => {
    expect(leaseExpired(null, now, ttl)).toBe(true);
    expect(leaseExpired(undefined, now, ttl)).toBe(true);
    expect(leaseExpired('garbage', now, ttl)).toBe(true);
  });
});

describe('weekly intent bucket', () => {
  it('buckets every day of an ISO week onto the same UTC Monday', () => {
    // Mon 2026-09-07 … Sun 2026-09-13 are one ISO week.
    expect(weeklyIntentBucket(new Date('2026-09-07T00:00:00Z'))).toBe('2026-09-07');
    expect(weeklyIntentBucket(new Date('2026-09-09T23:59:00Z'))).toBe('2026-09-07');
    expect(weeklyIntentBucket(new Date('2026-09-13T23:59:00Z'))).toBe('2026-09-07');
    // The next Monday opens a fresh intent.
    expect(weeklyIntentBucket(new Date('2026-09-14T00:00:00Z'))).toBe('2026-09-14');
  });

  it('maps Sunday backwards onto the running week, not forwards', () => {
    // Sunday 2026-09-13 belongs to the week that started Monday 2026-09-07.
    expect(weeklyIntentBucket(new Date('2026-09-13T00:00:00Z'))).toBe('2026-09-07');
  });
});

describe('receipt correlation mapping', () => {
  it('maps terminal and reconciliation states onto the Rail vocabulary', () => {
    expect(capabilityOutcomeFor('succeeded')).toBe('capability_succeeded');
    expect(capabilityOutcomeFor('failed')).toBe('capability_failed');
    expect(capabilityOutcomeFor('cancelled')).toBe('capability_failed');
    expect(capabilityOutcomeFor('expired')).toBe('capability_outcome_unknown');
    expect(capabilityOutcomeFor('outcome_unknown')).toBe('capability_outcome_unknown');
  });

  it('declines to record non-recording states — receipts only on honest transitions', () => {
    expect(capabilityOutcomeFor('claimed')).toBeNull();
    expect(capabilityOutcomeFor('blocked')).toBeNull();
  });
});
