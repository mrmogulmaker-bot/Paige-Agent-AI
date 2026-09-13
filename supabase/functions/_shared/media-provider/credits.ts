/**
 * Media-credit edge wrappers — the seam's client of the ledger RPCs
 * (media_credit_hold / _consume / _release; see migration 20270122000000).
 *
 * PURE CORE: estimateCredits converts a USD estimate to whole credits
 * (1 credit = the configured provider-cost value, default $0.01; always rounds
 * UP — never reserve less than the estimate). The IO wrappers never throw a
 * ledger failure into the job path silently: hold outcomes carry ok/insufficient,
 * consume/release are idempotent-by-job and best-effort-logged on RPC failure
 * (the job's truth lives in its own state machine; the ledger follows it).
 */

/** Whole credits to reserve for a USD estimate — rounds UP, minimum 1. */
export function estimateCredits(estimatedCostUsd: number, creditUsd: number): number {
  const unit = Number(creditUsd) > 0 ? Number(creditUsd) : 0.01;
  if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd <= 0) return 1;
  return Math.max(1, Math.ceil(estimatedCostUsd / unit));
}

type Rpc = (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;

interface LedgerResult {
  ok: boolean;
  insufficient?: boolean;
  error?: string;
  balance?: number;
  needed?: number;
  clamped?: boolean;
}

function parse(data: unknown, error: { message?: string } | null): LedgerResult {
  if (error) return { ok: false, error: error.message ?? "ledger rpc failed" };
  const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!row) return { ok: false, error: "ledger rpc returned nothing" };
  return {
    ok: row.ok === true,
    insufficient: row.insufficient === true,
    error: typeof row.error === "string" ? row.error : undefined,
    balance: typeof row.balance === "number" ? row.balance : undefined,
    needed: typeof row.needed === "number" ? row.needed : undefined,
    clamped: row.clamped === true,
  };
}

export async function holdMediaCredits(
  rpc: Rpc,
  tenantId: string,
  jobId: string,
  credits: number,
  estimateUsd?: number,
): Promise<LedgerResult> {
  try {
    const { data, error } = await rpc("media_credit_hold", {
      _tenant: tenantId,
      _job: jobId,
      _credits: credits,
      ...(_estimateSafe(estimateUsd) ? { _estimate_usd: estimateUsd } : {}),
    });
    return parse(data, error);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "hold threw" };
  }
}

function _estimateSafe(v: number | undefined): boolean {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

export async function consumeMediaCredits(rpc: Rpc, tenantId: string, jobId: string, credits: number): Promise<LedgerResult> {
  try {
    const { data, error } = await rpc("media_credit_consume", { _tenant: tenantId, _job: jobId, _actual: credits });
    return parse(data, error);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "consume threw" };
  }
}

export async function releaseMediaCredits(rpc: Rpc, tenantId: string, jobId: string, reason: string): Promise<LedgerResult> {
  try {
    const { data, error } = await rpc("media_credit_release", { _tenant: tenantId, _job: jobId, _reason: reason });
    return parse(data, error);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "release threw" };
  }
}

/** The 50/80/100% allowance notice thresholds (the Billing card's band math). */
export function allowanceNoticeBand(consumedCredits: number, allowanceMonthly: number): 50 | 80 | 100 | null {
  if (allowanceMonthly <= 0) return null;
  const pct = (consumedCredits / allowanceMonthly) * 100;
  if (pct >= 100) return 100;
  if (pct >= 80) return 80;
  if (pct >= 50) return 50;
  return null;
}
