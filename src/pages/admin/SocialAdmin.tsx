import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Share2, Send } from "lucide-react";

type SocialPost = {
  id: string;
  platform: string;
  platform_post_id: string | null;
  caption: string | null;
  scheduled_at: string | null;
  posted_at: string | null;
  status: string;
  metrics: Record<string, unknown>;
};

export default function SocialAdmin() {
  const [rows, setRows] = useState<SocialPost[]>([]);
  const [form, setForm] = useState({ platform: "facebook" as "facebook" | "instagram", caption: "", media_url: "", scheduled_at: "" });
  const [sending, setSending] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("paige_social_posts")
      .select("id, platform, platform_post_id, caption, scheduled_at, posted_at, status, metrics")
      .order("created_at", { ascending: false })
      .limit(100);
    setRows((data ?? []) as SocialPost[]);
  };

  useEffect(() => { void load(); }, []);

  const post = async () => {
    setSending(true);
    const { data, error } = await supabase.functions.invoke("meta-schedule-post", {
      body: {
        platform: form.platform,
        caption: form.caption,
        media_urls: form.media_url ? [form.media_url] : [],
        scheduled_at: form.scheduled_at || undefined,
      },
    });
    setSending(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error ?? error?.message ?? "Failed");
      return;
    }
    toast.success("Posted");
    setForm({ platform: "facebook", caption: "", media_url: "", scheduled_at: "" });
    void load();
  };

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-2">
        <Share2 className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">Social</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Compose</CardTitle>
          <CardDescription>Publish or schedule to Facebook or Instagram. IG requires a media URL.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Platform</Label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value as any })}>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label>Scheduled at (FB only, optional)</Label>
            <Input type="datetime-local" value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} />
          </div>
          <div className="md:col-span-2 space-y-1">
            <Label>Media URL (required for Instagram)</Label>
            <Input value={form.media_url} onChange={(e) => setForm({ ...form, media_url: e.target.value })} placeholder="https://..." />
          </div>
          <div className="md:col-span-2 space-y-1">
            <Label>Caption</Label>
            <Textarea rows={4} value={form.caption} onChange={(e) => setForm({ ...form, caption: e.target.value })} />
          </div>
          <div className="md:col-span-2">
            <Button onClick={post} disabled={sending} className="gap-2">
              <Send className="size-4" /> {sending ? "Posting..." : (form.scheduled_at ? "Schedule" : "Publish now")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent posts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 && <p className="text-sm text-muted-foreground">No posts yet.</p>}
          {rows.map((r) => (
            <div key={r.id} className="rounded-md border p-3 text-sm space-y-1">
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground capitalize">{r.platform} · {r.posted_at ? new Date(r.posted_at).toLocaleString() : r.scheduled_at ? `scheduled ${new Date(r.scheduled_at).toLocaleString()}` : ""}</div>
                <Badge variant={r.status === "posted" ? "default" : "secondary"}>{r.status}</Badge>
              </div>
              {r.caption && <div className="whitespace-pre-wrap">{r.caption}</div>}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
