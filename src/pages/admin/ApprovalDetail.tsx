import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Send, Pencil, SkipForward, AlertTriangle } from "lucide-react";

export default function ApprovalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [approval, setApproval] = useState<any>(null);
  const [contact, setContact] = useState<any>(null);
  const [conversation, setConversation] = useState<any>(null);
  const [thread, setThread] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [escalationNote, setEscalationNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: row } = await supabase
        .from("paige_pending_approvals")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      setApproval(row);
      const draft = (row?.draft_content ?? {}) as any;
      setSubject(draft.subject ?? "");
      setBody(draft.body ?? draft.text ?? draft.html ?? "");

      if (row?.contact_id) {
        const { data: c } = await supabase
          .from("clients")
          .select("id, first_name, last_name, email, phone, lifecycle_stage")
          .eq("id", row.contact_id)
          .maybeSingle();
        setContact(c);
        const { data: t } = await supabase
          .from("paige_conversations")
          .select("id, channel, direction, subject, body, created_at")
          .eq("contact_id", row.contact_id)
          .order("created_at", { ascending: false })
          .limit(5);
        setThread((t as any) ?? []);
      }
      if (row?.conversation_id) {
        const { data: cv } = await supabase
          .from("paige_conversations")
          .select("*")
          .eq("id", row.conversation_id)
          .maybeSingle();
        setConversation(cv);
      }
    })();
  }, [id]);

  if (!approval) {
    return <div className="p-6 text-muted-foreground">Loading…</div>;
  }

  const channel: "email" | "sms" =
    (approval.draft_content?.channel as any) ||
    (conversation?.channel as any) ||
    "email";

  const sendDraft = async () => {
    if (!contact?.email && channel === "email") {
      toast.error("Contact has no email on file");
      return;
    }
    if (!contact?.phone && channel === "sms") {
      toast.error("Contact has no phone on file");
      return;
    }
    setBusy(true);
    const to = channel === "email" ? contact.email : contact.phone;
    const { data, error } = await supabase.functions.invoke("send-message", {
      body: {
        channel,
        to,
        subject: channel === "email" ? subject : undefined,
        body,
        contact_id: contact.id,
        conversation_id: approval.conversation_id,
        approval_id: approval.id,
      },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error(`Send failed: ${error?.message || (data as any)?.error}`);
      return;
    }
    toast.success("Sent");
    navigate("/admin/approvals");
  };

  const updateStatus = async (status: "skipped" | "escalated") => {
    setBusy(true);
    const { error } = await supabase
      .from("paige_pending_approvals")
      .update({
        status,
        escalation_note: status === "escalated" ? escalationNote : null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", approval.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "skipped" ? "Skipped" : "Escalated");
    navigate("/admin/approvals");
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/approvals")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Inbox
        </Button>
        <Badge variant="secondary">{approval.type}</Badge>
        <Badge variant="outline" className="capitalize">{channel}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recipient</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1">
          {contact ? (
            <>
              <div className="font-medium">
                {contact.first_name} {contact.last_name}
              </div>
              {contact.email && <div className="text-muted-foreground">{contact.email}</div>}
              {contact.phone && <div className="text-muted-foreground">{contact.phone}</div>}
              <Link to={`/admin/contacts/${contact.id}`} className="text-xs text-accent hover:underline">
                Open contact →
              </Link>
            </>
          ) : (
            <p className="text-muted-foreground">No contact linked.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Draft</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
            <Pencil className="w-3.5 h-3.5 mr-1" /> {editing ? "Done" : "Edit"}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {channel === "email" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Subject</Label>
              {editing
                ? <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
                : <p className="text-sm font-medium">{subject || "(no subject)"}</p>}
            </div>
          )}
          <div className="space-y-1.5">
            <Label className="text-xs">Body</Label>
            {editing
              ? <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} />
              : <div className="text-sm whitespace-pre-wrap rounded-md border bg-muted/30 p-3">{body}</div>}
          </div>
        </CardContent>
      </Card>

      {thread.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recent conversation</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            {thread.map((m) => (
              <div key={m.id} className="border-l-2 pl-3 py-1" style={{
                borderColor: m.direction === "inbound" ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))",
              }}>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {m.direction} · {m.channel} · {new Date(m.created_at).toLocaleString()}
                </div>
                {m.subject && <div className="font-medium">{m.subject}</div>}
                <div className="line-clamp-3">{m.body}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Escalation note (if escalating)</CardTitle></CardHeader>
        <CardContent>
          <Textarea
            value={escalationNote}
            onChange={(e) => setEscalationNote(e.target.value)}
            placeholder="Why does this need a human?"
            rows={3}
          />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Button onClick={sendDraft} disabled={busy}>
          <Send className="w-4 h-4 mr-1.5" /> {editing ? "Edit & Send" : "Approve & Send"}
        </Button>
        <Button variant="outline" onClick={() => updateStatus("skipped")} disabled={busy}>
          <SkipForward className="w-4 h-4 mr-1.5" /> Skip
        </Button>
        <Button variant="destructive" onClick={() => updateStatus("escalated")} disabled={busy}>
          <AlertTriangle className="w-4 h-4 mr-1.5" /> Escalate
        </Button>
      </div>
    </div>
  );
}
