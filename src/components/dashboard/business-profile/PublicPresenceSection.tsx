import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertTriangle, XCircle, Globe, Info, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface PublicPresenceSectionProps {
  businessId: string;
  userId: string;
  onCompletionChange: (pct: number) => void;
}

interface PresenceData {
  id?: string;
  website_url: string | null;
  website_live: boolean;
  google_business_url: string | null;
  google_business_claimed: boolean;
  yelp_url: string | null;
  yelp_exists: boolean;
  linkedin_url: string | null;
  facebook_url: string | null;
  other_listings: string | null;
  official_name: string | null;
  official_address: string | null;
  official_phone: string | null;
}

const EMPTY: PresenceData = {
  website_url: null, website_live: false,
  google_business_url: null, google_business_claimed: false,
  yelp_url: null, yelp_exists: false,
  linkedin_url: null, facebook_url: null, other_listings: null,
  official_name: null, official_address: null, official_phone: null,
};

type ListingKey = "website" | "google" | "yelp" | "linkedin" | "facebook";

export function PublicPresenceSection({ businessId, userId, onCompletionChange }: PublicPresenceSectionProps) {
  const [data, setData] = useState<PresenceData>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [showConsistencyCheck, setShowConsistencyCheck] = useState(false);

  useEffect(() => { fetchData(); }, [businessId]);

  const fetchData = async () => {
    const { data: rows } = await supabase
      .from("business_public_presence")
      .select("*")
      .eq("business_id", businessId)
      .maybeSingle();
    if (rows) {
      setData(rows as any);
    }
    calcCompletion(rows as any || EMPTY);
  };

  const calcCompletion = (d: PresenceData) => {
    const items: boolean[] = [
      !!(d.website_url && d.website_live),
      !!d.google_business_claimed,
      !!d.yelp_exists,
      !!d.linkedin_url,
      !!d.facebook_url,
    ];
    const done = items.filter(Boolean).length;
    onCompletionChange(Math.round((done / items.length) * 100));
  };

  const getStatus = (key: ListingKey): "complete" | "partial" | "missing" => {
    switch (key) {
      case "website": return data.website_live ? "complete" : data.website_url ? "partial" : "missing";
      case "google": return data.google_business_claimed ? "complete" : data.google_business_url ? "partial" : "missing";
      case "yelp": return data.yelp_exists ? "complete" : "missing";
      case "linkedin": return data.linkedin_url ? "complete" : "missing";
      case "facebook": return data.facebook_url ? "complete" : "missing";
    }
  };

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "complete") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (status === "partial") return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    return <XCircle className="w-4 h-4 text-destructive" />;
  };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      business_id: businessId,
      user_id: userId,
      website_url: data.website_url, website_live: data.website_live,
      google_business_url: data.google_business_url, google_business_claimed: data.google_business_claimed,
      yelp_url: data.yelp_url, yelp_exists: data.yelp_exists,
      linkedin_url: data.linkedin_url, facebook_url: data.facebook_url,
      other_listings: data.other_listings,
      official_name: data.official_name, official_address: data.official_address, official_phone: data.official_phone,
    };

    if (data.id) {
      const { error } = await supabase.from("business_public_presence").update(payload as any).eq("id", data.id);
      if (error) toast.error("Failed to save"); else { toast.success("Saved"); fetchData(); }
    } else {
      const { error } = await supabase.from("business_public_presence").insert(payload as any);
      if (error) toast.error("Failed to save"); else { toast.success("Saved"); fetchData(); }
    }
    setSaving(false);
  };

  // Consistency check
  const checkConsistency = () => {
    const issues: string[] = [];
    const officialName = (data.official_name || "").toLowerCase().trim();
    if (!officialName) { toast.info("Enter your official business name first"); return issues; }
    // Simple check — in production this would be more sophisticated
    return issues;
  };

  const listings: { key: ListingKey; label: string }[] = [
    { key: "website", label: "Website" },
    { key: "google", label: "Google Business Profile" },
    { key: "yelp", label: "Yelp Business Listing" },
    { key: "linkedin", label: "LinkedIn Company Page" },
    { key: "facebook", label: "Facebook Business Page" },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="w-4 h-4" /> Online Presence Checklist
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {listings.map(l => (
            <div key={l.key} className="flex items-start gap-3 p-3 border border-border rounded-lg">
              <StatusIcon status={getStatus(l.key)} />
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{l.label}</span>
                  <Badge variant="outline" className="text-xs capitalize">{getStatus(l.key)}</Badge>
                </div>
                {l.key === "website" && (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input value={data.website_url || ""} onChange={e => setData({ ...data, website_url: e.target.value })} placeholder="https://yourbusiness.com" className="text-sm h-8" />
                    </div>
                    <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
                      <input type="checkbox" checked={data.website_live} onChange={e => setData({ ...data, website_live: e.target.checked })} className="rounded" /> Live
                    </label>
                  </div>
                )}
                {l.key === "google" && (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input value={data.google_business_url || ""} onChange={e => setData({ ...data, google_business_url: e.target.value })} placeholder="Google Business Profile URL" className="text-sm h-8" />
                    </div>
                    <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
                      <input type="checkbox" checked={data.google_business_claimed} onChange={e => setData({ ...data, google_business_claimed: e.target.checked })} className="rounded" /> Claimed
                    </label>
                  </div>
                )}
                {l.key === "yelp" && (
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Input value={data.yelp_url || ""} onChange={e => setData({ ...data, yelp_url: e.target.value })} placeholder="Yelp listing URL" className="text-sm h-8" />
                    </div>
                    <label className="flex items-center gap-1 text-xs cursor-pointer whitespace-nowrap">
                      <input type="checkbox" checked={data.yelp_exists} onChange={e => setData({ ...data, yelp_exists: e.target.checked })} className="rounded" /> Exists
                    </label>
                  </div>
                )}
                {l.key === "linkedin" && (
                  <Input value={data.linkedin_url || ""} onChange={e => setData({ ...data, linkedin_url: e.target.value })} placeholder="LinkedIn company page URL" className="text-sm h-8" />
                )}
                {l.key === "facebook" && (
                  <Input value={data.facebook_url || ""} onChange={e => setData({ ...data, facebook_url: e.target.value })} placeholder="Facebook business page URL" className="text-sm h-8" />
                )}
              </div>
            </div>
          ))}

          <div>
            <Label className="text-xs">Other Listings</Label>
            <Textarea value={data.other_listings || ""} onChange={e => setData({ ...data, other_listings: e.target.value })} placeholder="Additional platforms (BBB, industry directories, etc.)" rows={2} className="text-sm" />
          </div>

          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Public Presence"}
          </Button>
        </CardContent>
      </Card>

      {/* LexisNexis Insight */}
      <Alert className="border-accent/30 bg-accent/5">
        <Info className="w-4 h-4 text-accent" />
        <AlertDescription className="text-xs">
          <strong>Paige Insight — LexisNexis & Verification Services:</strong> When lenders verify your business identity, services like LexisNexis scan hundreds of public data sources to build a business profile. Inconsistencies between sources — such as your business name spelled differently on Google versus your Secretary of State filing, or different addresses on different listings — create verification failures that can lead to automatic declines regardless of your credit scores. Every listing should show the exact same legal business name, address, and phone number as your official state filing.
        </AlertDescription>
      </Alert>

      {/* Consistency Check Tool */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Search className="w-4 h-4" /> Consistency Check
            </CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowConsistencyCheck(!showConsistencyCheck)}>
              {showConsistencyCheck ? "Hide" : "Run Check"}
            </Button>
          </div>
        </CardHeader>
        {showConsistencyCheck && (
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">Enter the official details from your state filing to compare against your listings.</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Official Business Name</Label>
                <Input value={data.official_name || ""} onChange={e => setData({ ...data, official_name: e.target.value })} className="text-sm h-8" />
              </div>
              <div>
                <Label className="text-xs">Official Address</Label>
                <Input value={data.official_address || ""} onChange={e => setData({ ...data, official_address: e.target.value })} className="text-sm h-8" />
              </div>
              <div>
                <Label className="text-xs">Official Phone</Label>
                <Input value={data.official_phone || ""} onChange={e => setData({ ...data, official_phone: e.target.value })} className="text-sm h-8" />
              </div>
            </div>
            <Button size="sm" onClick={() => { handleSave(); toast.info("Consistency data saved. Review each listing above to ensure it matches these official details."); }}>
              Save & Check
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
