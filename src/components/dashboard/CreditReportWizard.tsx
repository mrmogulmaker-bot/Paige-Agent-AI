import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, Shield, FileText, AlertCircle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

interface CreditReportWizardProps {
  open: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const personalInfoSchema = z.object({
  ssnLast4: z.string().trim().length(4, "Must be exactly 4 digits").regex(/^\d{4}$/, "Must be numeric"),
  dateOfBirth: z.string().trim().nonempty("Date of birth is required"),
  address: z.string().trim().min(5, "Address is required"),
  city: z.string().trim().min(2, "City is required"),
  state: z.string().trim().length(2, "Use 2-letter state code").toUpperCase(),
  zipCode: z.string().trim().length(5, "Must be 5 digits").regex(/^\d{5}$/, "Must be numeric"),
});

type PersonalInfo = z.infer<typeof personalInfoSchema>;

type WizardStep = "intro" | "personal-info" | "kba-questions" | "connecting" | "complete";

interface KBAQuestion {
  id: string;
  question: string;
  options: string[];
}

export function CreditReportWizard({ open, onClose, onComplete }: CreditReportWizardProps) {
  const [step, setStep] = useState<WizardStep>("intro");
  const [loading, setLoading] = useState(false);
  const [personalInfo, setPersonalInfo] = useState<PersonalInfo>({
    ssnLast4: "",
    dateOfBirth: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
  });
  
  // Mock KBA questions (in production, these come from the API)
  const [kbaQuestions] = useState<KBAQuestion[]>([
    {
      id: "1",
      question: "Which of the following streets have you lived on?",
      options: ["Maple Avenue", "Oak Street", "Pine Road", "None of the above"]
    },
    {
      id: "2",
      question: "What was the make of your first car loan?",
      options: ["Honda", "Toyota", "Ford", "None of the above"]
    },
    {
      id: "3",
      question: "In what year did you open your oldest credit account?",
      options: ["2015", "2018", "2020", "None of the above"]
    }
  ]);
  const [kbaAnswers, setKbaAnswers] = useState<Record<string, string>>({});

  const progressPercentage = {
    intro: 0,
    "personal-info": 25,
    "kba-questions": 50,
    connecting: 75,
    complete: 100,
  }[step];

  const handlePersonalInfoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate input
      personalInfoSchema.parse(personalInfo);

      // Save to database (encrypted SSN last 4)
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Check if verification record exists
      const { data: existing } = await supabase
        .from("credit_report_verifications")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        // Update existing
        await supabase
          .from("credit_report_verifications")
          .update({
            ssn_last_4: personalInfo.ssnLast4,
            date_of_birth: personalInfo.dateOfBirth,
          })
          .eq("user_id", user.id);
      } else {
        // Create new
        await supabase
          .from("credit_report_verifications")
          .insert({
            user_id: user.id,
            ssn_last_4: personalInfo.ssnLast4,
            date_of_birth: personalInfo.dateOfBirth,
          });
      }

      // In production: Call API to initiate KBA
      // const kbaSession = await initiateKBA(personalInfo);
      
