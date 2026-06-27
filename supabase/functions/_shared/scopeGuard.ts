// Paige Agent AI scope guard.
// Rule: capital-readiness for the BUSINESS or BUSINESS OWNER only.
// Consumer credit dispute work, FCRA enforcement, and CROA-classified credit
// repair services belong to Mogul Credit AI — a separate product on a
// separate spine. They MUST NOT be implemented inside Paige.
export const PAIGE_SCOPE_GUARD =
  "capital-readiness only; no consumer-credit dispute or CROA-classified services";

// Reject payload keys that imply consumer credit dispute / repair workflows.
// Use case: SmartCredit + Nav functions accept inputs that could be misused as
// dispute triggers. We hard-fail those.
const FORBIDDEN_PREFIXES = ["dispute", "fcra_", "repair_", "croa_"];

export function assertNoDisputeFields(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const visit = (obj: Record<string, unknown>, path = ""): string | null => {
    for (const key of Object.keys(obj)) {
      const lower = key.toLowerCase();
      if (FORBIDDEN_PREFIXES.some((p) => lower === p.replace(/_$/, "") || lower.startsWith(p))) {
        return `${path}${key}`;
      }
      const val = obj[key];
      if (val && typeof val === "object" && !Array.isArray(val)) {
        const nested = visit(val as Record<string, unknown>, `${path}${key}.`);
        if (nested) return nested;
      }
    }
    return null;
  };
  return visit(payload as Record<string, unknown>);
}
