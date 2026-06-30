import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Send,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileSignature,
  LogIn,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

type Invite = {
  id: string;
  email: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  created_via: string;
};

type Envelope = {
  id: string;
  envelope_id: string;
  envelope_type: string;
  status: string;
  sent_at: string;
  signed_at: string | null;
  completed_pdf_url: string | null;
};

export function ContactPortalPanel({
  contactId,
  email,
  linkedUserId,
}: {
  contactId: string;
  email: string | null;
  linkedUserId: string | null;
}) {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [busy, setBusy] = useState<"invite" | "revoke" | "agreement" | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [localLinkedUserId, setLocalLinkedUserId] = useState<string | null>(linkedUserId);

  useEffect(() => { setLocalLinkedUserId(linkedUserId); }, [linkedUserId]);

  const load = async () => {
    const [{ data: inv }, { data: env }] = await Promise.all([
      supabase.from("btf_workspace_invites").select("*").eq("client_id", contactId).order("created_at", { ascending: false }),
      supabase.from("paige_signature_envelopes").select("*").eq("contact_id", contactId).order("sent_at", { ascending: false }),
    ]);
    setInvites((inv as Invite[]) || []);
    setEnvelopes((env as Envelope[]) || []);
  };

  useEffect(() => { load(); }, [contactId]);

  const sendInvite = async () => {
    if (!email) return toast.error("Contact needs an email address first");
    setBusy("invite");
    try {
      const { data, error } = await supabase.functions.invoke("invite-btf-client", {
        body: {
          paige_client_id: contactId,
          contact_email: email,
        },
      });
      if (error) throw error;
      if (data && (data as any).ok === false) {
        throw new Error((data as any).error || "Invite failed");
      }
      toast.success(
        (data as any)?.email_sent === false
          ? "Invite created — email delivery pending"
          : "Paige access invite sent",
      );
      await load();
    } catch (e: any) {
      toast.error(e.message || "Invite failed");
    } finally {
      setBusy(null);
    }
  };

  const cancelPendingInvites = async () => {
    setBusy("revoke");
    try {
      const nowIso = new Date().toISOString();
      const { error } = await supabase
        .from("btf_workspace_invites")
        .update({ expires_at: nowIso })
        .eq("client_id", contactId)
        .is("used_at", null)
        .gt("expires_at", nowIso);
      if (error) throw error;
      toast.success("Pending invite canceled");
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Could not cancel invite");
    } finally {
      setBusy(null);
    }
  };

  const revokeAccess = async () => {
    if (!localLinkedUserId) return;
    setBusy("revoke");
    try {
      // keep_contact: true — strips their auth login + roles but preserves CRM history
      const { data, error } = await supabase.functions.invoke("admin-delete-user", {
        body: { user_id: localLinkedUserId, keep_contact: true },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Paige access revoked. CRM history preserved.");
      setLocalLinkedUserId(null);
      setConfirmRevoke(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || "Revoke failed");
    } finally {
      setBusy(null);
    }
  };

  const latestInvite = invites[0];
  const inviteStatus = latestInvite
    ? latestInvite.used_at ? "accepted"
    : new Date(latestInvite.expires_at) < new Date() ? "expired"
    : "pending"
    : "none";

  const hasAccess = Boolean(localLinkedUserId);

  return (
    <div className="space-y-3">
      {/* Paige AI Platform Access — explicit grant/revoke switch */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <LogIn className="h-4 w-4" /> Paige AI Platform Access
          </CardTitle>
          {hasAccess ? (
            <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Active</Badge>
          ) : inviteStatus === "pending" ? (
            <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Invite pending</Badge>
          ) : inviteStatus === "expired" ? (
            <Badge variant="outline" className="gap-1 text-amber-600"><AlertCircle className="h-3 w-3" /> Expired</Badge>
          ) : (
            <Badge variant="outline">No access</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/40 p-3">
            <div className="space-y-1">
              <div className="text-sm font-medium">Grant client-side Paige access</div>
              <div className="text-xs text-muted-foreground">
                When ON, this contact gets their own scoped workspace and can only see <strong>their own</strong> account, businesses, documents, and Paige conversations. Staff continue to see this contact through the admin workspace.
              </div>
            </div>
            <Switch
              checked={hasAccess || inviteStatus === "pending"}
              disabled={!email || busy !== null}
              onCheckedChange={(next) => {
                if (next) {
                  sendInvite();
                } else if (hasAccess) {
                  setConfirmRevoke(true);
                }
              }}
              aria-label="Toggle Paige AI platform access"
            />
          </div>

          {hasAccess ? (
            <div className="text-xs text-muted-foreground">
              This client signed in and is connected to their workspace. Toggle off to revoke their login while keeping CRM history intact.
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={sendInvite}
                disabled={!email || busy === "invite"}
              >
                {latestInvite ? <RefreshCw className="h-3.5 w-3.5 mr-2" /> : <Send className="h-3.5 w-3.5 mr-2" />}
                {busy === "invite" ? "Sending…" : latestInvite ? "Resend invite" : "Send invite"}
              </Button>
              {!email && <span className="text-xs text-muted-foreground">Add an email to send.</span>}
            </div>
          )}

          {invites.length > 0 && (
            <div className="border-t pt-3">
              <div className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Invite history</div>
              <div className="space-y-1.5">
                {invites.slice(0, 5).map(inv => (
                  <div key={inv.id} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {inv.email} · sent {formatDistanceToNow(new Date(inv.created_at), { addSuffix: true })}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {inv.used_at ? "accepted" : new Date(inv.expires_at) < new Date() ? "expired" : "pending"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agreements */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <FileSignature className="h-4 w-4" /> Agreements
          </CardTitle>
          <Badge variant="secondary">{envelopes.length}</Badge>
        </CardHeader>
        <CardContent>
          {envelopes.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-4">
              No agreements sent yet. (Send-agreement flow wires into PaigeSign envelopes — coming next.)
            </div>
          ) : (
            <div className="space-y-2">
              {envelopes.map(e => (
                <div key={e.id} className="flex items-center justify-between border border-border rounded p-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium capitalize">{e.envelope_type.replace("_", " ")}</div>
                    <div className="text-xs text-muted-foreground">
                      Sent {formatDistanceToNow(new Date(e.sent_at), { addSuffix: true })}
                      {e.signed_at && <> · Signed {formatDistanceToNow(new Date(e.signed_at), { addSuffix: true })}</>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={e.status === "completed" ? "default" : "secondary"} className="text-[10px] capitalize">
                      {e.status}
                    </Badge>
                    {e.completed_pdf_url && (
                      <Button variant="ghost" size="sm" className="h-7" onClick={() => window.open(e.completed_pdf_url!, "_blank")}>
                        View PDF
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmRevoke} onOpenChange={setConfirmRevoke}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <ShieldOff className="h-4 w-4 text-destructive" />
              Revoke Paige access?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This removes their login + any staff roles immediately. Their CRM history (deals, notes, documents, activities) stays intact under this contact. You can re-invite them anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === "revoke"}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); revokeAccess(); }}
              disabled={busy === "revoke"}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {busy === "revoke" ? "Revoking…" : "Revoke access"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
