import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  branchBySlug,
  subtabBySlug,
  subtabByKey,
  subtabPath,
  type RouteTierKey,
} from "./tierBranches";

/**
 * useSubtabRoute — §65 3-level tree (owner 2026-08-17). A DROP-IN replacement for a
 * screen's local sub-tab `useState`, so the active sub-tab is DERIVED from the URL
 * (`/agency/{account}/{branch}/{subtab}`) and every sub-tab click NAVIGATES. This is the
 * one-line-per-screen swap that makes each sub-surface deep-linkable + Paige-addressable
 * (§10), while the screen's faithful-port markup (§28/§63) stays byte-identical.
 *
 *   // before:  const [tab, setTab] = React.useState("chat");
 *   // after:   const [tab, setTab] = useSubtabRoute("agency", "paige", "chat");
 *
 * Returns `[activeKey, setKey]` where `activeKey` is the screen's INTERNAL sub-tab id
 * (resolved from the URL slug via the registry) and `setKey(key)` navigates to that
 * sub-tab's canonical path.
 *
 * DUAL-MODE (§58): when mounted WITHOUT a `:account` param (the sub-account `/admin`
 * inline takeover, §51 Gate B — whose `/business` tree lands in R3), it degrades to
 * plain local state so that path is byte-unchanged. All hooks are called unconditionally
 * before any branch (rules-of-hooks safe).
 *
 * Honest fallbacks (§13): an unknown/absent 3rd segment resolves to `defaultKey` (the
 * bare `/agency/{n}/{branch}` renders the default sub-tab); a `setKey` for a key the
 * registry doesn't know falls back to local state rather than navigating to a dead URL.
 */
export function useSubtabRoute(
  tier: RouteTierKey,
  branchSlug: string,
  defaultKey: string,
): [string, (key: string) => void] {
  const params = useParams();
  const navigate = useNavigate();
  const [localKey, setLocalKey] = useState(defaultKey);

  const account = params.account || null;

  // A typo'd branchSlug compiles (it's just `string`) and silently makes EVERY
  // sub-tab on that screen inert. Surface it (§32 — never fail silently).
  if (import.meta.env.DEV && !branchBySlug(tier, branchSlug)) {
    console.warn(
      `[useSubtabRoute] "${branchSlug}" is not a branch of tier "${tier}" — ` +
        `every sub-tab on this screen will be inert. Check the slug against ` +
        `src/lib/routing/tierBranches.ts.`,
    );
  }

  // Inline mount (sub-account Gate B / defensive inline agency): behave like useState.
  if (!account) return [localKey, setLocalKey];

  const splatParts = (params["*"] || "").split("/");
  // Agency act-as keeps the authenticated child in the address:
  // `sub/{childAccount}/{branch}/{subtab}`. The URL remains an address, never
  // authority; AgencyApp separately confirms the active tenant before rendering.
  const agencyActAs =
    tier === "agency" &&
    splatParts[0] === "sub" &&
    /^\d+$/.test(splatParts[1] || "");
  const branchIndex = agencyActAs ? 2 : 0;
  const subSlug = splatParts[branchIndex] === branchSlug
    ? splatParts[branchIndex + 1] || null
    : null;
  const activeKey = subSlug
    ? subtabBySlug(tier, branchSlug, subSlug)?.key ?? defaultKey
    : defaultKey;

  const setKey = (key: string) => {
    const slug = subtabByKey(tier, branchSlug, key)?.slug ?? null;
    if (slug) {
      navigate(
        agencyActAs
          ? `/agency/${account}/sub/${splatParts[1]}/${branchSlug}/${slug}`
          : subtabPath(tier, account, branchSlug, slug),
      );
      return;
    }
    // Key not in the registry → don't route to a dead URL. But be LOUD about it
    // (§32): in URL-driven mode `activeKey` derives from the URL alone, so this
    // local write is never read — the click is a silent, error-free no-op. That
    // is exactly the "compiles and builds clean but does nothing" failure the
    // registry↔screen contract test exists to catch; warn so a dev hitting it in
    // the browser sees a cause instead of a dead tab.
    if (import.meta.env.DEV) {
      console.warn(
        `[useSubtabRoute] "${key}" is not a registered sub-tab of ${tier}/${branchSlug} — ` +
          `the click cannot navigate and will appear to do nothing. Add it to that ` +
          `branch's \`subtabs\` in src/lib/routing/tierBranches.ts.`,
      );
    }
    setLocalKey(key);
  };

  return [activeKey, setKey];
}
