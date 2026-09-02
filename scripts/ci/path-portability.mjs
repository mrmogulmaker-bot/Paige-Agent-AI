import path from "node:path";

/** Canonical repository path key used by CI guards on every host OS. */
export function repoPath(value) {
  return String(value ?? "").replace(/\\/g, "/");
}

/** Return a canonical repo-relative key when file is inside root, otherwise null. */
export function relativeInsideRoot(file, root) {
  const clean = (value) => repoPath(value).replace(/^\/([A-Za-z]:\/)/, "$1");
  const normalizedFile = clean(file);
  const normalizedRoot = clean(root);
  const isWindows = (value) => /^[A-Za-z]:\//.test(value) || /^\/\/[^/]+\/[^/]+(?:\/|$)/.test(value);
  const fileIsWindows = isWindows(normalizedFile);
  const rootIsWindows = isWindows(normalizedRoot);
  if (fileIsWindows !== rootIsWindows) return null;

  const dialect = fileIsWindows ? path.win32 : path.posix;
  const resolvedRoot = dialect.resolve(normalizedRoot);
  const resolvedFile = dialect.resolve(normalizedFile);
  const relative = dialect.relative(resolvedRoot, resolvedFile);
  if (!relative || dialect.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${dialect.sep}`)) {
    return null;
  }
  return repoPath(relative);
}
