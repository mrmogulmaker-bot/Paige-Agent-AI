/**
 * The yellow support-style FloatingChatbot is not a PAIGE operating-system entry.
 * Authenticated product shells own their conversation surface, so rendering the
 * global widget there creates a duplicate PAIGE and violates the one-home rule.
 */
const FLOATING_CHAT_HIDDEN_EXACT = new Set(["/", "/premium"]);

const PAIGE_OWNED_SHELLS = [
  "/tenant-redesign",
  "/admin",
  "/agency",
  "/business",
  "/solo",
  "/operator",
  "/app",
] as const;

function normalizePathname(pathname: string): string {
  const path = pathname.split(/[?#]/, 1)[0] || "/";
  if (path === "/") return path;
  return path.replace(/\/+$/, "");
}

function isWithinShell(pathname: string, shell: string): boolean {
  return pathname === shell || pathname.startsWith(`${shell}/`);
}

export function shouldRenderFloatingChatbot(pathname: string): boolean {
  const normalized = normalizePathname(pathname);
  if (FLOATING_CHAT_HIDDEN_EXACT.has(normalized)) return false;
  return !PAIGE_OWNED_SHELLS.some((shell) => isWithinShell(normalized, shell));
}
