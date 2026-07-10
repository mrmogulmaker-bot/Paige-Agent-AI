// Live KPI strip for the Campaigns Hub Overview tab.
// Pulls counts directly from growth_* tables, scoped to the active tenant.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { StatRow, StatTile } from "@/components/ui/page";
import { GitBranch, FileText, LayoutGrid, Inbox, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Stats {
  liveFunnels: number;
  livePages: number;
  liveForms: number;
  submissions7d: number;
  topForm: { name: string; count: number } | null;
}

export function CampaignsOverviewStats() {
  const { activeTenantId } = useTenantContext();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!activeTenantId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const [funnels, pages, forms, recent] = await Promise.all([
        supabase.from("growth_funnels").select("id", { count: "exact", head: true })
          .eq("tenant_id", activeTenantId).eq("status", "live"),
        supabase.from("growth_pages").select("id", { count: "exact", head: true })
          .eq("tenant_id", activeTenantId).eq("status", "live"),
        supabase.from("growth_forms").select("id", { count: "exact", head: true })
          .eq("tenant_id", activeTenantId).eq("status", "live"),
        supabase.from("growth_form_submissions")
          .select("form_id, growth_forms(name)")
          .eq("tenant_id", activeTenantId)
          .gte("created_at", since),
      ]);

      // Top form (by submissions in last 7d)
      const counts: Record<string, { name: string; count: number }> = {};
      (recent.data ?? []).forEach((r: any) => {
        const name = r.growth_forms?.name ?? "Unknown form";
        const key = r.form_id;
        counts[key] = { name, count: (counts[key]?.count ?? 0) + 1 };
      });
      const top = Object.values(counts).sort((a, b) => b.count - a.count)[0] ?? null;

      if (cancelled) return;
      setStats({
        liveFunnels: funnels.count ?? 0,
        livePages: pages.count ?? 0,
        liveForms: forms.count ?? 0,
        submissions7d: recent.data?.length ?? 0,
        topForm: top,
      });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const isLoading = loading || !stats;

  const items: { label: string; value: string | number; icon: LucideIcon; hint?: string }[] = [
    { label: "Live Funnels", value: stats?.liveFunnels ?? 0, icon: GitBranch },
    { label: "Live Pages", value: stats?.livePages ?? 0, icon: LayoutGrid },
    { label: "Live Forms", value: stats?.liveForms ?? 0, icon: FileText },
    { label: "Submissions (7d)", value: stats?.submissions7d ?? 0, icon: Inbox },
    {
      label: "Top Form (7d)",
      value: stats?.topForm ? `${stats.topForm.count}` : "—",
      icon: TrendingUp,
      hint: stats?.topForm?.name,
    },
  ];

  return (
    <StatRow cols={4}>
      {items.map((it) => (
        <StatTile
          key={it.label}
          label={it.label}
          value={it.value}
          icon={it.icon}
          hint={it.hint}
          loading={isLoading}
        />
      ))}
    </StatRow>
  );
}
