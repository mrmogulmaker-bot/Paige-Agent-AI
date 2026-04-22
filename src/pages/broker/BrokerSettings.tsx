// Broker → Settings. Edit business profile fields stored on broker_profiles.

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useBrokerProfile } from "@/hooks/useBrokerProfile";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const BrokerSettings = () => {
  const { profile, reload } = useBrokerProfile();
  const { toast } = useToast();
  const [form, setForm] = useState({
    business_name: "",
    website: "",
    license_number: "",
    bio: "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        business_name: profile.business_name || "",
        website: profile.website || "",
        license_number: profile.license_number || "",
        bio: profile.bio || "",
      });
    }
  }, [profile?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;
    setSaving(true);
    const { error } = await supabase
      .from("broker_profiles")
      .update({
        business_name: form.business_name.trim(),
        website: form.website.trim() || null,
        license_number: form.license_number.trim() || null,
        bio: form.bio.trim() || null,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Saved", description: "Profile updated." });
    reload();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your broker profile.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Business profile</CardTitle>
          <CardDescription>This information may appear on client communications.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="business_name">Business name</Label>
              <Input
                id="business_name"
                value={form.business_name}
                onChange={(e) => setForm({ ...form, business_name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                placeholder="https://"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="license_number">License # (if applicable)</Label>
              <Input
                id="license_number"
                value={form.license_number}
                onChange={(e) => setForm({ ...form, license_number: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                rows={4}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                placeholder="Short blurb about your practice…"
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save changes
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Subscription</CardTitle>
          <CardDescription>Your Broker Workspace plan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Plan</span>
            <span className="font-medium">Broker Workspace — $197/mo</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Status</span>
            <span className="font-medium capitalize">{profile?.status || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Referral code</span>
            <span className="font-mono">{profile?.referral_code || "—"}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default BrokerSettings;
