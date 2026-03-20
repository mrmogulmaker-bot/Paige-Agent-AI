import { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft } from "lucide-react";
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

  // Sync mode when search params change
  useEffect(() => {
    setIsLogin(searchParams.get("mode") !== "signup");
  }, [searchParams]);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          navigate("/app");
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        navigate("/app");
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

  return (
    <div className="min-h-screen flex flex-col bg-background relative overflow-hidden">
      {/* Background accents matching landing page */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-accent/5 to-background -z-10" />
      <div className="absolute top-20 right-1/4 w-72 h-72 bg-accent/10 rounded-full blur-3xl -z-10 animate-float" />
      <div className="absolute bottom-20 left-1/4 w-96 h-96 bg-gold/10 rounded-full blur-3xl -z-10 animate-float-slow" />

      {/* Top bar */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-4">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>
      </div>

      {/* Centered auth card */}
      <div className="flex-1 flex items-center justify-center px-4 pb-12">
        <div className="w-full max-w-md">
          {/* Logo & tagline */}
          <div className="text-center mb-8">
            <Link to="/" className="inline-flex items-center gap-2 mb-4">
              <img src={paigeLogo} alt="PaigeAgent.ai" className="h-12 w-auto" />
              <span className="text-2xl font-extrabold text-accent">PaigeAgent.ai</span>
            </Link>
            <h1 className="text-2xl font-bold text-foreground">
              {isLogin ? "Welcome back" : "Start Building Your Buying Power"}
            </h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {isLogin
                ? "Sign in to continue your credit journey"
                : "Create your free account — no credit card required"}
            </p>
          </div>

          <Card className="p-8 border-border shadow-card bg-card/80 backdrop-blur-sm">
            <form onSubmit={handleSubmit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  minLength={6}
                />
              </div>

              <Button
                type="submit"
                className={`w-full font-semibold text-base h-11 transition-all duration-300 ${
                  isLogin
                    ? "bg-primary hover:bg-primary-light text-primary-foreground"
                    : "bg-gradient-gold text-primary hover:shadow-glow-lg hover:scale-[1.02]"
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

            <div className="mt-6 text-center">
              <button
                type="button"
                onClick={toggleMode}
                className="text-sm text-muted-foreground hover:text-accent transition-colors"
                disabled={isLoading}
              >
                {isLogin
                  ? "Don't have an account? Sign up free"
                  : "Already have an account? Sign in"}
              </button>
            </div>
          </Card>

          {/* Trust footer */}
          <p className="text-center text-xs text-muted-foreground mt-6">
            By continuing you agree to our{" "}
            <Link to="/terms" className="underline hover:text-foreground">Terms of Service</Link>{" "}
            and{" "}
            <Link to="/privacy" className="underline hover:text-foreground">Privacy Policy</Link>.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
