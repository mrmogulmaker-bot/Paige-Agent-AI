/**
 * Is this caller-supplied object key safe to hand to a SERVICE-ROLE storage read?
 *
 * WHY THIS EXISTS AS ITS OWN MODULE WITH ITS OWN TESTS, rather than an `if` at the call site.
 *
 * `agreement-send` reads an agreement's `document_path` with the admin client, because the database
 * cannot read storage and so cannot hash the real bytes of an uploaded contract. That path is
 * caller-supplied: `save_paige_agreement` stores `btrim(_document_path)` and validates only that it
 * is non-empty. The bucket it lives in is protected by FOLDER-based RLS — every policy on
 * `tenant-agreements` tests `(storage.foldername(name))[1]` against the caller's `tenant_members`
 * rows — and the admin client bypasses every one of them.
 *
 * THE FIRST VERSION OF THIS CHECK COMPARED ONLY THE FIRST SEGMENT, AND THAT WAS NOT A CHECK.
 * `path.split("/", 1)[0] === tenantId` passes for `<own>/../<victim>/source/contract.pdf`, and
 * `@supabase/storage-js` does not encode the object path on download — `_getFinalPath` interpolates
 * it into the URL bare (`encodeStoragePath` is used only by `purgeCache`), so WHATWG dot-segment
 * normalisation resolves it before the request ever leaves. Measured, not reasoned about:
 *
 *   guard sees <own>  ->  GET /storage/v1/object/tenant-agreements/<victim>/source/theirs.pdf
 *   guard sees <own>  ->  GET /storage/v1/object/paige-agreements/<victim>/sealed.pdf
 *   guard sees <own>  ->  GET /storage/v1/bucket
 *
 * The second line leaves the bucket entirely and reads another tenant's SEALED EXECUTED agreements;
 * the third lists every bucket in the project as service_role. And because `agreement-send` then
 * hashes those bytes, freezes them and emails them to a signer address the caller chose, this was
 * exfiltration rather than merely a read.
 *
 * So the rule is STRUCTURAL and allow-list shaped, not a prefix comparison: a key must look exactly
 * like the one the uploader writes, and anything that could mean something else to a URL parser is
 * refused rather than normalised. `src/solo/useSoloAgreementSignings.ts` writes
 * `${tenantId}/source/${Date.now()}-${safeName}` with `safeName` already stripped to `[\w.-]`, so
 * nothing legitimate is refused by this.
 */

/** A single path segment: word characters, dots and hyphens. Never empty, never `.` or `..`. */
const SEGMENT = /^[\w.-]+$/;

export class UnsafeDocumentPathError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super("That agreement points at a file this workspace cannot read, so nothing was sent.");
    this.name = "UnsafeDocumentPathError";
    this.reason = reason;
  }
}

/**
 * Throw unless `path` is an ordinary object key inside `tenantId`'s own folder.
 *
 * `tenantId` must be the SERVER-DERIVED tenant — in `agreement-send` it comes from
 * `current_user_tenant_id()` under the caller's own JWT, never from the request body.
 */
export function assertDocumentPathIsInTenant(path: string, tenantId: string): void {
  if (!tenantId) throw new UnsafeDocumentPathError("no_tenant");
  if (!path) throw new UnsafeDocumentPathError("empty");

  // Refuse the encodings BEFORE splitting, because `%2e%2e` becomes `..` at the server and a
  // backslash is a separator on some parsers. Neither can appear in a key the uploader wrote.
  if (path.includes("%")) throw new UnsafeDocumentPathError("percent_encoded");
  if (path.includes("\\")) throw new UnsafeDocumentPathError("backslash");
  if (path.startsWith("/")) throw new UnsafeDocumentPathError("absolute");
  // Control characters, including the NUL that can truncate a path downstream.
  // deno-lint-ignore no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) throw new UnsafeDocumentPathError("control_character");

  const segments = path.split("/");
  // Every segment must be a real name. This is what refuses `..` and `.`, and `//` (empty segment).
  for (const segment of segments) {
    if (!SEGMENT.test(segment)) throw new UnsafeDocumentPathError("bad_segment");
    if (segment === "." || segment === "..") throw new UnsafeDocumentPathError("dot_segment");
  }
  // Exact first-segment equality, not `startsWith` on the raw string: a tenant whose id is a prefix
  // of another's must not match, and the folder RLS this mirrors keys on the first segment too.
  if (segments[0] !== tenantId) throw new UnsafeDocumentPathError("foreign_tenant");
  // A bare `<tenant>` with no object after it is not a file. Postgres' `storage.foldername()` drops
  // the last element, so a single-segment key has `[1] = NULL` in the policy and would not be
  // covered by the RLS this check exists to stand in for.
  if (segments.length < 2) throw new UnsafeDocumentPathError("no_object");
}
