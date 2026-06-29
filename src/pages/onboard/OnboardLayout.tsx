import { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useOnboardingClient } from "./useOnboardingClient";
import "./onboard-theme.css";

const STEP_TO_PATH: Record<string, string> = {
  invited: "/onboard/welcome",
  signing_agreement: "/onboard/agreement",
  accepting_payment: "/onboard/payment",
  completing_intake: "/onboard/intake",
  uploading_docs: "/onboard/documents",
  completed: "/onboard/complete",
};

export default function OnboardLayout() {
  const { loading, error, client, userEmail, refresh } = useOnboardingClient();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (loading || !client) return;
    const expected = STEP_TO_PATH[client.onboarding_stage ?? "invited"] ?? "/onboard/welcome";
    // Only redirect if user is on the bare /onboard or stepping out of order.
    if (location.pathname === "/onboard" || location.pathname === "/onboard/") {
      navigate(expected, { replace: true });
    }
  }, [loading, client, location.pathname, navigate]);

  if (loading) {
    return (
      <div className="onboard-shell">
        <div className="onboard-container">
          <div className="onboard-card p-10 text-center">Loading your onboarding…</div>
        </div>
      </div>
    );
  }

  if (error === "not_authenticated") {
    return (
      <div className="onboard-shell">
        <div className="onboard-container">
          <div className="onboard-card p-10 text-center space-y-3">
            <h1 className="text-xl font-semibold">Please sign in</h1>
            <p className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>
              Use the magic link in the welcome email Antonio sent you.
            </p>
            <a className="underline" href="/auth">Go to sign in</a>
          </div>
        </div>
      </div>
    );
  }

  if (error === "no_client_record" || !client) {
    return (
      <div className="onboard-shell">
        <div className="onboard-container">
          <div className="onboard-card p-10 text-center space-y-3">
            <h1 className="text-xl font-semibold">We can't find your account yet</h1>
            <p className="text-sm" style={{ color: "rgba(8,20,40,0.7)" }}>
              Your coach hasn't activated your onboarding yet, or the email on your account
              ({userEmail ?? "—"}) doesn't match our records. Please reply to your welcome
              email and we'll sort it out.
            </p>
            <button className="underline" onClick={refresh}>Try again</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="onboard-shell">
      <div className="onboard-container">
        <Outlet context={{ client, refresh }} />
      </div>
    </div>
  );
}
