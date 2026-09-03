import {
  SOLO_SETUP_TABS,
  type SoloSetupTab,
} from "./settings-business-context-contract";

export type SetupSubtabRoute =
  | { kind: "tab"; tab: SoloSetupTab }
  | { kind: "index" | "invalid" | "outside" };

/** Address parsing only: tenant context remains the authority for every read/write. */
export function resolveSetupSubtabRoute(
  pathname: string,
  account: string,
): SetupSubtabRoute {
  if (!account) return { kind: "outside" };
  const settings = `/solo/${encodeURIComponent(account)}/settings`;
  const base = `${settings}/setup`;
  const path = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (path === settings || path === base) return { kind: "index" };
  if (!path.startsWith(`${base}/`)) return { kind: "outside" };
  const leaf = path.slice(base.length + 1);
  return SOLO_SETUP_TABS.includes(leaf as SoloSetupTab)
    ? { kind: "tab", tab: leaf as SoloSetupTab }
    : { kind: "invalid" };
}

export function setupSubtabPath(account: string, tab: SoloSetupTab): string {
  return `/solo/${encodeURIComponent(account)}/settings/setup/${tab}`;
}
