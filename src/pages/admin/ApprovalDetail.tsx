import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft, Send, Pencil, SkipForward, AlertTriangle, MessageSquare,
  UserCog, Check, RotateCcw, Shield, Eye, EyeOff,
} from "lucide-react";
import {
  CATEGORY_LABEL, RISK_COLOR, type ApprovalCategory,
} from "@/lib/approvals";
import { formatDistanceToNow } from "date-fns";

const UNASSIGNED = "__unassigned__";

interface Comment {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  author_name?: string;
}

export default function ApprovalDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [approval, setApproval] = useState<any>(null);
  const [contact, setContact] = useState<any>(null);
  const [conversation, setConversation] = useState<any>(null);
  const [thread, setThread] = useState<any[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [readiness, setReadiness] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [editing, setEditing] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [rationale, setRationale] = useState("");
  const [newComment, setNewComment] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!id) return;
    const { data: row } = await supabase
      .from("paige_pending_approvals").select("*").eq("id", id).maybeSingle();
    setApproval(row);
    const draft = (row?.draft_content ?? {}) as any;
    setSubject(draft.subject ?? "");
    setBody(draft.body ?? draft.text ?? draft.html ?? "");

    if (row?.contact_id) {
      const { data: c } = await supabase
        .from("clients")
        .select("id, first_name, last_name, email, phone, lifecycle_stage, tier, assigned_coach_user_id, linked_user_id")
        .eq("id", row.contact_id).maybeSingle();
      setContact(c);
      const { data: t } = await supabase
        .from("paige_conversations")
        .select("id, channel, direction, subject, body, created_at")
        .eq("contact_id", row.contact_id)
        .order("created_at", { ascending: false })
        .limit(5);
      setThread((t as any) ?? []);
      const { data: r } = await supabase
        .from("contact_readiness_rollup" as any)
        .select("*").eq("contact_id", row.contact_id).maybeSingle();
      setReadiness(r);
    }
    if (row?.conversation_id) {
      const { data: cv } = await supabase
        .from("paige_conversations").select("*").eq("id", row.conversation_id).maybeSingle();
      setConversation(cv);
    }

    const { data: cm } = await supabase
      .from("paige_approval_comments")
      .select("id, author_id, body, created_at")
      .eq("approval_id", id)
      .order("created_at", { ascending: true });
    if (cm) {
      const ids = Array.from(new Set(cm.map((x) => x.author_id)));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("user_id, first_name, last_name").in("user_id", ids)
        : { data: [] };
      const nameMap = new Map((profs ?? []).map((p: any) => [p.user_id, `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim()]));
      setComments(cm.map((c) => ({ ...c, author_name: nameMap.get(c.author_id) || "Teammate" })));
    }

    // For assignee dropdown: load tenant members (admin/coach roles)
    const { data: m } = await supabase
      .from("profiles")
      .select("user_id, first_name, last_name, email")
      .limit(50);
    setMembers(m ?? []);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (!approval) return <div className="p-6 text-muted-foreground">Loading…</div>;

  const channel: "email" | "sms" =
    (approval.draft_content?.channel as any) || (conversation?.channel as any) || "email";

  const sendDraft = async () => {
    if (!contact?.email && channel === "email") return toast.error("Contact has no email on file");
    if (!contact?.phone && channel === "sms") return toast.error("Contact has no phone on file");
    setBusy(true);
    const to = channel === "email" ? contact.email : contact.phone;
    const { data, error } = await supabase.functions.invoke("send-message", {
      body: {
        channel, to,
        subject: channel === "email" ? subject : undefined,
        body,
        contact_id: contact.id,
        conversation_id: approval.conversation_id,
        approval_id: approval.id,
      },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      return toast.error(`Send failed: ${error?.message || (data as any)?.error}`);
    }
    toast.success("Sent");
    navigate("/admin/approvals");
  };

  const setStatus = async (status: "approved" | "rejected" | "skipped" | "escalated" | "changes_requested") => {
    if ((status === "rejected" || status === "escalated" || status === "changes_requested") && !rationale.trim()) {
      return toast.error("Please add a rationale.");
    }
    setBusy(true);
    const { error } = await supabase
      .from("paige_pending_approvals")
      .update({
        status,
        decision_rationale: rationale || null,
        escalation_note: status === "escalated" ? rationale : null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", approval.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Marked ${status.replace("_", " ")}`);
    navigate("/admin/approvals");
  };

  const reassign = async (userId: string) => {
    const { error } = await supabase
      .from("paige_pending_approvals")
      .update({ assigned_to_user_id: userId || null })
      .eq("id", approval.id);
    if (error) return toast.error(error.message);
    toast.success("Reassigned");
    load();
  };

  const addComment = async () => {
    if (!newComment.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return toast.error("Not signed in");
    const { error } = await supabase.from("paige_approval_comments").insert({
      approval_id: approval.id, author_id: user.id, body: newComment.trim(),
    });
    if (error) return toast.error(error.message);
    setNewComment("");
    load();
  };

  const cat = (approval.category ?? approval.type ?? "other") as ApprovalCategory;

  return (
    <div className="space-y-6 max-w-5xl">
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/approvals")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Inbox
        </Button>
        <Badge variant="secondary">{CATEGORY_LABEL[cat] ?? cat}</Badge>
        {approval.risk_level && (
          <Badge variant="outline" className={RISK_COLOR[approval.risk_level] ?? ""}>
            {approval.risk_level}
          </Badge>
        )}
        {approval.priority && <Badge variant="outline">P{approval.priority}</Badge>}
        {approval.source && (
          <span className="text-xs text-muted-foreground">from {approval.source}</span>
        )}
      </div>

      {approval.summary && (
        <Card>
          <CardContent className="pt-4">
            <p className="text-sm font-medium">{approval.summary}</p>
          </CardContent>
        </Card>
      )}

      {/* Policy chip */}
      {approval.requires_role && (
        <Card className="border-accent/40 bg-accent/5">
          <CardContent className="pt-4 flex items-center gap-2 text-sm">
            <Shield className="w-4 h-4 text-accent" />
            <span>
              Routed here because policy requires a <strong>{approval.requires_role}</strong> to decide
              {approval.sla_due_at && <> · SLA {formatDistanceToNow(new Date(approval.sla_due_at), { addSuffix: true })}</>}
            </span>
          </CardContent>
        </Card>
      )}

      <div className="grid lg:grid-cols-[1fr_320px] gap-6">
        <div className="space-y-6">
          {/* Draft */}
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

          {/* Comments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquare className="w-4 h-4" /> Discussion
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {comments.length === 0 && (
                <p className="text-xs text-muted-foreground">No comments yet.</p>
              )}
              {comments.map((c) => (
                <div key={c.id} className="text-sm rounded-md border bg-muted/20 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{c.author_name}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              <div className="flex gap-2 pt-2">
                <Textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  rows={2}
                  placeholder="Leave a note for the submitter or other reviewers…"
                />
                <Button onClick={addComment} disabled={!newComment.trim()}>Post</Button>
              </div>
            </CardContent>
          </Card>

          {/* Rationale */}
          <Card>
            <CardHeader><CardTitle className="text-base">Decision rationale</CardTitle></CardHeader>
            <CardContent>
              <Textarea
                value={rationale}
                onChange={(e) => setRationale(e.target.value)}
                placeholder="Required when rejecting, requesting changes, or escalating."
                rows={3}
              />
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <Button onClick={sendDraft} disabled={busy}>
              <Send className="w-4 h-4 mr-1.5" /> {editing ? "Edit & Send" : "Approve & Send"}
            </Button>
            <Button variant="secondary" onClick={() => setStatus("approved")} disabled={busy}>
              <Check className="w-4 h-4 mr-1.5" /> Approve (no send)
            </Button>
            <Button variant="outline" onClick={() => setStatus("changes_requested")} disabled={busy}>
              <RotateCcw className="w-4 h-4 mr-1.5" /> Request changes
            </Button>
            <Button variant="outline" onClick={() => setStatus("skipped")} disabled={busy}>
              <SkipForward className="w-4 h-4 mr-1.5" /> Skip
            </Button>
            <Button variant="destructive" onClick={() => setStatus("escalated")} disabled={busy}>
              <AlertTriangle className="w-4 h-4 mr-1.5" /> Escalate
            </Button>
            <Button variant="destructive" onClick={() => setStatus("rejected")} disabled={busy}>
              <Shield className="w-4 h-4 mr-1.5" /> Reject
            </Button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Client context</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-1.5">
              {contact ? (
                <>
                  <div className="font-medium">{contact.first_name} {contact.last_name}</div>
                  {contact.email && <div className="text-muted-foreground text-xs">{contact.email}</div>}
                  {contact.phone && <div className="text-muted-foreground text-xs">{contact.phone}</div>}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {contact.lifecycle_stage && <Badge variant="secondary" className="text-[10px]">{contact.lifecycle_stage}</Badge>}
                    {contact.tier && <Badge variant="outline" className="text-[10px]">{contact.tier}</Badge>}
                  </div>
                  {readiness?.composite_score != null && (
                    <div className="pt-2 text-xs">
                      <span className="text-muted-foreground">Readiness</span>{" "}
                      <strong>{readiness.composite_score}/100</strong>
                    </div>
                  )}
                  <div className="pt-2 flex items-center gap-1.5 text-[11px]">
                    {contact.linked_user_id ? (
                      <><Eye className="w-3 h-3 text-emerald-600" /><span className="text-emerald-700">Visible to client in portal</span></>
                    ) : (
                      <><EyeOff className="w-3 h-3 text-muted-foreground" /><span className="text-muted-foreground">Client has no portal login — internal only</span></>
                    )}
                  </div>
                  <Link to={`/admin/contacts/${contact.id}`} className="text-xs text-primary hover:underline block pt-2">
                    Open full profile →
                  </Link>
                </>
              ) : (
                <p className="text-muted-foreground text-xs">No client linked.</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserCog className="w-4 h-4" /> Assignment</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Select
                value={approval.assigned_to_user_id ?? UNASSIGNED}
                onValueChange={(v) => reassign(v === UNASSIGNED ? "" : v)}
              >
                <SelectTrigger className="w-full h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {`${m.first_name ?? ""} ${m.last_name ?? ""}`.trim() || m.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {thread.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Recent conversation</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-xs">
                {thread.map((m) => (
                  <div key={m.id} className="border-l-2 pl-2 py-0.5" style={{
                    borderColor: m.direction === "inbound" ? "hsl(var(--accent))" : "hsl(var(--muted-foreground))",
                  }}>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {m.direction} · {m.channel} · {new Date(m.created_at).toLocaleString()}
                    </div>
                    {m.subject && <div className="font-medium">{m.subject}</div>}
                    <div className="line-clamp-2">{m.body}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
