import { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
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

/**
 * Step 3 — Payment authorization.
 *
 * v0 stub: confirms the plan summary and records the authorization manually so
 * Jacqueline (who paid Antonio outside the system) can be onboarded this week.
 * Stripe Elements + SetupIntent + Subscription wiring lands in v1 once Antonio
 * confirms the three Stripe price IDs (pay_in_full, split, get_started).
 */
export default function Step3Payment() {
  const { client, refresh } = useOutletContext<Ctx>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  const proceed = async () => {
    if (!acknowledged) return;
    setBusy(true);
    try {
      // v0: advance stage; do not insert paige_payment_authorizations until Stripe is wired.
      await advanceOnboardingStage(client.id, "completing_intake");
      await refresh();
      navigate("/onboard/intake");
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message || String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <ProgressHeader
        stepIndex={2}
        title="Confirm your payment plan"
        subtitle="We'll get card-on-file billing live shortly. For now your coach has the plan on record."
      />
      <div className="onboard-card p-8 space-y-6">
        <div className="rounded-lg p-5" style={{ background: "rgba(207,174,112,0.10)", border: "1px solid rgba(207,174,112,0.35)" }}>
          <div className="text-xs uppercase tracking-wide" style={{ color: "rgba(8,20,40,0.5)" }}>Program tuition</div>
          <div className="text-2xl font-semibold mt-1">BUILD-to-FUND — $4,997</div>
          <div className="text-sm mt-2" style={{ color: "rgba(8,20,40,0.72)" }}>
            Your coach will confirm your exact schedule (pay-in-full, split, or get-started) and
            send you a secure card-on-file link in the next 24 hours. No charge happens on this screen.
          </div>
        </div>

        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-1"
          />
          <span>
            I understand my coach will reach out to confirm my payment plan and that recurring
            billing requires my separate written authorization.
          </span>
        </label>

        <div className="flex justify-end">
          <Button onClick={proceed} disabled={!acknowledged || busy}>
            {busy ? "Saving…" : "Continue to intake"}
          </Button>
        </div>
      </div>
    </>
  );
}
