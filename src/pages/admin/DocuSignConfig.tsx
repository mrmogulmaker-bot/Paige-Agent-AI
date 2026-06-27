import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { FileSignature, Send } from "lucide-react";

type Envelope = {
  id: string;
  envelope_id: string;
  envelope_type: string;
  status: string;
  sent_at: string;
  signed_at: string | null;
  contact_id: string | null;
};

const TYPES = ["vip_app", "coach_agreement", "dfy_engagement", "refund", "term_sheet", "other"] as const;

export default function DocuSignConfig() {
  const [envelopes, setEnvelopes] = useState<Envelope[]>([]);
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [savingTemplates, setSavingTemplates] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    envelope_type: "vip_app",
    template_id: "",
    email: "",
    name: "",
    email_subject: "Please sign this document",
    email_blurb: "",
  });

  const load = async () => {
    const [cfg, env] = await Promise.all([
      supabase.from("paige_config").select("docusign_templates").eq("id", 1).maybeSingle(),
      supabase.from("paige_signature_envelopes").select("id, envelope_id, envelope_type, status, sent_at, signed_at, contact_id").order("sent_at", { ascending: false }).limit(50),
    ]);
    setTemplates((cfg.data?.docusign_templates as Record<string, string>) ?? {});
    setEnvelopes((env.data ?? []) as Envelope[]);
  };

  useEffect(() => { void load(); }, []);

  const saveTemplates = async () => {
    setSavingTemplates(true);
    const { error } = await supabase.from("paige_config").update({ docusign_templates: templates }).eq("id", 1);
    setSavingTemplates(false);
    if (error) toast.error(error.message);
    else toast.success("Templates saved");
  };

  const send = async () => {
    if (!form.template_id || !form.email) {
      toast.error("Template ID and recipient email are required");
      return;
    }
    setSending(true);
    const { data, error } = await supabase.functions.invoke("docusign-send-envelope", {
      body: {
        envelope_type: form.envelope_type,
        template_id: form.template_id,
        prefill: { email: form.email, name: form.name },
        email_subject: form.email_subject,
        email_blurb: form.email_blurb,
      },
    });
    setSending(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed");
      return;
    }
    toast.success(`Envelope sent: ${(data as any)?.envelopeId}`);
    void load();
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <FileSignature className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">DocuSign</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Template defaults</CardTitle>
          <CardDescription>Map envelope types to DocuSign template IDs for one-click sending.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          {TYPES.map((t) => (
            <div key={t} className="space-y-1">
              <Label className="capitalize">{t.replace(/_/g, " ")}</Label>
              <Input
                value={templates[t] ?? ""}
                placeholder="DocuSign template ID"
                onChange={(e) => setTemplates({ ...templates, [t]: e.target.value })}
              />
            </div>
          ))}
          <div className="md:col-span-2">
            <Button onClick={saveTemplates} disabled={savingTemplates}>
              {savingTemplates ? "Saving..." : "Save templates"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send envelope</CardTitle>
          <CardDescription>Manually send a templated envelope to one recipient.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Envelope type</Label>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={form.envelope_type}
              onChange={(e) => {
                const t = e.target.value;
                setForm({ ...form, envelope_type: t, template_id: templates[t] ?? form.template_id });
              }}
            >
              {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Template ID</Label>
            <Input value={form.template_id} onChange={(e) => setForm({ ...form, template_id: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Recipient email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label>Recipient name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Subject</Label>
            <Input value={form.email_subject} onChange={(e) => setForm({ ...form, email_subject: e.target.value })} />
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Email message</Label>
            <Textarea rows={3} value={form.email_blurb} onChange={(e) => setForm({ ...form, email_blurb: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Button onClick={send} disabled={sending} className="gap-2">
              <Send className="size-4" /> {sending ? "Sending..." : "Send envelope"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent envelopes</CardTitle>
            <CardDescription>Last 50 envelopes across all types.</CardDescription>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/admin/signatures">All signatures</Link></Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {envelopes.length === 0 && <p className="text-sm text-muted-foreground">No envelopes yet.</p>}
            {envelopes.map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-md border p-3 text-sm">
                <div className="space-y-1">
                  <div className="font-mono text-xs text-muted-foreground">{e.envelope_id}</div>
                  <div className="capitalize">{e.envelope_type.replace(/_/g, " ")} · {new Date(e.sent_at).toLocaleString()}</div>
                </div>
                <Badge variant={e.status === "completed" ? "default" : "secondary"}>{e.status}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
