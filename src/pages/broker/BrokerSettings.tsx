// Broker → Settings. Edit business profile fields stored on broker_profiles
// and configure how Paige addresses the broker in private strategy sessions.

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { useBrokerProfile } from "@/hooks/useBrokerProfile";
import { useBrokerContext } from "@/hooks/useBrokerContext";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles } from "lucide-react";

const SPECIALIZATION_OPTIONS: { value: string; label: string }[] = [
  { value: "credit_building", label: "Credit Building" },
  { value: "mortgage_prep", label: "Mortgage Preparation" },
  { value: "business_funding", label: "Business Funding" },
  { value: "real_estate", label: "Real Estate Investing" },
  { value: "insurance", label: "Insurance" },
  { value: "wealth_management", label: "Wealth Management" },
];

const GREETING_OPTIONS = [
  { value: "first_name", label: "First name only" },
  { value: "full_name", label: "Full name" },
  { value: "title_last_name", label: "Title and last name (Mr/Ms/Dr)" },
];

function buildGreeting(setting: string, fullName: string): string {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "there";
  if (setting === "first_name") return parts[0];
  if (setting === "full_name") return parts.join(" ");
  if (setting === "title_last_name") {
    const last = parts[parts.length - 1];
    return `Mr./Ms. ${last}`;
  }
  return parts[0];
}

const BrokerSettings = () => {
  const { profile, reload } = useBrokerProfile();
  const { isTeamMember } = useBrokerContext();
  const { toast } = useToast();
  const [form, setForm] = useState({
    business_name: "",
    website: "",
    license_number: "",
    bio: "",
  });
  const [paige, setPaige] = useState({
    preferred_greeting: "first_name",
    specializations: [] as string[],
    typical_client_profile: "",
    firm_description: "",
    paige_context_notes: "",
  });
  const [ownerName, setOwnerName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingPaige, setSavingPaige] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({
        business_name: profile.business_name || "",
        website: profile.website || "",
        license_number: profile.license_number || "",
        bio: profile.bio || "",
      });
      const p = profile as any;
      setPaige({
        preferred_greeting: p.preferred_greeting || "first_name",
        specializations: Array.isArray(p.specializations) ? p.specializations : [],
        typical_client_profile: p.typical_client_profile || "",
        firm_description: p.firm_description || "",
        paige_context_notes: p.paige_context_notes || "",
      });
    }
  }, [profile?.id]);

  // Look up the broker's full name from profiles for the live preview greeting.
  useEffect(() => {
    (async () => {
      if (!profile?.user_id) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("user_id", profile.user_id)
        .maybeSingle();
      if (data?.full_name) setOwnerName(data.full_name);
    })();
  }, [profile?.user_id]);

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

  const handleSavePaige = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile?.id) return;
    setSavingPaige(true);
    const { error } = await supabase
      .from("broker_profiles")
      .update({
        preferred_greeting: paige.preferred_greeting,
        specializations: paige.specializations,
        typical_client_profile: paige.typical_client_profile.trim() || null,
        firm_description: paige.firm_description.trim() || null,
        paige_context_notes: paige.paige_context_notes.trim() || null,
      } as any)
      .eq("id", profile.id);
    setSavingPaige(false);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Paige configuration saved", description: "Future sessions will use these settings." });
    reload();
  };

  const toggleSpec = (value: string) => {
    setPaige((prev) => ({
      ...prev,
      specializations: prev.specializations.includes(value)
        ? prev.specializations.filter((v) => v !== value)
        : [...prev.specializations, value],
    }));
  };

  const previewMessage = useMemo(() => {
    const greet = buildGreeting(paige.preferred_greeting, ownerName);
    const firm = paige.firm_description?.trim()
      ? ` from ${form.business_name || "your firm"} — ${paige.firm_description.trim()}`
      : form.business_name
      ? ` from ${form.business_name}`
      : "";
    const audience = paige.typical_client_profile?.trim()
      ? ` I know you typically work with ${paige.typical_client_profile.trim()}.`
      : "";
    const focus =
      paige.specializations.length > 0
        ? ` Your focus areas are ${paige.specializations
            .map((s) => SPECIALIZATION_OPTIONS.find((o) => o.value === s)?.label || s)
            .join(", ")}.`
        : "";
    return `Hi ${greet}${firm}.${audience}${focus} I've pulled up your client's profile — what would you like to work through today?`;
  }, [paige, ownerName, form.business_name]);

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
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#CFAE70]" />
            Paige Configuration
          </CardTitle>
          <CardDescription>
            Personalize how Paige speaks with you in private broker sessions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSavePaige} className="space-y-6">
            <div className="space-y-2">
              <Label>How should Paige address you?</Label>
              <RadioGroup
                value={paige.preferred_greeting}
                onValueChange={(v) => setPaige({ ...paige, preferred_greeting: v })}
                className="space-y-2"
              >
                {GREETING_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <RadioGroupItem value={opt.value} id={`greet-${opt.value}`} />
                    <Label htmlFor={`greet-${opt.value}`} className="font-normal cursor-pointer">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-2">
              <Label>Your specializations</Label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SPECIALIZATION_OPTIONS.map((opt) => (
                  <div key={opt.value} className="flex items-center space-x-2">
                    <Checkbox
                      id={`spec-${opt.value}`}
                      checked={paige.specializations.includes(opt.value)}
                      onCheckedChange={() => toggleSpec(opt.value)}
                    />
                    <Label htmlFor={`spec-${opt.value}`} className="font-normal cursor-pointer">
                      {opt.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="typical_client_profile">
                Typical client profile{" "}
                <span className="text-xs text-muted-foreground">
                  ({paige.typical_client_profile.length}/300)
                </span>
              </Label>
              <Textarea
                id="typical_client_profile"
                rows={3}
                maxLength={300}
                value={paige.typical_client_profile}
                onChange={(e) =>
                  setPaige({ ...paige, typical_client_profile: e.target.value.slice(0, 300) })
                }
                placeholder="Describe who you typically work with"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="firm_description">
                Firm description{" "}
                <span className="text-xs text-muted-foreground">
                  ({paige.firm_description.length}/200)
                </span>
              </Label>
              <Textarea
                id="firm_description"
                rows={2}
                maxLength={200}
                value={paige.firm_description}
                onChange={(e) =>
                  setPaige({ ...paige, firm_description: e.target.value.slice(0, 200) })
                }
                placeholder="Describe what your firm does"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="paige_context_notes">
                Special instructions for Paige{" "}
                <span className="text-xs text-muted-foreground">
                  ({paige.paige_context_notes.length}/500)
                </span>
              </Label>
              <Textarea
                id="paige_context_notes"
                rows={4}
                maxLength={500}
                value={paige.paige_context_notes}
                onChange={(e) =>
                  setPaige({ ...paige, paige_context_notes: e.target.value.slice(0, 500) })
                }
                placeholder="Any specific instructions for how Paige should behave in your sessions"
              />
            </div>

            <Button type="submit" disabled={savingPaige}>
              {savingPaige && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Paige configuration
            </Button>
          </form>

          <Card className="mt-6 border-[#CFAE70]/40 bg-[#CFAE70]/5">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-[#CFAE70]" />
                How Paige will open your sessions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed italic text-foreground/80">
                "{previewMessage}"
              </p>
            </CardContent>
          </Card>
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
