import { useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { advanceOnboardingStage, type OnboardClient } from "./useOnboardingClient";

type Ctx = { client: OnboardClient; refresh: () => void };

const STEPS = ["Welcome", "Agreement", "Payment", "Intake", "Documents", "Complete"];

function ProgressHeader({ stepIndex, title, subtitle }: { stepIndex: number; title: string; subtitle: string }) {
  const pct = Math.round(((stepIndex + 1) / STEPS.length) * 100);
  return (
    <div className="mb-6">
      <span className="onboard-step-chip">Step {stepIndex + 1} of {STEPS.length} · {STEPS[stepIndex]}</span>
      <h1 className="onboard-h1">{title}</h1>
      <p className="onboard-sub">{subtitle}</p>
      <div className="onboard-progress"><div style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

type Section = "about_you" | "business" | "current_state" | "docs_checklist";
const SECTIONS: { key: Section; title: string }[] = [
  { key: "about_you", title: "About you" },
  { key: "business", title: "Your business" },
  { key: "current_state", title: "Your current state" },
  { key: "docs_checklist", title: "Documents you have" },
];

const ABOUT_FIELDS = ["full_legal_name", "date_of_birth", "phone", "mailing_address"] as const;
const BUSINESS_FIELDS = ["entity_name", "ein_status", "formation_state", "formation_date", "naics_industry", "target_funding_amount", "use_of_funds"] as const;
const STATE_FIELDS = ["banking_situation", "business_cards_status", "prior_funding_attempts", "personal_fico_range"] as const;

export default function Step4Intake() {
  const { client, refresh } = useOutletContext<Ctx>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [section, setSection] = useState<Section>("about_you");
  const [payloads, setPayloads] = useState<Record<Section, Record<string, any>>>({
    about_you: {}, business: {}, current_state: {}, docs_checklist: {},
  });
  const [hydrating, setHydrating] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("paige_client_intake_submissions")
        .select("section, payload")
        .eq("client_id", client.id);
      if (data) {
        const next = { about_you: {}, business: {}, current_state: {}, docs_checklist: {} } as Record<Section, any>;
        for (const row of data) next[row.section as Section] = row.payload || {};
        setPayloads(next);
      }
      setHydrating(false);
    })();
  }, [client.id]);

  const update = (key: string, value: any) => {
    setPayloads((p) => ({ ...p, [section]: { ...p[section], [key]: value } }));
  };

  const persistCurrent = async (markSubmitted: boolean) => {
    const { error } = await supabase
      .from("paige_client_intake_submissions")
      .upsert(
        {
          client_id: client.id,
          section,
          payload: payloads[section],
          submitted_at: markSubmitted ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "client_id,section" },
      );
    if (error) throw error;
  };

  const next = async () => {
    setSaving(true);
    try {
      await persistCurrent(true);
      const idx = SECTIONS.findIndex((s) => s.key === section);
      if (idx < SECTIONS.length - 1) {
        setSection(SECTIONS[idx + 1].key);
      } else {
        await advanceOnboardingStage(client.id, "uploading_docs");
        await refresh();
        navigate("/onboard/documents");
      }
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message || String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const saveDraft = async () => {
    setSaving(true);
    try {
      await persistCurrent(false);
      toast({ title: "Draft saved" });
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message || String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const data = payloads[section];

  return (
    <>
      <ProgressHeader
        stepIndex={3}
        title="Intake"
        subtitle="A few details so your coach can hit the ground running. You can save and resume any time."
      />
      <div className="onboard-card p-8 space-y-6">
        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => setSection(s.key)}
              className={`text-xs px-3 py-1 rounded-full border ${
                s.key === section
                  ? "bg-[#081428] text-[#f4ecd6] border-[#081428]"
                  : "border-[rgba(8,20,40,0.2)] text-[rgba(8,20,40,0.7)]"
              }`}
            >
              {i + 1}. {s.title}
            </button>
          ))}
        </div>

        {hydrating ? (
          <div className="text-sm">Loading your saved answers…</div>
        ) : (
          <div className="space-y-5">
            {section === "about_you" && ABOUT_FIELDS.map((f) => (
              <Field key={f} k={f} value={data[f] ?? ""} onChange={(v) => update(f, v)} />
            ))}
            {section === "business" && BUSINESS_FIELDS.map((f) => (
              <Field key={f} k={f} value={data[f] ?? ""} onChange={(v) => update(f, v)} />
            ))}
            {section === "current_state" && STATE_FIELDS.map((f) => (
              <Field key={f} k={f} value={data[f] ?? ""} onChange={(v) => update(f, v)} />
            ))}
            {section === "docs_checklist" && (
              <div className="space-y-3">
                {["articles_of_organization", "ein_letter", "bank_statements_3mo", "business_credit_report"].map((d) => (
                  <label key={d} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={!!data[d]}
                      onChange={(e) => update(d, e.target.checked)}
                    />
                    {d.replace(/_/g, " ")}
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between pt-2">
          <Button variant="outline" onClick={saveDraft} disabled={saving}>Save draft</Button>
          <Button onClick={next} disabled={saving}>
            {section === "docs_checklist" ? "Continue to documents" : "Save & next section"}
          </Button>
        </div>
      </div>
    </>
  );
}

function Field({ k, value, onChange }: { k: string; value: any; onChange: (v: string) => void }) {
  const label = k.replace(/_/g, " ");
  const longFields = ["mailing_address", "use_of_funds", "prior_funding_attempts"];
  return (
    <div className="space-y-2">
      <Label className="capitalize">{label}</Label>
      {longFields.includes(k) ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}
