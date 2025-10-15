import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Copy, Loader2, Plus, ToggleLeft, ToggleRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ReferralCode {
  id: string;
  code: string;
  is_active: boolean;
  clicks: number;
  conversions: number;
  created_at: string;
}

interface AffiliateProfile {
  id: string;
  status: string;
}

export function ReferralCodeManager() {
  const [codes, setCodes] = useState<ReferralCode[]>([]);
  const [affiliateProfile, setAffiliateProfile] = useState<AffiliateProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [newCode, setNewCode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    fetchAffiliateData();
  }, []);

  const fetchAffiliateData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get affiliate profile
      const { data: profile, error: profileError } = await supabase
        .from("affiliate_profiles")
        .select("id, status")
        .eq("user_id", user.id)
        .single();

      if (profileError) throw profileError;
      setAffiliateProfile(profile);

      // Get referral codes
      const { data: codesData, error: codesError } = await supabase
        .from("referral_codes")
        .select("*")
        .eq("affiliate_id", profile.id)
        .order("created_at", { ascending: false });

      if (codesError) throw codesError;
      setCodes(codesData || []);
    } catch (error: any) {
      console.error("Error fetching affiliate data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const generateRandomCode = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  const handleCreateCode = async () => {
    if (!affiliateProfile) return;
    
    const codeToCreate = newCode || generateRandomCode();
    setIsCreating(true);

    try {
      const { error } = await supabase
        .from("referral_codes")
        .insert({
          affiliate_id: affiliateProfile.id,
          code: codeToCreate,
        });

      if (error) throw error;

      toast({
        title: "Referral code created",
        description: `Code ${codeToCreate} is now active`,
      });

      setNewCode("");
      fetchAffiliateData();
    } catch (error: any) {
      console.error("Error creating code:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create referral code",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const toggleCodeStatus = async (code: ReferralCode) => {
    try {
      const { error } = await supabase
        .from("referral_codes")
        .update({ is_active: !code.is_active })
        .eq("id", code.id);

      if (error) throw error;

      toast({
        title: code.is_active ? "Code deactivated" : "Code activated",
      });

      fetchAffiliateData();
    } catch (error: any) {
      console.error("Error toggling code:", error);
      toast({
        title: "Error",
        description: "Failed to update code status",
        variant: "destructive",
      });
    }
  };

  const copyReferralLink = (code: string) => {
    const link = `${window.location.origin}/?ref=${code}`;
    navigator.clipboard.writeText(link);
    toast({
      title: "Copied!",
      description: "Referral link copied to clipboard",
    });
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (!affiliateProfile || affiliateProfile.status !== "approved") {
    return (
      <Card>
        <CardContent className="py-8">
          <p className="text-center text-muted-foreground">
            Your affiliate application is pending approval
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Referral Codes</CardTitle>
        <CardDescription>Create and manage your referral codes</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-2">
          <Input
            placeholder="Custom code (optional)"
            value={newCode}
            onChange={(e) => setNewCode(e.target.value.toUpperCase())}
            maxLength={20}
          />
          <Button onClick={handleCreateCode} disabled={isCreating}>
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="space-y-3">
          {codes.map((code) => (
            <Card key={code.id}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <code className="text-lg font-mono font-semibold">{code.code}</code>
                      <Badge variant={code.is_active ? "default" : "secondary"}>
                        {code.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="flex gap-4 text-sm text-muted-foreground">
                      <span>{code.clicks} clicks</span>
                      <span>{code.conversions} conversions</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyReferralLink(code.code)}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => toggleCodeStatus(code)}
                    >
                      {code.is_active ? (
                        <ToggleRight className="h-4 w-4" />
                      ) : (
                        <ToggleLeft className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          {codes.length === 0 && (
            <p className="text-center py-8 text-muted-foreground">
              No referral codes yet. Create your first one above!
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
