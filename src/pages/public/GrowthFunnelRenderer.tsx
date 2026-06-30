// Public funnel runner: walks the user through ordered steps
// (page → form → thankyou). Each step records progress in growth_funnel_sessions.
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { GrowthFormEmbed } from "@/pages/public/GrowthFormRenderer";

interface Funnel { id: string; tenant_id: string; name: string; }
interface Step { id: string; step_type: string; order_index: number; page_id: string | null; form_id: string | null; config_json: any; }

export default function GrowthFunnelRenderer() {
  const { tenantSlug, funnelSlug } = useParams();
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [idx, setIdx] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantSlug || !funnelSlug) return;
    (async () => {
      const { data: tenant } = await supabase.from("tenants").select("id").eq("slug", tenantSlug).maybeSingle();
      if (!tenant) { setLoading(false); return; }
      const { data: f } = await supabase.from("growth_funnels")
        .select("id,tenant_id,name").eq("tenant_id", tenant.id).eq("slug", funnelSlug).eq("status", "active").maybeSingle();
      if (!f) { setLoading(false); return; }
      setFunnel(f as Funnel);
      const { data: st } = await supabase.from("growth_funnel_steps")
        .select("id,step_type,order_index,page_id,form_id,config_json").eq("funnel_id", f.id).order("order_index");
      setSteps((st ?? []) as Step[]);
      setLoading(false);
    })();
  }, [tenantSlug, funnelSlug]);

  if (loading) return <div className="min-h-dvh flex items-center justify-center">Loading…</div>;
  if (!funnel) return <div className="min-h-dvh flex items-center justify-center">Funnel not found.</div>;
  const step = steps[idx];
  if (!step) return <div className="min-h-dvh flex items-center justify-center">No steps configured.</div>;

  return (
    <div className="min-h-dvh bg-background">
      {step.step_type === "page" && step.page_id && <FunnelPageStep pageId={step.page_id} onNext={() => setIdx((i) => i + 1)} />}
      {step.step_type === "form" && step.form_id && (
        <div className="py-12 px-4 max-w-2xl mx-auto">
          <FunnelFormStep formId={step.form_id} onNext={() => setIdx((i) => i + 1)} />
        </div>
      )}
      {step.step_type === "thankyou" && (
        <div className="min-h-dvh flex items-center justify-center text-center px-6">
          <div>
            <div className="text-4xl mb-3">✓</div>
            <h2 className="text-2xl font-bold mb-2">You're in.</h2>
            <p className="text-muted-foreground">We'll be in touch shortly.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function FunnelPageStep({ pageId, onNext }: { pageId: string; onNext: () => void }) {
  const [html, setHtml] = useState<string>("");
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("growth_pages").select("title,blocks_json").eq("id", pageId).maybeSingle();
      setHtml(data?.title ?? "");
    })();
  }, [pageId]);
  return (
    <div className="p-8 text-center">
      <h1 className="text-2xl font-bold mb-4">{html}</h1>
      <button className="px-6 py-2 bg-primary text-primary-foreground rounded" onClick={onNext}>Continue →</button>
    </div>
  );
}

function FunnelFormStep({ formId, onNext }: { formId: string; onNext: () => void }) {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("growth_forms").select("tenant_id,slug").eq("id", formId).maybeSingle();
      if (data) { setTenantId(data.tenant_id); setSlug(data.slug); }
    })();
  }, [formId]);
  if (!tenantId || !slug) return null;
  return <GrowthFormEmbed tenantId={tenantId} formSlug={slug} />;
}
