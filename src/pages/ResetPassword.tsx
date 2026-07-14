import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import paigeLogo from "@/assets/paige-logo-transparent.png";
import { PasswordStrengthIndicator, MIN_PASSWORD_LENGTH } from "@/components/auth/PasswordStrengthIndicator";

interface PortalBrand {
  tenant_name: string;
  logo_url: string | null;
  primary_color: string | null;
}

const ResetPassword = () => {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const [searchParams] = useSearchParams();

  // When a customer resets from their tenant gateway, ?portal=<slug> keeps the
  // whole flow under the coach's brand — never the Paige platform (§9). The
  // "back" destination becomes /portal/<slug>, not /auth.
  const portalSlug = searchParams.get("portal");
  const [brand, setBrand] = useState<PortalBrand | null>(null);
  const backTarget = portalSlug ? `/portal/${encodeURIComponent(portalSlug)}` : "/auth";

  useEffect(() => {
    if (!portalSlug) return;
    let cancelled = false;
    supabase.rpc("peek_tenant_portal_brand", { _slug: portalSlug }).then(({ data }) => {
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (row) setBrand(row as PortalBrand);
    });
    return () => { cancelled = true; };
  }, [portalSlug]);

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    // Also check hash for type=recovery
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      toast({ title: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`, variant: "destructive" });
      return;
    }

    setIsLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        setIsSuccess(true);
        toast({ title: "Password updated!", description: "You can now sign in with your new password." });
        setTimeout(() => navigate(backTarget), 3000);
      }
    } catch {
      toast({ title: "Error", description: "Something went wrong.", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isRecovery && !window.location.hash.includes("type=recovery")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-4 max-w-md">
          {brand ? (
            brand.logo_url ? (
              <img src={brand.logo_url} alt={brand.tenant_name} className="h-12 w-auto mx-auto object-contain" />
            ) : null
          ) : !portalSlug ? (
            <img src={paigeLogo} alt="PaigeAgent.ai" className="h-12 w-auto mx-auto" />
          ) : null}
          <h1 className="text-2xl font-bold text-foreground">Invalid Reset Link</h1>
          <p className="text-muted-foreground text-sm">
            This link is invalid or has expired. Please request a new password reset.
          </p>
          <Button className="mt-4" onClick={() => navigate(backTarget)}>Back to Sign In</Button>
        </div>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <div className="text-center space-y-4 max-w-md">
          <CheckCircle2 className="h-16 w-16 text-accent mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Password Updated!</h1>
          <p className="text-muted-foreground text-sm">Redirecting you to sign in...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-[400px] space-y-8">
        <div className="flex items-center justify-center gap-3">
          {brand ? (
            brand.logo_url ? (
              <img src={brand.logo_url} alt={brand.tenant_name} className="h-10 w-auto object-contain" />
            ) : (
              <span className="text-xl font-bold text-foreground tracking-tight">{brand.tenant_name}</span>
            )
          ) : !portalSlug ? (
            <>
              <img src={paigeLogo} alt="PaigeAgent.ai" className="h-10 w-auto" />
              <span className="text-xl font-bold text-foreground tracking-tight">PaigeAgent.ai</span>
            </>
          ) : null}
        </div>

        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-bold text-foreground">Set New Password</h1>
          <p className="text-muted-foreground text-sm">Enter your new password below</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              New Password
            </Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              disabled={isLoading}
              className="h-12 bg-muted/50 border-border/60 focus:border-accent focus:ring-accent/20"
            />
            <PasswordStrengthIndicator password={password} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword" className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Confirm Password
            </Label>
            <Input
              id="confirmPassword"
              type="password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              disabled={isLoading}
              className="h-12 bg-muted/50 border-border/60 focus:border-accent focus:ring-accent/20"
            />
          </div>

          <Button type="submit" className="w-full h-12 rounded-xl font-semibold" disabled={isLoading}>
            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Updating...</> : "Update Password"}
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => navigate(backTarget)}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
