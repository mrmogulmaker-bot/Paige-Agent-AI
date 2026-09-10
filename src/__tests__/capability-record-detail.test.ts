// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { recordCapabilityRun, redactDetail } from '../../supabase/functions/_shared/capability-record.ts';

describe('redactDetail — the §2.2 redaction gate', () => {
  it('drops denylisted keys at any depth, keeps safe keys', () => {
    const out = redactDetail({
      substrate: 'weekly-summary-cron',
      api_key: 'sk-live-123',
      nested: { password: 'hunter2', Authorization: 'Bearer x', intent: '2026-09-07' },
      deeper: [{ accessToken: 'x' }, { ok: true }],
    });
    expect(out).toEqual({
      substrate: 'weekly-summary-cron',
      nested: { intent: '2026-09-07' },
      deeper: [{}, { ok: true }],
    });
  });

  it('never carries the secret VALUE anywhere in the serialized result', () => {
    const out = redactDetail({ secret: 'canary-secret-value', body: 'plain text' });
    expect(JSON.stringify(out)).not.toContain('canary-secret-value');
  });

  it('caps depth and marks unsupported types, never throws', () => {
    const deep = { a: { b: { c: { d: { e: { f: { g: { h: 'bottom' } } } } } } } };
    const out = redactDetail(deep as never);
    expect(JSON.stringify(out)).toContain('depth-capped');
    expect(out).toBeTruthy();
  });

  it('rejects oversize payloads to null rather than truncating dishonestly', () => {
    const big = { blob: 'x'.repeat(20_000) };
    expect(redactDetail(big)).toBeNull();
  });

  it('keeps numbers, booleans, nulls, and arrays intact', () => {
    const out = redactDetail({ attempt: 3, ok: true, none: null, list: [1, 'two', false] });
    expect(out).toEqual({ attempt: 3, ok: true, none: null, list: [1, 'two', false] });
  });
});

describe('recordCapabilityRun — correlation + detail passthrough', () => {
  function harness() {
    const calls: Array<Record<string, unknown>> = [];
    const admin = {
      rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => {
        calls.push(args);
        return { data: null, error: null };
      }),
    };
    return { admin, calls };
  }

  it('passes correlation and redacted detail only when present', async () => {
    const { admin, calls } = harness();
    await recordCapabilityRun(admin, {
      tenantId: '00000000-0000-0000-0000-000000000001',
      actorId: '00000000-0000-0000-0000-000000000002',
      capabilityKey: 'comms.weekly_summary',
      outcome: 'capability_succeeded',
      correlation: { jobAttemptId: 'weekly-summary:u1:2026-09-07' },
      detail: { substrate: 'weekly-summary-cron', password: 'canary' },
    });
    const args = calls[0]!;
    expect(args._job_attempt_id).toBe('weekly-summary:u1:2026-09-07');
    expect(args._llm_trace_id).toBeUndefined();
    expect(args._release_id).toBeUndefined();
    expect(args._detail).toEqual({ substrate: 'weekly-summary-cron' });
    expect(JSON.stringify(args)).not.toContain('canary');
  });

  it('changes nothing for existing callers — no new keys when opts absent', async () => {
    const { admin, calls } = harness();
    await recordCapabilityRun(admin, {
      tenantId: '00000000-0000-0000-0000-000000000001',
      actorId: '00000000-0000-0000-0000-000000000002',
      capabilityKey: 'integrations.n8n_run_workflow',
      outcome: 'capability_failed',
    });
    expect(Object.keys(calls[0]!).sort()).toEqual(
      ['_actor_id', '_capability_key', '_outcome', '_run_id', '_tenant_id'].sort(),
    );
  });

  it('drops detail entirely when redaction rejects it — the receipt still lands', async () => {
    const { admin, calls } = harness();
    await recordCapabilityRun(admin, {
      tenantId: '00000000-0000-0000-0000-000000000001',
      actorId: '00000000-0000-0000-0000-000000000002',
      capabilityKey: 'comms.weekly_summary',
      outcome: 'capability_succeeded',
      detail: { blob: 'x'.repeat(20_000) },
    });
    expect(calls[0]!._detail).toBeUndefined();
    expect(calls[0]!._outcome).toBe('capability_succeeded');
  });

  it('declines without calling on null tenant (platform-operator turn, unchanged)', async () => {
    const { admin, calls } = harness();
    const ok = await recordCapabilityRun(admin, {
      tenantId: null,
      actorId: '00000000-0000-0000-0000-000000000002',
      capabilityKey: 'comms.weekly_summary',
      outcome: 'capability_succeeded',
    });
    expect(ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});
