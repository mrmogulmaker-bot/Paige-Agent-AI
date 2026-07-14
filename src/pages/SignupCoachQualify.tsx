// Public qualify landing — shown after signup when a prospect qualifies for a
// concierge onboarding conversation. Soft handoff to a real coach before
// workspace access. Coaching-generic; no vertical-specific framing.
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { PageHead } from "@/components/seo/PageHead";

export default function SignupCoachQualify() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHead
        title="Let's talk first — Paige Agent AI"
        description="A goal at this level deserves a real plan. A coach will walk you through the right next move before you dive in."
        path="/signup/coach-qualify"
      />
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="font-[Playfair_Display] text-4xl md:text-5xl tracking-tight">
          You're aiming bigger. Let's talk first.
        </h1>
        <p className="mt-4 text-muted-foreground text-lg">
          A goal at this level doesn't get solved with a generic dashboard. Before you start running the
          workspace, a coach will walk you through what's actually possible — and what the right next
          move looks like for your specific practice.
        </p>

        <div className="mt-8 rounded-xl border border-border bg-card p-6 space-y-3">
          <h2 className="font-semibold">What happens next</h2>
          <ol className="list-decimal list-inside text-sm text-muted-foreground space-y-2">
            <li>Your information was just sent to our sales team.</li>
            <li>A coach will reach out within one business day to set up a short call.</li>
            <li>If we're a fit, you'll get full workspace access right after that conversation.</li>
          </ol>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/app">Continue to your dashboard</Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-10">
          Questions in the meantime? Just reply to the welcome email — we'll get right back to you.
        </p>
      </div>
    </div>
  );
}
