export type CanonicalPersonName = Readonly<{
  /**
   * Safe human-facing/storage form: Unicode-composed and all Unicode
   * whitespace collapsed to one space. Letter case and format controls are
   * preserved because join controls can be meaningful name orthography.
   */
  display: string;
  /**
   * Stable comparison/hash form. Compatibility normalization and
   * locale-independent Unicode lowercase make equivalent casing and composed
   * spellings share one identity without forcing lowercase into the UI or CRM.
   */
  identity: string;
}>;

// These three controls do not alter name orthography. Remove them only from
// the identity/hash projection. U+180E, U+200C and U+200D are intentionally
// preserved: Mongolian and joining scripts use them meaningfully.
const HASH_IGNORABLE_NAME_FORMAT = /[\u200b\u2060\ufeff]/gu;
const UNICODE_WHITESPACE = /\p{White_Space}+/gu;
const UNICODE_FORMAT = /\p{Cf}/gu;

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
    .replace(UNICODE_WHITESPACE, " ")
    .trim();
  const visibleContent = display.replace(UNICODE_FORMAT, "").replace(UNICODE_WHITESPACE, "");
  if (!visibleContent) return null;
  const identity = display
    .normalize("NFKC")
    .replace(HASH_IGNORABLE_NAME_FORMAT, "")
    .replace(UNICODE_WHITESPACE, " ")
    .trim()
    .toLowerCase();
  if (!identity) return null;
  return Object.freeze({
    display,
    identity,
  });
}
