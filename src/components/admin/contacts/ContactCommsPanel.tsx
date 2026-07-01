import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Mail, MessageSquare, Send, Clock, Lock, Sparkles, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";

const TONES = [
  "professional","warm","welcoming","stern","friendly",
  "executive","apologetic","celebratory","direct","empathetic","urgent",
] as const;
type Tone = typeof TONES[number];


type Contact = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  linked_user_id: string | null;
  entity_name?: string | null;
};

type Template = {
  template_key: string;
  subject: string;
  body_markdown: string;
  body_html: string | null;
  category: string;
};

function applyMerge(str: string, contact: Contact, coachName: string): string {
  const m: Record<string, string> = {
    "{{first_name}}": contact.first_name || "",
    "{{last_name}}": contact.last_name || "",
    "{{full_name}}": `${contact.first_name || ""} ${contact.last_name || ""}`.trim(),
    "{{entity_name}}": contact.entity_name || "",
    "{{coach_name}}": coachName || "Your Coach",
  };
  return str.replace(/\{\{(first_name|last_name|full_name|entity_name|coach_name)\}\}/g, (k) => m[k] ?? "");
}

export function ContactCommsPanel({ contact, history }: { contact: Contact; history: any[] }) {
  const [subject, setSubject] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [coachName, setCoachName] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [aiIntent, setAiIntent] = useState("");
  const [aiTone, setAiTone] = useState<Tone>("professional");
  const [aiLength, setAiLength] = useState<"short" | "medium" | "long">("medium");
  const [aiCta, setAiCta] = useState("");
  const [aiKeyPoints, setAiKeyPoints] = useState("");
  const [aiFlags, setAiFlags] = useState<string[]>([]);
  const [aiLoading, setAiLoading] = useState(false);


  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: { user } }] = await Promise.all([
        supabase.from("email_templates").select("template_key, subject, body_markdown, body_html, category").eq("active", true).order("category"),
        supabase.auth.getUser(),
      ]);
      setTemplates((t ?? []) as Template[]);
      if (user) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
        setCoachName(p?.full_name ?? "");
      }
    })();
  }, []);

  const previewSubject = useMemo(() => applyMerge(subject, contact, coachName), [subject, contact, coachName]);
  const previewBody = useMemo(() => applyMerge(bodyMd, contact, coachName), [bodyMd, contact, coachName]);

  const runAiDraft = async () => {
    if (!aiIntent.trim()) { toast.error("Tell the composer what this email is about."); return; }
    setAiLoading(true);
    setAiFlags([]);
    try {
      const { data, error } = await supabase.functions.invoke("subagent-email-composer", {
        body: {
          input: {
            intent: aiIntent,
            tone: aiTone,
            length: aiLength,
            cta: aiCta || undefined,
            key_points: aiKeyPoints.split("\n").map((s) => s.trim()).filter(Boolean),
            contact_id: contact.id,
            recipient_name: `${contact.first_name || ""} ${contact.last_name || ""}`.trim() || undefined,
            recipient_email: contact.email || undefined,
            sender_name: coachName || undefined,
            format: "html",
          },
          context: { contact_id: contact.id },
        },
      });
      if (error) throw error;
      const draft = (data as any)?.draft ?? data;
      if (!draft?.subject || !(draft?.body_html || draft?.body_text)) {
        throw new Error("Composer returned no draft.");
      }
      setSubject(draft.subject);
      setBodyMd(draft.body_text || String(draft.body_html).replace(/<[^>]+>/g, ""));
      setAiFlags((data as any)?.compliance_flags ?? []);
      setAiOpen(false);
      toast.success("Draft ready — review before sending.");
    } catch (e: any) {
      toast.error(e?.message || "AI draft failed");
    } finally {
      setAiLoading(false);
    }
  };

  const applyTemplate = (key: string) => {

    const t = templates.find((x) => x.template_key === key);
    if (!t) return;
    setSubject(t.subject);
    setBodyMd(t.body_html || t.body_markdown);
  };

  const send = async () => {
    if (!contact.email) { toast.error("Contact has no email on file."); return; }
    if (!subject.trim() || !bodyMd.trim()) { toast.error("Subject and body required."); return; }
    setSending(true);
    try {
      const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111">${previewBody.replace(/\n/g, "<br/>")}</div>`;
      const { data, error } = await supabase.functions.invoke("send-message", {
        body: { channel: "email", to: contact.email, subject: previewSubject, body: html, contact_id: contact.id },
      });
      if (error) throw error;
      if ((data as any)?.status !== "sent") throw new Error((data as any)?.error || "send_failed");
      // Mirror to communication_log for the in-app history (RLS-friendly, optional).
      if (contact.linked_user_id) {
        await supabase.from("communication_log").insert({
          user_id: contact.linked_user_id,
          channel: "email",
          message_type: "outbound_email",
          subject: previewSubject,
          preview: bodyMd.slice(0, 280),
          status: "sent",
        });
      }
      toast.success("Email sent");
      setSubject(""); setBodyMd("");
    } catch (e: any) {
      toast.error(e?.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  return (
    <Tabs defaultValue="email" className="space-y-3">
      <TabsList>
        <TabsTrigger value="email" className="gap-1.5"><Mail className="h-4 w-4" /> Email</TabsTrigger>
        <TabsTrigger value="sms" className="gap-1.5"><MessageSquare className="h-4 w-4" /> SMS</TabsTrigger>
        <TabsTrigger value="history" className="gap-1.5"><Clock className="h-4 w-4" /> History</TabsTrigger>
      </TabsList>

      <TabsContent value="email">
        <Card><CardContent className="p-4 space-y-3">
          {!contact.email ? (
            <div className="text-sm text-muted-foreground">No email address on file for this contact.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>To:</span>
                <Badge variant="secondary">{contact.email}</Badge>
                <span className="ml-2">Merge tags:</span>
                <code className="text-[11px]">{"{{first_name}} {{last_name}} {{entity_name}} {{coach_name}}"}</code>
              </div>
              <div className="flex flex-wrap gap-2">
                <Select onValueChange={applyTemplate}>
                  <SelectTrigger className="w-[260px]"><SelectValue placeholder="Insert template…" /></SelectTrigger>
                  <SelectContent>
                    {templates.length === 0 && <SelectItem value="__none" disabled>No templates yet</SelectItem>}
                    {templates.map((t) => (
                      <SelectItem key={t.template_key} value={t.template_key}>
                        <span className="text-xs text-muted-foreground mr-2">[{t.category}]</span>{t.subject}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" className="gap-1.5" onClick={() => setAiOpen(true)}>
                  <Sparkles className="h-4 w-4" /> AI Draft
                </Button>
              </div>
              {aiFlags.length > 0 && (
                <div className="rounded border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-700 dark:text-amber-400">
                  <span className="font-medium">Compliance flags:</span> {aiFlags.join(" · ")} — please review before sending.
                </div>
              )}

              <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              <Textarea rows={8} placeholder="Write your message…" value={bodyMd} onChange={(e) => setBodyMd(e.target.value)} />
              {(subject || bodyMd) && (
                <div className="rounded border border-border bg-muted/30 p-3 text-xs space-y-1">
                  <div className="font-medium text-foreground">Preview · {previewSubject || "(no subject)"}</div>
                  <div className="text-muted-foreground whitespace-pre-wrap">{previewBody}</div>
                </div>
              )}
              <div className="flex justify-end">
                <Button onClick={send} disabled={sending} className="gap-1.5">
                  <Send className="h-4 w-4" /> {sending ? "Sending…" : "Send Email"}
                </Button>
              </div>
            </>
          )}
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="sms">
        <Card><CardContent className="p-6 text-center space-y-2">
          <Lock className="h-6 w-6 mx-auto text-muted-foreground" />
          <div className="font-medium">SMS coming soon</div>
          <div className="text-sm text-muted-foreground">
            Two-way SMS is pending Twilio A2P 10DLC approval. Once active, you'll be able to text {contact.phone || "this contact"} from here.
          </div>
        </CardContent></Card>
      </TabsContent>

      <TabsContent value="history">
        <Card><CardContent className="p-4">
          {history.length === 0 ? (
            <div className="text-sm text-muted-foreground">No communications logged yet.</div>
          ) : (
            <div className="space-y-2">
              {history.map((m: any) => (
                <div key={m.id} className="border border-border rounded p-3 text-sm">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium capitalize">{m.channel} · {m.message_type}</span>
                    <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(m.created_at), { addSuffix: true })}</span>
                  </div>
                  {m.subject && <div className="text-muted-foreground">{m.subject}</div>}
                  {m.preview && <div className="text-muted-foreground/80 mt-1">{m.preview}</div>}
                </div>
              ))}
            </div>
          )}
        </CardContent></Card>
      </TabsContent>
    </Tabs>
  );
}
