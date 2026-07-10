/**
 * /portal/:tenantSlug — the tenant-branded gateway a CUSTOMER returns to.
 *
 * A signed-out customer has no session, so we resolve the tenant's public brand
 * by slug (peek_tenant_portal_brand) and wear it here: their coach's logo, name,
 * and color — never the Paige platform page (§6/§9). This surface is both:
 *   • where customer sign-out lands them ("signed out — log back in"), and
 *   • the durable "log back in" page they can bookmark.
 *
 * Sign-in only. A tenant's customers are created by invite (/join/:token), so
 * there is no self-serve signup here — just email + password back into /app.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Eye, EyeOff } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { readableTextOn } from "@/lib/brand/contrast";
import { resolveLandingRoute } from "@/lib/auth/resolveLandingRoute";
import { cachePortalSlug } from "@/lib/auth/signOut";

interface PortalBrand {
  tenant_name: string;
  tenant_slug: string;
  logo_url: string | null;
  primary_color: string | null;
}

export default function PortalGateway() {
  const { tenantSlug = "" } = useParams<{ tenantSlug: string }>();
  const [brand, setBrand] = useState<PortalBrand | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  // If a customer is already signed in, don't show a login wall — route them in.
  // Keep the spinner up until this settles so an authed visitor never sees a
  // flash of the sign-in form on their bookmarked gateway.
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled) return;
      if (data.user) {
        const target = await resolveLandingRoute(data.user.id);
        if (!cancelled) window.location.replace(target);
        return; // leave checkingAuth true — we're navigating away
      }
      setCheckingAuth(false);
    }).catch(() => { if (!cancelled) setCheckingAuth(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    setNotFound(false);
    (async () => {
      try {
        const { data, error } = await supabase.rpc("peek_tenant_portal_brand", { _slug: tenantSlug });
        if (cancelled) return;
        if (error) throw error;
        const row = Array.isArray(data) ? (data[0] as PortalBrand | undefined) : (data as PortalBrand | null);
        if (!row) {
          setNotFound(true);
        } else {
          setBrand(row);
          // Remember this tenant so involuntary logouts (session expiry) can
          // still return the customer here instead of the Paige page (§9).
          cachePortalSlug(row.tenant_slug);
        }
      } catch {
        // Transient RPC/network failure is not a bad slug. Don't tell a customer
        // with a valid bookmark that their link is invalid — offer a retry.
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tenantSlug, reloadKey]);

  const brandColor = brand?.primary_color || "#CFAE70";
  const btnStyle = { backgroundColor: brandColor, color: readableTextOn(brandColor) };
  // Hold the spinner until BOTH the brand peek and the auth probe settle, so an
  // already-authed visitor never sees a flash of the sign-in form.
  const busy = loading || checkingAuth;

  const signIn = async () => {
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return toast.error("Enter a valid email address");
    if (!password) return toast.error("Enter your password");
    setSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email: em, password });
      if (error) throw error;
      if (!data.user) throw new Error("Could not sign you in — please try again.");
      const target = await resolveLandingRoute(data.user.id);
      window.location.assign(target);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in");
      setSubmitting(false);
    }
  };

  const sendReset = async () => {
    const em = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) return toast.error("Enter your email above first, then tap reset");
    setSendingReset(true);
    try {
      // Route to the real recovery handler (which renders the set-new-password
      // form), carrying the tenant slug so the reset stays under the coach's
      // brand and returns here when done. Sending them straight back to /portal
      // would consume the one-time token without ever letting them set a password.
      const redirectTo = `${window.location.origin}/reset-password?portal=${encodeURIComponent(tenantSlug)}`;
      const { error } = await supabase.auth.resetPasswordForEmail(em, { redirectTo });
      if (error) throw error;
      toast.success("Check your email for a link to reset your password.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset email");
    } finally {
      setSendingReset(false);
    }
  };

  const title = busy
    ? "Loading…"
    : loadError || notFound
      ? "Client Portal"
      : `Welcome back to ${brand?.tenant_name}`;

  const description = busy
    ? " "
    : loadError
      ? "We couldn't load this page. Check your connection and try again."
      : notFound
        ? "This portal link isn't valid. Please use the link your provider gave you, or the invitation email they sent."
        : "Sign in to open your private client portal.";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <Helmet>
        <title>{brand ? `${brand.tenant_name} — Client Portal` : "Client Portal"}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          {busy ? null : brand?.logo_url ? (
            <img src={brand.logo_url} alt={brand.tenant_name} className="h-12 w-auto mx-auto mb-3 object-contain" />
          ) : brand ? (
            <div
              className="h-12 w-12 rounded-lg mx-auto mb-3 flex items-center justify-center text-xl font-semibold"
              style={{ backgroundColor: brandColor, color: readableTextOn(brandColor) }}
            >
              {brand.tenant_name.charAt(0).toUpperCase()}
            </div>
          ) : null}
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {busy ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : loadError ? (
            <Button onClick={() => setReloadKey((k) => k + 1)} className="w-full" style={btnStyle}>
              Try again
            </Button>
          ) : notFound ? null : (
            <>
              <div className="space-y-2">
                <Label htmlFor="portal-email">Email</Label>
                <Input
                  id="portal-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={submitting}
                  autoComplete="email"
                  onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="portal-pw">Password</Label>
                <div className="relative">
                  <Input
                    id="portal-pw"
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={submitting}
                    autoComplete="current-password"
                    className="pr-10"
                    onKeyDown={(e) => { if (e.key === "Enter") signIn(); }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((s) => !s)}
                    aria-label={showPw ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <Button onClick={signIn} disabled={submitting} className="w-full" style={btnStyle}>
                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Sign in
              </Button>
              <button
                type="button"
                disabled={sendingReset}
                onClick={sendReset}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                {sendingReset ? "Sending reset link…" : "Forgot your password?"}
              </button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
