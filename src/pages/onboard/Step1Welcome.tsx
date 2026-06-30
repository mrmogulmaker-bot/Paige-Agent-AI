import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { OnboardClient } from "./useOnboardingClient";
import { advanceOnboardingStage } from "./useOnboardingClient";

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

export default function Step1Welcome() {
  const { client, refresh } = useOutletContext<Ctx>();
  const navigate = useNavigate();

  const begin = async () => {
    await advanceOnboardingStage(client.id, "signing_agreement");
    await refresh();
    navigate("/onboard/agreement");
  };

  return (
    <>
      <ProgressHeader
        stepIndex={0}
        title={`Welcome, ${client.first_name ?? "there"}.`}
        subtitle="Your BUILD-to-FUND workspace is ready. This onboarding takes about 15 minutes — sign your agreement, confirm payment, share a few details, and you're in."
      />
      <div className="onboard-card p-8 space-y-6">
        <div>
          <div className="text-xs uppercase tracking-wide" style={{ color: "rgba(8,20,40,0.5)" }}>Account on file</div>
          <div className="text-lg font-medium">{`${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "—"}</div>
          <div className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>{client.email}</div>
          {client.entity_name && (
            <div className="text-sm mt-1" style={{ color: "rgba(8,20,40,0.7)" }}>Entity: {client.entity_name}</div>
          )}
        </div>

        <div className="rounded-lg p-4" style={{ background: "rgba(207,174,112,0.12)", border: "1px solid rgba(207,174,112,0.35)" }}>
          <div className="font-semibold mb-1">What's next</div>
          <ol className="text-sm space-y-1 list-decimal list-inside" style={{ color: "rgba(8,20,40,0.78)" }}>
            <li>Review and electronically sign your service agreement</li>
            <li>Confirm your payment plan and authorize billing</li>
            <li>Complete your intake (about you, your business, your current state)</li>
            <li>Upload your government ID and any documents you already have</li>
            <li>Step into your workspace and meet your coach</li>
          </ol>
        </div>

        <div className="flex justify-end">
          <Button onClick={begin}>Begin onboarding</Button>
        </div>
      </div>
    </>
  );
}
