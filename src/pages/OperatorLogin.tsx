/**
 * Operator Login — the God-tier entrance.
 * A dedicated, isolated sign-in for the platform operator (super-admin), kept
 * separate from the shared /auth door that every agency and coach uses. On
 * success it verifies platform-owner status and lands straight in the God
 * console; anyone who isn't an operator is routed to their normal home (the
 * God surfaces are RLS-gated regardless — this page is isolation, not the
 * security boundary). Route: /operator.
 */
import { useEffect, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { PaigeMark } from "@/components/brand/PaigeMark";
import { PLATFORM } from "@/lib/platform/identity";
import { resolveLandingRoute } from "@/lib/auth/resolveLandingRoute";

const GOD_CONSOLE = "/admin/platform/tenants";

export default function OperatorLogin() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [routing, setRouting] = useState(false);

  const routeAfterAuth = async (userId: string) => {
    setRouting(true);
    try {
      const { data: isOwner } = await supabase.rpc("is_platform_owner");
      if (isOwner === true) {
        navigate(GOD_CONSOLE, { replace: true });
        return;
      }
      // Authenticated, but not an operator — send them where they belong.
      const target = await resolveLandingRoute(userId);
      navigate(target, { replace: true });
    } catch {
      navigate("/app", { replace: true });
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // Defer per Supabase guidance (no awaiting Supabase inside the callback).
        window.setTimeout(() => void routeAfterAuth(session.user.id), 0);
      }
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) void routeAfterAuth(session.user.id);
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast({ title: "Enter your credentials", variant: "destructive" });
      return;
    }
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        toast({
          title: "Sign-in failed",
          description: error.message.includes("Invalid login credentials")
            ? "Invalid email or password."
            : error.message,
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
      // onAuthStateChange handles the operator routing.
    } catch (err) {
      toast({ title: "Sign-in failed", description: (err as Error).message, variant: "destructive" });
      setIsLoading(false);
    }
  };

  // Self-contained gold+indigo command aesthetic, isolated from the marketing
  // theme so the operator door reads as its own surface.
  const theme: CSSProperties = {
    background:
      "radial-gradient(900px 520px at 80% -10%, #1B1230, transparent 60%)," +
      "radial-gradient(700px 420px at 0% 8%, rgba(122,103,232,0.12), transparent 55%)," +
      "#0B0912",
    color: "#EDE8F6",
  };

  return (
    <div className="min-h-dvh flex items-center justify-center px-5 py-16" style={theme}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-8">
          <PaigeMark className="h-11 w-11 mb-4" />
          <div className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-[#EBB94C]">
            <ShieldCheck className="w-3.5 h-3.5" /> God View · Operator Access
          </div>
          <h1 className="text-2xl font-bold tracking-tight mt-2">{PLATFORM.name}</h1>
          <p className="text-sm text-[#A79EC2] mt-1.5">Sign in to the operator console.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-1.5">
            <Label htmlFor="op-email" className="text-xs text-[#A79EC2]">Email</Label>
            <Input
              id="op-email" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-white/5 border-white/10 text-[#EDE8F6] placeholder:text-[#766E90]"
              placeholder="you@paigeagent.ai" disabled={isLoading || routing}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="op-password" className="text-xs text-[#A79EC2]">Password</Label>
            <Input
              id="op-password" type="password" autoComplete="current-password" value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-white/5 border-white/10 text-[#EDE8F6] placeholder:text-[#766E90]"
              placeholder="••••••••" disabled={isLoading || routing}
            />
          </div>
          <Button
            type="submit"
            disabled={isLoading || routing}
            className="w-full bg-gradient-to-r from-[#EBB94C] to-[#F2CE77] text-[#1B1230] font-semibold hover:opacity-95"
          >
            {(isLoading || routing) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {routing ? "Entering console…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-6 text-center">
          <a href="/auth" className="text-xs text-[#766E90] hover:text-[#A79EC2] transition-colors">
            Coaches &amp; clients sign in at the standard entrance →
          </a>
        </div>
      </div>
    </div>
  );
}
