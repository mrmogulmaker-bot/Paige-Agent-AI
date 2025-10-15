import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Target, TrendingUp, Shield, DollarSign, Users, Building } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const personalBuildModules = [
  {
    letter: "B",
    title: "Build Your Foundation",
    description: "Establish strong credit fundamentals",
    icon: Building,
    color: "text-blue-500",
    objectives: [
      "Open your first secured credit card",
      "Establish a credit builder loan",
      "Set up automatic bill payments",
      "Create a budget tracking system",
    ],
    lessons: [
      { title: "Choosing the Right Secured Card", duration: "20 min" },
      { title: "Credit Builder Loan Strategy", duration: "15 min" },
      { title: "Payment Automation Best Practices", duration: "25 min" },
    ],
  },
  {
    letter: "U",
    title: "Understand Credit Utilization",
    description: "Master the art of credit usage",
    icon: TrendingUp,
    color: "text-purple-500",
    objectives: [
      "Keep utilization below 10% for optimal scores",
      "Learn when to pay down balances",
      "Request strategic credit limit increases",
      "Diversify credit types and accounts",
    ],
    lessons: [
      { title: "The 10% Rule Explained", duration: "15 min" },
      { title: "Optimal Payment Timing", duration: "20 min" },
      { title: "Credit Limit Increase Scripts", duration: "25 min" },
    ],
  },
  {
    letter: "I",
    title: "Increase Your Limits",
    description: "Grow your available credit responsibly",
    icon: Target,
    color: "text-green-500",
    objectives: [
      "Qualify for unsecured credit cards",
      "Graduate from secured to regular cards",
      "Build relationships with multiple lenders",
      "Achieve $50K+ in total credit limits",
    ],
    lessons: [
      { title: "Unsecured Card Approval Strategies", duration: "30 min" },
      { title: "Secured Card Graduation Process", duration: "20 min" },
      { title: "Multi-Lender Portfolio Building", duration: "25 min" },
    ],
  },
  {
    letter: "L",
    title: "Leverage Credit for Assets",
    description: "Use credit to build wealth",
    icon: DollarSign,
    color: "text-orange-500",
    objectives: [
      "Qualify for 0% APR balance transfer offers",
      "Get approved for rewards credit cards",
      "Use credit for major purchases strategically",
      "Build emergency cash reserves from credit lines",
    ],
    lessons: [
      { title: "Balance Transfer Optimization", duration: "25 min" },
      { title: "Rewards Card Maximization", duration: "20 min" },
      { title: "Strategic Credit Usage", duration: "30 min" },
    ],
  },
  {
    letter: "D",
    title: "Diversify Your Profile",
    description: "Create a comprehensive credit mix",
    icon: Users,
    color: "text-gold",
    objectives: [
      "Add installment loans to your profile",
      "Maintain multiple credit card types",
      "Build tradeline age and history",
      "Achieve 750+ FICO score",
    ],
    lessons: [
      { title: "Credit Mix Importance", duration: "15 min" },
      { title: "Installment Loan Selection", duration: "25 min" },
      { title: "Long-Term Credit Strategy", duration: "30 min" },
    ],
  },
];

export function PersonalBuildProgramOutline() {
  return (
    <div className="space-y-6">
      <Card className="shadow-glow border-primary/20">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-3xl font-bold bg-gradient-gold bg-clip-text text-transparent">
                B.U.I.L.D. Framework - Personal Credit
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
            The B.U.I.L.D. framework for personal credit helps you establish, grow, and leverage your personal credit profile 
            to achieve financial goals and build wealth.
          </p>

          <Accordion type="single" collapsible className="w-full">
            {personalBuildModules.map((module, index) => {
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
                <h4 className="font-semibold">Credit Foundation</h4>
                <p className="text-sm text-muted-foreground">
                  Build strong credit from scratch or rebuild after setbacks
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
              <div>
                <h4 className="font-semibold">Score Optimization</h4>
                <p className="text-sm text-muted-foreground">
                  Achieve 750+ credit scores across all bureaus
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
              <div>
                <h4 className="font-semibold">Strategic Growth</h4>
                <p className="text-sm text-muted-foreground">
                  Increase credit limits to $50K+ total availability
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-success mt-0.5" />
              <div>
                <h4 className="font-semibold">Wealth Building</h4>
                <p className="text-sm text-muted-foreground">
                  Leverage credit for investments and asset acquisition
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
