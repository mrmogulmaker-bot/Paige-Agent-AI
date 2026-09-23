export type CanonicalPersonName = Readonly<{
  /**
   * Safe human-facing/storage form: Unicode-composed, invisible format
   * characters removed, and all Unicode whitespace collapsed to one space.
   * Letter case is preserved because it is part of a person's display name.
   */
  display: string;
  /**
   * Stable comparison/hash form. Compatibility normalization and
   * locale-independent Unicode lowercase make equivalent casing and composed
   * spellings share one identity without forcing lowercase into the UI or CRM.
   */
  identity: string;
}>;

// These characters are invisible separators/format controls, not meaningful
// name content. They are not all covered by ECMAScript WhiteSpace.
const INVISIBLE_NAME_FORMAT = /[\u180e\u200b-\u200d\u2060\ufeff]/gu;
const UNICODE_WHITESPACE = /\p{White_Space}+/gu;

/**
 * The one canonical person-name boundary for validation, rendering/storage,
 * and comparison/hash consumers.
 *
 * A null result means the input has no visible name content after normalization.
 */
export function canonicalizePersonName(value: unknown): CanonicalPersonName | null {
  if (typeof value !== "string") return null;
  const display = value
    .normalize("NFC")
    .replace(INVISIBLE_NAME_FORMAT, "")
    .replace(UNICODE_WHITESPACE, " ")
    .trim();
  if (!display) return null;
  return Object.freeze({
    display,
    identity: display.normalize("NFKC").toLowerCase(),
  });
}
