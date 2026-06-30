// Public signup wizard — /signup
// No auth gate. SSO + email/password, then multi-step business data wizard.
// On submit: client mirror + sales_dept.handle_new_lead via complete-signup edge function.
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { signUpWithReferral } from "@/lib/signUpWithReferral";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageHead } from "@/components/seo/PageHead";
import {
  CommunicationsConsent,
  EMPTY_COMMS_CONSENT,
  type CommsConsentState,
} from "@/components/legal/CommunicationsConsent";
import { recordCommsConsent } from "@/lib/legal/recordCommsConsent";

type WizardData = {
  full_legal_name: string;
  preferred_name: string;
  date_of_birth: string;
  personal_phone: string;
  entity_status: "have_entity" | "no_entity_yet" | "";
  entity_name: string;
  entity_structure: string;
  entity_state: string;
  formation_date: string;
  ein: string;
  business_address: string;
  business_phone: string;
  business_email: string;
  banking_relationship: string;
  banking_age_months: string;
  personal_credit_band: "excellent" | "good" | "fair" | "building" | "unsure" | "";
  funding_goal_usd: string;
  funding_timeline: string;
  existing_tradelines_count: string;
  industry: string;
  naics: string;
  w2_income_usd: string;
  credit_partner_available: "yes" | "no" | "unsure" | "";
  attribution_source: string;
};

const EMPTY: WizardData = {
  full_legal_name: "", preferred_name: "", date_of_birth: "", personal_phone: "",
  entity_status: "", entity_name: "", entity_structure: "", entity_state: "",
  formation_date: "", ein: "",
  business_address: "", business_phone: "", business_email: "",
  banking_relationship: "", banking_age_months: "",
  personal_credit_band: "",
  funding_goal_usd: "", funding_timeline: "",
  existing_tradelines_count: "", industry: "", naics: "", w2_income_usd: "",
  credit_partner_available: "",
  attribution_source: "",
};

const ATTRIBUTION_OPTIONS = [
  "Workshop Wednesday",
  "Launch Pad",
  "Skool Community",
  "Paid Ad",
  "Referral from a friend",
  "Found you directly",
  "Other",
];

const STORAGE_KEY = "paige_signup_wizard_draft_v1";

