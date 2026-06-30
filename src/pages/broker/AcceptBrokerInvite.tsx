// Broker team member invitation acceptance page.
// Validates the invitation_token from broker_team_members, then creates a
// Supabase auth user and links it back via auth_user_id. Redirects the new
// member into the parent broker's workspace.

import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck, AlertCircle, ArrowLeft } from "lucide-react";
import { PasswordStrengthIndicator } from "@/components/auth/PasswordStrengthIndicator";
import paigeLogo from "@/assets/paige-logo-transparent.png";
import { trackEvent } from "@/hooks/useAnalytics";
import { recordAcceptances } from "@/lib/legal/useLegalDocuments";

interface InviteRow {
  id: string;
  broker_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string;
  invitation_expires_at: string | null;
  business_name: string;
}

const roleLabel = (r: string) =>
  r === "lead_broker" ? "Lead Broker" : r === "advisor" ? "Advisor" : r === "assistant" ? "Assistant" : r;

const AcceptBrokerInvite = () => {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [invite, setInvite] = useState<InviteRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const validate = async () => {
      if (!token) {
        setError("This invitation link is missing its token.");
        setLoading(false);
        return;
      }
      // Public read by token via RPC fallback to direct query (RLS allows token match).
      // We use a service-side validation by querying broker_team_members joined to broker_profiles.
      const { data, error: qErr } = await supabase
        .from("broker_team_members")
        .select("id, broker_id, email, first_name, last_name, role, invitation_expires_at, status, broker_profiles!inner(business_name)")
        .eq("invitation_token", token)
        .maybeSingle();

      if (qErr || !data) {
        setError("This invitation link is invalid or has expired. Please ask your broker to send a new invitation.");
        setLoading(false);
        return;
      }
      const row = data as any;
      const expired = row.invitation_expires_at && new Date(row.invitation_expires_at) < new Date();
      if (expired || row.status === "active" || row.status === "removed") {
        setError("This invitation link is invalid or has expired. Please ask your broker to send a new invitation.");
        setLoading(false);
        return;
      }
      setInvite({
        id: row.id,
        broker_id: row.broker_id,
        email: row.email,
        first_name: row.first_name,
        last_name: row.last_name,
        role: row.role,
        invitation_expires_at: row.invitation_expires_at,
        business_name: row.broker_profiles?.business_name || "your broker",
      });
      setFirstName(row.first_name || "");
      setLastName(row.last_name || "");
      setLoading(false);
    };
    validate();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invite) return;
    if (password.length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    if (password !== confirmPassword) {
      toast({ title: "Passwords don't match", variant: "destructive" });
      return;
    }
    if (!agreed) {
      toast({ title: "Please accept the terms", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      // 1. Create auth user
      const { data: signUp, error: signUpErr } = await supabase.auth.signUp({
        email: invite.email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/broker/app`,
          data: {
            full_name: `${firstName} ${lastName}`.trim(),
            broker_team_member: true,
            broker_id: invite.broker_id,
          },
        },
      });

      if (signUpErr) {
        if (signUpErr.message.toLowerCase().includes("already registered")) {
          toast({
            title: "Account already exists",
            description: "Sign in with your existing password — we'll link this invite to that account.",
            variant: "destructive",
          });
        } else {
          toast({ title: "Could not create account", description: signUpErr.message, variant: "destructive" });
        }
        setSubmitting(false);
        return;
      }

      const authUserId = signUp.user?.id;
      if (!authUserId) {
        toast({ title: "Account creation failed", variant: "destructive" });
        setSubmitting(false);
        return;
      }

      // 2. Sign in immediately to obtain a session for the followup writes.
      if (!signUp.session) {
        await supabase.auth.signInWithPassword({ email: invite.email, password });
      }

      // 3. Link broker_team_members row → mark active.
      const { error: linkErr } = await supabase
        .from("broker_team_members")
        .update({
          auth_user_id: authUserId,
          status: "active",
          accepted_at: new Date().toISOString(),
          first_name: firstName,
          last_name: lastName,
          invitation_token: null,
          invitation_expires_at: null,
          last_sign_in_at: new Date().toISOString(),
        })
        .eq("id", invite.id);

      if (linkErr) {
        console.warn("[AcceptBrokerInvite] link failed", linkErr);
      }

      // 4. Tag user_roles with broker_team_member (best-effort).
      try {
        await supabase.from("user_roles").insert({
          user_id: authUserId,
          role: "broker_team_member" as any,
        });
      } catch (_) {}

      // 4b. Record Workforce Acknowledgment + Terms acceptances (audit trail).
      try {
        const { data: reqDocs } = await supabase
          .from("legal_documents")
          .select("slug, version")
          .in("slug", ["workforce-acknowledgment", "terms", "privacy", "esign", "ai-disclaimer"])
          .eq("is_current", true);
        if (reqDocs && reqDocs.length) {
          await recordAcceptances(
            authUserId,
            reqDocs.map((d: any) => ({
              slug: d.slug,
              version: d.version,
              context: {
                source: "broker_team_member_accept",
                broker_id: invite.broker_id,
                team_member_id: invite.id,
                role: invite.role,
              },
            }))
          );
        }
      } catch (e) {
        console.warn("[AcceptBrokerInvite] legal acceptance write failed", e);
      }

      // Analytics
      void trackEvent("broker_team_member_accepted", "engagement", {
        broker_id: invite.broker_id,
        team_member_id: invite.id,
        role: invite.role,
      });

      toast({
        title: `Welcome to ${invite.business_name}'s workspace`,
        description: "Your account is ready.",
      });
      navigate("/broker/app", { replace: true });
    } catch (err: any) {
      toast({ title: "Unexpected error", description: err?.message || "", variant: "destructive" });
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              <CardTitle>Invitation unavailable</CardTitle>
            </div>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link to="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to home
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <img src={paigeLogo} alt="PaigeAgent" className="h-12 w-auto" />
          <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Team invitation
          </Badge>
          <h1 className="text-2xl font-semibold tracking-tight">
            You've been invited to join{" "}
            <span className="text-primary">{invite.business_name}</span>'s workspace
          </h1>
          <p className="text-sm text-muted-foreground">
            as <span className="font-medium text-foreground">{roleLabel(invite.role)}</span>
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create your account</CardTitle>
            <CardDescription>
              You'll log in with the email below to access {invite.business_name}'s shared workspace.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={invite.email} disabled readOnly />
                <p className="text-[11px] text-muted-foreground">
                  Locked — your account is tied to the invited address.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
                {password.length > 0 && <PasswordStrengthIndicator password={password} />}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="flex items-start gap-2 pt-1">
                <Checkbox
                  id="terms"
                  checked={agreed}
                  onCheckedChange={(v) => setAgreed(!!v)}
                />
                <Label htmlFor="terms" className="text-xs leading-relaxed text-muted-foreground">
                  I agree to PaigeAgent's Terms and acknowledge that my activity in this workspace is
                  visible to {invite.business_name}.
                </Label>
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Create account &amp; enter workspace
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Already have a PaigeAgent account?{" "}
          <Link to="/auth" className="text-primary hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default AcceptBrokerInvite;
