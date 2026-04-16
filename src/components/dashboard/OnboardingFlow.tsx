import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ArrowRight, ArrowLeft, Target, TrendingUp, DollarSign, CheckCircle2, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";

interface OnboardingFlowProps {
  open: boolean;
  onComplete: () => void;
}

export const OnboardingFlow = ({ open, onComplete }: OnboardingFlowProps) => {
  const [step, setStep] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Goals
  const [goals, setGoals] = useState<string[]>([]);

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

  const totalSteps = hasBusinessCredit ? 5 : 4;
  const progress = (step / totalSteps) * 100;

  const toggleGoal = (goal: string) => {
    setGoals(prev => 
      prev.includes(goal) ? prev.filter(g => g !== goal) : [...prev, goal]
    );
  };

  const usStates = [
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
    "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
    "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
    "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
    "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY"
  ];

  const handleNext = () => {
    if (step === 1 && goals.length === 0) {
      toast({
        title: "Please Select Goals",
        description: "Choose at least one goal to continue",
        variant: "destructive",
      });
      return;
    }

    if (step === 2 && !fullName.trim()) {
      toast({
        title: "Required Field",
        description: "Please enter your full name",
        variant: "destructive",
      });
      return;
    }

    if (step === 3 && hasBusinessCredit === null) {
      toast({
        title: "Please Select",
        description: "Let us know if you have a business",
        variant: "destructive",
      });
      return;
    }

    if (step === 4 && hasBusinessCredit && !legalName.trim()) {
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

      // Welcome email already sent on signup — no need to send again here

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

        {step > 0 && <Progress value={progress} className="mb-6" />}

        {/* Step 0: Welcome */}
        {step === 0 && (
          <div className="space-y-6 py-4">
            <div className="text-center space-y-4">
              <div className="w-20 h-20 bg-gradient-gold rounded-full mx-auto flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-white" />
              </div>
              <h2 className="text-3xl font-bold">Welcome to PaigeAgent.ai!</h2>
              <p className="text-muted-foreground max-w-md mx-auto">
                Your AI-powered credit building and business financing companion. Let's get you started on your journey to financial success.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-6">
              <Card className="p-4 text-center space-y-2 border-primary/20">
                <Target className="w-8 h-8 mx-auto text-primary" />
                <h3 className="font-semibold">A.C.C.E.L.</h3>
                <p className="text-xs text-muted-foreground">Personal credit repair & optimization</p>
              </Card>
              <Card className="p-4 text-center space-y-2 border-primary/20">
                <TrendingUp className="w-8 h-8 mx-auto text-primary" />
                <h3 className="font-semibold">B.U.I.L.D.</h3>
                <p className="text-xs text-muted-foreground">Business credit building strategies</p>
              </Card>
              <Card className="p-4 text-center space-y-2 border-primary/20">
                <DollarSign className="w-8 h-8 mx-auto text-primary" />
                <h3 className="font-semibold">Funding</h3>
                <p className="text-xs text-muted-foreground">Access to capital & financing</p>
              </Card>
            </div>

            <div className="flex justify-center">
              <Button onClick={() => setStep(1)} size="lg" className="bg-gradient-gold">
                Get Started
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 1: Goal Selection */}
        {step === 1 && (
          <div className="space-y-6">
            <h3 className="font-semibold text-lg">What are your goals?</h3>
            <p className="text-sm text-muted-foreground">Select all that apply - we'll customize your experience</p>

            <div className="space-y-3">
              <Card 
                className={`p-4 cursor-pointer transition-all ${goals.includes('repair') ? 'border-primary bg-primary/5' : 'border-border'}`}
                onClick={() => toggleGoal('repair')}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${goals.includes('repair') ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                    {goals.includes('repair') && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Repair & Optimize Personal Credit</p>
                    <p className="text-xs text-muted-foreground">Remove inaccuracies and improve your credit score</p>
                  </div>
                </div>
              </Card>

              <Card 
                className={`p-4 cursor-pointer transition-all ${goals.includes('build') ? 'border-primary bg-primary/5' : 'border-border'}`}
                onClick={() => toggleGoal('build')}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${goals.includes('build') ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                    {goals.includes('build') && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Build Business Credit</p>
                    <p className="text-xs text-muted-foreground">Establish and grow your business credit profile</p>
                  </div>
                </div>
              </Card>

              <Card 
                className={`p-4 cursor-pointer transition-all ${goals.includes('funding') ? 'border-primary bg-primary/5' : 'border-border'}`}
                onClick={() => toggleGoal('funding')}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${goals.includes('funding') ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>
                    {goals.includes('funding') && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Access Funding & Financing</p>
                    <p className="text-xs text-muted-foreground">Get approved for loans and credit lines</p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {/* Step 2: Personal Information */}
        {step === 2 && (
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

        {/* Step 3: Business Credit Question */}
        {step === 3 && (
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

        {/* Step 4: Business Information (conditional) */}
        {step === 4 && hasBusinessCredit && (
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
        {step > 0 && (
          <>
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
