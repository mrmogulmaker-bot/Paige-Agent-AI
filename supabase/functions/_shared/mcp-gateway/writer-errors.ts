// Connected MCP Gateway — the ONE home for mapping a SECURITY DEFINER writer RPC's coded error to a
// safe HTTP status + closed body (§18). `create` and `approve` both call registry writers that RAISE
// the same closed vocabulary — `MCP_FORBIDDEN` (SQLSTATE 42501, four distinct authority reasons, each
// with a different message SUFFIX) and validation errors (22023, carrying a specific `MCP_*` token).
// Echoing the 42501 suffix would be a which-gate / cross-tenant oracle, so every 42501 collapses to
// ONE uniform 403 `{ error: "MCP_FORBIDDEN" }` (the token, never the suffix). A specific 22023/token
// surfaces its closed code so the consumer's copy map resolves. Anything uncoded is an internal fault →
// 500 with a caller-supplied generic code, never the raw PG message (§13).

export type WriterErrorResult = {
  httpStatus: number;
  body: Record<string, unknown>;
};

/** Pull the closed-set `MCP_*` token out of a Postgres error the writer RAISEd (message/details/hint).
 *  `/MCP_[A-Z_]+/` stops at the first non-`[A-Z_]` char, so it extracts `MCP_FORBIDDEN` from
 *  `MCP_FORBIDDEN: tenant mismatch` WITHOUT the suffix — the same regex the frontend consumer uses,
 *  so the vocabulary is identical end to end. */
export function mcpToken(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const e = error as { message?: unknown; details?: unknown; hint?: unknown };
  for (const field of [e.message, e.details, e.hint]) {
    if (typeof field === "string") {
      const m = field.match(/MCP_[A-Z_]+/);
      if (m) return m[0];
    }
  }
  return null;
}

/**
 * Map a coded writer error to an HTTP status + closed, secret-free body. `genericCode` is the caller's
 * uncoded-fault label (`create_failed`, `approve_failed`, …). Keyed on SQLSTATE OR the token so a
 * future message-format change on either signal still collapses to the right shape.
 */
export function mapWriterError(error: unknown, genericCode: string): WriterErrorResult {
  const sqlstate = typeof (error as { code?: unknown } | null)?.code === "string"
    ? (error as { code: string }).code
    : "";
  const token = mcpToken(error);

  // Endpoint-review conflict (approve only): `set_mcp_connection_approval` RAISEs MCP_ENDPOINT_CHANGED
  // with SQLSTATE 42501, but it is NOT an authority which-gate — it means the connection's endpoint
  // changed since the operator reviewed it (Codex P1 reviewed-endpoint guard). It reveals nothing
  // cross-tenant (the writer's tenant check already passed before it fires), and the operator needs the
  // ACTIONABLE signal to re-review, so it surfaces distinctly as 409 rather than collapsing into the
  // uniform 403. Checked BEFORE the 42501 collapse; create never raises this token, so it is a no-op there.
  if (token === "MCP_ENDPOINT_CHANGED") {
    return { httpStatus: 409, body: { error: "MCP_ENDPOINT_CHANGED" } };
  }
  // Authority — uniform, suffix stripped (no which-gate oracle).
  if (sqlstate === "42501" || token === "MCP_FORBIDDEN") {
    return { httpStatus: 403, body: { error: "MCP_FORBIDDEN" } };
  }
  // Validation — surface the specific closed code the caller's copy map understands.
  if (sqlstate === "22023" || token) {
    return { httpStatus: 400, body: { error: token ?? "MCP_BAD_REQUEST" } };
  }
  // Uncoded / internal (a bug, a NOT NULL violation, a transport error) — never leak the raw message.
  return { httpStatus: 500, body: { error: genericCode } };
}
