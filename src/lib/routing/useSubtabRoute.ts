import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
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

  // Inline mount (sub-account Gate B / defensive inline agency): behave like useState.
  if (!account) return [localKey, setLocalKey];

  // URL-driven: splat = "{branch}/{subtab}/…" → [1] is the sub-tab segment.
  const subSlug = (params["*"] || "").split("/")[1] || null;
  const activeKey = subSlug
    ? subtabBySlug(tier, branchSlug, subSlug)?.key ?? defaultKey
    : defaultKey;

  const setKey = (key: string) => {
    const slug = subtabByKey(tier, branchSlug, key)?.slug ?? null;
    if (slug) navigate(subtabPath(tier, account, branchSlug, slug));
    else setLocalKey(key); // key not in the registry → don't route to a dead URL.
  };

  return [activeKey, setKey];
}
