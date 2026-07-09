// Front-door signup — /signup
//
// This is where a NEW business owner (coach · consultant · agency · advisor)
// starts their own Paige workspace. Signup provisions a brand-new TENANT and
// makes the signer its owner (provision_tenant RPC), then drops them into their
// own tenant admin. It is deliberately NOT the consumer/client intake — a
// tenant's own customers join only through an invite link their tenant sends.
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { signInWithOAuth } from "@/integrations/auth/oauth";
import { signUpWithReferral } from "@/lib/signUpWithReferral";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHead } from "@/components/seo/PageHead";
import {
  CommunicationsConsent, EMPTY_COMMS_CONSENT, type CommsConsentState,
} from "@/components/legal/CommunicationsConsent";
import { recordCommsConsent } from "@/lib/legal/recordCommsConsent";
import { Loader2 } from "lucide-react";

const TEAM_SIZES = ["Just me", "2–5", "6–20", "21+"] as const;

export default function PublicSignup() {
  const { toast } = useToast();

  // Phase: 'auth' (create account) → 'profile' (name the business) → provisioning.
  const [phase, setPhase] = useState<"auth" | "profile">("auth");
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [commsConsent, setCommsConsent] = useState<CommsConsentState>(EMPTY_COMMS_CONSENT);

  // Business profile — the seed of the new tenant.
  const [businessName, setBusinessName] = useState("");
  const [industry, setIndustry] = useState("");
  const [teamSize, setTeamSize] = useState<string>("");
  const [about, setAbout] = useState("");
  const [creating, setCreating] = useState(false);

  // If already signed in, skip straight to naming the workspace.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: s }) => {
      if (!mounted) return;
      if (s.session?.user) {
        setPhase("profile");
        if (s.session.user.email && !email) setEmail(s.session.user.email);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) setPhase("profile");
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSso = async (provider: "google" | "apple") => {
    setAuthBusy(true);
    try {
      const result = await signInWithOAuth(provider, window.location.origin + "/signup");
      if (result.error) {
        toast({ title: "Sign-in failed", description: String(result.error.message || result.error), variant: "destructive" });
        setAuthBusy(false);
      }
      // On redirect the browser leaves; the auth listener returns us to 'profile'.
    } catch (e) {
      toast({ title: "Sign-in failed", description: (e as Error).message, variant: "destructive" });
      setAuthBusy(false);
    }
  };

  const handleEmailAuth = async () => {
    setAuthBusy(true);
    try {
      if (authMode === "signup") {
        const { error } = await signUpWithReferral({
          email, password, fullName, redirectTo: window.location.origin + "/signup",
        });
        if (error) throw error;
        await recordCommsConsent({ email, source: "tenant_signup", consent: commsConsent });
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session?.user) {
          setPhase("profile");
        } else {
          toast({
            title: "Check your email",
            description: "We sent a confirmation link. Click it, then come back to name your workspace.",
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setPhase("profile");
      }
    } catch (e) {
      toast({ title: "Couldn't continue", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAuthBusy(false);
    }
  };

  const createWorkspace = async () => {
    if (businessName.trim().length < 2) {
      toast({ title: "Name your business", description: "This becomes your workspace.", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        toast({ title: "Session expired", description: "Sign back in to finish.", variant: "destructive" });
        setPhase("auth");
        return;
      }
      const { error } = await supabase.rpc("provision_tenant", {
        _name: businessName.trim(),
        _industry: industry.trim() || null,
        _team_size: teamSize || null,
        _description: about.trim() || null,
      });
      if (error) throw error;
      toast({ title: "Workspace ready", description: "Welcome to Paige — this is yours to run." });
      // The owner was just granted the admin role + active tenant mid-session.
      // Hard-navigate so the route guards and tenant context reload fresh and
      // see them (a client-side navigate could read a login-time role cache).
      window.location.assign("/admin");
    } catch (e) {
      toast({ title: "Couldn't create your workspace", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHead
        title="Start your practice on Paige"
        description="Spin up your own client workspace — Paige runs the follow-ups, onboarding, and daily brief so you get your time back."
        path="/signup"
      />
      <div className="max-w-xl mx-auto px-6 py-12">
        <header className="mb-8">
          <h1 className="font-[Playfair_Display] text-4xl md:text-5xl tracking-tight">
            {phase === "auth" ? "Give your practice its own Paige." : "Name your workspace."}
          </h1>
          <p className="mt-3 text-muted-foreground">
            {phase === "auth"
              ? "One workspace to run your clients — onboarding, follow-ups, and the daily brief. Set it up in under two minutes."
              : "This is the business Paige runs for you. You can invite your team and add sub-accounts once you're in."}
          </p>
        </header>

        {phase === "auth" && (
          <div className="rounded-xl border border-border bg-card p-6 md:p-8 space-y-5">
            <div className="space-y-3">
              <Button onClick={() => handleSso("google")} disabled={authBusy} className="w-full h-11" variant="outline">
                Continue with Google
              </Button>
              <Button onClick={() => handleSso("apple")} disabled={authBusy} className="w-full h-11" variant="outline">
                Continue with Apple
              </Button>
            </div>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-3 text-muted-foreground">or use email</span>
              </div>
            </div>

            <div className="space-y-3">
              {authMode === "signup" && (
                <div className="space-y-1.5">
                  <Label>Your name</Label>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@domain.com" />
              </div>
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
              </div>

              {authMode === "signup" && (
                <CommunicationsConsent value={commsConsent} onChange={setCommsConsent} showSms={false} />
              )}

              <Button onClick={handleEmailAuth} disabled={authBusy || !email || !password} className="w-full h-11">
                {authBusy ? "Working…" : authMode === "signup" ? "Create account" : "Sign in"}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                {authMode === "signup" ? (
                  <>Already have a workspace?{" "}
                    <button className="underline" onClick={() => setAuthMode("signin")}>Sign in</button>
                  </>
                ) : (
                  <>New here?{" "}
                    <button className="underline" onClick={() => setAuthMode("signup")}>Create your workspace</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {phase === "profile" && (
          <div className="rounded-xl border border-border bg-card p-6 md:p-8 space-y-5">
            <div className="space-y-1.5">
              <Label>Business / practice name *</Label>
              <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Acme Advisory" autoFocus />
              <p className="text-xs text-muted-foreground">This names your workspace and your clients' portal.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>What do you do?</Label>
                <Input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Coaching, consulting, agency…" />
              </div>
              <div className="space-y-1.5">
                <Label>Team size</Label>
                <Select value={teamSize} onValueChange={setTeamSize}>
                  <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                  <SelectContent>
                    {TEAM_SIZES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>In a sentence, who do you help? (optional)</Label>
              <Textarea rows={2} value={about} onChange={(e) => setAbout(e.target.value)}
                placeholder="I help early-stage founders build repeatable sales systems." />
              <p className="text-xs text-muted-foreground">Paige uses this to tailor your workspace. You can refine it later.</p>
            </div>
            <Button onClick={createWorkspace} disabled={creating || businessName.trim().length < 2} className="w-full h-11">
              {creating ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating your workspace…</> : "Create my workspace"}
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-8 text-center">
          By continuing you agree to our <a href="/terms" className="underline">Terms</a> and{" "}
          <a href="/privacy" className="underline">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}
