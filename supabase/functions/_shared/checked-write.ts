/**
 * READING THE ERROR OFF A DURABLE WRITE — the one home for it.
 *
 * postgrest-js defaults `shouldThrowOnError` to FALSE. A constraint violation, an RLS refusal, a
 * missing column: all of them RESOLVE, with an `error` on the result object, rather than throwing.
 * So the shape everyone reaches for —
 *
 *     try { await supabase.from(x).insert(y); } catch { ... }
 *
 * — catches nothing for the commonest failures, and the row silently never lands. The build is
 * green, the tests are green, the feature is dead. This is not a hypothetical: a status value
 * outside a live CHECK constraint failed 23514 for an entire extraction feature while the code
 * reported success, and separately four `client_memory` inserts — the things Paige later recalls
 * about a person — could fail with no symptom except her quietly remembering nothing.
 *
 * Two callers in `paige-ai-chat` were each doing this check inline, which meant one of them could
 * be weakened without the other noticing. They now share this.
 */

export type WriteOutcome =
  | { ok: true }
  | { ok: false; code: string | null; message: string | null };

/**
 * Classify what a postgrest write actually did.
 *
 * `undefined` and `null` are treated as SUCCESS, and that is a deliberate, load-bearing choice
 * rather than an oversight: a function that awaits a write and returns nothing is
 * indistinguishable from one that succeeded, so this cannot detect the difference and must not
 * pretend to. The consequence is a rule for callers — a helper that wraps a write MUST return the
 * write's result. `logSyncFailure` did not, which is precisely how two of the four writes routed
 * through the helper built to catch silent failures stayed silent. `assertReturnsResult` below
 * exists to make that rule testable.
 */
export function writeOutcome(result: unknown): WriteOutcome {
  if (result && typeof result === "object" && "error" in result) {
    const err = (result as { error?: { message?: string; code?: string } | null }).error;
    if (err) {
      return {
        ok: false,
        code: typeof err.code === "string" ? err.code : null,
        message: typeof err.message === "string" ? err.message : null,
      };
    }
  }
  return { ok: true };
}

/**
 * Await a write and report whether it landed. Never throws: every caller of this is best-effort
 * work — telemetry, a thread title, a remembered detail — and losing one must not fail the
 * person's turn. What it must do is be AUDIBLE, which is the whole difference between a bug you
 * can find and one you cannot.
 *
 * `PromiseLike`, not `Promise`: a postgrest builder is a thenable that only issues the request when
 * awaited. It has `then` but no `catch`/`finally`.
 */
export async function checkedWrite(
  label: string,
  write: PromiseLike<unknown>,
  log: (msg: string) => void = (m) => console.error(m),
): Promise<boolean> {
  try {
    const outcome = writeOutcome(await write);
    if (!outcome.ok) {
      log(`[paige] write REJECTED ${JSON.stringify({ write: label, code: outcome.code, message: outcome.message })}`);
      return false;
    }
    return true;
  } catch (e) {
    log(`[paige] write THREW ${JSON.stringify({ write: label, message: (e as Error)?.message ?? String(e) })}`);
    return false;
  }
}
