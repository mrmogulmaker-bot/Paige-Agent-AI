import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { OnboardClient } from "./useOnboardingClient";
import { advanceOnboardingStage } from "./useOnboardingClient";

type Ctx = { client: OnboardClient; refresh: () => void };

const STEPS = ["Your info", "Agreement"];

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

export default function Step1Welcome() {
  const { client, refresh } = useOutletContext<Ctx>();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  const [firstName, setFirstName] = useState(client.first_name ?? "");
  const [lastName, setLastName] = useState(client.last_name ?? "");
  const [phone, setPhone] = useState<string>((client as any).phone ?? "");
  const [street, setStreet] = useState<string>((client as any).street_address ?? "");
  const [city, setCity] = useState<string>((client as any).city ?? "");
  const [stateRegion, setStateRegion] = useState<string>((client as any).state ?? "");
  const [zip, setZip] = useState<string>((client as any).zip_code ?? "");

  const canContinue =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    phone.trim().length >= 7 &&
    !busy;

  const begin = async () => {
    if (!canContinue) return;
    setBusy(true);
    try {
      const { error: updErr } = await supabase
        .from("clients")
        .update({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          phone: phone.trim() || null,
          street_address: street.trim() || null,
          city: city.trim() || null,
          state: stateRegion.trim() || null,
          zip_code: zip.trim() || null,
        })
        .eq("id", client.id);
      if (updErr) throw updErr;

      const { error } = await advanceOnboardingStage(client.id, "signing_agreement");
      if (error) throw error;
      await refresh();
      navigate("/onboard/agreement");
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save your info — please try again.");
      setBusy(false);
    }
  };

  return (
    <>
      <ProgressHeader
        stepIndex={0}
        title={`Welcome, ${client.first_name ?? "there"}.`}
        subtitle="Just two quick steps: confirm your personal information, then sign your service agreement. That's it — you'll go straight into your workspace and Paige will take it from there."
      />
      <div className="onboard-card p-6 sm:p-8 space-y-6">
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: "rgba(8,20,40,0.5)" }}>Account on file</div>
          <div className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>{client.email}</div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>First name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Last name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Phone number</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Street address <span className="text-xs" style={{ color: "rgba(8,20,40,0.5)" }}>(optional)</span></Label>
            <Input value={street} onChange={(e) => setStreet(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>City <span className="text-xs" style={{ color: "rgba(8,20,40,0.5)" }}>(optional)</span></Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>State <span className="text-xs" style={{ color: "rgba(8,20,40,0.5)" }}>(optional)</span></Label>
            <Input value={stateRegion} onChange={(e) => setStateRegion(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>ZIP <span className="text-xs" style={{ color: "rgba(8,20,40,0.5)" }}>(optional)</span></Label>
            <Input value={zip} onChange={(e) => setZip(e.target.value)} />
          </div>
        </div>

        <div className="rounded-lg p-4" style={{ background: "rgba(207,174,112,0.12)", border: "1px solid rgba(207,174,112,0.35)" }}>
          <div className="font-semibold mb-1">What happens next</div>
          <p className="text-sm" style={{ color: "rgba(8,20,40,0.78)" }}>
            Once you sign your agreement you'll be taken straight into your workspace. Paige will walk you through
            everything else — business info, credit uploads, and funding readiness — right inside your portal.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={begin} disabled={!canContinue}>{busy ? "Saving…" : "Continue to agreement"}</Button>
        </div>
      </div>
    </>
  );
}
