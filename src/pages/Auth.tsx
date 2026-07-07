import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Shield, TrendingUp, Zap, ChevronRight, Eye, EyeOff } from "lucide-react";
import { z } from "zod";
import type { User, Session } from "@supabase/supabase-js";
import paigeLogo from "@/assets/paige-logo-transparent.png";
import { signInWithOAuth } from "@/integrations/auth/oauth";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";
import { ForgotPasswordDialog } from "@/components/auth/ForgotPasswordDialog";
import { signUpWithReferral } from "@/lib/signUpWithReferral";
import { trackEvent } from "@/hooks/useAnalytics";
import { resolveLandingRoute, clearClientViewOverride } from "@/lib/auth/resolveLandingRoute";
import { isSafeRedirectPath } from "@/lib/auth/safeRedirect";
import { useRequiredSignupDocs, recordAcceptances } from "@/lib/legal/useLegalDocuments";

const authSchema = z.object({
  email: z.string().trim().email({ message: "Invalid email address" }),
  password: z.string().min(6, { message: "Password must be at least 6 characters" }),
  fullName: z.string().trim().min(2, { message: "Full name must be at least 2 characters" }).optional(),
});

const Auth = () => {
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get("mode") !== "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [consentAgreements, setConsentAgreements] = useState(false);
  const [consentDataUsage, setConsentDataUsage] = useState(false);
  const [consentMarketing, setConsentMarketing] = useState(false);
  const { docs: requiredDocs } = useRequiredSignupDocs();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    setIsLogin(searchParams.get("mode") !== "signup");
  }, [searchParams]);

  const redirectByRole = async (userId: string) => {
    // Always clear any "preview as client" override on a fresh login so role
    // redirects aren't suppressed by a stale flag from a previous session.
    clearClientViewOverride();

    // Honor ?next= for invite acceptance flows (e.g. /join/:token).
    // Strict allowlist guard mitigates open-redirect / XSS-via-redirect.
    const nextParam = searchParams.get("next");
    if (nextParam && isSafeRedirectPath(nextParam)) {
      navigate(nextParam, { replace: true });
      return;
    }

    // broker_team_member needs the active_broker_id side-effect before routing.
    try {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      const roleList = (roles || []).map((r: any) => r.role);
      if (roleList.includes("broker_team_member")) {
        try {
          const { data: tm } = await supabase.rpc("get_broker_team_member", {
            _auth_user_id: userId,
          });
          const parentId = (tm as any)?.[0]?.broker_id;
          if (parentId) localStorage.setItem("active_broker_id", parentId);
        } catch {
          /* non-blocking */
        }
      }
    } catch {
      /* non-blocking */
    }

    const target = await Promise.race<string>([
      resolveLandingRoute(userId),
      new Promise<string>((resolve) => setTimeout(() => resolve("/app"), 4000)),
    ]);
    navigate(target, { replace: true });
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          // Supabase warns against awaiting/querying Supabase from inside the
          // auth callback; defer role resolution so login cannot deadlock.
          window.setTimeout(() => {
            void redirectByRole(session.user.id);
          }, 0);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        void redirectByRole(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const validationData = isLogin
        ? { email, password }
        : { email, password, fullName };

      authSchema.parse(validationData);

      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          let description = error.message;
          if (error.message.includes("Invalid login credentials")) {
            description = "Invalid email or password. Please try again.";
          } else if (error.message.includes("password") && error.message.includes("breach")) {
            description = "This password has been found in a data breach. Please use a different password.";
          }
          toast({ title: "Login failed", description, variant: "destructive" });
          return;
        }
        toast({ title: "Welcome back!", description: "You've successfully logged in." });
      } else {
        if (!consentAgreements || !consentDataUsage) {
          toast({
            title: "Consent required",
            description: "Please confirm both required consent checkboxes to create your account.",
            variant: "destructive",
          });
          return;
        }

        const consentTimestamp = new Date().toISOString();

        const { data: signUpData, error } = await signUpWithReferral({
          email,
          password,
          fullName,
          redirectTo: `${window.location.origin}/app`,
          extraData: {
            // Main front door is the BUSINESS/tenant entry. Members sign up via
            // their coach's tenant-scoped link (/join/:slug), not here.
            signup_intent: "business",
            consent_agreements: true,
            consent_data_usage: true,
            consent_marketing: consentMarketing,
            consent_timestamp: consentTimestamp,
            accepted_doc_versions: requiredDocs.map((d) => ({ slug: d.slug, version: d.version })),
          },
        });

        if (error) {
          let title = "Error";
          let description = error.message;
          if (error.message.includes("User already registered")) {
            title = "Account exists";
            description = "An account with this email already exists. Please login instead.";
          } else if (error.message.includes("password") && error.message.includes("breach")) {
            title = "Unsafe password";
            description = "This password has appeared in a known data breach. Please choose a stronger, unique password.";
          }
          toast({ title, description, variant: "destructive" });
          return;
        }

        void trackEvent("signup_complete", "activation", { method: "email" });

        // Persist consent on the profile (non-blocking)
        if (signUpData?.user?.id) {
          const userId = signUpData.user.id;
          supabase
            .from("profiles")
            .update({
              consent_privacy_policy: true,
              consent_data_usage: true,
              consent_marketing: consentMarketing,
              consent_timestamp: consentTimestamp,
            })
            .eq("user_id", userId)
            .then(({ error: pErr }) => {
              if (pErr) console.warn("Consent persist failed:", pErr);
            });

          // Append-only audit row per required document.
          if (requiredDocs.length) {
            recordAcceptances(
              userId,
              requiredDocs.map((d) => ({
                slug: d.slug,
                version: d.version,
                context: { source: "signup", marketing_opt_in: consentMarketing },
              }))
            ).catch((err) => console.warn("Acceptance log failed:", err));
          }
        }

        // Send welcome email
        supabase.functions.invoke("send-transactional-email", {
          body: {
            templateName: "welcome",
            recipientEmail: email,
            idempotencyKey: `welcome-${email}-${Date.now()}`,
            templateData: { name: fullName },
          },
        }).catch(err => console.warn("Welcome email failed:", err));

        toast({
          title: "Account created!",
          description: "Welcome! Redirecting to your dashboard...",
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({ title: "Validation error", description: error.issues[0].message, variant: "destructive" });
      } else {
        toast({ title: "Error", description: "An unexpected error occurred. Please try again.", variant: "destructive" });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    try {
      void trackEvent("signup_cta_click", "acquisition", { method: "google" });
      const result = await signInWithOAuth("google", `${window.location.origin}/app`);
      if (result.error) {
        toast({ title: "Google sign-in failed", description: String(result.error), variant: "destructive" });
      }
      if (result.redirected) return;
    } catch (error) {
      toast({ title: "Error", description: "Failed to sign in with Google.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setIsLoading(true);
    try {
      const result = await signInWithOAuth("apple", `${window.location.origin}/app`);
      if (result.error) {
        toast({ title: "Apple sign-in failed", description: String(result.error), variant: "destructive" });
      }
      if (result.redirected) return;
    } catch (error) {
      toast({ title: "Error", description: "Failed to sign in with Apple.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleMode = () => {
    const newMode = isLogin ? "signup" : "login";
    navigate(`/auth?mode=${newMode}`, { replace: true });
  };

  const features = [
    { icon: Shield, title: "Bank-Grade Security", desc: "256-bit encryption protects your data" },
    { icon: TrendingUp, title: "Credit Intelligence", desc: "AI-powered insights across all 3 bureaus" },
    { icon: Zap, title: "Funding Readiness", desc: "Real-time score banks actually use" },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      <ForgotPasswordDialog open={showForgotPassword} onOpenChange={setShowForgotPassword} />

      {/* Left Panel — Brand / Value Prop */}
      <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden bg-primary flex-col justify-between p-10">
        {/* Decorative Elements */}
        <div className="absolute inset-0">
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: `linear-gradient(hsl(var(--accent)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--accent)) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }} />
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-accent/10 blur-3xl animate-float" />
          <div className="absolute bottom-20 -left-20 w-80 h-80 rounded-full bg-gold/8 blur-3xl animate-float-slow" />
          <div className="absolute top-1/2 right-1/4 w-48 h-48 rounded-full bg-accent/5 blur-2xl animate-float-delayed" />
          <div className="absolute top-0 right-0 w-px h-full bg-gradient-to-b from-transparent via-accent/20 to-transparent" style={{ transform: 'translateX(-120px)' }} />
        </div>

        {/* Top — Logo */}
        <div className="relative z-10">
          <Link to="/" className="inline-flex items-center gap-3 group">
            <img src={paigeLogo} alt="PaigeAgent.ai" className="h-10 w-auto" />
            <span className="text-xl font-bold text-primary-foreground/90 tracking-tight">PaigeAgent.ai</span>
          </Link>
        </div>

        {/* Center — Hero Message */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/10 border border-accent/20">
              <div className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              <span className="text-xs font-medium text-accent tracking-wide uppercase">AI-Powered Platform</span>
            </div>
            <h2 className="text-4xl xl:text-5xl font-bold text-primary-foreground leading-[1.1] tracking-tight">
              Build credit that
              <br />
              <span className="text-accent">opens doors.</span>
            </h2>
            <p className="text-primary-foreground/60 text-base max-w-md leading-relaxed">
              The intelligent platform that transforms your credit profile into a powerful financial asset.
            </p>
          </div>

          {/* Feature pills */}
          <div className="space-y-3">
            {features.map((f, i) => (
              <div
                key={i}
                className="flex items-center gap-4 p-4 rounded-xl bg-primary-foreground/[0.04] border border-primary-foreground/[0.06] backdrop-blur-sm transition-all duration-300 hover:bg-primary-foreground/[0.07] group"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <f.icon className="w-5 h-5 text-accent" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-primary-foreground/90">{f.title}</p>
                  <p className="text-xs text-primary-foreground/45 mt-0.5">{f.desc}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-primary-foreground/20 group-hover:text-accent/60 transition-colors" />
              </div>
            ))}
          </div>
        </div>

        {/* Bottom — Social proof */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              {['bg-accent/60', 'bg-gold/60', 'bg-accent/40', 'bg-gold/40'].map((bg, i) => (
                <div key={i} className={`w-8 h-8 rounded-full ${bg} border-2 border-primary flex items-center justify-center`}>
                  <span className="text-[10px] font-bold text-primary-foreground/80">
                    {['JD', 'AK', 'MR', 'TS'][i]}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-xs font-medium text-primary-foreground/70">Trusted by 2,400+ members</p>
              <p className="text-[11px] text-primary-foreground/40">Average 47-point score increase</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel — Auth Form */}
      <div className="flex-1 flex flex-col">
        {/* Top nav */}
        <div className="flex items-center justify-between px-6 sm:px-10 py-5">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Back to home</span>
          </Link>
          <Link to="/" className="lg:hidden inline-flex items-center gap-2">
            <img src={paigeLogo} alt="PaigeAgent.ai" className="h-8 w-auto" />
            <span className="text-lg font-bold text-accent">PaigeAgent.ai</span>
          </Link>
          <button
            type="button"
            onClick={toggleMode}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            disabled={isLoading}
          >
            {isLogin ? "Create account" : "Sign in"}
            <ChevronRight className="w-3.5 h-3.5 inline ml-0.5" />
          </button>
        </div>

        {/* Form Area */}
        <div className="flex-1 flex items-center justify-center px-6 sm:px-10 pb-10">
          <div className="w-full max-w-[400px] space-y-8">
            {/* Heading */}
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
                {isLogin ? "Welcome back" : "Start your free trial"}
              </h1>
              <p className="text-muted-foreground text-sm">
                {isLogin
                  ? "Enter your credentials to access your dashboard"
                  : "14 days free — no credit card required"}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Full Name
                  </Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    disabled={isLoading}
                    className="h-12 bg-muted/50 border-border/60 focus:border-accent focus:ring-accent/20 transition-all placeholder:text-muted-foreground/40"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Email Address
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="h-12 bg-muted/50 border-border/60 focus:border-accent focus:ring-accent/20 transition-all placeholder:text-muted-foreground/40"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    Password
                  </Label>
                  {isLogin && (
                    <button
                      type="button"
                      onClick={() => setShowForgotPassword(true)}
                      className="text-xs text-accent hover:text-accent/80 font-medium transition-colors"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={isLoading}
                    minLength={6}
                    className="h-12 bg-muted/50 border-border/60 focus:border-accent focus:ring-accent/20 transition-all placeholder:text-muted-foreground/40 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {!isLogin && <PasswordStrengthIndicator password={password} />}
              </div>

              {!isLogin && (
                <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <Checkbox
                      checked={consentAgreements}
                      onCheckedChange={(v) => setConsentAgreements(!!v)}
                      className="mt-0.5"
                      aria-required
                    />
                    <span className="text-xs text-foreground/85 leading-relaxed">
                      I have read and agree to the PaigeAgent{" "}
                      <Link to="/legal/terms" target="_blank" className="underline text-accent hover:opacity-80">
                        Terms of Service
                      </Link>
                      ,{" "}
                      <Link to="/legal/privacy" target="_blank" className="underline text-accent hover:opacity-80">
                        Privacy Policy
                      </Link>
                      ,{" "}
                      <Link to="/legal/esign" target="_blank" className="underline text-accent hover:opacity-80">
                        E-Sign Consent
                      </Link>
                      , and{" "}
                      <Link to="/legal/ai-disclaimer" target="_blank" className="underline text-accent hover:opacity-80">
                        AI Advisory Disclaimer
                      </Link>
                      .{" "}<span className="text-destructive">*</span>
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <Checkbox
                      checked={consentDataUsage}
                      onCheckedChange={(v) => setConsentDataUsage(!!v)}
                      className="mt-0.5"
                      aria-required
                    />
                    <span className="text-xs text-foreground/85 leading-relaxed">
                      I understand that my financial data is used exclusively to provide my
                      PaigeAgent services and is{" "}
                      <strong>never sold to third parties, lenders, or advertisers</strong>.{" "}
                      <span className="text-destructive">*</span>
                    </span>
                  </label>

                  <label className="flex items-start gap-2.5 cursor-pointer">
                    <Checkbox
                      checked={consentMarketing}
                      onCheckedChange={(v) => setConsentMarketing(!!v)}
                      className="mt-0.5"
                    />
                    <span className="text-xs text-foreground/70 leading-relaxed">
                      I agree to receive marketing communications about PaigeAgent products and
                      updates. <em>(Optional — uncheck to receive only service notifications)</em>
                    </span>
                  </label>
                </div>
              )}

              <Button
                type="submit"
                className={`w-full font-semibold text-sm h-12 rounded-xl transition-all duration-300 ${
                  isLogin
                    ? "bg-primary hover:bg-primary-light text-primary-foreground shadow-md hover:shadow-lg"
                    : "bg-gradient-gold text-primary shadow-glow hover:shadow-glow-lg hover:scale-[1.01]"
                }`}
                disabled={isLoading || (!isLogin && (!consentAgreements || !consentDataUsage))}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isLogin ? "Signing in..." : "Creating account..."}
                  </>
                ) : (
                  <>{isLogin ? "Sign In" : "Get Started Free"}</>
                )}
              </Button>
            </form>

            {/* OAuth Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-4 text-xs text-muted-foreground/60">
                  or continue with
                </span>
              </div>
            </div>

            {/* OAuth Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="h-11 text-sm border-border/60 hover:border-accent/40 transition-all gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Google
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleAppleSignIn}
                disabled={isLoading}
                className="h-11 text-sm border-border/60 hover:border-accent/40 transition-all gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
                Apple
              </Button>
            </div>

            {/* Mode Toggle Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-border/40" />
              </div>
              <div className="relative flex justify-center">
                <span className="bg-background px-4 text-xs text-muted-foreground/60">
                  {isLogin ? "New to PaigeAgent?" : "Already have an account?"}
                </span>
              </div>
            </div>

            {/* Toggle */}
            <Button
              type="button"
              variant="outline"
              onClick={toggleMode}
              disabled={isLoading}
              className="w-full h-11 text-sm border-border/60 text-muted-foreground hover:text-foreground hover:border-accent/40 transition-all"
            >
              {isLogin ? "Create a free account" : "Sign in instead"}
            </Button>

            {/* Team Login hint */}
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground/40">
              <Shield className="w-3 h-3" />
              <span>Team member? Use your admin credentials above — you'll be routed automatically.</span>
            </div>

            {/* Legal */}
            <p className="text-center text-[11px] text-muted-foreground/50 leading-relaxed">
              By continuing you agree to our{" "}
              <Link to="/terms" className="underline hover:text-muted-foreground transition-colors">Terms</Link>
              {" "}and{" "}
              <Link to="/privacy" className="underline hover:text-muted-foreground transition-colors">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Auth;
