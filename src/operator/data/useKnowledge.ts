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
 * §13 — a domain is a `knowledge_category` that ACTUALLY HAS ROWS. Categories are enumerated
 * from the rows themselves rather than from the enum, so an empty category is absent instead
 * of claiming a corpus that is not there; `docs` is a real count; `lastIndexed` is a real
 * `updated_at`, and renders "—" when the rows carry none.
 */
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
        const { data, error: kErr } = await supabase
          .from("knowledge_base")
          .select("category, framework, updated_at");

        if (!alive) return;
        if (kErr) {
          setError(kErr.message);
          setDomains([]);
          setLoading(false);
          return;
        }

        const byCategory = new Map<
          string,
          { docs: number; last: string | null; frameworks: Set<string> }
        >();
        (data ?? []).forEach((r) => {
          const key = String(r.category);
          const acc = byCategory.get(key) ?? { docs: 0, last: null, frameworks: new Set<string>() };
          acc.docs += 1;
          if (r.framework) acc.frameworks.add(r.framework);
          if (r.updated_at && (!acc.last || r.updated_at > acc.last)) acc.last = r.updated_at;
          byCategory.set(key, acc);
        });

        setDomains(
          [...byCategory.entries()]
            .sort((a, b) => b[1].docs - a[1].docs)
            .map(([id, acc]) => ({
              id,
              name: DOMAIN_LABEL[id] ?? id,
              // The note states what the corpus actually holds — a count of the distinct
              // frameworks in that category — rather than a written-in description (§13).
              note:
                acc.frameworks.size > 0
                  ? `${acc.frameworks.size} ${acc.frameworks.size === 1 ? "framework" : "frameworks"}`
                  : null,
              docs: acc.docs,
              lastIndexed: ago(acc.last),
              hue: DOMAIN_HUE[id] ?? null,
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
