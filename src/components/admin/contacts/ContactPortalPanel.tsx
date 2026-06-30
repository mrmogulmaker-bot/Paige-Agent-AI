import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, RefreshCw, CheckCircle2, Clock, AlertCircle, FileSignature, LogIn } from "lucide-react";
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
  const [busy, setBusy] = useState<"invite" | "agreement" | null>(null);

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
        body: { client_id: contactId, email, created_via: "admin_ui" },
      });
      if (error) throw error;
      toast.success("Portal invite sent");
      await load();
    } catch (e: any) {
      toast.error(e.message || "Invite failed");
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

  return (
    <div className="space-y-3">
      {/* Portal Access */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <LogIn className="h-4 w-4" /> Portal Access
          </CardTitle>
          {linkedUserId ? (
            <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Linked</Badge>
          ) : inviteStatus === "pending" ? (
            <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" /> Invite pending</Badge>
          ) : inviteStatus === "expired" ? (
            <Badge variant="outline" className="gap-1 text-amber-600"><AlertCircle className="h-3 w-3" /> Expired</Badge>
          ) : (
            <Badge variant="outline">Not invited</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {linkedUserId ? (
            <div className="text-sm text-muted-foreground">
              This contact has accepted their invite and can access their workspace.
            </div>
          ) : (
            <>
              <div className="text-sm text-muted-foreground">
                Send a secure, white-labeled invite link to <span className="font-medium">{email || "—"}</span>. Link is valid for 7 days.
              </div>
              <Button onClick={sendInvite} disabled={!email || busy === "invite"}>
                {latestInvite ? <RefreshCw className="h-4 w-4 mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                {busy === "invite" ? "Sending…" : latestInvite ? "Resend invite" : "Send portal invite"}
              </Button>
            </>
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
    </div>
  );
}
