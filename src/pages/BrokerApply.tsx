import { useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/landing/Header";
import { Footer } from "@/components/landing/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Briefcase,
  Brain,
  DollarSign,
  Users,
  Shield,
  CheckCircle2,
  Sparkles,
  Copy,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import {
  submitBrokerApplication,
  type BrokerType,
  type BrokerApprovalResult,
} from "@/lib/brokers/applications";
import { trackEvent } from "@/hooks/useAnalytics";

const BROKER_TYPES: { value: BrokerType; label: string }[] = [
  { value: "credit_coach", label: "Credit Coach" },
  { value: "mortgage_broker", label: "Mortgage Broker" },
  { value: "financial_advisor", label: "Financial Advisor" },
  { value: "real_estate_agent", label: "Real Estate Agent" },
  { value: "insurance_agent", label: "Insurance Agent" },
  { value: "other", label: "Other" },
];

const CLIENT_COUNT_OPTIONS = ["1-10", "11-25", "26-50", "51-100", "100+"];

export default function BrokerApply() {
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<BrokerApprovalResult | null>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    businessName: "",
    brokerType: "" as BrokerType | "",
    licenseNumber: "",
    website: "",
    currentClientCount: "",
    useCase: "",
    brokerReferralCode: "",
    agreedToTerms: false,
  });

  const update = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !form.firstName.trim() ||
      !form.lastName.trim() ||
      !form.email.trim() ||
      !form.businessName.trim() ||
      !form.brokerType ||
      !form.currentClientCount ||
      !form.useCase.trim()
    ) {
      toast.error("Please fill out all required fields.");
      return;
    }
    if (!form.agreedToTerms) {
      toast.error("Please agree to the broker program terms to continue.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitBrokerApplication({
        ...form,
        brokerType: form.brokerType as BrokerType,
      });
      setResult(res);
      void trackEvent("broker_application_submit", "acquisition", {
        broker_type: form.brokerType,
        client_count: form.currentClientCount,
        had_referral_code: !!form.brokerReferralCode,
      });
      const pending = res.status === "pending" || res.autoApproved === false;
      toast.success(
        pending
          ? "Application received — we'll review it shortly."
          : "You're approved! Check your email for next steps.",
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      console.error("broker application error", err);
      toast.error(err?.message || "Application failed. Please try again or contact support.");
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    const isPending = result.status === "pending" || result.autoApproved === false;
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 w-full">
          <Card className="border-2 border-gold/40 shadow-2xl">
            <CardHeader className="text-center space-y-3">
              <div className="mx-auto w-14 h-14 rounded-full bg-gold/15 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-gold" />
              </div>
              <CardTitle className="text-3xl">
                {isPending ? "Application Received" : "You're In"}
              </CardTitle>
              <p className="text-muted-foreground">
                {isPending
                  ? "Thanks for applying to the PaigeAgent Broker Program. Our team is reviewing your application and will follow up by email shortly."
                  : "Welcome to the PaigeAgent Broker Program. Your workspace is ready to activate."}
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {!isPending && result.referralCode && result.signupClientLink && (
                <div className="rounded-lg border bg-muted/30 p-5 space-y-4">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Your broker referral code
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <code className="font-mono text-xl font-bold text-primary">
                        {result.referralCode}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(result.referralCode || "");
                          toast.success("Code copied");
                        }}
                      >
                        <Copy className="w-4 h-4 mr-1" /> Copy
                      </Button>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">
                      Your client signup link ($17/mo broker rate)
                    </p>
                    <div className="flex items-center justify-between mt-1 gap-2">
                      <code className="font-mono text-xs text-foreground/80 truncate">
                        {result.signupClientLink}
                      </code>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(result.signupClientLink || "");
                          toast.success("Link copied");
                        }}
                      >
                        <Copy className="w-4 h-4 mr-1" /> Copy
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3 text-sm text-muted-foreground">
                {isPending ? (
                  <>
                    <p className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                      We sent a confirmation to your email. No action needed yet.
                    </p>
                    <p className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                      Once approved, you'll receive your referral code and dashboard access.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                      Check your inbox — we sent your welcome packet with the dashboard link.
                    </p>
                    <p className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                      Activate your $197/mo Broker Workspace subscription from your dashboard.
                    </p>
                    <p className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-gold mt-0.5 shrink-0" />
                      Start adding clients — they get $17/mo, you earn 20% on every subscription.
                    </p>
                  </>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button asChild size="lg" className="flex-1 bg-gold text-primary hover:bg-gold/90">
                  <Link to={isPending ? "/" : "/auth"}>
                    {isPending ? "Back to Site" : "Go To Dashboard"}{" "}
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </Link>
                </Button>
                {!isPending && (
                  <Button asChild size="lg" variant="outline" className="flex-1">
                    <Link to="/">Back to Site</Link>
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <PageHead
        title="Broker Program — PaigeAgent.ai"
        description="Use PaigeAgent.ai as a white-label workspace for your funding clients. Apply to the Broker Program and run Paige-powered sessions with your book of business."
        path="/broker"
      />
      <Header />


      {/* Hero */}
      <section className="bg-gradient-to-br from-primary via-primary to-primary/90 text-primary-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-28">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold/15 text-gold text-xs font-semibold uppercase tracking-wide mb-6">
              <Sparkles className="w-3.5 h-3.5" /> Broker Program
            </div>
            <h1 className="text-4xl md:text-6xl font-extrabold leading-tight mb-6">
              Grow Your Practice With{" "}
              <span className="text-gold">AI-Powered Client Intelligence</span>
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/85 leading-relaxed mb-8">
              Give your clients access to Paige — the AI advisor that builds credit, finds funding,
              and coaches financial strategy — while you get a full strategic workspace to manage
              every client relationship.
            </p>
            <Button
              size="lg"
              className="bg-gold text-primary hover:bg-gold/90 font-bold"
              onClick={() => document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" })}
            >
              Apply for Broker Access <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="border-2 hover:border-gold/40 transition-colors">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-gold/15 flex items-center justify-center mb-3">
                  <Brain className="w-6 h-6 text-gold" />
                </div>
                <CardTitle>Your Private Strategy Room</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  Ask Paige anything about your clients without them seeing the conversation.
                  Get AI-powered strategy for every client situation — and share a clean
                  summary when you're ready.
                </p>
              </CardContent>
            </Card>
            <Card className="border-2 hover:border-gold/40 transition-colors">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-gold/15 flex items-center justify-center mb-3">
                  <DollarSign className="w-6 h-6 text-gold" />
                </div>
                <CardTitle>Client Discounts Built In</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  Your clients get PaigeAgent at <span className="font-bold text-foreground">$17/month</span> —
                  a $10 discount exclusive to your practice. Comes pre-applied via your unique signup link.
                </p>
              </CardContent>
            </Card>
            <Card className="border-2 hover:border-gold/40 transition-colors">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-gold/15 flex items-center justify-center mb-3">
                  <Users className="w-6 h-6 text-gold" />
                </div>
                <CardTitle>Earn While You Grow</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground leading-relaxed">
                  20% commission on every client subscription, lifetime — plus 15% when you
                  refer other brokers to the program.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="border-2 border-gold shadow-2xl">
            <CardHeader className="text-center space-y-2">
              <div className="inline-flex mx-auto items-center gap-2 px-3 py-1 rounded-full bg-primary text-primary-foreground text-xs font-semibold uppercase tracking-wide">
                <Briefcase className="w-3.5 h-3.5" /> Broker Workspace
              </div>
              <div className="flex items-baseline justify-center gap-1 pt-2">
                <span className="text-5xl font-extrabold">$197</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <p className="text-sm text-muted-foreground">Cancel anytime. No annual contract.</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 mb-8">
                {[
                  "Full Paige AI access for you and your team",
                  "Unlimited client roster management",
                  "Private Paige sessions for every client",
                  "Shareable client summaries",
                  "Team member sub-accounts",
                  "20% commission on client subscriptions",
                  "Exclusive $17/month client discount code",
                  "Broker referral commissions at 15%",
                  "MCC service request integration",
                  "Priority support",
                ].map((feature) => (
                  <li key={feature} className="flex items-start gap-2">
                    <CheckCircle2 className="w-5 h-5 text-gold mt-0.5 shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button
                size="lg"
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                onClick={() => document.getElementById("apply")?.scrollIntoView({ behavior: "smooth" })}
              >
                Apply for Broker Access <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Application form */}
      <section id="apply" className="py-20 bg-background">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-extrabold mb-3">Apply for Broker Access</h2>
            <p className="text-muted-foreground">
              Approval is instant. You'll get your referral code, client discount link, and
              dashboard access immediately after submitting.
            </p>
          </div>

          <Card className="border-2 shadow-xl">
            <CardContent className="pt-6">
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First name *</Label>
                    <Input
                      id="firstName"
                      required
                      value={form.firstName}
                      onChange={(e) => update("firstName", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last name *</Label>
                    <Input
                      id="lastName"
                      required
                      value={form.lastName}
                      onChange={(e) => update("lastName", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email">Work email *</Label>
                  <Input
                    id="email"
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => update("email", e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="businessName">Business name *</Label>
                  <Input
                    id="businessName"
                    required
                    value={form.businessName}
                    onChange={(e) => update("businessName", e.target.value)}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="brokerType">Broker type *</Label>
                    <Select
                      value={form.brokerType}
                      onValueChange={(v) => update("brokerType", v as BrokerType)}
                    >
                      <SelectTrigger id="brokerType">
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {BROKER_TYPES.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="licenseNumber">License number (optional)</Label>
                    <Input
                      id="licenseNumber"
                      value={form.licenseNumber}
                      onChange={(e) => update("licenseNumber", e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="website">Website</Label>
                  <Input
                    id="website"
                    type="url"
                    placeholder="https://"
                    value={form.website}
                    onChange={(e) => update("website", e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="clientCount">How many clients do you currently work with? *</Label>
                  <Select
                    value={form.currentClientCount}
                    onValueChange={(v) => update("currentClientCount", v)}
                  >
                    <SelectTrigger id="clientCount">
                      <SelectValue placeholder="Select…" />
                    </SelectTrigger>
                    <SelectContent>
                      {CLIENT_COUNT_OPTIONS.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="useCase">How do you plan to use PaigeAgent for your clients? *</Label>
                  <Textarea
                    id="useCase"
                    rows={4}
                    required
                    value={form.useCase}
                    onChange={(e) => update("useCase", e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="brokerReferralCode">
                    Were you referred by another broker? Their code (optional)
                  </Label>
                  <Input
                    id="brokerReferralCode"
                    placeholder="BROK-XXXXXX"
                    value={form.brokerReferralCode}
                    onChange={(e) => update("brokerReferralCode", e.target.value.toUpperCase())}
                  />
                </div>

                <div className="flex items-start gap-2 pt-2">
                  <Checkbox
                    id="terms"
                    checked={form.agreedToTerms}
                    onCheckedChange={(v) => update("agreedToTerms", Boolean(v))}
                  />
                  <Label htmlFor="terms" className="text-sm font-normal cursor-pointer leading-relaxed">
                    I agree to the PaigeAgent Broker Program terms — including the $197/mo
                    workspace fee, 20% client commission split, and{" "}
                    <Link to="/terms" className="underline hover:text-primary">
                      platform terms of service
                    </Link>
                    .
                  </Label>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={submitting}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold"
                >
                  {submitting ? "Submitting…" : "Submit Application"}
                  {!submitting && <ArrowRight className="w-4 h-4 ml-1" />}
                </Button>

                <p className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1">
                  <Shield className="w-3 h-3" /> Secure submission. Approval is instant.
                </p>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      <Footer />
    </div>
  );
}
