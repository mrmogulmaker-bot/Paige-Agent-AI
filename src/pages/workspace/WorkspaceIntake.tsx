/** BTF Workspace · Intake Wizard — Section D.
 *  Saves into btf_workspace_settings.intake_data and stamps intake_submitted_at.
 *  White-label: no "Paige" strings, no Lovable Cloud references. */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useWorkspaceClient } from "./useWorkspaceClient";

type IntakeData = {
  full_legal_name: string;
  preferred_name: string;
  phone: string;
  mailing_address: string;
  entity_name: string;
  entity_type: string;
  entity_state: string;
  ein: string;
  industry: string;
  years_in_business: string;
  monthly_revenue: string;
  funding_goal: string;
  funding_use: string;
  existing_debt: string;
  personal_credit_range: string;
  business_credit_status: string;
  goals_90_days: string;
  biggest_blocker: string;
};

const EMPTY: IntakeData = {
  full_legal_name: "", preferred_name: "", phone: "", mailing_address: "",
  entity_name: "", entity_type: "", entity_state: "", ein: "",
  industry: "", years_in_business: "", monthly_revenue: "", funding_goal: "",
  funding_use: "", existing_debt: "",
  personal_credit_range: "", business_credit_status: "",
  goals_90_days: "", biggest_blocker: "",
};

const STEPS = [
  { title: "About You", fields: ["full_legal_name","preferred_name","phone","mailing_address"] as const },
  { title: "Your Business", fields: ["entity_name","entity_type","entity_state","ein","industry","years_in_business"] as const },
  { title: "Revenue & Funding", fields: ["monthly_revenue","funding_goal","funding_use","existing_debt"] as const },
  { title: "Credit Snapshot", fields: ["personal_credit_range","business_credit_status"] as const },
  { title: "Goals", fields: ["goals_90_days","biggest_blocker"] as const },
];

export default function WorkspaceIntake() {
  const { client, loading: clientLoading, error: clientError } = useWorkspaceClient();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<IntakeData>(EMPTY);
  const [submittedAt, setSubmittedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  useEffect(() => {
    if (!client) return;
    (async () => {
      const { data: row } = await supabase
        .from("btf_workspace_settings")
        .select("intake_data, intake_submitted_at")
        .eq("client_id", client.id)
        .maybeSingle();
      if (row?.intake_data) setData({ ...EMPTY, ...(row.intake_data as Partial<IntakeData>) });
      if (row?.intake_submitted_at) setSubmittedAt(row.intake_submitted_at);
      setHydrating(false);
    })();
  }, [client]);

  const progress = useMemo(() => Math.round(((step + 1) / STEPS.length) * 100), [step]);
  const update = (k: keyof IntakeData, v: string) => setData((d) => ({ ...d, [k]: v }));

  const saveDraft = async (markSubmitted = false) => {
    if (!client) return;
    setSaving(true);
    const payload = {
      client_id: client.id,
      intake_data: data as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
      ...(markSubmitted ? { intake_submitted_at: new Date().toISOString() } : {}),
    };

    const { error } = await supabase
      .from("btf_workspace_settings")
      .upsert(payload, { onConflict: "client_id" });
    setSaving(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    if (markSubmitted) {
      setSubmittedAt(new Date().toISOString());
      toast({ title: "Intake submitted", description: "Your coach has been notified." });
    } else {
      toast({ title: "Saved" });
    }
  };

  if (clientLoading || hydrating) return <div className="text-sm">Loading…</div>;
  if (clientError || !client) return <div className="workspace-card p-6 text-sm">{clientError}</div>;

  if (submittedAt) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl mb-1">Intake Submitted</h1>
          <p className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>
            Submitted {new Date(submittedAt).toLocaleDateString()}. Your coach will review and reach out
            with the next steps. You can re-open this form if anything changes.
          </p>
        </div>
        <div className="workspace-card p-6 space-y-3">
          {Object.entries(data).map(([k, v]) => (
            <div key={k} className="grid grid-cols-3 gap-3 text-sm border-b pb-2" style={{ borderColor: "var(--mma-line)" }}>
              <span className="font-medium capitalize">{k.replace(/_/g, " ")}</span>
              <span className="col-span-2">{v || <em className="opacity-60">—</em>}</span>
            </div>
          ))}
          <Button variant="outline" onClick={() => setSubmittedAt(null)}>Update my intake</Button>
        </div>
      </div>
    );
  }

  const current = STEPS[step];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl mb-1">Intake Form</h1>
        <p className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>
          Step {step + 1} of {STEPS.length} · {current.title}
        </p>
        <div className="mt-3 h-2 rounded-full bg-black/10 overflow-hidden">
          <div className="h-full" style={{ width: `${progress}%`, background: "var(--mma-gold)" }} />
        </div>
      </div>

      <div className="workspace-card p-6 space-y-5">
        {current.fields.map((f) => (
          <div key={f} className="space-y-2">
            <Label className="capitalize">{f.replace(/_/g, " ")}</Label>
            {f === "mailing_address" || f === "funding_use" || f === "existing_debt" || f === "goals_90_days" || f === "biggest_blocker" ? (
              <Textarea value={data[f]} onChange={(e) => update(f, e.target.value)} rows={3} />
            ) : (
              <Input value={data[f]} onChange={(e) => update(f, e.target.value)} />
            )}
          </div>
        ))}

        <div className="flex justify-between pt-3">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => saveDraft(false)} disabled={saving}>
              Save draft
            </Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>Next</Button>
            ) : (
              <Button onClick={() => saveDraft(true)} disabled={saving}>
                Submit intake
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
