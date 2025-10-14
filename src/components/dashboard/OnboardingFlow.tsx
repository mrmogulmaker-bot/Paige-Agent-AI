import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowRight, ArrowLeft } from "lucide-react";

interface OnboardingFlowProps {
  open: boolean;
  onComplete: () => void;
}

export const OnboardingFlow = ({ open, onComplete }: OnboardingFlowProps) => {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Personal Info
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");

  // Business Info (optional)
  const [hasBusinessCredit, setHasBusinessCredit] = useState<boolean | null>(null);
  const [legalName, setLegalName] = useState("");
  const [ein, setEin] = useState("");
  const [entityType, setEntityType] = useState("");

  const totalSteps = hasBusinessCredit ? 3 : 2;
  const progress = (step / totalSteps) * 100;

  const usStates = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
  ];

  const handleNext = () => {
    if (step === 1 && !fullName.trim()) {
      toast({
        title: "Required Field",
        description: "Please enter your full name",
        variant: "destructive",
      });
      return;
    }

    if (step === 2 && hasBusinessCredit === null) {
      toast({
        title: "Please Select",
        description: "Let us know if you have a business",
        variant: "destructive",
      });
      return;
    }

    if (step === 3 && !legalName.trim()) {
      toast({
        title: "Required Field",
        description: "Please enter your business name",
        variant: "destructive",
      });
      return;
    }

    if (step === totalSteps) {
      handleComplete();
    } else {
      setStep(step + 1);
    }
  };

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Save personal info
      const { error: profileError } = await supabase
        .from("profiles")
        .update({
          full_name: fullName,
          phone,
          address,
          city,
          state,
          postal_code: postalCode,
        })
        .eq("user_id", user.id);

      if (profileError) throw profileError;

      // Save business info if applicable
      if (hasBusinessCredit && legalName) {
        const { error: businessError } = await supabase
          .from("businesses")
          .insert({
            owner_user_id: user.id,
            legal_name: legalName,
            ein,
            entity_type: (entityType as "LLC" | "Corporation" | "Sole Proprietorship" | "Partnership" | null) || null,
          });

        if (businessError) throw businessError;
      }

      toast({
        title: "Welcome to PaigeAgent.ai!",
        description: "Your profile has been set up successfully",
      });

      onComplete();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to save your information. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-2xl" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-2xl">Welcome to PaigeAgent.ai! 🎉</DialogTitle>
          <DialogDescription>
            Let's set up your profile to personalize your experience
          </DialogDescription>
        </DialogHeader>

        <Progress value={progress} className="mb-6" />

        {/* Step 1: Personal Information */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Personal Information</h3>
            
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

            <div className="grid grid-cols-3 gap-4">
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
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent>
                    {usStates.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="postalCode">ZIP</Label>
                <Input
                  id="postalCode"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  placeholder="10001"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Business Credit Question */}
        {step === 2 && (
          <div className="space-y-6">
            <h3 className="font-semibold text-lg">Do you have a business?</h3>
            <p className="text-sm text-muted-foreground">
              This helps us provide personalized business credit building guidance
            </p>

            <div className="grid grid-cols-2 gap-4">
              <Button
                variant={hasBusinessCredit === true ? "default" : "outline"}
                onClick={() => setHasBusinessCredit(true)}
                className="h-24"
              >
                <div>
                  <p className="font-semibold">Yes, I have a business</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    I want to build business credit
                  </p>
                </div>
              </Button>

              <Button
                variant={hasBusinessCredit === false ? "default" : "outline"}
                onClick={() => setHasBusinessCredit(false)}
                className="h-24"
              >
                <div>
                  <p className="font-semibold">No business yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Focus on personal credit for now
                  </p>
                </div>
              </Button>
            </div>
          </div>
        )}

        {/* Step 3: Business Information (conditional) */}
        {step === 3 && hasBusinessCredit && (
          <div className="space-y-4">
            <h3 className="font-semibold text-lg">Business Information</h3>

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
        )}

        {/* Navigation */}
        <div className="flex justify-between pt-4">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
          )}

          <Button
            onClick={handleNext}
            disabled={isLoading}
            className="ml-auto bg-gradient-gold"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : step === totalSteps ? (
              "Complete Setup"
            ) : (
              <>
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>

        <p className="text-xs text-center text-muted-foreground">
          Step {step} of {totalSteps}
        </p>
      </DialogContent>
    </Dialog>
  );
};
