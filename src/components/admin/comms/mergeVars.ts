// Comms C-1.5 — shared merge-variable helpers for Signatures + Snippets.
// One home (§18): both tabs detect {{tokens}} and render previews the SAME way,
// and the §13 honesty rule lives here — an unknown token resolves to "" so a raw
// {{token}} is NEVER shipped into a sent signature/snippet.
import DOMPurify from "dompurify";

const TOKEN_RE = /\{\{\s*[\w.]+\s*\}\}/g;

/** Every unique {{token}} present in the text, in first-seen order. */
export function detectTokens(text: string | null | undefined): string[] {
  if (!text) return [];
  const seen = new Set<string>();
  for (const raw of text.match(TOKEN_RE) ?? []) {
    // normalize inner whitespace so "{{ title }}" and "{{title}}" are one key
    seen.add(`{{${raw.replace(/[{}\s]/g, "")}}}`);
  }
  return [...seen];
}

/**
 * Resolve merge tokens against the provided defaults. §13: any token the map
 * doesn't cover collapses to "" — we never leave a literal {{token}} behind.
 */
export function resolveMergeVars(
  text: string,
  variables: Record<string, string> | null | undefined,
): string {
  const vars = variables ?? {};
  return text.replace(TOKEN_RE, (raw) => {
    const key = `{{${raw.replace(/[{}\s]/g, "")}}}`;
    return vars[key] ?? "";
  });
}

/** Sanitized, merge-resolved HTML ready for dangerouslySetInnerHTML preview. */
export function renderSignaturePreview(
  html: string,
  variables: Record<string, string> | null | undefined,
): string {
  const resolved = resolveMergeVars(html, variables);
  return DOMPurify.sanitize(resolved, {
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
  });
}

/** Postgres unique-violation — surfaced as a crafted inline error, never raw. */
export function isUniqueViolation(err: unknown): boolean {
  return !!err && typeof err === "object" && (err as { code?: string }).code === "23505";
}
