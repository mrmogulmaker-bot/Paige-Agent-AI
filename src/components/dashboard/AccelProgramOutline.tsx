import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Target, TrendingUp, Shield, DollarSign } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const accelModules = [
  {
    letter: "A",
    title: "Analyze Your Credit",
    description: "Deep dive into your current credit situation",
    icon: Target,
    color: "text-blue-500",
    objectives: [
      "Pull and review all three bureau credit reports",
      "Identify negative items, errors, and inaccuracies",
      "Calculate your debt-to-income ratio",
      "Understand credit score factors and impact",
    ],
    lessons: [
      { title: "Understanding Your Credit Report", duration: "15 min" },
      { title: "Credit Score Factors Explained", duration: "20 min" },
      { title: "Identifying Dispute Opportunities", duration: "25 min" },
    ],
  },
  {
    letter: "C",
    title: "Challenge Negative Items",
    description: "Strategic dispute process for credit repair",
    icon: Shield,
    color: "text-purple-500",
    objectives: [
      "File disputes with all three credit bureaus",
      "Use proper documentation and evidence",
      "Follow up on dispute responses",
      "Track dispute outcomes and timelines",
    ],
    lessons: [
      { title: "Effective Dispute Letter Writing", duration: "30 min" },
      { title: "Metro 2 Reporting Standards", duration: "20 min" },
      { title: "Consumer Rights Under FCRA", duration: "25 min" },
    ],
  },
  {
    letter: "C",
    title: "Create Positive Payment History",
    description: "Build a track record of on-time payments",
    icon: CheckCircle2,
    color: "text-green-500",
    objectives: [
      "Set up automatic payments for all accounts",
      "Use credit builder loans and secured cards",
      "Become an authorized user on seasoned accounts",
      "Maintain payment history for 24+ months",
    ],
    lessons: [
      { title: "Payment History Best Practices", duration: "15 min" },
      { title: "Credit Builder Products", duration: "20 min" },
      { title: "Authorized User Strategy", duration: "25 min" },
    ],
  },
  {
    letter: "E",
    title: "Establish Credit Utilization",
    description: "Optimize your credit usage ratios",
    icon: TrendingUp,
    color: "text-orange-500",
    objectives: [
      "Keep utilization below 30% on all cards",
      "Pay down high-balance accounts strategically",
      "Request credit limit increases",
      "Use balance transfer cards when beneficial",
    ],
    lessons: [
      { title: "Understanding Credit Utilization", duration: "15 min" },
      { title: "Strategic Paydown Methods", duration: "25 min" },
      { title: "Requesting Limit Increases", duration: "20 min" },
    ],
  },
  {
    letter: "L",
    title: "Leverage Your Credit",
    description: "Use your improved credit for financial goals",
    icon: DollarSign,
    color: "text-gold",
    objectives: [
      "Apply for better credit card offers",
      "Refinance high-interest debt",
      "Qualify for better loan terms",
      "Build investment capital from savings",
    ],
    lessons: [
      { title: "Finding the Best Credit Offers", duration: "20 min" },
      { title: "Debt Consolidation Strategies", duration: "25 min" },
      { title: "Credit and Wealth Building", duration: "30 min" },
    ],
  },
];

export function AccelProgramOutline() {
  return (
    <div className="space-y-6">
      <Card className="shadow-glow border-primary/20">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
                A.C.C.E.L. Framework
              </CardTitle>
              <CardDescription className="mt-2 text-base">
                Your Personal Credit Building Journey
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-sm">
              5 Modules
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-6">
            The A.C.C.E.L. framework is a proven system for repairing, building, and optimizing your personal credit profile. 
            Follow these five strategic phases to achieve your credit goals.
          </p>

          <Accordion type="single" collapsible className="w-full">
            {accelModules.map((module, index) => {
              const Icon = module.icon;
              return (
                <AccordionItem key={index} value={`module-${index}`}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-4 text-left">
                      <div className={`p-3 rounded-lg bg-primary/10 ${module.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="font-mono">
                            {module.letter}
                          </Badge>
                          <h3 className="text-lg font-semibold">{module.title}</h3>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {module.description}
                        </p>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="pt-4">
                    <div className="pl-[60px] space-y-6">
                      {/* Objectives */}
                      <div>
                        <h4 className="font-semibold mb-3 flex items-center gap-2">
                          <Target className="w-4 h-4 text-primary" />
                          Learning Objectives
                        </h4>
                        <ul className="space-y-2">
                          {module.objectives.map((objective, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-sm">
                              <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                              <span>{objective}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Lessons */}
                      <div>
                        <h4 className="font-semibold mb-3">Course Lessons</h4>
                        <div className="space-y-2">
                          {module.lessons.map((lesson, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-colors"
                            >
                              <span className="text-sm">{lesson.title}</span>
                              <Badge variant="outline" className="text-xs">
                                {lesson.duration}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </CardContent>
      </Card>

      {/* Program Benefits */}
      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Program Benefits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
              <div>
                <h4 className="font-semibold">Dispute Management</h4>
                <p className="text-sm text-muted-foreground">
                  Automated dispute letter generation and tracking
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
              <div>
                <h4 className="font-semibold">Credit Monitoring</h4>
                <p className="text-sm text-muted-foreground">
                  Real-time updates on all three credit bureaus
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
              <div>
                <h4 className="font-semibold">Personalized Action Plans</h4>
                <p className="text-sm text-muted-foreground">
                  AI-powered recommendations based on your profile
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
              <div>
                <h4 className="font-semibold">Expert Support</h4>
                <p className="text-sm text-muted-foreground">
                  24/7 access to PaigeAgent.ai credit assistance
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
