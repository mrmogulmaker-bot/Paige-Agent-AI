// Public form renderer — standalone hosted form at /form/:id and embeddable
// inside landing pages via <GrowthFormEmbed>.
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { GrowthFormSchema, GrowthField } from "@/lib/growth";
import { submitGrowthForm, readUtm } from "@/lib/growth";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface FormRow {
  id: string;
  tenant_id: string;
  name: string;
  status: string;
  schema_json: GrowthFormSchema;
  success_action_json: { type: string; message?: string; redirect_url?: string };
}

export default function GrowthFormPage() {
  const { id } = useParams();
  const [form, setForm] = useState<FormRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from("growth_forms")
        .select("id,tenant_id,name,status,schema_json,success_action_json")
        .eq("id", id)
        .eq("status", "active")
        .maybeSingle();
      setForm(data as unknown as FormRow);
      setLoading(false);
    })();
  }, [id]);

  useEffect(() => { if (form?.name) document.title = form.name; }, [form?.name]);

  if (loading) return <div className="min-h-dvh flex items-center justify-center">Loading…</div>;
  if (!form) return <div className="min-h-dvh flex items-center justify-center">Form not found.</div>;

  return (
    <div className="min-h-dvh bg-background py-12 px-4">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-2">{form.name}</h1>
        <FormBody form={form} />
      </div>
    </div>
  );
}

export function GrowthFormEmbed({ tenantId, formSlug, accent }: { tenantId: string; formSlug: string; accent?: string }) {
  const [form, setForm] = useState<FormRow | null>(null);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("growth_forms")
        .select("id,tenant_id,name,status,schema_json,success_action_json")
        .eq("tenant_id", tenantId).eq("slug", formSlug).eq("status", "active")
        .maybeSingle();
      setForm(data as unknown as FormRow);
    })();
  }, [tenantId, formSlug]);
  if (!form) return null;
  return (
    <div className="bg-white text-gray-900 rounded-lg shadow-xl p-6 md:p-8">
      <h2 className="text-2xl font-bold mb-2 text-center" style={{ color: accent }}>{form.name}</h2>
      <FormBody form={form} accent={accent} />
    </div>
  );
}

function FormBody({ form, accent }: { form: FormRow; accent?: string }) {
  const schema = form.schema_json ?? { sections: [] };
  const totalSteps = schema.sections.length;
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Record<string, any>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [submitError, setSubmitError] = useState(false);

  const section = schema.sections[step];
  const progress = totalSteps > 0 ? Math.round(((step + 1) / totalSteps) * 100) : 100;

  const setField = (k: string, v: any) => setData((d) => ({ ...d, [k]: v }));

  const requiredOk = (s: typeof section) => s.fields.every((f) => !f.required || (data[f.key] !== undefined && data[f.key] !== ""));

  const submit = async () => {
    setSubmitting(true);
    setSubmitError(false);
    const { error } = await submitGrowthForm({
      form_id: form.id, tenant_id: form.tenant_id, payload: data, utm: readUtm(),
    });
    setSubmitting(false);
    if (error) { setSubmitError(true); return; }
    if (form.success_action_json?.redirect_url) {
      window.location.href = form.success_action_json.redirect_url;
      return;
    }
    setDone(true);
  };

  if (done) {
    return <div className="text-center py-12">
      <div className="text-3xl mb-2">✓</div>
      <p className="text-lg">{form.success_action_json?.message ?? "Thanks — we'll be in touch."}</p>
    </div>;
  }

  if (!section) return <p>No fields configured.</p>;

  return (
    <div className="space-y-6">
      {totalSteps > 1 && (
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span>Step {step + 1} of {totalSteps}</span>
            <span>{progress}% Completed</span>
          </div>
          <div className="h-2 rounded bg-gray-200 overflow-hidden">
            <div className="h-full transition-all" style={{ width: `${progress}%`, background: accent ?? "#cfae70" }} />
          </div>
        </div>
      )}

      <div>
        <h3 className="text-lg font-semibold">{section.title}</h3>
        {section.description && <p className="text-sm text-gray-600 mt-1">{section.description}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {section.fields.map((f) => <FieldRenderer key={f.key} field={f} value={data[f.key]} onChange={(v) => setField(f.key, v)} />)}
      </div>

      {submitError && (
        <div role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          We couldn't submit your responses just now. Please try again in a moment.
        </div>
      )}

      <div className="flex justify-between pt-2">
        {step > 0 ? <Button variant="outline" onClick={() => setStep((s) => s - 1)}>Back</Button> : <div />}
        {step < totalSteps - 1 ? (
          <Button disabled={!requiredOk(section)} onClick={() => setStep((s) => s + 1)} style={{ background: accent }}>Next Step →</Button>
        ) : (
          <Button disabled={!requiredOk(section) || submitting} onClick={submit} style={{ background: accent }}>
            {submitting ? "Submitting…" : (schema.submit_label ?? "Submit")}
          </Button>
        )}
      </div>
    </div>
  );
}

function FieldRenderer({ field, value, onChange }: { field: GrowthField; value: any; onChange: (v: any) => void }) {
  const span = ["textarea","home_address","business_address","use_of_funds"].includes(field.type) || field.key.includes("address") ? "md:col-span-2" : "";
  return (
    <div className={span}>
      <label className="text-sm font-medium block mb-1">{field.label}{field.required && <span className="text-red-500">*</span>}</label>
      {field.type === "textarea" ? (
        <Textarea value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} />
      ) : field.type === "select" ? (
        <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
          <option value="">Select…</option>
          {field.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : field.type === "radio" ? (
        <div className="space-y-2 mt-1">
          {field.options?.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input type="radio" name={field.key} value={o} checked={value === o} onChange={() => onChange(o)} />{o}
            </label>
          ))}
        </div>
      ) : (
        <Input
          type={field.type === "ssn4" ? "text" : field.type === "currency" || field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "email" ? "email" : field.type === "tel" ? "tel" : "text"}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          maxLength={field.type === "ssn4" ? 4 : undefined}
          placeholder={field.placeholder}
        />
      )}
      {field.help && <p className="text-xs text-gray-500 mt-1">{field.help}</p>}
    </div>
  );
}
