/**
 * /join/:token — public landing page that accepts a workspace invite.
 *
 * Flow:
 *   1. Look up branding via peek_tenant_invite (public RPC, no consumption).
 *   2. If not signed in → bounce to /auth?next=/join/:token; after auth the
 *      user lands back here.
 *   3. Signed in → call accept_tenant_invite RPC, which adds tenant_members
 *      row + sets active_tenant_id. Route to /app.
 */
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, ShieldAlert } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ContextualConsentDialog } from "@/components/legal/ContextualConsentDialog";

const STAFF_ROLES = new Set([
  "admin","owner","super_admin","moderator","coach","sales_rep","broker","cs_rep","finance","viewer"
]);

interface PeekRow {
  tenant_id: string;
  tenant_name: string;
  tenant_slug: string;
  brand: { logo_url?: string | null; primary_color?: string | null } | null;
  kind: string;
  default_role: string;
  expires_at: string;
  is_valid: boolean;
}

export default function JoinWorkspace() {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [info, setInfo] = useState<PeekRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [userId, setUserId] = useState<string | undefined>(undefined);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentDone, setConsentDone] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id));
  }, []);

  const isStaffInvite = !!info && STAFF_ROLES.has(info.default_role);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error: e } = await supabase.rpc("peek_tenant_invite", { _token: token });
        if (e) throw e;
        const row = Array.isArray(data) ? (data[0] as PeekRow | undefined) : (data as PeekRow | null);
        if (cancelled) return;
        if (!row) {
          setError("This invite link is not valid.");
        } else {
          setInfo(row);
          if (!row.is_valid) setError("This invite has expired or been revoked.");
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load invite");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const accept = async () => {
    setAccepting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        const next = encodeURIComponent(`/join/${token}`);
        navigate(`/auth?next=${next}`);
        return;
      }
      // For staff invitations, capture the Workforce Confidentiality & GLBA
      // Safeguards Acknowledgment BEFORE granting access.
      if (isStaffInvite && !consentDone) {
        setUserId(auth.user.id);
        setConsentOpen(true);
        setAccepting(false);
        return;
      }
      const { error: e } = await supabase.rpc("accept_tenant_invite", { _token: token });
      if (e) throw e;
      toast.success(`Welcome to ${info?.tenant_name ?? "your workspace"}`);
      navigate("/app");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not accept invite");
    } finally {
      setAccepting(false);
    }
  };

  const brandColor = info?.brand?.primary_color || "#CFAE70";

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4 py-12">
      <Helmet>
        <title>{info ? `Join ${info.tenant_name}` : "Workspace invite"}</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          {info?.brand?.logo_url ? (
            <img
              src={info.brand.logo_url}
              alt={info.tenant_name}
              className="h-12 w-auto mx-auto mb-3 object-contain"
            />
          ) : (
            <div
              className="h-12 w-12 rounded-lg mx-auto mb-3 flex items-center justify-center text-white text-xl font-semibold"
              style={{ backgroundColor: brandColor }}
            >
              {(info?.tenant_name ?? "?").charAt(0).toUpperCase()}
            </div>
          )}
          <CardTitle>
            {loading
              ? "Loading invite…"
              : info
                ? `Join ${info.tenant_name}`
                : "Workspace invite"}
          </CardTitle>
          <CardDescription>
            {error
              ? error
              : info
                ? `You've been invited to join as a ${info.default_role}. Accept to access the workspace.`
                : "Checking your invitation…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <div className="flex justify-center py-4">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldAlert className="w-4 h-4 mt-0.5 text-destructive flex-shrink-0" />
              <span>Ask whoever sent you this link for a fresh invitation.</span>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <ShieldCheck className="w-4 h-4 mt-0.5 text-green-600 flex-shrink-0" />
                <span>
                  By accepting you agree to the workspace's terms and grant the admin access to
                  manage your membership.
                </span>
              </div>
              <Button
                onClick={accept}
                disabled={accepting || !info?.is_valid}
                className="w-full"
                style={{ backgroundColor: brandColor }}
              >
                {accepting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Accept invitation
              </Button>
            </>
          )}
        </CardContent>
      </Card>
      <ContextualConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        userId={userId}
        slug="workforce-acknowledgment"
        actionLabel="Acknowledge and join workspace"
        context={{ tenant_id: info?.tenant_id, role: info?.default_role, source: "join_workspace" }}
        onAccepted={() => {
          setConsentDone(true);
          // re-invoke accept now that consent is recorded
          setTimeout(() => void accept(), 50);
        }}
      />
    </div>
  );
}
