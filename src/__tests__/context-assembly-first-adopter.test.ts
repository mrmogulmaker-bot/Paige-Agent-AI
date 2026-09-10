// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  contextAvailable,
  contextDegraded,
  contextUnavailable,
  degradationLedger,
  identityScopeChanged,
  type ContextIdentity,
  type ContextSourceResult,
} from '../../supabase/functions/_shared/paige-context/mod.ts';
import {
  buildUserContext,
  projectUserContext,
  resolveUserContext,
  type ContextDb,
} from '../../supabase/functions/_shared/client-context.ts';

// ── Mock Supabase client: table → rows or {data,count,error} ─────────────────────
type TableSpec = { data?: unknown; count?: number | null; error?: { message: string } | null; throw?: boolean };
function mkClient(tables: Record<string, TableSpec>, onFrom?: (table: string) => void) {
  const chain = (spec: TableSpec) => {
    // A thenable: `then` must CALL resolve/reject — returning a value never settles.
    const then = (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
      if (spec.throw) reject(new Error('mock network failure'));
      else resolve({ data: spec.data ?? null, error: spec.error ?? null, count: spec.count ?? null });
    };
    const step: Record<string, unknown> = {};
    const self = new Proxy(step, {
      get(target, prop) {
        if (prop === 'then') return then;
        if (prop === 'maybeSingle') return () => self;
        return () => self;
      },
    });
    return self;
  };
  return {
    from(table: string) {
      onFrom?.(table);
      return chain(tables[table] ?? {});
    },
  } as unknown as ContextDb;
}

describe('paige-context seam', () => {
  it('distinguishes available-empty from unavailable and degraded', () => {
    expect(contextAvailable(null)).toEqual({ status: 'available', data: null });
    expect(contextUnavailable('funding_lane_off')).toEqual({ status: 'unavailable', reason: 'funding_lane_off', data: null });
    expect(contextDegraded<string>('profiles: boom')).toEqual({ status: 'degraded', reason: 'profiles: boom', data: null });
  });

  it('ledger records every non-available source with a reason — never silent', () => {
    const ledger = degradationLedger({
      profile: contextDegraded('profiles: timeout'),
      tasks: contextAvailable([]),
      credit: contextUnavailable('funding_lane_off'),
    });
    expect(ledger).toEqual([
      { source: 'profile', status: 'degraded', reason: 'profiles: timeout' },
      { source: 'credit', status: 'unavailable', reason: 'funding_lane_off' },
    ]);
  });

  it('scope fence: an epoch change is detected, never ignored', () => {
    const identity: ContextIdentity = { actorId: 'u1', tenantId: 't1', workspaceId: null, role: 'owner', actAsClientId: null, accountShape: 'solo', scopeEpoch: 3 };
    expect(identityScopeChanged(identity, 3)).toBe(false);
    expect(identityScopeChanged(identity, 4)).toBe(true);
  });
});

describe('resolveUserContext — honest availability', () => {
  it('non-funding tenants NEVER query credit tables (§2 structural gate)', async () => {
    const queried: string[] = [];
    const client = mkClient({}, (t) => queried.push(t));
    const sources = await resolveUserContext(client, 'u1', false);
    expect(queried).not.toContain('credit_report_uploads');
    expect(queried).not.toContain('credit_accounts');
    expect(queried).not.toContain('credit_negative_items');
    expect(queried).not.toContain('banking_relationships');
    expect(sources.creditReports.status).toBe('unavailable');
    expect(sources.portfolioBusinesses.reason).toBe('funding_lane_off');
  });

  it('a failed read is degraded with the reason — not swallowed to empty', async () => {
    const client = mkClient({ profiles: { throw: true } });
    const sources = await resolveUserContext(client, 'u1', false);
    expect(sources.profile.status).toBe('degraded');
    expect(sources.profile.reason).toContain('profiles');
    const ledger = degradationLedged(sources);
    expect(ledger.some((e) => e.source === 'profile')).toBe(true);
  });

  it('a successful read of nothing is available (empty is the source’s claim)', async () => {
    const client = mkClient({ tasks: { data: [] } });
    const sources = await resolveUserContext(client, 'u1', false);
    expect(sources.tasks.status).toBe('available');
    expect(sources.tasks.data).toEqual([]);
  });
});

// Small helper to expose the ledger over the exported bundle shape.
function degradationLedged(s: Awaited<ReturnType<typeof resolveUserContext>>) {
  return degradationLedger(s as unknown as Readonly<Record<string, ContextSourceResult<unknown>>>);
}

describe('projectUserContext / buildUserContext — byte-comparable projection', () => {
  it('non-funding: same shape the pre-contract prompt produced', async () => {
    const client = mkClient({
      profiles: { data: { full_name: 'Ada Lovelace', city: 'Austin', state: 'TX' } },
      user_subscriptions: { data: { plan_slug: 'pro', status: 'active' } },
      tasks: { data: [{ title: 'Draft offer', status: 'pending', track: 'launch', due_date: null }] },
      quickbooks_connections: { data: null },
    });
    const out = await buildUserContext(client, 'u1', false);
    expect(out).toContain('=== USER CONTEXT ===');
    expect(out).toContain('User Profile: Ada Lovelace from Austin, TX');
    expect(out).toContain('Subscription: pro plan (active)');
    expect(out).toContain('Tasks: 1 pending, 0 completed');
    expect(out).toContain('Recent Pending Tasks:\n- Draft offer (launch)');
    expect(out).toContain('⚠️ QuickBooks NOT connected');
    // §2: no credit vocabulary reaches a non-funding prompt.
    expect(out).not.toMatch(/FICO|credit report|negative items|Paydex/i);
    expect(out.endsWith('\n==================\n')).toBe(true);
  });

  it('funding: credit-awareness lines render from typed sources', async () => {
    const client = mkClient({
      profiles: { data: { full_name: 'Bo', city: null, state: null, estimated_fico_ex: 720 } },
      credit_report_uploads: { data: [{ id: 'r1', file_name: 'report.pdf', analysis_status: 'completed', created_at: '2026-09-01T00:00:00Z', last_analyzed_at: '2026-09-02T00:00:00Z', bureau_detected: null, error_message: null }] },
      credit_accounts: { data: null, count: 4 },
      credit_negative_items: { data: [{ creditor_name: 'Acme', item_type: 'collection', bureau: 'EX', amount: 120, status: 'active' }] },
      quickbooks_connections: { data: null },
    });
    const out = await buildUserContext(client, 'u1', true);
    expect(out).toContain('CREDIT REPORT ON FILE: "report.pdf"');
    expect(out).toContain('Synced credit accounts: 4');
    expect(out).toContain('Active negative items (1): Acme (collection, EX, $120)');
    expect(out).toContain('NEVER ask the client to upload one again');
  });

  it('degraded QB read skips the block (old catch behavior) and the ledger sees it', async () => {
    const sources = await resolveUserContext(
      mkClient({ quickbooks_connections: { throw: true }, profiles: { data: { full_name: 'Cy' } } }),
      'u1',
      false,
    );
    const out = projectUserContext(sources, false);
    expect(out).not.toContain('QuickBooks');
    expect(sources.qbConnection.status).toBe('degraded');
  });

  it('resolver-level throw still returns "" from buildUserContext (unchanged top-level contract)', async () => {
    const boom = { from() { throw new Error('client exploded'); } } as unknown as ContextDb;
    await expect(buildUserContext(boom, 'u1', false)).resolves.toBe('');
  });
});