export default function PublicSignup() {
  const navigate = useNavigate();
  const { toast } = useToast();

  // Phase: 'auth' (gate) → 'wizard' → 'submitting'
  const [phase, setPhase] = useState<"auth" | "wizard">("auth");
  const [authMode, setAuthMode] = useState<"signup" | "signin">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [commsConsent, setCommsConsent] = useState<CommsConsentState>(EMPTY_COMMS_CONSENT);

  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...EMPTY, ...JSON.parse(raw) } : EMPTY;
    } catch { return EMPTY; }
  });
  const [submitting, setSubmitting] = useState(false);

  // Auto-detect session
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: s }) => {
      if (!mounted) return;
      if (s.session?.user) {
        setPhase("wizard");
        if (s.session.user.email && !email) setEmail(s.session.user.email);
        const meta = s.session.user.user_metadata as Record<string, unknown> | undefined;
        const metaName = typeof meta?.full_name === "string" ? meta.full_name : "";
        setData((d) => d.full_legal_name ? d : { ...d, full_legal_name: metaName });
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user) setPhase("wizard");
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist draft
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
  }, [data]);

  const update = <K extends keyof WizardData>(k: K, v: WizardData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  // ---------- AUTH HANDLERS ----------
  const handleSso = async (provider: "google" | "apple") => {
    setAuthBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin + "/signup",
      });
      if (result.error) {
        toast({ title: "Sign-in failed", description: String(result.error.message || result.error), variant: "destructive" });
        setAuthBusy(false);
      }
      // If redirected, browser leaves. Session listener will move us to wizard on return.
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
          email, password, fullName,
          redirectTo: window.location.origin + "/signup",
        });
        if (error) throw error;
        if (fullName) setData((d) => ({ ...d, full_legal_name: d.full_legal_name || fullName }));
        const { data: sess } = await supabase.auth.getSession();
        if (sess.session?.user) {
          setPhase("wizard");
        } else {
          toast({
            title: "Check your email",
            description: "We sent you a confirmation link. Once you click it, come back to finish your profile.",
          });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        setPhase("wizard");
      }
    } catch (e) {
      toast({ title: "Couldn't continue", description: (e as Error).message, variant: "destructive" });
    } finally {
      setAuthBusy(false);
    }
  };

  // ---------- WIZARD ----------
  const STEPS = useMemo(() => ([
    { title: "About You", description: "The basics — used for credit and identity matching later." },
    { title: "Your Entity", description: "Tell us what's already in place." },
    { title: "Business Setup", description: "Where it operates and how it banks." },
    { title: "Credit Snapshot", description: "A rough read so we don't waste your time." },
    { title: "Funding & Goals", description: "What you're trying to unlock — and when." },
    { title: "How You Found Us", description: "Last one. Then we'll route you to the right place." },
  ]), []);
  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  const canNext = () => {
    switch (step) {
      case 0: return data.full_legal_name.trim().length > 1;
      case 1: return data.entity_status !== "";
      default: return true;
    }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        toast({ title: "Session expired", description: "Sign back in to finish.", variant: "destructive" });
        setPhase("auth");
        return;
      }
      const { data: resp, error } = await supabase.functions.invoke("complete-signup", { body: data });
      if (error) throw error;
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      toast({ title: "You're in", description: "Routing you to the right next step." });
      const next = (resp as { next_path?: string })?.next_path || "/app";
      navigate(next);
    } catch (e) {
      toast({ title: "Couldn't complete signup", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- RENDER ----------
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PageHead
        title="Join Paige Agent AI — Let's see what's possible"
        description="Self-serve signup for the entrepreneurial operating system. Credit, capital, and execution — one connected growth engine."
        path="/signup"
      />
      <div className="max-w-2xl mx-auto px-6 py-12">
        <header className="mb-8">
          <h1 className="font-[Playfair_Display] text-4xl md:text-5xl tracking-tight">
            Let's see where you stand.
          </h1>
          <p className="mt-3 text-muted-foreground">
            Two minutes. No fluff. We'll figure out what's actually possible from here — and where to start.
          </p>
        </header>

        {phase === "auth" && (
          <div className="rounded-xl border border-border bg-card p-6 md:p-8 space-y-5">
            <div className="space-y-3">
              <Button
                onClick={() => handleSso("google")}
                disabled={authBusy}
                className="w-full h-11"
                variant="outline"
              >
                Continue with Google
              </Button>
              <Button
                onClick={() => handleSso("apple")}
                disabled={authBusy}
                className="w-full h-11"
                variant="outline"
              >
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
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Antonio Cook" />
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
              <Button onClick={handleEmailAuth} disabled={authBusy || !email || !password} className="w-full h-11">
                {authBusy ? "Working…" : authMode === "signup" ? "Create account & continue" : "Sign in & continue"}
              </Button>
              <div className="text-center text-sm text-muted-foreground">
                {authMode === "signup" ? (
                  <>Already have an account?{" "}
                    <button className="underline" onClick={() => setAuthMode("signin")}>Sign in</button>
                  </>
                ) : (
                  <>New here?{" "}
                    <button className="underline" onClick={() => setAuthMode("signup")}>Create an account</button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {phase === "wizard" && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
                <span>Step {step + 1} of {STEPS.length} · {STEPS[step].title}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{STEPS[step].description}</p>
            </div>

            <div className="rounded-xl border border-border bg-card p-6 md:p-8 space-y-5">
              {step === 0 && (
                <>
                  <Field label="Full legal name *">
                    <Input value={data.full_legal_name} onChange={(e) => update("full_legal_name", e.target.value)} />
                  </Field>
                  <Field label="Preferred name (what should we call you?)">
                    <Input value={data.preferred_name} onChange={(e) => update("preferred_name", e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Date of birth">
                      <Input type="date" value={data.date_of_birth} onChange={(e) => update("date_of_birth", e.target.value)} />
                    </Field>
                    <Field label="Personal phone">
                      <Input value={data.personal_phone} onChange={(e) => update("personal_phone", e.target.value)} placeholder="(555) 555-5555" />
                    </Field>
                  </div>
                </>
              )}

              {step === 1 && (
                <>
                  <Field label="Do you already have an entity? *">
                    <Select value={data.entity_status} onValueChange={(v) => update("entity_status", v as WizardData["entity_status"])}>
                      <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="have_entity">Yes — it's already formed</SelectItem>
                        <SelectItem value="no_entity_yet">Not yet — I need help forming one</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {data.entity_status === "have_entity" && (
                    <>
                      <Field label="Entity name">
                        <Input value={data.entity_name} onChange={(e) => update("entity_name", e.target.value)} />
                      </Field>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Structure">
                          <Select value={data.entity_structure} onValueChange={(v) => update("entity_structure", v)}>
                            <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="LLC">LLC</SelectItem>
                              <SelectItem value="S-Corp">S-Corp</SelectItem>
                              <SelectItem value="C-Corp">C-Corp</SelectItem>
                              <SelectItem value="Sole Prop">Sole Proprietor</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="State of formation">
                          <Input value={data.entity_state} onChange={(e) => update("entity_state", e.target.value)} placeholder="WY, DE, FL…" />
                        </Field>
                        <Field label="Formation date">
                          <Input type="date" value={data.formation_date} onChange={(e) => update("formation_date", e.target.value)} />
                        </Field>
                        <Field label="EIN (last 4 is fine for now)">
                          <Input value={data.ein} onChange={(e) => update("ein", e.target.value)} />
                        </Field>
                      </div>
                    </>
                  )}
                </>
              )}

              {step === 2 && (
                <>
                  <Field label="Business address (or 'need help')">
                    <Textarea rows={2} value={data.business_address} onChange={(e) => update("business_address", e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Business phone">
                      <Input value={data.business_phone} onChange={(e) => update("business_phone", e.target.value)} />
                    </Field>
                    <Field label="Business email">
                      <Input type="email" value={data.business_email} onChange={(e) => update("business_email", e.target.value)} />
                    </Field>
                    <Field label="Primary business bank">
                      <Input value={data.banking_relationship} onChange={(e) => update("banking_relationship", e.target.value)} placeholder="Chase, BoA, local credit union…" />
                    </Field>
                    <Field label="How old is that relationship (months)?">
                      <Input type="number" min={0} value={data.banking_age_months} onChange={(e) => update("banking_age_months", e.target.value)} />
                    </Field>
                  </div>
                </>
              )}

              {step === 3 && (
                <>
                  <Field label="Personal credit — your honest read">
                    <Select value={data.personal_credit_band} onValueChange={(v) => update("personal_credit_band", v as WizardData["personal_credit_band"])}>
                      <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="excellent">Excellent (740+)</SelectItem>
                        <SelectItem value="good">Good (680–739)</SelectItem>
                        <SelectItem value="fair">Fair (620–679)</SelectItem>
                        <SelectItem value="building">Building / under 620</SelectItem>
                        <SelectItem value="unsure">Not sure</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="How many active tradelines do you have?">
                    <Input type="number" min={0} value={data.existing_tradelines_count} onChange={(e) => update("existing_tradelines_count", e.target.value)} />
                  </Field>
                  <Field label="Got a credit partner / co-signer if needed?">
                    <Select value={data.credit_partner_available} onValueChange={(v) => update("credit_partner_available", v as WizardData["credit_partner_available"])}>
                      <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="yes">Yes</SelectItem>
                        <SelectItem value="no">No</SelectItem>
                        <SelectItem value="unsure">Not sure yet</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              )}

              {step === 4 && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Field label="Funding goal (USD)">
                      <Input type="number" min={0} value={data.funding_goal_usd} onChange={(e) => update("funding_goal_usd", e.target.value)} placeholder="50000" />
                    </Field>
                    <Field label="Timeline">
                      <Select value={data.funding_timeline} onValueChange={(v) => update("funding_timeline", v)}>
                        <SelectTrigger><SelectValue placeholder="When do you need it?" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0-30 days">Within 30 days</SelectItem>
                          <SelectItem value="30-90 days">30–90 days</SelectItem>
                          <SelectItem value="90-180 days">3–6 months</SelectItem>
                          <SelectItem value="6-12 months">6–12 months</SelectItem>
                          <SelectItem value="12+ months">Just planning ahead</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Industry">
                      <Input value={data.industry} onChange={(e) => update("industry", e.target.value)} />
                    </Field>
                    <Field label="NAICS (if you know it)">
                      <Input value={data.naics} onChange={(e) => update("naics", e.target.value)} />
                    </Field>
                    <Field label="W-2 income (USD/yr)">
                      <Input type="number" min={0} value={data.w2_income_usd} onChange={(e) => update("w2_income_usd", e.target.value)} />
                    </Field>
                  </div>
                </>
              )}

              {step === 5 && (
                <>
                  <Field label="How did you find us?">
                    <Select value={data.attribution_source} onValueChange={(v) => update("attribution_source", v)}>
                      <SelectTrigger><SelectValue placeholder="Choose one" /></SelectTrigger>
                      <SelectContent>
                        {ATTRIBUTION_OPTIONS.map((opt) => (
                          <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <p className="text-sm text-muted-foreground">
                    That's it. Hit <strong>Finish</strong> and we'll route you to the right starting point —
                    workspace if you're ready to move, or a quick coach conversation if your goal needs a real plan first.
                  </p>
                </>
              )}

              <div className="flex justify-between pt-3 border-t border-border">
                <Button variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                  Back
                </Button>
                {step < STEPS.length - 1 ? (
                  <Button onClick={() => setStep((s) => s + 1)} disabled={!canNext()}>
                    Continue
                  </Button>
                ) : (
                  <Button onClick={submit} disabled={submitting}>
                    {submitting ? "Submitting…" : "Finish"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground mt-8 text-center">
          By continuing you agree to our <a href="/terms" className="underline">Terms</a> and
          {" "}<a href="/privacy" className="underline">Privacy Policy</a>.
        </p>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
