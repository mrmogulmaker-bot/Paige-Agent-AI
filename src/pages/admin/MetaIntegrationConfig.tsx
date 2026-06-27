import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Share2 } from "lucide-react";

export default function MetaIntegrationConfig() {
  const [pageId, setPageId] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("paige_config").select("meta_default_page_id").eq("id", 1).maybeSingle();
      setPageId(data?.meta_default_page_id ?? "");
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("paige_config").update({ meta_default_page_id: pageId || null }).eq("id", 1);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/handle-meta-webhook`;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Share2 className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">Meta Graph (Facebook + Instagram)</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Webhook setup</CardTitle>
          <CardDescription>
            Use this URL as the Meta webhook callback for the Page + Instagram subscriptions. Set
            <code> META_WEBHOOK_VERIFY_TOKEN</code> in project secrets and provide the same value to Meta when subscribing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input readOnly value={webhookUrl} onFocus={(e) => e.currentTarget.select()} />
          <p className="text-xs text-muted-foreground">
            Required env vars: META_APP_ID, META_APP_SECRET, META_PAGE_ACCESS_TOKEN, META_IG_BUSINESS_ID, META_WEBHOOK_VERIFY_TOKEN.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Default Facebook Page</CardTitle>
          <CardDescription>Used when scheduling posts and pulling page-level insights.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Page ID</Label>
            <Input value={pageId} onChange={(e) => setPageId(e.target.value)} placeholder="e.g. 1234567890" />
          </div>
          <div className="flex gap-2">
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            <Button asChild variant="outline"><Link to="/admin/social">Open Social</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
