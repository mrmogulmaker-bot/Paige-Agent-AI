/**
 * Is this a price an agent may spend money against?
 *
 * WHY THIS IS ITS OWN MODULE RATHER THAN AN INLINE CHECK
 *
 * `comms_buy_number`'s schema marks `monthly_cents` required, and a schema is not enforcement:
 * tool calling is automatic and non-strict, so a model can omit the field or send "120" as a
 * string. Downstream, `comms-purchase-number` treats an ABSENT amount as the legacy marketplace
 * path — the UI shows the price beside the Buy button and sends none — and skips price
 * verification entirely. So a malformed quote did not fail; it silently became "no quote", and
 * the number was bought without any amount being checked or shown.
 *
 * The predicate lives here because `paige-ai-chat` has no runtime test harness, and a guard on a
 * money path that cannot be driven is a guard nobody can prove. Pulled out, it is exercised
 * directly against the exact malformed inputs that produced the finding.
 *
 * WHAT COUNTS. Whole cents, strictly positive. Not a string, because that is the observed
 * malformation. Not a float, because a fraction of a cent is not a price and `120.5` compared
 * against a stored integer would fail later and less legibly. Not zero or negative, because a
 * purchase that claims to cost nothing is the one quote a human would wave through.
 */
export function isSpendableQuoteCents(value: unknown): value is number {
  return typeof value === "number"
    && Number.isInteger(value)
    && value > 0;
}
