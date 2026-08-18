import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { KnowledgeDomain } from "@/operator/surfaces/KnowledgeSurface";

/**
 * The platform Knowledge read — her second brain at OPERATOR scope.
 *
 * §9 — `knowledge_base` is a PLATFORM corpus: it carries no `tenant_id` at all, so nothing a
 * tenant authored can reach this surface through it. That is exactly the scope the Knowledge
 * panel is specified for (doctrine, the skills library, cross-tenant meta-patterns), and it is
 * why this hook reads that table and no other.
 *
 * §13 — a domain is a `knowledge_category`, and its `docs` is an EXACT count.
 *
 * WHY NOT A ROW SCAN. Counting rows client-side looks simpler, but PostgREST caps how many rows
 * a request returns (`db-max-rows`), and a capped scan under-reports SILENTLY: the surface would
 * print "1,204 documents" as a platform figure while the corpus held more, with nothing to show
 * the number was truncated. A wrong number that looks right is worse than no number (§13). So
 * each category is counted with `head: true, count: "exact"` — the server counts, the cap does
 * not apply, and a category with no rows is simply absent rather than claiming a corpus that is
 * not there. `lastIndexed` is the newest `updated_at` in that category, read as one row.
 *
 * The rail's per-domain note is deliberately left null: describing what a domain HOLDS would
 * mean scanning its rows, which is the very thing the cap makes unreliable. An empty note
 * renders as nothing; an invented one would render as fact.
 */
/**
 * The platform corpus categories, from the `knowledge_category` enum. Enumerated rather than
 * discovered from rows, because discovering them requires the very scan the cap makes
 * unreliable — and an enum member with zero rows is filtered out below anyway.
 */
const CATEGORIES = [
  "framework", "principle", "practice", "model", "stage", "implementation",
] as const;

const DOMAIN_LABEL: Record<string, string> = {
  framework: "Frameworks",
  principle: "Principles",
  practice: "Methods",
  model: "Models",
  stage: "Stages",
  implementation: "Implementation",
};

/** A stable hue per category so a domain keeps its colour between loads (never random). */
const DOMAIN_HUE: Record<string, number> = {
  framework: 254, principle: 44, practice: 172, model: 292, stage: 210, implementation: 12,
};

export type KnowledgeData = {
  domains: KnowledgeDomain[];
  loading: boolean;
  error: string | null;
};

/** "12m ago" / "3d ago" — the human label CD's rail prints. */
function ago(iso: string | null): string | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function useKnowledge(enabled: boolean): KnowledgeData {
  const [domains, setDomains] = useState<KnowledgeDomain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          CATEGORIES.map(async (category) => {
            const [{ count, error: cErr }, { data: newest, error: nErr }] = await Promise.all([
              supabase
                .from("knowledge_base")
                .select("id", { head: true, count: "exact" })
                .eq("category", category),
              supabase
                .from("knowledge_base")
                .select("updated_at")
                .eq("category", category)
                .order("updated_at", { ascending: false, nullsFirst: false })
                .limit(1)
                .maybeSingle(),
            ]);
            return { category, count, newest: newest?.updated_at ?? null, err: cErr ?? nErr };
          }),
        );

        if (!alive) return;
        const failed = results.find((r) => r.err);
        if (failed?.err) {
          setError(failed.err.message);
          setDomains([]);
          setLoading(false);
          return;
        }

        setDomains(
          results
            // A category with no rows is not a domain. Drawing an empty one would claim a
            // corpus that does not exist.
            .filter((r) => (r.count ?? 0) > 0)
            .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
            .map((r) => ({
              id: r.category,
              name: DOMAIN_LABEL[r.category] ?? r.category,
              note: null,
              docs: r.count ?? null,
              lastIndexed: ago(r.newest),
              hue: DOMAIN_HUE[r.category] ?? null,
            })),
        );
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not read the corpus.");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [enabled]);

  return { domains, loading, error };
}
