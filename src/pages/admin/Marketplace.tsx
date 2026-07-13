/**
 * Paige Marketplace (tenant-facing) — switch on capability "skills" for your
 * Paige. Each skill layers a domain brain / tools on top of your coach-type skin
 * without changing your persona (Roadmap #9, §8/§9). Enabling writes the skill
 * slug into tenants.features.enabled_skills via set_tenant_skill; the AI chat
 * reads that to attach the right overlay (e.g. the funding brain).
 */
import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { TrendingUp, Palette, Mic, Workflow, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/hooks/useTenantContext";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { SkillCard } from "@/components/marketplace/SkillCard";
import {
  SKILL_CATEGORIES, skillsByCategory, MARKETPLACE_SKILLS, type MarketplaceSkill,
} from "@/lib/marketplace/skills";

const ICONS: Record<string, LucideIcon> = { TrendingUp, Palette, Mic, Workflow };

export default function Marketplace() {
  const { activeTenantId, loading: tenantLoading } = useTenantContext();
  const [enabled, setEnabled] = useState<string[]>([]);
  // Funding can also be on via the "Funding" coach-type Playbook preset (set in
  // Your Paige) — a separate path the AI gate also honors. When it is, we lock
  // the funding card ON so the toggle can't misrepresent state or lie with a
  // false "switched off" (one source of truth, §7/§9).
  const [presetFundingOn, setPresetFundingOn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  // Which skill just turned on — drives the one-shot "arming" pulse so only the
  // toggled card animates, not every card on mount.
  const [justArmed, setJustArmed] = useState<string | null>(null);

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
      const pbSlug = (feats.playbook_config as { slug?: unknown } | null)?.slug;
      setPresetFundingOn(
        feats.playbook === "funding" || pbSlug === "funding" ||
        feats.paige_funding_skill === true || feats.paige_funding_skill === "true",
      );
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
      if (on) { setJustArmed(skill.slug); setTimeout(() => setJustArmed((s) => (s === skill.slug ? null : s)), 400); }
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

  // Counts derived from real state — never hardcoded.
  const liveCount = MARKETPLACE_SKILLS.filter(
    (s) => s.status === "available" && (enabled.includes(s.slug) || (s.slug === "funding" && presetFundingOn)),
  ).length;
  const roadmapCount = MARKETPLACE_SKILLS.filter((s) => s.status === "coming_soon").length;

  const notify = (skill: MarketplaceSkill) => {
    // §13 truthfulness: there is no waitlist store yet, so DON'T claim we captured
    // a signup we didn't. Tell the truth — it's coming and will appear here. Wiring
    // a real, Paige-governable interest action (RPC → paige_actions) is tracked
    // separately; until then this stays honest rather than a fabricated confirmation.
    toast.info(`${skill.name} is coming soon — it'll show up right here the moment it's ready.`);
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-8 space-y-10">
      {/* Hero masthead — the one deliberate dark "store moment" (§6, gold reserved for accents). */}
      <section
        className="relative overflow-hidden rounded-[calc(var(--radius)+6px)] p-8 md:p-10 shadow-xl"
        style={{ background: "var(--gradient-hero)" }}
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div
            className="absolute -top-24 -right-16 h-72 w-72 rounded-full"
            style={{ background: "radial-gradient(closest-side, hsl(var(--gold)/0.28), transparent)" }}
          />
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage:
                "linear-gradient(hsl(0 0% 100%/1) 1px,transparent 1px),linear-gradient(90deg,hsl(0 0% 100%/1) 1px,transparent 1px)",
              backgroundSize: "44px 44px",
            }}
          />
        </div>
        <div className="relative">
          <div className="flex items-center gap-2.5">
            <PaigeMark className="h-9 w-9" />
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--gold-light))]">
              Paige · Capability Store
            </span>
          </div>
          <h1 className="mt-4 max-w-2xl font-display text-3xl md:text-4xl font-semibold leading-[1.1] text-white text-balance">
            Give Paige new powers.
          </h1>
          <p className="mt-3 max-w-xl text-sm md:text-base text-white/70">
            Switch on a capability and Paige carries it into every client conversation — your
            persona, your voice, your journey stay yours.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85">
              <span className="h-1.5 w-1.5 rounded-full bg-[hsl(var(--gold))]" />
              {liveCount > 0 ? `${liveCount} live now` : "Ready when you are"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/85">
              <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
              {roadmapCount} shipping soon
            </span>
          </div>
        </div>
      </section>

      {SKILL_CATEGORIES.map((cat, i) => {
        const skills = skillsByCategory(cat.key);
        if (skills.length === 0) return null;
        return (
          <section key={cat.key} className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary text-[11px] font-semibold text-white">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight text-foreground">{cat.label}</h2>
                <p className="text-sm text-muted-foreground">{cat.blurb}</p>
              </div>
              <div className="ml-2 hidden h-px flex-1 bg-border/60 sm:block" />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {skills.map((skill) => {
                const Icon = ICONS[skill.icon] ?? Sparkles;
                // Funding is "locked on" when it's active via the Funding coach-type
                // preset rather than this skill toggle — the toggle can't turn that off.
                const lockedOn = skill.slug === "funding" && presetFundingOn;
                const isOn = enabled.includes(skill.slug) || lockedOn;
                const available = skill.status === "available";
                return (
                  <SkillCard
                    key={skill.slug}
                    skill={skill}
                    Icon={Icon}
                    isOn={isOn}
                    available={available}
                    lockedOn={lockedOn}
                    saving={saving === skill.slug}
                    loading={loading}
                    justArmed={justArmed === skill.slug}
                    onToggle={(v) => toggle(skill, v)}
                    onNotify={() => notify(skill)}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
