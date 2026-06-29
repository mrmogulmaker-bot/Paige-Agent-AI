import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Target } from "lucide-react";

export default function MetaPixelConfig() {
  const [pixelId, setPixelId] = useState("");
  const [capiToken, setCapiToken] = useState("");
  const [capiTokenSet, setCapiTokenSet] = useState(false);
  const [testCode, setTestCode] = useState("");
  const [pathsText, setPathsText] = useState("/\n/about\n/pricing");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("paige_config")
        .select("meta_pixel_id, meta_capi_test_event_code, meta_pixel_tracked_paths")
        .eq("id", 1)
        .maybeSingle();
      setPixelId(data?.meta_pixel_id ?? "");
      setTestCode(data?.meta_capi_test_event_code ?? "");
      const arr = (data?.meta_pixel_tracked_paths ?? []) as string[];
      if (Array.isArray(arr) && arr.length) setPathsText(arr.join("\n"));

      const { data: isSet } = await supabase.rpc("admin_meta_capi_token_is_set");
      setCapiTokenSet(Boolean(isSet));
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const paths = pathsText.split("\n").map((s) => s.trim()).filter(Boolean);
    const { error } = await supabase.from("paige_config").update({
      meta_pixel_id: pixelId || null,
      meta_capi_test_event_code: testCode || null,
      meta_pixel_tracked_paths: paths,
    }).eq("id", 1);

    // Only push the CAPI token through the secure RPC when the admin entered a new value.
    if (!error && capiToken.trim().length > 0) {
      const { error: tokErr } = await supabase.rpc("admin_set_meta_capi_token", { _token: capiToken });
      if (tokErr) {
        setSaving(false);
        toast.error(tokErr.message);
        return;
      }
      setCapiToken("");
      setCapiTokenSet(true);
    }

    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Saved");
  };

  const clearToken = async () => {
    const { error } = await supabase.rpc("admin_set_meta_capi_token", { _token: null });
    if (error) { toast.error(error.message); return; }
    setCapiTokenSet(false);
    setCapiToken("");
    toast.success("CAPI access token cleared");
  };

  const capiUrl = `${import.meta.env.VITE_SUPABASE_URL ?? ""}/functions/v1/meta-track-conversion`;
  const snippet = pixelId
    ? `<!-- Meta Pixel (Paige) -->\n<script>\n!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?\nn.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;\nn.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;\nt.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,\ndocument,'script','https://connect.facebook.net/en_US/fbevents.js');\nfbq('init', '${pixelId}'); fbq('track', 'PageView');\n</script>\n<noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${pixelId}&ev=PageView&noscript=1"/></noscript>`
    : "Set a Pixel ID above to generate the snippet for off-platform pages (webinar pages, funnels, etc.)";

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Target className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">Meta Pixel + Conversions API</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        Tracks ad conversions back to Meta from Paige's marketing/landing pages and any external pages (webinars, funnels)
        that paste the snippet below. No ads management, no post scheduling — just conversion tracking.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Pixel configuration</CardTitle>
          <CardDescription>The Pixel ID auto-fires PageView on the paths you list below.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>Meta Pixel ID</Label>
            <Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="e.g. 1234567890123456" />
          </div>
          <div className="space-y-1">
            <Label>Tracked paths (one per line, supports <code>/foo/*</code> and <code>*</code>)</Label>
            <Textarea rows={5} value={pathsText} onChange={(e) => setPathsText(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Conversions API (server-side)</CardTitle>
          <CardDescription>
            Off-platform pages POST events to <code>{capiUrl}</code>. Required body:
            <code> {`{ event_name, event_source_url, user_data: { email?, phone? }, custom_data? }`} </code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label>CAPI Access Token {capiTokenSet && <span className="text-xs text-emerald-600">(currently set — leave blank to keep)</span>}</Label>
            <Input
              type="password"
              value={capiToken}
              onChange={(e) => setCapiToken(e.target.value)}
              placeholder={capiTokenSet ? "•••••••• (enter new value to replace)" : "EAAB..."}
              autoComplete="off"
            />
            {capiTokenSet && (
              <Button type="button" variant="ghost" size="sm" onClick={clearToken} className="mt-1 h-7 px-2 text-xs">
                Clear stored token
              </Button>
            )}
          </div>
          <div className="space-y-1">
            <Label>Test Event Code (optional)</Label>
            <Input value={testCode} onChange={(e) => setTestCode(e.target.value)} placeholder="TEST12345" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Snippet for external pages</CardTitle>
          <CardDescription>Paste into the &lt;head&gt; of any webinar / funnel / off-platform page.</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea readOnly rows={10} value={snippet} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
        <Button asChild variant="outline"><Link to="/admin/integrations">Back to Integrations</Link></Button>
      </div>
    </div>
  );
}
