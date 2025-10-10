import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, User, Building2 } from "lucide-react";

export const ProfileSettings = () => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Personal Info
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [dobLast4, setDobLast4] = useState("");

  // Business Info
  const [legalName, setLegalName] = useState("");
  const [dba, setDba] = useState("");
  const [ein, setEin] = useState("");
  const [entityType, setEntityType] = useState("");
  const [stateOfFormation, setStateOfFormation] = useState("");
  const [registeredAgentState, setRegisteredAgentState] = useState("");
  const [naics, setNaics] = useState("");

  useEffect(() => {
    loadProfileData();
  }, []);

  const loadProfileData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load personal profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (profile) {
        setFullName(profile.full_name || "");
        setPhone(profile.phone || "");
        setAddress(profile.address || "");
        setCity(profile.city || "");
        setState(profile.state || "");
        setPostalCode(profile.postal_code || "");
        setDobLast4(profile.dob_last4 || "");
      }

      // Load business profile
      const { data: business } = await supabase
        .from("businesses")
        .select("*")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (business) {
        setLegalName(business.legal_name || "");
        setDba(business.dba || "");
        setEin(business.ein || "");
        setEntityType(business.entity_type || "");
        setStateOfFormation(business.state_of_formation || "");
        setRegisteredAgentState(business.registered_agent_state || "");
        setNaics(business.naics || "");
      }
    } catch (error) {
      console.error("Error loading profile:", error);
    }
  };

  const savePersonalInfo = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone,
          address,
          city,
          state,
          postal_code: postalCode,
          dob_last4: dobLast4,
        })
        .eq("user_id", user.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Personal information updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update personal information",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveBusinessInfo = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if business exists
      const { data: existing } = await supabase
        .from("businesses")
        .select("id")
        .eq("owner_user_id", user.id)
        .maybeSingle();

      if (existing) {
        // Update existing business
        const { error } = await supabase
          .from("businesses")
          .update({
            legal_name: legalName,
            dba,
            ein,
            entity_type: (entityType as "LLC" | "Corporation" | "Sole Proprietorship" | "Partnership" | null) || null,
            state_of_formation: stateOfFormation,
            registered_agent_state: registeredAgentState,
            naics,
          })
          .eq("owner_user_id", user.id);

        if (error) throw error;
      } else {
        // Create new business
        const { error } = await supabase
          .from("businesses")
          .insert({
            owner_user_id: user.id,
            legal_name: legalName,
            dba,
            ein,
            entity_type: (entityType as "LLC" | "Corporation" | "Sole Proprietorship" | "Partnership" | null) || null,
            state_of_formation: stateOfFormation,
            registered_agent_state: registeredAgentState,
            naics,
          });

        if (error) throw error;
      }

      toast({
        title: "Success",
        description: "Business information updated successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update business information",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const usStates = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-4xl font-bold mb-2">Profile Settings</h1>
        <p className="text-muted-foreground">Manage your personal and business information</p>
      </div>

      <Tabs defaultValue="personal" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="personal" className="gap-2">
            <User className="w-4 h-4" />
            Personal Info
          </TabsTrigger>
          <TabsTrigger value="business" className="gap-2">
            <Building2 className="w-4 h-4" />
            Business Info
          </TabsTrigger>
        </TabsList>

        <TabsContent value="personal">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Full Name *</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="John Doe"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone Number</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 123-4567"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="New York"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="state">State</Label>
                  <Select value={state} onValueChange={setState}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {usStates.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="postalCode">ZIP Code</Label>
                  <Input
                    id="postalCode"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="10001"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dobLast4">DOB Last 4 Digits</Label>
                  <Input
                    id="dobLast4"
                    value={dobLast4}
                    onChange={(e) => setDobLast4(e.target.value)}
                    placeholder="1990"
                    maxLength={4}
                  />
                </div>
              </div>

              <Button
                onClick={savePersonalInfo}
                disabled={isLoading || !fullName}
                className="w-full bg-gradient-gold"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Personal Information"
                )}
              </Button>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="business">
          <Card className="p-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="legalName">Legal Business Name *</Label>
                <Input
                  id="legalName"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Acme Corporation"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dba">DBA (Doing Business As)</Label>
                <Input
                  id="dba"
                  value={dba}
                  onChange={(e) => setDba(e.target.value)}
                  placeholder="Acme Co"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ein">EIN (Employer ID Number)</Label>
                  <Input
                    id="ein"
                    value={ein}
                    onChange={(e) => setEin(e.target.value)}
                    placeholder="12-3456789"
                  />
                </div>

              <div className="space-y-2">
                <Label htmlFor="entityType">Entity Type</Label>
                <Select value={entityType} onValueChange={setEntityType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LLC">LLC</SelectItem>
                    <SelectItem value="Corporation">Corporation</SelectItem>
                    <SelectItem value="Sole Proprietorship">Sole Proprietorship</SelectItem>
                    <SelectItem value="Partnership">Partnership</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="stateOfFormation">State of Formation</Label>
                  <Select value={stateOfFormation} onValueChange={setStateOfFormation}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {usStates.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="registeredAgentState">Registered Agent State</Label>
                  <Select value={registeredAgentState} onValueChange={setRegisteredAgentState}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {usStates.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="naics">NAICS Code</Label>
                <Input
                  id="naics"
                  value={naics}
                  onChange={(e) => setNaics(e.target.value)}
                  placeholder="541511"
                />
              </div>

              <Button
                onClick={saveBusinessInfo}
                disabled={isLoading || !legalName}
                className="w-full bg-gradient-gold"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Business Information"
                )}
              </Button>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