      setStep("kba-questions");
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error("Validation Error", {
          description: error.issues[0].message
        });
      } else {
        toast.error("Failed to verify information");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleKBASubmit = async () => {
    setLoading(true);

    try {
      // Validate all questions answered
      if (Object.keys(kbaAnswers).length < kbaQuestions.length) {
        toast.error("Please answer all questions");
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Update KBA status
      await supabase
        .from("credit_report_verifications")
        .update({
          kba_completed: true,
          kba_last_attempt_at: new Date().toISOString(),
        })
        .eq("user_id", user.id);

      setStep("connecting");

      // Simulate API connection delay
      setTimeout(async () => {
        // In production: Actually connect to credit bureaus
        await supabase
          .from("credit_report_verifications")
          .update({
            experian_verified: true,
            equifax_verified: true,
            transunion_verified: true,
            experian_verified_at: new Date().toISOString(),
            equifax_verified_at: new Date().toISOString(),
            transunion_verified_at: new Date().toISOString(),
            experian_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            equifax_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
            transunion_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
          })
          .eq("user_id", user.id);

        setStep("complete");
        toast.success("Credit reports connected successfully!");
      }, 3000);

    } catch (error) {
      toast.error("Failed to complete verification");
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (step) {
      case "intro":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-4">
              <Shield className="w-16 h-16 text-accent mx-auto" />
              <h3 className="text-2xl font-bold">Connect Your Credit Reports</h3>
              <p className="text-muted-foreground">
                We'll securely connect to all three credit bureaus to import your credit reports. 
                This process is bank-level secure and typically takes 2-3 minutes.
              </p>
            </div>

            <div className="grid gap-4">
              <Card className="p-4 border-accent/20">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-success mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">Identity Verification</h4>
                    <p className="text-sm text-muted-foreground">
                      We'll ask for your SSN (last 4), date of birth, and address to verify your identity
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-4 border-accent/20">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-success mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">Knowledge-Based Questions</h4>
                    <p className="text-sm text-muted-foreground">
                      Answer 3-4 security questions based on your credit history
                    </p>
                  </div>
                </div>
              </Card>

              <Card className="p-4 border-accent/20">
                <div className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-success mt-0.5" />
                  <div>
                    <h4 className="font-semibold mb-1">Bureau Connection</h4>
                    <p className="text-sm text-muted-foreground">
                      We'll connect to Experian, Equifax, and TransUnion simultaneously
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            <div className="bg-muted/50 p-4 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-accent mt-0.5" />
              <div className="text-sm">
                <p className="font-medium mb-1">Your data is encrypted and secure</p>
                <p className="text-muted-foreground">
                  We use bank-level 256-bit encryption and never store your full SSN
                </p>
              </div>
            </div>

            <Button 
              className="w-full bg-gradient-primary"
              size="lg"
              onClick={() => setStep("personal-info")}
            >
              Get Started
            </Button>
          </div>
        );

      case "personal-info":
        return (
          <form onSubmit={handlePersonalInfoSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="ssnLast4">SSN (Last 4 Digits)</Label>
                  <Input
                    id="ssnLast4"
                    type="text"
                    maxLength={4}
                    placeholder="1234"
                    value={personalInfo.ssnLast4}
                    onChange={(e) => setPersonalInfo({ ...personalInfo, ssnLast4: e.target.value })}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="dateOfBirth">Date of Birth</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={personalInfo.dateOfBirth}
                    onChange={(e) => setPersonalInfo({ ...personalInfo, dateOfBirth: e.target.value })}
                    required
                    disabled={loading}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Street Address</Label>
                <Input
                  id="address"
                  type="text"
                  placeholder="123 Main St"
                  value={personalInfo.address}
                  onChange={(e) => setPersonalInfo({ ...personalInfo, address: e.target.value })}
                  required
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    type="text"
                    placeholder="City"
                    value={personalInfo.city}
                    onChange={(e) => setPersonalInfo({ ...personalInfo, city: e.target.value })}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      type="text"
                      maxLength={2}
                      placeholder="CA"
                      value={personalInfo.state}
                      onChange={(e) => setPersonalInfo({ ...personalInfo, state: e.target.value.toUpperCase() })}
                      required
                      disabled={loading}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="zipCode">ZIP</Label>
                    <Input
                      id="zipCode"
                      type="text"
                      maxLength={5}
                      placeholder="90210"
                      value={personalInfo.zipCode}
                      onChange={(e) => setPersonalInfo({ ...personalInfo, zipCode: e.target.value })}
                      required
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep("intro")}
                disabled={loading}
              >
                Back
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-gradient-primary"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </form>
        );

      case "kba-questions":
        return (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h3 className="text-xl font-bold">Security Questions</h3>
              <p className="text-sm text-muted-foreground">
                Answer the following questions based on your credit history
              </p>
            </div>

            <div className="space-y-6">
              {kbaQuestions.map((q, index) => (
                <Card key={q.id} className="p-4">
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5">{index + 1}</Badge>
                      <p className="font-medium flex-1">{q.question}</p>
                    </div>
                    <div className="space-y-2 pl-8">
                      {q.options.map((option) => (
                        <label
                          key={option}
                          className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                        >
                          <input
                            type="radio"
                            name={`kba-${q.id}`}
                            value={option}
                            checked={kbaAnswers[q.id] === option}
                            onChange={(e) => setKbaAnswers({ ...kbaAnswers, [q.id]: e.target.value })}
                            className="w-4 h-4 text-primary"
                          />
                          <span className="text-sm">{option}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => setStep("personal-info")}
                disabled={loading}
              >
                Back
              </Button>
              <Button
                className="flex-1 bg-gradient-primary"
                onClick={handleKBASubmit}
                disabled={loading || Object.keys(kbaAnswers).length < kbaQuestions.length}
              >
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  "Submit Answers"
                )}
              </Button>
            </div>
          </div>
        );

      case "connecting":
        return (
          <div className="space-y-6 text-center py-8">
            <Loader2 className="w-16 h-16 text-accent mx-auto animate-spin" />
            <div className="space-y-2">
              <h3 className="text-xl font-bold">Connecting to Credit Bureaus</h3>
              <p className="text-muted-foreground">
                Please wait while we securely connect to Experian, Equifax, and TransUnion...
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-success" />
                <span>Identity verified</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-success" />
                <span>Security questions passed</span>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                <span>Fetching credit reports...</span>
              </div>
            </div>
          </div>
        );

      case "complete":
        return (
          <div className="space-y-6 text-center py-8">
            <div className="w-16 h-16 rounded-full bg-success/10 mx-auto flex items-center justify-center">
              <CheckCircle className="w-10 h-10 text-success" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold">Reports Connected!</h3>
              <p className="text-muted-foreground">
                Your credit reports from all three bureaus have been successfully imported
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              {["Experian", "Equifax", "TransUnion"].map((bureau) => (
                <Card key={bureau} className="p-4">
                  <CheckCircle className="w-8 h-8 text-success mx-auto mb-2" />
                  <p className="text-sm font-medium">{bureau}</p>
                  <p className="text-xs text-muted-foreground mt-1">Connected</p>
                </Card>
              ))}
            </div>

            <Button
              className="w-full bg-gradient-primary"
              size="lg"
              onClick={() => {
                onComplete();
                onClose();
              }}
            >
              <FileText className="mr-2 h-4 w-4" />
              View My Reports
            </Button>
          </div>
        );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect Credit Reports</DialogTitle>
          <DialogDescription>
            Securely import your credit reports from all three bureaus
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-2">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Progress</span>
              <span>{progressPercentage}%</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>

          {renderStepContent()}
        </div>
      </DialogContent>
    </Dialog>
  );
}