import { useOutletContext, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { usePlaybook } from "@/lib/playbook";
import type { OnboardClient } from "./useOnboardingClient";

type Ctx = { client: OnboardClient; refresh: () => void };

export default function Step6Complete() {
  const { client } = useOutletContext<Ctx>();
  const navigate = useNavigate();
  const pb = usePlaybook();
  const phases = pb.journey.map((stage) => stage.label);

  return (
    <>
      <div className="mb-6">
        <span className="onboard-step-chip">Step 6 of 6 · Complete</span>
        <h1 className="onboard-h1">You're all set, {client.first_name ?? "there"}.</h1>
        <p className="onboard-sub">Your journey starts now. Your coach has been notified.</p>
      </div>
      <div className="onboard-card p-8 space-y-6">
        <div>
          <div className="text-xs uppercase tracking-wide mb-2" style={{ color: "rgba(8,20,40,0.5)" }}>
            Your journey
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {phases.map((p, i) => (
              <div key={p} className="flex items-center gap-2">
                <div
                  className="px-3 py-1 rounded-full text-xs"
                  style={{
                    background: i === 0 ? "#cfae70" : "rgba(8,20,40,0.06)",
                    color: i === 0 ? "#081428" : "rgba(8,20,40,0.7)",
                  }}
                >
                  {p}
                </div>
                {i < phases.length - 1 && <span style={{ color: "rgba(8,20,40,0.3)" }}>→</span>}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg p-5" style={{ background: "rgba(207,174,112,0.10)", border: "1px solid rgba(207,174,112,0.35)" }}>
          <div className="font-semibold mb-1">What happens next</div>
          <ul className="text-sm space-y-1 list-disc list-inside" style={{ color: "rgba(8,20,40,0.78)" }}>
            <li>Your coach reviews your intake within 1 business day</li>
            <li>Your first education email lands in your inbox in ~4 days</li>
            <li>Your first checklist appears in your workspace</li>
          </ul>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => navigate("/app")}>Enter your workspace</Button>
        </div>
      </div>
    </>
  );
}
