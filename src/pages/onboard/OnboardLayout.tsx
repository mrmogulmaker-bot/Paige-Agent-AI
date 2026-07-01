import { useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useOnboardingClient } from "./useOnboardingClient";
import { supabase } from "@/integrations/supabase/client";
import "./onboard-theme.css";

// Pre-portal onboarding is now two steps: welcome + agreement. Everything else
// (intake, docs, etc.) happens inside /workspace under Paige's guidance.
const STAGE_ORDER = ["invited", "signing_agreement"] as const;

const STEP_TO_PATH: Record<string, string> = {
  invited: "/onboard/welcome",
  signing_agreement: "/onboard/agreement",
};

const POST_AGREEMENT_STAGES = new Set([
  "accepting_payment",
  "completing_intake",
  "uploading_docs",
  "completed",
]);

const PATH_TO_STAGE: Record<string, string> = Object.fromEntries(
  Object.entries(STEP_TO_PATH).map(([s, p]) => [p, s]),
);

// Legacy / alias paths from older emails and earlier builds. Anything that
// used to be a post-agreement step now resolves to the workspace so clients
// don't get parked in a pre-portal dead end.
const LEGACY_PATH_ALIASES: Record<string, string> = {
  "/onboard": "/onboard/welcome",
  "/onboard/start": "/onboard/welcome",
  "/onboard/begin": "/onboard/welcome",
  "/onboard/sign": "/onboard/agreement",
  "/onboard/contract": "/onboard/agreement",
  "/onboard/terms": "/onboard/agreement",
  "/onboard/pay": "/workspace",
  "/onboard/payment": "/workspace",
  "/onboard/checkout": "/workspace",
  "/onboard/billing": "/workspace",
  "/onboard/form": "/workspace",
  "/onboard/intake": "/workspace",
  "/onboard/questionnaire": "/workspace",
  "/onboard/profile": "/workspace",
  "/onboard/upload": "/workspace",
  "/onboard/documents": "/workspace",
  "/onboard/docs": "/workspace",
  "/onboard/files": "/workspace",
  "/onboard/complete": "/workspace",
  "/onboard/done": "/workspace",
  "/onboard/finish": "/workspace",
  "/onboard/success": "/workspace",
};


export default function OnboardLayout() {
  const { loading, error, client, userEmail, refresh } = useOnboardingClient();
  const navigate = useNavigate();
  const location = useLocation();

  // Self-heal deep links: any /onboard/* hit with a known client gets
  // normalized to the right step.
  //   1. Legacy alias (/onboard/sign → /onboard/agreement)
  //   2. Bare or unknown /onboard path → canonical step for current stage
  //   3. URL is AHEAD of the user's actual stage → push back to current step
  //      (URLs BEHIND the current stage are allowed for review).
  useEffect(() => {
    if (loading || !client) return;
    const path = (location.pathname.replace(/\/+$/, "") || "/onboard");

    const aliasTarget = LEGACY_PATH_ALIASES[path];
    if (aliasTarget && aliasTarget !== path) {
      navigate(aliasTarget + location.search + location.hash, { replace: true });
      return;
    }

    const stage = client.onboarding_stage ?? "invited";
    const expected = STEP_TO_PATH[stage] ?? "/onboard/welcome";
    const currentStage = PATH_TO_STAGE[path];

    if (path === "/onboard" || (path.startsWith("/onboard/") && !currentStage)) {
      navigate(expected + location.search + location.hash, { replace: true });
      return;
    }

    if (currentStage) {
      const urlIdx = STAGE_ORDER.indexOf(currentStage as (typeof STAGE_ORDER)[number]);
      const stageIdx = STAGE_ORDER.indexOf(stage as (typeof STAGE_ORDER)[number]);
      if (urlIdx > stageIdx && expected !== path) {
        navigate(expected + location.search + location.hash, { replace: true });
      }
    }
  }, [loading, client, location.pathname, location.search, location.hash, navigate]);

  // If we land on /onboard with an authed session but no client record yet,
  // trigger the server-side self-heal RPC once. Covers legacy invites where
  // the client role / linked_user_id wasn't backfilled.
  useEffect(() => {
    if (loading || error !== "no_client_record") return;
    (async () => {
      try {
        const { data: healed } = await supabase.rpc("ensure_client_role_self_heal");
        const row = Array.isArray(healed) ? healed[0] : healed;
        if (row?.healed) refresh();
      } catch {
        /* ignore — UI will keep showing the no_client_record card */
      }
    })();
  }, [loading, error, refresh]);

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
