/**
 * Paige Marketplace (tenant-facing) — switch on capability "skills" for your
 * Paige. Each skill layers a domain brain / tools on top of your coach-type skin
 * without changing your persona (Roadmap #9, §8/§9). Enabling writes the skill
 * slug into tenants.features.enabled_skills via set_tenant_skill; the AI chat
 * reads that to attach the right overlay (e.g. the funding brain).
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TrendingUp, Palette, Mic, Workflow, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { SKILL_CATEGORIES, skillsByCategory, type MarketplaceSkill } from "@/lib/marketplace/skills";

const ICONS: Record<string, LucideIcon> = { TrendingUp, Palette, Mic, Workflow };

export default function Marketplace() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const [enabled, setEnabled] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    if (!activeTenantId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    supabase.from("tenants").select("features").eq("id", activeTenantId).maybeSingle().then(({ data, error }) => {
      if (cancelled) return;
      if (error) { toast.error(error.message); setLoading(false); return; }
      const feats = (data?.features ?? {}) as Record<string, unknown>;
      const raw = feats.enabled_skills;
      setEnabled(Array.isArray(raw) ? raw.filter((s): s is string => typeof s === "string") : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [activeTenantId]);

  const toggle = async (skill: MarketplaceSkill, on: boolean) => {
    if (!activeTenantId || saving) return;
    setSaving(skill.slug);
    // Optimistic
    const prev = enabled;
    setEnabled(on ? [...prev, skill.slug] : prev.filter((s) => s !== skill.slug));
    try {
      const { data, error } = await supabase.rpc("set_tenant_skill", {
        _tenant_id: activeTenantId,
        _skill: skill.slug,
        _enabled: on,
      });
      if (error) throw error;
      if (Array.isArray(data)) setEnabled(data.filter((s): s is string => typeof s === "string"));
      toast.success(on ? `${skill.name} added to your Paige.` : `${skill.name} switched off.`);
    } catch (e) {
      setEnabled(prev); // revert
      toast.error(e instanceof Error ? e.message : "Couldn't update this skill");
    } finally {
      setSaving(null);
    }
  };

  if (!tenantLoading && !activeTenantId) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <Card><CardContent className="p-6 text-sm text-muted-foreground">
          Select a workspace to manage its Paige skills.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h1 className="text-2xl font-semibold">Marketplace</h1>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          Add capabilities to your Paige. Each skill layers expertise and tools on top of your
          coach type — switch one on and Paige carries it into every client conversation. Your
          persona, voice, and journey stay yours.
        </p>
      </div>

      {SKILL_CATEGORIES.map((cat) => {
        const skills = skillsByCategory(cat.key);
        if (skills.length === 0) return null;
        return (
          <section key={cat.key} className="space-y-3">
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{cat.label}</h2>
              <p className="text-xs text-muted-foreground">{cat.blurb}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {skills.map((skill) => {
                const Icon = ICONS[skill.icon] ?? Sparkles;
                const isOn = enabled.includes(skill.slug);
                const available = skill.status === "available";
                return (
                  <Card key={skill.slug} className={available ? "" : "opacity-70"}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="shrink-0 rounded-md bg-primary/10 p-2 text-primary"><Icon className="w-4 h-4" /></span>
                          <div className="min-w-0">
                            <CardTitle className="text-base leading-tight">{skill.name}</CardTitle>
                            <CardDescription className="text-xs">{skill.tagline}</CardDescription>
                          </div>
                        </div>
                        {available ? (
                          <Switch
                            checked={isOn}
                            disabled={saving === skill.slug || loading}
                            onCheckedChange={(v) => toggle(skill, v)}
                            aria-label={`Toggle ${skill.name}`}
                          />
                        ) : (
                          <Badge variant="secondary" className="shrink-0 text-[10px]">Coming soon</Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <p className="text-xs text-muted-foreground">{skill.description}</p>
                      {available && isOn && (
                        <p className="mt-2 text-[11px] font-medium text-primary">On — Paige uses this with every client.</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
