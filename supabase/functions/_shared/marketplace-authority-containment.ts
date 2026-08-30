const EDGE_FUNCTION_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Return the only representation safe to interpolate into an Edge Function URL.
 * Reject whitespace, case folding, encoding, traversal, delimiters, Unicode, and
 * every other non-canonical spelling rather than normalizing attacker input.
 */
export function canonicalDirectFunctionName(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) return null;
  if (!EDGE_FUNCTION_SLUG.test(value)) return null;
  return value;
}

/** Marketplace mutations are not reachable through generic workflow dispatch. */
export function isMarketplaceDirectFunctionBlocked(value: unknown): boolean {
  const canonical = canonicalDirectFunctionName(value);
  if (!canonical) return true;
  return canonical === "marketplace" || canonical.startsWith("marketplace-");
}
