import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, Shield, TrendingUp, Zap, ChevronRight } from "lucide-react";
import { z } from "zod";
import type { User, Session } from "@supabase/supabase-js";
import paigeLogo from "@/assets/paige-logo-transparent.png";

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
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    setIsLogin(searchParams.get("mode") !== "signup");
  }, [searchParams]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) navigate("/app");
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) navigate("/app");
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
          toast({
            title: "Login failed",
            description: error.message.includes("Invalid login credentials")
              ? "Invalid email or password. Please try again."
              : error.message,
            variant: "destructive",
          });
          return;
        }
        toast({ title: "Welcome back!", description: "You've successfully logged in." });
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/app`,
            data: { full_name: fullName },
          },
        });

        if (error) {
          toast({
            title: error.message.includes("User already registered") ? "Account exists" : "Error",
            description: error.message.includes("User already registered")
              ? "An account with this email already exists. Please login instead."
              : error.message,
            variant: "destructive",
          });
          return;
        }

        toast({
          title: "Account created!",
          description: "Setting up your 14-day free trial...",
        });

        setTimeout(async () => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
              toast({ title: "Error", description: "Session not found. Please login to continue.", variant: "destructive" });
              return;
            }
            const { data, error } = await supabase.functions.invoke('create-trial-checkout', {
              headers: { Authorization: `Bearer ${session.access_token}` },
            });
            if (error) throw error;
            if (data?.url) window.location.href = data.url;
          } catch (error) {
            console.error('Trial setup error:', error);
            toast({ title: "Error", description: "Failed to set up trial. Please contact support.", variant: "destructive" });
          }
        }, 1000);
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

  const toggleMode = () => {
    const newMode = isLogin ? "signup" : "login";
    navigate(`/auth?mode=${newMode}`, { replace: true });
  };

  const features = [
    { icon: Shield, title: "Bank-Grade Security", desc: "256-bit encryption protects your data" },
    { icon: TrendingUp, title: "Credit Intelligence", desc: "AI-powered insights across all 3 bureaus" },
    { icon: Zap, title: "Automated Disputes", desc: "Smart dispute letters generated instantly" },
  ];

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left Panel — Brand / Value Prop */}
      <div className="hidden lg:flex lg:w-[48%] relative overflow-hidden bg-primary flex-col justify-between p-10">
        {/* Decorative Elements */}
        <div className="absolute inset-0">
          {/* Grid pattern */}
          <div className="absolute inset-0 opacity-[0.04]" style={{
            backgroundImage: `linear-gradient(hsl(var(--accent)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--accent)) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }} />
          {/* Gradient orbs */}
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-accent/10 blur-3xl animate-float" />
          <div className="absolute bottom-20 -left-20 w-80 h-80 rounded-full bg-gold/8 blur-3xl animate-float-slow" />
          <div className="absolute top-1/2 right-1/4 w-48 h-48 rounded-full bg-accent/5 blur-2xl animate-float-delayed" />
          {/* Diagonal accent line */}
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
              {[
                'bg-accent/60',
                'bg-gold/60',
                'bg-accent/40',
                'bg-gold/40',
              ].map((bg, i) => (
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
          {/* Mobile logo */}
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
                <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  minLength={6}
                  className="h-12 bg-muted/50 border-border/60 focus:border-accent focus:ring-accent/20 transition-all placeholder:text-muted-foreground/40"
                />
              </div>

              <Button
                type="submit"
                className={`w-full font-semibold text-sm h-12 rounded-xl transition-all duration-300 ${
                  isLogin
                    ? "bg-primary hover:bg-primary-light text-primary-foreground shadow-md hover:shadow-lg"
                    : "bg-gradient-gold text-primary shadow-glow hover:shadow-glow-lg hover:scale-[1.01]"
                }`}
                disabled={isLoading}
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

            {/* Divider */}
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
