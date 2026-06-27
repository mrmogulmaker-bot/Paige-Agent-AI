import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function TelegramIntegrationConfig() {
  const [chatId, setChatId] = useState("");
  const [tokenRef] = useState("TELEGRAM_BOT_TOKEN");
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testText, setTestText] = useState("Hello from Paige — Telegram test ✅");

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("paige_telegram_config").select("default_admin_chat_id, enabled").eq("id", 1).maybeSingle();
      if (data) {
        setChatId(data.default_admin_chat_id ?? "");
        setEnabled(data.enabled ?? true);
      }
      setLoading(false);
    })();
  }, []);

  async function save() {
    setBusy(true);
    const { error } = await supabase.from("paige_telegram_config").upsert({
      id: 1, default_admin_chat_id: chatId, bot_token_ref: tokenRef, enabled,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Telegram config saved");
  }

  async function sendTest() {
    const { error } = await supabase.functions.invoke("send-telegram", { body: { text: testText } });
    if (error) return toast.error(error.message);
    toast.success("Test message sent");
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold">Telegram Alerts</h1>
        <p className="text-sm text-muted-foreground">Backup channel for admin alerts. Bot token lives in Edge Functions secrets as <code>{tokenRef}</code>.</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">Default admin chat</CardTitle><CardDescription>Used when send-telegram is called without an explicit chat_id.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5"><Label>Default admin chat ID</Label><Input value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="5188669161" /></div>
          <div className="flex items-center gap-2"><Switch checked={enabled} onCheckedChange={setEnabled} /><Label>Enabled</Label></div>
          <div className="flex gap-2"><Button onClick={save} disabled={busy}>Save</Button></div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">Send a test</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5"><Label>Message</Label><Input value={testText} onChange={(e) => setTestText(e.target.value)} /></div>
          <Button variant="outline" onClick={sendTest}>Send test</Button>
        </CardContent>
      </Card>
    </div>
  );
}
