import { useEffect, useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
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

const CATEGORIES: { key: string; label: string; required?: boolean }[] = [
  { key: "id", label: "Government-issued photo ID", required: true },
  { key: "articles", label: "Articles of organization / incorporation" },
  { key: "ein_letter", label: "EIN confirmation letter" },
  { key: "bank_stmt", label: "Most recent bank statements" },
  { key: "credit_report", label: "Credit reports (personal or business)" },
  { key: "other", label: "Anything else relevant" },
];

interface UploadRow {
  id: string;
  category: string;
  original_filename: string | null;
  uploaded_at: string;
}

export default function Step5Documents() {
  const { client, refresh } = useOutletContext<Ctx>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [docs, setDocs] = useState<UploadRow[]>([]);
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    const { data } = await supabase
      .from("documents")
      .select("id, document_type, file_name, uploaded_at")
      .eq("client_id", client.id)
      .eq("bucket_name", "btf-onboarding")
      .order("uploaded_at", { ascending: false });
    setDocs(
      ((data as Array<{ id: string; document_type: string; file_name: string | null; uploaded_at: string }>) ?? []).map((d) => ({
        id: d.id,
        category: d.document_type,
        original_filename: d.file_name,
        uploaded_at: d.uploaded_at,
      })),
    );
  };
  useEffect(() => { reload(); }, [client.id]);

  const hasId = docs.some((d) => d.category === "id");

  const uploadFor = async (category: string, file: File) => {
    setBusy(true);
    try {
      const path = `${client.id}/uploads/${category}/${Date.now()}-${file.name}`;
      const { error: upErr } = await supabase.storage
        .from("btf-onboarding")
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.id) throw new Error("You must be signed in to upload documents.");
      const { error: insErr } = await supabase.from("documents").insert({
        user_id: user.id,
        client_id: client.id,
        document_type: category,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        mime_type: file.type,
        bucket_name: "btf-onboarding",
      });
      if (insErr) throw insErr;

      toast({ title: "Uploaded", description: file.name });
      await reload();
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };


  const finish = async () => {
    if (!hasId) {
      toast({ title: "ID required", description: "Please upload a government photo ID to continue.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      await advanceOnboardingStage(client.id, "completed", {
        onboarding_completed_at: new Date().toISOString(),
      });
      await refresh();
      navigate("/onboard/complete");
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ProgressHeader
        stepIndex={4}
        title="Upload your documents"
        subtitle="Photo ID is required. Everything else is optional now — you can drop the rest in your workspace later."
      />
      <div className="onboard-card p-8 space-y-6">
        {CATEGORIES.map((c) => {
          const myDocs = docs.filter((d) => d.category === c.key);
          return (
            <div key={c.key} className="space-y-2">
              <div className="flex justify-between items-baseline">
                <Label>{c.label}{c.required && <span className="text-red-600 ml-1">*</span>}</Label>
                <span className="text-xs" style={{ color: "rgba(8,20,40,0.5)" }}>
                  {myDocs.length} file{myDocs.length === 1 ? "" : "s"}
                </span>
              </div>
              <input
                type="file"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadFor(c.key, f);
                  e.target.value = "";
                }}
              />
              {myDocs.length > 0 && (
                <ul className="text-xs mt-1" style={{ color: "rgba(8,20,40,0.7)" }}>
                  {myDocs.map((d) => (
                    <li key={d.id}>• {d.original_filename ?? "(file)"} · {new Date(d.uploaded_at).toLocaleDateString()}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}

        <div className="flex justify-end pt-2">
          <Button onClick={finish} disabled={busy || !hasId}>
            {busy ? "Saving…" : "Finish onboarding"}
          </Button>
        </div>
      </div>
    </>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-sm font-medium">{children}</div>;
}
